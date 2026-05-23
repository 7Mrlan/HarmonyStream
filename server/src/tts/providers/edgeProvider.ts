/*
 * Edge TTS provider
 * -----------------
 * 通过 msedge-tts（社区包）调用 Microsoft Edge 浏览器的 Read Aloud TTS endpoint。
 * 优势：免费、无 key、跨平台；劣势：依赖 MS 公开 endpoint，无 SLA。
 * 默认输出 webm-opus；为兼容 expo-audio 与 HTML5 audio，强制选择 mp3 输出格式。
 */

import type { TtsProvider, TtsSynthesizeInput, TtsSynthesizeResult } from '../types';
import { TTS_PROVIDER_API_VERSION } from '../types';

/*
 * 创建 Edge TTS provider。
 * voice 缺省时使用 manifest.defaultVoice；外部传入时覆盖。
 */
export function createEdgeTtsProvider(defaultVoice: string, timeoutMs: number): TtsProvider {
  return {
    manifest: {
      id: 'edge',
      name: 'Microsoft Edge Read Aloud',
      version: '2.0.5',
      type: 'http',
      tier: 'external',
      pluginApiVersion: TTS_PROVIDER_API_VERSION,
      audioCacheAllowed: true,
      timeoutMs,
      defaultVoice,
    },
    isEnabled: () => true,
    synthesize: (input) => synthesize(input, defaultVoice, timeoutMs),
  };
}

/*
 * 真正的合成调用。
 * msedge-tts 的 toStream 返回 Node Readable，需要拼成完整 Buffer 再返回。
 * 失败 / 超时直接抛错，由 ttsService 的 chain 决定下一步。
 */
async function synthesize(
  input: TtsSynthesizeInput,
  defaultVoice: string,
  timeoutMs: number,
): Promise<TtsSynthesizeResult> {
  /* 动态 import 避免在 server 启动阶段强加载这个外部 ws 包，便于失败时只影响 TTS 路径。 */
  const { MsEdgeTTS, OUTPUT_FORMAT } = await import('msedge-tts');
  const tts = new MsEdgeTTS();
  const voice = input.voice?.trim() || defaultVoice;
  await tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3);

  const opts = typeof input.speed === 'number' ? { rate: input.speed } : undefined;

  const collected = await collectStreamWithTimeout(
    () => tts.toStream(input.text, opts),
    timeoutMs,
  );

  return {
    audio: collected,
    mime: 'audio/mpeg',
    voice,
  };
}

/*
 * 在超时窗口内把 audioStream 收集成 Buffer。
 * 超时则抛 Error，msedge-tts 的内部 ws 会随 GC 关闭。
 */
function collectStreamWithTimeout(
  open: () => { audioStream: NodeJS.ReadableStream },
  timeoutMs: number,
): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    const { audioStream } = open();
    const chunks: Buffer[] = [];

    /* 通过结构化 unknown 转换访问 destroy；msedge-tts 类型只暴露 ReadableStream，但运行时是 Node Readable。 */
    const destroyable = audioStream as unknown as { destroy?: () => void };

    /* 超时定时器：触发后强制 reject 并 destroy stream。 */
    const timer = setTimeout(() => {
      try {
        destroyable.destroy?.();
      } catch {
        /* destroy 失败也只能放弃，主流程靠 reject 退出。 */
      }
      reject(new Error(`edge tts timeout after ${timeoutMs}ms`));
    }, timeoutMs);

    audioStream.on('data', (chunk: Buffer) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    audioStream.on('error', (error: Error) => {
      clearTimeout(timer);
      reject(error);
    });
    audioStream.on('close', () => {
      clearTimeout(timer);
      if (chunks.length === 0) {
        reject(new Error('edge tts returned empty stream'));
        return;
      }
      resolve(Buffer.concat(chunks));
    });
  });
}
