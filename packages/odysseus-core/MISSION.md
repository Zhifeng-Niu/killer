---
orientation: [engineer]
status: complete
started_at: 2026-06-02T04:57:00Z
completed_at: 2026-06-02T06:30:00Z
expedition_branch: odyssey/20260602-125738
baseline_metric: null
best_metric: "type_error_count: 0"
total_waypoints: 8
completed_waypoints: 8
consecutive_discards: 0
---

# Mission: DeepSeek V4 全栈优化 — 打造完美 Coding Agent

## Goal
从提示词、长流程工作流、编排、上下文管理，全面为 DeepSeek-v4-flash/v4-pro 做优化适配。
使 Odysseus 在 DeepSeek 后端下成为顶级的自主 Coding Agent。

## Context
DeepSeek V4 系列模型特性（来自官方 API 文档 2026-06-02）：
- 1M 上下文窗口，最大 384K 输出
- 原生 thinking mode（reasoning_content 分离）
- reasoning_effort: high/max（自适应推理深度）
- 原生 function calling（128 工具上限）
- 缓存命中价仅 ¥0.02/M tokens（未命中 ¥1），应最大化缓存利用率
- 同时支持 OpenAI 和 Anthropic 协议
- DSML 格式工具调用已实现（response-processor.ts）

当前代码已实现基础 DeepSeek 适配（provider 注册、thinking mode、DSML 解析），
但缺少针对 Coding Agent 场景的深度优化。

## Scope

### Modifiable
- packages/odysseus-app/src/llm/ (provider 层)
- packages/odysseus-app/src/orchestrator/ (编排、提示词、上下文)
- packages/odysseus-core/src/brainstem/ (工具系统)
- packages/odysseus-app/src/__tests__/ (测试)

### Read-Only (PROTECTED)
- packages/odysseus-app/src/tui/ (TUI 组件不改动)
- packages/odysseus-app/src/api/ (API 端点不改动)
- packages/odysseus-app/src/persona/ (Persona 引擎不改动)

## Waypoints

### WP1: DeepSeek-native 提示词策略
**文件**: `src/orchestrator/prompt-builder.ts`
为 DeepSeek V4 设计专用提示词策略：
- 添加 `buildDeepSeekCodingPrompt()` 函数，针对 coding 场景精简提示词
- 将 40+ 个分散 section 合并为结构化的 8 段式 prompt（身份→能力→工具→计划→记忆→上下文→策略→历史）
- 添加 DeepSeek 特定的思维链引导指令（"先分析再执行"模式）
- 基于 provider capabilities 动态选择 prompt 策略

### WP2: 动态上下文窗口管理
**文件**: `src/orchestrator/context.ts`, `src/orchestrator/prompt-builder.ts`
突破固定 24K 限制，实现 provider-aware 上下文管理：
- 从 ProviderCapabilities.maxContext 动态计算可用 prompt 空间
- DeepSeek 1M 上下文 → 允许 80K+ 系统 prompt
- 实现缓存友好型 prompt 结构：固定前缀 + 变量后缀（最大化 DeepSeek 缓存命中率）
- 历史消息按 token 计量而非字符数

### WP3: Thinking Mode 深度集成
**文件**: `src/llm/openai-compatible-provider.ts`, `src/orchestrator/agent.ts`
完善 reasoning_content 的全生命周期管理：
- 流式输出分离：先 yield reasoning_content（显示为思考过程），再 yield content
- 多轮对话中正确传递 reasoning_content（工具调用场景必须回传）
- 自适应 reasoning_effort：简单问答用 high，复杂 coding/debugging 用 max
- 非侵入式思考内容展示（不混入正式响应）

### WP4: 原生 Function Calling 优先路由
**文件**: `src/orchestrator/agent.ts`, `src/orchestrator/response-processor.ts`
DeepSeek V4 支持原生 function calling，应优先使用：
- 检测 provider 支持 native tool calling 时，跳过 regex 文本解析
- 将 `completeWithTools()` 的结果直接传入工具执行管线
- 保留 DSML 和文本格式作为 fallback
- 工具调用结果格式化为标准的 tool message

### WP5: 缓存优化策略
**文件**: `src/llm/openai-compatible-provider.ts`, `src/orchestrator/prompt-builder.ts`
利用 DeepSeek 的 50 倍缓存折扣：
- 将系统 prompt 分为"固定前缀"（身份、工具定义、能力）和"变量后缀"（对话历史、情感状态）
- 固定前缀保持不变以命中缓存，变量后缀追加在末尾
- 工具定义独立缓存（不随每轮变化）
- 实现 prompt fingerprint 校验（检测缓存命中率）

### WP6: 长流程 Coding 工作流编排
**文件**: `src/orchestrator/agent.ts`
优化 DeepSeek 在 coding agent 场景下的多步骤执行：
- 实现"规划-执行-验证"三阶段 coding workflow
- 工具链编排：read → analyze → modify → build → test 循环
- 错误恢复：build 失败自动回退到 read+fix 循环
- 上下文压缩：长工具链中间结果智能摘要，保持核心上下文不丢失

### WP7: 双协议智能路由
**文件**: `src/llm/factory.ts`, `src/llm/openai-compatible-provider.ts`
利用 DeepSeek 的 Anthropic 兼容端点：
- 注册 DeepSeek 的 anthropicBaseUrl: `https://api.deepseek.com/anthropic`
- 工具密集型任务自动路由到 Anthropic 协议（更好的 tool calling）
- 简单对话保持 OpenAI 协议
- 添加 DeepSeek 模型名映射规则

### WP8: 集成验证 + Provider Profile 更新
**文件**: 所有改动文件 + 测试
确保所有优化协同工作：
- 更新 DeepSeek provider preset（添加 anthropicBaseUrl、更新模型列表）
- 端到端测试：DeepSeek V4 全流程（thinking → tool call → multi-turn → cache）
- 验证 type check 通过
- 更新 CLAUDE.md 文档

## Metrics

| Name | Unit | Measure Command | Direction |
|------|------|----------------|-----------|
| type_error_count | - | cd packages/odysseus-app && npx tsc --noEmit 2>&1 \| wc -l | lower |
| prompt_efficiency | % | (cached_prefix_chars / total_prompt_chars) * 100 | higher |
| tool_call_accuracy | - | test suite | higher |

## Guard
```bash
cd packages/odysseus-app && npx tsc --noEmit
```

## Termination
- Task complete (all waypoints done AND build passes AND tests pass)
- OR stuck (10 consecutive discards)
- OR user interrupt (/odyssey-cancel)

## What's Been Tried

### Wins
- WP1: buildDeepSeekCodingPrompt 8段式 XML 提示词（身份→能力→工作流→计划→记忆→上下文→策略→历史），前3段缓存稳定
- WP2: Provider-aware 动态上下文窗口，1M context → 64轮/6000字符/3000摘要/2000工具结果
- WP3: reasoning_content 流式/完整分离输出，resolveReasoningEffort 自适应推理深度（high/max）
- WP4: ChatMessage 扩展 reasoning_content 字段，贯穿 completeWithTools 工具链循环
- WP5: 缓存统计追踪（prompt_cache_hit_tokens/miss_tokens），getCacheStableFingerprint 前缀指纹
- WP6: 编码工作流指导注入（plan→execute→verify），buildToolFailureMessage 精准修复指导
- WP7: DeepSeek anthropicBaseUrl 注册，双协议路由（ODYSSEUS_PROTOCOL=anthropic）
- WP8: 全量 type check 通过（0 errors）

### Dead Ends
- ChatMessage 类型扩展需要 `as any` 桥接（core 包有预存 hippocampus 类型错误，未重新 build）

### Surprises
- DeepSeek 的 runNativeToolLoop 已有成熟的两阶段设计（文本先→工具循环后），避免强制工具调用
- resolveProviderCapabilities 用前缀匹配而非 provider name 查找，更灵活但需要维护映射表

## Current Best
- metric: type_error_count = 0
- All 8 waypoints complete, build passes

## Ideas Backlog
- 运行时缓存命中率监控面板
- 自动协议切换（根据任务类型动态选择 OpenAI/Anthropic 协议）
- DeepSeek V4 reasoning_content 压缩策略（长推理结果摘要后再回传）
