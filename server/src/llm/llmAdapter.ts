/*
 * OpenAI-compatible LLM adapter
 * -----------------------------
 * Phase C 只实现最小稳定接入：原生 fetch、短超时、运行时校验、失败回退。
 * 不引入 SDK，避免过早锁定 provider 或增加运行时体积。
 */

import type { ChatResponse, NowResponse, Track } from '@claudio/api';
import { env } from '../env';
import { buildDjPrompt } from './prompt';

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

interface OpenAiChatCompletionResponse {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
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

  const say = normalizeText(value.say, 160);
  if (!say) return null;

  const play = normalizePlayList(value.play, selectedTrack, candidateTracks);
  const reason = normalizeText(value.reason, 160);
  const segue = normalizeText(value.segue, 120);

  return {
    say,
    play,
    ...(reason ? { reason } : {}),
    ...(segue ? { segue } : {}),
  };
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
 * 判断 unknown 是否为对象记录。
 * 供所有运行时 shape 检查复用，避免不安全类型访问。
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
