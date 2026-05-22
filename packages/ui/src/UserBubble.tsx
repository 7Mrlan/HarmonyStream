/*
 * 组件：UserBubble
 * 作用：用户短回复气泡（如 "好听"），右对齐，配方块头像
 * 设计：宽度自适应内容，最大宽度限制避免长文撑屏
 */

import { View, Text } from 'react-native';

export interface UserBubbleProps {
  /* 用户文字 */
  text: string;
  /* 用户名（小字） */
  name?: string;
  /* 时间戳 */
  time?: string;
  /* 头像方块颜色 */
  avatarColor?: string;
}

export function UserBubble({
  text,
  name = 'YOU',
  time,
  avatarColor = '#1f1f1f',
}: UserBubbleProps) {
  return (
    <View
      className="flex-row items-end justify-end px-4 py-2"
      style={{ gap: 8 }}
    >
      {/* 主体右对齐：name + 气泡 + 时间 */}
      <View className="items-end" style={{ maxWidth: '70%' }}>
        <Text className="font-pixel text-muted text-xs tracking-pixel mb-1">{name}</Text>
        <View className="border border-line bg-panel px-3 py-1">
          <Text className="font-mono text-text text-base">{text}</Text>
        </View>
        {time ? (
          <Text className="font-mono text-muted text-xs tracking-pixel mt-1">{time}</Text>
        ) : null}
      </View>

      {/* 右侧 28x28 方块头像 */}
      <View
        className="border border-line"
        style={{ width: 28, height: 28, backgroundColor: avatarColor }}
      />
    </View>
  );
}
