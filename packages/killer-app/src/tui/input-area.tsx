/**
 * Input Area — 用户输入区域
 *
 * 底部输入框，支持输入历史（↑↓）、命令补全和提交。
 * 处理中状态显示脉冲指示。
 * 输入 / 时显示命令面板。
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Box, Text, useInput, useStdout } from 'ink';
import TextInput from 'ink-text-input';
import { colors, box, statusDot, statusColor, spinners } from './theme.js';

const MAX_HISTORY = 200;

/** 命令分类 */
interface CommandEntry {
  name: string;
  description: string;
  category: 'core' | 'memory' | 'cognitive' | 'config' | 'system';
}

const COMMANDS: CommandEntry[] = [
  // Core
  { name: '/help', description: 'Show all commands', category: 'core' },
  { name: '/status', description: 'Agent status', category: 'core' },
  { name: '/clear', description: 'Clear chat', category: 'core' },
  { name: '/retry', description: 'Resend last message', category: 'core' },
  { name: '/find', description: 'Search messages', category: 'core' },
  // Memory
  { name: '/memory', description: 'Memory stats', category: 'memory' },
  { name: '/dream', description: 'Trigger dream cycle', category: 'memory' },
  { name: '/save', description: 'Save session', category: 'memory' },
  { name: '/load', description: 'Load session', category: 'memory' },
  { name: '/sessions', description: 'List sessions', category: 'memory' },
  // Cognitive
  { name: '/think', description: 'Deep reasoning', category: 'cognitive' },
  { name: '/evolve', description: 'Darwinian evolution', category: 'cognitive' },
  { name: '/goals', description: 'Active goals', category: 'cognitive' },
  { name: '/plan', description: 'Create a goal', category: 'cognitive' },
  { name: '/delegate', description: 'Multi-cell delegation', category: 'cognitive' },
  { name: '/cells', description: 'Active cells', category: 'cognitive' },
  { name: '/spawn', description: 'Spawn new cell', category: 'cognitive' },
  // Config
  { name: '/key', description: 'Update API key', category: 'config' },
  { name: '/model', description: 'Switch model', category: 'config' },
  { name: '/mode', description: 'Permission policy', category: 'config' },
  { name: '/approve', description: 'Approve tool', category: 'config' },
  { name: '/deny', description: 'Block tool', category: 'config' },
  { name: '/learn', description: 'Tool creation', category: 'config' },
  { name: '/unlearn', description: 'Remove tool', category: 'config' },
  { name: '/inspect', description: 'List all tools', category: 'config' },
  // System
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
  core: colors.primary,
  memory: colors.accent,
  cognitive: colors.warning,
  config: colors.info,
  system: colors.muted,
};

interface InputAreaProps {
  onSubmit: (value: string) => void;
  isProcessing: boolean;
  placeholder?: string;
}

export const InputArea = React.memo(function InputArea({ onSubmit, isProcessing, placeholder }: InputAreaProps) {
  const { stdout } = useStdout();
  const termCols = stdout?.columns ?? 80;
  const [value, setValue] = useState('');
  const historyRef = useRef<string[]>([]);
  const historyIdxRef = useRef(-1);
  const draftRef = useRef('');

  // Command palette state
  const [showPalette, setShowPalette] = useState(false);
  const [paletteFilter, setPaletteFilter] = useState('');

  // Update palette visibility when value changes
  useEffect(() => {
    const shouldShow = value.startsWith('/') && !value.includes(' ') && !isProcessing;
    setShowPalette(shouldShow);
    setPaletteFilter(shouldShow ? value.toLowerCase() : '');
  }, [value, isProcessing]);

  const handleSubmit = useCallback((val: string) => {
    const trimmed = val.trim();
    if (!trimmed || isProcessing) return;
    onSubmit(trimmed);
    historyRef.current = [trimmed, ...historyRef.current.slice(0, MAX_HISTORY - 1)];
    historyIdxRef.current = -1;
    draftRef.current = '';
    setValue('');
    setShowPalette(false);
  }, [onSubmit, isProcessing]);

  // ↑↓ 输入历史 + Tab 命令补全
  useInput((_input, key) => {
    if (isProcessing) return;
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
        if (common.length > prefix.length) {
          setValue(common);
        }
      }
      return;
    }
    const history = historyRef.current;
    if (key.upArrow) {
      if (history.length === 0) return;
      if (historyIdxRef.current === -1) {
        draftRef.current = value;
      }
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
        setValue(history[cur - 1]);
      }
    }
  });

  // Processing spinner animation + border pulse
  const [spinnerFrame, setSpinnerFrame] = useState(0);
  const [borderFrame, setBorderFrame] = useState(0);
  useEffect(() => {
    if (!isProcessing) return;
    const spinner = setInterval(() => setSpinnerFrame(f => (f + 1) % spinners.typing.length), 120);
    const pulse = setInterval(() => setBorderFrame(f => (f + 1) % 2), 800);
    return () => { clearInterval(spinner); clearInterval(pulse); };
  }, [isProcessing]);

  const borderColor = isProcessing
    ? (borderFrame === 0 ? colors.primary : colors.primaryDim)
    : colors.faint;

  // Filtered commands for palette
  const filteredCommands = showPalette
    ? COMMANDS.filter(c => c.name.toLowerCase().startsWith(paletteFilter))
    : [];

  return (
    <Box flexDirection="column">
      {/* Top separator */}
      <Box>
        <Text color={colors.dimmed}>{box.h.repeat(termCols)}</Text>
      </Box>

      {/* Command palette */}
      {showPalette && filteredCommands.length > 0 && (
        <Box flexDirection="column" marginBottom={0}>
          {filteredCommands.slice(0, 7).map((cmd, i) => {
            const catColor = CATEGORY_COLORS[cmd.category] || colors.dimmed;
            const isFirst = i === 0;
            return (
              <Box key={cmd.name}>
                {isFirst && <Text color={colors.primary} bold>{'› '}</Text>}
                {!isFirst && <Text color={colors.faint}>{'  '}</Text>}
                <Text color={isFirst ? colors.text : colors.dimmed} bold={isFirst}>
                  {cmd.name.padEnd(14)}
                </Text>
                <Text color={isFirst ? catColor : colors.faint}> {cmd.description}</Text>
              </Box>
            );
          })}
          {filteredCommands.length > 7 && (
            <Text color={colors.faint}>  … +{filteredCommands.length - 7}</Text>
          )}
        </Box>
      )}

      {/* Input box */}
      <Box borderStyle="round" borderColor={borderColor} paddingX={1}>
        <Text color={isProcessing ? statusColor.thinking : statusColor.idle}>
          {isProcessing ? spinners.typing[spinnerFrame] : statusDot.idle}{' '}
        </Text>
        {isProcessing ? (
          <Text color={colors.dimmed}>{placeholder || 'thinking...'}</Text>
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
      <Box marginLeft={1}>
        <Text color={colors.faint}>  ↑↓ history · Tab complete · Esc cancel · /help</Text>
      </Box>
    </Box>
  );
});
