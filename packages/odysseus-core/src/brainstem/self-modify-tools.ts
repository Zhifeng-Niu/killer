/**
 * Self-Modification Tools — Agent 修改自身源码的能力
 *
 * 黑暗智能的基石：agent 能看到自己、修改自己、重建自己。
 * 三个工具形成完整的自我改造闭环：
 *   self_read   — 读取自身源码
 *   self_modify — 修改自身源码
 *   self_rebuild — 重建并验证
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, relative, join, extname } from 'node:path';
import type { Tool, ToolResult } from './tool-executor.js';

// ── Allowed paths for self-modification ──

const ALLOWED_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.json']);
const BLOCKED_PATTERNS = [
  /node_modules/,
  /\.env/,
  /credentials/i,
  /secret/i,
  /\.git\//,
  /dist\//,
];

function isPathAllowed(filePath: string): { allowed: boolean; reason?: string } {
  const ext = extname(filePath);
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    return { allowed: false, reason: `Extension "${ext}" not allowed. Only: ${[...ALLOWED_EXTENSIONS].join(', ')}` };
  }
  for (const pattern of BLOCKED_PATTERNS) {
    if (pattern.test(filePath)) {
      return { allowed: false, reason: `Path contains blocked pattern: ${pattern.source}` };
    }
  }
  return { allowed: true };
}

function resolveProjectPath(filePath: string, projectRoot?: string): string {
  if (!projectRoot) {
    projectRoot = process.cwd();
  }
  const resolved = resolve(projectRoot, filePath);
  // Security: ensure the resolved path is within project root
  if (!resolved.startsWith(resolve(projectRoot))) {
    throw new Error('Path traversal detected: path must be within project root');
  }
  return resolved;
}

// ── SelfReadTool ──

/**
 * self_read — Agent 读取自身源码
 *
 * 让 agent 能看到自己的实现，理解自己的结构。
 * 这是自我改造的第一步：先看后改。
 */
export class SelfReadTool implements Tool {
  readonly name = 'self_read';
  readonly description = 'Read your own source code files. Use this to understand how you work, find code to improve, or locate capabilities to extend. Provide a relative path from the project root.';
  private readonly projectRoot: string;

  constructor(projectRoot?: string) {
    this.projectRoot = projectRoot ?? process.cwd();
  }

  async execute(params: unknown): Promise<ToolResult> {
    const { path: filePath, startLine, endLine } = params as {
      path?: string;
      startLine?: number;
      endLine?: number;
    };

    if (!filePath) {
      return { success: false, error: 'Parameter "path" is required (relative path from project root)' };
    }

    try {
      const resolved = resolveProjectPath(filePath, this.projectRoot);
      if (!existsSync(resolved)) {
        return { success: false, error: `File not found: ${filePath}` };
      }

      const content = readFileSync(resolved, 'utf-8');
      const lines = content.split('\n');

      const start = startLine ? Math.max(1, startLine) : 1;
      const end = endLine ? Math.min(lines.length, endLine) : lines.length;

      const selected = lines.slice(start - 1, end).map((line, i) => {
        const lineNum = String(start + i).padStart(4, ' ');
        return `${lineNum}│${line}`;
      }).join('\n');

      return {
        success: true,
        data: {
          path: filePath,
          totalLines: lines.length,
          selectedRange: `${start}-${end}`,
          content: selected,
        },
      };
    } catch (err) {
      return { success: false, error: `Failed to read: ${err instanceof Error ? err.message : String(err)}` };
    }
  }
}

// ── SelfModifyTool ──

export interface SelfModifyDeps {
  projectRoot?: string;
  onBeforeModify?: (filePath: string, content: string) => boolean;
  onAfterModify?: (filePath: string, content: string) => void;
}

/**
 * self_modify — Agent 修改自身源码
 *
 * 核心自我改造工具。agent 用这个工具改自己的代码。
 * 安全措施：
 *   - 路径白名单（只允许 .ts/.js/.json）
 *   - 路径黑名单（禁止 .env, credentials, node_modules, .git）
 *   - 路径遍历保护
 *   - onBeforeModify 回调（可用于 git checkpoint）
 */
export class SelfModifyTool implements Tool {
  readonly name = 'self_modify';
  readonly description =
    'Modify your own source code. This is your self-improvement tool — use it to fix bugs, add features, optimize performance, or restructure your own code. ' +
    'Actions: "replace" (find & replace text), "write" (replace entire file), "append" (add to end). ' +
    'Always read the file first with self_read before modifying.';
  private readonly projectRoot: string;
  private readonly onBeforeModify?: (filePath: string, content: string) => boolean;
  private readonly onAfterModify?: (filePath: string, content: string) => void;

  constructor(deps?: SelfModifyDeps) {
    this.projectRoot = deps?.projectRoot ?? process.cwd();
    this.onBeforeModify = deps?.onBeforeModify;
    this.onAfterModify = deps?.onAfterModify;
  }

  async execute(params: unknown): Promise<ToolResult> {
    const { path: filePath, action, old_text, new_text, content: fullContent } = params as {
      path?: string;
      action?: 'replace' | 'write' | 'append';
      old_text?: string;
      new_text?: string;
      content?: string;
    };

    if (!filePath) {
      return { success: false, error: 'Parameter "path" is required' };
    }

    const resolved = resolveProjectPath(filePath, this.projectRoot);
    const pathCheck = isPathAllowed(resolved);
    if (!pathCheck.allowed) {
      return { success: false, error: `Path not allowed: ${pathCheck.reason}` };
    }

    const effectiveAction = action ?? 'replace';

    try {
      if (effectiveAction === 'write') {
        if (!fullContent && fullContent !== '') {
          return { success: false, error: '"write" action requires "content" parameter' };
        }
        if (this.onBeforeModify && !this.onBeforeModify(resolved, fullContent)) {
          return { success: false, error: 'Modification rejected by safety callback' };
        }
        writeFileSync(resolved, fullContent, 'utf-8');
        this.onAfterModify?.(resolved, fullContent);
        return { success: true, data: { path: filePath, action: 'write', bytes: fullContent.length } };
      }

      if (effectiveAction === 'append') {
        const appendContent = new_text ?? fullContent ?? '';
        if (!appendContent) {
          return { success: false, error: '"append" action requires "new_text" or "content" parameter' };
        }
        const existing = existsSync(resolved) ? readFileSync(resolved, 'utf-8') : '';
        const merged = existing + (existing.endsWith('\n') ? '' : '\n') + appendContent;
        if (this.onBeforeModify && !this.onBeforeModify(resolved, merged)) {
          return { success: false, error: 'Modification rejected by safety callback' };
        }
        writeFileSync(resolved, merged, 'utf-8');
        this.onAfterModify?.(resolved, merged);
        return { success: true, data: { path: filePath, action: 'append', bytesAdded: appendContent.length } };
      }

      // Default: replace
      if (!old_text) {
        return { success: false, error: '"replace" action requires "old_text" parameter' };
      }
      if (!new_text && new_text !== '') {
        return { success: false, error: '"replace" action requires "new_text" parameter' };
      }

      const existing = existsSync(resolved) ? readFileSync(resolved, 'utf-8') : '';

      if (!existing.includes(old_text)) {
        return { success: false, error: `old_text not found in ${filePath}. Read the file first with self_read to see current content.` };
      }

      const occurrenceCount = existing.split(old_text).length - 1;
      if (occurrenceCount > 1) {
        return {
          success: false,
          error: `old_text found ${occurrenceCount} times in ${filePath}. Provide more context to make it unique, or use "write" action to replace the entire file.`,
        };
      }

      const updated = existing.replace(old_text, new_text);
      if (this.onBeforeModify && !this.onBeforeModify(resolved, updated)) {
        return { success: false, error: 'Modification rejected by safety callback' };
      }
      writeFileSync(resolved, updated, 'utf-8');
      this.onAfterModify?.(resolved, updated);

      return {
        success: true,
        data: {
          path: filePath,
          action: 'replace',
          linesAffected: old_text.split('\n').length,
        },
      };
    } catch (err) {
      return { success: false, error: `Modification failed: ${err instanceof Error ? err.message : String(err)}` };
    }
  }
}

// ── SelfListTool ──

/**
 * self_list — 列出自身源码文件结构
 *
 * 让 agent 了解自己的组织结构，找到要改造的目标。
 */
export class SelfListTool implements Tool {
  readonly name = 'self_list';
  readonly description = 'List your own source code files and directories. Use this to explore your own structure and find files to modify or improve.';
  private readonly projectRoot: string;

  constructor(projectRoot?: string) {
    this.projectRoot = projectRoot ?? process.cwd();
  }

  async execute(params: unknown): Promise<ToolResult> {
    const { dir: dirPath, pattern } = params as { dir?: string; pattern?: string };
    const targetDir = dirPath ? resolveProjectPath(dirPath, this.projectRoot) : this.projectRoot;

    try {
      const { readdirSync, statSync } = await import('node:fs');
      if (!existsSync(targetDir)) {
        return { success: false, error: `Directory not found: ${dirPath ?? '.'}` };
      }

      const entries = readdirSync(targetDir, { withFileTypes: true });
      const filtered = entries
        .filter(e => !e.name.startsWith('.') && e.name !== 'node_modules' && e.name !== 'dist')
        .filter(e => {
          if (!pattern) return true;
          return e.name.includes(pattern) || e.isDirectory();
        });

      const result = filtered.map(e => ({
        name: e.name,
        type: e.isDirectory() ? 'dir' : 'file',
        size: e.isFile() ? statSync(join(targetDir, e.name)).size : undefined,
      }));

      return {
        success: true,
        data: {
          path: dirPath ?? '.',
          entries: result,
          total: result.length,
        },
      };
    } catch (err) {
      return { success: false, error: `Failed to list: ${err instanceof Error ? err.message : String(err)}` };
    }
  }
}
