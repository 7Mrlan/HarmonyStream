/*
 * Claudio 设计 Token 真源
 * ----------------------
 * 此文件是项目颜色 / 字体 / 字号 / 间距 / 圆角的唯一定义点。
 * apps/mobile 与未来的 apps/desktop 都通过 require 引用同一份 token。
 * 任何颜色 / 字号修改必须先改 tasks/spec.md，再来动这里。
 */

module.exports = {
  /* 7 个颜色 token，禁止裸值 */
  colors: {
    bg: '#000000', // 主背景：纯黑
    panel: '#0a0a0a', // 面板：近黑
    line: '#1f1f1f', // 分割线
    text: '#e8e8e8', // 主文字：米白，不用纯白避免刺眼
    muted: '#6b7280', // 次文字
    accent: '#00ff88', // 唯一点睛色：荧光薄荷绿，同屏 ≤ 3 处
    live: '#ff3355', // LIVE 红 / 错误 / 危险
  },

  /* 字体家族：英文像素 + 中文像素 + 等宽 */
  fontFamily: {
    pixel: ['PixelOperator', 'Cubic11', 'monospace'], // 标题/数字（中文回退 Cubic11）
    mono: ['VT323', 'Cubic11', 'monospace'], // 正文等宽（中文回退 Cubic11）
    cn: ['Cubic11', 'monospace'], // 纯中文场景
  },

  /* 字距：像素字体小字号必带，否则糊 */
  letterSpacing: {
    pixel: '0.08em',
  },

  /* 字号阶梯：仅 4 档，禁止其他值 */
  fontSize: {
    xs: ['12px', { lineHeight: '16px' }],
    base: ['16px', { lineHeight: '22px' }],
    '2xl': ['24px', { lineHeight: '30px' }],
    '7xl': ['72px', { lineHeight: '76px' }],
  },

  /* 圆角：仅 0 / 6px */
  borderRadius: {
    none: '0',
    md: '6px',
  },
};
