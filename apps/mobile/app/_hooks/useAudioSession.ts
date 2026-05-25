/*
 * Hook：useAudioSession
 * ---------------------
 * Phase F：进程内只调用一次 expo-audio 的 setAudioModeAsync，
 * 保证 useRadioPlayer / useTtsPlayer 共享同一份"后台可放、静音键不静音"的会话规则。
 *
 * 字段以 expo-audio 当前安装版本的 Audio.types.ts > AudioMode 为准（不要照抄 docs.expo.dev/latest）：
 *   - playsInSilentMode：iOS 静音键不会让电台静音（电台主诉求）
 *   - shouldPlayInBackground：Android 锁屏 / Home 后音乐继续（搭配前台服务权限）
 *   - interruptionMode='doNotMix'：expo-audio 锁屏控件要求独占音频焦点
 *   - shouldRouteThroughEarpiece=false：避免误走听筒（电台需要外放）
 *   - allowsRecording=false：当前没有录音链路，不申请录音会话
 *
 * TTS ducking 由应用内 radio.setVolume 完成，不依赖系统级 duckOthers。
 * 失败完全静默：会话配置失败不阻塞 UI；设备不支持时让默认行为兜底。
 */

import { useEffect } from 'react';
import { setAudioModeAsync } from 'expo-audio';

/* 进程内只配置一次的标记，避免热重载或多 mount 触发重复调用。 */
let configured = false;

/*
 * 在根布局调用即可，没有返回值。
 * 多次调用幂等：第一次成功后后续调用直接返回。
 */
export function useAudioSession(): void {
  useEffect(() => {
    if (configured) return;
    configured = true;
    void (async () => {
      try {
        await setAudioModeAsync({
          playsInSilentMode: true,
          shouldPlayInBackground: true,
          interruptionMode: 'doNotMix',
          shouldRouteThroughEarpiece: false,
          allowsRecording: false,
        });
      } catch {
        /* 静默：部分平台 / Web fallback 不支持完整选项；保留默认行为即可。 */
        configured = false;
      }
    })();
  }, []);
}
