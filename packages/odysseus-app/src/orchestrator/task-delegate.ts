/**
 * Task Delegation - 多 Agent 任务委派系统
 *
 * v2: 增强版 — 支持重载工作检测和精炼结果返回
 *
 * 核心改进：
 * 1. 自动检测重载工作（大量推理、多次工具调用查询）
 * 2. 子 agent 返回精炼结果（非原始过程），主 agent 只保留轻量上下文
 * 3. 被精炼掉的细节通过 recallableStore 保持可回溯性
 */

import {
  SynapseProtocol,
  ColumnRole,
  type ColumnId,
} from '@odysseus/core';
import type { LLMProvider } from '@odysseus/core';
import { ColumnRuntime } from './cell-runtime.js';
import type { RecallableMemoryStore } from './recallable-store.js';

/**
 * 子任务定义
 */
export interface SubTask {
  id: string;
  cellType: ColumnRole;
  description: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  result?: string;
  /** 精炼后的结果摘要（主 agent 使用这个） */
  refinedResult?: string;
  /** 原始结果的 recall ID（如需回溯） */
  resultRecallId?: string;
  assignedColumnId?: ColumnId;
}

/**
 * 委派结果
 */
export interface DelegationResult {
  taskId: string;
  subtasks: SubTask[];
  /** 精炼后的综合结果（轻量，适合主 agent 上下文） */
  synthesis: string;
  /** 原始综合结果（如果被精炼过） */
  fullSynthesis?: string;
  /** 原始结果的 recall ID */
  synthesisRecallId?: string;
  totalCellsUsed: number;
  durationMs: number;
  /** 是否触发了重载委派 */
  wasHeavyDelegation: boolean;
}

/**
 * 重载工作检测阈值
 */
interface HeavyWorkThresholds {
  /** 结果字符数超过此值视为重载 */
  resultCharThreshold: number;
  /** 子任务数超过此值视为重载 */
  subtaskCountThreshold: number;
  /** 综合结果超过此值时触发精炼 */
  synthesisCharThreshold: number;
}

const DEFAULT_HEAVY_THRESHOLDS: HeavyWorkThresholds = {
  resultCharThreshold: 2000,
  subtaskCountThreshold: 3,
  synthesisCharThreshold: 3000,
};

/**
 * 委派历史记录
 */
interface DelegationRecord {
  task: string;
  cellType: ColumnRole;
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
  private readonly primeColumnId: ColumnId;
  private readonly onLog?: (message: string) => void;
  private readonly recallStore?: RecallableMemoryStore;
  private readonly heavyThresholds: HeavyWorkThresholds;

  private readonly history: DelegationRecord[] = [];
  private readonly cellProfiles: Map<string, CellProfile> = new Map();
  private static readonly MAX_HISTORY = 200;

  constructor(
    synapse: SynapseProtocol,
    llm: LLMProvider,
    primeColumnId: ColumnId,
    onLog?: (message: string) => void,
    recallStore?: RecallableMemoryStore,
  ) {
    this.synapse = synapse;
    this.llm = llm;
    this.primeColumnId = primeColumnId;
    this.onLog = onLog;
    this.recallStore = recallStore;
    this.heavyThresholds = DEFAULT_HEAVY_THRESHOLDS;
  }

  /**
   * 执行完整的任务委派流程（v2 — 重载感知版）
   *
   * 1. 分解任务为子任务
   * 2. 为每个子任务分配 Cell
   * 3. 发送任务并收集结果
   * 4. 检测重载工作 → 精炼结果
   * 5. 综合所有结果
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

    // 4. 检测重载工作 + 精炼子任务结果
    const isHeavy = this.isHeavyWork(subtasks);
    if (isHeavy) {
      this.refineSubtaskResults(subtasks);
    }

    // 5. 综合结果
    const fullSynthesis = await this.synthesizeResults(task, subtasks);

    // 6. 如果综合结果也很长，精炼后存入记忆库
    let synthesis = fullSynthesis;
    let synthesisRecallId: string | undefined;
    if (isHeavy && fullSynthesis.length > this.heavyThresholds.synthesisCharThreshold && this.recallStore) {
      synthesisRecallId = this.recallStore.store({
        recallId: `synth_${Date.now().toString(36)}`,
        content: fullSynthesis,
        source: 'message',
        metadata: { timestamp: Date.now() },
      });
      // 精炼综合结果为摘要
      synthesis = await this.refineSynthesis(task, fullSynthesis, synthesisRecallId);
    }

    // 7. 记录委派历史
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

    // 8. 清理临时 Cell
    this.cleanupCells(subtasks);

    this.log(`Task completed in ${elapsedMs}ms using ${subtasks.length} cells (heavy=${isHeavy})`);

    return {
      taskId,
      subtasks,
      synthesis,
      fullSynthesis: synthesisRecallId ? fullSynthesis : undefined,
      synthesisRecallId,
      totalCellsUsed: subtasks.filter(st => st.assignedColumnId).length,
      durationMs: elapsedMs,
      wasHeavyDelegation: isHeavy,
    };
  }

  /**
   * 检测是否为重载工作
   *
   * 条件：子任务数多 或 任意子任务结果超长
   */
  private isHeavyWork(subtasks: SubTask[]): boolean {
    if (subtasks.length >= this.heavyThresholds.subtaskCountThreshold) return true;
    return subtasks.some(st =>
      st.result && st.result.length > this.heavyThresholds.resultCharThreshold,
    );
  }

  /**
   * 精炼子任务结果
   *
   * 长结果截取摘要，原始内容存入 recallStore
   */
  private refineSubtaskResults(subtasks: SubTask[]): void {
    if (!this.recallStore) return;

    for (const st of subtasks) {
      if (!st.result || st.result.length <= this.heavyThresholds.resultCharThreshold) {
        st.refinedResult = st.result;
        continue;
      }

      // 将原始结果存入记忆库
      const recallId = this.recallStore.store({
        recallId: `subtask_${st.id}_${Date.now().toString(36)}`,
        content: st.result,
        source: 'message',
        metadata: {
          toolName: st.cellType as string,
          timestamp: Date.now(),
        },
      });

      st.resultRecallId = recallId;

      // 保留前 500 字符作为精炼结果
      st.refinedResult = st.result.slice(0, 500) +
        `\n...[refined, full result recallable: ${recallId}]`;
    }
  }

  /**
   * 精炼综合结果为摘要
   */
  private async refineSynthesis(task: string, fullSynthesis: string, recallId: string): Promise<string> {
    const refinePrompt = `Summarize this detailed analysis in under 800 characters. The full version is stored with recall ID "${recallId}".

Task: "${task}"

Detailed analysis:
${fullSynthesis.slice(0, 2000)}

Provide a concise summary that captures the key findings and conclusions.`;

    try {
      const result = await this.llm.complete(refinePrompt);
      return result.content + `\n\n[Full analysis recallable: ${recallId}]`;
    } catch {
      return fullSynthesis.slice(0, 800) + `\n...[truncated, full recallable: ${recallId}]`;
    }
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
          cellType: ColumnRole.Researcher,
          description: task,
          status: 'pending',
        });
      }

      return subtasks;
    } catch {
      // LLM 不可用时，创建单一研究子任务
      return [{
        id: `${taskId}_sub0`,
        cellType: ColumnRole.Researcher,
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

    const cellId: ColumnId = {
      id: `${subtask.cellType}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      type: subtask.cellType,
      instance: 0,
    };

    try {
      this.synapse.registerColumn(cellId, {
        name: cellId.id,
        capabilities: this.getCapabilities(subtask.cellType),
        maxLoad: 3,
      });

      subtask.assignedColumnId = cellId;
      this.log(`Spawned ${subtask.cellType} cell: ${cellId.id}`);

      // 使用 ColumnRuntime 执行 — 每个子任务有独立的执行引擎
      const runtime = new ColumnRuntime(
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
      if (subtask.assignedColumnId) {
        // 检查 Synapse 消息队列中是否有结果
        const messages = this.synapse.receive(subtask.assignedColumnId);
        // 消息已经通过 assignAndRun 处理过了
        // 这里主要确保所有消息都被消费
        void messages;
      }
    }
  }

  /**
   * 综合所有子任务结果（v2 — 使用精炼结果）
   */
  private async synthesizeResults(originalTask: string, subtasks: SubTask[]): Promise<string> {
    const completedSubtasks = subtasks.filter(st => st.status === 'completed' && (st.result || st.refinedResult));

    if (completedSubtasks.length === 0) {
      return 'No subtasks completed successfully.';
    }

    if (completedSubtasks.length === 1) {
      return completedSubtasks[0].refinedResult ?? completedSubtasks[0].result ?? '';
    }

    // 使用精炼结果（如果可用）进行综合
    const resultsSummary = completedSubtasks
      .map((st, i) => {
        const content = st.refinedResult ?? st.result ?? '';
        return `## Subtask ${i + 1} (${st.cellType}): ${st.description}\n${content}`;
      })
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
      if (subtask.assignedColumnId) {
        try {
          this.synapse.unregisterColumn(subtask.assignedColumnId);
        } catch {
          // Cell 可能已经被清理
        }
      }
    }
  }

  /**
   * 字符串转 ColumnRole
   */
  private cellTypeFromString(s: string): ColumnRole | null {
    const map: Record<string, ColumnRole> = {
      researcher: ColumnRole.Researcher,
      artisan: ColumnRole.Artisan,
      negotiator: ColumnRole.Negotiator,
      evolver: ColumnRole.Evolver,
      prime: ColumnRole.Prime,
    };
    return map[s.toLowerCase()] ?? null;
  }

  /**
   * 获取 Cell 类型的能力
   */
  private getCapabilities(type: ColumnRole): string[] {
    switch (type) {
      case ColumnRole.Researcher:
        return ['research', 'analysis', 'investigation'];
      case ColumnRole.Artisan:
        return ['coding', 'implementation', 'building'];
      case ColumnRole.Negotiator:
        return ['coordination', 'communication', 'diplomacy'];
      case ColumnRole.Evolver:
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
  getSuccessRate(cellType: ColumnRole): number {
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
