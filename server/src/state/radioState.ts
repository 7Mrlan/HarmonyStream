/*
 * 内存电台状态
 * ------------
 * Phase A 只负责打通服务端 API 骨架，所以状态先保存在进程内存里。
 * 这里集中管理 mock 主播、mock 曲目和模型切换，后续接入 LLM / 音乐服务时
 * 优先替换本模块内部实现，避免 mock 散落在路由层。
 */

import type {
  ChatRequest,
  ChatResponse,
  NextResponse,
  NowResponse,
  PlaybackCapabilities,
  PlaybackMoveResponse,
  Track,
} from '@claudio/api';
import { cloneTrack } from '../music/fallbackCatalog.js';
import { cancelPendingPreloads, schedulePreload } from '../music/preload.js';
import { broadcastStreamEvent } from '../realtime/streamHub.js';
import { buildChatTimeoutResponse, planChatTurn } from '../radio/chatTurnPlanner.js';
import {
  getPlaybackCapabilitiesForState,
  getQueueFromIndex,
  getTrackKey,
} from '../radio/playbackQueue.js';
import {
  createSessionMemory,
  markTrackSeen,
  maybeRefillQueue as maybeRefillSessionQueue,
  resetSessionMemory as resetRadioSessionMemory,
  type RadioSessionIntent,
} from '../radio/radioSession.js';
import {
  createTrackCommentaryMemory,
  resetTrackCommentaryMemory,
  scheduleTrackCommentary as scheduleTrackCommentaryService,
} from '../radio/trackCommentaryService.js';
import { nextChatId, scheduleTts } from '../tts/scheduler.js';
import { getCurrentModel } from './modelState.js';
export { getModels, switchModel } from './modelState.js';

type RadioPlaybackState = NowResponse['state'];

interface RadioState {
  currentTrack: Track | null;
  queue: Track[];
  currentIndex: number;
  messages: ChatResponse[];
  playbackState: RadioPlaybackState;
  activeIntent: RadioSessionIntent | null;
  sessionMemory: ReturnType<typeof createSessionMemory>;
  trackCommentaryMemory: ReturnType<typeof createTrackCommentaryMemory>;
}

export interface ChatResult {
  response: ChatResponse;
  currentTrack: Track | null;
  queue: Track[];
}

const CHAT_TOTAL_TIMEOUT_MS = 10_000;

const radioState: RadioState = {
  currentTrack: null,
  queue: [],
  currentIndex: 0,
  messages: [],
  playbackState: 'idle',
  activeIntent: null,
  sessionMemory: createSessionMemory(),
  trackCommentaryMemory: createTrackCommentaryMemory(),
};

let chatQueue: Promise<void> = Promise.resolve();

/*
 * 获取当前播放状态。
 * Phase A 还没有真实播放器上报，position 固定为 0。
 */
export function getNowPlaying(): NowResponse {
  return {
    track: radioState.currentTrack,
    position: 0,
    state: radioState.playbackState,
    playback: getPlaybackCapabilities(),
  };
}

/*
 * 获取下一首推荐。
 * 优先读取内存队列；队列为空时返回 null，避免把 demo 曲当成真实电台内容。
 * 返回前调度一次轻量预热（HEAD artwork / stat 本地文件），不下载音频内容。
 */
export function getNextTrack(): NextResponse {
  const track = radioState.queue[radioState.currentIndex + 1] ?? null;

  if (track) schedulePreload(track);
  maybeRefillQueue('api-next');

  return {
    track,
    reason: track ? '来自 Claudio 当前内存队列。' : '当前队列暂无下一首真实曲目。',
  };
}

/*
 * 处理用户聊天请求。
 * Phase C 优先调用 LLM 生成主播文案；任何配置缺失、超时或解析失败都回退 mock。
 * 状态只在最终文案确定后一次性提交，避免半更新的脏状态。
 */
export async function handleChat(request: ChatRequest): Promise<ChatResult> {
  const previousTask = chatQueue;
  let releaseTask: () => void = () => undefined;
  chatQueue = new Promise<void>((resolve) => {
    releaseTask = resolve;
  });

  await previousTask.catch(() => undefined);
  try {
    return await runChatWithTimeout(request);
  } finally {
    releaseTask();
  }
}

/*
 * 给整条聊天主链路加硬超时。
 * 外部音乐源 / LLM / 用户源脚本都属于不稳定边界；超时后必须释放 chatQueue，避免后续请求一起堵住。
 */
async function runChatWithTimeout(request: ChatRequest): Promise<ChatResult> {
  let timeout: ReturnType<typeof setTimeout> | null = null;
  const timeoutResult = new Promise<ChatResult>((resolve) => {
    timeout = setTimeout(() => {
      console.warn(`[radio] chat timed out after ${CHAT_TOTAL_TIMEOUT_MS}ms: ${request.text.slice(0, 80)}`);
      resolve(buildTimedOutChatResult(request.text));
    }, CHAT_TOTAL_TIMEOUT_MS);
  });

  try {
    return await Promise.race([handleChatInternal(request), timeoutResult]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

/*
 * 构造聊天超时兜底响应。
 * 保留当前播放状态，不清空曲目；只告诉用户这次外部音源解析超时，避免播放器突然掉歌。
 */
function buildTimedOutChatResult(text: string): ChatResult {
  const response = buildChatTimeoutResponse(text);
  radioState.messages = [...radioState.messages, response].slice(-20);

  return {
    response,
    currentTrack: radioState.currentTrack ? cloneTrack(radioState.currentTrack) : null,
    queue: getQueueSnapshot(),
  };
}

/*
 * 串行执行聊天主链路。
 * LLM、音乐解析和内存 radioState 更新必须保持同一轮请求内一致，避免并发请求互相覆盖。
 */
async function handleChatInternal(request: ChatRequest): Promise<ChatResult> {
  const plan = await planChatTurn(request, {
    currentModel: getCurrentModel(),
    playbackState: radioState.playbackState,
    currentTrack: radioState.currentTrack,
  });

  /* 队列翻篇或清空时取消旧预热任务，再由提交后的真实队列重新调度。 */
  cancelPendingPreloads();

  if (!plan.ok) {
    radioState.currentTrack = null;
    radioState.playbackState = 'idle';
    radioState.queue = [];
    radioState.currentIndex = 0;
    radioState.activeIntent = null;
    resetSessionMemory([]);
    radioState.messages = [...radioState.messages, plan.response].slice(-20);

    return {
      response: plan.response,
      currentTrack: null,
      queue: [],
    };
  }

  radioState.currentTrack = plan.currentTrack;
  radioState.playbackState = 'playing';
  radioState.queue = plan.queue;
  radioState.currentIndex = 0;
  radioState.activeIntent = plan.activeIntent;
  resetSessionMemory(plan.queue);
  radioState.messages = [...radioState.messages, plan.response].slice(-20);

  /* 不阻塞 /api/chat：仅触发调度，预热在后台串行执行。 */
  if (plan.queue[1]) schedulePreload(plan.queue[1]);
  maybeRefillQueue('chat');

  /*
   * Phase E：voice=true 时异步触发 TTS 合成；HTTP 不等待。
   * chatId 单调递增，新一轮 chat 进来后旧 TTS 结果会被丢弃，避免广播过期音频。
   */
  if (plan.shouldScheduleTts) {
    const chatId = nextChatId();
    scheduleTts(plan.response.say, chatId);
  }

  return {
    response: plan.response,
    currentTrack: plan.currentTrack,
    queue: radioState.queue.map((track) => ({ ...track })),
  };
}

/*
 * 切到服务端当前队列的下一首。
 * v1 只在本轮 chat 生成的队列内移动；队列耗尽时保持当前曲目不变。
 */
export function playNextTrack(): PlaybackMoveResponse {
  const nextIndex = radioState.currentIndex + 1;

  if (!radioState.currentTrack || nextIndex >= radioState.queue.length) {
    maybeRefillQueue('next-exhausted');
    return buildPlaybackMoveFailure('queue exhausted');
  }

  markTrackSeen(radioState.sessionMemory, radioState.queue[radioState.currentIndex]);
  return moveToQueueIndex(nextIndex, 'next');
}

/*
 * 切到服务端当前队列的上一首。
 * v1 不跨 chat 轮次回退；已经在队首时保持当前曲目不变。
 */
export function playPreviousTrack(): PlaybackMoveResponse {
  const previousIndex = radioState.currentIndex - 1;

  if (!radioState.currentTrack || previousIndex < 0) {
    return buildPlaybackMoveFailure('queue start');
  }

  return moveToQueueIndex(previousIndex, 'previous');
}

/*
 * 获取当前队列快照。
 * WebSocket 广播时使用拷贝，避免外部持有内部数组引用。
 */
export function getQueueSnapshot(): Track[] {
  return getQueueFromCurrentIndex();
}

/*
 * 把服务端队列移动到指定位置。
 * 内部队列保留完整顺序，对外返回从当前曲目开始的队列，方便客户端直接渲染。
 */
function moveToQueueIndex(index: number, cause: 'next' | 'previous'): PlaybackMoveResponse {
  const track = radioState.queue[index] ?? null;

  if (!track) {
    return buildPlaybackMoveFailure('queue exhausted');
  }

  cancelPendingPreloads();
  radioState.currentIndex = index;
  radioState.currentTrack = cloneTrack(track);
  radioState.playbackState = 'playing';

  const nextTrack = radioState.queue[radioState.currentIndex + 1] ?? null;
  if (nextTrack) schedulePreload(nextTrack);
  maybeRefillQueue(`playback-${cause}`);
  scheduleTrackCommentary(radioState.currentTrack, cause);

  return {
    ok: true,
    track: cloneTrack(radioState.currentTrack),
    queue: getQueueFromCurrentIndex(),
    playback: getPlaybackCapabilities(),
  };
}

/*
 * 构造播放移动失败响应。
 * 失败时必须保留未改变的 currentTrack，避免客户端误以为当前曲目被清空。
 */
function buildPlaybackMoveFailure(reason: string): PlaybackMoveResponse {
  return {
    ok: false,
    reason,
    track: radioState.currentTrack ? cloneTrack(radioState.currentTrack) : null,
    queue: getQueueFromCurrentIndex(),
    playback: getPlaybackCapabilities(),
  };
}

/*
 * 返回客户端可直接播放的队列快照。
 * currentIndex 之前的历史不推给客户端，上一首由服务端 API 负责，避免前后端索引分叉。
 */
function getQueueFromCurrentIndex(): Track[] {
  return getQueueFromIndex(radioState.queue, radioState.currentIndex);
}

/*
 * 计算播放控制能力。
 * 服务端 currentIndex 是队列权威；客户端只根据这里的结果启用 / 禁用上一首和下一首。
 */
export function getPlaybackCapabilities(): PlaybackCapabilities {
  return getPlaybackCapabilitiesForState({
    currentTrack: radioState.currentTrack,
    queue: radioState.queue,
    currentIndex: radioState.currentIndex,
    canAutoRefill: Boolean(radioState.activeIntent && radioState.activeIntent.requestKind !== 'explicit'),
  });
}

/*
 * 新 chat 开始后重置本轮 session 的短期记忆。
 * 初始队列立即写入 seen，避免后台续推把同一批候选重复补回来。
 */
function resetSessionMemory(queue: Track[]): void {
  resetRadioSessionMemory(radioState.sessionMemory, queue);
  resetTrackCommentaryMemory(radioState.trackCommentaryMemory);
}

/*
 * 后台补队列。
 * 同一时间只允许一个续推任务；失败只写日志，不影响当前播放和切歌返回。
 */
function maybeRefillQueue(reason: string): void {
  maybeRefillSessionQueue({
    intent: radioState.activeIntent,
    memory: radioState.sessionMemory,
    reason,
    getQueue: () => radioState.queue.map(cloneTrack),
    getRemainingQueueCount,
    isIntentCurrent: (intent) => radioState.activeIntent === intent,
    appendTracks: appendResolvedTracksToQueue,
    broadcastQueueUpdate: () => {
      broadcastStreamEvent({
        type: 'queue-update',
        queue: getQueueFromCurrentIndex(),
        playback: getPlaybackCapabilities(),
      });
    },
  });
}

/*
 * 把续推结果追加到队列。
 * 追加前过滤本 session 已见过和队列里已有的曲目，并把成功追加的曲目写入 seen。
 */
function appendResolvedTracksToQueue(tracks: Track[]): Track[] {
  const appended: Track[] = [];

  for (const track of tracks) {
    const cloned = cloneTrack(track);
    radioState.queue.push(cloned);
    appended.push(cloned);
  }

  return appended;
}

/* 返回从当前曲开始，客户端还可以听到的队列长度。 */
function getRemainingQueueCount(): number {
  const startIndex = Math.max(0, Math.min(radioState.currentIndex, radioState.queue.length));
  return radioState.queue.length - startIndex;
}

/*
 * 调度切歌短播报。
 * 播报是附加体验：不阻塞切歌，不阻塞队列续推，任何失败都静默回退或丢弃。
 */
function scheduleTrackCommentary(track: Track, cause: 'next' | 'previous'): void {
  scheduleTrackCommentaryService({
    memory: radioState.trackCommentaryMemory,
    track,
    cause,
    intent: radioState.activeIntent,
    currentModel: getCurrentModel(),
    isCurrentTrackKey,
    broadcast: broadcastTrackCommentary,
    pushMessage: (response) => {
      radioState.messages = [...radioState.messages, response].slice(-20);
    },
  });
}

/* 当前曲是否仍然匹配指定 key。 */
function isCurrentTrackKey(trackKey: string): boolean {
  return getTrackKey(radioState.currentTrack) === trackKey;
}

/* 广播切歌短播报给前端 DJ 气泡。 */
function broadcastTrackCommentary(trackId: string, response: ChatResponse): void {
  broadcastStreamEvent({
    type: 'track-commentary',
    trackId,
    say: response.say,
    ...(response.segue ? { segue: response.segue } : {}),
    ...(response.reason ? { reason: response.reason } : {}),
  });
}


