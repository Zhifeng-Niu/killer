/**
 * CellManager Tests - Cell Lifecycle Management
 */

import { describe, it, expect } from 'vitest';
import { CellManager } from '../orchestrator/cells.js';
import { SynapseProtocol, CellType, type CellId } from '@killer/core';

describe('CellManager', () => {
  function createManager(): { manager: CellManager; synapse: SynapseProtocol } {
    const synapse = new SynapseProtocol();
    const manager = new CellManager(synapse);
    return { manager, synapse };
  }

  describe('registerPrimeCell', () => {
    it('should register the prime cell', () => {
      const { manager, synapse } = createManager();
      manager.registerPrimeCell();

      const cells = synapse.getAllCells();
      expect(cells).toHaveLength(1);
      expect(cells[0].id.id).toBe('prime');
      expect(cells[0].id.type).toBe(CellType.Prime);
    });

    it('should give prime cell correct capabilities', () => {
      const { manager, synapse } = createManager();
      manager.registerPrimeCell();

      const cells = synapse.getAllCells();
      expect(cells[0].config.capabilities).toContain('reasoning');
      expect(cells[0].config.capabilities).toContain('planning');
    });
  });

  describe('spawnCell', () => {
    it('should spawn a researcher cell', () => {
      const { manager, synapse } = createManager();
      const cellId = manager.spawnCell('researcher', 'Research task');

      expect(cellId).not.toBeNull();
      expect(cellId!.type).toBe(CellType.Researcher);
      expect(cellId!.id).toContain('researcher');

      const cells = synapse.getAllCells();
      expect(cells).toHaveLength(1);
    });

    it('should spawn an artisan cell', () => {
      const { manager } = createManager();
      const cellId = manager.spawnCell('artisan', 'Build feature');

      expect(cellId).not.toBeNull();
      expect(cellId!.type).toBe(CellType.Artisan);
    });

    it('should spawn a negotiator cell', () => {
      const { manager } = createManager();
      const cellId = manager.spawnCell('negotiator', 'Coordinate');

      expect(cellId).not.toBeNull();
      expect(cellId!.type).toBe(CellType.Negotiator);
    });

    it('should spawn an evolver cell', () => {
      const { manager } = createManager();
      const cellId = manager.spawnCell('evolver', 'Optimize');

      expect(cellId).not.toBeNull();
      expect(cellId!.type).toBe(CellType.Evolver);
    });

    it('should be case-insensitive for type', () => {
      const { manager } = createManager();
      const cellId = manager.spawnCell('RESEARCHER', 'Task');
      expect(cellId).not.toBeNull();
      expect(cellId!.type).toBe(CellType.Researcher);
    });

    it('should return null for unknown type', () => {
      const { manager } = createManager();
      const cellId = manager.spawnCell('unknown_type', 'Task');
      expect(cellId).toBeNull();
    });

    it('should assign correct capabilities per type', () => {
      const { manager, synapse } = createManager();
      manager.spawnCell('researcher', 'R');

      const cells = synapse.getAllCells();
      expect(cells[0].config.capabilities).toContain('research');
      expect(cells[0].config.capabilities).toContain('analysis');
    });

    it('should assign artisan capabilities', () => {
      const { manager, synapse } = createManager();
      manager.spawnCell('artisan', 'A');

      const cells = synapse.getAllCells();
      expect(cells[0].config.capabilities).toContain('coding');
      expect(cells[0].config.capabilities).toContain('implementation');
    });

    it('should assign negotiator capabilities', () => {
      const { manager, synapse } = createManager();
      manager.spawnCell('negotiator', 'N');

      const cells = synapse.getAllCells();
      expect(cells[0].config.capabilities).toContain('negotiation');
      expect(cells[0].config.capabilities).toContain('coordination');
    });

    it('should assign evolver capabilities', () => {
      const { manager, synapse } = createManager();
      manager.spawnCell('evolver', 'E');

      const cells = synapse.getAllCells();
      expect(cells[0].config.capabilities).toContain('evolution');
      expect(cells[0].config.capabilities).toContain('learning');
    });

    it('should generate unique cell IDs', async () => {
      const { manager } = createManager();
      const id1 = manager.spawnCell('researcher', 'T1');
      await new Promise(r => setTimeout(r, 2));
      const id2 = manager.spawnCell('artisan', 'T2');

      expect(id1!.id).not.toBe(id2!.id);
    });
  });

  describe('getCellStatus', () => {
    it('should report status of registered cells', () => {
      const { manager } = createManager();
      manager.registerPrimeCell();
      manager.spawnCell('researcher', 'R');

      const status = manager.getCellStatus();
      expect(status).toHaveLength(2);
      expect(status[0].status).toBe('alive');
      expect(status[1].status).toBe('alive');
    });

    it('should return empty array when no cells', () => {
      const { manager } = createManager();
      expect(manager.getCellStatus()).toEqual([]);
    });
  });

  describe('getCellStats', () => {
    it('should report cell count and types', () => {
      const { manager } = createManager();
      manager.registerPrimeCell();
      manager.spawnCell('researcher', 'R');
      manager.spawnCell('artisan', 'A');

      const stats = manager.getCellStats();
      expect(stats.count).toBe(3);
      expect(stats.types).toContain('prime');
      expect(stats.types).toContain('researcher');
      expect(stats.types).toContain('artisan');
    });

    it('should deduplicate types', async () => {
      const { manager } = createManager();
      manager.spawnCell('researcher', 'R1');
      await new Promise(r => setTimeout(r, 2));
      manager.spawnCell('researcher', 'R2');

      const stats = manager.getCellStats();
      expect(stats.count).toBe(2);
      // Types should be deduplicated
      const researcherCount = stats.types.filter(t => t === 'researcher').length;
      expect(researcherCount).toBe(1);
    });

    it('should return zero count when no cells', () => {
      const { manager } = createManager();
      const stats = manager.getCellStats();
      expect(stats.count).toBe(0);
      expect(stats.types).toEqual([]);
    });
  });

  describe('critic and explorer cells', () => {
    it('should spawn a critic cell', () => {
      const { manager, synapse } = createManager();
      const cellId = manager.spawnCell('critic', 'Evaluate experiment result');

      expect(cellId).not.toBeNull();
      expect(cellId!.type).toBe(CellType.Critic);
      expect(cellId!.id).toContain('critic');

      const cells = synapse.getAllCells();
      expect(cells).toHaveLength(1);
      expect(cells[0].config.capabilities).toContain('evaluation');
      expect(cells[0].config.capabilities).toContain('verification');
      expect(cells[0].config.capabilities).toContain('risk-assessment');
      expect(cells[0].config.capabilities).toContain('quality-gate');
    });

    it('should spawn an explorer cell', () => {
      const { manager, synapse } = createManager();
      const cellId = manager.spawnCell('explorer', 'Generate novel hypotheses');

      expect(cellId).not.toBeNull();
      expect(cellId!.type).toBe(CellType.Explorer);
      expect(cellId!.id).toContain('explorer');

      const cells = synapse.getAllCells();
      expect(cells).toHaveLength(1);
      expect(cells[0].config.capabilities).toContain('hypothesis-generation');
      expect(cells[0].config.capabilities).toContain('novelty-detection');
      expect(cells[0].config.capabilities).toContain('divergent-thinking');
    });

    it('should spawn both critic and explorer for Cerebellum collaboration', () => {
      const { manager, synapse } = createManager();

      const critic = manager.spawnCell('critic', 'Evaluate');
      const explorer = manager.spawnCell('explorer', 'Explore');

      expect(critic).not.toBeNull();
      expect(explorer).not.toBeNull();
      expect(critic!.type).toBe(CellType.Critic);
      expect(explorer!.type).toBe(CellType.Explorer);

      const cells = synapse.getAllCells();
      expect(cells).toHaveLength(2);
    });

    it('should include critic and explorer in cell stats', () => {
      const { manager } = createManager();
      manager.spawnCell('critic', 'C1');
      manager.spawnCell('explorer', 'E1');

      const stats = manager.getCellStats();
      expect(stats.count).toBe(2);
      expect(stats.types).toContain('critic');
      expect(stats.types).toContain('explorer');
    });
  });
});
