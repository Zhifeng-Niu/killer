/**
 * Input Area — 分隔线 + 状态栏 + 输入行
 *
 * idle: ▸ text█  — 可见输入行，紫色 prompt + 块状光标
 * busy: ◐ thinking... — 动画指示器
 */

import React, { useState, useRef, useEffect } from 'react';
import { Box, Text, useStdout } from 'ink';
import {
  colors, moonFrames, waveFrames24, contextBar, lerpColor,
} from './theme.js';

const errorFadeFrames = [
  colors.error,
  lerpColor(colors.error, colors.border, 0.25),
  lerpColor(colors.error, colors.border, 0.5),
  lerpColor(colors.error, colors.border, 0.75),
  colors.border,
] as const;

interface InputAreaProps {
  agentStatus: 'idle' | 'thinking' | 'streaming' | 'error';
  statusDetail?: string;
  contextUsed?: number;
  contextTotal?: number;
  model?: string;
  uptime?: string;
  messageCount?: number;
  cellsCount?: number;
  goalsCount?: number;
  episodesCount?: number;
  toolsCount?: number;
  emotion?: string;
  inputText?: string;
  cursorPos?: number;
}

export const InputArea = React.memo(function InputArea({
  agentStatus,
  statusDetail,
  contextUsed = 0,
  contextTotal = 128000,
  model = '',
  uptime = '',
  messageCount = 0,
  cellsCount = 0,
  goalsCount = 0,
  episodesCount = 0,
  toolsCount = 0,
  emotion = '',
  inputText = '',
  cursorPos = 0,
}: InputAreaProps) {
  const { stdout } = useStdout();
  const termCols = stdout?.columns ?? 80;

  // ── 动画帧 ──
  const [indicatorFrame, setIndicatorFrame] = useState(0);
  const [errorFrame, setErrorFrame] = useState(0);
  const [isFlashingError, setIsFlashingError] = useState(false);
  const prevStatusRef = useRef(agentStatus);

  useEffect(() => {
    if (agentStatus === 'error' && prevStatusRef.current !== 'error') {
      setIsFlashingError(true);
      setErrorFrame(0);
    }
    prevStatusRef.current = agentStatus;
  }, [agentStatus]);

  useEffect(() => {
    const timers: ReturnType<typeof setInterval>[] = [];

    if (agentStatus === 'thinking') {
      timers.push(setInterval(() => setIndicatorFrame(f => (f + 1) % moonFrames.length), 200));
    } else if (agentStatus === 'streaming') {
      timers.push(setInterval(() => setIndicatorFrame(f => (f + 1) % waveFrames24.length), 200));
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

  // ── 状态栏数据 ──
  const ctxRatio = contextTotal > 0 ? contextUsed / contextTotal : 0;
  const ctxColor = ctxRatio > 0.8 ? colors.pink : ctxRatio > 0.5 ? colors.amber : colors.purple;
  const ctxSegments = contextBar(contextUsed, contextTotal, 12);
  const modelShort = model.length > 18 ? model.slice(0, 16) + '…' : model;

  // ── 指示器 ──
  const indicator = agentStatus === 'thinking'
    ? moonFrames[indicatorFrame]
    : agentStatus === 'streaming'
      ? waveFrames24[indicatorFrame]
      : '';

  const indicatorColor = (agentStatus === 'thinking' || agentStatus === 'streaming')
    ? colors.purple
    : colors.secondary;

  const statusText = agentStatus === 'streaming' && statusDetail
    ? statusDetail.length > 50 ? statusDetail.slice(0, 48) + '…' : statusDetail
    : agentStatus === 'thinking'
      ? 'thinking...'
      : agentStatus === 'error'
        ? statusDetail || 'error'
        : '';

  // ── 光标渲染 ──
  const safePos = Math.min(cursorPos, inputText.length);
  const beforeCursor = inputText.slice(0, safePos);
  const charAtCursor = inputText[safePos] || ' ';
  const afterCursor = inputText.slice(safePos + 1);

  return (
    <Box flexDirection="column">
      {/* 分隔线 */}
      <Text color={colors.separator}>{'─'.repeat(Math.min(termCols, 120))}</Text>

      {/* 状态栏 */}
      <Box marginLeft={1}>
        <Text color={colors.purple}>◈ </Text>
        <Text color={colors.purpleBright}>{modelShort}</Text>
        <Text color={colors.separator}> · </Text>
        {(agentStatus === 'thinking' || agentStatus === 'streaming') ? (
          <Text color={colors.purple}>{indicator} </Text>
        ) : (
          <Text color={colors.secondary}>· </Text>
        )}
        <Text color={colors.secondary}>{uptime || '0s'}</Text>
        <Text color={colors.separator}> · </Text>
        {ctxSegments.map((seg, i) => (
          <Text key={i} color={seg.color}>{seg.char}</Text>
        ))}
        <Text color={ctxColor}> {Math.round(ctxRatio * 100)}%</Text>
        <Text color={colors.separator}> · </Text>
        <Text color={colors.secondary}>{messageCount}msg</Text>
        {cellsCount > 0 && (<><Text color={colors.separator}> · </Text><Text color={colors.cyan}>{cellsCount}cell</Text></>)}
        {goalsCount > 0 && (<><Text color={colors.separator}> · </Text><Text color={colors.gold}>{goalsCount}goal</Text></>)}
        {episodesCount > 0 && (<><Text color={colors.separator}> · </Text><Text color={colors.secondary}>{episodesCount}ep</Text></>)}
        {toolsCount > 0 && (<><Text color={colors.separator}> · </Text><Text color={colors.secondary}>{toolsCount}tool</Text></>)}
        {emotion && (<><Text color={colors.separator}> </Text><Text>{emotion}</Text></>)}
      </Box>

      {/* 输入行或状态指示器 */}
      {agentStatus === 'idle' ? (
        <Box marginLeft={1}>
          <Text color={colors.purple}>▸ </Text>
          <Text>{beforeCursor}</Text>
          <Text backgroundColor={colors.purple} color={colors.bg}>{charAtCursor}</Text>
          <Text>{afterCursor}</Text>
        </Box>
      ) : (
        <Box marginLeft={1}>
          <Text color={indicatorColor}>{indicator} </Text>
          <Text color={colors.secondary}>{statusText}</Text>
        </Box>
      )}
    </Box>
  );
});
