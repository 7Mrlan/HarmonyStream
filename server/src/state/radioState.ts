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
  ModelInfo,
  ModelsResponse,
  NextResponse,
  NowResponse,
  PlaybackCapabilities,
  PlaybackMoveResponse,
  SwitchModelResponse,
  Track,
} from '@claudio/api';
import { generateDjResponse, generateMusicIntent, generateTrackCommentary, type GenerateMusicIntentResult } from '../llm/llmAdapter.js';
import { cloneTrack } from '../music/fallbackCatalog.js';
import { resolveTracksForChat } from '../music/musicResolver.js';
import { cancelPendingPreloads, schedulePreload } from '../music/preload.js';
import { isSameTitle } from '../music/titleMatch.js';
import { broadcastStreamEvent } from '../realtime/streamHub.js';
import {
  buildFallbackChatResponse,
  buildNoTrackChatResponse,
  buildQuickSongChatResponse,
  buildTrackSwitchChatResponse,
} from '../radio/djCopy.js';
import {
  buildExplicitMusicIntent,
  buildGenreMusicIntent,
  type MusicRequestKind,
  parseExplicitSongRequest,
  parseGenericRecommendationRequest,
  parseGenreRecommendationRequest,
  parseMusicRequestKind,
} from '../radio/intentParser.js';
import { nextChatId, scheduleTrackTts, scheduleTts } from '../tts/scheduler.js';

type RadioPlaybackState = NowResponse['state'];
type SuccessfulMusicIntent = Extract<GenerateMusicIntentResult, { ok: true }>;

interface RadioState {
  currentTrack: Track | null;
  queue: Track[];
  currentIndex: number;
  messages: ChatResponse[];
  currentModel: string;
  playbackState: RadioPlaybackState;
  activeIntent: RadioSessionIntent | null;
  seenTrackKeys: Set<string>;
  commentaryCache: Map<string, ChatResponse>;
  refillInFlight: Promise<void> | null;
  commentaryToken: string | null;
}

interface RadioSessionIntent {
  userText: string;
  searchText: string;
  preferredTitles: string[];
  requestKind: MusicRequestKind;
  targetQueueSize: number;
  voiceEnabledAtChat: boolean;
}

export interface ChatResult {
  response: ChatResponse;
  currentTrack: Track | null;
  queue: Track[];
}

const DEFAULT_MODEL_ID = 'deepseek';
const CHAT_TOTAL_TIMEOUT_MS = 10_000;

const MODELS: ModelInfo[] = [
  {
    id: 'deepseek',
    displayName: 'DeepSeek',
    petSprite: 'deepseek',
  },
  {
    id: 'qwen',
    displayName: '通义千问',
    petSprite: 'qwen',
  },
  {
    id: 'glm',
    displayName: '智谱 GLM',
    petSprite: 'glm',
  },
];

const radioState: RadioState = {
  currentTrack: null,
  queue: [],
  currentIndex: 0,
  messages: [],
  currentModel: DEFAULT_MODEL_ID,
  playbackState: 'idle',
  activeIntent: null,
  seenTrackKeys: new Set<string>(),
  commentaryCache: new Map<string, ChatResponse>(),
  refillInFlight: null,
  commentaryToken: null,
};

let chatQueue: Promise<void> = Promise.resolve();

/*
 * 获取模型列表。
 * 返回浅拷贝，避免路由层误改全局模型配置。
 */
export function getModels(): ModelsResponse {
  return {
    current: radioState.currentModel,
    available: MODELS.map((model) => ({ ...model })),
  };
}

/*
 * 切换当前 AI 模型。
 * Phase A 只切换内存状态，不触发真实 LLM provider 初始化。
 */
export function switchModel(id: string): SwitchModelResponse {
  const model = MODELS.find((item) => item.id === id);

  if (!model) {
    return {
      ok: false,
      current: radioState.currentModel,
    };
  }

  radioState.currentModel = model.id;

  return {
    ok: true,
    current: radioState.currentModel,
  };
}

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
  const response = buildNoTrackChatResponse(text, '外部音乐源解析超时，请稍后重试或换一个关键词。');
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
  const text = request.text.trim();
  const currentModel = getCurrentModel();
  const explicitRequest = parseExplicitSongRequest(text);
  const genreRequest = explicitRequest ? null : parseGenreRecommendationRequest(text);
  const genericRecommendationRequest = explicitRequest || genreRequest ? null : parseGenericRecommendationRequest(text);
  const requestKind = parseMusicRequestKind(text, explicitRequest, genreRequest);
  const musicIntent = explicitRequest
    ? buildExplicitMusicIntent(explicitRequest)
    : genreRequest
      ? buildGenreMusicIntent(genreRequest)
      : await buildLlmFirstMusicIntent({
          text,
          genericRecommendationRequest,
          currentModel,
        });

  const preferredTitles = musicIntent.ok ? musicIntent.intent.preferredTitles : [];
  const searchText = musicIntent.ok ? musicIntent.intent.searchQuery : text;
  const targetQueueSize = getTargetQueueSize(requestKind);
  const musicPlan = await resolveTracksForChat({
    userText: searchText || text,
    preferredTitles,
    limit: targetQueueSize,
  });
  const candidateTracks = musicPlan.tracks.map(cloneTrack);
  const selectedTrack = candidateTracks[0] ?? null;

  if (!selectedTrack) {
    const response = buildNoTrackChatResponse(text, buildMusicReason(musicPlan.reason, musicIntent));
    cancelPendingPreloads();
    radioState.currentTrack = null;
    radioState.playbackState = 'idle';
    radioState.queue = [];
    radioState.currentIndex = 0;
    radioState.activeIntent = null;
    radioState.seenTrackKeys.clear();
    radioState.commentaryCache.clear();
    radioState.commentaryToken = null;
    radioState.messages = [...radioState.messages, response].slice(-20);

    return {
      response,
      currentTrack: null,
      queue: [],
    };
  }

  const generated = explicitRequest
    ? null
    : await generateDjResponse({
        userText: text,
        modelId: currentModel.id,
        modelDisplayName: currentModel.displayName,
        playbackState: radioState.playbackState,
        currentTrack: radioState.currentTrack,
        selectedTrack,
        candidateTracks,
      });
  const response = generated?.ok
    ? generated.response
    : explicitRequest
      ? buildQuickSongChatResponse(text, selectedTrack, buildMusicReason(musicPlan.reason, musicIntent))
      : buildFallbackChatResponse(
          text,
          selectedTrack,
          currentModel.displayName,
          generated?.reason,
          buildMusicReason(musicPlan.reason, musicIntent),
        );
  const currentTrack = chooseTrackFromPlay(response.play, candidateTracks) ?? selectedTrack;
  const queue = buildQueue(currentTrack, candidateTracks);

  /* 队列翻篇时取消旧预热任务，再把新队列里的下一首加入预热。 */
  cancelPendingPreloads();

  radioState.currentTrack = currentTrack;
  radioState.playbackState = 'playing';
  radioState.queue = queue;
  radioState.currentIndex = 0;
  radioState.activeIntent = buildSessionIntent({
    userText: text,
    searchText: searchText || text,
    preferredTitles,
    requestKind,
    targetQueueSize,
    voiceEnabledAtChat: Boolean(request.voice),
  });
  resetSessionMemory(queue);
  radioState.messages = [...radioState.messages, response].slice(-20);

  /* 不阻塞 /api/chat：仅触发调度，预热在后台串行执行。 */
  if (queue[1]) schedulePreload(queue[1]);
  maybeRefillQueue('chat');

  /*
   * Phase E：voice=true 时异步触发 TTS 合成；HTTP 不等待。
   * chatId 单调递增，新一轮 chat 进来后旧 TTS 结果会被丢弃，避免广播过期音频。
   */
  if (request.voice) {
    const chatId = nextChatId();
    scheduleTts(response.say, chatId);
  }

  return {
    response,
    currentTrack,
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

  markTrackSeen(radioState.queue[radioState.currentIndex]);
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
 * 汇总音乐解析 reason。
 * 真实 LLM 意图失败不阻断电台，只作为内部 fallback 说明保留。
 */
function buildMusicReason(
  musicReason: string,
  musicIntent: GenerateMusicIntentResult,
): string {
  if (musicIntent.ok) {
    const titles = musicIntent.intent.preferredTitles.join(' / ') || '无明确歌名';
    return `${musicReason}；意图：${musicIntent.intent.searchQuery}；候选：${titles}`;
  }
  return `${musicReason}；意图 fallback：${musicIntent.reason}`;
}

/*
 * 泛推荐采用 LLM-first。
 * 有模型时让主播结合上下文决定搜索线索；LLM 不可用时再使用本地默认锚点，保证开源低配置也能闭环。
 */
async function buildLlmFirstMusicIntent({
  text,
  genericRecommendationRequest,
  currentModel,
}: {
  text: string;
  genericRecommendationRequest: ReturnType<typeof parseGenericRecommendationRequest>;
  currentModel: ModelInfo;
}): Promise<Awaited<ReturnType<typeof generateMusicIntent>>> {
  const generated = await generateMusicIntent({
    userText: text,
    modelId: currentModel.id,
    modelDisplayName: currentModel.displayName,
    playbackState: radioState.playbackState,
    currentTrack: radioState.currentTrack,
  });
  if (generated.ok || !genericRecommendationRequest) return generated;

  const fallback = buildGenreMusicIntent(genericRecommendationRequest) as SuccessfulMusicIntent;
  return {
    ...fallback,
    intent: {
      ...fallback.intent,
      note: `generic recommendation fallback after ${generated.reason}`,
    },
  };
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
  const startIndex = Math.max(0, Math.min(radioState.currentIndex, radioState.queue.length));
  return radioState.queue.slice(startIndex).map(cloneTrack);
}

/*
 * 计算播放控制能力。
 * 服务端 currentIndex 是队列权威；客户端只根据这里的结果启用 / 禁用上一首和下一首。
 */
export function getPlaybackCapabilities(): PlaybackCapabilities {
  const hasTrack = Boolean(radioState.currentTrack);
  const queueSize = radioState.queue.length;
  const currentIndex = Math.max(0, Math.min(radioState.currentIndex, Math.max(queueSize - 1, 0)));
  const canAutoRefill = Boolean(radioState.activeIntent && radioState.activeIntent.requestKind !== 'explicit');

  return {
    canPrevious: hasTrack && currentIndex > 0,
    canNext: hasTrack && currentIndex + 1 < queueSize,
    queueSize,
    currentIndex,
    canAutoRefill,
  };
}

/*
 * 创建本轮电台 session 意图。
 * 后台续推只读取这里保存的检索线索，不重新调用 LLM 做意图判断。
 */
function buildSessionIntent(intent: RadioSessionIntent): RadioSessionIntent {
  return {
    ...intent,
    preferredTitles: [...intent.preferredTitles],
  };
}

/*
 * 按请求类型决定当前 session 的目标队列长度。
 * 单曲保持精准，范围推荐给 3 首，明确歌单给 5 首，控制外部音源压力。
 */
function getTargetQueueSize(kind: MusicRequestKind): number {
  if (kind === 'explicit') return 1;
  if (kind === 'multi') return 5;
  return 3;
}

/*
 * 新 chat 开始后重置本轮 session 的短期记忆。
 * 初始队列立即写入 seen，避免后台续推把同一批候选重复补回来。
 */
function resetSessionMemory(queue: Track[]): void {
  radioState.seenTrackKeys.clear();
  radioState.commentaryCache.clear();
  radioState.commentaryToken = null;
  radioState.refillInFlight = null;
  for (const track of queue) {
    markTrackSeen(track);
  }
}

/* 将曲目标记为当前 session 已见过。 */
function markTrackSeen(track: Track | null | undefined): void {
  const key = getTrackKey(track);
  if (key) radioState.seenTrackKeys.add(key);
}

/* 取曲目去重 key，优先使用稳定 id，没有 id 时退回 URL。 */
function getTrackKey(track: Track | null | undefined): string {
  return track?.id || track?.url || '';
}

/*
 * 后台补队列。
 * 同一时间只允许一个续推任务；失败只写日志，不影响当前播放和切歌返回。
 */
function maybeRefillQueue(reason: string): void {
  const intent = radioState.activeIntent;
  if (!intent || intent.requestKind === 'explicit') return;
  if (getRemainingQueueCount() >= intent.targetQueueSize) return;
  if (radioState.refillInFlight) return;

  const refillTask = runQueueRefill(intent, reason).finally(() => {
    if (radioState.refillInFlight === refillTask) {
      radioState.refillInFlight = null;
    }
  });
  radioState.refillInFlight = refillTask;
}

/*
 * 执行真实续推。
 * 这里只做音乐解析和去重，不生成新意图，不等待主播文案。
 */
async function runQueueRefill(intent: RadioSessionIntent, reason: string): Promise<void> {
  try {
    const missing = Math.max(0, intent.targetQueueSize - getRemainingQueueCount());
    if (missing <= 0) return;

    const plan = await resolveTracksForChat({
      userText: intent.searchText || intent.userText,
      preferredTitles: intent.preferredTitles,
      limit: Math.max(missing + radioState.seenTrackKeys.size, intent.targetQueueSize),
    });
    if (radioState.activeIntent !== intent) return;

    const appended = appendResolvedTracksToQueue(plan.tracks);
    if (appended.length === 0) return;

    console.info(`[radio] queue refilled by ${reason}: +${appended.length}`);
    broadcastStreamEvent({
      type: 'queue-update',
      queue: getQueueFromCurrentIndex(),
      playback: getPlaybackCapabilities(),
    });
  } catch (error) {
    console.warn('[radio] queue refill failed:', error instanceof Error ? error.message : error);
  }
}

/*
 * 把续推结果追加到队列。
 * 追加前过滤本 session 已见过和队列里已有的曲目，并把成功追加的曲目写入 seen。
 */
function appendResolvedTracksToQueue(tracks: Track[]): Track[] {
  const intent = radioState.activeIntent;
  const targetSize = intent?.targetQueueSize ?? getRemainingQueueCount();
  const existing = new Set(radioState.queue.map(getTrackKey).filter(Boolean));
  const existingTitles = radioState.queue.map((track) => track.title);
  const appended: Track[] = [];

  for (const track of tracks) {
    if (getRemainingQueueCount() >= targetSize) break;
    const key = getTrackKey(track);
    if (!key || existing.has(key) || radioState.seenTrackKeys.has(key)) continue;
    if (existingTitles.some((title) => isSameTitle(title, track.title))) continue;

    const cloned = cloneTrack(track);
    radioState.queue.push(cloned);
    existing.add(key);
    existingTitles.push(cloned.title);
    radioState.seenTrackKeys.add(key);
    appended.push(cloneTrack(cloned));
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
  const intent = radioState.activeIntent;
  if (!intent) return;

  const trackKey = getTrackKey(track);
  if (!trackKey) return;

  const cached = radioState.commentaryCache.get(trackKey);
  if (cached) {
    setTimeout(() => {
      if (!isCurrentTrackKey(trackKey)) return;
      broadcastTrackCommentary(trackKey, cached);
      if (intent.voiceEnabledAtChat) {
        scheduleTrackTts(cached.say, trackKey, () => isCurrentTrackKey(trackKey));
      }
    }, 0);
    return;
  }

  radioState.commentaryToken = `${trackKey}:${Date.now()}`;
  const token = radioState.commentaryToken;
  void runTrackCommentary(track, cause, trackKey, token);
}

/*
 * 生成并广播切歌短播报。
 * 先尝试 LLM，失败时使用 djCopy 模板；广播前后都检查 token，避免旧歌播报迟到。
 */
async function runTrackCommentary(
  track: Track,
  cause: 'next' | 'previous',
  trackKey: string,
  token: string,
): Promise<void> {
  const intent = radioState.activeIntent;
  if (!intent) return;

  try {
    const currentModel = getCurrentModel();
    const generated = await generateTrackCommentary({
      userText: intent.userText,
      modelId: currentModel.id,
      modelDisplayName: currentModel.displayName,
      currentTrack: null,
      selectedTrack: track,
      cause,
    });
    const response = generated.ok
      ? generated.response
      : buildTrackSwitchChatResponse(track, intent.userText, cause);

    if (radioState.commentaryToken !== token || !isCurrentTrackKey(trackKey)) return;

    radioState.commentaryCache.set(trackKey, response);
    radioState.messages = [...radioState.messages, response].slice(-20);
    broadcastTrackCommentary(trackKey, response);

    if (intent.voiceEnabledAtChat) {
      scheduleTrackTts(response.say, trackKey, () => isCurrentTrackKey(trackKey));
    }
  } catch (error) {
    console.warn('[radio] track commentary failed:', error instanceof Error ? error.message : error);
  }
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

/*
 * 获取当前模型信息。
 * 服务端内存状态是模型选择权威来源；找不到时回退默认模型，避免坏状态击穿 LLM adapter。
 */
function getCurrentModel(): ModelInfo {
  return (
    MODELS.find((item) => item.id === radioState.currentModel) ??
    MODELS.find((item) => item.id === DEFAULT_MODEL_ID) ?? {
      id: DEFAULT_MODEL_ID,
      displayName: 'DeepSeek',
      petSprite: 'deepseek',
    }
  );
}

/*
 * 按 LLM play 字段从候选曲里选择当前曲。
 * 匹配不到时交回调用方使用预选曲，保证队列始终可播放。
 */
function chooseTrackFromPlay(play: string[], candidateTracks: Track[]): Track | null {
  for (const title of play) {
    const matchedTrack = candidateTracks.find((track) => isSameTitle(track.title, title));
    if (matchedTrack) return cloneTrack(matchedTrack);
  }

  return null;
}

/*
 * 构建当前队列。
 * 选中的当前曲放在队首，剩余候选曲保持 provider 顺序。
 */
function buildQueue(currentTrack: Track, candidateTracks: Track[]): Track[] {
  const currentKey = getTrackKey(currentTrack);
  const titles = [currentTrack.title];
  const tail: Track[] = [];

  for (const track of candidateTracks) {
    const key = getTrackKey(track);
    if (key && key === currentKey) continue;
    if (titles.some((title) => isSameTitle(title, track.title))) continue;
    titles.push(track.title);
    tail.push(cloneTrack(track));
  }

  return [cloneTrack(currentTrack), ...tail];
}

