---
orientation: [engineer]
status: active
started_at: 2026-05-28T04:00:00Z
expedition_branch: odyssey/20260528-112859
baseline_metric: 2465
best_metric: 2465
total_waypoints: 0
consecutive_discards: 0
---

# Mission: AGI 自主规划引擎 — 从用户意图到自动执行

## Goal
让 Agent 能自动识别多步骤任务、自主创建结构化计划并开始执行，无需用户手动触发 /plan。这是从"工具驱动"到"意图驱动"的关键跨越。

## Context
Project type: typescript. Auto-detected guard: npx tsc --noEmit 2>&1 | wc -l.

基于已完成的自住执行引擎（WP100-WP7），agent 已能通过 checkAndAutoContinue 循环自动执行 plan steps。但当前缺少自动 plan 创建能力——用户说"帮我调研 X 并写个报告"，agent 需要手动 /plan 才能分解为步骤。

关键 gap：processInput → processInputCore 流程中没有"自动检测复杂任务 → 创建 plan → 触发 auto-continue"的路径。

## Scope

### Modifiable
- packages/killer-app/src/orchestrator/ (agent, prompt-builder, response-processor)
- packages/killer-core/src/prefrontal/ (planner, plan-executor, executor)
- packages/killer-app/src/__tests__/

### Read-Only (PROTECTED)
- packages/killer-app/src/tui/ (TUI 组件不改动)
- packages/killer-app/src/api/ (API 端点不改动)

## Metrics

| Name | Unit | Measure Command | Direction |
|------|------|----------------|-----------|
| type_error_count | - | cd packages/killer-app && npx tsc --noEmit 2>&1 \| wc -l | lower |
| test_count | - | npx vitest run 2>&1 \| grep "Tests" | higher |

## Guard
```bash
cd packages/killer-app && npx tsc --noEmit
```

## Termination
- Task complete (auto-plan creation fully functional end-to-end)
- OR stuck (10 consecutive discards)
- OR user interrupt (/odyssey-cancel)
- No iteration limit — runs until done

## What's Been Tried

### Wins
{Auto-updated by engine.}

### Dead Ends
{Auto-updated by engine.}

### Surprises
{Unexpected findings. Auto-updated in creative mode.}

## Current Best
- metric: 0 type errors, 2465 tests (747 core + 1718 app)
- Baseline: Autonomous execution loop complete (WP100-WP7), auto-plan creation not yet implemented

## Ideas Backlog
1. **意图复杂度检测** — 在 processInputCore 中检测用户输入是否包含多步骤任务信号（并列动作、时间序列、因果链）
2. **自动 Plan 创建** — 复杂意图自动触发 goal 提交 → plan 生成，无需 /plan 命令
3. **智能 Step 分解** — 用 LLM 将目标分解为具体、可执行的 steps，带依赖关系
4. **执行前确认（可选）** — 显示 plan 摘要让用户确认或修改，然后自动开始执行
5. **Plan 质量评分** — 评估 plan 的完整性、步骤粒度、依赖正确性
