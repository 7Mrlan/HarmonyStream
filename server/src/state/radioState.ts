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
  PlaybackMoveResponse,
  SwitchModelResponse,
  Track,
} from '@claudio/api';
import { generateDjResponse, generateMusicIntent } from '../llm/llmAdapter';
import { cloneTrack } from '../music/fallbackCatalog';
import { resolveTracksForChat } from '../music/musicResolver';
import { cancelPendingPreloads, schedulePreload } from '../music/preload';
import { isSameTitle } from '../music/titleMatch';
import {
  buildFallbackChatResponse,
  buildNoTrackChatResponse,
  buildQuickSongChatResponse,
} from '../radio/djCopy';
import {
  buildExplicitMusicIntent,
  buildGenreMusicIntent,
  parseExplicitSongRequest,
  parseGenreRecommendationRequest,
} from '../radio/intentParser';
import { nextChatId, scheduleTts } from '../tts/scheduler';

type RadioPlaybackState = NowResponse['state'];

interface RadioState {
  currentTrack: Track | null;
  queue: Track[];
  currentIndex: number;
  messages: ChatResponse[];
  currentModel: string;
  playbackState: RadioPlaybackState;
}

export interface ChatResult {
  response: ChatResponse;
  currentTrack: Track | null;
  queue: Track[];
}

const DEFAULT_MODEL_ID = 'deepseek';

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
    return await handleChatInternal(request);
  } finally {
    releaseTask();
  }
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
  const musicIntent = explicitRequest
    ? buildExplicitMusicIntent(explicitRequest)
    : genreRequest
      ? buildGenreMusicIntent(genreRequest)
      : await generateMusicIntent({
          userText: text,
          modelId: currentModel.id,
          modelDisplayName: currentModel.displayName,
          playbackState: radioState.playbackState,
          currentTrack: radioState.currentTrack,
        });

  const preferredTitles = musicIntent.ok ? musicIntent.intent.preferredTitles : [];
  const searchText = musicIntent.ok ? musicIntent.intent.searchQuery : text;
  const musicPlan = await resolveTracksForChat({
    userText: searchText || text,
    preferredTitles,
    limit: explicitRequest || genreRequest ? 1 : 3,
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
  radioState.messages = [...radioState.messages, response].slice(-20);

  /* 不阻塞 /api/chat：仅触发调度，预热在后台串行执行。 */
  if (queue[1]) schedulePreload(queue[1]);

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
    return buildPlaybackMoveFailure('queue exhausted');
  }

  return moveToQueueIndex(nextIndex);
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

  return moveToQueueIndex(previousIndex);
}

/*
 * 汇总音乐解析 reason。
 * 真实 LLM 意图失败不阻断电台，只作为内部 fallback 说明保留。
 */
function buildMusicReason(
  musicReason: string,
  musicIntent: Awaited<ReturnType<typeof generateMusicIntent>>,
): string {
  if (musicIntent.ok) {
    const titles = musicIntent.intent.preferredTitles.join(' / ') || '无明确歌名';
    return `${musicReason}；意图：${musicIntent.intent.searchQuery}；候选：${titles}`;
  }
  return `${musicReason}；意图 fallback：${musicIntent.reason}`;
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
function moveToQueueIndex(index: number): PlaybackMoveResponse {
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

  return {
    ok: true,
    track: cloneTrack(radioState.currentTrack),
    queue: getQueueFromCurrentIndex(),
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
  const tail = candidateTracks
    .filter((track) => (track.id || track.url) !== (currentTrack.id || currentTrack.url))
    .map(cloneTrack);

  return [cloneTrack(currentTrack), ...tail];
}

