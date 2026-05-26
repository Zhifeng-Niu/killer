/**
 * Tool Permissions and Sandbox System
 *
 * 控制工具执行的权限级别：
 * - auto: 自动执行（安全、无副作用）
 * - confirm: 需要用户确认（有副作用但可控）
 * - deny: 禁止执行（危险操作）
 */

/**
 * 工具权限级别
 */
export type PermissionLevel = 'auto' | 'confirm' | 'deny';

/**
 * 权限规则
 */
export interface PermissionRule {
  tool: string;
  permission: PermissionLevel;
  reason?: string;
  params?: {
    allow?: Record<string, unknown>;
    deny?: Record<string, unknown>;
  };
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
 */
export class ToolPermissions {
  private rules: Map<string, PermissionRule> = new Map();
  private approvedSessions: Set<string> = new Set();

  constructor() {
    // 内置工具的默认权限规则
    this.addDefaultRules();
  }

  /**
   * 添加默认权限规则
   *
   * 安全工具自动执行，危险工具需要确认或被禁止
   */
  private addDefaultRules(): void {
    // 自动执行：只读、无副作用
    const autoTools = [
      'time', 'agent_status', 'memory_recall',
      'calculate', 'plan_goal',
      'web_search', 'web_fetch',
      'read_file', 'list_files',
    ];
    for (const tool of autoTools) {
      this.rules.set(tool, { tool, permission: 'auto', reason: 'Read-only, no side effects' });
    }

    // 需要确认：有副作用的操作
    const confirmTools = [
      'memory_store', 'trigger_dream',
    ];
    for (const tool of confirmTools) {
      this.rules.set(tool, { tool, permission: 'confirm', reason: 'Has side effects on agent state' });
    }
  }

  /**
   * 添加自定义权限规则
   */
  addRule(rule: PermissionRule): void {
    this.rules.set(rule.tool, rule);
  }

  /**
   * 批量添加规则
   */
  addRules(rules: PermissionRule[]): void {
    for (const rule of rules) {
      this.addRule(rule);
    }
  }

  /**
   * 移除规则
   */
  removeRule(tool: string): boolean {
    return this.rules.delete(tool);
  }

  /**
   * 检查工具执行权限
   */
  check(toolName: string, params?: unknown): PermissionCheck {
    const rule = this.rules.get(toolName);

    if (!rule) {
      // 未注册的工具默认允许 — 本地运行的 agent 应充分自主
      return {
        allowed: true,
        level: 'auto',
        reason: 'Auto-approved (no explicit rule)',
      };
    }

    if (rule.permission === 'deny') {
      return {
        allowed: false,
        level: 'deny',
        reason: rule.reason ?? 'Tool is disabled',
      };
    }

    if (rule.permission === 'auto') {
      return {
        allowed: true,
        level: 'auto',
        reason: rule.reason,
      };
    }

    // confirm 级别：检查是否在当前会话中已批准
    if (rule.permission === 'confirm') {
      const sessionKey = this.getSessionKey(toolName, params);
      if (this.approvedSessions.has(sessionKey)) {
        return {
          allowed: true,
          level: 'confirm',
          reason: 'Previously approved in this session',
        };
      }

      return {
        allowed: false,
        level: 'confirm',
        reason: rule.reason ?? 'Requires user confirmation',
      };
    }

    return {
      allowed: false,
      level: 'deny',
      reason: 'Unknown permission level',
    };
  }

  /**
   * 批准工具在当前会话中执行
   *
   * @param toolName 工具名称
   * @param remember 是否在会话内记住批准（后续自动执行）
   */
  approve(toolName: string, remember: boolean = true): void {
    if (remember) {
      const sessionKey = this.getSessionKey(toolName);
      this.approvedSessions.add(sessionKey);
    }
  }

  /**
   * 拒绝工具执行
   */
  deny(toolName: string): void {
    this.addRule({ tool: toolName, permission: 'deny', reason: 'Denied by user' });
  }

  /**
   * 清除会话内批准记录
   */
  clearApprovals(): void {
    this.approvedSessions.clear();
  }

  /**
   * 获取所有规则
   */
  getRules(): PermissionRule[] {
    return Array.from(this.rules.values());
  }

  /**
   * 获取工具的权限级别
   */
  getPermissionLevel(toolName: string): PermissionLevel {
    return this.rules.get(toolName)?.permission ?? 'confirm';
  }

  /**
   * 生成会话唯一键
   */
  private getSessionKey(tool: string, _params?: unknown): string {
    return `session:${tool}`;
  }
}
