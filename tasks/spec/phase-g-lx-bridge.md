# Phase G · LX-compatible 音乐源 Bridge

> 本文件从 `tasks/spec.md` 拆出，保留 Phase G 的完整历史设计细节；主 `tasks/spec.md` 只保留当前仍活跃的决策摘要。

## 代码现状

- Claudio 当前音乐权威链路在服务端：`server/src/state/radioState.ts` / `handleChat` 调用 `resolveTracksForChat()`，成功后写入 `currentTrack`、`queue` 并广播 `now-playing` / `queue-update`。
- Provider chain 已经存在：`server/src/music/providerRegistry.ts` / `buildProviderChain` 按 `local → external → ncm? → fallback` 装配，`fallback` 永远兜底。
- 性能地基已存在：`server/src/music/musicResolver.ts` 用 provider id + 关键词 + limit 做 resolveCache；`server/src/music/cache.ts` 是 TTL + LRU；`server/src/music/preload.ts` 做串行轻量预热。
- 当前 `externalResolverProvider` 只消费进程外 HTTP resolver；还没有 App 内“添加音乐源 / 选择音乐源 / 查看源状态”的产品入口。
- LX Mobile 1.8.4 的用户源入口在设置页：`src/screens/Home/Views/Setting/settings/Basic/Source.tsx` 渲染源列表与用户源弹窗；`ScriptImportOnline.tsx` 支持从 URL 下载脚本。
- LX Mobile 的用户源不是普通 React 组件内执行：`src/utils/nativeModules/userApi.ts` 把脚本交给 `UserApiModule.loadScript()`；Android 侧 `QuickJS.java` 创建 QuickJS context，加载 `user-api-preload.js` 后再 evaluate 用户脚本。
- LX 用户源协议的关键面是 `globalThis.lx`：`EVENT_NAMES`、`request`、`send`、`on`、`utils`、`currentScriptInfo`、`version`、`env`；源脚本通过 `send(inited, { sources })` 声明支持能力，通过 `on(request)` 响应 `musicUrl / lyric / pic`。
- LX Mobile 的搜索与用户源解析是分层的：`src/utils/musicSdk/index.js` 负责 `searchMusic/findMusic`；用户源主要把候选 `musicInfo + quality` 解析成 `musicUrl`。不能把用户源误判成完整文本搜索引擎。

## 当前结论

- 最适合 Claudio 的方案是服务端 LX-compatible Bridge，而不是直接移植 LX Mobile 原生 QuickJS 模块。
- 原因：Claudio 当前是 Expo Web + Node 服务端，暂无原生 `android/ios` 工程；直接搬原生模块会破坏 Web 调试和当前工程边界。
- Bridge 必须接入现有 provider chain、cache、timeout、fallback，不另起播放器或状态链路。
- 第一版必须承认 LX 用户源主要解决 URL 解析；搜索元数据来源要单独定义，不能假设任意用户源都能直接从自然语言返回歌曲。
- 搜索层决策：Phase G.1 不移植 LX Mobile `musicSdk` 搜索模块，不在本项目内直接维护各平台搜索 API；`lx` provider 只消费一个显式的候选搜索输入，再把候选交给 LX 用户源解析播放 URL。
- 候选搜索输入第一版走 `LX_METADATA_RESOLVER_URL` 或本地 smoke fixture，两者都必须返回 Claudio 定义的 `LxMusicCandidate[]`。没有候选输入时 `lx` provider 判定为未启用，provider chain 继续走后续 provider / fallback。
- 设置页范围决策：Phase G.1 只做服务端 Bridge 与 HTTP smoke，不做 App 内导入 UI；Phase G.2 再单独实现设置页“音乐源”入口。这样避免把未闭环的源状态暴露在播放器主界面，也避免在 Bridge 未验证前先做交互外壳。

## 功能点与文件级计划

### 功能点 1：搜索候选层

- 目标：把“自然语言 / LLM 推荐曲名”先转成可交给 LX 用户源的候选 `musicInfo`，再进入 URL 解析。
- 决策：第一版只接受外部候选 resolver 或测试 fixture，不复制 LX Mobile `musicSdk`。原因是 `musicSdk` 是独立平台搜索层，直接搬入会引入大量平台请求维护和合规风险，不适合作为 Bridge 第一版地基。
- 文件计划：
  - `server/src/music/lxBridge/types.ts`：定义候选、解析结果、运行时接口。
  - `server/src/music/lxBridge/candidateSearch.ts`：封装外部候选 resolver 与 fixture 搜索。

### 功能点 2：服务端 LX Bridge 核心

- 目标：新增服务端 `lx` provider，把候选 `musicInfo` 交给 LX 用户源脚本解析 URL，再转成 Claudio `Track`。
- 文件计划：
  - `server/src/music/providers/lxBridgeProvider.ts`：实现 `MusicProvider`，串联候选搜索、Bridge runtime、Track 归一化。
  - `server/src/music/providerRegistry.ts`：把 `lx` 加入支持 key；默认不启用，用户配置后才进入 chain。
  - `server/src/env.ts`：新增最小环境配置，例如 `LX_SOURCE_SCRIPT_URL` / `LX_SOURCE_SCRIPT_FILE` / `LX_METADATA_RESOLVER_URL` / `LX_METADATA_FIXTURE_FILE` / `LX_BRIDGE_TIMEOUT_MS`。

### 功能点 3：源脚本生命周期

- 目标：避免每次搜索重新 evaluate，同时允许切换源。
- 决策：运行时只常驻“当前启用源”的 context；源不变时复用同一个 context；用户切换源或脚本 hash 变化时执行 destroy → loadScript。
- 说明：这是 Claudio 的性能设计，不等同于“所有源长驻”。LX Mobile 也是切换源时 `destroy()` 再 `loadScript()`。
- 文件计划：
  - `server/src/music/lxBridge/sourceRuntime.ts`：维护 active source、script hash、初始化状态、destroy/load/reload。
  - `server/src/music/lxBridge/sourceStore.ts`：第一版可先用环境变量 / 本地配置描述启用源；App 内持久化入口后续再扩。

### 功能点 4：隔离执行选型

- 目标：第三方源脚本不能跑在 Fastify 主进程。
- 候选方案：
  - `worker_threads`：集成轻，通信快；但同进程内存共享风险更高，恶意脚本 CPU 卡死时仍影响进程资源。
  - `child_process` 独立进程：隔离更清晰，可超时 kill，适合第一版；通信成本对音乐搜索可接受。
  - `quickjs-emscripten` / 服务端 QuickJS：更接近 LX Mobile，但引入新运行时和包体，兼容 Node ESM / pnpm / 构建需要额外验证。
- 决策：第一版优先选 `child_process` 独立 Bridge worker；只有在兼容性验证需要时再评估 QuickJS。禁止直接在 Fastify 主进程 `vm.runInContext` 执行用户源。
- 文件计划：
  - `server/src/music/lxBridge/workerProcess.ts`：主进程启动、请求、超时、重启、kill。
  - `server/src/music/lxBridge/worker-entry.ts`：子进程内模拟 `globalThis.lx` 并执行用户脚本。

### 功能点 5：`globalThis.lx.request` 兼容层

- 目标：用 Node fetch 模拟 LX Mobile 的原生请求行为，尽量兼容已有源。
- 必须兼容：
  - `method / headers / body / form / formData / binary / timeout`
  - 默认 `User-Agent`
  - 返回 `{ statusCode, statusMessage, headers, body }`
  - JSON 自动 parse，失败保留文本 body
  - Abort / cancel 行为
- 已知风险：已有 LX 源可能依赖移动端 fetch 的 cookie、header 合并、二进制 buffer、formData 编码、大小写 header 或特定 UA。Bridge 第一版必须把这些差异作为兼容风险记录，并给失败原因可观测日志。

### 功能点 6：设置页入口边界

- 目标：明确本阶段不把开发诊断 UI 放回播放器主界面。
- Phase G.1 编码范围：不新增移动端设置页，不新增用户导入脚本 UI；只通过环境变量 / 本地 fixture 启用服务端 Bridge 并完成 smoke。
- Phase G.2 后续范围：新增设置页“音乐源”入口，包含源列表、当前启用源、导入 URL、启用 / 停用、失败原因；该阶段需要单独 Spec，因为它涉及持久化、安全提示和用户操作闭环。

## 验证计划

- 静态验证：
  - 终端命令：`pnpm typecheck`
  - 终端命令：`pnpm lint`
  - 终端命令：`pnpm --filter @claudio/server build`
- Bridge worker smoke：
  - 终端命令：用可读测试源脚本启动 worker，确认 `loadActiveSource()` 返回 source 列表与脚本 hash。
  - 终端命令：用 `LX_METADATA_FIXTURE_FILE` 提供固定候选，确认 `resolveMusicUrl()` 返回非 fallback URL，且同一脚本第二次请求不重新 evaluate。
  - 终端命令：用会抛错的测试源脚本验证 worker 被隔离处理，Fastify 主进程不崩溃，provider chain 继续 fallback。
- HTTP 链路 smoke：
  - 终端命令：以 `MUSIC_PROVIDER_CHAIN=lx,fallback`、`LX_SOURCE_SCRIPT_FILE=...`、`LX_METADATA_FIXTURE_FILE=...` 启动服务端。
  - 终端命令：`curl -X POST http://127.0.0.1:8080/api/chat ...` 后请求 `/api/now`，确认 `track.source.provider` 为 `lx`，`track.url` 来自源脚本解析。

## 风险与决策

- 决策：第一版只做搜索候选 + `musicUrl` 播放 URL 解析；歌词、封面补全、歌单、评论、下载不进入第一版。
- 决策：UI 入口最终在设置页“音乐源”，但 Phase G.1 不做移动端 UI；Phase G.2 单独做设置页闭环。
- 决策：用户源脚本来自用户主动添加；Claudio 不内置、不默认启用任何第三方灰色源。
- 决策：搜索候选层第一版使用 `LX_METADATA_RESOLVER_URL` 或本地 fixture，不复制 LX Mobile `musicSdk`。
- 风险：LX Mobile 的内置 `musicSdk` 搜索模块有独立实现，直接复制会引入大量第三方平台请求和维护成本；后续若要移植，必须单独评估接口维护、合规边界和数据归一化成本。
- 风险：`lx.request` 兼容度决定可用性；需要用至少一个非混淆、可读的用户源脚本做 smoke test，再扩大到更多源。
- 风险：第三方脚本和数据来源可能涉及版权或服务条款限制；实现只提供用户自配框架，不帮助绕过付费、VIP 或授权控制。
