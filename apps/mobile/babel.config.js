/*
 * Babel 配置
 * ----------
 * NativeWind 通过 jsxImportSource 实现 className → style 转换。
 * 注意：reanimated 3.16+ 已把 babel plugin 拆分到独立包 react-native-worklets，
 *      Iter 0 暂未用到呼吸动画，先不加该插件；Iter 1 起若需要呼吸/帧动画，
 *      安装 react-native-worklets 后再补回 'react-native-worklets/plugin'。
 */

module.exports = function (api) {
  api.cache(true);
  return {
    presets: [['babel-preset-expo', { jsxImportSource: 'nativewind' }], 'nativewind/babel'],
    plugins: [],
  };
};
