/**
 * TUI Theme — Tokyo Night × 极简设计系统
 *
 * 颜色: 深色背景 + 高对比度前景
 * 图标: Unicode symbols 优先，emoji 仅用于核心语义
 * 结构: Box-drawing 字符构建视觉层次
 */

// ── 颜色系统 ──

export const colors = {
  // 品牌色
  primary: '#7C5CFC',
  primaryDim: '#5A3ED8',

  // 语义色
  accent: '#5CFCA1',
  warning: '#FCBA5C',
  error: '#FC5C7C',
  info: '#89B4FA',

  // 灰度
  text: '#CDD6F4',
  muted: '#6C7086',
  dimmed: '#45475A',
  faint: '#313244',

  // 背景
  bg: '#1A1B26',
  surface: '#24283B',
  overlay: '#1F2335',

  // 角色色
  user: '#89B4FA',
  agent: '#A6E3A1',
  system: '#6C7086',
} as const;

// ── 状态指示灯 ──

export const statusDot = {
  idle: '●',
  thinking: '◉',
  streaming: '◎',
  error: '✕',
} as const;

export const statusColor = {
  idle: colors.accent,
  thinking: colors.warning,
  streaming: colors.primary,
  error: colors.error,
} as const;

// ── 极简图标 (Unicode 优先) ──

export const icons = {
  // 核心角色 — 仅这些用 emoji
  agent: '◈',
  user: '▸',

  // 状态
  success: '✓',
  error: '✕',
  warn: '!',

  // 功能
  cell: '◆',
  goal: '○',
  emotion: '○',
  memory: '○',
  dream: '○',
  evolve: '○',
} as const;

// ── Box-drawing 字符 ──

export const box = {
  tl: '╭', tr: '╮', bl: '╰', br: '╯',
  h: '─', v: '│',
  hBold: '━', vBold: '┃',
  hDot: '╌', vDot: '╎',
  teeL: '├', teeR: '┤',
  teeUp: '┬', teeDown: '┴',
} as const;

// ── 分隔线 ──

/** 生成水平分隔线 */
export function divider(width: number, char = box.h, color = colors.dimmed): { text: string; color: string } {
  return { text: char.repeat(Math.max(width, 1)), color };
}

// ── Spinner 帧 ──

export const spinners = {
  /** 思考中 — 月相旋转 */
  thinking: ['◐', '◓', '◑', '◒'],
  /** 等待中 — 脉冲点 */
  pulse: ['⠁', '⠃', '⠇', '⡇', '⣇', '⣧', '⣷', '⣾', '⣽', '⣻', '⢿', '⡿', '⣟', '⣯', '⣟', '⡿'],
  /** 流式输出 — 光标闪烁 */
  streaming: ['▊', '▋', '▊', ' '],
} as const;

// ── 消息气泡前缀 ──

export const bubble = {
  user: '╭─',
  userEnd: '╰─',
  agent: '┄┄',
  system: ' ·',
  error: '✕ ',
} as const;
