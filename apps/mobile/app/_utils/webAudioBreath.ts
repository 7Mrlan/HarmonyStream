/*
 * Web Audio 呼吸适配工具
 * ----------------------
 * 只放可测试的浏览器能力适配逻辑；React hook 负责生命周期和 state 发布。
 */

export interface AudioElementLike {
  currentSrc?: unknown;
  src?: unknown;
}

export interface NodeListLike {
  length?: unknown;
  item?: (index: number) => unknown;
}

export interface BrowserDocumentLike {
  querySelector?: (selector: string) => unknown;
  querySelectorAll?: (selector: string) => unknown;
}

export interface WebAudioAnalyserLike {
  frequencyBinCount: number;
  fftSize: number;
  smoothingTimeConstant: number;
  connect: (target: unknown) => void;
  disconnect?: () => void;
  getByteFrequencyData: (array: Uint8Array) => void;
}

export interface WebAudioSourceLike {
  connect: (target: unknown) => void;
  disconnect?: () => void;
}

export interface WebAudioContextLike {
  state?: string;
  destination: unknown;
  resume?: () => Promise<void>;
  createAnalyser: () => WebAudioAnalyserLike;
  createMediaElementSource: (element: AudioElementLike) => WebAudioSourceLike;
}

export interface WebAudioContextConstructor {
  new (): WebAudioContextLike;
}

export interface BrowserAudioGlobal {
  document?: BrowserDocumentLike;
  AudioContext?: WebAudioContextConstructor;
  webkitAudioContext?: WebAudioContextConstructor;
  requestAnimationFrame?: (callback: (time: number) => void) => number;
  cancelAnimationFrame?: (id: number) => void;
}

export const WEB_AUDIO_PUBLISH_INTERVAL_MS = 80;
export const WEB_AUDIO_SILENCE_GRACE_FRAMES = 12;
const WEB_AUDIO_MIN_REAL_INTENSITY = 0.004;

/* 工具：把 globalThis 缩窄成当前 hook 需要的最小浏览器能力集合。 */
export function getBrowserAudioGlobal(): BrowserAudioGlobal {
  return globalThis as unknown as BrowserAudioGlobal;
}

/* 工具：判断 unknown 是否为可作为 WeakMap key 的对象。 */
export function isObjectLike(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/* 工具：安全读取 audio element 上的字符串字段。 */
function readStringProperty(value: unknown, key: keyof AudioElementLike): string {
  if (!isObjectLike(value)) return '';
  const raw = value[key];
  return typeof raw === 'string' ? raw : '';
}

/* 工具：把 querySelectorAll 的 NodeList-like 返回值转成数组，避免依赖 DOM 类型。 */
function toArray(value: unknown): unknown[] {
  if (!isObjectLike(value)) return [];
  const rawLength = (value as NodeListLike).length;
  const length = typeof rawLength === 'number' ? rawLength : 0;
  if (!length) return [];

  return Array.from({ length }, (_, index) => {
    const item = (value as NodeListLike).item?.(index);
    return item ?? (value as Record<number, unknown>)[index];
  }).filter(Boolean);
}

/*
 * 判断 audio element 是否对应当前曲目。
 * Expo Web 可能把相对 URL 扩成绝对 URL，所以双向 includes 比严格相等更稳。
 */
export function matchesTrackUrl(element: unknown, trackUrl: string): boolean {
  const source = readStringProperty(element, 'currentSrc') || readStringProperty(element, 'src');
  if (!source || source.length < 8 || !trackUrl) return false;
  return source.includes(trackUrl) || trackUrl.includes(source);
}

/* 工具：优先选择当前曲对应的 audio；多 audio 且无法匹配时退回 fallback，避免误采 TTS。 */
export function pickExistingAudioElement(
  browser: BrowserAudioGlobal,
  trackUrl: string,
): AudioElementLike | null {
  const documentLike = browser.document;
  const all = documentLike?.querySelectorAll?.('audio');
  const candidates = all ? toArray(all) : [documentLike?.querySelector?.('audio')].filter(Boolean);
  const matched = candidates.find((candidate) => matchesTrackUrl(candidate, trackUrl));
  const selected = matched ?? (candidates.length === 1 ? candidates[0] : null);

  return isObjectLike(selected) ? (selected as AudioElementLike) : null;
}

/* 工具：把 analyser 频域数据压成 0-1 强度，保留峰值避免弱音段完全塌掉。 */
export function normalizeAnalyserData(data: Uint8Array): number {
  if (data.length === 0) return 0;

  const start = Math.min(2, data.length - 1);
  const end = Math.max(start + 1, Math.floor(data.length * 0.82));
  let weightedSum = 0;
  let weightTotal = 0;
  let peak = 0;

  for (let index = start; index < end; index += 1) {
    const value = data[index] ?? 0;
    const weight = 1 + index / end;
    weightedSum += value * weight;
    weightTotal += weight;
    peak = Math.max(peak, value);
  }

  const average = weightTotal > 0 ? weightedSum / weightTotal / 255 : 0;
  const peakLevel = peak / 255;
  return Math.max(0, Math.min(1, average * 1.65 + peakLevel * 0.22));
}

/* 工具：连续全 0 的 analyser 不算真实音频数据，避免 CORS 静默失败被标成 realAudio。 */
export function isMeaningfulAnalyserIntensity(intensity: number): boolean {
  return Number.isFinite(intensity) && intensity > WEB_AUDIO_MIN_REAL_INTENSITY;
}
