/**
 * Workflow Persistence Store
 *
 * 将成功的 workflow 定义保存到 .odysseus/workflows/ 目录，
 * 支持按名称加载、列出和删除已保存的 workflow。
 *
 * 文件格式：.odysseus/workflows/<name>.json
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import type { WorkflowDefinition, WorkflowResult } from './workflow-engine.js';

/** 保存的 workflow 元数据 */
export interface SavedWorkflow {
  /** Workflow 名称（文件名不含扩展名） */
  name: string;
  /** Workflow 定义 */
  definition: WorkflowDefinition;
  /** 保存时间 ISO */
  savedAt: string;
  /** 最近一次执行结果摘要 */
  lastRun?: {
    success: boolean;
    durationMs: number;
    totalTokensUsed: number;
    averageTG: number;
    runAt: string;
  };
}

/**
 * Workflow 持久化存储
 */
export class WorkflowStore {
  private readonly workflowsDir: string;

  constructor(projectDir?: string) {
    const baseDir = projectDir ?? process.cwd();
    this.workflowsDir = path.join(baseDir, '.odysseus', 'workflows');
  }

  /**
   * 初始化目录
   */
  init(): void {
    if (!fs.existsSync(this.workflowsDir)) {
      fs.mkdirSync(this.workflowsDir, { recursive: true });
    }
  }

  /**
   * 保存 workflow 定义
   */
  save(definition: WorkflowDefinition, result?: WorkflowResult): SavedWorkflow {
    this.init();

    const name = this.sanitizeName(definition.name);
    const filePath = this.getFilePath(name);

    // 如果已存在，读取并合并 lastRun
    const existing = this.load(name);
    const saved: SavedWorkflow = {
      name,
      definition,
      savedAt: existing?.savedAt ?? new Date().toISOString(),
      lastRun: result ? {
        success: result.success,
        durationMs: result.totalDurationMs,
        totalTokensUsed: result.totalTokensUsed,
        averageTG: result.averageTG,
        runAt: new Date().toISOString(),
      } : existing?.lastRun,
    };

    fs.writeFileSync(filePath, JSON.stringify(saved, null, 2), 'utf-8');
    return saved;
  }

  /**
   * 按名称加载 workflow
   */
  load(name: string): SavedWorkflow | null {
    const filePath = this.getFilePath(this.sanitizeName(name));
    if (!fs.existsSync(filePath)) return null;
    try {
      return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as SavedWorkflow;
    } catch {
      return null;
    }
  }

  /**
   * 列出所有已保存的 workflow
   */
  list(): Array<{ name: string; description?: string; savedAt: string; lastRun?: string }> {
    this.init();
    if (!fs.existsSync(this.workflowsDir)) return [];

    return fs.readdirSync(this.workflowsDir)
      .filter(f => f.endsWith('.json'))
      .map(f => {
        try {
          const data = JSON.parse(fs.readFileSync(path.join(this.workflowsDir, f), 'utf-8')) as SavedWorkflow;
          return {
            name: data.name,
            description: data.definition.description,
            savedAt: data.savedAt,
            lastRun: data.lastRun?.runAt,
          };
        } catch {
          return null;
        }
      })
      .filter((item): item is NonNullable<typeof item> => item !== null);
  }

  /**
   * 删除已保存的 workflow
   */
  delete(name: string): boolean {
    const filePath = this.getFilePath(this.sanitizeName(name));
    if (!fs.existsSync(filePath)) return false;
    fs.unlinkSync(filePath);
    return true;
  }

  /**
   * 更新最近执行结果
   */
  updateLastRun(name: string, result: WorkflowResult): void {
    const saved = this.load(name);
    if (!saved) return;
    saved.lastRun = {
      success: result.success,
      durationMs: result.totalDurationMs,
      totalTokensUsed: result.totalTokensUsed,
      averageTG: result.averageTG,
      runAt: new Date().toISOString(),
    };
    fs.writeFileSync(this.getFilePath(this.sanitizeName(name)), JSON.stringify(saved, null, 2), 'utf-8');
  }

  private getFilePath(name: string): string {
    return path.join(this.workflowsDir, `${name}.json`);
  }

  private sanitizeName(name: string): string {
    return name.replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase();
  }
}
