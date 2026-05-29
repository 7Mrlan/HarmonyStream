/*
 * Resident DJ 审查边界
 * --------------------
 * Critic 只负责输出安全审查和降级文案，不参与选歌，也不伪造播放结果。
 */

import type { ChatResponse, Track } from '@claudio/api';
import type { CriticReport, CuratedCandidate, DjTurnPlan, PersonalContext } from './profileTypes.js';

export interface ReviewDjHostResponseInput {
  /* 即将返回给用户的 ChatResponse。 */
  response: ChatResponse;
  /* 本轮 Resident DJ 规划，可选用于生成降级话术。 */
  turnPlan?: DjTurnPlan;
  /* 已解析出的真实可播放曲目。 */
  selectedTrack?: Track;
  /* 是否存在真实本机资料。 */
  hasUserData: boolean;
}

/*
 * 自动审查最终主播文案。
 * Critic 只检查输出风险，不改变播放队列；需要降级时由调用方替换 say。
 */
export function reviewDjHostResponse(input: ReviewDjHostResponseInput): CriticReport {
  const issues: string[] = [];
  const say = input.response.say.trim();

  if (/我(?:完全|最|真的)?懂你(?:的)?(?:所有|全部|一切)?(?:故事|经历|痛苦|快乐)/u.test(say)) {
    issues.push('假装完全理解用户经历');
  }
  if (/(?:一定|保证|肯定).{0,8}(?:治愈|治好|让你好起来|解决)/u.test(say)) {
    issues.push('承诺治疗或确定性疗效');
  }
  if (/(?:心理医生|心理咨询|诊断|处方|治疗方案)/u.test(say)) {
    issues.push('越界成心理咨询');
  }
  if (!input.hasUserData && /(?:你常|你平时|你的资料|你以前|你总是|你收藏)/u.test(say)) {
    issues.push('无资料时假装了解用户');
  }
  if (/(?:音源|接口|provider|API|JSON|模型)/iu.test(say)) {
    issues.push('泄露内部系统细节');
  }

  return {
    ok: issues.length === 0,
    issues,
    ...(issues.length > 0
      ? { safeSay: buildSafeSay(input.turnPlan, input.selectedTrack) }
      : {}),
  };
}

/*
 * 根据 Critic 结果降级文案。
 * 真实曲目已解析成功，所以只替换话术，不改 play 和队列。
 */
export function applyCriticReportToResponse(
  response: ChatResponse,
  report: CriticReport,
  selectedTrack: Track,
): ChatResponse {
  if (report.ok) return response;

  return {
    ...response,
    say: report.safeSay ?? buildSafeSay(undefined, selectedTrack),
    play: [selectedTrack.title],
    reason: `${response.reason ?? 'Resident DJ 已选出可播放曲目'}；Critic 降级：${report.issues.join('，')}`,
  };
}

/* Critic Agent 审查结构化计划。 */
export function reviewResidentDjPlan(
  turnPlan: DjTurnPlan,
  candidates: CuratedCandidate[],
  personalContext: PersonalContext,
): CriticReport {
  const issues: string[] = [];
  const titles = candidates.map((candidate) => normalizeText(candidate.title));

  if (candidates.length === 0 && personalContext.hasUserData) {
    issues.push('有用户资料但没有策展候选');
  }
  if (turnPlan.targetCount > 1 && new Set(titles).size < Math.min(2, titles.length)) {
    issues.push('候选过度重复，疑似固定映射');
  }
  if (candidates.some((candidate) => candidate.source !== 'from-user-library' && !candidate.reason)) {
    issues.push('非用户资料候选缺少来源说明');
  }

  return {
    ok: issues.length === 0,
    issues,
  };
}

/* 构造安全降级话术。 */
function buildSafeSay(turnPlan: DjTurnPlan | undefined, selectedTrack: Track | undefined): string {
  const title = selectedTrack?.title ? `《${selectedTrack.title}》` : '这首';
  if (turnPlan?.comfortMode === 'celebrate') {
    return `这个状态可以别压着，先放 ${title}。它负责把亮度打开，我就不在旁边说教了。`;
  }
  if (turnPlan?.comfortMode === 'sit-with-you' || turnPlan?.comfortMode === 'lift-gently') {
    return `听出来你现在不太想被硬劝好，先放 ${title}。它只陪你走一小段，不把话说满。`;
  }
  if (turnPlan?.comfortMode === 'focus-with-you') {
    return `先不抢你的注意力，${title} 接上。让它在旁边铺一层，别把人推着走。`;
  }
  return `那就先放 ${title}。我不把它讲满，先听开头怎么把这一段接住。`;
}

/* 归一化文本用于重复候选审查。 */
function normalizeText(value: string): string {
  return value.trim().toLowerCase();
}
