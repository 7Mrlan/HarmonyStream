# Phase L.2：测试整理 + Resident DJ 并行多智能体升级

## Summary

- L.1 测试文件没有删除；它们继续作为“固定歌单 / 假装懂用户 / 没资料乱说”的保护网。
- 重复测试夹具已收敛到共享工厂，减少各测试文件对 `Track`、`MusicLibrarySection`、`PersonalContext` schema 的重复构造。
- Resident DJ 主链路升级为异步 orchestrator；轻量 agent 并行，音乐多 seed 解析有限并发，LX 用户源脚本继续使用现有 child_process worker 隔离。

## Key Changes

- 新增 `server/src/test/factories.ts`，提供测试用 Track、简单歌单分组、个人上下文、用户资料工厂。
- `server/src/personal/residentDj.ts` 新增 `buildResidentDjPlanAsync`：
  - Design Director 先串行确定方向。
  - Memory Librarian、Mood Companion、Library Insight Reader、Recent Behavior Analyst 并行运行。
  - 单个辅助 agent 失败不会阻塞播放；失败原因进入内部 `diagnostics.fallbackReasons`。
- `server/src/radio/chatTurnPlanner.ts` 非明确点歌路径切到异步 Resident DJ orchestrator。
- `server/src/music/musicResolver.ts` 多 seed 解析改为默认并发 2；同一个 seed 内仍保留 provider chain 顺序兜底。
- 新增 `mapWithLimitedConcurrency` 和 `selectUniqueSeedBatchTracks` 纯函数，便于测试并发上限和去重提交。

## Test Plan

- 终端命令：`pnpm test` 通过；typecheck 全部通过，server 11 个测试文件 / 43 个测试通过。
- 终端命令：`pnpm test:full` 通过；server build、结构烟测和强制无曲目分支均通过。
- 新增覆盖：
  - 异步 orchestrator 某一路 agent 失败时仍返回候选。
  - agent fallback reason 被记录到内部 diagnostics。
  - 多 seed helper 并发上限最多 2。
  - 多 seed 结果按 id 或标题去重后提交队列。

## Assumptions

- 不删除 L.1 测试，只整理重复夹具。
- 不新增公开 API 字段；diagnostics 仅服务端内部和测试使用。
- 普通网络 I/O 使用 async 并发；用户源脚本和未来重 CPU 任务才使用 worker / 子进程。
