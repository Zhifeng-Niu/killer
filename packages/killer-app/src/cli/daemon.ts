/**
 * Daemon Mode - 后台常驻模式
 *
 * 让 Killer Agent 在后台持续运行，用户可随时连接。
 * PID 文件: ~/.killer/daemon.pid
 * 日志文件: ~/.killer/daemon.log
 *
 * 用法:
 *   node killer.mjs --daemon          # 后台启动
 *   node killer.mjs --daemon --stop   # 停止后台进程
 *   node killer.mjs --daemon --status # 查看状态
 */

import { spawn } from 'child_process';
import { existsSync, readFileSync, writeFileSync, unlinkSync, mkdirSync, createWriteStream } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

const KILLER_DIR = join(homedir(), '.killer');
const PID_FILE = join(KILLER_DIR, 'daemon.pid');
const LOG_FILE = join(KILLER_DIR, 'daemon.log');

function ensureKillerDir(): void {
  if (!existsSync(KILLER_DIR)) {
    mkdirSync(KILLER_DIR, { recursive: true });
  }
}

/**
 * 读取 PID 文件，返回 PID 或 null
 */
export function readDaemonPid(): number | null {
  if (!existsSync(PID_FILE)) return null;
  try {
    const pid = parseInt(readFileSync(PID_FILE, 'utf-8').trim(), 10);
    if (isNaN(pid)) return null;
    return pid;
  } catch {
    return null;
  }
}

/**
 * 检查进程是否存活
 */
function isProcessAlive(pid: number): boolean {
  try {
    // signal 0 = 不发送信号，只检查进程是否存在
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * 获取 daemon 状态
 */
export function getDaemonStatus(): { running: boolean; pid: number | null; logFile: string } {
  const pid = readDaemonPid();
  if (pid === null) {
    return { running: false, pid: null, logFile: LOG_FILE };
  }
  return { running: isProcessAlive(pid), pid, logFile: LOG_FILE };
}

/**
 * 停止 daemon 进程
 */
export async function stopDaemon(): Promise<boolean> {
  const pid = readDaemonPid();
  if (pid === null) {
    console.log('No daemon running (no PID file found).');
    return false;
  }

  if (!isProcessAlive(pid)) {
    console.log(`Daemon process ${pid} is not running. Cleaning up PID file.`);
    try { unlinkSync(PID_FILE); } catch { /* ignore */ }
    return false;
  }

  console.log(`Stopping daemon (PID ${pid})...`);

  // 发送 SIGTERM 优雅关闭
  try {
    process.kill(pid, 'SIGTERM');
  } catch {
    console.log(`Failed to send SIGTERM to process ${pid}.`);
    try { unlinkSync(PID_FILE); } catch { /* ignore */ }
    return false;
  }

  // 等待进程退出（最多 10 秒）
  for (let i = 0; i < 20; i++) {
    await new Promise(resolve => setTimeout(resolve, 500));
    if (!isProcessAlive(pid)) {
      console.log('Daemon stopped.');
      try { unlinkSync(PID_FILE); } catch { /* ignore */ }
      return true;
    }
  }

  // 超时，强制终止
  console.log('Daemon did not stop gracefully, sending SIGKILL...');
  try {
    process.kill(pid, 'SIGKILL');
  } catch { /* ignore */ }

  try { unlinkSync(PID_FILE); } catch { /* ignore */ }
  console.log('Daemon force-killed.');
  return true;
}

/**
 * 以 daemon 模式启动 — fork 自己并在后台运行
 */
export function startDaemon(port: number): void {
  ensureKillerDir();

  // 检查是否已有 daemon 在运行
  const existingPid = readDaemonPid();
  if (existingPid !== null && isProcessAlive(existingPid)) {
    console.log(`Daemon already running (PID ${existingPid}).`);
    console.log(`  Log: ${LOG_FILE}`);
    console.log(`  Stop: node killer.mjs --daemon --stop`);
    process.exit(0);
  }

  // 清理过期 PID 文件
  if (existingPid !== null) {
    try { unlinkSync(PID_FILE); } catch { /* ignore */ }
  }

  // 构造子进程参数：去掉 --daemon，加 --api --port
  const args = process.argv.slice(2).filter(a => a !== '--daemon' && a !== '-D');
  if (!args.includes('--api') && !args.includes('-a')) {
    args.push('--api');
  }
  if (!args.includes('--port')) {
    args.push('--port', String(port));
  }

  // fork 一个子进程
  const child = spawn(process.execPath, [
    ...process.execArgv,
    ...process.argv.slice(1).filter(a => a !== '--daemon' && a !== '-D'),
    ...args.filter(a => {
      // 避免重复参数
      return true;
    }),
  ], {
    detached: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env },
  });

  // 将子进程 stdout/stderr 写入日志文件
  const logStream = createWriteStream(LOG_FILE, { flags: 'a' });
  child.stdout?.pipe(logStream);
  child.stderr?.pipe(logStream);

  // 写入 PID 文件
  writeFileSync(PID_FILE, String(child.pid));

  // 子进程独立于父进程
  child.unref();

  console.log(`Daemon started (PID ${child.pid})`);
  console.log(`  API: http://localhost:${port}`);
  console.log(`  Log: ${LOG_FILE}`);
  console.log(`  Stop: node killer.mjs --daemon --stop`);
  console.log(`  Status: node killer.mjs --daemon --status`);
  process.exit(0);
}

/**
 * 显示 daemon 状态
 */
export function showDaemonStatus(): void {
  const status = getDaemonStatus();
  if (status.running) {
    console.log(`Daemon running (PID ${status.pid})`);
    console.log(`  Log: ${status.logFile}`);
    console.log(`  Stop: node killer.mjs --daemon --stop`);
  } else {
    console.log('No daemon running.');
    if (status.pid) {
      console.log(`  Stale PID file found (${status.pid}). Clean up with --daemon --stop.`);
    }
  }
}
