---
orientation: [engineer]
status: active
started_at: 2026-06-02T08:01:00Z
expedition_branch: odyssey/20260602-164100
baseline_metric: null
best_metric: null
total_waypoints: 8
consecutive_discards: 0
---

# Mission: DeepSeek V4 深度适配 Phase 2 — 运行时优化 + 智能路由

## Goal
在 Phase 1（WP1-WP8 基础优化）之上，深化 DeepSeek V4 的运行时集成：
缓存感知上下文预算、自适应协议切换、reasoning 生命周期完善、DSML 快速路径。

## Context
Phase 1 已完成（branch odyssey/20260602-125738）：
- 8段式 XML 提示词 + Provider-aware 上下文窗口
- reasoning_content 流式分离 + 贯穿工具链
- 缓存统计追踪 + 编码工作流指导
- DeepSeek anthropicBaseUrl 注册

Phase 2 聚焦运行时深度集成：
- 缓存命中感知的动态上下文预算分配
- reasoning_content 在 thinking+tool_calls 混合场景的正确处理
- response-processor 中 DeepSeek 原生工具调用快速路径
- 上下文窗口对 1M token 的更积极利用

## Scope

### Modifiable
- packages/odysseus-app/src/llm/ (provider 层)
- packages/odysseus-app/src/orchestrator/ (编排、提示词、上下文)
- packages/odysseus-app/src/orchestrator/response-processor.ts

### Read-Only (PROTECTED)
- packages/odysseus-app/src/tui/ (TUI 组件)
- packages/odysseus-app/src/api/ (API 端点)
- packages/odysseus-app/src/persona/ (Persona 引擎)

## Waypoints

### WP1: 缓存感知上下文预算
**文件**: `src/orchestrator/context.ts`
当 DeepSeek 缓存命中率 >80% 时，放宽上下文截断策略：
- 追踪最近 5 次调用的平均缓存命中率
- 高命中率时 maxFullTurns 1.5x、maxMessageChars 1.5x
- 低命中率时回归保守策略
- 添加 `updateCacheBudget(hitRate: number)` 方法

### WP2: 1M Token 上下文窗口极限优化
**文件**: `src/orchestrator/context.ts`
DeepSeek 1M token（~4M chars）当前只用到 64 轮/6000字符，过于保守：
- maxFullTurns 从 64 提升到 128（长编码会话场景）
- maxMessageChars 从 6000 提升到 12000
- maxToolResultChars 从 2000 提升到 8000（编码输出常很长）
- maxSummaryChars 从 3000 提升到 6000

### WP3: reasoning+tool_calls 混合响应处理
**文件**: `src/llm/openai-compatible-provider.ts`
DeepSeek V4 在 thinking mode + function calling 场景下，
可能同时返回 reasoning_content 和 tool_calls：
- 在 completeWithTools 中检测 thinking mode，将 reasoning_content 附带到 LLMToolCallCompletion
- 确保 reasoning_content 不被截断或混入 content
- 在返回的 content 中不包含 <thinking> 标签（避免干扰工具调用解析）

### WP4: Response Processor DeepSeek 快速路径
**文件**: `src/orchestrator/response-processor.ts`
当 agent 使用原生 function calling 路径时，跳过 DSML regex 解析：
- 添加 provider-aware 标志位 `usedNativeToolCalling`
- 如果为 true，extractToolCalls 直接返回空（不执行 regex）
- 保留 DSML 作为 fallback 路径不变
- 减少 ~20ms 的 regex 开销

### WP5: 自适应 reasoning_effort 策略增强
**文件**: `src/llm/openai-compatible-provider.ts`
当前 resolveReasoningEffort 基于关键词检测，升级为：
- 工具调用循环中：round > 3 自动升级到 max（长工具链需要更深推理）
- 错误恢复场景（build/test 失败）：强制 max
- 简单问答保持 high（节省 token）
- 添加 reasoning_effort 日志记录（可追踪推理深度决策）

### WP6: 工具结果智能截断（DeepSeek 长上下文优化）
**文件**: `src/orchestrator/agent.ts`
DeepSeek 1M 上下文下，工具结果截断过于激进（当前 8000 字符）：
- Provider-aware 截断阈值：长上下文 provider 允许 32000 字符
- build/test 输出完整保留（编码场景核心信息）
- 文件读取结果完整保留（减少信息丢失）
- 仅对非编码工具（web_search 等）保持截断

### WP7: Provider 能力运行时重检测
**文件**: `src/orchestrator/agent.ts`
当用户通过 /key 或配置变更切换模型时，重新解析 provider capabilities：
- resolveProviderCapabilities 检测模型名变更
- 重置 context window 预算
- 重新选择提示词策略（DeepSeek vs 通用）
- 触发 context.ts setProviderCapabilities 重新校准

### WP8: 集成验证 + CLAUDE.md 文档更新
**文件**: 所有改动文件
端到端验证：
- tsc --noEmit 零错误
- pnpm build 通过
- 更新 CLAUDE.md 记录 Phase 2 优化点
- 更新 MISSION.md 实验记录

## Metrics

| Name | Unit | Measure Command | Direction |
|------|------|----------------|-----------|
| type_error_count | - | cd packages/odysseus-app && npx tsc --noEmit 2>&1 \| wc -l | lower |
| prompt_efficiency | % | (cached_prefix_chars / total_prompt_chars) * 100 | higher |

## Guard
```bash
cd packages/odysseus-app && npx tsc --noEmit
```

## Termination
- Task complete (all waypoints done AND build passes)
- OR stuck (10 consecutive discards)
- OR user interrupt (/odyssey-cancel)

## What's Been Tried

### Wins
{Phase 1 complete. Phase 2 starting.}

### Dead Ends
{Auto-updated by engine.}

### Surprises
{Unexpected findings.}

## Current Best
- metric: (baseline not yet measured)

## Ideas Backlog
{Auto-populated. Can be manually edited.}
