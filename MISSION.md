---
orientation: engineer
status: complete
started_at: 2026-05-29T06:00:00Z
expedition_branch: odyssey/20260528-223038
baseline_metric: 0
best_metric: 0
total_waypoints: 2
consecutive_discards: 0
---

# Mission: 专项优化核心执行能力

## Goal
针对工具调用、指令遵循、定时与持续性任务、长链路执行等核心能力进行专项优化，使 Agent 在复杂、动态、长链路的任务中真正具备可执行性。

## Context
Project type: typescript monorepo. Guard: pnpm build.
前一 Waypoint 已完成：LongTaskEngine、IterativeRefiner、ErrorRecoveryManager、SelfMonitor 四个基础子系统（commit 6b92cc7）。

## Key Capability Gaps (Current Focus)
1. **工具调用优化** — 工具注册、发现、调用链编排需要更强的动态性
2. **指令遵循** — Agent 需要更精确地理解并执行复杂多步骤指令
3. **定时与持续性任务** — 定时触发、周期任务、延迟执行
4. **长链路执行** — 工具调用链、条件分支、并行/串行混合执行
5. **执行上下文管理** — 跨步骤的上下文传递与状态累积

## Scope

### Modifiable
- packages/odysseus-core/src/ — 核心架构层
- packages/odysseus-app/src/ — 应用层

### Read-Only (PROTECTED)
- odyssey.jsonl, MISSION.md frontmatter

## Metrics

| Name | Unit | Measure Command | Direction |
|------|------|----------------|-----------|
| type_error_count | errors | cd packages/odysseus-app && npx tsc --noEmit 2>&1 \| grep "error TS" \| wc -l | lower |

## Guard
```bash
pnpm build
```

## Termination
- Task complete (all 5 capability gaps addressed AND build passes)
- OR stuck (10 consecutive discards)
- OR user interrupt (/odyssey-cancel)

## What's Been Tried

### Wins
- WP1: LongTaskEngine + IterativeRefiner + ErrorRecoveryManager + SelfMonitor (4 core modules, 1679 lines, build clean)
- WP2: ToolChain (builder-pattern orchestration with serial/parallel/branch/loop/transform) + InstructionParser (rule-based + LLM-enhanced parsing) + ScheduledTaskRunner (once/recurring/daily scheduling) + ExecutionContext (cross-step state + snapshot/restore) — 4 modules, ~770 lines new code, fully integrated into agent.ts lifecycle, build clean

### Dead Ends
{None yet.}

### Surprises
{None yet.}

## Current Best
- metric: 0 type errors
- Baseline: 0 type errors

## Ideas Backlog
1. DynamicToolComposer — 动态工具组合（运行时合成新工具）
2. InstructionFollowEvaluator — 指令遵循度评估器（量化 agent 对多步骤指令的执行准确率）
3. LongChainExecutor — 超长链路执行器（100+ 步骤链的 checkpoint/resume + 流控）
