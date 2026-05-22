/*
 * Babel 配置
 * ----------
 * NativeWind 通过 jsxImportSource 实现 className → style 转换。
 * Reanimated 接入说明：
 *   - Reanimated 3 的 worklet 与 logger 需要 `react-native-reanimated/plugin`
 *     做 Babel 转换，否则 Web 运行时会出现 `_reanimatedLoggerConfig is not defined`。
 *   - 但 `nativewind/babel` 目前会间接引用 `react-native-worklets/plugin`，
 *     因此构建依赖里仍需保留 `react-native-worklets` 包本体。
 */

module.exports = function (api) {
  api.cache(true);
  return {
    presets: [['babel-preset-expo', { jsxImportSource: 'nativewind' }], 'nativewind/babel'],
    plugins: ['react-native-reanimated/plugin'],
  };
};
