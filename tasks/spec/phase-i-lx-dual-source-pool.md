# Phase I：默认 LX 双源池 + FLAC 优先

## 现状分析

- 当前 LX Bridge 已有沙箱边界：`server/src/music/lxBridge/workerProcess.ts` / `createLxWorkerProcess` 用 `child_process.fork` 启动隔离 worker；`server/src/music/lxBridge/worker-entry.ts` / `handleLoadSource` 在子进程内用 `vm.createContext` 和 `vm.Script` 执行用户源脚本，主 Fastify 进程不直接 evaluate 源脚本。
- 当前 LX 源运行时仍是单源模型：`server/src/music/lxBridge/sourceRuntime.ts` / `createLxSourceRuntime` 只维护一个 `active` worker 和一个 `scriptUrl | scriptFile`；失败时清空当前 active，下次请求仍加载同一个源。
- 当前 provider 注册仍把 LX 当成一个 provider：`server/src/music/providerRegistry.ts` / `createConfiguredLxProvider` 构造单个 `createLxBridgeProvider`，默认脚本来自 `DEFAULT_LX_SOURCE_SCRIPT_URL`，或者由 `LX_SOURCE_SCRIPT_URL` / `LX_SOURCE_SCRIPT_FILE` 覆盖。
- 当前音质优先级已经有入口：`server/src/music/providers/lxBridgeProvider.ts` / `resolveCandidateTrack` 调用 `buildQualityAttempts`，按 `qualityPreference` 逐个尝试；`server/src/music/providerRegistry.ts` / `DEFAULT_LX_QUALITY_PREFERENCE` 当前默认是 `320k,128k`，还没有把 `flac` 放到默认首位。
- 当前候选搜索与 URL 解析已经分层：`server/src/music/lxBridge/candidateSearch.ts` / `createLxCandidateSearcher` 负责产出 Kuwo 等 LX `musicInfo` 候选；`server/src/music/providers/lxBridgeProvider.ts` / `searchPlayableTracks` 再把候选交给源脚本解析 URL。这意味着 Phase I 可以先优化 URL 源池，不必复制 LX Mobile 的完整搜索 SDK。
- 本地实测基准（执行载体：终端命令，开发态 `tsx` + 现有 worker 沙箱）：用户已调换两个源文件后，`server/data/lx-sources/primary/primary.js` 为 30371 字节源，`server/data/lx-sources/secondary/secondary.js` 为 24532 字节源。
- 本地实测基准（外语 12 首：韩国、美国、英国、日本各 3 首；每个源 3 轮冷启动）：Kuwo 候选搜索总耗时 `5287ms`；两个源均对 36 次 FLAC 解析全部成功，失败数为 `0`。
- 本地实测基准（同一外语候选集）：primary 三轮总耗时 `1224ms`，平均每轮 `408ms`，冷启动初始化约 `355 / 314 / 325ms`，平均 `331ms`，FLAC 成功解析总耗时 `230ms`；secondary 三轮总耗时 `3996ms`，平均每轮 `1332ms`，冷启动初始化约 `1803 / 1062 / 1115ms`，平均 `1327ms`，FLAC 成功解析总耗时 `16ms`。
- 对用户体感的影响：当前文件位置下，primary 的冷启动显著更快，secondary 的单次 URL 拼装更快但差距在毫秒级；用户首次点歌或 worker 重建时更容易感知初始化耗时。因此 Phase I 默认顺序应为 `primary -> secondary -> fallback`。
- 当前文件投放边界正确：`server/data/lx-sources/primary/primary.js`、`server/data/lx-sources/secondary/secondary.js` 和 `server/data/lx-sources/quarantine/*` 都位于 `.gitignore` 已排除的 `server/data/` 下，不会随开源仓库提交。

## 功能点方案

### 功能点 1：默认 LX 双源池

- 目标：仓库默认运行时优先尝试 `server/data/lx-sources/primary/primary.js`，失败或无结果时自动尝试 `server/data/lx-sources/secondary/secondary.js`，再失败才交给 provider chain 后续 fallback。
- 文件计划：
  - `server/src/music/providerRegistry.ts` / `createCandidates`：把当前单个 `lx` provider 替换为两个内部 provider key：`lx-primary` 和 `lx-secondary`。
  - `server/src/music/providerRegistry.ts` / `SUPPORTED_KEYS`：新增 `lx-primary`、`lx-secondary`，并保留 `lx` 作为兼容别名。
  - `server/src/music/providerRegistry.ts` / `defaultChain`：默认顺序改为 `local -> external -> lx-primary -> lx-secondary -> ncm? -> fallback`。
  - `server/src/music/providerRegistry.ts` / `parseChainConfig`：用户显式配置 `MUSIC_PROVIDER_CHAIN=lx` 时展开为 `lx-primary,lx-secondary`，避免旧配置失效。

### 功能点 2：保留用户 env 覆盖能力

- 目标：开源用户如果没有复制本地源文件，系统不能崩；如果用户配置了 `LX_SOURCE_SCRIPT_URL` 或 `LX_SOURCE_SCRIPT_FILE`，仍按用户指定源工作。
- 文件计划：
  - `server/src/music/providerRegistry.ts` / `createConfiguredLxProvider`：拆成“创建指定脚本文件 provider”的小函数，避免复制候选搜索、runtime、qualityPreference 的装配逻辑。
  - `server/src/music/providerRegistry.ts` / `createCandidates`：当 `LX_SOURCE_SCRIPT_URL` 或 `LX_SOURCE_SCRIPT_FILE` 存在时，生成兼容 provider `lx` 并优先尊重用户配置；当二者不存在时，使用本地默认双源池。
  - `server/src/music/providerRegistry.ts`：primary 和 secondary 必须共享同一个候选搜索层；该共享层需要按输入复用同一次 `searchCandidates` 结果 / promise，避免 primary 失败后 secondary 再打一次 Kuwo 搜索。
  - `server/src/env.ts`：不新增必填 env；只把注释从“单 LX 源”更新为“用户可覆盖默认双源池”。`.env.example` 是否更新放到执行阶段按实际 diff 判断。

### 功能点 3：FLAC 优先且快速降级

- 目标：默认音质顺序改为 `flac,320k,128k`；如果某个源声明或实际不支持 `flac`，立即降级到下一档，不因为无损失败拖死 `/api/chat`。
- 文件计划：
  - `server/src/music/providerRegistry.ts` / `DEFAULT_LX_QUALITY_PREFERENCE`：改为 `['flac', '320k', '128k']`。
  - `server/src/music/providers/lxBridgeProvider.ts` / `buildQualityAttempts`：沿用现有“按源声明过滤音质”的逻辑；本阶段不引入 `flac24bit` 默认尝试，避免高音质探测把失败路径拉长。
  - `server/src/env.ts` / `LX_QUALITY_PREFERENCE` 默认值同步为 `flac,320k,128k`。

### 功能点 4：命中源可观测

- 目标：HTTP 返回的 `Track.source.provider` 能看出命中的是第一源还是第二源，便于排查“某首歌为什么慢 / 为什么失败”。
- 文件计划：
  - `server/src/music/providers/lxBridgeProvider.ts` / `createLxBridgeProvider`：允许传入 provider id / name 覆盖默认 `LX_MANIFEST`，例如 `lx-primary`、`lx-secondary`。
  - `server/src/music/providers/lxBridgeProvider.ts` / `candidateToTrack`：使用当前 provider manifest 的 id / tier / cachePolicy，而不是固定 `LX_MANIFEST.id`。
  - `packages/api/src/types.ts`：不改公开类型，现有 `Track.source.provider: string` 已足够承载 `lx-primary` / `lx-secondary`。

### 功能点 5：warmup 不阻塞启动主链路

- 目标：服务启动预热两个 LX 源可以提升首次点歌速度，但任一源 warmup 失败不能影响服务启动，也不能阻断另一个源。
- 文件计划：
  - `server/src/music/providerRegistry.ts` / `warmupProviderChain`：沿用当前逐 provider 捕获错误的逻辑；接入双源后自然分别 warmup。
  - `server/src/music/lxBridge/sourceRuntime.ts`：保留每个 provider 独立 runtime / worker，不共享 active 状态，避免一个源异常污染另一个源。

## 风险与决策

- 决策：Phase I 只接入服务端默认双 LX 源池，不新增移动端音乐源管理 UI，不新增公开 API 字段，不把 `server/data` 下的实际源文件提交到仓库。
- 决策：默认第一优先源按当前文件位置使用 `server/data/lx-sources/primary/primary.js`；第二优先源使用 `server/data/lx-sources/secondary/secondary.js`；默认链路为 `primary -> secondary -> fallback`。
- 决策：`parseChainConfig` 已存在于 `server/src/music/providerRegistry.ts`，`MUSIC_PROVIDER_CHAIN=lx` 到 `lx-primary,lx-secondary` 的兼容展开只能在这个函数里实现，不在 `defaultChain`、`createCandidates` 或调用点散落内联判断。
- 决策：`LX_SOURCE_SCRIPT_URL` / `LX_SOURCE_SCRIPT_FILE` 显式配置时，视为用户覆盖默认双源池；此时保持兼容 provider id `lx`，避免用户自定义单源被意外拆成双源。
- 决策：默认音质只提升到 `flac,320k,128k`；暂不默认尝试 `24bit` / `flac24bit`，因为高音质探测失败成本更高，且当前目标是“稳定无损优先”而不是“极限规格优先”。
- 风险：当前 `sourceRuntime.ts` 的 worker 入口在生产 `dist` 下存在 ESM 扩展名解析风险，测试时发现 `worker-entry.js` import `lxRequest` 失败；Phase I 执行时如果触碰 build/start 验证，需要同步修复该生产入口，否则只能证明 dev 态可用。
- 决策：服务端 `package.json` 使用 `"type": "module"` 且 tsc 输出 ESM；`server/src` 内相对 import 必须写 `.js` 扩展，保证 `pnpm --filter server build` 后 `node dist/index.js` 可直接运行。
- 追加决策：默认真实源文件随仓库提交到 `server/assets/lx-sources/primary.js` 与 `server/assets/lx-sources/secondary.js`，保证开源用户拉取代码后只配置 LLM/TTS key 即可闭环测试；`server/data/lx-sources/*` 继续作为本机私有覆盖层。
- 追加决策：LX 默认源 provider 的 `isEnabled` 需要检查本地脚本文件是否存在；共享候选搜索层保留失败复用，但失败 TTL 缩短到 3s，降低瞬时抖动恢复成本。
- 风险：两个默认源都依赖第三方接口，短期内本地基准很快不等于长期稳定；因此必须保留 provider chain 失败继续向后走的机制，并让 `Track.source.provider` 可观测。
- 风险：`server/data/lx-sources/*` 被 `.gitignore` 排除，开源用户首次拉仓库时没有这两个源文件；服务端必须在默认源文件不存在时跳过对应 provider，而不是启动失败。

## 执行步骤

1. 更新 LX provider manifest 可配置能力。
   - 文件：`server/src/music/providers/lxBridgeProvider.ts`
   - 操作：让 `createLxBridgeProvider` 接收可选 `manifest` 覆盖项，至少支持 `id`、`name`、`description`。
   - 验证：`candidateToTrack` 不再固定写 `LX_MANIFEST.id`，而是使用当前 provider manifest，返回 `Track.source.provider = lx-primary | lx-secondary`。

2. 抽出 providerRegistry 的 LX provider 工厂。
   - 文件：`server/src/music/providerRegistry.ts`
   - 操作：把 `createConfiguredLxProvider` 拆成参数化 helper，例如 `createLxProviderFromScript({ key, name, scriptFile?, scriptUrl? })`，统一创建 runtime、candidateSearcher、qualityPreference。
   - 操作：创建共享候选搜索器包装层，按 `userText + preferredTitles + limit` 复用同一个 `searchCandidates` promise；primary 和 secondary 注入同一个包装实例。
   - 验证：候选搜索配置仍复用 `LX_METADATA_RESOLVER_URL` / `LX_METADATA_FIXTURE_FILE` / `LX_ENABLE_KUWO_SEARCH`，不复制搜索逻辑；primary 失败后 secondary 不重复发起 Kuwo 搜索。

3. 接入默认双源池和兼容别名。
   - 文件：`server/src/music/providerRegistry.ts`
   - 操作：新增默认本地路径常量 `server/data/lx-sources/primary/primary.js` 与 `server/data/lx-sources/secondary/secondary.js`；在 `createCandidates` 注册 `lx-primary`、`lx-secondary`。
   - 操作：更新 `SUPPORTED_KEYS` 支持 `lx-primary`、`lx-secondary`、`lx`；仅在已有 `parseChainConfig` 中把 token `lx` 展开为 `lx-primary,lx-secondary`。
   - 操作：`defaultChain` 改为 `local,external,lx-primary,lx-secondary,ncm?,fallback`。
   - 验证：未配置 env 时，provider chain 顺序包含 `lx-primary` 在 `lx-secondary` 前；显式 `MUSIC_PROVIDER_CHAIN=lx` 时展开为两个源。

4. 保留用户自定义单源覆盖。
   - 文件：`server/src/music/providerRegistry.ts`
   - 操作：当 `LX_SOURCE_SCRIPT_URL` 或 `LX_SOURCE_SCRIPT_FILE` 存在时，注册兼容 provider `lx`，并让默认链或解析后的链优先使用用户源，不强行挂默认双源池。
   - 验证：用户配置 `LX_SOURCE_SCRIPT_FILE` 时，`Track.source.provider` 仍可为 `lx`，不被改成 `lx-primary`。

5. 调整默认音质。
   - 文件：`server/src/music/providerRegistry.ts`、`server/src/env.ts`
   - 操作：默认 `LX_QUALITY_PREFERENCE` 改为 `flac,320k,128k`。
   - 验证：HTTP 点歌返回的 `track.quality` 优先为 `flac`；源不支持 flac 时能降级，不让 `/api/chat` 长时间卡住。

6. 验证与烟测。
   - 终端命令：`pnpm --filter server typecheck`
   - 终端命令：`pnpm lint`
   - 终端命令：启动服务端后请求 `/api/chat`，输入“我想听许嵩的乌鸦”，确认 `/api/now.track.source.provider` 为 `lx-primary`，`quality` 优先为 `flac`。
   - 终端命令：临时移走或禁用 `primary.js` 后重启服务端，请求同一首歌，确认命中 `lx-secondary`；测试结束恢复文件。
   - 终端命令：临时配置 `LX_SOURCE_SCRIPT_FILE` 指向单个源，确认命中 provider id `lx`，证明用户覆盖路径未被破坏。
