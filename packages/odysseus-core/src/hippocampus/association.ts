/**
 * Hippocampus - 联想扩散引擎
 *
 * 替代传统 RAG 检索的核心算法
 * 从种子节点开始，沿关系边扩散激活
 */

import type { SemanticNode, SemanticRelation } from './types.js';

/**
 * 联想扩散配置
 */
export interface AssociationConfig {
  /**
   * 默认扩散深度
   */
  defaultDepth: number;

  /**
   * 默认激活阈值
   */
  defaultThreshold: number;

  /**
   * 每跳衰减系数
   */
  decayFactor: number;

  /**
   * 最大结果数
   */
  maxResults: number;

  /**
   * 是否激活反向关系
   */
  includeReverse: boolean;
}

/**
 * 默认联想扩散配置
 */
export const DEFAULT_ASSOCIATION_CONFIG: AssociationConfig = {
  defaultDepth: 3,
  defaultThreshold: 0.1,
  decayFactor: 0.5, // 每跳衰减 50%
  maxResults: 50,
  includeReverse: true,
};

/**
 * 激活的节点
 */
export interface ActivatedNode {
  node: SemanticNode;
  activation: number;
  depth: number;
  path: string[]; // 激活路径（节点 ID 序列）
}

/**
 * 联想扩散引擎
 *
 * 实现激活扩散算法，模拟人脑联想记忆
 */
export class AssociationEngine {
  private config: AssociationConfig;

  constructor(config: AssociationConfig = DEFAULT_ASSOCIATION_CONFIG) {
    this.config = config;
  }

  /**
   * 从种子节点执行联想扩散
   *
   * @param graph - 语义图谱
   * @param seed - 种子节点 ID
   * @param depth - 扩散深度
   * @param threshold - 激活阈值
   * @returns 激活的节点列表
   */
  spreadActivation(
    graph: Map<string, SemanticNode>,
    seed: string,
    depth: number = this.config.defaultDepth,
    threshold: number = this.config.defaultThreshold
  ): ActivatedNode[] {
    const results = new Map<string, ActivatedNode>();
    const visited = new Set<string>();
    const queue: Array<{ nodeId: string; activation: number; depth: number; path: string[] }> = [
      { nodeId: seed, activation: 1.0, depth: 0, path: [seed] },
    ];

    while (queue.length > 0) {
      const current = queue.shift()!;
      const { nodeId, activation, depth: currentDepth, path } = current;

      // 跳过已访问节点（保留更高激活值）
      if (visited.has(nodeId)) {
        continue;
      }

      // 检查深度限制
      if (currentDepth > depth) {
        continue;
      }

      // 检查激活阈值
      if (activation < threshold) {
        continue;
      }

      visited.add(nodeId);

      // 获取节点
      const node = graph.get(nodeId);
      if (!node) {
        continue;
      }

      // 记录结果
      results.set(nodeId, {
        node,
        activation,
        depth: currentDepth,
        path: [...path],
      });

      // 扩散到相邻节点
      const neighbors = this.getNeighbors(node, graph);
      for (const neighbor of neighbors) {
        if (!visited.has(neighbor.nodeId)) {
          const newActivation = activation * neighbor.weight * this.config.decayFactor;
          queue.push({
            nodeId: neighbor.nodeId,
            activation: newActivation,
            depth: currentDepth + 1,
            path: [...path, neighbor.nodeId],
          });
        }
      }
    }

    // 转换为数组并按激活值排序
    return Array.from(results.values())
      .sort((a, b) => b.activation - a.activation)
      .slice(0, this.config.maxResults);
  }

  /**
   * 多种子联想扩散
   *
   * @param graph - 语义图谱
   * @param seeds - 种子节点 ID 列表
   * @param depth - 扩散深度
   * @param threshold - 激活阈值
   * @returns 激活的节点列表
   */
  spreadFromMultiple(
    graph: Map<string, SemanticNode>,
    seeds: string[],
    depth: number = this.config.defaultDepth,
    threshold: number = this.config.defaultThreshold
  ): ActivatedNode[] {
    const allResults = new Map<string, ActivatedNode>();

    // 并行扩散所有种子
    for (const seed of seeds) {
      const results = this.spreadActivation(graph, seed, depth, threshold);
      for (const result of results) {
        const existing = allResults.get(result.node.id);
        if (existing) {
          // 合并激活值（取最大值）
          if (result.activation > existing.activation) {
            allResults.set(result.node.id, result);
          }
        } else {
          allResults.set(result.node.id, result);
        }
      }
    }

    return Array.from(allResults.values())
      .sort((a, b) => b.activation - a.activation)
      .slice(0, this.config.maxResults);
  }

  /**
   * 获取节点的邻居
   */
  private getNeighbors(
    node: SemanticNode,
    graph: Map<string, SemanticNode>
  ): Array<{ nodeId: string; weight: number }> {
    const neighbors: Array<{ nodeId: string; weight: number }> = [];

    // 正向关系
    for (const relation of node.relations) {
      neighbors.push({
        nodeId: relation.to,
        weight: relation.weight * node.strength,
      });
    }

    // 反向关系（如果启用）
    if (this.config.includeReverse) {
      for (const [, otherNode] of graph) {
        if (otherNode.id === node.id) continue;

        for (const relation of otherNode.relations) {
          if (relation.to === node.id) {
            neighbors.push({
              nodeId: otherNode.id,
              weight: relation.weight * otherNode.strength * 0.5, // 反向关系权重减半
            });
          }
        }
      }
    }

    return neighbors;
  }

  /**
   * 计算两个节点之间的关联强度
   *
   * @param graph - 语义图谱
   * @param from - 起始节点 ID
   * @param to - 目标节点 ID
   * @param maxDepth - 最大搜索深度
   * @returns 关联强度 [0, 1]，未找到返回 0
   */
  calculateAssociationStrength(
    graph: Map<string, SemanticNode>,
    from: string,
    to: string,
    maxDepth: number = 5
  ): number {
    if (from === to) {
      return 1.0;
    }

    const visited = new Set<string>();
    const queue: Array<{ nodeId: string; strength: number; depth: number }> = [
      { nodeId: from, strength: 1.0, depth: 0 },
    ];

    while (queue.length > 0) {
      const current = queue.shift()!;
      const { nodeId, strength, depth } = current;

      if (nodeId === to) {
        return strength;
      }

      if (depth >= maxDepth || strength < this.config.defaultThreshold) {
        continue;
      }

      if (visited.has(nodeId)) {
        continue;
      }

      visited.add(nodeId);

      const node = graph.get(nodeId);
      if (!node) {
        continue;
      }

      for (const relation of node.relations) {
        if (!visited.has(relation.to)) {
          queue.push({
            nodeId: relation.to,
            strength: strength * relation.weight * this.config.decayFactor,
            depth: depth + 1,
          });
        }
      }
    }

    return 0;
  }

  /**
   * 查找最短激活路径
   *
   * @param graph - 语义图谱
   * @param from - 起始节点 ID
   * @param to - 目标节点 ID
   * @returns 最短路径（节点 ID 序列），未找到返回空数组
   */
  findShortestPath(
    graph: Map<string, SemanticNode>,
    from: string,
    to: string
  ): string[] {
    if (from === to) {
      return [from];
    }

    const visited = new Set<string>();
    const queue: Array<{ nodeId: string; path: string[] }> = [
      { nodeId: from, path: [from] },
    ];

    while (queue.length > 0) {
      const current = queue.shift()!;
      const { nodeId, path } = current;

      if (nodeId === to) {
        return path;
      }

      if (visited.has(nodeId)) {
        continue;
      }

      visited.add(nodeId);

      const node = graph.get(nodeId);
      if (!node) {
        continue;
      }

      for (const relation of node.relations) {
        if (!visited.has(relation.to)) {
          queue.push({
            nodeId: relation.to,
            path: [...path, relation.to],
          });
        }
      }
    }

    return [];
  }

  /**
   * 获取节点社区
   *
   * 基于激活扩散，找出与给定节点高度相关的节点群
   *
   * @param graph - 语义图谱
   * @param nodeId - 节点 ID
   * @param threshold - 社区阈值
   * @returns 社区节点列表
   */
  getCommunity(
    graph: Map<string, SemanticNode>,
    nodeId: string,
    threshold: number = 0.3
  ): SemanticNode[] {
    const activated = this.spreadActivation(graph, nodeId, 3, threshold);
    return activated.map((a) => a.node);
  }
}
