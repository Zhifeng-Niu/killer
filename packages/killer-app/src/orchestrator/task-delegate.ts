/**
 * Task Delegation - 多 Agent 任务委派系统
 *
 * 允许 Prime Cell 将复杂任务分解为子任务，
 * 分配给专门的 Cell 处理，收集结果后综合输出
 */

import {
  SynapseProtocol,
  CellType,
  type CellId,
} from '@killer/core';
import type { LLMProvider } from '@killer/core';
import { CellRuntime } from './cell-runtime.js';

/**
 * 子任务定义
 */
export interface SubTask {
  id: string;
  cellType: CellType;
  description: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  result?: string;
  assignedCellId?: CellId;
}

/**
 * 委派结果
 */
export interface DelegationResult {
  taskId: string;
  subtasks: SubTask[];
  synthesis: string;
  totalCellsUsed: number;
  durationMs: number;
}

/**
 * 委派历史记录
 */
interface DelegationRecord {
  task: string;
  cellType: CellType;
  description: string;
  success: boolean;
  durationMs: number;
  timestamp: number;
}

/**
 * Cell 能力画像
 */
interface CellProfile {
  totalTasks: number;
  successes: number;
  avgDurationMs: number;
  lastUsed: number;
}

/**
 * 任务委派器
 *
 * 管理子任务的创建、分发、收集和综合
 */
export class TaskDelegate {
  private readonly synapse: SynapseProtocol;
  private readonly llm: LLMProvider;
  private readonly primeCellId: CellId;
  private readonly onLog?: (message: string) => void;

  private readonly history: DelegationRecord[] = [];
  private readonly cellProfiles: Map<string, CellProfile> = new Map();
  private static readonly MAX_HISTORY = 200;

  constructor(
    synapse: SynapseProtocol,
    llm: LLMProvider,
    primeCellId: CellId,
    onLog?: (message: string) => void,
  ) {
    this.synapse = synapse;
    this.llm = llm;
    this.primeCellId = primeCellId;
    this.onLog = onLog;
  }

  /**
   * 执行完整的任务委派流程
   *
   * 1. 分解任务为子任务
   * 2. 为每个子任务分配 Cell
   * 3. 发送任务并收集结果
   * 4. 综合所有结果
   */
  async delegate(task: string): Promise<DelegationResult> {
    const startedAt = Date.now();
    const taskId = `task_${Date.now()}`;

    // 1. 分解任务
    const subtasks = await this.decomposeTask(task, taskId);
    this.log(`Decomposed task into ${subtasks.length} subtasks`);

    // 2. 为每个子任务生成 Cell 并发送
    const runningTasks = subtasks.filter(st => st.status === 'pending');
    await Promise.all(runningTasks.map(st => this.assignAndRun(st)));

    // 3. 收集结果
    await this.collectResults(subtasks);

    // 4. 综合结果
    const synthesis = await this.synthesizeResults(task, subtasks);

    // 5. 记录委派历史
    const elapsedMs = Date.now() - startedAt;
    for (const st of subtasks) {
      this.recordDelegation({
        task: st.description,
        cellType: st.cellType,
        description: st.description,
        success: st.status === 'completed',
        durationMs: st.status !== 'pending' ? Math.round(elapsedMs / subtasks.length) : 0,
      });
    }

    // 6. 清理临时 Cell
    this.cleanupCells(subtasks);

    this.log(`Task completed in ${elapsedMs}ms using ${subtasks.length} cells`);

    return {
      taskId,
      subtasks,
      synthesis,
      totalCellsUsed: subtasks.filter(st => st.assignedCellId).length,
      durationMs: elapsedMs,
    };
  }

  /**
   * 使用 LLM 分解任务为子任务
   */
  private async decomposeTask(task: string, taskId: string): Promise<SubTask[]> {
    const profileSection = this.getProfileSummary();
    const profileHint = profileSection
      ? `\n\nHistorical cell performance (prefer higher success rates):\n${profileSection}`
      : '';

    const decomposePrompt = `Given this task: "${task}"

Break it down into 1-4 focused subtasks. For each subtask, assign the most appropriate cell type:
- researcher: for investigation, analysis, gathering information
- artisan: for coding, building, implementing
- negotiator: for coordination, communication
- evolver: for optimization, improvement
${profileHint}
Respond in this exact format (one subtask per line):
CELL_TYPE | description of subtask

Example:
researcher | Analyze the architecture of the current system
artisan | Implement the new feature based on analysis

If the task is simple enough for one cell, use just one subtask.`;

    try {
      const result = await this.llm.complete(decomposePrompt);
      const lines = result.content.split('\n').filter(l => l.trim().length > 0);

      const subtasks: SubTask[] = [];
      let idx = 0;

      for (const line of lines) {
        const match = line.match(/^(researcher|artisan|negotiator|evolver)\s*\|\s*(.+)$/i);
        if (match) {
          const cellTypeStr = match[1].toLowerCase();
          const cellType = this.cellTypeFromString(cellTypeStr);
          if (cellType) {
            subtasks.push({
              id: `${taskId}_sub${idx++}`,
              cellType,
              description: match[2].trim(),
              status: 'pending',
            });
          }
        }
      }

      // 如果 LLM 无法分解，创建一个单一子任务
      if (subtasks.length === 0) {
        subtasks.push({
          id: `${taskId}_sub0`,
          cellType: CellType.Researcher,
          description: task,
          status: 'pending',
        });
      }

      return subtasks;
    } catch {
      // LLM 不可用时，创建单一研究子任务
      return [{
        id: `${taskId}_sub0`,
        cellType: CellType.Researcher,
        description: task,
        status: 'pending',
      }];
    }
  }

  /**
   * 为子任务分配 Cell 并执行
   */
  private async assignAndRun(subtask: SubTask): Promise<void> {
    subtask.status = 'running';

    const cellId: CellId = {
      id: `${subtask.cellType}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      type: subtask.cellType,
      instance: 0,
    };

    try {
      this.synapse.registerCell(cellId, {
        name: cellId.id,
        capabilities: this.getCapabilities(subtask.cellType),
        maxLoad: 3,
      });

      subtask.assignedCellId = cellId;
      this.log(`Spawned ${subtask.cellType} cell: ${cellId.id}`);

      // 使用 CellRuntime 执行 — 每个子任务有独立的执行引擎
      const runtime = new CellRuntime(
        cellId,
        this.synapse,
        this.llm,
        { timeoutMs: 30_000 },
        this.onLog,
      );

      const result = await runtime.execute(subtask.description);

      // 清理临时 Runtime
      runtime.stop();

      if (result.success) {
        subtask.result = result.output;
        subtask.status = 'completed';
        this.log(`Cell ${cellId.id} completed: ${result.output.slice(0, 60)}...`);
      } else {
        subtask.result = result.error ?? 'Unknown error';
        subtask.status = 'failed';
        this.log(`Cell ${cellId.id} failed: ${result.error}`);
      }
    } catch (error) {
      subtask.status = 'failed';
      subtask.result = `Error: ${error}`;
      this.log(`Cell failed: ${error}`);
    }
  }

  /**
   * 收集子任务结果（通过 Synapse receive）
   */
  private async collectResults(subtasks: SubTask[]): Promise<void> {
    for (const subtask of subtasks) {
      if (subtask.assignedCellId) {
        // 检查 Synapse 消息队列中是否有结果
        const messages = this.synapse.receive(subtask.assignedCellId);
        // 消息已经通过 assignAndRun 处理过了
        // 这里主要确保所有消息都被消费
        void messages;
      }
    }
  }

  /**
   * 综合所有子任务结果
   */
  private async synthesizeResults(originalTask: string, subtasks: SubTask[]): Promise<string> {
    const completedSubtasks = subtasks.filter(st => st.status === 'completed' && st.result);

    if (completedSubtasks.length === 0) {
      return 'No subtasks completed successfully.';
    }

    if (completedSubtasks.length === 1) {
      return completedSubtasks[0].result ?? '';
    }

    // 多个子任务结果需要综合
    const resultsSummary = completedSubtasks
      .map((st, i) => `## Subtask ${i + 1} (${st.cellType}): ${st.description}\n${st.result}`)
      .join('\n\n');

    const synthesisPrompt = `You are synthesizing results from multiple specialized cells that worked on this task: "${originalTask}"

Here are their results:

${resultsSummary}

Please provide a coherent, unified response that integrates all findings. Be concise but comprehensive.`;

    try {
      const result = await this.llm.complete(synthesisPrompt);
      return result.content;
    } catch {
      // LLM 不可用时，直接拼接结果
      return resultsSummary;
    }
  }

  /**
   * 清理临时 Cell
   */
  private cleanupCells(subtasks: SubTask[]): void {
    for (const subtask of subtasks) {
      if (subtask.assignedCellId) {
        try {
          this.synapse.unregisterCell(subtask.assignedCellId);
        } catch {
          // Cell 可能已经被清理
        }
      }
    }
  }

  /**
   * 字符串转 CellType
   */
  private cellTypeFromString(s: string): CellType | null {
    const map: Record<string, CellType> = {
      researcher: CellType.Researcher,
      artisan: CellType.Artisan,
      negotiator: CellType.Negotiator,
      evolver: CellType.Evolver,
      prime: CellType.Prime,
    };
    return map[s.toLowerCase()] ?? null;
  }

  /**
   * 获取 Cell 类型的能力
   */
  private getCapabilities(type: CellType): string[] {
    switch (type) {
      case CellType.Researcher:
        return ['research', 'analysis', 'investigation'];
      case CellType.Artisan:
        return ['coding', 'implementation', 'building'];
      case CellType.Negotiator:
        return ['coordination', 'communication', 'diplomacy'];
      case CellType.Evolver:
        return ['optimization', 'evolution', 'improvement'];
      default:
        return ['general'];
    }
  }

  /**
   * 记录委派历史并更新 Cell 能力画像
   */
  private recordDelegation(record: Omit<DelegationRecord, 'timestamp'>): void {
    const entry: DelegationRecord = { ...record, timestamp: Date.now() };
    this.history.push(entry);
    if (this.history.length > TaskDelegate.MAX_HISTORY) {
      this.history.shift();
    }

    const key = record.cellType as string;
    const profile = this.cellProfiles.get(key) ?? {
      totalTasks: 0, successes: 0, avgDurationMs: 0, lastUsed: 0,
    };
    const totalMs = profile.avgDurationMs * profile.totalTasks + record.durationMs;
    profile.totalTasks += 1;
    profile.successes += record.success ? 1 : 0;
    profile.avgDurationMs = totalMs / profile.totalTasks;
    profile.lastUsed = Date.now();
    this.cellProfiles.set(key, profile);
  }

  /**
   * 获取某 Cell 类型的成功率（0-1）
   */
  getSuccessRate(cellType: CellType): number {
    const profile = this.cellProfiles.get(cellType as string);
    if (!profile || profile.totalTasks === 0) return 0.5;
    return profile.successes / profile.totalTasks;
  }

  /**
   * 获取所有 Cell 的能力画像摘要（用于 LLM 提示）
   */
  private getProfileSummary(): string {
    if (this.cellProfiles.size === 0) return '';
    const lines: string[] = [];
    for (const [type, p] of this.cellProfiles) {
      const rate = p.totalTasks > 0 ? `${Math.round((p.successes / p.totalTasks) * 100)}%` : 'N/A';
      lines.push(`- ${type}: ${p.totalTasks} tasks, ${rate} success, avg ${Math.round(p.avgDurationMs)}ms`);
    }
    return lines.join('\n');
  }

  /**
   * 导出 cell 能力画像
   */
  exportProfiles(): Record<string, CellProfile> {
    const result: Record<string, CellProfile> = {};
    for (const [type, profile] of this.cellProfiles) {
      result[type] = { ...profile };
    }
    return result;
  }

  /**
   * 导入 cell 能力画像
   */
  importProfiles(data: Record<string, CellProfile>): void {
    for (const [type, profile] of Object.entries(data)) {
      // 只导入不存在的类型，避免覆盖当前会话数据
      if (!this.cellProfiles.has(type)) {
        this.cellProfiles.set(type, { ...profile });
      }
    }
  }

  /**
   * 日志
   */
  private log(message: string): void {
    this.onLog?.(`[TaskDelegate] ${message}`);
  }
}
