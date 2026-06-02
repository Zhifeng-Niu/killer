---
orientation: [engineer]
status: active
started_at: 2026-06-03T00:47:15Z
expedition_branch: odyssey/20260603-004715
baseline_metric: "build: pass, type_error_count: 0"
best_metric: null
total_waypoints: 12
completed_waypoints: 9
consecutive_discards: 0
---

# Mission: 世界级 Agent Harness — Claude Code 架构借鉴 + DeepSeek-V4 特化

## Goal
借鉴 Claude Code 的 Hooks/Dynamic-Workflows/Auto-compaction 架构优势，结合 DeepSeek-V4 系列的缓存感知和推理特性，将 Odysseus 迭代至世界领先水平的 coding agent 能力标准。生产级部署是底线。

## What's Been Tried

### Wins
- **WP7**: WorkflowEngine — 分阶段并行编排 + TG-aware task termination + adversarial review + /workflow 命令集成
- **WP8**: Phase-Based Orchestration v2 — 模板变量({{phase:NAME.taskId}}) + 条件阶段 + 重试策略 + 变量作用域
- **WP9**: Workflow Persistence — .odysseus/workflows/ 持久化 + /workflow run <name> 按名称复用
- **WP10**: Session Store 抽象层 — SessionStore 接口 + MemorySessionStore + FileSessionStore + 工厂函数

### Dead Ends
{None.}

### Surprises
{Unexpected findings.}

## Waypoint Plan

### Phase A: Hooks 系统重构 (WP1-WP3)
- **WP1**: Hooks 事件扩展 — 从当前 23 事件扩展到 Claude Code 级别的 30+ 事件（增加 `file:changed`, `context:pre-compact`, `context:post-compact`, `tool:batch-complete`, `permission:request`, `permission:denied`, `config:changed`, `session:resume` 等）
- **WP2**: 多类型 Hook Handler — 支持 Command/HTTP/Prompt/Agent 4 种 handler 类型（当前仅支持 async function）
- **WP3**: Hook 条件系统 — matcher 模式匹配 + `if` 条件过滤 + 超时控制

### Phase B: DeepSeek Auto-Compaction (WP4-WP6)
- **WP4**: Cache-Aware Compaction — 压缩时保持 system prompt + CLAUDE.md + 工具定义前缀完整，确保 DeepSeek 的 `prompt_cache_hit_tokens` 不因压缩而暴跌
- **WP5**: Reasoning-Aware 保留策略 — DeepSeek thinking mode 的 `reasoning_content` 在压缩时保留推理链骨架而非简单截断
- **WP6**: TG-Driven Compaction Trigger — 当 TG 连续低于阈值时主动触发压缩，而非等到 context 溢出

### Phase C: Dynamic Workflows (WP7-WP9)
- **WP7**: Workflow Script Engine — agent 生成编排脚本（TS DSL），驱动 subagent 并行执行
- **WP8**: Phase-Based Orchestration — 分阶段执行 + 结果聚合在脚本变量中 + 内建对抗式审查
- **WP9**: Workflow Persistence — 成功的 workflow 保存为可复用命令（`.odysseus/workflows/`）

### Phase D: 生产级部署 (WP10-WP12)
- **WP10**: Session Store 抽象层 — 替换 SQLite 为可插拔存储（内存 → 文件 → Redis → S3）
- **WP11**: Container-Ready 部署 — Docker/K8s 友好配置 + 健康检查 + 优雅关闭
- **WP12**: 集成验证 + 基准测试 — 全量 build 通过 + compaction 缓存命中率验证 + workflow 端到端测试

## Current Best
- metric: build: pass, type_error_count: 0
- 9/12 waypoints complete

## Ideas Backlog
- Claude Code 的 auto memory 跨会话学习
- MCP tool search（延迟加载工具 schema）
- Agent View 中央仪表盘概念
- Checkpointing（文件变更快照 + 回滚）
