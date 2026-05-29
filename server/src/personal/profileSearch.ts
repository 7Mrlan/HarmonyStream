/*
 * 个人歌单检索
 * ------------
 * 把用户输入、时段 routine 和 mood rule 转成个人候选曲。
 * 这里不解析音频 URL，只返回“哪些私人候选值得交给 provider chain”。
 */

import type {
  ListeningEnvironment,
  MoodRule,
  PersonalCandidate,
  PersonalSearchResult,
  PersonalTrackSeed,
  RoutineRule,
  TtsStyle,
  UserMusicProfile,
} from './profileTypes.js';

export interface SearchPersonalProfileInput {
  /* 用户原始输入。 */
  userText: string;
  /* 已加载的用户资料。 */
  profile: UserMusicProfile;
  /* 可注入时间，便于稳定测试。 */
  now?: Date;
  /* 最大候选数。 */
  limit?: number;
}

const DEFAULT_TTS_STYLE: TtsStyle = {
  key: 'neutral-v1',
  emotion: '自然',
  styleInstruction: '语气自然，像私人电台 DJ，贴近但不过度表演',
  speed: 1,
};

const TIME_SLOT_TAGS: Record<string, string[]> = {
  morning: ['清晨', '通勤', '醒来', '明亮'],
  daytime: ['白天', '学习', '工作', '专注'],
  evening: ['傍晚', '晚饭', '放松', '回家'],
  'late-night': ['深夜', '夜晚', '写代码', '低声'],
};

/*
 * 检索个人资料。
 * 分数只用于排序；候选理由才会进入 prompt，让 DJ 的“懂你”有证据。
 */
export function searchPersonalProfile(input: SearchPersonalProfileInput): PersonalSearchResult {
  const limit = Math.max(1, input.limit ?? 5);
  const environment = buildListeningEnvironment(input.now ?? new Date(), input.profile.routines);
  const mood = findMoodRule(input.userText, input.profile.moodRules);
  const ttsStyle = chooseTtsStyle(mood, environment);
  const candidates = input.profile.tracks
    .map((track) =>
      scoreTrack(track, {
        userText: input.userText,
        mood,
        environment,
      }),
    )
    .filter((candidate): candidate is PersonalCandidate => Boolean(candidate))
    .sort((left, right) => right.score - left.score)
    .slice(0, limit);

  return {
    ...(mood ? { mood } : {}),
    environment,
    candidates,
    ttsStyle,
  };
}

/* 构造当前听歌环境。 */
export function buildListeningEnvironment(
  now: Date,
  routines: RoutineRule[],
): ListeningEnvironment {
  const hour = now.getHours();
  const timeSlot = getTimeSlot(hour);
  const routine = routines.find((item) => isHourInRange(hour, item.startHour, item.endHour));

  return {
    now,
    hour,
    timeSlot,
    ...(routine ? { routine } : {}),
  };
}

interface ScoreContext {
  userText: string;
  mood?: MoodRule;
  environment: ListeningEnvironment;
}

/* 给单首候选打分。 */
function scoreTrack(track: PersonalTrackSeed, context: ScoreContext): PersonalCandidate | null {
  const normalizedText = normalize(context.userText);
  const reasons: string[] = [];
  let score = track.weight;

  if (normalizedText && normalize(track.title).includes(normalizedText)) {
    score += 80;
    reasons.push(`你直接提到了《${track.title}》`);
  } else if (normalizedText && normalizedText.includes(normalize(track.title))) {
    score += 80;
    reasons.push(`你这句话点中了《${track.title}》`);
  }

  if (track.artist && normalizedText.includes(normalize(track.artist))) {
    score += 24;
    reasons.push(`歌手 ${track.artist} 命中`);
  }

  const textTagMatches = matchTags(track.tags, extractTextTags(context.userText));
  if (textTagMatches.length > 0) {
    score += textTagMatches.length * 18;
    reasons.push(`输入气质命中 ${textTagMatches.join('、')}`);
  }

  if (context.mood) {
    const moodMatches = matchTags(track.tags, context.mood.preferredTags);
    if (moodMatches.length > 0) {
      score += moodMatches.length * 60;
      reasons.push(`${context.mood.mood} 规则命中 ${moodMatches.join('、')}`);
    }
  }

  const routine = context.environment.routine;
  if (routine) {
    const routineMatches = matchTags(track.tags, routine.preferredTags);
    if (routineMatches.length > 0) {
      score += routineMatches.length * 10;
      reasons.push(`${routine.label} 习惯命中 ${routineMatches.join('、')}`);
    }
  }

  const timeMatches = matchTags(track.tags, TIME_SLOT_TAGS[context.environment.timeSlot] ?? []);
  if (timeMatches.length > 0) {
    score += timeMatches.length * 4;
    reasons.push(`${formatTimeSlot(context.environment.timeSlot)} 命中 ${timeMatches.join('、')}`);
  }

  if (track.note && reasons.length > 0) {
    reasons.push(track.note);
  }

  if (score <= track.weight && !normalizedText) return null;
  if (reasons.length === 0) return null;

  return {
    track,
    score,
    reasons: reasons.slice(0, 3),
  };
}

/* 查找命中的 mood rule。 */
function findMoodRule(userText: string, rules: MoodRule[]): MoodRule | undefined {
  const normalizedText = normalize(userText);
  return rules.find((rule) =>
    rule.keywords.some((keyword) => normalizedText.includes(normalize(keyword))),
  );
}

/* 选择本轮 TTS 语气：mood 优先，其次 routine，最后默认自然。 */
function chooseTtsStyle(mood: MoodRule | undefined, environment: ListeningEnvironment): TtsStyle {
  return mood?.ttsStyle ?? environment.routine?.ttsStyle ?? DEFAULT_TTS_STYLE;
}

/* 粗略提取用户文本里的场景标签。 */
function extractTextTags(userText: string): string[] {
  const tags: string[] = [];
  const pairs: Array<[RegExp, string]> = [
    [/开心|快乐|高兴|元气/u, '开心'],
    [/怀旧|老歌|以前|小时候|青春/u, '怀旧'],
    [/深夜|睡前|凌晨|失眠/u, '深夜'],
    [/学习|工作|写代码|专注/u, '专注'],
    [/下雨|雨天/u, '雨天'],
    [/难过|伤感|伤心|emo|失恋/u, '伤感'],
  ];

  for (const [pattern, tag] of pairs) {
    if (pattern.test(userText)) tags.push(tag);
  }
  return tags;
}

/* 匹配标签，忽略大小写和空白。 */
function matchTags(trackTags: string[], desiredTags: string[]): string[] {
  const normalizedTrackTags = trackTags.map(normalize);
  return desiredTags.filter((tag) => normalizedTrackTags.includes(normalize(tag)));
}

/* 判断小时是否落在区间内，支持跨午夜。 */
function isHourInRange(hour: number, startHour: number, endHour: number): boolean {
  if (startHour === endHour) return true;
  if (startHour < endHour) return hour >= startHour && hour < endHour;
  return hour >= startHour || hour < endHour;
}

/* 将小时映射为时段。 */
function getTimeSlot(hour: number): ListeningEnvironment['timeSlot'] {
  if (hour >= 5 && hour < 11) return 'morning';
  if (hour >= 11 && hour < 18) return 'daytime';
  if (hour >= 18 && hour < 22) return 'evening';
  return 'late-night';
}

/* 时段中文名。 */
function formatTimeSlot(slot: ListeningEnvironment['timeSlot']): string {
  if (slot === 'morning') return '清晨';
  if (slot === 'daytime') return '白天';
  if (slot === 'evening') return '傍晚';
  return '深夜';
}

/* 归一化文本用于宽松匹配。 */
function normalize(value: string): string {
  return value.trim().toLowerCase();
}
