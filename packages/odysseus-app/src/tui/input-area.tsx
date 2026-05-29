/**
 * Input Area — 四态输入框 + 上下文进度条
 *
 * 渲染树最后一个子元素，自然沉在终端底部。
 * 状态表达全在组件内部——不是独立层，是对话流的终点。
 *
 * 空闲态：深灰边框 #45475A，左侧 ●
 * 思考态：边框呼吸灰→紫 800ms，左侧月相 ◐◓◑◒ 150ms
 * 流式态：左侧波形 ▊▋▊▌ 100ms，placeholder 显示工具名
 * 错误态：边框红闪 #FC5C7C 然后 800ms 渐暗
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Box, Text, useInput, useStdout } from 'ink';
import TextInput from 'ink-text-input';
import {
  colors, breathFrames, moonFrames, waveFrames, contextBar, formatTokens, lerpColor,
} from './theme.js';

const MAX_HISTORY = 200;

// ── 错误渐隐帧 — 红→灰 800ms ──

const errorFadeFrames = [
  colors.error,
  lerpColor(colors.error, colors.border, 0.25),
  lerpColor(colors.error, colors.border, 0.5),
  lerpColor(colors.error, colors.border, 0.75),
  colors.border,
] as const;

// ── 命令面板 ──

interface CommandEntry {
  name: string;
  description: string;
  category: 'core' | 'memory' | 'cognitive' | 'config' | 'system';
}

const COMMANDS: CommandEntry[] = [
  { name: '/help', description: 'Show all commands', category: 'core' },
  { name: '/status', description: 'Agent status', category: 'core' },
  { name: '/clear', description: 'Clear chat', category: 'core' },
  { name: '/retry', description: 'Resend last message', category: 'core' },
  { name: '/find', description: 'Search messages', category: 'core' },
  { name: '/memory', description: 'Memory stats', category: 'memory' },
  { name: '/dream', description: 'Trigger dream cycle', category: 'memory' },
  { name: '/save', description: 'Save session', category: 'memory' },
  { name: '/load', description: 'Load session', category: 'memory' },
  { name: '/sessions', description: 'List sessions', category: 'memory' },
  { name: '/think', description: 'Deep reasoning', category: 'cognitive' },
  { name: '/evolve', description: 'Darwinian evolution', category: 'cognitive' },
  { name: '/goals', description: 'Active goals', category: 'cognitive' },
  { name: '/plan', description: 'Create a goal', category: 'cognitive' },
  { name: '/delegate', description: 'Multi-cell delegation', category: 'cognitive' },
  { name: '/cells', description: 'Active cells', category: 'cognitive' },
  { name: '/spawn', description: 'Spawn new column', category: 'cognitive' },
  { name: '/key', description: 'Update API key', category: 'config' },
  { name: '/model', description: 'Switch model', category: 'config' },
  { name: '/mode', description: 'Permission policy', category: 'config' },
  { name: '/approve', description: 'Approve tool', category: 'config' },
  { name: '/deny', description: 'Block tool', category: 'config' },
  { name: '/learn', description: 'Tool creation', category: 'config' },
  { name: '/unlearn', description: 'Remove tool', category: 'config' },
  { name: '/inspect', description: 'List all tools', category: 'config' },
  { name: '/health', description: 'Health report', category: 'system' },
  { name: '/diagnostics', description: 'System diagnostics', category: 'system' },
  { name: '/metrics', description: 'Performance stats', category: 'system' },
  { name: '/persona', description: 'Persona info', category: 'system' },
  { name: '/emotions', description: 'Emotional state', category: 'system' },
  { name: '/narrative', description: 'Autobiographical memory', category: 'system' },
  { name: '/predictions', description: 'User model', category: 'system' },
  { name: '/mission', description: 'Mission control', category: 'system' },
  { name: '/exit', description: 'Quit', category: 'system' },
];

const COMMAND_NAMES = COMMANDS.map(c => c.name);

const CATEGORY_COLORS: Record<string, string> = {
  core: colors.purple,
  memory: colors.cyan,
  cognitive: colors.gold,
  config: colors.purpleBright,
  system: colors.secondary,
};

// ── Props ──

interface InputAreaProps {
  onSubmit: (value: string) => void;
  agentStatus: 'idle' | 'thinking' | 'streaming' | 'error';
  statusDetail?: string;
  contextUsed?: number;
  contextTotal?: number;
}

// ── 组件 ──

export const InputArea = React.memo(function InputArea({
  onSubmit,
  agentStatus,
  statusDetail,
  contextUsed = 0,
  contextTotal = 128000,
}: InputAreaProps) {
  const { stdout } = useStdout();
  const termCols = stdout?.columns ?? 80;
  const [value, setValue] = useState('');
  const historyRef = useRef<string[]>([]);
  const historyIdxRef = useRef(-1);
  const draftRef = useRef('');

  // 命令面板
  const [showPalette, setShowPalette] = useState(false);
  const [paletteFilter, setPaletteFilter] = useState('');

  useEffect(() => {
    const shouldShow = value.startsWith('/') && !value.includes(' ') && agentStatus === 'idle';
    setShowPalette(shouldShow);
    setPaletteFilter(shouldShow ? value.toLowerCase() : '');
  }, [value, agentStatus]);

  // ── 动画帧 ──
  const [borderFrame, setBorderFrame] = useState(0);
  const [indicatorFrame, setIndicatorFrame] = useState(0);
  const [errorFrame, setErrorFrame] = useState(0);
  const [isFlashingError, setIsFlashingError] = useState(false);
  const prevStatusRef = useRef(agentStatus);

  useEffect(() => {
    // 检测错误状态进入
    if (agentStatus === 'error' && prevStatusRef.current !== 'error') {
      setIsFlashingError(true);
      setErrorFrame(0);
    }
    prevStatusRef.current = agentStatus;
  }, [agentStatus]);

  useEffect(() => {
    const timers: ReturnType<typeof setInterval>[] = [];

    if (agentStatus === 'thinking') {
      timers.push(setInterval(() => setBorderFrame(f => (f + 1) % breathFrames.length), 200));
      timers.push(setInterval(() => setIndicatorFrame(f => (f + 1) % moonFrames.length), 150));
    } else if (agentStatus === 'streaming') {
      timers.push(setInterval(() => setIndicatorFrame(f => (f + 1) % waveFrames.length), 100));
    }

    if (isFlashingError) {
      timers.push(setInterval(() => {
        setErrorFrame(f => {
          if (f >= errorFadeFrames.length - 1) {
            setIsFlashingError(false);
            return 0;
          }
          return f + 1;
        });
      }, 200));
    }

    return () => timers.forEach(clearInterval);
  }, [agentStatus, isFlashingError]);

  // 边框颜色
  const borderColor = isFlashingError
    ? errorFadeFrames[errorFrame]
    : agentStatus === 'thinking'
      ? breathFrames[borderFrame]
      : colors.border;

  // 左侧指示器
  const indicator = agentStatus === 'thinking'
    ? moonFrames[indicatorFrame]
    : agentStatus === 'streaming'
      ? waveFrames[indicatorFrame]
      : '●';

  const indicatorColor = (agentStatus === 'thinking' || agentStatus === 'streaming')
    ? colors.purple
    : colors.secondary;

  // ── 提交 ──
  const handleSubmit = useCallback((val: string) => {
    const trimmed = val.trim();
    if (!trimmed || agentStatus !== 'idle') return;
    onSubmit(trimmed);
    historyRef.current = [trimmed, ...historyRef.current.slice(0, MAX_HISTORY - 1)];
    historyIdxRef.current = -1;
    draftRef.current = '';
    setValue('');
    setShowPalette(false);
  }, [onSubmit, agentStatus]);

  // ── ↑↓ 历史 + Tab 补全 ──
  useInput((_input, key) => {
    if (agentStatus !== 'idle') return;
    if (key.tab && value.startsWith('/') && !value.includes(' ')) {
      const prefix = value.toLowerCase();
      const matches = COMMAND_NAMES.filter(c => c.startsWith(prefix));
      if (matches.length === 1) {
        setValue(matches[0] + ' ');
        historyIdxRef.current = -1;
        setShowPalette(false);
      } else if (matches.length > 1) {
        const common = matches.reduce((a, b) => {
          let i = 0;
          while (i < a.length && i < b.length && a[i] === b[i]) i++;
          return a.slice(0, i);
        });
        if (common.length > prefix.length) setValue(common);
      }
      return;
    }
    if (key.upArrow) {
      const history = historyRef.current;
      if (history.length === 0) return;
      if (historyIdxRef.current === -1) draftRef.current = value;
      const next = Math.min(historyIdxRef.current + 1, history.length - 1);
      historyIdxRef.current = next;
      setValue(history[next]);
      setShowPalette(false);
    } else if (key.downArrow) {
      const cur = historyIdxRef.current;
      if (cur <= 0) {
        historyIdxRef.current = -1;
        setValue(draftRef.current);
      } else {
        historyIdxRef.current = cur - 1;
        setValue(historyRef.current[cur - 1]);
      }
    }
  });

  // ── 上下文进度条 ──
  const ctxRatio = contextTotal > 0 ? contextUsed / contextTotal : 0;
  const barWidth = Math.max(termCols - 24, 10);
  const ctxSegments = contextBar(contextUsed, contextTotal, barWidth);
  const ctxColor = ctxRatio > 0.8 ? colors.pink
    : ctxRatio > 0.5 ? colors.amber
    : colors.secondary;

  // ── 命令面板过滤 ──
  const filteredCommands = showPalette
    ? COMMANDS.filter(c => c.name.toLowerCase().startsWith(paletteFilter))
    : [];

  // placeholder
  const placeholderText = agentStatus === 'streaming' && statusDetail
    ? statusDetail.length > 40 ? statusDetail.slice(0, 38) + '…' : statusDetail
    : agentStatus === 'thinking'
      ? 'thinking...'
      : 'ask me anything...';

  return (
    <Box flexDirection="column">
      {/* 上下文进度条 — 输入栏上方一行 */}
      <Box marginLeft={1}>
        <Text color={colors.separator}>ctx </Text>
        {ctxSegments.map((seg, i) => (
          <Text key={i} color={seg.color}>{seg.char}</Text>
        ))}
        <Text color={ctxColor}> {formatTokens(contextUsed)}/{formatTokens(contextTotal)}</Text>
      </Box>

      {/* 命令面板 */}
      {showPalette && filteredCommands.length > 0 && (
        <Box flexDirection="column">
          {filteredCommands.slice(0, 7).map((cmd, i) => {
            const catColor = CATEGORY_COLORS[cmd.category] || colors.separator;
            const isFirst = i === 0;
            return (
              <Box key={cmd.name}>
                {isFirst && <Text color={colors.purple}>{'› '}</Text>}
                {!isFirst && <Text color={colors.bg}>{'  '}</Text>}
                <Text color={isFirst ? colors.text : colors.secondary} bold={isFirst}>
                  {cmd.name.padEnd(14)}
                </Text>
                <Text color={isFirst ? catColor : colors.separator}> {cmd.description}</Text>
              </Box>
            );
          })}
          {filteredCommands.length > 7 && (
            <Text color={colors.bg}>  … +{filteredCommands.length - 7}</Text>
          )}
        </Box>
      )}

      {/* 输入框 */}
      <Box borderStyle="round" borderColor={borderColor} paddingX={1}>
        <Text color={indicatorColor}>{indicator} </Text>
        {agentStatus !== 'idle' ? (
          <Text color={colors.secondary}>{placeholderText}</Text>
        ) : (
          <TextInput
            value={value}
            onChange={setValue}
            onSubmit={handleSubmit}
            placeholder="ask me anything..."
            showCursor={true}
          />
        )}
      </Box>

      {/* 键盘提示 */}
      <Box marginLeft={1}>
        <Text color={colors.separator}>  ↑↓ history · Tab complete · Esc cancel · /help</Text>
      </Box>
    </Box>
  );
});
