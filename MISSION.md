---
orientation: [creative]
status: active
started_at: 2026-05-29T05:04:37Z
expedition_branch: odyssey/20260529-130437
baseline_metric: null
best_metric: null
total_waypoints: 6
consecutive_discards: 0
---

# Mission: TUI 流动感动效增强

## Goal
为 TUI 添加有流动感的动效——平滑的波形、涟漪、流光。不是简单闪烁，而是连续、流畅、有节奏的视觉运动。

## Context
Project type: typescript. TUI stack: ink 7 + React 19.
现有动效：月相思考(4帧)、方块波形(4帧)、呼吸边框(6帧)、错误渐隐(4帧)。
帧数太少导致"跳动"而非"流动"。需要更长的帧序列 + 相位偏移。

## Scope

### Modifiable
- packages/odysseus-app/src/tui/ (all files)

### Read-Only (PROTECTED)
- packages/odysseus-core/ (kernel)
- packages/odysseus-app/src/orchestrator/ (agent)
- packages/odysseus-app/src/cli/ (CLI)

## Waypoints

### WP1: Flowing Waves — 流畅波形帧序列
theme.ts 增加 12+ 帧平滑波形，替代当前 4 帧跳变。正弦函数生成 Unicode 方块序列。
文件：theme.ts

### WP2: Thinking Ripple — 思考涟漪动效
ThinkingIndicator 从月相+dots 改为相位偏移的流动涟漪：多字符同时动画，各字符有微小时间差。
文件：chat-panel.tsx, theme.ts

### WP3: Streaming Flow — 流式流光光标
StreamingCursor 从 4 帧方块变为 8+ 帧流光尾迹，紫色→亮紫渐变脉冲。
文件：chat-panel.tsx, theme.ts

### WP4: Ambient Flow — 空状态环境流动
EmptyState 渐变密度条变为动态流动 — ▓▒░ 密度随时间平移，制造呼吸般的视觉节奏。
文件：chat-panel.tsx

### WP5: Divider Flow — 分隔线流动
user→agent 分隔线从静态 `━▓▒░` 变为流动渐变：密度字符随帧移动，产生"扫描线"效果。
文件：chat-panel.tsx, theme.ts

### WP6: Input Flow — 输入区流光
输入框边框从呼吸色变改为流光扫过效果。左侧指示器从月相改为流动脉冲。
文件：input-area.tsx, theme.ts

## Metrics

| Name | Unit | Measure Command | Direction |
|------|------|----------------|-----------|
| type_error_count | - | cd packages/odysseus-app && npx tsc --noEmit 2>&1 | lower |

## Guard
```bash
cd packages/odysseus-app && npx tsc --noEmit 2>&1
```

## Termination
- Task complete (all waypoints done AND build passes)
- OR stuck (10 consecutive discards)
- OR user interrupt (/odyssey-cancel)

## What's Been Tried

### Wins
- WP1: sineWaveFrames/sineColorFrames 正弦帧生成器 + 6 组新帧序列（12-24帧）
- WP2: ThinkingIndicator 从月相+dots 改为 5 字符相位偏移涟漪 (12帧 120ms)
- WP3: StreamingCursor 从 4 帧方块改为 8 帧流光尾迹 (暗→亮正弦渐变 80ms)
- WP4: EmptyState 密度条从静态改为 24 帧密度平移流动 (150ms)
- WP5: FlowDivider 分隔线从静态 ▓▒░ 改为 16 帧扫描线 (100ms)
- WP6: 输入框边框从 6 帧呼吸改为 16 帧正弦流光，指示器从 4 帧改为 12 帧平滑波

### Dead Ends
(none)

### Surprises
- 正弦生成器让帧序列可以无限扩展而不需要手工维护
- 相位偏移 0.8 弧度在 5 字符宽度上产生自然的涟漪传播效果

## Current Best
- metric: 0 type errors
- Baseline: 0 type errors

## Ideas Backlog
- 多层动画叠加（背景流 + 前景脉冲）
- 消息出现时的淡入过渡（用密度字符模拟 alpha）
- 颜色循环：hue shift 制造彩虹流
- 输入框边框字符本身也变化（─ → ━ → ─ 脉冲）
