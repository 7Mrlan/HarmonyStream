/*
 * 本地音源 HTTP Range 路由
 * ------------------------
 * 仅服务 MUSIC_LIBRARY_DIR 内的真实文件，并且必须由 localProvider 承认 id。
 * 实现要点：
 *   - 校验 id 对应的文件路径必须落在 MUSIC_LIBRARY_DIR 内（防路径逃逸）
 *   - 支持 Range 请求 → 206 Partial Content
 *   - 缺省 Range → 200 完整流
 *   - 头部声明 Accept-Ranges、Content-Range、Content-Length、Cache-Control
 */

import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { extname, isAbsolute, relative, resolve, sep } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { env } from '../env.js';
import { findLocalEntryById } from '../music/providers/localProvider.js';
import { getAudio } from '../tts/audioStore.js';

/* 常见音频 MIME 映射。 */
const MIME_BY_EXT: Record<string, string> = {
  '.mp3': 'audio/mpeg',
  '.m4a': 'audio/mp4',
  '.flac': 'audio/flac',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.aac': 'audio/aac',
};

/*
 * 注册 media 路由。
 *   - /media/local/:id：仅 MUSIC_LIBRARY_DIR 配置时挂载
 *   - /media/tts/:id  ：始终挂载（v1 默认 Edge TTS 不需要任何配置即可工作）
 */
export function registerMediaRoutes(app: FastifyInstance): void {
  registerLocalMedia(app);
  registerTtsMedia(app);
}

/*
 * 注册 /media/tts/:id。
 * 短音频整体下载，不实现 Range；缺省返回 200 + audio/mpeg。
 */
function registerTtsMedia(app: FastifyInstance): void {
  app.get<{ Params: { id: string } }>('/media/tts/:id', async (request, reply) => {
    const { id } = request.params;
    const entry = getAudio(id);
    if (!entry) {
      reply.status(404);
      return { ok: false, reason: 'not found' };
    }

    reply
      .status(200)
      .header('Cache-Control', 'private, max-age=0, must-revalidate')
      .header('Content-Length', `${entry.buffer.length}`)
      .header('Content-Type', entry.mime);
    return reply.send(entry.buffer);
  });
}

/*
 * 注册 /media/local/:id 路由。
 * MUSIC_LIBRARY_DIR 未配置时不挂载，避免暴露空 route。
 */
function registerLocalMedia(app: FastifyInstance): void {
  const libraryDir = env.MUSIC_LIBRARY_DIR;
  if (!libraryDir) return;

  const absoluteBase = resolve(libraryDir);

  app.get<{ Params: { id: string } }>('/media/local/:id', async (request, reply) => {
    const { id } = request.params;
    const entry = await findLocalEntryById(libraryDir, id);
    if (!entry) {
      reply.status(404);
      return { ok: false, reason: 'not found' };
    }

    /*
     * 路径逃逸校验：要求 entry.absolutePath 严格落在 libraryDir 内。
     * 使用 path.relative 做平台无关判断；Windows 下大小写不敏感盘符容易绕过 indexOf。
     *   - relative 返回值以 ".." 开头 → 出库
     *   - relative 返回绝对路径 → 跨盘符，出库
     *   - 其它情况合法
     */
    if (!isPathInside(entry.absolutePath, absoluteBase)) {
      reply.status(403);
      return { ok: false, reason: 'forbidden' };
    }

    let info;
    try {
      info = await stat(entry.absolutePath);
    } catch {
      reply.status(404);
      return { ok: false, reason: 'missing file' };
    }
    if (!info.isFile()) {
      reply.status(404);
      return { ok: false, reason: 'not a file' };
    }

    const total = info.size;
    const mime = MIME_BY_EXT[extname(entry.absolutePath).toLowerCase()] ?? 'application/octet-stream';
    const range = request.headers.range;

    reply.header('Accept-Ranges', 'bytes');
    reply.header('Cache-Control', 'private, max-age=0, must-revalidate');

    if (range) {
      const parsed = parseRange(range, total);
      if (!parsed) {
        reply.status(416).header('Content-Range', `bytes */${total}`);
        return { ok: false, reason: 'invalid range' };
      }

      const { start, end } = parsed;
      const chunkSize = end - start + 1;
      reply
        .status(206)
        .header('Content-Range', `bytes ${start}-${end}/${total}`)
        .header('Content-Length', `${chunkSize}`)
        .header('Content-Type', mime);
      return reply.send(createReadStream(entry.absolutePath, { start, end }));
    }

    reply.status(200).header('Content-Length', `${total}`).header('Content-Type', mime);
    return reply.send(createReadStream(entry.absolutePath));
  });
}

/*
 * 解析 Range 请求头。
 * 仅支持单段 bytes=start-end / bytes=start- / bytes=-suffix；其它形态返回 null 让上层 416。
 */
function parseRange(headerValue: string, total: number): { start: number; end: number } | null {
  const match = /^bytes=(\d*)-(\d*)$/.exec(headerValue.trim());
  if (!match) return null;

  const startRaw = match[1];
  const endRaw = match[2];

  if (startRaw === '' && endRaw === '') return null;

  if (startRaw === '') {
    /* bytes=-N：返回末尾 N 字节。 */
    const suffixLength = Number.parseInt(endRaw ?? '', 10);
    if (!Number.isFinite(suffixLength) || suffixLength <= 0) return null;
    const start = Math.max(total - suffixLength, 0);
    return { start, end: total - 1 };
  }

  const start = Number.parseInt(startRaw ?? '', 10);
  if (!Number.isFinite(start) || start < 0 || start >= total) return null;

  const end = endRaw === '' || endRaw === undefined ? total - 1 : Number.parseInt(endRaw, 10);
  if (!Number.isFinite(end) || end < start || end >= total) return null;

  return { start, end };
}

/*
 * 判断 candidate 是否严格位于 base 目录之内。
 * 用 path.relative 做平台无关判断：
 *   - 同一路径 → 返回 ''；视为合法（虽然此处不会出现，但语义上属于库内）
 *   - 出库 → 返回 ".." 开头
 *   - 跨盘符 / 跨根 → 返回绝对路径
 * 这样在 Windows 大小写不敏感盘符（如 D:\\ vs d:\\）下也能正确比较。
 */
function isPathInside(candidate: string, base: string): boolean {
  const resolvedCandidate = resolve(candidate);
  const resolvedBase = resolve(base);
  if (resolvedCandidate === resolvedBase) return true;

  const rel = relative(resolvedBase, resolvedCandidate);
  if (!rel) return false;
  if (rel.startsWith('..')) return false;
  if (isAbsolute(rel)) return false;

  /* 防御 ".." 出现在子段中（如 child/.. 实际是 base，仍然合法），保留 sep 判断作为可读检查。 */
  const segments = rel.split(sep);
  return !segments.includes('..');
}
