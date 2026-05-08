/**
 * Session Persistence Manager
 *
 * 会话持久化管理器 - 负责保存和加载会话状态
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import type {
  SessionSnapshot,
  SessionManagerConfig,
  ConversationMessage,
} from './types.js';

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
  private currentSessionId: string | null = null;
  private sessionStartedAt: number = 0;
  private conversation: ConversationMessage[] = [];
  private dirty = false;
  private onSaveCallback: ((snapshot: SessionSnapshot) => Promise<void>) | null = null;

  constructor(config?: Partial<SessionManagerConfig>) {
    const homeDir = os.homedir();
    const sessionsDir = path.join(homeDir, '.killer', 'sessions');

    this.config = {
      sessionsDir: config?.sessionsDir ?? sessionsDir,
      maxSessions: config?.maxSessions ?? MAX_SESSIONS_DEFAULT,
      autoSave: config?.autoSave ?? true,
    };

    // 确保会话目录存在
    this.ensureDirectory();
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
   *
   * 由 agent 在初始化时调用，提供创建快照和保存的能力。
   * 当 auto-save 启用时，checkAutoSave() 会触发回调。
   */
  onSave(callback: (snapshot: SessionSnapshot) => Promise<void>): void {
    this.onSaveCallback = callback;
  }

  /**
   * 检查是否需要 auto-save 并触发
   *
   * 由 agent 在每次认知循环后调用。
   */
  async checkAutoSave(
    agentState: SessionSnapshot['agentState'],
    config: SessionSnapshot['config'],
  ): Promise<void> {
    if (!this.config.autoSave || !this.dirty || !this.onSaveCallback) {
      return;
    }

    // 每 3 条消息触发一次自动保存（减少崩溃数据损失）
    if (this.conversation.length % 3 !== 0) {
      return;
    }

    try {
      const snapshot = await this.createSnapshot(agentState, config);
      await this.onSaveCallback(snapshot);
      this.dirty = false;
    } catch {
      // Auto-save failure is non-critical — next check will retry
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
   * 保存会话（原子写入 + 备份）
   *
   * 写入临时文件后原子 rename，防止崩溃导致文件损坏。
   * 保存前备份旧文件（保留最近一份）。
   */
  async save(snapshot: SessionSnapshot): Promise<void> {
    if (!this.currentSessionId) {
      return;
    }

    try {
      const sessionPath = this.getSessionPath(this.currentSessionId);
      const sessionDir = path.dirname(sessionPath);

      // 确保目录存在
      if (!fs.existsSync(sessionDir)) {
        fs.mkdirSync(sessionDir, { recursive: true });
      }

      const content = JSON.stringify(snapshot, null, 2);

      // 原子写入：先写临时文件，再 rename
      this.atomicWriteFile(sessionPath, content);

      // 更新 latest（同样原子写入）
      const latestPath = path.join(this.config.sessionsDir, 'latest.json');
      this.atomicWriteFile(latestPath, content);

      // 清理旧会话
      await this.cleanupOldSessions();
    } catch (error) {
      console.error(`Failed to save session: ${error}`);
    }
  }

  /**
   * 原子写入文件（temp + rename）+ 备份旧文件
   */
  private atomicWriteFile(targetPath: string, content: string): void {
    const tmpPath = targetPath + '.tmp';

    // 写入临时文件
    fs.writeFileSync(tmpPath, content, 'utf-8');

    // 备份旧文件（如果存在）
    if (fs.existsSync(targetPath)) {
      const backupPath = targetPath + '.bak';
      try {
        fs.renameSync(targetPath, backupPath);
      } catch {
        // 备份失败不影响主流程
      }
    }

    // 原子替换
    fs.renameSync(tmpPath, targetPath);
  }

  /**
   * 加载最新会话（含备份恢复）
   */
  async loadLatest(): Promise<SessionSnapshot | null> {
    const latestPath = path.join(this.config.sessionsDir, 'latest.json');

    if (!fs.existsSync(latestPath)) {
      return null;
    }

    let snapshot: SessionSnapshot | null = null;

    // 尝试加载主文件
    try {
      const content = fs.readFileSync(latestPath, 'utf-8');
      snapshot = JSON.parse(content) as SessionSnapshot;
    } catch {
      // 主文件损坏，尝试备份
      const backupPath = latestPath + '.bak';
      if (fs.existsSync(backupPath)) {
        try {
          const content = fs.readFileSync(backupPath, 'utf-8');
          snapshot = JSON.parse(content) as SessionSnapshot;
          console.warn('Session file was corrupted, restored from backup');
        } catch {
          console.error('Failed to load session from both main and backup files');
          return null;
        }
      } else {
        console.error(`Failed to load session: file corrupted and no backup available`);
        return null;
      }
    }

    if (!snapshot) return null;

    // 验证版本
    if (snapshot.version !== SESSION_VERSION) {
      console.warn(`Session version mismatch: expected ${SESSION_VERSION}, got ${snapshot.version}`);
      return null;
    }

    // 恢复对话历史
    this.currentSessionId = snapshot.sessionId;
    this.sessionStartedAt = snapshot.startedAt;
    this.conversation = [...snapshot.conversation];

    return snapshot;
  }

  /**
   * 列出所有会话
   */
  listSessions(): Array<{ id: string; startedAt: number; savedAt: number }> {
    try {
      if (!fs.existsSync(this.config.sessionsDir)) {
        return [];
      }

      const files = fs.readdirSync(this.config.sessionsDir)
        .filter(f => f.startsWith('session_') && f.endsWith('.json'))
        .map(f => {
          const filePath = path.join(this.config.sessionsDir, f);
          const content = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as SessionSnapshot;
          return {
            id: content.sessionId,
            startedAt: content.startedAt,
            savedAt: content.savedAt,
          };
        });

      // 按开始时间倒序排列
      return files.sort((a, b) => b.startedAt - a.startedAt);
    } catch (error) {
      console.error(`Failed to list sessions: ${error}`);
      return [];
    }
  }

  /**
   * 删除会话
   */
  async deleteSession(sessionId: string): Promise<boolean> {
    try {
      const sessionPath = this.getSessionPath(sessionId);
      if (fs.existsSync(sessionPath)) {
        fs.unlinkSync(sessionPath);
        return true;
      }
      return false;
    } catch (error) {
      console.error(`Failed to delete session: ${error}`);
      return false;
    }
  }

  /**
   * 清理旧会话
   */
  private async cleanupOldSessions(): Promise<void> {
    try {
      const sessions = this.listSessions();

      if (sessions.length > this.config.maxSessions) {
        const toDelete = sessions.slice(this.config.maxSessions);
        for (const session of toDelete) {
          await this.deleteSession(session.id);
        }
      }
    } catch (error) {
      // 静默失败
    }
  }

  /**
   * 获取会话文件路径
   */
  private getSessionPath(sessionId: string): string {
    return path.join(this.config.sessionsDir, `${sessionId}.json`);
  }

  /**
   * 确保会话目录存在
   */
  private ensureDirectory(): void {
    try {
      if (!fs.existsSync(this.config.sessionsDir)) {
        fs.mkdirSync(this.config.sessionsDir, { recursive: true });
      }
    } catch (error) {
      console.error(`Failed to create sessions directory: ${error}`);
    }
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
