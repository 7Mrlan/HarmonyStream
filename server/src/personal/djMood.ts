/*
 * Resident DJ 情绪陪伴边界
 * ------------------------
 * 这里只负责把用户输入或 mood-rules.md 命中结果转换成本轮陪伴模式。
 * 它不读取歌单、不策展歌曲，避免情绪词表继续散在主编排文件里。
 */

import type { ComfortMode, EnergyCurve, MoodRule } from './profileTypes.js';

export interface MoodSignal {
  /* 本轮陪伴尺度。 */
  comfortMode: ComfortMode;
  /* 本轮歌单能量曲线。 */
  energyCurve: EnergyCurve;
  /* 本轮文案和策展约束。 */
  constraints: string[];
}

const SAD_WORDS = ['难过', '伤心', '低落', '崩溃', '难受', '不开心', 'emo', '失落', '撑不住'];
const HAPPY_WORDS = ['开心', '高兴', '快乐', '好爽', '爽', '太好了', '兴奋', '庆祝', '赢了'];
const FOCUS_WORDS = ['专注', '写代码', '工作', '学习', '不抢', '轻一点', '安静', '效率'];
const MEETING_WORDS = ['会议', '开会', '会后', '刚开完会', 'meeting', '累'];
const NOSTALGIA_WORDS = ['怀旧', '老歌', '以前', '回忆', '旧歌', '经典'];

/*
 * 读取本轮 mood signal。
 * mood-rules.md 命中时优先走用户配置；未配置或无法推断时才落到内置 fallback 词表。
 */
export function readMoodSignal(userText: string, moodRule?: MoodRule): MoodSignal {
  const configuredSignal = moodRule ? buildMoodRuleSignal(moodRule) : null;
  if (configuredSignal) return configuredSignal;

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
  if (hasFocusSignal(text) || hasMeetingSignal(text)) {
    return {
      comfortMode: 'focus-with-you',
      energyCurve: hasMeetingSignal(text) ? 'low-stable' : 'deep-focus',
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

/* 判断文本里是否包含专注类信号。 */
export function hasFocusSignal(text: string): boolean {
  return containsAny(normalizeText(text), FOCUS_WORDS);
}

/* 判断文本里是否包含会议类信号。 */
export function hasMeetingSignal(text: string): boolean {
  return containsAny(normalizeText(text), MEETING_WORDS);
}

/*
 * 把 mood-rules.md 命中的规则转换成 Resident DJ 策略。
 * 用户可显式写 comfort / curve；未写时只按规则文本做保守推断。
 */
function buildMoodRuleSignal(rule: MoodRule): MoodSignal | null {
  const comfortMode = rule.comfortMode ?? inferComfortModeFromMoodRule(rule);
  if (!comfortMode) return null;

  const energyCurve = rule.energyCurve ?? defaultEnergyCurveForComfort(comfortMode);
  const constraints = [
    ...defaultConstraintsForComfort(comfortMode),
    ...(rule.constraints ?? []),
    rule.note ? `用户情绪规则备注：${rule.note}` : '',
    rule.preferredTags.length > 0 ? `优先参考标签：${rule.preferredTags.join('、')}` : '',
    `mood-rules.md 命中：${rule.mood}`,
  ];

  return {
    comfortMode,
    energyCurve,
    constraints: dedupeStrings(constraints.filter(Boolean)),
  };
}

/* mood-rules.md 未显式写 comfort 时，按规则名和标签做轻量推断。 */
function inferComfortModeFromMoodRule(rule: MoodRule): ComfortMode | null {
  const text = normalizeText(
    [rule.mood, ...rule.preferredTags, ...(rule.constraints ?? []), rule.note ?? ''].join(' '),
  );
  if (containsAny(text, HAPPY_WORDS)) return 'celebrate';
  if (containsAny(text, SAD_WORDS) || containsAny(text, ['伤感', '陪伴', '安慰'])) {
    return 'sit-with-you';
  }
  if (hasFocusSignal(text) || hasMeetingSignal(text)) return 'focus-with-you';
  if (containsAny(text, NOSTALGIA_WORDS)) return 'nostalgia-soft';
  return null;
}

/* 按陪伴模式给出默认曲线。 */
function defaultEnergyCurveForComfort(comfortMode: ComfortMode): EnergyCurve {
  if (comfortMode === 'celebrate') return 'bright';
  if (comfortMode === 'sit-with-you' || comfortMode === 'lift-gently') return 'rise-gently';
  if (comfortMode === 'focus-with-you') return 'deep-focus';
  if (comfortMode === 'nostalgia-soft') return 'wind-down';
  return 'low-stable';
}

/* 按陪伴模式给出默认约束。 */
function defaultConstraintsForComfort(comfortMode: ComfortMode): string[] {
  if (comfortMode === 'celebrate') return ['可以一起开心', '不要说教', '不要压低情绪'];
  if (comfortMode === 'sit-with-you' || comfortMode === 'lift-gently') {
    return ['先接住情绪', '不承诺治愈', '不写鸡汤', '播放不能被深聊阻塞'];
  }
  if (comfortMode === 'focus-with-you') return ['低刺激', '不抢注意力', '少说话'];
  if (comfortMode === 'nostalgia-soft') return ['怀旧但不煽情', '不要编用户故事'];
  return ['只讲本轮听感', '不要假装懂用户'];
}

/* 判断文本是否包含关键词。 */
function containsAny(text: string, words: string[]): boolean {
  return words.some((word) => text.includes(normalizeText(word)));
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
