/*
 * Claudio Presence 视觉语气
 * -------------------------
 * 移动端本地把最近输入和 Life State 合成展示语气，只驱动 UI 强度。
 * 它不代表服务端长期记忆，也不写入用户资料。
 */

import type { MusicSpectrumMode } from '@claudio/ui';
import type { ClaudioLifeState } from './claudioLifeState';

export type PresenceVisualTone =
  | 'offline'
  | 'tuning'
  | 'soft-hold'
  | 'focus-flow'
  | 'celebration'
  | 'wind-down'
  | 'listening'
  | 'breathing';

export interface PresenceVisualToneInput {
  /* HomeScreen 聚合出的 Claudio 生命状态。 */
  lifeState: ClaudioLifeState;
  /* 最近一条用户输入，只做本地即时视觉语气。 */
  latestUserText?: string | null;
  /* 用户是否把整站暂停。 */
  stationPaused: boolean;
  /* 音乐是否正在播放。 */
  listening: boolean;
}

/*
 * 推导移动端当前展示语气。
 * 连接 / 调频 / 睡眠优先级高于文本语气，避免 UI 在不可用状态还装作正在陪伴。
 */
export function derivePresenceVisualTone(input: PresenceVisualToneInput): PresenceVisualTone {
  if (input.lifeState === 'offline') return 'offline';
  if (input.lifeState === 'connecting' || input.lifeState === 'tuning') return 'tuning';
  if (input.lifeState === 'sleeping' || (input.stationPaused && !input.listening)) return 'wind-down';

  const textTone = readTextTone(input.latestUserText);
  if (textTone) return textTone;

  if (input.lifeState === 'listening' || input.listening) return 'listening';
  return 'breathing';
}

/*
 * 将展示语气映射成频谱强度。
 * UI 包不理解 PresenceVisualTone，只消费 MusicSpectrumMode。
 */
export function mapPresenceToneToSpectrumMode(
  tone: PresenceVisualTone,
  fallbackMode: MusicSpectrumMode,
): MusicSpectrumMode {
  if (tone === 'offline') return 'off';
  if (tone === 'tuning') return fallbackMode;
  if (tone === 'soft-hold') return 'low';
  if (tone === 'focus-flow') return 'low';
  if (tone === 'celebration') return 'high';
  if (tone === 'wind-down') return 'asleep';
  if (tone === 'listening') return 'high';
  return fallbackMode;
}

/*
 * Presence 视觉语气可以轻量覆盖 OnAir 和 NowPlaying 展示。
 * 这里只生成展示参数，不反向控制播放链路。
 */
export function getPresenceToneVisualPatch(
  tone: PresenceVisualTone,
): Partial<{
  onAirLabel: string;
  nowState: string;
  avatarColor: string;
}> {
  if (tone === 'soft-hold') {
    return {
      onAirLabel: 'SOFT',
      nowState: 'WITH YOU',
      avatarColor: '#101816',
    };
  }
  if (tone === 'focus-flow') {
    return {
      onAirLabel: 'FOCUS',
      nowState: 'FOCUS',
      avatarColor: '#07130f',
    };
  }
  if (tone === 'celebration') {
    return {
      onAirLabel: 'LIVE+',
      nowState: 'BRIGHT',
      avatarColor: '#10251b',
    };
  }
  if (tone === 'wind-down') {
    return {
      onAirLabel: 'LOW',
      nowState: 'WIND DOWN',
      avatarColor: '#080808',
    };
  }
  return {};
}

/* 从最近输入读取即时视觉语气，保持词表克制，避免普通闲聊乱变状态。 */
function readTextTone(text: string | null | undefined): PresenceVisualTone | null {
  const normalized = text?.trim().toLowerCase();
  if (!normalized) return null;
  if (/(?:难过|伤心|低落|崩溃|难受|不开心|emo|失落|撑不住)/u.test(normalized)) {
    return 'soft-hold';
  }
  if (/(?:专注|写代码|工作|学习|不抢|轻一点|安静|效率|会议|开会|会后|meeting)/u.test(normalized)) {
    return 'focus-flow';
  }
  if (/(?:开心|高兴|快乐|好爽|爽|太好了|兴奋|庆祝|赢了)/u.test(normalized)) {
    return 'celebration';
  }
  if (/(?:睡前|晚安|夜尾|深夜|收尾|放松|怀旧|老歌)/u.test(normalized)) {
    return 'wind-down';
  }
  return null;
}
