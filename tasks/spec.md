# Claudio · 项目决策真源（Spec）

> 本文件只保留当前仍会影响实现的决策真源。
> 历史踩坑和纠正规则放在 `tasks/lessons.md`；当前执行进度放在 `tasks/todo.md`。
> 任何代码与本文件冲突，错的是代码；发现偏差先更新 Spec，再改代码。

---

## 当前活跃索引

- 当前主线：AI 电台最小闭环。
- 已完成：Phase A 后端 API 骨架；Phase B 移动端接入；Phase C LLM 主播；Phase C+ 等待体验；Phase D 音乐来源；Phase D.5 性能地基；Phase E TTS 入声。
- 当前阶段：Phase F 后台播放 / 锁屏控制 / APK release / 长时运行（待启动）。
- 当前 HARD-GATE：无；Phase F 启动前需先写分段 Spec。
- 当前边界：Phase F 不再扩展 LLM 模型集合、不引入新 TTS provider、不破坏现有公开契约（`Track` / `ChatRequest` / `StreamEvent`）。

---

## 0. 产品一句话

**Claudio**：一个像素风个人 AI 电台 App，会读懂用户输入，用 DJ 口吻推荐音乐，并把可播放曲目推给移动端播放器。

---

## 1. 平台与工程约束

- 语言：全栈 TypeScript。
- 仓库：pnpm workspace monorepo。
- 移动端：Expo + React Native + NativeWind，Android 优先，Web 用于调试。
- 服务端：Node.js + Fastify + zod + `@fastify/websocket`。
- 包边界：`apps/mobile` 依赖 `packages/api` 与 `packages/ui`；`packages/core/api` 不依赖 UI。
- 代码风格：函数和关键逻辑必须有中文多行注释 `/* */`。
- 文件影响：不改无关逻辑、结构、文件。
- 文档规则：默认不创建新说明文档；只有用户明确要求时才创建或重写文档。

---

## 2. UI 与动画真源

- 视觉关键词：赛博暗夜电台、像素终端、黑底、高反差、一抹荧光绿。
- 主色：`bg #000000`、`panel #0a0a0a`、`line #1f1f1f`、`text #e8e8e8`、`muted #6b7280`、`accent #00ff88`、`live #ff3355`。
- 字体：英文/数字偏像素；中文使用 Cubic 11。
- 圆角：绝大多数为 `0`，按钮/徽标可小圆角。
- 高频动画规则：交互、transform、opacity 用 Reanimated；频谱、粒子、重复图形用 Skia；Web fallback 用单 canvas，不用大量 SVG/React 节点逐帧更新。
- React state 只承载业务状态和低频变化，不承载每帧动画值。
- 参考 HTML/CSS 时，先做关键视觉参数映射，再迁移到当前框架；不能主观加层或压缩比例。

---

## 3. API 契约真源

- `packages/api/src/types.ts` / `Track` 是服务端和移动端共享曲目契约：`id`、`url`、`title`、`artist?`、`artwork?`、`duration?`。`artwork` 可承载专辑封面；没有封面时允许服务端填歌手图作为 fallback。
- `packages/api/src/types.ts` / `ChatResponse.play` 是 LLM 推荐曲名数组，曲名由服务端解析为可播放 `Track`。
- `/api/chat` 返回 `ChatResponse`，并通过 WS 广播 `chat-token`、`queue-update`、`now-playing`。
- `/api/now` 返回当前 `Track | null`、position、state。
- `/api/next` 返回下一首 `Track | null` 和 reason。
- `/stream` 是增强链路；HTTP API 必须单独可用。
- Phase D 默认不改公开契约，优先让现有契约返回真实可播放曲目和可展示 artwork。

---

## 4. LLM 与等待体验真源

- LLM 走 OpenAI-compatible chat completions；当前 DeepSeek 已接通。
- `DEEPSEEK_MODEL=deepseek-v4-flash`，`DEEPSEEK_THINKING_TYPE=disabled`，优先低延迟响应。
- LLM 输出必须经过运行时 JSON 解析和字段归一化，不信任模型裸输出。
- 没有 key、超时、HTTP 错误或解析失败时，服务端必须走 fallback，不让移动端断链。
- DJ 等待态使用 `packages/ui/src/RadioTuningLoader.tsx`，基于 `explame/explame.html` 主调频模块 `280×88` 等比缩放。
- 等待期间不显示本地假主播台词，不显示 `thinking`，只显示电台语义的调频加载。

---

## 5. 工作流硬约束

- 中等及以上任务必须先写分段 Spec：现状分析 → 功能点与文件级计划 → 风险与决策。
- 每段都要等待用户确认；完整 Spec 确认后才进入编码 HARD-GATE。
- 现状分析必须有代码出处：文件路径 + 函数名 / 模块名。
- 验证未完成，不得标记完成。
- 用户指出错误后，必要时写入 `tasks/lessons.md`，避免同类问题复发。
- 涉及 `packages/*` 后，如果页面没变，先按 Metro / 浏览器缓存陷阱排查。

---

## 6. 历史阶段摘要

| 阶段 | 状态 | 当前仍有效的结论 |
|---|---:|---|
| Iter 0 | 完成 | monorepo、共享 tsconfig、UI/core/api/server/mobile 骨架已建立。 |
| UI 动画架构 | 完成 | 高频视觉走 Reanimated + Skia / Web canvas；避免 JS RAF + React state 热路径。 |
| Phase A | 完成 | 服务端 `/api/chat`、`/api/now`、`/api/next`、`/api/models`、`/stream` 已打通内存闭环。 |
| Phase B | 完成 | 移动端通过 `packages/api` 接入服务端 HTTP / WS；服务端 playlist 可覆盖本地默认播放列表。 |
| Phase C | 完成 | 服务端 LLM adapter 已接入；DeepSeek 真实路径与无 key fallback 均验证通过。 |
| Phase C+ | 完成 | DJ 气泡等待态已切到调频动画；不再使用本地假等待文案。 |
| Phase D | 完成 | 服务端 `musicResolver` + fallback catalog + 可选 `ncm` provider；移动端 artwork 链路打通；provider 失败稳定回退 SoundHelix。 |
| Phase D.5 | 完成 | provider chain（local→external→ncm?→fallback）+ TTL/LRU cache + Range route + 客户端 60% 预热 + metrics 已落地；详见 §6.2。 |
| Phase E | 完成 | `msedge-tts` 接入；`/api/chat` 立返 + WS 后推 `tts-ready` + `/media/tts/:id` 200 整体下载；移动端独立 `useTtsPlayer` + 音乐 ducking 0.3 + DJBubble REPLAY；详见 §6.3。 |

### 6.1 Phase D 仍约束未来代码的决策

- 公开契约保持克制：`Track.artwork` 已存在；不新增 `ChatResponse` 字段、不新增 WS 事件类型。Provider 内部细节只留服务端类型。
- 服务端只下发可播放 `Track`：只有元数据没有音频 URL 的结果不能进入 `currentTrack` 或 `queue`。
- 音乐 provider 必须可插拔，不允许把业务主路径写死到某个不稳定服务（NCM 仓库已 archived，仅作 experimental adapter）。
- 真实音乐源失败不能影响 LLM 主播和播放闭环：搜索 / 取 URL / 超时 / 非 2xx 时统一回退 SoundHelix fallback。
- 不新增数据库和持久化缓存：内存级短缓存可以接受；磁盘缓存、用户曲库、长期偏好在后续阶段再考虑。
- 封面像素风第一版在客户端轻量实现：服务端只传 artwork 小图 URL，客户端不做每帧滤镜。
- 移动端红框区域替换必须渐进：有 artwork 显示 `TrackArtworkPanel`，无 artwork 或加载失败时回退 `PixelClock + DateLine`。

### 6.2 Phase D.5 仍约束未来代码的决策

- 强 provider contract：`MusicProviderManifest` + `tier` + `cachePolicy` + `MUSIC_PROVIDER_API_VERSION` 是后续接 Spotube Bridge / 任何外部 resolver 的版本协商基线。
- Provider chain 装配规则：`MUSIC_PROVIDER_CHAIN` 决定优先级，`fallback` 永远兜底；`local → external → ncm? → fallback` 是默认链；fallback provider 不写入 resolveCache，避免污染真实命中率。
- 自有源 Range route：`/media/local/:id` 必须做路径逃逸校验（`path.relative` + `isAbsolute`），不允许 `indexOf` 这种受 Windows 大小写不敏感盘符干扰的判断。
- 客户端预热触发口径：进度 ≥60% 或剩余 ≤45s；用 `useRef` 防止同首歌重复触发；失败静默。
- env helper 量纲分离：HTTP 超时类用 `positiveIntegerWithDefault`（30s 上限），缓存 TTL / 计数类用 `positiveIntegerWithMax(default, max)`。

### 6.3 Phase E 仍约束未来代码的决策

- TTS 永远 fire-and-forget：HTTP 立返、WS 后推 `tts-ready`；任何同步等待 TTS 都违反主链路非阻塞约束。
- TTS 与音乐播放器物理隔离：`useTtsPlayer` 独立 expo-audio 实例，不复用 `useRadioPlayer`；TTS 期间走 `radio.setVolume(0.3)` ducking 而非 pause。
- 失败完全静默：TTS 链路失败不发错误事件、不显示 UI 错误，DJ 文案仍可见；服务端打 `[tts]` 日志即可。
- 公开契约不再扩展：`ChatRequest.voice?` 与 `StreamEvent 'tts-ready'` 已足够；后续如接豆包等 provider，不新增字段。
- React Hooks 死循环防御：跨渲染状态变化的对象（`useTtsPlayer` 返回值）禁止直接进 `useEffect/useCallback` 依赖；用 `useRef` 锁住。这条规则适用所有自定义 hook。

---

## 7. Phase D：音乐来源接入 Spec

> Phase D 已完成并归档。仍约束未来代码的决策见 §6.1；详细现状分析、文件级计划、验证计划、风险与决策按 doc lifecycle 规则从本文件移除，避免文档无限累加。

---

## 8. Phase D.5：音源与播放性能地基 Spec

> Phase D.5 已完成并归档。仍约束未来代码的决策见 §6.2；详细现状分析、文件级计划、验证计划、风险与决策按 doc lifecycle 规则从本文件移除，避免文档无限累加。

<!-- 历史正文已折叠 -->

<details>
<summary>历史正文（仅供回溯，不再作为决策真源）</summary>

### 8.1 现状分析（已确认，按用户自选音源方向修订）

- `server/src/music/musicResolver.ts` / `resolveTracksForChat`：当前只负责把用户输入解析成可播放 `Track[]`，并在 provider 不可用时回退 SoundHelix。它没有做音频流代理、Range 转发、磁盘缓存、缓存命中统计或下一首预解析，因此 Phase D.5 的性能优化不能假设这些能力已经存在。
- `server/src/music/musicResolver.ts` / `getActiveProvider`：当前 provider 只有 `disabled` 和 `ncm`，并且 `ncm` 依赖 `MUSIC_API_BASE_URL`。这说明项目已经具备“可插拔 provider 的入口”，但还不是完整插件系统；下一步适合加固 provider contract，而不是一次性做动态插件运行时。
- `server/src/music/providers/ncmProvider.ts` / `createNcmProvider`：NCM provider 是可选 HTTP adapter，只搜索并获取播放 URL。它不能保证 VIP 曲目可播放，也不应承担绕过会员、版权或 DRM 限制的职责。长期策略应把它标记为 experimental / personal provider，而不是默认主路径。
- `server/src/state/radioState.ts` / `handleChat`：当前 `/api/chat` 会先解析候选曲，再调用 LLM，再提交 `currentTrack` 和 `queue`。这条路径适合加入“下一首预解析”和“解析结果缓存”，因为它已经集中掌握用户意图、候选曲和队列状态。
- `server/src/state/radioState.ts` / `getNextTrack`：当前 `/api/next` 只是返回内存队列里的下一首曲目，不会触发预加载、预热或健康检查。Phase D.5 可以让 `/api/next` 成为客户端轻量预取入口，但不能让它阻塞主播放流程。
- `server/src/routes/streamRoutes.ts` / `registerStreamRoutes` 与 `server/src/realtime/streamHub.ts` / `broadcastStreamEvent`：当前 `/stream` 是 WebSocket 状态推送，不是音频流式传输。音频流应走独立 HTTP route，例如未来的 `/media/:id/stream`，不能和状态 WS 混在一起。
- `apps/mobile/app/_hooks/useRadioPlayer.ts` / `useRadioPlayer`：当前播放器把 `track.url` 直接交给 `expo-audio`。渐进加载由平台播放器处理，项目自身没有实现隐藏播放器预热、下一首 buffer、下载队列或本地音频缓存。
- `apps/mobile/app/index.tsx` / `refreshNowAndNext`：当前 `/api/chat` 后会拉取 `/api/now` 和 `/api/next`，并把两首曲子放进播放队列。这是实现“智能预加载”的天然挂点：先预取元数据和封面，音频预热只对自有合法音源开放。
- `packages/api/src/types.ts` / `Track`：共享契约里只有 `url`、`artwork`、`duration` 等播放必要字段，没有 `sourceType`、`cachePolicy`、`streamId`。Phase D.5 如果要区分 local / remote / experimental provider，应谨慎评估是否扩展契约；优先保持 `Track.url` 可播放，避免前端知道过多音源细节。
- 外部参考：Spotube 当前官方 README 明确把项目描述为可通过社区或自定义插件携带 metadata / playlist / audio-source；其插件文档说明插件用于获取 metadata 和 scrobbling，并暴露内部 API。该方向值得借鉴的是“provider 能力边界清晰、用户可自带来源”，不值得照搬的是把 YouTube / 第三方平台抽音频作为 Claudio 默认主路径。
- 外部边界：YouTube API 政策禁止未获书面批准下载、缓存、存储 YouTube 音视频内容，也禁止分离音视频组件；Spotify Developer Policy 规定完整音乐 streaming 只允许 Premium，并且禁止把 Spotify 内容与其它服务流集成。NeteaseCloudMusicApi 已在 2024-04-16 archived，README 写明“保护版权，此仓库不再维护”。这些事实决定 Claudio 开源默认路径不能做 VIP 绕过、抽音频、第三方音频持久缓存。
- 长期最稳方向：核心项目优先支持“自有合法音源库”，例如本地目录、NAS、私有对象存储或用户自行授权的文件。第三方平台只作为可选 provider 接口，不承诺稳定性、VIP 可用性或缓存能力。
- 性能最大化原则：只优化会出现在热路径上的部分。第一优先级是减少“发起播放前等待”：缓存 provider 搜索结果、缓存封面小图、预解析下一首；第二优先级是自有音频的 Range 流式传输；第三优先级才是磁盘音频缓存和 HLS/DASH。不要为了“看起来高级”引入数据库、转码队列或全量离线缓存。
- 流式传输边界：当前阶段最适合 HTTP Range，而不是 HLS/DASH。Range 能让自有 MP3/FLAC 等文件边下边播、支持 seek 和断点请求，复杂度低且贴合 `expo-audio` 的 URL 播放模型。HLS/DASH 需要切片、manifest、转码或预处理，暂不适合个人电台最小稳定闭环。
- 多级缓存边界：Phase D.5 适合做 L1 内存缓存和 L2 小文件缓存。L1 存 provider 查询结果、当前队列、下一首预解析结果；L2 存元数据和封面缩略图。音频内容缓存只允许用于自有合法音源，不缓存 YouTube / Spotify / Bilibili / NCM 等第三方受限流。
- 智能预加载边界：客户端在当前曲播放到约 60% 或剩余 45 秒内时，可以触发 `/api/next` 或后续 `/api/preload`。服务端预加载元数据和封面；只有 `local` / `owned` 音源才允许音频预热。预加载必须可取消、限并发、限流量，4G 下不应后台下载整首歌。
- 用户自选音源策略：Claudio 核心不内置、不默认启用灰色音源实现，但必须把 provider 能力做得足够开放。用户可以在本机或私有服务里接任意 resolver，Claudio 只消费它返回的 `Track` 与能力声明；这样体验可扩展，核心项目仍保持稳定、可测试、可开源。
- VIP 歌曲策略：Claudio 核心不提供绕过 VIP 的具体实现，但允许用户自选 provider 返回可播放 URL。系统需要按 provider 能力决定缓存、预加载和 fallback 行为：自有源走完整性能优化；外部源只做短 TTL 解析缓存和封面预取；声明不允许缓存的源不做音频持久化。
- Spotube 插件化借鉴结论：值得借鉴“metadata、playlist、audio-source 能力拆分”、`plugins.json` 中 `type/version/name/author/description/apis/abilities/repository/pluginApiVersion` 这类 manifest 字段，以及 `auth/search/track/playlist/browse/core` 的端点分段。不适合直接照搬 `.smplug` / Hetu 脚本运行时、远程插件市场和自动安装流程。Claudio 当前框架更适合 TypeScript 服务端静态 provider registry + 外部 resolver HTTP 适配器，先做到强类型、限时、限流、可关闭。

### 8.2 功能点与文件级计划（待确认）

- `packages/api/src/types.ts`：谨慎扩展共享 `Track`。保留 `url/title/artist/artwork/duration` 作为播放器最小契约；新增字段如果必要，优先使用可选字段 `source?` 和 `expiresAt?`，避免移动端强依赖 provider 细节。`source` 只描述能力和来源类型，不暴露敏感凭据。
- `server/src/music/types.ts`：扩展内部 provider contract。新增 `MusicProviderManifest`、`MusicProviderCapability`、`MusicProviderTier`、`TrackCachePolicy`、`ResolvedTrack` 等内部类型。参考 Spotube manifest，但字段收敛为 Claudio 需要的最小集：`id/name/version/type/author/description/repository/pluginApiVersion/capabilities/tier/cachePolicy`。
- `server/src/music/types.ts`：定义 provider tier：`owned`、`external`、`experimental`、`fallback`。`owned` 允许 Range 流、音频预热和可控缓存；`external` 允许短 TTL URL 与元数据缓存；`experimental` 必须显式启用且永远不能成为隐式默认；`fallback` 保持 SoundHelix 保底。
- `server/src/music/providerRegistry.ts`：新增静态 provider registry。按 `MUSIC_PROVIDER_CHAIN` 顺序加载 provider，例如 `local,external,ncm,fallback`；未配置时默认 `fallback`。registry 负责统一读取 manifest、能力、超时和启停状态。
- `server/src/env.ts` 与 `server/.env.example`：新增 Phase D.5 配置：`MUSIC_PROVIDER_CHAIN`、`MUSIC_LIBRARY_DIR`、`EXTERNAL_MUSIC_RESOLVER_URL`、`EXTERNAL_MUSIC_RESOLVER_TIMEOUT_MS`、`MUSIC_CACHE_MAX_ENTRIES`、`MUSIC_PRELOAD_ENABLED`。所有配置默认安全关闭或 fallback，不影响现有启动。
- `server/src/music/providers/externalResolverProvider.ts`：新增外部 resolver HTTP adapter。它调用用户自建服务，例如 `GET /manifest`、`POST /search`、`POST /resolve`，只接受经 zod 校验后的 Track。它不执行第三方脚本、不安装远程插件，只做进程外 HTTP 边界，避免插件崩溃拖垮主服务。
- `server/src/music/providers/spotubeBridgeProvider.ts`：新增 Spotube 兼容桥 provider。目标不是在 Claudio 主进程直接运行 `.smplug`，而是对接一个外部 Spotube Bridge 服务，由该服务负责加载 Spotube 插件、执行 Hetu Script、处理插件认证和端点调用；Claudio 只消费桥返回的标准 `Track[]`、manifest 和能力声明。
- `server/src/music/providers/spotubeBridgeProvider.ts`：桥接层需要映射 Spotube 插件能力。参考 Spotube 的 metadata plugin 端点，把 `SearchEndpoint.tracks/all` 映射到 Claudio search，把 track 详情和可播放源解析映射到 `resolve`，把 `plugin.json` 中 `type/version/name/author/description/apis/abilities/repository/pluginApiVersion` 映射到 `MusicProviderManifest`。如果某插件只提供 metadata、不提供 audio source，则 Claudio 只能用它增强搜索和封面，不能把它当作可播放 provider。
- `server/src/env.ts` 与 `server/.env.example`：为 Spotube 桥接保留配置，例如 `SPOTUBE_BRIDGE_URL`、`SPOTUBE_BRIDGE_TIMEOUT_MS`、`SPOTUBE_BRIDGE_ENABLED`。默认关闭；启用后作为 `external/experimental` tier 进入 `MUSIC_PROVIDER_CHAIN`。
- `server/src/music/providers/localProvider.ts`：新增自有音源 provider。读取 `MUSIC_LIBRARY_DIR`，第一版只做轻量扫描和文件名解析，不引入重型标签库；支持常见音频扩展名并生成稳定 `local:` id。若目录未配置或不存在，provider 自动禁用。
- `server/src/routes/mediaRoutes.ts`：新增自有音源 HTTP Range 流 route，例如 `GET /media/local/:id`。仅服务 `localProvider` 允许的真实文件，必须校验路径在 `MUSIC_LIBRARY_DIR` 内，支持 `Range`、`206 Partial Content`、`Content-Range`、`Accept-Ranges`、基础 MIME。
- `server/src/music/cache.ts`：新增轻量 TTL/LRU 内存缓存。缓存 provider 搜索结果、resolve 结果、manifest 和下一首预解析结果。缓存 key 必须包含 provider id、query、limit、能力版本；缓存值必须带 TTL，避免外部 URL 过期后继续播放。
- `server/src/music/artworkCache.ts`：暂不默认代理所有外部 artwork。只在 provider 声明 `artworkCacheAllowed` 时缓存小图；否则移动端直接使用 provider 的 artwork URL。自有源后续可扩展本地封面小图缓存。
- `server/src/music/musicResolver.ts`：从单 provider 改为 provider chain。流程为：读 cache -> 按优先级搜索 -> 过滤无 URL -> 按能力和质量排序 -> 失败继续下一个 provider -> 全失败回 SoundHelix。每一步都记录 reason，但不把 provider 内部错误泄漏给前端。
- `server/src/state/radioState.ts` / `handleChat`：保持当前原子提交模式。加入“后台预解析下一首”但不阻塞 `/api/chat` 响应；如果预解析失败，只记录并保持当前队列。LLM 仍只看到候选曲标题，不接触 provider 凭据。
- `server/src/state/radioState.ts` / `getNextTrack`：在返回下一首时触发轻量预热：命中元数据缓存、预取 artwork、对 `owned` track 预检查文件存在；不对 `external` track 下载音频内容。
- `server/src/music/preload.ts`：新增统一预加载调度器。限制并发为 1-2，合并重复任务，可取消过期任务。预加载只做当前队列后 1 首，不做整队列下载。4G 优先策略：metadata 和 artwork 优先，audio 仅限 owned。
- `apps/mobile/app/index.tsx`：利用 `radio.position` 和 `radio.duration`，当播放进度超过约 60% 或剩余时间小于 45 秒时调用现有 `getNext()`，让服务端有机会预热下一首。避免新增公开 API；失败静默，不影响 UI。
- `apps/mobile/app/_utils/trackMapping.ts` 与 `apps/mobile/app/_hooks/useRadioPlayer.ts`：如 `Track` 新增 `source/expiresAt`，移动端只透传必要字段，不根据 provider 类型改变播放逻辑。播放器依旧只消费可播放 URL。
- `packages/api/src/client.ts`：不新增复杂客户端 SDK。最多保留现有 `getNext()` 作为预热触发点；如果后续确实需要显式预热，再单独增加 `preloadNext()`。
- `server/src/music/metrics.ts`：新增进程内性能指标：provider 搜索耗时、resolve 耗时、cache hit/miss、fallback 次数、预加载成功/失败。第一版只打日志或供内部调试，不新增前端 UI。
- `server/src/routes/apiRoutes.ts`：保持 `/api/chat`、`/api/now`、`/api/next` 契约兼容。只有新增 media route，不改变现有移动端主链路。
- `server/src/index.ts`：注册 `mediaRoutes`。顺序上 media route 与 API route 独立，不和 `/stream` 混淆。
- `server/src/music/providers/ncmProvider.ts`：降级为 `experimental` provider。保留现有能力，但 manifest 明确 `audioCacheAllowed=false`、`audioPreloadAllowed=false`、`urlTtlMs` 短 TTL，避免把不稳定外部 URL 当成可长期缓存资源。
- `server/src/music/fallbackCatalog.ts`：保持 fallback provider 化。SoundHelix 只用于稳定闭环，不参与“无限曲库”体验承诺。
- 验证计划：必须覆盖 provider chain 顺序、external resolver 超时、local Range 206、无 Range 200、路径逃逸防护、cache TTL 过期、预加载不阻塞 `/api/chat`、移动端 60% 触发 `getNext()`、NCM/外部源不做音频持久缓存、全仓 typecheck 与相关 lint。

### 8.3 风险与决策（待确认）

- 决策 1：Spotube 插件兼容目标定义为“可通过 Bridge 接入”，不是“Claudio 主进程直接加载 `.smplug`”。Spotube 官方插件使用 Hetu Script，并有自己的插件 API、生命周期、认证和端点模型；直接嵌入会引入运行时、沙箱、崩溃隔离和升级兼容问题。Bridge 隔离是更稳定的做法。
- 决策 2：Claudio Provider Contract 必须覆盖 Spotube 成熟插件的主要能力：manifest、search、track detail、playlist/browse 可选、auth 状态可选、resolve playable URL、capabilities、TTL、cache policy。这样 Spotube 能接入的插件，只要 Bridge 能运行，Claudio 就能通过标准 provider 消费。
- 决策 3：插件能力不等于播放能力。Spotube 官方文档当前强调 metadata provider 和 scrobbling；不是每个插件都能返回音频源。Claudio 必须在 manifest 中区分 `metadata`、`audio-source`、`playlist`、`scrobbling`，不能把 metadata-only 插件错误当成可播放 provider。
- 决策 4：外部插件源默认不享受完整缓存。Spotube Bridge、NCM 和其它 external provider 的音频 URL 默认短 TTL，只允许 metadata / artwork / resolve 结果短缓存；音频内容持久缓存只对 `owned/local` 源开放。
- 决策 5：稳定性优先于无限曲库。Provider chain 中 external / spotube bridge 失败、超时、返回无 URL 或返回不可校验对象时，必须继续尝试下一个 provider，并最终 fallback。任何插件异常不能阻塞 `/api/chat`、`/api/now`、`/api/next` 主链路。
- 决策 6：性能优化按 provider 能力分级。`owned/local` 可以 HTTP Range、预热音频、缓存封面；`spotube-bridge/external` 只做短 TTL resolve、封面预取和下一首解析；`experimental` 必须显式配置才进入链路。
- 决策 7：Phase D.5 第一版不实现完整 Spotube Bridge 运行时，只定义 Claudio 侧桥接协议和 provider adapter。如果要“直接跑 Spotube 插件”，应作为独立进程/独立包后续实现，避免把 Hetu runtime 和插件市场安装逻辑塞进服务端主进程。
- 决策 8：公开契约保持克制。`Track` 可以增加少量可选字段承载 source/capability/ttl，但移动端播放逻辑仍以 `url` 为准。复杂 provider 细节保留在服务端内部，避免未来替换插件系统时牵动移动端。
- 决策 9：所有外部 provider 必须运行时校验。Bridge 返回的 manifest、track、URL、artwork、duration、expiresAt 都必须经过 zod schema；不可信字段丢弃，不可信 URL 不进入当前播放队列。
- 决策 10：验收不能只看"能播"。必须同时验证高性能自有源路径、Spotube Bridge/external provider 路径、失败 fallback 路径、缓存策略边界和预加载不阻塞主交互。

</details>

---

## 9. Phase E：TTS 入声与 `tts-ready` 推送 Spec

> Phase E 已完成并归档。仍约束未来代码的决策见 §6.3；详细现状分析、文件级计划、风险与决策按 doc lifecycle 规则从本文件移除，避免文档无限累加。

<!-- 历史正文已折叠 -->

<details>
<summary>历史正文（仅供回溯，不再作为决策真源）</summary>

### 9.1 现状分析（已确认）

- `packages/api/src/types.ts` / `ChatRequest.voice?` 与 `StreamEvent 'tts-ready'` 已在契约中预留，但全仓无业务实现：`broadcastStreamEvent` 从未发过 `tts-ready`，移动端 `handleStreamEvent` 没有对应 case。
- `server/src/routes/apiRoutes.ts` / `ChatRequestSchema` 仅以 `z.boolean().optional()` 接住 `voice`，`handleChat` 完全不读该字段；服务端无 TTS 模块、无 provider adapter、无 voice 触发点。
- `server/.env.example` 已写 `TTS_PROVIDERS / TTS_DEFAULT / EDGE_VOICE / DOUBAO_*`，但 `server/src/env.ts` `EnvSchema` 没解析这些键——是占位而非接入。
- `apps/mobile/` 全仓 grep `tts/expo-speech` 零命中；`useRadioPlayer` 单实例，TTS 与音乐共用会撞车。
- `packages/ui/src/DJBubble.tsx` `onReplay` 与 `ChatInput.onMicPress` 均已是公开 prop 但 [index.tsx](file:///d:/code/cloudeMplatform/apps/mobile/app/index.tsx) 都传 `() => undefined`，是 TTS 重播 / 触发的天然挂点。
- LLM `say` 在 [prompt.ts](file:///d:/code/cloudeMplatform/server/src/llm/prompt.ts) 与 [llmAdapter.ts](file:///d:/code/cloudeMplatform/server/src/llm/llmAdapter.ts) 双重压到 120-160 字内，1-3s/30-100KB，可异步合成。
- `/api/chat` 当前路径同步 `handleChat` → 立即广播 `chat-token/queue-update/now-playing`；TTS 必须 fire-and-forget，否则 P50 1.8s + 1-3s 会破坏交互。
- 服务端尚未挂 `@fastify/static`；选 `/media/tts/:id` 模式（与 `/media/local/:id` 同结构、复用 mediaRoutes 文件），不引入新依赖。
- 已有可复用基建：provider chain（providerRegistry 模式）、TTL/LRU cache、HTTP serve、env helper、metrics、broadcastStreamEvent、DJBubble 打字机/REPLAY。Phase E 只拼装 + 加 TTS adapter，不新增基础设施。

### 9.2 功能点与文件级计划（已确认）

- `server/src/tts/types.ts`：`TtsProvider / TtsManifest / TtsSynthesizeInput { text; voice; speed? } / TtsSynthesizeResult { audio: Buffer; mime: string; voice: string }`。manifest 与 music 同构（`tier: 'owned'|'external'`、`urlTtlMs`、`audioCacheAllowed`）。
- `server/src/tts/audioStore.ts`：`putAudio(id, buffer, mime, ttlMs): void` / `getAudio(id): { buffer; mime } | null`。基于 [server/src/music/cache.ts](file:///d:/code/cloudeMplatform/server/src/music/cache.ts) 工厂；id 用 `crypto.randomUUID().slice(0,12)`。
- `server/src/tts/providers/edgeProvider.ts`：`createEdgeTtsProvider(voice): TtsProvider`，依赖 `msedge-tts`。`tier='external'`、`audioCacheAllowed=true`、`urlTtlMs=undefined`（自有 buffer）。
- `server/src/tts/providers/doubaoProvider.ts`：占位，函数签名齐全但 v1 抛 not-implemented，让 chain 跳过。
- `server/src/tts/providerRegistry.ts`：`getTtsProviderChain()`，按 `TTS_PROVIDER_CHAIN` 默认 `'edge'`。
- `server/src/tts/ttsService.ts`：`synthesizeForChat(say): Promise<{ id; mime } | null>`。流程：cache key=sha1(text+voice+speed)→ 命中返回旧 id → miss 调 chain → audioStore.put → 返回 id；任何 provider 失败 → null。
- `server/src/routes/mediaRoutes.ts`：新增 `app.get('/media/tts/:id')`，命中 200 + `audio/mpeg` + Content-Length；不实现 Range（短音频整体下载即可）；与 `/media/local/:id` 同文件、不影响其逻辑。
- `server/src/state/radioState.ts` `handleChat`：在 queue 提交后加 `if (request.voice) void scheduleTts(say, chatId)`。`scheduleTts` 模块级私有，内部并发=1、单调递增 chatId，新任务进来时丢弃旧任务结果，不广播过期 tts-ready。
- `server/src/env.ts` 与 `server/.env.example`：新增 `TTS_PROVIDER_CHAIN / TTS_DEFAULT_VOICE / TTS_TIMEOUT_MS / TTS_CACHE_MAX_ENTRIES / TTS_CACHE_TTL_MS / DOUBAO_APP_ID/_TOKEN/_VOICE`，默认安全。
- `server/package.json`：`pnpm add msedge-tts`，锁版本不用 `^`。
- `apps/mobile/app/_hooks/useTtsPlayer.ts`：独立 `useAudioPlayer` 实例，与 `useRadioPlayer` 隔离；签名 `{ play(url): void; stop(): void; playing: boolean }`。
- `apps/mobile/app/index.tsx`：`handleStreamEvent` 加 `case 'tts-ready'`；`handleSend` 透传 `voice` state；DJBubble `onReplay` 接 `tts.play(lastTtsUrl)`；TTS 期间通过外部 setter 把 radio.player.volume 降到 0.3，结束恢复 1.0。
- 不动：`packages/api/src/types.ts/client.ts`、`packages/ui/`、`apps/mobile/app/_utils/trackMapping.ts`、`apps/mobile/package.json`。

### 9.3 风险与决策（已确认）

- 决策 1：TTS 走 fire-and-forget。HTTP 立返、WS 后推；scheduleTts 内部 chatId 单调递增，旧任务结果丢弃。
- 决策 2：TTS 期间音乐 ducking 到 30%，不暂停。保留频谱与"DJ 在直播"的视觉连续性；fade 200ms 收敛抖动。
- 决策 3：cache key = `sha1(text + '|' + voice + '|' + speed).slice(0,16)`。包含 voice/speed，不含 provider id 与 chatId。
- 决策 4：v1 用 `msedge-tts`（无 key、社区维护）。锁版本；TtsProvider 抽象保证一行替换；豆包 / OpenAI / Azure 已留接口。
- 决策 5：移动端默认 `voice=false`，UI 加显式开关；不破坏首屏体验和 4G 流量预期。
- 决策 6：`/media/tts/:id` v1 不加 SHARED_TOKEN 鉴权，与现有 `/media/local/:id` 一致；token 启用时整批升级。
- 决策 7：合成失败完全静默，不发错误事件、不显示 UI 错误；服务端日志 + metrics 即可。
- 决策 8：v1 不引入测试框架；`audioStore / cache / buildCacheKey` 设计成纯函数 + 注入时钟，保留可测边界。
- 决策 9：cache 命中走"返回旧 id"，audioStore 不重复写；evict 时回调 cache key 表删除悬挂引用。
- 决策 10：scheduleTts 与 cancelPendingPreloads 解耦，两类资源不互相取消。

</details>

- HARD-GATE：用户已确认 §9 完整 Spec，允许编码。
