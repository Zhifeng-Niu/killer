/**
 * Cell Manager - 细胞管理器
 *
 * 管理 Multi-Cell Society 功能
 */

import { SynapseProtocol, ColumnRole, type ColumnId } from '@odysseus/core';

/**
 * Cell 状态报告
 */
export interface ColumnStatusReport {
  id: string;
  type: string;
  status: string;
}

/**
 * 细胞管理器
 */
export class ColumnManager {
  private readonly synapse: SynapseProtocol;

  constructor(synapse: SynapseProtocol) {
    this.synapse = synapse;
  }

  /**
   * 注册 Prime Cell
   */
  registerPrimeCell(): void {
    this.synapse.registerColumn(
      { id: 'prime', type: ColumnRole.Prime, instance: 0 },
      { name: 'Prime', capabilities: ['reasoning', 'planning', 'communication'], maxLoad: 10 }
    );
  }

  /**
   * 生成新 Cell
   */
  spawnCell(type: string, task: string): ColumnId | null {
    const typeMap: Record<string, ColumnRole> = {
      researcher: ColumnRole.Researcher,
      artisan: ColumnRole.Artisan,
      negotiator: ColumnRole.Negotiator,
      evolver: ColumnRole.Evolver,
      critic: ColumnRole.Critic,
      explorer: ColumnRole.Explorer,
    };

    const cellType = typeMap[type.toLowerCase()];
    if (!cellType) {
      return null;
    }

    const newColumnId: ColumnId = {
      id: `${type}-${Date.now()}`,
      type: cellType,
      instance: 0,
    };

    try {
      this.synapse.registerColumn(newColumnId, {
        name: `${type}-${Date.now()}`,
        capabilities: this.getCapabilitiesForType(cellType),
        maxLoad: 5,
      });
      return newColumnId;
    } catch {
      return null;
    }
  }

  /**
   * 获取 Cell 类型对应的能力
   */
  private getCapabilitiesForType(type: ColumnRole): string[] {
    switch (type) {
      case ColumnRole.Researcher:
        return ['research', 'investigation', 'analysis'];
      case ColumnRole.Artisan:
        return ['coding', 'tool-building', 'implementation'];
      case ColumnRole.Negotiator:
        return ['negotiation', 'coordination', 'communication'];
      case ColumnRole.Evolver:
        return ['evolution', 'optimization', 'learning'];
      case ColumnRole.Critic:
        return ['evaluation', 'verification', 'risk-assessment', 'quality-gate'];
      case ColumnRole.Explorer:
        return ['hypothesis-generation', 'novelty-detection', 'divergent-thinking'];
      default:
        return [];
    }
  }

  /**
   * 获取所有 Cell 状态
   */
  getColumnStatus(): ColumnStatusReport[] {
    const cells = this.synapse.getAllColumns();
    return cells.map((cell) => ({
      id: cell.id.id,
      type: cell.id.type,
      status: cell.status.alive ? 'alive' : 'dead',
    }));
  }

  /**
   * 获取 Cell 数量和类型列表
   */
  getCellStats(): { count: number; types: string[] } {
    const cells = this.synapse.discoverCells();
    return {
      count: cells.length,
      types: Array.from(new Set(cells.map((c) => c.type))),
    };
  }
}
