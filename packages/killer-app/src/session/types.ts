/**
 * Session Persistence - Types
 *
 * 会话持久化的类型定义
 */

import type { PredictionResult, UserModel, MirrorNeuronData, EmotionalState } from '../persona/types.js';

/**
 * 对话消息
 */
export interface ConversationMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
}

/**
 * 会话状态快照
 */
export interface SessionSnapshot {
  version: string;
  sessionId: string;
  startedAt: number;
  savedAt: number;
  uptime: number;
  conversation: ConversationMessage[];
  agentState: {
    goals: Array<{
      id: string;
      description: string;
      priority: number;
      status: string;
    }>;
    cells: Array<{
      id: string;
      role: string;
      status: string;
      /** Cell 类型（prime, researcher, artisan, negotiator, evolver） */
      type?: string;
      /** Cell 能力列表 */
      capabilities?: string[];
    }>;
    /** Synapse 连接拓扑（序列化的 CellId 对） */
    synapseTopology?: Array<{ from: string; to: string }>;
    persona: {
      name: string;
      traits: string[];
      bio: string;
      emotionalState?: EmotionalState;
      narrativeSummary?: string;
      predictionCount?: number;
      /** E4: 预测模型数据 */
      predictions?: PredictionResult;
      /** 用户模型数据 */
      userModel?: UserModel;
      /** 镜像神经元数据 */
      mirrorNeuronData?: MirrorNeuronData;
      /** E5: 人格特质（定量） */
      personalityTraits?: Record<string, number>;
      /** E2: 叙事上下文 */
      narrativeContext?: string;
    };
    memory: {
      totalEpisodes: number;
      shortTermCount: number;
      longTermCount: number;
      associationCount: number;
    };
    /** HippocampusEngine 完整记忆数据（episodic, semantic, procedural, prospective, narrative） */
    hippocampusData?: Record<string, unknown>;
    /** 认知模块持久化状态 */
    cognitiveState?: {
      sectionWeights?: { offsets: Record<string, number>; lastActiveSections: string[]; updates: number };
      knowledgeGraph?: { entities: Array<[string, { name: string; type: string; mentions: number; firstMentioned: number }]>; relations: Array<{ from: string; to: string; relation: string; confidence: number }> };
      rhythmProfile?: { avgIntervalSec: number; avgMessageLength: number; cadence: string; suggestedResponseStyle: string; suggestedWaitStrategy: string };
      semanticNetwork?: { concepts: Array<[string, { name: string; type: string; definition: string; firstContext: string; mentions: number; firstMentioned: number; isolated: boolean }]>; relations: Array<{ from: string; to: string; relation: string; confidence: number; source: string }> };
      turnCounter?: number;
    };
  };
  config: {
    llmProvider: string;
    model?: string;
    debugLogging: boolean;
  };
}

/**
 * 会话管理器配置
 */
export interface SessionManagerConfig {
  sessionsDir: string;
  maxSessions?: number;
  autoSave?: boolean;
}
