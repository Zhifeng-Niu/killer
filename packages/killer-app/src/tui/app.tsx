/**
 * Killer TUI — Main App Component
 *
 * 分屏布局：左侧聊天区 + 右侧状态面板 + 底部输入框。
 * 接收 KillerAgent 实例，处理消息流和命令。
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Box, Text, useApp, useInput, useStdout } from 'ink';
import { ChatPanel, type ChatMessage } from './chat-panel.js';
import { Sidebar, type SidebarData } from './sidebar.js';
import { InputArea } from './input-area.js';
import { colors, box, statusDot, statusColor, spinners } from './theme.js';
import type { KillerAgent } from '../orchestrator/index.js';
import { generateBootGreeting } from '../cli/greeting.js';

interface KillerTUIProps {
  agent: KillerAgent;
}

let msgCounter = 0;

const KNOWN_TUI_COMMANDS = new Set([
  'help', 'status', 'cells', 'spawn', 'goals', 'memory',
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

export function KillerTUI({ agent }: KillerTUIProps) {
  const { exit } = useApp();
  const { stdout } = useStdout();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isThinking, setIsThinking] = useState(false);
  const [agentStatus, setAgentStatus] = useState<'idle' | 'thinking' | 'streaming' | 'error'>('idle');
  const [statusDetail, setStatusDetail] = useState<string>('');
  const [spinnerFrame, setSpinnerFrame] = useState(0);
  const abortRef = useRef<AbortController | null>(null);
  const lastUserInputRef = useRef<string | null>(null);

  // Spinner 动画 — 思考时循环帧
  useEffect(() => {
    if (agentStatus !== 'thinking' && agentStatus !== 'streaming') return;
    const timer = setInterval(() => {
      setSpinnerFrame(f => (f + 1) % spinners.thinking.length);
    }, 120);
    return () => clearInterval(timer);
  }, [agentStatus]);

  // 采集 sidebar 数据
  const sidebarData = useSidebarData(agent, agentStatus);

  // Boot greeting — 首条系统消息
  useEffect(() => {
    const greeting = generateBootGreeting({
      persona: agent.persona,
      hippocampus: agent.hippocampus,
      isFirstBoot: agent.getMemoryStats().totalEpisodes === 0 && agent.persona.getUserModel().interactionSummary.totalInteractions === 0,
      isSessionRestored: agent.persona.getLastSeenAt() !== null,
      lastTopic: agent.getLastTopic(),
    });
    // 去除 ANSI 颜色码（ink 用自己的颜色系统）
    const clean = greeting.replace(/\x1b\[[0-9;]*m/g, '').trim();
    if (clean) {
      setMessages([createMessage('agent', clean)]);
    }
  }, [agent]);

  // Consciousness stream — 主动建议
  useEffect(() => {
    const unsubscribe = agent.consciousness.on('action', (event: unknown) => {
      try {
        const ev = event as { type?: string; data?: { type?: string; content?: string } };
        if (ev.type === 'proactive.suggestion' && ev.data?.content) {
          const prefix = ev.data.type === 'suggestion' ? '💡' : ev.data.type === 'insight' ? '🔮' : '📌';
          setMessages(prev => [...prev, createMessage('system', `${prefix} ${ev.data!.content}`)]);
        }
      } catch { /* 静默忽略事件处理错误 */ }
    });
    return unsubscribe;
  }, [agent]);

  // Esc 取消流式输出，Ctrl+C 优雅退出
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
      setMessages(prev => {
        const last = prev[prev.length - 1];
        if (last?.streaming) {
          return [...prev.slice(0, -1), { ...last, streaming: false, content: last.content + '\n\n[已取消]' }];
        }
        return prev;
      });
    }
  });

  const handleSubmit = useCallback(async (rawInput: string) => {
    // /clear 清空聊天显示
    if (rawInput === '/clear') {
      setMessages([]);
      return;
    }

    // /retry 重发上一条用户消息
    let input = rawInput;
    if (rawInput === '/retry') {
      if (!lastUserInputRef.current) {
        setMessages(prev => [...prev, createMessage('system', '没有可重试的消息')]);
        return;
      }
      input = lastUserInputRef.current;
    }

    // /find 搜索历史消息（需要 messages 状态）
    if (input.startsWith('/find ') || input === '/find') {
      const keyword = input.slice(6).trim().toLowerCase();
      if (!keyword) {
        setMessages(prev => [...prev, createMessage('system', '用法: /find <关键词>')]);
        return;
      }
      setMessages(prev => {
        const results = prev.filter(m => m.content.toLowerCase().includes(keyword));
        if (results.length === 0) {
          return [...prev, createMessage('system', `未找到包含 "${keyword}" 的消息`)];
        }
        const lines = results.slice(0, 10).map(m => {
          const role = m.role === 'user' ? '你' : m.role === 'agent' ? 'Killer' : m.role === 'error' ? '错误' : '系统';
          const preview = m.content.split('\n')[0].slice(0, 60);
          return `  ${role}: ${preview}${m.content.length > 60 ? '...' : ''}`;
        });
        const header = `找到 ${results.length} 条匹配 "${keyword}" 的消息:`;
        return [...prev, createMessage('system', [header, ...lines].join('\n'))];
      });
      return;
    }

    // 命令处理 — 只匹配已知命令（文件路径如 /Users/... 不拦截）
    if (input.startsWith('/')) {
      const cmd = input.slice(1).split(/\s/)[0].toLowerCase();
      if (KNOWN_TUI_COMMANDS.has(cmd)) {
        const output = await handleCommand(input, agent);
        if (output) {
          if (output.startsWith('__EXIT__')) {
            setMessages(prev => [...prev, createMessage('agent', output.slice(8))]);
            await agent.shutdown();
            exit();
            return;
          }
          setMessages(prev => [...prev, createMessage('system', output)]);
        }
        return;
      }
    }

    // API Key 智能检测 — 用户直接粘贴 Key
    if (looksLikeApiKey(input)) {
      setMessages(prev => [...prev, createMessage('system', '检测到 API Key。请使用 /key 命令配置：/key ' + input.slice(0, 8) + '...')]);
      return;
    }

    // 用户消息
    const userMsg = createMessage('user', input);
    lastUserInputRef.current = input;
    setMessages(prev => [...prev, userMsg]);

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
    setMessages(prev => [...prev, agentMsg]);

    try {
      let fullResponse = '';
      let lastFlush = 0;
      let statusSet = false;
      const FLUSH_MS = 60;
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
          setMessages(prev => prev.map(m =>
            m.id === agentMsgId ? { ...m, content: snapshot } : m
          ));
        }
      }, (status) => {
        if (ac.signal.aborted) return;
        setAgentStatus('thinking');
        setStatusDetail(status);
        // 工具执行状态注入聊天面板（让用户看到 agent 在做什么）
        if (status.includes('(') && !status.startsWith('Thinking') && !status.startsWith('Reasoning') && !status.startsWith('Summarizing') && !status.startsWith('Converging')) {
          setMessages(prev => [...prev, createMessage('system', `  ${spinners.thinking[spinnerFrame]} ${status}`)]);
        }
      });

      if (!ac.signal.aborted) {
        const elapsed = Date.now() - startTime;
        // 使用 processInput 返回值作为最终内容（包含工具链循环的最终结果）
        // 如果返回值非空就用它，否则 fallback 到流式累积的内容
        const finalContent = result?.content?.trim() || fullResponse;
        setMessages(prev => prev.map(m =>
          m.id === agentMsgId ? { ...m, content: finalContent, streaming: false, duration: elapsed } : m
        ));
      }
    } catch (error) {
      if (!ac.signal.aborted) {
        const msg = error instanceof Error ? error.message : String(error);
        setMessages(prev => [...prev, createMessage('error', msg)]);
        setAgentStatus('error');
      }
    } finally {
      abortRef.current = null;
      setIsThinking(false);
      setAgentStatus('idle');
      setStatusDetail('');
    }
  }, [agent]);

  return (
    <Box flexDirection="column" height="100%">
      {/* Header — 极简状态栏 */}
      <Box borderStyle="single" borderBottom={true} borderLeft={false} borderRight={false} borderColor={colors.dimmed} paddingX={1}>
        <Text color={statusDetail ? colors.primary : colors.primary} bold>{statusDot[agentStatus]} Killer</Text>
        {sidebarData.model.startsWith('mock') && (
          <>
            <Text color={colors.dimmed}> {box.v} </Text>
            <Text color={colors.warning}>demo</Text>
          </>
        )}
        <Text color={colors.dimmed}> {box.v} </Text>
        <Text color={colors.muted}>{sidebarData.model.length > 20 ? sidebarData.model.slice(0, 18) + '…' : sidebarData.model}</Text>
        <Text color={colors.dimmed}> {box.v} </Text>
        <Text color={colors.muted}>{sidebarData.uptime}</Text>
        <Text color={colors.dimmed}> {box.v} </Text>
        <Text color={colors.muted}>{messages.length}msg</Text>
        {statusDetail && (
          <>
            <Text color={colors.dimmed}> {box.v} </Text>
            <Text color={colors.primary}>{spinners.thinking[spinnerFrame]} {statusDetail}</Text>
          </>
        )}
      </Box>

      {/* Main body: Chat + Sidebar */}
      <Box flexGrow={1}>
        <Box flexDirection="column" flexGrow={1} paddingX={1}>
          <ChatPanel messages={messages} isThinking={isThinking} />
        </Box>
        {(stdout?.columns ?? 80) >= 80 && <Sidebar data={sidebarData} />}
      </Box>

      {/* Input */}
      <InputArea
        onSubmit={handleSubmit}
        isProcessing={isThinking}
        placeholder={statusDetail ? statusDetail : agentStatus === 'thinking' ? '思考中...' : agentStatus === 'streaming' ? '输出中...' : undefined}
      />
    </Box>
  );
}

/** 采集 sidebar 数据的 hook */
function useSidebarData(agent: KillerAgent, status: SidebarData['status']): SidebarData {
  const [data, setData] = useState<SidebarData>(() => collectSidebarData(agent, status));

  useEffect(() => {
    const interval = setInterval(() => {
      setData(collectSidebarData(agent, status));
    }, 2000);
    return () => clearInterval(interval);
  }, [agent, status]);

  return data;
}

function collectSidebarData(agent: KillerAgent, status: SidebarData['status']): SidebarData {
  const agentStatus = agent.getStatus();
  const emotionalState = agent.persona.emotionalState.getState();
  const memStats = agent.getMemoryStats();
  const goals = agent.getGoals();
  const cells = agent.synapse.getAllCells();
  const llmDiag = agent.getLLMDiagnostics();

  const uptime = agentStatus.uptime;
  const uptimeStr = uptime < 60000 ? `${Math.floor(uptime / 1000)}s`
    : uptime < 3600000 ? `${Math.floor(uptime / 60000)}m`
    : `${Math.floor(uptime / 3600000)}h${Math.floor((uptime % 3600000) / 60000)}m`;

  return {
    emotion: emotionalState.primaryEmotion,
    emotionEmoji: emotionToEmoji(emotionalState.primaryEmotion),
    cellCount: cells.length,
    cellTypes: [...new Set(cells.map(c => c.config.type))],
    goalCount: goals.length,
    goals: goals.map(g => g.description),
    episodeCount: memStats.totalEpisodes,
    shortTermMemory: memStats.shortTermCount,
    longTermMemory: memStats.longTermCount,
    uptime: uptimeStr,
    model: typeof llmDiag?.model === 'string' ? llmDiag.model : 'unknown',
    status,
  };
}

function emotionToEmoji(emotion: string): string {
  const map: Record<string, string> = {
    neutral: '😐', happy: '😊', sad: '😢', angry: '😠',
    fearful: '😨', surprised: '😮', disgusted: '🤢',
    curious: '🤔', excited: '🤩', calm: '😌',
  };
  return map[emotion] || '🎭';
}

/** 命令处理 */
async function handleCommand(input: string, agent: KillerAgent): Promise<string> {
  const parts = input.slice(1).split(' ');
  const cmd = parts[0].toLowerCase();
  const args = parts.slice(1).join(' ');

  switch (cmd) {
    case 'help': {
      return [
        '可用命令:',
        '  /status      — Agent 状态',
        '  /cells       — 活跃 Cells',
        '  /spawn       — 生成新 Cell',
        '  /goals       — 目标列表',
        '  /memory      — 记忆统计',
        '  /persona     — 人格信息',
        '  /emotions    — 情感状态',
        '  /narrative   — 自传记忆',
        '  /predictions — 用户预测模型',
        '  /dream       — 触发梦境',
        '  /think       — 深度思考',
        '  /evolve      — 达尔文进化',
        '  /delegate    — 多 Cell 委派',
        '  /diagnostics — 系统诊断',
        '  /find <词>   — 搜索历史消息',
        '  /retry       — 重发上一条消息',
        '  /clear       — 清空聊天记录',
        '  /health      — 健康报告',
        '  /metrics     — 性能指标',
        '  /sessions    — 会话列表',
        '  /save        — 保存会话',
        '  /load        — 加载会话',
        '  /key <key>   — 热更新 API Key',
        '  /approve <t> — 批准工具执行',
        '  /deny <t>    — 禁止工具执行',
        '  /model [n]   — 查看/切换模型',
        '  /mode [m]    — 权限策略 auto|confirm|deny',
        '  /learn       — 工具自创建说明',
        '  /unlearn <t> — 移除动态工具',
        '  /inspect     — 查看所有工具',
        '  /mission     — Cerebellum 任务管理',
        '  /exit        — 退出',
      ].join('\n');
    }
    case 'status': {
      const s = agent.getStatus();
      return `运行: ${s.running ? '✓' : '✗'} | 运行时间: ${Math.floor(s.uptime / 1000)}s`;
    }
    case 'cells': {
      const cells = agent.synapse.getAllCells();
      if (!cells.length) return '没有活跃的 Cells';
      return cells.map(c => `${box.v} ${c.id.id} (${c.config.type})`).join('\n');
    }
    case 'goals': {
      const goals = agent.getGoals();
      if (!goals.length) return '没有目标';
      return goals.map((g, i) => `${i + 1}. ${g.description}`).join('\n');
    }
    case 'memory': {
      const m = agent.getMemoryStats();
      return `Episodes: ${m.totalEpisodes} | Short: ${m.shortTermCount} | Long: ${m.longTermCount} | Associations: ${m.associationCount}`;
    }
    case 'emotions': {
      const e = agent.persona.emotionalState.getState();
      return `情感: ${emotionToEmoji(e.primaryEmotion)} ${e.primaryEmotion} (强度: ${e.intensity.toFixed(2)})`;
    }
    case 'persona': {
      const p = agent.getPersona();
      return `${p.name} | Traits: ${p.traits.join(', ') || 'none'}`;
    }
    case 'health': {
      const h = agent.healthMonitor.check();
      return `状态: ${h.status}`;
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
      const r = await agent.evolve();
      return `🧬 进化: ${r.mutations} mutations, ${r.successful} successful`;
    }
    case 'metrics': {
      const { MetricsCollector } = await import('../metrics/index.js');
      const metrics = MetricsCollector.getInstance();
      const report = metrics.healthCheck();
      return `LLM: ${report.llm.calls} calls, ${report.llm.errors} errors, avg ${report.llm.avgLatency}s`;
    }
    case 'model': {
      const current = agent.getModel();
      if (!args) return `Current: ${current}\nSwitch: /model <name>`;
      if (agent.setModel(args.trim())) {
        return `Model switched: ${current} → ${args.trim()}`;
      }
      return `Cannot switch model (provider does not support hot-swap). Current: ${current}`;
    }
    case 'mode': {
      const cur = agent.toolPermissions.getDefaultPolicy();
      if (!args) return `Permission mode: ${cur}\nSwitch: /mode auto | confirm | deny`;
      const mode = args.trim().toLowerCase();
      if (!['auto', 'confirm', 'deny'].includes(mode)) return 'Usage: /mode auto | confirm | deny';
      agent.toolPermissions.setDefaultPolicy(mode as 'auto' | 'confirm' | 'deny');
      return `Permission mode: ${cur} → ${mode}`;
    }
    case 'narrative': {
      const n = agent.hippocampus.getNarrative();
      const themes = n.activeThemes.length ? n.activeThemes.join(', ') : 'none';
      return `Chapters: ${n.chapters.length} | Themes: ${themes} | Identity: ${n.identityStatement || 'forming...'}`;
    }
    case 'predictions': {
      const p = agent.persona.getPredictions();
      const style = p.psychologicalProfile?.decisionStyle || 'unknown';
      const openness = (p.psychologicalProfile?.openness ?? 0).toFixed(2);
      return `Decision: ${style} | Openness: ${openness} | Needs: ${p.predictedNeeds?.length ?? 0}`;
    }
    case 'spawn': {
      const role = args || 'general';
      const id = await agent.spawnCellWithRole(role);
      return `Cell spawned: ${id} (${role})`;
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
        `Brainstem: ${s.modules.brainstem.phase} (loops: ${s.modules.brainstem.loopCount})`,
        `Hippocampus: ${s.modules.hippocampus.episodes} episodes`,
        `Synapse: ${s.modules.synapse.cells} cells`,
        `Health: ${h}`,
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
        const { Cerebellum } = await import('@killer/core');
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
        const dir = path.join(os.homedir(), '.killer');
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

/** 检测字符串是否像 API Key */
function looksLikeApiKey(s: string): boolean {
  if (s.startsWith('/') || s.length < 20 || s.length > 500) return false;
  if (s.startsWith('sk-') || s.startsWith('sk-ant-') || s.startsWith('sk-or-')) return true;
  if (s.startsWith('sk-cp-') || s.startsWith('sk-kimi') || s.startsWith('gsk_')) return true;
  if (s.startsWith('AIza')) return true;
  if (/^eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(s)) return true;
  return false;
}
