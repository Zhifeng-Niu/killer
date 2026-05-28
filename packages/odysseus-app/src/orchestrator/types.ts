/**
 * Orchestrator - 编排器类型定义
 *
 * 定义 Agent 配置和状态
 */

import type { LLMProvider } from '@odysseus/core';

/**
 * Agent 配置
 */
export interface AgentConfig {
  /**
   * LLM 提供者
   */
  llm: LLMProvider;

  /**
   * 感官配置
   */
  sensory: {
    enabledChannels: string[];
    bufferSize: number;
    /** Webhook 渠道配置（可选，启用后接受外部 HTTP POST 输入） */
    webhook?: {
      port: number;
      host?: string;
      path?: string;
      authToken?: string;
    };
  };

  /**
   * 记忆配置
   */
  memory: {
    dreamingEnabled: boolean;
    forgettingEnabled: boolean;
  };

  /**
   * 前额叶配置
   */
  prefrontal: {
    maxPlanSteps: number;
    maxConcurrentPlans: number;
    riskTolerance: number;
  };

  /**
   * 是否启用演化
   */
  evolutionEnabled: boolean;

  /**
   * 是否启用调试日志
   */
  debugLogging: boolean;

  /**
   * 自定义会话存储目录（默认 ~/.odysseus/sessions）
   * 主要用于测试，生产环境一般不需要设置
   */
  sessionDir?: string;

  /**
   * 清新启动 — 不恢复上次会话、记忆和状态
   * 用于 --fresh 标志
   */
  freshStart?: boolean;
}

/**
 * 模块状态
 */
export interface ModuleStatus {
  brainstem: {
    phase: string;
    loopCount: number;
  };
  hippocampus: {
    episodes: number;
    semanticNodes: number;
  };
  prefrontal: {
    activePlans: number;
    completedGoals: number;
  };
  cortex: {
    skills: number;
    mutations: number;
  };
  synapse: {
    cells: number;
    cellTypes: string[];
  };
  sensory: {
    channels: string[];
    connected: boolean;
  };
}

/**
 * Agent 状态
 */
export interface AgentStatus {
  running: boolean;
  uptime: number;
  modules: ModuleStatus;
  startedAt: number;
}

/**
 * 默认 Agent 配置
 */
export const DEFAULT_AGENT_CONFIG: Partial<AgentConfig> = {
  sensory: {
    enabledChannels: ['cli'],
    bufferSize: 100,
  },
  memory: {
    dreamingEnabled: true,
    forgettingEnabled: true,
  },
  prefrontal: {
    maxPlanSteps: 10,
    maxConcurrentPlans: 3,
    riskTolerance: 0.5,
  },
  evolutionEnabled: true,
  debugLogging: false,
};
