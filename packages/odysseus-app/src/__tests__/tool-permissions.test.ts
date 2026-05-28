/**
 * Tool Permissions Tests
 *
 * Tests for the tool execution sandbox system:
 * - Default rules (auto, confirm)
 * - Custom rule management
 * - Permission checks
 * - Session approval lifecycle
 * - Edge cases
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ToolPermissions, type PermissionRule } from '../orchestrator/tool-permissions.js';

describe('ToolPermissions', () => {
  let perms: ToolPermissions;

  beforeEach(() => {
    perms = new ToolPermissions();
  });

  describe('Default Rules', () => {
    it('should have auto-permission for read-only tools', () => {
      const autoTools = ['time', 'agent_status', 'memory_recall', 'calculate', 'plan_goal'];
      for (const tool of autoTools) {
        const check = perms.check(tool);
        expect(check.allowed).toBe(true);
        expect(check.level).toBe('auto');
      }
    });

    it('should require confirmation for state-modifying tools', () => {
      const confirmTools = ['memory_store', 'trigger_dream'];
      for (const tool of confirmTools) {
        const check = perms.check(tool);
        expect(check.allowed).toBe(false);
        expect(check.level).toBe('confirm');
      }
    });

    it('should auto-approve unknown tools (default policy is auto)', () => {
      const check = perms.check('unknown_tool_xyz');
      expect(check.allowed).toBe(true);
      expect(check.level).toBe('auto');
      expect(check.reason).toContain('Auto-approved');
    });
  });

  describe('Custom Rules', () => {
    it('should add a custom deny rule', () => {
      perms.addRule({ tool: 'dangerous_tool', permission: 'deny', reason: 'Too risky' });
      const check = perms.check('dangerous_tool');
      expect(check.allowed).toBe(false);
      expect(check.level).toBe('deny');
      expect(check.reason).toBe('Too risky');
    });

    it('should add a custom auto rule', () => {
      perms.addRule({ tool: 'safe_tool', permission: 'auto', reason: 'Trusted' });
      const check = perms.check('safe_tool');
      expect(check.allowed).toBe(true);
      expect(check.level).toBe('auto');
    });

    it('should override default rules with custom rules', () => {
      // memory_store is normally confirm
      expect(perms.check('memory_store').allowed).toBe(false);

      // Override to auto
      perms.addRule({ tool: 'memory_store', permission: 'auto' });
      expect(perms.check('memory_store').allowed).toBe(true);
      expect(perms.check('memory_store').level).toBe('auto');
    });

    it('should batch add rules', () => {
      const rules: PermissionRule[] = [
        { tool: 'tool_a', permission: 'auto' },
        { tool: 'tool_b', permission: 'deny', reason: 'Forbidden' },
        { tool: 'tool_c', permission: 'confirm', reason: 'Needs OK' },
      ];
      perms.addRules(rules);

      expect(perms.check('tool_a').allowed).toBe(true);
      expect(perms.check('tool_b').allowed).toBe(false);
      expect(perms.check('tool_b').level).toBe('deny');
      expect(perms.check('tool_c').allowed).toBe(false);
      expect(perms.check('tool_c').level).toBe('confirm');
    });

    it('should remove a rule', () => {
      perms.addRule({ tool: 'removable', permission: 'auto' });
      expect(perms.check('removable').allowed).toBe(true);

      const removed = perms.removeRule('removable');
      expect(removed).toBe(true);
      // Falls back to default policy (auto)
      expect(perms.check('removable').level).toBe('auto');
      expect(perms.check('removable').allowed).toBe(true);
    });

    it('should return false when removing non-existent rule', () => {
      expect(perms.removeRule('nonexistent')).toBe(false);
    });
  });

  describe('Session Approval', () => {
    it('should allow confirm tool after approval', () => {
      // memory_store requires confirmation
      expect(perms.check('memory_store').allowed).toBe(false);

      // Approve it
      perms.approve('memory_store');

      // Now it should be allowed
      const check = perms.check('memory_store');
      expect(check.allowed).toBe(true);
      expect(check.level).toBe('confirm');
      expect(check.reason).toContain('Previously approved');
    });

    it('should not auto-approve when remember is false', () => {
      perms.approve('memory_store', false);
      const check = perms.check('memory_store');
      expect(check.allowed).toBe(false);
    });

    it('should clear all session approvals', () => {
      perms.approve('memory_store');
      perms.approve('trigger_dream');

      expect(perms.check('memory_store').allowed).toBe(true);
      expect(perms.check('trigger_dream').allowed).toBe(true);

      perms.clearApprovals();

      expect(perms.check('memory_store').allowed).toBe(false);
      expect(perms.check('trigger_dream').allowed).toBe(false);
    });

    it('should persist approval across multiple checks', () => {
      perms.approve('memory_store');

      for (let i = 0; i < 5; i++) {
        expect(perms.check('memory_store').allowed).toBe(true);
      }
    });
  });

  describe('deny() Method', () => {
    it('should deny a tool permanently', () => {
      // First approve it
      perms.approve('memory_store');
      expect(perms.check('memory_store').allowed).toBe(true);

      // Then deny it — should override approval
      perms.deny('memory_store');
      expect(perms.check('memory_store').allowed).toBe(false);
      expect(perms.check('memory_store').level).toBe('deny');
    });

    it('should deny a previously auto tool', () => {
      expect(perms.check('time').allowed).toBe(true);
      perms.deny('time');
      expect(perms.check('time').allowed).toBe(false);
      expect(perms.check('time').level).toBe('deny');
    });
  });

  describe('getRules()', () => {
    it('should return all rules including defaults', () => {
      const rules = perms.getRules();
      expect(rules.length).toBeGreaterThanOrEqual(7); // 5 auto + 2 confirm
    });

    it('should include custom rules', () => {
      perms.addRule({ tool: 'custom', permission: 'deny' });
      const rules = perms.getRules();
      const customRule = rules.find(r => r.tool === 'custom');
      expect(customRule).toBeDefined();
      expect(customRule!.permission).toBe('deny');
    });
  });

  describe('getPermissionLevel()', () => {
    it('should return correct level for known tools', () => {
      expect(perms.getPermissionLevel('time')).toBe('auto');
      expect(perms.getPermissionLevel('memory_store')).toBe('confirm');
    });

    it('should return default policy fallback for unknown tools (getPermissionLevel default)', () => {
      expect(perms.getPermissionLevel('totally_unknown')).toBe('auto');
    });
  });

  describe('Edge Cases', () => {
    it('should handle tools with same name but different params', () => {
      perms.approve('memory_store');
      // Params should not affect approval (simplified implementation)
      expect(perms.check('memory_store', { key: 'value' }).allowed).toBe(true);
    });

    it('should handle approve then deny — deny takes precedence', () => {
      perms.approve('memory_store');
      expect(perms.check('memory_store').allowed).toBe(true);
      // deny() changes the rule itself, so approval is overridden
      perms.deny('memory_store');
      expect(perms.check('memory_store').allowed).toBe(false);
      expect(perms.check('memory_store').level).toBe('deny');
    });

    it('should handle empty tool name gracefully', () => {
      const check = perms.check('');
      expect(check.level).toBe('auto');
      expect(check.allowed).toBe(true);
    });

    it('should return rule reason when available', () => {
      perms.addRule({ tool: 'explained', permission: 'deny', reason: 'Security policy' });
      expect(perms.check('explained').reason).toBe('Security policy');
    });

    it('should return default reason for deny without reason', () => {
      perms.addRule({ tool: 'unexplained', permission: 'deny' });
      expect(perms.check('unexplained').reason).toBe('Tool is disabled');
    });
  });
});
