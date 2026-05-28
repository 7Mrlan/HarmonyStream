import { describe, expect, it } from 'vitest';
import { shouldRecordMusicFeedback } from './listeningFeedback';

describe('shouldRecordMusicFeedback', () => {
  it('识别明确的正向播放反馈', () => {
    expect(shouldRecordMusicFeedback('这首以后晚上写代码多放')).toBe(true);
    expect(shouldRecordMusicFeedback('这类音乐适合开会后恢复，多放')).toBe(true);
  });

  it('识别明确的负向播放反馈', () => {
    expect(shouldRecordMusicFeedback('别再推这种苦情歌')).toBe(true);
    expect(shouldRecordMusicFeedback('这歌我不喜欢')).toBe(true);
  });

  it('不把普通情绪聊天写成音乐偏好', () => {
    expect(shouldRecordMusicFeedback('我今天真的很难受')).toBe(false);
    expect(shouldRecordMusicFeedback('今天好爽，想听点开心的')).toBe(false);
    expect(shouldRecordMusicFeedback('以后放假我想在家待着')).toBe(false);
    expect(shouldRecordMusicFeedback('别再推我去社交了')).toBe(false);
    expect(shouldRecordMusicFeedback('我不喜欢今天这样，放点音乐吧')).toBe(false);
  });
});
