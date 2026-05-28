/**
 * Sidebar — Agent 状态面板
 *
 * 生产级设计：连接状态灯、速度指示器、目标进度条。
 * 窄终端自动隐藏（< 80 列）。
 */

import React, { useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import { colors, box, statusDot, statusColor, spinners } from './theme.js';

export interface SidebarData {
  emotion: string;
  emotionEmoji: string;
  cellCount: number;
  cellTypes: string[];
  goalCount: number;
  goals: string[];
  goalProgress: Array<{ description: string; completed: number; total: number }>;
  episodeCount: number;
  shortTermMemory: number;
  longTermMemory: number;
  uptime: string;
  model: string;
  status: 'idle' | 'thinking' | 'streaming' | 'error';
  circuitState: 'closed' | 'open' | 'half-open';
  messagesCount: number;
}

interface SidebarProps {
  data: SidebarData;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Box flexDirection="column" marginTop={1}>
      <Text color={colors.primaryDim}>{box.hBold}</Text>
      <Text color={colors.muted} bold> {title}</Text>
      <Box flexDirection="column">
        {children}
      </Box>
    </Box>
  );
}

function Stat({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return (
    <Box>
      <Text color={colors.dimmed}>  {label}</Text>
      <Text color={color || colors.text}> {value}</Text>
    </Box>
  );
}

/** 进度条 — Unicode 方块 */
function ProgressBar({ completed, total, width = 14 }: { completed: number; total: number; width?: number }) {
  if (total === 0) return <Text color={colors.dimmed}>  ──</Text>;
  const pct = completed / total;
  const filled = Math.round(pct * width);
  const empty = width - filled;
  const bar = '█'.repeat(filled) + '░'.repeat(empty);
  const pctStr = `${Math.round(pct * 100)}%`;
  return (
    <Box>
      <Text color={colors.accent}>{bar}</Text>
      <Text color={colors.dimmed}> {pctStr}</Text>
    </Box>
  );
}

/** 连接状态指示灯 */
function ConnectionIndicator({ circuitState }: { circuitState: string }) {
  if (circuitState === 'open') {
    return (
      <Box>
        <Text color={colors.error}>● </Text>
        <Text color={colors.error}>offline</Text>
      </Box>
    );
  }
  if (circuitState === 'half-open') {
    return (
      <Box>
        <Text color={colors.warning}>◐ </Text>
        <Text color={colors.warning}>retrying</Text>
      </Box>
    );
  }
  return (
    <Box>
      <Text color={colors.accent}>● </Text>
      <Text color={colors.dimmed}>online</Text>
    </Box>
  );
}

export const Sidebar = React.memo(function Sidebar({ data }: SidebarProps) {
  const dot = statusDot[data.status];
  const dotColor = statusColor[data.status];
  const statusLabel = data.status === 'idle' ? 'ready'
    : data.status === 'thinking' ? 'thinking'
    : data.status === 'streaming' ? 'streaming'
    : 'error';

  // Status spinner animation — orbit spinner for active states
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    if (data.status === 'idle') {
      setFrame(0);
      return;
    }
    const timer = setInterval(() => setFrame(f => (f + 1) % spinners.pulse.length), 100);
    return () => clearInterval(timer);
  }, [data.status]);

  // Circuit breaker overrides status color
  const statusOverrideColor = data.circuitState === 'open' ? colors.error
    : data.circuitState === 'half-open' ? colors.warning : null;

  return (
    <Box flexDirection="column" width={24} borderStyle="single" borderLeft={true} borderRight={false} borderTop={false} borderBottom={false} borderColor={colors.dimmed} paddingX={1}>
      {/* Connection status */}
      <Box marginBottom={1}>
        <ConnectionIndicator circuitState={data.circuitState} />
      </Box>

      {/* Status */}
      <Box marginBottom={1}>
        {data.status !== 'idle' ? (
          <Text color={statusOverrideColor || dotColor}>{spinners.pulse[frame]} </Text>
        ) : (
          <Text color={statusOverrideColor || dotColor}>{dot} </Text>
        )}
        <Text color={colors.text}>{statusLabel}</Text>
      </Box>

      <Section title="Agent">
        <Stat label="up" value={data.uptime} />
        <Stat label="model" value={data.model.length > 14 ? data.model.slice(0, 12) + '…' : data.model} color={colors.muted} />
        <Stat label="msgs" value={data.messagesCount} />
        <Stat label="mood" value={`${data.emotionEmoji} ${data.emotion.length > 10 ? data.emotion.slice(0, 8) + '…' : data.emotion}`} color={colors.muted} />
      </Section>

      <Section title="Cells">
        <Stat label="active" value={data.cellCount} color={data.cellCount > 0 ? colors.accent : colors.dimmed} />
        {data.cellTypes.slice(0, 3).map((ct, i) => (
          <Text key={i} color={colors.dimmed}>    {box.v} {ct}</Text>
        ))}
      </Section>

      <Section title="Memory">
        <Stat label="episodes" value={data.episodeCount} />
        <Text color={colors.dimmed}>    {data.shortTermMemory} short · {data.longTermMemory} long</Text>
      </Section>

      <Section title="Goals">
        <Stat label="active" value={data.goalCount} color={data.goalCount > 0 ? colors.accent : colors.dimmed} />
        {data.goalProgress.slice(0, 3).map((g, i) => (
          <Box key={i} flexDirection="column">
            <Text color={colors.muted}>  {g.description.slice(0, 18)}</Text>
            <Box marginLeft={2}>
              <ProgressBar completed={g.completed} total={g.total} />
            </Box>
          </Box>
        ))}
      </Section>

      {/* Footer hint */}
      <Box marginTop={1}>
        <Text color={colors.faint}>  Tab · /help · /think</Text>
      </Box>
    </Box>
  );
});
