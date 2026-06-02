/**
 * Status Bar — 底部固定状态行
 *
 * 放在 InputArea 上方，终端底部稳定区。
 * 自管理 30s tick，不触发父组件重渲染。
 */

import React, { useState, useEffect } from 'react';
import { Box, Text, useStdout } from 'ink';
import { colors, formatDuration } from './theme.js';
import type { OdysseusAgent } from '../orchestrator/agent.js';

interface HeaderProps {
  model: string;
  agent: OdysseusAgent;
  bootTime: number;
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
  agent,
  bootTime,
  messageCount,
}: HeaderProps) {
  const { stdout } = useStdout();
  const termCols = stdout?.columns ?? 80;
  const [tick, setTick] = useState(0);

  // 自管理 30s tick：更新 emotion + uptime，不触发父组件
  useEffect(() => {
    const timer = setInterval(() => setTick(t => t + 1), 30000);
    return () => clearInterval(timer);
  }, []);

  let emotion = 'neutral';
  try {
    emotion = agent.persona.emotionalState.getState().primaryEmotion;
  } catch { /* boot 期间 persona 可能未就绪 */ }

  const modelShort = model.length > 24 ? model.slice(0, 22) + '…' : model;
  const uptimeStr = formatDuration(Date.now() - bootTime);
  const mood = emotionToEmoji(emotion);

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
