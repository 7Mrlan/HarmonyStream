import { describe, expect, it } from 'vitest';
import { derivePetCompanionState } from '../../../../packages/ui/src/pet/petBrain';
import type {
  PetBrainInput,
  PetCompanionState,
} from '../../../../packages/ui/src/pet/petTypes';

const BASE_INPUT: PetBrainInput = {
  lifeState: 'breathing',
  presenceTone: 'breathing',
  listening: false,
  speaking: false,
  thinking: false,
  dragging: false,
};

/* 测试工具：只覆盖目标字段，让状态优先级更清楚。 */
function petState(overrides: Partial<PetBrainInput>): PetCompanionState {
  return derivePetCompanionState({ ...BASE_INPUT, ...overrides });
}

describe('derivePetCompanionState', () => {
  it('拖拽压过所有状态', () => {
    expect(petState({ dragging: true, speaking: true, listening: true })).toBe('drag');
  });

  it('说话压过听歌', () => {
    expect(petState({ speaking: true, listening: true })).toBe('speak');
    expect(petState({ lifeState: 'speaking', listening: true })).toBe('speak');
  });

  it('调频和连接态看向用户', () => {
    expect(petState({ thinking: true })).toBe('look');
    expect(petState({ lifeState: 'connecting' })).toBe('look');
  });

  it('播放音乐时进入听歌状态', () => {
    expect(petState({ listening: true })).toBe('listen');
    expect(petState({ lifeState: 'listening' })).toBe('listen');
  });

  it('收尾和离线语气进入睡眠状态', () => {
    expect(petState({ presenceTone: 'wind-down' })).toBe('sleep');
    expect(petState({ presenceTone: 'offline' })).toBe('sleep');
  });

  it('陪伴和专注语气看向用户', () => {
    expect(petState({ presenceTone: 'soft-hold' })).toBe('look');
    expect(petState({ presenceTone: 'focus-flow' })).toBe('look');
  });
});
