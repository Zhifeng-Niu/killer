/**
 * Plugin Lifecycle Tests
 *
 * Tests for plugin loading, registration, and unloading.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  loadPlugins,
  registerPlugin,
  unloadPlugin,
  type PluginLifecycleDeps,
} from '../orchestrator/plugin-lifecycle.js';
import type { OdysseusPlugin } from '../plugins/types.js';

function createMockToolExecutor() {
  const tools = new Map<string, { name: string; description: string; execute: (p: unknown) => Promise<unknown> }>();
  return {
    register: vi.fn().mockImplementation((tool: { name: string; description: string; execute: (p: unknown) => Promise<unknown> }) => {
      tools.set(tool.name, tool);
    }),
    list: vi.fn().mockReturnValue(Array.from(tools.keys())),
    getInfo: vi.fn().mockImplementation((name: string) => tools.get(name) ?? null),
    _tools: tools,
  };
}

function createMockPluginManager(overrides: Record<string, unknown> = {}) {
  const pluginTools: Array<{ name: string; description: string; execute: (params: unknown) => Promise<{ success: boolean; data?: unknown; error?: string }> }> = [];
  const commands = new Map<string, { description: string; handler: (args: string) => Promise<string> }>();

  return {
    loadFromDirectory: vi.fn().mockResolvedValue(0),
    getPluginTools: vi.fn().mockReturnValue(pluginTools),
    getPluginCommands: vi.fn().mockReturnValue(commands),
    register: vi.fn().mockResolvedValue(undefined),
    unload: vi.fn().mockResolvedValue(true),
    _pluginTools: pluginTools,
    _commands: commands,
    ...overrides,
  };
}

function createMockLogger() {
  return {
    info: vi.fn(),
    error: vi.fn(),
  };
}

function createMockDeps(overrides: Partial<PluginLifecycleDeps> = {}): PluginLifecycleDeps {
  return {
    pluginManager: createMockPluginManager() as never,
    tools: createMockToolExecutor() as never,
    logger: createMockLogger(),
    ...overrides,
  } as PluginLifecycleDeps;
}

function createTestPlugin(name = 'test-plugin'): OdysseusPlugin {
  return {
    manifest: { name, version: '1.0.0', description: 'Test plugin' },
    init: vi.fn().mockResolvedValue(undefined),
    destroy: vi.fn().mockResolvedValue(undefined),
  };
}

describe('plugin-lifecycle', () => {
  describe('loadPlugins', () => {
    it('should attempt to load from both project and home plugin dirs', async () => {
      const pm = createMockPluginManager();
      const deps = createMockDeps({ pluginManager: pm as never });

      await loadPlugins(deps);

      // Called once for cwd plugins dir, once for homedir plugins dir
      expect(pm.loadFromDirectory).toHaveBeenCalledTimes(2);
    });

    it('should register plugin tools into ToolExecutor', async () => {
      const mockTool = {
        name: 'my-tool',
        description: 'A test tool',
        execute: vi.fn().mockResolvedValue({ success: true, data: 'ok' }),
      };
      const pm = createMockPluginManager({
        getPluginTools: vi.fn().mockReturnValue([mockTool]),
        loadFromDirectory: vi.fn().mockResolvedValue(1),
      });
      const tools = createMockToolExecutor();
      const deps = createMockDeps({
        pluginManager: pm as never,
        tools: tools as never,
      });

      await loadPlugins(deps);

      expect(tools.register).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'my-tool' }),
      );
    });

    it('should log loaded plugin count', async () => {
      const pm = createMockPluginManager({
        loadFromDirectory: vi.fn().mockResolvedValue(2),
      });
      const logger = createMockLogger();
      const deps = createMockDeps({
        pluginManager: pm as never,
        logger,
      });

      await loadPlugins(deps);

      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('2 plugin(s)'),
      );
    });

    it('should log error when directory loading fails', async () => {
      const pm = createMockPluginManager({
        loadFromDirectory: vi.fn().mockRejectedValue(new Error('Dir not found')),
      });
      const logger = createMockLogger();
      const deps = createMockDeps({
        pluginManager: pm as never,
        logger,
      });

      await loadPlugins(deps);

      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to load plugins'),
        expect.any(Error),
      );
    });

    it('should log registered plugin commands', async () => {
      const commands = new Map<string, { description: string; handler: (args: string) => Promise<string> }>();
      commands.set('greet', { description: 'Say hello', handler: vi.fn() });
      const pm = createMockPluginManager({
        getPluginCommands: vi.fn().mockReturnValue(commands),
        loadFromDirectory: vi.fn().mockResolvedValue(1),
      });
      const logger = createMockLogger();
      const deps = createMockDeps({
        pluginManager: pm as never,
        logger,
      });

      await loadPlugins(deps);

      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('Registered plugin command: /greet'),
      );
    });

    it('should not register tools when no plugins loaded', async () => {
      const pm = createMockPluginManager({
        getPluginTools: vi.fn().mockReturnValue([]),
        loadFromDirectory: vi.fn().mockResolvedValue(0),
      });
      const tools = createMockToolExecutor();
      const deps = createMockDeps({
        pluginManager: pm as never,
        tools: tools as never,
      });

      await loadPlugins(deps);

      expect(tools.register).not.toHaveBeenCalled();
    });
  });

  describe('registerPlugin', () => {
    it('should register plugin and its tools', async () => {
      const mockTool = {
        name: 'inline-tool',
        description: 'Inline plugin tool',
        execute: vi.fn().mockResolvedValue({ success: true }),
      };
      const pm = createMockPluginManager({
        getPluginTools: vi.fn().mockReturnValue([mockTool]),
      });
      const tools = createMockToolExecutor();
      const deps = createMockDeps({
        pluginManager: pm as never,
        tools: tools as never,
      });
      const plugin = createTestPlugin('inline-test');

      await registerPlugin(plugin, deps);

      expect(pm.register).toHaveBeenCalledWith(plugin);
      expect(tools.register).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'inline-tool' }),
      );
    });

    it('should handle plugin with no tools', async () => {
      const pm = createMockPluginManager({
        getPluginTools: vi.fn().mockReturnValue([]),
      });
      const tools = createMockToolExecutor();
      const deps = createMockDeps({
        pluginManager: pm as never,
        tools: tools as never,
      });
      const plugin = createTestPlugin('no-tools');

      await registerPlugin(plugin, deps);

      expect(pm.register).toHaveBeenCalledWith(plugin);
      expect(tools.register).not.toHaveBeenCalled();
    });
  });

  describe('unloadPlugin', () => {
    it('should delegate to pluginManager.unload', async () => {
      const pm = createMockPluginManager({
        unload: vi.fn().mockResolvedValue(true),
      });
      const deps = createMockDeps({ pluginManager: pm as never });

      const result = await unloadPlugin('test-plugin', deps);

      expect(result).toBe(true);
      expect(pm.unload).toHaveBeenCalledWith('test-plugin');
    });

    it('should return false when plugin not found', async () => {
      const pm = createMockPluginManager({
        unload: vi.fn().mockResolvedValue(false),
      });
      const deps = createMockDeps({ pluginManager: pm as never });

      const result = await unloadPlugin('nonexistent', deps);

      expect(result).toBe(false);
    });
  });
});
