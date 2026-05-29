import { describe, expect, it } from 'vitest';
import { createPersonalContext, createTestTrack } from '../test/factories.js';
import { buildDjPrompt, buildMusicIntentPrompt } from './prompt.js';

function promptContext(hasUserData: boolean) {
  return createPersonalContext({
    hasUserData,
    tasteSummary: hasUserData ? '喜欢明亮但不吵的华语流行' : '',
    preferredTitles: hasUserData ? ['金风玉露'] : [],
    promptLines: hasUserData
      ? ['资料状态：有本机用户音乐资料', '个人候选：金风玉露 / 房东的猫（开心 规则命中 明亮）']
      : [
          '资料状态：暂无本机用户音乐资料',
          '个人候选：无命中，禁止假装了解用户资料，只讲本轮听感。',
        ],
  });
}

describe('llm prompt personal context', () => {
  it('DJ prompt 包含 Context Assembler 的个人依据', () => {
    const messages = buildDjPrompt({
      userText: '想听开心的歌',
      modelDisplayName: 'DeepSeek',
      playbackState: 'playing',
      currentTrack: null,
      selectedTrack: createTestTrack('金风玉露'),
      candidateTracks: [createTestTrack('金风玉露')],
      requestKind: 'range',
      personalContext: promptContext(true),
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
      personalContext: promptContext(false),
    });

    const userMessage = messages.at(1)?.content ?? '';
    expect(userMessage).toContain('暂无本机用户音乐资料');
    expect(userMessage).toContain('禁止假装了解用户资料');
  });
});
