# Phase M 用户音源导入 UI

## Summary

Phase M 把用户音源导入从环境变量扩展到 App 内操作：用户可以粘贴 LX-compatible 源脚本，服务端在 child_process worker 中验证，通过后写入 ignored 的 `server/data/lx-sources/user` 并启用；也可以随时回滚默认双源池。

## Key Decisions

- 音源脚本不进 Git、不写日志、不进入公开聊天响应；状态接口只返回名称、hash、source key 和启用状态。
- 导入验证复用现有 LX worker 隔离，不让用户脚本进入 Fastify 主进程。
- provider chain 启动时仍优先环境变量源；未配置环境变量时，App 导入源优先于默认双源池。
- 移动端只新增紧凑 SOURCE 面板，不新增独立搜索入口，不影响 `/api/chat` 主契约。
- 回滚默认源只禁用本地用户源，不删除脚本，便于之后重新启用。

## Review

- 结果：新增 `/api/music-sources`、`/api/music-sources/import`、`/api/music-sources/activate`，共享 API client 已接入。
- 结果：新增本地用户源 store，导入验证失败不会覆盖已有源；启用 / 回滚会 reset provider chain cache。
- 结果：移动端新增 `MusicSourcePanel`，可查看状态、导入用户源、启用用户源、回滚默认源。
- 审查：修复 Vitest 下 child_process worker 无 dist 入口的问题，测试改为注入同等语义的 `handleLoadSource` runner；生产仍走 child_process。
- 审查：修复 worker IPC channel closed 时可能抛未处理异常的问题。
- 验证：终端命令 `pnpm test` 通过；移动端 3 个测试文件 / 16 个测试，服务端 14 个测试文件 / 68 个测试通过。
- 验证：终端命令 `pnpm test:full` 通过；server build、radio structural smoke、forced-no-result 分支通过。
