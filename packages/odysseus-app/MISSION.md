---
orientation: [creative]
status: active
started_at: 2026-05-29T05:04:37Z
expedition_branch: odyssey/20260528-222725
baseline_metric: null
best_metric: null
total_waypoints: 3
consecutive_discards: 0
---

# Mission: AGI-Level Orchestration — 三大编排突破点

## Goal
从"单轮响应 + 工具调用"升级到"持久、有状态、元认知的执行引擎"

## Context
Agent 自我诊断出 4 大编排差距，选择"聚焦一个突破点"策略，连续实现三个：

## Scope

### Modifiable
- `packages/odysseus-core/src/prefrontal/` — types, planner, executor
- `packages/odysseus-app/src/orchestrator/agent.ts` — 中央编排器

### Read-Only (PROTECTED)
- 所有 TUI 组件（已完成动效任务）
- API 层、CLI 层

## What's Been Tried

### Wins

**WP1: 持久执行循环** (~15 行改动)
- `executor.ts` `import()`: 有 pending steps 的 plan 刷新 `createdAt = Date.now()` 防止 24h 超时
- `agent.ts` `processAutoContinue()`: 每步执行后调用 `saveSession()` 持久化到磁盘
- `agent.ts` `boot()`: 检测恢复的 plans，设置 `hasResumedPlans = true`
- 事件流: 创建 plan → 每步执行 + save → 重启 → boot 恢复 → 首次交互后 auto-continue 继续

**WP2: 层级分解** (~40 行改动)
- `types.ts`: PlanStep 新增 `subPlanId?`, `isCompound?`；Plan 新增 `parentPlanId?`, `parentStepId?`
- `planner.ts` `decomposeStep()`: 复合步骤分解为子计划
- `executor.ts` `registerSubPlan()`: 注册子计划 + 标记父步骤；`isSubPlanCompleted()`, `getPlanDepth()`
- `getNextAction()`: 自动钻入子计划；`reportStepResult()`: 子计划完成时自动完成父步骤
- 深度上限 3：根(0) → 子(1) → 孙(2) → 不再分解(3)

**WP3: 元认知监控** (~50 行改动)
- `executor.ts` `replacePlan()`: 封装安全的 plan 替换
- `agent.ts` 质量门控: 连续 N 步失败时不再只日志，执行实际恢复策略
  - `decompose`: 分解失败步骤为子计划（回退到 replan）
  - `replan`: 生成替代步骤替换当前计划
- 两种策略都重置 `consecutiveFailures = 0` + 发射 consciousness 事件

### Dead Ends
- 无（三步全部编译通过，无死胡同）

### Surprises
- 基础设施 90% 已存在（export/import、saveSession 序列化、planData 持久化），只需要"接线"
- PlanExecutor 的 `getActivePlans()` 有 24h autoAbandonTimeout，恢复后不刷新 createdAt 会立即丢弃 — 这是持久执行的最大陷阱

## Current Best
- 3/4 AGI 编排差距已修复
- 剩余: 动态注意力分配（多子目标并行追踪 + 优先级调整）
- 所有改动通过 `npx tsc --noEmit` 类型检查
