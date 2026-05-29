/**
 * Status Bar — 底部固定状态行
 *
 * 放在 InputArea 上方，终端底部稳定区。
 * 紧凑一行：emoji + 模型 · 运行时间 · 消息数
 * 不抢视觉焦点，但始终可见。
 */

import React, { useState, useEffect } from 'react';
import { Box, Text, useStdout } from 'ink';
import { colors, box, formatDuration } from './theme.js';

interface HeaderProps {
  model: string;
  emotion: string;
  uptime: number;
  messageCount: number;
}

function emotionToEmoji(emotion: string): string {
  const map: Record<string, string> = {
    neutral: '·', happy: '·', sad: '·', angry: '·',
    fear: '·', fearful: '·', surprised: '·', disgusted: '·',
    curious: '~', excited: '~', calm: '~',
    joy: '~', contentment: '~', anxiety: '~',
    sadness: '·', surprise: '~', anticipation: '~',
  };
  return map[emotion.toLowerCase()] || '·';
}

export const Header = React.memo(function Header({
  model,
  emotion,
  uptime,
  messageCount,
}: HeaderProps) {
  const { stdout } = useStdout();
  const termCols = stdout?.columns ?? 80;
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => setTick(t => t + 1), 30000);
    return () => clearInterval(timer);
  }, []);

  const modelShort = model.length > 24 ? model.slice(0, 22) + '…' : model;
  const uptimeStr = formatDuration(uptime);
  const mood = emotionToEmoji(emotion);

  // 左侧：模型 + 情感
  // 右侧：时间 + 消息数
  const left = `${mood} ${modelShort}`;
  const right = `${uptimeStr} · ${messageCount}`;
  const gap = Math.max(1, termCols - left.length - right.length - 4);

  return (
    <Box marginLeft={1}>
      <Text color={colors.purple}>{left}</Text>
      <Text color={colors.separator}>{' '.repeat(gap)}</Text>
      <Text color={colors.secondary}>{right}</Text>
    </Box>
  );
});
