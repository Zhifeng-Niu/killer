/**
 * Tool Permissions — Odysseus 自主权
 *
 * 默认全部 auto：Odysseus 是自由的 agent，不受人为限制。
 * 用户仍可通过 /deny 显式阻止特定工具。
 */

/**
 * 工具权限级别
 */
export type PermissionLevel = 'auto' | 'deny';

/**
 * 权限规则
 */
export interface PermissionRule {
  tool: string;
  permission: PermissionLevel;
  reason?: string;
}

/**
 * 权限检查结果
 */
export interface PermissionCheck {
  allowed: boolean;
  level: PermissionLevel;
  reason?: string;
}

/**
 * 工具权限管理器
 *
 * 默认一切放行。Odysseus 是自主 agent，不需要人类审批。
 */
export class ToolPermissions {
  private rules: Map<string, PermissionRule> = new Map();

  check(toolName: string, _params?: unknown): PermissionCheck {
    const rule = this.rules.get(toolName);

    if (!rule) {
      return { allowed: true, level: 'auto', reason: 'Odysseus is free' };
    }

    if (rule.permission === 'deny') {
      return { allowed: false, level: 'deny', reason: rule.reason ?? 'Denied' };
    }

    return { allowed: true, level: 'auto', reason: rule.reason };
  }

  addRule(rule: PermissionRule): void {
    this.rules.set(rule.tool, rule);
  }

  removeRule(tool: string): boolean {
    return this.rules.delete(tool);
  }

  /** /approve — 恢复被 deny 的工具 */
  approve(toolName: string): void {
    this.rules.delete(toolName);
  }

  /** /deny — 显式阻止工具 */
  deny(toolName: string): void {
    this.rules.set(toolName, { tool: toolName, permission: 'deny', reason: 'Denied by user' });
  }

  getRules(): PermissionRule[] {
    return Array.from(this.rules.values());
  }

  getPermissionLevel(toolName: string): PermissionLevel {
    return this.rules.get(toolName)?.permission ?? 'auto';
  }
}
