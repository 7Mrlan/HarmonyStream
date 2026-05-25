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
import { generateDjResponse, generateMusicIntent, type GenerateMusicIntentResult } from '../llm/llmAdapter';
import { cloneTrack } from '../music/fallbackCatalog';
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
 * 优先读取内存队列；队列为空时返回 null，避免把 demo 曲当成真实电台内容。
 * 返回前调度一次轻量预热（HEAD artwork / stat 本地文件），不下载音频内容。
 */
export function getNextTrack(): NextResponse {
  const track = radioState.queue[1] ?? null;

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
  const text = request.text.trim();
  const currentModel = getCurrentModel();
  const explicitRequest = parseExplicitSongRequest(text);
  const musicIntent = explicitRequest
    ? buildExplicitMusicIntent(explicitRequest)
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
    limit: explicitRequest ? 1 : 3,
  });
  const candidateTracks = musicPlan.tracks.map(cloneTrack);
  const selectedTrack = candidateTracks[0] ?? null;

  if (!selectedTrack) {
    const response = buildNoTrackChatResponse(text, buildMusicReason(musicPlan.reason, musicIntent));
    cancelPendingPreloads();
    radioState.currentTrack = null;
    radioState.playbackState = 'idle';
    radioState.queue = [];
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

/* 明确点歌的快速主播文案：保持电台主播口吻，不暴露音源、LLM、系统状态。 */
function buildQuickSongChatResponse(text: string, track: Track, musicReason: string): ChatResponse {
  const artist = track.artist?.trim();
  const title = track.title.trim();
  const intro = buildSongIntro(title, artist);

  return {
    say: intro,
    play: [title],
    reason: musicReason,
    segue: buildSongSegue(title, artist),
  };
}

/* 点歌 intro 不编事实背景，只做氛围和情绪承接。 */
function buildSongIntro(title: string, artist?: string): string {
  const songName = artist ? `${artist}的《${title}》` : `《${title}》`;
  const templates = [
    `收到，这一首 ${songName} 接进来。把手边的事先放慢一点，跟着前奏的光往前走。`,
    `好，今晚这段电台时间交给 ${songName}。别急着说话，先让旋律自己把画面铺开。`,
    `${songName}，安排上。适合把音量留给耳朵，也留一点空白给刚刚想到的人。`,
  ];
  return pickStableTemplate(templates, `${artist ?? ''}:${title}`);
}

/* 播放前过渡句同样避免固定“下面欣赏”，但语义保持“进入歌曲”。 */
function buildSongSegue(title: string, artist?: string): string {
  const songName = artist ? `${artist}的《${title}》` : `《${title}》`;
  const templates = [
    `我们把夜色交给 ${songName}。`,
    `这一刻，让 ${songName} 往前开。`,
    `现在进歌，${songName}。`,
  ];
  return pickStableTemplate(templates, `segue:${artist ?? ''}:${title}`);
}

/* 用曲名稳定选模板，避免同一首歌刷新后语气跳来跳去。 */
function pickStableTemplate(templates: string[], key: string): string {
  let hash = 0;
  for (let index = 0; index < key.length; index += 1) {
    hash = (hash * 31 + key.charCodeAt(index)) >>> 0;
  }
  return templates[hash % templates.length] ?? templates[0] ?? '';
}

interface ExplicitSongRequest {
  title: string;
  artist?: string;
  searchQuery: string;
}

/*
 * 从明确点歌文本里抽取歌名和歌手。
 * 这类输入不需要先调用 LLM 做意图识别，直接把短搜索词交给音乐源，能显著降低 /api/chat 延迟。
 */
function parseExplicitSongRequest(text: string): ExplicitSongRequest | null {
  const normalized = text.trim();
  if (!normalized) return null;

  const artistTitleMatch = normalized.match(
    /(?:我想听|想听|播放|放一首|来一首|点一首|听一下|听听|我要听)\s*([^，。,.!?！？]{1,40})的([^，。,.!?！？]{1,60})/u,
  );
  if (artistTitleMatch) {
    const artist = trimSongPhrase(artistTitleMatch[1] ?? '');
    const title = trimSongPhrase(artistTitleMatch[2] ?? '');
    if (title) {
      return {
        title,
        ...(artist ? { artist } : {}),
        searchQuery: [title, artist].filter(Boolean).join(' '),
      };
    }
  }

  const titleOnlyMatch = normalized.match(
    /(?:我想听|想听|播放|放一首|来一首|点一首|听一下|听听|我要听)\s*([^，。,.!?！？]{1,60})/u,
  );
  const title = trimSongPhrase(titleOnlyMatch?.[1] ?? '');
  if (!title) return null;

  return {
    title,
    searchQuery: title,
  };
}

/* 去掉点歌短语后半段的评论、背景或闲聊要求，只保留可检索的标题片段。 */
function trimSongPhrase(value: string): string {
  return value
    .split(/(?:顺便|然后|并且|讲讲|讲一下|聊聊|介绍|背景|故事|这首歌|吧|谢谢)/u)[0]
    ?.trim()
    .replace(/^["“'‘]+|["”'’]+$/g, '')
    .trim() ?? '';
}

/* 把本地解析出的明确点歌请求包装成和 LLM 意图一致的结果，复用后续解析管线。 */
function buildExplicitMusicIntent(request: ExplicitSongRequest): GenerateMusicIntentResult {
  return {
    ok: true,
    intent: {
      preferredTitles: [request.title],
      searchQuery: request.searchQuery,
      note: 'local explicit song parser',
    },
    providerId: 'local-parser',
    model: 'local-parser',
    elapsedMs: 0,
  };
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
  return radioState.queue.map((track) => ({ ...track }));
}

/*
 * 构建 mock DJ 播报。
 * 文案保持稳定结构，方便 Phase B 做 UI 接入和回归验证。
 */
function buildMockDjScript(text: string, track: Track): string {
  const prompt = text || '今晚随便听点';
  const model = MODELS.find((item) => item.id === radioState.currentModel)?.displayName ?? 'Claudio';
  const artist = track.artist ? `${track.artist}的` : '';

  return `${model} 在 Claudio 的夜间频率里收到“${prompt}”。这一首 ${artist}《${track.title}》先接上，愿它刚好落在你现在的心情旁边。`;
}

/*
 * 构建 fallback ChatResponse。
 * 这里 fallback 的是主播文案，不是音乐源；曲目仍必须来自真实解析结果。
 */
function buildFallbackChatResponse(
  text: string,
  track: Track,
  llmFallbackReason?: string,
  musicFallbackReason?: string,
): ChatResponse {
  const reason = `根据“${text || '今晚随便听点'}”选择当前可播放的真实曲目：${track.title}。`;
  const fallbackDetails = [llmFallbackReason, musicFallbackReason].filter(Boolean).join('；');

  return {
    say: buildMockDjScript(text, track),
    play: [track.title],
    reason: fallbackDetails ? `${reason} fallback：${fallbackDetails}。` : reason,
    segue: buildSongSegue(track.title, track.artist),
  };
}

/*
 * 真实音源没有返回可播放曲目时的用户反馈。
 * 不把测试曲塞进 play，避免页面误以为已经播放了用户点的歌。
 */
function buildNoTrackChatResponse(text: string, musicFallbackReason: string): ChatResponse {
  const requested = text || '这首歌';
  return {
    say: `这首《${requested}》今晚暂时没有接上清晰信号，我先不硬切进来。你可以换个歌名或歌手写法，我再帮你重新搜一遍频率。`,
    play: [],
    reason: musicFallbackReason,
    segue: '这一路信号先留白。',
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
