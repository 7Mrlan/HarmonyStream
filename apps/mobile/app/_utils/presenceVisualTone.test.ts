import { describe, expect, it } from 'vitest';
import {
  derivePresenceVisualTone,
  getPresenceToneVisualPatch,
  mapPresenceToneToSpectrumMode,
  type PresenceVisualToneInput,
} from './presenceVisualTone';

const BASE_INPUT: PresenceVisualToneInput = {
  lifeState: 'breathing',
  latestUserText: null,
  stationPaused: false,
  listening: false,
};

/* 测试工具：只覆盖本轮关心字段，保持视觉语气用例可读。 */
function tone(overrides: Partial<PresenceVisualToneInput>): ReturnType<typeof derivePresenceVisualTone> {
  return derivePresenceVisualTone({ ...BASE_INPUT, ...overrides });
}

describe('derivePresenceVisualTone', () => {
  it('offline 和 tuning 状态不被文本语气覆盖', () => {
    expect(tone({ lifeState: 'offline', latestUserText: '今天好爽' })).toBe('offline');
    expect(tone({ lifeState: 'tuning', latestUserText: '我有点难过' })).toBe('tuning');
  });

  it('伤心输入进入 soft-hold 展示语气', () => {
    expect(tone({ lifeState: 'listening', latestUserText: '我今天真的很难受' })).toBe(
      'soft-hold',
    );
  });

  it('专注和会议输入进入 focus-flow 展示语气', () => {
    expect(tone({ lifeState: 'listening', latestUserText: '刚开完会，想安静一点' })).toBe(
      'focus-flow',
    );
  });

  it('开心输入进入 celebration 展示语气', () => {
    expect(tone({ lifeState: 'listening', latestUserText: '今天好爽，想听点开心的' })).toBe(
      'celebration',
    );
  });

  it('暂停静息进入 wind-down 展示语气', () => {
    expect(tone({ lifeState: 'sleeping', stationPaused: true })).toBe('wind-down');
  });

  it('展示语气映射到频谱强度和文案 patch', () => {
    expect(mapPresenceToneToSpectrumMode('soft-hold', 'idle')).toBe('low');
    expect(mapPresenceToneToSpectrumMode('celebration', 'idle')).toBe('high');
    expect(getPresenceToneVisualPatch('focus-flow')).toMatchObject({
      onAirLabel: 'FOCUS',
      nowState: 'FOCUS',
    });
  });
});
