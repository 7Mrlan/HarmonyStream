/*
 * 组件：DJBubble
 * 作用：DJ "Claudio" 的对话气泡，长文本主体，左侧头像 + 顶部名称 + Voice 状态徽章
 * 设计：硬边框 1px，无圆角胶囊；正文用 VT323 / Cubic11 等宽
 *      Voice 徽章继承原红色文字盒质感，并按开关状态切换左侧动画
 *      可选打字机效果（typing 模式按字符显示，模拟流式输出）
 */

import { useEffect, useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { RadioTuningLoader } from './RadioTuningLoader';
import { VoiceToggle } from './VoiceToggle';

export interface DJBubbleProps {
  /* 主体文本，可多段落 */
  text: string;
  /* DJ 名称，默认 CLAUDIO */
  name?: string;
  /* 时间戳，例如 "21:02" */
  time?: string;
  /* 是否显示顶部状态徽章；保留 live 命名兼容旧调用，当前徽章显示 Voice 状态 */
  live?: boolean;
  /* Voice 是否启用；true 时徽章显示 VOICE ON */
  voiceActive?: boolean;
  /* 点击 Voice 徽章切换 TTS 播报 */
  onVoiceToggle?: () => void;
  /* Voice 徽章是否禁用；发送请求期间锁定，避免本轮 TTS 意图被误读。 */
  voiceDisabled?: boolean;
  /* 打字机效果：true 时按字符逐个出现，速度由 typingSpeedMs 控制 */
  typing?: boolean;
  /* LLM 等待态：true 时显示电台调频加载组件，不显示本地垫话 */
  loading?: boolean;
  /* 每个字符的间隔毫秒 */
  typingSpeedMs?: number;
  /* 头像方块的颜色，默认 panel */
  avatarColor?: string;
  /* REPLAY 按钮回调 */
  onReplay?: () => void;
}

/* Hook：打字机效果，按字符逐个返回 */
function useTypewriter(text: string, typing: boolean, speedMs: number) {
  const [out, setOut] = useState(typing ? '' : text);
  useEffect(() => {
    if (!typing) {
      setOut(text);
      return;
    }
    setOut('');
    let i = 0;
    const id = setInterval(() => {
      i += 1;
      setOut(text.slice(0, i));
      if (i >= text.length) clearInterval(id);
    }, speedMs);
    return () => clearInterval(id);
  }, [text, typing, speedMs]);
  return out;
}

/*
 * 工具：按 DJ 气泡正文区域计算调频模块宽度。
 * 宽屏限制为小仪表，窄屏保持可读但不超过正文区域。
 */
function resolveTuningLoaderWidth(contentWidth: number): number | undefined {
  if (contentWidth <= 0) return undefined;

  const preferredWidth = Math.max(208, contentWidth * 0.72);
  return Math.min(contentWidth, 280, preferredWidth);
}

export function DJBubble({
  text,
  name = 'CLAUDIO',
  time,
  live = false,
  voiceActive = false,
  onVoiceToggle,
  voiceDisabled = false,
  typing = false,
  loading = false,
  typingSpeedMs = 20,
  avatarColor = '#0a0a0a',
  onReplay,
}: DJBubbleProps) {
  const display = useTypewriter(text, typing && !loading, typingSpeedMs);
  const [contentWidth, setContentWidth] = useState(0);
  const tuningLoaderWidth = resolveTuningLoaderWidth(contentWidth);
  const showVoiceBadge = live || Boolean(onVoiceToggle);

  return (
    <View className="flex-row px-4 py-3" style={{ gap: 12 }}>
      {/* 左侧 32x32 方块头像 */}
      <View
        className="border border-line"
        style={{ width: 32, height: 32, backgroundColor: avatarColor }}
      />

      {/* 右侧主体 */}
      <View
        className="flex-1"
        onLayout={(event) => {
          const measuredWidth = event.nativeEvent.layout.width;
          if (Math.abs(measuredWidth - contentWidth) > 0.5) {
            setContentWidth(measuredWidth);
          }
        }}
      >
        {/* 顶部一行：DJ 名 + Voice 状态徽章 */}
        <View className="flex-row items-center" style={{ gap: 8 }}>
          <Text className="font-pixel text-text text-base tracking-pixel">{name}</Text>
          {showVoiceBadge ? (
            <VoiceToggle active={voiceActive} onPress={onVoiceToggle} disabled={voiceDisabled} />
          ) : null}
        </View>

        {/* 主文本或 LLM 等待态 */}
        {loading ? (
          <View className="mt-2">
            <RadioTuningLoader active width={tuningLoaderWidth} />
          </View>
        ) : (
          <View className="mt-2 border border-line bg-panel px-3 py-2">
            <Text className="font-mono text-text text-base" style={{ lineHeight: 22 }}>
              {display}
            </Text>
          </View>
        )}

        {/* 底部一行：时间 + REPLAY 按钮 */}
        <View className="flex-row items-center mt-1" style={{ gap: 8 }}>
          {time ? (
            <Text className="font-mono text-muted text-xs tracking-pixel">{time}</Text>
          ) : null}
          {onReplay ? (
            <Pressable onPress={onReplay} className="px-2 py-0.5 border border-line active:bg-line">
              <Text className="font-pixel text-muted text-xs tracking-pixel">{'> REPLAY'}</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    </View>
  );
}
