import { describe, expect, it } from 'vitest';
import {
  deriveClaudioLifeState,
  type ClaudioLifeState,
  type ClaudioLifeStateInput,
} from './claudioLifeState';

const BASE_INPUT: ClaudioLifeStateInput = {
  connectionState: 'connected',
  djLoading: false,
  chatSending: false,
  voiceSpeaking: false,
  musicDucked: false,
  listening: false,
  stationPaused: false,
  stationPlaying: false,
};

/* 测试工具：只覆盖本轮关心的字段，保持每个优先级用例可读。 */
function lifeState(overrides: Partial<ClaudioLifeStateInput>): ClaudioLifeState {
  return deriveClaudioLifeState({ ...BASE_INPUT, ...overrides });
}

describe('deriveClaudioLifeState', () => {
  it('offline 压过 tuning', () => {
    expect(lifeState({ connectionState: 'offline', djLoading: true })).toBe('offline');
  });

  it('connecting 压过 tuning', () => {
    expect(lifeState({ connectionState: 'connecting', chatSending: true })).toBe('connecting');
  });

  it('tuning 压过 speaking 和 listening', () => {
    expect(lifeState({ djLoading: true, voiceSpeaking: true, listening: true })).toBe('tuning');
  });

  it('speaking 压过 listening', () => {
    expect(lifeState({ voiceSpeaking: true, listening: true })).toBe('speaking');
    expect(lifeState({ musicDucked: true, listening: true })).toBe('speaking');
  });

  it('listening 压过 breathing', () => {
    expect(lifeState({ listening: true })).toBe('listening');
  });

  it('paused 且无活动进入 sleeping', () => {
    expect(lifeState({ stationPaused: true, stationPlaying: false })).toBe('sleeping');
  });

  it('在线空闲进入 breathing', () => {
    expect(lifeState({})).toBe('breathing');
  });
});
