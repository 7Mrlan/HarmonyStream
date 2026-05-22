---
name: track-player-audio
description: 实现音频播放、后台播放、锁屏控制、媒体通知时触发。
keywords: [audio, player, background, lockscreen, notification, track-player]
---

# 音频播放与后台控制（Claudio 项目）

## 技术选型
- **原生（Android/iOS）**：`react-native-track-player` v4+ — 后台播放、锁屏、通知栏的事实标准
- **Web 兜底**：HTML5 `<audio>`，封装为同一接口
- **抽象层**：`packages/core/playback/PlaybackEngine.ts` 统一接口，平台分别实现

## 安装
```
npx expo install react-native-track-player
# expo 需要 prebuild（Expo Go 跑不了 TrackPlayer，必须 dev-client）
npx expo prebuild
```

## 接口约定（packages/core/playback/types.ts）
```ts
/* 抽象播放引擎接口，所有平台必须实现 */
export interface PlaybackEngine {
  setup(): Promise<void>;
  load(track: Track): Promise<void>;
  play(): Promise<void>;
  pause(): Promise<void>;
  stop(): Promise<void>;
  seekTo(seconds: number): Promise<void>;
  setQueue(tracks: Track[]): Promise<void>;
  skipToNext(): Promise<void>;
  on(event: PlaybackEvent, cb: (data?: any) => void): () => void;
}

export interface Track {
  id: string;
  url: string;
  title: string;
  artist?: string;
  artwork?: string;
  duration?: number;
}
```

## Android/iOS 实现要点

### 服务注册（必须，不然后台播放会断）
```ts
/* index.ts 顶层 */
import TrackPlayer from 'react-native-track-player';
import { PlaybackService } from './service';
TrackPlayer.registerPlaybackService(() => PlaybackService);
```

```ts
/* service.ts */
import TrackPlayer, { Event } from 'react-native-track-player';
export async function PlaybackService() {
  TrackPlayer.addEventListener(Event.RemotePlay, () => TrackPlayer.play());
  TrackPlayer.addEventListener(Event.RemotePause, () => TrackPlayer.pause());
  TrackPlayer.addEventListener(Event.RemoteNext, () => TrackPlayer.skipToNext());
  TrackPlayer.addEventListener(Event.RemotePrevious, () => TrackPlayer.skipToPrevious());
  TrackPlayer.addEventListener(Event.RemoteStop, () => TrackPlayer.stop());
  TrackPlayer.addEventListener(Event.RemoteSeek, (e) => TrackPlayer.seekTo(e.position));
}
```

### 初始化能力配置
```ts
import TrackPlayer, { Capability, AppKilledPlaybackBehavior } from 'react-native-track-player';

await TrackPlayer.setupPlayer({
  /* iOS 需要的音频会话配置 */
  iosCategory: 'playback',
});
await TrackPlayer.updateOptions({
  android: {
    appKilledPlaybackBehavior: AppKilledPlaybackBehavior.ContinuePlayback,
  },
  capabilities: [
    Capability.Play,
    Capability.Pause,
    Capability.SkipToNext,
    Capability.SkipToPrevious,
    Capability.SeekTo,
  ],
  compactCapabilities: [Capability.Play, Capability.Pause, Capability.SkipToNext],
  /* 通知栏小图标，必须放 android/app/src/main/res/drawable */
  icon: require('../assets/notification-icon.png'),
});
```

## Web 实现（packages/core/playback/web.ts）
```ts
/* 用单例 HTMLAudioElement 模拟，无后台播放（浏览器限制） */
class WebPlaybackEngine implements PlaybackEngine {
  private audio = new Audio();
  /* 监听 timeupdate / ended / error 等事件，转换为统一事件 */
}
```

## Hook 封装（apps/mobile 直接用）
```ts
/* packages/core/hooks/usePlayback.ts */
export function usePlayback() {
  const { state, position, duration } = useProgress();
  const play = useCallback(() => engine.play(), []);
  const pause = useCallback(() => engine.pause(), []);
  return { state, position, duration, play, pause };
}
```

## 网易云直链（来自施工图）
- 后端 `NeteaseCloudMusicApi` 提供 `song_url` 接口
- 直链有时效，必须每次播放前请求新链接
- 失败时降级到 30s 试听（`song/url?br=128000`）

## 锁屏与通知封面
- 必须传 `artwork` 字段，url 必须 https
- 本地资源不行（iOS 不识别 file://），用 CDN 或服务端代理
- 推荐尺寸 ≥ 512×512

## 缓存策略
- 直链不缓存（有时效）
- 元数据（标题、艺人、时长）用 react-query 缓存 1h
- 封面图由 expo-image 自动磁盘缓存

## 禁止事项
- 禁止用 `expo-av` 做主播放器（不支持后台和锁屏控制）
- 禁止在组件内直接调 TrackPlayer，必须经 `PlaybackEngine` 接口
- 禁止把 Token/Cookie 拼进 url，统一走 `packages/api` 拦截器
