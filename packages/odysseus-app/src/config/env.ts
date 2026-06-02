/**
 * .env File Loader
 *
 * 极简 .env 文件加载器，零外部依赖。
 * 在 loadConfig() 之前自动加载项目目录和 home 目录的 .env 文件。
 *
 * 支持格式：
 *   KEY=value
 *   KEY="quoted value"
 *   # 注释行
 *   空行被忽略
 *
 * 不覆盖已存在的环境变量（process.env 优先）。
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

/**
 * 加载 .env 文件到 process.env
 *
 * @param dirs - 要搜索 .env 文件的目录列表（按优先级排序，前面的优先）
 * @returns 加载的变量数量
 */
export function loadEnvFiles(dirs?: string[]): number {
  const searchDirs = dirs ?? [
    process.cwd(),
    // 向上查找 monorepo 根目录（包含 odysseus.mjs 或 package.json 的目录）
    findProjectRoot(),
    path.join(os.homedir(), '.odysseus'),
  ];

  let loaded = 0;

  for (const dir of searchDirs) {
    const envPath = path.join(dir, '.env');
    if (!fs.existsSync(envPath)) continue;

    try {
      const content = fs.readFileSync(envPath, 'utf-8');
      const count = parseEnvContent(content);
      loaded += count;
    } catch {
      // .env 文件读取失败不应阻止启动
    }
  }

  return loaded;
}

/**
 * 解析 .env 内容并设置到 process.env
 */
function parseEnvContent(content: string): number {
  let count = 0;
  const lines = content.split('\n');

  for (let line of lines) {
    line = line.trim();

    // 跳过空行和注释
    if (!line || line.startsWith('#')) continue;

    const eqIdx = line.indexOf('=');
    if (eqIdx === -1) continue;

    const key = line.slice(0, eqIdx).trim();
    let value = line.slice(eqIdx + 1).trim();

    // 处理引号
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    // 不覆盖已存在的环境变量
    if (key && !(key in process.env)) {
      process.env[key] = value;
      count++;
    }
  }

  return count;
}

/**
 * 从当前目录向上查找项目根目录
 * 识别标志：存在 odysseus.mjs 或包含 packages/ 目录的 package.json
 */
function findProjectRoot(): string {
  let dir = process.cwd();
  for (let i = 0; i < 10; i++) {
    if (fs.existsSync(path.join(dir, 'odysseus.mjs'))) return dir;
    const pkgPath = path.join(dir, 'package.json');
    if (fs.existsSync(pkgPath) && fs.existsSync(path.join(dir, 'packages'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break; // 到达根目录
    dir = parent;
  }
  return process.cwd();
}
