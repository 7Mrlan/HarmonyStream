/*
 * 豆包 TTS provider 占位
 * ----------------------
 * Phase E v1 仅留接口骨架，实际不实现合成调用。
 *   - 保留 manifest 让 registry 可识别
 *   - isEnabled 始终返回 false（除非用户显式启用且填了凭据）
 *   - synthesize 抛 not-implemented，让 chain 跳过
 * Phase E 完成后单独立项再实现真实端到端语音对话。
 */

import type { TtsProvider } from '../types';
import { TTS_PROVIDER_API_VERSION } from '../types';

/*
 * 创建豆包 TTS provider 占位。
 * 入参为空字符串时 isEnabled 一定 false，避免 chain 把它选进去。
 */
export function createDoubaoTtsProvider(
  appId: string,
  accessToken: string,
  defaultVoice: string,
  timeoutMs: number,
): TtsProvider {
  const enabled = Boolean(appId.trim() && accessToken.trim());

  return {
    manifest: {
      id: 'doubao',
      name: 'Doubao TTS (placeholder)',
      version: '0.0.0',
      type: 'cloud',
      tier: 'experimental',
      pluginApiVersion: TTS_PROVIDER_API_VERSION,
      audioCacheAllowed: true,
      timeoutMs,
      defaultVoice,
    },
    isEnabled: () => enabled,
    synthesize: async () => {
      throw new Error('doubao tts provider not implemented yet');
    },
  };
}
