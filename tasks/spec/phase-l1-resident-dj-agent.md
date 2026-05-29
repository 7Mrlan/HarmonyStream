# Phase L.1：Resident DJ Agent

## 现状与问题

- `server/src/personal/profileStore.ts` / `loadUserMusicProfile` 原本只读取 `taste.md`、`routines.md`、`playlists.json`、`mood-rules.md`，不支持截图式 `simple-playlists.json` 或纯数组歌单。
- `server/src/personal/profileSearch.ts` / `searchPersonalProfile` 按关键词、标签、routine 给单曲打分；这适合 Phase L.0 候选 evidence，但不应再决定最终歌单。
- `server/src/personal/contextAssembler.ts` / `assemblePersonalContext` 原本把 `search.candidates` 直接变成 `preferredTitles`，会把个人资料过早压成固定歌名。
- `server/src/radio/chatTurnPlanner.ts` / `planChatTurn` 原本在 `personalContext.preferredTitles.length > 0` 时直接走 `buildPersonalMusicIntent`，这是“开心固定一首 / 伤心固定一首”的根因。
- `server/src/llm/prompt.ts` / `buildMusicIntentPrompt` 原本只要求 LLM 输出 `preferredTitles/searchQuery`，没有 Resident DJ 的 turn plan、comfort mode、energy curve 和 curated candidates。

## 目标行为

- 用户资料第一版保持简单：用户可以只导入 “分组名 + 歌名 + 歌手” 的 `simple-playlists.json`，也可以导入纯数组 `qq_songs.json`。
- Claudio 的运行链路改为：Design Director → Memory Librarian → Mood Companion → Playlist Curator → Music Scout → Source Resolver → DJ Host → Critic。
- 第一版内部实现不需要多个外部进程或多次 LLM 调用；用清晰的 TypeScript 模块和纯函数表达这几个智能体责任，LLM 只作为可用时的增强。
- `PersonalContext.preferredTitles` 降级为 evidence；真正传给 resolver 的是 `CuratedCandidate[]` 转出的 `preferredSeeds`。
- 伤心 / 难过类输入走 `chat-and-play` + `sit-with-you` 或 `lift-gently`，先边聊边播，不写作文，不做心理咨询承诺。
- 开心类输入走 `celebrate` + `bright`，文案可以一起高兴，但不能油腻和说教。
- 没有真实用户资料时，不假装懂用户；公共情绪 fallback 也按时段和最近播放做稳定轮转，避免永远从同一首开始。

## 内部接口

- 新增 `MusicLibrarySection`：保存简单歌单分组、描述、歌曲、来源文件、系统推断标签。
- 新增 `LibraryInsight`、`ListeningEvent`、`DjMemoryPreference`：读取本地 ignored 的 `library-insights.json`、`listening-events.jsonl`、`dj-memory.json`。
- 新增 `DjTurnPlan`：包含 `intent`、`comfortMode`、`playlistShape`、`targetCount`、`energyCurve`、`constraints`。
- 新增 `CuratedCandidate`：包含 `title`、`artist?`、`source`、`reason`、`slot`。
- 新增 `CriticReport`：检查固定映射、假装懂用户、治疗承诺、不可播却说已播放等风险；第一版用于降级 fallback 文案和测试。
- 保持公开 API 不变：`POST /api/chat` 仍返回 `ChatResponse`，WS 事件不新增字段。

## 落地结果

- `server/src/personal/profileStore.ts` 读取 `simple-playlists.json`、`qq_songs.json`、`library-insights.json`、`listening-events.jsonl`、`dj-memory.json`，并把简单歌单统一归一化为 `MusicLibrarySection`。
- `server/src/personal/residentDj.ts` 实现 Design Director、Memory Librarian、Mood Companion、Playlist Curator、Music Scout、Critic 的服务端纯函数闭环。
- `server/src/radio/chatTurnPlanner.ts` 已移除个人资料命中后的 `buildPersonalMusicIntent` 主路径，改用 Resident DJ curated candidates 进入 resolver。
- `server/src/llm/prompt.ts` 已允许深聊边播的短陪伴结构，并禁止治疗承诺、假装完全懂用户和系统细节泄露。
- `server/src/radio/intentParser.ts` 和 `chatTurnPlanner.ts` 保留公共情绪兜底，但按本轮上下文稳定轮转。

## 验证结果

- 终端命令：`pnpm test` 通过；typecheck 全部通过，server 10 个测试文件 / 40 个测试通过。
- 终端命令：`pnpm test:full` 通过；server build 通过，`smoke:radio` 结构用例与强制无曲目分支通过。
- 单元测试覆盖：简单歌单导入、`qq_songs.json` 纯数组导入、可回滚洞察 / 事件 / 记忆读取、上午轻音乐、会议间歌、难过边聊边播、不同资料不固定映射、开心共振、跳过事件降权、Critic 降级。

## 遗留边界

- 第一版只做服务端闭环，不新增移动端导入 UI。
- `listening-events.jsonl` 等本地学习文件已可读取并影响策展；自动落盘播放 / 跳过 / 收藏事件可作为后续子阶段继续做。
- 真实音源仍由 provider chain 解析；Resident DJ 不伪造不可播放曲目。
