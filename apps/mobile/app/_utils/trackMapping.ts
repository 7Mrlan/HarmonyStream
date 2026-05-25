/*
 * 曲目映射工具
 * ------------
 * 服务端共享契约 Track 与移动端播放器 RadioTrack 字段不完全一致。
 * 这里集中做映射，避免 HomeScreen 混入字段转换细节。
 */

import type { Track } from '@claudio/api';
import type { RadioTrack } from '../_hooks/useRadioPlayer';

/*
 * 将服务端 Track 映射为播放器曲目。
 * 无 url 的曲目不能播放，返回 null 交给调用方过滤。
 */
export function mapApiTrackToRadioTrack(track: Track | null | undefined): RadioTrack | null {
  if (!track?.url) return null;

  return {
    id: track.id,
    url: track.url,
    title: track.title,
    artist: track.artist,
    artwork: track.artwork,
    durationFallback: track.duration,
  };
}

/*
 * 将服务端曲目数组映射为播放器列表。
 * 过滤空 track 和无 url 曲目，保证 useRadioPlayer 只接收可播放数据。
 */
export function mapApiTracksToRadioTracks(tracks: Array<Track | null | undefined>): RadioTrack[] {
  const mappedTracks: RadioTrack[] = [];

  for (const track of tracks) {
    const mappedTrack = mapApiTrackToRadioTrack(track);
    if (mappedTrack) mappedTracks.push(mappedTrack);
  }

  return mappedTracks;
}
