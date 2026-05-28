import type { Track } from '@claudio/api';
import { describe, expect, it } from 'vitest';
import type { PersonalContext } from '../personal/profileTypes.js';
import { buildDjPrompt, buildMusicIntentPrompt } from './prompt.js';

function track(title: string): Track {
  return {
    id: title,
    url: `https://example.com/${title}.mp3`,
    title,
  };
}

function personalContext(hasUserData: boolean): PersonalContext {
  return {
    profileSource: hasUserData ? 'user-data' : 'empty',
    hasUserData,
    tasteSummary: hasUserData ? '喜欢明亮但不吵的华语流行' : '',
    environment: {
      now: new Date('2026-05-28T09:00:00+08:00'),
      hour: 9,
      timeSlot: 'morning',
    },
    candidates: [],
    librarySections: [],
    libraryInsights: [],
    listeningEvents: [],
    djMemory: [],
    recentTracks: [],
    preferredTitles: hasUserData ? ['金风玉露'] : [],
    promptLines: hasUserData
      ? ['资料状态：有本机用户音乐资料', '个人候选：金风玉露 / 房东的猫（开心 规则命中 明亮）']
      : [
          '资料状态：暂无本机用户音乐资料',
          '个人候选：无命中，禁止假装了解用户资料，只讲本轮听感。',
        ],
    ttsStyle: {
      key: 'bright-v1',
      emotion: '明亮',
      styleInstruction: '语气更明亮一点',
    },
  };
}

describe('llm prompt personal context', () => {
  it('DJ prompt 包含 Context Assembler 的个人依据', () => {
    const messages = buildDjPrompt({
      userText: '想听开心的歌',
      modelDisplayName: 'DeepSeek',
      playbackState: 'playing',
      currentTrack: null,
      selectedTrack: track('金风玉露'),
      candidateTracks: [track('金风玉露')],
      requestKind: 'range',
      personalContext: personalContext(true),
    });

    const userMessage = messages.at(1)?.content ?? '';
    expect(userMessage).toContain('个人上下文');
    expect(userMessage).toContain('有本机用户音乐资料');
    expect(userMessage).toContain('金风玉露');
  });

  it('无资料时 prompt 明确禁止假装了解用户', () => {
    const messages = buildMusicIntentPrompt({
      userText: '想听开心的歌',
      modelDisplayName: 'DeepSeek',
      playbackState: 'idle',
      currentTrack: null,
      personalContext: personalContext(false),
    });

    const userMessage = messages.at(1)?.content ?? '';
    expect(userMessage).toContain('暂无本机用户音乐资料');
    expect(userMessage).toContain('禁止假装了解用户资料');
  });
});
