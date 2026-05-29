/*
 * Claudio 生命状态推导
 * --------------------
 * 只把移动端已有播放、语音、连接和等待状态归一成展示态。
 * 这里不能反向控制播放器、TTS 或网络，也不能泄露到公开 API。
 */

export type ClaudioLifeState =
  | 'offline'
  | 'connecting'
  | 'tuning'
  | 'speaking'
  | 'listening'
  | 'sleeping'
  | 'breathing';

export type ClaudioLifeConnectionState = 'connected' | 'connecting' | 'offline';

export interface ClaudioLifeStateInput {
  /* 当前服务端连接态。 */
  connectionState: ClaudioLifeConnectionState;
  /* 是否正在等待 DJ / LLM / 调频结果。 */
  djLoading: boolean;
  /* 是否正在提交用户输入。 */
  chatSending: boolean;
  /* 主播 TTS 是否正在播放。 */
  voiceSpeaking: boolean;
  /* 音乐是否因为主播说话而 ducking。 */
  musicDucked: boolean;
  /* 背景音乐是否正在播放且未结束。 */
  listening: boolean;
  /* 用户是否把整站暂停到静息态。 */
  stationPaused: boolean;
  /* 整站当前是否仍有歌曲或主播活动。 */
  stationPlaying: boolean;
}

/*
 * 按固定优先级推导 Claudio 当前生命状态。
 * 优先级必须集中在这里，避免 JSX 里散落条件导致状态互相打架。
 */
export function deriveClaudioLifeState(input: ClaudioLifeStateInput): ClaudioLifeState {
  if (input.connectionState === 'offline') return 'offline';
  if (input.connectionState === 'connecting') return 'connecting';
  if (input.djLoading || input.chatSending) return 'tuning';
  if (input.voiceSpeaking || input.musicDucked) return 'speaking';
  if (input.listening) return 'listening';
  if (input.stationPaused && !input.stationPlaying) return 'sleeping';
  return 'breathing';
}
