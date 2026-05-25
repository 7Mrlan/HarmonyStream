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

import { useCallback, useEffect, useMemo, useRef, useState, type SetStateAction } from 'react';
import { AppState, ScrollView, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  createApiClient,
  type ModelInfo,
  type PlaybackCapabilities,
  type StreamEvent,
  type Track,
} from '@claudio/api';
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
  TrackArtworkPanel,
  UserBubble,
  type PlayerControlAction,
} from '@claudio/ui';
import { getApiBaseUrl } from './_config/api';
import { useNowPlayingMedia } from './_hooks/useNowPlayingMedia';
import { useRadioPlayer, type RadioTrack } from './_hooks/useRadioPlayer';
import { useStationController } from './_hooks/useStationController';
import { useTtsPlayer } from './_hooks/useTtsPlayer';
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
/* 主播 talk-over 时的背景音乐音量：保留氛围但不压住人声。 */
const TTS_DUCKING_VOLUME = 0.24;

type ConnectionState = 'connected' | 'connecting' | 'offline';

interface UserMessage {
  text: string;
  time: string;
}

const DEFAULT_PLAYBACK_CAPABILITIES: PlaybackCapabilities = {
  canPrevious: false,
  canNext: false,
  queueSize: 0,
  currentIndex: 0,
  canAutoRefill: false,
};

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

/* 生成播放器曲目的稳定 key，供 track-aware TTS 做二次校验。 */
function getRadioTrackKey(track: RadioTrack | null | undefined): string {
  return track?.id || track?.url || '';
}

/*
 * 旧服务端没有 playback 字段时的保守推断。
 * 只在 bootstrap 首屏使用；后续缺字段的 queue-update 会保持上一份 capability。
 */
function inferPlaybackCapabilitiesFromQueue(queueLength: number): PlaybackCapabilities {
  return {
    canPrevious: false,
    canNext: queueLength > 1,
    queueSize: queueLength,
    currentIndex: 0,
    canAutoRefill: false,
  };
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
  /* 服务端曲目队列。为空时播放器保持空信号，不播放本地 demo 曲。 */
  const [serverPlaylist, setServerPlaylist] = useState<RadioTrack[]>([]);
  /* Phase H：整站暂停态；暂停时换歌只换曲目信息，不自动出声。 */
  const [stationPaused, setStationPaused] = useState(false);
  /* 真实音频播放引擎：只消费服务端下发的真实曲目。 */
  const radio = useRadioPlayer(serverPlaylist, { autoPlayOnTrackChange: !stationPaused });
  const { setVolume } = radio;
  /* Phase F：把当前曲目同步给系统锁屏 / 媒体会话，用于后台播放和锁屏展示。 */
  useNowPlayingMedia({
    player: radio.lockScreenPlayer,
    track: radio.track,
    active: Boolean(radio.track.url),
  });
  /* Phase E：独立 TTS 播放器；与 radio 完全隔离，避免 DJ 一开口就打断当前歌曲 */
  const tts = useTtsPlayer();
  /* 播放器动画只在真实播放且未结束时运行，暂停/播完进入 idle 收尾态。 */
  const animationActive = radio.playing && !radio.ended;
  const [faved, setFaved] = useState(false);
  const [petId, setPetId] = useState<string>('deepseek');
  const [petAction, setPetAction] = useState<PlayerControlAction | null>(null);
  const [petActionNonce, setPetActionNonce] = useState(0);
  const [djText, setDjText] = useState(DEFAULT_DJ_TEXT);
  const [djTime, setDjTime] = useState('21:02');
  const [djLoading, setDjLoading] = useState(false);
  const [chatSending, setChatSending] = useState(false);
  const chatSendingRef = useRef(false);
  const [latestUserMessage, setLatestUserMessage] = useState<UserMessage | null>(null);
  const [connectionState, setConnectionState] = useState<ConnectionState>('connecting');
  const [failedArtworkUrl, setFailedArtworkUrl] = useState<string | null>(null);
  const [playbackCapabilities, setPlaybackCapabilities] = useState<PlaybackCapabilities>(
    DEFAULT_PLAYBACK_CAPABILITIES,
  );
  /* Phase E / H：VOICE 只决定主播是否自动播报，不再接管主播放按钮。 */
  const [ttsEnabled, setTtsEnabledState] = useState(false);
  const ttsEnabledRef = useRef(ttsEnabled);
  /*
   * VOICE 状态需要在“切换后立刻发送”的同一轮事件里可读。
   * 用同步 ref 做权威读取，避免 handleSend 读到上一帧闭包值。
   */
  const setTtsEnabled = useCallback((next: SetStateAction<boolean>) => {
    const nextValue = typeof next === 'function' ? next(ttsEnabledRef.current) : next;
    ttsEnabledRef.current = nextValue;
    setTtsEnabledState(nextValue);
  }, []);
  const currentModelName = getModelDisplayName(petId, models);
  const artworkUrl = radio.track.artwork;
  const showTrackArtwork = Boolean(artworkUrl && failedArtworkUrl !== artworkUrl);
  const artworkPanelSize = isWide ? 260 : 220;
  const currentTrackKey = getRadioTrackKey(radio.track);
  const currentTrackKeyRef = useRef(currentTrackKey);

  /*
   * WS 事件处理需要读取当前曲 key，但不能把它放进 handleStreamEvent 依赖。
   * 否则每次切歌都会重建 stream 订阅，造成 WebSocket 断开重连。
   */
  useEffect(() => {
    currentTrackKeyRef.current = currentTrackKey;
  }, [currentTrackKey]);

  /*
   * 封面加载失败时切回原时钟占位。
   * 失败 URL 单独记录，避免同一首歌内反复请求坏图。
   */
  const handleArtworkError = useCallback(() => {
    if (artworkUrl) setFailedArtworkUrl(artworkUrl);
  }, [artworkUrl]);

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
  const applyApiTracks = useCallback((tracks: Array<Track | null | undefined>, allowEmpty = false) => {
    const mappedTracks = mapApiTracksToRadioTracks(tracks);
    if (mappedTracks.length > 0 || allowEmpty) setServerPlaylist(mappedTracks);
  }, []);

  /*
   * 追加服务端返回的下一首。
   * 预热只扩展队列，不能替换当前 playlist，否则播放器会重置到新数组第 0 首并中断当前曲。
   */
  const appendApiTracks = useCallback((tracks: Array<Track | null | undefined>) => {
    const mappedTracks = mapApiTracksToRadioTracks(tracks);
    if (mappedTracks.length === 0) return;

    setServerPlaylist((playlist) => {
      const existingUrls = new Set(playlist.map((track) => track.url));
      const nextTracks = mappedTracks.filter((track) => !existingUrls.has(track.url));
      return nextTracks.length > 0 ? [...playlist, ...nextTracks] : playlist;
    });
  }, []);

  /*
   * 刷新当前曲和下一曲。
   * `/api/chat` 成功后调用，确保播放器拿到真实可播放 Track。
   */
  const refreshNowAndNext = useCallback(async () => {
    const [now, next] = await Promise.all([apiClient.getNow(), apiClient.getNext()]);
    applyApiTracks([now.track, next.track], true);
    setPlaybackCapabilities(
      now.playback ?? inferPlaybackCapabilitiesFromQueue([now.track, next.track].filter(Boolean).length),
    );
  }, [apiClient, applyApiTracks]);

  /*
   * Phase H：统一整站播放编排。
   * 页面层只把按钮和事件接到 controller，不再自己判断“当前按钮该控主播还是歌曲”。
   */
  const station = useStationController({
    apiClient,
    radio,
    voice: tts,
    voiceEnabled: ttsEnabled,
    setVoiceEnabled: setTtsEnabled,
    stationPaused,
    setStationPaused,
    applyApiTracks,
    setPlaybackCapabilities,
  });
  const { playVoice } = station;

  /*
   * 同一首歌只触发一次预热：用 ref 记录已经发起预热的 track url。
   * 进度达到 60% 或剩余时间不足 45 秒时调用 /api/next，让服务端有机会预热下一首。
   */
  const preloadedTrackUrlRef = useRef<string | null>(null);
  useEffect(() => {
    preloadedTrackUrlRef.current = null;
  }, [radio.track.url]);
  useEffect(() => {
    if (!radio.playing) return;
    if (radio.duration <= 0) return;
    if (preloadedTrackUrlRef.current === radio.track.url) return;

    const ratio = radio.position / radio.duration;
    const remaining = radio.duration - radio.position;
    const shouldPreload = ratio >= 0.6 || remaining <= 45;
    if (!shouldPreload) return;

    preloadedTrackUrlRef.current = radio.track.url;
    apiClient
      .getNext()
      .then((next) => {
        appendApiTracks([next.track]);
      })
      .catch(() => {
        /* 预热失败不影响当前播放，静默处理。 */
      });
  }, [apiClient, appendApiTracks, radio.duration, radio.playing, radio.position, radio.track.url]);

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
        setDjLoading(false);
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
        applyApiTracks(event.queue, true);
        if (event.playback) setPlaybackCapabilities(event.playback);
        return;
      }

      if (event.type === 'track-commentary') {
        if (event.trackId && event.trackId !== currentTrackKeyRef.current) return;
        setDjText(event.say);
        setDjTime(formatBubbleTime());
        setDjLoading(false);
        return;
      }

      if (event.type === 'tts-ready') {
        if (event.trackId && event.trackId !== currentTrackKeyRef.current) return;
        /*
         * Phase H：tts-ready 只交给整站 controller。
         * controller 会按 VOICE 与整站暂停状态决定是否自动播放主播。
         */
        const baseUrl = getApiBaseUrl();
        const fullUrl = /^https?:\/\//i.test(event.url) ? event.url : `${baseUrl}${event.url}`;
        playVoice(fullUrl);
      }
    },
    [applyApiTracks, playVoice],
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
        applyApiTracks([nowResponse.track], true);
        setPlaybackCapabilities(
          nowResponse.playback ?? inferPlaybackCapabilitiesFromQueue(nowResponse.track ? 1 : 0),
        );
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
        /*
         * Phase F：connectStream 已带指数退避自动重连；
         * onClose 不再切 'offline'，直接复用 'connecting' 表示"正在重连"。
         * UI 层 ConnectionStatus 只有三态，不为重连单独新增态。
         */
        if (!disposed) setConnectionState('connecting');
      },
      onError: () => {
        if (!disposed) setConnectionState((state) => (state === 'connected' ? 'connecting' : state));
      },
      onEvent: (event) => {
        if (!disposed) handleStreamEvent(event);
      },
    });

    /*
     * Phase F：App 从后台回到前台时，主动触发一次重连，
     * 不等指数退避计时器，可让用户立刻看到 connected。
     */
    const appStateSubscription = AppState.addEventListener('change', (next) => {
      if (disposed) return;
      if (next === 'active') {
        subscription.reconnectNow();
      }
    });

    void bootstrapApiState();

    return () => {
      disposed = true;
      appStateSubscription.remove();
      subscription.close();
    };
  }, [apiClient, applyApiTracks, handleStreamEvent]);

  /*
   * TTS ducking：主播说话期间把音乐音量降到 0.24，结束后恢复 1.0。
   * 这里控制的是音量，不改变音乐音调；talk-over 更符合电台听感。
   * 仅观察 tts.playing 切换；setVolume 内部已做平台兜底。
   */
  useEffect(() => {
    setVolume(station.musicDucked ? TTS_DUCKING_VOLUME : 1);
  }, [setVolume, station.musicDucked]);

  /*
   * 发送用户输入到服务端。
   * 成功后更新 DJ 文案和播放器曲目；失败时用 DJ 气泡反馈离线状态。
   * Phase E：根据 ttsEnabled 透传 voice 字段，让服务端按需异步合成 TTS。
   */
  const handleSend = useCallback(
    async (text: string) => {
      if (chatSendingRef.current) return;
      const sentAt = formatBubbleTime();
      chatSendingRef.current = true;
      setChatSending(true);
      setConnectionState('connecting');
      setDjLoading(true);
      setDjTime(sentAt);
      setLatestUserMessage({ text, time: sentAt });

      try {
        const response = await apiClient.sendChat({ text, voice: ttsEnabledRef.current });
        setDjText(response.say);
        setDjTime(formatBubbleTime());
        setDjLoading(false);
        setConnectionState('connected');
        await refreshNowAndNext();
      } catch {
        setDjText('Claudio 服务端暂时没有回应。请确认后端已启动，然后再发一次信号。');
        setDjTime(formatBubbleTime());
        setDjLoading(false);
        setConnectionState('offline');
      } finally {
        chatSendingRef.current = false;
        setChatSending(false);
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

          {/* 封面 / 时钟 + ON AIR：有歌曲封面时优先展示封面，失败时回退时钟。 */}
          <View className="items-center pt-4 pb-6 px-4">
            {showTrackArtwork ? (
              <TrackArtworkPanel
                artwork={artworkUrl}
                title={radio.track.title}
                artist={radio.track.artist}
                playing={animationActive}
                size={artworkPanelSize}
                onArtworkError={handleArtworkError}
              />
            ) : (
              <>
                <PixelClock />
                <View className="mt-3">
                  <DateLine />
                </View>
              </>
            )}
            <View className="mt-3">
              <OnAirIndicator />
            </View>
          </View>

          {/* 当前曲信息条（受控位置 — 完全由 useRadioPlayer 驱动） */}
          <NowPlayingBar
            title={radio.track.title}
            artist={radio.track.artist}
            playing={radio.playing}
            state={radio.error ? 'ERROR' : radio.buffering ? 'BUFFERING' : undefined}
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
            playing={station.stationPlaying}
            ended={radio.ended}
            faved={faved}
            prevDisabled={!playbackCapabilities.canPrevious}
            nextDisabled={!playbackCapabilities.canNext}
            onPrev={station.previousTrack}
            onPlayPause={station.toggleStation}
            onNext={station.nextTrack}
            onStop={station.stopStation}
            onFav={() => setFaved((f) => !f)}
            onActionFeedback={triggerPetAction}
          />

          {/* DJ 长文气泡 */}
          <DJBubble
            text={djText}
            time={djTime}
            live
            loading={djLoading}
            voiceActive={ttsEnabled}
            voiceDisabled={chatSending}
            onVoiceToggle={station.toggleVoiceEnabled}
            onReplay={station.replayVoice}
          />

          {/* 用户短回复气泡 */}
          {latestUserMessage ? (
            <UserBubble text={latestUserMessage.text} name="MMGUO" time={latestUserMessage.time} />
          ) : null}

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
          <ChatInput sending={chatSending} onSend={handleSend} onMicPress={() => undefined} />
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
