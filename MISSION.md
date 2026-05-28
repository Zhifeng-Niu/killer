---
orientation: [engineer]
status: active
started_at: 2026-05-28T03:28:59Z
expedition_branch: odyssey/20260528-112859
baseline_metric: 0
best_metric: 2465
total_waypoints: 7
consecutive_discards: 0
---

# Mission: 智能连续执行引擎 — 让 Agent 自主完成多步骤任务

## Goal
以终极AGI为目标推进，继续推进智能的连续执行，帮助用户在更多场景下完成任务。Odyssey-engine 的初衷就是为了完成已知和未知的任务，辅助人类达到更高的文明水平。

## Context
Project type: typescript. Auto-detected guard: npm test 2>&1.

基于之前 99 个 waypoint 的认知管线基础（142 个导出函数、49 个 prompt section、512 个测试），以及 WP100 的自主执行循环核心（checkAndAutoContinue），继续完善多步骤自主执行能力。

## Scope

### Modifiable
- packages/killer-app/src/orchestrator/ (agent, prompt-builder, background-tasks, response-processor)
- packages/killer-core/src/prefrontal/ (plan executor, planner)
- packages/killer-core/src/brainstem/ (tool executor)
- packages/killer-app/src/__tests__/

### Read-Only (PROTECTED)
- packages/killer-app/src/tui/ (TUI 组件不改动)
- packages/killer-app/src/api/ (API 端点不改动)

## Metrics

| Name | Unit | Measure Command | Direction |
|------|------|----------------|-----------|
| type_error_count | - | cd packages/killer-app && npx tsc --noEmit 2>&1 | wc -l | lower |
| test_count | - | npx vitest run packages/killer-app/src/__tests__/ 2>&1 | grep "Tests" | higher |

## Guard
```bash
cd packages/killer-app && npx tsc --noEmit
```

## Termination
- Task complete (autonomous execution loop fully functional end-to-end)
- OR stuck (10 consecutive discards)
- OR user interrupt (/odyssey-cancel)
- No iteration limit — runs until done

## What's Been Tried

### Wins
1. **WP100 — Autonomous execution loop**: Inspects active plans, enqueues [AUTO-CONTINUE] via inputQueue, max 20 continues
2. **WP1 — AUTO-CONTINUE fast path**: Bypasses ~20 user-centric processing steps
3. **WP2 — Plan step context enrichment**: Injects goal, completed/remaining steps, tools into LLM prompt; uses runNativeToolLoop
4. **WP3 — Failure recovery with retry and auto-skip**: Reset to ready for 2 retries, then skip + replan; downstream steps proceed on skipped deps
5. **WP4 — Post-execution verification**: Checks output emptiness, brevity, error signals
6. **WP5 — Execution progress events**: execution.progress consciousness event for SSE consumers
7. **WP6 — Cross-session plan recovery**: loadSession detects active plans, auto-continue resumes naturally
8. **WP7 — Execution log stream**: execution.log events at execute, verify-passed, verify-failed phases

### Dead Ends
1. **WP100 — Autonomous execution loop**: Inspects active plans, enqueues [AUTO-CONTINUE] via inputQueue, max 20 continues
2. **WP1 — AUTO-CONTINUE fast path**: Bypasses ~20 user-centric processing steps
3. **WP2 — Plan step context enrichment**: Injects goal, completed/remaining steps, tools into LLM prompt; uses runNativeToolLoop
4. **WP3 — Failure recovery with retry and auto-skip**: Reset to ready for 2 retries, then skip + replan; downstream steps proceed on skipped deps
5. **WP4 — Post-execution verification**: Checks output emptiness, brevity, error signals
6. **WP5 — Execution progress events**: execution.progress consciousness event for SSE consumers
7. **WP6 — Cross-session plan recovery**: loadSession detects active plans, auto-continue resumes naturally
8. **WP7 — Execution log stream**: execution.log events at execute, verify-passed, verify-failed phases

### Surprises
{Unexpected findings. Auto-updated in creative mode.}

## Current Best
- metric: 0 type errors, 2465 tests (747 core + 1718 app)
- 7 waypoints: autonomous execution loop fully functional end-to-end
- Retry-before-skip failure recovery, step verification, progress events, cross-session recovery

## Ideas Backlog
All 7 ideas completed. Future directions:
1. **Parallel plan step execution** — Independent steps run concurrently
2. **LLM-based result verification** — LLM judges if output meets step goal
3. **Dynamic plan adjustment** — Add/remove/reorder steps based on execution results