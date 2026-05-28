/*
 * 聊天轮次规划器。
 * 只根据用户输入和当前播放上下文规划 ChatResponse / 队列 / session 意图，不读写 radioState。
 */

import type { ChatRequest, ChatResponse, ModelInfo, NowResponse, Track } from '@claudio/api';
import {
  generateDjResponse,
  generateMusicIntent,
  type GenerateMusicIntentResult,
} from '../llm/llmAdapter.js';
import { cloneTrack } from '../music/fallbackCatalog.js';
import { resolveTracksForChat } from '../music/musicResolver.js';
import type { MusicSearchSeed } from '../music/types.js';
import { assemblePersonalContext } from '../personal/contextAssembler.js';
import {
  applyCriticReportToResponse,
  attachResidentDjPlanToPersonalContext,
  buildResidentDjPlanAsync,
  curatedCandidatesToSeeds,
  curatedCandidatesToTitles,
  reviewDjHostResponse,
} from '../personal/residentDj.js';
import type { CuratedCandidate, PersonalContext, ResidentDjPlan } from '../personal/profileTypes.js';
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
import { buildSessionIntent, getTargetQueueSize, type RadioSessionIntent } from './radioSession.js';

type SuccessfulMusicIntent = Extract<GenerateMusicIntentResult, { ok: true }>;

export interface ChatTurnPlanningContext {
  currentModel: ModelInfo;
  playbackState: NowResponse['state'];
  currentTrack: Track | null;
  recentTracks?: Track[];
  now?: Date;
  profileDir?: string;
}

export type ChatTurnPlan =
  | {
      ok: true;
      response: ChatResponse;
      currentTrack: Track;
      queue: Track[];
      activeIntent: RadioSessionIntent;
      shouldScheduleTts: boolean;
      personalContext: PersonalContext;
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
export async function planChatTurn(
  request: ChatRequest,
  context: ChatTurnPlanningContext,
): Promise<ChatTurnPlan> {
  const text = request.text.trim();
  const explicitRequest = parseExplicitSongRequest(text);
  const genreRequest = explicitRequest ? null : parseGenreRecommendationRequest(text);
  const genericRecommendationRequest =
    explicitRequest || genreRequest ? null : parseGenericRecommendationRequest(text);
  const requestKind = parseMusicRequestKind(text, explicitRequest, genreRequest);
  const personalContext = await assemblePersonalContext({
    userText: text,
    currentTrack: context.currentTrack,
    recentTracks: context.recentTracks ?? [],
    now: context.now,
    profileDir: context.profileDir,
  });
  const residentDjPlan = explicitRequest
    ? null
    : await buildResidentDjPlanAsync({
        userText: text,
        personalContext,
        requestKind,
      });
  const promptPersonalContext = residentDjPlan
    ? attachResidentDjPlanToPersonalContext(personalContext, residentDjPlan)
    : personalContext;
  if (residentDjPlan?.diagnostics?.fallbackReasons.length) {
    console.warn(
      `[resident-dj] agent fallback: ${residentDjPlan.diagnostics.fallbackReasons.join('；')}`,
    );
  }
  const musicIntent = explicitRequest
    ? buildExplicitMusicIntent(explicitRequest)
    : residentDjPlan?.curatedCandidates.length
      ? buildResidentDjMusicIntent(residentDjPlan)
      : genreRequest
        ? buildContextualGenreMusicIntent(genreRequest, text, promptPersonalContext)
        : await buildLlmFirstMusicIntent({
            text,
            genericRecommendationRequest,
            context,
            personalContext: promptPersonalContext,
          });

  const residentSeeds = residentDjPlan
    ? curatedCandidatesToSeeds(residentDjPlan.curatedCandidates)
    : [];
  const residentTitles = residentDjPlan
    ? curatedCandidatesToTitles(residentDjPlan.curatedCandidates)
    : [];
  const personalSeeds = explicitRequest
    ? []
    : residentSeeds;
  const intentTitles = musicIntent.ok ? musicIntent.intent.preferredTitles : [];
  const preferredTitles = explicitRequest
    ? intentTitles
    : mergePreferredTitles(residentTitles, intentTitles);
  const preferredSeeds = explicitRequest
    ? buildExplicitSeeds(explicitRequest)
    : mergePreferredSeeds(personalSeeds, intentTitles);
  const searchText = musicIntent.ok ? musicIntent.intent.searchQuery : text;
  const targetQueueSize = explicitRequest
    ? getTargetQueueSize(requestKind)
    : (residentDjPlan?.turnPlan.targetCount ?? getTargetQueueSize(requestKind));
  const musicPlan = await resolveTracksForChat({
    userText: searchText || text,
    preferredTitles,
    preferredSeeds,
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
        requestKind,
        personalContext: promptPersonalContext,
      });
  const response = generated?.ok
    ? generated.response
    : explicitRequest
      ? buildQuickSongChatResponse(
          text,
          selectedTrack,
          buildMusicReason(musicPlan.reason, musicIntent),
          personalContext,
        )
      : buildFallbackChatResponse(
          text,
          selectedTrack,
          context.currentModel.displayName,
          generated?.reason,
          buildMusicReason(musicPlan.reason, musicIntent),
          promptPersonalContext,
        );
  const criticReport =
    residentDjPlan && !explicitRequest
      ? reviewDjHostResponse({
          response,
          turnPlan: residentDjPlan.turnPlan,
          selectedTrack,
          hasUserData: personalContext.hasUserData,
        })
      : null;
  const reviewedResponse = criticReport
    ? applyCriticReportToResponse(response, criticReport, selectedTrack)
    : response;
  const currentTrack = chooseTrackFromPlay(reviewedResponse.play, candidateTracks) ?? selectedTrack;
  const queue = buildQueue(currentTrack, candidateTracks);

  return {
    ok: true,
    response: reviewedResponse,
    currentTrack,
    queue,
    activeIntent: buildSessionIntent({
      userText: text,
      searchText: searchText || text,
      preferredTitles,
      preferredSeeds,
      requestKind,
      targetQueueSize,
      voiceEnabledAtChat: Boolean(request.voice),
      ttsStyle: promptPersonalContext.ttsStyle,
    }),
    shouldScheduleTts: Boolean(request.voice),
    personalContext: promptPersonalContext,
  };
}

/* 公共情绪兜底也按时段和最近播放轻量轮转，避免退回固定首歌映射。 */
function buildContextualGenreMusicIntent(
  request: NonNullable<ReturnType<typeof parseGenreRecommendationRequest>>,
  text: string,
  personalContext: PersonalContext,
): GenerateMusicIntentResult {
  const tracks = rotateItems(
    request.tracks,
    stableHash(
      `${text}:${personalContext.environment.timeSlot}:${personalContext.environment.hour}:${personalContext.recentTracks
        .map((track) => track.title)
        .join('|')}`,
    ),
  );
  const [primary] = tracks;
  if (!primary) return buildGenreMusicIntent(request);
  return buildGenreMusicIntent({
    ...request,
    title: primary.title,
    artist: primary.artist,
    tracks,
    preferredTitles: tracks.map((track) => track.title),
  });
}

/* 稳定轮转数组。 */
function rotateItems<T>(items: T[], seed: number): T[] {
  if (items.length <= 1) return [...items];
  const offset = Math.abs(seed) % items.length;
  return [...items.slice(offset), ...items.slice(0, offset)];
}

/* 稳定 hash。 */
function stableHash(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash;
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
  personalContext,
}: {
  text: string;
  genericRecommendationRequest: ReturnType<typeof parseGenericRecommendationRequest>;
  context: ChatTurnPlanningContext;
  personalContext: PersonalContext;
}): Promise<Awaited<ReturnType<typeof generateMusicIntent>>> {
  const generated = await generateMusicIntent({
    userText: text,
    modelId: context.currentModel.id,
    modelDisplayName: context.currentModel.displayName,
    playbackState: context.playbackState,
    currentTrack: context.currentTrack,
    personalContext,
  });
  if (generated.ok || !genericRecommendationRequest) return generated;

  const fallback = buildContextualGenreMusicIntent(
    genericRecommendationRequest,
    text,
    personalContext,
  ) as SuccessfulMusicIntent;
  return {
    ...fallback,
    intent: {
      ...fallback.intent,
      note: `generic recommendation fallback after ${generated.reason}`,
    },
  };
}

/* 把 Resident DJ 策展候选包装成 MusicIntent，避免旧 preferredTitles 变成固定映射。 */
function buildResidentDjMusicIntent(plan: ResidentDjPlan): GenerateMusicIntentResult {
  const [firstCandidate] = plan.curatedCandidates;
  const searchQuery = firstCandidate ? formatCuratedSearchQuery(firstCandidate) : plan.turnPlan.userText;
  return {
    ok: true,
    intent: {
      preferredTitles: curatedCandidatesToTitles(plan.curatedCandidates),
      searchQuery,
      mood: plan.turnPlan.comfortMode,
      note: `resident dj ${plan.turnPlan.energyCurve}`,
    },
    providerId: 'resident-dj',
    model: 'resident-dj',
    elapsedMs: 0,
  };
}

/* 组合策展候选搜索词。 */
function formatCuratedSearchQuery(candidate: CuratedCandidate): string {
  return [candidate.title, candidate.artist].filter(Boolean).join(' ');
}

/* 明确点歌 seed 用 artist 提高 provider 搜索命中，但不允许个人资料覆盖歌名。 */
function buildExplicitSeeds(
  request: NonNullable<ReturnType<typeof parseExplicitSongRequest>>,
): MusicSearchSeed[] {
  return [{ title: request.title, ...(request.artist ? { artist: request.artist } : {}) }];
}

/* 合并标题并去重。 */
function mergePreferredTitles(...groups: string[][]): string[] {
  const result: string[] = [];
  for (const title of groups.flat()) {
    if (!title.trim()) continue;
    if (result.includes(title)) continue;
    result.push(title);
  }
  return result.slice(0, 12);
}

/* 合并搜索种子；LLM 标题没有 artist 时也保留为 title-only seed。 */
function mergePreferredSeeds(
  personalSeeds: MusicSearchSeed[],
  intentTitles: string[],
): MusicSearchSeed[] {
  const result = [...personalSeeds];
  for (const title of intentTitles) {
    if (!result.some((seed) => seed.title === title)) result.push({ title });
  }
  return result.slice(0, 12);
}
