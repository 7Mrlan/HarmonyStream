# Phase J.3：自动化测试入口

## 现状分析

- 根 `package.json` 原本只有 `typecheck`、`lint`、`build`，没有统一 `test` / `test:full`。
- `server/package.json` 原本有 `smoke:radio`，但缺少纯函数单元测试入口。
- `server/scripts/smoke-radio.ts` 适合作完整结构 smoke，但会启动服务端并触达真实音源，不适合每次保存后高频运行。
- `playbackQueue.ts`、`intentParser.ts`、`cache.ts`、`titleMatch.ts` 已有高价值纯函数，适合作第一批单元测试。

## 功能点方案

- 引入 Vitest 作为 server 单元测试框架，适配 TypeScript + ESM，避免额外 Babel / Jest transform。
- 根命令分两层：
  - `pnpm test`：`pnpm typecheck && pnpm --filter server test`
  - `pnpm test:full`：`pnpm test && pnpm --filter server smoke:radio`
- 不使用 `pnpm -r test`，因为 workspace 多数包没有 test 脚本，递归 test 会制造无意义失败。
- 第一批测试覆盖：
  - `server/src/radio/playbackQueue.test.ts`
  - `server/src/radio/intentParser.test.ts`
  - `server/src/music/cache.test.ts`
  - `server/src/music/titleMatch.test.ts`
- `intentParser.ts` 内部函数不为测试强行 export；通过公开 parser 函数覆盖行为。

## 执行结果

- 新增 `server/vitest.config.ts`。
- 新增根 `test` / `test:full` 脚本。
- 新增 server `test` 脚本。
- 新增四个测试文件，共 15 个单元测试。
- 更新 `tasks/testing.md`，明确快速测试和完整测试边界。
- 单元测试发现并修复一个真实 bug：`我想听周杰伦的晴天` 会先命中裸 `X的Y` 规则，把 artist 解析成 `我想听周杰伦`；修复为先匹配带前缀点歌，再匹配裸 `周杰伦的晴天`。

## 验收

- `pnpm test` 通过。
- `pnpm test:full` 通过。
- `pnpm lint` 通过。
