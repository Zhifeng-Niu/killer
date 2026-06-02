# 生物学隐喻体系重构提案 — 基于神经科学文献

## 理论基础

### 1. Thousand Brains Theory (Hawkins, 2021)
大脑新皮层由 ~150,000 个**皮层柱（cortical column）**组成。每个柱：
- 是一个独立的处理单元（"mini-brain"）
- 有自己的感知输入、运动输出、参考系
- 能独立创建世界的完整模型
- 但不是独立的生物个体——它是大脑的一部分

### 2. Modular Brain Networks (Sporns, 2016)
大脑的模块化组织：
- **Module** = 密集连接的脑区群落（功能专门化）
- **Provincial hub** = 专精模块内部的节点
- **Connector hub** = 桥接不同模块的节点
- **Rich-club** = 高度连接的核心节点群

### 3. Nested Markov Blankets (Friston, 2018)
Free Energy Principle 下的多层级 agent：
- 每个 agent 有 Markov blanket（感知边界）
- Sub-agent 的 blanket **嵌套**在主 agent 的 blanket 内
- 形成层级：环境 → 主 agent → sub-agents
- 每层做 active inference（最小化惊奇）

## 新隐喻映射

### 核心重命名：Cell → Column（皮层柱）

**Cell 的问题**：细胞没有脑区、没有人格、不做规划。用"细胞"命名一个有完整认知能力的 agent，在生物学上不准确。

**Column 的优势**：
- 皮层柱是大脑新皮层的基本计算单元
- 每个柱有独立的感知→认知→行动能力（和 sub-agent 一致）
- 但柱不是独立个体——它是大脑的一部分（和架构一致）
- 多个柱协作产生涌现智能（和多 agent 协作一致）
- Hawkins 明确称柱为 "mini-brain"

### 完整映射表

| 当前术语 | 新术语 | 生物学对应 | 理由 |
|----------|--------|-----------|------|
| **Cell** | **Column** | 皮层柱 (cortical column) | 基本计算单元，有独立处理能力但不是独立个体 |
| **CellType** | **ColumnRole** | 柱功能特化 | 不同柱处理不同模态（视觉柱、听觉柱、运动柱）|
| **CellDNA** | **ColumnProfile** | 柱连接模式/参数 | 皮层柱的连接权重、学习率、参考系配置 |
| **CellId** | **ColumnId** | 柱标识 | 保持结构不变 |
| **spawn** | **differentiate** | 柱分化 | 新皮层发育中柱从通用→特化的过程 |
| **Synapse** | **Projection** | 皮层间投射 | 神经科学术语：柱间白质纤维连接 |

### 保持不变的隐喻（全部准确）

| 术语 | 生物学对应 | 状态 |
|------|-----------|------|
| Brainstem | 脑干（基本循环） | ✅ 保持 |
| Hippocampus | 海马体（记忆） | ✅ 保持 |
| Prefrontal | 前额叶（规划） | ✅ 保持 |
| Cortex | 皮层（进化学习） | ✅ 保持 |
| Cerebellum | 小脑（精调实验） | ✅ 保持 |
| Consciousness | 意识（统一事件流） | ✅ 保持 |
| Sensory | 感觉通道 | ✅ 保持 |

### 新增概念（来自文献）

| 概念 | 来源 | 含义 |
|------|------|------|
| **Provincial Column** | Sporns | 专精型柱——只处理特定领域 |
| **Connector Column** | Sporns | 连接型柱——协调不同模块 |
| **Consensus** | Hawkins | 柱间投票/共识机制 |
| **Markov Blanket** | Friston | 每个 agent 的感知边界 |

## 隐喻层级一致性验证

```
生物学层级：                        代码层级：
──────────────                     ──────────
Organism (个体)                    OdysseusAgent (主进程)
  └─ Brain (脑)                      └─ Brain regions (brainstem, hippocampus...)
       └─ Cortex (皮层)                  └─ Core cognitive modules
            └─ Column (皮层柱)              └─ Sub-agent (Column)
                 └─ Neural ensemble           └─ ToolForge/Dynamic tools
                      └─ Neuron                   └─ Individual tool execution
```

**每一层都在正确的生物学尺度上**：
- OdysseusAgent = 一个完整的生物个体
- 脑区 = 个体的内部结构
- Column = 大脑皮层的计算单元
- Tool = 神经元群集的功能
- Tool execution = 单个神经元的放电

不再有"跨尺度跳跃"的问题。

## 代码影响评估

### 需要重命名（核心影响）

**odysseus-core/src/cortex/** 目录：
- `CellDNA` → `ColumnProfile`
- `CellType` → `ColumnRole`
- `FitnessScore` 相关引用

**odysseus-core/src/synapse/** 目录：
- `SynapseMessage` → `ProjectionMessage`
- `SynapseRouter` → `ProjectionRouter`
- 或保持 `Synapse`（投射本质上是长距离突触连接，两者都说得通）

**odysseus-core/src/types.ts** 或相关类型定义：
- `CellId` → `ColumnId`
- `Cell` interface → `Column` interface

**odysseus-app/src/orchestrator/cells.ts**：
- `CellManager` → `ColumnManager`
- `spawn()` → `differentiate()`

### 保持不变（大部分）

- 所有脑区目录名和类名
- Hippocampus, Prefrontal, Brainstem, Cerebellum, Consciousness
- 大部分 internal 逻辑只改类型名，不改行为

### 渐进式迁移策略

1. **Phase 1**：类型别名（type alias）— 新旧名称并存
   ```typescript
   export type Column = Cell;        // 新名称
   export type ColumnRole = CellType; // 新名称
   /** @deprecated Use Column */
   export type Cell = { ... };
   ```

2. **Phase 2**：内部代码迁移到新名称，导出保持兼容

3. **Phase 3**：移除旧名称，全面切换

## 下一步

等用户确认方向后：
1. 先在 CLAUDE.md 更新架构描述
2. 添加类型别名
3. 逐步迁移核心模块
4. 更新文档和注释
