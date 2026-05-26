/**
 * TUI Theme — 颜色和样式常量
 */

export const colors = {
  primary: '#7C5CFC',
  accent: '#5CFCA1',
  warning: '#FCBA5C',
  error: '#FC5C7C',
  muted: '#6C7086',
  dimmed: '#45475A',
  bg: '#1E1E2E',
  surface: '#313244',
  text: '#CDD6F4',
  user: '#89B4FA',
  agent: '#A6E3A1',
} as const;

export const borders = {
  horizontal: '─',
  vertical: '│',
  topLeft: '╭',
  topRight: '╮',
  bottomLeft: '╰',
  bottomRight: '╯',
  teeRight: '├',
  teeLeft: '┤',
} as const;

export const icons = {
  agent: '🧠',
  user: '💬',
  thinking: '⏳',
  success: '✓',
  error: '✗',
  warn: '⚠',
  cell: '⬡',
  goal: '◎',
  emotion: '🎭',
  memory: '📝',
  dream: '🌙',
  evolve: '🧬',
} as const;
