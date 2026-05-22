/*
 * 主电台屏 index.tsx
 * ------------------
 * Iter 1：组装 13 个核心组件还原效果图整屏
 *   层级（z 轴从下到上）：
 *     1. DotMatrixBackground   点阵背景
 *     2. 内容流（顶 → 底）    TopBar / Clock / OnAir / DateLine
 *                              / NowPlayingBar / PlayerControls
 *                              / DJBubble / UserBubble / ChatInput / Connection
 *     4. PixelPetSwitcher     右下角浮层（漂浮 + 眨眼 + 招呼气泡）
 *
 * 布局：宽屏（>= 768）下内容居中、最大宽度 720，避免 PC 端松散
 *      暗色 + 像素风的"门面感"必须由收紧的窗口来撑
 *
 * 数据：v1 全部使用 mock，Iter 2 起接入真实播放与对话
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ScrollView, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { createApiClient, type ModelInfo, type StreamEvent, type Track } from '@claudio/api';
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
  PlaybackProgressBar,
  PlayerControls,
  TopBar,
  UserBubble,
  type PlayerControlAction,
} from '@claudio/ui';
import { getApiBaseUrl } from './_config/api';
import { useRadioPlayer, type RadioTrack } from './_hooks/useRadioPlayer';
import { mapApiTrackToRadioTrack, mapApiTracksToRadioTracks } from './_utils/trackMapping';

/* DJ 默认文案：服务端未接入前的首屏提示，不再作为业务响应来源 */
const DEFAULT_DJ_TEXT =
  "This is Claudio. It's late on a Monday, and here's a song that moves with your breath. " +
  'Back in 1974, David Gates picked up a nylon-string guitar and let every line end in a whisper - ' +
  "you'll feel yourself lift off the ground a little. This one's called If. " +
  'After a long day with Claude Code, just breathe.';

/* 宽屏阈值，超过后启用居中收紧布局 */
const WIDE_BREAKPOINT = 768;
/* PC 端内容最大宽度，超出留白填补氛围 */
const CONTENT_MAX_WIDTH = 720;

type ConnectionState = 'connected' | 'connecting' | 'offline';

/*
 * 生成当前 UI 时间戳。
 * DJ 气泡只需要轻量展示，不参与服务端协议。
 */
function formatBubbleTime(date = new Date()): string {
  const hours = `${date.getHours()}`.padStart(2, '0');
  const minutes = `${date.getMinutes()}`.padStart(2, '0');
  return `${hours}:${minutes}`;
}

/*
 * 按模型 id 获取展示名。
 * 优先使用服务端 `/api/models` 返回值，失败时回退本地宠物配置。
 */
function getModelDisplayName(modelId: string, models: ModelInfo[]): string | undefined {
  return (
    models.find((model) => model.id === modelId)?.displayName ??
    DEFAULT_PETS.find((pet) => pet.id === modelId)?.displayName
  );
}

export default function HomeScreen() {
  /* 安全区，避免顶部刘海 / 底部 home 条遮挡 */
  const insets = useSafeAreaInsets();
  /* 当前窗口宽度，用于宽屏分支 */
  const { width: winWidth } = useWindowDimensions();
  const isWide = winWidth >= WIDE_BREAKPOINT;

  /* Claudio API client：集中读取 base URL，页面不散写 fetch 地址 */
  const apiClient = useMemo(() => createApiClient({ baseUrl: getApiBaseUrl() }), []);
  /* 服务端模型列表，控制 TopBar 和宠物切换 */
  const [models, setModels] = useState<ModelInfo[]>([]);
  /* 服务端曲目队列，非空时覆盖本地 SoundHelix 默认列表 */
  const [serverPlaylist, setServerPlaylist] = useState<RadioTrack[]>([]);
  /* 真实音频播放引擎：替换 v1 的 mock playing/position */
  const radio = useRadioPlayer(serverPlaylist.length > 0 ? serverPlaylist : undefined);
  /* 播放器动画只在真实播放且未结束时运行，暂停/播完进入 idle 收尾态。 */
  const animationActive = radio.playing && !radio.ended;
  const [faved, setFaved] = useState(false);
  const [petId, setPetId] = useState<string>('deepseek');
  const [petAction, setPetAction] = useState<PlayerControlAction | null>(null);
  const [petActionNonce, setPetActionNonce] = useState(0);
  const [djText, setDjText] = useState(DEFAULT_DJ_TEXT);
  const [djTime, setDjTime] = useState('21:02');
  const [djTyping, setDjTyping] = useState(false);
  const [connectionState, setConnectionState] = useState<ConnectionState>('connecting');
  const currentModelName = getModelDisplayName(petId, models);

  /*
   * 播放器按钮触发宠物反馈。
   * actionNonce 用于让同一个动作重复触发动画。
   */
  function triggerPetAction(action: PlayerControlAction) {
    setPetAction(action);
    setPetActionNonce((value) => value + 1);
  }

  /*
   * 用服务端曲目刷新播放器队列。
   * 只接受有 url 的 Track，避免播放器收到不可播放条目。
   */
  const applyApiTracks = useCallback((tracks: Array<Track | null | undefined>) => {
    const mappedTracks = mapApiTracksToRadioTracks(tracks);
    if (mappedTracks.length > 0) setServerPlaylist(mappedTracks);
  }, []);

  /*
   * 刷新当前曲和下一曲。
   * `/api/chat` 成功后调用，确保播放器拿到真实可播放 Track。
   */
  const refreshNowAndNext = useCallback(async () => {
    const now = await apiClient.getNow();
    const next = await apiClient.getNext();
    applyApiTracks([now.track, next.track]);
  }, [apiClient, applyApiTracks]);

  /*
   * 处理服务端 WS 事件。
   * WS 是增强链路，收到事件时同步 DJ 文案、当前曲和队列。
   */
  const handleStreamEvent = useCallback(
    (event: StreamEvent) => {
      setConnectionState('connected');

      if (event.type === 'chat-token' && event.final) {
        setDjText(event.text);
        setDjTime(formatBubbleTime());
        setDjTyping(false);
        return;
      }

      if (event.type === 'now-playing') {
        const mappedTrack = mapApiTrackToRadioTrack(event.track);
        if (mappedTrack) {
          setServerPlaylist((playlist) => [
            mappedTrack,
            ...playlist.filter((track) => track.url !== mappedTrack.url),
          ]);
        }
        return;
      }

      if (event.type === 'queue-update') {
        applyApiTracks(event.queue);
      }
    },
    [applyApiTracks],
  );

  useEffect(() => {
    let disposed = false;

    /*
     * 初始化服务端状态。
     * HTTP 成功即可判定主链路可用；WS 失败不会阻塞首屏。
     */
    async function bootstrapApiState() {
      setConnectionState('connecting');

      try {
        const [modelsResponse, nowResponse] = await Promise.all([
          apiClient.getModels(),
          apiClient.getNow(),
        ]);

        if (disposed) return;
        setModels(modelsResponse.available);
        setPetId(modelsResponse.current);
        applyApiTracks([nowResponse.track]);
        setConnectionState('connected');
      } catch {
        if (disposed) return;
        setConnectionState('offline');
        setDjText('Claudio 服务端暂时未连接。请先启动后端，再发送电台信号。');
        setDjTime(formatBubbleTime());
      }
    }

    const subscription = apiClient.connectStream({
      onOpen: () => {
        if (!disposed) setConnectionState('connected');
      },
      onClose: () => {
        if (!disposed) setConnectionState((state) => (state === 'connecting' ? 'offline' : state));
      },
      onError: () => {
        if (!disposed) setConnectionState((state) => (state === 'connecting' ? 'offline' : state));
      },
      onEvent: (event) => {
        if (!disposed) handleStreamEvent(event);
      },
    });

    void bootstrapApiState();

    return () => {
      disposed = true;
      subscription.close();
    };
  }, [apiClient, applyApiTracks, handleStreamEvent]);

  /*
   * 发送用户输入到服务端。
   * 成功后更新 DJ 文案和播放器曲目；失败时用 DJ 气泡反馈离线状态。
   */
  const handleSend = useCallback(
    async (text: string) => {
      setConnectionState('connecting');
      setDjTyping(true);
      setDjText('Claudio 正在接入服务端信号...');
      setDjTime(formatBubbleTime());

      try {
        const response = await apiClient.sendChat({ text });
        setDjText(response.say);
        setDjTime(formatBubbleTime());
        setDjTyping(false);
        setConnectionState('connected');
        await refreshNowAndNext();
      } catch {
        setDjText('Claudio 服务端暂时没有回应。请确认后端已启动，然后再发一次信号。');
        setDjTime(formatBubbleTime());
        setDjTyping(false);
        setConnectionState('offline');
      }
    },
    [apiClient, refreshNowAndNext],
  );

  /*
   * 切换服务端模型。
   * 服务端是权威来源；失败时回滚本地宠物 id。
   */
  const handlePetSwitch = useCallback(
    async (nextId: string) => {
      const previousId = petId;
      setPetId(nextId);
      setConnectionState('connecting');

      try {
        const switchResult = await apiClient.switchModel(nextId);
        if (!switchResult.ok) throw new Error('模型切换失败');

        const modelsResponse = await apiClient.getModels();
        setModels(modelsResponse.available);
        setPetId(modelsResponse.current);
        setConnectionState('connected');
      } catch {
        setPetId(previousId);
        setConnectionState('offline');
        setDjText('模型切换失败。Claudio 已保留当前模型，等服务端恢复后再试。');
        setDjTime(formatBubbleTime());
      }
    },
    [apiClient, petId],
  );

  return (
    <View className="flex-1 bg-bg">
      {/* 第 1 层：点阵背景（全屏） */}
      <DotMatrixBackground />

      {/* 第 2 层：内容流（宽屏居中 + 限宽，移动端撑满） */}
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
          <TopBar modelName={currentModelName} />

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
            playing={radio.playing}
            state={radio.buffering ? 'BUFFERING' : undefined}
          />

          {/* 律动主视觉：用户原版 48 根霓虹频谱条，跟随真实播放状态律动 */}
          <View className="px-4 pt-2 pb-3">
            <MusicSpectrum active={animationActive} ended={radio.ended} height={200} />
          </View>

          {/* Reanimated 播放进度条：位于频谱与控件之间，拖动结束后再提交真实 seek */}
          <View className="px-4 pb-3">
            <PlaybackProgressBar
              position={radio.position}
              duration={radio.duration}
              playing={animationActive}
              ended={radio.ended}
              trackKey={radio.track.url}
              onSeek={radio.seek}
            />
          </View>

          {/* 8 按钮控件 — 接到真实播放引擎 */}
          <PlayerControls
            playing={animationActive}
            ended={radio.ended}
            faved={faved}
            onPrev={radio.prev}
            onPlayPause={radio.toggle}
            onNext={radio.next}
            onStop={radio.stop}
            onFav={() => setFaved((f) => !f)}
            onActionFeedback={triggerPetAction}
          />

          {/* DJ 长文气泡 */}
          <DJBubble text={djText} time={djTime} live typing={djTyping} onReplay={() => undefined} />

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
          <ChatInput onSend={handleSend} onMicPress={() => undefined} />
          <ConnectionStatus state={connectionState} />
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
          onSwitch={handlePetSwitch}
          onLongPress={() => undefined}
        />
      </View>
    </View>
  );
}
