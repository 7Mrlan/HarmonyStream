import { describe, expect, it } from 'vitest';
import {
  applyPresenceToTurnPlan,
  createPresenceState,
  updatePresenceFromPlaybackMove,
  updatePresenceFromTurn,
  type DjSessionPresence,
} from './presenceEngine.js';
import type { DjTurnPlan } from '../personal/profileTypes.js';

/* 构造最小 DjTurnPlan，测试只覆盖 Presence Engine 关心的字段。 */
function turnPlan(overrides: Partial<DjTurnPlan>): DjTurnPlan {
  return {
    userText: '随便来点',
    intent: 'play',
    comfortMode: 'neutral',
    playlistShape: 'short-arc',
    targetCount: 3,
    energyCurve: 'low-stable',
    constraints: ['只讲本轮听感'],
    ...overrides,
  };
}

/* 构造带状态的 presence，方便断言连续性和播放移动反馈。 */
function presence(overrides: Partial<DjSessionPresence>): DjSessionPresence {
  return {
    ...createPresenceState(),
    ...overrides,
  };
}

describe('Presence Engine', () => {
  it('伤心陪伴会进入 soft-hold，并降低下一轮能量', () => {
    const next = updatePresenceFromTurn({
      current: createPresenceState(),
      turnPlan: turnPlan({
        userText: '我今天有点难过',
        intent: 'chat-and-play',
        comfortMode: 'sit-with-you',
        energyCurve: 'rise-gently',
      }),
    });

    expect(next.arc).toBe('soft-hold');
    expect(next.energyBias).toBe(-1);
    expect(next.talkativeness).toBe('warm');
    expect(next.recentSignals.join('\n')).toContain('接住');
  });

  it('开心共振会进入 celebration，并允许更亮的频段', () => {
    const next = updatePresenceFromTurn({
      current: createPresenceState(),
      turnPlan: turnPlan({
        userText: '今天好爽',
        comfortMode: 'celebrate',
        energyCurve: 'bright',
      }),
    });

    expect(next.arc).toBe('celebration');
    expect(next.energyBias).toBe(1);
    expect(next.talkativeness).toBe('host');
  });

  it('中性输入会短暂延续上一轮陪伴，再逐步回落', () => {
    const current = presence({
      arc: 'soft-hold',
      energyBias: -1,
      talkativeness: 'warm',
      turnsInArc: 1,
      recentSignals: ['用户需要先被接住，不突然推亮'],
    });
    const continued = updatePresenceFromTurn({
      current,
      turnPlan: turnPlan({ userText: '嗯，随便吧' }),
    });
    const decayed = updatePresenceFromTurn({
      current: continued,
      turnPlan: turnPlan({ userText: '再来点' }),
    });

    expect(continued.arc).toBe('soft-hold');
    expect(continued.energyBias).toBe(-1);
    expect(decayed.arc).toBe('fresh');
    expect(decayed.energyBias).toBe(0);
  });

  it('下一首和上一首会轻量降低下一轮能量', () => {
    const bright = presence({
      arc: 'celebration',
      energyBias: 1,
      talkativeness: 'host',
      turnsInArc: 1,
    });
    const skipped = updatePresenceFromPlaybackMove({ current: bright, cause: 'next' });
    const previous = updatePresenceFromPlaybackMove({ current: bright, cause: 'previous' });

    expect(skipped.energyBias).toBe(0);
    expect(skipped.talkativeness).toBe('warm');
    expect(previous.arc).toBe('soft-hold');
    expect(previous.energyBias).toBe(0);
  });

  it('fresh 状态下的下一首反馈也会被下一轮中性计划消费', () => {
    const skipped = updatePresenceFromPlaybackMove({
      current: createPresenceState(),
      cause: 'next',
    });
    const planned = applyPresenceToTurnPlan(turnPlan({}), skipped);

    expect(skipped.arc).toBe('fresh');
    expect(skipped.energyBias).toBe(-1);
    expect(planned.presenceApplied).toBe(true);
    expect(planned.constraints.join('\n')).toContain('下一轮能量先收一点');
  });

  it('presence 只影响计划约束和曲线，不直接生成固定歌曲', () => {
    const planned = applyPresenceToTurnPlan(
      turnPlan({
        comfortMode: 'neutral',
        energyCurve: 'low-stable',
      }),
      presence({
        arc: 'focus-flow',
        energyBias: -1,
        talkativeness: 'brief',
        turnsInArc: 1,
      }),
    );

    expect(planned.comfortMode).toBe('focus-with-you');
    expect(planned.energyCurve).toBe('deep-focus');
    expect(planned.constraints.join('\n')).toContain('延续专注状态');
    expect(planned.presenceApplied).toBe(true);
  });

  it('presence 不覆盖本轮明确开心输入', () => {
    const planned = applyPresenceToTurnPlan(
      turnPlan({
        userText: '今天好爽，想听点开心的',
        comfortMode: 'celebrate',
        energyCurve: 'bright',
      }),
      presence({
        arc: 'soft-hold',
        energyBias: -1,
        talkativeness: 'warm',
        turnsInArc: 1,
      }),
    );

    expect(planned.comfortMode).toBe('celebrate');
    expect(planned.energyCurve).toBe('bright');
    expect(planned.presenceApplied).toBeUndefined();
  });
});
