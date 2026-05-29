# Phase N 真实音频律动

## Summary

Phase N 把主频谱从“只按播放状态模拟强度”升级成“真实音频优先、fallback 明确标记”的音频呼吸层。Web 端如果能复用现有 `audio` element，就接 Web Audio `AnalyserNode`；Native 端和 Web 能力不可用时使用播放进度 envelope，不宣称 PCM / FFT。

## Key Decisions

- `apps/mobile` 负责音频能力探测与强度推导；`packages/ui` 只接收 `intensity`、`intensitySource`、`active`、`mode` 等展示参数。
- Web 端只复用 Expo Web 已创建的 audio element，不新建隐藏播放器，避免双播或主播放器状态分裂。
- Web Audio analyser 的发布频率约 12fps，避免把整屏变成 React 60fps 热路径；频谱内部仍由 Skia / canvas 自己插值。
- Native 第一版不冒充 PCM 采样；在稳定 native 音频 tap 能力确认前，只用真实播放位置、时长、播放状态和 Presence tone 生成 `playback-envelope`。
- `MusicSpectrum.mode` 保留 Life / Presence 的展示语义；`intensity` 接管播放态能量，`mode` 只作为停播和最低呼吸语义。

## Review

- 结果：新增 `derivePlaybackEnvelope()` 纯函数和 `useAudioBreath()` hook；Web Audio 成功时返回 `source: "web-audio"`、`realAudio: true`。
- 结果：Web Audio 不可用、没有现有 audio element 或 native 端时返回 `source: "playback-envelope" | "idle" | "off"`，并保留内部 reason。
- 结果：`MusicSpectrum` 新增 `intensity / intensitySource` props，旧 `active / mode` 调用保持兼容。
- 审查：未新增公开 API，未改 provider chain，未把 fallback 写成真实 FFT，未创建第二个播放器。
- 审查：独立审查 AI 指出“全 0 analyser 误标真实”和“多 audio 误采 TTS”风险；已修复为连续静默降级和多 audio 必须 URL 匹配。
- 验证：终端命令 `pnpm test` 通过；全仓 typecheck、移动端 6 个测试文件 / 31 个测试、服务端 14 个测试文件 / 68 个测试通过。
- 验证：终端命令 `pnpm test:full` 通过；server build、结构烟测和 forced-no-result 分支通过。
