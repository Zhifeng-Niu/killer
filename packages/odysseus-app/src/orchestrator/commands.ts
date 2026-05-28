/**
 * Command Handler - 命令处理器
 *
 * 处理来自 CLI / Webhook / Telegram 等渠道的命令。
 * 支持所有 30+ 命令，与 CLI readline-loop 保持功能对等。
 */

import type { SensoryRouter } from '../sensory/router.js';
import type { OutputManager } from '../sensory/output.js';
import type { AgentStatus } from './types.js';
import type { SensoryInput } from '../sensory/types.js';
import type { DreamResult as DreamCycleResult } from '@odysseus/core';
import type { Goal } from '@odysseus/core';
import type { ColumnStatusReport } from './cells.js';
import type { PersonaEngine } from '../persona/engine.js';
import type { SkillManager } from '../skills/manager.js';

/**
 * 所有支持的命令名
 */
const COMMAND_NAMES = [
  'help', 'status', 'cells', 'spawn', 'plan', 'plans', 'goals',
  'persona', 'skills', 'dream', 'think', 'memory', 'metrics',
  'save', 'load', 'sessions', 'evolve', 'delegate',
  'permissions', 'approve', 'deny', 'confirm',
  'plugins', 'plugin-unload', 'init',
  'narrative', 'predictions', 'emotions',
  'health', 'diagnostics', 'broadcast', 'report',
  'stop', 'exit',
] as const;

/**
 * 命令处理器依赖
 */
interface CommandHandlerDeps {
  // --- 必需依赖 ---
  sensoryRouter: SensoryRouter;
  outputManager: OutputManager;
  getStatus: () => AgentStatus;
  getColumnStatus: () => ColumnStatusReport[];
  triggerDreamCycle: () => Promise<DreamCycleResult>;
  spawnCell: (type: string, task: string) => { id: string } | null;
  createGoal: (description: string, priority: number) => Promise<Goal | null>;
  listGoals: () => Goal[];
  getPlanStats: () => { activePlans: number; completedGoals: number } | null;
  getPersonaEngine: () => PersonaEngine | null;
  getSkillManager: () => SkillManager | null;

  // --- 扩展命令依赖（全部可选，用于 API/Webhook/Telegram 对等） ---
  getMemoryStats?: () => { totalEpisodes: number; shortTermCount: number; longTermCount: number; associationCount: number };
  triggerThink?: (topic: string) => Promise<{ conclusion: string; confidence: number; suggestedActions: Array<{ type: string; payload: unknown }> }>;
  triggerEvolve?: () => Promise<{ mutations: number; successful: number; fitnessDelta: number; newBehaviors: string[] }>;
  delegateTask?: (task: string) => Promise<{ totalCellsUsed: number; durationMs: number }>;
  saveSessionAction?: (name: string) => void;
  loadSessionAction?: (name: string) => boolean;
  listSessionsAction?: () => Array<{ name: string; turns: number; savedAt: number }>;
  getPlugins?: () => Array<{ name: string; version: string; description?: string; source: string }>;
  unloadPluginAction?: (name: string) => Promise<boolean>;
  getPermissionRules?: () => Array<{ tool: string; permission: string; reason?: string }>;
  approveToolAction?: (name: string) => void;
  denyToolAction?: (name: string) => void;
  confirmToolAction?: (name: string) => void;
  getHealthReport?: () => { status: string; uptime: number; llm: { calls: number; errors: number; errorRate: number; avgLatency: number }; tools: { calls: number; avgLatency: number } };
  getMetricsSnapshot?: () => { metrics: Array<{ name: string; type: string; stats?: { avg: number }; labels?: Record<string, string> }> };
  getNarrative?: () => { identityStatement: string; activeThemes: string[]; chapters: Array<{ startTime: number; title: string; summary: string; emotionalTone: string }>; relationships: Array<{ userId: string; summary: string; trustLevel: number }> };
  getPredictions?: () => { psychologicalProfile: { decisionStyle: string; openness: number; conscientiousness: number; informationPreference: string; riskTolerance: number }; predictedNeeds: Array<{ description: string; confidence: number; timeHorizon: string }>; communicationPatterns: Array<{ name: string; frequency: number }> };
  getEmotionalState?: () => { primaryEmotion: string; intensity: number; current: { valence: number; arousal: number; dominance: number }; emotionalMemory: Array<{ emotion: string; intensity: number }> };
  getSynapseInfo?: () => { cells: Array<{ id: string; type: string; status: string }>; edges: Array<[string, string]> };
  initConfigDir?: () => string;
  shutdown?: () => Promise<void>;
}

/**
 * 命令处理器
 */
export class CommandHandler {
  private readonly sensoryRouter: SensoryRouter;
  private readonly outputManager: OutputManager;
  private readonly getStatus: () => AgentStatus;
  private readonly getColumnStatus: () => ColumnStatusReport[];
  private readonly triggerDreamCycle: () => Promise<DreamCycleResult>;
  private readonly spawnCell: (type: string, task: string) => { id: string } | null;
  private readonly createGoal: (description: string, priority: number) => Promise<Goal | null>;
  private readonly listGoals: () => Goal[];
  private readonly getPlanStats: () => { activePlans: number; completedGoals: number } | null;
  private readonly getPersonaEngine: () => PersonaEngine | null;
  private readonly getSkillManager: () => SkillManager | null;

  // Optional extended deps
  private readonly ext: Omit<CommandHandlerDeps, keyof MandatoryDeps>;

  constructor(deps: CommandHandlerDeps) {
    this.sensoryRouter = deps.sensoryRouter;
    this.outputManager = deps.outputManager;
    this.getStatus = deps.getStatus;
    this.getColumnStatus = deps.getColumnStatus;
    this.triggerDreamCycle = deps.triggerDreamCycle;
    this.spawnCell = deps.spawnCell;
    this.createGoal = deps.createGoal;
    this.listGoals = deps.listGoals;
    this.getPlanStats = deps.getPlanStats;
    this.getPersonaEngine = deps.getPersonaEngine;
    this.getSkillManager = deps.getSkillManager;

    // Store optional deps
    this.ext = {
      getMemoryStats: deps.getMemoryStats,
      triggerThink: deps.triggerThink,
      triggerEvolve: deps.triggerEvolve,
      delegateTask: deps.delegateTask,
      saveSessionAction: deps.saveSessionAction,
      loadSessionAction: deps.loadSessionAction,
      listSessionsAction: deps.listSessionsAction,
      getPlugins: deps.getPlugins,
      unloadPluginAction: deps.unloadPluginAction,
      getPermissionRules: deps.getPermissionRules,
      approveToolAction: deps.approveToolAction,
      denyToolAction: deps.denyToolAction,
      confirmToolAction: deps.confirmToolAction,
      getHealthReport: deps.getHealthReport,
      getMetricsSnapshot: deps.getMetricsSnapshot,
      getNarrative: deps.getNarrative,
      getPredictions: deps.getPredictions,
      getEmotionalState: deps.getEmotionalState,
      getSynapseInfo: deps.getSynapseInfo,
      initConfigDir: deps.initConfigDir,
      shutdown: deps.shutdown,
    };
  }

  /**
   * 获取所有支持的命令名
   */
  static getCommandNames(): readonly string[] {
    return COMMAND_NAMES;
  }

  /**
   * 处理命令
   * 返回 true 表示命令已处理，false 表示应传递给 brainstem
   */
  handleCommand(input: SensoryInput): boolean {
    const command = input.metadata?.command as string | undefined;
    if (!command) {
      return false;
    }

    const args = input.metadata?.args as string[] | undefined;

    switch (command) {
      case 'help':      this.handleHelpCommand(); return true;
      case 'status':    this.handleStatusCommand(); return true;
      case 'cells':     this.handleCellsCommand(); return true;
      case 'spawn':     this.handleSpawnCommand(args); return true;
      case 'plan':      this.handlePlanCommand(args); return true;
      case 'plans':     this.handlePlansCommand(); return true;
      case 'goals':     this.handleGoalsCommand(); return true;
      case 'persona':   this.handlePersonaCommand(); return true;
      case 'skills':    this.handleSkillsCommand(); return true;
      case 'dream':     this.handleDreamCommand(); return true;
      case 'think':     this.handleThinkCommand(args); return true;
      case 'memory':    this.handleMemoryCommand(); return true;
      case 'metrics':   this.handleMetricsCommand(); return true;
      case 'save':      this.handleSaveCommand(args); return true;
      case 'load':      this.handleLoadCommand(args); return true;
      case 'sessions':  this.handleSessionsCommand(); return true;
      case 'evolve':    this.handleEvolveCommand(); return true;
      case 'delegate':  this.handleDelegateCommand(args); return true;
      case 'permissions': this.handlePermissionsCommand(); return true;
      case 'approve':   this.handleApproveCommand(args); return true;
      case 'deny':      this.handleDenyCommand(args); return true;
      case 'confirm':   this.handleConfirmCommand(args); return true;
      case 'plugins':   this.handlePluginsCommand(); return true;
      case 'plugin-unload': this.handlePluginUnloadCommand(args); return true;
      case 'init':      this.handleInitCommand(); return true;
      case 'narrative': this.handleNarrativeCommand(); return true;
      case 'predictions': this.handlePredictionsCommand(); return true;
      case 'emotions':  this.handleEmotionsCommand(); return true;
      case 'health':    this.handleHealthCommand(); return true;
      case 'diagnostics': this.handleDiagnosticsCommand(); return true;
      case 'broadcast': this.handleBroadcastCommand(); return true;
      case 'report':    this.handleReportCommand(); return true;
      case 'stop':      this.handleStopCommand(); return true;
      case 'exit':      this.handleStopCommand(); return true;
      default:          return false;
    }
  }

  // ─── Core Commands ──────────────────────────────────

  private handleHelpCommand(): void {
    const lines = [
      'Available Commands:',
      '  /status      Show agent status',
      '  /cells       List registered cells',
      '  /spawn       Spawn a new cell (e.g., /spawn researcher)',
      '  /plan        Create a goal (e.g., /plan "Build API" 0.8)',
      '  /goals       List active goals (/plans = alias)',
      '  /persona     Show persona status',
      '  /skills      Show skill ecosystem',
      '  /dream       Trigger dream cycle',
      '  /think       Deep reasoning (e.g., /think <topic>)',
      '  /memory      Show memory statistics',
      '  /metrics     Show performance metrics',
      '  /save        Save session (e.g., /save my-session)',
      '  /load        Load session (e.g., /load my-session)',
      '  /sessions    List saved sessions',
      '  /evolve      Trigger evolution cycle',
      '  /delegate    Delegate task to cells',
      '  /permissions Show tool permission rules',
      '  /approve     Approve tool (e.g., /approve memory_store)',
      '  /deny        Block tool (e.g., /deny trigger_dream)',
      '  /confirm     Require confirmation (e.g., /confirm shell_exec)',
      '  /plugins     List loaded plugins',
      '  /plugin-unload Unload a plugin',
      '  /init        Initialize .odysseus/ directory',
      '  /narrative   Show autobiographical narrative',
      '  /predictions Show predictive user model',
      '  /emotions    Show emotional state',
      '  /health      Show health report',
      '  /diagnostics Show system diagnostics',
      '  /broadcast   Show cell network topology',
      '  /report      Generate comprehensive report',
      '  /stop        Stop the agent',
      '  /exit        Exit the session',
    ];
    this.outputManager.sendResult(lines.join('\n'));
  }

  private handleStatusCommand(): void {
    const status = this.getStatus();
    const lines = [
      '🤖 Agent Status:',
      `  Running: ${status.running}`,
      `  Uptime: ${Math.floor(status.uptime / 1000)}s`,
      `  Brainstem: ${status.modules.brainstem.phase} (loops: ${status.modules.brainstem.loopCount})`,
      `  Hippocampus: ${status.modules.hippocampus.episodes} episodes, ${status.modules.hippocampus.semanticNodes} semantic nodes`,
      `  Prefrontal: ${status.modules.prefrontal.activePlans} active plans, ${status.modules.prefrontal.completedGoals} completed goals`,
      `  Cortex: ${status.modules.cortex.skills} skills, ${status.modules.cortex.mutations} mutations`,
      `  Synapse: ${status.modules.synapse.cells} cells (${status.modules.synapse.cellTypes.join(', ')})`,
      `  Sensory: ${status.modules.sensory.channels.join(', ')} - ${status.modules.sensory.connected ? 'connected' : 'disconnected'}`,
    ];
    this.outputManager.sendResult(lines.join('\n'));
  }

  private handleCellsCommand(): void {
    const cells = this.getColumnStatus();
    const lines = [
      '📱 Registered Cells:',
      ...cells.map((c) => `  ${c.id} (${c.type}) - ${c.status}`),
    ];
    this.outputManager.sendResult(lines.join('\n'));
  }

  private handleSpawnCommand(args: string[] | undefined): void {
    if (!args || args.length === 0) {
      this.outputManager.sendError('Usage: /spawn <type>');
      return;
    }
    const cellType = args[0];
    const childId = this.spawnCell(cellType, 'Manual spawn via CLI');
    if (childId) {
      this.outputManager.sendResult(`Spawned new ${cellType} cell: ${childId.id}`);
    } else {
      this.outputManager.sendError(
        `Failed to spawn ${cellType} cell. Valid types: researcher, artisan, negotiator, evolver`
      );
    }
  }

  private async handlePlanCommand(args: string[] | undefined): Promise<void> {
    if (!args || args.length === 0) {
      this.outputManager.sendError('Usage: /plan <description> [priority]');
      this.outputManager.sendResult('Example: /plan "Research TypeScript patterns" 0.8');
      return;
    }
    const description = args[0];
    const priority = args[1] ? parseFloat(args[1]) : 0.5;

    if (isNaN(priority) || priority < 0 || priority > 1) {
      this.outputManager.sendError('Priority must be a number between 0 and 1');
      return;
    }

    const goal = await this.createGoal(description, priority);
    if (goal) {
      const stats = this.getPlanStats();
      this.outputManager.sendResult(
        `✅ Goal created: ${goal.id}\n` +
        `   Description: ${goal.description}\n` +
        `   Priority: ${(goal.priority * 100).toFixed(0)}%\n` +
        `   Active plans: ${stats?.activePlans ?? 0}`
      );
    } else {
      this.outputManager.sendError('Failed to create goal. Maximum concurrent plans reached.');
    }
  }

  private handlePlansCommand(): void {
    this.handleGoalsCommand();
  }

  private handleGoalsCommand(): void {
    const goals = this.listGoals();
    const stats = this.getPlanStats();

    if (goals.length === 0) {
      this.outputManager.sendResult(
        '📋 No active goals.\n' +
        `   Use /plan <description> [priority] to create a goal.\n` +
        `   Active plans: ${stats?.activePlans ?? 0}, Completed: ${stats?.completedGoals ?? 0}`
      );
      return;
    }

    const lines = [
      '📋 Active Goals:',
      ...goals.map((g) => {
        const priorityBar = '█'.repeat(Math.round(g.priority * 10));
        return `  [${g.id.slice(-8)}] ${g.description}\n` +
               `     Priority: ${priorityBar} ${(g.priority * 100).toFixed(0)}% | Status: ${g.status}`;
      }),
      '',
      `   Active plans: ${stats?.activePlans ?? 0}, Completed: ${stats?.completedGoals ?? 0}`,
    ];
    this.outputManager.sendResult(lines.join('\n'));
  }

  private handlePersonaCommand(): void {
    const persona = this.getPersonaEngine();
    if (!persona) {
      this.outputManager.sendError('Persona engine not available.');
      return;
    }

    const genome = persona.getGenome();
    const expression = persona.getExpression();
    const userModel = genome.userModel;
    const mirrorNeuron = genome.mirrorNeuron;

    const lines = [
      '🎭 Persona Status:',
      '',
      '  Personality:',
      `    Name: ${expression.name}`,
      `    Avatar: ${expression.avatar}`,
      `    Tagline: ${expression.tagline}`,
      `    Voice Style: ${expression.voiceStyle}`,
      `    Quirks: ${expression.quirks.length > 0 ? expression.quirks.join(', ') : 'None'}`,
      '',
      '  User Model:',
      `    Trust Level: ${(userModel.trustLevel * 100).toFixed(0)}%`,
      `    Total Interactions: ${userModel.interactionSummary.totalInteractions}`,
      `    Avg Response Time: ${userModel.interactionSummary.avgResponseTime}ms`,
      `    Satisfaction Score: ${userModel.interactionSummary.satisfactionScore.toFixed(2)}`,
      '',
      '  Mirror Neuron:',
      `    Sync Level: ${(mirrorNeuron.syncLevel * 100).toFixed(0)}%`,
      `    Observed Patterns: ${mirrorNeuron.observedPatterns.length}`,
      `    Imitation Bias:`,
      `      Communication: ${(mirrorNeuron.imitationBias.communicationStyle * 100).toFixed(0)}%`,
      `      Decision: ${(mirrorNeuron.imitationBias.decisionPattern * 100).toFixed(0)}%`,
      `      Work Rhythm: ${(mirrorNeuron.imitationBias.workRhythm * 100).toFixed(0)}%`,
      `      Aesthetic: ${(mirrorNeuron.imitationBias.aestheticPreference * 100).toFixed(0)}%`,
    ];
    this.outputManager.sendResult(lines.join('\n'));
  }

  private handleSkillsCommand(): void {
    const skillManager = this.getSkillManager();
    if (!skillManager) {
      this.outputManager.sendError('Skill manager not available.');
      return;
    }

    const stats = skillManager.getStats();
    const allSkills = skillManager.getAll();

    if (allSkills.length === 0) {
      this.outputManager.sendResult(
        '🎯 No skills registered.\n' +
        '   Skills are generated dynamically through evolution.'
      );
      return;
    }

    const lines = [
      '🎯 Skill Ecosystem:',
      '',
      `  Total: ${stats.total} skills`,
      `  Avg Success Rate: ${(stats.avgSuccessRate * 100).toFixed(0)}%`,
      '',
      '  Skills by Type:',
    ];

    for (const [type, count] of Object.entries(stats.byType)) {
      lines.push(`    ${type}: ${count}`);
    }

    lines.push('', '  Active Skills:');
    for (const skill of allSkills.slice(0, 10)) {
      const bar = '█'.repeat(Math.round(skill.successRate * 10));
      lines.push(
        `    [${skill.id.slice(-8)}] ${skill.name} v${skill.version}`,
        `       ${bar} ${(skill.successRate * 100).toFixed(0)}% | Used: ${skill.usageCount} | ${skill.compiled ? 'Compiled' : 'Interpreted'}`
      );
    }

    this.outputManager.sendResult(lines.join('\n'));
  }

  private async handleDreamCommand(): Promise<void> {
    this.outputManager.sendAction('Starting dream cycle...');
    try {
      const result = await this.triggerDreamCycle();
      const message = this.outputManager.formatDreamResult(result);
      await this.sensoryRouter.routeOutput(message);
    } catch (error) {
      this.outputManager.sendError(
        `Dream cycle failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  // ─── Extended Commands ──────────────────────────────

  private handleThinkCommand(args: string[] | undefined): void {
    if (!this.ext.triggerThink) {
      this.outputManager.sendError('Think command not available in this context.');
      return;
    }
    const topic = args?.join(' ')?.trim();
    if (!topic) {
      this.outputManager.sendError('Usage: /think <topic or question>');
      return;
    }
    this.outputManager.sendAction(`Thinking about: "${topic}"`);
    this.ext.triggerThink(topic).then((result) => {
      const lines = [
        `💭 Reasoning: ${result.conclusion}`,
        `   Confidence: ${(result.confidence * 100).toFixed(0)}%`,
      ];
      if (result.suggestedActions.length > 0) {
        lines.push('   Suggested actions:');
        for (const action of result.suggestedActions.slice(0, 5)) {
          lines.push(`     - ${action.type}: ${JSON.stringify(action.payload).slice(0, 80)}`);
        }
      }
      this.outputManager.sendResult(lines.join('\n'));
    }).catch((err) => {
      this.outputManager.sendError(`Think failed: ${err instanceof Error ? err.message : String(err)}`);
    });
  }

  private handleMemoryCommand(): void {
    if (!this.ext.getMemoryStats) {
      this.outputManager.sendError('Memory stats not available in this context.');
      return;
    }
    const stats = this.ext.getMemoryStats();
    this.outputManager.sendResult(
      `🧠 Memory Statistics:\n` +
      `   Total episodes: ${stats.totalEpisodes}\n` +
      `   Short-term: ${stats.shortTermCount}\n` +
      `   Long-term: ${stats.longTermCount}\n` +
      `   Associations: ${stats.associationCount}`
    );
  }

  private handleMetricsCommand(): void {
    if (!this.ext.getMetricsSnapshot || !this.ext.getHealthReport) {
      this.outputManager.sendError('Metrics not available in this context.');
      return;
    }
    const health = this.ext.getHealthReport();
    const snap = this.ext.getMetricsSnapshot();
    this.outputManager.sendResult(
      `📊 Performance Metrics:\n` +
      `   Status: ${health.status}\n` +
      `   LLM: ${health.llm.calls} calls, ${health.llm.errors} errors (${(health.llm.errorRate * 100).toFixed(1)}%)\n` +
      `   LLM Avg Latency: ${health.llm.avgLatency}s\n` +
      `   Tools: ${health.tools.calls} calls, avg latency: ${health.tools.avgLatency}s\n` +
      `   Total metrics: ${snap.metrics.length}`
    );
  }

  private handleSaveCommand(args: string[] | undefined): void {
    if (!this.ext.saveSessionAction) {
      this.outputManager.sendError('Session save not available in this context.');
      return;
    }
    const name = args?.[0] ?? 'default';
    try {
      this.ext.saveSessionAction(name);
      this.outputManager.sendResult(`💾 Session saved as "${name}"`);
    } catch (error) {
      this.outputManager.sendError(`Failed to save: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private handleLoadCommand(args: string[] | undefined): void {
    if (!this.ext.loadSessionAction) {
      this.outputManager.sendError('Session load not available in this context.');
      return;
    }
    const name = args?.[0] ?? 'default';
    const loaded = this.ext.loadSessionAction(name);
    if (loaded) {
      this.outputManager.sendResult(`📂 Session "${name}" restored.`);
    } else {
      this.outputManager.sendError(`Session "${name}" not found.`);
    }
  }

  private handleSessionsCommand(): void {
    if (!this.ext.listSessionsAction) {
      this.outputManager.sendError('Sessions not available in this context.');
      return;
    }
    const sessions = this.ext.listSessionsAction();
    if (sessions.length === 0) {
      this.outputManager.sendResult('📂 No saved sessions.');
      return;
    }
    const lines = [
      '📂 Saved Sessions:',
      ...sessions.map((s) => {
        const date = s.savedAt > 0 ? new Date(s.savedAt).toLocaleString() : 'unknown';
        return `  - ${s.name} (${s.turns} turns, saved ${date})`;
      }),
    ];
    this.outputManager.sendResult(lines.join('\n'));
  }

  private handleEvolveCommand(): void {
    if (!this.ext.triggerEvolve) {
      this.outputManager.sendError('Evolve not available in this context.');
      return;
    }
    this.outputManager.sendAction('Triggering evolution cycle...');
    this.ext.triggerEvolve().then((result) => {
      const lines = [
        '🧬 Evolution Complete:',
        `   Mutations attempted: ${result.mutations}`,
        `   Successful: ${result.successful}`,
        `   Fitness change: ${result.fitnessDelta >= 0 ? '+' : ''}${(result.fitnessDelta * 100).toFixed(1)}%`,
      ];
      if (result.newBehaviors.length > 0) {
        lines.push('   New behaviors:');
        lines.push(...result.newBehaviors.map((b) => `     - ${b}`));
      }
      this.outputManager.sendResult(lines.join('\n'));
    }).catch((err) => {
      this.outputManager.sendError(`Evolution failed: ${err instanceof Error ? err.message : String(err)}`);
    });
  }

  private handleDelegateCommand(args: string[] | undefined): void {
    if (!this.ext.delegateTask) {
      this.outputManager.sendError('Delegate not available in this context.');
      return;
    }
    const task = args?.join(' ')?.trim();
    if (!task) {
      this.outputManager.sendError('Usage: /delegate <complex task description>');
      return;
    }
    this.outputManager.sendAction(`Delegating: "${task}"`);
    this.ext.delegateTask(task).then((result) => {
      this.outputManager.sendResult(
        `🔄 Delegation Complete:\n` +
        `   Cells used: ${result.totalCellsUsed}\n` +
        `   Duration: ${result.durationMs}ms`
      );
    }).catch((err) => {
      this.outputManager.sendError(`Delegation failed: ${err instanceof Error ? err.message : String(err)}`);
    });
  }

  private handlePermissionsCommand(): void {
    if (!this.ext.getPermissionRules) {
      this.outputManager.sendError('Permissions not available in this context.');
      return;
    }
    const rules = this.ext.getPermissionRules();
    if (rules.length === 0) {
      this.outputManager.sendResult('🔒 No permission rules configured.');
      return;
    }
    const lines = [
      '🔒 Tool Permissions:',
      ...rules.map((r) => {
        const icon = r.permission === 'auto' ? '✅' : r.permission === 'confirm' ? '⚠️' : '❌';
        return `  ${icon} ${r.tool.padEnd(20)} ${r.permission.padEnd(8)} ${r.reason ?? ''}`;
      }),
    ];
    this.outputManager.sendResult(lines.join('\n'));
  }

  private handleApproveCommand(args: string[] | undefined): void {
    if (!this.ext.approveToolAction) {
      this.outputManager.sendError('Approve not available in this context.');
      return;
    }
    const toolName = args?.[0]?.trim();
    if (!toolName) {
      this.outputManager.sendError('Usage: /approve <tool_name>');
      return;
    }
    this.ext.approveToolAction(toolName);
    this.outputManager.sendResult(`✅ Tool "${toolName}" approved for this session.`);
  }

  private handleDenyCommand(args: string[] | undefined): void {
    if (!this.ext.denyToolAction) {
      this.outputManager.sendError('Deny not available in this context.');
      return;
    }
    const toolName = args?.[0]?.trim();
    if (!toolName) {
      this.outputManager.sendError('Usage: /deny <tool_name>');
      return;
    }
    this.ext.denyToolAction(toolName);
    this.outputManager.sendResult(`❌ Tool "${toolName}" blocked.`);
  }

  private handleConfirmCommand(args: string[] | undefined): void {
    if (!this.ext.confirmToolAction) {
      this.outputManager.sendError('Confirm not available in this context.');
      return;
    }
    const toolName = args?.[0]?.trim();
    if (!toolName) {
      this.outputManager.sendError('Usage: /confirm <tool_name>');
      return;
    }
    this.ext.confirmToolAction(toolName);
    this.outputManager.sendResult(`⚠️ Tool "${toolName}" now requires confirmation before execution.`);
  }

  private handlePluginsCommand(): void {
    if (!this.ext.getPlugins) {
      this.outputManager.sendError('Plugins not available in this context.');
      return;
    }
    const plugins = this.ext.getPlugins();
    if (plugins.length === 0) {
      this.outputManager.sendResult('🔌 No plugins loaded.\n   Add plugins to .odysseus/plugins/ and restart.');
      return;
    }
    const lines = [
      '🔌 Loaded Plugins:',
      ...plugins.map((p) => `  - ${p.name} v${p.version} ${p.description ? `— ${p.description}` : ''} [${p.source}]`),
    ];
    this.outputManager.sendResult(lines.join('\n'));
  }

  private handlePluginUnloadCommand(args: string[] | undefined): void {
    if (!this.ext.unloadPluginAction) {
      this.outputManager.sendError('Plugin unload not available in this context.');
      return;
    }
    const name = args?.[0]?.trim();
    if (!name) {
      this.outputManager.sendError('Usage: /plugin-unload <plugin_name>');
      return;
    }
    this.ext.unloadPluginAction(name).then((unloaded) => {
      if (unloaded) {
        this.outputManager.sendResult(`🔌 Plugin "${name}" unloaded.`);
      } else {
        this.outputManager.sendError(`Plugin "${name}" not found.`);
      }
    }).catch((err) => {
      this.outputManager.sendError(`Failed to unload: ${err instanceof Error ? err.message : String(err)}`);
    });
  }

  private handleInitCommand(): void {
    if (!this.ext.initConfigDir) {
      this.outputManager.sendError('Init not available in this context.');
      return;
    }
    const dir = this.ext.initConfigDir();
    this.outputManager.sendResult(
      `📁 Initialized .odysseus/ directory at: ${dir}\n   Created: config.json, sessions/\n   Restart the agent to pick up the new configuration.`
    );
  }

  // ─── Cognitive State Commands ───────────────────────

  private handleNarrativeCommand(): void {
    if (!this.ext.getNarrative) {
      this.outputManager.sendError('Narrative not available in this context.');
      return;
    }
    const narrative = this.ext.getNarrative();
    const lines = [
      '📖 Life Narrative:',
      `   Identity: ${narrative.identityStatement}`,
      `   Active themes: ${narrative.activeThemes.length > 0 ? narrative.activeThemes.join(', ') : 'none'}`,
      `   Chapters: ${narrative.chapters.length}`,
    ];
    if (narrative.chapters.length > 0) {
      for (const ch of narrative.chapters.slice(-5)) {
        const date = new Date(ch.startTime).toLocaleDateString();
        lines.push(`     - [${date}] ${ch.title}: ${ch.summary.slice(0, 60)}... (${ch.emotionalTone})`);
      }
    }
    if (narrative.relationships.length > 0) {
      lines.push(`   Relationships: ${narrative.relationships.length}`);
      for (const rel of narrative.relationships.slice(0, 5)) {
        lines.push(`     - ${rel.userId}: ${rel.summary.slice(0, 50)}... (trust: ${rel.trustLevel.toFixed(2)})`);
      }
    }
    this.outputManager.sendResult(lines.join('\n'));
  }

  private handlePredictionsCommand(): void {
    if (!this.ext.getPredictions) {
      this.outputManager.sendError('Predictions not available in this context.');
      return;
    }
    const predictions = this.ext.getPredictions();
    const profile = predictions.psychologicalProfile;
    const lines = [
      '🔮 Predictive User Model:',
      `   Decision style: ${profile.decisionStyle}`,
      `   Openness: ${(profile.openness * 100).toFixed(0)}% | Conscientiousness: ${(profile.conscientiousness * 100).toFixed(0)}%`,
      `   Info preference: ${profile.informationPreference}`,
      `   Risk tolerance: ${(profile.riskTolerance * 100).toFixed(0)}%`,
    ];
    if (predictions.predictedNeeds.length > 0) {
      lines.push('   Anticipated needs:');
      for (const need of predictions.predictedNeeds.slice(0, 5)) {
        lines.push(`     - ${need.description} (${(need.confidence * 100).toFixed(0)}% confidence, ${need.timeHorizon})`);
      }
    } else {
      lines.push('   No predictions yet — interact more to build the model.');
    }
    if (predictions.communicationPatterns.length > 0) {
      lines.push('   Communication patterns:');
      for (const pattern of predictions.communicationPatterns) {
        lines.push(`     - ${pattern.name} (frequency: ${String(pattern.frequency)})`);
      }
    }
    this.outputManager.sendResult(lines.join('\n'));
  }

  private handleEmotionsCommand(): void {
    if (!this.ext.getEmotionalState) {
      this.outputManager.sendError('Emotions not available in this context.');
      return;
    }
    const state = this.ext.getEmotionalState();
    const lines = [
      '💭 Emotional State',
      '═'.repeat(40),
      `  Primary: ${state.primaryEmotion}`,
      `  Intensity: ${(state.intensity * 100).toFixed(0)}%`,
      `  Valence: ${state.current.valence >= 0 ? '+' : ''}${state.current.valence.toFixed(2)}`,
      `  Arousal: ${state.current.arousal.toFixed(2)}`,
      `  Dominance: ${state.current.dominance.toFixed(2)}`,
    ];
    if (state.emotionalMemory.length > 0) {
      const recent = state.emotionalMemory.slice(-3);
      lines.push(`  Recent events: ${recent.map((e) => `${e.emotion}(${(e.intensity * 100).toFixed(0)}%)`).join(', ')}`);
    }
    this.outputManager.sendResult(lines.join('\n'));
  }

  // ─── System Commands ────────────────────────────────

  private handleHealthCommand(): void {
    if (!this.ext.getHealthReport) {
      this.outputManager.sendError('Health report not available in this context.');
      return;
    }
    const report = this.ext.getHealthReport();
    const icon = report.status === 'healthy' ? '✅' : report.status === 'degraded' ? '⚠️' : '❌';
    this.outputManager.sendResult(
      `${icon} Health: ${report.status}\n` +
      `   Uptime: ${Math.floor(report.uptime / 60)}m ${report.uptime % 60}s\n` +
      `   LLM: ${report.llm.calls} calls, ${(report.llm.errorRate * 100).toFixed(1)}% error rate, avg latency: ${report.llm.avgLatency}s\n` +
      `   Tools: ${report.tools.calls} calls, avg latency: ${report.tools.avgLatency}s`
    );
  }

  private handleDiagnosticsCommand(): void {
    const status = this.getStatus();
    const lines = [
      '🔍 System Diagnostics',
      '═'.repeat(50),
      '',
      '  Agent:',
      `    Running: ${status.running}`,
      `    Uptime: ${Math.floor(status.uptime / 1000)}s`,
      '',
      '  Modules:',
      `    Brainstem: ${status.modules.brainstem.phase} (loops: ${status.modules.brainstem.loopCount})`,
      `    Hippocampus: ${status.modules.hippocampus.episodes} episodes, ${status.modules.hippocampus.semanticNodes} nodes`,
      `    Prefrontal: ${status.modules.prefrontal.activePlans} plans, ${status.modules.prefrontal.completedGoals} completed`,
      `    Synapse: ${status.modules.synapse.cells} cells (${status.modules.synapse.cellTypes.join(', ')})`,
      `    Sensory: ${status.modules.sensory.connected ? 'connected' : 'disconnected'} (${status.modules.sensory.channels.join(', ')})`,
    ];

    if (this.ext.getHealthReport) {
      const health = this.ext.getHealthReport();
      lines.push(
        '',
        '  LLM:',
        `    Calls: ${health.llm.calls}`,
        `    Errors: ${health.llm.errors} (${(health.llm.errorRate * 100).toFixed(1)}%)`,
        `    Avg latency: ${health.llm.avgLatency}s`,
        '',
        '  Tools:',
        `    Calls: ${health.tools.calls}`,
        `    Avg latency: ${health.tools.avgLatency}s`,
      );
    }

    if (this.ext.getPlugins) {
      const plugins = this.ext.getPlugins();
      lines.push('', '  Plugins:');
      if (plugins.length === 0) {
        lines.push('    No plugins loaded');
      } else {
        lines.push(...plugins.map((p) => `    ${p.name} v${p.version} [${p.source}]`));
      }
    }

    if (this.ext.getMemoryStats) {
      const mem = this.ext.getMemoryStats();
      lines.push('', '  Memory:', `    Episodes: ${mem.totalEpisodes}`, `    Short-term: ${mem.shortTermCount}`, `    Long-term: ${mem.longTermCount}`, `    Associations: ${mem.associationCount}`);
    }

    lines.push('', '═'.repeat(50));
    this.outputManager.sendResult(lines.join('\n'));
  }

  private handleBroadcastCommand(): void {
    if (!this.ext.getSynapseInfo) {
      this.outputManager.sendError('Broadcast not available in this context.');
      return;
    }
    const info = this.ext.getSynapseInfo();
    if (info.cells.length === 0) {
      this.outputManager.sendResult('📡 No cells in the network.\n   Use /spawn <type> to create cells first.');
      return;
    }
    const lines = [
      '📡 Cell Network:',
      `   Active cells: ${info.cells.length}`,
      ...info.cells.map((c) => `     - ${c.id} (${c.type}) status: ${c.status}`),
    ];
    if (info.edges.length > 0) {
      lines.push(`   Connections: ${info.edges.length}`);
      for (const [from, to] of info.edges.slice(0, 10)) {
        lines.push(`     ${from} → ${to}`);
      }
    }
    this.outputManager.sendResult(lines.join('\n'));
  }

  private handleReportCommand(): void {
    const status = this.getStatus();
    const lines = [
      '📋 Agent Report',
      '═'.repeat(50),
      `  Generated: ${new Date().toISOString()}`,
      `  Uptime: ${Math.floor(status.uptime / 1000)}s`,
      '',
      `  Brainstem: ${status.modules.brainstem.phase} (${status.modules.brainstem.loopCount} loops)`,
      `  Hippocampus: ${status.modules.hippocampus.episodes} episodes, ${status.modules.hippocampus.semanticNodes} nodes`,
      `  Prefrontal: ${status.modules.prefrontal.activePlans} plans, ${status.modules.prefrontal.completedGoals} completed`,
      `  Synapse: ${status.modules.synapse.cells} cells`,
    ];

    if (this.ext.getHealthReport) {
      const health = this.ext.getHealthReport();
      lines.push(`  Health: ${health.status}`);
      lines.push(`  LLM: ${health.llm.calls} calls, ${(health.llm.errorRate * 100).toFixed(1)}% error rate`);
    }
    if (this.ext.getEmotionalState) {
      const em = this.ext.getEmotionalState();
      lines.push(`  Emotion: ${em.primaryEmotion} (${(em.intensity * 100).toFixed(0)}%)`);
    }
    if (this.ext.getNarrative) {
      const nar = this.ext.getNarrative();
      lines.push(`  Narrative chapters: ${nar.chapters.length}`);
      lines.push(`  Themes: ${nar.activeThemes.join(', ') || 'none'}`);
    }
    if (this.ext.getPlugins) {
      lines.push(`  Plugins: ${this.ext.getPlugins().length} loaded`);
    }

    lines.push('═'.repeat(50));
    this.outputManager.sendResult(lines.join('\n'));
  }

  private handleStopCommand(): void {
    this.outputManager.sendResult('🛑 Stopping agent...');
    if (this.ext.shutdown) {
      this.ext.shutdown().catch(() => {});
    }
  }
}

// Type helper to extract mandatory deps
type MandatoryDeps = {
  sensoryRouter: SensoryRouter;
  outputManager: OutputManager;
  getStatus: () => AgentStatus;
  getColumnStatus: () => ColumnStatusReport[];
  triggerDreamCycle: () => Promise<DreamCycleResult>;
  spawnCell: (type: string, task: string) => { id: string } | null;
  createGoal: (description: string, priority: number) => Promise<Goal | null>;
  listGoals: () => Goal[];
  getPlanStats: () => { activePlans: number; completedGoals: number } | null;
  getPersonaEngine: () => PersonaEngine | null;
  getSkillManager: () => SkillManager | null;
};
