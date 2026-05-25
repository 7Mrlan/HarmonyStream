/*
 * DJ 文案模板。
 * 只负责构造 fallback / 快速主播文案，不读写 radioState。
 */

import type { ChatResponse, Track } from '@claudio/api';

/* 明确点歌的快速主播文案：保持电台主播口吻，不暴露音源、LLM、系统状态。 */
export function buildQuickSongChatResponse(text: string, track: Track, musicReason: string): ChatResponse {
  const artist = track.artist?.trim();
  const title = track.title.trim();
  const intro = buildSongIntro(title, artist);

  return {
    say: intro,
    play: [title],
    reason: musicReason,
    segue: buildSongSegue(title, artist),
  };
}

/*
 * 构建 fallback ChatResponse。
 * 这里 fallback 的是主播文案，不是音乐源；曲目仍必须来自真实解析结果。
 */
export function buildFallbackChatResponse(
  text: string,
  track: Track,
  modelDisplayName: string,
  llmFallbackReason?: string,
  musicFallbackReason?: string,
): ChatResponse {
  const reason = `根据“${text || '今晚随便听点'}”选择当前可播放的真实曲目：${track.title}。`;
  const fallbackDetails = [llmFallbackReason, musicFallbackReason].filter(Boolean).join('；');

  return {
    say: buildMockDjScript(text, track, modelDisplayName),
    play: [track.title],
    reason: fallbackDetails ? `${reason} fallback：${fallbackDetails}。` : reason,
    segue: buildSongSegue(track.title, track.artist),
  };
}

/*
 * 真实音源没有返回可播放曲目时的用户反馈。
 * 不把测试曲塞进 play，避免页面误以为已经播放了用户点的歌。
 */
export function buildNoTrackChatResponse(text: string, musicFallbackReason: string): ChatResponse {
  const requested = text || '这首歌';
  return {
    say: `这首《${requested}》今晚暂时没有接上清晰信号，我先不硬切进来。你可以换个歌名或歌手写法，我再帮你重新搜一遍频率。`,
    play: [],
    reason: musicFallbackReason,
    segue: '这一路信号先留白。',
  };
}

/* 点歌 intro 不编事实背景，只做氛围和情绪承接。 */
function buildSongIntro(title: string, artist?: string): string {
  const songName = artist ? `${artist}的《${title}》` : `《${title}》`;
  const templates = [
    `收到，这一首 ${songName} 接进来。把手边的事先放慢一点，跟着前奏的光往前走。`,
    `好，今晚这段电台时间交给 ${songName}。别急着说话，先让旋律自己把画面铺开。`,
    `${songName}，安排上。适合把音量留给耳朵，也留一点空白给刚刚想到的人。`,
  ];
  return pickStableTemplate(templates, `${artist ?? ''}:${title}`);
}

/* 播放前过渡句同样避免固定“下面欣赏”，但语义保持“进入歌曲”。 */
function buildSongSegue(title: string, artist?: string): string {
  const songName = artist ? `${artist}的《${title}》` : `《${title}》`;
  const templates = [
    `我们把夜色交给 ${songName}。`,
    `这一刻，让 ${songName} 往前开。`,
    `现在进歌，${songName}。`,
  ];
  return pickStableTemplate(templates, `segue:${artist ?? ''}:${title}`);
}

/* 用曲名稳定选模板，避免同一首歌刷新后语气跳来跳去。 */
function pickStableTemplate(templates: string[], key: string): string {
  let hash = 0;
  for (let index = 0; index < key.length; index += 1) {
    hash = (hash * 31 + key.charCodeAt(index)) >>> 0;
  }
  return templates[hash % templates.length] ?? templates[0] ?? '';
}

/*
 * 构建 mock DJ 播报。
 * 文案保持稳定结构，方便 LLM 失败时做 UI 回退。
 */
function buildMockDjScript(text: string, track: Track, modelDisplayName: string): string {
  const prompt = text || '今晚随便听点';
  const artist = track.artist ? `${track.artist}的` : '';

  return `${modelDisplayName} 在 Claudio 的夜间频率里收到“${prompt}”。这一首 ${artist}《${track.title}》先接上，愿它刚好落在你现在的心情旁边。`;
}
