/*
 * Metro 配置（monorepo 适配）
 * ---------------------------
 * 1. watchFolders 加根目录，让 Metro 监听 packages/* 源码变更
 * 2. nodeModulesPaths 同时找 app 自身和根的 node_modules
 * 3. NativeWind 包装：注入 global.css 编译为 StyleSheet
 */

const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

/* 监听整个 monorepo 根目录，确保 packages 下的源码热更新 */
config.watchFolders = [workspaceRoot];

/* 优先使用 app 自身的依赖，找不到再回退到根 node_modules */
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

/* pnpm 严格模式下，禁用层级查找避免幽灵依赖问题 */
config.resolver.disableHierarchicalLookup = true;

module.exports = withNativeWind(config, { input: './global.css' });
