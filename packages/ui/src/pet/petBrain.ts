/*
 * Claudio 伴侣状态机
 * ------------------
 * 只把生命状态和 presence 语气映射成角色目标动作，不处理绘制、手势或业务副作用。
 */

import type { PetBrainInput, PetCompanionState } from './petTypes';

/*
 * 推导伴侣当前动作。
 * 优先级固定：拖拽 > 说话 > 调频/看向用户 > 听歌 > 睡眠 > 待机。
 */
export function derivePetCompanionState(input: PetBrainInput): PetCompanionState {
  if (input.dragging) return 'drag';
  if (input.speaking || input.lifeState === 'speaking') return 'speak';
  if (input.thinking || input.lifeState === 'tuning' || input.lifeState === 'connecting') {
    return 'look';
  }
  if (input.listening || input.lifeState === 'listening') return 'listen';
  if (
    input.lifeState === 'sleeping' ||
    input.presenceTone === 'wind-down' ||
    input.presenceTone === 'offline'
  ) {
    return 'sleep';
  }
  if (input.presenceTone === 'soft-hold' || input.presenceTone === 'focus-flow') return 'look';
  return 'idle';
}
