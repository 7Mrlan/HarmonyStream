/*
 * Claudio 伴侣类型
 * ----------------
 * UI 包不理解移动端业务细节，只接收归一后的生命状态和 presence 语气。
 */

export type PetCompanionLifeState =
  | 'offline'
  | 'connecting'
  | 'tuning'
  | 'speaking'
  | 'listening'
  | 'sleeping'
  | 'breathing';

export type PetCompanionPresenceTone =
  | 'offline'
  | 'tuning'
  | 'soft-hold'
  | 'focus-flow'
  | 'celebration'
  | 'wind-down'
  | 'listening'
  | 'breathing';

export type PetCompanionState = 'idle' | 'look' | 'listen' | 'speak' | 'sleep' | 'drag';

export interface PetBrainInput {
  /* Claudio 生命状态。 */
  lifeState: PetCompanionLifeState;
  /* 当前展示语气。 */
  presenceTone: PetCompanionPresenceTone;
  /* 是否正在播放音乐。 */
  listening: boolean;
  /* 是否正在播放主播 TTS。 */
  speaking: boolean;
  /* 是否正在调频 / 等待。 */
  thinking: boolean;
  /* 是否正在拖拽。 */
  dragging: boolean;
}
