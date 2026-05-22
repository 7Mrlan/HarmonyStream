/*
 * 移动端 API 配置
 * ---------------
 * 集中解析 Claudio 服务端地址，避免页面里硬编码开发机 IP。
 * Web 默认访问本机 8080；真机通过 EXPO_PUBLIC_API_BASE_URL 指向局域网地址。
 */

import Constants from 'expo-constants';

const WEB_DEFAULT_API_BASE_URL = 'http://127.0.0.1:8080';

/*
 * 获取 Claudio API 根地址。
 * 优先级：EXPO_PUBLIC_API_BASE_URL -> app config extra.apiBaseUrl -> Web 本机默认。
 */
export function getApiBaseUrl(): string {
  const envValue = getExpoPublicApiBaseUrl();
  if (envValue) return normalizeApiBaseUrl(envValue);

  const extraValue = getExtraApiBaseUrl();
  if (extraValue) return normalizeApiBaseUrl(extraValue);

  return WEB_DEFAULT_API_BASE_URL;
}

/*
 * 读取 Expo public env。
 * Expo 会在构建时内联 EXPO_PUBLIC_*，这里集中读取，便于后续替换配置来源。
 */
function getExpoPublicApiBaseUrl(): string | undefined {
  return process.env.EXPO_PUBLIC_API_BASE_URL;
}

/*
 * 从 app config extra 兜底读取 API 地址。
 * 这里只做最小 shape 检查，避免把 unknown 直接当字符串。
 */
function getExtraApiBaseUrl(): string | undefined {
  const extra = Constants.expoConfig?.extra;
  if (!extra || typeof extra !== 'object') return undefined;

  const value = (extra as Record<string, unknown>).apiBaseUrl;
  return typeof value === 'string' ? value : undefined;
}

/*
 * 规范化 API 根地址。
 * 去掉末尾斜杠，防止 client 拼路径时出现双斜杠。
 */
function normalizeApiBaseUrl(value: string): string {
  return value.trim().replace(/\/+$/, '');
}
