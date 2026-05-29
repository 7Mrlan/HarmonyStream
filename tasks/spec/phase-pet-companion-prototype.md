# Phase Pet Claudio 灵动系统伴侣 Prototype

## Summary

Phase Pet 第一版做可删除 prototype：Claudio Signal Keeper 是一个电台系统伴侣，消费 Life State 与 Presence tone，能用角色本体部件变化表达听歌、说话、调频、睡眠、拖拽、陪伴 / 专注 / 庆祝等状态。

## Key Decisions

- 宠物不是模型徽章、贴图漂浮或右下角装饰；必须有眼睛、嘴、天线、手臂、胸口信号柱等角色本体变化。
- 状态机与渲染分离：`petBrain` 是纯函数，`PetCompanion` 只负责手势、收起 / 关闭和角色 rig。
- 第一版不新增 Rive / Lottie / Spine 等 native runtime，复用 Reanimated、Gesture Handler 和 SVG 分层部件。
- 默认可关闭、可收起、可拖拽，并通过 bottom offset 避让输入区。
- Phase N 之前不宣称真实音频同步；当前 `listen` 只是跟随播放状态。

## Review

- 结果：新增 `PetCompanion`，移动端主界面已接入 Life State 与 Presence tone。
- 结果：新增 `derivePetCompanionState()` 纯状态机，拖拽 > 说话 > 调频 > 听歌 > 睡眠 > 待机优先级固定。
- 结果：角色 rig 的眼睛、嘴、天线、手臂、胸口信号柱会随状态变化，不是单纯外层位移。
- 审查：修复 mobile Vitest 不能从 `@claudio/ui` 聚合入口拉 React Native runtime 的问题，测试改为直接引用纯函数文件。
- 验证：终端命令 `pnpm test` 通过；移动端 4 个测试文件 / 22 个测试，服务端 14 个测试文件 / 68 个测试通过。
