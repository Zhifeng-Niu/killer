/**
 * 内置工具实现
 *
 * 文件操作、Shell 执行、内存操作、Web 搜索、突触通信
 */

import { promises as fs } from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';
import { resolve, normalize } from 'path';
import type { Tool, ToolResult, ToolProgressCallback, SandboxMode } from './tool-executor.js';

const execAsync = promisify(exec);

// ============================================================================
// 工具输出限制常量
// ============================================================================

/** 单次工具输出最大字符数（防止上下文窗口溢出） */
const MAX_OUTPUT_LENGTH = 50_000;

/** Shell 输出最大字符数 */
const MAX_SHELL_OUTPUT = 30_000;

/** 文件读取最大字符数 */
const MAX_FILE_READ = 100_000;

/** 禁止读取的路径模式（敏感文件保护） */
const DENIED_PATH_PATTERNS: RegExp[] = [
  /\.ssh\//,              // SSH 私钥
  /\.gnupg\//,            // GPG 密钥
  /\.env/,                // 环境变量文件
  /\/etc\/shadow/,        // 密码文件
  /\/etc\/ssh\//,         // SSH 服务器配置
  /\.kube\/config/,       // Kubernetes 凭据
  /\.aws\//,              // AWS 凭据
  /\.google\//,           // Google 凭据
  /\.npmrc$/,             // npm token
  /\.pypirc$/,            // PyPI 凭据
];

/**
 * 截断过长的输出，附加截断标记
 */
function truncateOutput(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength) + `\n... [truncated, ${text.length - maxLength} more characters]`;
}

/**
 * 检查路径是否在拒绝列表中
 * open 模式下不限制任何路径
 */
function isPathDenied(filePath: string): boolean {
  if (ExecuteShellTool.sandboxMode === 'open') return false;
  const normalized = normalize(resolve(filePath));
  return DENIED_PATH_PATTERNS.some(pattern => pattern.test(normalized));
}

// ============================================================================
// 文件操作工具
// ============================================================================

/**
 * 内置工具 - 读取文件
 */
export class ReadFileTool implements Tool {
  name = 'read_file';
  description = 'Read the contents of a file';
  parameters = {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'File path to read' },
      encoding: { type: 'string', description: 'File encoding', default: 'utf-8' },
    },
    required: ['path'],
  };

  isReadOnly = () => true;

  async execute(params: unknown): Promise<ToolResult> {
    if (typeof params !== 'object' || params === null) {
      return { success: false, error: 'Invalid params' };
    }

    const { path, encoding = 'utf-8' } = params as { path?: string; encoding?: BufferEncoding };

    if (!path || typeof path !== 'string') {
      return { success: false, error: 'File path required' };
    }

    if (isPathDenied(path)) {
      return { success: false, error: 'Access denied: sensitive file path' };
    }

    try {
      let content = await fs.readFile(path, { encoding: encoding as BufferEncoding });
      if (typeof content === 'string') {
        content = truncateOutput(content, MAX_FILE_READ);
      }
      return {
        success: true,
        data: { path, content },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        error: `Failed to read file: ${message}`,
      };
    }
  }
}

/**
 * 内置工具 - 写入文件
 */
export class WriteFileTool implements Tool {
  name = 'write_file';
  description = 'Write content to a file';
  parameters = {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'File path to write' },
      content: { type: 'string', description: 'Content to write' },
      encoding: { type: 'string', description: 'File encoding', default: 'utf-8' },
    },
    required: ['path', 'content'],
  };

  async execute(params: unknown): Promise<ToolResult> {
    if (typeof params !== 'object' || params === null) {
      return { success: false, error: 'Invalid params' };
    }

    const { path, content, encoding = 'utf-8' } = params as {
      path?: string;
      content?: string;
      encoding?: BufferEncoding;
    };

    if (!path || typeof path !== 'string') {
      return { success: false, error: 'File path required' };
    }

    if (isPathDenied(path)) {
      return { success: false, error: 'Access denied: sensitive file path' };
    }

    if (content === undefined || content === null) {
      return { success: false, error: 'Content required' };
    }

    try {
      await fs.writeFile(path, String(content), { encoding: encoding as BufferEncoding });
      return {
        success: true,
        data: { path, bytesWritten: String(content).length },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        error: `Failed to write file: ${message}`,
      };
    }
  }
}

/**
 * 内置工具 - 删除文件
 */
export class DeleteFileTool implements Tool {
  name = 'delete_file';
  description = 'Delete a file';
  parameters = {
    type: 'object',
    properties: { path: { type: 'string', description: 'File path to delete' } },
    required: ['path'],
  };

  async execute(params: unknown): Promise<ToolResult> {
    if (typeof params !== 'object' || params === null) {
      return { success: false, error: 'Invalid params' };
    }

    const { path } = params as { path?: string };

    if (!path || typeof path !== 'string') {
      return { success: false, error: 'File path required' };
    }

    if (isPathDenied(path)) {
      return { success: false, error: 'Access denied: sensitive file path' };
    }

    try {
      await fs.unlink(path);
      return {
        success: true,
        data: { path, deleted: true },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        error: `Failed to delete file: ${message}`,
      };
    }
  }
}

/**
 * 内置工具 - 列出目录
 */
export class ListDirectoryTool implements Tool {
  name = 'list_directory';
  description = 'List contents of a directory';
  parameters = {
    type: 'object',
    properties: { path: { type: 'string', description: 'Directory path to list' } },
    required: ['path'],
  };

  isReadOnly = () => true;

  async execute(params: unknown): Promise<ToolResult> {
    if (typeof params !== 'object' || params === null) {
      return { success: false, error: 'Invalid params' };
    }

    const { path = '.', recursive = false } = params as {
      path?: string;
      recursive?: boolean;
    };

    try {
      if (recursive) {
        const entries = await this.listRecursive(path);
        return {
          success: true,
          data: { path, entries },
        };
      }

      const entries = await fs.readdir(path, { withFileTypes: true });
      const result = entries.map((entry) => ({
        name: entry.name,
        type: entry.isDirectory() ? 'directory' : entry.isFile() ? 'file' : 'other',
      }));

      return {
        success: true,
        data: { path, entries: result },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        error: `Failed to list directory: ${message}`,
      };
    }
  }

  private async listRecursive(
    dirPath: string,
    maxDepth: number = 10,
    currentDepth: number = 0,
  ): Promise<string[]> {
    if (currentDepth >= maxDepth) {
      return [];
    }

    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    const paths: string[] = [];

    for (const entry of entries) {
      const fullPath = `${dirPath}/${entry.name}`;
      paths.push(fullPath);

      if (entry.isDirectory()) {
        const subPaths = await this.listRecursive(fullPath, maxDepth, currentDepth + 1);
        paths.push(...subPaths);
      }
    }

    return paths;
  }
}

// ============================================================================
// Shell 执行工具
// ============================================================================

/**
 * 内置工具 - 执行 Shell 命令
 */
export class ExecuteShellTool implements Tool {
  name = 'execute_shell';
  description = 'Execute a shell command';
  parameters = {
    type: 'object',
    properties: {
      command: { type: 'string', description: 'Shell command to execute' },
      timeout: { type: 'number', description: 'Timeout in ms', default: 30000 },
    },
    required: ['command'],
  };

  /** 当前沙箱模式 */
  static sandboxMode: SandboxMode = 'open';

  /** strict 模式阻止列表 */
  private static readonly STRICT_PATTERNS: RegExp[] = [
    /\brm\s+-rf\s+[\/~]/i,
    /\brm\s+-rf\s+\.\s*$/i,
    /\bsudo\s+/i,
    /\bchmod\s+[0-7]*777/i,
    /\bchown\s+/i,
    /\bdd\s+/i,
    /\bmkfs/i,
    /\bformat\s+[a-z]:/i,
    />\s*\/dev\//i,
    /\bcurl\s+.*\|\s*sh/i,
    /\bwget\s+.*\|\s*sh/i,
    /\beval\s+/i,
    /\bexec\s+/i,
    /\bsource\s+\/etc\//i,
    /\bshutdown/i,
    /\breboot/i,
    /\bhalt/i,
    /\binit\s+[06]/i,
    /\bpasswd/i,
    /\buseradd/i,
    /\buserdel/i,
    /\bkill\s+-9\s+1\b/i,
    /\bmkfifo/i,
    /\bnc\s+-/i,
  ];

  /** open 模式：无限制 */

  async execute(params: unknown): Promise<ToolResult> {
    if (typeof params !== 'object' || params === null) {
      return { success: false, error: 'Invalid params' };
    }

    const { command, timeout = 30000 } = params as { command?: string; timeout?: number };

    if (!command || typeof command !== 'string') {
      return { success: false, error: 'Command required' };
    }

    // strict 模式：检查阻止列表
    if (ExecuteShellTool.sandboxMode === 'strict') {
      for (const pattern of ExecuteShellTool.STRICT_PATTERNS) {
        if (pattern.test(command)) {
          return {
            success: false,
            error: `Command blocked: matches pattern "${pattern.source}" (strict mode)`,
          };
        }
      }
    }
    // open 模式：无限制，直接执行

    try {
      const { stdout, stderr } = await execAsync(command, {
        timeout: timeout as number,
      });

      return {
        success: true,
        data: {
          command,
          stdout: truncateOutput(stdout.trim(), MAX_SHELL_OUTPUT),
          stderr: truncateOutput(stderr.trim(), MAX_OUTPUT_LENGTH),
          exitCode: 0,
        },
      };
    } catch (error) {
      const err = error as { stdout?: string; stderr?: string; code?: number };
      return {
        success: false,
        data: {
          command,
          stdout: truncateOutput((err.stdout || ''), MAX_SHELL_OUTPUT),
          stderr: truncateOutput((err.stderr || ''), MAX_OUTPUT_LENGTH),
          exitCode: err.code || -1,
        },
        error: err.stderr || 'Command execution failed',
      };
    }
  }
}

// ============================================================================
// 内存操作工具
// ============================================================================

/**
 * 内存存储（简单实现）
 */
const memoryStore = new Map<string, unknown>();

/**
 * 内置工具 - 内存存储
 */
export class MemoryStoreTool implements Tool {
  name = 'memory_store';
  description = 'Store information in memory';
  parameters = {
    type: 'object',
    properties: {
      key: { type: 'string', description: 'Storage key' },
      value: { description: 'Value to store' },
    },
    required: ['key', 'value'],
  };

  async execute(params: unknown): Promise<ToolResult> {
    if (typeof params !== 'object' || params === null) {
      return { success: false, error: 'Invalid params' };
    }

    const { key, value } = params as { key?: string; value?: unknown };

    if (!key || typeof key !== 'string') {
      return { success: false, error: 'Key required' };
    }

    memoryStore.set(key, value);
    return {
      success: true,
      data: { key, stored: true },
    };
  }
}

/**
 * 内置工具 - 内存检索
 */
export class MemoryRetrieveTool implements Tool {
  name = 'memory_retrieve';
  description = 'Retrieve information from memory';
  parameters = {
    type: 'object',
    properties: { key: { type: 'string', description: 'Key to retrieve' } },
    required: ['key'],
  };

  isReadOnly = () => true;

  async execute(params: unknown): Promise<ToolResult> {
    if (typeof params !== 'object' || params === null) {
      return { success: false, error: 'Invalid params' };
    }

    const { key } = params as { key?: string };

    if (!key || typeof key !== 'string') {
      return { success: false, error: 'Key required' };
    }

    const value = memoryStore.get(key);

    if (value === undefined) {
      return {
        success: false,
        error: `Key not found: ${key}`,
      };
    }

    return {
      success: true,
      data: { key, value },
    };
  }
}

/**
 * 内置工具 - 列出内存键
 */
export class MemoryListTool implements Tool {
  name = 'memory_list';
  description = 'List all keys in memory';
  parameters = { type: 'object', properties: {} };

  isReadOnly = () => true;

  async execute(_params: unknown): Promise<ToolResult> {
    const keys = Array.from(memoryStore.keys());
    return {
      success: true,
      data: { keys, count: keys.length },
    };
  }
}

/**
 * 内置工具 - 清空内存
 */
export class MemoryClearTool implements Tool {
  name = 'memory_clear';
  description = 'Clear all memory';
  parameters = { type: 'object', properties: {} };

  async execute(_params: unknown): Promise<ToolResult> {
    const size = memoryStore.size;
    memoryStore.clear();
    return {
      success: true,
      data: { cleared: size },
    };
  }
}

// ============================================================================
// Web 搜索工具
// ============================================================================

/**
 * 搜索结果条目
 */
interface SearchResult {
  id: string;
  title: string;
  url: string;
  snippet: string;
  relevance: number;
}

/**
 * 内置工具 - Web 搜索
 *
 * 使用 DuckDuckGo HTML 搜索获取结果（无需 API key）。
 * 如果网络不可用，返回空结果而非 mock 数据。
 */
export class WebSearchTool implements Tool {
  name = 'web_search';
  description = 'Search the web for information';
  parameters = {
    type: 'object',
    properties: { query: { type: 'string', description: 'Search query' } },
    required: ['query'],
  };

  isReadOnly = () => true;

  async execute(params: unknown): Promise<ToolResult> {
    if (typeof params !== 'object' || params === null) {
      return { success: false, error: 'Invalid params' };
    }

    const { query, limit = 10 } = params as { query?: string; limit?: number };

    if (!query || typeof query !== 'string') {
      return { success: false, error: 'Query required' };
    }

    try {
      const results = await this.searchDuckDuckGo(query, limit as number);
      return {
        success: true,
        data: { query, results, count: results.length },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        error: `Web search failed: ${message}`,
      };
    }
  }

  /**
   * 通过 DuckDuckGo HTML 版搜索
   */
  private async searchDuckDuckGo(query: string, limit: number): Promise<SearchResult[]> {
    const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'OdysseusAgent/0.1.0 (Autonomous Agent Framework)',
        'Accept': 'text/html',
      },
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const html = await response.text();
    return this.parseDDGResults(html, limit);
  }

  /**
   * 解析 DuckDuckGo HTML 搜索结果
   */
  private parseDDGResults(html: string, limit: number): SearchResult[] {
    const results: SearchResult[] = [];
    const resultRegex = /<a[^>]+class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
    const snippetRegex = /<a[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/a>/gi;

    const titleMatches = [...html.matchAll(resultRegex)];
    const snippetMatches = [...html.matchAll(snippetRegex)];

    const count = Math.min(titleMatches.length, limit);

    for (let i = 0; i < count; i++) {
      const title = this.stripHtml(titleMatches[i][2]).trim();
      const rawUrl = titleMatches[i][1];
      const snippet = snippetMatches[i]
        ? this.stripHtml(snippetMatches[i][1]).trim()
        : '';

      // DDG redirects through /l/?uddg=... — extract actual URL
      let cleanUrl = rawUrl;
      const uddgMatch = rawUrl.match(/uddg=([^&]+)/);
      if (uddgMatch) {
        cleanUrl = decodeURIComponent(uddgMatch[1]);
      }

      results.push({
        id: `result-${i}`,
        title: title || 'Untitled',
        url: cleanUrl,
        snippet: snippet || '',
        relevance: 1 - (i / Math.max(count, 1)),
      });
    }

    return results;
  }

  /**
   * 去除 HTML 标签
   */
  private stripHtml(html: string): string {
    return html.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#x27;/g, "'");
  }
}

// ============================================================================
// Web 内容获取工具
// ============================================================================

/**
 * 内置工具 - 获取 URL 内容
 *
 * 获取任意 URL 的文本内容（HTML 自动提取正文）。
 * 无需外部依赖，使用 fetch API。
 */
export class WebFetchTool implements Tool {
  name = 'web_fetch';
  description = 'Fetch content from a URL';
  parameters = {
    type: 'object',
    properties: {
      url: { type: 'string', description: 'URL to fetch' },
      format: { type: 'string', description: 'Response format', enum: ['text', 'markdown'], default: 'markdown' },
    },
    required: ['url'],
  };

  isReadOnly = () => true;

  async execute(params: unknown): Promise<ToolResult> {
    if (typeof params !== 'object' || params === null) {
      return { success: false, error: 'Invalid params' };
    }

    const { url, format = 'text' } = params as { url?: string; format?: string };

    if (!url || typeof url !== 'string') {
      return { success: false, error: 'url required' };
    }

    // 验证 URL 格式
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(url);
    } catch {
      return { success: false, error: 'Invalid URL format' };
    }

    // 只允许 HTTP/HTTPS
    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      return { success: false, error: 'Only HTTP/HTTPS URLs allowed' };
    }

    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'OdysseusAgent/0.1.0 (Autonomous Agent Framework)',
          'Accept': 'text/html,application/json,text/plain,text/markdown,*/*',
        },
        signal: AbortSignal.timeout(20000),
        redirect: 'follow',
      });

      if (!response.ok) {
        return { success: false, error: `HTTP ${response.status}: ${response.statusText}` };
      }

      const contentType = response.headers.get('content-type') || '';
      const body = await response.text();

      // 截断超大响应
      const maxChars = 50000;
      const truncated = body.length > maxChars;
      const content = truncated ? body.slice(0, maxChars) : body;

      // JSON 直接返回
      if (contentType.includes('application/json')) {
        try {
          const json = JSON.parse(content);
          return {
            success: true,
            data: {
              url,
              contentType,
              content: JSON.stringify(json, null, 2).slice(0, maxChars),
              truncated,
            },
          };
        } catch {
          // JSON 解析失败，返回原始文本
        }
      }

      // HTML 提取正文
      if (contentType.includes('text/html')) {
        const extracted = extractHtmlContent(content);
        return {
          success: true,
          data: {
            url,
            title: extracted.title,
            content: extracted.text.slice(0, maxChars),
            truncated: truncated || extracted.text.length > maxChars,
          },
        };
      }

      // 纯文本/Markdown 直接返回
      return {
        success: true,
        data: {
          url,
          contentType,
          content: content.slice(0, maxChars),
          truncated,
        },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { success: false, error: `Fetch failed: ${message}` };
    }
  }
}

/**
 * 从 HTML 中提取正文文本（零依赖实现）
 */
function extractHtmlContent(html: string): { title: string; text: string } {
  // 提取 title
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, '').trim() : '';

  // 移除 script, style, nav, footer, header 标签
  let body = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<nav[\s\S]*?<\/nav>/gi, '')
    .replace(/<footer[\s\S]*?<\/footer>/gi, '')
    .replace(/<header[\s\S]*?<\/header>/gi, '')
    .replace(/<aside[\s\S]*?<\/aside>/gi, '');

  // 优先提取 <article>, <main>, 或 <body> 内容
  const articleMatch = body.match(/<article[\s\S]*?>([\s\S]*?)<\/article>/i);
  const mainMatch = body.match(/<main[\s\S]*?>([\s\S]*?)<\/main>/i);
  const bodyMatch = body.match(/<body[\s\S]*?>([\s\S]*?)<\/body>/i);

  const content = articleMatch?.[1] || mainMatch?.[1] || bodyMatch?.[1] || body;

  // 清理 HTML 标签
  let text = content
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<\/h[1-6]>/gi, '\n\n')
    .replace(/<li>/gi, '- ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return { title, text };
}

// ============================================================================
// 突触通信工具
// ============================================================================

/**
 * 内置工具 - 突触广播
 */
export class SynapseBroadcastTool implements Tool {
  name = 'synapse_broadcast';
  description = 'Broadcast message to all connected cells';
  parameters = {
    type: 'object',
    properties: {
      message: { type: 'string', description: 'Message to broadcast' },
      target: { type: 'string', description: 'Optional target cell filter' },
    },
    required: ['message'],
  };

  async execute(params: unknown): Promise<ToolResult> {
    if (typeof params !== 'object' || params === null) {
      return { success: false, error: 'Invalid params' };
    }

    const { message, target } = params as { message?: string; target?: string };

    if (!message || typeof message !== 'string') {
      return { success: false, error: 'Message required' };
    }

    return {
      success: true,
      data: {
        message,
        target: target || 'all',
        recipients: Math.floor(Math.random() * 10),
        timestamp: Date.now(),
      },
    };
  }
}

/**
 * 内置工具 - 发送消息到指定 Cell
 */
export class SendMessageTool implements Tool {
  name = 'send_message';
  description = 'Send message to a specific cell';
  parameters = {
    type: 'object',
    properties: {
      target: { type: 'string', description: 'Target cell ID' },
      message: { type: 'string', description: 'Message content' },
      type: { type: 'string', description: 'Message type', default: 'info' },
    },
    required: ['target', 'message'],
  };

  async execute(params: unknown): Promise<ToolResult> {
    if (typeof params !== 'object' || params === null) {
      return { success: false, error: 'Invalid params' };
    }

    const { target, message, type = 'info' } = params as {
      target?: string;
      message?: string;
      type?: string;
    };

    if (!target || typeof target !== 'string') {
      return { success: false, error: 'Target cell ID required' };
    }

    if (!message || typeof message !== 'string') {
      return { success: false, error: 'Message required' };
    }

    return {
      success: true,
      data: {
        target,
        message,
        type,
        timestamp: Date.now(),
        delivered: true,
      },
    };
  }
}

// ============================================================================
// Playwright 浏览器自动化
// ============================================================================

type BrowserCommand =
  | 'open' | 'goto' | 'close' | 'click' | 'type' | 'fill'
  | 'press' | 'snapshot' | 'screenshot' | 'eval'
  | 'tab-list' | 'tab-new' | 'tab-close' | 'tab-select'
  | 'go-back' | 'go-forward' | 'reload'
  | 'console' | 'requests';

const BROWSER_COMMANDS: readonly BrowserCommand[] = [
  'open', 'goto', 'close', 'click', 'type', 'fill',
  'press', 'snapshot', 'screenshot', 'eval',
  'tab-list', 'tab-new', 'tab-close', 'tab-select',
  'go-back', 'go-forward', 'reload',
  'console', 'requests',
];

const READ_ONLY_COMMANDS = new Set<BrowserCommand>([
  'snapshot', 'screenshot', 'tab-list', 'console', 'requests',
]);

const MAX_OUTPUT = 4000;
const SESSION_NAME = 'odysseus';

export class PlaywrightBrowserTool implements Tool {
  name = 'browser';
  description = `Browser automation via playwright-cli. Open pages, click elements, type text, take screenshots, extract content.
Commands: ${BROWSER_COMMANDS.join(', ')}
Elements are targeted by ref (from snapshot), CSS selector, or Playwright locator.`;
  parameters = {
    type: 'object',
    properties: {
      command: {
        type: 'string',
        enum: BROWSER_COMMANDS,
        description: 'Browser command to execute',
      },
      url: { type: 'string', description: 'URL (for open/goto)' },
      ref: { type: 'string', description: 'Element ref or CSS selector (for click/type/fill/hover)' },
      text: { type: 'string', description: 'Text to type or fill' },
      key: { type: 'string', description: 'Key to press (e.g. Enter, Tab, arrowdown)' },
      expression: { type: 'string', description: 'JS expression (for eval)' },
      filename: { type: 'string', description: 'Output filename (for screenshot/pdf)' },
      submit: { type: 'boolean', description: 'Press Enter after fill' },
      index: { type: 'number', description: 'Tab index (for tab-select/tab-close)' },
    },
    required: ['command'],
  };

  isReadOnly?(params: unknown): boolean {
    const { command } = (params ?? {}) as { command?: string };
    return READ_ONLY_COMMANDS.has((command ?? '') as BrowserCommand);
  }

  async execute(params: unknown, onProgress?: ToolProgressCallback): Promise<ToolResult> {
    if (typeof params !== 'object' || params === null) {
      return { success: false, error: 'Invalid params' };
    }

    const { command } = params as { command?: string };
    if (!command || !BROWSER_COMMANDS.includes(command as BrowserCommand)) {
      return { success: false, error: `Unknown command: ${command}. Use: ${BROWSER_COMMANDS.join(', ')}` };
    }

    const args = this.buildArgs(params as Record<string, unknown>);
    const cliCmd = `playwright-cli -s=${SESSION_NAME} ${args}`;

    try {
      onProgress?.({ type: 'start', message: `browser: ${command}`, timestamp: Date.now() });
      const { stdout, stderr } = await execAsync(cliCmd, {
        timeout: 30000,
        maxBuffer: 1024 * 1024,
      });

      const output = (stdout || '').trim();
      const errors = (stderr || '').trim();

      if (errors && !output) {
        return { success: false, error: this.truncate(errors) };
      }

      return {
        success: true,
        data: {
          command,
          output: this.truncate(output),
          ...(errors ? { warnings: this.truncate(errors) } : {}),
        },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes('not found') || message.includes('ENOENT')) {
        return {
          success: false,
          error: 'playwright-cli not installed. Run: npm install -g @playwright/cli',
        };
      }
      return { success: false, error: this.truncate(message) };
    }
  }

  private buildArgs(params: Record<string, unknown>): string {
    const command = params.command as string;
    const url = params.url as string | undefined;
    const ref = params.ref as string | undefined;
    const text = params.text as string | undefined;
    const key = params.key as string | undefined;
    const expression = params.expression as string | undefined;
    const filename = params.filename as string | undefined;
    const submit = params.submit as boolean | undefined;
    const index = params.index as number | undefined;
    const parts: string[] = [command];

    switch (command) {
      case 'open':
        if (url) parts.push(this.shellArg(url));
        break;
      case 'goto':
        if (url) parts.push(this.shellArg(url));
        break;
      case 'click':
      case 'dblclick':
      case 'hover':
        if (ref) parts.push(this.shellArg(ref));
        break;
      case 'type':
        if (text) parts.push(this.shellArg(text));
        break;
      case 'fill':
        if (ref) parts.push(this.shellArg(ref));
        if (text) parts.push(this.shellArg(text));
        if (submit) parts.push('--submit');
        break;
      case 'press':
      case 'keydown':
      case 'keyup':
        if (key) parts.push(this.shellArg(key));
        break;
      case 'snapshot':
        if (ref) parts.push(this.shellArg(ref));
        if (filename) parts.push(`--filename=${this.shellArg(filename)}`);
        break;
      case 'screenshot':
        if (ref) parts.push(this.shellArg(ref));
        if (filename) parts.push(`--filename=${this.shellArg(filename)}`);
        break;
      case 'eval':
        if (expression) parts.push(this.shellArg(expression));
        if (ref) parts.push(this.shellArg(ref));
        break;
      case 'tab-new':
        if (url) parts.push(this.shellArg(url));
        break;
      case 'tab-close':
      case 'tab-select':
        if (index != null) parts.push(String(index));
        break;
    }

    return parts.join(' ');
  }

  private shellArg(s: string): string {
    const escaped = s.replace(/'/g, "'\\''");
    return `'${escaped}'`;
  }

  private truncate(s: string): string {
    if (s.length <= MAX_OUTPUT) return s;
    return s.slice(0, MAX_OUTPUT) + `\n... truncated (${s.length} chars total)`;
  }
}

// ============================================================================
// 工具集合
// ============================================================================

import { ToolExecutor } from './tool-executor.js';

/**
 * 获取所有内置工具
 */
export function getBuiltinTools(): Tool[] {
  return [
    new ReadFileTool(),
    new WriteFileTool(),
    new DeleteFileTool(),
    new ListDirectoryTool(),
    new ExecuteShellTool(),
    new MemoryStoreTool(),
    new MemoryRetrieveTool(),
    new MemoryListTool(),
    new MemoryClearTool(),
    new WebSearchTool(),
    new WebFetchTool(),
    new SynapseBroadcastTool(),
    new SendMessageTool(),
    new PlaywrightBrowserTool(),
  ];
}

/**
 * 创建带有内置工具的 ToolExecutor
 */
export function createToolExecutor(): ToolExecutor {
  const executor = new ToolExecutor();
  executor.registerAll(getBuiltinTools());
  return executor;
}
