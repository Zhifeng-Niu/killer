/**
 * Tool Executor 测试
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ToolExecutor } from './tool-executor.js';
import {
  getBuiltinTools,
  createToolExecutor,
  ReadFileTool,
  WriteFileTool,
  DeleteFileTool,
  ListDirectoryTool,
  ExecuteShellTool,
  MemoryStoreTool,
  MemoryRetrieveTool,
  MemoryListTool,
  MemoryClearTool,
  WebSearchTool,
  SynapseBroadcastTool,
  SendMessageTool,
} from './builtin-tools.js';
import { promises as fs } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

describe('ToolExecutor', () => {
  let executor: ToolExecutor;

  beforeEach(() => {
    executor = new ToolExecutor();
  });

  it('应该能够注册工具', () => {
    const tool = new ReadFileTool();
    executor.register(tool);

    expect(executor.has('read_file')).toBe(true);
    expect(executor.size()).toBe(1);
  });

  it('应该不允许重复注册相同名称的工具', () => {
    const tool1 = new ReadFileTool();
    const tool2 = new ReadFileTool();

    executor.register(tool1);

    expect(() => executor.register(tool2)).toThrow('Tool already registered');
  });

  it('应该能够注销工具', () => {
    const tool = new ReadFileTool();

    executor.register(tool);
    expect(executor.has('read_file')).toBe(true);

    executor.unregister('read_file');
    expect(executor.has('read_file')).toBe(false);
  });

  it('应该能够执行已注册的工具', async () => {
    const tool = new MemoryStoreTool();

    executor.register(tool);

    const result = await executor.execute('memory_store', { key: 'test', value: 'hello' });

    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();
  });

  it('执行不存在的工具应该返回错误', async () => {
    const result = await executor.execute('nonexistent', {});

    expect(result.success).toBe(false);
    expect(result.error).toContain('Tool not found');
  });

  it('应该列出所有已注册的工具', () => {
    executor.register(new ReadFileTool());
    executor.register(new MemoryStoreTool());
    executor.register(new SynapseBroadcastTool());

    const tools = executor.list();

    expect(tools).toContain('read_file');
    expect(tools).toContain('memory_store');
    expect(tools).toContain('synapse_broadcast');
    expect(tools).toHaveLength(3);
  });

  it('应该获取工具信息', () => {
    executor.register(new ReadFileTool());

    const info = executor.getInfo('read_file');

    expect(info).toEqual({
      name: 'read_file',
      description: 'Read the contents of a file',
      readOnly: true,
    });
  });

  it('应该批量注册工具', () => {
    const tools = [new ReadFileTool(), new MemoryStoreTool()];

    executor.registerAll(tools);

    expect(executor.size()).toBe(2);
  });
});

describe('ReadFileTool', () => {
  const tool = new ReadFileTool();

  it('应该执行文件读取', async () => {
    // 先写入一个临时文件
    const testFile = join(tmpdir(), 'test-read.txt');
    await fs.writeFile(testFile, 'hello world', 'utf-8');

    const result = await tool.execute({ path: testFile });
    expect(result.success).toBe(true);
    expect(result.data).toEqual({ path: testFile, content: 'hello world' });

    await fs.unlink(testFile);
  });

  it('读取不存在的文件应该返回错误', async () => {
    const result = await tool.execute({ path: '/nonexistent/file.txt' });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Failed to read file');
  });

  it('缺少路径参数应该返回错误', async () => {
    const result = await tool.execute({});

    expect(result.success).toBe(false);
    expect(result.error).toContain('File path required');
  });

  it('无效的参数类型应该返回错误', async () => {
    const result = await tool.execute(null);

    expect(result.success).toBe(false);
    expect(result.error).toContain('Invalid params');
  });
});

describe('WriteFileTool', () => {
  const tool = new WriteFileTool();
  const testDir = tmpdir();
  const testFile = join(testDir, 'test-write.txt');

  it('应该写入文件', async () => {
    const result = await tool.execute({
      path: testFile,
      content: 'Hello, World!',
    });

    expect(result.success).toBe(true);
    expect(result.data?.bytesWritten).toBe(13);

    // 验证文件内容
    const content = await fs.readFile(testFile, 'utf-8');
    expect(content).toBe('Hello, World!');

    // 清理
    await fs.unlink(testFile);
  });

  it('缺少路径参数应该返回错误', async () => {
    const result = await tool.execute({ content: 'test' });

    expect(result.success).toBe(false);
    expect(result.error).toContain('File path required');
  });

  it('缺少内容参数应该返回错误', async () => {
    const result = await tool.execute({ path: testFile });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Content required');
  });
});

describe('DeleteFileTool', () => {
  const tool = new DeleteFileTool();
  const testDir = tmpdir();
  const testFile = join(testDir, 'test-delete.txt');

  it('应该删除文件', async () => {
    // 先创建文件
    await fs.writeFile(testFile, 'test content');

    const result = await tool.execute({ path: testFile });

    expect(result.success).toBe(true);
    expect(result.data?.deleted).toBe(true);

    // 验证文件已删除
    const exists = await fs.access(testFile).then(() => true).catch(() => false);
    expect(exists).toBe(false);
  });

  it('删除不存在的文件应该返回错误', async () => {
    const result = await tool.execute({ path: '/nonexistent/file.txt' });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Failed to delete file');
  });
});

describe('ListDirectoryTool', () => {
  const tool = new ListDirectoryTool();

  it('应该列出当前目录', async () => {
    const result = await tool.execute({ path: '.' });

    expect(result.success).toBe(true);
    expect(result.data?.entries).toBeInstanceOf(Array);
  });

  it('应该支持递归列出', async () => {
    const result = await tool.execute({ path: '.', recursive: true });

    expect(result.success).toBe(true);
    expect(result.data?.entries).toBeInstanceOf(Array);
  });

  it('无效的目录应该返回错误', async () => {
    const result = await tool.execute({ path: '/nonexistent/directory' });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Failed to list directory');
  });
});

describe('ExecuteShellTool', () => {
  const tool = new ExecuteShellTool();

  it('应该执行 shell 命令', async () => {
    const result = await tool.execute({ command: 'echo "hello"' });

    expect(result.success).toBe(true);
    expect(result.data?.stdout).toContain('hello');
  });

  it('应该处理命令失败', async () => {
    const result = await tool.execute({ command: 'exit 1' });

    expect(result.success).toBe(false);
    expect(result.data?.exitCode).not.toBe(0);
  });

  it('缺少命令参数应该返回错误', async () => {
    const result = await tool.execute({});

    expect(result.success).toBe(false);
    expect(result.error).toContain('Command required');
  });
});

describe('MemoryStoreTool', () => {
  const tool = new MemoryStoreTool();

  it('应该存储数据', async () => {
    const result = await tool.execute({ key: 'test_key', value: 'test_value' });

    expect(result.success).toBe(true);
    expect(result.data?.stored).toBe(true);
  });

  it('缺少 key 参数应该返回错误', async () => {
    const result = await tool.execute({ value: 'test' });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Key required');
  });
});

describe('MemoryRetrieveTool', () => {
  const storeTool = new MemoryStoreTool();
  const retrieveTool = new MemoryRetrieveTool();

  it('应该检索存储的数据', async () => {
    await storeTool.execute({ key: 'test_key', value: 'test_value' });

    const result = await retrieveTool.execute({ key: 'test_key' });

    expect(result.success).toBe(true);
    expect(result.data?.value).toBe('test_value');
  });

  it('检索不存在的 key 应该返回错误', async () => {
    const result = await retrieveTool.execute({ key: 'nonexistent_key' });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Key not found');
  });
});

describe('MemoryListTool', () => {
  const tool = new MemoryListTool();

  it('应该列出所有 key', async () => {
    // 先清空确保干净状态
    const clearTool = new MemoryClearTool();
    await clearTool.execute({});

    const storeTool = new MemoryStoreTool();
    await storeTool.execute({ key: 'key1', value: 'value1' });
    await storeTool.execute({ key: 'key2', value: 'value2' });

    const result = await tool.execute({});

    expect(result.success).toBe(true);
    expect(result.data?.keys).toContain('key1');
    expect(result.data?.keys).toContain('key2');
    expect(result.data?.count).toBe(2);
  });
});

describe('MemoryClearTool', () => {
  const tool = new MemoryClearTool();

  it('应该清空所有内存', async () => {
    const storeTool = new MemoryStoreTool();
    await storeTool.execute({ key: 'test', value: 'value' });

    const result = await tool.execute({});

    expect(result.success).toBe(true);
    expect(result.data?.cleared).toBeGreaterThan(0);

    // 验证内存已清空
    const listTool = new MemoryListTool();
    const listResult = await listTool.execute({});
    expect(listResult.data?.count).toBe(0);
  });
});

describe('WebSearchTool', () => {
  const tool = new WebSearchTool();

  it('应该返回搜索结果', async () => {
    // Mock fetch to return DDG HTML results
    const mockHtml = Array.from({ length: 5 }, (_, i) =>
      `<a class="result__a" href="https://example.com/${i}">Result ${i}</a><a class="result__snippet">Snippet ${i}</a>`
    ).join('');

    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve(mockHtml),
    });

    try {
      const result = await tool.execute({ query: 'test search', limit: 5 });
      expect(result.success).toBe(true);
      expect(result.data?.results).toBeInstanceOf(Array);
      expect(result.data?.results).toHaveLength(5);
      expect(result.data?.query).toBe('test search');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('缺少查询参数应该返回错误', async () => {
    const result = await tool.execute({});

    expect(result.success).toBe(false);
    expect(result.error).toContain('Query required');
  });

  it('应该支持自定义结果数量', async () => {
    const mockHtml = Array.from({ length: 5 }, (_, i) =>
      `<a class="result__a" href="https://example.com/${i}">Result ${i}</a><a class="result__snippet">Snippet ${i}</a>`
    ).join('');

    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve(mockHtml),
    });

    try {
      const result = await tool.execute({ query: 'test', limit: 3 });
      expect(result.success).toBe(true);
      expect(result.data?.results).toHaveLength(3);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

describe('SynapseBroadcastTool', () => {
  const tool = new SynapseBroadcastTool();

  it('应该广播消息（模拟）', async () => {
    const result = await tool.execute({ message: 'Hello, Cells!' });

    expect(result.success).toBe(true);
    expect(result.data?.message).toBe('Hello, Cells!');
    expect(result.data?.target).toBe('all');
    expect(result.data?.timestamp).toBeDefined();
  });

  it('应该支持指定目标', async () => {
    const result = await tool.execute({
      message: 'Test',
      target: 'cell_1',
    });

    expect(result.success).toBe(true);
    expect(result.data?.target).toBe('cell_1');
  });

  it('缺少消息参数应该返回错误', async () => {
    const result = await tool.execute({ target: 'cell_1' });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Message required');
  });
});

describe('SendMessageTool', () => {
  const tool = new SendMessageTool();

  it('应该发送消息到指定 Cell（模拟）', async () => {
    const result = await tool.execute({
      target: 'cell_1',
      message: 'Hello!',
      type: 'info',
    });

    expect(result.success).toBe(true);
    expect(result.data?.delivered).toBe(true);
    expect(result.data?.timestamp).toBeDefined();
  });

  it('缺少目标参数应该返回错误', async () => {
    const result = await tool.execute({ message: 'test' });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Target cell ID required');
  });

  it('缺少消息参数应该返回错误', async () => {
    const result = await tool.execute({ target: 'cell_1' });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Message required');
  });
});

describe('getBuiltinTools', () => {
  it('应该返回所有内置工具', () => {
    const tools = getBuiltinTools();

    expect(tools.length).toBeGreaterThan(0);
    expect(tools.find((t) => t.name === 'read_file')).toBeDefined();
    expect(tools.find((t) => t.name === 'write_file')).toBeDefined();
    expect(tools.find((t) => t.name === 'execute_shell')).toBeDefined();
    expect(tools.find((t) => t.name === 'memory_store')).toBeDefined();
    expect(tools.find((t) => t.name === 'web_search')).toBeDefined();
    expect(tools.find((t) => t.name === 'synapse_broadcast')).toBeDefined();
  });
});

describe('createToolExecutor', () => {
  it('应该创建预装所有内置工具的执行器', () => {
    const executor = createToolExecutor();

    expect(executor.size()).toBeGreaterThan(0);
    expect(executor.has('read_file')).toBe(true);
    expect(executor.has('write_file')).toBe(true);
    expect(executor.has('delete_file')).toBe(true);
    expect(executor.has('list_directory')).toBe(true);
    expect(executor.has('execute_shell')).toBe(true);
    expect(executor.has('memory_store')).toBe(true);
    expect(executor.has('memory_retrieve')).toBe(true);
    expect(executor.has('memory_list')).toBe(true);
    expect(executor.has('memory_clear')).toBe(true);
    expect(executor.has('web_search')).toBe(true);
    expect(executor.has('synapse_broadcast')).toBe(true);
    expect(executor.has('send_message')).toBe(true);
  });
});
