/**
 * Sidebar — Agent 状态面板
 *
 * 极简设计：Unicode 分隔线，关键指标高亮。
 * 窄终端自动隐藏（< 80 列）。
 */

import React from 'react';
import { Box, Text } from 'ink';
import { colors, box, statusDot, statusColor } from './theme.js';

export interface SidebarData {
  emotion: string;
  emotionEmoji: string;
  cellCount: number;
  cellTypes: string[];
  goalCount: number;
  goals: string[];
  episodeCount: number;
  shortTermMemory: number;
  longTermMemory: number;
  uptime: string;
  model: string;
  status: 'idle' | 'thinking' | 'streaming' | 'error';
}

interface SidebarProps {
  data: SidebarData;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text color={colors.dimmed}>{box.hDot.repeat(22)}</Text>
      <Text color={colors.muted} bold> {title}</Text>
      <Box flexDirection="column" marginTop={0}>
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

export function Sidebar({ data }: SidebarProps) {
  const dot = statusDot[data.status];
  const dotColor = statusColor[data.status];
  const statusLabel = data.status === 'idle' ? 'idle'
    : data.status === 'thinking' ? 'thinking'
    : data.status === 'streaming' ? 'streaming'
    : 'error';

  return (
    <Box flexDirection="column" width={22} borderStyle="single" borderLeft={true} borderRight={false} borderTop={false} borderBottom={false} borderColor={colors.dimmed} paddingX={1}>
      {/* Status */}
      <Box marginBottom={1}>
        <Text color={dotColor}>{dot} </Text>
        <Text color={colors.text}>{statusLabel}</Text>
      </Box>

      <Section title="Agent">
        <Stat label="up" value={data.uptime} />
        <Stat label="model" value={data.model.length > 14 ? data.model.slice(0, 12) + '…' : data.model} color={colors.muted} />
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
        {data.goals.slice(0, 3).map((g, i) => (
          <Text key={i} color={colors.dimmed}>  {i + 1}. {g.slice(0, 16)}</Text>
        ))}
      </Section>
    </Box>
  );
}
