/**
 * Session Store Abstraction Layer (WP10)
 *
 * 可插拔的会话存储接口，支持：
 * - MemorySessionStore: 内存存储（测试/开发）
 * - FileSessionStore: 文件存储（当前默认，原子写入+备份）
 * - 未来可扩展: RedisSessionStore, S3SessionStore 等
 *
 * 设计原则：
 * - SessionManager 只依赖 SessionStore 接口
 * - 存储后端可独立替换，不影响上层逻辑
 * - 每个后端自行处理并发安全和原子性
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { SessionSnapshot } from './types.js';

// ─── 接口定义 ──────────────────────────────────────

/**
 * 会话存储接口
 *
 * 所有存储后端必须实现此接口。
 * SessionManager 通过此接口读写会话数据。
 */
export interface SessionStore {
  /** 保存会话快照 */
  save(sessionId: string, snapshot: SessionSnapshot): Promise<void>;

  /** 加载指定会话 */
  load(sessionId: string): Promise<SessionSnapshot | null>;

  /** 加载最新会话 */
  loadLatest(): Promise<SessionSnapshot | null>;

  /** 列出所有会话摘要 */
  list(): Promise<Array<{ id: string; startedAt: number; savedAt: number }>>;

  /** 删除指定会话 */
  delete(sessionId: string): Promise<boolean>;

  /** 清理超出上限的旧会话 */
  cleanup(maxSessions: number): Promise<void>;
}

// ─── MemorySessionStore ─────────────────────────────

/**
 * 内存会话存储
 *
 * 用于测试和开发环境。会话数据仅存在于进程内存中。
 */
export class MemorySessionStore implements SessionStore {
  private store = new Map<string, SessionSnapshot>();
  private latestId: string | null = null;

  async save(sessionId: string, snapshot: SessionSnapshot): Promise<void> {
    this.store.set(sessionId, { ...snapshot });
    this.latestId = sessionId;
  }

  async load(sessionId: string): Promise<SessionSnapshot | null> {
    const snap = this.store.get(sessionId);
    return snap ? { ...snap } : null;
  }

  async loadLatest(): Promise<SessionSnapshot | null> {
    if (!this.latestId) return null;
    return this.load(this.latestId);
  }

  async list(): Promise<Array<{ id: string; startedAt: number; savedAt: number }>> {
    return Array.from(this.store.values())
      .map(s => ({ id: s.sessionId, startedAt: s.startedAt, savedAt: s.savedAt }))
      .sort((a, b) => b.startedAt - a.startedAt);
  }

  async delete(sessionId: string): Promise<boolean> {
    const existed = this.store.has(sessionId);
    this.store.delete(sessionId);
    if (this.latestId === sessionId) this.latestId = null;
    return existed;
  }

  async cleanup(maxSessions: number): Promise<void> {
    const sessions = await this.list();
    if (sessions.length > maxSessions) {
      const toDelete = sessions.slice(maxSessions);
      for (const s of toDelete) {
        this.store.delete(s.id);
      }
    }
  }
}

// ─── FileSessionStore ──────────────────────────────

/**
 * 文件会话存储
 *
 * 使用 JSON 文件存储会话，支持原子写入和备份恢复。
 * 存储目录：sessionsDir/session_<id>.json
 */
export class FileSessionStore implements SessionStore {
  private readonly sessionsDir: string;

  constructor(sessionsDir: string) {
    this.sessionsDir = sessionsDir;
    this.ensureDirectory();
  }

  async save(sessionId: string, snapshot: SessionSnapshot): Promise<void> {
    const sessionPath = this.getSessionPath(sessionId);
    const content = JSON.stringify(snapshot, null, 2);
    this.atomicWrite(sessionPath, content);

    // 更新 latest 链接
    const latestPath = path.join(this.sessionsDir, 'latest.json');
    this.atomicWrite(latestPath, content);
  }

  async load(sessionId: string): Promise<SessionSnapshot | null> {
    const sessionPath = this.getSessionPath(sessionId);
    return this.readFile(sessionPath);
  }

  async loadLatest(): Promise<SessionSnapshot | null> {
    const latestPath = path.join(this.sessionsDir, 'latest.json');
    const result = await this.readFile(latestPath);
    if (!result) {
      // 尝试备份恢复
      return this.readFile(latestPath + '.bak');
    }
    return result;
  }

  async list(): Promise<Array<{ id: string; startedAt: number; savedAt: number }>> {
    if (!fs.existsSync(this.sessionsDir)) return [];

    try {
      return fs.readdirSync(this.sessionsDir)
        .filter(f => f.startsWith('session_') && f.endsWith('.json'))
        .map(f => {
          const content = JSON.parse(
            fs.readFileSync(path.join(this.sessionsDir, f), 'utf-8'),
          ) as SessionSnapshot;
          return { id: content.sessionId, startedAt: content.startedAt, savedAt: content.savedAt };
        })
        .sort((a, b) => b.startedAt - a.startedAt);
    } catch {
      return [];
    }
  }

  async delete(sessionId: string): Promise<boolean> {
    const sessionPath = this.getSessionPath(sessionId);
    if (!fs.existsSync(sessionPath)) return false;
    try {
      fs.unlinkSync(sessionPath);
      return true;
    } catch {
      return false;
    }
  }

  async cleanup(maxSessions: number): Promise<void> {
    const sessions = await this.list();
    if (sessions.length > maxSessions) {
      const toDelete = sessions.slice(maxSessions);
      for (const s of toDelete) {
        await this.delete(s.id);
      }
    }
  }

  // ─── 内部方法 ──────────────────────────────────

  private getSessionPath(sessionId: string): string {
    return path.join(this.sessionsDir, `${sessionId}.json`);
  }

  private async readFile(filePath: string): Promise<SessionSnapshot | null> {
    if (!fs.existsSync(filePath)) return null;
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      return JSON.parse(content) as SessionSnapshot;
    } catch {
      return null;
    }
  }

  private atomicWrite(targetPath: string, content: string): void {
    const dir = path.dirname(targetPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const tmpPath = targetPath + '.tmp';
    fs.writeFileSync(tmpPath, content, 'utf-8');

    // 备份旧文件
    if (fs.existsSync(targetPath)) {
      try {
        fs.renameSync(targetPath, targetPath + '.bak');
      } catch {
        // 备份失败不影响主流程
      }
    }

    fs.renameSync(tmpPath, targetPath);
  }

  private ensureDirectory(): void {
    if (!fs.existsSync(this.sessionsDir)) {
      fs.mkdirSync(this.sessionsDir, { recursive: true });
    }
  }
}

// ─── 工厂函数 ──────────────────────────────────────

export type StoreType = 'memory' | 'file';

/**
 * 创建 SessionStore 实例
 */
export function createSessionStore(
  type: StoreType,
  sessionsDir?: string,
): SessionStore {
  switch (type) {
    case 'memory':
      return new MemorySessionStore();
    case 'file':
      return new FileSessionStore(sessionsDir ?? path.join(process.cwd(), '.odysseus', 'sessions'));
  }
}
