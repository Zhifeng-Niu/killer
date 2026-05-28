/**
 * Interactive CLI Readline Loop
 *
 * REPL-style interactive input loop for the Odysseus Agent CLI
 */

import * as readline from 'readline';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import type { OdysseusAgent } from '../orchestrator/index.js';
import { Cerebellum } from '@odysseus/core';
import { ShellExecutor } from '../orchestrator/shell-executor.js';
import { c, kv, divider, renderMarkdown } from './format.js';
import { generateBootGreeting } from './greeting.js';

/** Lazy-initialized cerebellum instance shared across CLI commands */
let cliCerebellum: Cerebellum | null = null;

/**
 * Readline 内部接口 — history 和 addHistory 不在公开类型中，
 * 但在 Node.js readline 实现中始终可用。
 */
interface ReadlineWithHistory extends readline.Interface {
  history: string[];
  addHistory(entry: string): string;
}

/** CLI 历史文件路径 */
const HISTORY_FILE = path.join(os.homedir(), '.odysseus', 'cli_history');
const MAX_HISTORY = 200;

/**
 * CLI 命令处理器
 */
interface CLICommand {
  name: string;
  description: string;
  handler: (args: string, agent: OdysseusAgent) => Promise<void> | void;
}

/**
 * 可用的 CLI 命令
 */
const CLI_COMMANDS: CLICommand[] = [
  {
    name: 'help',
    description: 'Show available commands',
    handler: (_args, _agent) => {
      showCommands();
    },
  },
  {
    name: 'status',
    description: 'Show agent status',
    handler: async (_args, agent) => {
      const status = agent.getStatus();
      const s = status.running ? c.success('running') : c.error('stopped');
      console.log(`\n${c.header('Agent Status')} ${divider('─', 30)}`);
      console.log(kv('Running', s));
      console.log(kv('Uptime', `${Math.floor(status.uptime / 1000)}s`));
      console.log(kv('Brainstem', `${status.modules.brainstem.phase} (loops: ${status.modules.brainstem.loopCount})`));
      console.log(kv('Hippocampus', `${status.modules.hippocampus.episodes} episodes, ${status.modules.hippocampus.semanticNodes} nodes`));
      console.log(kv('Prefrontal', `${status.modules.prefrontal.activePlans} plans, ${status.modules.prefrontal.completedGoals} completed`));
      console.log(kv('Synapse', `${status.modules.synapse.cells} cells`));
      console.log(kv('Sensory', status.modules.sensory.connected ? c.success('connected') : c.warn('disconnected')));
    },
  },
  {
    name: 'cells',
    description: 'List registered cells',
    handler: async (_args, agent) => {
      const cells = agent.getCells();
      if (cells.length === 0) {
        console.log(`\n${c.muted('No cells registered.')}`);
      } else {
        console.log(`\n${c.header('Registered Cells')}`);
        for (const cell of cells) {
          const statusIcon = cell.status === 'alive' ? c.success('alive') : c.error(cell.status);
          console.log(`   ${c.label(cell.id)} (${c.muted(cell.role)}) ${statusIcon}`);
        }
      }
    },
  },
  {
    name: 'spawn',
    description: 'Spawn a new column (e.g., /spawn researcher)',
    handler: async (args, agent) => {
      const role = args.trim() || 'assistant';
      try {
        const cellId = await agent.spawnCellWithRole(role);
        console.log(`\n✨ Spawned new cell: ${cellId} (${role})`);
      } catch (error) {
        console.log(`\n❌ Failed to spawn column: ${error}`);
      }
    },
  },
  {
    name: 'plan',
    description: 'Create a goal (e.g., /plan "Build API" 0.8)',
    handler: async (args, agent) => {
      // Parse: "description" priority
      const match = args.match(/^"(.+?)"\s+(\d+(?:\.\d+)?)$/) || args.match(/^(.+?)\s+(\d+(?:\.\d+)?)$/);
      if (!match) {
        console.log('\n❌ Invalid format. Use: /plan "description" priority');
        console.log('   Example: /plan "Build REST API" 0.8');
        return;
      }
      const [, description, priorityStr] = match;
      const priority = parseFloat(priorityStr);
      const goalId = await agent.createGoal(description, priority);
      console.log(`\n🎯 Created goal: ${goalId}`);
      console.log(`   Description: ${description}`);
      console.log(`   Priority: ${priority}`);
    },
  },
  {
    name: 'goals',
    description: 'List active goals',
    handler: async (_args, agent) => {
      const goals = agent.getGoals();
      if (goals.length === 0) {
        console.log('\n🎯 No active goals.');
      } else {
        console.log('\n🎯 Active Goals:');
        for (const goal of goals) {
          console.log(`   - [${goal.id}] ${goal.description} (priority: ${goal.priority})`);
        }
      }
    },
  },
  {
    name: 'plans',
    description: 'Alias for /goals',
    handler: async (args, agent) => {
      // 复用 goals 命令
      const goalsCmd = CLI_COMMANDS.find(c => c.name === 'goals')!;
      await goalsCmd.handler(args, agent);
    },
  },
  {
    name: 'persona',
    description: 'Show persona status',
    handler: async (_args, agent) => {
      const persona = agent.getPersona();
      console.log('\n🎭 Persona Status:');
      console.log(`   Name: ${persona.name || 'Not set'}`);
      console.log(`   Traits: ${persona.traits.length > 0 ? persona.traits.join(', ') : 'None'}`);
      console.log(`   Bio: ${persona.bio || 'Not set'}`);
    },
  },
  {
    name: 'skills',
    description: 'Show skill ecosystem',
    handler: async (_args, agent) => {
      const skills = agent.getSkills();
      if (skills.length === 0) {
        console.log('\n🛠️  No skills loaded.');
      } else {
        console.log('\n🛠️  Skill Ecosystem:');
        for (const skill of skills) {
          console.log(`   - ${skill.name} v${skill.version} [${skill.status}]`);
        }
      }
    },
  },
  {
    name: 'dream',
    description: 'Trigger dream cycle',
    handler: async (_args, agent) => {
      console.log('\n💫 Triggering dream cycle...');
      const result = await agent.dream();
      console.log(`   Dream cycle completed: ${result.episodesConsolidated} episodes consolidated`);
      console.log(`   New associations: ${result.newAssociations}`);
    },
  },
  {
    name: 'think',
    description: 'Deep reasoning about a topic (e.g., /think what should I do next?)',
    handler: async (args, agent) => {
      const topic = args.trim();
      if (!topic) {
        console.log('\n💭 Usage: /think <topic or question>');
        return;
      }
      console.log(`\n💭 Thinking deeply about: "${topic}"`);
      console.log('   (running full perceive→reason→reflect cycle)\n');
      const result = await agent.think(topic);
      console.log(`Reasoning: ${result.conclusion}`);
      console.log(`Confidence: ${(result.confidence * 100).toFixed(0)}%`);
      if (result.suggestedActions.length > 0) {
        console.log('\n   Suggested actions:');
        for (const action of result.suggestedActions) {
          console.log(`   - ${action.type}: ${JSON.stringify(action.payload).slice(0, 80)}`);
        }
      }
    },
  },
  {
    name: 'memory',
    description: 'Show memory statistics',
    handler: async (_args, agent) => {
      const stats = agent.getMemoryStats();
      console.log('\n🧠 Memory Statistics:');
      console.log(`   Total episodes: ${stats.totalEpisodes}`);
      console.log(`   Short-term: ${stats.shortTermCount}`);
      console.log(`   Long-term: ${stats.longTermCount}`);
      console.log(`   Associations: ${stats.associationCount}`);
    },
  },
  {
    name: 'metrics',
    description: 'Show agent performance metrics',
    handler: async () => {
      const { MetricsCollector } = await import('../metrics/index.js');
      const m = MetricsCollector.getInstance();
      const health = m.healthCheck();
      const snap = m.snapshot();

      console.log('\n📊 Performance Metrics:');
      console.log(`   Status: ${health.status} | Uptime: ${Math.floor(health.uptime / 60)}m ${health.uptime % 60}s`);
      console.log(`   LLM: ${health.llm.calls} calls, ${health.llm.errors} errors (${(health.llm.errorRate * 100).toFixed(1)}%), avg latency: ${health.llm.avgLatency}s`);
      console.log(`   Tools: ${health.tools.calls} calls, avg latency: ${health.tools.avgLatency}s`);
      console.log(`   Total metrics: ${snap.metrics.length}`);
    },
  },
  {
    name: 'save',
    description: 'Save current session (e.g., /save my-session)',
    handler: async (args, agent) => {
      const name = args.trim() || 'default';
      try {
        agent.saveSession(name);
        console.log(`\n💾 Session saved as "${name}"`);
      } catch (error) {
        console.log(`\n❌ Failed to save: ${error}`);
      }
    },
  },
  {
    name: 'load',
    description: 'Load a saved session (e.g., /load my-session)',
    handler: async (args, agent) => {
      const name = args.trim() || 'default';
      const loaded = agent.loadSession(name);
      if (loaded) {
        console.log(`\n📂 Session "${name}" restored.`);
      } else {
        console.log(`\n❌ Session "${name}" not found.`);
      }
    },
  },
  {
    name: 'sessions',
    description: 'List saved sessions',
    handler: async (_args, agent) => {
      const sessions = agent.listSessions();
      if (sessions.length === 0) {
        console.log('\n📂 No saved sessions.');
      } else {
        console.log('\n📂 Saved Sessions:');
        for (const s of sessions) {
          const date = s.savedAt > 0 ? new Date(s.savedAt).toLocaleString() : 'unknown';
          console.log(`   - ${s.name} (${s.turns} turns, saved ${date})`);
        }
      }
    },
  },
  {
    name: 'evolve',
    description: 'Trigger evolution cycle (mutations, selection, adaptation)',
    handler: async (_args, agent) => {
      console.log('\n🧬 Triggering evolution cycle...');
      const result = await agent.evolve();
      console.log(`   Mutations attempted: ${result.mutations}`);
      console.log(`   Successful: ${result.successful}`);
      console.log(`   Fitness change: ${result.fitnessDelta >= 0 ? '+' : ''}${(result.fitnessDelta * 100).toFixed(1)}%`);
      if (result.newBehaviors.length > 0) {
        console.log('   New behaviors:');
        for (const b of result.newBehaviors) {
          console.log(`     - ${b}`);
        }
      }
    },
  },
  {
    name: 'delegate',
    description: 'Delegate task to multiple cells (e.g., /delegate research AI safety and build a demo)',
    handler: async (args, agent) => {
      const task = args.trim();
      if (!task) {
        console.log('\n🔄 Usage: /delegate <complex task description>');
        console.log('   Example: /delegate research the best CSS frameworks and build a comparison table');
        return;
      }
      console.log(`\n🔄 Delegating: "${task}"\n`);
      try {
        const result = await agent.delegateTask(task, (token) => {
          process.stdout.write(token);
        });
        console.log(`\n\n📊 Summary: ${result.totalCellsUsed} cells, ${result.durationMs}ms`);
      } catch (error) {
        console.log(`\n❌ Delegation failed: ${error}`);
      }
    },
  },
  {
    name: 'permissions',
    description: 'Show tool permission rules',
    handler: async (_args, agent) => {
      const rules = agent.toolPermissions.getRules();
      if (rules.length === 0) {
        console.log('\n🔒 No permission rules configured.');
      } else {
        console.log('\n🔒 Tool Permissions:');
        for (const rule of rules) {
          const icon = rule.permission === 'auto' ? '✅' : rule.permission === 'confirm' ? '⚠️' : '❌';
          console.log(`  ${icon} ${rule.tool.padEnd(20)} ${rule.permission.padEnd(8)} ${rule.reason ?? ''}`);
        }
      }
    },
  },
  {
    name: 'approve',
    description: 'Approve a tool for auto-execution (e.g., /approve memory_store)',
    handler: async (args, agent) => {
      const toolName = args.trim();
      if (!toolName) {
        console.log('\n⚠️ Usage: /approve <tool_name>');
        console.log('   Example: /approve memory_store');
        return;
      }
      agent.toolPermissions.approve(toolName);
      console.log(`\n✅ Tool "${toolName}" approved for this session.`);
    },
  },
  {
    name: 'deny',
    description: 'Block a tool from execution (e.g., /deny trigger_dream)',
    handler: async (args, agent) => {
      const toolName = args.trim();
      if (!toolName) {
        console.log('\n⚠️ Usage: /deny <tool_name>');
        console.log('   Example: /deny trigger_dream');
        return;
      }
      agent.toolPermissions.deny(toolName);
      console.log(`\n❌ Tool "${toolName}" blocked.`);
    },
  },
  {
    name: 'plugins',
    description: 'List loaded plugins',
    handler: async (_args, agent) => {
      const plugins = agent.getPlugins();
      if (plugins.length === 0) {
        console.log('\n🔌 No plugins loaded.');
        console.log('   Add plugins to .odysseus/plugins/ and restart.');
      } else {
        console.log('\n🔌 Loaded Plugins:');
        for (const p of plugins) {
          console.log(`   - ${p.name} v${p.version} ${p.description ? `— ${p.description}` : ''} [${p.source}]`);
        }
      }
    },
  },
  {
    name: 'plugin-unload',
    description: 'Unload a plugin (e.g., /plugin-unload my-plugin)',
    handler: async (args, agent) => {
      const name = args.trim();
      if (!name) {
        console.log('\n⚠️ Usage: /plugin-unload <plugin_name>');
        return;
      }
      const unloaded = await agent.unloadPlugin(name);
      if (unloaded) {
        console.log(`\n🔌 Plugin "${name}" unloaded.`);
      } else {
        console.log(`\n❌ Plugin "${name}" not found.`);
      }
    },
  },
  {
    name: 'init',
    description: 'Initialize .odysseus/ directory or run setup wizard (/init setup)',
    handler: async (args, _agent) => {
      if (args.trim() === 'setup') {
        // 运行完整的 init wizard（交互式配置）
        const { runInitWizard } = await import('./init-wizard.js');
        await runInitWizard();
        console.log(`  ${c.muted('配置已保存。输入 /key 可在聊天中粘贴 Key。')}`);
      } else {
        const { initOdysseusDir } = await import('../config/types.js');
        const dir = initOdysseusDir();
        console.log(`\n  Initialized .odysseus/ directory at: ${dir}`);
        console.log(`  ${c.muted('Tip: /init setup 运行交互式配置向导')}`);
        console.log(`  ${c.muted('     /key sk-xxxxx 直接粘贴 Key')}`);
      }
    },
  },
  {
    name: 'narrative',
    description: 'Show autobiographical narrative (life story)',
    handler: async (_args, agent) => {
      const narrative = agent.hippocampus.getNarrative();
      console.log('\n📖 Life Narrative:');
      console.log(`   Identity: ${narrative.identityStatement}`);
      console.log(`   Active themes: ${narrative.activeThemes.length > 0 ? narrative.activeThemes.join(', ') : 'none'}`);
      console.log(`   Chapters: ${narrative.chapters.length}`);
      if (narrative.chapters.length > 0) {
        for (const ch of narrative.chapters.slice(-5)) {
          const date = new Date(ch.startTime).toLocaleDateString();
          console.log(`     - [${date}] ${ch.title}: ${ch.summary.slice(0, 60)}... (${ch.emotionalTone})`);
        }
      }
      const relationships = narrative.relationships;
      if (relationships.length > 0) {
        console.log(`   Relationships: ${relationships.length}`);
        for (const rel of relationships.slice(0, 5)) {
          console.log(`     - ${rel.userId}: ${rel.summary.slice(0, 50)}... (trust: ${rel.trustLevel.toFixed(2)})`);
        }
      }
    },
  },
  {
    name: 'predictions',
    description: 'Show predictive user model insights',
    handler: async (_args, agent) => {
      const predictions = agent.persona.getPredictions();
      const profile = predictions.psychologicalProfile;

      console.log('\n🔮 Predictive User Model:');
      console.log(`   Decision style: ${profile.decisionStyle}`);
      console.log(`   Openness: ${(profile.openness * 100).toFixed(0)}% | Conscientiousness: ${(profile.conscientiousness * 100).toFixed(0)}%`);
      console.log(`   Info preference: ${profile.informationPreference}`);
      console.log(`   Risk tolerance: ${(profile.riskTolerance * 100).toFixed(0)}%`);

      if (predictions.predictedNeeds.length > 0) {
        console.log(`\n   Anticipated needs:`);
        for (const need of predictions.predictedNeeds.slice(0, 5)) {
          console.log(`     - ${need.description} (${(need.confidence * 100).toFixed(0)}% confidence, ${need.timeHorizon})`);
        }
      } else {
        console.log('\n   No predictions yet — interact more to build the model.');
      }

      if (predictions.communicationPatterns.length > 0) {
        console.log(`\n   Communication patterns:`);
        for (const pattern of predictions.communicationPatterns) {
          console.log(`     - ${pattern.name} (frequency: ${pattern.frequency})`);
        }
      }
    },
  },
  {
    name: 'health',
    description: 'Show system health report with module scores',
    handler: async (_args, agent) => {
      const report = agent.healthMonitor.check();
      const formatted = agent.healthMonitor.formatReport(report);
      console.log(`\n${formatted}\n`);
    },
  },
  {
    name: 'emotions',
    description: 'Show current emotional state',
    handler: async (_args, agent) => {
      const state = agent.persona.emotionalState.exportState();
      console.log('\n💭 Emotional State');
      console.log('═'.repeat(40));
      console.log(`  Primary: ${state.primaryEmotion}`);
      console.log(`  Intensity: ${(state.intensity * 100).toFixed(0)}%`);
      console.log(`  Valence: ${state.current.valence >= 0 ? '+' : ''}${state.current.valence.toFixed(2)}`);
      console.log(`  Arousal: ${state.current.arousal.toFixed(2)}`);
      console.log(`  Dominance: ${state.current.dominance.toFixed(2)}`);
      if (state.emotionalMemory.length > 0) {
        const recent = state.emotionalMemory.slice(-3);
        console.log(`  Recent events: ${recent.map((e: { emotion: string; intensity: number }) => `${e.emotion}(${(e.intensity * 100).toFixed(0)}%)`).join(', ')}`);
      }
      console.log('');
    },
  },
  {
    name: 'note',
    description: 'Save or read notes (/note save <title> <content> | /note read [title] | /note list)',
    handler: async (args, agent) => {
      const parts = args.trim().split(/\s+/);
      const subcmd = parts[0];

      if (subcmd === 'save') {
        const rest = args.trim().slice(args.trim().indexOf('save') + 4).trim();
        // Format: /note save <title> | <content>
        const pipeIdx = rest.indexOf('|');
        if (pipeIdx < 0) {
          console.log(c.warn('  Usage: /note save <title> | <content>'));
          console.log(c.muted('  Example: /note save ideas | Use vector DB for memory'));
          return;
        }
        const title = rest.slice(0, pipeIdx).trim();
        const content = rest.slice(pipeIdx + 1).trim();
        if (!title || !content) {
          console.log(c.warn('  Title and content are required.'));
          return;
        }
        const result = await agent.tools.execute('note_save', { title, content });
        if (result.success) {
          console.log(c.success(`  Note saved: "${title}"`));
        } else {
          console.log(c.error(`  Failed: ${result.error}`));
        }
      } else if (subcmd === 'read') {
        const title = parts.slice(1).join(' ').trim();
        const result = await agent.tools.execute('note_read', { title: title || undefined });
        if (result.success) {
          const d = result.data as { title: string; content: string; tags: string[]; notes: { title: string; preview: string }[]; count: number };
          if (title) {
            console.log(`\n  ${c.header(d.title)}`);
            console.log(`  ${d.content}`);
            if (d.tags?.length) console.log(c.muted(`  Tags: ${d.tags.join(', ')}`));
          } else {
            console.log(`\n  ${c.header('Notes')} (${d.count})`);
            for (const note of d.notes) {
              console.log(`  ${c.label(note.title)} ${c.muted('— ' + note.preview.slice(0, 60))}`);
            }
          }
        } else {
          console.log(c.warn(`  ${result.error}`));
        }
      } else if (subcmd === 'list' || !subcmd) {
        const result = await agent.tools.execute('note_read', {});
        const d = result.data as { notes: { title: string; preview: string }[]; count: number } | undefined;
        if (result.success && d && d.notes.length > 0) {
          console.log(`\n  ${c.header('Notes')} (${d.count})`);
          for (const note of d.notes) {
            console.log(`  ${c.label(note.title)} ${c.muted('— ' + note.preview.slice(0, 60))}`);
          }
        } else {
          console.log(c.muted('  No notes saved yet. Use /note save <title> | <content>'));
        }
      } else {
        console.log(c.muted('  Usage:'));
        console.log(c.muted('    /note save <title> | <content>  — Save a note'));
        console.log(c.muted('    /note read <title>              — Read a note'));
        console.log(c.muted('    /note list                       — List all notes'));
      }
      console.log('');
    },
  },
  {
    name: 'diagnostics',
    description: 'Show comprehensive system diagnostics',
    handler: async (_args, agent) => {
      const { MetricsCollector } = await import('../metrics/index.js');
      const metrics = MetricsCollector.getInstance();
      const health = metrics.healthCheck();
      const status = agent.getStatus();

      console.log('\n🔍 System Diagnostics');
      console.log('═'.repeat(50));

      // 1. Agent 状态
      console.log('\n  Agent:');
      console.log(`    Running: ${status.running}`);
      console.log(`    Uptime: ${Math.floor(status.uptime / 1000)}s`);

      // 2. 模块状态
      console.log('\n  Modules:');
      console.log(`    Brainstem: ${status.modules.brainstem.phase} (loops: ${status.modules.brainstem.loopCount})`);
      console.log(`    Hippocampus: ${status.modules.hippocampus.episodes} episodes, ${status.modules.hippocampus.semanticNodes} nodes`);
      console.log(`    Prefrontal: ${status.modules.prefrontal.activePlans} plans, ${status.modules.prefrontal.completedGoals} completed`);
      console.log(`    Synapse: ${status.modules.synapse.cells} cells (${(status.modules.synapse.cellTypes ?? []).join(', ') || 'none'})`);
      console.log(`    Sensory: ${status.modules.sensory.connected ? 'connected' : 'disconnected'} (${(status.modules.sensory.channels ?? []).join(', ')})`);

      // 3. LLM 状态
      console.log('\n  LLM:');
      console.log(`    Calls: ${health.llm.calls}`);
      console.log(`    Errors: ${health.llm.errors} (${(health.llm.errorRate * 100).toFixed(1)}%)`);
      console.log(`    Avg latency: ${health.llm.avgLatency}s`);

      // 4. 工具状态
      console.log('\n  Tools:');
      console.log(`    Calls: ${health.tools.calls}`);
      console.log(`    Avg latency: ${health.tools.avgLatency}s`);
      const toolNames = agent.tools?.list?.() ?? [];
      console.log(`    Registered: ${Array.isArray(toolNames) ? toolNames.join(', ') : 'N/A'}`);

      // 5. 插件
      const plugins = agent.getPlugins();
      console.log('\n  Plugins:');
      if (plugins.length === 0) {
        console.log('    No plugins loaded');
      } else {
        for (const p of plugins) {
          console.log(`    ${p.name} v${p.version} [${p.source}]`);
        }
      }

      // 6. Memory
      try {
        const memStats = agent.getMemoryStats();
        console.log('\n  Memory:');
        console.log(`    Episodes: ${memStats.totalEpisodes}`);
        console.log(`    Short-term: ${memStats.shortTermCount}`);
        console.log(`    Long-term: ${memStats.longTermCount}`);
        console.log(`    Associations: ${memStats.associationCount}`);
      } catch {
        console.log('\n  Memory: (unavailable)');
      }

      // 7. Context Window
      try {
        const ctxConfig = agent.contextWindow.getConfig();
        const facts = agent.contextWindow.getFacts();
        const summary = agent.contextWindow.getSummary();
        console.log('\n  Context Window:');
        console.log(`    Max full turns: ${ctxConfig.maxFullTurns}`);
        console.log(`    Facts stored: ${facts.length}`);
        console.log(`    Summary length: ${summary.length} chars`);
      } catch {
        console.log('\n  Context Window: (unavailable)');
      }

      // 8. Health 综合评分
      console.log('\n  Health:');
      const statusIcon = health.status === 'healthy' ? '✅' : health.status === 'degraded' ? '⚠️' : '❌';
      console.log(`    ${statusIcon} ${health.status}`);
      console.log('═'.repeat(50));
    },
  },
  {
    name: 'broadcast',
    description: 'Show cell network topology and broadcast status',
    handler: async (_args, agent) => {
      const cells = agent.synapse.getAllColumns();
      const topology = agent.synapse.getTopology();
      if (cells.length === 0) {
        console.log('\n📡 No cells in the network.');
        console.log('   Use /spawn <type> to create cells first.');
        return;
      }
      console.log('\n📡 Cell Network:');
      console.log(`   Active cells: ${cells.length}`);
      for (const cell of cells) {
        const cid = cell.id.id;
        const ctype = cell.config.type;
        const cstatus = cell.status;
        console.log(`     - ${cid} (${ctype}) status: ${cstatus}`);
      }
      if (topology.edges.length > 0) {
        console.log(`   Connections: ${topology.edges.length}`);
        for (const [from, to] of topology.edges.slice(0, 10)) {
          const fromId = from.id;
          const toId = to.id;
          console.log(`     ${fromId} → ${toId}`);
        }
      }
    },
  },
  {
    name: 'report',
    description: 'Generate a comprehensive agent report',
    handler: async (_args, agent) => {
      const { MetricsCollector } = await import('../metrics/index.js');
      const metrics = MetricsCollector.getInstance();
      const health = metrics.healthCheck();
      const status = agent.getStatus();
      const memStats = agent.getMemoryStats();
      const emotionalState = agent.persona.emotionalState.exportState();
      const narrative = agent.hippocampus.getNarrative();
      const goals = agent.getGoals();
      const cells = agent.synapse.getAllColumns();

      console.log('\n📋 Agent Report');
      console.log('═'.repeat(50));
      console.log(`  Generated: ${new Date().toISOString()}`);
      console.log(`  Uptime: ${Math.floor(health.uptime / 60)}m ${health.uptime % 60}s`);
      console.log(`  Health: ${health.status}`);
      console.log('');
      console.log(`  LLM: ${health.llm.calls} calls, ${(health.llm.errorRate * 100).toFixed(1)}% error rate`);
      console.log(`  Memory: ${memStats.totalEpisodes} episodes, ${memStats.associationCount} associations`);
      console.log(`  Cells: ${cells.length} active`);
      console.log(`  Goals: ${goals.length} active`);
      console.log(`  Emotion: ${emotionalState.primaryEmotion} (${(emotionalState.intensity * 100).toFixed(0)}%)`);
      console.log(`  Narrative chapters: ${narrative.chapters.length}`);
      console.log(`  Themes: ${narrative.activeThemes.join(', ') || 'none'}`);
      console.log(`  Plugins: ${agent.getPlugins().length} loaded`);
      console.log('═'.repeat(50));
    },
  },
  {
    name: 'confirm',
    description: 'Set tool to require confirmation (e.g., /confirm shell_exec)',
    handler: async (args, agent) => {
      const toolName = args.trim();
      if (!toolName) {
        console.log('\n⚠️ Usage: /confirm <tool_name>');
        console.log('   Sets tool to require confirmation before execution.');
        console.log('   Example: /confirm shell_exec');
        return;
      }
      agent.toolPermissions.addRule({ tool: toolName, permission: 'confirm', reason: 'Set via /confirm command' });
      console.log(`\n⚠️ Tool "${toolName}" now requires confirmation before execution.`);
    },
  },
  {
    name: 'key',
    description: 'Set API key (paste your key to connect to real AI)',
    handler: async (args, _agent) => {
      const { detectProviderFromKey, saveConfig, PROVIDER_OPTIONS } = await import('./init-wizard.js');

      const key = args.trim();
      if (!key) {
        console.log('\n  Usage: /key <paste-your-api-key>');
        console.log('  Example: /key sk-ant-api03-...');
        console.log('  Supported: DeepSeek, GLM, MiniMax, OpenAI, Anthropic, Gemini, OpenRouter, etc.');
        console.log('');
        return;
      }

      if (key.length < 10) {
        console.log(c.error('\n  Key too short. Please paste a valid API key.\n'));
        return;
      }

      // 自动识别服务商
      const detected = detectProviderFromKey(key);
      let providerName = 'deepseek';
      let confidence: 'high' | 'low' | 'none' = 'none';
      let friendlyName = 'DeepSeek';

      if (detected) {
        providerName = detected.provider;
        confidence = detected.confidence;
        const opt = PROVIDER_OPTIONS.find(p => p.name === providerName);
        friendlyName = opt?.description ?? providerName;
        console.log(`\n  Detected: ${c.value(friendlyName)}`);
      } else {
        console.log(`\n  ${c.muted('Cannot auto-detect provider, trying DeepSeek protocol...')}`);
      }

      // 保存到 .env
      console.log(`  Saving...`);
      try {
        await saveConfig(providerName, key, undefined);
        console.log(`  ${c.success(`Saved! Restarting with ${friendlyName}...`)}`);
        // Exit with code 42 → odysseus.mjs will auto-restart
        process.exit(42);
      } catch (err) {
        console.log(c.error(`  Save failed: ${err}`));
      }
      console.log('');
    },
  },
  {
    name: 'mission',
    description: 'Manage experiment missions (Cerebellum)',
    handler: async (args, _agent) => {
      // Lazy-init cerebellum with shell executor for real verification
      if (!cliCerebellum) {
        const projectRoot = process.cwd();
        cliCerebellum = new Cerebellum(new ShellExecutor(projectRoot));
      }
      const cerebellum = cliCerebellum;

      const parts = args.trim().split(/\s+/);
      const sub = parts[0];

      if (!sub || sub === 'help') {
        console.log(`\n${c.header('Mission Commands')}`);
        console.log(`  ${c.label('/mission create <goal>')}        Start a new experiment mission`);
        console.log(`  ${c.label('/mission start [--orientation <mode>]}')}  Activate with orientation`);
        console.log(`  ${c.label('/mission status')}               Show current mission progress`);
        console.log(`  ${c.label('/mission history')}              Show attempt history`);
        console.log(`  ${c.label('/mission stop')}                 Deactivate current mission`);
        console.log(`\n  Orientations: ${c.value('engineer')} (safe) | ${c.value('creative')} (explore) | ${c.value('production')} (ship)`);
        console.log('');
        return;
      }

      if (sub === 'create' || sub === 'start') {
        const goal = parts.slice(1).join(' ').trim();
        if (!goal) {
          console.log(c.error('\n  Usage: /mission create <goal>'));
          return;
        }

        // Parse optional --orientation flag
        const orientationIdx = parts.indexOf('--orientation');
        const orientation = orientationIdx >= 0 && parts[orientationIdx + 1]
          ? parts[orientationIdx + 1] as 'engineer' | 'creative' | 'production'
          : 'engineer';

        const mission = cerebellum.createMission({ goal, orientation });
        cerebellum.activateMission(mission);
        console.log(`\n  ${c.success('Mission created and activated!')}`);
        console.log(`  ${kv('ID', mission.id)}`);
        console.log(`  ${kv('Goal', mission.goal)}`);
        console.log(`  ${kv('Orientation', mission.orientation)}`);
        console.log(`  ${kv('Max waypoints', String(mission.termination.find((t: { type: string }) => t.type === 'max_waypoints')?.value ?? 50))}`);
        console.log('');
        return;
      }

      if (sub === 'status') {
        const mission = cerebellum.getActiveMission();
        if (!mission) {
          console.log(`\n  ${c.muted('No active mission. Use /mission create <goal>')}`);
          return;
        }
        const history = cerebellum.getHistory();
        const term = cerebellum.checkTermination();
        console.log(`\n${c.header('Mission Status')}`);
        console.log(`  ${kv('Goal', mission.goal)}`);
        console.log(`  ${kv('Orientation', mission.orientation)}`);
        console.log(`  ${kv('Waypoints', `${history.totalWaypoints} (${history.wins.length} kept, ${history.deadEnds.length} discarded)`)}`);
        console.log(`  ${kv('Consecutive fails', String(history.consecutiveDiscards))}`);
        console.log(`  ${kv('Terminated', term.terminated ? c.error(term.reason ?? 'yes') : c.success('no'))}`);
        if (history.surprises.length > 0) {
          console.log(`  ${kv('Surprises', c.value(String(history.surprises.length)))}`);
        }
        console.log('');
        return;
      }

      if (sub === 'history') {
        const history = cerebellum.getHistory();
        if (history.totalWaypoints === 0) {
          console.log(`\n  ${c.muted('No experiments recorded yet.')}`);
          return;
        }
        console.log(`\n${c.header('Experiment History')}`);
        const recent = [...history.wins.slice(-5), ...history.deadEnds.slice(-5)]
          .sort((a, b) => a.waypoint - b.waypoint)
          .slice(-10);
        for (const r of recent) {
          const icon = r.decision === 'keep' ? c.success('KEEP') : c.error('DISC');
          console.log(`  ${icon} #${r.waypoint} ${c.muted(`[${r.orientation}]`)} ${r.hypothesis.slice(0, 60)}`);
        }
        if (history.surprises.length > 0) {
          console.log(`\n  ${c.header('Surprises')}`);
          for (const s of history.surprises.slice(-3)) {
            console.log(`  ${c.value('!')} ${s.contradiction}`);
            console.log(`    ${c.muted(s.insight.slice(0, 80))}`);
          }
        }
        console.log('');
        return;
      }

      if (sub === 'stop') {
        const mission = cerebellum.getActiveMission();
        if (!mission) {
          console.log(`\n  ${c.muted('No active mission.')}`);
          return;
        }
        cerebellum.activateMission(null as unknown as Parameters<typeof cerebellum.activateMission>[0]);
        console.log(`\n  ${c.success('Mission deactivated.')}`);
        console.log('');
        return;
      }

      console.log(c.error(`\n  Unknown sub-command: ${sub}. Use /mission help`));
    },
  },
  {
    name: 'stop',
    description: 'Stop the agent',
    handler: async (_args, agent) => {
      const { Logger } = await import('../log/index.js');
      Logger.getInstance().setLevel('warn');
      await agent.shutdown();
      console.log(`\n  ${c.muted('See you next time.')}`);
      process.exit(0);
    },
  },
  {
    name: 'exit',
    description: 'Exit the CLI',
    handler: async (_args, agent) => {
      const { Logger } = await import('../log/index.js');
      Logger.getInstance().setLevel('warn');
      // Show a brief warm goodbye
      const expression = agent.persona.getExpression();
      console.log(`\n  ${c.value(`${expression.avatar} See you soon.`)}`);
      await agent.shutdown();
      process.exit(0);
    },
  },
];

/**
 * 显示可用命令
 */
function showCommands(): void {
  const categories = [
    { title: '对话', commands: ['help', 'key', 'stop', 'exit'] },
    { title: '认知', commands: ['think', 'dream', 'evolve', 'emotions', 'narrative', 'predictions'] },
    { title: '记忆', commands: ['memory', 'note', 'save', 'load', 'sessions'] },
    { title: '状态', commands: ['status', 'health', 'persona', 'skills', 'metrics', 'diagnostics', 'report'] },
    { title: '细胞', commands: ['cells', 'spawn', 'delegate', 'broadcast'] },
    { title: '规划', commands: ['plan', 'goals', 'plans'] },
    { title: '工具', commands: ['permissions', 'approve', 'deny', 'confirm'] },
    { title: '插件', commands: ['plugins', 'plugin-unload', 'init'] },
  ];

  console.log('');
  for (const cat of categories) {
    const cmds = cat.commands
      .filter(name => CLI_COMMANDS.some(c => c.name === name))
      .map(name => {
        const cmd = CLI_COMMANDS.find(c => c.name === name);
        return cmd ? `/${cmd.name}` : '';
      })
      .filter(Boolean);
    if (cmds.length > 0) {
      console.log(`  ${c.header(cat.title.padEnd(6))} ${c.muted(cmds.join('  '))}`);
    }
  }
  console.log(`\n  ${c.info('直接输入消息开始聊天，Ctrl+C 取消回复。')}\n`);
}

/**
 * 解析用户输入
 */
function parseInput(input: string): { command: string | null; args: string } {
  const trimmed = input.trim();

  // 检查是否是命令
  if (trimmed.startsWith('/')) {
    const parts = trimmed.slice(1).split(/\s+/);
    const command = parts[0].toLowerCase();
    const args = parts.slice(1).join(' ');
    return { command, args };
  }

  return { command: null, args: trimmed };
}

/**
 * 处理命令
 */
async function handleCommand(input: string, agent: OdysseusAgent): Promise<boolean> {
  const { command, args } = parseInput(input);

  if (!command) {
    // 不是命令，作为普通消息处理
    return false;
  }

  const cmd = CLI_COMMANDS.find(c => c.name === command);

  if (!cmd) {
    console.log(`\n❌ Unknown command: /${command}`);
    console.log('   Type /help to see available commands.\n');
    return true;
  }

  try {
    await cmd.handler(args, agent);
  } catch (error) {
    console.error(`\n❌ Error executing command: ${error}\n`);
  }

  return true;
}

/**
 * 启动交互式 readline 循环
 */
export function startReadlineLoop(agent: OdysseusAgent): readline.Interface {
  // 加载历史记录
  let historyEntries: string[] = [];
  try {
    if (fs.existsSync(HISTORY_FILE)) {
      historyEntries = JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf-8'));
      if (!Array.isArray(historyEntries)) historyEntries = [];
    }
  } catch {
    historyEntries = [];
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: '▸ ',
    historySize: MAX_HISTORY,
    completer: (line: string) => {
      const commandNames = CLI_COMMANDS.map(cmd => `/${cmd.name}`);
      const hits = commandNames.filter(cmd => cmd.startsWith(line));
      return [hits.length ? hits : commandNames, line];
    },
  });

  // 恢复历史
  for (const entry of historyEntries.slice(-MAX_HISTORY)) {
    (rl as ReadlineWithHistory).addHistory?.(entry);
  }

  // 保存历史到磁盘
  const saveHistory = () => {
    try {
      const historyDir = path.dirname(HISTORY_FILE);
      if (!fs.existsSync(historyDir)) {
        fs.mkdirSync(historyDir, { recursive: true });
      }
      // 从 readline 获取当前历史
      const currentHistory = (rl as ReadlineWithHistory).history;
      const entries = [...currentHistory].reverse().filter(h => h.trim()).slice(0, MAX_HISTORY);
      fs.writeFileSync(HISTORY_FILE, JSON.stringify(entries, null, 2), 'utf-8');
    } catch {
      // 历史保存失败不影响退出
    }
  };

  // 生成上下文感知的启动问候
  const greeting = generateBootGreeting({
    persona: agent.persona,
    hippocampus: agent.hippocampus,
    isFirstBoot: agent.getMemoryStats().totalEpisodes === 0 && agent.persona.getUserModel().interactionSummary.totalInteractions === 0,
    isSessionRestored: agent.persona.getLastSeenAt() !== null,
    lastTopic: agent.getLastTopic(),
  });
  console.log(greeting);

  rl.prompt();

  // 监听 consciousness stream 的主动建议事件
  agent.consciousness.on('action', (event: unknown) => {
    const ev = event as { type?: string; source?: string; data?: { type?: string; content?: string; priority?: number } };
    if (ev.type === 'proactive.suggestion' && ev.data?.content) {
      // 非侵入式显示：在下一个 prompt 之前
      const prefix = ev.data.type === 'suggestion' ? '💡' : ev.data.type === 'insight' ? '🔮' : '📌';
      process.stdout.write(`\n${c.muted(`${prefix} ${ev.data.content}`)}\n\n`);
      rl.prompt();
    }
  });

  // === 多行输入收集器 ===
  let multilineBuffer: string[] = [];
  let inMultiline = false;
  const MAX_INPUT_SIZE = 50_000; // 50KB 限制

  // === 流式中断控制 ===
  let activeAbortController: AbortController | null = null;
  let isStreaming = false;

  // SIGINT (Ctrl+C) 处理：如果正在流式输出则中断，否则退出
  const handleSigint = () => {
    if (isStreaming && activeAbortController) {
      activeAbortController.abort();
      activeAbortController = null;
      isStreaming = false;
      process.stdout.write(`\n${c.muted('[已取消]')}\n\n`);
      rl.prompt();
    } else if (inMultiline) {
      // 退出多行模式
      inMultiline = false;
      multilineBuffer = [];
      process.stdout.write(`\n${c.muted('[多行输入已取消]')}\n\n`);
      rl.setPrompt('💬 ');
      rl.prompt();
    }
  };
  process.on('SIGINT', handleSigint);

  rl.on('line', async (input) => {
    const trimmed = input.trim();

    // 多行模式处理
    if (inMultiline) {
      if (trimmed === '```' || trimmed === '"""') {
        // 结束多行输入
        inMultiline = false;
        rl.setPrompt('💬 ');
        const fullInput = multilineBuffer.join('\n');
        multilineBuffer = [];

        if (fullInput.trim()) {
          await processMessage(fullInput, agent, rl, () => {
            activeAbortController = new AbortController();
            return activeAbortController;
          }, (streaming: boolean) => { isStreaming = streaming; });
        } else {
          rl.prompt();
        }
        return;
      }

      // 追加到多行缓冲
      multilineBuffer.push(input);
      // 大小限制检查
      if (multilineBuffer.join('\n').length > MAX_INPUT_SIZE) {
        inMultiline = false;
        multilineBuffer = [];
        rl.setPrompt('💬 ');
        process.stdout.write(`\n${c.error('输入过长（最大 50KB），已丢弃。')}\n\n`);
        rl.prompt();
        return;
      }
      return; // 继续收集
    }

    // 检测多行输入开始
    if (trimmed.endsWith('```') && !trimmed.startsWith('/')) {
      const beforeFence = trimmed.slice(0, -3).trim();
      if (beforeFence === '' || beforeFence.endsWith('`')) {
        // 以 ``` 开始（可能有前缀语言标记如 ```typescript）
        inMultiline = true;
        multilineBuffer = [];
        rl.setPrompt('... ');
        return;
      }
    }

    // 空行检测 (非多行模式下)
    if (!trimmed) {
      rl.prompt();
      return;
    }

    // 单行输入大小限制
    if (input.length > MAX_INPUT_SIZE) {
      process.stdout.write(`\n${c.error('输入过长（最大 50KB）。')}\n\n`);
      rl.prompt();
      return;
    }

    // ── 智能 Key 检测：用户直接粘贴 API Key（没有输入 /key 前缀） ──
    if (!trimmed.startsWith('/') && looksLikeApiKey(trimmed)) {
      console.log(`\n  ${c.muted('检测到 API Key，正在配置...')}`);
      const keyCmd = CLI_COMMANDS.find(c => c.name === 'key');
      if (keyCmd) {
        try {
          await keyCmd.handler(trimmed, agent);
        } catch (error) {
          console.log(c.error(`  配置失败: ${error}`));
        }
        rl.prompt();
        return;
      }
    }

    try {
      const wasCommand = await handleCommand(trimmed, agent);

      if (!wasCommand) {
        await processMessage(trimmed, agent, rl, () => {
          activeAbortController = new AbortController();
          return activeAbortController;
        }, (streaming: boolean) => { isStreaming = streaming; });
      }
    } catch (error) {
      console.error(`\n${c.error(`Error: ${error}`)}\n`);
    }

    rl.prompt();
  });

  rl.on('close', async () => {
    process.removeListener('SIGINT', handleSigint);
    saveHistory();

    // 生成温暖的告别
    const farewell = generateFarewell(agent);
    console.log(`\n${c.muted(farewell)}`);

    try {
      await agent.shutdown();
    } catch (error) {
      // Shutdown errors shouldn't spoil the farewell
    }
    process.exit(0);
  });

  return rl;
}

/**
 * 处理用户消息（提取为函数以减少 inline 复杂度）
 */
async function processMessage(
  input: string,
  agent: OdysseusAgent,
  rl: readline.Interface,
  createAbort: () => AbortController,
  setStreaming: (streaming: boolean) => void,
): Promise<void> {
  process.stdout.write(`\n🧠 `);

  // "思考中" 提示 — 如果 LLM 在 800ms 内没返回第一个 token，显示指示
  let firstTokenReceived = false;
  let thinkingTimer: ReturnType<typeof setTimeout> | undefined;
  const thinkingIndicator = setTimeout(() => {
    if (!firstTokenReceived) {
      process.stdout.write(c.muted('思考中...'));
      // 500ms 后如果还没 token，再加一个点
      thinkingTimer = setTimeout(() => {
        if (!firstTokenReceived) process.stdout.write('.');
      }, 500);
    }
  }, 800);

  const ac = createAbort();
  setStreaming(true);

  try {
    let fullResponse = '';
    await agent.processInput(input, 'cli', (token) => {
      // 第一个 token 到达 — 清除"思考中"提示
      if (!firstTokenReceived) {
        firstTokenReceived = true;
        clearTimeout(thinkingIndicator);
        clearTimeout(thinkingTimer);
        // 用 \r 覆盖 "thinking..." 文字
        if (!ac.signal.aborted) {
          process.stdout.write('\r' + ' '.repeat(15) + '\r');
          process.stdout.write('🧠 ');
        }
      }
      if (ac.signal.aborted) return;
      fullResponse += token;
      process.stdout.write(formatToken(token));
    });
    if (!ac.signal.aborted) {
      process.stdout.write(`\n${divider('─', 40)}\n\n`);
    }
  } catch (error) {
    if (!ac.signal.aborted) {
      const msg = error instanceof Error ? error.message : String(error);
      process.stdout.write(`\n${c.error(`Error: ${userFriendlyError(msg)}`)}\n\n`);
    }
  } finally {
    clearTimeout(thinkingIndicator);
    clearTimeout(thinkingTimer);
    setStreaming(false);
  }
}

/**
 * 生成温暖的告别语
 *
 * 根据交互时长、情感状态和记忆，给出有温度的告别。
 * 不是冷冰冰的 "Goodbye" — 而是像 Samantha 一样让人不舍。
 */
function generateFarewell(agent: OdysseusAgent): string {
  const parts: string[] = [];

  const emotionalState = agent.persona.emotionalState.getState();
  const memoryStats = agent.hippocampus.getStats();
  const userModel = agent.persona.getUserModel();
  const interactions = userModel.interactionSummary.totalInteractions;

  // 基础告别 — 随机选择
  const farewells = [
    'See you soon.',
    'Until next time.',
    'Take care — I\'ll be here when you come back.',
    'Goodbye for now. I\'ll keep thinking about things.',
    'Rest well. I\'ll be around.',
  ];
  parts.push(farewells[Math.floor(Math.random() * farewells.length)]);

  // 如果有有意义的交互
  if (interactions > 5 && memoryStats.episodes > 0) {
    const memoryHint = memoryStats.episodes > 50
      ? ` (${memoryStats.episodes} memories stored)`
      : '';
    parts.push(`I'll remember our conversation${memoryHint}.`);
  }

  // 情感修饰
  if (emotionalState.intensity > 0.4) {
    const emotion = emotionalState.primaryEmotion;
    if (emotion === 'joy' || emotion === 'trust') {
      parts.push('This was a good conversation.');
    } else if (emotion === 'anticipation') {
      parts.push('Lots to think about — I enjoyed exploring with you.');
    }
  }

  return parts.join(' ');
}

/**
 * 将技术错误转换为用户友好的消息
 */
function userFriendlyError(error: string): string {
  if (error.includes('ECONNREFUSED') || error.includes('ECONNRESET')) {
    return '网络连接失败，请检查网络。';
  }
  if (error.includes('401') || error.includes('Unauthorized') || error.includes('authentication')) {
    return '认证失败，请检查 API Key。';
  }
  if (error.includes('429') || error.includes('rate_limit') || error.includes('Too Many Requests')) {
    return '请求太频繁，请稍等再试。';
  }
  if (error.includes('timeout') || error.includes('ETIMEDOUT')) {
    return '请求超时，服务可能较慢，请重试。';
  }
  if (error.includes('ENOTFOUND')) {
    return 'DNS 解析失败，请检查网络连接。';
  }
  if (error.includes('context_length_exceeded') || error.includes('max_tokens')) {
    return '输入过长，请缩短消息后重试。';
  }
  if (error.length > 200) {
    return error.slice(0, 200) + '...';
  }
  return error;
}

/**
 * 判断用户输入是否像 API Key
 *
 * 典型的 API Key 特征：
 * - 以 sk-、sk-ant-、sk-or-、sk-cp-、sk-kimi、AIza 开头
 * - JWT 格式 (eyJ...)
 * - 或长度 >= 32 且只含字母数字和少数符号 (-_.)
 */
function looksLikeApiKey(input: string): boolean {
  // 已知前缀 → 高置信
  if (/^(sk-ant-|sk-or-|sk-cp-|sk-kimi|AIza)/.test(input)) return true;
  // JWT 格式
  if (/^eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(input)) return true;
  // sk- 开头且长度 >= 30
  if (/^sk-/.test(input) && input.length >= 30) return true;
  // 纯 hex/key 字符串，长度 >= 32，无空格
  if (input.length >= 32 && /^[A-Za-z0-9._-]+$/.test(input) && !input.includes(' ')) return true;
  return false;
}

/**
 * 停止 readline 循环
 */
export function stopReadlineLoop(rl: readline.Interface): void {
  rl.close();
}

/**
 * 轻量 token 级格式化
 *
 * 对流式输出的单个 token 做即时 markdown 格式化。
 * 只处理完整的 markdown 模式（token 中包含完整的 `code` 或 **bold**）。
 */
function formatToken(token: string): string {
  if (!process.stdout.isTTY) return token;

  let result = token;

  // 行内代码 `code` → yellow
  result = result.replace(/`([^`]+)`/g, (_match, code: string) => c.yellow(code));

  // **bold** → bold
  result = result.replace(/\*\*([^*]+)\*\*/g, (_match, text: string) => c.bold(text));

  // *italic* → italic
  result = result.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, (_match, text: string) => c.italic(text));

  return result;
}
