/*
 * LX worker IPC 协议
 * ------------------
 * 主进程与 Bridge 子进程只通过可 JSON 序列化的消息通信，便于超时、重启和日志排障。
 */

import type {
  LxMusicCandidate,
  LxResolveMusicUrlRequest,
  LxResolvedUrl,
  LxSearchMusicRequest,
  LxSourceInitResult,
  LxSourceScript,
} from './types.js';

export type LxWorkerAction = 'load-source' | 'search-music' | 'resolve-music-url' | 'destroy';

export interface LxWorkerMessage<TPayload = unknown> {
  /* IPC 请求 id。 */
  id: string;
  /* 请求动作。 */
  action: LxWorkerAction;
  /* 动作载荷。 */
  payload: TPayload;
}

export interface LxLoadSourcePayload {
  /* 源脚本。 */
  script: LxSourceScript;
  /* lx.request 默认超时。 */
  requestTimeoutMs: number;
}

export interface LxWorkerSuccessMessage<TPayload = unknown> {
  /* IPC 请求 id。 */
  id: string;
  /* 成功标记。 */
  ok: true;
  /* 响应载荷。 */
  payload: TPayload;
}

export interface LxWorkerErrorMessage {
  /* IPC 请求 id。 */
  id: string;
  /* 失败标记。 */
  ok: false;
  /* 错误信息。 */
  error: string;
}

export type LxWorkerResponseMessage<TPayload = unknown> =
  | LxWorkerSuccessMessage<TPayload>
  | LxWorkerErrorMessage;

export type LxLoadSourceMessage = LxWorkerMessage<LxLoadSourcePayload>;
export type LxSearchMusicMessage = LxWorkerMessage<LxSearchMusicRequest>;
export type LxResolveMusicUrlMessage = LxWorkerMessage<LxResolveMusicUrlRequest>;
export type LxLoadSourceResponse = LxWorkerResponseMessage<LxSourceInitResult>;
export type LxSearchMusicResponse = LxWorkerResponseMessage<LxMusicCandidate[]>;
export type LxResolveMusicUrlResponse = LxWorkerResponseMessage<LxResolvedUrl | null>;
