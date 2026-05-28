/*
 * Xiaomi MiMo TTS provider
 * ------------------------
 * 支持三种模式：
 *   mimo-v2.5-tts           预设音色，voice 传音色 ID（如 白桦、茉莉）
 *   mimo-v2.5-tts-voicedesign  文字描述音色，voice 传描述文字
 *   mimo-v2.5-tts-voiceclone   克隆真实人声，voice 传 base64 数据 URI（从文件懒加载）
 */

import { readFile } from 'node:fs/promises';
import { extname } from 'node:path';
import type { TtsProvider, TtsSynthesizeInput, TtsSynthesizeResult } from '../types.js';
import { TTS_PROVIDER_API_VERSION } from '../types.js';

const MIMO_API_URL = 'https://api.xiaomimimo.com/v1/chat/completions';

const CLONE_MIME: Record<string, string> = {
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
};

export function createMimoTtsProvider(
  apiKey: string,
  defaultVoice: string,
  model: string,
  styleInstruction: string,
  timeoutMs: number,
  voiceCloneFile?: string,
): TtsProvider {
  const enabled = Boolean(apiKey.trim());

  /* VoiceClone 模式下懒加载并缓存 base64，避免每次合成都读文件。 */
  let cloneVoiceCache: string | null = null;

  return {
    manifest: {
      id: 'mimo',
      name: 'Xiaomi MiMo TTS',
      version: '2.5',
      type: 'cloud',
      tier: 'external',
      pluginApiVersion: TTS_PROVIDER_API_VERSION,
      audioCacheAllowed: true,
      timeoutMs,
      defaultVoice,
      cacheScope: `${model}:${styleInstruction}`,
    },
    isEnabled: () => enabled,
    synthesize: async (input) => {
      let voice: string;

      if (model === 'mimo-v2.5-tts-voiceclone') {
        if (!voiceCloneFile) {
          throw new Error('mimo voiceclone: MIMO_VOICE_CLONE_FILE not configured');
        }
        if (!cloneVoiceCache) {
          cloneVoiceCache = await loadCloneVoice(voiceCloneFile);
        }
        voice = cloneVoiceCache;
      } else {
        const raw = input.voice?.trim() ?? '';
        voice = raw || defaultVoice;
      }

      return synthesize(input, apiKey, voice, model, styleInstruction, timeoutMs);
    },
  };
}

/* 读取克隆音频文件，转为 MiMo 要求的 base64 数据 URI 格式。 */
async function loadCloneVoice(filePath: string): Promise<string> {
  const ext = extname(filePath).toLowerCase();
  const mime = CLONE_MIME[ext];
  if (!mime) {
    throw new Error(`mimo voiceclone: unsupported file type "${ext}", use .mp3 or .wav`);
  }
  const buf = await readFile(filePath);
  const b64 = buf.toString('base64');
  if (b64.length > 10 * 1024 * 1024) {
    throw new Error('mimo voiceclone: audio file exceeds 10 MB base64 limit');
  }
  return `data:${mime};base64,${b64}`;
}

async function synthesize(
  input: TtsSynthesizeInput,
  apiKey: string,
  voice: string,
  model: string,
  styleInstruction: string,
  timeoutMs: number,
): Promise<TtsSynthesizeResult> {
  const messages: { role: string; content: string }[] = [];

  /*
   * VoiceDesign：voice 描述放 user 消息，audio 不传 voice 字段。
   * 预设 / VoiceClone：style 指令放 user 消息，voice 放 audio.voice。
   */
  const isVoiceDesign = model === 'mimo-v2.5-tts-voicedesign';
  const mergedStyleInstruction = mergeStyleInstruction(
    styleInstruction,
    input.style?.styleInstruction,
  );
  if (isVoiceDesign) {
    messages.push({ role: 'user', content: mergeStyleInstruction(voice, mergedStyleInstruction) });
  } else if (mergedStyleInstruction) {
    messages.push({ role: 'user', content: mergedStyleInstruction });
  }
  messages.push({ role: 'assistant', content: input.text });

  const audioParam: Record<string, string> = { format: 'wav' };
  if (!isVoiceDesign) audioParam.voice = voice;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let resp: Response;
  try {
    resp = await fetch(MIMO_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-key': apiKey,
      },
      body: JSON.stringify({
        model,
        messages,
        audio: audioParam,
      }),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }

  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw new Error(`mimo tts http ${resp.status}: ${text}`);
  }

  const json = (await resp.json()) as {
    choices: Array<{ message: { audio: { data: string } } }>;
  };

  const base64 = json.choices?.[0]?.message?.audio?.data;
  if (!base64) throw new Error('mimo tts: empty audio data in response');

  return {
    audio: Buffer.from(base64, 'base64'),
    mime: 'audio/wav',
    voice,
  };
}

/* 合并全局主播基调和本轮动态语气。 */
function mergeStyleInstruction(base: string, dynamic: string | undefined): string {
  const parts = [base.trim(), dynamic?.trim()].filter(Boolean);
  return [...new Set(parts)].join('\n');
}
