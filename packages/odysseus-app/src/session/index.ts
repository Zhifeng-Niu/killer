/**
 * Session Persistence Module
 *
 * 会话持久化模块 - 自动保存和恢复会话
 * 存储后端可插拔：memory / file / future(redis/s3)
 */

export type { SessionSnapshot, SessionManagerConfig, ConversationMessage } from './types.js';
export { SessionManager } from './session-manager.js';
export { MemorySessionStore, FileSessionStore, createSessionStore, type SessionStore, type StoreType } from './store.js';
