/**
 * ShellExecutor - 命令执行器的真实实现
 *
 * 基于 child_process 执行 shell 命令。
 * 注入到 Cerebellum 使验证管线能真正运行 pnpm build / pnpm test。
 */

import { execFile } from 'node:child_process';
import type { CommandExecutor, CommandResult } from '@killer/core';

export class ShellExecutor implements CommandExecutor {
  private readonly projectRoot: string;

  constructor(projectRoot: string) {
    this.projectRoot = projectRoot;
  }

  async execute(command: string, timeout?: number, cwd?: string): Promise<CommandResult> {
    const start = Date.now();
    const effectiveTimeout = timeout ?? 120_000;
    const effectiveCwd = cwd ?? this.projectRoot;

    return new Promise<CommandResult>((resolve) => {
      execFile(
        'sh',
        ['-c', command],
        {
          cwd: effectiveCwd,
          timeout: effectiveTimeout,
          maxBuffer: 1024 * 1024,
          killSignal: 'SIGTERM',
        },
        (error, stdout, stderr) => {
          resolve({
            exitCode: error ? (typeof error.code === 'number' ? error.code : 1) : 0,
            stdout: stdout ?? '',
            stderr: stderr ?? '',
            duration: Date.now() - start,
          });
        },
      );
    });
  }
}
