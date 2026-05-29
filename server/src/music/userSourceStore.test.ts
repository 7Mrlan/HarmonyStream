import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { handleLoadSource } from './lxBridge/worker-entry.js';
import type { LxSourceScript } from './lxBridge/types.js';
import {
  activateUserMusicSource,
  getActiveLocalLxSourceConfigSync,
  getMusicSourceStatus,
  importUserMusicSource,
  validateUserMusicSourceScript,
} from './userSourceStore.js';

let tempDirs: string[] = [];

/* 创建隔离用户源目录，避免测试触碰真实 server/data。 */
async function createSourceDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'claudio-source-'));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })));
  tempDirs = [];
});

/* 最小 LX-compatible 用户源脚本，只验证 init 和能力声明。 */
function validSourceScript(): string {
  return `
    lx.on(lx.EVENT_NAMES.request, async (request) => {
      if (request.action === 'musicSearch') {
        return [{ id: 'demo-1', name: 'Demo Song', singer: 'Claudio' }];
      }
      if (request.action === 'musicUrl') {
        return { url: 'https://example.com/demo.mp3' };
      }
      return null;
    });
    lx.send(lx.EVENT_NAMES.inited, {
      sources: {
        demo: {
          type: 'music',
          actions: ['musicSearch', 'musicUrl'],
          qualitys: ['128k']
        }
      }
    });
  `;
}

/* 测试 runner 复用 worker-entry 的验证逻辑，但不启动子进程，避免依赖 dist/worker-entry.js。 */
function validateInProcess(script: LxSourceScript) {
  return handleLoadSource({ script, requestTimeoutMs: 1000 });
}

describe('userSourceStore', () => {
  it('验证合法 LX 用户源脚本', async () => {
    const validation = await validateUserMusicSourceScript({
      name: 'Demo Source',
      script: validSourceScript(),
      validationRunner: validateInProcess,
    });

    expect(validation.ok).toBe(true);
    expect(validation.sourceKeys).toEqual(['demo']);
    expect(validation.scriptHash).toBeTruthy();
  });

  it('导入后默认启用，并可被 provider registry 同步读取', async () => {
    const sourceDir = await createSourceDir();
    const result = await importUserMusicSource({
      name: 'Demo Source',
      script: validSourceScript(),
      sourceDir,
      validationRunner: validateInProcess,
    });
    const runtimeConfig = getActiveLocalLxSourceConfigSync(sourceDir);

    expect(result.ok).toBe(true);
    expect(result.status.activeMode).toBe('user');
    expect(result.status.userSource).toMatchObject({
      active: true,
      name: 'Demo Source',
      sourceKeys: ['demo'],
      lastValidationOk: true,
    });
    expect(runtimeConfig).toMatchObject({
      sourceId: 'local-user-lx-source',
      sourceName: 'Demo Source',
    });
  });

  it('回滚默认源时保留用户源但不再启用', async () => {
    const sourceDir = await createSourceDir();
    await importUserMusicSource({
      name: 'Demo Source',
      script: validSourceScript(),
      sourceDir,
      validationRunner: validateInProcess,
    });

    const rollback = await activateUserMusicSource({ mode: 'default', sourceDir });
    const status = await getMusicSourceStatus(sourceDir);

    expect(rollback.ok).toBe(true);
    expect(status.activeMode).toBe('default');
    expect(status.hasUserSource).toBe(true);
    expect(status.userSource?.active).toBe(false);
    expect(getActiveLocalLxSourceConfigSync(sourceDir)).toBeNull();
  });

  it('拒绝无 musicUrl 能力的脚本且不覆盖当前状态', async () => {
    const sourceDir = await createSourceDir();
    const result = await importUserMusicSource({
      name: 'Bad Source',
      sourceDir,
      validationRunner: validateInProcess,
      script: `throw new Error('bad source');`,
    });

    expect(result.ok).toBe(false);
    expect(result.validation.ok).toBe(false);
    expect(result.status.activeMode).toBe('default');
  });
});
