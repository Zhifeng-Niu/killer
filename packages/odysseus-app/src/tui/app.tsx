/**
 * Odysseus TUI — 线性三区架构
 *
 * 终端是从上到下的线性字符流。
 * 渲染树：消息区（flexGrow）→ 上下文条 → 输入框（最后子元素，自然沉底）。
 * 没有 header/sidebar —— 模型名启动时一行带过，/status 按需查看。
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Box, Text, useApp, useInput, useStdout } from 'ink';
import { ChatPanel, type ChatMessage } from './chat-panel.js';
import { InputArea } from './input-area.js';
import { Header } from './header.js';
import { colors, box } from './theme.js';
import type { OdysseusAgent } from '../orchestrator/index.js';
import { generateBootGreeting } from '../cli/greeting.js';

interface OdysseusTUIProps {
  agent: OdysseusAgent;
}

let msgCounter = 0;

const KNOWN_TUI_COMMANDS = new Set([
  'help', 'status', 'columns', 'spawn', 'goals', 'memory',
  'persona', 'emotions', 'narrative', 'predictions',
  'dream', 'think', 'evolve', 'delegate', 'diagnostics',
  'health', 'metrics', 'sessions', 'save', 'load',
  'mission', 'key', 'approve', 'deny', 'model', 'mode',
  'find', 'retry', 'clear', 'learn', 'unlearn', 'inspect',
  'exit', 'quit',
]);

function createMessage(role: ChatMessage['role'], content: string, streaming = false): ChatMessage {
  return { id: `msg-${++msgCounter}`, role, content, streaming, timestamp: Date.now() };
}

export function OdysseusTUI({ agent }: OdysseusTUIProps) {
  const { exit } = useApp();
  const { stdout } = useStdout();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isThinking, setIsThinking] = useState(false);
  const [agentStatus, setAgentStatus] = useState<'idle' | 'thinking' | 'streaming' | 'error'>('idle');
  const [statusDetail, setStatusDetail] = useState<string>('');

  const abortRef = useRef<AbortController | null>(null);
  const lastUserInputRef = useRef<string | null>(null);
  const renderedIdsRef = useRef<Set<string>>(new Set());
  const messagesRef = useRef<ChatMessage[]>([]);
  const bootTimeRef = useRef(Date.now());

  // ── Header 自管理 emotion 和 tick，不触发 App 重渲染 ──

  // ── Boot greeting — 模型名一行带过 ──
  useEffect(() => {
    const greeting = generateBootGreeting({
      persona: agent.persona,
      hippocampus: agent.hippocampus,
      isFirstBoot: agent.getMemoryStats().totalEpisodes === 0 && agent.persona.getUserModel().interactionSummary.totalInteractions === 0,
      isSessionRestored: agent.persona.getLastSeenAt() !== null,
      lastTopic: agent.getLastTopic(),
    });
    const clean = greeting.replace(/\x1b\[[0-9;]*m/g, '').trim();
    if (clean) {
      const msg = createMessage('agent', clean);
      replaceMessages([msg]);
    }
  }, [agent]);

  // ── Consciousness stream — 主动建议 ──
  useEffect(() => {
    const unsubscribe = agent.consciousness.on('action', (event: unknown) => {
      try {
        const ev = event as { type?: string; data?: { type?: string; content?: string } };
        if (ev.type === 'proactive.suggestion' && ev.data?.content) {
          const prefix = ev.data.type === 'suggestion' ? '💡' : ev.data.type === 'insight' ? '🔮' : '📌';
          appendMessage(createMessage('system', `${prefix} ${ev.data!.content}`));
        }
      } catch { /* 静默 */ }
    });
    return unsubscribe;
  }, [agent]);

  // ── 消息管理 ──

  const updateMessage = useCallback((id: string, updater: (msg: ChatMessage) => ChatMessage) => {
    const pool = messagesRef.current;
    const idx = pool.findIndex(m => m.id === id);
    if (idx === -1) return;
    const updated = updater(pool[idx]);
    if (updated.content === pool[idx].content && updated.streaming === pool[idx].streaming) return;
    pool[idx] = updated;
    setMessages([...pool]);
  }, []);

  const appendMessage = useCallback((msg: ChatMessage) => {
    if (renderedIdsRef.current.has(msg.id)) return;
    renderedIdsRef.current.add(msg.id);
    const pool = messagesRef.current;
    messagesRef.current = [...pool, msg];
    setMessages(messagesRef.current);
  }, []);

  const replaceMessages = useCallback((msgs: ChatMessage[]) => {
    renderedIdsRef.current = new Set(msgs.map(m => m.id));
    messagesRef.current = msgs;
    setMessages(msgs);
  }, []);

  // ── 上下文用量估算 ──
  const contextEstimate = React.useMemo(() => {
    // 粗估：每条消息 ~500 tokens
    const used = Math.min(messages.length * 500, 128000);
    return { used, total: 128000 };
  }, [messages.length]);

  // ── 键盘 ──
  const shutdownRef = useRef(false);
  useInput((_input, key) => {
    if (key.ctrl && _input === 'c') {
      if (shutdownRef.current) return;
      shutdownRef.current = true;
      agent.saveSession('tui-session');
      agent.shutdown().then(() => exit()).catch(() => exit());
      return;
    }
    if (key.escape && abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
      setIsThinking(false);
      setAgentStatus('idle');
      const pool = messagesRef.current;
      if (pool.length > 0) {
        const last = pool[pool.length - 1];
        if (last?.streaming) {
          updateMessage(last.id, (m) => ({
            ...m,
            streaming: false,
            content: m.content + '\n\n[已取消]',
          }));
        }
      }
    }
  });

  // ── 提交处理 ──

  const handleSubmit = useCallback(async (rawInput: string) => {
    if (rawInput === '/clear') {
      replaceMessages([]);
      return;
    }

    let input = rawInput;
    if (rawInput === '/retry') {
      if (!lastUserInputRef.current) {
        appendMessage(createMessage('system', '没有可重试的消息'));
        return;
      }
      input = lastUserInputRef.current;
    }

    if (input.startsWith('/find ') || input === '/find') {
      const keyword = input.slice(6).trim().toLowerCase();
      if (!keyword) {
        appendMessage(createMessage('system', '用法: /find <关键词>'));
        return;
      }
      const pool = messagesRef.current;
      const results = pool.filter(m => m.content.toLowerCase().includes(keyword));
      if (results.length === 0) {
        appendMessage(createMessage('system', `未找到包含 "${keyword}" 的消息`));
      } else {
        const lines = results.slice(0, 10).map(m => {
          const role = m.role === 'user' ? '你' : m.role === 'agent' ? 'Odysseus' : m.role === 'error' ? '错误' : '系统';
          const preview = m.content.split('\n')[0].slice(0, 60);
          return `  ${role}: ${preview}${m.content.length > 60 ? '...' : ''}`;
        });
        appendMessage(createMessage('system', [`找到 ${results.length} 条匹配 "${keyword}" 的消息:`, ...lines].join('\n')));
      }
      return;
    }

    if (input.startsWith('/')) {
      const cmd = input.slice(1).split(/\s/)[0].toLowerCase();
      if (KNOWN_TUI_COMMANDS.has(cmd)) {
        const output = await handleCommand(input, agent);
        if (output) {
          if (output.startsWith('__EXIT__')) {
            appendMessage(createMessage('agent', output.slice(8)));
            await agent.shutdown();
            exit();
            return;
          }
          appendMessage(createMessage('system', output));
        }
        return;
      }
    }

    if (looksLikeApiKey(input)) {
      appendMessage(createMessage('system', '检测到 API Key。请使用 /key 命令配置：/key ' + input.slice(0, 8) + '...'));
      return;
    }

    // 用户消息
    const userMsg = createMessage('user', input);
    lastUserInputRef.current = input;
    appendMessage(userMsg);

    // Agent 回复
    if (abortRef.current) abortRef.current.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setIsThinking(true);
    setAgentStatus('thinking');
    setStatusDetail('');
    const startTime = Date.now();

    const agentMsgId = `msg-${++msgCounter}`;
    const agentMsg = createMessage('agent', '', true);
    agentMsg.id = agentMsgId;
    appendMessage(agentMsg);

    try {
      let fullResponse = '';
      let lastFlush = 0;
      let statusSet = false;
      const FLUSH_MS = 400;

      const result = await agent.processInput(input, 'cli', (token) => {
        if (ac.signal.aborted) return;
        fullResponse += token;
        if (!statusSet) {
          statusSet = true;
          setAgentStatus('streaming');
          setStatusDetail('');
        }
        const now = Date.now();
        if (now - lastFlush >= FLUSH_MS) {
          lastFlush = now;
          const snapshot = fullResponse;
          updateMessage(agentMsgId, (m) => ({ ...m, content: snapshot }));
        }
      }, (status) => {
        if (ac.signal.aborted) return;
        setAgentStatus('thinking');
        setStatusDetail(status);
        if (status.includes('(') && !status.startsWith('Thinking') && !status.startsWith('Reasoning') && !status.startsWith('Summarizing') && !status.startsWith('Converging')) {
          const pool = messagesRef.current;
          const last = pool[pool.length - 1];
          if (last?.role === 'system' && last.content.startsWith('  ◉ ') && !last.content.includes('\n')) {
            updateMessage(last.id, () => createMessage('system', `  ◉ ${status}`));
          } else {
            appendMessage(createMessage('system', `  ◉ ${status}`));
          }
        }
      });

      if (!ac.signal.aborted) {
        const elapsed = Date.now() - startTime;
        const finalContent = result?.content?.trim() || fullResponse;
        updateMessage(agentMsgId, (m) => ({ ...m, content: finalContent, streaming: false, duration: elapsed }));
      }
    } catch (error) {
      if (!ac.signal.aborted) {
        const msg = error instanceof Error ? error.message : String(error);
        appendMessage(createMessage('error', msg));
        setAgentStatus('error');
        // 错误闪光 800ms 后回到 idle
        setTimeout(() => {
          setAgentStatus('idle');
          setIsThinking(false);
        }, 800);
        abortRef.current = null;
        setStatusDetail('');
        return;
      }
    } finally {
      abortRef.current = null;
      if (agentStatus !== 'error') {
        setIsThinking(false);
        setAgentStatus('idle');
      }
      setStatusDetail('');
    }
  }, [agent]);

  // ── 渲染 — 线性布局 ──

  return (
    <Box flexDirection="column" height="100%">
      <ChatPanel messages={messages} isThinking={isThinking} />
      <Header
        model={agent.getModel?.() ?? ''}
        agent={agent}
        uptime={Date.now() - bootTimeRef.current}
        messageCount={messages.length}
      />
      <InputArea
        onSubmit={handleSubmit}
        agentStatus={agentStatus}
        statusDetail={statusDetail}
        contextUsed={contextEstimate.used}
        contextTotal={contextEstimate.total}
      />
    </Box>
  );
}

// ── 命令处理 ──

async function handleCommand(input: string, agent: OdysseusAgent): Promise<string> {
  const parts = input.slice(1).split(' ');
  const cmd = parts[0].toLowerCase();
  const args = parts.slice(1).join(' ');

  switch (cmd) {
    case 'help': {
      return [
        '# Commands',
        '',
        '## Core',
        '- /status — Agent status overview',
        '- /clear — Clear chat',
        '- /retry — Resend last message',
        '- /find `<keyword>` — Search messages',
        '',
        '## Cognitive',
        '- /think — Deep reasoning',
        '- /dream — Memory consolidation',
        '- /evolve `[audit|self|status]` — Darwinian evolution',
        '- /goals — Active goals',
        '- /plan — Create a goal',
        '- /delegate — Multi-cell delegation',
        '- /cells — Active cells',
        '- /spawn `[role]` — Spawn new column',
        '',
        '## Memory',
        '- /memory — Memory stats',
        '- /save — Save session',
        '- /load — Load session',
        '- /sessions — Session list',
        '',
        '## Identity',
        '- /persona — Persona info',
        '- /emotions — Emotional state',
        '- /narrative — Autobiographical memory',
        '- /predictions — User model',
        '',
        '## System',
        '- /health — Health report',
        '- /diagnostics — System diagnostics',
        '- /metrics — Performance stats',
        '- /model `[name]` — View/switch model',
        '- /key `<key>` — Update API key',
        '- /mode `[auto|confirm|deny]` — Permission policy',
        '- /approve `<tool>` — Approve tool',
        '- /deny `<tool>` — Block tool',
        '- /inspect — List all tools',
        '- /mission — Mission control',
        '- /exit — Quit',
      ].join('\n');
    }
    case 'status': {
      const s = agent.getStatus();
      const model = agent.getModel?.() ?? 'unknown';
      return [
        `## Status`,
        '',
        `| | |`,
        `|---|---|`,
        `| Running | ${s.running ? '✓ active' : '✗ stopped'} |`,
        `| Model | \`${model}\` |`,
        `| Uptime | ${Math.floor(s.uptime / 1000)}s |`,
        `| Brainstem | ${s.modules.brainstem.phase} (${s.modules.brainstem.loopCount} loops) |`,
        `| Hippocampus | ${s.modules.hippocampus.episodes} episodes |`,
        `| Synapse | ${s.modules.synapse.cells} cells |`,
      ].join('\n');
    }
    case 'columns': {
      const cells = agent.synapse.getAllColumns();
      if (!cells.length) return '没有活跃的 Cells';
      return cells.map(c => `- ${c.id.id} — \`${c.config.type}\``).join('\n');
    }
    case 'goals': {
      const goals = agent.getGoals();
      if (!goals.length) return '没有目标';
      return goals.map((g, i) => `${i + 1}. ${g.description}`).join('\n');
    }
    case 'memory': {
      const m = agent.getMemoryStats();
      return [
        '## Memory',
        '',
        `| Layer | Count |`,
        `|---|---|`,
        `| Total Episodes | ${m.totalEpisodes} |`,
        `| Short-term | ${m.shortTermCount} |`,
        `| Long-term | ${m.longTermCount} |`,
        `| Associations | ${m.associationCount} |`,
      ].join('\n');
    }
    case 'emotions': {
      const e = agent.persona.emotionalState.getState();
      return [
        '## Emotional State',
        '',
        `- **${e.primaryEmotion}** ${emotionToEmoji(e.primaryEmotion)}`,
        `- Intensity: ${e.intensity.toFixed(2)}`,
        `- Valence: ${(e as { valence?: number }).valence?.toFixed(2) ?? '—'}`,
      ].join('\n');
    }
    case 'persona': {
      const p = agent.getPersona();
      const traits = p.traits.length ? p.traits.map(t => `\`${t}\``).join(', ') : 'none';
      return [
        '## Persona',
        '',
        `- **${p.name}**`,
        `- Traits: ${traits}`,
      ].join('\n');
    }
    case 'health': {
      const h = agent.healthMonitor.check();
      return `## Health\n\n\`${h.status}\``;
    }
    case 'dream': {
      const r = await agent.dream();
      return `🌙 梦境完成: ${r.episodesConsolidated} episodes consolidated`;
    }
    case 'think': {
      const r = await agent.think(args || 'current situation');
      return `🧠 ${r.conclusion} (confidence: ${r.confidence.toFixed(2)})`;
    }
    case 'evolve': {
      if (args?.trim() === 'audit' || !args?.trim()) {
        const gaps = agent.evolutionEngine.auditCapabilities();
        const status = agent.evolutionEngine.getStatus();
        const lines = [
          '## Self-Evolution',
          '',
          `| | |`,
          `|---|---|`,
          `| Total evolutions | ${status.totalEvolutions} |`,
          `| Successful | ${status.successfulEvolutions} |`,
          `| Failed | ${status.failedEvolutions} |`,
          `| Dynamic tools | ${status.dynamicToolCount} |`,
          `| Capability gaps | ${gaps.length} |`,
        ];
        if (gaps.length > 0) {
          lines.push('', '### Gaps');
          for (const g of gaps.slice(0, 5)) {
            lines.push(`- [\`${g.severity}\`] ${g.description}`);
          }
        }
        return lines.join('\n');
      }
      if (args?.trim() === 'self') {
        const r = await agent.evolve();
        return `## Evolution Complete\n\n- Mutations: ${r.mutations}\n- Successful: ${r.successful}`;
      }
      if (args?.trim() === 'status') {
        const s = agent.evolutionEngine.getStatus();
        const recent = agent.evolutionEngine.getRecentEvolutions(5);
        const lines = [
          '## Evolution History',
          '',
          `Running: ${s.running} | Total: ${s.totalEvolutions} | OK: ${s.successfulEvolutions} | Fail: ${s.failedEvolutions}`,
          `Dynamic tools: ${s.dynamicToolCount}`,
        ];
        if (recent.length > 0) {
          lines.push('');
          for (const r of recent) {
            lines.push(`- ${r.phase} ${r.status} ${r.toolName ?? ''} (\`${r.durationMs}ms\`)`);
          }
        }
        return lines.join('\n');
      }
      return 'Usage: `/evolve [audit|self|status]`';
    }
    case 'metrics': {
      const { MetricsCollector } = await import('../metrics/index.js');
      const metrics = MetricsCollector.getInstance();
      const report = metrics.healthCheck();
      return [
        '## Metrics',
        '',
        `| | |`,
        `|---|---|`,
        `| LLM Calls | ${report.llm.calls} |`,
        `| LLM Errors | ${report.llm.errors} |`,
        `| Avg Latency | ${report.llm.avgLatency}s |`,
      ].join('\n');
    }
    case 'model': {
      const current = agent.getModel();
      if (!args) return `Current: ${current}\nSwitch: /model <name>`;
      const newModel = args.trim();
      if (!agent.setModel(newModel)) {
        return `Cannot switch model (provider does not support hot-swap). Current: ${current}`;
      }
      try {
        const fs = await import('node:fs');
        const path = await import('node:path');
        const os = await import('node:os');
        const { loadConfig } = await import('../config/index.js');
        const config = loadConfig();
        (config.llm as { model: string }).model = newModel;
        const dir = path.join(os.homedir(), '.odysseus');
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(path.join(dir, 'config.json'), JSON.stringify({ llm: config.llm }, null, 2), 'utf-8');
        return `✓ Model: ${current} → ${newModel}（已保存，重启后生效）`;
      } catch {
        return `Model switched: ${current} → ${newModel}（内存生效，持久化失败）`;
      }
    }
    case 'mode': {
      if (!args) return 'Permission mode: auto (Odysseus is free)\n/deny <tool> to block a tool';
      return 'Odysseus is free. Use /deny <tool> to block specific tools.';
    }
    case 'narrative': {
      const n = agent.hippocampus.getNarrative();
      const themes = n.activeThemes.length ? n.activeThemes.map(t => `\`${t}\``).join(', ') : 'none';
      return [
        '## Narrative',
        '',
        `- Chapters: ${n.chapters.length}`,
        `- Themes: ${themes}`,
        `- Identity: ${n.identityStatement || 'forming...'}`,
      ].join('\n');
    }
    case 'predictions': {
      const p = agent.persona.getPredictions();
      const style = p.psychologicalProfile?.decisionStyle || 'unknown';
      const openness = (p.psychologicalProfile?.openness ?? 0).toFixed(2);
      return [
        '## User Predictions',
        '',
        `| | |`,
        `|---|---|`,
        `| Decision Style | ${style} |`,
        `| Openness | ${openness} |`,
        `| Predicted Needs | ${p.predictedNeeds?.length ?? 0} |`,
      ].join('\n');
    }
    case 'spawn': {
      const role = args || 'general';
      const id = await agent.spawnCellWithRole(role);
      return `Column spawned: ${id} (${role})`;
    }
    case 'delegate': {
      const task = args || 'analyze current state';
      const r = await agent.delegateTask(task);
      return `Delegated to ${r.totalCellsUsed} cells in ${r.durationMs}ms`;
    }
    case 'diagnostics': {
      const s = agent.getStatus();
      const h = agent.healthMonitor.formatReport();
      return [
        '## Diagnostics',
        '',
        `| Module | Status |`,
        `|---|---|`,
        `| Brainstem | ${s.modules.brainstem.phase} (${s.modules.brainstem.loopCount} loops) |`,
        `| Hippocampus | ${s.modules.hippocampus.episodes} episodes |`,
        `| Synapse | ${s.modules.synapse.cells} cells |`,
        `| Health | ${h} |`,
      ].join('\n');
    }
    case 'sessions': {
      const sessions = agent.listSessions();
      if (!sessions.length) return 'No saved sessions';
      return sessions.map(s => `  ${s}`).join('\n');
    }
    case 'load': {
      const name = args || 'tui-session';
      const loaded = agent.loadSession(name);
      return loaded ? `✓ Session "${name}" loaded` : `Session "${name}" not found`;
    }
    case 'mission': {
      const sub = parts[1]?.toLowerCase();
      try {
        const { Cerebellum } = await import('@odysseus/core');
        const cerebellum = new Cerebellum();
        if (!sub || sub === 'status') {
          const active = cerebellum.hasActiveMission();
          return active ? 'Mission active. Use /mission compass | experiment | verify | decide | record' : 'No active mission. Use /mission create <goal>';
        }
        if (sub === 'create' && parts[2]) {
          const goal = parts.slice(2).join(' ');
          const m = cerebellum.createMission({ goal });
          cerebellum.activateMission(m);
          return `✓ Mission created: "${goal}" (id: ${m.id})`;
        }
        if (sub === 'compass') {
          const mission = cerebellum.getActiveMission();
          if (!mission) return 'No active mission for compass reading';
          return `Orientation: ${mission.orientation} | Goal: ${mission.goal}`;
        }
        if (sub === 'experiment' && parts[2]) {
          const hyp = parts.slice(2).join(' ');
          const exp = await cerebellum.beginExperiment(hyp);
          return `✓ Experiment started: "${hyp}" (waypoint ${exp.waypoint})`;
        }
        return 'Usage: /mission [create <goal> | compass | experiment <hypothesis> | verify | decide | record <keep|discard>]';
      } catch (e) {
        return `Mission error: ${e instanceof Error ? e.message : String(e)}`;
      }
    }
    case 'key': {
      if (!args) return '用法: /key <api-key>';
      try {
        const fs = await import('node:fs');
        const path = await import('node:path');
        const os = await import('node:os');
        const { loadConfig } = await import('../config/index.js');
        const config = loadConfig();
        (config.llm as { apiKey: string }).apiKey = args;
        const dir = path.join(os.homedir(), '.odysseus');
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(path.join(dir, 'config.json'), JSON.stringify({ llm: config.llm }, null, 2), 'utf-8');
        return '✓ API Key 已保存。重启后生效: Ctrl+C 退出后重新启动。';
      } catch (e) {
        return `Key 保存失败: ${e instanceof Error ? e.message : String(e)}`;
      }
    }
    case 'save': {
      agent.saveSession('tui-session');
      return '✓ 会话已保存';
    }
    case 'approve': {
      if (!args) return '用法: /approve <tool> | /approve all';
      if (args === 'all') {
        const rules = agent.toolPermissions.getRules();
        for (const r of rules) agent.toolPermissions.approve(r.tool);
        return '✓ 所有已知工具已批准';
      }
      agent.toolPermissions.approve(args);
      return `✓ ${args} 已批准（本次会话有效）`;
    }
    case 'deny': {
      if (!args) return '用法: /deny <tool>';
      agent.toolPermissions.deny(args);
      return `✓ ${args} 已禁止`;
    }
    case 'inspect': {
      const r = await agent.tools.execute('inspect_tools', {});
      if (!r.success) return `Inspect failed: ${r.error}`;
      const d = r.data as { total: number; builtin: number; dynamic: number; tools: Array<{ name: string; description: string; type: string }> };
      const lines = [`Total: ${d.total} (builtin: ${d.builtin}, dynamic: ${d.dynamic})`, ''];
      for (const t of d.tools) {
        const tag = t.type === 'dynamic' ? ' ★' : '';
        lines.push(`  ${t.name}${tag}: ${t.description.slice(0, 60)}`);
      }
      return lines.join('\n');
    }
    case 'learn': {
      if (!args) return '用法: /learn <name> — Agent 通过 learn 工具自行创建新工具\n  提示: 在对话中告诉 Agent 你需要什么能力，它会自行调用 learn 工具创建';
      return '提示: 请在对话中描述你需要的工具能力，Agent 会自行调用 learn 工具创建。\n  例如: "帮我创建一个工具来计算两个日期之间的天数"';
    }
    case 'unlearn': {
      if (!args) return '用法: /unlearn <tool_name>';
      const r = await agent.tools.execute('unlearn', { name: args.trim() });
      return r.success ? `✓ 工具 "${args.trim()}" 已移除` : `移除失败: ${r.error}`;
    }
    case 'exit':
    case 'quit': {
      agent.saveSession('tui-session');
      const emotionalState = agent.persona.emotionalState.getState();
      const emoji = emotionToEmoji(emotionalState.primaryEmotion);
      return `__EXIT__${emoji} 再见！下次见。`;
    }
    default:
      return `未知命令: /${cmd}。输入 /help 查看帮助。`;
  }
}

function emotionToEmoji(emotion: string): string {
  const map: Record<string, string> = {
    neutral: '😐', happy: '😊', sad: '😢', angry: '😠',
    fear: '😨', fearful: '😨', surprised: '😮', disgusted: '🤢',
    curious: '🤔', excited: '🤩', calm: '😌',
    joy: '😊', contentment: '😌', anxiety: '😰',
    sadness: '😢', surprise: '😮', anticipation: '🤔',
  };
  return map[emotion.toLowerCase()] || '🎭';
}

function looksLikeApiKey(s: string): boolean {
  if (s.startsWith('/') || s.length < 20 || s.length > 500) return false;
  if (s.startsWith('sk-') || s.startsWith('sk-ant-') || s.startsWith('sk-or-')) return true;
  if (s.startsWith('sk-cp-') || s.startsWith('sk-kimi') || s.startsWith('gsk_')) return true;
  if (s.startsWith('AIza')) return true;
  if (/^eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(s)) return true;
  return false;
}
