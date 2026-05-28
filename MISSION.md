---
orientation: creative
status: active
started_at: 2026-05-28T07:33:42Z
expedition_branch: odyssey/20260528-153342
baseline_metric: null
best_metric: null
total_waypoints: 0
consecutive_discards: 0
---

# Mission: 生物学隐喻体系重构 — 从 Cell 到 Organism

## Goal
重新审视 Odysseus Agent Framework 的生物学隐喻体系。当前 "Cell = Agent" 的隐喻在生物学上不准确：Cell 是细胞层面（没有自己的脑区、人格、目标），而 Agent 已经是一个完整的智能个体。需要找到更准确的隐喻映射，同时保持架构的一致性和美感。

## Context

当前系统的隐喻冲突：

**个体尺度（准确）**：brainstem、hippocampus、prefrontal、cortex、cerebellum、consciousness — 这些是一个生物个体的大脑区域。OdysseusAgent 主进程就是这个"个体"。

**细胞尺度（不准确）**：Cell = 独立 agent，有自己的 CellDNA、personality、capabilities、甚至可以 spawn。但生物学上，一个细胞没有 hippocampus，不会做 planning，没有人格——这些都是 organism 级别的特征。

**结果**：每个 "Cell"（agent）内部又有 brainstem/hippocampus 等脑区。如果 Cell 是细胞，它不应该有脑。如果它有脑，那它不是细胞，而是个体/organism。

### 需要回答的问题

1. OdysseusAgent 主进程 = 什么生物实体？（个体？群体？超个体？）
2. Spawn 出来的 sub-agent = 什么？（细胞？个体？器官？）
3. 多 agent 协作 = 什么？（组织？群落？生态系统？）
4. CellDNA = 还叫 DNA 吗？还是物种特征？
5. Synapse（agent 间通信）= 还叫突触吗？还是社会通信？
6. 现有脑区隐喻（brainstem、hippocampus 等）= 保持还是重构？

### 可能的方向

- **超个体方向**（蚂蚁/蜜蜂）：OdysseusAgent = 蚁群，sub-agent = 工蚁/兵蚁，每个都是独立个体
- **多脑方向**（章鱼）：主进程 = 中枢脑，sub-agent = 触手脑（半独立）
- **器官方向**（多细胞生物）：OdysseusAgent = 生物体，sub-agent = 器官（心脏、肝脏各有功能但不是独立个体）
- **微生物方向**（菌群）：OdysseusAgent = 宿主，sub-agent = 共生微生物
- **神经方向**（当前）：OdysseusAgent = 大脑，sub-agent = 神经元/神经核团

## Scope

### Modifiable
- `CLAUDE.md` — 架构描述和隐喻体系
- `packages/odysseus-core/src/` — 类型名、接口名、目录名
- `packages/odysseus-core/src/cortex/` — CellDNA, CellType 等概念
- `packages/odysseus-core/src/synapse/` — 通信隐喻
- `MISSION.md`, `PROPOSAL*.md` — 设计文档

### Read-Only (PROTECTED)
- 功能逻辑不变 — 只改名字和隐喻，不改行为

## Metrics

| Name | Unit | Measure Command | Direction |
|------|------|----------------|-----------|
| metaphor_consistency | - | 人工评估（全系统隐喻是否在同一尺度） | higher |
| type_error_count | - | npx tsc --noEmit 2>&1 | lower |

## Guard
```bash
cd packages/odysseus-app && npx tsc --noEmit 2>&1
```

## Termination
- 找到一致的隐喻体系 AND 更新 CLAUDE.md + 类型定义
- OR stuck (10 consecutive discards)
- OR user interrupt (/odyssey-cancel)

## Waypoint Plan

### WP1: 生物学隐喻分析 — 当前体系的尺度冲突
- 列出所有隐喻的使用场景
- 识别哪些在同一尺度、哪些跨尺度
- 确定最核心的隐喻冲突点

### WP2: 方向选择 — 5个候选方向评估
- 对每个方向做：一致性、美感、工程可行性、扩展性评分
- 与用户讨论选定方向

### WP3: 隐喻映射表 — 新体系的完整对应
- 旧术语 → 新术语的映射表
- 每个新术语的生物学准确性和工程含义

### WP4: 代码影响评估 — 重命名范围
- 哪些类型/接口/目录需要重命名
- 哪些保持不变（脑区隐喻大多准确）
- 迁移策略（渐进式 vs 一次性）

### WP5: 方案文档 — PROPOSAL 输出
- 写成正式的架构提案
- 包含迁移计划和影响范围

## What's Been Tried

### Wins
{Auto-updated by engine.}

### Dead Ends
{Auto-updated by engine.}

### Surprises
{Unexpected findings. Auto-updated in creative mode.}

## Current Best
- metric: (baseline not yet measured)
- Baseline: (pending)

## Ideas Backlog
{Auto-populated. Can be manually edited.}
