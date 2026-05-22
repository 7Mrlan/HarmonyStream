/*
 * Tailwind 配置
 * -------------
 * 引用 @claudio/ui/tailwind-tokens.js 作为 token 真源，
 * 不在此文件硬编码颜色 / 字体 / 间距值。
 */

const tokens = require('@claudio/ui/tailwind-tokens');

/** @type {import('tailwindcss').Config} */
module.exports = {
  /* darkMode 必须设为 'class'，配合 NativeWind 4 的 setColorScheme API；
     默认 'media' 会与 app.json 的 userInterfaceStyle 冲突 */
  darkMode: 'class',
  content: [
    './app/**/*.{ts,tsx}',
    './src/**/*.{ts,tsx}',
    /* 同时扫描 ui 包源码，让其中的 className 也被编译 */
    '../../packages/ui/src/**/*.{ts,tsx}',
  ],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: tokens.colors,
      fontFamily: tokens.fontFamily,
      letterSpacing: tokens.letterSpacing,
      fontSize: tokens.fontSize,
      borderRadius: tokens.borderRadius,
    },
  },
  plugins: [],
};
