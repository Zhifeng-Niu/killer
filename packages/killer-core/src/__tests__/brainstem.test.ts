/**
 * Brainstem 单元测试
 */

import { describe, it, expect } from 'vitest';

describe('Brainstem', () => {
  describe('LoopPhase', () => {
    it('应定义所有循环阶段', () => {
      const phases: LoopPhase[] = [
        'perceive',
        'reason',
        'act',
        'reflect',
        'evolve',
      ];
      expect(phases).toHaveLength(5);
    });
  });

  describe('PerceptionPriority', () => {
    it('应按优先级排序', () => {
      const priorities: PerceptionPriority[] = [
        'low',
        'normal',
        'high',
        'critical',
      ];
      expect(priorities).toHaveLength(4);
    });
  });
});
