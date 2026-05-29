/*
 * Claudio Presence Engine
 * -----------------------
 * 维护进程内的会话氛围状态，让 Resident DJ 下一轮能记得“刚才这段电台在陪伴、专注或庆祝”。
 * 它不是长期用户画像，不写本地 profile，也不扩公开 API。
 */

import type { ComfortMode, DjTurnPlan, EnergyCurve } from '../personal/profileTypes.js';

export type PresenceArc = 'fresh' | 'soft-hold' | 'focus-flow' | 'celebration' | 'wind-down';

export type PresenceEnergyBias = -2 | -1 | 0 | 1 | 2;

export type PresenceTalkativeness = 'silent' | 'brief' | 'warm' | 'host';

export interface DjSessionPresence {
  /* 当前会话弧线，只描述这段电台正在什么状态里。 */
  arc: PresenceArc;
  /* 对下一轮歌单能量的轻量偏置，负数更收，正数更亮。 */
  energyBias: PresenceEnergyBias;
  /* 对下一轮主播说话尺度的轻量提示。 */
  talkativeness: PresenceTalkativeness;
  /* 最近状态变化信号，只用于内部 prompt / 测试，不写公开响应。 */
  recentSignals: string[];
  /* 当前 arc 已连续保持几轮，用于中性输入时缓慢衰减。 */
  turnsInArc: number;
}

export interface UpdatePresenceFromTurnInput {
  /* 当前会话 presence。 */
  current: DjSessionPresence;
  /* Resident DJ 本轮规划。 */
  turnPlan: DjTurnPlan;
}

export interface UpdatePresenceFromPlaybackMoveInput {
  /* 当前会话 presence。 */
  current: DjSessionPresence;
  /* 成功移动队列的原因。 */
  cause: 'next' | 'previous';
}

/*
 * 创建初始会话 presence。
 * 新进程或测试用例从 fresh 开始，不携带任何用户情绪假设。
 */
export function createPresenceState(): DjSessionPresence {
  return {
    arc: 'fresh',
    energyBias: 0,
    talkativeness: 'brief',
    recentSignals: [],
    turnsInArc: 0,
  };
}

/*
 * 根据本轮 Resident DJ 规划推进 presence。
 * 明确情绪输入直接设定 arc；中性输入只短暂延续上一轮，再逐步回到 fresh。
 */
export function updatePresenceFromTurn(input: UpdatePresenceFromTurnInput): DjSessionPresence {
  if (input.turnPlan.presenceApplied) {
    return withSignal(
      decayPresence(input.current),
      '中性输入由上一轮 presence 延续，本轮后继续回落',
      input.current,
    );
  }

  const next = derivePresenceFromTurnPlan(input.turnPlan);
  if (next) return withSignal(next, buildTurnSignal(input.turnPlan), input.current);

  if (input.current.arc === 'fresh') {
    return withSignal(createPresenceState(), '中性输入，保持默认呼吸态', input.current);
  }

  const decayed = decayPresence(input.current);
  return withSignal(decayed, '中性输入，延续上一轮氛围并轻微回落', input.current);
}

/*
 * 根据成功切歌反馈轻量调整 presence。
 * 下一首和上一首都不是长期偏好判断，只代表下一轮先收一点，避免继续硬推同一能量。
 */
export function updatePresenceFromPlaybackMove(
  input: UpdatePresenceFromPlaybackMoveInput,
): DjSessionPresence {
  const signal =
    input.cause === 'next'
      ? '用户切到下一首，下一轮减少同类强度'
      : '用户回到上一首，下一轮更稳一点';
  return withSignal(
    {
      ...input.current,
      arc: input.cause === 'previous' ? 'soft-hold' : input.current.arc,
      energyBias: clampEnergyBias(input.current.energyBias - 1),
      talkativeness: input.current.talkativeness === 'host' ? 'warm' : 'brief',
      turnsInArc: input.current.turnsInArc + 1,
    },
    signal,
    input.current,
  );
}

/*
 * 把 presence 作为 Resident DJ 的轻量证据应用到本轮计划。
 * 它只加约束和轻微曲线偏置，不覆盖明确情绪输入，不直接选歌。
 */
export function applyPresenceToTurnPlan(
  turnPlan: DjTurnPlan,
  presence: DjSessionPresence | undefined,
): DjTurnPlan {
  if (!presence || (presence.arc === 'fresh' && presence.energyBias === 0)) return turnPlan;
  if (turnPlan.comfortMode !== 'neutral') return turnPlan;

  const constraints = [...turnPlan.constraints, ...buildPresenceConstraints(presence)];

  return {
    ...turnPlan,
    comfortMode: applyPresenceComfortMode(turnPlan.comfortMode, presence),
    energyCurve: applyPresenceEnergyCurve(turnPlan.energyCurve, presence),
    constraints: dedupeStrings(constraints),
    presenceApplied: true,
  };
}

/*
 * 构造给 prompt 的简短 presence 说明。
 * 只陈述会话状态，不声称长期了解用户。
 */
export function buildPresencePromptLine(presence: DjSessionPresence | undefined): string | null {
  if (!presence || (presence.arc === 'fresh' && presence.energyBias === 0)) return null;
  return `Resident DJ Presence：arc=${presence.arc}，energyBias=${presence.energyBias}，talk=${presence.talkativeness}，signals=${presence.recentSignals.slice(0, 3).join(' / ') || 'none'}`;
}

/* 从明确的本轮计划生成新的 presence；中性输入返回 null 交给衰减逻辑处理。 */
function derivePresenceFromTurnPlan(turnPlan: DjTurnPlan): DjSessionPresence | null {
  if (turnPlan.comfortMode === 'celebrate' || turnPlan.energyCurve === 'bright') {
    return buildPresence('celebration', 1, 'host');
  }
  if (turnPlan.comfortMode === 'sit-with-you' || turnPlan.comfortMode === 'lift-gently') {
    return buildPresence('soft-hold', turnPlan.comfortMode === 'sit-with-you' ? -1 : 0, 'warm');
  }
  if (turnPlan.comfortMode === 'focus-with-you' || turnPlan.energyCurve === 'deep-focus') {
    return buildPresence('focus-flow', -1, 'brief');
  }
  if (turnPlan.comfortMode === 'nostalgia-soft' || turnPlan.energyCurve === 'wind-down') {
    return buildPresence('wind-down', -1, 'brief');
  }
  return null;
}

/* 构造 presence 对象。 */
function buildPresence(
  arc: PresenceArc,
  energyBias: PresenceEnergyBias,
  talkativeness: PresenceTalkativeness,
): DjSessionPresence {
  return {
    arc,
    energyBias,
    talkativeness,
    recentSignals: [],
    turnsInArc: 1,
  };
}

/* 为本轮计划生成一条可读信号。 */
function buildTurnSignal(turnPlan: DjTurnPlan): string {
  if (turnPlan.comfortMode === 'celebrate') return '用户进入明亮状态，保持开心共振';
  if (turnPlan.comfortMode === 'sit-with-you') return '用户需要先被接住，不突然推亮';
  if (turnPlan.comfortMode === 'lift-gently') return '用户需要轻轻抬一点，但不催促';
  if (turnPlan.comfortMode === 'focus-with-you') return '用户需要低刺激专注陪伴';
  if (turnPlan.comfortMode === 'nostalgia-soft') return '用户需要柔和收尾和怀旧感';
  return '中性输入，保持默认呼吸态';
}

/* 中性输入时让 presence 缓慢回落，避免上一轮状态永久粘住。 */
function decayPresence(current: DjSessionPresence): DjSessionPresence {
  if (current.turnsInArc >= 2) return createPresenceState();
  return {
    ...current,
    energyBias: current.energyBias > 0 ? 0 : current.energyBias,
    talkativeness: current.talkativeness === 'host' ? 'warm' : current.talkativeness,
    turnsInArc: current.turnsInArc + 1,
  };
}

/* presence 转成 Resident DJ 约束，而不是转成固定歌曲。 */
function buildPresenceConstraints(presence: DjSessionPresence): string[] {
  const constraints: string[] = [];
  if (presence.arc === 'soft-hold') constraints.push('延续上一轮陪伴，不突然变亮');
  if (presence.arc === 'focus-flow') constraints.push('延续专注状态，低刺激，少说话');
  if (presence.arc === 'celebration') constraints.push('延续明亮状态，可以更有主持感');
  if (presence.arc === 'wind-down') constraints.push('降低能量，留出收尾空间');
  if (presence.energyBias < 0) constraints.push('下一轮能量先收一点');
  if (presence.energyBias > 0) constraints.push('下一轮可以稍微更亮');
  if (presence.talkativeness === 'silent') constraints.push('尽量少说话');
  if (presence.talkativeness === 'host') constraints.push('文案可以更像电台主持');
  return constraints;
}

/* 中性计划遇到上一轮 presence 时，给出有限的 comfort continuity。 */
function applyPresenceComfortMode(
  comfortMode: ComfortMode,
  presence: DjSessionPresence,
): ComfortMode {
  if (comfortMode !== 'neutral') return comfortMode;
  if (presence.arc === 'soft-hold') return 'lift-gently';
  if (presence.arc === 'focus-flow') return 'focus-with-you';
  if (presence.arc === 'celebration') return 'celebrate';
  return comfortMode;
}

/* presence 只轻微调整能量曲线，避免抢过本轮用户输入。 */
function applyPresenceEnergyCurve(
  energyCurve: EnergyCurve,
  presence: DjSessionPresence,
): EnergyCurve {
  if (presence.arc === 'focus-flow') return 'deep-focus';
  if (presence.arc === 'wind-down') return 'wind-down';
  if (presence.arc === 'soft-hold' && energyCurve === 'bright') return 'rise-gently';
  if (presence.energyBias < 0 && energyCurve === 'bright') return 'rise-gently';
  if (presence.energyBias < 0 && energyCurve === 'low-stable') return 'low-stable';
  if (presence.energyBias > 0 && energyCurve === 'low-stable') return 'rise-gently';
  return energyCurve;
}

/* 写入最近信号并保留短历史。 */
function withSignal(
  next: DjSessionPresence,
  signal: string,
  current: DjSessionPresence,
): DjSessionPresence {
  return {
    ...next,
    recentSignals: dedupeStrings([signal, ...current.recentSignals]).slice(0, 6),
  };
}

/* 收敛 energy bias 到允许范围。 */
function clampEnergyBias(value: number): PresenceEnergyBias {
  if (value <= -2) return -2;
  if (value === -1) return -1;
  if (value === 1) return 1;
  if (value >= 2) return 2;
  return 0;
}

/* 字符串去重，保持输入顺序。 */
function dedupeStrings(values: string[]): string[] {
  const result: string[] = [];
  for (const value of values) {
    const trimmed = value.trim();
    if (!trimmed || result.includes(trimmed)) continue;
    result.push(trimmed);
  }
  return result;
}
