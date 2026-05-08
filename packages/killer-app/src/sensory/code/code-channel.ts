/**
 * Code Channel - 代码/文件变更 感官渠道
 *
 * 监视文件系统变更并向 agent 发送感知输入。
 * 支持 watch 模式和单次注入模式。
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { BaseSensoryChannel } from '../channel.js';
import type { ChannelMessage, SensoryPriority } from '../types.js';
import { SensoryChannel } from '../types.js';

/**
 * 代码渠道配置
 */
export interface CodeChannelConfig {
  /** 监视的目录路径 */
  watchDir: string;
  /** 监视的文件扩展名（空 = 所有文件） */
  extensions?: string[];
  /** 是否递归监视子目录 */
  recursive?: boolean;
  /** 去抖动间隔（毫秒，默认 500） */
  debounceMs?: number;
}

/**
 * 文件变更事件类型
 */
type FileChangeType = 'create' | 'modify' | 'delete';

interface FileChangeEvent {
  type: FileChangeType;
  filePath: string;
  timestamp: number;
}

/**
 * 代码/文件变更渠道
 *
 * 使用 fs.watch 监视文件变更并转换为 SensoryInput。
 */
export class CodeChannel extends BaseSensoryChannel {
  private readonly config: Required<Pick<CodeChannelConfig, 'watchDir' | 'recursive' | 'debounceMs'>> &
    Pick<CodeChannelConfig, 'extensions'>;
  private watcher: fs.FSWatcher | null = null;
  private pendingEvents: Map<string, FileChangeEvent> = new Map();
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(config: CodeChannelConfig) {
    super(SensoryChannel.Code);
    this.config = {
      watchDir: config.watchDir,
      recursive: config.recursive ?? true,
      debounceMs: config.debounceMs ?? 500,
      extensions: config.extensions,
    };
  }

  async start(): Promise<void> {
    if (this.watcher) return;

    const resolvedDir = path.resolve(this.config.watchDir);
    if (!fs.existsSync(resolvedDir)) {
      throw new Error(`Watch directory does not exist: ${resolvedDir}`);
    }

    this.watcher = fs.watch(
      resolvedDir,
      { recursive: this.config.recursive },
      (eventType, filename) => {
        if (!filename) return;
        this.handleFsEvent(eventType as FileChangeType, path.join(resolvedDir, filename));
      },
    );

    this.watcher.on('error', () => {
      this.recordError();
    });

    this.updateStatus({ connected: true, lastActivity: Date.now() });
  }

  async stop(): Promise<void> {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }

    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
    }

    this.pendingEvents.clear();
    this.updateStatus({ connected: false });
  }

  async send(message: ChannelMessage): Promise<void> {
    // Code channel is read-only (receives file changes), no output
    this.recordActivity();
  }

  /**
   * 手动注入一个文件变更事件（用于测试或编程式使用）
   */
  injectChange(type: FileChangeType, filePath: string): void {
    this.emitChangeEvent(type, filePath);
  }

  private handleFsEvent(eventType: string, filePath: string): void {
    // Filter by extension
    if (this.config.extensions?.length) {
      const ext = path.extname(filePath);
      if (!this.config.extensions.includes(ext)) return;
    }

    // Normalize event type
    const changeType: FileChangeType = eventType === 'rename'
      ? (fs.existsSync(filePath) ? 'create' : 'delete')
      : 'modify';

    // Debounce: batch rapid changes
    this.pendingEvents.set(filePath, {
      type: changeType,
      filePath,
      timestamp: Date.now(),
    });

    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => this.flushPending(), this.config.debounceMs);
  }

  private flushPending(): void {
    const events = new Map(this.pendingEvents);
    this.pendingEvents.clear();
    this.debounceTimer = null;

    for (const event of events.values()) {
      this.emitChangeEvent(event.type, event.filePath);
    }
  }

  private emitChangeEvent(type: FileChangeType, filePath: string): void {
    const relativePath = path.relative(this.config.watchDir, filePath);

    const priorityMap: Record<FileChangeType, SensoryPriority> = {
      create: 'normal',
      modify: 'normal',
      delete: 'high',
    };

    const pastTense: Record<FileChangeType, string> = {
      create: 'created',
      modify: 'modified',
      delete: 'deleted',
    };

    const input = this.createInput(
      `code:${relativePath}`,
      `File ${pastTense[type]}: ${relativePath}`,
      priorityMap[type],
      {
        changeType: type,
        filePath,
        relativePath,
      },
    );

    this.notifyInput(input);
    this.recordActivity();
  }
}
