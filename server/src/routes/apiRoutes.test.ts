import Fastify from 'fastify';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { loadUserMusicProfile } from '../personal/profileStore.js';
import { registerApiRoutes, type RegisterApiRoutesOptions } from './apiRoutes.js';

let tempDirs: string[] = [];

/*
 * 创建带独立用户资料目录的测试服务。
 * 路由仍注册完整 API，但测试只触发 listening event 写入入口。
 */
async function createTestApp(options: Omit<RegisterApiRoutesOptions, 'profileDir'> = {}) {
  const profileDir = await mkdtemp(join(tmpdir(), 'claudio-events-'));
  tempDirs.push(profileDir);
  const app = Fastify({ logger: false });
  registerApiRoutes(app, { profileDir, memoryWriteToken: null, ...options });
  await app.ready();
  return { app, profileDir };
}

afterEach(async () => {
  await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })));
  tempDirs = [];
});

describe('POST /api/listening-events', () => {
  it('写入合法事件后可从本地 profile 读取', async () => {
    const { app, profileDir } = await createTestApp();

    try {
      const response = await app.inject({
        method: 'POST',
        url: '/api/listening-events',
        headers: {
          'x-claudio-client': 'claudio-app',
        },
        payload: {
          type: 'feedback',
          title: 'Riverside',
          artist: 'Agnes Obel',
          text: '这首以后深夜写代码多放',
        },
      });

      const body = response.json<{ ok: boolean; id?: string }>();
      const profile = await loadUserMusicProfile({ profileDir });

      expect(response.statusCode).toBe(200);
      expect(body.ok).toBe(true);
      expect(body.id).toBeTruthy();
      expect(profile.listeningEvents[0]).toMatchObject({
        type: 'feedback',
        title: 'Riverside',
        artist: 'Agnes Obel',
        text: '这首以后深夜写代码多放',
      });
    } finally {
      await app.close();
    }
  });

  it('拒绝非法事件类型和空曲目普通行为', async () => {
    const { app } = await createTestApp();

    try {
      const invalidType = await app.inject({
        method: 'POST',
        url: '/api/listening-events',
        headers: {
          'x-claudio-client': 'claudio-app',
        },
        payload: { type: 'bad-event', title: 'Riverside' },
      });
      const emptyTrack = await app.inject({
        method: 'POST',
        url: '/api/listening-events',
        headers: {
          'x-claudio-client': 'claudio-app',
        },
        payload: { type: 'favorite' },
      });

      expect(invalidType.statusCode).toBe(400);
      expect(invalidType.json<{ ok: boolean }>().ok).toBe(false);
      expect(emptyTrack.statusCode).toBe(400);
      expect(emptyTrack.json<{ ok: boolean }>().ok).toBe(false);
    } finally {
      await app.close();
    }
  });

  it('拒绝缺少 Claudio 来源标记的记忆写入', async () => {
    const { app } = await createTestApp();

    try {
      const response = await app.inject({
        method: 'POST',
        url: '/api/listening-events',
        payload: {
          type: 'favorite',
          title: 'Riverside',
        },
      });

      expect(response.statusCode).toBe(403);
      expect(response.json<{ ok: boolean }>().ok).toBe(false);
    } finally {
      await app.close();
    }
  });

  it('拒绝外站 Origin 和超长反馈文本', async () => {
    const { app } = await createTestApp();

    try {
      const externalOrigin = await app.inject({
        method: 'POST',
        url: '/api/listening-events',
        headers: {
          'x-claudio-client': 'claudio-app',
          origin: 'https://example.com',
        },
        payload: {
          type: 'favorite',
          title: 'Riverside',
        },
      });
      const longText = await app.inject({
        method: 'POST',
        url: '/api/listening-events',
        headers: {
          'x-claudio-client': 'claudio-app',
        },
        payload: {
          type: 'feedback',
          text: '很喜欢这首'.repeat(200),
        },
      });

      expect(externalOrigin.statusCode).toBe(403);
      expect(longText.statusCode).toBe(400);
    } finally {
      await app.close();
    }
  });

  it('配置共享 token 后必须通过 Authorization 写入', async () => {
    const { app, profileDir } = await createTestApp({ memoryWriteToken: 'secret-token' });

    try {
      const missingToken = await app.inject({
        method: 'POST',
        url: '/api/listening-events',
        headers: {
          'x-claudio-client': 'claudio-app',
        },
        payload: {
          type: 'favorite',
          title: 'Riverside',
        },
      });
      const withToken = await app.inject({
        method: 'POST',
        url: '/api/listening-events',
        headers: {
          authorization: 'Bearer secret-token',
        },
        payload: {
          type: 'favorite',
          title: 'Riverside',
        },
      });
      const profile = await loadUserMusicProfile({ profileDir });

      expect(missingToken.statusCode).toBe(403);
      expect(withToken.statusCode).toBe(200);
      expect(profile.listeningEvents).toHaveLength(1);
      expect(profile.listeningEvents[0]?.title).toBe('Riverside');
    } finally {
      await app.close();
    }
  });
});
