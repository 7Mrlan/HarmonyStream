/*
 * 组件：ConnectionStatus
 * 作用：屏幕底部"CLAUDIO FM ... CONNECTED"两端对齐的状态行
 * 设计：左 logo 文字、右连接状态。状态变化时切换文字与颜色
 */

import { View, Text } from 'react-native';

export interface ConnectionStatusProps {
  /* 连接态：connected / connecting / offline */
  state?: 'connected' | 'connecting' | 'offline';
  /* 左侧台标文字，默认 CLAUDIO FM */
  brand?: string;
}

/* 状态文字与颜色映射，保证全屏只用 token */
const STATE_MAP: Record<NonNullable<ConnectionStatusProps['state']>, { text: string; color: string }> = {
  connected: { text: 'CONNECTED', color: '#00ff88' },
  connecting: { text: 'CONNECTING', color: '#e8e8e8' },
  offline: { text: 'OFFLINE', color: '#ff3355' },
};

export function ConnectionStatus({ state = 'connected', brand = 'CLAUDIO FM' }: ConnectionStatusProps) {
  const { text, color } = STATE_MAP[state];
  return (
    <View className="flex-row items-center justify-between px-4 py-2 border-t border-line">
      <Text className="font-pixel text-muted text-xs tracking-pixel">{brand}</Text>
      <Text className="font-pixel text-xs tracking-pixel" style={{ color }}>
        {text}
      </Text>
    </View>
  );
}
