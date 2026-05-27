/*
 * 组件：TopBar
 * 作用：顶部状态栏，包含头像、Claudio 文字 logo、当前 AI 模型徽章、LOGIN / DARK / LIGHT 三档按钮
 * 设计：纯文字按钮，硬边框 1px，不使用圆角胶囊，强化像素风
 *      v1 LIGHT 按钮仅占位（spec §3.7：v1 不做亮色模式），点击不响应或弹 Toast
 *      AI 徽章固定在顶部，集中展示当前模型状态
 */

import { Pressable, Text, View } from 'react-native';

export interface TopBarProps {
  /* 是否已登录，影响 LOGIN / 用户名显示 */
  loggedIn?: boolean;
  /* 用户名（已登录时显示） */
  userName?: string;
  /* 当前主题：dark / light，v1 仅 dark 可用 */
  theme?: 'dark' | 'light';
  /* 当前 AI 模型显示名（如 DeepSeek / 通义千问 / 智谱），用于顶部徽章 */
  modelName?: string;
  /* 三个按钮事件回调，外部按需注入 */
  onPressLogin?: () => void;
  onPressDark?: () => void;
  onPressLight?: () => void;
}

/*
 * 子组件：单个文字按钮
 * 选中态用 bg-text 反白；未选中用 border + 透明背景
 */
interface SegmentButtonProps {
  label: string;
  active?: boolean;
  onPress?: () => void;
}

function SegmentButton({ label, active, onPress }: SegmentButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      className={`px-3 py-1 border border-line ${active ? 'bg-text' : 'bg-transparent'} active:bg-line`}
    >
      <Text className={`font-pixel text-xs tracking-pixel ${active ? 'text-bg' : 'text-text'}`}>
        {label}
      </Text>
    </Pressable>
  );
}

export function TopBar({
  loggedIn = false,
  userName,
  theme = 'dark',
  modelName,
  onPressLogin,
  onPressDark,
  onPressLight,
}: TopBarProps) {
  return (
    <View className="flex-row items-center justify-between px-4 py-3">
      {/* 左侧：方块头像 + Claudio 文字 logo + AI 模型徽章 */}
      <View className="flex-row items-center" style={{ flexShrink: 1 }}>
        <View className="border border-line bg-panel mr-2" style={{ width: 28, height: 28 }} />
        <Text className="font-pixel text-text text-2xl tracking-pixel">Claudio</Text>
        {/* AI 模型徽章：左侧 AI 标签 + 右侧模型名，整体反白边框 */}
        {modelName ? (
          <View className="flex-row items-center border border-line ml-3" style={{ height: 22 }}>
            <View className="bg-text px-1.5" style={{ height: '100%', justifyContent: 'center' }}>
              <Text className="font-pixel text-bg tracking-pixel" style={{ fontSize: 10 }}>
                AI
              </Text>
            </View>
            <View className="px-2" style={{ height: '100%', justifyContent: 'center' }}>
              <Text
                className="font-pixel text-text tracking-pixel"
                style={{ fontSize: 10 }}
                numberOfLines={1}
              >
                {modelName}
              </Text>
            </View>
          </View>
        ) : null}
      </View>

      {/* 右侧：登录态 + 主题切换 */}
      <View className="flex-row items-center" style={{ gap: 6 }}>
        <SegmentButton label={loggedIn && userName ? userName : 'LOGIN'} onPress={onPressLogin} />
        <SegmentButton label="DARK" active={theme === 'dark'} onPress={onPressDark} />
        <SegmentButton label="LIGHT" active={theme === 'light'} onPress={onPressLight} />
      </View>
    </View>
  );
}
