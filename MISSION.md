---
orientation: [production]
status: active
started_at: 2026-05-30T03:35:42Z
expedition_branch: odyssey/20260530-113542
baseline_metric: null
best_metric: null
total_waypoints: 12
consecutive_discards: 0
---

# Mission: Odysseus v2 按设计文档全量实现

## Goal
按照 `/Users/stbz/code/Odysseus/docs/design/v2-brain-architecture.md` 设计文档，补全 odysseus-v2 所有缺失模块，直到所有 Phase 完成。

## Context
v2 项目位于 `/Users/stbz/code/odysseus-v2/`，三层架构：Rust NIFs (`core/`) + Elixir/BEAM (`neural/`) + TypeScript (`app/`)。

已完成：
- Phase 1: 基础设施（Cargo workspace, signal_types, sparse_matrix, Elixir OTP supervisor tree）
- Phase 2: 脑干 + 丘脑（路由 + 注意力门控 + 快速通路）+ 下丘脑骨架
- Phase 3.1: 杏仁核（Elixir + Rust NIF 模式匹配）
- Phase 3.2: 海马体（稀疏矩阵 + 模式分离/补全 + 激活扩散）

设计文档审计发现以下缺口：
- Neurons: 激活扩散不完整，缺少兴奋/抑制连接类型（已部分修复）
- Basal Ganglia: 缺 MotorProgram 数据结构和 5 级动作层级
- Cerebellum: 缺 ErrorSignal 生成
- Hypothalamus: 缺 tokenBudget/computeLoad/memoryPressure 监控
- Astrocyte + Glymphatic: Phase 5 未开始
- TypeScript API Server: 空

## Scope

### Modifiable
- /Users/stbz/code/odysseus-v2/core/ (all Rust crates)
- /Users/stbz/code/odysseus-v2/neural/ (all Elixir apps)
- /Users/stbz/code/odysseus-v2/app/src/ (all TypeScript)

### Read-Only (PROTECTED)
- /Users/stbz/code/Odysseus/docs/design/v2-brain-architecture.md (reference only)

## Waypoints

### WP1: Basal Ganglia — MotorProgram + 5-level hierarchy
扩展 basal Rust NIF：添加 MotorProgram 存储和 5 级动作层级（工具原语→简单动作→复合技能→工作流→项目级能力）。
文件：`core/crates/basal/src/lib.rs`

### WP2: Cerebellum — ErrorSignal generation
扩展 cerebellum Rust NIF：实现前馈预测 vs 实际结果的 ErrorSignal 生成。
文件：`core/crates/cerebellum/src/lib.rs`

### WP3: Hypothalamus — Resource monitoring
补全下丘脑 Elixir gen_statem：tokenBudget/computeLoad/memoryPressure/interactionGap 监控 + 稳态行为。
文件：`neural/apps/odysseus_hypothalamus/lib/odysseus/hypothalamus.ex`

### WP4: Hippocampus Elixir — NIF integration
Elixir 层海马体 GenServer：调用 Rust NIF 的 encode/consolidate/recall，与白质信号对接。
文件：`neural/apps/odysseus_hippocampus/lib/odysseus/hippocampus.ex`

### WP5: Frontal Cortex — Left/Right brain Elixir
Elixir 层额叶：接收 RoutedSignal，通过 HTTP 桥接到 TypeScript LLM cortex-left/cortex-right。
文件：`neural/apps/odysseus_cortex/lib/odysseus/frontal_left.ex`, `frontal_right.ex`

### WP6: Astrocyte — LRU cache
Rust NIF 实现星形胶质细胞 LRU 缓存：热点记忆缓存 + 资源释放。
文件：`core/crates/astrocyte/src/lib.rs`

### WP7: Glymphatic — Cleanup system
Elixir GenServer 实现类淋巴清理：GC + 权重修剪 + 废弃连接清除。由下丘脑空闲/睡眠模式触发。
文件：`neural/apps/odysseus_glymphatic/lib/odysseus/glymphatic.ex`

### WP8: API Server — HTTP + WebSocket
TypeScript API 服务器：Express HTTP + WebSocket + SSE 事件流。
文件：`app/src/api/server.ts`, `app/src/api/routes/`

### WP9: Brain integration test
端到端集成测试：信号从脑干→丘脑→杏仁核→海马体→神经元→额叶完整通路。
文件：`neural/test/`

### WP10: TypeScript ↔ Elixir bridge — enrich + /chat
完善 brain-bridge.ts：/enrich 返回情感标签+记忆上下文，/chat 双脑处理。
文件：`app/src/brain-bridge.ts`

### WP11: Frontal Orchestrator — Cortex integration
额叶编排器接入 Elixir 脑区信号：enrich 结果影响左右脑 prompt 上下文。
文件：`app/src/frontal-orchestrator/index.ts`

### WP12: Full system smoke test
全系统冒烟测试：`ody` 启动→配置向导→发送消息→确认双脑通路。
文件：`app/src/main.ts` + manual test

## Metrics

| Name | Unit | Measure Command | Direction |
|------|------|----------------|-----------|
| rust_errors | - | cd /Users/stbz/code/odysseus-v2/core && cargo check 2>&1 | grep -c "^error" |
| elixir_errors | - | cd /Users/stbz/code/odysseus-v2/neural && mix compile 2>&1 | grep -c "error:" |
| ts_errors | - | cd /Users/stbz/code/odysseus-v2/app && npx tsc --noEmit 2>&1 | grep -c "error TS" |

## Guard
```bash
cd /Users/stbz/code/odysseus-v2/core && cargo check 2>&1 | tail -1
```

## Termination
- All 12 waypoints done AND all guards pass (0 errors)
- OR stuck (10 consecutive discards)
- OR user interrupt (/odyssey-cancel)

## What's Been Tried

### Wins
- WP1: Basal Ganglia — MotorProgram 5-level hierarchy, register/list/get programs, stats with level counts
- WP2: Cerebellum — ErrorSignal with adjustments (frontal strategy + basal habit), repeated error detection, dopamine reinforce
- WP3: Hypothalamus — Full homeostasis: tokenBudget<20% → astrocyte release, computeLoad>80% → throttle, memoryPressure>75% → glymphatic, idle/sleep consolidation, brain_state broadcast
- WP4: Hippocampus Elixir — NIF integration adapted to new recall(now) and ConsolidationReport, weight update forwarding to neurons, periodic decay scheduling
- WP5: Frontal Cortex — LLM bridge HTTP calls with deterministic fallback, corpus callosum sync maintained
- WP6: Astrocyte — New Rust crate: LRU cache with put/get/release/flush/stats, eviction by emotional weight
- WP7: Glymphatic — Cleanup mode signal handling (full/partial) from hypothalamus
- WP8: API Server — Express HTTP + WebSocket + SSE, /health /enrich /chat /chat/stream /model /status endpoints
- WP9-12: Integration — API mode in main.ts (--api --port), brain-bridge connected to orchestrator, 3-language zero-error compilation

### Dead Ends
(none)

### Surprises
- Rust borrow checker required careful block-scoping in both hippocampus and astrocyte — HashMap get_mut + sibling field mutation is a pattern to watch
- sparse_matrix ConnectionType enum change cascaded to neurons crate (string → enum comparison)

## Current Best
- metric: 0 errors (Rust 8 crates + Elixir 16 apps + TypeScript)
- Baseline: 0 Rust errors

## Ideas Backlog
- E2E integration tests for full signal pathway
- NIF compilation in CI (cross-platform dylib)
- Frontend Web dashboard for brain state visualization
