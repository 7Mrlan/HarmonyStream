/*
 * 用户音源导入存储
 * ----------------
 * Phase M 只管理本机 LX-compatible 用户源脚本：验证、导入、启用、回滚到默认源。
 * 脚本保存到 ignored 的 server/data/lx-sources/user，不进入 Git，也不写入日志。
 */

import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { env } from '../env.js';
import { createLxWorkerProcess } from './lxBridge/workerProcess.js';
import type { LxSourceInitResult, LxSourceScript } from './lxBridge/types.js';

export type MusicSourceMode = 'default' | 'user' | 'env';

export interface UserMusicSourceConfig {
  /* 当前用户源是否启用。 */
  active: boolean;
  /* 用户展示名，不写敏感脚本内容。 */
  name: string;
  /* 脚本 sha256，用于状态展示和排障。 */
  scriptHash: string;
  /* 导入时间。 */
  importedAt: string;
  /* 最近一次验证结果。 */
  validation: MusicSourceValidation;
}

export interface MusicSourceValidation {
  /* 是否通过 worker 隔离验证。 */
  ok: boolean;
  /* 脚本 hash。 */
  scriptHash?: string;
  /* 源声明的 source key。 */
  sourceKeys: string[];
  /* 用户可读失败原因，不包含脚本文本。 */
  reason?: string;
}

export interface MusicSourceStatus {
  /* 当前 provider chain 会使用哪类 LX 源。 */
  activeMode: MusicSourceMode;
  /* 默认内置双源是否可用。 */
  defaultAvailable: boolean;
  /* 是否存在用户导入源。 */
  hasUserSource: boolean;
  /* 用户源元信息；不包含脚本文本。 */
  userSource?: {
    active: boolean;
    name: string;
    scriptHash: string;
    importedAt: string;
    sourceKeys: string[];
    lastValidationOk: boolean;
  };
  /* 环境变量源优先时给 UI 的说明。 */
  message?: string;
}

export interface ImportUserMusicSourceInput {
  /* 用户展示名。 */
  name: string;
  /* LX-compatible 源脚本文本。 */
  script: string;
  /* 测试可覆盖存储目录。 */
  sourceDir?: string;
  /* 测试可注入验证 runner；生产默认使用 child_process worker。 */
  validationRunner?: SourceValidationRunner;
}

export interface ActivateUserMusicSourceInput {
  /* 激活用户源或回滚默认源。 */
  mode: Exclude<MusicSourceMode, 'env'>;
  /* 测试可覆盖存储目录。 */
  sourceDir?: string;
}

export interface LocalLxSourceRuntimeConfig {
  /* 本机用户源脚本路径。 */
  scriptFile: string;
  /* provider 展示名。 */
  sourceName: string;
  /* provider 内部 id。 */
  sourceId: string;
}

export type SourceValidationRunner = (script: LxSourceScript) => Promise<LxSourceInitResult>;

const serverRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const DEFAULT_USER_SOURCE_DIR = resolve(serverRoot, 'data/lx-sources/user');
const USER_SOURCE_FILE = 'source.js';
const USER_SOURCE_CONFIG_FILE = 'config.json';
const MAX_SOURCE_SCRIPT_BYTES = 512 * 1024;

/*
 * 读取当前音源状态。
 * 这里不读取脚本文本，只返回 UI 需要的安全元信息。
 */
export async function getMusicSourceStatus(sourceDir?: string): Promise<MusicSourceStatus> {
  const config = await readUserSourceConfig(sourceDir);
  return buildMusicSourceStatus(config);
}

/*
 * 运行 worker 隔离验证。
 * 验证只检查脚本能初始化且声明 musicUrl 能力，不尝试真实解析歌曲。
 */
export async function validateUserMusicSourceScript(input: {
  name: string;
  script: string;
  validationRunner?: SourceValidationRunner;
}): Promise<MusicSourceValidation> {
  const normalized = normalizeSourceInput(input);
  if (!normalized.ok) return normalized.validation;

  const scriptHash = hashScript(normalized.script);
  try {
    const result = await runSourceValidation(
      buildWorkerScript(normalized.name, normalized.script, scriptHash),
      input.validationRunner,
    );
    return {
      ok: true,
      scriptHash,
      sourceKeys: Object.keys(result.sources),
    };
  } catch (error) {
    return {
      ok: false,
      scriptHash,
      sourceKeys: [],
      reason: formatValidationError(error),
    };
  }
}

/*
 * 导入用户源：先验证，再写入本机 ignored 目录并默认启用。
 * 失败时不覆盖已有可用源，确保播放链路仍可回落默认双源池。
 */
export async function importUserMusicSource(
  input: ImportUserMusicSourceInput,
): Promise<{ ok: boolean; status: MusicSourceStatus; validation: MusicSourceValidation }> {
  const validation = await validateUserMusicSourceScript(input);
  if (!validation.ok || !validation.scriptHash) {
    return {
      ok: false,
      status: await getMusicSourceStatus(input.sourceDir),
      validation,
    };
  }

  const dir = resolveUserSourceDir(input.sourceDir);
  await mkdir(dir, { recursive: true });
  await writeFile(resolve(dir, USER_SOURCE_FILE), input.script, 'utf8');
  await writeUserSourceConfig(
    {
      active: true,
      name: sanitizeSourceName(input.name),
      scriptHash: validation.scriptHash,
      importedAt: new Date().toISOString(),
      validation,
    },
    input.sourceDir,
  );

  return {
    ok: true,
    status: await getMusicSourceStatus(input.sourceDir),
    validation,
  };
}

/*
 * 启用用户源或回滚默认源。
 * 回滚不删除脚本，便于之后重新启用；provider chain 会在路由层 reset 后立即读取新状态。
 */
export async function activateUserMusicSource(
  input: ActivateUserMusicSourceInput,
): Promise<{ ok: boolean; status: MusicSourceStatus; reason?: string }> {
  const config = await readUserSourceConfig(input.sourceDir);
  if (!config) {
    return {
      ok: input.mode === 'default',
      status: await getMusicSourceStatus(input.sourceDir),
      reason: input.mode === 'user' ? '尚未导入用户源。' : undefined,
    };
  }

  const nextConfig = { ...config, active: input.mode === 'user' };
  await writeUserSourceConfig(nextConfig, input.sourceDir);
  return {
    ok: true,
    status: await getMusicSourceStatus(input.sourceDir),
  };
}

/*
 * providerRegistry 同步读取当前本机用户源。
 * 这里刻意保持同步，避免 provider chain 构造路径变成异步并扩散到 resolver。
 */
export function getActiveLocalLxSourceConfigSync(sourceDir?: string): LocalLxSourceRuntimeConfig | null {
  if (env.LX_SOURCE_SCRIPT_URL || env.LX_SOURCE_SCRIPT_FILE) return null;

  const dir = resolveUserSourceDir(sourceDir);
  const scriptFile = resolve(dir, USER_SOURCE_FILE);
  const configFile = resolve(dir, USER_SOURCE_CONFIG_FILE);
  if (!existsSync(scriptFile) || !existsSync(configFile)) return null;

  try {
    const parsed = JSON.parse(readFileSync(configFile, 'utf8')) as Partial<UserMusicSourceConfig>;
    if (!parsed.active || !parsed.name) return null;
    return {
      scriptFile,
      sourceId: 'local-user-lx-source',
      sourceName: parsed.name,
    };
  } catch {
    return null;
  }
}

/* 根据配置生成安全状态。 */
function buildMusicSourceStatus(config: UserMusicSourceConfig | null): MusicSourceStatus {
  const envConfigured = Boolean(env.LX_SOURCE_SCRIPT_URL || env.LX_SOURCE_SCRIPT_FILE);
  const status: MusicSourceStatus = {
    activeMode: envConfigured ? 'env' : config?.active ? 'user' : 'default',
    defaultAvailable: true,
    hasUserSource: Boolean(config),
    ...(envConfigured
      ? { message: '当前服务端使用环境变量配置的 LX 用户源；App 导入源会保存，但不会覆盖环境变量源。' }
      : {}),
  };

  if (!config) return status;
  return {
    ...status,
    userSource: {
      active: config.active,
      name: config.name,
      scriptHash: config.scriptHash,
      importedAt: config.importedAt,
      sourceKeys: config.validation.sourceKeys,
      lastValidationOk: config.validation.ok,
    },
  };
}

/* 读取用户源配置。 */
async function readUserSourceConfig(sourceDir?: string): Promise<UserMusicSourceConfig | null> {
  try {
    const raw = await readFile(resolve(resolveUserSourceDir(sourceDir), USER_SOURCE_CONFIG_FILE), 'utf8');
    return normalizeStoredConfig(JSON.parse(raw));
  } catch {
    return null;
  }
}

/* 写入用户源配置。 */
async function writeUserSourceConfig(config: UserMusicSourceConfig, sourceDir?: string): Promise<void> {
  const dir = resolveUserSourceDir(sourceDir);
  await mkdir(dir, { recursive: true });
  await writeFile(resolve(dir, USER_SOURCE_CONFIG_FILE), JSON.stringify(config, null, 2), 'utf8');
}

/* 归一化存储配置，损坏配置直接视为不存在。 */
function normalizeStoredConfig(value: unknown): UserMusicSourceConfig | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  if (typeof record.name !== 'string' || typeof record.scriptHash !== 'string') return null;
  if (typeof record.importedAt !== 'string') return null;
  const validation = record.validation;
  if (!validation || typeof validation !== 'object') return null;
  const validationRecord = validation as Record<string, unknown>;
  if (typeof validationRecord.ok !== 'boolean') return null;
  return {
    active: Boolean(record.active),
    name: sanitizeSourceName(record.name),
    scriptHash: record.scriptHash,
    importedAt: record.importedAt,
    validation: {
      ok: validationRecord.ok,
      ...(typeof validationRecord.scriptHash === 'string'
        ? { scriptHash: validationRecord.scriptHash }
        : {}),
      sourceKeys: Array.isArray(validationRecord.sourceKeys)
        ? validationRecord.sourceKeys.filter((item): item is string => typeof item === 'string')
        : [],
      ...(typeof validationRecord.reason === 'string' ? { reason: validationRecord.reason } : {}),
    },
  };
}

/* 归一化导入输入，限制脚本体积和空内容。 */
function normalizeSourceInput(input: { name: string; script: string }):
  | { ok: true; name: string; script: string }
  | { ok: false; validation: MusicSourceValidation } {
  const name = sanitizeSourceName(input.name);
  const script = input.script.trim();
  if (!name) {
    return { ok: false, validation: { ok: false, sourceKeys: [], reason: '音源名称不能为空。' } };
  }
  if (!script) {
    return { ok: false, validation: { ok: false, sourceKeys: [], reason: '音源脚本不能为空。' } };
  }
  if (Buffer.byteLength(script, 'utf8') > MAX_SOURCE_SCRIPT_BYTES) {
    return { ok: false, validation: { ok: false, sourceKeys: [], reason: '音源脚本过大。' } };
  }
  return { ok: true, name, script };
}

/* 构造 worker 可加载的脚本描述。 */
function buildWorkerScript(name: string, code: string, hash: string): LxSourceScript {
  return {
    id: 'import-validation',
    name,
    code,
    hash,
    origin: 'user-imported-lx-source',
  };
}

/* 执行验证；生产默认走子进程，测试可注入同等语义的直连 runner。 */
async function runSourceValidation(
  script: LxSourceScript,
  validationRunner: SourceValidationRunner | undefined,
): Promise<LxSourceInitResult> {
  if (validationRunner) return validationRunner(script);

  const worker = createLxWorkerProcess({
    timeoutMs: env.LX_BRIDGE_TIMEOUT_MS,
    requestTimeoutMs: env.LX_BRIDGE_REQUEST_TIMEOUT_MS,
  });
  try {
    return await worker.loadSource(script);
  } finally {
    await worker.destroy().catch(() => {
      /* worker 可能已在验证失败时退出，销毁失败不影响导入结果。 */
    });
  }
}

/* 格式化验证错误，避免把脚本内容打回 UI。 */
function formatValidationError(error: unknown): string {
  if (!(error instanceof Error)) return '音源验证失败。';
  return error.message.replace(/\s+/g, ' ').slice(0, 240);
}

/* 清理展示名。 */
function sanitizeSourceName(value: string): string {
  return value.trim().replace(/\s+/g, ' ').slice(0, 80);
}

/* 计算脚本 hash。 */
function hashScript(script: string): string {
  return createHash('sha256').update(script).digest('hex');
}

/* 解析存储目录。 */
function resolveUserSourceDir(sourceDir?: string): string {
  return sourceDir ? resolve(sourceDir) : DEFAULT_USER_SOURCE_DIR;
}

export type { LxSourceInitResult };
