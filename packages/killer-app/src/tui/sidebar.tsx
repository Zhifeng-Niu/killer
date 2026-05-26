/**
 * Sidebar — Agent 状态面板
 *
 * 显示情感、Cell、Memory、Goals 等实时状态信息。
 */

import React from 'react';
import { Box, Text } from 'ink';
import { colors, icons } from './theme.js';

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

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <Box>
      <Text color={colors.dimmed}>── </Text>
      <Text color={colors.primary} bold>{children}</Text>
      <Text color={colors.dimmed}> ──</Text>
    </Box>
  );
}

export function Sidebar({ data }: SidebarProps) {
  const statusColor = data.status === 'idle' ? colors.accent
    : data.status === 'thinking' ? colors.warning
    : data.status === 'error' ? colors.error
    : colors.primary;

  const statusLabel = data.status === 'idle' ? '空闲'
    : data.status === 'thinking' ? '思考中'
    : data.status === 'streaming' ? '输出中'
    : '错误';

  return (
    <Box flexDirection="column" width={24} borderStyle="single" borderLeft={false} borderTop={false} borderBottom={false} borderColor={colors.dimmed} paddingX={1}>
      <Box marginBottom={1}>
        <Text color={statusColor}>● </Text>
        <Text color={colors.text} bold>{statusLabel}</Text>
      </Box>

      <SectionTitle>Agent</SectionTitle>
      <Box flexDirection="column" marginBottom={1}>
        <Text color={colors.muted}>  {icons.emotion} {data.emotionEmoji} {data.emotion}</Text>
        <Text color={colors.muted}>  ⏱ {data.uptime}</Text>
        <Text color={colors.muted}>  🔧 {data.model.length > 18 ? data.model.slice(0, 16) + '…' : data.model}</Text>
      </Box>

      <SectionTitle>Cells</SectionTitle>
      <Box flexDirection="column" marginBottom={1}>
        <Text color={colors.muted}>  {icons.cell} {data.cellCount} 个活跃</Text>
        {data.cellTypes.slice(0, 4).map((ct, i) => (
          <Text key={i} color={colors.dimmed}>    · {ct}</Text>
        ))}
      </Box>

      <SectionTitle>Memory</SectionTitle>
      <Box flexDirection="column" marginBottom={1}>
        <Text color={colors.muted}>  {icons.memory} {data.episodeCount} episodes</Text>
        <Text color={colors.dimmed}>    {data.shortTermMemory} short · {data.longTermMemory} long</Text>
      </Box>

      <SectionTitle>Goals</SectionTitle>
      <Box flexDirection="column">
        <Text color={colors.muted}>  {icons.goal} {data.goalCount} 个目标</Text>
        {data.goals.slice(0, 3).map((g, i) => (
          <Text key={i} color={colors.dimmed}>    {i + 1}. {g.slice(0, 18)}</Text>
        ))}
      </Box>
    </Box>
  );
}
