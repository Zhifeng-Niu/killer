/**
 * SQLiteStorage - SQLite 存储实现
 *
 * 使用 better-sqlite3 实现持久化存储
 */

import Database from 'better-sqlite3';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

import type {
  Episode,
  SemanticNode,
  ProspectiveMemory,
} from '../hippocampus/types.js';
import type {
  IEpisodeStorage,
  ISemanticStorage,
  IProspectiveStorage,
  IStorage,
} from './types.js';

/**
 * SQLite 情节记忆存储
 */
class SQLiteEpisodeStorage implements IEpisodeStorage {
  private db: Database.Database;
  private ready: boolean = false;

  constructor(db: Database.Database) {
    this.db = db;
  }

  async initialize(): Promise<void> {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS episodes (
        id TEXT PRIMARY KEY,
        data TEXT NOT NULL
      );
    `);
    this.ready = true;
  }

  async close(): Promise<void> {
    this.ready = false;
  }

  isReady(): boolean {
    return this.ready;
  }

  async save(episode: Episode): Promise<void> {
    const stmt = this.db.prepare(
      'INSERT OR REPLACE INTO episodes (id, data) VALUES (?, ?)'
    );
    stmt.run(episode.id, JSON.stringify(episode));
  }

  async load(id: string): Promise<Episode | null> {
    const stmt = this.db.prepare('SELECT data FROM episodes WHERE id = ?');
    const row = stmt.get(id) as { data: string } | undefined;
    if (!row) return null;
    return JSON.parse(row.data) as Episode;
  }

  async loadAll(): Promise<Episode[]> {
    const stmt = this.db.prepare('SELECT data FROM episodes');
    const rows = stmt.all() as Array<{ data: string }>;
    return rows.map((row) => JSON.parse(row.data) as Episode);
  }

  async delete(id: string): Promise<boolean> {
    const stmt = this.db.prepare('DELETE FROM episodes WHERE id = ?');
    const result = stmt.run(id);
    return result.changes > 0;
  }

  async count(): Promise<number> {
    const stmt = this.db.prepare('SELECT COUNT(*) as count FROM episodes');
    const row = stmt.get() as { count: number };
    return row.count;
  }
}

/**
 * SQLite 语义记忆存储
 */
class SQLiteSemanticStorage implements ISemanticStorage {
  private db: Database.Database;
  private ready: boolean = false;

  constructor(db: Database.Database) {
    this.db = db;
  }

  async initialize(): Promise<void> {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS semantic_nodes (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        data TEXT NOT NULL
      );
    `);
    this.ready = true;
  }

  async close(): Promise<void> {
    this.ready = false;
  }

  isReady(): boolean {
    return this.ready;
  }

  async save(node: SemanticNode): Promise<void> {
    const stmt = this.db.prepare(
      'INSERT OR REPLACE INTO semantic_nodes (id, type, data) VALUES (?, ?, ?)'
    );
    stmt.run(node.id, node.type, JSON.stringify(node));
  }

  async load(id: string): Promise<SemanticNode | null> {
    const stmt = this.db.prepare('SELECT data FROM semantic_nodes WHERE id = ?');
    const row = stmt.get(id) as { data: string } | undefined;
    if (!row) return null;
    return JSON.parse(row.data) as SemanticNode;
  }

  async loadAll(): Promise<SemanticNode[]> {
    const stmt = this.db.prepare('SELECT data FROM semantic_nodes');
    const rows = stmt.all() as Array<{ data: string }>;
    return rows.map((row) => JSON.parse(row.data) as SemanticNode);
  }

  async delete(id: string): Promise<boolean> {
    const stmt = this.db.prepare('DELETE FROM semantic_nodes WHERE id = ?');
    const result = stmt.run(id);
    return result.changes > 0;
  }

  async count(): Promise<number> {
    const stmt = this.db.prepare(
      'SELECT COUNT(*) as count FROM semantic_nodes'
    );
    const row = stmt.get() as { count: number };
    return row.count;
  }
}

/**
 * SQLite 前瞻记忆存储
 */
class SQLiteProspectiveStorage implements IProspectiveStorage {
  private db: Database.Database;
  private ready: boolean = false;

  constructor(db: Database.Database) {
    this.db = db;
  }

  async initialize(): Promise<void> {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS prospective (
        id TEXT PRIMARY KEY,
        trigger_time INTEGER NOT NULL,
        completed INTEGER DEFAULT 0,
        data TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_prospective_trigger
        ON prospective(trigger_time, completed);
    `);
    this.ready = true;
  }

  async close(): Promise<void> {
    this.ready = false;
  }

  isReady(): boolean {
    return this.ready;
  }

  async save(memory: ProspectiveMemory): Promise<void> {
    const stmt = this.db.prepare(
      'INSERT OR REPLACE INTO prospective (id, trigger_time, completed, data) VALUES (?, ?, ?, ?)'
    );
    stmt.run(
      memory.id,
      memory.triggerTime,
      memory.completed ? 1 : 0,
      JSON.stringify(memory)
    );
  }

  async load(id: string): Promise<ProspectiveMemory | null> {
    const stmt = this.db.prepare('SELECT data FROM prospective WHERE id = ?');
    const row = stmt.get(id) as { data: string } | undefined;
    if (!row) return null;
    return JSON.parse(row.data) as ProspectiveMemory;
  }

  async loadAll(): Promise<ProspectiveMemory[]> {
    const stmt = this.db.prepare('SELECT data FROM prospective');
    const rows = stmt.all() as Array<{ data: string }>;
    return rows.map((row) => JSON.parse(row.data) as ProspectiveMemory);
  }

  async delete(id: string): Promise<boolean> {
    const stmt = this.db.prepare('DELETE FROM prospective WHERE id = ?');
    const result = stmt.run(id);
    return result.changes > 0;
  }

  async loadDue(now: number): Promise<ProspectiveMemory[]> {
    const stmt = this.db.prepare(
      'SELECT data FROM prospective WHERE trigger_time <= ? AND completed = 0'
    );
    const rows = stmt.all(now) as Array<{ data: string }>;
    return rows
      .map((row) => JSON.parse(row.data) as ProspectiveMemory)
      .sort((a, b) => b.priority - a.priority);
  }

  async count(): Promise<number> {
    const stmt = this.db.prepare('SELECT COUNT(*) as count FROM prospective');
    const row = stmt.get() as { count: number };
    return row.count;
  }
}

/**
 * SQLite 存储实现
 */
export class SQLiteStorage implements IStorage {
  private db: Database.Database;
  episodes: SQLiteEpisodeStorage;
  semantic: SQLiteSemanticStorage;
  prospective: SQLiteProspectiveStorage;

  constructor(path: string = './data/odysseus-memory.db') {
    if (path !== ':memory:') {
      const dir = dirname(path);
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }
    }

    this.db = new Database(path);
    this.episodes = new SQLiteEpisodeStorage(this.db);
    this.semantic = new SQLiteSemanticStorage(this.db);
    this.prospective = new SQLiteProspectiveStorage(this.db);
  }

  async initialize(): Promise<void> {
    await Promise.all([
      this.episodes.initialize(),
      this.semantic.initialize(),
      this.prospective.initialize(),
    ]);
  }

  async close(): Promise<void> {
    await Promise.all([
      this.episodes.close(),
      this.semantic.close(),
      this.prospective.close(),
    ]);
    this.db.close();
  }
}
