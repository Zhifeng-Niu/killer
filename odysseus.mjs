#!/usr/bin/env node

/**
 * Odysseus Agent — 零配置入口
 *
 * 用户只需: node odysseus.mjs
 * 自动处理: pnpm 安装 → 依赖安装 → 构建 → 启动
 *
 * 流程:
 * 1. 检查 Node.js 版本
 * 2. 检查/安装 pnpm
 * 3. 检测 dist/main.js 是否存在
 * 4. 不存在 → 自动 pnpm install + build
 * 5. 启动 Agent
 */

import { execFileSync, spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CLI_JS = join(__dirname, 'packages', 'odysseus-app', 'dist', 'cli.js');
const MAIN_JS = join(__dirname, 'packages', 'odysseus-app', 'dist', 'main.js');

// ── 辅助函数 ──

function run(cmd, args, opts = {}) {
  return execFileSync(cmd, args, { stdio: 'inherit', cwd: __dirname, ...opts });
}

function runQuiet(cmd, args) {
  try {
    execFileSync(cmd, args, { stdio: 'pipe', cwd: __dirname });
    return true;
  } catch {
    return false;
  }
}

// ── 检查 Node.js 版本 ──
const nodeVersion = parseInt(process.version.slice(1).split('.')[0], 10);
if (nodeVersion < 20) {
  console.error('');
  console.error('  Odysseus Agent 需要 Node.js >= 20');
  console.error(`  当前版本: ${process.version}`);
  console.error('  请访问 https://nodejs.org 下载最新版');
  console.error('');
  process.exit(1);
}

// ── 检查 / 安装 pnpm ──
let hasPnpm = false;
try {
  execFileSync('pnpm', ['--version'], { stdio: 'pipe' });
  hasPnpm = true;
} catch {
  hasPnpm = false;
}

if (!hasPnpm) {
  console.log('');
  console.log('  ▸ 正在安装 pnpm（包管理器）...');

  // 优先 corepack（Node 自带）
  let installed = runQuiet('corepack', ['enable']);
  if (installed) {
    installed = runQuiet('corepack', ['prepare', 'pnpm@latest', '--activate']);
  }

  // corepack 失败则用 npm
  if (!installed) {
    installed = runQuiet('npm', ['install', '-g', 'pnpm']);
  }

  if (!installed) {
    console.error('');
    console.error('  ✗ 无法自动安装 pnpm。请手动运行:');
    console.error('    npm install -g pnpm');
    console.error('    然后重新运行: node odysseus.mjs');
    console.error('');
    process.exit(1);
  }

  console.log('  ✓ pnpm 已安装');
}

// ── 检测并自动构建 ──
const entryPoint = existsSync(CLI_JS) ? CLI_JS : MAIN_JS;

if (!existsSync(MAIN_JS)) {
  console.log('');
  console.log('  🧠 首次运行，正在准备...');

  // 检测依赖
  if (!existsSync(join(__dirname, 'node_modules'))) {
    console.log('  ▸ 安装依赖...');
    try {
      // 静默安装，只显示错误
      execFileSync('pnpm', ['install', '--reporter=append-only'], { stdio: 'pipe', cwd: __dirname, timeout: 120000 });
    } catch (e1) {
      // 安装失败，尝试使用中国镜像
      try {
        execFileSync('pnpm', ['install', '--reporter=append-only', '--registry=https://registry.npmmirror.com'], { stdio: 'pipe', cwd: __dirname, timeout: 120000 });
      } catch {
        console.error('  ✗ 依赖安装失败。请尝试:');
        console.error('    pnpm install --registry=https://registry.npmmirror.com');
        process.exit(1);
      }
    }
    console.log('  ✓ 依赖已安装');
  }

  // 构建
  console.log('  ▸ 构建项目...');
  try {
    execFileSync('pnpm', ['run', 'build'], { stdio: 'pipe', cwd: __dirname, timeout: 120000 });
  } catch (buildErr) {
    // 静默构建失败，显示详细错误
    console.error('  ✗ 构建失败:');
    const stderr = buildErr?.stderr?.toString() || '';
    if (stderr) {
      // 只显示最后几行错误
      const lines = stderr.split('\n').filter(l => l.trim()).slice(-5);
      for (const line of lines) {
        console.error(`    ${line}`);
      }
    }
    console.error('  请手动运行: pnpm build');
    process.exit(1);
  }

  console.log('  ✓ 准备就绪！');
  console.log('');
}

// ── 解析参数 ──
const args = process.argv.slice(2);
if (args.includes('--demo') || args.includes('--quickstart') || args.includes('-q')) {
  process.env.ODYSSEUS_LLM_PROVIDER = 'mock';
}
// 其他参数（--api, --port, --init, --debug, --help）由 main.ts 自行解析

// ── 启动 Agent（支持 /key 命令后自动重启） ──
// 首次启动的参数（可能包含 --demo 等 override）
const launchArgs = args.filter(a => !a.startsWith('--demo') && !a.startsWith('--quickstart') && !a.startsWith('-q'));

function launch() {
  const child = spawn('node', [entryPoint, ...launchArgs], {
    stdio: 'inherit',
    env: { ...process.env },
    cwd: __dirname,
  });

  child.on('exit', (code) => {
    if (code === 42) {
      // /key 命令保存了新配置，清除旧的环境变量覆盖，让子进程从 .env 重新读取
      console.log('');
      console.log('  🔄 Restarting with new config...');
      console.log('');
      delete process.env.ODYSSEUS_LLM_PROVIDER;
      delete process.env.ODYSSEUS_API_KEY;
      // Also clear provider-specific keys so .env takes precedence
      delete process.env.DEEPSEEK_API_KEY;
      delete process.env.ANTHROPIC_API_KEY;
      delete process.env.OPENAI_API_KEY;
      delete process.env.GLM_API_KEY;
      delete process.env.MINIMAX_API_KEY;
      launch();
    } else {
      process.exit(code ?? 0);
    }
  });
}
launch();
