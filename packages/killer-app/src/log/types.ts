/**
 * Structured Logger
 *
 * 统一日志系统 - 支持 log levels, 结构化 fields, 和多种输出
 */

/**
 * Log level 优先级
 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'silent';

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
  silent: 4,
};

/**
 * Log entry 结构
 */
export interface LogEntry {
  level: LogLevel;
  timestamp: number;
  module: string;
  message: string;
  fields?: Record<string, unknown>;
  error?: Error;
}

/**
 * Log 输出接口
 */
export interface LogOutput {
  write(entry: LogEntry): void;
}

/**
 * Console 输出（带颜色）
 */
export class ConsoleOutput implements LogOutput {
  write(entry: LogEntry): void {
    const time = new Date(entry.timestamp).toISOString().slice(11, 19);
    const levelStr = entry.level.toUpperCase().padEnd(5);
    const moduleStr = entry.module ? `[${entry.module}] ` : '';

    let line = `${time} ${levelStr} ${moduleStr}${entry.message}`;

    if (entry.fields && Object.keys(entry.fields).length > 0) {
      const fieldsStr = Object.entries(entry.fields)
        .map(([k, v]) => `${k}=${typeof v === 'string' ? v : JSON.stringify(v)}`)
        .join(' ');
      line += ` | ${fieldsStr}`;
    }

    switch (entry.level) {
      case 'error':
        console.error(line);
        if (entry.error) {
          console.error(entry.error.stack ?? entry.error.message);
        }
        break;
      case 'warn':
        console.warn(line);
        break;
      case 'debug':
        // debug 用灰色输出
        console.log(`\x1b[90m${line}\x1b[0m`);
        break;
      default:
        console.log(line);
    }
  }
}

/**
 * File 输出（JSONL 格式）
 */
export class FileOutput implements LogOutput {
  private readonly filePath: string;

  constructor(filePath: string) {
    this.filePath = filePath;
  }

  write(entry: LogEntry): void {
    try {
      const { promises: fs } = require('node:fs');
      const line = JSON.stringify({
        ts: entry.timestamp,
        level: entry.level,
        mod: entry.module,
        msg: entry.message,
        ...entry.fields,
        ...(entry.error ? { err: entry.error.message, stack: entry.error.stack } : {}),
      }) + '\n';

      // Append mode — fire and forget
      fs.appendFile(this.filePath, line).catch(() => {});
    } catch {
      // File logging is best-effort
    }
  }
}

/**
 * 结构化 Logger
 */
export class Logger {
  private static instance: Logger;
  private minLevel: LogLevel = 'info';
  private outputs: LogOutput[] = [];
  private defaultModule: string = 'app';

  private constructor() {
    this.outputs.push(new ConsoleOutput());
  }

  /**
   * 获取全局 Logger 实例
   */
  static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger();
    }
    return Logger.instance;
  }

  /**
   * 设置最低日志级别
   */
  setLevel(level: LogLevel): void {
    this.minLevel = level;
  }

  /**
   * 添加输出目标
   */
  addOutput(output: LogOutput): void {
    this.outputs.push(output);
  }

  /**
   * 设置默认模块名
   */
  setDefaultModule(module: string): void {
    this.defaultModule = module;
  }

  /**
   * 创建子 logger（带模块名）
   */
  child(module: string): ModuleLogger {
    return new ModuleLogger(this, module);
  }

  /**
   * 写入日志条目
   */
  log(level: LogLevel, module: string, message: string, fields?: Record<string, unknown>, error?: Error): void {
    if (LOG_LEVELS[level] < LOG_LEVELS[this.minLevel]) {
      return;
    }

    const entry: LogEntry = {
      level,
      timestamp: Date.now(),
      module,
      message,
      ...(fields ? { fields } : {}),
      ...(error ? { error } : {}),
    };

    for (const output of this.outputs) {
      try {
        output.write(entry);
      } catch {
        // Output failure should not crash the app
      }
    }
  }

  // Convenience methods
  debug(message: string, fields?: Record<string, unknown>): void {
    this.log('debug', this.defaultModule, message, fields);
  }

  info(message: string, fields?: Record<string, unknown>): void {
    this.log('info', this.defaultModule, message, fields);
  }

  warn(message: string, fields?: Record<string, unknown>): void {
    this.log('warn', this.defaultModule, message, fields);
  }

  error(message: string, error?: Error | unknown, fields?: Record<string, unknown>): void {
    const err = error instanceof Error ? error : undefined;
    this.log('error', this.defaultModule, message, fields, err);
  }
}

/**
 * 模块级 Logger（绑定模块名）
 */
export class ModuleLogger {
  constructor(
    private readonly root: Logger,
    private readonly module: string,
  ) {}

  debug(message: string, fields?: Record<string, unknown>): void {
    this.root.log('debug', this.module, message, fields);
  }

  info(message: string, fields?: Record<string, unknown>): void {
    this.root.log('info', this.module, message, fields);
  }

  warn(message: string, fields?: Record<string, unknown>): void {
    this.root.log('warn', this.module, message, fields);
  }

  error(message: string, error?: Error | unknown, fields?: Record<string, unknown>): void {
    const err = error instanceof Error ? error : undefined;
    this.root.log('error', this.module, message, fields, err);
  }
}
