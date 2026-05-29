/**
 * Header Bar — 持久品牌状态栏
 *
 * 终端第一行。视觉锚点：模型名 + 情感 emoji + 运行时间 + 消息数。
 * Z 世代表达：用 Unicode 方块模拟渐变 brand bar，色彩大胆但克制。
 */

import React, { useState, useEffect } from 'react';
import { Box, Text, useStdout } from 'ink';
import { colors, box, formatTokens, lerpColor } from './theme.js';

interface HeaderProps {
  model: string;
  emotion: string;
  uptime: number;
  messageCount: number;
  provider?: string;
}

// ── 渐变 brand bar — 用密度模拟 5 色渐变 ──

function GradientBar({ width }: { width: number }) {
  // 紫 → 亮紫 → 电子青 → 亮紫 → 紫 的镜像渐变
  const stops = [
    colors.purpleDim,    // #5A3ED8
    colors.purple,       // #7C5CFC
    colors.purpleBright, // #9D8AFF
    colors.cyan,         // #22D3EE (点缀)
    colors.purpleBright,
    colors.purple,
    colors.purpleDim,
  ];
  const segWidth = Math.max(1, Math.floor(width / stops.length));
  const remainder = width - segWidth * stops.length;

  return (
    <Box>
      {stops.map((color, i) => {
        const w = segWidth + (i < remainder ? 1 : 0);
        return <Text key={`g${i}`} color={color}>{'█'.repeat(w)}</Text>;
      })}
    </Box>
  );
}

// ── 情感 emoji 映射 ──

function emotionToEmoji(emotion: string): string {
  const map: Record<string, string> = {
    neutral: '😐', happy: '😊', sad: '😢', angry: '😠',
    fear: '😨', fearful: '😨', surprised: '😮', disgusted: '🤢',
    curious: '🤔', excited: '🤩', calm: '😌',
    joy: '😊', contentment: '😌', anxiety: '😰',
    sadness: '😢', surprise: '😮', anticipation: '🤔',
  };
  return map[emotion.toLowerCase()] || '🎭';
}

// ── 格式化运行时间 ──

function formatUptime(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m${s % 60}s`;
  const h = Math.floor(m / 60);
  return `${h}h${m % 60}m`;
}

// ── Provider 友好名 ──

function friendlyProvider(provider?: string): string {
  if (!provider) return '';
  const names: Record<string, string> = {
    deepseek: 'DeepSeek',
    glm: 'GLM',
    minimax: 'MiniMax',
    qwen: 'Qwen',
    moonshot: 'Kimi',
    anthropic: 'Claude',
    openai: 'GPT',
    openrouter: 'OpenRouter',
    gemini: 'Gemini',
    mock: 'Demo',
  };
  return names[provider] || provider;
}

// ── 组件 ──

export const Header = React.memo(function Header({
  model,
  emotion,
  uptime,
  messageCount,
  provider,
}: HeaderProps) {
  const { stdout } = useStdout();
  const termCols = stdout?.columns ?? 80;
  const [tick, setTick] = useState(0);

  // 每 30s 更新运行时间显示
  useEffect(() => {
    const timer = setInterval(() => setTick(t => t + 1), 30000);
    return () => clearInterval(timer);
  }, []);

  // 品牌 bar 宽度 = 终端宽度
  const barWidth = Math.max(termCols, 20);

  // 友好模型名（截断过长）
  const modelDisplay = model.length > 30 ? model.slice(0, 28) + '…' : model;
  const providerTag = friendlyProvider(provider);
  const uptimeStr = formatUptime(uptime);
  const emoji = emotionToEmoji(emotion);

  // 状态行：emoji + provider/model · uptime · msg count
  // 控制在一行内，用紫→灰的层级
  const statusLeft = `${emoji} ${providerTag ? providerTag + '/' : ''}${modelDisplay}`;
  const statusRight = `${uptimeStr} · ${messageCount} msgs`;

  return (
    <Box flexDirection="column">
      {/* 渐变 brand bar — 一行全宽 */}
      <GradientBar width={barWidth} />

      {/* 状态行 */}
      <Box marginLeft={1}>
        <Text color={colors.purple} bold>{statusLeft}</Text>
        <Text color={colors.separator}> {'·'} </Text>
        <Text color={colors.secondary}>{statusRight}</Text>
      </Box>

      {/* 分隔线 */}
      <Box marginLeft={1}>
        <Text color={colors.separator}>{box.hDot.repeat(Math.min(termCols - 2, 60))}</Text>
      </Box>
    </Box>
  );
});
