/*
 * Claudio 后端入口
 * ----------------
 * Iter 0 阶段仅起 Fastify 服务并暴露 /health，
 * 用于验证 monorepo 的 server 包能正常构建和运行。
 * 后续 Iter 在 routes/ 下追加 chat / now / next / models / stream 等接口。
 */

import Fastify from 'fastify';
import websocket from '@fastify/websocket';
import { env } from './env';
import { registerApiRoutes } from './routes/apiRoutes';
import { registerMediaRoutes } from './routes/mediaRoutes';
import { registerStreamRoutes } from './routes/streamRoutes';
import { shutdownStreamHub } from './realtime/streamHub';
import { shutdownAudioStore } from './tts/audioStore';
import { shutdownMusicResolver } from './music/musicResolver';

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
 * 开发期 CORS 支持。
 * Expo Web 常运行在 8081/8082，而服务端在 8080；浏览器会先发 OPTIONS 预检。
 * 这里不引入额外依赖，只开放当前 Phase B 需要的 HTTP API 调用头。
 */
app.addHook('onRequest', (request, reply, done) => {
  reply.header('Access-Control-Allow-Origin', '*');
  reply.header('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  reply.header('Access-Control-Allow-Headers', 'Content-Type,Authorization');

  if (request.method === 'OPTIONS') {
    reply.code(204).send();
    return;
  }

  done();
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
 * 注册 Phase A API 与实时事件通道。
 * @fastify/websocket 必须先注册，再在后续插件上下文里挂载 websocket route。
 */
void app.register(websocket);
void app.register(async (routesApp) => {
  registerApiRoutes(routesApp);
  registerMediaRoutes(routesApp);
  registerStreamRoutes(routesApp);
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

/*
 * Phase F：graceful shutdown。
 *   - SIGINT / SIGTERM 触发后先关 fastify HTTP / WS，再清 streamHub 心跳与 client、音频缓存与 resolveCache。
 *   - 单调标记防止重复 shutdown；15s 兜底强退，避免开发联调挂死进程。
 *   - 出错路径继续清理后续资源，不让单个失败阻塞退出链路。
 */
let shuttingDown = false;
async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;

  app.log.info(`[shutdown] received ${signal}, closing server...`);

  /* 15s 兜底：超时仍未走完清理，直接强退；exitCode=1 标记非正常退出。 */
  const forceTimer = setTimeout(() => {
    app.log.error('[shutdown] timeout, force exit');
    process.exit(1);
  }, 15_000);
  forceTimer.unref?.();

  try {
    /* 先关 fastify：会一并关闭 @fastify/websocket 注册的 WS 连接的接受端。 */
    await app.close();
  } catch (err) {
    app.log.error({ err }, '[shutdown] app.close failed');
  }
  try {
    shutdownStreamHub();
  } catch (err) {
    app.log.error({ err }, '[shutdown] streamHub failed');
  }
  try {
    shutdownAudioStore();
  } catch (err) {
    app.log.error({ err }, '[shutdown] audioStore failed');
  }
  try {
    shutdownMusicResolver();
  } catch (err) {
    app.log.error({ err }, '[shutdown] musicResolver failed');
  }

  clearTimeout(forceTimer);
  app.log.info('[shutdown] ok');
  process.exit(0);
}

process.on('SIGINT', () => {
  void shutdown('SIGINT');
});
process.on('SIGTERM', () => {
  void shutdown('SIGTERM');
});

void start();
