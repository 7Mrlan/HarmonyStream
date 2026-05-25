# Claudio · 当前执行看板

> `tasks/spec.md` 是决策真源；`tasks/lessons.md` 是踩坑规则库；本文件只放当前任务、状态和必要验收提醒。

---

## 当前规则

- 中等及以上任务：先写分段 Spec，用户确认后再编码。
- 当前阶段若发现偏差：先更新 Spec，再改代码。
- 完成任务必须给验证证据：类型检查、请求结果、运行日志或可操作验收步骤。
- 涉及 `packages/*` 后，如果页面没变，先按 Metro / 浏览器缓存陷阱排查。
- 所有“运行 / 重启 / 打开 / 点击”步骤必须标明执行载体。
- Claudio 永远是音乐电台：评论区 / 对话输入是点歌和推荐入口，不新增独立搜索框；LLM 主播负责理解意图、策划选曲、讲短背景和过渡。
- 默认音乐源使用已验证的 LX-compatible 链路：huibq 源 raw URL + Kuwo 候选搜索；用户仍可通过 env 配置覆盖源脚本或候选 resolver。

---

## 当前主线

**AI 电台最小闭环**

- [x] Phase A：后端 API 骨架与内存电台状态
- [x] Phase B：移动端接入服务端 API
- [x] Phase C：LLM 主播最小接入
- [x] Phase C+：主播等待体验与电台调频加载动画
- [x] Phase D：音乐来源接入，优先服务端返回真实 `Track`
- [x] Phase D.5：音源与播放性能地基，流式传输 / 缓存 / 预加载
- [x] Phase E：TTS 入声与 `tts-ready` 推送
- [ ] Phase F：后台播放、锁屏控制、APK release、长时运行等产品化任务

---

## 已完成摘要

| 阶段 | 状态 | 摘要 |
|---|---:|---|
| UI 动画架构 | 完成 | 高频动画准入规则已沉淀：Reanimated + Skia / Web canvas。 |
| Phase A | 完成 | 服务端 HTTP / WS 与内存电台状态打通。 |
| Phase B | 完成 | 移动端通过 `packages/api` 接入服务端 HTTP / WS。 |
| Phase C | 完成 | DeepSeek LLM 主播接入；无 key fallback 和真实 LLM 均验证通过。 |
| Phase C+ | 完成 | DJ 等待态改为调频加载动画；移除本地假等待文案。 |
| Phase D | 完成 | 服务端音乐解析优先返回真实 `Track`，artwork 贯通到移动端，provider 失败稳定回退 SoundHelix。详细 Review 见 `tasks/spec.md` §6。 |
| Phase D.5 | 完成 | provider chain（local→external→lx→ncm?→fallback）+ TTL/LRU cache + Range route + 客户端 60% 预热 + metrics 全过 typecheck/lint/curl；默认 LX 源作为真实音乐主链路。详见 `tasks/spec.md` §6.2。 |
| Phase E | 完成 | `msedge-tts` 接入；`/api/chat` 立返 + WS 后推 `tts-ready` + `/media/tts/:id` 200；移动端独立 `useTtsPlayer` + 音乐 ducking 0.3 + DJBubble REPLAY；voice 徽章合并到 DJ 顶栏；HTTP/WS/移动端三链验证通过。详见 `tasks/spec.md` §6.3。 |
| NativeWind 类型链路 | 完成 | React / RN / NativeWind 类型环境已对齐，`className` 类型失败修复并通过 `typecheck` / UI lint。 |
| SDK 56 升级矩阵 | 完成 | Expo 56 / React 19.2.6 / RN 0.85.3 目标矩阵回填；Node 基线更新为 `>=22.13.0`，pnpm 为 `9.0.0`。 |
| SDK 56 清理 | 完成 | 删除 NativeWind 临时 shim、重复 tsconfig 类型入口、无人依赖 override 与过期版本注释；`typecheck` / `lint` / `expo config` 验证通过。 |

---

## 最新验收提醒

- 浏览器操作：如果 UI 改动后页面仍是旧版，先按 `Ctrl + Shift + R` 硬刷新。
- 终端窗口操作：仍不生效时，在运行 Expo 的终端窗口按 `Ctrl + C` 停掉 Metro。
- 终端命令：`pnpm --filter @claudio/mobile dev -- --clear`
- 浏览器操作：重新打开 Expo Web 页面并再次硬刷新。

---

## 当前任务 · Phase G.1（LX-compatible 服务端 Bridge）

### Spec 状态

- [x] 阅读用户提供的 LX Mobile 1.8.4 本地源码。
- [x] 写入 Phase G 现状分析、结论、功能点和风险：`tasks/spec.md` §11。
- [x] 明确源脚本生命周期：活跃源常驻，切换源时 destroy → loadScript。
- [x] 明确隔离选型：第一版优先 `child_process` 独立 Bridge worker。
- [x] 明确 `globalThis.lx.request` 兼容风险：Node fetch 替代原生请求是高风险点。
- [x] 明确搜索层决策：G.1 使用 `LX_METADATA_RESOLVER_URL` 或本地 fixture 提供候选，不移植 LX Mobile `musicSdk`。
- [x] 明确设置页范围：G.1 只做服务端 Bridge 与 smoke；G.2 再做设置页“音乐源”入口。
- [x] 补齐文件级计划函数签名与可执行验证计划。
- [x] 用户确认 Phase G Spec 后进入编码 HARD-GATE。

### 当前目标

- 做服务端 LX-compatible Bridge，接入现有 provider chain、cache、timeout、fallback。
- 不直接移植 LX Mobile 原生 QuickJS；不在 Fastify 主进程执行用户源脚本。
- G.1 不做移动端设置页 UI；G.2 才提供音乐源入口，不再用播放器主界面诊断条冒充产品功能。

### 编码任务

- [x] `server/src/music/lxBridge/types.ts` / `candidateSearch.ts`：定义 `LxMusicCandidate`、`LxCandidateSearcher`，接入外部候选 resolver / fixture。
- [x] `server/src/music/lxBridge/*`：新增 LX 协议模拟、脚本生命周期、隔离 worker、request 兼容层。
- [x] `server/src/music/providers/lxBridgeProvider.ts`：把 Bridge 输出归一化为 Claudio `Track`。
- [x] `server/src/music/providerRegistry.ts` / `server/src/env.ts`：加入显式启用的 `lx` provider 配置。
- [x] 暂不改 `apps/mobile` 设置页；Phase G.2 另立 Spec 做源列表、导入 URL、启用 / 停用。

### 验证计划

- [x] 终端命令：`pnpm typecheck`
- [x] 终端命令：`pnpm lint`
- [x] 终端命令：`pnpm --filter @claudio/server build`
- [x] 终端命令：用可读测试源脚本完成 worker `loadActiveSource()` + `musicUrl` smoke test。
- [x] 终端命令：用 `LX_METADATA_FIXTURE_FILE` 验证同一脚本第二次请求不重新 evaluate。
- [x] 终端命令：用本地 HTTP endpoint 覆盖 `lx.request` JSON / text / binary / form / timeout。
- [x] 终端命令：`MUSIC_PROVIDER_CHAIN=lx,fallback` 下 `/api/chat` 命中 `lx` provider，失败时稳定 fallback。
- [x] 浏览器操作：播放器主界面无 `SOURCE / FALLBACK` 诊断条；G.1 不验收设置页导入 UI。

### Review

- 完成：服务端新增 LX-compatible Bridge，用户源脚本在 `child_process` worker 内执行；主 Fastify 进程只通过 IPC 调用。
- 完成：搜索层与解析层分离，`lx` provider 需要 `LX_METADATA_RESOLVER_URL` 或 `LX_METADATA_FIXTURE_FILE` 提供 `LxMusicCandidate[]`。
- 验证：`pnpm typecheck`、`pnpm lint`、`pnpm --filter @claudio/server build` 均通过。
- 验证：`MUSIC_PROVIDER_CHAIN=lx,fallback` + smoke 源脚本时，`/api/chat` 后 `/api/now.track.source.provider` 为 `lx`，URL 为 `https://example.com/audio/Pixel%20Reverie-1.mp3`。
- 验证：同一脚本第二次请求仍返回 `...-1.mp3`，证明源脚本没有每次请求重新 evaluate。
- 验证：本地 HTTP endpoint 覆盖 `lx.request` JSON / text / binary / form / timeout 后，用户源返回 `https://example.com/audio/request-smoke-1.mp3`。
- 验证：缺候选来源时 `lx` 未启用，`/api/now.track.source.provider` 稳定回到 `fallback`。
- 验证：真实 LX 用户源小闭环通过。使用 `_refs/lx-music-source/huibq/latest.js` + `server/fixtures/lxBridge/huibq-kw-canon-candidates.json`，`/api/chat` 后 `/api/now.track.source.provider` 为 `lx`，曲目为 `Canon in D`，音频 URL 来自真实源解析。
- 验证：对真实源返回的 Kuwo 音频 URL 执行 `Range: bytes=0-0` 探测，返回 `206`、`audio/mpeg`、下载 1 byte，证明不是固定 SoundHelix 占位歌。
- 验证：`server/.env` 已读取真实 `DEEPSEEK_API_KEY`；临时端口 `8094` 下 `/api/chat` 返回真实 LLM 生成的 DJ 文案，不再走 mock fallback。
- 说明：本次是真实源解析闭环，不是完整搜索闭环；候选仍由 fixture 提供。下一步应补 `LX_METADATA_RESOLVER_URL` 最小真实搜索适配，再进入设置页音乐源入口。
- 风险：`pnpm --filter @claudio/server build` 通过，但直接 `node server/dist/index.js` 暴露既有 Node ESM 扩展名问题；当前项目实际 dev 启动与 `tsx server/dist/index.js` 可运行。该问题不属于 LX Bridge 主逻辑，后续若要生产启动需单独修复全仓 ESM 输出策略。

## 当前任务 · Phase G.2-pre（评论区驱动真实音乐闭环）

### 目标

- 评论区 / 对话输入仍是唯一入口，不新增搜索框。
- LLM 先提炼电台意图和候选歌名 / 搜索词；服务端再用真实候选搜索 + LX Bridge 解析可播放 URL。
- DJ 文案允许比早期更完整，但仍要适合气泡展示；歌曲背景 / 趣闻短且可信，不编造硬事实。
- TTS 播报时音乐继续播放，只做音量 ducking，不改音调；ducking 目标音量控制在 `0.24` 左右，结束后恢复 `1.0`。

### 编码任务

- [x] `server/src/llm/*`：新增选曲意图 prompt / adapter，输出 `preferredTitles` 和 `searchQuery`。
- [x] `server/src/state/radioState.ts` / `server/src/music/musicResolver.ts`：把 LLM 意图接入音乐解析，不改变 `/api/chat` 公开契约。
- [x] `server/src/music/lxBridge/candidateSearch.ts`：新增显式 opt-in 的最小 Kuwo 候选搜索适配，仍优先支持外部 resolver / fixture。
- [x] `server/src/llm/prompt.ts`：增强 DJ 文案规则，保留电台口吻和候选曲约束。
- [x] `apps/mobile/app/index.tsx` / `useRadioPlayer.ts`：把 TTS ducking 从 `0.3` 收敛到专业电台更稳的 `0.24`。

### 验证计划

- [x] 终端命令：`pnpm typecheck:server`
- [x] 终端命令：`pnpm typecheck`
- [x] 终端命令：`pnpm lint`
- [x] 终端命令：真实 `DEEPSEEK_API_KEY` + 真实 LX 源 + 真实候选搜索下，`/api/chat` 后 `/api/now.track.source.provider` 为 `lx`。
- [x] 终端命令：对 `/api/now.track.url` 做 `Range: bytes=0-0` 探测，确认返回音频响应。

### Review

- 完成：`/api/chat` 仍是唯一入口；新增 LLM 选曲意图阶段，把用户评论转成 `preferredTitles` / `searchQuery` 后再交给音乐 provider。
- 完成：新增默认真实源规则；未配置用户源时使用 huibq 源 raw URL + Kuwo 候选搜索产出 LX `musicInfo`，再由用户源脚本解析真实播放 URL。
- 完成：DJ 文案允许更完整的电台播报，但 prompt 已限制不要编造幕后传闻；缺事实时讲听感、氛围和已知元数据。
- 完成：TTS talk-over 使用音量 ducking，不改变音调；背景音乐音量从 `0.3` 收敛到 `0.24`，TTS 结束后恢复 `1.0`。
- 验证：临时端口 `8095`，真实 DeepSeek + `_refs/lx-music-source/huibq/latest.js` + `LX_ENABLE_KUWO_SEARCH=true`，用户输入“我想听周杰伦的晴天...” 后 `/api/now.track.source.provider` 为 `lx`，曲目为 `晴天 / 周杰伦`。
- 验证：对真实返回的 Kuwo MP3 执行 `Range: bytes=0-0`，返回 `206`、`audio/mpeg`、下载 1 byte。
- 纠偏：第一次真实 LLM 文案出现未经验证的幕后传闻；已收紧 prompt，二次验证改为听感描述。

## 当前任务 · Phase G.2-default（默认真实音乐源）

### 编码任务

- [x] `server/src/music/providerRegistry.ts`：把刚验证成功的 huibq + Kuwo 链路升级为默认 `lx` 源，不写死本机 `_refs` 绝对路径。
- [x] `server/src/env.ts` / `.env.example`：`LX_ENABLE_KUWO_SEARCH` 默认开启，用户仍可覆盖源脚本、候选 resolver 或 provider chain。
- [x] 终端命令：不传 LX 环境变量，仅用默认配置验证 `/api/chat` 后 `/api/now.track.source.provider` 为 `lx`。
- [x] 终端命令：跑 `typecheck` / `lint`。

### Review

- 完成：默认 `lx` 源改为固定提交的 huibq raw URL，避免写死本机 `_refs` 路径，也避免 upstream `main` 漂移。
- 完成：`LX_ENABLE_KUWO_SEARCH` 默认开启；用户仍可通过 `LX_SOURCE_SCRIPT_URL` / `LX_SOURCE_SCRIPT_FILE` / `LX_METADATA_RESOLVER_URL` / `MUSIC_PROVIDER_CHAIN` 覆盖默认源或禁用 `lx`。
- 完成：默认 LX 超时改为 `30000ms`。原因是 huibq 后端冷启动会超过 13-15 秒，短超时会让默认源误回退 fallback。
- 完成：源脚本加载后常驻复用，避免默认远程脚本每次聊天重新下载。
- 验证：临时端口 `8096`，不传任何 `LX_*` 环境变量，输入“我想听周杰伦的晴天...” 后 `/api/now.track.source.provider` 为 `lx`，曲目为 `晴天 / 周杰伦`。
- 验证：对默认源返回的 MP3 执行 `Range: bytes=0-0`，返回 `206`、`audio/mpeg`、下载 1 byte。
- 验证：`pnpm typecheck`、`pnpm lint` 均通过。

---

## 暂停任务 · Phase F APK / 真机验收

- 状态：代码入口已完成，等待 Phase F.pre 真实闭环烟测后恢复。
- 仍有效决策：SDK 56 `expo-audio` 锁屏方案；`eas build --local` preview APK；原生工程产物不提交。
- 待恢复验收：EAS 登录、JDK、Android SDK / adb；APK sideload；Android 锁屏 metadata、PLAY/PAUSE、后台 ≥60s 播放。
