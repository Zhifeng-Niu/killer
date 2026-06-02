/**
 * Input Area — 状态栏 + 四态指示器
 *
 * 纯展示组件：动画、状态栏、状态指示文字。
 * 不使用 TextInput / useInput（避免 raw mode 与 IME 冲突导致 Terminal 崩溃）。
 * 实际输入由 readline 层在 tui/index.tsx 中管理，用户在终端原生提示符处输入。
 *
 * 空闲态：只显示状态栏
 * 思考态：边框呼吸 + 月相指示器
 * 流式态：波形指示器 + 工具状态
 * 错误态：红闪渐隐
 */

import React, { useState, useRef, useEffect } from 'react';
import { Box, Text, useStdout } from 'ink';
import {
  colors, borderFlowFrames, moonFrames, waveFrames24, contextBar, lerpColor,
} from './theme.js';

// ── 错误渐隐帧 — 红→灰 800ms ──

const errorFadeFrames = [
  colors.error,
  lerpColor(colors.error, colors.border, 0.25),
  lerpColor(colors.error, colors.border, 0.5),
  lerpColor(colors.error, colors.border, 0.75),
  colors.border,
] as const;

// ── Props ──

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
}

// ── 组件 ──

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
}: InputAreaProps) {
  const { stdout } = useStdout();

  // ── 动画帧 ──
  const [borderFrame, setBorderFrame] = useState(0);
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
      timers.push(setInterval(() => setBorderFrame(f => (f + 1) % borderFlowFrames.length), 200));
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

  // 左侧指示器
  const indicator = agentStatus === 'thinking'
    ? moonFrames[indicatorFrame]
    : agentStatus === 'streaming'
      ? waveFrames24[indicatorFrame]
      : '';

  const indicatorColor = (agentStatus === 'thinking' || agentStatus === 'streaming')
    ? colors.purple
    : colors.secondary;

  // 状态文字
  const statusText = agentStatus === 'streaming' && statusDetail
    ? statusDetail.length > 50 ? statusDetail.slice(0, 48) + '…' : statusDetail
    : agentStatus === 'thinking'
      ? 'thinking...'
      : '';

  // ── 状态栏数据 ──
  const ctxRatio = contextTotal > 0 ? contextUsed / contextTotal : 0;
  const ctxColor = ctxRatio > 0.8 ? colors.pink : ctxRatio > 0.5 ? colors.amber : colors.purple;
  const ctxSegments = contextBar(contextUsed, contextTotal, 12);
  const modelShort = model.length > 18 ? model.slice(0, 16) + '…' : model;

  return (
    <Box flexDirection="column">
      {/* 状态栏 — 模型 · 动效 · 时间 · context · 核心状态 */}
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

      {/* 非空闲时的状态提示行 */}
      {agentStatus !== 'idle' && (
        <Box borderStyle="round" borderColor={isFlashingError ? errorFadeFrames[errorFrame] : colors.border} paddingX={1}>
          <Text color={indicatorColor}>{indicator} </Text>
          <Text color={colors.secondary}>{statusText}</Text>
        </Box>
      )}
    </Box>
  );
});
