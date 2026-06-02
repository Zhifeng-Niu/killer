/**
 * BrainCoordinator — 跨脑区协同协调器
 *
 * 将 hippocampus, cerebellum, cortex, prefrontal, brainstem 等认知模块
 * 通过 GlobalWorkspace 连接起来，形成双向反馈回路：
 *
 *   Module Event → Coalition → Attention → Broadcast → Module Feedback
 *
 * 设计原则：
 * - 模块间不直接通信，全部通过 GlobalWorkspace 中转
 * - 注意力机制决定哪个模块的信号获得"全局可用性"
 * - 反馈回路让模块可以响应其他模块的广播
 */

import type { ConsciousnessStream } from './consciousness-stream.js';
import { GlobalWorkspace } from './global-workspace.js';
import type { WorkspaceCoalition } from './global-workspace.js';
import type { ConsciousnessEvent, EventSource } from './types.js';

/**
 * 模块反馈处理器 — 模块响应全局广播的回调
 */
export type ModuleFeedbackHandler = (
  broadcast: WorkspaceCoalition,
  localState?: unknown,
) => void;

/**
 * 模块桥接配置
 */
interface ModuleBridge {
  source: EventSource;
  interests: string[];
  onBroadcast?: ModuleFeedbackHandler;
}

/**
 * 事件到联盟的映射规则
 */
interface CoalitionMapping {
  eventType: string;
  tags: string[];
  relevance: (event: ConsciousnessEvent) => number;
  extract: (event: ConsciousnessEvent) => unknown;
}

/**
 * BrainCoordinator 配置
 */
export interface BrainCoordinatorConfig {
  autoStartAttention: boolean;
  attentionCycleMs: number;
}

const DEFAULT_COORDINATOR_CONFIG: BrainCoordinatorConfig = {
  autoStartAttention: true,
  attentionCycleMs: 200,
};

/**
 * BrainCoordinator — 跨脑区协同
 */
export class BrainCoordinator {
  private readonly stream: ConsciousnessStream;
  private readonly workspace: GlobalWorkspace;
  private readonly bridges: Map<string, ModuleBridge> = new Map();
  private readonly mappings: CoalitionMapping[] = [];
  private readonly feedbackHandlers: Map<string, ModuleFeedbackHandler> = new Map();
  private unsubscribers: Array<() => void> = [];
  private initialized = false;

  constructor(
    stream: ConsciousnessStream,
    config?: Partial<BrainCoordinatorConfig>,
  ) {
    this.stream = stream;
    const fullConfig = { ...DEFAULT_COORDINATOR_CONFIG, ...config };
    this.workspace = new GlobalWorkspace(stream, {
      attentionCycleMs: fullConfig.attentionCycleMs,
    });

    this.setupDefaultMappings();

    if (fullConfig.autoStartAttention) {
      this.workspace.startAttentionCycle();
    }
  }

  getWorkspace(): GlobalWorkspace {
    return this.workspace;
  }

  // ── Module Registration ──

  /**
   * 注册认知模块到协同网络
   */
  registerModule(bridge: ModuleBridge): void {
    this.bridges.set(bridge.source, bridge);

    this.workspace.registerModule({
      id: bridge.source,
      source: bridge.source,
      capabilities: bridge.interests,
      attentionWeight: 1.0,
    });

    if (bridge.onBroadcast) {
      this.feedbackHandlers.set(bridge.source, bridge.onBroadcast);
    }
  }

  // ── Event-to-Coalition Wiring ──

  /**
   * 初始化：订阅 ConsciousnessStream，将模块事件转化为 WorkspaceCoalitions
   */
  initialize(): void {
    if (this.initialized) return;

    const unsub = this.stream.onAll((event) => {
      this.translateEvent(event);
    });
    this.unsubscribers.push(unsub);

    // 订阅 workspace 广播，路由到各模块反馈
    const broadcastUnsub = this.workspace.onBroadcast((coalition) => {
      this.routeBroadcast(coalition);
    });
    this.unsubscribers.push(broadcastUnsub);

    this.initialized = true;
  }

  /**
   * 默认的事件→联盟映射规则
   *
   * 定义了哪些事件类型应该进入注意力竞争
   */
  private setupDefaultMappings(): void {
    // Hippocampus: 记忆检索和巩固事件
    this.mappings.push({
      eventType: 'memory.associative_retrieval',
      tags: ['memory', 'retrieval', 'association'],
      relevance: () => 0.7,
      extract: (e) => e.data,
    });
    this.mappings.push({
      eventType: 'memory.consolidation_complete',
      tags: ['memory', 'consolidation'],
      relevance: () => 0.8,
      extract: (e) => e.data,
    });
    this.mappings.push({
      eventType: 'memory.episode_stored',
      tags: ['memory', 'episodic'],
      relevance: () => 0.6,
      extract: (e) => e.data,
    });

    // Cerebellum: 实验和任务事件
    this.mappings.push({
      eventType: 'experiment.verified',
      tags: ['experiment', 'verification'],
      relevance: (e) => {
        const data = e.data as { metrics?: Record<string, number> } | null;
        if (data?.metrics) {
          const values = Object.values(data.metrics);
          return values.length > 0 ? Math.max(...values) : 0.7;
        }
        return 0.7;
      },
      extract: (e) => e.data,
    });
    this.mappings.push({
      eventType: 'experiment.surprise',
      tags: ['experiment', 'surprise'],
      relevance: () => 0.9,
      extract: (e) => e.data,
    });
    this.mappings.push({
      eventType: 'experiment.stuck',
      tags: ['experiment', 'stuck'],
      relevance: () => 0.85,
      extract: (e) => e.data,
    });
    this.mappings.push({
      eventType: 'mission.created',
      tags: ['mission', 'planning'],
      relevance: () => 0.8,
      extract: (e) => e.data,
    });

    // Cortex: 进化和技能事件
    this.mappings.push({
      eventType: 'evolution.skill_evolved',
      tags: ['evolution', 'skill'],
      relevance: () => 0.75,
      extract: (e) => e.data,
    });
    this.mappings.push({
      eventType: 'evolution.fitness_recorded',
      tags: ['evolution', 'fitness'],
      relevance: (e) => {
        const data = e.data as { fitness?: number } | null;
        return data?.fitness ?? 0.5;
      },
      extract: (e) => e.data,
    });

    // Prefrontal: 目标和执行事件
    this.mappings.push({
      eventType: 'goal.created',
      tags: ['goal', 'planning'],
      relevance: () => 0.85,
      extract: (e) => e.data,
    });
    this.mappings.push({
      eventType: 'goal.completed',
      tags: ['goal', 'achievement'],
      relevance: () => 0.9,
      extract: (e) => e.data,
    });

    // Persona: 情感和预测事件
    this.mappings.push({
      eventType: 'emotion.update',
      tags: ['emotion', 'persona'],
      relevance: (e) => {
        const data = e.data as { intensity?: number } | null;
        return Math.min(1, (data?.intensity ?? 0.3) + 0.3);
      },
      extract: (e) => e.data,
    });
    this.mappings.push({
      eventType: 'prediction.update',
      tags: ['prediction', 'persona'],
      relevance: () => 0.7,
      extract: (e) => e.data,
    });

    // External: 用户消息和系统事件
    this.mappings.push({
      eventType: 'external.user_message',
      tags: ['user', 'input'],
      relevance: () => 1.0,
      extract: (e) => e.data,
    });
    this.mappings.push({
      eventType: 'external.error',
      tags: ['error', 'system'],
      relevance: () => 0.8,
      extract: (e) => e.data,
    });

    // Brainstem: 循环阶段变化
    this.mappings.push({
      eventType: 'loop.phase_change',
      tags: ['loop', 'phase'],
      relevance: () => 0.5,
      extract: (e) => e.data,
    });

    // Health
    this.mappings.push({
      eventType: 'health.degraded',
      tags: ['health', 'system'],
      relevance: () => 0.9,
      extract: (e) => e.data,
    });
  }

  /**
   * 将 ConsciousnessStream 事件翻译为 WorkspaceCoalition
   */
  private translateEvent(event: ConsciousnessEvent): void {
    const mapping = this.mappings.find((m) => m.eventType === event.type);
    if (!mapping) return;

    this.workspace.submit({
      source: event.source,
      data: mapping.extract(event),
      relevance: mapping.relevance(event),
      tags: mapping.tags,
      metadata: { originalEventId: event.id },
    });
  }

  /**
   * 将广播路由到感兴趣的模块
   */
  private routeBroadcast(coalition: WorkspaceCoalition): void {
    for (const [source, bridge] of this.bridges) {
      if (source === coalition.source) continue;

      const interested = coalition.tags.some((tag) =>
        bridge.interests.includes(tag),
      );
      if (!interested) continue;

      const handler = this.feedbackHandlers.get(source);
      if (handler) {
        try {
          handler(coalition);
        } catch {
          // 反馈处理错误不影响其他模块
        }
      }
    }
  }

  // ── Attention Tuning ──

  /**
   * 动态调整模块注意力权重
   *
   * 基于当前任务阶段提升/降低特定模块的优先级
   */
  tuneAttention(priorities: Partial<Record<EventSource, number>>): void {
    for (const [source, weight] of Object.entries(priorities)) {
      for (const mod of this.workspace.getModuleStates()) {
        if (mod.source === source) {
          this.workspace.setAttentionWeight(mod.id, weight);
        }
      }
    }
  }

  /**
   * 预设注意力模式
   */
  applyAttentionPreset(preset: AttentionPreset): void {
    const presets: Record<AttentionPreset, Partial<Record<EventSource, number>>> = {
      recall: { hippocampus: 2.0, prefrontal: 1.3, cortex: 0.8 },
      learning: { cortex: 2.0, hippocampus: 1.5, cerebellum: 1.2 },
      planning: { prefrontal: 2.0, hippocampus: 1.3, cerebellum: 1.1 },
      experimentation: { cerebellum: 2.0, cortex: 1.5, prefrontal: 1.0 },
      interaction: { sensory: 1.8, persona: 1.5, brainstem: 1.2, hippocampus: 1.0 },
      crisis: { brainstem: 2.0, cerebellum: 1.8, hippocampus: 1.3 },
    };

    this.tuneAttention(presets[preset]);
  }

  // ── Status ──

  getStatus(): {
    initialized: boolean;
    modules: number;
    mappings: number;
    workspaceStatus: ReturnType<GlobalWorkspace['getStatus']>;
    attentionBalance: number;
  } {
    return {
      initialized: this.initialized,
      modules: this.bridges.size,
      mappings: this.mappings.length,
      workspaceStatus: this.workspace.getStatus(),
      attentionBalance: this.workspace.getAttentionBalance(),
    };
  }

  // ── Cleanup ──

  shutdown(): void {
    for (const unsub of this.unsubscribers) {
      unsub();
    }
    this.unsubscribers = [];
    this.workspace.shutdown();
    this.bridges.clear();
    this.feedbackHandlers.clear();
    this.initialized = false;
  }
}

export type AttentionPreset =
  | 'recall'
  | 'learning'
  | 'planning'
  | 'experimentation'
  | 'interaction'
  | 'crisis';
