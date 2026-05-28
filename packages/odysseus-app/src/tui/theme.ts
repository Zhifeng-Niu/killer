/**
 * TUI Theme — 真黑底 + 紫色系 + 暖冷灰温度差
 *
 * 色彩约束：一行屏幕最多三种彩色。
 * 紫 #7C5CFC 常驻，电子青 #22D3EE 和热能粉 #F43F5E 交替出现不同时。
 * 动效帧率上限 150ms（~7fps），用 Unicode 半填充字符替代 braille dots。
 */

// ── 色彩系统 ──

export const colors = {
  // 品牌 — 紫色系
  purple: '#7C5CFC',
  purpleDim: '#5A3ED8',
  purpleBright: '#9D8AFF',

  // 强调 — 电子青 / 热能粉，从不同时出现
  cyan: '#22D3EE',
  pink: '#F43F5E',

  // 警告
  amber: '#F59E0B',

  // 错误闪光
  error: '#FC5C7C',

  // 灰度 — 暖冷温度差
  text: '#A8A29E',        // 暖灰 — 正文
  secondary: '#78716C',   // 冷灰 — 辅助信息
  separator: '#292524',   // 深灰 — 分隔线
  border: '#45475A',      // 输入框边框默认色

  // 背景
  bg: '#0D0D0D',          // 真黑
  surface: '#1A1A1A',     // 微抬层

  // 角色色
  user: '#A8A29E',        // 暖灰 — 用户消息
  agent: '#7C5CFC',       // 紫 — agent 消息
} as const;

// ── Unicode 方块 — 半填充字符替代 braille dots ──

export const BLOCKS_8 = ['▏', '▎', '▍', '▌', '▋', '▊', '▉', '█'] as const;
export const SHADE_4 = ['█', '▓', '▒', '░'] as const;

// ── 上下文进度条 — 8 分块 ──

export function contextBar(
  used: number,
  total: number,
  width: number,
): Array<{ char: string; color: string }> {
  const ratio = Math.max(0, Math.min(1, total > 0 ? used / total : 0));
  const filled = ratio * width;
  const whole = Math.floor(filled);
  const frac = filled - whole;

  // 颜色阈值：正常灰 → 过半琥珀 → 过八成热能粉
  const barColor = ratio > 0.8 ? colors.pink
    : ratio > 0.5 ? colors.amber
    : colors.secondary;

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

// ── 月相帧 — 思考态 150ms/帧 ──

export const moonFrames = ['◐', '◓', '◑', '◒'] as const;

// ── 波形光标帧 — 流式态 100ms/帧 ──

export const waveFrames = ['▊', '▋', '▊', '▌'] as const;

// ── 呼吸灯边框帧 — 800ms 周期 ──

export const breathFrames = [
  colors.border,
  '#4D4870',
  colors.purple,
  '#4D4870',
] as const;

// ── 错误闪光帧 — 闪一次然后渐暗 ──

export const errorFlashFrames = [
  colors.error,
  '#D04A68',
  '#A63E55',
  colors.border,
] as const;

// ── 思考动画帧 — 颜色渐变 ──

export const thinkFrames = [
  { ch: '◐', col: colors.purple },
  { ch: '◓', col: colors.purpleBright },
  { ch: '◑', col: colors.purple },
  { ch: '◒', col: colors.purpleDim },
] as const;

// ── 结构字符 ──

export const box = {
  tl: '╭', tr: '╮', bl: '╰', br: '╯',
  h: '─', v: '│',
  hBold: '━',
  hDot: '╌',
} as const;

export const icons = {
  agent: '◈',
  user: '▸',
  success: '✓',
  error: '✕',
  warn: '!',
  cell: '◆',
  tool: '⟐',
} as const;

// ── 颜色插值工具 — 状态过渡 ──

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

/** 格式化 token 数量 */
export function formatTokens(n: number): string {
  if (n < 1000) return `${n}`;
  if (n < 1000000) return `${Math.round(n / 1000)}K`;
  return `${(n / 1000000).toFixed(1)}M`;
}
