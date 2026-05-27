/**
 * Tool Permissions Tests
 */

import { describe, it, expect } from 'vitest';
import { ToolPermissions, type PermissionRule } from '../orchestrator/tool-permissions.js';

describe('ToolPermissions', () => {
  it('should auto-approve safe tools', () => {
    const perms = new ToolPermissions();

    expect(perms.check('time').allowed).toBe(true);
    expect(perms.check('agent_status').allowed).toBe(true);
    expect(perms.check('memory_recall').allowed).toBe(true);
    expect(perms.check('calculate').allowed).toBe(true);
  });

  it('should require confirmation for side-effect tools', () => {
    const perms = new ToolPermissions();

    const storeCheck = perms.check('memory_store');
    expect(storeCheck.level).toBe('confirm');
    expect(storeCheck.allowed).toBe(false);

    const dreamCheck = perms.check('trigger_dream');
    expect(dreamCheck.level).toBe('confirm');
    expect(dreamCheck.allowed).toBe(false);
  });

  it('should auto-approve unknown tools with default policy', () => {
    const perms = new ToolPermissions();

    const check = perms.check('unknown_tool');
    expect(check.allowed).toBe(true);
    expect(check.level).toBe('auto');
  });

  it('should allow tools after approval', () => {
    const perms = new ToolPermissions();

    // Before approval
    expect(perms.check('memory_store').allowed).toBe(false);

    // Approve
    perms.approve('memory_store');

    // After approval
    expect(perms.check('memory_store').allowed).toBe(true);
  });

  it('should deny explicitly denied tools', () => {
    const perms = new ToolPermissions();

    perms.deny('time');
    const check = perms.check('time');
    expect(check.allowed).toBe(false);
    expect(check.level).toBe('deny');
  });

  it('should support custom rules', () => {
    const perms = new ToolPermissions();

    perms.addRule({ tool: 'custom_tool', permission: 'auto', reason: 'Safe to run' });
    expect(perms.check('custom_tool').allowed).toBe(true);
  });

  it('should support batch rule addition', () => {
    const perms = new ToolPermissions();

    const rules: PermissionRule[] = [
      { tool: 'tool_a', permission: 'auto' },
      { tool: 'tool_b', permission: 'confirm' },
      { tool: 'tool_c', permission: 'deny' },
    ];
    perms.addRules(rules);

    expect(perms.check('tool_a').allowed).toBe(true);
    expect(perms.check('tool_b').allowed).toBe(false);
    expect(perms.check('tool_c').allowed).toBe(false);
  });

  it('should clear approvals', () => {
    const perms = new ToolPermissions();

    perms.approve('memory_store');
    expect(perms.check('memory_store').allowed).toBe(true);

    perms.clearApprovals();
    expect(perms.check('memory_store').allowed).toBe(false);
  });

  it('should list all rules', () => {
    const perms = new ToolPermissions();
    const rules = perms.getRules();

    expect(rules.length).toBeGreaterThan(0);
    expect(rules.every(r => r.tool && r.permission)).toBe(true);
  });

  it('should return correct permission levels', () => {
    const perms = new ToolPermissions();

    expect(perms.getPermissionLevel('time')).toBe('auto');
    expect(perms.getPermissionLevel('memory_store')).toBe('confirm');
    expect(perms.getPermissionLevel('unknown')).toBe('auto');
  });

  it('should remove rules', () => {
    const perms = new ToolPermissions();
    perms.addRule({ tool: 'temp_tool', permission: 'deny' });

    expect(perms.check('temp_tool').level).toBe('deny');

    perms.removeRule('temp_tool');
    // After removal, falls back to default policy (auto)
    expect(perms.check('temp_tool').level).toBe('auto');
  });
});
