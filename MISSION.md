---
orientation: [engineer]
status: completed
started_at: 2026-05-26T11:46:50Z
expedition_branch: odyssey/remaining-features-20260526
baseline_metric: null
best_metric: null
total_waypoints: 3
consecutive_discards: 0
---

# Mission: Phase 3-4 + npx one-command start

## Goal
Implement remaining high-priority features: DreamEngine counterfactual dreaming, Cerebellum experiment integration into BrainstemLoop, and npx global CLI experience

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
- Waypoint 1: DreamEngine counterfactual dreaming (Phase 3) — 新增 CounterfactualBranch 类型，dreamCounterfactual() 探索替代路径，projectPath() 沿语义图谱投影。6 个新测试，706+1176=1882 测试零回归。
- Waypoint 2: npx 一键启动已就绪 — killer.mjs 零配置入口已有完整实现（Node 版本检测、pnpm 自动安装、依赖安装、构建、CLI 启动）。bin 字段已配置。发布到 npm 后即可 npx 使用。
- Waypoint 3: BrainstemLoop-Cerebellum 反馈闭环 — injectExperimentPerception() 将实验结果注入下一轮感知队列，形成 Cerebellum → BrainstemLoop 反馈环。任务终止时记录日志。

### Dead Ends
{None yet.}

### Surprises
- 反事实梦境不需要 LLM 调用——纯语义图谱操作即可模拟"如果当时做了不同选择"
- npx 体验实际上已在 killer.mjs 中完整实现，不需要额外代码

## Current Best
- metric: 0 type errors
- Baseline: 0 type errors

## Ideas Backlog

### High Priority
- [ ] CriticCell / ExplorerCell runtime behavior (Phase 4)
- [ ] 发布到 npm 以支持 npx @killer/app

### Completed
- [x] DreamEngine counterfactual dreaming (Phase 3)
- [x] BrainstemLoop-Cerebellum experiment feedback loop
- [x] npx one-command start experience (killer.mjs already implements)
