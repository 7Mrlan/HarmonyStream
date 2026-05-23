/*
 * TTS provider 内部类型
 * ---------------------
 * 与 server/src/music/types.ts 同结构：manifest + capability + tier + cachePolicy。
 * 第一版只做最小集合：能跑、能排障、能驱动缓存策略。
 */

/* TTS provider 类型，用于排障和缓存策略选择。 */
export type TtsProviderType = 'http' | 'cloud' | 'local';

/* tier：owned 自有、external 第三方、experimental 显式启用、fallback 仅占位。 */
export type TtsProviderTier = 'owned' | 'external' | 'experimental' | 'fallback';

/* TTS provider 协议版本号，便于未来兼容性判断。 */
export const TTS_PROVIDER_API_VERSION = 'claudio-tts-1';

/* TTS provider manifest。 */
export interface TtsManifest {
  /* provider 唯一 id。 */
  id: string;
  /* 展示名。 */
  name: string;
  /* provider 自身版本，外部 SDK 升级时方便追踪。 */
  version: string;
  /* provider 类型。 */
  type: TtsProviderType;
  /* tier。 */
  tier: TtsProviderTier;
  /* 协议版本号。 */
  pluginApiVersion: string;
  /* 是否允许缓存合成结果。owned/external 通常为 true；experimental 视情况。 */
  audioCacheAllowed: boolean;
  /* 单次合成超时（毫秒），由 env 注入。 */
  timeoutMs: number;
  /* 默认音色。 */
  defaultVoice: string;
}

/* 合成入参。 */
export interface TtsSynthesizeInput {
  /* 待合成文本。 */
  text: string;
  /* 音色；缺省时使用 manifest.defaultVoice。 */
  voice?: string;
  /* 语速，可选。1.0 为常速。 */
  speed?: number;
}

/* 合成结果：返回原始 buffer，由上层决定写入 audioStore 的 id 与生命周期。 */
export interface TtsSynthesizeResult {
  /* 合成后的音频 buffer。 */
  audio: Buffer;
  /* MIME 类型，例如 audio/mpeg。 */
  mime: string;
  /* 实际使用的音色。 */
  voice: string;
}

export interface TtsProvider {
  /* provider 自描述。 */
  manifest: TtsManifest;
  /* 是否运行时启用，registry 用它过滤未配置的 provider。 */
  isEnabled?: () => boolean;
  /* 合成接口；失败必须抛错由上层 chain 决定回退。 */
  synthesize: (input: TtsSynthesizeInput) => Promise<TtsSynthesizeResult>;
}
