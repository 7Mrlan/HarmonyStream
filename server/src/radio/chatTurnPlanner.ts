/*
 * 聊天轮次规划器。
 * 只根据用户输入和当前播放上下文规划 ChatResponse / 队列 / session 意图，不读写 radioState。
 */

import type { ChatRequest, ChatResponse, ModelInfo, NowResponse, Track } from '@claudio/api';
import { generateDjResponse, generateMusicIntent, type GenerateMusicIntentResult } from '../llm/llmAdapter.js';
import { cloneTrack } from '../music/fallbackCatalog.js';
import { resolveTracksForChat } from '../music/musicResolver.js';
import {
  buildFallbackChatResponse,
  buildNoTrackChatResponse,
  buildQuickSongChatResponse,
} from './djCopy.js';
import {
  buildExplicitMusicIntent,
  buildGenreMusicIntent,
  parseExplicitSongRequest,
  parseGenericRecommendationRequest,
  parseGenreRecommendationRequest,
  parseMusicRequestKind,
} from './intentParser.js';
import { buildQueue, chooseTrackFromPlay } from './playbackQueue.js';
import {
  buildSessionIntent,
  getTargetQueueSize,
  type RadioSessionIntent,
} from './radioSession.js';

type SuccessfulMusicIntent = Extract<GenerateMusicIntentResult, { ok: true }>;

export interface ChatTurnPlanningContext {
  currentModel: ModelInfo;
  playbackState: NowResponse['state'];
  currentTrack: Track | null;
}

export type ChatTurnPlan =
  | {
      ok: true;
      response: ChatResponse;
      currentTrack: Track;
      queue: Track[];
      activeIntent: RadioSessionIntent;
      shouldScheduleTts: boolean;
    }
  | {
      ok: false;
      response: ChatResponse;
    };

/*
 * 构造聊天超时兜底文案。
 * radioState 只负责超时保留当前播放状态，具体主播话术仍留在聊天规划边界内。
 */
export function buildChatTimeoutResponse(text: string): ChatResponse {
  return buildNoTrackChatResponse(text, '外部音乐源解析超时，请稍后重试或换一个关键词。');
}

/*
 * 规划一轮用户聊天结果。
 * 成功分支返回可提交的新队列；失败分支只返回主播反馈，状态清理交给 radioState。
 */
export async function planChatTurn(request: ChatRequest, context: ChatTurnPlanningContext): Promise<ChatTurnPlan> {
  const text = request.text.trim();
  const explicitRequest = parseExplicitSongRequest(text);
  const genreRequest = explicitRequest ? null : parseGenreRecommendationRequest(text);
  const genericRecommendationRequest = explicitRequest || genreRequest ? null : parseGenericRecommendationRequest(text);
  const requestKind = parseMusicRequestKind(text, explicitRequest, genreRequest);
  const musicIntent = explicitRequest
    ? buildExplicitMusicIntent(explicitRequest)
    : genreRequest
      ? buildGenreMusicIntent(genreRequest)
      : await buildLlmFirstMusicIntent({
          text,
          genericRecommendationRequest,
          context,
        });

  const preferredTitles = musicIntent.ok ? musicIntent.intent.preferredTitles : [];
  const searchText = musicIntent.ok ? musicIntent.intent.searchQuery : text;
  const targetQueueSize = getTargetQueueSize(requestKind);
  const musicPlan = await resolveTracksForChat({
    userText: searchText || text,
    preferredTitles,
    limit: targetQueueSize,
  });
  const candidateTracks = musicPlan.tracks.map(cloneTrack);
  const selectedTrack = candidateTracks[0] ?? null;

  if (!selectedTrack) {
    return {
      ok: false,
      response: buildNoTrackChatResponse(text, buildMusicReason(musicPlan.reason, musicIntent)),
    };
  }

  const generated = explicitRequest
    ? null
    : await generateDjResponse({
        userText: text,
        modelId: context.currentModel.id,
        modelDisplayName: context.currentModel.displayName,
        playbackState: context.playbackState,
        currentTrack: context.currentTrack,
        selectedTrack,
        candidateTracks,
      });
  const response = generated?.ok
    ? generated.response
    : explicitRequest
      ? buildQuickSongChatResponse(text, selectedTrack, buildMusicReason(musicPlan.reason, musicIntent))
      : buildFallbackChatResponse(
          text,
          selectedTrack,
          context.currentModel.displayName,
          generated?.reason,
          buildMusicReason(musicPlan.reason, musicIntent),
        );
  const currentTrack = chooseTrackFromPlay(response.play, candidateTracks) ?? selectedTrack;
  const queue = buildQueue(currentTrack, candidateTracks);

  return {
    ok: true,
    response,
    currentTrack,
    queue,
    activeIntent: buildSessionIntent({
      userText: text,
      searchText: searchText || text,
      preferredTitles,
      requestKind,
      targetQueueSize,
      voiceEnabledAtChat: Boolean(request.voice),
    }),
    shouldScheduleTts: Boolean(request.voice),
  };
}

/*
 * 汇总音乐解析 reason。
 * 真实 LLM 意图失败不阻断电台，只作为内部 fallback 说明保留。
 */
function buildMusicReason(musicReason: string, musicIntent: GenerateMusicIntentResult): string {
  if (musicIntent.ok) {
    const titles = musicIntent.intent.preferredTitles.join(' / ') || '无明确歌名';
    return `${musicReason}；意图：${musicIntent.intent.searchQuery}；候选：${titles}`;
  }
  return `${musicReason}；意图 fallback：${musicIntent.reason}`;
}

/*
 * 泛推荐采用 LLM-first。
 * 有模型时让主播结合上下文决定搜索线索；LLM 不可用时再使用本地默认锚点，保证开源低配置也能闭环。
 */
async function buildLlmFirstMusicIntent({
  text,
  genericRecommendationRequest,
  context,
}: {
  text: string;
  genericRecommendationRequest: ReturnType<typeof parseGenericRecommendationRequest>;
  context: ChatTurnPlanningContext;
}): Promise<Awaited<ReturnType<typeof generateMusicIntent>>> {
  const generated = await generateMusicIntent({
    userText: text,
    modelId: context.currentModel.id,
    modelDisplayName: context.currentModel.displayName,
    playbackState: context.playbackState,
    currentTrack: context.currentTrack,
  });
  if (generated.ok || !genericRecommendationRequest) return generated;

  const fallback = buildGenreMusicIntent(genericRecommendationRequest) as SuccessfulMusicIntent;
  return {
    ...fallback,
    intent: {
      ...fallback.intent,
      note: `generic recommendation fallback after ${generated.reason}`,
    },
  };
}
