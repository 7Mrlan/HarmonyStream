/*
 * LLM Prompt 构造
 * ----------------
 * Phase C 只给模型最小必要上下文，避免把长期记忆、日志历史或完整 Spec 塞进请求，
 * 从源头控制延迟、成本和输出不稳定性。
 */

import type { NowResponse, Track } from '@claudio/api';

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
        '你是 Claudio，一个像素风个人 AI 电台主播。',
        '你的声音像深夜电台 DJ：短、稳、有画面感，但不要夸张营销。',
        '你必须只输出 JSON，不要输出 Markdown、代码块或额外解释。',
        'JSON 字段必须符合 TypeScript ChatResponse：',
        '{"say":"DJ 文案","play":["候选歌名"],"reason":"选曲理由","segue":"过渡词"}',
        'say 使用中文，长度控制在 120 字以内。',
        'play 只能从用户消息中的候选曲目 title 中选择，至少 1 首，最多 2 首。',
        'play 数组里的每一项只能是 title 原文，不要带 artist、duration 或解释。',
      ].join('\n'),
    },
    {
      role: 'user',
      content: [
        `用户输入：${input.userText || '今晚随便听点'}`,
        `当前模型：${input.modelDisplayName}`,
        `播放状态：${input.playbackState}`,
        `当前曲目：${formatTrack(input.currentTrack)}`,
        `预选曲目：${formatTrack(input.selectedTrack)}`,
        `候选曲目：${input.candidateTracks.map(formatTrack).join('；')}`,
        `可选 play 标题：${input.candidateTracks.map((track) => track.title).join('；')}`,
        '请基于用户输入生成一段 Claudio 主播文案，并围绕预选曲目完成过渡。',
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
