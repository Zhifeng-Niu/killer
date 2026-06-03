/**
 * Session Persistence Manager (v2 — WP10)
 *
 * 会话持久化管理器 — 通过 SessionStore 接口读写会话数据。
 * 存储后端可插拔：memory / file / future(redis/s3)。
 */

import * as os from 'node:os';
import * as path from 'node:path';
import type { SessionSnapshot, SessionManagerConfig, ConversationMessage } from './types.js';
import { FileSessionStore, MemorySessionStore, type SessionStore, type StoreType, createSessionStore } from './store.js';

const SESSION_VERSION = '1.0.0';
const MAX_SESSIONS_DEFAULT = 10;

/**
 * 生成会话 ID
 */
function generateSessionId(): string {
  return `session_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * 会话管理器
 */
export class SessionManager {
  private readonly config: Required<SessionManagerConfig>;
  private readonly store: SessionStore;
  private currentSessionId: string | null = null;
  private sessionStartedAt: number = 0;
  private conversation: ConversationMessage[] = [];
  private dirty = false;
  private onSaveCallback: ((snapshot: SessionSnapshot) => Promise<void>) | null = null;

  constructor(config?: Partial<SessionManagerConfig> & { storeType?: StoreType }) {
    const homeDir = os.homedir();
    const sessionsDir = path.join(homeDir, '.odysseus', 'sessions');

    this.config = {
      sessionsDir: config?.sessionsDir ?? sessionsDir,
      maxSessions: config?.maxSessions ?? MAX_SESSIONS_DEFAULT,
      autoSave: config?.autoSave ?? true,
    };

    // 使用可插拔存储后端
    const storeType = (config as Record<string, unknown>)?.storeType as StoreType | undefined;
    this.store = createSessionStore(storeType ?? 'file', this.config.sessionsDir);
  }

  /**
   * 获取当前存储后端（用于测试/调试）
   */
  getStore(): SessionStore {
    return this.store;
  }

  /**
   * 开始新会话
   */
  startSession(): void {
    this.currentSessionId = generateSessionId();
    this.sessionStartedAt = Date.now();
    this.conversation = [];
    this.dirty = false;
  }

  /**
   * 添加对话消息
   */
  addMessage(role: 'user' | 'assistant' | 'system', content: string): void {
    this.conversation.push({
      role,
      content,
      timestamp: Date.now(),
    });
    this.dirty = true;
  }

  /**
   * 注册 auto-save 回调
   */
  onSave(callback: (snapshot: SessionSnapshot) => Promise<void>): void {
    this.onSaveCallback = callback;
  }

  /**
   * 检查是否需要 auto-save 并触发
   */
  async checkAutoSave(
    agentState: SessionSnapshot['agentState'],
    config: SessionSnapshot['config'],
  ): Promise<void> {
    if (!this.config.autoSave || !this.dirty || !this.onSaveCallback) {
      return;
    }

    if (this.conversation.length % 3 !== 0) {
      return;
    }

    try {
      const snapshot = await this.createSnapshot(agentState, config);
      await this.onSaveCallback(snapshot);
      this.dirty = false;
    } catch {
      // Auto-save failure is non-critical
    }
  }

  /**
   * 获取对话历史
   */
  getConversation(): ConversationMessage[] {
    return [...this.conversation];
  }

  /**
   * 创建会话快照
   */
  async createSnapshot(agentState: SessionSnapshot['agentState'], config: SessionSnapshot['config']): Promise<SessionSnapshot> {
    if (!this.currentSessionId) {
      this.startSession();
    }

    return {
      version: SESSION_VERSION,
      sessionId: this.currentSessionId!,
      startedAt: this.sessionStartedAt,
      savedAt: Date.now(),
      uptime: Date.now() - this.sessionStartedAt,
      conversation: [...this.conversation],
      agentState,
      config,
    };
  }

  /**
   * 保存会话（委托给 SessionStore）
   */
  async save(snapshot: SessionSnapshot): Promise<void> {
    if (!this.currentSessionId) {
      return;
    }

    try {
      await this.store.save(this.currentSessionId, snapshot);
      await this.store.cleanup(this.config.maxSessions);
    } catch (error) {
      console.error(`Failed to save session: ${error}`);
    }
  }

  /**
   * 加载最新会话
   */
  async loadLatest(): Promise<SessionSnapshot | null> {
    const snapshot = await this.store.loadLatest();

    if (!snapshot) return null;

    if (snapshot.version !== SESSION_VERSION) {
      console.warn(`Session version mismatch: expected ${SESSION_VERSION}, got ${snapshot.version}`);
      return null;
    }

    this.currentSessionId = snapshot.sessionId;
    this.sessionStartedAt = snapshot.startedAt;
    this.conversation = [...snapshot.conversation];

    return snapshot;
  }

  /**
   * 列出所有会话
   */
  async listSessions(): Promise<Array<{ id: string; startedAt: number; savedAt: number }>> {
    return this.store.list();
  }

  /**
   * 删除会话
   */
  async deleteSession(sessionId: string): Promise<boolean> {
    return this.store.delete(sessionId);
  }

  /**
   * 清除当前会话
   */
  clearSession(): void {
    this.currentSessionId = null;
    this.sessionStartedAt = 0;
    this.conversation = [];
  }
}
