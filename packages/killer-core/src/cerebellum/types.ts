/**
 * Cerebellum - 实验策略编排核心类型
 *
 * 将 Odyssey Engine 的自主迭代能力内化为大脑区域。
 * Cerebellum 在生物学中负责运动学习和错误修正，
 * 在 Odysseus 中负责实验编排、策略选择和结果追踪。
 */

// ── Orientation (策略导向) ──

/**
 * 实验策略导向
 *
 * - engineer: 保守策略，小步原子提交，guard 优先
 * - creative:  发散策略，强制多样性，惊喜检测
 * - production: 渐进策略，每步可发布，最小变更
 */
export type Orientation = 'engineer' | 'creative' | 'production';

/**
 * 指南针读数 — 当前策略状态
 */
export interface CompassReading {
  orientation: Orientation;
  divergence: number;        // 与前 N 次实验的差异度 [0, 1]
  stuckLevel: number;        // 连续失败计数 [0, 10+]
  recommendedStrategy: StrategyHint;
  noveltyScore: number;      // 当前假设的新颖度 [0, 1]
}

/**
 * 策略提示 — 指导下一步行动选择
 */
export interface StrategyHint {
  scope: 'small' | 'medium' | 'large';   // 变更范围
  riskTolerance: number;                  // [0, 1]
  forceDivergence: boolean;               // 是否强制发散
  pattern: StrategyPattern;
}

export type StrategyPattern =
  | 'hypothesis_driven'     // 工程模式：基于已有知识提出假设
  | 'random_walk'           // 创意模式：随机探索 (1/5 概率)
  | 'inversion'             // 反向思考：优化反方向
  | 'cross_pollination'     // 跨域借鉴：从其他模块找灵感
  | 'constraint_removal'    // 移除约束：临时忽略一个限制
  | 'progressive_minimal';  // 生产模式：最小变更

// ── Mission (任务定义) ──

/**
 * 任务 — 等同于 MISSION.md 的内存表示
 */
export interface Mission {
  id: string;
  goal: string;
  context?: string;
  orientation: Orientation;
  metrics: MetricDefinition[];
  guard?: GuardCommand;
  termination: TerminationCondition[];
  scope?: MissionScope;
  createdAt: number;
  updatedAt: number;
}

export interface MetricDefinition {
  name: string;
  unit: string;
  measureCommand: string;
  direction: 'lower' | 'higher';
}

export interface GuardCommand {
  command: string;
  timeout: number;
}

export interface TerminationCondition {
  type: 'metric_threshold' | 'max_waypoints' | 'time_budget' | 'all_pass';
  value: number | string;
  metricName?: string;
}

export interface MissionScope {
  modifiable: string[];
  readOnly: string[];
}

// ── Experiment (实验) ──

/**
 * 实验 — 一次独立的假设验证
 */
export interface Experiment {
  id: string;
  missionId: string;
  waypoint: number;
  hypothesis: string;
  orientation: Orientation;
  checkpoint: StateSnapshot;
  status: ExperimentStatus;
  changes: FileChange[];
  result?: ExperimentResult;
  timestamp: number;
}

export type ExperimentStatus =
  | 'running'
  | 'kept'
  | 'discarded'
  | 'surprise'
  | 'rolled_back';

export interface StateSnapshot {
  id: string;
  label: string;
  timestamp: number;
  description: string;
  state: Record<string, unknown>;
}

export interface FileChange {
  path: string;
  type: 'created' | 'modified' | 'deleted';
  linesAdded: number;
  linesRemoved: number;
}

/**
 * 实验结果
 */
export interface ExperimentResult {
  verification: VerificationResult;
  metricValues: Record<string, number>;
  decision: ExperimentDecision;
  duration: number;
  lessonsLearned: string[];
}

// ── Verification (验证管道) ──

/**
 * 4层验证管道结果
 */
export interface VerificationResult {
  syntax: LayerResult;
  guard: LayerResult;
  metric: MetricLayerResult;
  quality: QualityLayerResult;
  overall: 'pass' | 'fail' | 'warning';
  totalDuration: number;
}

export interface LayerResult {
  passed: boolean;
  duration: number;
  output?: string;
  error?: string;
}

export interface MetricLayerResult extends LayerResult {
  values: Record<string, MetricValue>;
  improved: Record<string, boolean>;
}

export interface MetricValue {
  name: string;
  value: number;
  previousBest: number | null;
  direction: 'lower' | 'higher';
  delta: number | null;
}

export interface QualityLayerResult extends LayerResult {
  warnings: QualityWarning[];
  summary?: string;
}

export interface QualityWarning {
  type: string;
  message: string;
  severity: 'info' | 'warning' | 'error';
}

// ── Decision (决策) ──

export type ExperimentDecision = 'keep' | 'discard' | 'surprise';

/**
 * 决策矩阵 — 不同 orientation 的决策逻辑
 */
export interface DecisionMatrix {
  orientation: Orientation;
  rules: DecisionRule[];
}

export interface DecisionRule {
  condition: string;       // 描述性条件
  result: ExperimentDecision;
  priority: number;
}

// ── Surprise (意外发现) ──

/**
 * 意外发现 — 结果与预期不符时记录
 */
export interface Surprise {
  id: string;
  experimentId: string;
  missionId: string;
  expectedOutcome: string;
  actualOutcome: string;
  contradiction: string;   // 与什么假设矛盾
  insight: string;         // 可能的洞察
  noveltyScore: number;    // [0, 1]
  timestamp: number;
}

// ── Attempt History (尝试历史) ──

/**
 * 尝试历史 — 等同于 MISSION.md 的 "What's Been Tried"
 */
export interface AttemptHistory {
  missionId: string;
  wins: AttemptRecord[];
  deadEnds: AttemptRecord[];
  surprises: Surprise[];
  totalWaypoints: number;
  consecutiveDiscards: number;
  currentBest: Record<string, number | null>;
  baseline: Record<string, number | null>;
}

export interface AttemptRecord {
  waypoint: number;
  hypothesis: string;
  orientation: Orientation;
  decision: ExperimentDecision;
  metricValues: Record<string, number>;
  description: string;
  timestamp: number;
}

// ── Cerebellum Interface ──

/**
 * ICerebellum — 实验编排器接口
 */
export interface ICerebellum {
  // 策略指南针
  readCompass(history: AttemptHistory): CompassReading;

  // 任务管理
  createMission(config: MissionConfig): Mission;
  getActiveMission(): Mission | null;
  hasActiveMission(): boolean;

  // 实验生命周期
  beginExperiment(hypothesis: string): Promise<Experiment>;
  checkpoint(): Promise<StateSnapshot>;
  rollback(snapshot: StateSnapshot): Promise<void>;
  verify(experiment: Experiment): Promise<VerificationResult>;
  decide(
    experiment: Experiment,
    verification: VerificationResult,
    history: AttemptHistory,
  ): ExperimentDecision;

  // 追踪
  recordOutcome(
    experiment: Experiment,
    decision: ExperimentDecision,
    verification: VerificationResult,
  ): void;
  getHistory(missionId: string): AttemptHistory;

  // 意外检测
  detectSurprise(
    experiment: Experiment,
    verification: VerificationResult,
  ): Surprise | null;

  // 终止条件检查
  checkTermination(
    history: AttemptHistory,
    mission: Mission,
  ): { terminated: boolean; reason?: string };
}

/**
 * 任务配置 — 用户创建任务的简化接口
 */
export interface MissionConfig {
  goal: string;
  context?: string;
  orientation?: Orientation;
  metrics?: MetricDefinition[];
  guard?: string;
  maxWaypoints?: number;
  timeBudgetSeconds?: number;
  scope?: MissionScope;
}

/**
 * 默认任务配置
 */
export const DEFAULT_MISSION_CONFIG: Omit<Required<MissionConfig>, 'goal'> = {
  context: '',
  orientation: 'engineer',
  metrics: [],
  guard: '',
  maxWaypoints: 50,
  timeBudgetSeconds: 0,
  scope: { modifiable: [], readOnly: [] },
};
