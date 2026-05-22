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

const MOCK_TRACKS: Track[] = [
  {
    id: 'soundhelix-1',
    url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3',
    title: 'Late Night Drive',
    artist: 'SoundHelix',
    duration: 372,
  },
  {
    id: 'soundhelix-2',
    url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3',
    title: 'Synthwave Pulse',
    artist: 'SoundHelix',
    duration: 425,
  },
  {
    id: 'soundhelix-8',
    url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-8.mp3',
    title: 'Pixel Reverie',
    artist: 'SoundHelix',
    duration: 288,
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
 */
export function getNextTrack(): NextResponse {
  const track = radioState.queue[0] ?? MOCK_TRACKS[0] ?? null;

  return {
    track,
    reason:
      track === radioState.queue[0]
        ? '来自 Claudio 当前内存队列。'
        : 'Phase A fallback：服务端尚未接入真实音乐服务，先返回可播放测试曲目。',
  };
}

/*
 * 处理用户聊天请求。
 * 当前生成可控 mock DJ 文案，并推进内存播放状态，为 Phase B 移动端接入提供真实 HTTP 行为。
 */
export function handleChat(request: ChatRequest): ChatResult {
  const text = request.text.trim();
  const selectedTrack = selectTrackForText(text);
  const response: ChatResponse = {
    say: buildMockDjScript(text, selectedTrack),
    play: [selectedTrack.title],
    reason: `根据“${text || '今晚随便听点'}”选择一首适合夜间像素电台氛围的测试曲。`,
    segue: '信号已接入，Claudio 先为你推上一首安全可播放的 demo track。',
  };

  radioState.currentTrack = selectedTrack;
  radioState.playbackState = 'playing';
  radioState.queue = buildQueue(selectedTrack);
  radioState.messages = [...radioState.messages, response].slice(-20);

  return {
    response,
    currentTrack: selectedTrack,
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
 * 按用户输入选择一首 mock 曲目。
 * 这里保持 O(1) 的轻量规则，后续 Phase C/D 会替换成 LLM + 音乐服务。
 */
function selectTrackForText(text: string): Track {
  if (!text) return cloneTrack(MOCK_TRACKS[0]);

  const codePointSum = Array.from(text).reduce((total, char) => total + char.charCodeAt(0), 0);
  const index = codePointSum % MOCK_TRACKS.length;

  return cloneTrack(MOCK_TRACKS[index] ?? MOCK_TRACKS[0]);
}

/*
 * 构建 mock DJ 播报。
 * 文案保持稳定结构，方便 Phase B 做 UI 接入和回归验证。
 */
function buildMockDjScript(text: string, track: Track): string {
  const prompt = text || '今晚随便听点';
  const model = MODELS.find((item) => item.id === radioState.currentModel)?.displayName ?? 'Claudio';

  return `${model} 正在接管 Claudio 信号。你说“${prompt}”，我先用一首 ${track.title} 把电台链路打通。真正的 AI 主播和网易云选曲会在后续阶段接入。`;
}

/*
 * 构建当前队列。
 * 选中的当前曲放在队首，剩余曲目保持可验证的顺序。
 */
function buildQueue(currentTrack: Track): Track[] {
  const tail = MOCK_TRACKS.filter((track) => track.id !== currentTrack.id).map(cloneTrack);

  return [cloneTrack(currentTrack), ...tail];
}

/*
 * 克隆曲目对象。
 * Track 目前是扁平结构，浅拷贝足够隔离内存状态。
 */
function cloneTrack(track: Track | undefined): Track {
  return {
    ...(track ?? {
      id: 'fallback',
      url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3',
      title: 'Fallback Signal',
      artist: 'Claudio',
      duration: 372,
    }),
  };
}
