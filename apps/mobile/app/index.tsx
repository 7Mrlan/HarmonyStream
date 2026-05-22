/*
 * 主电台屏 index.tsx
 * ------------------
 * Iter 1：组装 13 个核心组件还原效果图整屏
 *   层级（z 轴从下到上）：
 *     1. DotMatrixBackground   点阵背景
 *     2. ScanlineOverlay       扫描线 + 下移高光带
 *     3. 内容流（顶 → 底）    TopBar / Clock / OnAir / DateLine
 *                              / NowPlayingBar / PlayerControls
 *                              / DJBubble / UserBubble / ChatInput / Connection
 *     4. PixelPetSwitcher     右下角浮层（漂浮 + 眨眼 + 招呼气泡）
 *
 * 布局：宽屏（>= 768）下内容居中、最大宽度 720，避免 PC 端松散
 *      暗色 + 像素风的"门面感"必须由收紧的窗口来撑
 *
 * 数据：v1 全部使用 mock，Iter 2 起接入真实播放与对话
 */

import { useState } from 'react';
import { ScrollView, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ChatInput,
  ConnectionStatus,
  DateLine,
  DEFAULT_PETS,
  DJBubble,
  DotMatrixBackground,
  MusicSpectrum,
  NowPlayingBar,
  OnAirIndicator,
  PixelClock,
  PixelPetSwitcher,
  PlayerControls,
  ScanlineOverlay,
  TopBar,
  UserBubble,
  type PlayerControlAction,
} from '@claudio/ui';
import { useRadioPlayer } from './_hooks/useRadioPlayer';

/* DJ 文案 mock，模拟 Claudio 的播报风格 */
const DJ_SCRIPT =
  "This is Claudio. It's late on a Monday, and here's a song that moves with your breath. " +
  'Back in 1974, David Gates picked up a nylon-string guitar and let every line end in a whisper - ' +
  "you'll feel yourself lift off the ground a little. This one's called If. " +
  'After a long day with Claude Code, just breathe.';

/* 宽屏阈值，超过后启用居中收紧布局 */
const WIDE_BREAKPOINT = 768;
/* PC 端内容最大宽度，超出留白填补氛围 */
const CONTENT_MAX_WIDTH = 720;

export default function HomeScreen() {
  /* 安全区，避免顶部刘海 / 底部 home 条遮挡 */
  const insets = useSafeAreaInsets();
  /* 当前窗口宽度，用于宽屏分支 */
  const { width: winWidth } = useWindowDimensions();
  const isWide = winWidth >= WIDE_BREAKPOINT;

  /* 真实音频播放引擎：替换 v1 的 mock playing/position */
  const radio = useRadioPlayer();
  const [faved, setFaved] = useState(false);
  const [petId, setPetId] = useState<string>('deepseek');
  const [petAction, setPetAction] = useState<PlayerControlAction | null>(null);
  const [petActionNonce, setPetActionNonce] = useState(0);

  function triggerPetAction(action: PlayerControlAction) {
    setPetAction(action);
    setPetActionNonce((value) => value + 1);
  }

  return (
    <View className="flex-1 bg-bg">
      {/* 第 1 层：点阵背景（全屏） */}
      <DotMatrixBackground />

      {/* 第 2 层：扫描线 + 高光带（全屏） */}
      <ScanlineOverlay />

      {/* 第 3 层：内容流（宽屏居中 + 限宽，移动端撑满） */}
      <ScrollView
        className="flex-1"
        contentContainerStyle={{
          paddingTop: insets.top,
          paddingBottom: insets.bottom,
          alignItems: isWide ? 'center' : 'stretch',
        }}
        showsVerticalScrollIndicator={false}
      >
        <View
          style={{
            width: '100%',
            maxWidth: isWide ? CONTENT_MAX_WIDTH : undefined,
          }}
        >
          {/* 顶部状态栏（带 AI 模型徽章，避免右下角宠物名遮挡正文） */}
          <TopBar modelName={DEFAULT_PETS.find((p) => p.id === petId)?.displayName} />

          {/* 时钟 + 日期 + ON AIR */}
          <View className="items-center pt-4 pb-6 px-4">
            <PixelClock />
            <View className="mt-3">
              <DateLine />
            </View>
            <View className="mt-3">
              <OnAirIndicator />
            </View>
          </View>

          {/* 当前曲信息条（受控位置 — 完全由 useRadioPlayer 驱动） */}
          <NowPlayingBar
            title={radio.track.title}
            artist={radio.track.artist}
            trackKey={radio.track.url}
            playing={radio.playing}
            position={radio.position}
            duration={radio.duration}
            state={radio.buffering ? 'BUFFERING' : undefined}
            showWaveform={false}
            onSeek={radio.seek}
          />

          {/* 律动主视觉：用户原版 48 根霓虹频谱条，跟随真实播放状态律动 */}
          <View className="px-4 pt-2 pb-3">
            <MusicSpectrum active={radio.playing} height={200} />
          </View>

          {/* 8 按钮控件 — 接到真实播放引擎 */}
          <PlayerControls
            playing={radio.playing}
            faved={faved}
            onPrev={radio.prev}
            onPlayPause={radio.toggle}
            onNext={radio.next}
            onStop={radio.stop}
            onFav={() => setFaved((f) => !f)}
            onActionFeedback={triggerPetAction}
          />

          {/* DJ 长文气泡 */}
          <DJBubble text={DJ_SCRIPT} time="21:02" live onReplay={() => undefined} />

          {/* 用户短回复气泡 */}
          <UserBubble text="好听" name="MMGUO" time="21:09" />

          {/* 占位高度，避免 ChatInput 紧贴底部 */}
          <View style={{ height: 16 }} />
        </View>
      </ScrollView>

      {/* 底部输入区 + 连接状态（脱离 ScrollView，常驻底部） */}
      <View style={{ alignItems: isWide ? 'center' : 'stretch' }}>
        <View
          style={{
            width: '100%',
            maxWidth: isWide ? CONTENT_MAX_WIDTH : undefined,
          }}
        >
          <ChatInput onSend={() => undefined} onMicPress={() => undefined} />
          <ConnectionStatus state="connected" />
        </View>
      </View>

      {/* 第 4 层：右下角浮动宠物切换器 */}
      <View
        style={{
          position: 'absolute',
          right: 12,
          bottom: 96 + insets.bottom,
        }}
        pointerEvents="box-none"
      >
        <PixelPetSwitcher
          currentId={petId}
          action={petAction}
          actionNonce={petActionNonce}
          onSwitch={setPetId}
          onLongPress={() => undefined}
        />
      </View>
    </View>
  );
}
