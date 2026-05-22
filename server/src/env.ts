/*
 * 环境变量加载与校验
 * ------------------
 * 使用 zod 在启动时严格校验，缺失或类型错误立即崩溃，
 * 避免运行时拿到 undefined 引发难排的隐性 Bug。
 */

import 'dotenv/config';
import { z } from 'zod';

/*
 * 环境变量 schema
 *   PORT             服务端口，默认 8080
 *   NODE_ENV         环境标记，影响日志等行为
 *   LOG_LEVEL        日志等级
 *   SHARED_TOKEN     App ↔ Server 静态鉴权 token（v1 鉴权方案，spec.md §6.5）
 */
const EnvSchema = z.object({
  PORT: z.coerce.number().int().positive().default(8080),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  SHARED_TOKEN: z.string().min(1).optional(),
});

/* 解析失败直接抛错，让进程立即停止 */
const parsed = EnvSchema.safeParse(process.env);
if (!parsed.success) {
  console.error('[env] 环境变量校验失败：', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
