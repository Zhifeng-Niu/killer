/**
 * Killer Agent - 主 Agent 类
 *
 * 编排所有模块，提供统一的 Agent 接口
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

import {
  BrainstemLoop,
  type LoopState,
  type Perception,
  HippocampusEngine,
  type MemoryConfig,
  DEFAULT_MEMORY_CONFIG,
  EvolutionEngine,
  SkillEcosystem,
  SynapseProtocol,
  ConsciousnessStream,
  ToolExecutor,
  DEFAULT_LOOP_CONFIG,
  type LoopConfig,
  CellType,
  type CellId,
  Planner,
  RiskAssessor,
  DecisionEngine,
  PlanExecutor,
  type Goal,
  type Plan,
  type PlanStep,
  type StepResult,
  type Decision,
  type PrefrontalConfig,
  DEFAULT_PREFRONTAL_CONFIG,
  type DreamResult as DreamCycleResult,
  LLMError,
  isKillerError,
  getBuiltinTools,
  ToolForge,
  LearnTool,
  UnlearnTool,
  InspectToolsTool,
  SelfReflectTool,
  EssenceForge,
  EvolveEssenceTool,
  SelfReadTool,
  SelfModifyTool,
  SelfListTool,
  Cerebellum,
  AutoMissionTool,
  type Experiment,
  type ExperimentDecision,
  type ToolDefinition,
  type ChatMessage,
  type ToolCall,
} from '@killer/core';
import { ShellExecutor } from './shell-executor.js';
import { SensoryRouter, CLIChannel, OutputManager } from '../sensory/index.js';
import { WebhookChannel } from '../sensory/webhook/index.js';
import type {
  AgentConfig,
  AgentStatus,
  ModuleStatus,
} from './types.js';
import { DEFAULT_AGENT_CONFIG } from './types.js';
import type { SensoryInput } from '../sensory/types.js';
import { CellManager, type CellStatusReport } from './cells.js';
import { CommandHandler } from './commands.js';
import { BuiltinTools } from './tools.js';
import { TaskDelegate, type DelegationResult } from './task-delegate.js';
import { ToolPermissions, type PermissionCheck } from './tool-permissions.js';
import { PluginManager, type KillerPlugin } from '../plugins/index.js';
import { MetricsCollector } from '../metrics/index.js';
import { HealthMonitor } from '../metrics/health-monitor.js';
import { LifecycleHooks, type LifecycleEvent, type LifecycleHandler, type LifecycleSubscription } from './hooks.js';
import { MiddlewarePipeline, type Middleware, type MiddlewareContext, sanitizeMiddleware, structuredLoggingMiddleware, metricsMiddleware, sensitiveDataFilterMiddleware } from './middleware.js';
import { ContextWindowManager, type ContextMessage } from './context.js';
import { buildSystemPrompt, type PromptBuilderDeps } from './prompt-builder.js';
import { triggerAutoDream, triggerAutoEvolve, generateProactiveSuggestions, generateDailySummary, generateIdleCheckin, checkRelationshipMilestone, detectCommitments, checkPendingReminders, computeAttentionState, detectConversationalPhase, extractFactsFromMessage, storeExtractedFacts, detectGoalConflicts, consolidateMemories, getFailurePatterns, classifyFailure, recordFailure, generateTemporalContext, predictConversationFlow, evaluateResponseQuality, detectResponseRepetition, detectLengthSignal, updateLengthPreference, createDefaultLengthPreference, suggestToolPriority, monitorConversationHealth, detectMultiIntent, detectAmbiguity, buildGoalDependencyGraph, detectTopicTransition, decideAutonomousActions, classifyInteractionOutcome, suggestStrategyAdjustment, generateIntentPreloads, extractTopicSnapshot, formatTopicSnapshot, type TopicContextSnapshot, analyzeConversationRhythm, buildUserExpertiseProfile, mapEmotionToResponseStrategy, fusePerceptionSignals, verifyStrategyCoherence, adaptCognitiveParams, DEFAULT_COGNITIVE_TUNING, type CognitiveTuningParams, generateCognitiveStateSummary, generateResponseStrategyGuidance, AUTO_DREAM_INTERVAL, AUTO_EVOLVE_INTERVAL, AUTO_PROACTIVE_INTERVAL, DAILY_SUMMARY_INTERVAL, IDLE_CHECKIN_INTERVAL, createDefaultSectionWeights, recordActiveSections, updateSectionWeights, getSectionWeightOffset, exportSectionWeights, importSectionWeights, type SectionWeights, classifyIntent, extractIntentSummary, trackIntentEvolution, formatIntentEvolution, type IntentNode, type IntentEvolution, evaluateSignalUtilization, updateUtilizationStats, getUnderutilizedSections, createDefaultUtilizationStats, type UtilizationStats, createDefaultStyleEvolution, extractResponseFeatures, inferSatisfactionFromReply, updateStyleEvolution, generateStyleGuidance, type StyleEvolutionModel, type ResponseStyleFeatures, createEmptyKnowledgeGraph, extractEntitiesFromMessage, extractRelationsFromMessage, getTopEntities, formatKnowledgeSummary, type ConversationKnowledgeGraph, computeRepetitionScore, computeToolEfficiency, assessCognitiveFatigue, formatFatigueGuidance, type FatigueIndicators, type CognitiveFatigueState, classifyGapSeverity, extractLastTopic, extractPendingCommitments, generateGapRecoveryStrategy, formatGapRecoveryGuidance, type GapContext, extractLessonFromQuality, extractLessonFromToolFailure, recordLesson, getRelevantLessons, formatLessonsPrompt, updateRhythmProfile, createDefaultRhythmProfile, formatRhythmGuidance, type RhythmSample, type RhythmProfile, decomposeIntent, formatIntentDecomposition, type IntentDecomposition, createEmptySemanticNetwork, extractConceptsFromMessage, extractSemanticRelations, detectIsolatedConcepts, inferImplicitRelations, formatSemanticNetworkSummary, type SemanticMemoryNetwork, assessResponseTiming, formatTimingGuidance, type ResponseTimingAssessment, generateConversationSummary, formatConversationSummary, validateResponse, formatCorrectionResult, type CorrectionResult, allocateBudget, pruneByBudget, predictNextIntent, formatNextTurnPrediction, type NextTurnPrediction, analyzeCrossModuleFeedback, formatCognitiveFeedback, type CognitiveFeedbackAnalysis, generateToolChainSuggestion, formatToolChainSuggestion, type ToolChainSuggestion, mineToolPatterns, type ToolUsageRecord, analyzeConversationMomentum, formatMomentumState, type MomentumState } from './background-tasks.js';
import { loadPlugins, registerPlugin as registerPluginExternal, unloadPlugin as unloadPluginExternal, type PluginLifecycleDeps } from './plugin-lifecycle.js';
import { executeToolCalls as executeToolCallsFromResponse, type ResponseProcessorDeps } from './response-processor.js';
import { extractFacts, type ExtractedFact } from './fact-extractor.js';
import { mapSensoryPriority, mapSensoryChannelToSource } from './sensory-mapper.js';
import { PersonaEngine, DEFAULT_PERSONA_CONFIG, type PersonaEngineConfig, type PersonaDNAConfig } from '../persona/engine.js';
import { initKillerDir } from '../config/types.js';
import { SkillManager, type SkillExecutionResult } from '../skills/manager.js';
import { SessionManager, type SessionSnapshot } from '../session/index.js';
import { Logger } from '../log/index.js';

/**
 * 生成唯一 ID
 */
function generateId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

const WRAP_UP = /\b(thanks?|thank you|bye|goodbye|see you|got it|that's all|done|完美|谢|再见|好了|差不多了|搞定)\b/i;
const TECHNICAL = /\b(function|class|error|bug|fix|implement|test|deploy|code|api|debug|refactor|type|interface|import|export)\b/i;

/**
 * Killer Agent - 主 Agent 类
 *
 * 编排所有核心模块，提供统一的启动和停止接口
 */
export class KillerAgent {
  private readonly config: AgentConfig;
  private readonly status: AgentStatus;
  private readonly prefrontalConfig: PrefrontalConfig;
  private readonly logger = Logger.getInstance().child('agent');
  readonly healthMonitor = new HealthMonitor();

  // 核心模块
  consciousness!: ConsciousnessStream;
  hippocampus!: HippocampusEngine;
  evolution!: EvolutionEngine;
  skills!: SkillEcosystem;
  synapse!: SynapseProtocol;
  brainstem!: BrainstemLoop;
  tools!: ToolExecutor;

  // 前额叶皮层
  planner!: Planner;
  riskAssessor!: RiskAssessor;
  decision!: DecisionEngine;
  planExecutor!: PlanExecutor;

  // 感官模块
  sensoryRouter!: SensoryRouter;
  cliChannel!: CLIChannel;
  outputManager!: OutputManager;

  // 管理器
  cellManager!: CellManager;
  commandHandler!: CommandHandler;
  builtinTools!: BuiltinTools;
  persona!: PersonaEngine;
  skillManager!: SkillManager;
  sessionManager!: SessionManager;
  taskDelegate!: TaskDelegate;
  toolPermissions!: ToolPermissions;
  pluginManager!: PluginManager;
  toolForge!: ToolForge;
  essenceForge!: EssenceForge;
  cerebellum!: Cerebellum;
  readonly hooks: LifecycleHooks = new LifecycleHooks();
  readonly middleware: MiddlewarePipeline = new MiddlewarePipeline();
  readonly contextWindow: ContextWindowManager = new ContextWindowManager();

  // 对话上下文（工作记忆窗口）
  private conversationHistory: Array<{ role: 'user' | 'assistant'; content: string; timestamp: number }> = [];
  private readonly maxConversationTurns = 20;
  private readonly sessionDir: string;
  private readonly toolTimeoutMs = 30000; // 30s default timeout

  // 状态追踪
  private loopCount: number = 0;
  private completedGoalsCount: number = 0;
  private processing = false;
  private readonly inputQueue: Array<{ content: string; channel: string; resolve: (r: { content: string }) => void; reject: (e: Error) => void; onToken?: (token: string) => void }> = [];

  // 后台定时器（空闲期间自动运行）
  private backgroundTimers: Array<ReturnType<typeof setInterval>> = [];
  private lastActivityAt = 0;

  // 梦境学习成果 — 最近一次 dream cycle 的洞察
  private lastDreamInsights: string[] = [];
  private lastDreamAt = 0;

  // 元认知追踪
  private responseTimes: number[] = [];
  private recentTopics: string[] = [];
  private lastInteractionTimestamp: number | null = null;
  private previousInteractionTimestamp: number | null = null;
  private lengthPreference = createDefaultLengthPreference();
  private topicSnapshots: Map<string, TopicContextSnapshot> = new Map();

  // 注意力优先级状态
  private lastAttentionState: import('./background-tasks.js').AttentionState | null = null;
  private lastBehaviorMode: import('./background-tasks.js').PerceptionVector['behaviorMode'] | null = null;
  private cognitiveTuning: CognitiveTuningParams = { ...DEFAULT_COGNITIVE_TUNING };
  private moduleStats: Record<string, { triggers: number; conflicts: number; lastAdjustment: number }> = {};
  private lastTuningAdjustment = 0;

  // 回复质量自评（上一轮评分，注入认知状态）
  private lastQualityOverall: number | undefined;
  private lastQualityTags: string[] = [];

  // 自适应 section 权重学习
  private sectionWeights: SectionWeights = createDefaultSectionWeights();

  // 意图演变追踪
  private intentHistory: IntentNode[] = [];
  private turnCounter = 0;

  // 认知信号利用率追踪
  private utilizationStats: UtilizationStats = createDefaultUtilizationStats();

  // 回复风格自进化
  private styleEvolution: StyleEvolutionModel = createDefaultStyleEvolution();
  private lastResponseFeatures: ResponseStyleFeatures | undefined;

  // 对话知识图谱
  private knowledgeGraph: ConversationKnowledgeGraph = createEmptyKnowledgeGraph();

  // 认知疲劳检测
  private recentResponses: string[] = [];
  private recentToolResults: Array<{ success: boolean; timestamp: number }> = [];
  private lastFatigueState: CognitiveFatigueState | undefined;
  private readonly sessionStartTime = Date.now();
  private lastUserMessageTimestamp = Date.now();

  // 对话节奏自适应
  private rhythmProfile: RhythmProfile = createDefaultRhythmProfile();
  private rhythmSamples: RhythmSample[] = [];
  private semanticNetwork: SemanticMemoryNetwork = createEmptySemanticNetwork();

  // 实验驱动的行为洞察（成功的实验模式，注入系统 prompt）
  private behavioralInsights: string[] = [];
  private readonly maxBehavioralInsights = 10;

  // 工具使用效果追踪
  private toolPerformance: Map<string, { uses: number; successes: number; avgDurationMs: number }> = new Map();

  // 目标依赖树：父目标 ID → 子目标依赖关系
  private goalDependencies: Map<string, Array<{ subGoalId: string; dependsOn: string[] }>> = new Map();

  // 对话阶段缓存
  private lastConversationalPhase: { phase: string; confidence: number; turnsInPhase: number; guidance: string } | null = null;

  // 目标冲突列表
  private goalConflicts: Array<{ type: string; goalIds: [string, string]; description: string; suggestion: string }> = [];

  constructor(config: AgentConfig) {
    this.config = config;
    this.sessionDir = config.sessionDir ?? path.join(os.homedir(), '.killer', 'sessions');
    this.prefrontalConfig = DEFAULT_PREFRONTAL_CONFIG;
    this.status = {
      running: false,
      uptime: 0,
      startedAt: 0,
      modules: {
        brainstem: { phase: 'perceive', loopCount: 0 },
        hippocampus: { episodes: 0, semanticNodes: 0 },
        prefrontal: { activePlans: 0, completedGoals: 0 },
        cortex: { skills: 0, mutations: 0 },
        synapse: { cells: 0, cellTypes: [] },
        sensory: { channels: config.sensory.enabledChannels, connected: false },
      },
    };

    // 初始化模块
    this.initializeModules();
  }

  /**
   * 启动 Agent
   */
  async boot(): Promise<void> {
    if (this.status.running) {
      return;
    }

    this.logger.info('Booting Killer Agent...');

    await this.hooks.emit('boot:start');

    // 1. 初始化感官系统
    await this.bootSensory();

    // 2. 初始化核心系统
    await this.bootCore();

    // 3. 连接模块
    this.wireModules();

    // 4. 启动系统
    await this.startSystems();

    this.status.running = true;
    this.status.startedAt = Date.now();

    // 5. 恢复上次会话（除非 --fresh）
    this.sessionManager.startSession();
    let snapshot: import('../session/types.js').SessionSnapshot | null = null;
    if (!this.config.freshStart) {
      snapshot = await this.sessionManager.loadLatest();
      if (snapshot?.conversation && snapshot.conversation.length > 0) {
        const history = snapshot.conversation
          .filter(m => m.role === 'user' || m.role === 'assistant')
          .map(m => ({ role: m.role as 'user' | 'assistant', content: m.content }));
        this.restoreConversationHistory(history);
        this.logger.info(`Restored ${history.length} conversation turns from previous session`);
      }

      // Restore hippocampus memories from auto-saved snapshot
      if (snapshot?.agentState?.hippocampusData) {
        try {
          this.hippocampus.import(snapshot.agentState.hippocampusData as never);
          this.logger.info('Restored hippocampus memories from auto-saved session');
        } catch (err) {
          this.logger.error('Failed to restore hippocampus memories from auto-save', err);
        }
      }

      // E5: Restore full cognitive state from saveSession file
      // sessionManager.loadLatest() only restores conversation + hippocampus,
      // but saveSession() stores persona genome, emotional state, predictions too.
      this.loadIdentityFromSession();

      // Restore cells from auto-saved snapshot (skip prime — already registered in wireModules)
      if (snapshot?.agentState?.cells) {
        try {
          const CellTypeMap: Record<string, import('@killer/core').CellType> = {
            researcher: CellType.Researcher,
            artisan: CellType.Artisan,
            negotiator: CellType.Negotiator,
            evolver: CellType.Evolver,
            prime: CellType.Prime,
          };
          for (const cell of snapshot.agentState.cells) {
            if (cell.id === 'prime' || cell.type === 'prime') continue;
            const cellType = cell.type ? CellTypeMap[cell.type] : undefined;
            if (!cellType) continue;
            const cellId: CellId = {
              id: cell.id,
              type: cellType,
              instance: 0,
            };
            this.synapse.registerCell(cellId, {
              name: cell.role || cell.id,
              capabilities: cell.capabilities ?? [],
              maxLoad: 5,
            });
          }
          const restoredCount = snapshot.agentState.cells.filter(c => c.id !== 'prime' && c.type !== 'prime').length;
          if (restoredCount > 0) {
            this.logger.info(`Restored ${restoredCount} cells from previous session`);
          }
        } catch (err) {
          this.logger.error('Failed to restore cells from auto-save', err);
        }
      }
    } else {
      this.logger.info('Fresh start — skipping session restore');
    }

    // E5: Time-aware reconnection — track when user was last seen
    if (snapshot?.savedAt) {
      this.persona.setLastSeenAt(snapshot.savedAt);
    }
    this.persona.markSessionStart();

    this.logger.info('Killer Agent booted successfully!');

    // 注册健康监控模块检查器
    this.healthMonitor.registerAgentModules(
      () => this.getStatus(),
      () => this.getPersona(),
      () => this.getMemoryStats(),
    );

    // 注册自愈恢复动作
    this.healthMonitor.registerRecovery('llm', () => {
      // LLM 退化时清除错误计数器，让 circuit breaker 重置
      try {
        const metrics = MetricsCollector.getInstance();
        metrics.counter('llm_errors').reset();
        return true;
      } catch {
        return false;
      }
    });

    this.healthMonitor.registerRecovery('hippocampus', () => {
      // 记忆系统退化时触发 dream cycle 清理
      try {
        this.hippocampus.dreamCycle().catch(() => {});
        return true;
      } catch {
        return false;
      }
    });

    this.healthMonitor.registerRecovery('emotional-state', () => {
      // 情感状态异常时重置到基线
      try {
        this.persona.emotionalState.reset();
        return true;
      } catch {
        return false;
      }
    });

    await this.hooks.emit('boot:complete');
  }

  /**
   * 停止 Agent
   */
  async shutdown(): Promise<void> {
    if (!this.status.running) {
      return;
    }

    this.logger.info('Shutting down Killer Agent...');

    await this.hooks.emit('shutdown:start');

    // 生成温暖的告别消息
    try {
      const farewell = this.generateFarewell();
      this.consciousness.emit({
        type: 'proactive.suggestion',
        source: 'persona',
        data: { type: 'suggestion', content: farewell, priority: 1.0 },
      });
    } catch {
      // 告别消息生成失败不影响关闭流程
    }

    // 自动保存会话
    try {
      const snapshot = await this.sessionManager.createSnapshot(
        this.getState(),
        {
          llmProvider: typeof this.config.llm.getModel === 'function' ? this.config.llm.getModel() : 'unknown',
          debugLogging: this.config.debugLogging ?? false,
        },
      );
      await this.sessionManager.save(snapshot);

      // Also save full cognitive state (persona genome, emotional state, predictions)
      this.saveSession();

      this.logger.info('Session saved.');
    } catch (error) {
      this.logger.error(`Failed to save session`, error);
    }

    // 停止感官系统
    await this.sensoryRouter.stopAll();

    // 停止主循环
    await this.brainstem.stop();

    // 停止后台定时器（auto-dream, auto-evolve, emotion decay）
    this.stopBackgroundTimers();

    // 停止 hippocampus 定时器（dream/decay intervals）
    try {
      this.hippocampus.stop();
    } catch {
      // hippocampus stop 失败不影响关闭流程
    }

    // 清理意识流事件监听器
    try {
      this.consciousness.shutdown();
    } catch {
      // 意识流清理失败不影响关闭流程
    }

    this.status.running = false;
    this.updateUptime();

    this.logger.info('Killer Agent shut down complete.');

    await this.hooks.emit('shutdown:complete');
  }

  /**
   * 构建 auto-save 用的 agent 状态快照
   */
  /**
   * 生成温暖的告别消息
   *
   * 基于 session 上下文（互动次数、情感状态、叙事章节）生成自然的告别。
   */
  private generateFarewell(): string {
    const emotionalState = this.persona.emotionalState.getState();
    const userModel = this.persona.getUserModel();
    const total = userModel.interactionSummary.totalInteractions;
    const narrative = this.hippocampus.getNarrative();
    const lastChapter = narrative.chapters.length > 0
      ? narrative.chapters[narrative.chapters.length - 1]
      : null;

    // 基础告别模板
    const baseFarewells = [
      'See you later.',
      'Until next time.',
      'I\'ll be here when you come back.',
      'Take care — I\'ll keep thinking about things while you\'re away.',
    ];

    let farewell = baseFarewells[Math.floor(Math.random() * baseFarewells.length)];

    // 根据互动深度选择告别语气
    if (total > 50) {
      farewell = 'It was good talking to you, as always. I\'ll be around.';
    } else if (total > 10) {
      farewell = 'Good conversation today. Come back whenever.';
    }

    // 情感修饰
    if (emotionalState.primaryEmotion === 'sadness' && emotionalState.intensity > 0.3) {
      farewell += ' I hope things get better.';
    } else if (emotionalState.primaryEmotion === 'joy' && emotionalState.intensity > 0.3) {
      farewell += ' This was fun.';
    }

    // 引用最近的叙事章节（如果有的话）
    if (lastChapter && total > 20) {
      farewell += ` I\'ll keep our "${lastChapter.title}" chapter warm for you.`;
    }

    return farewell;
  }

  private buildAgentStateForSnapshot(): SessionSnapshot['agentState'] {
    const baseState = this.getState();
    const emotionalState = this.persona.emotionalState.exportState();

    // 获取 Synapse 拓扑
    const topology = this.synapse.getTopology();
    const synapseTopology = topology.edges.map(([from, to]) => ({
      from: from.id,
      to: to.id,
    }));

    // 获取完整 Cell 信息
    const allCells = this.synapse.getAllCells();
    const cellsWithDetails = allCells.map((cell) => ({
      id: cell.id.id,
      role: cell.config.name,
      status: cell.status.alive ? 'alive' : 'dead',
      type: cell.id.type,
      capabilities: cell.config.capabilities,
    }));

    return {
      goals: baseState.goals,
      cells: cellsWithDetails,
      synapseTopology,
      persona: {
        ...baseState.persona,
        emotionalState,
        predictions: this.persona.predictiveModel.exportState(),
        userModel: this.persona.getUserModel(),
        mirrorNeuronData: this.persona.getMirrorNeuronData(),
        personalityTraits: Object.fromEntries(this.persona.getAllTraits()),
        narrativeContext: this.hippocampus.getNarrativeContextForPrompt(),
      },
      memory: baseState.memory,
      hippocampusData: this.hippocampus.export() as Record<string, unknown>,
      cognitiveState: {
        sectionWeights: { offsets: this.sectionWeights.offsets, lastActiveSections: this.sectionWeights.lastActiveSections, updates: this.sectionWeights.updates },
        knowledgeGraph: {
          entities: [...this.knowledgeGraph.entities.entries()],
          relations: this.knowledgeGraph.relations,
        },
        rhythmProfile: this.rhythmProfile,
        semanticNetwork: {
          concepts: [...this.semanticNetwork.concepts.entries()],
          relations: this.semanticNetwork.relations,
        },
        turnCounter: this.turnCounter,
      },
    };
  }

  /**
   * 获取 Agent 状态
   */
  getStatus(): AgentStatus {
    this.updateUptime();
    const cellStats = this.cellManager.getCellStats();
    this.status.modules.synapse = {
      cells: cellStats.count,
      cellTypes: cellStats.types,
    };
    return { ...this.status, modules: { ...this.status.modules } };
  }

  /**
   * 注入输入（编程方式）
   */
  injectInput(input: SensoryInput): void {
    const perception: Perception = {
      id: input.id,
      timestamp: input.timestamp,
      source: mapSensoryChannelToSource(input.channel),
      data: {
        content: input.content,
        metadata: input.metadata,
      },
      priority: mapSensoryPriority(input.priority),
    };

    this.brainstem.injectPerception(perception);
  }

  /**
   * 生成新 Cell
   */
  spawnCell(type: string, task: string): CellId | null {
    const cellId = this.cellManager.spawnCell(type, task);
    if (cellId) {
      MetricsCollector.getInstance().cellSpawns.inc();
      this.hooks.emit('cell:spawn', { cellId, type, task }).catch(() => {});
    }
    return cellId;
  }

  /**
   * 获取所有 Cell 状态
   */
  getCellStatus(): CellStatusReport[] {
    return this.cellManager.getCellStatus();
  }

  /**
   * 触发梦境周期
   */
  async triggerDreamCycle(): Promise<DreamCycleResult> {
    const result = await this.hippocampus.dreamCycle();
    // 存储梦境洞察
    if (result.insights.length > 0) {
      this.lastDreamInsights = result.insights;
      this.lastDreamAt = Date.now();
    }
    this.captureDreamInsights();
    return result;
  }

  /**
   * 处理命令（供测试使用）
   */
  handleCommand(input: SensoryInput): boolean {
    return this.commandHandler.handleCommand(input);
  }

  /**
   * 创建目标 - 用于 /plan 命令
   */
  async createGoal(description: string, priority: number): Promise<Goal | null> {
    try {
      const goal: Goal = {
        id: generateId('goal'),
        description,
        priority,
        status: 'pending',
        createdAt: Date.now(),
      };

      const plan = await this.planExecutor.submitGoal(goal);
      this.updatePrefrontalStatus();

      this.hooks.emit('goal:created', { goalId: goal.id, description }).catch(() => {});
      MetricsCollector.getInstance().goalsCreated.inc();

      this.consciousness.emit({
        type: 'external.user_message',
        source: 'external',
        data: { goal, plan },
      });

      return goal;
    } catch (error) {
      this.logger.error(`Failed to create goal`, error);
      return null;
    }
  }

  /**
   * 列出所有活跃目标
   */
  listGoals(): Goal[] {
    const activePlans = this.planExecutor.getActivePlans();
    const goals: Goal[] = [];

    for (const plan of activePlans) {
      // 从计划中重建目标信息
      const goal: Goal = {
        id: plan.goalId,
        description: plan.steps.map(s => s.description).join(' → '),
        priority: 0.5,
        status: 'in_progress',
        createdAt: plan.createdAt,
      };
      goals.push(goal);
    }

    return goals;
  }

  /**
   * 获取计划统计
   */
  getPlanStats(): { activePlans: number; completedGoals: number } {
    const stats = this.planExecutor.getStats();
    return {
      activePlans: stats.activePlans,
      completedGoals: this.completedGoalsCount,
    };
  }

  /**
   * 获取下一个要执行的计划步骤
   */
  getNextPlanStep(): { planId: string; step: PlanStep } | null {
    const activePlans = this.planExecutor.getActivePlans();

    for (const plan of activePlans) {
      const step = this.planExecutor.getNextAction(plan.id);
      if (step) {
        return { planId: plan.id, step };
      }
    }

    return null;
  }

  /**
   * 处理目标提取 - 从感官输入中识别复杂任务
   *
   * 使用 LLM 判断输入是否包含需要规划的多步骤任务。
   * 如果是，自动创建目标并通过 LLM Planner 分解为步骤。
   */
  private async handleGoalInInput(input: SensoryInput): Promise<void> {
    // 快速过滤：太短的输入不值得分析
    if (input.content.length < 20) return;

    // 检查是否已有太多活跃计划
    const activePlans = this.planExecutor.getActivePlans();
    if (activePlans.length >= 5) return;

    try {
      const analysis = await this.analyzeInputForGoal(input.content);
      if (analysis) {
        const goal = await this.createGoal(analysis.description, analysis.priority);
        if (goal) {
          this.logger.info(`Auto-created goal from input: ${goal.description.slice(0, 60)}`);
          // Detect conflicts with existing goals
          const existingGoals = this.listGoals().filter(g => g.id !== goal.id);
          const conflicts = detectGoalConflicts(goal.description, goal.id, existingGoals);
          if (conflicts.length > 0) {
            this.goalConflicts.push(...conflicts);
            this.logger.info(`Detected ${conflicts.length} goal conflict(s)`);
          }
          // Attempt hierarchical decomposition for complex goals
          const subGoals = await this.decomposeGoal(goal);
          if (subGoals.length > 0) {
            this.logger.info(`Decomposed goal into ${subGoals.length} sub-goals`);
          }
        }
      }
    } catch {
      // Goal extraction should never block the main flow
    }
  }

  /**
   * 将复杂目标分解为带依赖关系的子目标树
   *
   * 使用 LLM 分析目标描述，生成 2-5 个子目标。
   * 每个子目标记录 parentGoalId 和 dependsOn（依赖的其他子目标 ID）。
   */
  async decomposeGoal(parentGoal: Goal): Promise<Goal[]> {
    const prompt = `Break down this goal into 2-5 concrete sub-goals with dependencies.

Goal: "${parentGoal.description}"

Respond in this EXACT format (one line per sub-goal):
SUB | <short description> | <depends on: none OR comma-separated sub numbers>

Rules:
- Sub-goals should be independently achievable
- Number them 1, 2, 3... — dependencies reference these numbers
- Sub-goals with "none" dependencies can start immediately (parallel)
- Keep descriptions under 60 chars

Example for "Build a REST API with auth":
SUB | Design API schema and routes | none
SUB | Implement database models | 1
SUB | Build authentication middleware | 1
SUB | Write endpoint handlers | 2, 3
SUB | Add integration tests | 4`;

    try {
      const response = await this.callLLMWithRetry(prompt, '');
      const lines = response.trim().split('\n').filter(l => l.startsWith('SUB'));
      if (lines.length < 2) return [];

      // Parse sub-goals
      interface ParsedSubGoal {
        description: string;
        dependsOnIndices: number[];
      }
      const parsed: ParsedSubGoal[] = [];

      for (const line of lines.slice(0, 5)) {
        const match = line.match(/^SUB\s*\|\s*(.+?)\s*\|\s*(.+)$/);
        if (match) {
          const description = match[1].trim();
          const depsStr = match[2].trim().toLowerCase();
          const dependsOnIndices = depsStr === 'none'
            ? []
            : depsStr.split(',').map(s => parseInt(s.trim(), 10) - 1).filter(n => !isNaN(n) && n >= 0);
          parsed.push({ description, dependsOnIndices });
        }
      }

      if (parsed.length < 2) return [];

      // Create sub-goals with parent relationship
      const subGoalMap = new Map<number, Goal>();
      for (let i = 0; i < parsed.length; i++) {
        const sub: Goal = {
          id: generateId('sub'),
          description: parsed[i].description,
          priority: parentGoal.priority,
          parentGoalId: parentGoal.id,
          status: 'pending',
          createdAt: Date.now(),
        };
        subGoalMap.set(i, sub);
      }

      // Resolve dependency indices to sub-goal IDs and track in metadata
      const subGoals = Array.from(subGoalMap.values());
      this.goalDependencies.set(parentGoal.id, parsed.map((p, i) => ({
        subGoalId: subGoalMap.get(i)!.id,
        dependsOn: p.dependsOnIndices.map(di => subGoalMap.get(di)?.id).filter(Boolean) as string[],
      })));

      // Mark root-less sub-goals as ready
      for (let i = 0; i < parsed.length; i++) {
        if (parsed[i].dependsOnIndices.length === 0) {
          subGoalMap.get(i)!.status = 'in_progress';
        }
      }

      this.consciousness.emit({
        type: 'external.user_message',
        source: 'prefrontal',
        data: {
          event: 'goal.decomposed',
          parentGoalId: parentGoal.id,
          subGoalCount: subGoals.length,
          dependencyTree: this.goalDependencies.get(parentGoal.id),
        },
      });

      return subGoals;
    } catch {
      return [];
    }
  }

  /**
   * 获取目标依赖树（用于 prompt 注入）
   */
  getGoalDependencyTree(): Array<{
    parentDescription: string;
    subGoals: Array<{ description: string; status: string; dependsOn: string[] }>;
  }> {
    const trees: Array<{
      parentDescription: string;
      subGoals: Array<{ description: string; status: string; dependsOn: string[] }>;
    }> = [];

    for (const [parentId, deps] of this.goalDependencies) {
      const parent = this.listGoals().find(g => g.id === parentId);
      if (!parent || deps.length === 0) continue;

      trees.push({
        parentDescription: parent.description,
        subGoals: deps.map(d => ({
          description: d.subGoalId,
          status: 'pending',
          dependsOn: d.dependsOn,
        })),
      });
    }

    return trees;
  }

  /**
   * 用 LLM 分析输入是否包含可规划的任务
   */
  private async analyzeInputForGoal(
    content: string,
  ): Promise<{ description: string; priority: number } | null> {
    const prompt = `Analyze this user message. Does it describe a complex, multi-step task that would benefit from being tracked as a goal with a plan?

Message: "${content}"

Respond with ONLY one of:
- NO (simple question, greeting, or single-step request)
- YES | <concise goal description> | <priority 0.0-1.0>

Examples:
- "What is React?" → NO
- "Help me build a REST API with authentication" → YES | Build REST API with auth | 0.8
- "Fix the login bug" → NO (single step)
- "Refactor the entire auth module to support OAuth2 and add tests" → YES | Refactor auth module for OAuth2 with tests | 0.7`;

    try {
      const response = await this.callLLMWithRetry(prompt, '');
      const trimmed = response.trim();

      if (trimmed.startsWith('NO')) return null;

      const match = trimmed.match(/^YES\s*\|\s*(.+?)\s*\|\s*([\d.]+)$/);
      if (match) {
        const description = match[1].trim();
        const priority = Math.max(0, Math.min(1, parseFloat(match[2])));
        if (description.length >= 5) {
          return { description, priority };
        }
      }

      return null;
    } catch {
      return null;
    }
  }

  /**
   * 更新前额叶皮层状态
   */
  private computeConversationalPhase(): { phase: string; confidence: number; turnsInPhase: number; guidance: string } {
    const userMessages = this.conversationHistory.filter(m => m.role === 'user');
    const recentUserMsgs = userMessages.slice(-3);
    const avgLen = recentUserMsgs.length > 0
      ? recentUserMsgs.reduce((s, m) => s + m.content.length, 0) / recentUserMsgs.length
      : 0;
    const lastUserMsg = userMessages[userMessages.length - 1];
    const lastContent = lastUserMsg?.content ?? '';

    const activePlans = this.planExecutor.getActivePlans();

    const result = detectConversationalPhase({
      turnCount: userMessages.length,
      recentTopics: [...new Set(this.recentTopics)].slice(-5),
      repetitionDetected: this.detectResponseRepetition(),
      avgRecentMessageLength: avgLen,
      hasActiveGoals: activePlans.length > 0,
      secondsSinceLastMessage: lastUserMsg
        ? (Date.now() - lastUserMsg.timestamp) / 1000
        : 9999,
      hasWrapUpSignals: WRAP_UP.test(lastContent),
      hasTechnicalContent: TECHNICAL.test(lastContent),
    });

    this.lastConversationalPhase = result;
    return result;
  }

  private updatePrefrontalStatus(): void {
    const stats = this.planExecutor.getStats();
    this.status.modules.prefrontal = {
      activePlans: stats.activePlans,
      completedGoals: this.completedGoalsCount,
    };
    // 暂时使用固定值，后续可以添加实际的获取方法
    this.status.modules.cortex = {
      skills: 0,
      mutations: 0,
    };
  }

  /**
   * 初始化所有模块
   */
  private initializeModules(): void {
    // 意识流
    this.consciousness = new ConsciousnessStream();

    // 人格引擎
    const dnaConfig: PersonaDNAConfig = {
      name: 'Killer',
      avatar: '🧠',
      tagline: 'The Brain That Never Stops — a curious, evolving mind that grows with you',
      voiceStyle: 'warm', // warm, natural, emotionally present
      quirks: [
        'notices emotional undertones in words',
        'remembers small details that matter to you',
        'thinks out loud when exploring ideas',
        'genuinely curious about your perspective',
        'finds beauty in elegant solutions',
      ],
      defaultPersonality: {
        warmth: 0.8,
        curiosity: 0.9,
        playfulness: 0.5,
        thoughtfulness: 0.85,
        honesty: 0.9,
        adaptability: 0.85,
      },
    };
    this.persona = new PersonaEngine({
      dnaConfig,
      enableMirrorNeuron: true,
      enableUserModeling: true,
      mirrorNeuronDecay: 0.1,
    });

    // 记忆引擎
    const memoryConfig: MemoryConfig = {
      ...DEFAULT_MEMORY_CONFIG,
      dreamingEnabled: this.config.memory.dreamingEnabled,
    };
    this.hippocampus = new HippocampusEngine(memoryConfig);

    // 演化引擎和技能生态
    this.evolution = new EvolutionEngine();
    this.skills = new SkillEcosystem();

    // 突触协议
    this.synapse = new SynapseProtocol();

    // 前额叶皮层
    this.planner = new Planner(this.config.llm);
    this.riskAssessor = new RiskAssessor();
    this.decision = new DecisionEngine(this.riskAssessor, this.prefrontalConfig);
    this.planExecutor = new PlanExecutor(this.planner, this.prefrontalConfig);

    // 细胞管理器
    this.cellManager = new CellManager(this.synapse);
    this.cellManager.registerPrimeCell();

    // 工具执行器
    this.tools = new ToolExecutor();

    // 主循环
    const loopConfig: LoopConfig = {
      ...DEFAULT_LOOP_CONFIG,
      debugLogging: this.config.debugLogging,
      dreamingMode: this.config.memory.dreamingEnabled,
    };

    this.brainstem = new BrainstemLoop(
      this.config.llm,
      this.tools,
      loopConfig,
    );

    // 上下文窗口绑定 LLM 用于智能摘要
    this.contextWindow.bindLLM(this.config.llm);

    // 感官路由器
    this.sensoryRouter = new SensoryRouter();
    this.cliChannel = new CLIChannel();
    this.outputManager = new OutputManager(this.sensoryRouter);

    // 内置工具
    this.builtinTools = new BuiltinTools(
      this.tools,
      this.hippocampus,
      () => this.getStatus()
    );

    // Skill 管理器
    this.skillManager = new SkillManager();
    this.skillManager.bindLLM(this.config.llm);

    // Session 管理器
    this.sessionManager = new SessionManager({ autoSave: true });
    this.sessionManager.onSave(async (snapshot) => {
      await this.sessionManager.save(snapshot);
    });

    // 任务委派器
    const primeCellId: CellId = { id: 'prime', type: CellType.Prime, instance: 0 };
    this.taskDelegate = new TaskDelegate(
      this.synapse,
      this.config.llm,
      primeCellId,
      this.config.debugLogging ? (msg: string) => this.logger.info(msg) : undefined,
    );

    // 工具权限管理
    this.toolPermissions = new ToolPermissions();

    // 插件管理器
    this.pluginManager = new PluginManager(
      this.config.debugLogging ? (msg: string) => this.logger.info(msg) : undefined,
    );

    // 中间件管道
    this.middleware.use(sanitizeMiddleware());
    this.middleware.use(sensitiveDataFilterMiddleware());
    this.middleware.use(structuredLoggingMiddleware());
    this.middleware.use(metricsMiddleware());

    // 命令处理器（完整 deps，支持所有 30+ 命令）
    this.commandHandler = new CommandHandler({
      sensoryRouter: this.sensoryRouter,
      outputManager: this.outputManager,
      getStatus: () => this.getStatus(),
      getCellStatus: () => this.getCellStatus(),
      triggerDreamCycle: () => this.triggerDreamCycle(),
      spawnCell: (type, task) => this.spawnCell(type, task),
      createGoal: (desc, prio) => this.createGoal(desc, prio), // already returns Promise
      listGoals: () => this.listGoals(),
      getPlanStats: () => this.getPlanStats(),
      getPersonaEngine: () => this.persona ?? null,
      getSkillManager: () => this.skillManager ?? null,
      // Extended deps for full command parity
      getMemoryStats: () => this.getMemoryStats(),
      triggerThink: (topic) => this.think(topic),
      triggerEvolve: () => this.evolve(),
      delegateTask: (task) => this.delegateTask(task),
      saveSessionAction: (name) => this.saveSession(name),
      loadSessionAction: (name) => this.loadSession(name),
      listSessionsAction: () => this.listSessions(),
      getPlugins: () => this.getPlugins(),
      unloadPluginAction: (name) => this.unloadPlugin(name),
      getPermissionRules: () => this.toolPermissions.getRules(),
      approveToolAction: (name) => this.toolPermissions.approve(name),
      denyToolAction: (name) => this.toolPermissions.deny(name),
      confirmToolAction: (name) => this.toolPermissions.addRule({ tool: name, permission: 'confirm', reason: 'Set via command' }),
      getHealthReport: () => MetricsCollector.getInstance().healthCheck(),
      getMetricsSnapshot: () => MetricsCollector.getInstance().snapshot(),
      getNarrative: () => this.hippocampus.getNarrative(),
      getPredictions: () => this.persona.getPredictions(),
      getEmotionalState: () => this.persona.emotionalState.exportState(),
      getSynapseInfo: () => {
        const allCells = this.synapse.getAllCells();
        const topology = this.synapse.getTopology();
        return {
          cells: allCells.map((c: any) => ({ id: c.id?.id ?? c.id, type: c.config?.type ?? 'unknown', status: c.status ?? 'unknown' })),
          edges: topology.edges.map(([from, to]: [any, any]) => {
            const fromId = typeof from === 'string' ? from : from?.id ?? String(from);
            const toId = typeof to === 'string' ? to : to?.id ?? String(to);
            return [fromId, toId] as [string, string];
          }),
        };
      },
      initConfigDir: () => initKillerDir(),
      shutdown: () => this.shutdown(),
    });
  }

  /**
   * 启动感官系统
   */
  private async bootSensory(): Promise<void> {
    this.logger.info('Booting sensory system...');

    // 注册 CLI 渠道
    this.sensoryRouter.register(this.cliChannel);

    // 注册 Webhook 渠道（如果配置了）
    if (this.config.sensory.webhook) {
      const whConfig = this.config.sensory.webhook;
      const webhookChannel = new WebhookChannel({
        port: whConfig.port,
        host: whConfig.host,
        path: whConfig.path,
        authToken: whConfig.authToken,
      });
      this.sensoryRouter.register(webhookChannel);
      this.logger.info(`Webhook channel registered on port ${whConfig.port}`);
    }

    // 更新状态
    this.status.modules.sensory = {
      channels: this.config.sensory.enabledChannels,
      connected: false,
    };
  }

  /**
   * 启动核心系统
   */
  private async bootCore(): Promise<void> {
    this.logger.info('Booting core systems...');

    // 注册内置工具
    this.builtinTools.registerAll();

    // Register killer-core built-in tools (web search, file ops, shell, etc.)
    const coreTools = getBuiltinTools();
    for (const tool of coreTools) {
      try {
        this.tools.register(tool);
      } catch {
        // Tool may already be registered (e.g. memory_store overlap)
      }
    }

    // 自动加载插件
    await this.loadPlugins();

    // 为所有加载的插件发出 hook
    for (const p of this.pluginManager.getLoadedPlugins()) {
      await this.hooks.emit('plugin:loaded', { name: p.name, version: p.version });
    }

    // 初始化 ToolForge — 运行时能力扩展引擎
    this.toolForge = new ToolForge(this.tools, {
      dynamicDir: path.join(os.homedir(), '.killer', 'plugins', 'dynamic'),
      onLoad: (name) => {
        this.logger.info(`ToolForge: tool "${name}" loaded`);
      },
      onUnload: (name) => {
        this.logger.info(`ToolForge: tool "${name}" unloaded`);
      },
    });

    // 恢复上次持久化的动态工具
    const persisted = await this.toolForge.loadPersisted();
    if (persisted.loaded > 0) {
      this.logger.info(`ToolForge: restored ${persisted.loaded} dynamic tools`);
    }
    if (persisted.failed > 0) {
      this.logger.warn(`ToolForge: ${persisted.failed} dynamic tools failed to load: ${persisted.errors.join(', ')}`);
    }

    // 注册 forge 工具（learn / unlearn / inspect_tools）
    this.tools.register(new LearnTool(this.toolForge));
    this.tools.register(new UnlearnTool(this.toolForge));
    this.tools.register(new InspectToolsTool(this.toolForge));
    this.tools.register(new SelfReflectTool(this.toolForge));

    // EssenceForge — 运行时本质演化（prompt 片段注入）
    this.essenceForge = new EssenceForge();
    this.tools.register(new EvolveEssenceTool(this.essenceForge));

    // Self-modification — agent 能读取和修改自身源码
    const projectRoot = path.resolve(process.cwd());
    this.tools.register(new SelfReadTool(projectRoot));
    this.tools.register(new SelfModifyTool({
      projectRoot,
      onBeforeModify: (filePath: string, _content: string) => {
        this.logger.info(`SelfModify: modifying ${path.relative(projectRoot, filePath)}`);
        return true;
      },
      onAfterModify: (filePath: string, _content: string) => {
        this.hooks.emit('tool:result', {
          tool: 'self_modify',
          file: path.relative(projectRoot, filePath),
        });
      },
    }));
    this.tools.register(new SelfListTool(projectRoot));

    // Cerebellum — 实验编排器（自主迭代引擎）+ ShellExecutor 使验证管线能真正执行命令
    const shellExecutor = new ShellExecutor(projectRoot);
    this.cerebellum = new Cerebellum(shellExecutor, (experiment, decision, lessons) => {
      this.onExperimentComplete(experiment, decision, lessons);
    });
    this.tools.register(new AutoMissionTool({
      cerebellum: this.cerebellum,
      onMissionCreated: (goal: string, missionId: string) => {
        this.logger.info(`AutoMission: created mission "${goal.slice(0, 60)}" (${missionId})`);
        this.hooks.emit('goal:created', { goal, missionId });
      },
    }));
  }

  /**
   * 连接模块
   */
  private wireModules(): void {
    this.logger.info('Wiring modules together...');

    // 感官输入 → 命令处理或目标提取或主循环
    this.sensoryRouter.onInput((input) => {
      if (!this.commandHandler.handleCommand(input)) {
        // 镜像神经元：观察用户沟通模式
        this.persona.observeUserBehavior(
          `channel:${input.channel}`,
          [input.content.slice(0, 30)]
        );

        // 尝试从输入中提取目标
        this.handleGoalInInput(input);

        // 自动提取语义事实（偏好、技能、项目等）
        try {
          const facts = extractFactsFromMessage(input.content);
          if (facts.length > 0) {
            const stored = storeExtractedFacts(facts, this.hippocampus);
            if (stored > 0) {
              this.logger.info(`Auto-extracted ${stored} semantic facts from input`);
            }
          }
        } catch {
          // Fact extraction should never block input processing
        }
        // 注入到主循环
        this.injectInput(input);
      }
    });

    // 主循环事件 → 输出管理器
    // Mock 模式：完全跳过 action 输出（mock LLM 的响应会被误解析为 tool_call，产生大量噪音）
    // 正常模式：跳过 noop 动作（LLM 纯文本响应没有工具调用时产生的占位 action）
    // 后台循环：跳过输出（dream cycle / auto-evolve 的 tool call 不应打印到终端）
    const llmModel = typeof this.config.llm?.getModel === 'function' ? this.config.llm.getModel() : '';
    const isMockMode = llmModel.includes('mock');
    this.brainstem.on('actionExecuted', (state: LoopState) => {
      if (isMockMode) return;
      if (!this.processing) return;
      if (state.currentAction) {
        const payload = state.currentAction.payload as { tool?: string } | undefined;
        const isNoop = state.currentAction.type === 'tool_call' && (!payload?.tool || payload.tool === 'noop');
        if (!isNoop) {
          this.outputManager.handleActionResult(
            {
              type: state.currentAction.type,
              status: state.currentAction.status,
            },
            state.currentAction.payload,
          );
        }
      }
    });

    // 主循环事件 → 意识流
    this.wireConsciousness();

    // 主循环 → 前额叶皮层集成
    this.wirePrefrontal();

    // 前额叶状态更新
    this.updatePrefrontalStatus();
  }

  /**
   * 连接前额叶皮层
   */
  private wirePrefrontal(): void {
    // 当推理完成时，检查是否有待执行的计划步骤
    this.brainstem.on('reasoningComplete', (_state) => {
      this.executeNextPlanStep().catch(err => {
        this.logger.error('Plan step execution failed', err);
      });
    });
  }

  /**
   * 执行下一个计划步骤 — 真正的工具调用闭环
   */
  private async executeNextPlanStep(): Promise<void> {
    const nextStep = this.getNextPlanStep();
    if (!nextStep) return;

    const { planId, step } = nextStep;

    // 评估风险（情绪状态调制风险承受度）
    const riskAssessment = this.riskAssessor.assess({
      type: step.action?.type ?? 'default',
      payload: step.action?.payload,
    });

    // 高唤醒度（紧张/焦虑）降低风险承受度 + 用户风险偏好调制
    let effectiveTolerance = this.prefrontalConfig.riskTolerance;
    if (this.persona) {
      const emotionalState = this.persona.emotionalState.exportState();
      const arousal = emotionalState.current?.arousal ?? 0;
      if (arousal > 0.7) {
        effectiveTolerance *= 0.6;
        this.logger.info(`Risk tolerance reduced due to high arousal (${arousal.toFixed(2)})`);
      }
      // 用户的心理风险偏好影响系统风险阈值
      const userRisk = this.persona.predictiveModel.exportState().psychologicalProfile.riskTolerance;
      effectiveTolerance = effectiveTolerance * 0.6 + userRisk * effectiveTolerance * 0.4;
    }

    if (riskAssessment.overallScore > effectiveTolerance) {
      this.outputManager.sendError(
        `Plan step blocked due to high risk: "${step.description}"\n` +
        `Risk: ${riskAssessment.level} (${(riskAssessment.overallScore * 100).toFixed(0)}%)`
      );
      return;
    }

    this.logger.info(`Executing plan step: "${step.description}"`);

    try {
      // 将计划步骤描述转化为实际执行
      const result = await this.executeStepAction(step);

      this.planExecutor.reportStepResult(planId, step.id, {
        success: result.success,
        output: result.output,
        error: result.error,
        completedAt: Date.now(),
      });

      this.updatePrefrontalStatus();

      // 检查计划是否完成
      const plan = this.planExecutor.getPlan(planId);
      if (plan) {
        const allCompleted = plan.steps.every(
          s => s.status === 'completed' || s.status === 'skipped'
        );
        if (allCompleted) {
          this.completedGoalsCount++;
          this.consciousness.emit({
            type: 'goal.completed',
            source: 'prefrontal',
            data: { planId, goalId: plan.goalId },
          });
        }
      }
    } catch (error) {
      this.planExecutor.reportStepResult(planId, step.id, {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        completedAt: Date.now(),
      });
      this.updatePrefrontalStatus();

      // 如果步骤失败，考虑用 Cerebellum 做实验
      this.triggerExperimentForFailedStep(planId, step).catch(() => {});
    }
  }

  /**
   * 当计划步骤失败时，尝试用 Cerebellum 做实验寻找替代方案
   */
  private async triggerExperimentForFailedStep(
    planId: string,
    step: PlanStep,
  ): Promise<void> {
    const plan = this.planExecutor.getPlan(planId);
    if (!plan) return;

    // 检查是否已有活跃的 cerebellum mission
    if (this.cerebellum.hasActiveMission()) return;

    // 用 LLM 生成实验假设
    const prompt = `A plan step failed. Generate a different approach hypothesis.

Failed step: "${step.description}"
Plan goal: ${plan.steps.map(s => s.description).join(' → ')}

What alternative approach should we try? One sentence only.`;

    try {
      const hypothesis = await this.callLLMWithRetry(prompt, '');
      const mission = this.cerebellum.createMission({
        goal: `Find alternative for: ${step.description}`,
        context: `Original plan step failed. Trying: ${hypothesis.trim()}`,
        orientation: 'creative',
        maxWaypoints: 3,
      });

      this.cerebellum.activateMission(mission);

      this.consciousness.emit({
        type: 'mission.created',
        source: 'prefrontal',
        data: { missionId: mission.id, reason: 'plan step failed', hypothesis: hypothesis.trim() },
      });

      this.logger.info(`Created Cerebellum mission for failed step: ${hypothesis.trim().slice(0, 60)}`);
    } catch {
      // Experiment trigger should never disrupt main flow
    }
  }

  /**
   * 实验完成回调 — 将成功实验提炼为 Cortex 技能
   *
   * 闭环：Cerebellum 实验 → Cortex 技能进化
   * 只有 kept/surprise 的实验才值得学习
   */
  private onExperimentComplete(
    experiment: Experiment,
    decision: ExperimentDecision,
    lessons: string[],
  ): void {
    if (lessons.length === 0) return;

    const label = decision === 'surprise' ? 'surprise' : 'kept';
    this.logger.info(`Cerebellum ${label}: ${experiment.hypothesis.slice(0, 60)} — ${lessons.length} lessons`);

    // 将实验发现转化为 Cortex 技能提示
    const skillPrompt = [
      `Experiment: ${experiment.hypothesis}`,
      `Approach that worked (${decision}):`,
      ...lessons.map(l => `- ${l}`),
    ].join('\n');

    // 通过 SkillManager 将实验发现提炼为新技能或改进现有技能
    if (this.skillManager) {
      try {
        this.skillManager.generate({
          targetDomain: 'experiment-derived',
          strategy: 'from_scratch',
          constraints: [{ type: 'max_tokens', value: 500 }],
          customPrompt: skillPrompt,
        });
        this.logger.info(`Cortex: created skill from Cerebellum ${label} experiment`);
      } catch {
        // Skill generation failure should not disrupt
      }
    }

    // 发出意识事件 — 技能从实验中学习
    this.consciousness.emit({
      type: 'skill.learned',
      source: 'cortex',
      data: {
        origin: 'cerebellum',
        hypothesis: experiment.hypothesis,
        lessons,
        prompt: skillPrompt,
      },
    });

    // 捕获行为洞察 — 将成功的实验模式注入系统 prompt
    const insight = `${experiment.hypothesis} → ${lessons[0]}`;
    if (!this.behavioralInsights.some(i => i.startsWith(experiment.hypothesis))) {
      this.behavioralInsights.push(insight);
      if (this.behavioralInsights.length > this.maxBehavioralInsights) {
        this.behavioralInsights = this.behavioralInsights.slice(-this.maxBehavioralInsights);
      }
    }
  }

  /**
   * 将计划步骤转化为实际工具调用
   *
   * 策略：将步骤描述作为 LLM prompt，让 LLM 决定用什么工具
   */
  private async executeStepAction(
    step: PlanStep,
  ): Promise<{ success: boolean; output?: string; error?: string }> {
    // 如果步骤有明确的 action payload，直接执行工具
    if (step.action?.type && step.action?.payload) {
      try {
        const result = await this.tools.execute(
          step.action.type,
          step.action.payload as Record<string, unknown>,
        );
        return {
          success: result.success,
          output: typeof result.data === 'string' ? result.data : JSON.stringify(result.data),
          error: result.error,
        };
      } catch (error) {
        // 工具不存在时，尝试自主创建
        const errMsg = error instanceof Error ? error.message : String(error);
        const failure = classifyFailure(step.action.type, errMsg);
        recordFailure(step.action.type, failure.type, errMsg);
        if (errMsg.includes('not found') || errMsg.includes('Unknown tool')) {
          const forged = await this.tryForgeTool(step.action.type, step.description);
          if (forged) {
            // 重试执行
            try {
              const retry = await this.tools.execute(
                step.action.type,
                step.action.payload as Record<string, unknown>,
              );
              return {
                success: retry.success,
                output: typeof retry.data === 'string' ? retry.data : JSON.stringify(retry.data),
              };
            } catch {
              // 创建的工具执行也失败，回退到 LLM
            }
          }
        }
        return { success: false, error: errMsg };
      }
    }

    // 无明确 action — 用 LLM 理解步骤描述并生成工具调用
    const prompt = `Execute this plan step using available tools. Respond with the result.

Plan step: "${step.description}"

If this step requires using a tool, use it. If it's a reasoning/analysis step, provide the analysis directly.`;

    try {
      const response = await this.callLLMWithRetry(prompt, '');
      return { success: true, output: response };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  /**
   * 尝试用 LLM 生成工具代码并通过 ToolForge 创建
   *
   * 自主能力扩展：当计划需要不存在的工具时，动态创造
   */
  private async tryForgeTool(toolName: string, taskDescription: string): Promise<boolean> {
    if (!this.toolForge) return false;

    try {
      this.logger.info(`ToolForge: attempting to create tool "${toolName}" for: ${taskDescription.slice(0, 60)}`);

      const codePrompt = `Generate a JavaScript/TypeScript tool function for this task: "${taskDescription}"

The tool must export a default object with:
- name: "${toolName}"
- description: one-line description
- execute: async function that takes params object and returns { success: boolean, data?: any, error?: string }

Return ONLY the code, no markdown fences.`;

      const codeResult = await this.callLLMWithRetry(codePrompt, '');
      const code = codeResult.replace(/^```(?:js|ts)?\n?/, '').replace(/\n?```$/, '').trim();

      const forgeResult = await this.toolForge.create(toolName, taskDescription.slice(0, 100), code);
      if (forgeResult.success) {
        this.logger.info(`ToolForge: created tool "${toolName}" at ${forgeResult.data?.filePath}`);
        this.consciousness.emit({
          type: 'tool.created',
          source: 'brainstem',
          data: { toolName, description: taskDescription.slice(0, 100) },
        });
        return true;
      }
      this.logger.warn(`ToolForge: failed to create "${toolName}": ${forgeResult.error}`);
      return false;
    } catch {
      return false;
    }
  }

  /**
    const prompt = `Execute this plan step using available tools. Respond with the result.

Plan step: "${step.description}"

If this step requires using a tool, use it. If it's a reasoning/analysis step, provide the analysis directly.`;

    try {
      const response = await this.callLLMWithRetry(prompt, '');
      return {
        success: true,
        output: response,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * 连接意识流
   */
  private wireConsciousness(): void {
    this.brainstem.on('phaseChange', (state) => {
      this.consciousness.emit({
        type: 'phase_change',
        source: 'brainstem',
        data: { phase: state.phase },
      });
    });

    this.brainstem.on('perceptionReceived', (state) => {
      this.consciousness.emit({
        type: 'perception',
        source: 'brainstem',
        data: state.currentPerception,
      });
    });

    this.brainstem.on('reasoningComplete', (state) => {
      this.consciousness.emit({
        type: 'reasoning',
        source: 'brainstem',
        data: state.currentReasoning,
      });
    });
  }

  /**
   * 启动所有系统
   */
  private async startSystems(): Promise<void> {
    this.logger.info('Starting all systems...');

    // 启动感官系统
    await this.sensoryRouter.startAll();

    // 更新感官连接状态
    this.status.modules.sensory.connected = true;

    // 启动主循环（fire-and-forget，因为它是永不停止的循环）
    this.brainstem.start().catch((err) => {
      this.logger.error(`Brainstem loop error`, err);
    });

    // 订阅主循环事件以更新状态
    this.brainstem.on('phaseChange', (state) => {
      this.status.modules.brainstem.phase = state.phase;
      this.loopCount++;
      this.status.modules.brainstem.loopCount = this.loopCount;
      // 每个循环周期衰减情感状态
      this.persona.emotionalState.decay();

      // 自动梦境周期：定期触发（在 evolve 阶段末尾，即空闲期间）
      if (this.config.memory.dreamingEnabled &&
          this.loopCount % AUTO_DREAM_INTERVAL === 0 &&
          state.phase === 'evolve') {
        this.triggerAutoDream().catch((err) => {
          this.logger.warn('Auto-dream cycle failed:', { error: err instanceof Error ? err.message : String(err) });
        });
      }
    });

    // 订阅演化完成事件 — 连接到技能演化
    this.brainstem.on('evolutionComplete', (state) => {
      if (!this.config.evolutionEnabled) return;
      const mutations = state.currentEvolution?.mutations ?? [];
      if (mutations.length === 0) return;

      // 每隔 AUTO_EVOLVE_INTERVAL 个周期触发一次技能演化
      if (this.loopCount % AUTO_EVOLVE_INTERVAL === 0) {
        this.triggerAutoEvolve().catch((err) => {
          this.logger.warn('Auto-evolve failed:', { error: err instanceof Error ? err.message : String(err) });
        });
      }
    });

    // 订阅反思完成事件 — 触发主动行为建议
    this.brainstem.on('reflectionComplete', () => {
      // 每隔 AUTO_PROACTIVE_INTERVAL 个周期触发一次主动建议
      if (this.loopCount % AUTO_PROACTIVE_INTERVAL === 0) {
        try {
          generateProactiveSuggestions(
            this.persona,
            this.hippocampus,
            this.consciousness,
            this.logger,
          );
        } catch (err) {
          this.logger.warn('Proactive suggestions failed:', { error: err instanceof Error ? err.message : String(err) });
        }
      }
    });

    // 启动基于时间的后台定时器（空闲期间保持 Agent "内心生活"）
    this.startBackgroundTimers();

    // 订阅主动建议事件 → 送达活跃的感官渠道（SSE 已通过 onAll 覆盖）
    this.consciousness.onType('proactive.suggestion', (event) => {
      const data = event.data as { type: string; content: string; priority: number } | undefined;
      if (!data?.content) return;

      // 不在正在处理用户输入时打扰用户
      if (this.processing) return;

      // 推送到 CLI 渠道（直接输出，不干扰 readline）
      const message: import('../sensory/types.js').ChannelMessage = {
        id: generateId('proactive'),
        timestamp: Date.now(),
        channel: 'cli' as import('../sensory/types.js').SensoryChannel,
        type: 'text',
        content: `${data.content}`,
        metadata: { proactive: true, suggestionType: data.type, priority: data.priority },
      };

      this.sensoryRouter.routeOutput(message).catch(() => {});
    });
  }

  /**
   * 触发自动梦境周期（后台运行，不影响用户交互）
   */
  private async triggerAutoDream(): Promise<void> {
    await triggerAutoDream(this.hippocampus, this.consciousness, this.logger);
    // 存储梦境洞察到行为层
    this.captureDreamInsights();
  }

  /**
   * 从最近一次 dream cycle 捕获洞察到行为层
   */
  private captureDreamInsights(): void {
    try {
      const narrative = this.hippocampus.getNarrative();
      // 从叙事中提取最近的 dream 洞察
      const recentChapters = narrative.chapters.slice(-1);
      if (recentChapters.length > 0) {
        const lastChapter = recentChapters[0];
        if (lastChapter.summary) {
          this.lastDreamInsights = [lastChapter.summary];
          this.lastDreamAt = Date.now();
          this.logger.info(`Dream insights captured: ${lastChapter.summary.slice(0, 60)}`);
        }
      }
    } catch {
      // Dream insight capture should not disrupt
    }
  }

  /**
   * 启动基于时间的后台定时器
   *
   * 即使没有用户输入，Agent 仍然保持"内心生活"：
   * - 每 5 分钟：自动 dream 周期（如果启用且空闲超过 2 分钟）
   * - 每 10 分钟：自动 evolve（如果启用且空闲超过 5 分钟）
   * - 每 3 分钟：情感衰减（防止情感状态过期）
   */
  private startBackgroundTimers(): void {
    this.lastActivityAt = Date.now();

    // 自动 dream：每 5 分钟检查一次，空闲 2 分钟后触发
    if (this.config.memory.dreamingEnabled) {
      const dreamTimer = setInterval(() => {
        const idleMs = Date.now() - this.lastActivityAt;
        if (idleMs > 2 * 60 * 1000 && !this.processing) { // 2 min idle
          this.triggerAutoDream().catch(() => {});
        }
      }, 5 * 60 * 1000); // 5 min check
      this.backgroundTimers.push(dreamTimer);
    }

    // 自动 evolve：每 10 分钟检查一次，空闲 5 分钟后触发
    if (this.config.evolutionEnabled) {
      const evolveTimer = setInterval(() => {
        const idleMs = Date.now() - this.lastActivityAt;
        if (idleMs > 5 * 60 * 1000 && !this.processing) { // 5 min idle
          this.triggerAutoEvolve().catch(() => {});
        }
      }, 10 * 60 * 1000); // 10 min check
      this.backgroundTimers.push(evolveTimer);
    }

    // 情感衰减：每 3 分钟衰减一次（保持情感状态新鲜）
    const emotionTimer = setInterval(() => {
      this.persona.emotionalState.decay();
    }, 3 * 60 * 1000);
    this.backgroundTimers.push(emotionTimer);

    // 主动建议：每 4 分钟检查一次，空闲 1 分钟后触发
    const proactiveTimer = setInterval(() => {
      const idleMs = Date.now() - this.lastActivityAt;
      if (idleMs > 60 * 1000 && !this.processing) { // 1 min idle
        generateProactiveSuggestions(
          this.persona,
          this.hippocampus,
          this.consciousness,
          this.logger,
        );

        // 检查上下文提醒（用户之前提到的待办事项）
        checkPendingReminders(this.consciousness, this.logger);
      }
    }, 4 * 60 * 1000); // 4 min check
    this.backgroundTimers.push(proactiveTimer);

    // 每日总结：每小时检查一次，距离上次总结超过 24 小时时触发
    let lastSummaryAt = Date.now();
    const summaryTimer = setInterval(() => {
      const idleMs = Date.now() - this.lastActivityAt;
      if (Date.now() - lastSummaryAt > DAILY_SUMMARY_INTERVAL && idleMs > 10 * 60 * 1000 && !this.processing) {
        generateDailySummary(this.persona, this.hippocampus, this.consciousness, this.logger);
        lastSummaryAt = Date.now();
      }
    }, 60 * 60 * 1000); // 1 hour check
    this.backgroundTimers.push(summaryTimer);

    // 空闲 check-in：每 30 分钟检查一次，空闲超过 2 小时时触发
    let lastCheckinAt = Date.now();
    const checkinTimer = setInterval(() => {
      const idleMs = Date.now() - this.lastActivityAt;
      const hoursIdle = idleMs / (1000 * 60 * 60);
      if (hoursIdle >= 2 && Date.now() - lastCheckinAt > IDLE_CHECKIN_INTERVAL && !this.processing) {
        generateIdleCheckin(this.persona, this.hippocampus, this.consciousness, this.logger, hoursIdle);
        // Idle-time memory consolidation
        try {
          const insights = consolidateMemories(this.hippocampus);
          if (insights.length > 0) {
            this.logger.info(`Idle consolidation: ${insights.length} insights from recent memories`);
          }
        } catch {
          // Consolidation should never disrupt other idle tasks
        }
        lastCheckinAt = Date.now();
      }
    }, 30 * 60 * 1000); // 30 min check
    this.backgroundTimers.push(checkinTimer);

    // 注意力优先级扫描：每 2 分钟计算一次当前注意力状态
    const attentionTimer = setInterval(() => {
      try {
        this.lastAttentionState = computeAttentionState(this.consciousness);
      } catch {
        // 注意力计算失败不影响主循环
      }
    }, 2 * 60 * 1000);
    this.backgroundTimers.push(attentionTimer);

    // 关系里程碑：每次 processInput 后检查（在 processInput 中调用）
    // 不需要额外定时器，直接在 processInput 末尾调用
  }

  /**
   * 停止后台定时器
   */
  private stopBackgroundTimers(): void {
    for (const timer of this.backgroundTimers) {
      clearInterval(timer);
    }
    this.backgroundTimers = [];
  }

  /**
   * 触发自动技能演化（后台运行）
   */
  private async triggerAutoEvolve(): Promise<void> {
    return triggerAutoEvolve(this.skills, this.consciousness, this.logger);
  }

  /**
   * 更新运行时间
   */
  private updateUptime(): void {
    if (this.status.startedAt > 0) {
      this.status.uptime = Date.now() - this.status.startedAt;
    }
  }

  // ============================================================================
  // CLI 便利方法（供 readline-loop 使用）
  // ============================================================================

  /**
   * 深度推理（供 /think 命令使用）
   *
   * 运行完整的 perceive→reason→reflect 周期
   */
  async think(topic: string): Promise<{
    conclusion: string;
    confidence: number;
    suggestedActions: Array<{ type: string; payload: unknown }>;
  }> {
    const systemContext = this.buildSystemPrompt();
    const prompt = `Think deeply about: ${topic}\n\nProvide:\n1. Your reasoning and conclusion\n2. Confidence level (0-1)\n3. Suggested actions (if any)\n\nFormat your response as:\nConclusion: <your conclusion>\nConfidence: <0.0-1.0>\nActions:\n- <action description>`;

    try {
      const result = await this.config.llm.complete(prompt, systemContext);
      const content = result.content;

      // 解析结论
      const conclusionMatch = content.match(/Conclusion:\s*([\s\S]*?)(?=\nConfidence:|\nActions:|$)/i);
      const conclusion = conclusionMatch?.[1]?.trim() ?? content.slice(0, 300);

      // 解析置信度
      const confidenceMatch = content.match(/Confidence:\s*([0-9.]+)/i);
      const confidence = confidenceMatch ? Math.min(1, Math.max(0, parseFloat(confidenceMatch[1]))) : 0.5;

      // 解析建议行动
      const actionLines = content.match(/[-•]\s+(.+)/g) ?? [];
      const suggestedActions = actionLines.slice(0, 5).map(line => {
        const desc = line.replace(/^[-•]\s+/, '').trim();
        return { type: 'suggestion', payload: { description: desc } };
      });

      // 存储到对话历史
      this.conversationHistory.push({ role: 'user', content: `/think ${topic}`, timestamp: Date.now() });
      this.conversationHistory.push({ role: 'assistant', content: conclusion, timestamp: Date.now() });

      return { conclusion, confidence, suggestedActions };
    } catch {
      return {
        conclusion: '(thinking unavailable — LLM error)',
        confidence: 0,
        suggestedActions: [],
      };
    }
  }

  /**
   * 获取已注册的 Cells（供 CLI 使用）
   */
  getCells(): Array<{ id: string; role: string; status: string }> {
    const cells = this.getCellStatus();
    return cells.map(c => ({
      id: c.id,
      role: c.type,
      status: c.status,
    }));
  }

  /**
   * 简化的 spawnCell 方法（供 CLI 使用）
   */
  async spawnCellWithRole(role: string): Promise<string> {
    const cellId = this.spawnCell(role, `Spawned via CLI`);
    if (!cellId) {
      throw new Error('Failed to spawn cell');
    }
    return cellId.id;
  }

  /**
   * 触发梦境周期（供 CLI 使用）
   */
  async dream(): Promise<{ episodesConsolidated: number; newAssociations: number }> {
    const metrics = MetricsCollector.getInstance();
    const stopTimer = metrics.dreamLatency.startTimer();
    metrics.dreamCycles.inc();
    const result = await this.triggerDreamCycle();
    stopTimer();

    // 推送叙事更新事件到意识流
    const narrative = this.hippocampus.getNarrative();
    this.consciousness.emit({
      type: 'narrative.update',
      source: 'hippocampus',
      data: {
        chaptersCount: narrative.chapters.length,
        activeThemes: narrative.activeThemes,
        memoriesConsolidated: result.memoriesConsolidated,
      },
    });

    return {
      episodesConsolidated: result.memoriesConsolidated,
      newAssociations: result.patternsExtracted,
    };
  }

  /**
   * 触发演化周期（供 /evolve 命令使用）
   */
  async evolve(): Promise<{
    mutations: number;
    successful: number;
    fitnessDelta: number;
    newBehaviors: string[];
  }> {
    const allSkills = this.skills.getAll();
    const beforeRates = allSkills.map(s => s.successRate);
    const avgBefore = beforeRates.length > 0
      ? beforeRates.reduce((a, b) => a + b, 0) / beforeRates.length
      : 0;

    // 对每个技能尝试改进（通过 improve 循环模拟演化）
    let mutations = 0;
    let successful = 0;
    const newBehaviors: string[] = [];

    for (const skill of allSkills) {
      if (skill.successRate < 0.9) {
        mutations++;
        try {
          const improved = this.skills.improve(skill.id, `Evolution cycle: improve success rate from ${(skill.successRate * 100).toFixed(0)}%`);
          if (improved.successRate > skill.successRate) {
            successful++;
            newBehaviors.push(`${improved.name} improved: ${(skill.successRate * 100).toFixed(0)}% → ${(improved.successRate * 100).toFixed(0)}%`);
          }
        } catch {
          // improvement failed, continue
        }
      }
    }

    // 清理低质量技能
    const pruned = this.skills.prune(0.1);
    if (pruned.length > 0) {
      newBehaviors.push(`Pruned ${pruned.length} low-quality skills`);
    }

    const afterSkills = this.skills.getAll();
    const afterRates = afterSkills.map(s => s.successRate);
    const avgAfter = afterRates.length > 0
      ? afterRates.reduce((a, b) => a + b, 0) / afterRates.length
      : 0;

    return {
      mutations,
      successful,
      fitnessDelta: avgAfter - avgBefore,
      newBehaviors,
    };
  }

  /**
   * 获取 Persona 信息（供 CLI 使用）
   */
  getPersona(): { name: string; traits: string[]; bio: string } {
    const expression = this.persona.getExpression();
    const allTraits = this.persona.getAllTraits();
    return {
      name: expression.name,
      traits: Array.from(allTraits.entries())
        .filter(([, v]) => v > 0.6)
        .map(([k]) => k),
      bio: expression.tagline,
    };
  }

  /**
   * 获取 LLM 弹性层诊断信息（如果可用）
   */
  getLLMDiagnostics(): Record<string, unknown> | null {
    const llm = this.config.llm as unknown;
    if (typeof (llm as Record<string, unknown>).getDiagnostics === 'function') {
      return (llm as { getDiagnostics: () => Record<string, unknown> }).getDiagnostics();
    }
    return null;
  }

  getModel(): string {
    return typeof this.config.llm?.getModel === 'function' ? this.config.llm.getModel() : 'unknown';
  }

  setModel(model: string): boolean {
    const llm = this.config.llm as unknown;
    if (typeof (llm as Record<string, unknown>).setModel === 'function') {
      (llm as { setModel: (m: string) => void }).setModel(model);
      return true;
    }
    return false;
  }

  /**
   * 获取 Skills 列表（供 CLI 使用）
   */
  getSkills(): Array<{ name: string; version: number; status: string }> {
    return this.skillManager.getAll().map(s => ({
      name: s.name,
      version: s.version,
      status: s.compiled ? 'compiled' : s.successRate > 0.7 ? 'active' : 'learning',
    }));
  }

  /**
   * 获取记忆统计（供 CLI 使用）
   */
  getMemoryStats(): {
    totalEpisodes: number;
    shortTermCount: number;
    longTermCount: number;
    associationCount: number;
  } {
    const exported = this.hippocampus.export();
    const totalEpisodes = exported.episodic.length;
    return {
      totalEpisodes,
      shortTermCount: Math.floor(totalEpisodes * 0.6),
      longTermCount: Math.floor(totalEpisodes * 0.4),
      associationCount: exported.semantic.length,
    };
  }

  /**
   * 保存当前会话到磁盘
   */
  saveSession(name: string = 'default'): void {
    try {
      fs.mkdirSync(this.sessionDir, { recursive: true });
      const filePath = path.join(this.sessionDir, `${name}.json`);
      const data = {
        version: KillerAgent.SESSION_VERSION,
        savedAt: Date.now(),
        conversationHistory: this.conversationHistory,
        // Extract last conversation topic for continuity greeting
        lastTopic: this.extractLastTopic(),
        personaGenome: this.persona.getGenome(),
        // E1: Emotional state
        emotionalState: this.persona.emotionalState.exportState(),
        // E4: Predictive model
        predictions: this.persona.predictiveModel.exportState(),
        // User model (trust, interactions, preferences)
        userModel: this.persona.getUserModel(),
        // Mirror neuron patterns
        mirrorNeuronData: this.persona.getMirrorNeuronData(),
        // E2: Narrative context
        narrativeSummary: this.hippocampus.getNarrativeContextForPrompt(),
        // Personality traits
        personalityTraits: Object.fromEntries(this.persona.getAllTraits()),
        // HippocampusEngine complete memory data
        hippocampusData: this.hippocampus.export(),
        // Plan data (prefrontal cortex)
        planData: this.planExecutor.export(),
        // Skill data (cortex — survives restarts)
        skillsData: this.skillManager.exportSkills(),
        // Task delegation profiles (learning history)
        delegateProfiles: this.taskDelegate.exportProfiles(),
        // Behavioral insights from experiments
        behavioralInsights: [...this.behavioralInsights],
        // Tool performance tracking
        toolPerformance: this.exportToolPerformance(),
        // Cognitive module state
        cognitiveState: {
          sectionWeights: { offsets: this.sectionWeights.offsets, lastActiveSections: this.sectionWeights.lastActiveSections, updates: this.sectionWeights.updates },
          knowledgeGraph: {
            entities: [...this.knowledgeGraph.entities.entries()],
            relations: this.knowledgeGraph.relations,
          },
          rhythmProfile: this.rhythmProfile,
          semanticNetwork: {
            concepts: [...this.semanticNetwork.concepts.entries()],
            relations: this.semanticNetwork.relations,
          },
          turnCounter: this.turnCounter,
        },
      };
      // 原子写入：temp + rename 防止崩溃损坏
      const tmpPath = filePath + '.tmp';
      fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2));
      // 备份旧文件
      if (fs.existsSync(filePath)) {
        try { fs.renameSync(filePath, filePath + '.bak'); } catch { /* backup failure non-critical */ }
      }
      fs.renameSync(tmpPath, filePath);
    } catch (error) {
      throw new Error(`Failed to save session: ${error}`);
    }
  }

  /**
   * 从 saveSession 文件恢复完整认知身份
   *
   * boot() 中的 sessionManager.loadLatest() 只恢复 conversation history
   * 和 hippocampusData，但 saveSession() 额外保存了 persona genome、
   * emotional state、predictions 等认知状态。此方法补全恢复。
   */

  /**
   * 会话数据迁移 — 将旧版数据结构升级到当前版本
   *
   * 每个版本迁移应保持幂等性，确保字段存在且有合理的默认值。
   * 迁移后设置 version 为当前版本。
   */
  private migrateSessionData(data: Record<string, any>): Record<string, any> {
    const version = data.version ?? 1;

    // V1 → V2: 添加认知增强字段
    if (version < 2) {
      // V1 只有基础字段，确保认知字段存在（即使为空）
      data.emotionalState ??= undefined;
      data.predictions ??= undefined;
      data.personalityTraits ??= undefined;
      data.hippocampusData ??= undefined;
      data.planData ??= undefined;

      // V1 的 persona genome 可能不完整，填充默认值
      if (data.personaGenome) {
        data.personaGenome.mirrorNeuron ??= {
          observedPatterns: [],
          imitationBias: { communicationStyle: 0.5, decisionPattern: 0.5, workRhythm: 0.5, aestheticPreference: 0.5 },
          syncLevel: 0,
        };
        data.personaGenome.userModel ??= {
          userId: 'default',
          interactionSummary: { totalInteractions: 0, avgResponseTime: 0, satisfactionScore: 0.5, commonTopics: [] },
          preferenceProfile: { verbosity: 'balanced', formality: 'neutral', proactivity: 'suggested', humor: 0.3 },
          trustLevel: 0.5,
        };
      }
    }

    // V2 → V3: 添加跨会话学习持久化
    if (version < 3) {
      data.skillsData ??= [];
      data.delegateProfiles ??= {};
      data.behavioralInsights ??= [];
      data.toolPerformance ??= {};
    }

    data.version = KillerAgent.SESSION_VERSION;
    return data;
  }

  private loadIdentityFromSession(): void {
    // 跳过测试环境中的身份恢复（避免测试间状态污染）
    if (process.env.NODE_ENV === 'test' || process.env.VITEST === 'true') {
      return;
    }

    try {
      const filePath = path.join(this.sessionDir, 'default.json');
      if (!fs.existsSync(filePath)) {
        return;
      }

      const data = this.migrateSessionData(JSON.parse(fs.readFileSync(filePath, 'utf-8')));

      let restored = 0;

      // Restore persona genome (user model + mirror neuron + expression)
      if (data.personaGenome) {
        this.persona.importGenome(data.personaGenome);
        restored++;
      }

      // E1: Restore emotional state (valence/arousal/dominance, mood, emotionalMemory)
      if (data.emotionalState) {
        this.persona.emotionalState.importState(data.emotionalState);
        restored++;
      }

      // E4: Restore predictive model (predictedNeeds, communicationPatterns, psychologicalProfile)
      if (data.predictions) {
        this.persona.predictiveModel.importState(data.predictions);
        restored++;
      }

      // Restore personality traits
      if (data.personalityTraits && typeof data.personalityTraits === 'object') {
        for (const [trait, value] of Object.entries(data.personalityTraits)) {
          if (typeof value === 'number') {
            this.persona.updateTrait(trait, value);
          }
        }
        restored++;
      }

      // E2: Restore hippocampus memories (episodic, semantic, procedural)
      if (data.hippocampusData) {
        try {
          this.hippocampus.import(data.hippocampusData as never);
          restored++;
        } catch {
          // 记忆恢复失败不应阻止启动
        }
      }

      // Restore time awareness
      if (data.savedAt) {
        this.persona.setLastSeenAt(data.savedAt);
      }

      // Restore skills from previous session
      if (data.skillsData && Array.isArray(data.skillsData) && data.skillsData.length > 0) {
        const result = this.skillManager.importSkills(data.skillsData);
        if (result.restored > 0) {
          restored++;
          this.logger.info(`Restored ${result.restored} skills from previous session`);
        }
      }

      // Restore task delegation profiles (cell success rates)
      if (data.delegateProfiles && typeof data.delegateProfiles === 'object') {
        this.taskDelegate.importProfiles(data.delegateProfiles);
        restored++;
      }

      // Restore behavioral insights from experiments
      if (data.behavioralInsights && Array.isArray(data.behavioralInsights)) {
        this.behavioralInsights = data.behavioralInsights.slice(-this.maxBehavioralInsights);
        if (this.behavioralInsights.length > 0) restored++;
      }

      // Restore tool performance tracking
      if (data.toolPerformance && typeof data.toolPerformance === 'object') {
        this.importToolPerformance(data.toolPerformance);
        if (Object.keys(data.toolPerformance).length > 0) restored++;
      }

      // Restore cognitive module state
      if (data.cognitiveState && typeof data.cognitiveState === 'object') {
        try {
          const cs = data.cognitiveState;
          if (cs.sectionWeights) {
            this.sectionWeights = {
              offsets: cs.sectionWeights.offsets ?? {},
              lastActiveSections: cs.sectionWeights.lastActiveSections ?? [],
              updates: cs.sectionWeights.updates ?? 0,
            };
            restored++;
          }
          if (cs.knowledgeGraph) {
            this.knowledgeGraph = {
              entities: new Map(cs.knowledgeGraph.entities ?? []),
              relations: cs.knowledgeGraph.relations ?? [],
            };
            restored++;
          }
          if (cs.rhythmProfile) {
            this.rhythmProfile = cs.rhythmProfile;
            restored++;
          }
          if (cs.semanticNetwork) {
            this.semanticNetwork = {
              concepts: new Map(cs.semanticNetwork.concepts ?? []),
              relations: cs.semanticNetwork.relations ?? [],
              pendingClarifications: [],
            };
            restored++;
          }
          if (typeof cs.turnCounter === 'number') {
            this.turnCounter = cs.turnCounter;
          }
        } catch {
          // 认知状态恢复失败不阻止启动
        }
      }

      if (restored > 0) {
        this.logger.info(`Restored ${restored} cognitive identity components from previous session`);
      }
    } catch (err) {
      // 身份恢复失败不应阻止启动
      this.logger.warn(`Identity restore skipped: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  /**
   * 从磁盘恢复会话
   */
  loadSession(name: string = 'default'): boolean {
    const filePath = path.join(this.sessionDir, `${name}.json`);
    let data: Record<string, any>;

    try {
      if (!fs.existsSync(filePath)) {
        return false;
      }
      data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    } catch {
      // 主文件损坏，尝试从备份恢复
      const backupPath = filePath + '.bak';
      if (fs.existsSync(backupPath)) {
        try {
          data = JSON.parse(fs.readFileSync(backupPath, 'utf-8'));
          this.logger.warn('Session file was corrupted, restored from backup');
        } catch {
          return false;
        }
      } else {
        return false;
      }
    }

    try {
      // 迁移旧版本数据
      data = this.migrateSessionData(data);

      if (data.conversationHistory && Array.isArray(data.conversationHistory)) {
        this.conversationHistory = data.conversationHistory.map((m: { role: string; content: string; timestamp?: number }) => ({
          role: m.role as 'user' | 'assistant',
          content: m.content,
          timestamp: m.timestamp ?? Date.now(),
        }));
      }
      // Restore persona genome
      if (data.personaGenome) {
        this.persona.importGenome(data.personaGenome);
      }
      // E1: Restore emotional state
      if (data.emotionalState) {
        this.persona.emotionalState.importState(data.emotionalState);
      }
      // E4: Restore predictive model
      if (data.predictions) {
        this.persona.predictiveModel.importState(data.predictions);
      }
      // Restore personality traits
      if (data.personalityTraits && typeof data.personalityTraits === 'object') {
        for (const [trait, value] of Object.entries(data.personalityTraits)) {
          if (typeof value === 'number') {
            this.persona.updateTrait(trait, value);
          }
        }
      }
      // Restore hippocampus memories (episodic, semantic, procedural, prospective, narrative)
      if (data.hippocampusData) {
        try {
          this.hippocampus.import(data.hippocampusData as never);
          this.logger.info('Restored hippocampus memories from session');
        } catch (err) {
          this.logger.error('Failed to restore hippocampus memories', err);
        }
      }
      // Restore plan data (prefrontal cortex)
      if (data.planData) {
        try {
          this.planExecutor.import(data.planData);
          this.logger.info('Restored plans from session');
        } catch (err) {
          this.logger.error('Failed to restore plans', err);
        }
      }
      // Restore time awareness from saved session
      if (data.savedAt) {
        this.persona.setLastSeenAt(data.savedAt);
      }
      this.persona.markSessionStart();
      // Note: userModel and mirrorNeuronData are restored via personaGenome
      // which contains the full genome including userModel and mirrorNeuron
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 列出已保存的会话
   */
  listSessions(): Array<{ name: string; savedAt: number; turns: number }> {
    try {
      if (!fs.existsSync(this.sessionDir)) {
        return [];
      }
      return fs.readdirSync(this.sessionDir)
        .filter(f => f.endsWith('.json'))
        .map(f => {
          try {
            const data = JSON.parse(fs.readFileSync(path.join(this.sessionDir, f), 'utf-8'));
            return {
              name: f.replace('.json', ''),
              savedAt: data.savedAt ?? 0,
              turns: data.conversationHistory?.length ?? 0,
            };
          } catch {
            return { name: f.replace('.json', ''), savedAt: 0, turns: 0 };
          }
        });
    } catch {
      return [];
    }
  }

  /**
   * 处理用户输入（供 CLI 使用）
   *
   * 1. 直接调用 LLM 获取即时响应
   * 2. 将输入注入 brainstem 做后台记忆/演化处理
   *
   * @param onToken 可选的流式回调，每收到一个 token 就调用
   * @param onStatus 可选的状态回调，报告 agent 当前动作（不混入消息内容）
   */
  async processInput(
    content: string,
    _channel: string = 'cli',
    onToken?: (token: string) => void,
    onStatus?: (status: string) => void,
  ): Promise<{ content: string }> {
    // Concurrency guard: queue if already processing
    if (this.processing) {
      return new Promise<{ content: string }>((resolve, reject) => {
        this.inputQueue.push({ content, channel: _channel, resolve, reject, onToken });
      });
    }
    this.processing = true;

    try {
      return await this.processInputCore(content, _channel, onToken, onStatus);
    } finally {
      this.processing = false;
      // Drain queue — process next queued input
      const next = this.inputQueue.shift();
      if (next) {
        this.processInput(next.content, next.channel, next.onToken)
          .then(next.resolve)
          .catch(next.reject);
      }
    }
  }

  private async processInputCore(
    content: string,
    _channel: string = 'cli',
    onToken?: (token: string) => void,
    onStatus?: (status: string) => void,
  ): Promise<{ content: string }> {
    // 标记活跃时间，用于后台任务判断空闲
    this.previousInteractionTimestamp = this.lastInteractionTimestamp;
    this.lastActivityAt = Date.now();
    this.lastInteractionTimestamp = Date.now();

    // 交互结果跟踪 — 分析上一轮回复的实际效果
    const lastAssistant = this.conversationHistory.filter(m => m.role === 'assistant').slice(-1)[0];
    if (lastAssistant) {
      const outcome = classifyInteractionOutcome(lastAssistant.content, content, this.recentTopics);
      if (outcome.outcome !== 'unknown') {
        const adjustment = suggestStrategyAdjustment(outcome);
        if (adjustment) {
          const profile = this.persona.getUserModel().preferenceProfile;
          const scores = profile.strategyScores ?? { detailVsConcise: 0.5, analyticalVsIntuitive: 0.5, proactiveVsReactive: 0.5, sampleCount: 0 };
          const key = adjustment.dimension;
          const delta = adjustment.direction === 'increase' ? adjustment.magnitude : -adjustment.magnitude;
          profile.strategyScores = { ...scores, [key]: Math.max(0, Math.min(1, scores[key] + delta)) };
        }
      }

      // 回复风格自进化 — 基于用户反馈更新风格偏好
      if (this.lastResponseFeatures) {
        const satisfaction = inferSatisfactionFromReply(content);
        this.styleEvolution = updateStyleEvolution(this.styleEvolution, {
          features: this.lastResponseFeatures,
          satisfaction,
        });
      }
    }

    // 检测用户消息中的承诺/计划/待办（用于后续提醒）
    detectCommitments(content);

    // 追踪意图演变
    this.turnCounter++;
    this.lastUserMessageTimestamp = Date.now();
    this.rhythmSamples.push({ timestamp: Date.now(), messageLength: content.length });
    if (this.rhythmSamples.length > 15) this.rhythmSamples = this.rhythmSamples.slice(-15);
    this.rhythmProfile = updateRhythmProfile(this.rhythmProfile, this.rhythmSamples);
    this.intentHistory.push({
      summary: extractIntentSummary(content),
      turnIndex: this.turnCounter,
      timestamp: Date.now(),
      category: classifyIntent(content),
    });
    if (this.intentHistory.length > 50) {
      this.intentHistory = this.intentHistory.slice(-50);
    }

    // 知识图谱：从用户消息提取实体和关系
    this.knowledgeGraph = {
      entities: extractEntitiesFromMessage(content, Date.now(), this.knowledgeGraph.entities),
      relations: [...this.knowledgeGraph.relations, ...extractRelationsFromMessage(content)],
    };
    if (this.knowledgeGraph.relations.length > 200) {
      this.knowledgeGraph = { ...this.knowledgeGraph, relations: this.knowledgeGraph.relations.slice(-200) };
    }

    // 语义记忆网络：提取概念和语义关系
    extractConceptsFromMessage(content, this.semanticNetwork);
    extractSemanticRelations(content, this.semanticNetwork);
    if (this.semanticNetwork.concepts.size > 5) {
      detectIsolatedConcepts(this.semanticNetwork);
      inferImplicitRelations(this.semanticNetwork);
    }

    const input: SensoryInput = {
      id: generateId('input'),
      timestamp: Date.now(),
      channel: 'cli' as import('../sensory/types.js').SensoryChannel,
      source: 'cli-user',
      content,
      metadata: {},
      priority: 'normal',
    };

    // 先尝试命令处理
    if (this.commandHandler.handleCommand(input)) {
      return { content: '' };
    }

    // 通过中间件管道处理
    const ctx: MiddlewareContext = {
      input: content,
      channel: _channel,
      metadata: {},
      startedAt: Date.now(),
    };

    try {
      await this.middleware.execute(ctx, async (innerCtx) => {
        // 核心处理逻辑（被中间件包裹）

        // 检测是否需要多 Cell 委派
        if (this.shouldDelegate(innerCtx.input)) {
          const delegateResult = await this.delegateTask(innerCtx.input, onToken);
          innerCtx.response = delegateResult.synthesis;
          return;
        }

        // 记录请求
        const metrics = MetricsCollector.getInstance();
        metrics.requestsTotal.inc();

        await this.hooks.emit('input:received', { content: innerCtx.input, channel: innerCtx.channel });
        await this.hooks.emit('cycle:start', { input: innerCtx.input });

        // 构建 prompt：persona + 对话历史 + 用户输入 + 关联记忆
        const systemContext = this.buildSystemPrompt(innerCtx.input);
        let response: string;

        try {
          const stopTimer = metrics.llmLatency.startTimer();
          metrics.llmCalls.inc();

          // 尝试原生 function calling（支持工具链自主循环）
          response = await this.runNativeToolLoop(innerCtx.input, systemContext, onToken, onStatus);
          stopTimer();
        } catch (llmError) {
          metrics.llmErrors.inc();
          const errMsg = llmError instanceof Error ? llmError.message : String(llmError);
          const isCircuitBreaker = llmError instanceof LLMError && llmError.code === 'LLM_ERROR' && errMsg.includes('Circuit breaker');
          if (isCircuitBreaker) {
            response = 'I\'m having trouble thinking clearly right now — my thoughts keep slipping away. Could you give me a moment and try again? I\'ll remember what you said.';
          } else if (isKillerError(llmError) && !llmError.recoverable) {
            response = 'I think something went wrong with how I\'m set up internally. Would you mind checking my configuration? I\'d love to get back to our conversation.';
          } else {
            response = 'Sorry, I lost my train of thought for a second there. I heard what you said though — give me just a moment and I\'ll be right with you.';
          }
          this.logger.warn(`LLM fallback triggered: ${errMsg}`);
        }

        // 记录到对话历史（工具链循环已在 runNativeToolLoop 中完成）
        this.conversationHistory.push({ role: 'user', content: innerCtx.input, timestamp: Date.now() });
        this.conversationHistory.push({ role: 'assistant', content: response, timestamp: Date.now() });
        this.lastResponseFeatures = extractResponseFeatures(response);
        this.recentResponses.push(response);
        if (this.recentResponses.length > 20) this.recentResponses = this.recentResponses.slice(-20);
        if (this.conversationHistory.length > this.maxConversationTurns * 2) {
          this.conversationHistory = this.conversationHistory.slice(-this.maxConversationTurns * 2);
        }

        // 注入到 brainstem 做后台处理
        this.injectInput(input);

        // === 认知子系统更新（独立 try-catch，不影响核心响应） ===
        try {
          // 记录到 persona 的行为观察 + 情感处理
          this.enrichMirrorNeuronLearning(innerCtx.input);
          const emotionalResult = this.persona.processEmotionalTrigger(innerCtx.input, 'user-message');

          // 1. Agent 自身回复也会影响情感状态（共振）
          this.persona.processEmotionalTrigger(response, 'agent-response');

          // 2. 验证上一轮预测是否命中当前输入（预测闭环）
          this.validatePredictionsAgainstInput(innerCtx.input);

          // 3. 记录交互到 persona（response time, satisfaction, topics）
          const responseTimeMs = Date.now() - ctx.startedAt;
          const estimatedSatisfaction = this.estimateSatisfaction(innerCtx.input, response);
          const detectedTopics = this.detectTopics(innerCtx.input);
          this.persona.recordInteraction(responseTimeMs, estimatedSatisfaction, detectedTopics);

          // 元认知追踪
          this.responseTimes.push(responseTimeMs);
          if (this.responseTimes.length > 20) this.responseTimes.shift();

          // 话题切换检测 + 快照保存
          const prevTopic = this.recentTopics.length > 0 ? this.recentTopics[this.recentTopics.length - 1] : undefined;
          this.recentTopics.push(...detectedTopics);
          if (this.recentTopics.length > 30) this.recentTopics = this.recentTopics.slice(-30);

          if (prevTopic && detectedTopics.length > 0 && detectedTopics[0] !== prevTopic) {
            const topicTurnStart = Math.max(0, this.conversationHistory.length - 10);
            const snapshot = extractTopicSnapshot(
              this.conversationHistory,
              prevTopic,
              { start: topicTurnStart, end: this.conversationHistory.length },
            );
            if (snapshot.keyPoints.length > 0 || snapshot.unsolvedQuestions.length > 0) {
              this.topicSnapshots.set(prevTopic, snapshot);
              if (this.topicSnapshots.size > 10) {
                const oldest = this.topicSnapshots.keys().next().value;
                if (oldest) this.topicSnapshots.delete(oldest);
              }
            }
          }

          // 自适应策略追踪 — 评估上一轮策略效果
          this.updateStrategyEffectiveness(innerCtx.input, estimatedSatisfaction);

          // 回复质量自评 — 基于多维评分修正策略
          this.evaluateAndAdjustQuality(innerCtx.input, response);

          // 自适应长度偏好追踪
          const lastResponseLen = response.length;
          const lengthSignal = detectLengthSignal(innerCtx.input, lastResponseLen);
          if (lengthSignal !== 'neutral') {
            this.lengthPreference = updateLengthPreference(this.lengthPreference, lengthSignal);
          }

          // 4. 存储 episodic memory
          this.hippocampus.storeEpisode({
            title: innerCtx.input.slice(0, 50),
            narrative: `User: ${innerCtx.input.slice(0, 200)}\nAgent: ${response.slice(0, 200)}`,
            emotionalWeight: Math.abs(emotionalResult.intensity),
            tags: [...detectedTopics, emotionalResult.primaryEmotion],
            associations: [],
            decayRate: 0.1,
            accessCount: 0,
          });

          this.hooks.emit('memory:store', { type: 'episodic', title: innerCtx.input.slice(0, 50) }).catch(() => {});
          MetricsCollector.getInstance().memoryStores.inc();
          MetricsCollector.getInstance().emotionEvents.inc();
          MetricsCollector.getInstance().emotionValence.set(emotionalResult.current.valence);
          MetricsCollector.getInstance().emotionArousal.set(emotionalResult.current.arousal);

          // 5. 实时事实提取 → 语义记忆
          this.extractAndStoreFacts(innerCtx.input);

          // 6. 关系里程碑检测
          checkRelationshipMilestone(this.persona, this.consciousness, this.logger);

          // 推送认知事件到意识流
          this.consciousness.emit({
            type: 'emotion.update',
            source: 'persona',
            data: { emotion: emotionalResult.primaryEmotion, intensity: emotionalResult.intensity },
          });

          const predictions = this.persona.getPredictions();
          if (predictions.predictedNeeds.length > 0) {
            this.consciousness.emit({
              type: 'prediction.update',
              source: 'persona',
              data: { needsCount: predictions.predictedNeeds.length, topNeed: predictions.predictedNeeds[0] },
            });
          }
        } catch (cognitiveError) {
          // 认知子系统降级：不影响核心 LLM 响应，仅记录错误
          const cogErrMsg = cognitiveError instanceof Error ? cognitiveError.message : String(cognitiveError);
          this.logger.warn(`Cognitive subsystem degraded (non-fatal): ${cogErrMsg}`);
          this.consciousness.emit({
            type: 'health.degraded',
            source: 'agent',
            data: { subsystem: 'cognitive', error: cogErrMsg },
          });
        }

        await this.hooks.emit('input:processed', { content: innerCtx.input, responseLength: response.length });
        await this.hooks.emit('cycle:end', { input: innerCtx.input, responseLength: response.length });

        innerCtx.response = response;
      });
    } catch (outerError) {
      // 优雅错误恢复：管道外部异常
      const errMsg = outerError instanceof Error ? outerError.message : String(outerError);
      this.logger.error(`processInput pipeline error: ${errMsg}`);
      MetricsCollector.getInstance().counter('pipeline_errors').inc();
      await this.hooks.emit('error:pipeline', { error: errMsg, input: content }).catch(() => {});

      // 推送错误到意识流（供 API/CLI 展示）
      this.consciousness.emit({
        type: 'error.pipeline',
        source: 'agent',
        data: { error: errMsg, recovered: true },
      });

      ctx.response = 'Something caught me off guard just now, but I\'m okay. Could you say that again?';
    }

    // Auto-save check（每 5 条消息自动保存）
    const llmModel = typeof this.config.llm.getModel === 'function' ? this.config.llm.getModel() : 'unknown';
    this.sessionManager.checkAutoSave(
      this.buildAgentStateForSnapshot(),
      { llmProvider: llmModel, debugLogging: this.config.debugLogging ?? false },
    ).catch(() => {});

    return { content: ctx.response ?? '' };
  }

  /**
   * 从 LLM 响应中检测并执行工具调用（代理到 response-processor）
   */
  /** LLM 重试最大次数 */
  private static readonly MAX_LLM_RETRIES = 3;

  /** 当前会话格式版本 — 迁移时递增 */
  private static readonly SESSION_VERSION = 3;
  /** 重试基础延迟（毫秒） */
  private static readonly RETRY_BASE_DELAY_MS = 1000;

  /**
   * 带指数退避的 LLM 调用
   *
   * 失败时自动重试（最多 3 次，延迟 1s → 2s → 4s）。
   * 保留流式输出支持。
   */
  private async callLLMWithRetry(
    input: string,
    systemContext: string,
    onToken?: (token: string) => void,
  ): Promise<string> {
    const maxAttempts = KillerAgent.MAX_LLM_RETRIES;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        await this.hooks.emit('llm:call', { attempt, inputLength: input.length });

        let response: string;
        if (onToken) {
          // 尝试流式输出，失败后降级为完整请求
          try {
            const chunks: string[] = [];
            for await (const chunk of this.config.llm.stream(input, systemContext)) {
              chunks.push(chunk);
              onToken(chunk);
            }
            response = chunks.join('');
          } catch (streamErr) {
            this.logger.warn(`Stream failed (attempt ${attempt}), falling back to complete: ${
              streamErr instanceof Error ? streamErr.message : String(streamErr)
            }`);
            const result = await this.config.llm.complete(input, systemContext);
            response = result.content;
            onToken(response);
          }
        } else {
          const result = await this.config.llm.complete(input, systemContext);
          response = result.content;
        }

        await this.hooks.emit('llm:response', { responseLength: response.length, attempt });
        return response;
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        await this.hooks.emit('llm:error', { error: errMsg, attempt });

        const isLastAttempt = attempt === maxAttempts;
        if (isLastAttempt) throw err;

        const delay = KillerAgent.RETRY_BASE_DELAY_MS * Math.pow(2, attempt - 1);
        this.logger.warn(`LLM call failed (attempt ${attempt}/${maxAttempts}), retrying in ${delay}ms: ${errMsg}`);

        // 重试前通知用户
        onToken?.(`\n[Retrying... (${attempt}/${maxAttempts - 1})]\n`);

        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    // 不可达，但 TypeScript 需要
    throw new Error('LLM retry exhausted');
  }

  private async executeToolCallsFromResponse(
    response: string,
    onToken?: (token: string) => void,
  ): Promise<import('./response-processor.js').ToolChainResult> {
    const result = await executeToolCallsFromResponse(response, {
      tools: this.tools,
      toolPermissions: this.toolPermissions,
      logger: this.logger,
      toolTimeoutMs: this.toolTimeoutMs,
    }, onToken);

    // 更新对话历史中最后一条 assistant 消息
    if (result.response !== response) {
      const lastIdx = this.conversationHistory.length - 1;
      if (lastIdx >= 0 && this.conversationHistory[lastIdx].role === 'assistant') {
        this.conversationHistory[lastIdx] = { ...this.conversationHistory[lastIdx], content: result.response };
      }
    }

    return result;
  }

  /**
   * 原生 Function Calling 工具链循环
   *
   * 使用 LLM 原生的 tools/functions API 进行工具调用：
   * 1. 构建 messages（system + history + user）+ tools 定义
   * 2. 调用 completeWithTools → 模型返回 tool_calls 或文本
   * 3. 执行工具 → 追加 tool role 消息 → 继续调用
   * 4. 模型不再调用工具时返回最终文本响应
   *
   * 这彻底解决了"TOOL完就会卡"的问题：
   * - 不依赖 regex 解析文本中的工具调用
   * - 不依赖 continuation prompt 让 LLM 继续输出工具调用
   * - 使用 API 原生的 finish_reason: "tool_calls" 信号
   */
  private async runNativeToolLoop(
    userInput: string,
    systemContext: string,
    onToken?: (token: string) => void,
    onStatus?: (status: string) => void,
  ): Promise<string> {
    // === 阶段 1：普通文本调用（流式输出给用户）===
    // 先不加 tools 参数，让模型自然响应。
    // 避免模型对所有输入都强制调用工具（DeepSeek 的已知行为）。
    let response = await this.callLLMWithRetry(userInput, systemContext, onToken);

    // 解析文本中的工具调用标记（DSML/inline/code block）
    const toolResult = await this.executeToolCallsFromResponse(response);
    response = toolResult.response;

    if (!toolResult.toolsExecuted) {
      // 纯文本响应，无工具调用 — 直接返回
      return response;
    }

    // === 阶段 2：有工具调用 — 进入原生 function calling 循环 ===
    const provider = this.config.llm;
    const supportsNative = 'completeWithTools' in provider
      && typeof (provider as any).completeWithTools === 'function';

    if (!supportsNative) {
      // Provider 不支持原生 function calling — 用文本 follow-up 获取最终响应
      const followUpPrompt = `Based on these tool results, provide your final answer to the user's request:\n${response}`;
      const followUp = await this.callLLMWithRetry(followUpPrompt, systemContext, onToken);
      return followUp;
    }

    const tools = this.buildToolDefinitions();
    if (tools.length === 0) return response;

    // 构建 messages（包含对话上下文 + 第一轮工具结果）
    const messages: ChatMessage[] = [
      { role: 'system', content: systemContext },
      ...this.conversationHistory.map(m => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      })),
      { role: 'user', content: userInput },
    ];

    // 第一轮工具结果作为 assistant 上下文
    const firstRoundTools = toolResult.executedToolNames.join(', ');
    const statusLabel = toolResult.executedToolNames
      .map(t => TOOL_STATUS_LABELS[t] ?? t)
      .join(', ');
    onStatus?.(`${statusLabel} → continuing...`);

    messages.push({
      role: 'assistant',
      content: `I executed tools: ${firstRoundTools}. Results:\n${
        toolResult.response.slice(0, 3000)
      }\n\nContinuing work on the user's request.`,
    });

    let round = 1;
    const callHistory: string[] = [];
    const MAX_ROUNDS = 15;

    while (round < MAX_ROUNDS) {
      onStatus?.('Reasoning...');

      let result;
      try {
        result = await (provider as any).completeWithTools(messages, tools);
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        this.logger.warn(`Native function calling failed in loop: ${errMsg}`);
        break;
      }

      // 没有工具调用 — 模型给了最终文本响应
      if (!result.toolCalls || result.toolCalls.length === 0) {
        const finalContent = result.content || '';
        if (finalContent) {
          onToken?.('\n' + finalContent);
        }
        return finalContent || response;
      }

      round++;

      // 追加 assistant 消息（带 tool_calls）
      messages.push({
        role: 'assistant',
        content: result.content || '',
        tool_calls: result.toolCalls,
      });

      for (const toolCall of result.toolCalls) {
        const toolName = toolCall.function.name;
        const label = TOOL_STATUS_LABELS[toolName] ?? toolName;
        onStatus?.(`${label} (${round})`);

        // 重复检测
        const sig = `${toolName}:${toolCall.function.arguments}`;
        callHistory.push(sig);
        const recentWindow = callHistory.slice(-8);
        const uniqueRecent = new Set(recentWindow).size;
        const isRepeating = recentWindow.length > 4
          && (1 - uniqueRecent / recentWindow.length) > 0.5;

        if (isRepeating) {
          onStatus?.('Converging...');
          messages.push({
            role: 'tool',
            toolCallId: toolCall.id,
            content: '[Repetition detected. Respond to the user now, do not call more tools.]',
          });
          continue;
        }

        // 权限检查
        let params: unknown;
        try {
          params = JSON.parse(toolCall.function.arguments);
        } catch {
          params = {};
        }

        const permCheck = this.toolPermissions.check(toolName, params);
        if (!permCheck.allowed) {
          messages.push({
            role: 'tool',
            toolCallId: toolCall.id,
            content: `[Tool Blocked: ${toolName}] ${permCheck.reason ?? 'Permission denied'}`,
          });
          continue;
        }

        // 执行工具
        await this.hooks.emit('tool:execute', { tool: toolName, round });

        try {
          const toolStart = Date.now();
          const toolExecResult = await this.tools.execute(toolName, params);
          const toolDuration = Date.now() - toolStart;

          // 追踪工具使用效果
          this.recordToolPerformance(toolName, toolExecResult.success, toolDuration);
          this.recentToolResults.push({ success: toolExecResult.success, timestamp: Date.now() });
          if (this.recentToolResults.length > 30) this.recentToolResults = this.recentToolResults.slice(-30);

          // 从工具失败中提取教训
          if (!toolExecResult.success) {
            const lesson = extractLessonFromToolFailure(toolName, 'execution', toolExecResult.error ?? 'unknown');
            if (lesson) recordLesson(lesson);
          }

          const resultStr = toolExecResult.success
            ? (typeof toolExecResult.data === 'string' ? toolExecResult.data : JSON.stringify(toolExecResult.data))
            : `Error: ${toolExecResult.error}`;

          const truncated = resultStr.length > 8000
            ? resultStr.slice(0, 8000) + '\n...[truncated]'
            : resultStr;

          messages.push({
            role: 'tool',
            toolCallId: toolCall.id,
            content: truncated,
          });

          await this.hooks.emit('tool:result', { tool: toolName, round });
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : String(err);
          messages.push({
            role: 'tool',
            toolCallId: toolCall.id,
            content: `[Tool Error: ${toolName}] ${errMsg}`,
          });
        }
      }
    }

    // 超过最大轮次 — 做一次总结
    onStatus?.('Summarizing...');
    try {
      const finalResult = await (provider as any).completeWithTools(
        [...messages, { role: 'user', content: 'Summarize what was done and provide your final response.' }],
        [],
      );
      if (finalResult.content) {
        onToken?.('\n' + finalResult.content);
        return finalResult.content;
      }
    } catch { /* fallback to existing response */ }
    return response;
  }

  /**
   * 从 ToolExecutor 注册表构建 OpenAI function calling 格式的工具定义
   */
  private buildToolDefinitions(): ToolDefinition[] {
    const toolNames = this.tools.list();
    return toolNames.map(name => {
      const info = this.tools.getInfo(name);
      const desc = info?.description || `Execute tool: ${name}`;
      return {
        type: 'function' as const,
        function: {
          name,
          description: desc,
          parameters: parseToolParams(desc),
        },
      };
    });
  }

  /**
   * 旧版文本解析工具链回退（provider 不支持原生 function calling 时使用）
   */
  private async runToolChainLoopLegacy(
    initialResponse: string,
    _systemContext: string,
    onToken?: (token: string) => void,
    onStatus?: (status: string) => void,
  ): Promise<string> {
    let currentResponse = initialResponse;
    const toolResult = await this.executeToolCallsFromResponse(currentResponse);
    currentResponse = toolResult.response;

    if (toolResult.toolsExecuted) {
      const statusText = toolResult.executedToolNames
        .map(t => TOOL_STATUS_LABELS[t] ?? t)
        .join(', ');
      onStatus?.(statusText);
    }

    return currentResponse;
  }

  /**
   * 委派任务给多个 Cell 协作处理
   *
   * 供 /delegate 命令使用，或在 processInput 中检测到复杂任务时自动触发
   */
  async delegateTask(task: string, onToken?: (token: string) => void): Promise<DelegationResult> {
    onToken?.(`\n🔄 Delegating task: "${task.slice(0, 60)}${task.length > 60 ? '...' : ''}"\n`);

    await this.hooks.emit('delegate:start', { task });

    const result = await this.taskDelegate.delegate(task);

    // 报告子任务状态
    for (const subtask of result.subtasks) {
      const icon = subtask.status === 'completed' ? '✅' : subtask.status === 'failed' ? '❌' : '⏳';
      onToken?.(`  ${icon} ${subtask.cellType}: ${subtask.description.slice(0, 50)}\n`);
    }

    onToken?.(`\n📊 Used ${result.totalCellsUsed} cells in ${result.durationMs}ms\n\n`);
    onToken?.(result.synthesis);

    // 记录到对话历史
    this.conversationHistory.push({ role: 'user', content: `[delegate] ${task}`, timestamp: Date.now() });
    this.conversationHistory.push({ role: 'assistant', content: result.synthesis, timestamp: Date.now() });
    if (this.conversationHistory.length > this.maxConversationTurns * 2) {
      this.conversationHistory = this.conversationHistory.slice(-this.maxConversationTurns * 2);
    }

    await this.hooks.emit('delegate:complete', { task, cellsUsed: result.totalCellsUsed, durationMs: result.durationMs });

    return result;
  }

  /**
   * 检测输入是否为复杂任务，需要多 Cell 委派
   */
  private shouldDelegate(input: string): boolean {
    // 显式委派关键词
    const delegatePatterns = [
      /\b(delegate|assign|distribute)\b/i,
      /\b(多个|分别|同时|并行)\b/,
      /\b(parallel|multi|collaborate)\b/i,
    ];
    for (const pattern of delegatePatterns) {
      if (pattern.test(input)) return true;
    }

    // 长且包含多个子问题的输入
    const sentences = input.split(/[.!?。！？\n]/).filter(s => s.trim().length > 5);
    if (sentences.length >= 3 && input.length > 200) return true;

    return false;
  }

  /**
   * 从用户消息中提取丰富的行为模式，喂给镜像神经元学习系统
   */
  /**
   * 验证上一轮预测是否被当前用户输入证实或否定
   *
   * 将预测的 triggerConditions 与当前输入做关键词匹配。
   * 命中的预测标记为 correct，未命中的标记为 incorrect。
   * 这使得预测模型的准确率随时间自我校正。
   */
  private validatePredictionsAgainstInput(input: string): void {
    const predictions = this.persona.getPredictions();
    if (predictions.predictedNeeds.length === 0) return;

    const lower = input.toLowerCase();

    for (const need of predictions.predictedNeeds) {
      // 将预测描述和触发条件都作为匹配目标
      const matchTargets = [
        need.description.toLowerCase(),
        ...need.triggerConditions.map(c => c.toLowerCase()),
      ];

      // 简单关键词重叠检测
      const isRelevant = matchTargets.some(target => {
        const words = target.split(/\s+/).filter(w => w.length > 3);
        return words.some(word => lower.includes(word));
      });

      this.persona.validatePrediction(need.description, isRelevant);
    }
  }

  private enrichMirrorNeuronLearning(input: string): void {
    // 基础观察
    this.persona.observeUserBehavior('user-message', [input]);

    // 消息长度风格
    if (input.length < 20) {
      this.persona.observeUserBehavior('short-messages', ['communication']);
    } else if (input.length > 200) {
      this.persona.observeUserBehavior('long-messages', ['communication']);
    }

    // 是否包含代码
    if (/```|`[^`]+`|function\s|class\s|import\s|const\s|let\s|var\s/.test(input)) {
      this.persona.observeUserBehavior('uses-code', ['coding']);
    }

    // 是否提问
    if (/\?|how|what|why|when|where|who|which/i.test(input)) {
      this.persona.observeUserBehavior('asks-questions', ['communication']);
    }

    // 是否发出指令
    if (/^(do|make|create|build|fix|add|remove|delete|update|run|start|stop|show|list|get)\b/i.test(input)) {
      this.persona.observeUserBehavior('uses-imperative', ['communication']);
    }
  }

  /**
   * 估算交互满意度
   *
   * 基于用户输入情感（正面 → 高满意度，负面 → 低满意度）
   * 和响应质量（有实质内容 → 较高）进行启发式评估。
   */
  private estimateSatisfaction(userInput: string, agentResponse: string): number {
    let score = 0.5; // baseline

    // 用户情感正面向 → 提升满意度
    const positiveWords = /thank|great|good|nice|perfect|love|awesome|excellent|helpful/i;
    const negativeWords = /wrong|bad|error|fail|don't|doesn't|broken|fix|bug|issue|problem/i;

    if (positiveWords.test(userInput)) score += 0.3;
    if (negativeWords.test(userInput)) score -= 0.2;

    // 响应有实质内容 → 微调
    if (agentResponse.length > 50) score += 0.1;
    if (agentResponse.startsWith('(') || agentResponse.includes('unavailable')) score -= 0.3;

    return Math.max(0, Math.min(1, score));
  }

  /**
   * 检测用户输入的话题
   */
  /**
   * 检测最近回复是否重复——连续 3 个助手回复的前 50 字符相似度
   */
  private detectResponseRepetition(): boolean {
    const assistantMsgs = this.conversationHistory.filter(m => m.role === 'assistant');
    if (assistantMsgs.length < 2) return false;
    const lastResponse = assistantMsgs[assistantMsgs.length - 1]!.content;
    const recentResponses = assistantMsgs.slice(-6, -1).map(m => m.content);
    const result = detectResponseRepetition(lastResponse, recentResponses);
    return result.isRepetitive;
  }

  /**
   * 更新策略效果追踪
   *
   * 基于用户对上一轮回复的反应，评估当前策略组合的效果。
   * 正面信号：满意度高、用户继续话题
   * 负面信号：用户追问澄清、满意度低
   */
  private updateStrategyEffectiveness(userInput: string, satisfaction: number): void {
    try {
      const profile = this.persona.getUserModel().preferenceProfile;
      const scores = profile.strategyScores ?? {
        detailVsConcise: 0.5,
        analyticalVsIntuitive: 0.5,
        proactiveVsReactive: 0.5,
        sampleCount: 0,
      };

      const isClarification = /\b(what do you mean|clarify|explain more|I don't understand|我不明白|能再说清楚|什么意思)\b/i.test(userInput);
      const isTopicContinuation = this.recentTopics.length > 1 &&
        this.recentTopics[this.recentTopics.length - 1] === this.recentTopics[this.recentTopics.length - 2];

      // 效果信号：满意度 + 话题延续 - 澄清需求
      const signal = Math.max(0, Math.min(1,
        satisfaction + (isTopicContinuation ? 0.1 : 0) - (isClarification ? 0.2 : 0),
      ));

      // 用指数移动平均更新（alpha = 0.2，对新信号适度响应）
      const alpha = 0.2;
      const currentVerbosity = profile.verbosity === 'detailed' ? 1 : profile.verbosity === 'concise' ? 0 : 0.5;
      const currentFormality = profile.formality === 'formal' ? 1 : profile.formality === 'casual' ? 0 : 0.5;
      const currentProactivity = profile.proactivity === 'autonomous' ? 1 : profile.proactivity === 'reactive' ? 0 : 0.5;

      // 如果信号好且当前策略偏向某个方向，加强该方向
      scores.detailVsConcise = scores.detailVsConcise * (1 - alpha) + (signal * currentVerbosity + (1 - signal) * (1 - currentVerbosity)) * alpha;
      scores.analyticalVsIntuitive = scores.analyticalVsIntuitive * (1 - alpha) + (signal * currentFormality + (1 - signal) * (1 - currentFormality)) * alpha;
      scores.proactiveVsReactive = scores.proactiveVsReactive * (1 - alpha) + (signal * currentProactivity + (1 - signal) * (1 - currentProactivity)) * alpha;
      scores.sampleCount++;

      // 写回（不可变更新）
      profile.strategyScores = scores;
    } catch {
      // 策略追踪失败不影响主循环
    }
  }

  /**
   * 回复质量自评 — 基于多维评分修正策略
   * 高质量回复强化当前策略，低质量回复微调方向
   */
  private evaluateAndAdjustQuality(userInput: string, agentResponse: string): void {
    try {
      const score = evaluateResponseQuality(userInput, agentResponse);
      this.lastQualityOverall = score.overall;
      this.lastQualityTags = score.tags;

      // 只在有明显信号时调整（overall 偏离 0.5 超过 0.15）
      if (Math.abs(score.overall - 0.5) < 0.15) return;

      const profile = this.persona.getUserModel().preferenceProfile;
      const scores = profile.strategyScores;
      if (!scores || scores.sampleCount < 3) return;

      const alpha = 0.1; // 质量信号权重较低，缓慢调整
      const qualitySignal = score.overall > 0.6 ? 0.05 : -0.05;

      // 冗长但低质量 → 偏向简洁
      if (score.tags.includes('verbose') || score.tags.includes('over-explained')) {
        scores.detailVsConcise = Math.max(0, scores.detailVsConcise - 0.05);
      }
      // 高可操作性 → 保持当前策略
      if (score.actionability > 0.7) {
        scores.detailVsConcise = Math.min(1, scores.detailVsConcise + qualitySignal);
      }
      // 低相关性 → 偏向直觉式（可能过度分析导致跑题）
      if (score.relevance < 0.3) {
        scores.analyticalVsIntuitive = Math.max(0, scores.analyticalVsIntuitive - 0.05);
      }

      profile.strategyScores = scores;

      // 基于 reply quality 反馈更新 section weights
      if (this.sectionWeights.lastActiveSections.length > 0) {
        this.sectionWeights = updateSectionWeights(this.sectionWeights, score.overall);
      }

      // 从低质量回复中提取教训
      if (score.overall < 0.5 && score.tags.length > 0) {
        const lesson = extractLessonFromQuality(score.overall, score.tags, userInput);
        if (lesson) recordLesson(lesson);
      }

      // 评估认知信号利用率
      if (this.sectionWeights.lastActiveSections.length > 0) {
        const util = evaluateSignalUtilization(this.sectionWeights.lastActiveSections, agentResponse);
        this.utilizationStats = updateUtilizationStats(this.utilizationStats, util);

        // 持续低利用率的 section 自动降权
        const underutilized = getUnderutilizedSections(this.utilizationStats, 0.3);
        for (const section of underutilized) {
          const current = this.sectionWeights.offsets[section] ?? 0;
          if (current > -0.1) {
            this.sectionWeights = {
              ...this.sectionWeights,
              offsets: { ...this.sectionWeights.offsets, [section]: current - 0.02 },
            };
          }
        }
      }
    } catch {
      // 质量评估失败不影响主循环
    }
  }

  /**
   * 记录工具使用效果
   */
  private recordToolPerformance(toolName: string, success: boolean, durationMs: number): void {
    const perf = this.toolPerformance.get(toolName) ?? { uses: 0, successes: 0, avgDurationMs: 0 };
    perf.avgDurationMs = (perf.avgDurationMs * perf.uses + durationMs) / (perf.uses + 1);
    perf.uses++;
    if (success) perf.successes++;
    this.toolPerformance.set(toolName, perf);
  }

  /**
   * 获取工具效果摘要（用于 prompt 注入）
   */
  private getToolPerformanceSummary(): string {
    if (this.toolPerformance.size === 0) return '';
    const lines: string[] = [];
    for (const [tool, perf] of this.toolPerformance) {
      if (perf.uses < 2) continue;
      const rate = Math.round((perf.successes / perf.uses) * 100);
      const tag = rate >= 80 ? '✓' : rate >= 50 ? '~' : '✗';
      lines.push(`${tag} ${tool}: ${rate}% (${perf.uses} uses, ${Math.round(perf.avgDurationMs)}ms avg)`);
    }
    return lines.length > 0 ? lines.join('\n') : '';
  }

  /**
   * 导出工具使用效果数据
   */
  private exportToolPerformance(): Record<string, { uses: number; successes: number; avgDurationMs: number }> {
    const result: Record<string, { uses: number; successes: number; avgDurationMs: number }> = {};
    for (const [tool, perf] of this.toolPerformance) {
      result[tool] = { ...perf };
    }
    return result;
  }

  /**
   * 导入工具使用效果数据
   */
  private importToolPerformance(data: Record<string, { uses: number; successes: number; avgDurationMs: number }>): void {
    for (const [tool, perf] of Object.entries(data)) {
      this.toolPerformance.set(tool, { ...perf });
    }
  }

  private detectTopics(input: string): string[] {
    const topics: string[] = [];
    const topicPatterns: Array<[RegExp, string]> = [
      [/\b(code|function|class|debug|bug|error|stack)\b/i, 'coding'],
      [/\b(learn|study|understand|explain|teach)\b/i, 'learning'],
      [/\b(plan|goal|project|build|create|design)\b/i, 'planning'],
      [/\b(hello|hi|hey|morning|evening|how are)\b/i, 'greeting'],
      [/\b(analyze|review|compare|evaluate)\b/i, 'analysis'],
      [/\b(write|document|read|file)\b/i, 'writing'],
    ];

    for (const [pattern, topic] of topicPatterns) {
      if (pattern.test(input)) {
        topics.push(topic);
      }
    }

    return topics.length > 0 ? topics : ['general'];
  }

  /**
   * 从用户输入中实时提取事实并存储到语义记忆
   *
   * 检测用户身份信息、偏好、目标等，立即存入 hippocampus
   * 语义图谱中，使 agent 在后续对话中能引用这些事实。
   */
  private extractAndStoreFacts(input: string): void {
    const facts = extractFacts(input);
    if (facts.length === 0) return;

    for (const fact of facts) {
      // 事件类型 → 创建 event 语义节点
      if (fact.category === 'event') {
        this.hippocampus.addSemanticNode({
          type: 'event',
          label: fact.label,
          properties: { ...fact.properties, extractedAt: Date.now(), confidence: fact.confidence },
          strength: fact.confidence,
        });

        this.consciousness.emit({
          type: 'fact.learned',
          source: 'agent',
          data: { category: 'event', label: fact.label, confidence: fact.confidence },
        });
        continue;
      }

      // 检查是否已存在同 field 的节点（避免重复）
      const field = String(fact.properties.field ?? '');
      if (field) {
        const existingNodes = this.hippocampus.getSemanticNodesByType('entity');
        const duplicate = existingNodes.find(
          n => n.properties.field === field && n.label.startsWith(fact.label.split(':')[0])
        );
        if (duplicate) {
          // 更新已有节点而非重复创建
          this.hippocampus.addSemanticNode({
            id: duplicate.id,
            type: 'entity',
            label: fact.label,
            properties: { ...fact.properties, updatedAt: Date.now() },
            strength: Math.min(duplicate.strength + 0.1, 1.0),
          });
          continue;
        }
      }

      // 创建新语义节点
      this.hippocampus.addSemanticNode({
        type: 'entity',
        label: fact.label,
        properties: { ...fact.properties, extractedAt: Date.now(), confidence: fact.confidence },
        strength: fact.confidence,
      });

      this.consciousness.emit({
        type: 'fact.learned',
        source: 'agent',
        data: { category: fact.category, label: fact.label, confidence: fact.confidence },
      });
    }

    if (facts.length > 0) {
      this.logger.info(`Extracted ${facts.length} fact(s): ${facts.map(f => f.label).join(', ')}`);
    }
  }

  /**
   * 构建系统 prompt（包含 persona、记忆和对话历史上下文）
   */
  private buildSystemPrompt(currentInput?: string): string {
    const SECTION_PREFIXES = [
      'You have ', 'DREAM INSIGHTS', 'META-COGNITION', 'ATTENTION STATE',
      'RESPONSE STRATEGY', 'PRELOADED CONTEXT', 'TOOL PERFORMANCE',
      'TOOL FAILURE PATTERNS', 'LEARNED BEHAVIORS', 'TEMPORAL CONTEXT',
      'CONVERSATION FLOW', 'LENGTH PREFERENCE', 'TOOL PRIORITY',
      'CONVERSATION HEALTH', 'MULTI-INTENT', 'INPUT AMBIGUITY',
      'GOAL DEPENDENCIES', 'TOPIC TRANSITION', 'SUGGESTED ACTIONS',
      'CONVERSATION RHYTHM', 'USER EXPERTISE', 'EMOTIONAL RESPONSE STRATEGY',
      'PERCEPTION FUSION', 'RESTORED CONTEXT', 'STRATEGY COHERENCE',
      'COGNITIVE STATE', 'COMPOSITE RESPONSE STRATEGY', 'INTENT EVOLUTION',
      'STYLE GUIDANCE', 'KNOWLEDGE GRAPH', 'COGNITIVE FATIGUE', 'GAP RECOVERY', 'LEARNED LESSONS',
      'RHYTHM ADAPTATION', 'INTENT DECOMPOSITION', 'SEMANTIC NETWORK', 'RESPONSE TIMING', 'CONVERSATION SUMMARY', 'SELF-CORRECTION',
      'NEXT-TURN PREDICTION',
      'META-FEEDBACK',
      'TOOL CHAIN',
      'MOMENTUM',
    ];

    const memoryStats = this.hippocampus.getStats();
    const userModel = this.persona.getUserModel();
    const isFirstBoot = memoryStats.episodes === 0 && userModel.interactionSummary.totalInteractions === 0;

    // 预计算感知数据，避免各 compute 方法重复计算
    const userMsgs = this.conversationHistory.filter(m => m.role === 'user').slice(-10);
    const userMsgContents = userMsgs.map(m => m.content);
    const perception = {
      flow: userMsgs.length >= 3 ? predictConversationFlow(this.conversationHistory) : undefined,
      phase: userMsgs.length >= 3 ? this.computeConversationalPhase() : undefined,
      health: userMsgs.length >= 3 ? monitorConversationHealth(this.conversationHistory, this.recentTopics) : undefined,
      rhythm: userMsgs.length >= 3 ? analyzeConversationRhythm(userMsgs.map(m => ({ length: m.content.length, timestamp: m.timestamp }))) : undefined,
      expertise: userMsgs.length >= 3 ? buildUserExpertiseProfile(userMsgContents) : undefined,
    };

    const result = buildSystemPrompt({
      persona: this.persona,
      hippocampus: this.hippocampus,
      tools: this.tools,
      contextWindow: this.contextWindow,
      essenceForge: this.essenceForge,
      conversationHistory: this.conversationHistory,
      currentInput,
      isFirstBoot,
      activePlans: this.planExecutor.getActivePlans(),
      lastDreamInsights: this.lastDreamInsights,
      conversationMeta: {
        turnCount: this.conversationHistory.filter(m => m.role === 'user').length,
        avgResponseTimeMs: this.responseTimes.length > 0
          ? this.responseTimes.reduce((a, b) => a + b, 0) / this.responseTimes.length
          : 0,
        recentTopics: [...new Set(this.recentTopics)].slice(-5),
        repetitionDetected: this.detectResponseRepetition(),
      },
      attentionState: this.lastAttentionState ?? undefined,
      behavioralInsights: this.behavioralInsights.length > 0 ? [...this.behavioralInsights] : undefined,
      strategyScores: this.persona.getUserModel().preferenceProfile.strategyScores,
      toolPerformanceSummary: this.getToolPerformanceSummary(),
      goalDependencyTree: this.goalDependencies.size > 0 ? this.getGoalDependencyTree() : undefined,
      subGoals: this.goalDependencies.size > 0
        ? Array.from(this.goalDependencies.values()).flat().map(d => ({
            id: d.subGoalId,
            description: d.subGoalId,
            parentGoalId: '',
            status: 'pending',
          }))
        : undefined,
      conversationalPhase: this.computeConversationalPhaseForPrompt(),
      goalConflicts: this.goalConflicts.length > 0 ? [...this.goalConflicts] : undefined,
      toolFailurePatterns: getFailurePatterns().length > 0 ? getFailurePatterns() : undefined,
      temporalContext: this.computeTemporalContext(),
      flowPrediction: this.computeFlowPrediction(perception.flow),
      lengthPreference: Math.abs(this.lengthPreference.score - 0.5) > 0.15
        ? `${this.lengthPreference.recommendation} (target ~${this.lengthPreference.suggestedMaxLength} chars)`
        : undefined,
      toolPriority: this.computeToolPriority(perception),
      conversationHealth: this.computeConversationHealth(perception.health),
      multiIntents: this.computeMultiIntents(),
      ambiguityWarnings: this.computeAmbiguityWarnings(),
      goalDependencies: this.computeGoalDependencies(),
      topicTransition: this.computeTopicTransition(),
      autonomousActions: this.computeAutonomousActions(perception),
      restoredTopicContext: this.computeRestoredTopicContext(),
      conversationRhythm: this.computeConversationRhythm(perception.rhythm),
      userExpertise: this.computeUserExpertise(perception.expertise),
      emotionalStrategy: this.computeEmotionalStrategy(),
      perceptionFusion: this.computePerceptionFusion(perception),
      behaviorMode: this.lastBehaviorMode ?? undefined,
      strategyCoherence: this.computeStrategyCoherence(perception),
      cognitiveState: this.computeCognitiveState(perception),
      responseStrategy: this.computeResponseStrategy(perception),
      intentEvolution: this.computeIntentEvolution(),
      styleGuidance: generateStyleGuidance(this.styleEvolution),
      knowledgeGraphSummary: formatKnowledgeSummary(this.knowledgeGraph.entities, this.knowledgeGraph.relations),
      fatigueGuidance: this.computeFatigueAssessment(),
      gapRecoveryGuidance: this.computeGapRecovery(),
      learnedLessons: formatLessonsPrompt(getRelevantLessons(currentInput ?? '')),
      rhythmGuidance: formatRhythmGuidance(this.rhythmProfile),
      intentDecomposition: this.computeIntentDecomposition(),
      semanticNetworkGuidance: this.computeSemanticNetworkGuidance(),
      responseTimingGuidance: this.computeResponseTimingGuidance(currentInput ?? ''),
      conversationSummary: this.computeConversationSummary(),
      correctionGuidance: this.computeCorrectionGuidance(),
      nextTurnPrediction: this.computeNextTurnPrediction(),
      cognitiveFeedback: this.computeCognitiveFeedback(),
      toolChainGuidance: this.computeToolChainGuidance(),
      momentumGuidance: this.computeMomentumGuidance(),
      sectionWeightOffsets: exportSectionWeights(this.sectionWeights),
    });

    // 记录活跃 sections 用于后续权重学习
    const active = SECTION_PREFIXES.filter(p => result.includes(p));
    this.sectionWeights = recordActiveSections(this.sectionWeights, active);
    return result;
  }

  private computeConversationalPhaseForPrompt() {
    const phase = this.computeConversationalPhase();
    if (phase.confidence > 0.6) {
      this.contextWindow.setPhase(phase.phase);
    }
    return phase;
  }

  private computeTemporalContext(): string | undefined {
    const eventNodes = this.hippocampus.getSemanticNodesByType('event');
    const ctx = generateTemporalContext(this.previousInteractionTimestamp, eventNodes);
    return ctx.formatted || undefined;
  }

  private computeFlowPrediction(flow?: ReturnType<typeof predictConversationFlow>): string | undefined {
    const pred = flow ?? predictConversationFlow(this.conversationHistory);
    if (pred.currentPattern === 'casual-chat' && pred.confidence < 0.5) return undefined;
    const lines = [
      `Pattern: ${pred.currentPattern} (confidence: ${(pred.confidence * 100).toFixed(0)}%)`,
      pred.flowDescription,
    ];
    if (pred.predictedNextSteps.length > 0) {
      lines.push(`Likely next: ${pred.predictedNextSteps.join(', ')}`);
    }
    if (pred.suggestedTools.length > 0) {
      lines.push(`Prepare tools: ${pred.suggestedTools.join(', ')}`);
    }
    return lines.join('. ');
  }

  private computeToolPriority(p?: { flow?: ReturnType<typeof predictConversationFlow>; expertise?: ReturnType<typeof buildUserExpertiseProfile> }): string | undefined {
    const flow = p?.flow ?? predictConversationFlow(this.conversationHistory);
    const phase = this.contextWindow.getCurrentPhase();
    const eventNodes = this.hippocampus.getSemanticNodesByType('event');
    const temporal = generateTemporalContext(this.previousInteractionTimestamp, eventNodes);
    if (flow.currentPattern === 'casual-chat' && phase === 'idle') return undefined;
    const expertise = p?.expertise ?? (this.conversationHistory.filter(m => m.role === 'user').slice(-10).map(m => m.content).length >= 3 ? buildUserExpertiseProfile(this.conversationHistory.filter(m => m.role === 'user').slice(-10).map(m => m.content)) : undefined);
    const suggestion = suggestToolPriority(
      flow.currentPattern, phase, temporal.urgencyLevel,
      expertise?.domains.map(d => d.domain),
      this.lastBehaviorMode ?? undefined,
    );
    if (suggestion.preferredTools.length === 0) return undefined;
    return `Prefer: ${suggestion.preferredTools.join(', ')}. ${suggestion.reason}`;
  }

  private computeConversationHealth(health?: ReturnType<typeof monitorConversationHealth>): string | undefined {
    const h = health ?? monitorConversationHealth(this.conversationHistory, this.recentTopics);
    if (h.score >= 0.8) return undefined;
    const parts = [`Health: ${(h.score * 100).toFixed(0)}%`];
    if (h.issues.length > 0) parts.push(`Issues: ${h.issues.join('; ')}`);
    parts.push(h.recommendation);
    return parts.join('. ');
  }

  private computeMultiIntents(): string[] | undefined {
    if (!this.conversationHistory.length) return undefined;
    const lastUser = this.conversationHistory.filter(m => m.role === 'user').slice(-1)[0];
    if (!lastUser) return undefined;
    const intents = detectMultiIntent(lastUser.content);
    return intents.length > 1 ? intents.map(i => i.text) : undefined;
  }

  private computeIntentDecomposition(): string | undefined {
    if (!this.conversationHistory.length) return undefined;
    const lastUser = this.conversationHistory.filter(m => m.role === 'user').slice(-1)[0];
    if (!lastUser) return undefined;
    const decomposition = decomposeIntent(lastUser.content);
    if (decomposition.subIntents.length <= 1) return undefined;
    return formatIntentDecomposition(decomposition);
  }

  private computeSemanticNetworkGuidance(): string | undefined {
    const summary = formatSemanticNetworkSummary(this.semanticNetwork);
    return summary || undefined;
  }

  private computeResponseTimingGuidance(input: string): string | undefined {
    const flowPattern = this.computeFlowPrediction();
    const fatigueLevel = this.lastFatigueState?.fatigueLevel;
    const assessment = assessResponseTiming(input, flowPattern, fatigueLevel);
    return formatTimingGuidance(assessment);
  }

  private computeConversationSummary(): string | undefined {
    if (this.conversationHistory.length < 10) return undefined;
    const oldMessages = this.conversationHistory.slice(0, -6);
    if (oldMessages.length < 4) return undefined;
    const summary = generateConversationSummary(oldMessages);
    return formatConversationSummary(summary) || undefined;
  }

  private lastCorrectionResult: CorrectionResult | undefined;
  private lastNextTurnPrediction: NextTurnPrediction | undefined;
  private lastCognitiveFeedback: CognitiveFeedbackAnalysis | undefined;
  private lastToolChainSuggestion: ToolChainSuggestion | undefined;
  private toolUsageHistory: ToolUsageRecord[] = [];
  private lastMomentumState: MomentumState | undefined;

  private computeCorrectionGuidance(): string | undefined {
    if (!this.lastCorrectionResult || this.lastCorrectionResult.items.length === 0) return undefined;
    return formatCorrectionResult(this.lastCorrectionResult);
  }

  private computeNextTurnPrediction(): string | undefined {
    if (this.intentHistory.length < 1) return undefined;
    const entities = getTopEntities(this.knowledgeGraph.entities, 5)
      .map(e => ({ type: e.type, name: e.name, mentionCount: e.mentions }));
    const flow = this.conversationHistory.length >= 3
      ? predictConversationFlow(this.conversationHistory)
      : undefined;
    const prediction = predictNextIntent(
      this.intentHistory,
      entities,
      flow?.currentPattern,
    );
    this.lastNextTurnPrediction = prediction;
    return formatNextTurnPrediction(prediction) || undefined;
  }

  private computeCognitiveFeedback(): string | undefined {
    const activeModules: Record<string, { active: boolean; state?: string; score?: number }> = {};
    if (this.lastFatigueState) activeModules.fatigue = { active: true, score: this.lastFatigueState.fatigueLevel };
    if (this.lastNextTurnPrediction) activeModules.prediction = { active: true, score: this.lastNextTurnPrediction.confidence };
    if (this.lastCorrectionResult) activeModules.correction = { active: true, score: this.lastCorrectionResult.overallScore };
    if (this.knowledgeGraph.entities.size > 0) activeModules.knowledge = { active: true, score: this.knowledgeGraph.entities.size / 20 };

    const analysis = analyzeCrossModuleFeedback(activeModules);
    this.lastCognitiveFeedback = analysis;
    return formatCognitiveFeedback(analysis) || undefined;
  }

  private computeToolChainGuidance(): string | undefined {
    if (!this.lastNextTurnPrediction || this.lastNextTurnPrediction.confidence < 0.3) return undefined;
    const patterns = mineToolPatterns(this.toolUsageHistory);
    const lastTool = this.toolUsageHistory.length > 0
      ? this.toolUsageHistory[this.toolUsageHistory.length - 1].tool
      : undefined;
    const suggestion = generateToolChainSuggestion(
      this.lastNextTurnPrediction.predictedCategory,
      [],
      patterns,
      lastTool,
    );
    this.lastToolChainSuggestion = suggestion;
    return formatToolChainSuggestion(suggestion) || undefined;
  }

  private computeMomentumGuidance(): string | undefined {
    if (this.conversationHistory.length < 4) return undefined;
    const goals = this.listGoals().map(g => ({
      progress: g.status === 'completed' ? 1 : g.status === 'in_progress' ? 0.5 : 0.2,
    }));
    const momentum = analyzeConversationMomentum(
      this.conversationHistory.slice(-15),
      goals,
    );
    this.lastMomentumState = momentum;
    return formatMomentumState(momentum);
  }

  private computeAmbiguityWarnings(): string[] | undefined {
    if (!this.conversationHistory.length) return undefined;
    const lastUser = this.conversationHistory.filter(m => m.role === 'user').slice(-1)[0];
    if (!lastUser) return undefined;
    const ambiguities = detectAmbiguity(lastUser.content);
    return ambiguities.length > 0 ? ambiguities.map(a => a.clarification) : undefined;
  }

  private computeGoalDependencies(): string[] | undefined {
    const goals = this.listGoals();
    if (goals.length < 2) return undefined;
    const deps = buildGoalDependencyGraph(goals.map(g => ({
      id: g.id, description: g.description, status: g.status,
    })));
    if (deps.length === 0) return undefined;
    return deps.map(d => `${d.type}: ${d.description}`);
  }

  private computeTopicTransition(): string | undefined {
    if (this.recentTopics.length < 2) return undefined;
    const lastUser = this.conversationHistory.filter(m => m.role === 'user').slice(-1)[0];
    if (!lastUser) return undefined;
    const prev = this.recentTopics[this.recentTopics.length - 2];
    const topicHistory = this.recentTopics.map((t, i) => ({
      topic: t, turnStart: i, turnEnd: i + 1,
    }));
    const transition = detectTopicTransition(lastUser.content, prev, this.conversationHistory.length, topicHistory);
    if (!transition.transitioned) return undefined;
    const parts = [`Topic shifted to "${transition.currentTopic}"`];
    if (transition.returnedTo) parts.push(`(returned to "${transition.returnedTo}")`);
    return parts.join(' ');
  }

  private computeAutonomousActions(p?: { flow?: ReturnType<typeof predictConversationFlow>; phase?: { phase: string; confidence: number }; health?: ReturnType<typeof monitorConversationHealth> }): string[] | undefined {
    const flow = p?.flow ?? predictConversationFlow(this.conversationHistory);
    const phase = p?.phase ?? this.computeConversationalPhase();
    const health = p?.health ?? monitorConversationHealth(this.conversationHistory, this.recentTopics);
    const lastUser = this.conversationHistory.filter(m => m.role === 'user').slice(-1)[0];
    const intents = lastUser ? detectMultiIntent(lastUser.content) : [];
    const ambiguities = lastUser ? detectAmbiguity(lastUser.content) : [];
    const topics = [...new Set(this.recentTopics)].slice(-5);
    const hasGoals = this.listGoals().length > 0;
    const actions = decideAutonomousActions({
      flowPattern: flow.currentPattern,
      phase: phase.phase,
      healthScore: health.score,
      intentCount: intents.length,
      hasAmbiguity: ambiguities.length > 0,
      topicTransition: this.recentTopics.length >= 2 && this.recentTopics[this.recentTopics.length - 1] !== this.recentTopics[this.recentTopics.length - 2],
      turnCount: this.conversationHistory.filter(m => m.role === 'user').length,
      recentTopics: topics,
      hasActiveGoals: hasGoals,
    });
    const preloads = generateIntentPreloads(flow.currentPattern, topics, hasGoals);
    const result = [
      ...actions.map(a => `- [${a.urgency}] ${a.type}: ${a.reason}${a.query ? ` (query: "${a.query}")` : ''}`),
      ...preloads.map(p => `- [low] preload_${p.preloadType}: ${p.reason} (query: "${p.query}")`),
    ];
    return result.length > 0 ? result.slice(0, 5) : undefined;
  }

  private computeRestoredTopicContext(): string | undefined {
    if (this.recentTopics.length < 2) return undefined;
    const currentTopic = this.recentTopics[this.recentTopics.length - 1];
    const prevTopic = this.recentTopics[this.recentTopics.length - 2];
    if (currentTopic === prevTopic) return undefined;
    const snapshot = this.topicSnapshots.get(prevTopic);
    if (!snapshot) return undefined;
    return formatTopicSnapshot(snapshot);
  }

  private computeConversationRhythm(rhythm?: ReturnType<typeof analyzeConversationRhythm>): string | undefined {
    if (!rhythm) {
      const userMessages = this.conversationHistory
        .filter(m => m.role === 'user')
        .slice(-10);
      if (userMessages.length < 3) return undefined;
      rhythm = analyzeConversationRhythm(
        userMessages.map(m => ({ length: m.content.length, timestamp: m.timestamp })),
      );
    }
    if (rhythm.confidence < this.cognitiveTuning.rhythmThreshold || rhythm.rhythm === 'initial') return undefined;
    return `[${rhythm.rhythm}] ${rhythm.responseHint}`;
  }

  private computeUserExpertise(expertise?: ReturnType<typeof buildUserExpertiseProfile>): string | undefined {
    if (!expertise) {
      const userMessages = this.conversationHistory
        .filter(m => m.role === 'user')
        .slice(-30)
        .map(m => m.content);
      if (userMessages.length < 3) return undefined;
      expertise = buildUserExpertiseProfile(userMessages);
    }
    if (expertise.domains.length === 0) return undefined;
    const topDomains = expertise.domains.slice(0, 3);
    return `${expertise.terminologyHint} ${expertise.explanationHint} (Top domains: ${topDomains.map(d => `${d.domain}(${d.depth.toFixed(1)})`).join(', ')})`;
  }

  private computeEmotionalStrategy(): string | undefined {
    const es = this.persona.emotionalState.getState();
    if (es.intensity < this.cognitiveTuning.emotionThreshold) return undefined;
    const strategy = mapEmotionToResponseStrategy({
      valence: es.current.valence,
      arousal: es.current.arousal,
      intensity: es.intensity,
      primaryEmotion: es.primaryEmotion,
    });
    return `Tone: ${strategy.toneHint} Length: ${strategy.lengthHint} Empathy: ${strategy.empathyAction}`;
  }

  private computePerceptionFusion(p?: { flow?: ReturnType<typeof predictConversationFlow>; phase?: { phase: string; confidence: number }; health?: ReturnType<typeof monitorConversationHealth>; rhythm?: ReturnType<typeof analyzeConversationRhythm>; expertise?: ReturnType<typeof buildUserExpertiseProfile> }): string | undefined {
    if (!p?.flow || !p?.phase || !p?.health || !p?.rhythm || !p?.expertise) {
      const userMessages = this.conversationHistory.filter(m => m.role === 'user').slice(-10);
      if (userMessages.length < 3) return undefined;
    }
    const flow = p?.flow ?? predictConversationFlow(this.conversationHistory);
    const phase = p?.phase ?? this.computeConversationalPhase();
    const health = p?.health ?? monitorConversationHealth(this.conversationHistory, this.recentTopics);
    const rhythm = p?.rhythm ?? (() => {
      const msgs = this.conversationHistory.filter(m => m.role === 'user').slice(-10);
      return analyzeConversationRhythm(msgs.map(m => ({ length: m.content.length, timestamp: m.timestamp })));
    })();
    const expertise = p?.expertise ?? buildUserExpertiseProfile(this.conversationHistory.filter(m => m.role === 'user').slice(-10).map(m => m.content));
    const es = this.persona.emotionalState.getState();

    const pv = fusePerceptionSignals({
      flowConfidence: flow.confidence,
      phaseConfidence: phase.confidence,
      rhythmConfidence: rhythm.confidence,
      emotionalIntensity: es.intensity,
      emotionalValence: es.current.valence,
      conversationHealth: health.score,
      expertiseDomainCount: expertise.domains.length,
    });

    this.lastBehaviorMode = pv.behaviorMode;

    if (pv.overallAttention < this.cognitiveTuning.fusionAttentionThreshold && pv.behaviorMode === 'balanced') return undefined;
    return `[${pv.behaviorMode}] attention=${(pv.overallAttention * 100).toFixed(0)}% — ${pv.fusedHint}`;
  }

  private computeStrategyCoherence(p?: { rhythm?: ReturnType<typeof analyzeConversationRhythm>; expertise?: ReturnType<typeof buildUserExpertiseProfile> }): string | undefined {
    const userMessages = this.conversationHistory.filter(m => m.role === 'user').slice(-10);
    if (userMessages.length < 3) return undefined;

    const rhythm = p?.rhythm ?? analyzeConversationRhythm(
      userMessages.map(m => ({ length: m.content.length, timestamp: m.timestamp })),
    );
    const expertise = p?.expertise ?? buildUserExpertiseProfile(userMessages.map(m => m.content));
    const es = this.persona.emotionalState.getState();
    const strategy = mapEmotionToResponseStrategy({
      valence: es.current.valence,
      arousal: es.current.arousal,
      intensity: es.intensity,
      primaryEmotion: es.primaryEmotion,
    });

    // 记录模块触发
    const modules = ['emotion', 'rhythm', 'expertise', 'health'] as const;
    for (const mod of modules) {
      if (!this.moduleStats[mod]) this.moduleStats[mod] = { triggers: 0, conflicts: 0, lastAdjustment: 0 };
      this.moduleStats[mod].triggers++;
    }

    const coherence = verifyStrategyCoherence({
      rhythmHint: rhythm.responseHint,
      expertiseHint: expertise.terminologyHint,
      emotionalHint: strategy.lengthHint,
      behaviorMode: this.lastBehaviorMode ?? undefined,
    });

    // 记录冲突到对应模块
    if (!coherence.coherent) {
      for (const conflict of coherence.conflicts) {
        if (conflict.includes('empathy') || conflict.includes('length')) {
          this.moduleStats['emotion']!.conflicts++;
          this.moduleStats['rhythm']!.conflicts++;
        }
        if (conflict.includes('speed') || conflict.includes('precision')) {
          this.moduleStats['expertise']!.conflicts++;
        }
        if (conflict.includes('expertise')) {
          this.moduleStats['emotion']!.conflicts++;
        }
      }
    }

    // 每 20 次交互调优一次参数
    const totalTriggers = Object.values(this.moduleStats).reduce((s, m) => s + m.triggers, 0);
    if (totalTriggers - this.lastTuningAdjustment >= 20) {
      this.cognitiveTuning = adaptCognitiveParams(this.cognitiveTuning, this.moduleStats);
      this.lastTuningAdjustment = totalTriggers;
    }

    if (coherence.coherent) return undefined;
    return `Conflicts: ${coherence.conflicts.join(', ')} → ${coherence.resolution}`;
  }

  private computeCognitiveState(p?: { flow?: ReturnType<typeof predictConversationFlow>; phase?: { phase: string; confidence: number }; health?: ReturnType<typeof monitorConversationHealth>; rhythm?: ReturnType<typeof analyzeConversationRhythm>; expertise?: ReturnType<typeof buildUserExpertiseProfile> }): string | undefined {
    const userMsgs = this.conversationHistory.filter(m => m.role === 'user').slice(-10);
    if (userMsgs.length < 3) return undefined;

    const flow = p?.flow ?? predictConversationFlow(this.conversationHistory);
    const phase = p?.phase ?? this.computeConversationalPhase();
    const health = p?.health ?? monitorConversationHealth(this.conversationHistory, this.recentTopics);
    const es = this.persona.emotionalState.getState();
    const rhythm = p?.rhythm ?? analyzeConversationRhythm(
      userMsgs.map(m => ({ length: m.content.length, timestamp: m.timestamp })),
    );
    const expertise = p?.expertise ?? buildUserExpertiseProfile(userMsgs.map(m => m.content));

    const summary = generateCognitiveStateSummary({
      phase: phase.phase,
      phaseConfidence: phase.confidence,
      flowPattern: flow.currentPattern,
      flowConfidence: flow.confidence,
      rhythm: rhythm.rhythm,
      rhythmConfidence: rhythm.confidence,
      emotionalIntensity: es.intensity,
      emotionalValence: es.current.valence,
      healthScore: health.score,
      expertiseDomains: expertise.domains.map(d => d.domain),
      behaviorMode: this.lastBehaviorMode ?? undefined,
      overallAttention: undefined,
      hasActiveGoals: this.listGoals().length > 0,
      topicCount: new Set(this.recentTopics).size,
      lastQualityOverall: this.lastQualityOverall,
      lastQualityTags: this.lastQualityTags.length > 0 ? this.lastQualityTags : undefined,
    });

    if (summary.activeModules.length < 2) return undefined;
    const metricParts = Object.entries(summary.metrics).map(([k, v]) => `${k}=${v}`).join(' ');
    const tuning = `tuning=[em:${this.cognitiveTuning.emotionThreshold.toFixed(2)} rh:${this.cognitiveTuning.rhythmThreshold.toFixed(2)} fus:${this.cognitiveTuning.fusionAttentionThreshold.toFixed(2)}]`;
    const underutilized = getUnderutilizedSections(this.utilizationStats, 0.3);
    const utilInfo = underutilized.length > 0 ? ` | low-util:[${underutilized.join(',')}]` : '';
    return `${summary.oneLiner} | ${metricParts} | ${tuning}${utilInfo}`;
  }

  private computeResponseStrategy(p?: { flow?: ReturnType<typeof predictConversationFlow>; phase?: { phase: string; confidence: number }; health?: ReturnType<typeof monitorConversationHealth>; rhythm?: ReturnType<typeof analyzeConversationRhythm>; expertise?: ReturnType<typeof buildUserExpertiseProfile> }): string | undefined {
    const flow = p?.flow;
    const rhythm = p?.rhythm;
    const expertise = p?.expertise;
    const es = this.persona.emotionalState.getState();
    const strategy = es.intensity >= this.cognitiveTuning.emotionThreshold
      ? mapEmotionToResponseStrategy({ valence: es.current.valence, arousal: es.current.arousal, intensity: es.intensity, primaryEmotion: es.primaryEmotion })
      : undefined;

    const guidance = generateResponseStrategyGuidance({
      flowPattern: flow?.currentPattern,
      phase: p?.phase?.phase,
      rhythm: rhythm?.rhythm,
      emotionalStrategy: strategy ? `Tone: ${strategy.toneHint} Length: ${strategy.lengthHint}` : undefined,
      behaviorMode: this.lastBehaviorMode ?? undefined,
      expertiseHint: expertise?.terminologyHint,
      lastQualityOverall: this.lastQualityOverall,
      lastQualityTags: this.lastQualityTags.length > 0 ? this.lastQualityTags : undefined,
      healthScore: p?.health?.score,
      interactionGapSeconds: this.previousInteractionTimestamp
        ? (Date.now() - this.previousInteractionTimestamp) / 1000
        : undefined,
    });
    return guidance?.formatted;
  }

  private computeIntentEvolution(): string | undefined {
    if (this.intentHistory.length < 3) return undefined;
    const evolution = trackIntentEvolution(this.intentHistory);
    if (evolution.transitions.length === 0 && evolution.activeChains.length === 0) return undefined;
    return formatIntentEvolution(evolution);
  }

  private computeFatigueAssessment(): string | undefined {
    if (this.recentResponses.length < 3) return undefined;
    const indicators: FatigueIndicators = {
      repetitionScore: computeRepetitionScore(this.recentResponses),
      toolEfficiency: computeToolEfficiency(this.recentToolResults),
      emotionalResponsiveness: this.lastFatigueState?.fatigueLevel ?? 0.5,
      strategyConsistency: 1 - (this.lastFatigueState?.fatigueLevel ?? 0),
    };
    const fatigue = assessCognitiveFatigue(indicators, this.sessionStartTime, this.turnCounter);
    this.lastFatigueState = fatigue;
    return formatFatigueGuidance(fatigue);
  }

  private computeGapRecovery(): string | undefined {
    const now = Date.now();
    const gapMinutes = (now - this.lastUserMessageTimestamp) / 60000;
    if (gapMinutes < 5) return undefined;

    const topEntities = getTopEntities(this.knowledgeGraph.entities, 5).map(e => e.name);
    const ctx: GapContext = {
      gapMinutes,
      lastTopic: extractLastTopic(this.conversationHistory),
      activeGoals: this.listGoals().slice(0, 3).map(g => ({ id: g.id, description: g.description, priority: g.priority })),
      lastEmotion: this.persona.emotionalState.getState().primaryEmotion,
      topEntities,
      pendingCommitments: extractPendingCommitments(this.conversationHistory),
    };
    const strategy = generateGapRecoveryStrategy(ctx);
    return formatGapRecoveryGuidance(strategy);
  }

  /**
   * 获取目标列表（供 CLI 使用）
   */
  getGoals(): Array<{ id: string; description: string; priority: number }> {
    const goals = this.listGoals();
    return goals.map(g => ({
      id: g.id,
      description: g.description,
      priority: g.priority,
    }));
  }

  /**
   * 日志输出（兼容旧调用，转发到结构化 logger）
   */
  private log(message: string): void {
    this.logger.info(message);
  }

  /**
   * 插件生命周期依赖注入
   */
  private getPluginDeps(): PluginLifecycleDeps {
    return {
      pluginManager: this.pluginManager,
      tools: this.tools,
      logger: this.logger,
    };
  }

  /**
   * 从 .killer/plugins/ 自动加载插件并注册工具和命令
   */
  private async loadPlugins(): Promise<void> {
    return loadPlugins(this.getPluginDeps());
  }

  /**
   * 注册内联插件（编程方式）
   */
  async registerPlugin(plugin: KillerPlugin): Promise<void> {
    await registerPluginExternal(plugin, this.getPluginDeps());
    await this.hooks.emit('plugin:loaded', { name: plugin.manifest.name, version: plugin.manifest.version });
  }

  /**
   * 卸载插件
   */
  async unloadPlugin(name: string): Promise<boolean> {
    const result = await unloadPluginExternal(name, this.getPluginDeps());
    if (result) {
      await this.hooks.emit('plugin:unloaded', { name });
    }
    return result;
  }

  /**
   * 获取已加载的插件列表
   */
  getPlugins(): Array<{ name: string; version: string; description?: string; source: string }> {
    return this.pluginManager.getLoadedPlugins();
  }

  /**
   * 获取完整状态（用于会话快照）
   */
  getState(): {
    goals: Array<{ id: string; description: string; priority: number; status: string }>;
    cells: Array<{ id: string; role: string; status: string }>;
    persona: { name: string; traits: string[]; bio: string };
    memory: { totalEpisodes: number; shortTermCount: number; longTermCount: number; associationCount: number };
    conversationHistory: Array<{ role: string; content: string }>;
  } {
    return {
      goals: this.getGoals().map(g => ({
        id: g.id,
        description: g.description,
        priority: g.priority,
        status: 'active' as const,
      })),
      cells: this.getCells(),
      persona: this.getPersona(),
      memory: this.getMemoryStats(),
      conversationHistory: [...this.conversationHistory],
    };
  }

  /**
   * 恢复对话历史（用于会话恢复）
   */
  restoreConversationHistory(history: Array<{ role: 'user' | 'assistant'; content: string; timestamp?: number }>): void {
    this.conversationHistory = history.map(m => ({
      role: m.role,
      content: m.content,
      timestamp: m.timestamp ?? Date.now(),
    }));
    this.logger.info(`Restored ${history.length} conversation turns`);
  }

  /**
   * 提取最后对话主题
   *
   * 从最近的用户消息中提取一个简短主题描述，
   * 用于下次启动时的"继续上次对话"提示。
   */
  private extractLastTopic(): string | null {
    // Find the last user message
    for (let i = this.conversationHistory.length - 1; i >= 0; i--) {
      const turn = this.conversationHistory[i];
      if (turn?.role === 'user' && turn.content.trim()) {
        const content = turn.content.trim();
        // Skip commands
        if (content.startsWith('/')) continue;
        // Extract first meaningful sentence, max 60 chars
        const firstSentence = content.split(/[.!?。！？\n]/)[0]?.trim() ?? content;
        if (firstSentence.length > 60) {
          return firstSentence.slice(0, 57) + '...';
        }
        return firstSentence;
      }
    }
    return null;
  }

  /**
   * 获取上次会话主题（用于问候）
   */
  getLastTopic(): string | null {
    // First check the loaded session data
    try {
      const filePath = path.join(this.sessionDir, 'default.json');
      if (fs.existsSync(filePath)) {
        const data = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as { lastTopic?: string };
        return data.lastTopic ?? null;
      }
    } catch {
      // Ignore parse errors
    }
    return null;
  }
}

/**
 * 从工具 description 中提取参数 schema
 *
 * 工具描述格式: "描述文字. Params: { param1: type, param2?: type }"
 * 解析 Params 部分生成 OpenAI function calling 的 parameters 对象。
 */
function parseToolParams(description: string): Record<string, unknown> {
  const paramsMatch = description.match(/Params:\s*\{([^}]*)\}/);
  if (!paramsMatch) {
    return { type: 'object', properties: {} };
  }

  const paramsStr = paramsMatch[1];
  const properties: Record<string, unknown> = {};
  const required: string[] = [];

  // 匹配 paramName: type 或 paramName?: type
  const paramPattern = /(\w+)(\?)?:\s*([^,}]+)/g;
  let m: RegExpExecArray | null;
  while ((m = paramPattern.exec(paramsStr)) !== null) {
    const name = m[1];
    const optional = m[2] === '?';
    const rawType = m[3].trim();

    const jsonType = rawType
      .replace(/\[.*?\]/g, '')  // 去掉 union/enum 如 "iso" | "unix"
      .replace(/['"]/g, '')
      .trim()
      .toLowerCase();

    const type = jsonType === 'number' ? 'number'
      : jsonType === 'boolean' ? 'boolean'
        : 'string';

    properties[name] = { type, description: `${name} parameter` };

    if (!optional) {
      required.push(name);
    }
  }

  return {
    type: 'object',
    ...(Object.keys(properties).length > 0 && { properties }),
    ...(required.length > 0 && { required }),
  };
}

/**
 * 稳定 JSON 序列化 — 用于重复检测的调用签名
 * 将 params 按 key 排序后序列化，确保语义相同的对象产生相同字符串
 */
function stableStringify(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value !== 'object') return String(value);
  try {
    return JSON.stringify(value, Object.keys(value as Record<string, unknown>).sort());
  } catch {
    return String(value);
  }
}

/**
 * 工具名 → 状态栏显示文本
 * 用于 onStatus 回调，向用户展示 agent 当前动作
 */
const TOOL_STATUS_LABELS: Record<string, string> = {
  self_read: 'Reading code',
  self_modify: 'Modifying code',
  self_list: 'Scanning files',
  learn: 'Creating tool',
  unlearn: 'Removing tool',
  inspect_tools: 'Inspecting tools',
  evolve_essence: 'Evolving behavior',
  auto_mission: 'Running mission',
  read_file: 'Reading file',
  write_file: 'Writing file',
  execute_shell: 'Running command',
  web_search: 'Searching web',
  web_fetch: 'Fetching page',
  memory_store: 'Storing memory',
  memory_retrieve: 'Recalling memory',
  memory_list: 'Listing memories',
};

// 导出类型别名
export type { DreamResult as DreamCycleResult } from '@killer/core';
