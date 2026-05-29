/**
 * TUI Theme — Z世代视觉系统
 *
 * 设计方向：大胆但克制。紫色品牌为核心，辅助色从暖灰中点缀。
 * 电子青和热能粉可以同屏，但用量控制。
 * 不用荧光色 — Z世代不等于刺眼。
 *
 * 色彩规则：一屏最多 3 种彩色（紫常驻 + 2 种点缀）。
 */

// ── 色彩系统 ──

export const colors = {
  // 品牌 — 紫色系
  purple: '#7C5CFC',
  purpleDim: '#5A3ED8',
  purpleBright: '#9D8AFF',
  purpleGlow: '#B8A9FF',

  // 点缀 — 温和版
  cyan: '#22D3EE',         // 电子青 — 工具/链接
  pink: '#F43F5E',         // 热能粉 — 警告/强调
  gold: '#FFB800',         // 琥珀金 — 高亮/重要

  // 警告
  amber: '#F59E0B',

  // 错误闪光
  error: '#FC5C7C',

  // 灰度 — 暖冷温度差
  text: '#C8C2BA',         // 暖灰提亮 — 正文更可读
  secondary: '#78716C',    // 冷灰 — 辅助信息
  separator: '#292524',    // 深灰 — 分隔线
  border: '#45475A',       // 输入框边框默认色

  // 背景
  bg: '#0D0D0D',           // 真黑
  surface: '#1A1A1A',      // 微抬层
  surfaceHigh: '#252525',  // 高亮面板背景

  // 角色色
  user: '#E8D5B7',         // 暖米色 — 用户消息
  agent: '#7C5CFC',        // 紫 — agent 消息
  system: '#22D3EE',       // 电子青 — 系统消息
  tool: '#9D8AFF',         // 亮紫 — 工具调用
} as const;

// ── Unicode 方块 ──

export const BLOCKS_8 = ['▏', '▎', '▍', '▌', '▋', '▊', '▉', '█'] as const;
export const SHADE_4 = ['█', '▓', '▒', '░'] as const;

// ── 渐变预设 ──

export const gradients = {
  brand: [colors.purpleDim, colors.purple, colors.purpleBright, colors.cyan],
  hot: [colors.purpleDim, colors.purple, colors.pink],
  success: [colors.purpleDim, colors.purple, colors.cyan],
  muted: [colors.separator, colors.secondary, colors.separator],
} as const;

// ── 上下文进度条 ──

export function contextBar(
  used: number,
  total: number,
  width: number,
): Array<{ char: string; color: string }> {
  const ratio = Math.max(0, Math.min(1, total > 0 ? used / total : 0));
  const filled = ratio * width;
  const whole = Math.floor(filled);
  const frac = filled - whole;

  const barColor = ratio > 0.8 ? colors.pink
    : ratio > 0.5 ? colors.gold
    : colors.purple;

  const segs: Array<{ char: string; color: string }> = [];

  for (let i = 0; i < whole && i < width; i++) {
    segs.push({ char: '█', color: barColor });
  }

  if (frac > 0 && whole < width) {
    const idx = Math.min(Math.floor(frac * BLOCKS_8.length), BLOCKS_8.length - 1);
    segs.push({ char: BLOCKS_8[idx], color: barColor });
  }

  while (segs.length < width) {
    segs.push({ char: '░', color: colors.separator });
  }

  return segs;
}

// ── 动画帧 ──

export const moonFrames = ['◐', '◓', '◑', '◒'] as const;

export const thinkFrames = [
  { ch: '◐', col: colors.purple },
  { ch: '◓', col: colors.purpleBright },
  { ch: '◑', col: colors.purple },
  { ch: '◒', col: colors.purpleDim },
] as const;

export const waveFrames = ['▊', '▋', '▊', '▌'] as const;

export const breathFrames = [
  colors.border,
  colors.purpleDim,
  colors.purple,
  colors.purpleGlow,
  colors.purple,
  colors.purpleDim,
] as const;

export const errorFlashFrames = [
  colors.error,
  '#D04A68',
  '#A63E55',
  colors.border,
] as const;

// ── 结构字符 ──

export const box = {
  tl: '╭', tr: '╮', bl: '╰', br: '╯',
  h: '─', v: '│',
  hBold: '━',
  hDot: '╌',
  hWave: '〜',
  diamond: '◈',
} as const;

export const icons = {
  agent: '◈',
  user: '▸',
  success: '✓',
  error: '✕',
  warn: '⚠',
  cell: '◆',
  tool: '⟐',
  spark: '✦',
} as const;

// ── 工具函数 ──

export function lerpColor(a: string, b: string, t: number): string {
  const parse = (hex: string) => {
    const h = hex.replace('#', '');
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  };
  const [ar, ag, ab] = parse(a);
  const [br, bg, bb] = parse(b);
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const b2 = Math.round(ab + (bb - ab) * t);
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b2.toString(16).padStart(2, '0')}`;
}

export function formatTokens(n: number): string {
  if (n < 1000) return `${n}`;
  if (n < 1000000) return `${Math.round(n / 1000)}K`;
  return `${(n / 1000000).toFixed(1)}M`;
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m${s % 60}s`;
  const h = Math.floor(m / 60);
  return `${h}h${m % 60}m`;
}

// ── 角色色彩映射 ──

export const roleColors: Record<string, { icon: string; label: string; color: string }> = {
  user: { icon: icons.user, label: 'you', color: colors.user },
  agent: { icon: icons.agent, label: 'odysseus', color: colors.agent },
  system: { icon: icons.spark, label: 'system', color: colors.system },
  error: { icon: icons.error, label: 'error', color: colors.error },
  tool: { icon: icons.tool, label: 'tool', color: colors.tool },
};
