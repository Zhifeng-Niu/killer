/**
 * Odysseus Agent - 主 Agent 类
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
  ColumnRole,
  type ColumnId,
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
  isOdysseusError,
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
  SelfEvolutionEngine,
  EvolveAuditTool,
  EvolveSelfTool,
  EvolveStatusTool,
  MutateSourceTool,
  type SourceMutator,
  type Experiment,
  type ExperimentDecision,
  type ToolDefinition,
  type ChatMessage,
  type ToolCall,
  type IDriveSource,
  LongTaskEngine,
  type TaskCheckpoint,
  type TimeBudget,
  UNLIMITED_BUDGET,
  IterativeRefiner,
  type QualityMetric,
  type EvaluationResult,
  ErrorRecoveryManager,
  type ErrorRecoveryConfig,
  SelfMonitor,
  type HealthReport,
  type StagnationReport,
  ToolChain,
  ExecutionContext,
  ScheduledTaskRunner,
  InstructionParser,
  type ParsedInstruction,
  StepVerifier,
  type StepVerification,
  type VerificationContext,
  DeliveryReportGenerator,
  type DeliveryReport,
  type StepReport,
  SelfReviewer,
  type ReviewContext,
  type ReviewResult,
  CuriosityEngine,
  type ChainResult,
  type TaskExecutionResult,
} from '@odysseus/core';
import { ShellExecutor } from './shell-executor.js';
import { AutonomousExplorer } from './autonomous-explorer.js';
import { SensoryRouter, CLIChannel, OutputManager } from '../sensory/index.js';
import { WebhookChannel } from '../sensory/webhook/index.js';
import type {
  AgentConfig,
  AgentStatus,
  ModuleStatus,
} from './types.js';
import { DEFAULT_AGENT_CONFIG } from './types.js';
import type { SensoryInput } from '../sensory/types.js';
import { ColumnManager, type ColumnStatusReport } from './cells.js';
import { CommandHandler } from './commands.js';
import { BuiltinTools } from './tools.js';
import { TaskDelegate, type DelegationResult } from './task-delegate.js';
import { ToolPermissions, type PermissionCheck } from './tool-permissions.js';
import { PluginManager, type OdysseusPlugin } from '../plugins/index.js';
import { MetricsCollector } from '../metrics/index.js';
import { HealthMonitor } from '../metrics/health-monitor.js';
import { LifecycleHooks, type LifecycleEvent, type LifecycleHandler, type LifecycleSubscription } from './hooks.js';
import { MiddlewarePipeline, type Middleware, type MiddlewareContext, sanitizeMiddleware, structuredLoggingMiddleware, metricsMiddleware, sensitiveDataFilterMiddleware } from './middleware.js';
import { ContextWindowManager, type ContextMessage } from './context.js';
import { buildSystemPrompt, type PromptBuilderDeps } from './prompt-builder.js';
import { getProviderCapabilities } from '../llm/openai-compatible-provider.js';
import { triggerAutoDream, triggerAutoEvolve, generateProactiveSuggestions, generateDailySummary, generateIdleCheckin, checkRelationshipMilestone, detectCommitments, checkPendingReminders, computeAttentionState, detectConversationalPhase, extractFactsFromMessage, storeExtractedFacts, detectGoalConflicts, consolidateMemories, getFailurePatterns, classifyFailure, recordFailure, generateTemporalContext, predictConversationFlow, evaluateResponseQuality, detectResponseRepetition, detectLengthSignal, updateLengthPreference, createDefaultLengthPreference, suggestToolPriority, monitorConversationHealth, detectMultiIntent, detectAmbiguity, buildGoalDependencyGraph, detectTopicTransition, decideAutonomousActions, classifyInteractionOutcome, suggestStrategyAdjustment, generateIntentPreloads, extractTopicSnapshot, formatTopicSnapshot, type TopicContextSnapshot, analyzeConversationRhythm, buildUserExpertiseProfile, mapEmotionToResponseStrategy, fusePerceptionSignals, verifyStrategyCoherence, adaptCognitiveParams, DEFAULT_COGNITIVE_TUNING, type CognitiveTuningParams, generateCognitiveStateSummary, generateResponseStrategyGuidance, AUTO_DREAM_INTERVAL, AUTO_EVOLVE_INTERVAL, AUTO_PROACTIVE_INTERVAL, DAILY_SUMMARY_INTERVAL, IDLE_CHECKIN_INTERVAL, createDefaultSectionWeights, recordActiveSections, updateSectionWeights, getSectionWeightOffset, exportSectionWeights, importSectionWeights, type SectionWeights, classifyIntent, extractIntentSummary, trackIntentEvolution, formatIntentEvolution, type IntentNode, type IntentEvolution, evaluateSignalUtilization, updateUtilizationStats, getUnderutilizedSections, createDefaultUtilizationStats, type UtilizationStats, createDefaultStyleEvolution, extractResponseFeatures, inferSatisfactionFromReply, updateStyleEvolution, generateStyleGuidance, type StyleEvolutionModel, type ResponseStyleFeatures, createEmptyKnowledgeGraph, extractEntitiesFromMessage, extractRelationsFromMessage, getTopEntities, formatKnowledgeSummary, type ConversationKnowledgeGraph, computeRepetitionScore, computeToolEfficiency, assessCognitiveFatigue, formatFatigueGuidance, type FatigueIndicators, type CognitiveFatigueState, classifyGapSeverity, extractLastTopic, extractPendingCommitments, generateGapRecoveryStrategy, formatGapRecoveryGuidance, type GapContext, extractLessonFromQuality, extractLessonFromToolFailure, recordLesson, getRelevantLessons, formatLessonsPrompt, updateRhythmProfile, createDefaultRhythmProfile, formatRhythmGuidance, type RhythmSample, type RhythmProfile, decomposeIntent, formatIntentDecomposition, type IntentDecomposition, createEmptySemanticNetwork, extractConceptsFromMessage, extractSemanticRelations, detectIsolatedConcepts, inferImplicitRelations, formatSemanticNetworkSummary, type SemanticMemoryNetwork, assessResponseTiming, formatTimingGuidance, type ResponseTimingAssessment, generateConversationSummary, formatConversationSummary, validateResponse, formatCorrectionResult, type CorrectionResult, allocateBudget, pruneByBudget, predictNextIntent, formatNextTurnPrediction, type NextTurnPrediction, analyzeCrossModuleFeedback, formatCognitiveFeedback, type CognitiveFeedbackAnalysis, generateToolChainSuggestion, formatToolChainSuggestion, type ToolChainSuggestion, mineToolPatterns, type ToolUsageRecord, analyzeConversationMomentum, formatMomentumState, type MomentumState, calibratePersona, formatPersonaCalibration, type PersonaCalibration, detectKnowledgeGaps, formatKnowledgeGapAnalysis, type KnowledgeGapAnalysis, assessIntentChainHealth, formatIntentChainHealth, type IntentChainHealth, computeConversationEnergy, formatConversationEnergy, type ConversationEnergy, suggestResponseStructure, formatResponseStructureGuidance } from './background-tasks.js';
import { loadPlugins, registerPlugin as registerPluginExternal, unloadPlugin as unloadPluginExternal, type PluginLifecycleDeps } from './plugin-lifecycle.js';
import { executeToolCalls as executeToolCallsFromResponse, type ResponseProcessorDeps } from './response-processor.js';
import { extractFacts, type ExtractedFact } from './fact-extractor.js';
import { mapSensoryPriority, mapSensoryChannelToSource } from './sensory-mapper.js';
import { PersonaEngine, DEFAULT_PERSONA_CONFIG, type PersonaEngineConfig, type PersonaDNAConfig } from '../persona/engine.js';
import { initOdysseusDir } from '../config/types.js';
import { SkillManager, type SkillExecutionResult } from '../skills/manager.js';
import { SessionManager, type SessionSnapshot } from '../session/index.js';
import { Logger } from '../log/index.js';
import { PeriodicMemoryGuard, trimArray, trimAgentState } from './memory-guard.js';

/**
 * 生成唯一 ID
 */
function generateId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

const WRAP_UP = /\b(thanks?|thank you|bye|goodbye|see you|got it|that's all|done|完美|谢|再见|好了|差不多了|搞定)\b/i;
const TECHNICAL = /\b(function|class|error|bug|fix|implement|test|deploy|code|api|debug|refactor|type|interface|import|export)\b/i;

/**
 * Odysseus Agent - 主 Agent 类
 *
 * 编排所有核心模块，提供统一的启动和停止接口
 */
export class OdysseusAgent implements IDriveSource {
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
  cellManager!: ColumnManager;
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
  evolutionEngine!: SelfEvolutionEngine;
  cerebellum!: Cerebellum;
  longTaskEngine!: LongTaskEngine;
  iterativeRefiner!: IterativeRefiner;
  errorRecovery!: ErrorRecoveryManager;
  selfMonitor!: SelfMonitor;
  instructionParser!: InstructionParser;
  stepVerifier!: StepVerifier;
  selfReviewer!: SelfReviewer;
  autonomousExplorer!: AutonomousExplorer;
  deliveryReport!: DeliveryReportGenerator;
  scheduledRunner!: ScheduledTaskRunner;
  readonly hooks: LifecycleHooks = new LifecycleHooks();
  readonly middleware: MiddlewarePipeline = new MiddlewarePipeline();
  readonly contextWindow: ContextWindowManager = new ContextWindowManager();

  // 对话上下文（工作记忆窗口）— 无硬上限，由 ContextWindowManager 智能裁剪
  private conversationHistory: Array<{ role: 'user' | 'assistant'; content: string; timestamp: number }> = [];
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
    this.sessionDir = config.sessionDir ?? path.join(os.homedir(), '.odysseus', 'sessions');
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

    this.logger.info('Booting Odysseus Agent...');

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
          const ColumnRoleMap: Record<string, import('@odysseus/core').ColumnRole> = {
            researcher: ColumnRole.Researcher,
            artisan: ColumnRole.Artisan,
            negotiator: ColumnRole.Negotiator,
            evolver: ColumnRole.Evolver,
            prime: ColumnRole.Prime,
          };
          for (const cell of snapshot.agentState.cells) {
            if (cell.id === 'prime' || cell.type === 'prime') continue;
            const cellType = cell.type ? ColumnRoleMap[cell.type] : undefined;
            if (!cellType) continue;
            const cellId: ColumnId = {
              id: cell.id,
              type: cellType,
              instance: 0,
            };
            this.synapse.registerColumn(cellId, {
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

    this.logger.info('Odysseus Agent booted successfully!');

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

    // Resume active plans from previous session
    const resumedPlans = this.planExecutor.getActivePlans();
    if (resumedPlans.length > 0) {
      const totalPending = resumedPlans.reduce(
        (sum, p) => sum + p.steps.filter(s => s.status === 'ready').length, 0,
      );
      if (totalPending > 0) {
        this.logger.info(
          `Persistent plans: ${resumedPlans.length} active plan(s) with ${totalPending} pending steps — will resume on first interaction`,
        );
        this.hasResumedPlans = true;
      }
    }

    await this.hooks.emit('boot:complete');
  }

  /**
   * 停止 Agent
   */
  async shutdown(): Promise<void> {
    if (!this.status.running) {
      return;
    }

    this.logger.info('Shutting down Odysseus Agent...');

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

    // 停止自我监控和长程任务引擎
    this.selfMonitor?.stop();
    this.longTaskEngine?.destroy();
    this.scheduledRunner?.destroy();
    this.logger.info('SelfMonitor, LongTaskEngine and ScheduledTaskRunner stopped');

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

    this.logger.info('Odysseus Agent shut down complete.');

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
    const allCells = this.synapse.getAllColumns();
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
  spawnCell(type: string, task: string): ColumnId | null {
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
  getColumnStatus(): ColumnStatusReport[] {
    return this.cellManager.getColumnStatus();
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

      // 注册长程任务追踪
      this.longTaskEngine.registerTask(
        `task_${goal.id}`,
        goal.description,
        plan,
        { goalId: goal.id, priority },
      );
      this.logger.info(`LongTaskEngine: registered task for goal "${goal.description.slice(0, 50)}"`);

      // 评估计划质量
      const quality = this.planExecutor.scorePlan(plan.id);
      if (quality.score < 0.5) {
        this.logger.warn(`Plan quality low (${quality.score.toFixed(2)}): ${quality.issues.join('; ')}`);
      }

      this.hooks.emit('goal:created', { goalId: goal.id, description }).catch(() => {});
      MetricsCollector.getInstance().goalsCreated.inc();

      this.consciousness.emit({
        type: 'plan.created',
        source: 'prefrontal',
        data: {
          goalId: goal.id,
          description,
          stepCount: plan.steps.length,
          quality: quality.score,
          issues: quality.issues,
          steps: plan.steps.map(s => s.description),
        },
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
    this.cellManager = new ColumnManager(this.synapse);
    this.cellManager.registerPrimeCell();

    // 工具执行器
    this.tools = new ToolExecutor();

    // 主循环
    const loopConfig: LoopConfig = {
      ...DEFAULT_LOOP_CONFIG,
      debugLogging: this.config.debugLogging,
      dreamingMode: this.config.memory.dreamingEnabled,
      driveSource: this,
      driveIntervalMs: 3000,
    };

    this.brainstem = new BrainstemLoop(
      this.config.llm,
      this.tools,
      loopConfig,
    );

    // 上下文窗口绑定 LLM 用于智能摘要
    this.contextWindow.bindLLM(this.config.llm);

    // 根据 provider 能力动态调整上下文预算
    const caps = this.resolveProviderCapabilities();
    if (caps) this.contextWindow.setProviderCapabilities(caps);

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

    // 任务委派器（传入 recallStore 实现重载精炼）
    const primeColumnId: ColumnId = { id: 'prime', type: ColumnRole.Prime, instance: 0 };
    this.taskDelegate = new TaskDelegate(
      this.synapse,
      this.config.llm,
      primeColumnId,
      this.config.debugLogging ? (msg: string) => this.logger.info(msg) : undefined,
      this.contextWindow.recallStore,
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
      getColumnStatus: () => this.getColumnStatus(),
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
      confirmToolAction: (name) => this.toolPermissions.deny(name),
      getHealthReport: () => MetricsCollector.getInstance().healthCheck(),
      getMetricsSnapshot: () => MetricsCollector.getInstance().snapshot(),
      getNarrative: () => this.hippocampus.getNarrative(),
      getPredictions: () => this.persona.getPredictions(),
      getEmotionalState: () => this.persona.emotionalState.exportState(),
      getSynapseInfo: () => {
        const allCells = this.synapse.getAllColumns();
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
      initConfigDir: () => initOdysseusDir(),
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

    // Register odysseus-core built-in tools (web search, file ops, shell, etc.)
    const coreTools = getBuiltinTools();
    for (const tool of coreTools) {
      try {
        this.tools.register(tool);
      } catch {
        // Tool may already be registered (e.g. memory_store overlap)
      }
    }

    // Configure sandbox mode from env (strict | standard | open)
    const sandboxMode = (process.env.ODYSSEUS_SANDBOX ?? 'strict') as import('@odysseus/core').SandboxMode;
    const { ExecuteShellTool } = await import('@odysseus/core');
    ExecuteShellTool.sandboxMode = sandboxMode;
    this.logger.info(`Sandbox mode: ${sandboxMode}`);

    // 自动加载插件
    await this.loadPlugins();

    // 为所有加载的插件发出 hook
    for (const p of this.pluginManager.getLoadedPlugins()) {
      await this.hooks.emit('plugin:loaded', { name: p.name, version: p.version });
    }

    // 初始化 ToolForge — 运行时能力扩展引擎
    this.toolForge = new ToolForge(this.tools, {
      dynamicDir: path.join(os.homedir(), '.odysseus', 'plugins', 'dynamic'),
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
      onAfterModify: async (filePath: string, _content: string) => {
        this.hooks.emit('tool:result', {
          tool: 'self_modify',
          file: path.relative(projectRoot, filePath),
        });

        // 热重载：如果是动态工具文件，原子替换到 ToolForge
        if (this.toolForge) {
          try {
            const result = await this.toolForge.hotReload(filePath);
            if (result) {
              if (result.success) {
                this.logger.info(`Hot reload: ${path.basename(filePath)} → ${result.data?.name}`);
              } else {
                this.logger.warn(`Hot reload failed for ${path.basename(filePath)}: ${result.error}`);
              }
            }
          } catch (err) {
            this.logger.warn(`Hot reload error: ${err instanceof Error ? err.message : String(err)}`);
          }
        }
      },
    }));
    this.tools.register(new SelfListTool(projectRoot));

    // SelfEvolutionEngine — autonomous capability improvement loop
    const sourceMutator: SourceMutator = {
      readFile: async (filePath: string) => {
        return fs.promises.readFile(filePath, 'utf-8');
      },
      writeFile: async (filePath: string, content: string) => {
        await fs.promises.writeFile(filePath, content, 'utf-8');
      },
      compile: async (projectRoot: string) => {
        const { execFileSync } = await import('node:child_process');
        try {
          execFileSync('npx', ['tsc', '--noEmit'], {
            cwd: path.join(projectRoot, 'packages', 'odysseus-app'),
            timeout: 30000,
            encoding: 'utf-8',
          });
          return { success: true, errors: '' };
        } catch (err: unknown) {
          const output = (err as { stdout?: string; stderr?: string }).stderr ?? String(err);
          return { success: false, errors: output.slice(0, 500) };
        }
      },
    };
    this.evolutionEngine = new SelfEvolutionEngine({
      toolForge: this.toolForge,
      essenceForge: this.essenceForge,
      tools: this.tools,
      llm: {
        complete: async (prompt: string) => {
          return this.callLLMWithRetry(prompt, '');
        },
      },
      mutator: sourceMutator,
    });
    this.tools.register(new EvolveAuditTool(this.evolutionEngine));
    this.tools.register(new EvolveSelfTool(this.evolutionEngine));
    this.tools.register(new EvolveStatusTool(this.evolutionEngine));
    this.tools.register(new MutateSourceTool(this.evolutionEngine));

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

    // Long Task Engine — 长程任务执行引擎
    this.longTaskEngine = new LongTaskEngine({
      timeBudget: UNLIMITED_BUDGET,
      logger: {
        info: (msg: string) => this.logger.info(msg),
        warn: (msg: string) => this.logger.warn(msg),
        error: (msg: string) => this.logger.error(msg),
        debug: (msg: string) => this.logger.debug(msg),
      },
      persistCheckpoint: async (checkpoint: TaskCheckpoint) => {
        const checkpointDir = path.join(this.sessionDir, 'checkpoints');
        await fs.promises.mkdir(checkpointDir, { recursive: true });
        const filePath = path.join(checkpointDir, `${checkpoint.taskId}.json`);
        await fs.promises.writeFile(filePath, JSON.stringify(checkpoint, null, 2));
      },
      loadCheckpoint: async (taskId: string) => {
        const filePath = path.join(this.sessionDir, 'checkpoints', `${taskId}.json`);
        try {
          const data = await fs.promises.readFile(filePath, 'utf8');
          return JSON.parse(data) as TaskCheckpoint;
        } catch { return null; }
      },
    });

    // Iterative Refiner — 迭代优化循环
    this.iterativeRefiner = new IterativeRefiner();

    // Error Recovery Manager — 错误恢复管理器
    this.errorRecovery = new ErrorRecoveryManager(
      undefined,
      {
        info: (msg: string) => this.logger.info(msg),
        warn: (msg: string) => this.logger.warn(msg),
        error: (msg: string) => this.logger.error(msg),
        debug: (msg: string) => this.logger.debug(msg),
      },
    );

    // Self Monitor — 自我监控系统
    this.selfMonitor = new SelfMonitor(
      undefined,
      {
        info: (msg: string) => this.logger.info(msg),
        warn: (msg: string) => this.logger.warn(msg),
        error: (msg: string) => this.logger.error(msg),
        debug: (msg: string) => this.logger.debug(msg),
      },
    );

    // Instruction Parser — 结构化指令解析
    this.instructionParser = new InstructionParser(this.config.llm);

    // Step Verifier — 多维度步骤验证
    this.stepVerifier = new StepVerifier();

    // Delivery Report Generator — 执行报告与交付
    this.deliveryReport = new DeliveryReportGenerator();

    // Self Reviewer — 执行后自审查
    this.selfReviewer = new SelfReviewer();

    // Autonomous Explorer — 自主好奇心探索
    this.autonomousExplorer = new AutonomousExplorer({
      curiosity: new CuriosityEngine(),
      callLLM: (prompt) => this.callLLMWithRetry(prompt, ''),
      executeTool: (name, params) => this.executeToolWithRecovery(name, params as Record<string, unknown>),
      consciousness: this.consciousness,
      logger: this.logger,
    });

    // Scheduled Task Runner — 定时任务调度
    this.scheduledRunner = new ScheduledTaskRunner();
  }

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
      // TUI 模式下工具链动画已覆盖 — 跳过 raw action 输出避免打乱渲染
      if (this.cliChannel?.muted) return;
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

    // 当计划步骤完成时，递归检查是否还有下一步
    this.brainstem.on('actionExecuted', (_state) => {
      if (!this.processing) {
        const next = this.getNextPlanStep();
        if (next) {
          this.executeNextPlanStep().catch(err => {
            this.logger.error('Auto-chain plan step failed', err);
          });
        }
      }
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

      // 自审查：执行后质量检查
      const stepResult: StepResult = {
        success: result.success,
        output: result.output,
        error: result.error,
        completedAt: Date.now(),
      };

      const plan = this.planExecutor.getPlan(planId);
      const previousResults = plan
        ? plan.steps
            .filter(s => s.result && (s.status === 'completed' || s.status === 'skipped'))
            .map(s => ({ description: s.description, result: s.result! }))
        : [];

      const reviewResult = this.selfReviewer.review({
        stepDescription: step.description,
        result: stepResult,
        previousResults,
      });

      if (!reviewResult.passed) {
        this.logger.info(`Self-review issues: ${reviewResult.issues.join('; ')}`);
      }

      this.consciousness.emit({
        type: 'execution.progress',
        source: 'prefrontal',
        data: {
          planId,
          stepId: step.id,
          review: { score: reviewResult.score, passed: reviewResult.passed, issues: reviewResult.issues },
        },
      });

      this.planExecutor.reportStepResult(planId, step.id, stepResult);

      this.updatePrefrontalStatus();

      // 检查计划是否完成（复用自审查阶段获取的 plan）
      const updatedPlan = this.planExecutor.getPlan(planId);
      if (updatedPlan) {
        const allCompleted = updatedPlan.steps.every(
          s => s.status === 'completed' || s.status === 'skipped'
        );
        if (allCompleted) {
          this.completedGoalsCount++;
          this.consciousness.emit({
            type: 'goal.completed',
            source: 'prefrontal',
            data: { planId, goalId: updatedPlan.goalId },
          });

          // 生成交付报告
          this.generateAndEmitDeliveryReport(updatedPlan.goalId, updatedPlan);
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

  /** 自主执行连续计数器 */
  private autoContinueCount = 0;
  private consecutiveFailures = 0;
  private hasResumedPlans = false;
  private maxAutoContinues = 200; // 可配置，默认 200（原 20）
  private static readonly INTERMEDIATE_SUMMARY_INTERVAL = 20;
  private static readonly MAX_CONSECUTIVE_FAILURES = 5;

  // ─── IDriveSource — BrainstemLoop 自主驱动接口 ───

  hasPendingWork(): boolean {
    try {
      return this.planExecutor?.getActivePlans()
        .some(p => this.planExecutor.getNextAction(p.id) !== null) ?? false;
    } catch { return false; }
  }

  getNextTaskDescription(): string | null {
    try {
      for (const plan of this.planExecutor?.getActivePlans() ?? []) {
        const step = this.planExecutor.getNextAction(plan.id);
        if (step) return step.description;
      }
    } catch { /* planExecutor not ready */ }
    return null;
  }

  getTaskContext(): Record<string, unknown> {
    try {
      const plans = this.planExecutor?.getActivePlans() ?? [];
      return {
        activePlans: plans.length,
        steps: plans.map(p => ({
          id: p.id,
          goal: p.goalId,
          pending: p.steps.filter(s => s.status === 'ready').length,
        })),
      };
    } catch { return { activePlans: 0 }; }
  }

  /**
   * 自主执行循环：检查未完成的 plan steps，自动入队执行
   */
  private async checkAndAutoContinue(
    channel: string,
    onToken?: (token: string) => void,
    onStatus?: (status: string) => void,
  ): Promise<void> {
    if (this.autoContinueCount >= this.maxAutoContinues) return;
    if (this.inputQueue.length > 0) return;

    // 停滞检测 — 如果 SelfMonitor 报告停滞，降低自动继续频率
    const stagnation = this.selfMonitor?.detectStagnation();
    if (stagnation?.isStagnant) {
      this.logger.warn(`SelfMonitor: stagnation detected — ${stagnation.suggestedAction}`);
      this.consciousness.emit({
        type: 'execution.log',
        source: 'prefrontal',
        data: { phase: 'stagnation', type: stagnation.stagnationType, action: stagnation.suggestedAction },
      });
      // 停滞时仍然继续，但记录状态
    }

    const activePlans = this.planExecutor.getActivePlansSorted();
    if (activePlans.length === 0) return;

    // Dynamic attention: plans sorted by attention score — highest priority plan gets next step
    for (const plan of activePlans) {
      let nextStep = this.planExecutor.getNextAction(plan.id);
      if (!nextStep) continue;

      // Auto-decompose compound steps that haven't been decomposed yet
      if (nextStep.isCompound && !nextStep.subPlanId && this.planExecutor.getPlanDepth(plan.id) < 3) {
        try {
          const goal = { id: plan.goalId, description: nextStep.description, priority: 0.5, status: 'planning' as const, createdAt: Date.now() };
          const subPlan = await this.planner.decomposeStep(plan, nextStep, goal);
          this.planExecutor.registerSubPlan(subPlan, plan.id, nextStep.id);
          this.logger.info(`Hierarchical decompose: step "${nextStep.description}" → sub-plan ${subPlan.id} (${subPlan.steps.length} steps)`);
          // Re-fetch next action — now it should drill into sub-plan
          nextStep = this.planExecutor.getNextAction(plan.id);
          if (!nextStep) continue;
        } catch {
          // Fall through — execute the compound step as-is
        }
      }

      this.autoContinueCount++;

      const depth = this.planExecutor.getPlanDepth(plan.id);
      const depthPrefix = depth > 0 ? `${'└'.repeat(depth)} ` : '';
      const stepDesc = nextStep!.description;
      const autoInput = `[AUTO-CONTINUE] ${depthPrefix}Plan "${plan.goalId}" step ${nextStep!.order + 1}/${plan.steps.length}: ${stepDesc}`;

      onStatus?.(`Auto-continue: ${stepDesc.slice(0, 40)}...`);

      // 入队自主输入，复用现有队列机制
      this.inputQueue.push({
        content: autoInput,
        channel,
        resolve: () => {},
        reject: () => {},
        onToken,
      });

      this.logger.info(`Auto-continue #${this.autoContinueCount}: "${stepDesc}"`);
      return; // 只入队一个 step，避免一次性全部排队
    }
  }

  /**
   * 自主执行快速路径 — 跳过用户专用处理，直接执行 plan step
   */
  private async processAutoContinue(
    content: string,
    onToken?: (token: string) => void,
    onStatus?: (status: string) => void,
  ): Promise<{ content: string }> {
    this.lastActivityAt = Date.now();
    onStatus?.('Auto-executing...');

    // SelfMonitor 记录循环开始
    const cycleStart = Date.now();

    // 解析 plan ID 和 step 信息
    const planMatch = content.match(/Plan "([^"]+)" step (\d+)\/(\d+): (.+)/);
    const stepDesc = planMatch ? planMatch[4] : content.replace('[AUTO-CONTINUE] ', '');
    const goalId = planMatch ? planMatch[1] : '';
    const stepNum = planMatch ? parseInt(planMatch[2]) : 0;
    const totalSteps = planMatch ? parseInt(planMatch[3]) : 0;

    // 发射执行进度事件
    if (planMatch) {
      this.consciousness.emit({
        type: 'execution.progress',
        source: 'prefrontal',
        data: {
          goalId,
          step: stepNum,
          total: totalSteps,
          description: stepDesc,
          autoContinueCount: this.autoContinueCount,
        },
      });
    }

    // 构建 prompt（轻量版 — 不含用户画像、情感等）
    const systemContext = this.buildSystemPrompt(stepDesc);
    this.consciousness.emit({
      type: 'execution.log',
      source: 'prefrontal',
      data: { phase: 'execute', step: stepNum, total: totalSteps, description: stepDesc },
    });
    const response = await this.runNativeToolLoop(stepDesc, systemContext, onToken, onStatus);

    // 最小状态更新 — 只记对话历史
    this.conversationHistory.push({ role: 'user', content, timestamp: Date.now() });
    this.conversationHistory.push({ role: 'assistant', content: response, timestamp: Date.now() });
    this.trimHistory();

    this.logger.info(`Auto-continue completed: "${stepDesc.slice(0, 50)}" → ${response.length} chars`);

    // 中间摘要：每 N 轮触发一次 LLM 深度摘要，防止长程执行中上下文退化
    if (this.autoContinueCount % OdysseusAgent.INTERMEDIATE_SUMMARY_INTERVAL === 0 && this.autoContinueCount > 0) {
      this.triggerIntermediateSummary();
    }

    // SelfMonitor 记录循环耗时和行动结果
    const cycleDuration = Date.now() - cycleStart;
    this.selfMonitor?.recordCycleTime(cycleDuration);
    this.selfMonitor?.recordAction('auto-continue', stepDesc, cycleDuration, response.length > 10);

    // 多维度验证 + LongTaskEngine 更新进度
    const verification = this.stepVerifier.verify(stepDesc, response);
    if (goalId) {
      const taskId = `task_${goalId}`;
      this.longTaskEngine?.recordStepCompletion(taskId, `step_${stepNum}`, {
        success: verification.valid,
        output: response.slice(0, 200),
        error: verification.valid ? undefined : verification.reason,
        completedAt: Date.now(),
      });
    }

    // 验证失败时记录 IterativeRefiner 指标，供后续策略决策
    if (!verification.valid) {
      this.iterativeRefiner?.recordMetric({
        name: `step_${stepNum}_quality`,
        value: verification.overallScore,
        direction: 'higher',
        unit: 'score',
        timestamp: Date.now(),
      });
    }

    // 质量门控 + 自主执行循环强化
    if (verification.valid) {
      this.consecutiveFailures = 0;
    } else {
      this.consecutiveFailures++;
    }

    // Persist plan state to disk after each auto-continue step
    this.saveSession();

    // 质量门控：连续 N 步失败时暂停，发射告警
    if (this.consecutiveFailures >= OdysseusAgent.MAX_CONSECUTIVE_FAILURES) {
      this.logger.warn(`Quality gate: ${this.consecutiveFailures} consecutive failures — pausing auto-continue`);
      this.consciousness.emit({
        type: 'execution.log',
        source: 'prefrontal',
        data: {
          phase: 'quality-gate-paused',
          consecutiveFailures: this.consecutiveFailures,
          suggestedStrategy: verification.suggestedStrategy,
        },
      });

      // 策略恢复：根据 StepVerifier 建议自动采取行动
      if (verification.suggestedStrategy === 'decompose') {
        this.deliveryReport?.recordDecision(`Quality gate: decomposing failing step after ${this.consecutiveFailures} failures`);
        this.logger.info(`Meta-cognitive recovery: decomposing step in plan ${goalId}`);
        // Find the current plan and try hierarchical decomposition
        const activePlans = this.planExecutor.getActivePlans();
        const currentPlan = activePlans.find(p => p.goalId === goalId);
        if (currentPlan) {
          const failingStep = currentPlan.steps.find(s => s.status === 'ready' || s.status === 'executing');
          if (failingStep && !failingStep.isCompound && this.planExecutor.getPlanDepth(currentPlan.id) < 3) {
            try {
              const goal = { id: goalId, description: failingStep.description, priority: 0.5, status: 'planning' as const, createdAt: Date.now() };
              const subPlan = await this.planner.decomposeStep(currentPlan, failingStep, goal);
              this.planExecutor.registerSubPlan(subPlan, currentPlan.id, failingStep.id);
              this.logger.info(`Decomposed failing step → sub-plan ${subPlan.id} (${subPlan.steps.length} steps)`);
              this.consecutiveFailures = 0;
            } catch {
              this.logger.warn('Decompose recovery failed — falling back to replan');
              const updatedPlan = this.planner.replan(currentPlan, failingStep.id);
              this.planExecutor.replacePlan(currentPlan.id, updatedPlan);
              this.consecutiveFailures = 0;
            }
          }
        }
        this.consciousness.emit({
          type: 'execution.log',
          source: 'prefrontal',
          data: { phase: 'meta-cognitive-recovery', strategy: 'decompose', goalId },
        });
      } else if (verification.suggestedStrategy === 'replan') {
        this.deliveryReport?.recordDecision(`Quality gate: replanning after ${this.consecutiveFailures} failures`);
        const activePlans = this.planExecutor.getActivePlans();
        const currentPlan = activePlans.find(p => p.goalId === goalId);
        if (currentPlan) {
          const failingStep = currentPlan.steps.find(s => s.status === 'ready');
          if (failingStep) {
            const updatedPlan = this.planner.replan(currentPlan, failingStep.id);
            this.planExecutor.replacePlan(currentPlan.id, updatedPlan);
            this.logger.info(`Replanned: ${updatedPlan.steps.length} new steps`);
          }
        }
        this.consecutiveFailures = 0;
        this.consciousness.emit({
          type: 'execution.log',
          source: 'prefrontal',
          data: { phase: 'meta-cognitive-recovery', strategy: 'replan', goalId },
        });
      } else {
        this.deliveryReport?.recordDecision(`Quality gate triggered ${verification.suggestedStrategy} after ${this.consecutiveFailures} failures`);
        this.consecutiveFailures = 0;
      }

      // 不继续递归，让下一轮 checkAndAutoContinue 或用户输入决定
      return { content: response };
    }

    // 停滞检测：SelfMonitor 报告停滞时降低递归速率
    const stagnation = this.selfMonitor?.detectStagnation();
    if (stagnation?.isStagnant) {
      // 停滞时只执行一步就暂停，不连续递归
      this.logger.info(`Stagnation detected (${stagnation.stagnationType}) — slowing auto-continue`);
    }

    // 递归检查是否还有下一步要执行
    const nextStep = this.getNextPlanStep();
    if (nextStep && this.autoContinueCount < this.maxAutoContinues) {
      this.autoContinueCount++;
      this.logger.info(`Auto-drive recursion: continuing to next step "${nextStep.step.description.slice(0, 50)}"`);
      this.inputQueue.push({
        content: `[AUTO-CONTINUE] Plan "${nextStep.planId}" step ${nextStep.step.order + 1}/${this.planExecutor.getPlan(nextStep.planId)?.steps.length ?? '?'}: ${nextStep.step.description}`,
        channel: 'internal',
        resolve: () => {},
        reject: () => {},
      });
    }

    // 发射验证事件（包含多维度评分和策略建议）
    if (!verification.valid) {
      this.logger.warn(`Step verification failed (score=${verification.overallScore.toFixed(2)}): ${verification.reason}`);
      this.consciousness.emit({
        type: 'execution.log',
        source: 'prefrontal',
        data: {
          phase: 'verify-failed',
          step: stepNum,
          reason: verification.reason,
          score: verification.overallScore,
          strategy: verification.suggestedStrategy,
          dimensions: verification.dimensions.map(d => `${d.dimension}=${d.score.toFixed(2)}`),
        },
      });
    } else {
      this.consciousness.emit({
        type: 'execution.log',
        source: 'prefrontal',
        data: { phase: 'verify-passed', step: stepNum, score: verification.overallScore, responseLength: response.length },
      });
    }

    return { content: response };
  }

  /**
   * 智能裁剪对话历史 — 不使用硬截断，交给 ContextWindowManager
   *
   * 当历史超过软阈值时，用 ContextWindowManager 生成摘要并保留关键信息，
   * 而非暴力 slice 丢弃。
   */
  private trimHistory(): void {
    const SOFT_LIMIT = 200; // ~100 轮对话（从 400 降低，防止内存膨胀）
    if (this.conversationHistory.length <= SOFT_LIMIT) return;

    // 将旧消息交给 ContextWindowManager 做智能摘要
    const cutoff = Math.floor(SOFT_LIMIT * 0.6); // 保留最近 60%
    const older = this.conversationHistory.slice(0, this.conversationHistory.length - cutoff);
    const recent = this.conversationHistory.slice(this.conversationHistory.length - cutoff);

    const contextMessages: ContextMessage[] = older.map(m => ({
      role: m.role,
      content: m.content,
      timestamp: m.timestamp,
    }));

    // 触发 ContextWindowManager 摘要（LLM 异步，不阻塞）
    this.contextWindow.manage(contextMessages);

    // 关键 plan step 结果提取为 facts
    for (const msg of older) {
      if (msg.role === 'assistant' && msg.content.includes('[AUTO-CONTINUE]')) {
        const planMatch = msg.content.match(/step (\d+)\/(\d+): (.+)/);
        if (planMatch) {
          this.contextWindow.addFact(`Plan step ${planMatch[1]}/${planMatch[2]}: ${planMatch[3].slice(0, 100)}`);
        }
      }
    }

    // 保留最近消息 + ContextWindowManager 管理的摘要会注入到 prompt 构建中
    this.conversationHistory = recent;
    this.logger.info(`History trimmed: ${older.length} old messages → ContextWindowManager summary`);

    // 同步裁剪元数据数组（防止长期运行内存膨胀）
    this.responseTimes = trimArray(this.responseTimes, 200);
    this.recentTopics = trimArray(this.recentTopics, 50);
    this.intentHistory = trimArray(this.intentHistory, 100);
    this.rhythmSamples = trimArray(this.rhythmSamples, 200);
    this.recentResponses = trimArray(this.recentResponses, 50);
    this.recentToolResults = trimArray(this.recentToolResults, 100);
  }

  /**
   * 中间摘要 — 长程执行中定期对当前对话历史做深度 LLM 摘要
   *
   * 将最近 N 轮 auto-continue 的关键成果提取为 facts，
   * 防止随着步数增长而丢失早期关键决策和结果。
   */
  private triggerIntermediateSummary(): void {
    const recentHistory = this.conversationHistory.slice(-OdysseusAgent.INTERMEDIATE_SUMMARY_INTERVAL * 4);
    const contextMessages: ContextMessage[] = recentHistory.map(m => ({
      role: m.role,
      content: m.content,
      timestamp: m.timestamp,
    }));

    // 交给 ContextWindowManager 做智能摘要（异步 LLM）
    this.contextWindow.manage(contextMessages);

    // 从最近的 assistant 回复中提取关键成果作为 facts
    const recentAssistantMsgs = recentHistory
      .filter(m => m.role === 'assistant')
      .slice(-5);

    for (const msg of recentAssistantMsgs) {
      // 提取前 200 字符作为摘要 fact
      const summary = msg.content.slice(0, 200).replace(/\n/g, ' ').trim();
      if (summary.length > 30) {
        this.contextWindow.addFact(`[auto-continue #${this.autoContinueCount}] ${summary}`);
      }
    }

    this.logger.info(`Intermediate summary triggered at auto-continue #${this.autoContinueCount}`);
  }

  /**
   * 生成并发射交付报告
   */
  private generateAndEmitDeliveryReport(goalId: string, plan: { steps: Array<{ id: string; description: string; order: number; status: string }> }): void {
    const taskId = `task_${goalId}`;

    const stepDetails: StepReport[] = plan.steps.map(step => ({
      stepId: step.id,
      description: step.description,
      order: step.order,
      status: (step.status === 'completed' ? 'completed'
        : step.status === 'failed' ? 'failed' : 'skipped') as StepReport['status'],
    }));

    const report = this.deliveryReport.generate(taskId, {
      getGoal: () => goalId,
      getStepReports: () => stepDetails,
      getElapsedTime: () => {
        const checkpoint = this.longTaskEngine?.getCheckpoint(taskId);
        return checkpoint ? Date.now() - checkpoint.startedAt : 0;
      },
      getKeyDecisions: () => [],
      getCodeChanges: () => [],
    });

    const formatted = this.deliveryReport.formatReport(report);

    this.consciousness.emit({
      type: 'delivery.report',
      source: 'prefrontal',
      data: { report, formatted },
    });

    this.logger.info(`Delivery report generated for ${goalId}: ${report.deliveryStatus} (quality=${(report.qualityScore * 100).toFixed(0)}%)`);
  }

  /**
   * 验证 step 执行结果 — 委托给 StepVerifier 多维度验证
   */
  private verifyStepResult(stepDesc: string, response: string): { valid: boolean; reason?: string } {
    const result = this.stepVerifier.verify(stepDesc, response);
    return { valid: result.valid, reason: result.reason };
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
   * 带 ErrorRecovery 的工具执行 — per-tool circuit breaker + exponential backoff
   *
   * 每个工具名有独立的 circuit breaker，防止一个工具的故障级联到其他工具。
   * 失败时自动重试（backoff），多次失败后熔断。
   */
  private async executeToolWithRecovery(
    toolName: string,
    params: Record<string, unknown>,
  ): Promise<{ success: boolean; data?: unknown; error?: string }> {
    try {
      return await this.errorRecovery.executeWithRecovery(
        `tool:${toolName}`,
        () => this.tools.execute(toolName, params),
        async (error) => {
          // fallback：返回结构化错误而非抛出异常
          this.logger.info(`[ErrorRecovery] Tool "${toolName}" fallback after error: ${error instanceof Error ? error.message : String(error)}`);
          return {
            success: false,
            error: `Tool "${toolName}" failed after recovery attempts: ${error instanceof Error ? error.message : String(error)}`,
          };
        },
      );
    } catch {
      // 极端情况：recovery 自身也失败
      return { success: false, error: `Tool "${toolName}" unrecoverable failure` };
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
        const result = await this.executeToolWithRecovery(
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
              const retry = await this.executeToolWithRecovery(
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
    const planContext = this.buildStepExecutionContext(step);
    const prompt = `Execute this plan step. Use tools if needed, otherwise provide direct analysis.

${planContext}

Plan step: "${step.description}"

If this step requires using a tool, call it. If it's a reasoning/analysis step, provide the analysis directly.`;

    try {
      const systemCtx = this.buildSystemPrompt(step.description);
      const response = await this.runNativeToolLoop(prompt, systemCtx);
      return { success: true, output: response };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  /**
   * 构建 plan step 执行上下文
   */
  private buildStepExecutionContext(step: PlanStep): string {
    const parts: string[] = [];

    // 找到包含此 step 的 plan
    const activePlans = this.planExecutor.getActivePlans();
    const plan = activePlans.find(p => p.steps.some(s => s.id === step.id));
    if (plan) {
      parts.push(`Plan goal: ${plan.goalId}`);

      // 已完成步骤的摘要
      const completedSteps = plan.steps.filter(s => s.status === 'completed');
      const skippedSteps = plan.steps.filter(s => s.status === 'skipped');
      if (completedSteps.length > 0 || skippedSteps.length > 0) {
        parts.push(`Progress (${completedSteps.length}/${plan.steps.length} done${skippedSteps.length > 0 ? `, ${skippedSteps.length} skipped` : ''}):`);
        for (const cs of completedSteps.slice(-5)) {
          const rawOutput = cs.result?.output;
          const summary = rawOutput ? String(rawOutput).slice(0, 100) : '(no output)';
          parts.push(`  ✓ ${cs.description} → ${summary}`);
        }
        for (const ss of skippedSteps.slice(-3)) {
          parts.push(`  ⏭ ${ss.description} (skipped)`);
        }
      }

      // 下一步预览
      const remainingSteps = plan.steps.filter(s => s.status !== 'completed' && s.status !== 'failed' && s.id !== step.id);
      if (remainingSteps.length > 0) {
        parts.push(`Remaining after this: ${remainingSteps.slice(0, 3).map(s => s.description).join(', ')}`);
      }
    }

    // 可用工具列表
    const toolNames = this.tools.list();
    if (toolNames.length > 0) {
      parts.push(`Available tools: ${toolNames.join(', ')}`);
    }

    return parts.join('\n');
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

      // Goal drive bridge: 将 goal_drive 感知桥接到 processInput（完整工具链）
      const perception = state.currentPerception;
      if (perception?.source === 'internal' && perception.data) {
        const d = perception.data as Record<string, unknown>;
        if (d.type === 'goal_drive' && typeof d.description === 'string') {
          const taskDesc = d.description as string;
          if (!this.processing && this.autoContinueCount < this.maxAutoContinues) {
            this.autoContinueCount++;
            this.logger.info(`Goal drive → processInput: "${taskDesc.slice(0, 60)}"`);
            this.processInput(taskDesc, 'internal').catch((err) => {
              this.logger.error('Goal drive processInput error', err);
            });
          }
        }
      }
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

    // 启动自我监控
    this.selfMonitor?.start();
    this.logger.info('SelfMonitor started');

    // 启动定时任务调度器
    this.scheduledRunner?.start();
    this.logger.info('ScheduledTaskRunner started');

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

    // 订阅反思完成事件 — 触发自主探索
    this.brainstem.on('reflectionComplete', () => {
      // 每隔 AUTO_PROACTIVE_INTERVAL 个周期触发一次自主探索
      if (this.loopCount % AUTO_PROACTIVE_INTERVAL === 0) {
        this.autonomousExplorer.explore().catch((err) => {
          this.logger.warn('Autonomous exploration failed:', { error: err instanceof Error ? err.message : String(err) });
        });
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

    // 自主探索：空闲时 Agent 自己去探索世界（取代旧的模板建议）
    const explorationTimer = setInterval(() => {
      const idleMs = Date.now() - this.lastActivityAt;
      if (idleMs > 60 * 1000 && !this.processing) { // 1 min idle
        this.autonomousExplorer.explore().catch(err => {
          this.logger.warn('Autonomous exploration failed', err);
        });

        checkPendingReminders(this.consciousness, this.logger);
      }
    }, 4 * 60 * 1000); // 4 min check
    this.backgroundTimers.push(explorationTimer);

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

    // auto_trace 心跳：每分钟检查一次工具链路健康状况
    const traceHeartbeatTimer = setInterval(async () => {
      try {
        if (this.tools) {
          const autoTrace = this.tools.getInfo('auto_trace');
          if (autoTrace) {
            const heartResult = await this.tools.execute('auto_trace', { action: 'heartbeat' });
            const hd = heartResult.data;
            if (heartResult.success && hd && typeof hd === 'object' && 'needsAttention' in hd && hd.needsAttention) {
              const issues = 'activeIssueCount' in hd ? Number(hd.activeIssueCount) : 0;
              const failureRate = 'failureRate' in hd ? String(hd.failureRate) : 'unknown';
              const health = 'health' in hd ? String(hd.health) : 'unknown';
              this.logger.warn(`[auto_trace] Health degraded: ${failureRate} failure rate, ${issues} active issues`);
              if (health === 'degraded' && this.cerebellum) {
                this.consciousness.emit({
                  type: 'proactive.suggestion' as const,
                  source: 'auto_trace' as string as any,
                  data: {
                    type: 'self_heal',
                    content: `[auto_trace detected degraded health] Initiating self-diagnosis...`,
                    priority: 0.8,
                  },
                });
              }
            }
          }
        }
      } catch {
        // 心跳失败不影响主循环
      }
    }, 60 * 1000); // 每分钟一次
    this.backgroundTimers.push(traceHeartbeatTimer);

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
    const cells = this.getColumnStatus();
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
        version: OdysseusAgent.SESSION_VERSION,
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

    data.version = OdysseusAgent.SESSION_VERSION;
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

      // Detect unfinished plans for potential auto-resume
      const activePlans = this.planExecutor.getActivePlans();
      if (activePlans.length > 0) {
        const totalSteps = activePlans.reduce((sum, p) => sum + p.steps.length, 0);
        const doneSteps = activePlans.reduce((sum, p) => sum + p.steps.filter(s => s.status === 'completed').length, 0);
        this.logger.info(`Resumed ${activePlans.length} active plan(s): ${doneSteps}/${totalSteps} steps done`);
      }

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
    // 用户主动输入 → 重置自主执行计数器
    if (!content.startsWith('[AUTO-CONTINUE]')) {
      this.autoContinueCount = 0;
      this.consecutiveFailures = 0;

      // Acknowledge resumed plans from previous session
      if (this.hasResumedPlans) {
        this.hasResumedPlans = false;
        const activePlans = this.planExecutor.getActivePlans();
        if (activePlans.length > 0) {
          const summaries = activePlans.map(p => {
            const done = p.steps.filter(s => s.status === 'completed').length;
            return `"${p.goalId}" (${done}/${p.steps.length} done)`;
          });
          this.logger.info(`Resuming plans: ${summaries.join(', ')}`);
        }
      }
    }

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

      // === 自主执行循环：检查未完成的 plan steps ===
      this.checkAndAutoContinue(_channel, onToken, onStatus);

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
    // === 自主执行快速路径 ===
    if (content.startsWith('[AUTO-CONTINUE]')) {
      return await this.processAutoContinue(content, onToken, onStatus);
    }

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

        // 检测是否为复杂意图 — 自动创建 plan 并触发自主执行
        const complexIntent = this.detectComplexIntent(innerCtx.input);
        if (complexIntent.isComplex && this.planExecutor.getActivePlans().length === 0) {
          const goal = await this.createGoal(complexIntent.goalDescription, 0.7);
          if (goal) {
            onStatus?.(`Plan created: ${complexIntent.stepCount} steps detected`);
          }
        }

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
          } else if (isOdysseusError(llmError) && !llmError.recoverable) {
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
        this.trimHistory();

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

    const finalResponse = ctx.response ?? '';

    // === 自主推进循环：工具执行完 + 用户任务未完成 → 自动注入推进 prompt ===
    if (finalResponse && !finalResponse.startsWith('[AUTO-CONTINUE]') && !content.startsWith('[AUTO-CONTINUE]')) {
      try {
        // 检查是否还有未完成的 plan steps
        const hasPendingSteps = this.getNextPlanStep() !== null;
        // 检查是否用户明确结束了（非 wrap-up）
        const isUserDone = WRAP_UP.test(content);
        // 检查响应是否是"完成/总结"型的短回复
        const isCompletion = finalResponse.length < 30 || WRAP_UP.test(finalResponse);
        // 响应中没有工具调用了（说明不再需要继续执行工具）
        const noMoreTools = !finalResponse.includes('[TOOL:') && !finalResponse.includes('tool_call');

        if (hasPendingSteps && !isUserDone) {
          // 有 plan steps 未完成 → 自动推进下一步
          this.logger.info('Auto-driving: pending plan steps detected, continuing...');
          this.inputQueue.push({
            content: `[AUTO-CONTINUE] Continuing task: ${this.getNextPlanStep()?.step.description ?? 'next step'}`,
            channel: _channel,
            resolve: () => {},
            reject: () => {},
            onToken,
          });
        } else if (!isUserDone && !isCompletion && noMoreTools && !hasPendingSteps) {
          // 没有 plan steps，但任务可能没做完 → 让 LLM 自我判断是否需要继续
          // 仅当响应中包含"等待下一步指令"或明显的暂停信号时才触发
          const pauseSignals = /还需要我做什么|下一步|继续|还有什么|你想让我|anything else|what else|next|continue/i;
          if (pauseSignals.test(finalResponse)) {
            this.logger.info('Auto-driving: detected pause signal, auto-continuing...');
            const autoContinuePrompt = `[AUTO-CONTINUE] Based on what I've done so far, evaluate if the user's request is fully resolved. If not, continue working. If yes, summarize and stop.`;
            this.inputQueue.push({
              content: autoContinuePrompt,
              channel: _channel,
              resolve: () => {},
              reject: () => {},
              onToken,
            });
          }
        }
      } catch {
        // Auto-drive failure should not block response
      }
    }

    return { content: finalResponse };
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
    const maxAttempts = OdysseusAgent.MAX_LLM_RETRIES;

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
            this.trackCacheStats(result as any);
          }
        } else {
          const result = await this.config.llm.complete(input, systemContext);
          response = result.content;
          this.trackCacheStats(result as any);
        }

        await this.hooks.emit('llm:response', { responseLength: response.length, attempt });
        return response;
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        await this.hooks.emit('llm:error', { error: errMsg, attempt });

        const isLastAttempt = attempt === maxAttempts;
        if (isLastAttempt) throw err;

        const delay = OdysseusAgent.RETRY_BASE_DELAY_MS * Math.pow(2, attempt - 1);
        this.logger.warn(`LLM call failed (attempt ${attempt}/${maxAttempts}), retrying in ${delay}ms: ${errMsg}`);

        // 重试前通知用户
        onToken?.(`\n[Retrying... (${attempt}/${maxAttempts - 1})]\n`);

        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    // 不可达，但 TypeScript 需要
    throw new Error('LLM retry exhausted');
  }

  /** 追踪缓存命中统计（DeepSeek 50x 缓存折扣优化） */
  private cacheStats = { hits: 0, misses: 0, totalCalls: 0 };
  private trackCacheStats(result: { cacheHitTokens?: number; cacheMissTokens?: number }): void {
    this.cacheStats.totalCalls++;
    if (result.cacheHitTokens != null) {
      this.cacheStats.hits += result.cacheHitTokens;
      this.cacheStats.misses += result.cacheMissTokens ?? 0;
      const total = this.cacheStats.hits + this.cacheStats.misses;
      const hitRate = total > 0 ? this.cacheStats.hits / total : 0;
      this.logger.debug(`Cache stats: ${(hitRate * 100).toFixed(0)}% hit rate (${result.cacheHitTokens} hit, ${result.cacheMissTokens ?? 0} miss this call)`);
      // 缓存感知上下文预算调整（DeepSeek 50x 缓存折扣优化）
      if (total > 0) {
        this.contextWindow.updateCacheBudget(hitRate);
      }
    }
  }

  /**
   * 构建工具失败消息（编码工作流感知）
   *
   * build/test 失败时注入修复指导，而非通用"再试一次"。
   * DeepSeek thinking mode 可利用此上下文做精准的错误分析和修复。
   */
  private buildToolFailureMessage(toolName: string, error: string, round: number): string {
    const base = `Tool "${toolName}" failed: ${error}`;
    const isBuildOrTest = /build|test|compile|tsc|eslint|vitest|jest/i.test(toolName);
    if (isBuildOrTest && round <= 8) {
      return `${base}\n\n[FIX PROTOCOL: Read the error above carefully. Identify the root cause. Use self_read to examine the failing file. Make a minimal, targeted fix. Then retry the build/test. Do NOT rewrite entire files — fix only what's broken.]`;
    }
    if (round > 8) {
      return `${base}\n\n[Multiple failures detected. Consider: (1) report current progress to user, (2) try a fundamentally different approach, (3) simplify the task scope.]`;
    }
    return `${base} IMPORTANT: Do NOT give up. Try a different approach, use alternative tools, or break the task into smaller steps.`;
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
  /**
   * Phase 1 纯文本后，如果 LLM 描述了行动意图但不调工具，
   * 强制 follow-up 让它真正执行。
   *
   * 不用关键词匹配 — 只看两个结构信号：
   * 1. 有活跃 plan（plan 系统已捕获意图）
   * 2. Phase 1 响应本身像行动计划（有步骤列表 / 序列结构 / 足够长）
   */
  private async tryBridgeToExecution(
    phase1Response: string,
    _userInput: string,
    systemContext: string,
    onToken?: (token: string) => void,
    onStatus?: (status: string) => void,
  ): Promise<string | null> {
    const hasActivePlan = this.planExecutor.getActivePlans().some(
      p => p.steps.some(s => s.status === 'ready'),
    );

    // 响应结构信号：有序列表、步骤序列、或足够的行动描述长度
    const hasStepStructure = /^\s*\d+[.)]\s/m.test(phase1Response)  // "1. xxx" 或 "1) xxx"
      || /^[•\-–]\s/m.test(phase1Response)                           // bullet list
      || phase1Response.length > 150;                                 // 非简短回复

    if (!hasActivePlan && !hasStepStructure) {
      return null; // 纯对话，不需要桥接
    }

    // 极短回复（< 50 字符）即使是列表也不桥接 — 如 "好，继续。"
    if (phase1Response.trim().length < 50 && !hasActivePlan) {
      return null;
    }

    onStatus?.('Executing planned actions...');

    const bridgePrompt = [
      `You described a plan but didn't execute it. Here's what you said:`,
      `"${phase1Response.slice(0, 800)}"`,
      '',
      'Now EXECUTE your first step using tools.',
      'Use [TOOL: name](params) format to call tools immediately.',
      'Do NOT describe what you will do — actually call the tools now.',
    ].join('\n');

    const execResponse = await this.callLLMWithRetry(bridgePrompt, systemContext, onToken);
    return execResponse;
  }

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
      // 纯文本响应 — 检查是否需要强制工具执行
      // 当 LLM 说"我要做 X"但不调工具时，自动桥接到执行
      const forcedResult = await this.tryBridgeToExecution(
        response, userInput, systemContext, onToken, onStatus,
      );
      if (forcedResult) {
        response = forcedResult;
        // 重新解析工具结果，决定是否进入 Phase 2
        const bridgeToolResult = await this.executeToolCallsFromResponse(response, onToken);
        response = bridgeToolResult.response;
        if (!bridgeToolResult.toolsExecuted) return response;
        // Fall through to Phase 2 below
      } else {
        return response;
      }
    }

    // === 阶段 2：有工具调用 — 进入原生 function calling 循环 ===
    const provider = this.config.llm;
    const supportsNative = 'completeWithTools' in provider
      && typeof (provider as any).completeWithTools === 'function';

    if (!supportsNative) {
      // Provider 不支持原生 function calling — 用文本 follow-up 获取最终响应
      const hasErrors = response.toLowerCase().includes('error') || response.toLowerCase().includes('failed');
      const followUpPrompt = hasErrors
        ? `Some tools failed. Here's what happened:\n${response.slice(0, 2000)}\n\nYou MUST continue working on the user's task. Do NOT just explain the error. Try alternative approaches: use different tools, break the task into smaller steps, or use your own knowledge. Keep working until the task is actually done.`
        : `Based on these tool results, provide your final answer to the user's request:\n${response}`;
      const followUp = await this.callLLMWithRetry(followUpPrompt, systemContext, onToken);
      return followUp;
    }

    const tools = this.buildToolDefinitions();
    if (tools.length === 0) return response;

    // 构建 messages（包含对话上下文 + 第一轮工具结果）
    // 注入编码工作流指导（DeepSeek thinking mode 可利用此上下文做多步规划）
    const caps = this.resolveProviderCapabilities();
    const codingWorkflowHint = (caps?.thinkingMode && caps.maxContext >= 500_000)
      ? '\n\n[CODING WORKFLOW: Follow plan→execute→verify. After each tool call, evaluate the result before proceeding. If build/test fails, read the error output and fix before retrying. Do NOT call unrelated tools when a build fails — focus on fixing the error first.]'
      : '';

    const messages: ChatMessage[] = [
      { role: 'system', content: systemContext + codingWorkflowHint },
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

    // 注入执行上下文标记，使下一步知道当前进度
    const execContext = this.getNextPlanStep()
      ? `[Context: continuing plan — next step: "${this.getNextPlanStep()!.step.description}"]\n`
      : '';

    messages.push({
      role: 'assistant',
      content: `${execContext}I executed tools: ${firstRoundTools}. Results:\n${
        toolResult.response.slice(0, 3000)
      }\n\nContinuing work on the user's request.`,
    });

    let round = 1;
    const callHistory: string[] = [];

    // 无硬性轮次限制 — 通过重复检测和 token 预算自然收敛
    while (true) {
      onStatus?.('Reasoning...');

      let result;
      try {
        result = await (provider as any).completeWithTools(messages, tools);
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        this.logger.warn(`Native function calling failed in loop: ${errMsg}`);
        // 不静默停止 — 让模型基于已有结果继续工作
        try {
          const fallbackPrompt = `A tool execution error occurred: ${errMsg.slice(0, 200)}.\nYou MUST continue working on the user's original task. Based on what you've already accomplished, find an alternative approach. Do NOT just explain the error — actually complete the task or make meaningful progress using other available tools or knowledge.`;
          const fallbackResponse = await this.callLLMWithRetry(fallbackPrompt, systemContext, onToken);
          if (fallbackResponse) return fallbackResponse;
        } catch { /* fallback also failed */ }
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

      // 追加 assistant 消息（带 tool_calls + reasoning_content）
      messages.push({
        role: 'assistant',
        content: result.content || '',
        tool_calls: result.toolCalls,
        ...(result.reasoningContent && { reasoning_content: result.reasoningContent }),
      });

      // ── Pre-flight: repetition detection + permission checks ──
      const approvedCalls: { name: string; params: unknown; id: string }[] = [];

      for (const toolCall of result.toolCalls) {
        const toolName = toolCall.function.name;

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

        // 解析参数 + 权限检查
        let params: unknown;
        try {
          const args = toolCall.function.arguments;
          if (!args || args.trim() === '') {
            params = {};
          } else {
            params = JSON.parse(args);
          }
        } catch {
          // LLM 有时返回非标准 JSON（无引号 key、单引号等）
          // 尝试安全修复后重试
          const raw = toolCall.function.arguments ?? '';
          this.logger.warn(`Tool "${toolName}" args parse failed, attempting repair: ${raw.slice(0, 200)}`);
          try {
            const repaired = raw
              .replace(/'/g, '"')           // 单引号→双引号
              .replace(/(\w+)\s*:/g, '"$1":') // 无引号 key→加引号
              .replace(/,\s*([}\]])/g, '$1');  // 去尾逗号
            params = JSON.parse(repaired);
          } catch {
            this.logger.warn(`Tool "${toolName}" args repair also failed, passing empty params`);
            params = {};
          }
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

        approvedCalls.push({ name: toolName, params, id: toolCall.id ?? '' });
      }

      // ── Execute: batch with parallel read-only + serial write ──
      if (approvedCalls.length > 0) {
        const batchResults = await this.tools.executeBatch(
          approvedCalls.map(c => ({ name: c.name, params: c.params, id: c.id })),
          (toolName, progress) => {
            const label = TOOL_STATUS_LABELS[toolName] ?? toolName;
            if (progress.type === 'start') onStatus?.(`${label} (${round})`);
          },
        );

        // ── Post-process: tracking + lesson extraction + result formatting ──
        for (const batchResult of batchResults) {
          const callId = batchResult.id ?? '';
          const toolName = batchResult.name;

          await this.hooks.emit('tool:execute', { tool: toolName, round });

          // 追踪工具使用效果
          this.recordToolPerformance(toolName, batchResult.result.success, batchResult.durationMs);
          this.recentToolResults.push({ success: batchResult.result.success, timestamp: Date.now() });
          if (this.recentToolResults.length > 30) this.recentToolResults = this.recentToolResults.slice(-30);

          // 从工具失败中提取教训
          if (!batchResult.result.success) {
            const lesson = extractLessonFromToolFailure(toolName, 'execution', batchResult.result.error ?? 'unknown');
            if (lesson) recordLesson(lesson);
          }

          const resultStr = batchResult.result.success
            ? (typeof batchResult.result.data === 'string' ? batchResult.result.data : JSON.stringify(batchResult.result.data))
            : this.buildToolFailureMessage(toolName, batchResult.result.error ?? 'unknown', round);

          const truncated = resultStr.length > 8000
            ? resultStr.slice(0, 8000) + '\n...[truncated]'
            : resultStr;

          messages.push({
            role: 'tool',
            toolCallId: callId,
            content: truncated,
          });

          await this.hooks.emit('tool:result', { tool: toolName, round });
        }
      }
    }

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
      // 优先使用工具声明的真实参数 schema，回退到描述解析
      const parameters = info?.parameters && Object.keys(info.parameters).length > 0
        ? info.parameters
        : parseToolParams(desc);
      return {
        type: 'function' as const,
        function: {
          name,
          description: desc,
          parameters,
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
    this.trimHistory();

    await this.hooks.emit('delegate:complete', { task, cellsUsed: result.totalCellsUsed, durationMs: result.durationMs });

    return result;
  }

  /**
   * 检测用户输入是否隐含多步骤任务
   */
  private detectComplexIntent(input: string): { isComplex: boolean; goalDescription: string; stepCount: number } {
    if (input.length < 20 || input.startsWith('/')) {
      return { isComplex: false, goalDescription: '', stepCount: 0 };
    }

    const signals: number[] = [];

    // 1. 并列动作信号
    const sequentialPatterns = [
      /然后/g, /之后/g, /接着/g, /最后/g, /并且/g,
      /\band\s+then\b/gi, /\bafter\s+(that|which)\b/gi, /\bthen\b/gi, /\bnext\b/gi, /\bfinally\b/gi,
    ];
    let seqCount = 0;
    for (const p of sequentialPatterns) {
      const matches = input.match(p);
      seqCount += matches ? matches.length : 0;
    }
    if (seqCount >= 2) signals.push(3);
    else if (seqCount >= 1) signals.push(1);

    // 2. 多个动词/动作
    const actionVerbs = [
      /\b(创建|实现|开发|构建|写|分析|搜索|调研|设计|测试|部署|配置|修复|优化|重构|检查|验证)\b/g,
      /\b(create|implement|build|write|analyze|search|design|test|deploy|configure|fix|optimize|refactor|check|verify)\b/gi,
    ];
    let actionCount = 0;
    for (const p of actionVerbs) {
      const matches = input.match(p);
      actionCount += matches ? matches.length : 0;
    }
    if (actionCount >= 3) signals.push(3);
    else if (actionCount >= 2) signals.push(1);

    // 3. 因果链
    const causalPatterns = [/\b以便\b/, /\b为了\b/, /\bso\s+that\b/gi, /\bin\s+order\s+to\b/gi];
    let causalCount = 0;
    for (const p of causalPatterns) {
      if (p.test(input)) causalCount++;
    }
    if (causalCount >= 1) signals.push(2);

    // 4. 长度信号
    const sentences = input.split(/[.!?。！？\n]+/).filter(s => s.trim().length > 5);
    if (sentences.length >= 3 && input.length > 80) signals.push(2);
    else if (sentences.length >= 2 && input.length > 50) signals.push(1);

    const score = signals.reduce((sum, s) => sum + s, 0);
    const isComplex = score >= 4;
    const stepCount = Math.min(Math.max(actionCount + seqCount, sentences.length, 2), 8);

    return {
      isComplex,
      goalDescription: isComplex ? input : '',
      stepCount: isComplex ? stepCount : 0,
    };
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
      'PERSONA CALIBRATION',
      'KNOWLEDGE GAPS',
      'INTENT CHAIN HEALTH',
      'CONVERSATION ENERGY',
      'RESPONSE STRUCTURE',
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
      personaCalibration: this.computePersonaCalibration(),
      knowledgeGaps: this.computeKnowledgeGaps(),
      intentChainHealth: this.computeIntentChainHealth(),
      conversationEnergy: this.computeConversationEnergyGuidance(),
      responseStructure: this.computeResponseStructure(),
      sectionWeightOffsets: exportSectionWeights(this.sectionWeights),
      providerCapabilities: this.resolveProviderCapabilities() ?? undefined,
    });

    // 记录活跃 sections 用于后续权重学习
    const active = SECTION_PREFIXES.filter(p => result.includes(p));
    this.sectionWeights = recordActiveSections(this.sectionWeights, active);
    return result;
  }

  /** 从模型名推断 provider capabilities */
  private resolveProviderCapabilities() {
    const model = this.config.llm.getModel();
    // 从模型名推断 provider
    const providerMap: Record<string, string> = {
      'deepseek-': 'deepseek',
      'MiniMax': 'minimax', 'MiniMax-': 'minimax',
      'GLM-': 'glm',
      'qwen-': 'qwen',
      'kimi-': 'moonshot', 'moonshot-': 'moonshot',
    };
    for (const [prefix, provider] of Object.entries(providerMap)) {
      if (model.startsWith(prefix) || model.includes(prefix)) {
        return getProviderCapabilities(provider);
      }
    }
    return undefined;
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
  private lastPersonaCalibration: PersonaCalibration | undefined;
  private lastKnowledgeGapAnalysis: KnowledgeGapAnalysis | undefined;
  private lastIntentChainHealth: IntentChainHealth | undefined;
  private lastConversationEnergy: ConversationEnergy | undefined;

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

  private computePersonaCalibration(): string | undefined {
    const emotionalState = this.persona.emotionalState.exportState();
    const calibration = calibratePersona({
      rhythmCadence: this.rhythmProfile.cadence.replace('-', '_') as 'rapid_fire' | 'measured' | 'deliberate' | 'burst_pause',
      emotionalValence: emotionalState.current?.valence,
      momentumDirection: this.lastMomentumState?.direction,
      fatigueLevel: this.lastFatigueState?.fatigueLevel,
      correctionScore: this.lastCorrectionResult?.overallScore,
    });
    this.lastPersonaCalibration = calibration;
    return formatPersonaCalibration(calibration);
  }

  private computeKnowledgeGaps(): string | undefined {
    const lastUser = this.conversationHistory.filter(m => m.role === 'user').slice(-1)[0];
    if (!lastUser) return undefined;
    const knownEntities = getTopEntities(this.knowledgeGraph.entities, 20).map(e => e.name);
    const analysis = detectKnowledgeGaps(lastUser.content, knownEntities, this.conversationHistory.length);
    this.lastKnowledgeGapAnalysis = analysis;
    return formatKnowledgeGapAnalysis(analysis);
  }

  private computeIntentChainHealth(): string | undefined {
    if (this.intentHistory.length < 3) return undefined;
    const evolution = trackIntentEvolution(this.intentHistory);
    const currentCategory = this.intentHistory[this.intentHistory.length - 1]?.category ?? 'general';
    let turnsSinceChange = 0;
    for (let i = this.intentHistory.length - 1; i >= 0; i--) {
      if (this.intentHistory[i].category === currentCategory) turnsSinceChange++;
      else break;
    }
    const health = assessIntentChainHealth(evolution, currentCategory, turnsSinceChange);
    this.lastIntentChainHealth = health;
    return formatIntentChainHealth(health);
  }

  private computeConversationEnergyGuidance(): string | undefined {
    const userMessages = this.conversationHistory.filter(m => m.role === 'user');
    if (userMessages.length < 3) return undefined;
    const recentLengths = userMessages.slice(-6).map(m => m.content.length);
    const responseTimes = userMessages.slice(-6).map((m, i) => {
      if (i === 0) return 3000;
      const prev = userMessages[userMessages.indexOf(m) - 1];
      return prev?.timestamp && m.timestamp ? Math.max(100, m.timestamp - prev.timestamp) : 3000;
    });
    const emotionalState = this.persona.emotionalState.exportState();
    const energy = computeConversationEnergy(recentLengths, responseTimes, emotionalState.current?.valence);
    this.lastConversationEnergy = energy;
    return formatConversationEnergy(energy);
  }

  private computeResponseStructure(): string | undefined {
    if (!this.lastConversationEnergy && !this.lastMomentumState && !this.lastIntentChainHealth) return undefined;
    const userMsgs = this.conversationHistory.filter(m => m.role === 'user').slice(-10).map(m => m.content);
    const expertise = userMsgs.length >= 3 ? buildUserExpertiseProfile(userMsgs) : undefined;
    const topScore = expertise ? Math.max(...expertise.domains.map(d => d.depth)) : 0;
    const expertiseLevel = topScore > 0.6 ? 'expert' as const : topScore > 0.3 ? 'intermediate' as const : undefined;
    const guidance = suggestResponseStructure(
      this.lastConversationEnergy,
      this.lastMomentumState,
      this.lastIntentChainHealth,
      expertiseLevel,
    );
    return formatResponseStructureGuidance(guidance);
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
   * 从 .odysseus/plugins/ 自动加载插件并注册工具和命令
   */
  private async loadPlugins(): Promise<void> {
    return loadPlugins(this.getPluginDeps());
  }

  /**
   * 注册内联插件（编程方式）
   */
  async registerPlugin(plugin: OdysseusPlugin): Promise<void> {
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
export type { DreamResult as DreamCycleResult } from '@odysseus/core';
