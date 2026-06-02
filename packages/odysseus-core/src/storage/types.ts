/**
 * Storage - 存储层类型定义
 *
 * 提供持久化抽象接口，支持内存和 SQLite 实现
 */

import type {
  Episode,
  SemanticNode,
  ProspectiveMemory,
} from '../hippocampus/types.js';

/**
 * 存储适配器基础接口
 */
export interface IStorageAdapter {
  /**
   * 初始化存储（创建表、打开连接等）
   */
  initialize(): Promise<void>;

  /**
   * 关闭存储连接
   */
  close(): Promise<void>;

  /**
   * 检查存储是否已就绪
   */
  isReady(): boolean;
}

/**
 * 情节记忆存储接口
 */
export interface IEpisodeStorage extends IStorageAdapter {
  /**
   * 保存情节记忆
   */
  save(episode: Episode): Promise<void>;

  /**
   * 加载指定 ID 的情节记忆
   */
  load(id: string): Promise<Episode | null>;

  /**
   * 加载所有情节记忆
   */
  loadAll(): Promise<Episode[]>;

  /**
   * 删除指定 ID 的情节记忆
   */
  delete(id: string): Promise<boolean>;

  /**
   * 获取情节记忆数量
   */
  count(): Promise<number>;
}

/**
 * 语义记忆存储接口
 */
export interface ISemanticStorage extends IStorageAdapter {
  /**
   * 保存语义节点
   */
  save(node: SemanticNode): Promise<void>;

  /**
   * 加载指定 ID 的语义节点
   */
  load(id: string): Promise<SemanticNode | null>;

  /**
   * 加载所有语义节点
   */
  loadAll(): Promise<SemanticNode[]>;

  /**
   * 删除指定 ID 的语义节点
   */
  delete(id: string): Promise<boolean>;

  /**
   * 获取语义节点数量
   */
  count(): Promise<number>;
}

/**
 * 前瞻记忆存储接口
 */
export interface IProspectiveStorage extends IStorageAdapter {
  /**
   * 保存前瞻记忆
   */
  save(memory: ProspectiveMemory): Promise<void>;

  /**
   * 加载指定 ID 的前瞻记忆
   */
  load(id: string): Promise<ProspectiveMemory | null>;

  /**
   * 加载所有前瞻记忆
   */
  loadAll(): Promise<ProspectiveMemory[]>;

  /**
   * 删除指定 ID 的前瞻记忆
   */
  delete(id: string): Promise<boolean>;

  /**
   * 加载到期的前瞻记忆
   */
  loadDue(now: number): Promise<ProspectiveMemory[]>;

  /**
   * 获取前瞻记忆数量
   */
  count(): Promise<number>;
}

/**
 * 统一存储接口
 */
export interface IStorage {
  /**
   * 情节记忆存储
   */
  episodes: IEpisodeStorage;

  /**
   * 语义记忆存储
   */
  semantic: ISemanticStorage;

  /**
   * 前瞻记忆存储
   */
  prospective: IProspectiveStorage;

  /**
   * 初始化所有存储
   */
  initialize(): Promise<void>;

  /**
   * 关闭所有存储连接
   */
  close(): Promise<void>;
}

/**
 * 存储配置
 */
export interface StorageConfig {
  /**
   * 存储类型
   */
  type: 'sqlite' | 'memory';

  /**
   * SQLite 文件路径（仅 SQLite 类型）
   * 默认: './data/odysseus-memory.db'
   */
  path?: string;
}
