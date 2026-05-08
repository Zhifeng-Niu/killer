/**
 * Hippocampus - 记忆引擎核心类
 *
 * 超越 RAG 的类脑记忆系统
 */

import type {
  MemoryLayer,
  Episode,
  SemanticNode,
  ProceduralMemory,
  ProspectiveMemory,
  WorkingMemory,
  AssociativeQuery,
  AssociativeResult,
} from './types.js';
import {
  HippocampusEngine as BaseEngine,
  type MemoryConfig,
  DEFAULT_MEMORY_CONFIG,
} from './memory.js';
import { DEFAULT_FORGETTING_CONFIG } from './forgetting.js';

/**
 * 记忆引擎配置（简化版）
 */
export interface SimpleHippocampusConfig {
  /**
   * 是否启用梦境模式
   */
  dreamingEnabled?: boolean;

  /**
   * 梦境周期间隔（毫秒）
   */
  dreamInterval?: number;

  /**
   * 是否启用遗忘曲线
   */
  forgettingEnabled?: boolean;
}

/**
 * 默认配置
 */
export const DEFAULT_SIMPLE_CONFIG: SimpleHippocampusConfig = {
  dreamingEnabled: false,
  forgettingEnabled: true,
};

/**
 * Hippocampus 记忆引擎（独立导出）
 *
 * 负责所有记忆层级的管理和检索
 */
export class HippocampusMemoryEngine extends BaseEngine {
  constructor(config: SimpleHippocampusConfig = DEFAULT_SIMPLE_CONFIG) {
    const memoryConfig: MemoryConfig = {
      ...DEFAULT_MEMORY_CONFIG,
      dreamingEnabled: config.dreamingEnabled ?? false,
      forgetting: config.forgettingEnabled
        ? DEFAULT_FORGETTING_CONFIG
        : {
            ...DEFAULT_FORGETTING_CONFIG,
            defaultStability: Infinity,
          },
    };
    super(memoryConfig);
  }
}
