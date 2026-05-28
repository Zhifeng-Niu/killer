---
orientation: engineer
status: complete
started_at: 2026-05-29T08:00:00Z
expedition_branch: odyssey/20260529-long-running-autonomous
baseline_metric: 0
best_metric: 0
total_waypoints: 5
consecutive_discards: 0
---

# Mission: 长程自主执行能力提升

## Goal
使 Agent 能够在单次任务中持续、自主地工作长达 8 小时，完成从规划、执行到迭代优化的完整闭环，交付工程级成果。在长程自主执行、复杂工程优化与真实开发场景中展现出更强的持续工作能力。

## Context
Project type: typescript monorepo. Guard: pnpm build.

### 已有基础设施
- **LongTaskEngine**: 持久化检查点 + 时间预算（默认 8h）+ 停滞检测
- **IterativeRefiner**: 执行→评估→调整循环，5 种策略（continue/backtrack/replan/decompose/escalate）
- **ErrorRecoveryManager**: CircuitBreaker + ExponentialBackoff + FallbackExecutor
- **SelfMonitor**: 健康状态追踪 + 停滞检测 + 执行时间线
- **ToolChain**: 串行/并行/分支/循环/变换工具链编排
- **InstructionParser**: 规则 + LLM 两级指令解析
- **ScheduledTaskRunner**: once/recurring/daily 定时调度
- **ContextWindowManager**: 智能上下文裁剪 + LLM 摘要 + 熔断器

### 核心瓶颈（代码级分析）
1. **maxConversationTurns=20** 太小 — auto-continue 每次 push 2 条消息，10 轮自主执行就触发截断，丢失关键上下文
2. **processAutoContinue 直接 slice 历史** — 无摘要，不像 processInput 有 ContextWindowManager 智能裁剪
3. **verifyStepResult 过于简单** — 只检查非空和长度 >20，不检查内容质量或任务完成度
4. **Goal drive → processInput 桥接缺少 PlanExecutor 跟踪** — autoContinueCount++ 但不走 plan step 管理
5. **ErrorRecovery 未接入 ToolExecutor** — circuit breaker 存在但未包裹工具调用
6. **无中间摘要机制** — 长程执行中旧的 plan step 结果被截断后无法恢复关键信息

## Key Capability Gaps (Current Focus)
1. **长程上下文保持** — 8h 执行中的上下文不能被粗暴截断，需要渐进摘要 + 关键事实保留
2. **智能 step 验证** — 每个 plan step 的执行结果需要质量评估，不只是非空检查
3. **Error Recovery 集成** — 将 circuit breaker/backoff 接入实际工具执行链
4. **自主执行循环强化** — auto-continue 递归深度控制、停滞恢复、质量门控
5. **执行报告与交付** — 长程任务完成后需要结构化的交付报告

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
- WP1: LongRangeContext — 去掉 maxConversationTurns 硬上限，改为 trimHistory() 智能裁剪 + 中间摘要（每 20 轮 LLM 摘要 + facts 提取）
- WP2: StepVerifier — 5 维度验证（completeness/error_signals/goal_alignment/tool_success/code_quality）+ 策略建议（retry/replan/decompose/escalate）+ IterativeRefiner 集成
- WP3: ErrorRecovery 集成 — per-tool circuit breaker + exponential backoff + fallback，3 处工具调用点接入 executeToolWithRecovery
- WP4: AutonomousLoop 强化 — 质量门控（5 连续失败暂停）+ 停滞恢复（自动 replan/decompose）+ 用户输入重置计数器
- WP5: DeliveryReport — 结构化交付报告（步骤状态/质量评分/关键决策/代码变更）+ consciousness 事件流输出
- 总计：861 行新增/修改，0 构建错误
- WP6: ChainCheckpoint — ToolChain 检查点保存/断点恢复 + Promise.allSettled 并行故障隔离 + failedAtIndex 跟踪
- WP7: OrchestrationDAG — Kahn 拓扑排序分层执行 + DFS 循环检测 + createPlan 即时断环 + partialRollback 部分回滚
- WP8: ParallelFlow — parallelPool 并发池（worker stealing 模式）+ executeBatch 并发上限（默认 5）+ 故障隔离
- WP9: SelfReview — 4 维度自审查（correctness/completeness/consistency/efficiency）+ reviewLoop 修正循环 + consciousness 事件流
- WP10: SemanticPrecision — 4 类型歧义检测 + 置信度评分 + DecisionContext 语义上下文（intent/riskHint/needsConfirmation）

### Dead Ends
{None yet.}

### Surprises
{None yet.}

## Current Best
- metric: 0 type errors
- Baseline: 0 type errors

## Waypoint Plan

### WP1: LongRangeContext — 长程上下文管理器
- 提高 maxConversationTurns 到 200（与 maxAutoContinues=200 匹配）
- processAutoContinue 中接入 ContextWindowManager（摘要旧消息而非直接 slice）
- 添加中间摘要机制：每 20 个 auto-continue 轮次自动触发一次 LLM 摘要
- 关键 plan step 结果自动提取为 facts 注入 ContextWindowManager

### WP2: StepVerifier — 智能步骤验证器
- 替换简单的 verifyStepResult（非空+长度）为多维度验证
- 验证维度：内容完整性、工具调用成功率、目标对齐度、代码质量（如果有）
- 与 IterativeRefiner 集成：验证失败时触发 replan/decompose 策略
- 验证结果反馈到 LongTaskEngine 的 step 跟踪

### WP3: ErrorRecovery 集成 — 工具执行韧性
- 将 ErrorRecoveryManager 的 circuit breaker 接入 ToolExecutor
- per-tool circuit breaker（不同工具独立熔断）
- ToolChain step 级别的超时和重试
- 失败 step 的自动回退策略

### WP4: AutonomousLoop — 自主执行循环强化
- auto-continue 递归深度控制（防止无限递归）
- 停滞恢复：stagnation → 自动触发 replan 或 decompose
- 质量门控：连续 N 步验证失败时暂停并通知
- 执行节奏控制：高速连续执行 vs 深度思考模式切换

### WP5: DeliveryReport — 执行报告与交付
- 长程任务完成后自动生成结构化交付报告
- 包含：完成的步骤、跳过的步骤、关键决策、代码变更摘要、测试结果
- 报告通过 consciousness 事件流输出
- 与 LongTaskEngine checkpoint 集成，支持中途报告

## Ideas Backlog
1. DynamicToolComposer — 动态工具组合（运行时合成新工具）
2. InstructionFollowEvaluator — 指令遵循度量化评估
3. LongChainExecutor — 100+ 步骤超长链路执行器
