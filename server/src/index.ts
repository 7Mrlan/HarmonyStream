/*
 * Claudio 后端入口
 * ----------------
 * Iter 0 阶段仅起 Fastify 服务并暴露 /health，
 * 用于验证 monorepo 的 server 包能正常构建和运行。
 * 后续 Iter 在 routes/ 下追加 chat / now / next / models / stream 等接口。
 */

import Fastify from 'fastify';
import { env } from './env';

/* 创建 Fastify 实例，pino 日志开发期友好打印 */
const app = Fastify({
  logger: {
    level: env.LOG_LEVEL,
    transport:
      env.NODE_ENV === 'development'
        ? { target: 'pino-pretty', options: { colorize: true } }
        : undefined,
  },
});

/*
 * 健康检查路由
 * 返回服务运行状态、当前时间戳、版本号，方便部署后探活
 */
app.get('/health', async () => {
  return {
    ok: true,
    name: 'claudio-server',
    version: '0.1.0',
    time: new Date().toISOString(),
  };
});

/*
 * 启动 HTTP 服务，监听 0.0.0.0 以便局域网内手机访问
 * 失败时打印错误并退出进程，避免静默失败
 */
async function start(): Promise<void> {
  try {
    await app.listen({ port: env.PORT, host: '0.0.0.0' });
    app.log.info(`claudio-server listening on http://0.0.0.0:${env.PORT}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

void start();
