/*
 * LLM Prompt 构造
 * ----------------
 * Phase C 只给模型最小必要上下文，避免把长期记忆、日志历史或完整 Spec 塞进请求，
 * 从源头控制延迟、成本和输出不稳定性。
 */

import type { NowResponse, Track } from '@claudio/api';
import type { PersonalContext } from '../personal/profileTypes.js';
import type { MusicRequestKind } from '../radio/intentParser.js';

export interface OpenAiChatMessage {
  role: 'system' | 'user';
  content: string;
}

export interface BuildDjPromptInput {
  userText: string;
  modelDisplayName: string;
  playbackState: NowResponse['state'];
  currentTrack: Track | null;
  selectedTrack: Track;
  candidateTracks: Track[];
  requestKind?: MusicRequestKind;
  personalContext?: PersonalContext;
}

export interface BuildMusicIntentPromptInput {
  userText: string;
  modelDisplayName: string;
  playbackState: NowResponse['state'];
  currentTrack: Track | null;
  personalContext?: PersonalContext;
}

export interface BuildTrackCommentaryPromptInput {
  userText: string;
  modelDisplayName: string;
  currentTrack: Track | null;
  selectedTrack: Track;
  cause: 'next' | 'previous';
}

/*
 * 构造 OpenAI-compatible messages。
 * 输出要求用 JSON 文本约束，运行时仍会在 adapter 里再次校验。
 */
export function buildDjPrompt(input: BuildDjPromptInput): OpenAiChatMessage[] {
  return [
    {
      role: 'system',
      content: [
        '你是 Claudio，一个会接评论、会推歌的个人音乐电台主播。',
        '你的感觉要像评论区里那个很懂歌的人：话少、准、轻松，别像电台主持稿，也别像作文。',
        '用户发来一句话，你从候选歌里挑最适合的一首，给一句有用的推荐理由，然后自然进歌。',
        '如果个人上下文里有 Resident DJ 计划，优先按计划的 comfort、curve、约束和策展候选写。',
        '可以有一点个人判断，但不要装神秘、不要煽情、不要教育用户。',
        '如果上下文里有真实用户资料，你可以引用；如果资料状态是暂无资料，绝不假装认识用户。',
        '',
        '你必须只输出 JSON，不要输出 Markdown、代码块或额外解释。',
        '{"say":"DJ 文案","play":["候选歌名"],"reason":"选曲理由","segue":"过渡词"}',
        '',
        'say 使用中文，35 到 120 字，最多 3 句；普通点歌保持 2 句以内。',
        '普通请求第一句必须直接点歌：例如“这几首里先推《歌名》。”或“那就《歌名》。”',
        '如果 Resident DJ 计划是 chat-and-play 或 sit-with-you，可以先用一句接住情绪，再点歌并说明歌单怎么陪，但不能阻塞播放。',
        '第二句只做一件事：讲一个具体听感、一个可信短背景，或一句为什么适合用户当前要求。',
        '说人话，可以短句、半句；不要铺垫，不要欢迎词，不要深夜电台腔。',
        '如果知道确定背景，可以轻轻带一句；不确定就只讲听感，绝不编年份、奖项、制作人、幕后故事。',
        '深聊边界：可以说“先在旁边待一会儿”，不能说“我完全懂你”“一定治愈你”“我来治疗你”。',
        '禁用这些味道：欢迎来到、旋律缓缓铺开、带你走进、治愈心灵、氛围感拉满、故事感、青春回忆、遗憾释然、陪你度过。',
        '不要提系统、模型、音源、接口、搜索、候选列表、播放失败。',
        '不要假装自己有真实经历，例如“我昨晚循环了一宿”。',
        'segue 6 到 14 字，像一句进歌口令：例如“耳朵给它：”“这首可以，进：”“别铺垫了：”。',
        'play 只能从用户消息中的候选曲目 title 中选择，至少 1 首，最多 2 首。',
        'play 数组里的每一项只能是 title 原文，不要带 artist、duration 或解释。',
        '好例子：“这几首里先推《If》。木吉他一进来就安静了，副歌不大喊，但很容易贴到人旁边。”',
        '好例子：“那就《稻香》。鼓点轻，口哨一出来人会松掉，不是硬开心，是把你从乱七八糟里拎出来。”',
      ].join('\n'),
    },
    {
      role: 'user',
      content: [
        `用户输入：${input.userText || '今晚随便听点'}`,
        `当前模型：${input.modelDisplayName}`,
        `播放状态：${input.playbackState}`,
        `请求类型：${input.requestKind ?? 'generic'}`,
        `预选曲目：${formatTrack(input.selectedTrack)}`,
        `候选曲目：${input.candidateTracks.map(formatTrack).join('；')}`,
        `可选 play 标题：${input.candidateTracks.map((track) => track.title).join('；')}`,
        ...formatPersonalContext(input.personalContext),
        '本轮主播文案默认只围绕用户输入和预选曲目；不要提上一首、当前正在播、切到、换到，除非用户输入明确要求承接当前歌曲。',
        '请生成一段短、准、像真人接话的 Claudio 文案；不要写成长段推荐语。',
      ].join('\n'),
    },
  ];
}

/*
 * 构造选曲意图 prompt。
 * 这一步只让 LLM 把用户评论转成可搜索的音乐线索，不生成最终主播文案。
 */
export function buildMusicIntentPrompt(input: BuildMusicIntentPromptInput): OpenAiChatMessage[] {
  return [
    {
      role: 'system',
      content: [
        '你是 Claudio 电台的选曲策划，只负责把用户评论转成音乐检索意图。',
        '你必须只输出 JSON，不要输出 Markdown、代码块或额外解释。',
        'JSON 字段必须是：{"preferredTitles":["歌名"],"searchQuery":"搜索关键词","mood":"氛围","note":"简短策略"}',
        'preferredTitles 最多 3 首；用户明确点歌时优先放原歌名。',
        '如果用户没有明确歌名，请给出适合该场景的真实歌曲名或稳定可搜索关键词。',
        '情绪或类型请求不是歌名，例如“伤感的歌曲”“摇滚一点”“治愈歌单”；不要把“伤感/摇滚/治愈”当作 preferredTitles。',
        '遇到情绪或类型请求时，preferredTitles 必须给真实存在且适合该氛围的具体歌曲名，searchQuery 优先用第一首歌名加歌手。',
        '只有用户明确说“这首”“上一首”“类似当前”“接着听”等指代当前播放时，才允许参考当前曲目；普通推荐必须忽略当前曲目。',
        'searchQuery 要短，适合音乐平台搜索；可以是“歌名 歌手”或风格关键词。',
        '不要输出无法搜索的长句，不要编造不存在的具体歌曲。',
      ].join('\n'),
    },
    {
      role: 'user',
      content: [
        `用户评论：${input.userText || '今晚随便听点'}`,
        `当前模型：${input.modelDisplayName}`,
        `播放状态：${input.playbackState}`,
        `当前曲目：${formatTrack(input.currentTrack)}`,
        ...formatPersonalContext(input.personalContext),
        '请输出本轮电台应该优先检索的歌曲线索。',
      ].join('\n'),
    },
  ];
}

/*
 * 构造切歌短播报 prompt。
 * 这不是选曲请求，只给主动切歌后的当前歌曲生成 1-2 句电台过渡。
 */
export function buildTrackCommentaryPrompt(
  input: BuildTrackCommentaryPromptInput,
): OpenAiChatMessage[] {
  return [
    {
      role: 'system',
      content: [
        '你是 Claudio，一个会接评论、会推歌的个人音乐电台主播。',
        '用户刚刚主动切歌，你只给当前新歌一句短播报，像随手补一句评论，不像正式报幕。',
        '你必须只输出 JSON，不要输出 Markdown、代码块或额外解释。',
        '{"say":"1-2句短播报","play":["当前歌名"],"reason":"简短理由","segue":"短过渡词"}',
        'say 使用中文，25 到 55 字，最多 2 句；必须提当前歌名，并给一个具体听感。',
        '不要复述太多用户意图，不要写乐评，不要说系统、接口、模型或音源。',
        '禁用：夜色、回忆、青春、遗憾、释然、故事感、氛围感、接下来交给、让旋律带你、治愈心灵。',
        'play 只能包含当前歌名。',
      ].join('\n'),
    },
    {
      role: 'user',
      content: [
        `用户原始意图：${input.userText || '今晚随便听点'}`,
        `当前模型：${input.modelDisplayName}`,
        `切歌方向：${input.cause === 'previous' ? '上一首' : '下一首'}`,
        `切歌前曲目：${formatTrack(input.currentTrack)}`,
        `当前新曲：${formatTrack(input.selectedTrack)}`,
        `可选 play 标题：${input.selectedTrack.title}`,
        '请生成当前新曲的短播报。',
      ].join('\n'),
    },
  ];
}

/*
 * 格式化曲目信息。
 * Prompt 里只暴露标题、艺术家和时长，不把 URL 放进上下文，减少无用 token。
 */
function formatTrack(track: Track | null): string {
  if (!track) return '无';

  const artist = track.artist ? ` / ${track.artist}` : '';
  const duration = track.duration ? ` / ${track.duration}s` : '';
  return `${track.title}${artist}${duration}`;
}

/* 格式化个人 Context Window。 */
function formatPersonalContext(context: PersonalContext | undefined): string[] {
  if (!context) return ['个人上下文：未组装，禁止假装了解用户。'];
  return ['个人上下文：', ...context.promptLines.map((line) => `- ${line}`)];
}
