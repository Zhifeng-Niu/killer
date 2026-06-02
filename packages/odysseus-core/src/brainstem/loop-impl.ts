/**
 * Brainstem - 主循环实现
 *
 * 永不停止的决策主循环
 * 感知 → 推理 → 行动 → 反思 → 演化 → 循环
 */

import type {
  Perception,
  Reasoning,
  Action,
  Reflection,
  Evolution,
  LoopState,
  LoopPhase,
  KernelLogger,
  EmotionalImpact,
  SelfAssessment,
  BehavioralAdjustment,
} from './types.js';
import type {
  IBrainstemLoop,
  IExperimentOrchestrator,
  LoopConfig,
  LoopEvent,
  ExperimentWaypointResult,
} from './loop-interface.js';
import { DEFAULT_LOOP_CONFIG } from './loop-interface.js';
import { SILENT_LOGGER } from './types.js';
import type { LLMProvider } from './llm.js';
import type { ToolExecutor } from './tools.js';

/**
 * 生成唯一 ID
 */
function generateId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Brainstem 主循环实现
 */
export class BrainstemLoop implements IBrainstemLoop {
  private readonly llm: LLMProvider;
  private readonly tools: ToolExecutor;
  private readonly config: LoopConfig;
  private readonly orchestrator?: IExperimentOrchestrator;
  private readonly logger: KernelLogger;

  // 循环状态
  private state: LoopState;
  private running: boolean = false;
  private stopRequested: boolean = false;

  // 感知队列
  private perceptionQueue: Perception[] = [];

  // 事件监听器
  private readonly listeners: Map<LoopEvent, Set<(state: LoopState) => void>>;

  // 循环控制
  private loopTimer: ReturnType<typeof setInterval> | null = null;
  private currentLoopPromise: Promise<void> | null = null;

  // 实验计数器
  private waypointCounter: number = 0;

  // Goal drive 节流
  private lastDriveTime: number = 0;

  constructor(
    llm: LLMProvider,
    tools: ToolExecutor,
    config: LoopConfig = DEFAULT_LOOP_CONFIG,
    orchestrator?: IExperimentOrchestrator,
  ) {
    this.llm = llm;
    this.tools = tools;
    this.config = config;
    this.orchestrator = orchestrator;
    this.logger = config.logger ?? SILENT_LOGGER;

    // 初始化状态
    this.state = this.createInitialState();

    // 初始化事件监听器
    this.listeners = new Map();
    for (const event of this.getAllEventTypes()) {
      this.listeners.set(event, new Set());
    }
  }

  /**
   * 启动永不停止的主循环
   */
  async start(): Promise<void> {
    if (this.running) {
      return;
    }

    this.running = true;
    this.stopRequested = false;

    this.log('Starting Brainstem loop...');

    // 启动循环
    this.currentLoopPromise = this.runLoop();

    await this.currentLoopPromise;
  }

  /**
   * 停止主循环
   */
  async stop(): Promise<void> {
    if (!this.running) {
      return;
    }

    this.log('Stopping Brainstem loop...');
    this.stopRequested = true;
    this.running = false;

    // 等待当前循环完成
    if (this.currentLoopPromise) {
      await this.currentLoopPromise;
      this.currentLoopPromise = null;
    }

    // 清理定时器
    if (this.loopTimer) {
      clearInterval(this.loopTimer);
      this.loopTimer = null;
    }
  }

  /**
   * 获取当前循环状态
   */
  getState(): LoopState {
    return { ...this.state };
  }

  /**
   * 注入感知输入
   */
  injectPerception(perception: Perception): void {
    this.perceptionQueue.push(perception);
    this.log(`Perception injected: ${perception.source}`);
  }

  /**
   * 订阅循环事件
   */
  on(event: LoopEvent, callback: (state: LoopState) => void): void {
    const callbacks = this.listeners.get(event);
    if (callbacks) {
      callbacks.add(callback);
    }
  }

  /**
   * 取消订阅
   */
  off(event: LoopEvent, callback: (state: LoopState) => void): void {
    const callbacks = this.listeners.get(event);
    if (callbacks) {
      callbacks.delete(callback);
    }
  }

  /**
   * 主循环核心逻辑
   */
  private async runLoop(): Promise<void> {
    while (!this.stopRequested) {
      try {
        // ① PERCEIVE - 感知
        const perception = await this.perceive();
        if (!perception) {
          // 无感知输入，短暂等待后继续
          await this.delay(this.config.perceptionInterval);
          continue;
        }

        // ② REASON - 推理
        const reasoning = await this.reason(perception);

        // ③ ACT - 行动
        const action = await this.act(reasoning);

        // ④ REFLECT - 反思
        const reflection = await this.reflect(action);

        // ⑤ EVOLVE - 演化
        await this.evolve(reflection);

      } catch (error) {
        this.logError('Loop error:', error);
        // 错误后继续循环
        await this.delay(1000);
      }
    }

    this.log('Brainstem loop stopped');
  }

  /**
   * 感知阶段：获取下一个感知
   */
  private async perceive(): Promise<Perception | null> {
    this.updatePhase('perceive');

    // 从队列获取感知
    const perception = this.perceptionQueue.shift();

    if (perception) {
      this.state.currentPerception = perception;
      this.emit('perceptionReceived', this.state);
      this.log(`Perceived: ${perception.source} (${perception.priority})`);
      return perception;
    }

    // 梦境模式：生成内部感知
    if (this.config.dreamingMode) {
      const internalPerception: Perception = {
        id: generateId('perception'),
        timestamp: Date.now(),
        source: 'internal',
        data: { type: 'dream_cycle', message: 'Internal processing cycle' },
        priority: 'low',
      };
      this.state.currentPerception = internalPerception;
      this.emit('perceptionReceived', this.state);
      return internalPerception;
    }

    // Goal drive：检测未完成任务，自主生成内部感知
    const drivePerception = this.goalDrive();
    if (drivePerception) {
      this.state.currentPerception = drivePerception;
      this.emit('perceptionReceived', this.state);
      this.log(`Goal drive: ${drivePerception.data && typeof drivePerception.data === 'object' && 'description' in (drivePerception.data as Record<string, unknown>) ? (drivePerception.data as Record<string, unknown>).description : 'unknown'}`);
      return drivePerception;
    }

    return null;
  }

  /**
   * Goal drive — 自主驱动：检测未完成任务并生成内部感知
   *
   * 当 Agent 有未完成的 Plan steps 时，自动生成内部感知
   * 推动脑干循环继续运转，不依赖外部输入。
   */
  private goalDrive(): Perception | null {
    if (!this.config.driveSource) return null;

    const now = Date.now();
    const interval = this.config.driveIntervalMs ?? 3000;
    if (now - this.lastDriveTime < interval) return null;

    if (!this.config.driveSource.hasPendingWork()) return null;

    const description = this.config.driveSource.getNextTaskDescription();
    if (!description) return null;

    this.lastDriveTime = now;

    return {
      id: generateId('drive'),
      timestamp: now,
      source: 'internal',
      data: {
        type: 'goal_drive',
        description,
        context: this.config.driveSource.getTaskContext(),
      },
      priority: 'normal',
    };
  }

  /**
   * 推理阶段：调用 LLM 生成推理
   */
  private async reason(perception: Perception): Promise<Reasoning> {
    this.updatePhase('reason');

    const prompt = this.buildReasoningPrompt(perception);
    const completion = await this.llm.complete(prompt);

    const reasoning: Reasoning = {
      id: generateId('reasoning'),
      timestamp: Date.now(),
      perceptionId: perception.id,
      conclusion: completion.content,
      confidence: this.extractConfidence(completion.content),
      suggestedActions: this.parseActions(completion.content),
    };

    this.state.currentReasoning = reasoning;
    this.emit('reasoningComplete', this.state);
    this.log(`Reasoned: ${reasoning.confidence.toFixed(2)} confidence`);

    return reasoning;
  }

  /**
   * 行动阶段：执行推理建议的行动
   */
  private async act(reasoning: Reasoning): Promise<Action> {
    this.updatePhase('act');

    const suggestedAction = reasoning.suggestedActions[0];

    const action: Action = {
      id: generateId('action'),
      timestamp: Date.now(),
      reasoningId: reasoning.id,
      type: suggestedAction?.type ?? 'tool_call',
      payload: suggestedAction?.payload ?? { tool: 'noop' },
      status: 'pending',
    };

    this.state.currentAction = action;

    // 执行行动
    action.status = 'executing';
    try {
      if (action.type === 'tool_call') {
        const payload = action.payload as { tool?: string; params?: unknown };
        if (payload.tool) {
          await this.tools.execute(payload.tool, payload.params);
        }
      }
      action.status = 'completed';
    } catch (error) {
      action.status = 'failed';
      this.logError('Action failed:', error);
    }

    this.emit('actionExecuted', this.state);
    this.log(`Acted: ${action.type} -> ${action.status}`);

    return action;
  }

  /**
   * 反思阶段：评估行动结果
   *
   * 轻量模式：直接从行动状态推导反思
   * 深度模式：额外调用 LLM 进行结构化内省
   */
  private async reflect(action: Action): Promise<Reflection> {
    this.updatePhase('reflect');

    const outcome: Reflection['outcome'] =
      action.status === 'completed'
        ? 'success'
        : action.status === 'failed'
          ? 'failure'
          : 'partial';

    const reflection: Reflection = {
      id: generateId('reflection'),
      timestamp: Date.now(),
      actionId: action.id,
      outcome,
      lessons: this.extractLessons(action),
      adaptability: outcome === 'success' ? 0.8 : 0.3,
    };

    // 深度反思：LLM 驱动的结构化内省
    if (this.config.deepReflection) {
      try {
        const deepResult = await this.performDeepReflection(action, reflection);
        reflection.emotionalImpact = deepResult.emotionalImpact;
        reflection.selfAssessment = deepResult.selfAssessment;
        reflection.behavioralAdjustments = deepResult.behavioralAdjustments;
      } catch (error) {
        // 深度反思失败不影响循环，保留轻量反思结果
        this.log(`Deep reflection failed: ${error instanceof Error ? error.message : String(error)}, using lightweight result`);
      }
    }

    this.state.currentReflection = reflection;
    this.emit('reflectionComplete', this.state);
    this.log(`Reflected: ${outcome}${reflection.selfAssessment ? ' (deep)' : ''}`);

    return reflection;
  }

  /**
   * 深度反思：使用 LLM 进行结构化内省
   */
  private async performDeepReflection(
    action: Action,
    baseReflection: Reflection,
  ): Promise<{
    emotionalImpact: EmotionalImpact;
    selfAssessment: SelfAssessment;
    behavioralAdjustments: BehavioralAdjustment[];
  }> {
    const prompt = `You are reflecting on a recent action. Perform structured introspection.

Action taken: ${action.type} -> ${action.status}
Outcome: ${baseReflection.outcome}
Lessons: ${baseReflection.lessons.join('; ')}

Respond in this exact JSON format:
{
  "emotionalImpact": {
    "userImpact": "positive|neutral|negative",
    "conversationToneChange": "improved|stable|worsened",
    "confidence": 0.0-1.0
  },
  "selfAssessment": {
    "selfConfidence": 0.0-1.0,
    "blindSpots": ["area1"],
    "growthAreas": ["area1"],
    "strengths": ["area1"]
  },
  "behavioralAdjustments": [
    {
      "domain": "communication|reasoning|proactivity|empathy|precision",
      "currentBehavior": "description",
      "suggestedBehavior": "description",
      "priority": 0.0-1.0
    }
  ]
}`;

    const completion = await this.llm.complete(prompt);

    // 尝试解析 JSON 响应（支持 ```json 代码块、多行 JSON）
    const jsonStr = this.extractJSON(completion.content);
    if (!jsonStr) {
      return this.createDefaultDeepReflection(baseReflection.outcome);
    }

    try {
      const parsed = JSON.parse(jsonStr);

      return {
        emotionalImpact: {
          userImpact: parsed.emotionalImpact?.userImpact ?? 'neutral',
          conversationToneChange: parsed.emotionalImpact?.conversationToneChange ?? 'stable',
          confidence: this.clamp(parsed.emotionalImpact?.confidence ?? 0.5),
        },
        selfAssessment: {
          selfConfidence: this.clamp(parsed.selfAssessment?.selfConfidence ?? 0.7),
          blindSpots: Array.isArray(parsed.selfAssessment?.blindSpots)
            ? parsed.selfAssessment.blindSpots.slice(0, 5)
            : [],
          growthAreas: Array.isArray(parsed.selfAssessment?.growthAreas)
            ? parsed.selfAssessment.growthAreas.slice(0, 5)
            : [],
          strengths: Array.isArray(parsed.selfAssessment?.strengths)
            ? parsed.selfAssessment.strengths.slice(0, 5)
            : [],
        },
        behavioralAdjustments: Array.isArray(parsed.behavioralAdjustments)
          ? parsed.behavioralAdjustments
              .filter((a: Record<string, unknown>) => a.domain && a.suggestedBehavior)
              .slice(0, 3)
              .map((a: Record<string, unknown>) => ({
                domain: a.domain as BehavioralAdjustment['domain'],
                currentBehavior: String(a.currentBehavior ?? ''),
                suggestedBehavior: String(a.suggestedBehavior),
                priority: this.clamp(Number(a.priority) || 0.5),
              }))
          : [],
      };
    } catch {
      return this.createDefaultDeepReflection(baseReflection.outcome);
    }
  }

  /**
   * 创建默认深度反思（解析失败时回退）
   */
  private createDefaultDeepReflection(outcome: Reflection['outcome']): {
    emotionalImpact: EmotionalImpact;
    selfAssessment: SelfAssessment;
    behavioralAdjustments: BehavioralAdjustment[];
  } {
    return {
      emotionalImpact: {
        userImpact: outcome === 'success' ? 'positive' : outcome === 'failure' ? 'negative' : 'neutral',
        conversationToneChange: 'stable',
        confidence: 0.5,
      },
      selfAssessment: {
        selfConfidence: outcome === 'success' ? 0.8 : 0.5,
        blindSpots: [],
        growthAreas: [],
        strengths: outcome === 'success' ? ['reliable execution'] : [],
      },
      behavioralAdjustments: [],
    };
  }

  /**
   * 限制数值范围到 [0, 1]
   */
  private clamp(value: number): number {
    return Math.max(0, Math.min(1, value));
  }

  /**
   * 从 LLM 响应中提取 JSON
   *
   * 支持：
   * 1. 纯 JSON 字符串
   * 2. \`\`\`json 代码块
   * 3. 混合文本中的 JSON 对象
   */
  private extractJSON(text: string): string | null {
    // 1. 尝试从 ```json 代码块中提取
    const codeBlockMatch = text.match(/```(?:json)?\s*\n?(\{[\s\S]*?\})\s*```/);
    if (codeBlockMatch) {
      return codeBlockMatch[1];
    }

    // 2. 尝试找到第一个平衡的 {...} 对象
    let depth = 0;
    let start = -1;
    for (let i = 0; i < text.length; i++) {
      if (text[i] === '{') {
        if (depth === 0) start = i;
        depth++;
      } else if (text[i] === '}') {
        depth--;
        if (depth === 0 && start >= 0) {
          const candidate = text.slice(start, i + 1);
          // 验证是否是合法 JSON
          try {
            JSON.parse(candidate);
            return candidate;
          } catch {
            // 不是合法 JSON，继续搜索
            start = -1;
          }
        }
      }
    }

    return null;
  }

  /**
   * 演化阶段：基于反思触发变异
   *
   * 当实验编排器（Cerebellum）激活时，执行实验航点而非简单变异。
   * 否则执行原有的策略强化/剪枝逻辑。
   */
  private async evolve(reflection: Reflection): Promise<void> {
    this.updatePhase('evolve');

    // 实验编排器激活 → 运行实验航点
    if (this.orchestrator?.hasActiveMission()) {
      const hypothesis = this.generateHypothesis(reflection);
      const result = await this.runExperimentWaypoint(hypothesis);
      if (result) {
        this.log(`Experiment waypoint ${result.waypoint}: ${result.decision}`);
        this.injectExperimentPerception(result);
        if (result.terminated) {
          this.log(`Mission terminated: ${result.terminationReason ?? 'completed'}`);
        }
      }
      return;
    }

    // 简单演化：策略强化/剪枝
    const evolution: Evolution = {
      id: generateId('evolution'),
      timestamp: Date.now(),
      reflectionId: reflection.id,
      mutations: [],
    };

    if (reflection.adaptability > 0.7) {
      evolution.mutations.push({
        target: 'strategy',
        type: 'point',
        payload: { reinforcement: true },
      });
    }

    if (reflection.outcome === 'failure') {
      evolution.mutations.push({
        target: 'skill',
        type: 'deletion',
        payload: { pruneFailed: true },
      });
    }

    this.state.currentEvolution = evolution;
    this.emit('evolutionComplete', this.state);
    this.log(`Evolved: ${evolution.mutations.length} mutations`);
  }

  /**
   * 运行一次实验航点
   *
   * 流程: begin → verify → decide → record
   * 这是 BrainstemLoop 与 Cerebellum 的核心集成点。
   */
  async runExperimentWaypoint(hypothesis: string): Promise<ExperimentWaypointResult | null> {
    if (!this.orchestrator?.hasActiveMission()) {
      return null;
    }

    this.waypointCounter++;
    const waypoint = this.waypointCounter;

    try {
      // begin — 创建实验，建立 checkpoint
      const experiment = await this.orchestrator.beginExperiment(hypothesis);

      // verify — 执行4层验证管道
      const verification = await this.orchestrator.verify(experiment);

      // decide — 根据验证结果和 orientation 决策
      const history = this.orchestrator.getHistory();
      const decision = this.orchestrator.decide(experiment, verification, history);

      // record — 记录结果到尝试历史
      this.orchestrator.recordOutcome(experiment, decision, verification);

      // 检查终止条件
      const termination = this.orchestrator.checkTermination();

      const result: ExperimentWaypointResult = {
        waypoint,
        hypothesis,
        decision,
        terminated: termination.terminated,
        terminationReason: termination.reason,
      };

      this.emit('experimentWaypoint', this.state);
      return result;
    } catch (error) {
      this.logError(`Experiment waypoint ${waypoint} failed:`, error);
      return {
        waypoint,
        hypothesis,
        decision: 'discard',
        terminated: false,
      };
    }
  }

  /**
   * 基于反思生成实验假设
   */
  private generateHypothesis(reflection: Reflection): string {
    const compass = this.orchestrator?.readCompass(
      this.orchestrator.getHistory(),
    );

    if (compass?.stuckLevel && compass.stuckLevel >= 3) {
      return `Break stuck pattern: try radically different approach after ${compass.stuckLevel} consecutive failures`;
    }

    if (compass?.recommendedStrategy.forceDivergence) {
      return `Forced divergence: explore orthogonal direction (novelty=${compass.noveltyScore.toFixed(2)})`;
    }

    if (reflection.outcome === 'failure') {
      return `Recover from failure: analyze root cause of ${reflection.lessons.join('; ')}`;
    }

    return `Extend success: reinforce approach with adaptability=${reflection.adaptability.toFixed(2)}`;
  }

  /**
   * 将实验结果注入感知队列
   *
   * 形成 Cerebellum → BrainstemLoop 的反馈闭环：
   * 实验决策结果作为内部感知传入下一轮循环，
   * 使后续的推理和行动能参考实验发现。
   */
  private injectExperimentPerception(result: ExperimentWaypointResult): void {
    const perception: Perception = {
      id: generateId('exp'),
      timestamp: Date.now(),
      source: 'internal',
      priority: result.decision === 'keep' ? 'normal' : 'low',
      data: {
        type: 'experiment_result',
        waypoint: result.waypoint,
        decision: result.decision,
        hypothesis: result.hypothesis,
        terminated: result.terminated,
        terminationReason: result.terminationReason,
      },
    };
    this.perceptionQueue.push(perception);
  }

  /**
   * 构建推理提示词
   */
  private buildReasoningPrompt(perception: Perception): string {
    return `
You are the Brainstem - the autonomous decision-making core.

Current perception:
- Source: ${perception.source}
- Priority: ${perception.priority}
- Data: ${JSON.stringify(perception.data)}

Analyze this perception and:
1. Determine what action to take
2. Assess your confidence (0-1)
3. Format your response clearly

Available tools: ${this.tools.list().join(', ')}
`;
  }

  /**
   * 从响应中提取置信度
   */
  private extractConfidence(content: string): number {
    const match = content.match(/confidence[:\s]+([0-9.]+)/i);
    if (match) {
      const value = parseFloat(match[1]);
      if (!isNaN(value)) {
        return Math.min(1, Math.max(0, value));
      }
    }
    return 0.7; // 默认置信度
  }

  /**
   * 解析建议的行动
   */
  private parseActions(content: string): Action[] {
    // 简化实现：返回一个默认行动
    return [
      {
        id: generateId('suggested_action'),
        timestamp: Date.now(),
        reasoningId: '', // 稍后填充
        type: 'tool_call',
        payload: { tool: 'memory_store', params: { reasoning: content } },
        status: 'pending',
      },
    ];
  }

  /**
   * 从行动中提取经验教训
   */
  private extractLessons(action: Action): string[] {
    const lessons: string[] = [];

    if (action.status === 'completed') {
      lessons.push('Action execution successful');
    } else if (action.status === 'failed') {
      lessons.push('Action execution failed - review approach');
    }

    return lessons;
  }

  /**
   * 更新循环阶段
   */
  private updatePhase(phase: LoopPhase): void {
    this.state.phase = phase;
    this.emit('phaseChange', this.state);
  }

  /**
   * 触发事件
   */
  private emit(event: LoopEvent, state: LoopState): void {
    const callbacks = this.listeners.get(event);
    if (callbacks) {
      for (const callback of callbacks) {
        try {
          callback(state);
        } catch (error) {
          this.logError(`Event callback error [${event}]:`, error);
        }
      }
    }
  }

  /**
   * 创建初始状态
   */
  private createInitialState(): LoopState {
    return {
      phase: 'perceive',
      currentPerception: null,
      currentReasoning: null,
      currentAction: null,
      currentReflection: null,
      currentEvolution: null,
    };
  }

  /**
   * 获取所有事件类型
   */
  private getAllEventTypes(): LoopEvent[] {
    return [
      'phaseChange',
      'perceptionReceived',
      'reasoningComplete',
      'actionExecuted',
      'reflectionComplete',
      'evolutionComplete',
      'experimentWaypoint',
    ];
  }

  /**
   * 日志输出
   */
  private log(message: string): void {
    if (this.config.debugLogging) {
      this.logger.info(`[Brainstem] ${message}`);
    }
  }

  /**
   * 错误日志
   */
  private logError(message: string, error: unknown): void {
    this.logger.error(`[Brainstem] ${message}`, error);
  }

  /**
   * 延迟辅助函数
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
