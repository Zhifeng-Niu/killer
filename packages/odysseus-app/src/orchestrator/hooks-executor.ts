/**
 * Hooks Command Executor
 *
 * 执行 shell 命令类型的 hook handler。
 * 通过 stdin 传入 JSON payload，从 stdout 读取结果。
 * Exit code 0 = continue, 2 = block, 其他 = error。
 */

import { spawn } from 'node:child_process';

export interface CommandExecOptions {
  timeout: number;
  signal?: AbortSignal;
}

/**
 * 执行 hook 命令
 */
export async function executeHooksCommand(
  command: string,
  payload: Record<string, unknown>,
  options: CommandExecOptions,
): Promise<{ action: 'continue' | 'block'; reason?: string }> {
  return new Promise((resolve) => {
    const proc = spawn('sh', ['-c', command], {
      stdio: ['pipe', 'pipe', 'pipe'],
      signal: options.signal,
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data: Buffer) => { stdout += data.toString(); });
    proc.stderr.on('data', (data: Buffer) => { stderr += data.toString(); });

    const timer = setTimeout(() => {
      proc.kill('SIGTERM');
      resolve({ action: 'continue' });
    }, options.timeout);

    proc.on('close', (code) => {
      clearTimeout(timer);

      if (code === 2) {
        resolve({ action: 'block', reason: stdout.trim() || 'Blocked by hook' });
        return;
      }

      if (code !== 0) {
        resolve({ action: 'continue' });
        return;
      }

      // 尝试解析 stdout 为 JSON 结果
      try {
        const result = JSON.parse(stdout.trim());
        if (result.action === 'block') {
          resolve({ action: 'block', reason: result.reason });
          return;
        }
      } catch {
        // stdout 不是 JSON，exit 0 = continue
      }

      resolve({ action: 'continue' });
    });

    proc.on('error', () => {
      clearTimeout(timer);
      resolve({ action: 'continue' });
    });

    // 通过 stdin 传入 payload
    proc.stdin.write(JSON.stringify(payload));
    proc.stdin.end();
  });
}
