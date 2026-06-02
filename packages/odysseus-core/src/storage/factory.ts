/**
 * Storage Factory - 存储工厂
 *
 * 根据配置创建相应的存储实现
 */

import type { IStorage, StorageConfig } from './types.js';
import { MemoryStorage } from './memory-storage.js';
import { SQLiteStorage } from './sqlite-storage.js';

/**
 * 创建存储实例
 *
 * @param config - 存储配置
 * @returns 存储实例
 */
export function createStorage(config: StorageConfig = { type: 'memory' }): IStorage {
  switch (config.type) {
    case 'sqlite':
      return new SQLiteStorage(config.path);
    case 'memory':
    default:
      return new MemoryStorage();
  }
}

/**
 * 创建内存存储
 */
export function createMemoryStorage(): IStorage {
  return new MemoryStorage();
}

/**
 * 创建 SQLite 存储储储
 *
 * @param path - 数据库文件路径，默认 './data/odysseus-memory.db'
 * @returns SQLite 存储实例
 */
export function createSQLiteStorage(path?: string): IStorage {
  return new SQLiteStorage(path);
}
