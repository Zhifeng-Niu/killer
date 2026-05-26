/**
 * Input Area — 用户输入区域
 *
 * 底部输入框，支持输入历史（↑↓）、命令补全和提交。
 * 处理中状态显示脉冲指示。
 */

import React, { useState, useCallback, useRef } from 'react';
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';
import { colors, box, statusDot, statusColor } from './theme.js';

const MAX_HISTORY = 200;

const COMMANDS = [
  '/help', '/status', '/cells', '/spawn', '/goals', '/memory',
  '/persona', '/emotions', '/narrative', '/predictions',
  '/dream', '/think', '/evolve', '/delegate', '/diagnostics',
  '/health', '/metrics', '/sessions', '/save', '/load',
  '/mission', '/key', '/approve', '/deny',
  '/find', '/retry', '/clear',
  '/exit', '/quit',
];

interface InputAreaProps {
  onSubmit: (value: string) => void;
  isProcessing: boolean;
  placeholder?: string;
}

export function InputArea({ onSubmit, isProcessing, placeholder }: InputAreaProps) {
  const [value, setValue] = useState('');
  const historyRef = useRef<string[]>([]);
  const historyIdxRef = useRef(-1);
  const draftRef = useRef('');

  const handleSubmit = useCallback((val: string) => {
    const trimmed = val.trim();
    if (!trimmed || isProcessing) return;
    onSubmit(trimmed);
    historyRef.current = [trimmed, ...historyRef.current.slice(0, MAX_HISTORY - 1)];
    historyIdxRef.current = -1;
    draftRef.current = '';
    setValue('');
  }, [onSubmit, isProcessing]);

  // ↑↓ 输入历史 + Tab 命令补全
  useInput((_input, key) => {
    if (isProcessing) return;
    if (key.tab && value.startsWith('/') && !value.includes(' ')) {
      const prefix = value.toLowerCase();
      const matches = COMMANDS.filter(c => c.startsWith(prefix));
      if (matches.length === 1) {
        setValue(matches[0] + ' ');
        historyIdxRef.current = -1;
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

  const dot = isProcessing ? statusDot.thinking : statusDot.idle;
  const dotColor = isProcessing ? statusColor.thinking : statusColor.idle;

  return (
    <Box flexDirection="column">
      <Box borderStyle="round" borderColor={isProcessing ? colors.dimmed : colors.faint} paddingX={1}>
        <Text color={dotColor}>{dot} </Text>
        {isProcessing ? (
          <Text color={colors.dimmed}>{placeholder || 'waiting...'}</Text>
        ) : (
          <TextInput
            value={value}
            onChange={setValue}
            onSubmit={handleSubmit}
            placeholder="type a message or /help"
            showCursor={true}
          />
        )}
      </Box>
      <Box>
        <Text color={colors.dimmed}> /help · ↑↓ history · esc cancel · ctrl+c exit </Text>
      </Box>
    </Box>
  );
}
