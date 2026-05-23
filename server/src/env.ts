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
const PositiveIntegerWithDefault = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
  z.coerce.number().int().positive().max(30000).default(6000),
);

/*
 * DeepSeek 思考模式开关。
 * 电台主播需要即时响应，默认关闭 thinking；需要复杂推理时再显式开启。
 */
const ThinkingTypeWithDefault = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
  z.enum(['enabled', 'disabled']).default('disabled'),
);

/*
 * 环境变量 schema
 *   PORT             服务端口，默认 8080
 *   NODE_ENV         环境标记，影响日志等行为
 *   LOG_LEVEL        日志等级
 *   SHARED_TOKEN     App ↔ Server 静态鉴权 token（v1 鉴权方案，spec.md §6.5）
 *   LLM_TIMEOUT_MS   LLM 请求超时，默认 6000ms
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
  LLM_TIMEOUT_MS: PositiveIntegerWithDefault,
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
});

/* 解析失败直接抛错，让进程立即停止 */
const parsed = EnvSchema.safeParse(process.env);
if (!parsed.success) {
  console.error('[env] 环境变量校验失败：', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
