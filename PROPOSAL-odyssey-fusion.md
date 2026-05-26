---
title: Odyssey Engine × Killer Agent Framework 架构融合提案
status: draft
created: 2026-05-26
orientation: creative
---

# Odyssey Engine × Killer Agent Framework 架构融合提案

## 1. 执行摘要

将 odyssey-engine 的**自主迭代编排能力**从外部 Claude Code 插件内化为 Killer Agent Framework 的**一等大脑区域**，使 Odysseus Agent 具备结构化实验、策略性探索和自适应演化的原生能力。

### 核心洞察

Odyssey Engine 本质上是一个**元认知系统** — 它不直接解决问题，而是编排"如何解决问题"的策略。这与 Killer 的 brain+cell 架构天然互补：

| 维度 | Odyssey Engine | Killer Agent Framework | 融合方向 |
|------|---------------|----------------------|---------|
| 循环模式 | checkpoint→compass→act→verify→decide | perceive→reason→act→reflect→evolve | 将 compass/verify/decide 注入 reason/reflect |
| 策略选择 | 3种 orientation (engineer/creative/production) | 无显式策略 | 新增 cerebellum 脑区管理策略 |
| 实验追踪 | JSONL + MISSION.md | hippocampus 6层记忆 | 扩展 episodic/semantic 层 |
| 回滚机制 | git checkpoint/rollback | session snapshot | 统一为 cerebellum 快照 |
| 并行探索 | 串行 waypoint | 多 cell 并行委托 | 并行实验分支 |
| 评估管道 | 4层验证 (syntax→guard→metric→quality) | 工具权限 + 结果检查 | 新增 ExperimentEvaluator |

## 2. 架构对比分析

### 2.1 Odyssey Engine 核心抽象

```
┌─────────────────────────────────────────────────┐
│ MISSION.md (Living Document)                     │
│ ┌─────────────────────────────────────────────┐ │
│ │ Goal → Metrics → Guard → Termination        │ │
│ │ What's Been Tried (Wins/Dead Ends/Surprises) │ │
│ └─────────────────────────────────────────────┘ │
│                                                  │
│ Loop: waypoint N                                 │
│   1. CHECKPOINT — git save state                 │
│   2. COMPASS    — orientation-based strategy     │
│   3. ACT        — one focused change             │
│   4. VERIFY     — 4-layer pipeline               │
│   5. DECIDE     — keep or rollback               │
│   6. RECORD     — JSONL + MISSION.md update      │
│   7. CONTINUE   — stop-hook prevents exit        │
│                                                  │
│ Agents: explorer (search), critic (evaluate)     │
│ Helper: odyssey_helper.py (JSONL, detect)        │
└─────────────────────────────────────────────────┘
```

### 2.2 Killer Agent Framework 核心抽象

```
┌─────────────────────────────────────────────────┐
│ Agent (Orchestrator)                             │
│ ├── Middleware Pipeline (onion model)            │
│ ├── processInput (queue + lock)                  │
│ ├── BrainstemLoop                                │
│ │   perceive → reason → act → reflect → evolve   │
│ ├── Hippocampus (6-layer memory)                 │
│ │   Working, Episodic, Semantic, Procedural,     │
│ │   Prospective, Dream                           │
│ ├── Cortex (Darwinian evolution)                 │
│ │   mutation, crossover, fitness                 │
│ ├── Synapse (cell communication)                 │
│ │   send/broadcast/receive/negotiate             │
│ ├── Prefrontal (planning + risk)                 │
│ ├── Consciousness (event stream)                 │
│ ├── Persona (mirror neuron + emotions)           │
│ └── Cell System (Prime/Researcher/Artisan/...)   │
└─────────────────────────────────────────────────┘
```

### 2.3 映射关系

| Odyssey 概念 | Killer 对应 | 融合策略 |
|-------------|------------|---------|
| MISSION.md | Episodic Memory + Prospective Memory | 新增 `MissionMemory` 语义层 |
| Compass (orientation) | 无对应 | 新增 `Cerebellum` 脑区 |
| Checkpoint | SessionManager.snapshot() | 统一为 `Cerebellum.checkpoint()` |
| Verify (4层) | ToolPermissions | 新增 `ExperimentEvaluator` |
| JSONL 追踪 | Consciousness events | 新增 experiment.* 事件类型 |
| Explorer agent | Researcher Cell | 保留，增加 creative orientation |
| Critic agent | 无对应 | 新增 `CriticCell` type |
| Stop-hook loop | BrainstemLoop | 循环已在，增加实验模式 |
| Surprise detection | 无对应 | 新增 `SurpriseDetector` 在 consciousness |

## 3. 融合方案：Cerebellum + Dream Experimentation

基于跨领域探索，推荐**双层融合架构**：

### 3.1 第一层：Cerebellum — 策略编排脑区

新增大脑区域，负责实验策略的编排和协调。

```
packages/killer-core/src/
├── cerebellum/                    # 新脑区：实验策略编排
│   ├── cerebellum.ts              # 主类：实验编排器
│   ├── compass.ts                 # 策略指南针 (orientation 逻辑)
│   ├── evaluator.ts               # 4层验证管道
│   ├── experiment-tracker.ts      # 实验追踪 (替代 JSONL)
│   ├── surprise-detector.ts       # 意外发现检测
│   └── types.ts                   # 类型定义
```

**核心接口设计**：

```typescript
// ── Orientation Types ──

type Orientation = 'engineer' | 'creative' | 'production';

interface CompassReading {
  orientation: Orientation;
  divergence: number;           // 与前 N 次实验的差异度
  stuckLevel: number;           // 0-10 连续失败计数
  recommendedStrategy: Strategy;
  noveltyScore: number;         // 创新模式下的新颖度评分
}

// ── Experiment Lifecycle ──

interface Experiment {
  id: string;
  mission: Mission;
  orientation: Orientation;
  hypothesis: string;           // 本次实验要验证的假设
  checkpoint: StateSnapshot;    // 实验前状态快照
  status: 'running' | 'kept' | 'discarded' | 'surprise';
  result?: ExperimentResult;
}

interface Mission {
  goal: string;
  metrics: MetricDefinition[];
  guard: GuardCommand;
  termination: TerminationCondition[];
  whatHasBeenTried: AttemptHistory;
}

// ── Verification Pipeline ──

interface VerificationResult {
  syntax: LayerResult;     // Layer 0: 语法检查
  guard: LayerResult;      // Layer 1: 约束检查
  metric: MetricResult;    // Layer 2: 指标测量
  quality: QualityResult;  // Layer 3: 质量评估
  overall: 'pass' | 'fail' | 'warning';
}

// ── Cerebellum Core ──

interface ICerebellum {
  // 策略指南针
  readCompass(history: AttemptHistory): CompassReading;

  // 实验管理
  beginExperiment(mission: Mission, hypothesis: string): Promise<Experiment>;
  checkpoint(): Promise<StateSnapshot>;
  rollback(snapshot: StateSnapshot): Promise<void>;
  verify(experiment: Experiment): Promise<VerificationResult>;
  decide(experiment: Experiment, verification: VerificationResult): 'keep' | 'discard' | 'surprise';

  // 追踪
  recordOutcome(experiment: Experiment, decision: string): void;
  getHistory(missionId: string): AttemptHistory;

  // 意外检测
  detectSurprise(experiment: Experiment, result: ExperimentResult): Surprise | null;
}
```

### 3.2 第二层：Dream Experimentation — 反事实梦境

扩展已有 DreamEngine，增加"反事实模拟"能力。

```typescript
// 扩展 hippocampus/dreaming.ts

interface CounterfactualDream extends Dream {
  alternativeApproach: string;
  simulatedOutcome: SimulationResult;
  confidence: number;
  noveltyScore: number;
}

interface ExperimentDreamEngine extends DreamEngine {
  // 反事实梦境：模拟"如果采用不同方法会怎样"
  dreamCounterfactual(
    currentState: LoopState,
    alternatives: string[],
    mission: Mission
  ): Promise<CounterfactualDream[]>;

  // 清醒梦境：在隔离环境中测试方法
  lucidExperiment(
    approach: string,
    mission: Mission
  ): Promise<{ safe: boolean; estimatedOutcome: ExperimentResult }>;

  // 噩梦检测：识别在模拟中持续失败的方法
  detectNightmares(recentDreams: CounterfactualDream[]): string[];
}
```

### 3.3 BrainstemLoop 扩展

将实验编排逻辑注入现有主循环：

```typescript
// 扩展 brainstem/loop-impl.ts 的 runLoop

private async runLoop(): Promise<void> {
  while (!this.stopRequested) {
    try {
      const perception = await this.perceive();
      if (!perception) {
        await this.delay(this.config.perceptionInterval);
        continue;
      }

      // ── 新增：检查是否有活跃任务 ──
      if (this.cerebellum?.hasActiveMission()) {
        await this.runExperimentWaypoint(perception);
        continue;
      }

      // 原有循环
      const reasoning = await this.reason(perception);
      const action = await this.act(reasoning);
      const reflection = await this.reflect(action);
      await this.evolve(reflection);

    } catch (error) {
      this.logError('Loop error:', error);
      await this.delay(1000);
    }
  }
}

// ── 新增：实验航点循环 ──

private async runExperimentWaypoint(perception: Perception): Promise<void> {
  const mission = this.cerebellum.getActiveMission();
  const history = this.cerebellum.getHistory(mission.id);

  // 1. CHECKPOINT
  const snapshot = await this.cerebellum.checkpoint();

  // 2. COMPASS — 选择策略
  const compass = this.cerebellum.readCompass(history);

  // 3. ACT — 执行一个聚焦的改变
  const hypothesis = this.generateHypothesis(compass, history);
  const experiment = await this.cerebellum.beginExperiment(mission, hypothesis);

  // 4. VERIFY — 4层验证
  const verification = await this.cerebellum.verify(experiment);

  // 5. DECIDE — 保留或回滚
  const decision = this.cerebellum.decide(experiment, verification);

  if (decision === 'discard') {
    await this.cerebellum.rollback(snapshot);
  }

  // 6. RECORD — 追踪结果
  this.cerebellum.recordOutcome(experiment, decision);

  // 7. SURPRISE — 检测意外
  const surprise = this.cerebellum.detectSurprise(experiment, verification);
  if (surprise) {
    this.consciousness.emit('experiment.surprise', surprise);
  }

  // 8. CONTINUE — 发射航点完成事件
  this.consciousness.emit('experiment.waypoint_complete', {
    waypoint: history.totalWaypoints + 1,
    decision,
    metric: verification.metric,
  });
}
```

### 3.4 Consciousness 事件扩展

```typescript
// 扩展 consciousness/types.ts

type ExperimentEventType =
  | 'experiment.started'
  | 'experiment.checkpoint'
  | 'experiment.verified'
  | 'experiment.kept'
  | 'experiment.discarded'
  | 'experiment.surprise'
  | 'experiment.waypoint_complete'
  | 'experiment.stuck'
  | 'experiment.completed'
  | 'experiment.dream_counterfactual'
  | 'experiment.dream_lucid';

// 添加到现有 EventType union
type EventType =
  | ...existingTypes
  | ExperimentEventType;
```

### 3.5 Cell 系统扩展

```typescript
// 新增 Cell 类型

type CellType =
  | 'prime'
  | 'researcher'
  | 'artisan'
  | 'negotiator'
  | 'evolver'
  | 'critic'       // 新增：评估实验结果
  | 'explorer';    // 新增：跨域探索灵感

// CriticCell：对应 odyssey-critic
interface CriticCell {
  evaluateNovelty(result: ExperimentResult, history: AttemptHistory): NoveltyAssessment;
  evaluateReadiness(result: ExperimentResult): ReadinessCheck;
  assessDivergence(recentWaypoints: Experiment[]): DivergenceReport;
}

// ExplorerCell：对应 odyssey-explorer
interface ExplorerCell {
  crossPollinate(mission: Mission, codebase: string): Promise<Approach[]>;
  inversionAnalysis(mission: Mission): Promise<Approach[]>;
  randomWalk(context: LoopState): Promise<Approach>;
}
```

## 4. 实现路径

### Phase 1: 基础设施 (1-2天)

1. 创建 `packages/killer-core/src/cerebellum/` 目录结构
2. 实现 `types.ts` — 所有实验相关类型定义
3. 实现 `experiment-tracker.ts` — 内存中的 JSONL 替代
4. 扩展 `consciousness/types.ts` — 添加实验事件类型
5. 编写单元测试

### Phase 2: 核心引擎 (2-3天)

1. 实现 `compass.ts` — 三种 orientation 的策略逻辑
2. 实现 `evaluator.ts` — 4层验证管道
3. 实现 `cerebellum.ts` — 主编排器
4. 实现 `surprise-detector.ts` — 意外发现检测
5. 集成到 `BrainstemLoop` — 添加 `runExperimentWaypoint`
6. 集成测试

### Phase 3: Dream 扩展 (1-2天)

1. 扩展 `hippocampus/dreaming.ts` — 反事实梦境
2. 实现 `ExperimentDreamEngine` — 清醒梦境实验
3. 连接 cerebellum 和 dream engine

### Phase 4: Cell 扩展 (1-2天)

1. 新增 `CriticCell` 类型
2. 新增 `ExplorerCell` 类型
3. 扩展 `task-delegate.ts` — 实验委托
4. 端到端测试

### Phase 5: API & CLI 集成 (1天)

1. 添加 `/mission` 命令到 CLI
2. 添加 `POST /mission` API 端点
3. 添加 `GET /experiments` 查询端点
4. SSE 事件流中包含实验事件

## 5. Goliath Pattern 融合

将 Odyssey 的 "巨人模式" 内化为 Cerebellum 的增强能力：

```typescript
// cerebellum/goliath.ts

class GoliathPattern {
  /**
   * 面对"巨人"（看似不可能的任务）时的策略
   *
   * 1. SLING — 收集 3-5 种多元方法（不穿借来的铠甲）
   * 2. PRECISION STRIKE — 先试最出乎意料的方法
   * 3. SURPRISE DETECTION — 结果与假设矛盾时标记
   * 4. RECORD THE STORY — 每个巨人记入 "Surprises"
   */
  async faceGiant(mission: Mission): Promise<GiantEncounter> {
    // Step 1: 收集多元石头
    const stones = await this.gatherDiverseStones(mission);
    // 排除与已失败方法相似的
    const filteredStones = this.filterByDissimilarity(stones, mission.deadEnds);
    // 按新颖度排序
    const ranked = filteredStones.sort((a, b) => b.novelty - a.novelty);

    // Step 2: 精准打击 — 先试最出乎意料的
    const mostUnexpected = ranked[0];
    return {
      stone: mostUnexpected,
      alternatives: ranked.slice(1),
      rationale: 'Most unexpected approach that remains plausible',
    };
  }

  private async gatherDiverseStones(mission: Mission): Promise<Stone[]> {
    // 跨域搜索：代码库其他模块、网络、反向思考
    const [crossPollination, inversion, randomWalk] = await Promise.all([
      this.explorerCell.crossPollinate(mission, this.codebasePath),
      this.explorerCell.inversionAnalysis(mission),
      this.explorerCell.randomWalk(this.currentState),
    ]);

    return [
      ...crossPollination.map(s => ({ ...s, source: 'cross-pollination' })),
      ...inversion.map(s => ({ ...s, source: 'inversion' })),
      randomWalk,
    ];
  }
}
```

## 6. 关键设计决策

### 6.1 为什么选择 Cerebellum 而非独立系统

- **生物学一致性**：小脑负责运动学习和错误修正，与实验编排的语义完美匹配
- **非侵入式**：小脑是**旁路**系统，不替代主脑干循环，而是协调和优化它
- **并行能力**：小脑可以同时协调多个实验分支，不影响主循环运行
- **已有先例**：SessionManager 已有 snapshot/restore 基础设施

### 6.2 为什么保留外部 Odyssey 插件

- 外部插件继续作为 **Claude Code 用户的入口** — 通过 `/odyssey` 命令触发
- 内部 Cerebellum 作为 **agent 运行时的引擎** — 通过 API/CLI 触发
- 两者共享相同的策略逻辑（compass, evaluator），但执行环境不同

### 6.3 与现有脑区的交互

```
                    ┌─────────────────┐
                    │   Consciousness  │ ← experiment.* 事件
                    └────────┬────────┘
                             │
┌────────────┐    ┌──────────┴──────────┐    ┌──────────────┐
│ Prefrontal  │◄──►│     Cerebellum      │◄──►│  Hippocampus │
│ (规划+风险) │    │ (实验编排+策略)      │    │ (记忆+梦境)  │
└────────────┘    │                     │    └──────────────┘
                  │ • Compass           │         ▲
                  │ • Evaluator         │         │
                  │ • Tracker           │    反事实梦境
                  │ • Surprise Detector  │
                  └──────────┬──────────┘
                             │
                    ┌────────┴────────┐
                    │    Cortex        │ ← 实验结果驱动演化
                    │ (达尔文进化)      │
                    └─────────────────┘
```

## 7. 风险评估

| 风险 | 严重性 | 缓解策略 |
|------|--------|---------|
| Cerebellum 脑区过于复杂 | 高 | 分阶段实现，Phase 1 仅做类型定义和追踪 |
| 实验循环与主循环冲突 | 中 | 使用 processing lock 已有机制 |
| 4层验证管道在 LLM 场景下难以量化 | 中 | 允许自定义 metric 函数 |
| 反事实梦境的 LLM 调用成本 | 中 | 批量模拟，限制梦境 token 预算 |
| Cell 类型膨胀 | 低 | Critic 和 Explorer 作为现有 Researcher 的特化 |

## 8. 预期成果

融合完成后，Odysseus Agent 将具备：

1. **结构化自主实验**：不再盲目迭代，而是每次改变都有假设、验证和追踪
2. **策略感知**：根据任务性质自动切换保守/创意/生产模式
3. **意外发现能力**：不仅追踪成功和失败，还追踪"反直觉"的结果
4. **反事实推理**：通过梦境模拟替代方案，降低实验成本
5. **完整实验历史**：每个任务的尝试历史成为长期记忆，避免重复错误

---

> 就像生物大脑的小脑不需要意识参与就能协调运动学习，
> Cerebellum 在 Odysseus 中将实验编排内化为无意识的能力 —
> Agent 不需要被外部工具驱动就能自主探索和优化。
