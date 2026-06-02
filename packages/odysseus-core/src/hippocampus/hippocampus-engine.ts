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
import { createStorage, type IStorage } from '../storage/index.js';

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

  /**
   * 持久化存储配置
   */
  storage?: {
    type: 'sqlite' | 'memory';
    path?: string;
  };
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
 * 支持可选的持久化存储（SQLite或内存）
 */
export class HippocampusMemoryEngine extends BaseEngine {
  private storageInstance: IStorage | null = null;

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

    // 如果配置了存储，创建存储实例但不传入构造函数（因为 attachStorage 是 async）
    // 所以先不带 storage 调用 super，然后在 init() 中 attach
    super(memoryConfig);

    // 如果配置了存储，创建并存储引用（由 init() 异步绑定）
    if (config.storage) {
      this.storageInstance = createStorage(config.storage);
    }
  }

  /**
   * 初始化持久化（异步）
   *
   * 必须在使用记忆引擎前调用此方法（如果配置了存储）
   */
  async init(): Promise<void> {
    if (this.storageInstance) {
      await this.attachStorage(this.storageInstance);
    }
  }
}
