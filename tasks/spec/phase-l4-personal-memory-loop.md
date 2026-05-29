# Phase L.4：Claudio Personal Memory Loop

## Summary

让 Claudio 的收藏、跳过、上一首和明确音乐反馈真正写入本地私有记忆，再被 Resident DJ 下一轮读取并影响推荐。

本阶段不做宠物、不做新的大 UI 面板、不把普通闲聊自动脑补成长期偏好。

## Current State Evidence

- `server/src/personal/profileStore.ts` 已能读取 `listening-events.jsonl`、`library-insights.json`、`dj-memory.json`，但此前没有写入入口。
- `server/src/personal/residentDj.ts` 已会用 `favorite / repeat / play` 加分，用 `skip / previous` 降分。
- `apps/mobile/app/index.tsx` 已有收藏按钮和聊天输入，`apps/mobile/app/_hooks/useStationController.ts` 已有上一首 / 下一首触发点。
- `packages/api` 是移动端和服务端共享 HTTP 契约入口。

## Key Decisions

- 新增 `POST /api/listening-events`，只接收行为事件，不返回用户资料。
- 事件 append-only 写入 ignored 的 `server/data/user-profile/listening-events.jsonl`，不覆盖用户导入资料。
- `packages/api` 新增 `ListeningEventRequest`、`ListeningEventResponse` 和 `recordListeningEvent()`。
- 写入口有来源防护：移动端带 `X-Claudio-Client: claudio-app`；配置 `SHARED_TOKEN` 时必须走 `Authorization: Bearer ...`。
- 移动端写入失败一律静默，不阻塞聊天、收藏、切歌或播放。
- feedback 识别必须保守：同一语义片段内同时出现音乐主体和偏好信号才写入。
- 下一首 / 上一首只在服务端切歌成功后记录；本地兜底切歌不写负向记忆。
- 写入端限制 title / artist / text 长度；Resident DJ 证据再把 event text 压缩到 32 字进入 prompt。

## Validation

- 终端命令：`pnpm test` 通过，全仓 typecheck、移动端 2 个测试文件 / 10 个测试、server 12 个测试文件 / 52 个测试通过。
- 终端命令：`pnpm test:full` 通过，server build、结构烟测和 forced-no-result 分支通过。
- 审查 AI 第三轮复核通过：feedback 误写、本地兜底切歌误记、Resident DJ 证据长文本、route token / Origin / 长度测试均无阻塞问题。

## Deferred

- `dj-memory.json` 自动汇总器不在本阶段实现，后续单独设计可回滚的长期记忆 consolidation。
- 移动端用户歌单导入 UI 仍留到 Phase M。
- 真实音频完整播放 / 重复播放事件需要更细播放器生命周期，本阶段不自动记录。
