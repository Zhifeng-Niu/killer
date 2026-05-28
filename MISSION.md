---
orientation: production
status: complete
started_at: 2026-05-28T04:39:48Z
expedition_branch: odyssey/20260528-123948
baseline_metric: null
best_metric: 0 type errors
total_waypoints: 20
consecutive_discards: 0
---

# Mission: TUI Production Polish — Z世代导向的生产级体验

## Goal
以 Z 世代用户为导向，将 Killer Agent TUI 从功能完整提升到生产交付级：交互流畅、动效精致、布局专业、信息层次清晰。

## Context
Killer Agent 的 TUI 使用 ink 7 + React 19 构建，当前有：
- **Layout**: Header → ChatPanel + Sidebar → InputArea
- **Features**: 流式输出、命令补全、历史记录、Sidebar 自动隐藏
- **Theme**: Catppuccin 色彩体系

但距"生产交付级"还有差距：消息渲染单调、缺少动效、状态反馈不足、空状态处理弱。

## Scope

### Modifiable
- `packages/killer-app/src/tui/` — 所有 TUI 组件
- `packages/killer-app/src/cli/readline-loop.ts` — CLI 模式相关
- `packages/killer-app/src/log/` — 日志输出格式

### Read-Only (PROTECTED)
- `packages/killer-core/` — 核心 kernel 不动
- `packages/killer-app/src/orchestrator/` — 编排层不动
- `packages/killer-app/src/llm/` — LLM 层不动

## Metrics

| Name | Unit | Measure Command | Direction |
|------|------|----------------|-----------|
| type_error_count | - | npx tsc --noEmit 2>&1 | lower |
| test_failures | - | npx vitest run 2>&1 | lower |

## Guard
```bash
cd packages/killer-app && npx tsc --noEmit 2>&1
```

## Waypoint Plan

### WP1: Markdown Rich Rendering
- ChatPanel 消息渲染支持 **加粗、代码块、列表、链接**
- 代码块有语法高亮（用 chalk 轻量级方案）
- 列表和引用块有缩进和图标

### WP2: Typing Indicator + Streaming Polish
- AI 思考时显示打字指示器（旋转动画 + "思考中..."）
- 流式 token 逐字渲染带光标闪烁效果
- 完成时有微妙的状态转换

### WP3: Command Palette + Tab Completion UX
- `/` 输入时显示命令面板（分类列表 + 描述 + 快捷键提示）
- Tab 补全带高亮选中项
- 命令参数自动提示

### WP4: Empty State + Onboarding Flow
- 首次打开 TUI 显示欢迎界面（快捷命令指南 + 使用技巧）
- 空消息列表有引导文案
- 首次命令后显示"很好！试试 /help 看更多命令"

### WP5: Sidebar UX + Status Indicators
- Sidebar 增加连接状态指示灯（绿色已连接/红色断开/黄色重连）
- 模型名称旁显示 token/s 速度
- Goals 和 Plans 状态有进度条

### WP6: Layout Polish + Responsive Refinement
- Header 增加 session 时长和消息计数
- 消息间有微妙的分隔线
- 窄终端下 Sidebar 完全隐藏 + 提示 "按 /sidebar 切换"
- 宽终端下 Sidebar 可折叠

### WP7: Theme + Visual Identity
- 自定义 ASCII art logo
- 统一的图标系统（状态图标、消息类型图标、命令类别图标）
- 渐变色 Header bar

### WP8: Error + Loading States
- 错误消息有彩色边框和友好文案
- 断路器打开时有明显的 UI 反馈
- Key 验证失败时顶部警告条

## Termination
- All 8 waypoints done AND type_error_count = 0
- OR stuck (10 consecutive discards)
- OR user interrupt (/odyssey-cancel)

## What's Been Tried

### Wins
- WP1: Markdown rich rendering — code block syntax highlighting, inline formats (bold/italic/code/links), task lists, blockquotes, headings, tables
- WP2: ThinkingIndicator orbit spinner (braille pulse 100ms), StreamingCursor fade pulse, agent message completion ✓
- WP3: Command palette — bold highlight first item, 7 visible, +N count, Tab completion, 5 category colors
- WP4: EmptyState — ╋ K I L L E R logo mark, quick start commands, keyboard hints
- WP5: Sidebar — ConnectionIndicator (online/offline/retrying), orbit spinner for active states, ProgressBar for goals, branded section headers
- WP6: Header branded (· separators, gradient ━━━━━───), InputArea separator line, message dividers (━╌╌)
- WP7: Tokyo Night theme, box-drawing hierarchy (━ bold > ─ thin > ╌ dotted), Catppuccin-inspired palette
- WP8: Error recovery (6 patterns: 401/429/503/timeout/context/breaker), circuit breaker warning bar, key validation bar
- WP16: Visual identity — branded header with gradient, EmptyState logo mark, agent primaryDim border, user simplified, sidebar branded dividers
- WP17: Render perf — message dedup (renderedIdsRef), skip unchanged setState, tool status replace-in-place
- WP18: Markdown table rendering — auto col-width, header bold primary, ┼ junctions, skip separator rows
- WP19: Nested list rendering — 2+ space indent, ◦/· markers, depth up to 3, dimmed color
- Internal Drive: IDriveSource + goalDrive() + KillerAgent bridge — agent autonomously continues plan steps

### Dead Ends
- (none)

### Surprises
- Linter auto-applied render performance optimizations (message dedup, ref-based state management)
- bubble export was imported but unused in chat-panel — cleaned up

## Current Best
- metric: (baseline not yet measured)
- Baseline: (pending)

## Ideas Backlog
{Auto-populated. Can be manually edited.}
