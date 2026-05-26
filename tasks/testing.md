# Claudio 测试指导

> 目标：把后端电台 smoke 固化成可重复入口，避免每次临时写 PowerShell 反复踩 Windows / env / 音源波动问题。

---

## 1. 两层测试命令

### 快速测试

终端命令：

```powershell
pnpm test
```

- 执行全仓 typecheck。
- 执行 server 纯函数单元测试。
- 不启动服务端，不依赖真实音源或网络。
- 适合纯函数、小重构和提交前快速确认。

### 完整测试

终端命令：

```powershell
pnpm test:full
```

- 先执行 `pnpm test`。
- 再执行后端电台结构 smoke。
- 会启动临时服务端，允许 30 秒左右。
- 修改 `/api/chat`、`/api/now`、队列提交、无曲目分支、音乐解析链路时优先跑这一层。

---

## 2. 后端电台结构 smoke

### 执行命令

终端命令：

```powershell
pnpm --filter server smoke:radio
```

### 该命令做什么

- 先执行 `pnpm build`，确保 `server/dist` 是最新代码。
- 直接用当前 Node 启动 `server/dist/index.js`，不通过 `Start-Process pnpm`。
- 自动分配临时端口，不占用开发用 `8080`。
- 强制使用合法日志等级 `LOG_LEVEL=fatal`，避免 env schema 拒绝 `silent`。
- 请求 `/health` 等服务端 ready 后再发请求。
- 脚本结束时自动停止临时服务端进程。

### 覆盖用例

1. `single-explicit`
   - 输入：`我想听周杰伦的晴天`
   - 目的：覆盖明确点歌路径。

2. `mood-range`
   - 输入：`想听开心的歌`
   - 目的：覆盖情绪 / 范围推荐路径。

3. `multi-recommendation`
   - 输入：`给我推荐几首伤心的歌`
   - 目的：覆盖多首推荐路径。

4. `odd-keyword`
   - 输入：`zzzzzzzzzzzzzzzzzz-not-a-song-claudio`
   - 目的：覆盖真实音源对异常关键词的结构行为。

5. `forced-no-result`
   - 环境：脚本内部临时设置 `MUSIC_PROVIDER_CHAIN=fallback`
   - 目的：稳定覆盖无曲目路径，因为 `/api/chat` 默认禁止 fallback provider 伪装成真实点歌结果。

### 验收标准

- 每个 `/api/chat` 后立即请求 `/api/now`。
- 如果 `chat.play.length > 0`，则 `/api/now.track` 必须非空，`state` 必须是 `playing`。
- 如果 `chat.play.length === 0`，则 `/api/now.track` 必须为 `null`，`state` 必须是 `idle`。
- `forced-no-result` 必须稳定返回 `play=[]`、`track=null`、`state=idle`。
- `chat.play.length` 是主播响应里推荐曲名数量，不是服务端播放队列长度；如果要验证队列数量，需要另写专项用例检查 `/api/now.playback` 中的能力字段。

---

## 3. 为什么不把“具体歌曲一定搜到”当 smoke 标准

真实 LX-compatible 音源和候选搜索会受网络、源脚本、搜索策略、相近匹配影响：

- 明确歌曲可能暂时搜不到。
- 随机字符串也可能被搜索层解析成相近歌曲。
- 同一关键词在不同时间、不同源顺序下返回结果可能不同。

所以后端重构 smoke 的核心标准不是“某首歌一定命中”，而是：

- 成功分支状态提交一致。
- 无曲目分支状态提交一致。
- API 响应结构稳定。
- 服务端能启动、能关闭、不留下临时端口。

需要验证真实音源质量时，另开音源专项测试，不混入结构 smoke。

---

## 4. 常见坑与固定规避

- Windows 上不要用 `Start-Process pnpm`；`pnpm` 不是稳定的 Win32 可执行文件。脚本直接用 `node dist/index.js`。
- 不要设置 `LOG_LEVEL=silent`；当前 env schema 只接受 `fatal | error | warn | info | debug | trace`。
- 不要手写固定端口 smoke；脚本自动找空闲端口。
- 不要在 smoke 失败后盲目重复跑；先看脚本输出的具体失败用例。
- 不要把真实音源随机结果当代码回归；先区分结构 smoke 和音源质量测试。

---

## 5. 后续新增后端 radio/chat 行为时的要求

- 修改 `server/src/state/radioState.ts`、`server/src/radio/*`、`server/src/music/*` 中会影响 `/api/chat`、`/api/now`、队列提交或无曲目分支的逻辑时，必须运行：

终端命令：

```powershell
pnpm test:full
```

- 只修改纯函数时至少运行：

终端命令：

```powershell
pnpm test
```

- 中等及以上阶段还需要按该阶段 Spec 追加专项验证，例如 lint、server build、HTTP 特定路径或真机验证。
