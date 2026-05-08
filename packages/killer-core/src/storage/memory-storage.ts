/**
 * MemoryStorage - 内存存储实现
 *
 * 使用 Map 实现的内存存储，用于测试和向后兼容
 */

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
 * 内存情节记忆存储
 */
class MemoryEpisodeStorage implements IEpisodeStorage {
  private store: Map<string, Episode>;
  private ready: boolean = false;

  constructor() {
    this.store = new Map();
  }

  async initialize(): Promise<void> {
    this.ready = true;
  }

  async close(): Promise<void> {
    this.store.clear();
    this.ready = false;
  }

  isReady(): boolean {
    return this.ready;
  }

  async save(episode: Episode): Promise<void> {
    this.store.set(episode.id, { ...episode });
  }

  async load(id: string): Promise<Episode | null> {
    const episode = this.store.get(id);
    return episode ? { ...episode } : null;
  }

  async loadAll(): Promise<Episode[]> {
    return Array.from(this.store.values()).map((e) => ({ ...e }));
  }

  async delete(id: string): Promise<boolean> {
    return this.store.delete(id);
  }

  async count(): Promise<number> {
    return this.store.size;
  }
}

/**
 * 内存语义记忆存储
 */
class MemorySemanticStorage implements ISemanticStorage {
  private store: Map<string, SemanticNode>;
  private ready: boolean = false;

  constructor() {
    this.store = new Map();
  }

  async initialize(): Promise<void> {
    this.ready = true;
  }

  async close(): Promise<void> {
    this.store.clear();
    this.ready = false;
  }

  isReady(): boolean {
    return this.ready;
  }

  async save(node: SemanticNode): Promise<void> {
    this.store.set(node.id, JSON.parse(JSON.stringify(node)));
  }

  async load(id: string): Promise<SemanticNode | null> {
    const node = this.store.get(id);
    return node ? JSON.parse(JSON.stringify(node)) : null;
  }

  async loadAll(): Promise<SemanticNode[]> {
    return Array.from(this.store.values()).map((n) =>
      JSON.parse(JSON.stringify(n))
    );
  }

  async delete(id: string): Promise<boolean> {
    return this.store.delete(id);
  }

  async count(): Promise<number> {
    return this.store.size;
  }
}

/**
 * 内内存前瞻记忆存储
 */
class MemoryProspectiveStorage implements IProspectiveStorage {
  private store: Map<string, ProspectiveMemory>;
  private ready: boolean = false;

  constructor() {
    this.store = new Map();
  }

  async initialize(): Promise<void> {
    this.ready = true;
  }

  async close(): Promise<void> {
    this.store.clear();
    this.ready = false;
  }

  isReady(): boolean {
    return this.ready;
  }

  async save(memory: ProspectiveMemory): Promise<void> {
    this.store.set(memory.id, { ...memory });
  }

  async load(id: string): Promise<ProspectiveMemory | null> {
    const memory = this.store.get(id);
    return memory ? { ...memory } : null;
  }

  async loadAll(): Promise<ProspectiveMemory[]> {
    return Array.from(this.store.values()).map((m) => ({ ...m }));
  }

  async delete(id: string): Promise<boolean> {
    return this.store.delete(id);
  }

  async loadDue(now: number): Promise<ProspectiveMemory[]> {
    return Array.from(this.store.values())
      .filter((m) => !m.completed && m.triggerTime <= now)
      .map((m) => ({ ...m }))
      .sort((a, b) => b.priority - a.priority);
  }

  async count(): Promise<number> {
    return this.store.size;
  }
}

/**
 * 内存存储实现
 */
export class MemoryStorage implements IStorage {
  episodes: MemoryEpisodeStorage;
  semantic: MemorySemanticStorage;
  prospective: MemoryProspectiveStorage;

  constructor() {
    this.episodes = new MemoryEpisodeStorage();
    this.semantic = new MemorySemanticStorage();
    this.prospective = new MemoryProspectiveStorage();
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
  }
}
