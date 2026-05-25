/*
 * OpenAI-compatible LLM adapter
 * -----------------------------
 * Phase C 只实现最小稳定接入：原生 fetch、短超时、运行时校验、失败回退。
 * 不引入 SDK，避免过早锁定 provider 或增加运行时体积。
 */

import type { ChatResponse, NowResponse, Track } from '@claudio/api';
import { env } from '../env.js';
import { buildDjPrompt, buildMusicIntentPrompt } from './prompt.js';

interface ProviderConfig {
  id: string;
  displayName: string;
  apiKey?: string;
  baseUrl: string;
  model: string;
  jsonMode?: boolean;
  thinkingType?: 'enabled' | 'disabled';
}

export interface GenerateDjResponseInput {
  userText: string;
  modelId: string;
  modelDisplayName: string;
  playbackState: NowResponse['state'];
  currentTrack: Track | null;
  selectedTrack: Track;
  candidateTracks: Track[];
}

export interface MusicIntent {
  /* LLM 认为应优先检索或播放的歌名。 */
  preferredTitles: string[];
  /* 给音乐 provider 使用的短搜索词。 */
  searchQuery: string;
  /* 氛围标签，仅用于 reason / 排障，不进入公开契约。 */
  mood?: string;
  /* 选曲策略短说明，仅内部使用。 */
  note?: string;
}

export interface GenerateMusicIntentInput {
  userText: string;
  modelId: string;
  modelDisplayName: string;
  playbackState: NowResponse['state'];
  currentTrack: Track | null;
}

export type GenerateDjResponseResult =
  | {
      ok: true;
      response: ChatResponse;
      providerId: string;
      model: string;
      elapsedMs: number;
    }
  | {
      ok: false;
      reason: string;
      providerId: string;
      elapsedMs: number;
    };

export type GenerateMusicIntentResult =
  | {
      ok: true;
      intent: MusicIntent;
      providerId: string;
      model: string;
      elapsedMs: number;
    }
  | {
      ok: false;
      reason: string;
      providerId: string;
      elapsedMs: number;
    };

interface OpenAiChatCompletionResponse {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
}

/*
 * LLM 输出泛化类型词时的稳定兜底歌单。
 * 只覆盖高频情绪 / 类型，避免音乐源收到“伤感”这类不可播放搜索词。
 */
const GENRE_INTENT_FALLBACKS: Array<{
  keywords: string[];
  title: string;
  artist: string;
  mood: string;
}> = [
  {
    keywords: ['伤感', '难过', '失恋', 'emo', '悲伤', '催泪'],
    title: '晴天',
    artist: '周杰伦',
    mood: '伤感',
  },
  {
    keywords: ['治愈', '温柔', '放松', '安静', '睡前'],
    title: '小幸运',
    artist: '田馥甄',
    mood: '治愈',
  },
  {
    keywords: ['摇滚', '热血', '燃', '振奋'],
    title: '光辉岁月',
    artist: 'Beyond',
    mood: '摇滚',
  },
  {
    keywords: ['怀旧', '经典', '老歌'],
    title: '海阔天空',
    artist: 'Beyond',
    mood: '怀旧',
  },
];

/*
 * 生成音乐检索意图。
 * 这一步发生在真实音乐解析之前，只让 LLM 给出短搜索线索，失败时调用方回退用户原文。
 */
export async function generateMusicIntent(
  input: GenerateMusicIntentInput,
): Promise<GenerateMusicIntentResult> {
  const startedAt = Date.now();
  const provider = getProviderConfig(input.modelId, input.modelDisplayName);

  if (!provider.apiKey) {
    return buildIntentFailure(provider, startedAt, 'provider key 未配置');
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), env.LLM_TIMEOUT_MS);

  try {
    const requestBody: Record<string, unknown> = {
      model: provider.model,
      messages: buildMusicIntentPrompt(input),
      temperature: 0.35,
      max_tokens: 220,
    };

    if (provider.jsonMode) {
      requestBody.response_format = { type: 'json_object' };
    }

    if (provider.thinkingType) {
      requestBody.thinking = { type: provider.thinkingType };
    }

    const response = await fetch(buildChatCompletionsUrl(provider.baseUrl), {
      method: 'POST',
      headers: {
        authorization: `Bearer ${provider.apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    });

    if (!response.ok) {
      return buildIntentFailure(provider, startedAt, `provider HTTP ${response.status}`);
    }

    const content = readCompletionContent((await response.json()) as unknown);
    if (!content) {
      return buildIntentFailure(provider, startedAt, 'provider 响应缺少 content');
    }

    const intent = parseMusicIntentJson(content, input.userText);
    if (!intent) {
      return buildIntentFailure(provider, startedAt, 'provider 输出无法解析为 MusicIntent');
    }

    return {
      ok: true,
      intent,
      providerId: provider.id,
      model: provider.model,
      elapsedMs: Date.now() - startedAt,
    };
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'provider 请求异常';
    return buildIntentFailure(provider, startedAt, reason);
  } finally {
    clearTimeout(timeout);
  }
}

/*
 * 调用当前模型对应的 OpenAI-compatible provider。
 * 所有失败都会被折叠成 ok=false，调用方负责使用 mock fallback 提交状态。
 */
export async function generateDjResponse(
  input: GenerateDjResponseInput,
): Promise<GenerateDjResponseResult> {
  const startedAt = Date.now();
  const provider = getProviderConfig(input.modelId, input.modelDisplayName);

  if (!provider.apiKey) {
    return buildFailure(provider, startedAt, 'provider key 未配置');
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), env.LLM_TIMEOUT_MS);

  try {
    const requestBody: Record<string, unknown> = {
      model: provider.model,
      messages: buildDjPrompt(input),
      temperature: 0.7,
      max_tokens: 320,
    };

    if (provider.jsonMode) {
      requestBody.response_format = { type: 'json_object' };
    }

    if (provider.thinkingType) {
      requestBody.thinking = { type: provider.thinkingType };
    }

    const response = await fetch(buildChatCompletionsUrl(provider.baseUrl), {
      method: 'POST',
      headers: {
        authorization: `Bearer ${provider.apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    });

    if (!response.ok) {
      return buildFailure(provider, startedAt, `provider HTTP ${response.status}`);
    }

    const payload = (await response.json()) as unknown;
    const content = readCompletionContent(payload);
    if (!content) {
      return buildFailure(provider, startedAt, 'provider 响应缺少 content');
    }

    const parsed = parseChatResponseJson(content, input.selectedTrack, input.candidateTracks);
    if (!parsed) {
      return buildFailure(provider, startedAt, 'provider 输出无法解析为 ChatResponse');
    }

    return {
      ok: true,
      response: parsed,
      providerId: provider.id,
      model: provider.model,
      elapsedMs: Date.now() - startedAt,
    };
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'provider 请求异常';
    return buildFailure(provider, startedAt, reason);
  } finally {
    clearTimeout(timeout);
  }
}

/*
 * 获取 provider 配置。
 * 未知模型走当前模型名对应的无 key fallback，保证模型切换不会击穿服务端。
 */
function getProviderConfig(modelId: string, modelDisplayName: string): ProviderConfig {
  const providers: Record<string, ProviderConfig> = {
    deepseek: {
      id: 'deepseek',
      displayName: 'DeepSeek',
      apiKey: env.DEEPSEEK_API_KEY,
      baseUrl: env.DEEPSEEK_BASE_URL,
      model: env.DEEPSEEK_MODEL,
      jsonMode: true,
      thinkingType: env.DEEPSEEK_THINKING_TYPE,
    },
    qwen: {
      id: 'qwen',
      displayName: '通义千问',
      apiKey: env.DASHSCOPE_API_KEY,
      baseUrl: env.DASHSCOPE_BASE_URL,
      model: env.DASHSCOPE_MODEL,
    },
    glm: {
      id: 'glm',
      displayName: '智谱 GLM',
      apiKey: env.ZHIPU_API_KEY,
      baseUrl: env.ZHIPU_BASE_URL,
      model: env.ZHIPU_MODEL,
    },
  };

  return (
    providers[modelId] ?? {
      id: modelId,
      displayName: modelDisplayName,
      baseUrl: env.DEEPSEEK_BASE_URL,
      model: env.DEEPSEEK_MODEL,
    }
  );
}

/*
 * 拼接 chat completions 地址。
 * base URL 可能已经带 `/v1` 或 provider 自定义前缀，只统一追加标准路径。
 */
function buildChatCompletionsUrl(baseUrl: string): string {
  return `${baseUrl.replace(/\/+$/, '')}/chat/completions`;
}

/*
 * 读取 OpenAI-compatible 响应里的 message content。
 * 这里只做最小 shape 检查，不信任 provider 返回结构。
 */
function readCompletionContent(payload: unknown): string | null {
  if (!isRecord(payload)) return null;

  const typed = payload as OpenAiChatCompletionResponse;
  const content = typed.choices?.[0]?.message?.content;
  return typeof content === 'string' && content.trim() ? content : null;
}

/*
 * 解析模型输出。
 * 兼容纯 JSON、Markdown fenced code 和前后带解释文字的 JSON 片段。
 */
function parseChatResponseJson(
  content: string,
  selectedTrack: Track,
  candidateTracks: Track[],
): ChatResponse | null {
  const candidates = [
    content.trim(),
    stripMarkdownFence(content.trim()),
    extractJsonObject(content),
  ].filter((value): value is string => Boolean(value));

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate) as unknown;
      const normalized = normalizeChatResponse(parsed, selectedTrack, candidateTracks);
      if (normalized) return normalized;
    } catch {
      /* 尝试下一个候选 JSON 片段 */
    }
  }

  return null;
}

/*
 * 解析选曲意图 JSON。
 * 兼容模型偶尔包 Markdown 或前后解释的输出。
 */
function parseMusicIntentJson(content: string, userText: string): MusicIntent | null {
  const candidates = [
    content.trim(),
    stripMarkdownFence(content.trim()),
    extractJsonObject(content),
  ].filter((value): value is string => Boolean(value));

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate) as unknown;
      const normalized = normalizeMusicIntent(parsed, userText);
      if (normalized) return normalized;
    } catch {
      /* 尝试下一个候选 JSON 片段 */
    }
  }

  return null;
}

/*
 * 去掉模型可能返回的 Markdown 代码块包裹。
 * 即便 prompt 禁止 Markdown，也要在运行时兜底。
 */
function stripMarkdownFence(content: string): string {
  return content
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
}

/*
 * 从混合文本里提取第一个 JSON 对象。
 * 这是最后一道解析兜底，解析失败仍会回退 mock。
 */
function extractJsonObject(content: string): string | null {
  const start = content.indexOf('{');
  const end = content.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return null;
  return content.slice(start, end + 1);
}

/*
 * 将 unknown 规范化为 ChatResponse。
 * 字段缺失或类型不对时返回 null，不能让自由文本污染业务状态。
 */
function normalizeChatResponse(
  value: unknown,
  selectedTrack: Track,
  candidateTracks: Track[],
): ChatResponse | null {
  if (!isRecord(value)) return null;

  const say = normalizeText(value.say, 280);
  if (!say) return null;

  const play = normalizePlayList(value.play, selectedTrack, candidateTracks);
  const reason = normalizeText(value.reason, 220);
  const segue = sanitizeDjText(normalizeText(value.segue, 160));

  return {
    say: sanitizeDjText(say) ?? say,
    play,
    ...(reason ? { reason } : {}),
    ...(segue ? { segue } : {}),
  };
}

/*
 * 清理主播文案中的播放器操作话术。
 * prompt 已禁止，但模型偶尔仍会说“把音量调到...”；运行时兜底避免产品露出错误操作感。
 */
function sanitizeDjText(value: string | undefined): string | undefined {
  if (!value) return undefined;
  return value
    .replace(/让我们把音量调到[^，。！？!?]*[，。！？!?]?/g, '')
    .replace(/让我们把音量调低[^，。！？!?]*[，。！？!?]?/g, '')
    .replace(/把音量调到[^，。！？!?]*[，。！？!?]?/g, '')
    .replace(/把音量调低[^，。！？!?]*[，。！？!?]?/g, '')
    .replace(/把音量调小[^，。！？!?]*[，。！？!?]?/g, '')
    .replace(/调小音量[^，。！？!?]*[，。！？!?]?/g, '')
    .replace(/调低音量[^，。！？!?]*[，。！？!?]?/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/*
 * 将 unknown 规范化为 MusicIntent。
 * searchQuery 为空时回退用户原文，保证音乐解析仍有输入。
 */
function normalizeMusicIntent(value: unknown, userText: string): MusicIntent | null {
  if (!isRecord(value)) return null;

  const preferredTitles = normalizeStringList(value.preferredTitles, 3, 80);
  const searchQuery = normalizeText(value.searchQuery, 80) ?? preferredTitles[0] ?? userText.trim();
  if (!searchQuery) return null;

  const mood = normalizeText(value.mood, 40);
  const note = normalizeText(value.note, 120);
  const fallbackIntent = buildGenreFallbackIntent(userText, preferredTitles, searchQuery);
  if (fallbackIntent) return fallbackIntent;

  return {
    preferredTitles,
    searchQuery,
    ...(mood ? { mood } : {}),
    ...(note ? { note } : {}),
  };
}

/*
 * 模型偶尔会把“伤感/摇滚/治愈”这类类型词当成歌名。
 * 运行时把泛化请求兜底成具体歌曲，保证音乐源拿到可搜索的歌名。
 */
function buildGenreFallbackIntent(
  userText: string,
  preferredTitles: string[],
  searchQuery: string,
): MusicIntent | null {
  const normalizedText = `${userText} ${searchQuery} ${preferredTitles.join(' ')}`.toLowerCase();
  const fallback = GENRE_INTENT_FALLBACKS.find((item) =>
    item.keywords.some((keyword) => normalizedText.includes(keyword.toLowerCase())),
  );
  if (!fallback) return null;

  const hasConcreteTitle = preferredTitles.some((title) => !isGenericMusicPhrase(title));
  if (hasConcreteTitle && !isGenericMusicPhrase(searchQuery)) return null;

  return {
    preferredTitles: [fallback.title],
    searchQuery: `${fallback.title} ${fallback.artist}`,
    mood: fallback.mood,
    note: 'genre fallback selected concrete track',
  };
}

/* 判断一个词是否仍是泛化音乐需求，而不是具体歌名。 */
function isGenericMusicPhrase(value: string): boolean {
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) return true;

  return (
    /^(?:伤感|悲伤|难过|失恋|emo|治愈|温柔|放松|安静|睡前|摇滚|热血|燃|怀旧|经典|老歌)$/u.test(trimmed) ||
    /(?:歌曲|音乐|曲子|类型|风格|歌单|一些|几首|好听|适合|类似)$/u.test(trimmed)
  );
}

/*
 * 规范化普通文本字段。
 * 限制长度能保护移动端气泡布局，也降低异常输出风险。
 */
function normalizeText(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return trimmed.slice(0, maxLength);
}

/* 规范化字符串数组字段。 */
function normalizeStringList(value: unknown, maxItems: number, maxLength: number): string[] {
  if (!Array.isArray(value)) return [];

  return value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim().slice(0, maxLength))
    .filter((item) => item.length > 0)
    .filter((item, index, all) => all.indexOf(item) === index)
    .slice(0, maxItems);
}

/*
 * 规范化 play 字段。
 * 模型没有给有效曲名时，使用预选曲目标题，保证播放器和文案始终有一致锚点。
 */
function normalizePlayList(value: unknown, selectedTrack: Track, candidateTracks: Track[]): string[] {
  if (!Array.isArray(value)) return [selectedTrack.title];

  const selectableTracks = [selectedTrack, ...candidateTracks];
  const titles = value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => normalizePlayTitle(item, selectableTracks))
    .filter((item): item is string => Boolean(item))
    .filter((item, index, all) => all.indexOf(item) === index)
    .slice(0, 2);

  return titles.length > 0 ? titles : [selectedTrack.title];
}

/*
 * 归一化模型返回的 play 项。
 * 模型偶尔会把 "title / artist / duration" 整段抄回；这里收敛为契约要求的歌名。
 */
function normalizePlayTitle(value: string, candidateTracks: Track[]): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;

  const matchedTrack = candidateTracks.find((track) => {
    const title = track.title.trim();
    return trimmed === title || trimmed.startsWith(`${title} /`) || trimmed.includes(title);
  });

  return matchedTrack?.title ?? trimmed;
}

/*
 * 构造失败结果。
 * 不打印 key，也不把完整 provider 响应写入日志，避免后续接真实用户数据时留下隐私坑。
 */
function buildFailure(
  provider: ProviderConfig,
  startedAt: number,
  reason: string,
): GenerateDjResponseResult {
  return {
    ok: false,
    reason: `${provider.displayName} ${reason}`,
    providerId: provider.id,
    elapsedMs: Date.now() - startedAt,
  };
}

/*
 * 构造选曲意图失败结果。
 * 和 DJ 失败同样脱敏，避免 provider 细节污染公开响应。
 */
function buildIntentFailure(
  provider: ProviderConfig,
  startedAt: number,
  reason: string,
): GenerateMusicIntentResult {
  return {
    ok: false,
    reason: `${provider.displayName} ${reason}`,
    providerId: provider.id,
    elapsedMs: Date.now() - startedAt,
  };
}

/*
 * 判断 unknown 是否为对象记录。
 * 供所有运行时 shape 检查复用，避免不安全类型访问。
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
