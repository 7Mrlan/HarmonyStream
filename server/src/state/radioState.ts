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
  SwitchModelResponse,
  Track,
} from '@claudio/api';
import { generateDjResponse } from '../llm/llmAdapter';
import { FALLBACK_TRACKS, cloneTrack } from '../music/fallbackCatalog';
import { resolveTracksForChat } from '../music/musicResolver';
import { cancelPendingPreloads, schedulePreload } from '../music/preload';
import { nextChatId, scheduleTts } from '../tts/scheduler';

type RadioPlaybackState = NowResponse['state'];

interface RadioState {
  currentTrack: Track | null;
  queue: Track[];
  messages: ChatResponse[];
  currentModel: string;
  playbackState: RadioPlaybackState;
}

export interface ChatResult {
  response: ChatResponse;
  currentTrack: Track;
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
  messages: [],
  currentModel: DEFAULT_MODEL_ID,
  playbackState: 'idle',
};

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
 * 优先读取内存队列；队列为空时使用 fallback 曲目，保证 API 始终可验证。
 * 返回前调度一次轻量预热（HEAD artwork / stat 本地文件），不下载音频内容。
 */
export function getNextTrack(): NextResponse {
  const track = radioState.queue[1] ?? radioState.queue[0] ?? FALLBACK_TRACKS[0] ?? null;

  if (track) schedulePreload(track);

  return {
    track,
    reason:
      track && radioState.queue.includes(track)
        ? '来自 Claudio 当前内存队列。'
        : '音乐队列为空，先返回可播放 fallback 曲目。',
  };
}

/*
 * 处理用户聊天请求。
 * Phase C 优先调用 LLM 生成主播文案；任何配置缺失、超时或解析失败都回退 mock。
 * 状态只在最终文案确定后一次性提交，避免半更新的脏状态。
 */
export async function handleChat(request: ChatRequest): Promise<ChatResult> {
  const text = request.text.trim();
  const musicPlan = await resolveTracksForChat({ userText: text, limit: 3 });
  const candidateTracks = musicPlan.tracks.map(cloneTrack);
  const selectedTrack = candidateTracks[0] ?? cloneTrack(FALLBACK_TRACKS[0]);
  const currentModel = getCurrentModel();
  const generated = await generateDjResponse({
    userText: text,
    modelId: currentModel.id,
    modelDisplayName: currentModel.displayName,
    playbackState: radioState.playbackState,
    currentTrack: radioState.currentTrack,
    selectedTrack,
    candidateTracks,
  });
  const response = generated.ok
    ? generated.response
    : buildFallbackChatResponse(text, selectedTrack, generated.reason, musicPlan.reason);
  const currentTrack = chooseTrackFromPlay(response.play, candidateTracks) ?? selectedTrack;
  const queue = buildQueue(currentTrack, candidateTracks);

  /* 队列翻篇时取消旧预热任务，再把新队列里的下一首加入预热。 */
  cancelPendingPreloads();

  radioState.currentTrack = currentTrack;
  radioState.playbackState = 'playing';
  radioState.queue = queue;
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
 * 获取当前队列快照。
 * WebSocket 广播时使用拷贝，避免外部持有内部数组引用。
 */
export function getQueueSnapshot(): Track[] {
  return radioState.queue.map((track) => ({ ...track }));
}

/*
 * 构建 mock DJ 播报。
 * 文案保持稳定结构，方便 Phase B 做 UI 接入和回归验证。
 */
function buildMockDjScript(text: string, track: Track): string {
  const prompt = text || '今晚随便听点';
  const model = MODELS.find((item) => item.id === radioState.currentModel)?.displayName ?? 'Claudio';

  return `${model} 正在接管 Claudio 信号。你说“${prompt}”，我先用一首 ${track.title} 保持电台播放不断线。`;
}

/*
 * 构建 fallback ChatResponse。
 * fallback 仍返回完整契约，确保 HTTP 和 WS 消费方不需要区分真实 LLM 与 mock。
 */
function buildFallbackChatResponse(
  text: string,
  track: Track,
  llmFallbackReason?: string,
  musicFallbackReason?: string,
): ChatResponse {
  const reason = `根据“${text || '今晚随便听点'}”选择一首适合夜间像素电台氛围的测试曲。`;
  const fallbackDetails = [llmFallbackReason, musicFallbackReason].filter(Boolean).join('；');

  return {
    say: buildMockDjScript(text, track),
    play: [track.title],
    reason: fallbackDetails ? `${reason} fallback：${fallbackDetails}。` : reason,
    segue: '信号已接入，Claudio 先为你推上一首安全可播放的 demo track。',
  };
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

/* 宽松曲名匹配，兼容 LLM 输出的大小写和空格差异。 */
function isSameTitle(left: string, right: string): boolean {
  return left.trim().toLowerCase() === right.trim().toLowerCase();
}
