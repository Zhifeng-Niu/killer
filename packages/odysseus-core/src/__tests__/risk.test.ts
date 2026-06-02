/**
 * Risk Assessor Tests
 */

import { describe, it, expect } from 'vitest';
import { RiskAssessor } from '../prefrontal/risk.js';

describe('RiskAssessor', () => {
  const assessor = new RiskAssessor();

  describe('assess', () => {
    it('should assess memory_store as negligible/low risk', () => {
      const assessment = assessor.assess({ type: 'memory_store', payload: {} });

      expect(assessment.overallScore).toBeLessThan(0.4);
      expect(assessment.factors.length).toBeGreaterThan(0);
      expect(assessment.mitigations).toBeDefined();
    });

    it('should assess system_command as critical risk', () => {
      const assessment = assessor.assess({ type: 'system_command', payload: { cmd: 'rm -rf' } });

      expect(assessment.overallScore).toBeGreaterThan(0.7);
      expect(assessment.level).toBe('critical');
    });

    it('should assess file_delete as high risk', () => {
      const assessment = assessor.assess({ type: 'file_delete', payload: { path: '/data' } });

      expect(assessment.overallScore).toBeGreaterThan(0.6);
      expect(['high', 'critical']).toContain(assessment.level);
    });

    it('should assess tool_call as low risk', () => {
      const assessment = assessor.assess({ type: 'tool_call', payload: {} });

      expect(assessment.overallScore).toBeLessThan(0.5);
    });

    it('should use default risk for unknown action types', () => {
      const assessment = assessor.assess({ type: 'custom_action', payload: {} });

      expect(assessment.overallScore).toBeGreaterThan(0);
      expect(assessment.overallScore).toBeLessThan(1);
    });

    it('should always return 3 risk factors', () => {
      const assessment = assessor.assess({ type: 'code_edit', payload: {} });

      expect(assessment.factors).toHaveLength(3);
      const names = assessment.factors.map(f => f.name);
      expect(names).toContain('reversibility');
      expect(names).toContain('scope');
      expect(names).toContain('time_sensitivity');
    });

    it('should return risk level as valid RiskLevel', () => {
      const levels = new Set(['negligible', 'low', 'moderate', 'high', 'critical']);

      for (const type of ['memory_store', 'tool_call', 'code_edit', 'file_delete', 'system_command']) {
        const assessment = assessor.assess({ type, payload: {} });
        expect(levels.has(assessment.level)).toBe(true);
      }
    });
  });

  describe('mitigations', () => {
    it('should suggest mitigations for code_edit', () => {
      const assessment = assessor.assess({ type: 'code_edit', payload: {} });

      expect(assessment.mitigations.length).toBeGreaterThan(0);
      expect(assessment.mitigations.some(m => m.includes('测试环境') || m.includes('版本控制'))).toBe(true);
    });

    it('should suggest mitigations for system_command', () => {
      const assessment = assessor.assess({ type: 'system_command', payload: {} });

      expect(assessment.mitigations.some(m => m.includes('沙盒') || m.includes('参数'))).toBe(true);
    });

    it('should warn about irreversible operations', () => {
      const assessment = assessor.assess({ type: 'file_delete', payload: {} });

      expect(assessment.mitigations.some(m => m.includes('不可逆'))).toBe(true);
    });
  });

  describe('assessBatch', () => {
    it('should assess multiple actions', () => {
      const results = assessor.assessBatch([
        { type: 'memory_store', payload: {} },
        { type: 'system_command', payload: {} },
        { type: 'tool_call', payload: {} },
      ]);

      expect(results).toHaveLength(3);
      // system_command should have highest risk
      expect(results[1].overallScore).toBeGreaterThan(results[0].overallScore);
      expect(results[1].overallScore).toBeGreaterThan(results[2].overallScore);
    });
  });

  describe('compare', () => {
    it('should identify safer action', () => {
      const result = assessor.compare(
        { type: 'memory_store', payload: {} },
        { type: 'file_delete', payload: {} },
      );

      expect(result.safer).toBe('action1');
      expect(result.difference).toBeGreaterThan(0);
    });

    it('should identify equal risk', () => {
      const result = assessor.compare(
        { type: 'tool_call', payload: {} },
        { type: 'tool_call', payload: {} },
      );

      expect(result.safer).toBe('equal');
      expect(result.difference).toBe(0);
    });
  });

  describe('risk ordering', () => {
    it('should order risks: memory_store < tool_call < message_send < code_edit < cell_create < file_delete < system_command', () => {
      const actions = [
        'memory_store', 'tool_call', 'message_send', 'code_edit',
        'cell_create', 'file_delete', 'system_command',
      ];

      const scores = actions.map(type => assessor.assess({ type, payload: {} }).overallScore);

      for (let i = 1; i < scores.length; i++) {
        expect(scores[i]).toBeGreaterThan(scores[i - 1]);
      }
    });
  });
});
