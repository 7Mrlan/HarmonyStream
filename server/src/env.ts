/*
 * 环境变量加载与校验
 * ------------------
 * 使用 zod 在启动时严格校验，缺失或类型错误立即崩溃，
 * 避免运行时拿到 undefined 引发难排的隐性 Bug。
 */

import { config as loadDotenv } from 'dotenv';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

const serverRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/*
 * 同时支持仓库根目录 `.env` 和 `server/.env`。
 * 根目录脚本从仓库根启动，子包脚本可能从 server 启动；两处都加载但不覆盖已存在环境变量。
 */
loadDotenv();
loadDotenv({ path: resolve(serverRoot, '.env') });

/*
 * 可选字符串环境变量。
 * `.env.example` 里常会保留空值占位；这里把空字符串视为未配置，
 * 保证没有 LLM key 时服务端仍可启动并走 mock fallback。
 */
const OptionalEnvString = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
  z.string().trim().min(1).optional(),
);

/*
 * 带默认值的字符串环境变量。
 * 空字符串同样回退默认值，避免复制示例文件后把 base URL 解析成空地址。
 */
function envStringWithDefault(defaultValue: string) {
  return z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
    z.string().trim().min(1).default(defaultValue),
  );
}

/*
 * 带默认值的正整数环境变量。
 * LLM 超时必须有上限，防止 `/api/chat` 因 provider 抖动长期挂起。
 */
function positiveIntegerWithDefault(defaultValue: number) {
  return z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
    z.coerce.number().int().positive().max(30000).default(defaultValue),
  );
}

/*
 * 带默认值与可配置上限的正整数环境变量。
 * 用于缓存 TTL、LRU 上限等不属于 HTTP 超时类的数值，允许超过 30s 范围。
 */
function positiveIntegerWithMax(defaultValue: number, max: number) {
  return z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
    z.coerce.number().int().positive().max(max).default(defaultValue),
  );
}

/*
 * DeepSeek 思考模式开关。
 * 电台主播需要即时响应，默认关闭 thinking；需要复杂推理时再显式开启。
 */
const ThinkingTypeWithDefault = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
  z.enum(['enabled', 'disabled']).default('disabled'),
);

/*
 * 音乐 provider 开关。
 * 默认 disabled，保证未配置真实音乐服务时仍能稳定使用 fallback catalog。
 * 兼容 Phase D 的旧值；Phase D.5 起优先使用 MUSIC_PROVIDER_CHAIN 控制 provider 顺序。
 */
const MusicProviderWithDefault = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
  z.enum(['disabled', 'ncm']).default('disabled'),
);

/*
 * provider chain 字符串。
 * 形如 "local,external,ncm,fallback"；空字符串视为未配置，由 registry 推导默认链。
 */
const MusicProviderChain = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
  z.string().trim().min(1).optional(),
);

/*
 * 布尔开关。
 * 兼容 "1/0/true/false/yes/no"，未配置时使用默认值。
 */
function envBooleanWithDefault(defaultValue: boolean) {
  return z.preprocess(
    (value) => {
      if (typeof value !== 'string') return undefined;
      const trimmed = value.trim().toLowerCase();
      if (!trimmed) return undefined;
      if (['1', 'true', 'yes', 'on'].includes(trimmed)) return true;
      if (['0', 'false', 'no', 'off'].includes(trimmed)) return false;
      return undefined;
    },
    z.boolean().default(defaultValue),
  );
}

/*
 * 环境变量 schema
 *   PORT             服务端口，默认 8080
 *   NODE_ENV         环境标记，影响日志等行为
 *   LOG_LEVEL        日志等级
 *   SHARED_TOKEN     App ↔ Server 静态鉴权 token（v1 鉴权方案，spec.md §6.5）
 *   LLM_TIMEOUT_MS   LLM 请求超时，默认 6000ms
 *   MUSIC_PROVIDER   兼容 Phase D 的单 provider 开关，默认 disabled
 *   MUSIC_PROVIDER_CHAIN  Phase D.5 provider 优先级链，例如 local,external,ncm,fallback
 *   MUSIC_LIBRARY_DIR     本地自有音源目录，未配置时本地 provider 自动禁用
 *   EXTERNAL_MUSIC_RESOLVER_URL    外部 HTTP resolver 根地址，可选
 *   EXTERNAL_MUSIC_RESOLVER_TIMEOUT_MS 外部 resolver 超时
 *   MUSIC_TIMEOUT_MS 音乐 provider 请求超时，默认 3500ms
 *   MUSIC_CACHE_MAX_ENTRIES        provider 解析结果缓存上限
 *   MUSIC_CACHE_DEFAULT_TTL_MS     provider 解析结果默认 TTL
 *   MUSIC_PRELOAD_ENABLED          是否启用下一首预解析
 *   LX_SOURCE_SCRIPT_URL           LX-compatible 用户源脚本 URL
 *   LX_SOURCE_SCRIPT_FILE          LX-compatible 用户源脚本本地文件
 *   LX_METADATA_RESOLVER_URL       LX 候选搜索 resolver 根地址
 *   LX_METADATA_FIXTURE_FILE       LX 候选搜索 smoke fixture
 *   LX_ENABLE_KUWO_SEARCH          是否启用内置 Kuwo 候选搜索适配，默认启用
 *   LX_QUALITY_PREFERENCE          LX 播放 URL 解析音质优先级，例如 flac,320k,128k
 *   LX_BRIDGE_TIMEOUT_MS           LX worker IPC / 脚本加载超时
 *   LX_BRIDGE_REQUEST_TIMEOUT_MS   lx.request 默认超时
 *   *_API_KEY        各 provider 的可选 key，缺失时走 mock fallback
 *   *_BASE_URL       OpenAI-compatible API 根地址
 *   *_MODEL          OpenAI-compatible chat model id
 *   DEEPSEEK_THINKING_TYPE DeepSeek 思考模式开关，电台场景默认 disabled
 */
const EnvSchema = z.object({
  PORT: z.coerce.number().int().positive().default(8080),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  SHARED_TOKEN: z.string().min(1).optional(),
  LLM_TIMEOUT_MS: positiveIntegerWithDefault(6000),
  MUSIC_PROVIDER: MusicProviderWithDefault,
  MUSIC_PROVIDER_CHAIN: MusicProviderChain,
  MUSIC_LIBRARY_DIR: OptionalEnvString,
  EXTERNAL_MUSIC_RESOLVER_URL: OptionalEnvString,
  EXTERNAL_MUSIC_RESOLVER_TIMEOUT_MS: positiveIntegerWithDefault(3500),
  MUSIC_API_BASE_URL: OptionalEnvString,
  MUSIC_TIMEOUT_MS: positiveIntegerWithDefault(3500),
  MEDIA_BASE_URL: OptionalEnvString,
  MUSIC_CACHE_MAX_ENTRIES: positiveIntegerWithMax(128, 100000),
  MUSIC_CACHE_DEFAULT_TTL_MS: positiveIntegerWithMax(5 * 60 * 1000, 24 * 60 * 60 * 1000),
  MUSIC_PRELOAD_ENABLED: envBooleanWithDefault(true),
  LX_SOURCE_SCRIPT_URL: OptionalEnvString,
  LX_SOURCE_SCRIPT_FILE: OptionalEnvString,
  LX_SOURCE_ID: envStringWithDefault('user-lx-source'),
  LX_SOURCE_NAME: envStringWithDefault('User LX Source'),
  LX_METADATA_RESOLVER_URL: OptionalEnvString,
  LX_METADATA_FIXTURE_FILE: OptionalEnvString,
  LX_ENABLE_KUWO_SEARCH: envBooleanWithDefault(true),
  LX_QUALITY_PREFERENCE: envStringWithDefault('flac,320k,128k'),
  LX_BRIDGE_TIMEOUT_MS: positiveIntegerWithMax(8000, 30000),
  LX_BRIDGE_REQUEST_TIMEOUT_MS: positiveIntegerWithMax(5000, 60000),
  DEEPSEEK_API_KEY: OptionalEnvString,
  DEEPSEEK_BASE_URL: envStringWithDefault('https://api.deepseek.com'),
  DEEPSEEK_MODEL: envStringWithDefault('deepseek-v4-flash'),
  DEEPSEEK_THINKING_TYPE: ThinkingTypeWithDefault,
  DASHSCOPE_API_KEY: OptionalEnvString,
  DASHSCOPE_BASE_URL: envStringWithDefault('https://dashscope.aliyuncs.com/compatible-mode/v1'),
  DASHSCOPE_MODEL: envStringWithDefault('qwen-plus'),
  ZHIPU_API_KEY: OptionalEnvString,
  ZHIPU_BASE_URL: envStringWithDefault('https://open.bigmodel.cn/api/paas/v4'),
  ZHIPU_MODEL: envStringWithDefault('glm-4-flash'),
  TTS_PROVIDER_CHAIN: MusicProviderChain,
  TTS_TIMEOUT_MS: positiveIntegerWithMax(8000, 30000),
  TTS_CACHE_MAX_ENTRIES: positiveIntegerWithMax(32, 1024),
  TTS_CACHE_TTL_MS: positiveIntegerWithMax(5 * 60 * 1000, 60 * 60 * 1000),
  DOUBAO_APP_ID: OptionalEnvString,
  DOUBAO_ACCESS_TOKEN: OptionalEnvString,
  DOUBAO_VOICE: OptionalEnvString,
  MIMO_API_KEY: OptionalEnvString,
  MIMO_VOICE: envStringWithDefault('白桦'),
  MIMO_MODEL: envStringWithDefault('mimo-v2.5-tts'),
  MIMO_STYLE_INSTRUCTION: envStringWithDefault('语速平稳，播音腔，适合深夜电台'),
  MIMO_VOICE_CLONE_FILE: OptionalEnvString,
});

/* 解析失败直接抛错，让进程立即停止 */
const parsed = EnvSchema.safeParse(process.env);
if (!parsed.success) {
  console.error('[env] 环境变量校验失败：', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
