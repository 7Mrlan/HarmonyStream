import { describe, expect, it } from 'vitest';
import { isSameTitle } from './titleMatch.js';

describe('isSameTitle', () => {
  it('匹配完全相同和大小写差异标题', () => {
    expect(isSameTitle('晴天', '晴天')).toBe(true);
    expect(isSameTitle('Happy', 'happy')).toBe(true);
  });

  it('允许包含关系匹配', () => {
    expect(isSameTitle('晴天-周杰伦：你的爱情观是什么样的', '晴天')).toBe(true);
    expect(isSameTitle('Happy', 'Happy Live')).toBe(true);
  });

  it('空字符串和无关标题不匹配', () => {
    expect(isSameTitle('', '晴天')).toBe(false);
    expect(isSameTitle('晴天', '')).toBe(false);
    expect(isSameTitle('晴天', '夜曲')).toBe(false);
  });
});
