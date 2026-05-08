/**
 * Association Engine Tests - 联想扩散引擎
 */

import { describe, it, expect } from 'vitest';
import { AssociationEngine, DEFAULT_ASSOCIATION_CONFIG } from '../hippocampus/association.js';
import type { SemanticNode } from '../hippocampus/types.js';

function createNode(id: string, relations: Array<{ to: string; weight: number }>, strength = 1.0): SemanticNode {
  return {
    id,
    type: 'concept',
    label: id,
    properties: {},
    relations: relations.map(r => ({ to: r.to, type: 'related', weight: r.weight })),
    strength,
  };
}

function createGraph(nodes: SemanticNode[]): Map<string, SemanticNode> {
  const map = new Map<string, SemanticNode>();
  for (const node of nodes) {
    map.set(node.id, node);
  }
  return map;
}

describe('AssociationEngine', () => {
  describe('spreadActivation', () => {
    it('should activate seed node with activation 1.0', () => {
      const engine = new AssociationEngine();
      const graph = createGraph([createNode('a', [])]);

      const result = engine.spreadActivation(graph, 'a');

      expect(result).toHaveLength(1);
      expect(result[0].activation).toBe(1.0);
      expect(result[0].node.id).toBe('a');
    });

    it('should spread to connected nodes', () => {
      const engine = new AssociationEngine();
      const graph = createGraph([
        createNode('a', [{ to: 'b', weight: 1.0 }]),
        createNode('b', []),
      ]);

      const result = engine.spreadActivation(graph, 'a');

      expect(result).toHaveLength(2);
      const nodeB = result.find(r => r.node.id === 'b');
      expect(nodeB).toBeDefined();
      // activation = 1.0 (parent) * 1.0 (relation) * 0.5 (decay) = 0.5
      expect(nodeB!.activation).toBe(0.5);
    });

    it('should apply decay factor at each hop', () => {
      const engine = new AssociationEngine();
      const graph = createGraph([
        createNode('a', [{ to: 'b', weight: 1.0 }]),
        createNode('b', [{ to: 'c', weight: 1.0 }]),
        createNode('c', []),
      ]);

      const result = engine.spreadActivation(graph, 'a');

      const nodeC = result.find(r => r.node.id === 'c');
      expect(nodeC).toBeDefined();
      // 1.0 * 1.0 * 0.5 = 0.5 for b, then 0.5 * 1.0 * 0.5 = 0.25 for c
      expect(nodeC!.activation).toBeCloseTo(0.25, 5);
    });

    it('should respect depth limit', () => {
      const engine = new AssociationEngine({ ...DEFAULT_ASSOCIATION_CONFIG, defaultDepth: 1 });
      const graph = createGraph([
        createNode('a', [{ to: 'b', weight: 1.0 }]),
        createNode('b', [{ to: 'c', weight: 1.0 }]),
        createNode('c', []),
      ]);

      const result = engine.spreadActivation(graph, 'a', 1);

      const ids = result.map(r => r.node.id);
      expect(ids).toContain('a');
      expect(ids).toContain('b');
      expect(ids).not.toContain('c');
    });

    it('should respect activation threshold', () => {
      const engine = new AssociationEngine({ ...DEFAULT_ASSOCIATION_CONFIG, defaultThreshold: 0.3 });
      const graph = createGraph([
        createNode('a', [{ to: 'b', weight: 0.3 }]), // 0.3 * 0.5 = 0.15 < threshold
        createNode('b', []),
      ]);

      const result = engine.spreadActivation(graph, 'a', 3, 0.3);

      expect(result).toHaveLength(1); // Only seed
    });

    it('should respect maxResults', () => {
      const engine = new AssociationEngine({ ...DEFAULT_ASSOCIATION_CONFIG, maxResults: 2 });
      const nodes = [
        createNode('a', [
          { to: 'b', weight: 1.0 },
          { to: 'c', weight: 0.9 },
          { to: 'd', weight: 0.8 },
        ]),
        createNode('b', []),
        createNode('c', []),
        createNode('d', []),
      ];
      const graph = createGraph(nodes);

      const result = engine.spreadActivation(graph, 'a');

      expect(result.length).toBeLessThanOrEqual(2);
    });

    it('should handle non-existent seed', () => {
      const engine = new AssociationEngine();
      const graph = createGraph([createNode('a', [])]);

      const result = engine.spreadActivation(graph, 'nonexistent');

      expect(result).toHaveLength(0);
    });

    it('should return results sorted by activation descending', () => {
      const engine = new AssociationEngine();
      const graph = createGraph([
        createNode('a', [
          { to: 'b', weight: 0.3 },
          { to: 'c', weight: 1.0 },
        ]),
        createNode('b', []),
        createNode('c', []),
      ]);

      const result = engine.spreadActivation(graph, 'a');

      expect(result[0].node.id).toBe('a');
      // c should have higher activation than b
      const nodeC = result.find(r => r.node.id === 'c');
      const nodeB = result.find(r => r.node.id === 'b');
      expect(nodeC!.activation).toBeGreaterThan(nodeB!.activation);
    });

    it('should record activation path', () => {
      const engine = new AssociationEngine();
      const graph = createGraph([
        createNode('a', [{ to: 'b', weight: 1.0 }]),
        createNode('b', [{ to: 'c', weight: 1.0 }]),
        createNode('c', []),
      ]);

      const result = engine.spreadActivation(graph, 'a');

      const nodeC = result.find(r => r.node.id === 'c');
      expect(nodeC!.path).toEqual(['a', 'b', 'c']);
    });

    it('should handle disconnected graph', () => {
      const engine = new AssociationEngine();
      const graph = createGraph([
        createNode('a', []),
        createNode('b', []),
      ]);

      const result = engine.spreadActivation(graph, 'a');

      expect(result).toHaveLength(1);
      expect(result[0].node.id).toBe('a');
    });

    it('should handle cycles without infinite loop', () => {
      const engine = new AssociationEngine();
      const graph = createGraph([
        createNode('a', [{ to: 'b', weight: 1.0 }]),
        createNode('b', [{ to: 'a', weight: 1.0 }]),
      ]);

      const result = engine.spreadActivation(graph, 'a');

      // Should not loop infinitely
      expect(result.length).toBeGreaterThan(0);
    });

    it('should factor in node strength', () => {
      const engine = new AssociationEngine();
      const graph = createGraph([
        createNode('a', [{ to: 'b', weight: 1.0 }], 0.5), // Lower strength
        createNode('b', []),
      ]);

      const result = engine.spreadActivation(graph, 'a');
      const nodeB = result.find(r => r.node.id === 'b');

      // activation = 1.0 * 1.0 * 0.5 (decay) * 0.5 (node strength) = 0.25
      expect(nodeB!.activation).toBe(0.25);
    });
  });

  describe('spreadFromMultiple', () => {
    it('should merge results from multiple seeds', () => {
      const engine = new AssociationEngine();
      const graph = createGraph([
        createNode('a', [{ to: 'c', weight: 1.0 }]),
        createNode('b', [{ to: 'c', weight: 1.0 }]),
        createNode('c', []),
      ]);

      const result = engine.spreadFromMultiple(graph, ['a', 'b']);

      // a, b, c all activated
      expect(result.length).toBe(3);
    });

    it('should keep higher activation when nodes overlap', () => {
      const engine = new AssociationEngine();
      const graph = createGraph([
        createNode('a', [{ to: 'c', weight: 1.0 }]),
        createNode('b', [{ to: 'c', weight: 0.3 }]),
        createNode('c', []),
      ]);

      const result = engine.spreadFromMultiple(graph, ['a', 'b']);

      const nodeC = result.find(r => r.node.id === 'c');
      // From 'a': 1.0 * 1.0 * 0.5 = 0.5
      // From 'b': 1.0 * 0.3 * 0.5 = 0.15
      // Should keep 0.5 (higher)
      expect(nodeC!.activation).toBe(0.5);
    });
  });

  describe('calculateAssociationStrength', () => {
    it('should return 1.0 for same node', () => {
      const engine = new AssociationEngine();
      const graph = createGraph([createNode('a', [])]);

      expect(engine.calculateAssociationStrength(graph, 'a', 'a')).toBe(1.0);
    });

    it('should calculate direct association', () => {
      const engine = new AssociationEngine();
      const graph = createGraph([
        createNode('a', [{ to: 'b', weight: 0.8 }]),
        createNode('b', []),
      ]);

      const strength = engine.calculateAssociationStrength(graph, 'a', 'b');
      // 1.0 * 0.8 * 0.5 = 0.4
      expect(strength).toBeCloseTo(0.4, 5);
    });

    it('should return 0 for disconnected nodes', () => {
      const engine = new AssociationEngine();
      const graph = createGraph([
        createNode('a', []),
        createNode('b', []),
      ]);

      expect(engine.calculateAssociationStrength(graph, 'a', 'b')).toBe(0);
    });

    it('should calculate multi-hop association', () => {
      const engine = new AssociationEngine();
      const graph = createGraph([
        createNode('a', [{ to: 'b', weight: 1.0 }]),
        createNode('b', [{ to: 'c', weight: 1.0 }]),
        createNode('c', []),
      ]);

      const strength = engine.calculateAssociationStrength(graph, 'a', 'c');
      // 1.0 * 1.0 * 0.5 * 1.0 * 0.5 = 0.25
      expect(strength).toBeCloseTo(0.25, 5);
    });
  });

  describe('findShortestPath', () => {
    it('should return single node for same source/dest', () => {
      const engine = new AssociationEngine();
      const graph = createGraph([createNode('a', [])]);

      expect(engine.findShortestPath(graph, 'a', 'a')).toEqual(['a']);
    });

    it('should find direct path', () => {
      const engine = new AssociationEngine();
      const graph = createGraph([
        createNode('a', [{ to: 'b', weight: 1.0 }]),
        createNode('b', []),
      ]);

      expect(engine.findShortestPath(graph, 'a', 'b')).toEqual(['a', 'b']);
    });

    it('should find multi-hop path', () => {
      const engine = new AssociationEngine();
      const graph = createGraph([
        createNode('a', [{ to: 'b', weight: 1.0 }]),
        createNode('b', [{ to: 'c', weight: 1.0 }]),
        createNode('c', []),
      ]);

      expect(engine.findShortestPath(graph, 'a', 'c')).toEqual(['a', 'b', 'c']);
    });

    it('should return empty for unreachable nodes', () => {
      const engine = new AssociationEngine();
      const graph = createGraph([
        createNode('a', []),
        createNode('b', []),
      ]);

      expect(engine.findShortestPath(graph, 'a', 'b')).toEqual([]);
    });

    it('should handle non-existent node', () => {
      const engine = new AssociationEngine();
      const graph = createGraph([createNode('a', [])]);

      expect(engine.findShortestPath(graph, 'a', 'nonexistent')).toEqual([]);
    });
  });

  describe('getCommunity', () => {
    it('should return nodes above threshold', () => {
      const engine = new AssociationEngine();
      const graph = createGraph([
        createNode('a', [
          { to: 'b', weight: 1.0 },
          { to: 'c', weight: 1.0 },
        ]),
        createNode('b', []),
        createNode('c', []),
        createNode('d', []),
      ]);

      const community = engine.getCommunity(graph, 'a', 0.1);

      expect(community.length).toBeGreaterThanOrEqual(2);
      expect(community.map(n => n.id)).toContain('b');
      expect(community.map(n => n.id)).toContain('c');
    });

    it('should return only seed for isolated node', () => {
      const engine = new AssociationEngine();
      const graph = createGraph([createNode('a', [])]);

      const community = engine.getCommunity(graph, 'a', 0.1);

      expect(community).toHaveLength(1);
      expect(community[0].id).toBe('a');
    });
  });
});
