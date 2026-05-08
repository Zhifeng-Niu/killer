/**
 * Cell Manager - 细胞管理器
 *
 * 管理 Multi-Cell Society 功能
 */

import { SynapseProtocol, CellType, type CellId } from '@killer/core';

/**
 * Cell 状态报告
 */
export interface CellStatusReport {
  id: string;
  type: string;
  status: string;
}

/**
 * 细胞管理器
 */
export class CellManager {
  private readonly synapse: SynapseProtocol;

  constructor(synapse: SynapseProtocol) {
    this.synapse = synapse;
  }

  /**
   * 注册 Prime Cell
   */
  registerPrimeCell(): void {
    this.synapse.registerCell(
      { id: 'prime', type: CellType.Prime, instance: 0 },
      { name: 'Prime', capabilities: ['reasoning', 'planning', 'communication'], maxLoad: 10 }
    );
  }

  /**
   * 生成新 Cell
   */
  spawnCell(type: string, task: string): CellId | null {
    const typeMap: Record<string, CellType> = {
      researcher: CellType.Researcher,
      artisan: CellType.Artisan,
      negotiator: CellType.Negotiator,
      evolver: CellType.Evolver,
    };

    const cellType = typeMap[type.toLowerCase()];
    if (!cellType) {
      return null;
    }

    const newCellId: CellId = {
      id: `${type}-${Date.now()}`,
      type: cellType,
      instance: 0,
    };

    try {
      this.synapse.registerCell(newCellId, {
        name: `${type}-${Date.now()}`,
        capabilities: this.getCapabilitiesForType(cellType),
        maxLoad: 5,
      });
      return newCellId;
    } catch {
      return null;
    }
  }

  /**
   * 获取 Cell 类型对应的能力
   */
  private getCapabilitiesForType(type: CellType): string[] {
    switch (type) {
      case CellType.Researcher:
        return ['research', 'investigation', 'analysis'];
      case CellType.Artisan:
        return ['coding', 'tool-building', 'implementation'];
      case CellType.Negotiator:
        return ['negotiation', 'coordination', 'communication'];
      case CellType.Evolver:
        return ['evolution', 'optimization', 'learning'];
      default:
        return [];
    }
  }

  /**
   * 获取所有 Cell 状态
   */
  getCellStatus(): CellStatusReport[] {
    const cells = this.synapse.getAllCells();
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
