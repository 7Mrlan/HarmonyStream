# Phase L.3：Claudio Life State Bus

## Summary

让 Claudio 拥有统一的移动端本地“生命状态层”，再用它驱动已有 UI 的呼吸、调频、说话、听歌、睡眠反馈。

本阶段不做 `PetCompanion`，不接真实 FFT，不扩 `/api/chat`、`ChatResponse`、`StreamEvent`，不暴露 Resident DJ diagnostics。

## Current State Evidence

- `apps/mobile/app/index.tsx` / `HomeScreen` 已聚合 `connectionState`、`djLoading`、`chatSending`、`tts.playing`、`station.musicDucked`、`animationActive`、`stationPaused`、`station.stationPlaying`。
- `packages/ui/src/OnAirIndicator.tsx` 已支持 `online` 和 `label`，可直接承接状态文案。
- `packages/ui/src/MusicSpectrum.tsx` 旧版只支持 `active` 和 `ended`，缺少低呼吸、说话、睡眠等展示强度。
- `server/src/personal/residentDj.ts` 已有 Resident DJ 脑，但本阶段生命状态不进入服务端公开契约或个人记忆。

## Key Decisions

- `ClaudioLifeState` 是移动端展示态派生，不是服务端状态，不写入个人资料，不进入公开 API。
- Life State 放在 `apps/mobile/app/_utils/claudioLifeState.ts`，不放 `@claudio/core`，不放 `packages/ui`。
- 状态集合为 `offline | connecting | tuning | speaking | listening | sleeping | breathing`。
- 判定优先级固定为 `offline > connecting > tuning > speaking > listening > sleeping > breathing`。
- `HomeScreen` 是唯一聚合点，负责把业务状态映射成 UI primitive props。
- `packages/ui` 只接收展示参数，不 import 移动端 life state。
- `MusicSpectrum` 新增 `mode: 'off' | 'asleep' | 'idle' | 'low' | 'medium' | 'high'`，但保留 `active` 兼容旧调用。
- `MusicSpectrum mode` 只是视觉强度，不宣称真实音频分析。

## Implementation Notes

- 新增 `deriveClaudioLifeState()` 纯函数与移动端 Vitest。
- 新增 `apps/mobile/vitest.config.ts`，只收集 `app/_utils/**/*.test.ts`，避免 React Native 渲染测试噪音。
- 根 `pnpm test` 纳入移动端纯函数测试。
- `HomeScreen` 通过 `Record<ClaudioLifeState, ClaudioLifeVisualState>` 做穷尽映射。
- `OnAirIndicator`、`NowPlayingBar`、`DJBubble`、`MusicSpectrum` 都通过映射后的 primitive props 展示状态。

## Validation

- 终端命令：`pnpm --filter @claudio/mobile test` 通过，1 个测试文件 / 7 个测试通过。
- 终端命令：`pnpm typecheck:mobile` 通过。
- 终端命令：`pnpm typecheck:ui` 通过。
- 终端命令：`pnpm test` 通过，全仓 typecheck、移动端 1 个测试文件 / 7 个测试、server 11 个测试文件 / 43 个测试全部通过。

## Deferred

- `PetCompanion` 不在本阶段实现，仍需单独 HARD-GATE。
- 真实 FFT / audio envelope 不在本阶段实现，留到 Phase N 或后续专门阶段。
- Life State 暂不进入服务端记忆或 Resident DJ evidence。
