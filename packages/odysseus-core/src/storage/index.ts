/**
 * Storage - 存储层
 *
 * 提供持久化抽象接口，支持内存和 SQLite 实现
 */

// 类型定义
export * from './types.js';

// 内存存储
export { MemoryStorage } from './memory-storage.js';

// SQLite 存储
export { SQLiteStorage } from './sqlite-storage.js';

// 工厂函数
export {
  createStorage,
  createMemoryStorage,
  createSQLiteStorage,
} from './factory.js';

// 持久化辅助函数
export {
  saveMemory,
  loadMemory,
  initializeStorage,
} from './persist-helpers.js';
