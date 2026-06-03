/**
 * TUI Theme — Catppuccin Mocha 色彩系统
 *
 * 设计方向：Catppuccin Mocha 官方色板，Mauve 品牌为核心。
 * 一屏最多 3 种彩色（Mauve 常驻 + 2 种点缀）。
 * emoji-free 专业风格。所有颜色语义命名，组件不硬编码 hex。
 */

// ── 色彩系统 (Catppuccin Mocha) ──

export const colors = {
  // Mauve 色系 (品牌)
  purple: '#CBA6F7',       // Mauve — 主品牌
  purpleDim: '#9B7BDB',    // 暗紫 — 品牌阴影/脉冲低点
  purpleBright: '#B4BEFE', // Lavender — 品牌高光
  purpleGlow: '#D9B8FF',   // 亮紫 — 品牌辉光

  // 点缀
  cyan: '#89DCEB',         // Sky — 工具/链接
  pink: '#F5C2E7',         // Pink — 警告/强调
  gold: '#F9E2AF',         // Yellow — 高亮/重要

  // 警告
  amber: '#FAB387',        // Peach — 警告/进度
  error: '#F38BA8',        // Red — 错误

  // 文本 & UI
  text: '#CDD6F4',         // Text — 正文
  secondary: '#A6ADC8',    // Subtext0 — 辅助信息
  separator: '#45475A',    // Surface1 — 分隔线
  border: '#585B70',       // Surface2 — 边框

  // 背景
  bg: '#11111B',           // Crust — 真背景
  surface: '#1E1E2E',      // Base — 微抬层
  surfaceHigh: '#313244',  // Surface0 — 高亮面板

  // 角色色
  user: '#F5E0DC',         // Rosewater — 用户
  agent: '#CBA6F7',        // Mauve — agent
  system: '#89DCEB',       // Sky — 系统
  tool: '#B4BEFE',         // Lavender — 工具
} as const;

// ── Unicode 方块 ──

export const BLOCKS_8 = ['▏', '▎', '▍', '▌', '▋', '▊', '▉', '█'] as const;
export const SHADE_4 = ['█', '▓', '▒', '░'] as const;

// ── 渐变预设 ──

export const gradients = {
  brand: [colors.purpleDim, colors.purple, colors.purpleBright],
  hot: [colors.purple, colors.pink, colors.amber],
  success: [colors.purpleDim, colors.cyan, colors.purpleBright],
  cool: [colors.purple, colors.cyan],
  warm: [colors.amber, colors.gold, colors.purple],
  muted: [colors.separator, colors.secondary, colors.separator],
} as const;

// ── 渐变 accent 工具 ──

export function gradientSteps(from: string, to: string, count: number): string[] {
  return Array.from({ length: count }, (_, i) => lerpColor(from, to, i / (count - 1)));
}

export function gradientText(text: string, palette: readonly string[]): Array<{ ch: string; col: string }> {
  return text.split('').map((ch, i) => ({
    ch,
    col: palette[i % palette.length],
  }));
}

export const accentGradients = {
  brand: gradientSteps(colors.purpleDim, colors.purpleBright, 8),
  hot: gradientSteps(colors.purple, colors.pink, 6),
  cool: gradientSteps(colors.purple, colors.cyan, 6),
  warm: gradientSteps(colors.amber, colors.gold, 6),
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

// ── 流动引擎：正弦驱动的帧序列生成 ──

function sineWaveFrames(chars: readonly string[], count: number): string[] {
  const len = chars.length;
  return Array.from({ length: count }, (_, i) => {
    const idx = Math.round((Math.sin(i * Math.PI * 2 / count) * 0.5 + 0.5) * (len - 1));
    return chars[Math.min(idx, len - 1)];
  });
}

function sineColorFrames(palette: string[], count: number): string[] {
  return Array.from({ length: count }, (_, i) => {
    const t = Math.sin(i * Math.PI * 2 / count) * 0.5 + 0.5;
    const idx = t * (palette.length - 1);
    const lo = Math.floor(idx);
    const hi = Math.min(lo + 1, palette.length - 1);
    return lerpColor(palette[lo], palette[hi], idx - lo);
  });
}

const BLOCKS_FULL = [' ', '░', '▒', '▓', '█'] as const;

// 波形指示器：24 帧正弦，8 级方块
export const waveFrames24 = sineWaveFrames([...BLOCKS_8], 24);
export const waveFrames12 = sineWaveFrames(BLOCKS_FULL, 12);
export const waveFrames = ['▊', '▋', '▊', '▌'] as const;

// 流光尾迹：16 帧彗星尾，从暗到亮渐变脉冲
export const streamFlowFrames: Array<{ ch: string; col: string }> = Array.from(
  { length: 16 }, (_, i) => {
    const t = Math.sin(i * Math.PI / 15);
    const blockIdx = Math.round(t * (BLOCKS_8.length - 1));
    const colorT = t;
    return {
      ch: BLOCKS_8[Math.min(blockIdx, BLOCKS_8.length - 1)],
      col: lerpColor(colors.purpleDim, colors.purpleBright, colorT),
    };
  },
);

// 思考涟漪：7 字符宽 × 24 帧，相位偏移制造波传播
export const rippleFrames = Array.from({ length: 24 }, (_, frame) => {
  const phase = frame * Math.PI * 2 / 24;
  return Array.from({ length: 7 }, (_, pos) => {
    const offset = pos * 0.6;
    const val = Math.sin(phase - offset) * 0.5 + 0.5;
    const idx = Math.round(val * (BLOCKS_FULL.length - 1));
    const colorVal = Math.sin(phase - offset + 0.3) * 0.5 + 0.5;
    return {
      ch: BLOCKS_FULL[Math.min(idx, BLOCKS_FULL.length - 1)],
      color: lerpColor(colors.purpleDim, colors.purpleBright, colorVal),
    };
  });
});

// 空状态环境流：36 帧 × 30 列，密度+色彩双轴流动
export const ambientFlowFrames: Array<{ bar: string; colors: string[] }> = Array.from(
  { length: 36 }, (_, frame) => {
    const barChars: string[] = [];
    const barColors: string[] = [];
    for (let col = 0; col < 30; col++) {
      const phase = (frame + col) * Math.PI * 2 / 30;
      const val = Math.sin(phase) * 0.5 + 0.5;
      const idx = Math.round(val * (SHADE_4.length - 1));
      barChars.push(SHADE_4[Math.min(idx, SHADE_4.length - 1)]);
      barColors.push(lerpColor(colors.purpleDim, colors.purple, val));
    }
    return { bar: barChars.join(''), colors: barColors };
  },
);

// 分隔线流动：24 帧 × 16 列，密度扫描
export const dividerFlowFrames = Array.from({ length: 24 }, (_, frame) => {
  return Array.from({ length: 16 }, (_, col) => {
    const phase = (frame - col * 0.5) * Math.PI * 2 / 24;
    const val = Math.sin(phase) * 0.5 + 0.5;
    const idx = Math.round(val * (SHADE_4.length - 1));
    return SHADE_4[Math.min(idx, SHADE_4.length - 1)];
  }).join('');
});

// 呼吸色变：24 帧正弦平滑
export const breathFrames = sineColorFrames(
  [colors.border, colors.purpleDim, colors.purple, colors.purpleGlow, colors.purple, colors.purpleDim, colors.border],
  24,
);

// 输入边框流光：32 帧，光点沿边框移动
export const borderFlowFrames = sineColorFrames(
  [colors.border, colors.border, colors.purpleDim, colors.purple, colors.purpleGlow, colors.purple, colors.purpleDim, colors.border],
  32,
);

export const errorFlashFrames = [
  colors.error,
  lerpColor(colors.error, colors.border, 0.33),
  lerpColor(colors.error, colors.border, 0.66),
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
