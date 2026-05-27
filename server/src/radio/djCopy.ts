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

/*
 * 构建切歌短播报 fallback。
 * 用于用户主动上一首 / 下一首后，LLM 不可用或超时时仍保持电台风格，不让 VOICE ON 变成空白。
 */
export function buildTrackSwitchChatResponse(
  track: Track,
  userText: string,
  cause: 'next' | 'previous',
): ChatResponse {
  const title = track.title.trim();
  const artist = track.artist?.trim();
  const songName = artist ? `${artist}的《${title}》` : `《${title}》`;
  const prompt = userText.trim() || '刚才这段频率';
  const directionText = cause === 'previous' ? '把指针拨回去' : '往前换一格';
  const templates = [
    `${directionText}，到 ${songName}。别急着跳，先听它开头怎么把节拍摆出来。`,
    `好，换 ${songName}。上一首如果太满，这首让耳朵重新找个落点。`,
    `收到，${songName} 接上。换的不只是歌名，是这一段的速度。`,
  ];
  const say = pickStableTemplate(templates, `switch:${cause}:${artist ?? ''}:${title}:${prompt}`);

  return {
    say,
    play: [title],
    reason: `根据当前电台意图“${prompt}”切换到 ${title}。`,
    segue: buildSongSegue(title, artist),
  };
}

/* 点歌 intro 不编事实背景，只做氛围和情绪承接。 */
function buildSongIntro(title: string, artist?: string): string {
  const songName = artist ? `${artist}的《${title}》` : `《${title}》`;
  const templates = [
    `收到，${songName}。这首别只当点歌反馈，先听它开头怎么把空间撑开；人声一站稳，整段情绪就会往里收。`,
    `好，切 ${songName}。它不是靠大嗓门抓人，重点在节奏和旋律怎么一点点贴近耳朵，先让前奏把位置摆好。`,
    `${songName}，安排。先别急着跳副歌，听人声怎么站住，再听后面的层次怎么慢慢压上来。`,
  ];
  return pickStableTemplate(templates, `${artist ?? ''}:${title}`);
}

/* 播放前过渡句同样避免固定“下面欣赏”，但语义保持“进入歌曲”。 */
function buildSongSegue(title: string, artist?: string): string {
  const songName = artist ? `${artist}的《${title}》` : `《${title}》`;
  const templates = [
    `进歌，${songName}。`,
    `${songName}，接住这一段。`,
    `来，听 ${songName}。`,
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

  return `${modelDisplayName} 收到“${prompt}”。先接 ${artist}《${track.title}》，不多解释，听它第一段怎么站住。`;
}
