---
orientation: [engineer]
status: active
started_at: 2026-06-03T02:13:58Z
expedition_branch: odyssey/20260603-101358
baseline_metric: "build: pass, tui_jsx_errors: 47"
best_metric: null
total_waypoints: 6
completed_waypoints: 0
consecutive_discards: 0
---

# Mission: 优化TUI和交互，为vibe harness而生！

## Goal
将 Odysseus TUI 从基本可用迭代至世界级 coding agent 终端体验 — 像 Claude Code CLI 一样流畅、美观、高效。Vibe harness 不是玩具，是生产力工具。

## What's Been Tried

### Wins
{Auto-updated by engine.}

### Dead Ends
{None.}

### Surprises
{Unexpected findings.}

## Waypoint Plan

### Phase A: 基础修复 (WP1)
- **WP1**: 修复 TUI JSX 编译错误 — 47 个 JSX 错误，根源是 tsconfig 与文件匹配问题

### Phase B: Vibe 体验 (WP2-WP3)
- **WP2**: 主题系统重做 — Catppuccin Mocha 色彩 + 渐变 accent + emoji-free 专业风格
- **WP3**: Chat Panel 重写 — 精致 markdown 渲染 + 代码块语法高亮 + tool call 卡片化

### Phase C: 交互升级 (WP4-WP5)
- **WP4**: 输入区域重设计 — 可见输入框 + 历史导航 + Tab 补全
- **WP5**: 流式 & 进度 — 平滑 token 流式 + 工具进度条 + thinking 动画

### Phase D: 性能 & 验证 (WP6)
- **WP6**: 性能优化 + 集成验证 — 消息虚拟化 + 渲染优化 + build 通过

## Current Best
- metric: build: pass, tui_jsx_errors: 47
- 0/6 waypoints complete

## Ideas Backlog
- 多 tab 支持
- 对话导出
- 快捷键自定义
- Lighthouse 风格评分仪表盘
