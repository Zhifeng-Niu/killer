/**
 * ANSI Terminal Formatting Utilities
 *
 * 轻量级终端颜色和格式化，零依赖。
 * 仅在 TTY 环境下启用颜色输出。
 */

/**
 * ANSI 颜色代码
 */
const ANSI = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  italic: '\x1b[3m',
  underline: '\x1b[4m',

  black: '\x1b[30m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',

  bgBlack: '\x1b[40m',
  bgRed: '\x1b[41m',
  bgGreen: '\x1b[42m',
  bgYellow: '\x1b[43m',
  bgBlue: '\x1b[44m',
  bgMagenta: '\x1b[45m',
  bgCyan: '\x1b[46m',
  bgWhite: '\x1b[47m',
} as const;

/**
 * 检测是否支持颜色
 */
const supportsColor = (): boolean => {
  if (process.env.NO_COLOR !== undefined) return false;
  if (process.env.FORCE_COLOR !== undefined) return true;
  return process.stdout.isTTY === true;
};

const COLOR_ENABLED = supportsColor();

/**
 * 格式化函数（仅在 TTY 下启用颜色）
 */
function fmt(open: string, text: string, close: string = ANSI.reset): string {
  if (!COLOR_ENABLED) return text;
  return `${open}${text}${close}`;
}

export const c = {
  bold: (text: string) => fmt(ANSI.bold, text),
  dim: (text: string) => fmt(ANSI.dim, text),
  italic: (text: string) => fmt(ANSI.italic, text),
  underline: (text: string) => fmt(ANSI.underline, text),

  red: (text: string) => fmt(ANSI.red, text),
  green: (text: string) => fmt(ANSI.green, text),
  yellow: (text: string) => fmt(ANSI.yellow, text),
  blue: (text: string) => fmt(ANSI.blue, text),
  magenta: (text: string) => fmt(ANSI.magenta, text),
  cyan: (text: string) => fmt(ANSI.cyan, text),
  white: (text: string) => fmt(ANSI.white, text),

  bgBlue: (text: string) => fmt(ANSI.bgBlue + ANSI.white, text),
  bgMagenta: (text: string) => fmt(ANSI.bgMagenta + ANSI.white, text),

  /** 组合格式 */
  header: (text: string) => fmt(ANSI.bold + ANSI.cyan, text),
  label: (text: string) => fmt(ANSI.bold + ANSI.blue, text),
  value: (text: string) => fmt(ANSI.white, text),
  success: (text: string) => fmt(ANSI.green, text),
  error: (text: string) => fmt(ANSI.red, text),
  warn: (text: string) => fmt(ANSI.yellow, text),
  info: (text: string) => fmt(ANSI.cyan, text),
  muted: (text: string) => fmt(ANSI.dim, text),
};

/**
 * 生成带颜色的键值行
 *
 * @example `label('Uptime') + '12s'` → `  Uptime: 12s`
 */
export function kv(label: string, value: string, indent: number = 3): string {
  return ' '.repeat(indent) + c.label(label.padEnd(16)) + c.value(value);
}

/**
 * 生成分隔线
 */
export function divider(char: string = '─', width: number = 50): string {
  return c.muted(char.repeat(width));
}

/**
 * 简易 Markdown → ANSI 转换
 *
 * 处理基本格式：**bold**, *italic*, `code`, ```code blocks```
 */
export function renderMarkdown(text: string): string {
  if (!COLOR_ENABLED) return text;

  let result = text;

  // 代码块 ```...``` → dim block
  result = result.replace(/```(\w*)\n([\s\S]*?)```/g, (_match, _lang, code) => {
    const lines = code.trim().split('\n').map((l: string) => c.dim(`  ${l}`));
    return '\n' + lines.join('\n') + '\n';
  });

  // 行内代码 `code` → yellow
  result = result.replace(/`([^`]+)`/g, (_match, code: string) => c.yellow(code));

  // **bold** → bold
  result = result.replace(/\*\*([^*]+)\*\*/g, (_match, text: string) => c.bold(text));

  // *italic* → italic (但避免匹配 ** 的情况)
  result = result.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, (_match, text: string) => c.italic(text));

  return result;
}
