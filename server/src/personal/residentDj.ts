/*
 * Resident DJ 智能体编排
 * ---------------------
 * Phase L.1 把“个人资料命中即固定点歌”降级为证据，先规划本轮陪伴和歌单曲线，
 * 再把策展候选交给真实音乐源解析。
 */

import type { ChatResponse, Track } from '@claudio/api';
import type { MusicSearchSeed } from '../music/types.js';
import type { MusicRequestKind } from '../radio/intentParser.js';
import type {
  ComfortMode,
  CriticReport,
  CuratedCandidate,
  CuratedCandidateSlot,
  DjTurnPlan,
  EnergyCurve,
  MemoryEvidence,
  MusicLibrarySection,
  MusicLibraryTrack,
  PersonalCandidate,
  PersonalContext,
  PlaylistShape,
  ResidentDjAgentTiming,
  ResidentDjPlan,
  ResidentIntent,
} from './profileTypes.js';

export interface BuildResidentDjPlanInput {
  /* 用户原始输入。 */
  userText: string;
  /* Context Assembler 产出的本轮个人上下文。 */
  personalContext: PersonalContext;
  /* 本地意图解析出的请求粒度。 */
  requestKind: MusicRequestKind;
}

export interface BuildResidentDjPlanAsyncInput extends BuildResidentDjPlanInput {
  /* 测试可注入 agent，生产默认使用本文件内置实现。 */
  agents?: ResidentDjAgentOverrides;
  /* 测试可注入时钟，便于断言 timing。 */
  nowMs?: () => number;
}

export interface ResidentDjAgentOverrides {
  memoryLibrarian?: (input: ResidentDjAgentInput) => ScoredSection[] | Promise<ScoredSection[]>;
  moodCompanion?: (input: ResidentDjAgentInput) => MemoryEvidence[] | Promise<MemoryEvidence[]>;
  libraryInsightReader?: (input: ResidentDjAgentInput) => MemoryEvidence[] | Promise<MemoryEvidence[]>;
  recentBehaviorAnalyzer?: (input: ResidentDjAgentInput) => MemoryEvidence[] | Promise<MemoryEvidence[]>;
}

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

interface MoodSignal {
  comfortMode: ComfortMode;
  energyCurve: EnergyCurve;
  constraints: string[];
}

export interface ScoredSection {
  section: MusicLibrarySection;
  score: number;
  reason: string;
}

interface ScoredTrack {
  title: string;
  artist?: string;
  score: number;
  reason: string;
  sectionName?: string;
  source: CuratedCandidate['source'];
}

interface ResidentDjAgentInput {
  personalContext: PersonalContext;
  turnPlan: DjTurnPlan;
  moodSignal: MoodSignal;
}

interface ResidentDjAgentResult<T> {
  value: T;
  timing: ResidentDjAgentTiming;
}

const SAD_WORDS = ['难过', '伤心', '低落', '崩溃', '难受', '不开心', 'emo', '失落', '撑不住'];
const HAPPY_WORDS = ['开心', '高兴', '快乐', '好爽', '爽', '太好了', '兴奋', '庆祝', '赢了'];
const FOCUS_WORDS = ['专注', '写代码', '工作', '学习', '不抢', '轻一点', '安静', '效率'];
const MEETING_WORDS = ['会议', '开会', '会后', '刚开完会', 'meeting', '累'];
const NOSTALGIA_WORDS = ['怀旧', '老歌', '以前', '回忆', '旧歌', '经典'];

/*
 * 构建 Resident DJ 本轮计划。
 * 这里模拟固定顺序的内置智能体：设计总监、记忆馆员、情绪陪伴、歌单策展、音乐 scout、审查。
 */
export function buildResidentDjPlan(input: BuildResidentDjPlanInput): ResidentDjPlan {
  const moodSignal = readMoodSignal(input.userText);
  const turnPlan = buildTurnPlan(input, moodSignal);
  const sectionEvidence = rankLibrarySections(input.personalContext, turnPlan);
  const evidence = collectMemoryEvidence(input.personalContext, sectionEvidence, turnPlan);
  const curatedCandidates = curateCandidates(input.personalContext, turnPlan, sectionEvidence);
  const critic = reviewResidentDjPlan(turnPlan, curatedCandidates, input.personalContext);

  return {
    turnPlan,
    evidence,
    curatedCandidates,
    critic,
    promptLines: buildResidentPromptLines(turnPlan, evidence, curatedCandidates, critic),
  };
}

/*
 * 异步 Resident DJ 编排器。
 * Design Director 先定方向；轻量辅助 agent 并行产出证据，任何单路失败都降级而不阻塞播放。
 */
export async function buildResidentDjPlanAsync(
  input: BuildResidentDjPlanAsyncInput,
): Promise<ResidentDjPlan> {
  const nowMs = input.nowMs ?? Date.now;
  const designStartedAt = nowMs();
  const moodSignal = readMoodSignal(input.userText);
  const turnPlan = buildTurnPlan(input, moodSignal);
  const timings: ResidentDjAgentTiming[] = [
    {
      agent: 'design-director',
      ok: true,
      elapsedMs: Math.max(0, nowMs() - designStartedAt),
    },
  ];
  const agentInput: ResidentDjAgentInput = {
    personalContext: input.personalContext,
    turnPlan,
    moodSignal,
  };

  const [sections, moodEvidence, insightEvidence, recentEvidence] = await Promise.all([
    runResidentAgent(
      'memory-librarian',
      () => input.agents?.memoryLibrarian?.(agentInput) ?? rankLibrarySections(input.personalContext, turnPlan),
      [],
      nowMs,
    ),
    runResidentAgent(
      'mood-companion',
      () => input.agents?.moodCompanion?.(agentInput) ?? buildMoodEvidence(moodSignal, turnPlan),
      [],
      nowMs,
    ),
    runResidentAgent(
      'library-insight-reader',
      () => input.agents?.libraryInsightReader?.(agentInput) ?? buildInsightEvidence(input.personalContext),
      [],
      nowMs,
    ),
    runResidentAgent(
      'recent-behavior-analyst',
      () => input.agents?.recentBehaviorAnalyzer?.(agentInput) ?? buildRecentBehaviorEvidence(input.personalContext),
      [],
      nowMs,
    ),
  ]);

  timings.push(
    sections.timing,
    moodEvidence.timing,
    insightEvidence.timing,
    recentEvidence.timing,
  );
  const fallbackReasons = timings
    .filter((timing) => !timing.ok && timing.reason)
    .map((timing) => `${timing.agent}: ${timing.reason}`);
  const evidence = sortEvidence([
    ...buildSectionEvidence(sections.value),
    ...buildTasteEvidence(input.personalContext),
    ...moodEvidence.value,
    ...insightEvidence.value,
    ...recentEvidence.value,
    ...buildLegacyCandidateEvidence(input.personalContext, turnPlan),
  ]);
  const curatedCandidates = curateCandidates(input.personalContext, turnPlan, sections.value);
  const critic = reviewResidentDjPlan(turnPlan, curatedCandidates, input.personalContext);

  return {
    turnPlan,
    evidence,
    curatedCandidates,
    critic,
    promptLines: buildResidentPromptLines(turnPlan, evidence, curatedCandidates, critic),
    diagnostics: {
      timings,
      fallbackReasons,
    },
  };
}

/*
 * 把 Resident DJ 的结构化计划附加到个人上下文。
 * 不改 preferredTitles，避免再次让旧字段成为主决策入口。
 */
export function attachResidentDjPlanToPersonalContext(
  personalContext: PersonalContext,
  plan: ResidentDjPlan,
): PersonalContext {
  return {
    ...personalContext,
    promptLines: [...personalContext.promptLines, ...plan.promptLines],
  };
}

/* 把策展候选转换成音乐解析 seed。 */
export function curatedCandidatesToSeeds(candidates: CuratedCandidate[]): MusicSearchSeed[] {
  return candidates.map((candidate) => ({
    title: candidate.title,
    ...(candidate.artist ? { artist: candidate.artist } : {}),
  }));
}

/* 把策展候选转换成 preferredTitles。 */
export function curatedCandidatesToTitles(candidates: CuratedCandidate[]): string[] {
  return dedupeStrings(candidates.map((candidate) => candidate.title)).slice(0, 12);
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

/*
 * Design Director Agent。
 * 只决定本轮策略，不直接选最终播放歌曲。
 */
function buildTurnPlan(input: BuildResidentDjPlanInput, moodSignal: MoodSignal): DjTurnPlan {
  const userText = input.userText.trim();
  const intent = detectResidentIntent(userText, moodSignal);
  const targetCount = chooseTargetCount(userText, input.requestKind, intent);
  const playlistShape = choosePlaylistShape(targetCount);

  return {
    userText,
    intent,
    comfortMode: moodSignal.comfortMode,
    playlistShape,
    targetCount,
    energyCurve: moodSignal.energyCurve,
    constraints: dedupeStrings(moodSignal.constraints),
  };
}

/*
 * Mood Companion Agent。
 * 识别陪伴尺度和曲线，保持“能陪但不装治疗师”的边界。
 */
function readMoodSignal(userText: string): MoodSignal {
  const text = normalizeText(userText);
  if (containsAny(text, HAPPY_WORDS)) {
    return {
      comfortMode: 'celebrate',
      energyCurve: 'bright',
      constraints: ['可以一起开心', '不要说教', '不要压低情绪'],
    };
  }
  if (containsAny(text, SAD_WORDS)) {
    return {
      comfortMode: text.includes('振作') || text.includes('好起来') ? 'lift-gently' : 'sit-with-you',
      energyCurve: 'rise-gently',
      constraints: ['先接住情绪', '不承诺治愈', '不写鸡汤', '播放不能被深聊阻塞'],
    };
  }
  if (containsAny(text, FOCUS_WORDS) || containsAny(text, MEETING_WORDS)) {
    return {
      comfortMode: 'focus-with-you',
      energyCurve: containsAny(text, MEETING_WORDS) ? 'low-stable' : 'deep-focus',
      constraints: ['低刺激', '不抢注意力', '少说话'],
    };
  }
  if (containsAny(text, NOSTALGIA_WORDS)) {
    return {
      comfortMode: 'nostalgia-soft',
      energyCurve: 'wind-down',
      constraints: ['怀旧但不煽情', '不要编用户故事'],
    };
  }
  return {
    comfortMode: 'neutral',
    energyCurve: 'low-stable',
    constraints: ['只讲本轮听感', '不要假装懂用户'],
  };
}

/* 判断本轮 Resident DJ 意图。 */
function detectResidentIntent(userText: string, moodSignal: MoodSignal): ResidentIntent {
  const text = normalizeText(userText);
  if (/(?:导入|歌单模板|simple-playlists|qq_songs|资料怎么写)/iu.test(text)) return 'import-help';
  if (/(?:以后|下次|别再|不要再|多放|少放|喜欢这首|不喜欢|收藏|跳过)/u.test(text)) {
    return 'feedback';
  }
  if (/(?:换|调整|太吵|太亮|太悲|太慢|轻一点|亮一点)/u.test(text)) return 'adjust';
  if (moodSignal.comfortMode === 'sit-with-you' || moodSignal.comfortMode === 'lift-gently') {
    return 'chat-and-play';
  }
  return 'play';
}

/* 决定本轮需要几首候选。 */
function chooseTargetCount(
  userText: string,
  requestKind: MusicRequestKind,
  intent: ResidentIntent,
): 1 | 3 | 5 {
  const text = normalizeText(userText);
  if (requestKind === 'multi' || /(?:一组|歌单|几首|多来|多放|多推荐)/u.test(text)) return 5;
  if (/(?:一首|这首|单曲)/u.test(text) && intent !== 'chat-and-play') return 1;
  return 3;
}

/* 决定歌单形态。 */
function choosePlaylistShape(targetCount: 1 | 3 | 5): PlaylistShape {
  if (targetCount === 1) return 'single';
  if (targetCount === 5) return 'set';
  return 'short-arc';
}

/*
 * Memory Librarian Agent。
 * 把本地歌单分组、时段和文本语义转成证据分数，不写主播文案。
 */
function rankLibrarySections(
  personalContext: PersonalContext,
  turnPlan: DjTurnPlan,
): ScoredSection[] {
  return personalContext.librarySections
    .map((section) => scoreLibrarySection(section, personalContext, turnPlan))
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score || left.section.name.localeCompare(right.section.name));
}

/* 给一个简单歌单分组打分。 */
function scoreLibrarySection(
  section: MusicLibrarySection,
  personalContext: PersonalContext,
  turnPlan: DjTurnPlan,
): ScoredSection {
  const text = normalizeText(turnPlan.userText);
  const sectionText = normalizeText(`${section.name} ${section.description ?? ''} ${section.inferredTags.join(' ')}`);
  const reasons: string[] = [];
  let score = 0;

  if (sectionText && text.includes(section.name.toLowerCase())) {
    score += 10;
    reasons.push('用户直接提到分组名');
  }
  if (personalContext.environment.timeSlot === 'morning' && hasSectionSignal(section, ['清晨', '上午'])) {
    score += 7;
    reasons.push('当前是上午，分组名是强信号');
  }
  if (personalContext.environment.timeSlot === 'late-night' && hasSectionSignal(section, ['深夜', '夜尾'])) {
    score += 6;
    reasons.push('当前接近夜尾');
  }
  if (containsAny(text, MEETING_WORDS) && hasSectionSignal(section, ['会议间', '会议'])) {
    score += 9;
    reasons.push('用户提到会议后的疲惫');
  }
  if (containsAny(text, FOCUS_WORDS) && hasSectionSignal(section, ['专注', '低刺激'])) {
    score += 5;
    reasons.push('用户需要不抢注意力');
  }
  if (turnPlan.comfortMode === 'celebrate' && hasSectionSignal(section, ['开心', '运动'])) {
    score += 5;
    reasons.push('适合开心共振');
  }
  if (
    (turnPlan.comfortMode === 'sit-with-you' || turnPlan.comfortMode === 'lift-gently') &&
    hasSectionSignal(section, ['低刺激', '深夜', '夜尾', '怀旧'])
  ) {
    score += 5;
    reasons.push('适合先陪住情绪');
  }
  if (turnPlan.comfortMode === 'nostalgia-soft' && hasSectionSignal(section, ['怀旧', '经典', '老歌'])) {
    score += 5;
    reasons.push('适合轻怀旧');
  }
  if (/(?:随便|来点|听点)/u.test(text) && section.inferredTags.length > 0) {
    score += 1;
    reasons.push('泛推荐时参考用户已有分组');
  }
  if (score === 0 && personalContext.hasUserData) {
    score = 1;
    reasons.push('来自用户导入歌单');
  }

  return {
    section,
    score,
    reason: reasons.join('；') || '来自用户导入歌单',
  };
}

/* 收集可解释证据。 */
function collectMemoryEvidence(
  personalContext: PersonalContext,
  rankedSections: ScoredSection[],
  turnPlan: DjTurnPlan,
): MemoryEvidence[] {
  return sortEvidence([
    ...buildSectionEvidence(rankedSections),
    ...buildTasteEvidence(personalContext),
    ...buildInsightEvidence(personalContext),
    ...buildRecentBehaviorEvidence(personalContext),
    ...buildLegacyCandidateEvidence(personalContext, turnPlan),
  ]);
}

/* 把分组打分转换成证据。 */
function buildSectionEvidence(rankedSections: ScoredSection[]): MemoryEvidence[] {
  return rankedSections.slice(0, 4).map((item) => ({
    type: 'section',
    label: item.section.name,
    score: item.score,
    reason: item.reason,
  }));
}

/* 构造口味摘要证据。 */
function buildTasteEvidence(personalContext: PersonalContext): MemoryEvidence[] {
  if (personalContext.tasteSummary) {
    return [{
      type: 'taste',
      label: '口味摘要',
      score: 2,
      reason: personalContext.tasteSummary.slice(0, 80),
    }];
  }
  return [];
}

/* Mood Companion 输出陪伴尺度证据。 */
function buildMoodEvidence(moodSignal: MoodSignal, turnPlan: DjTurnPlan): MemoryEvidence[] {
  return [{
    type: 'mood',
    label: turnPlan.comfortMode,
    score: 3,
    reason: `comfort=${moodSignal.comfortMode}，curve=${moodSignal.energyCurve}`,
  }];
}

/* Library Insight Reader 输出洞察和长期记忆证据。 */
function buildInsightEvidence(personalContext: PersonalContext): MemoryEvidence[] {
  const evidence: MemoryEvidence[] = [];
  for (const insight of personalContext.libraryInsights.slice(0, 3)) {
    evidence.push({
      type: 'insight',
      label: insight.id,
      score: 3 + insight.confidence,
      reason: insight.summary,
    });
  }
  for (const memory of personalContext.djMemory.slice(0, 3)) {
    evidence.push({
      type: 'memory',
      label: memory.id,
      score: 4 + memory.confidence,
      reason: memory.summary,
    });
  }
  return evidence;
}

/* Recent Behavior Analyst 输出最近播放和用户行为证据。 */
function buildRecentBehaviorEvidence(personalContext: PersonalContext): MemoryEvidence[] {
  const evidence: MemoryEvidence[] = [];
  if (personalContext.recentTracks.length > 0) {
    evidence.push({
      type: 'recent',
      label: '最近播放',
      score: 2,
      reason: personalContext.recentTracks.slice(0, 3).map(formatTrack).join('、'),
    });
  }
  for (const event of personalContext.listeningEvents.slice(-5)) {
    evidence.push({
      type: 'event',
      label: event.id,
      score: event.type === 'feedback' ? 6 : 3,
      reason: formatListeningEvent(event),
    });
  }
  return evidence;
}

/* 从旧个人候选池收集兼容证据。 */
function buildLegacyCandidateEvidence(
  personalContext: PersonalContext,
  turnPlan: DjTurnPlan,
): MemoryEvidence[] {
  const evidence: MemoryEvidence[] = [];
  for (const candidate of personalContext.candidates.slice(0, 3)) {
    evidence.push({
      type: 'track',
      label: candidate.track.title,
      score: candidate.score,
      reason: candidate.reasons.join('；') || `可作为 ${turnPlan.comfortMode} 的个人候选证据`,
    });
  }
  return evidence;
}

/* 按证据分排序并裁剪。 */
function sortEvidence(evidence: MemoryEvidence[]): MemoryEvidence[] {
  return evidence.sort((left, right) => right.score - left.score).slice(0, 8);
}

/* 运行一个 Resident DJ agent，失败时回退默认值并记录 timing。 */
async function runResidentAgent<T>(
  agent: string,
  task: () => T | Promise<T>,
  fallbackValue: T,
  nowMs: () => number,
): Promise<ResidentDjAgentResult<T>> {
  const startedAt = nowMs();
  try {
    const value = await task();
    return {
      value,
      timing: {
        agent,
        ok: true,
        elapsedMs: Math.max(0, nowMs() - startedAt),
      },
    };
  } catch (error) {
    const reason = error instanceof Error ? error.message : '未知错误';
    return {
      value: fallbackValue,
      timing: {
        agent,
        ok: false,
        elapsedMs: Math.max(0, nowMs() - startedAt),
        reason,
      },
    };
  }
}

/*
 * Playlist Curator + Music Scout。
 * 先决定歌单流动，再把分组歌曲转换成可搜索候选；最近听过的歌会降优先级。
 */
function curateCandidates(
  personalContext: PersonalContext,
  turnPlan: DjTurnPlan,
  rankedSections: ScoredSection[],
): CuratedCandidate[] {
  const scoredTracks = [
    ...buildSectionTrackCandidates(personalContext, turnPlan, rankedSections),
    ...buildLegacyTrackCandidates(personalContext),
  ];
  const deduped = dedupeScoredTracks(scoredTracks);
  const recentTitles = new Set(personalContext.recentTracks.map((track) => normalizeText(track.title)));
  const fresh = deduped.filter((track) => !recentTitles.has(normalizeText(track.title)));
  const pool = fresh.length >= turnPlan.targetCount ? fresh : deduped;
  const selected = pool.slice(0, turnPlan.targetCount);
  const slots = buildSlotSequence(turnPlan);

  return selected.map((track, index) => ({
    title: track.title,
    ...(track.artist ? { artist: track.artist } : {}),
    source: track.source,
    reason: buildCandidateReason(track, turnPlan, slots[index] ?? 'hold'),
    slot: slots[index] ?? 'hold',
  }));
}

/* 从简单歌单分组生成候选。 */
function buildSectionTrackCandidates(
  personalContext: PersonalContext,
  turnPlan: DjTurnPlan,
  rankedSections: ScoredSection[],
): ScoredTrack[] {
  const seed = stableHash(
    `${turnPlan.userText}:${personalContext.environment.hour}:${personalContext.recentTracks
      .map((track) => track.title)
      .join('|')}`,
  );
  const sections = rankedSections.length > 0
    ? rankedSections
    : personalContext.librarySections.map((section) => ({
        section,
        score: 1,
        reason: '来自用户导入歌单',
      }));

  return sections.flatMap((item, sectionIndex) => {
    const rotatedTracks = rotateItems(item.section.tracks, seed + sectionIndex);
    return rotatedTracks.map((track, trackIndex) => ({
      title: track.title,
      ...(track.artist ? { artist: track.artist } : {}),
      score:
        item.score +
        scoreTrackForPlan(track, turnPlan) +
        scoreTrackByEvents(track.title, track.artist, personalContext) -
        trackIndex * 0.02,
      reason: `${item.section.name}：${item.reason}`,
      sectionName: item.section.name,
      source: 'from-user-library' as const,
    }));
  });
}

/* 从旧个人候选池补充候选，只作为证据层的后备。 */
function buildLegacyTrackCandidates(personalContext: PersonalContext): ScoredTrack[] {
  return personalContext.candidates.map((candidate) => ({
    title: candidate.track.title,
    ...(candidate.track.artist ? { artist: candidate.track.artist } : {}),
    score:
      candidate.score * 0.8 +
      scoreTrackByEvents(candidate.track.title, candidate.track.artist, personalContext),
    reason: formatLegacyCandidateReason(candidate),
    ...(candidate.track.source ? { sectionName: candidate.track.source } : {}),
    source: 'from-user-library',
  }));
}

/* 根据播放、跳过、收藏和反馈事件调整单曲信任分。 */
function scoreTrackByEvents(
  title: string,
  artist: string | undefined,
  personalContext: PersonalContext,
): number {
  let score = 0;
  for (const event of personalContext.listeningEvents) {
    if (!isEventAboutTrack(event.title, event.artist, title, artist, event.text)) continue;
    if (event.type === 'favorite' || event.type === 'repeat') score += 4;
    if (event.type === 'play') score += 1.5;
    if (event.type === 'feedback') score += scoreFeedbackText(event.text);
    if (event.type === 'skip' || event.type === 'previous') score -= 6;
  }
  return score;
}

/* 判断听歌事件是否关联到某首候选。 */
function isEventAboutTrack(
  eventTitle: string | undefined,
  eventArtist: string | undefined,
  title: string,
  artist: string | undefined,
  text: string | undefined,
): boolean {
  const normalizedTitle = normalizeText(title);
  const titleMatched = eventTitle ? normalizeText(eventTitle) === normalizedTitle : false;
  const artistMatched = artist && eventArtist ? normalizeText(eventArtist) === normalizeText(artist) : true;
  const textMatched = text ? normalizeText(text).includes(normalizedTitle) : false;
  return (titleMatched && artistMatched) || textMatched;
}

/* 用户一句话反馈优先级最高，这里只做轻量正负向解析。 */
function scoreFeedbackText(text: string | undefined): number {
  if (!text) return 0;
  const normalized = normalizeText(text);
  if (/(?:别再|不要|不喜欢|太吵|苦情|跳过)/u.test(normalized)) return -8;
  if (/(?:喜欢|多放|收藏|以后|适合|常放)/u.test(normalized)) return 6;
  return 2;
}

/* 根据本轮计划给单曲轻量加分。 */
function scoreTrackForPlan(track: MusicLibraryTrack, turnPlan: DjTurnPlan): number {
  if (turnPlan.comfortMode === 'celebrate' && hasAnyTag(track.inferredTags, ['开心', '运动'])) return 2;
  if (turnPlan.comfortMode === 'focus-with-you' && hasAnyTag(track.inferredTags, ['低刺激', '专注'])) return 2;
  if (
    (turnPlan.comfortMode === 'sit-with-you' || turnPlan.comfortMode === 'lift-gently') &&
    hasAnyTag(track.inferredTags, ['低刺激', '深夜', '怀旧'])
  ) {
    return 2;
  }
  return 0;
}

/* 为歌单曲线安排 open / hold / lift / close。 */
function buildSlotSequence(turnPlan: DjTurnPlan): CuratedCandidateSlot[] {
  if (turnPlan.playlistShape === 'single') return ['open'];
  if (turnPlan.energyCurve === 'wind-down') return ['open', 'hold', 'close', 'hold', 'close'];
  if (turnPlan.energyCurve === 'rise-gently') return ['open', 'hold', 'lift', 'lift', 'close'];
  if (turnPlan.energyCurve === 'bright') return ['open', 'lift', 'hold', 'lift', 'close'];
  return ['open', 'hold', 'hold', 'lift', 'close'];
}

/* 生成候选理由。 */
function buildCandidateReason(
  track: ScoredTrack,
  turnPlan: DjTurnPlan,
  slot: CuratedCandidateSlot,
): string {
  const section = track.sectionName ? `来自「${track.sectionName}」` : '来自个人候选池';
  const slotText = describeSlot(slot, turnPlan.energyCurve);
  return `${section}，${slotText}。${track.reason}`;
}

/* 描述候选在歌单里的位置。 */
function describeSlot(slot: CuratedCandidateSlot, curve: EnergyCurve): string {
  if (slot === 'open') return curve === 'bright' ? '先把节奏打开' : '先把人接住';
  if (slot === 'lift') return '轻轻往上抬一点';
  if (slot === 'close') return '最后收稳一点';
  return '中段保持这一段状态';
}

/* Critic Agent 审查结构化计划。 */
function reviewResidentDjPlan(
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

/* 构造传给 prompt 的 Resident DJ 压缩上下文。 */
function buildResidentPromptLines(
  turnPlan: DjTurnPlan,
  evidence: MemoryEvidence[],
  candidates: CuratedCandidate[],
  critic: CriticReport,
): string[] {
  const candidateLine =
    candidates.length > 0
      ? candidates
          .map((candidate) =>
            `${candidate.title}${candidate.artist ? ` / ${candidate.artist}` : ''}（${candidate.slot}，${candidate.source}）`,
          )
          .join('；')
      : '无策展候选，交给 LLM 意图或公共解析兜底';

  return [
    `Resident DJ 计划：intent=${turnPlan.intent}，comfort=${turnPlan.comfortMode}，shape=${turnPlan.playlistShape}，target=${turnPlan.targetCount}，curve=${turnPlan.energyCurve}`,
    `Resident DJ 约束：${turnPlan.constraints.join('；') || '无额外约束'}`,
    `Resident DJ 证据：${evidence
      .slice(0, 4)
      .map((item) => `${item.label}（${item.reason}）`)
      .join('；') || '暂无个人证据'}`,
    `Resident DJ 策展候选：${candidateLine}`,
    `Resident DJ 审查：${critic.ok ? '通过' : critic.issues.join('；')}`,
  ];
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

/* 分组是否带有某类语义信号。 */
function hasSectionSignal(section: MusicLibrarySection, signals: string[]): boolean {
  const text = normalizeText(`${section.name} ${section.description ?? ''} ${section.inferredTags.join(' ')}`);
  return signals.some((signal) => text.includes(normalizeText(signal)));
}

/* 判断标签集合是否包含任一目标标签。 */
function hasAnyTag(tags: string[], values: string[]): boolean {
  const normalized = tags.map(normalizeText);
  return values.some((value) => normalized.includes(normalizeText(value)));
}

/* 去重并排序候选曲。 */
function dedupeScoredTracks(tracks: ScoredTrack[]): ScoredTrack[] {
  const byKey = new Map<string, ScoredTrack>();
  for (const track of tracks) {
    const key = `${normalizeText(track.title)}::${normalizeText(track.artist ?? '')}`;
    const existing = byKey.get(key);
    if (!existing || track.score > existing.score) {
      byKey.set(key, track);
    }
  }
  return [...byKey.values()].sort((left, right) => right.score - left.score || left.title.localeCompare(right.title));
}

/* 稳定轮转数组，避免同一句情绪永远落到同一首。 */
function rotateItems<T>(items: T[], seed: number): T[] {
  if (items.length <= 1) return [...items];
  const offset = Math.abs(seed) % items.length;
  return [...items.slice(offset), ...items.slice(0, offset)];
}

/* 稳定 hash，用时间段、最近播放和输入让策展结果可预测但不死板。 */
function stableHash(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash;
}

/* 判断文本是否包含关键词。 */
function containsAny(text: string, words: string[]): boolean {
  return words.some((word) => text.includes(normalizeText(word)));
}

/* 格式化旧候选理由。 */
function formatLegacyCandidateReason(candidate: PersonalCandidate): string {
  return candidate.reasons.join('；') || '来自旧个人歌单候选';
}

/* 格式化最近播放曲目。 */
function formatTrack(track: Track): string {
  return track.artist ? `${track.title} / ${track.artist}` : track.title;
}

/* 格式化听歌事件证据。 */
function formatListeningEvent(event: PersonalContext['listeningEvents'][number]): string {
  const title = event.title ? ` ${event.title}${event.artist ? ` / ${event.artist}` : ''}` : '';
  const text = event.text ? `：${event.text}` : '';
  return `${event.type}${title}${text}`;
}

/* 字符串去重。 */
function dedupeStrings(values: string[]): string[] {
  const result: string[] = [];
  for (const value of values) {
    const trimmed = value.trim();
    if (!trimmed || result.includes(trimmed)) continue;
    result.push(trimmed);
  }
  return result;
}

/* 归一化文本用于匹配。 */
function normalizeText(value: string): string {
  return value.trim().toLowerCase();
}
