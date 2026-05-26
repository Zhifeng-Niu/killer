---
orientation: [production]
status: active
started_at: 2026-05-26T17:13:06Z
expedition_branch: odyssey/20260527-011306
baseline_metric: null
best_metric: "1911 tests pass, 0 type errors, killer command works globally"
total_waypoints: 1
consecutive_discards: 0
---

# Mission: CLI单命令启动 — 让Killer Agent像Hermes一样，一条命令就能在终

## Goal
CLI单命令启动 — 让Killer Agent像Hermes一样，一条命令就能在终端里跑起来（npx/全局安装/bin link）

## Context
Project type: typescript. Auto-detected guard: npm test 2>&1.

## Scope

### Modifiable
- (auto — all files not in Read-Only)

### Read-Only (PROTECTED)
- (none specified)

## Metrics

| Name | Unit | Measure Command | Direction |
|------|------|----------------|-----------|
| type_error_count | - | (auto-detected) | lower |

## Guard
```bash
npm test 2>&1
```

## Termination
- Task complete (all checks pass AND metric improved)
- OR stuck (10 consecutive discards)
- OR user interrupt (/odyssey-cancel)
- No iteration limit — runs until done

## What's Been Tried

### Wins
1. **esbuild bundle** — 682KB single-file CLI, inlines @killer/core, 14ms build time. External: react, ink, better-sqlite3.
2. **npm link** — `killer` and `killer-agent` commands work globally from any directory.
3. **Package.json refactor** — @killer/core moved to devDependency (only needed for types/tests), better-sqlite3 as optionalDependency.
4. **Type fix** — DreamingResult/DreamResult counterfactualBranches mismatch resolved.

### Dead Ends
{Auto-updated by engine.}

### Surprises
{Unexpected findings. Auto-updated in creative mode.}

## Current Best
- metric: (baseline not yet measured)
- Baseline: (pending)

## Ideas Backlog
{Auto-populated. Can be manually edited.}
