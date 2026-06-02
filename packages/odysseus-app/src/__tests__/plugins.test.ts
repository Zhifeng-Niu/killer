/**
 * Plugin System Tests
 */

import { describe, it, expect } from 'vitest';
import { PluginManager, type OdysseusPlugin } from '../plugins/index.js';

describe('PluginManager', () => {
  it('should register inline plugins', async () => {
    const pm = new PluginManager();
    const plugin: OdysseusPlugin = {
      manifest: { name: 'test-plugin', version: '1.0.0', description: 'Test' },
      init: (ctx) => {
        ctx.registerTool({
          name: 'test_tool',
          description: 'A test tool',
          execute: async () => ({ success: true, data: { result: 42 } }),
        });
      },
    };

    await pm.register(plugin);

    const loaded = pm.getLoadedPlugins();
    expect(loaded).toHaveLength(1);
    expect(loaded[0].name).toBe('test-plugin');
  });

  it('should collect tools from plugins', async () => {
    const pm = new PluginManager();

    const plugin: OdysseusPlugin = {
      manifest: { name: 'tool-plugin', version: '1.0.0' },
      init: (ctx) => {
        ctx.registerTool({
          name: 'plugin_tool_a',
          description: 'Tool A',
          execute: async () => ({ success: true }),
        });
        ctx.registerTool({
          name: 'plugin_tool_b',
          description: 'Tool B',
          execute: async (params) => ({ success: true, data: params }),
        });
      },
    };

    await pm.register(plugin);

    const tools = pm.getPluginTools();
    expect(tools).toHaveLength(2);
    expect(tools[0].name).toBe('plugin_tool_a');
    expect(tools[1].name).toBe('plugin_tool_b');
  });

  it('should collect commands from plugins', async () => {
    const pm = new PluginManager();

    const plugin: OdysseusPlugin = {
      manifest: { name: 'cmd-plugin', version: '1.0.0' },
      init: (ctx) => {
        ctx.registerCommand('greet', 'Greet someone', async (args) => `Hello, ${args}!`);
      },
    };

    await pm.register(plugin);

    const commands = pm.getPluginCommands();
    expect(commands.has('greet')).toBe(true);
    expect(commands.get('greet')!.description).toBe('Greet someone');

    const result = await commands.get('greet')!.handler('World');
    expect(result).toBe('Hello, World!');
  });

  it('should prevent duplicate plugin registration', async () => {
    const pm = new PluginManager();

    const plugin: OdysseusPlugin = {
      manifest: { name: 'unique', version: '1.0.0' },
      init: () => {},
    };

    await pm.register(plugin);
    await expect(pm.register(plugin)).rejects.toThrow('already loaded');
  });

  it('should unload plugins', async () => {
    const pm = new PluginManager();
    let destroyed = false;

    const plugin: OdysseusPlugin = {
      manifest: { name: 'removable', version: '1.0.0' },
      init: () => {},
      destroy: async () => { destroyed = true; },
    };

    await pm.register(plugin);
    expect(pm.getLoadedPlugins()).toHaveLength(1);

    const result = await pm.unload('removable');
    expect(result).toBe(true);
    expect(destroyed).toBe(true);
    expect(pm.getLoadedPlugins()).toHaveLength(0);
  });

  it('should return false for unloading unknown plugins', async () => {
    const pm = new PluginManager();
    const result = await pm.unload('nonexistent');
    expect(result).toBe(false);
  });

  it('should provide logger to plugins', async () => {
    const logs: string[] = [];
    const pm = new PluginManager((msg) => logs.push(msg));

    const plugin: OdysseusPlugin = {
      manifest: { name: 'logger-test', version: '1.0.0' },
      init: (ctx) => {
        const logger = ctx.getLogger();
        logger.info('Plugin initialized');
        logger.error('Something went wrong', new Error('test'));
      },
    };

    await pm.register(plugin);
    expect(logs.length).toBeGreaterThan(0);
  });

  it('should handle plugins with async init', async () => {
    const pm = new PluginManager();
    let initialized = false;

    const plugin: OdysseusPlugin = {
      manifest: { name: 'async-plugin', version: '1.0.0' },
      init: async () => {
        await new Promise((r) => setTimeout(r, 10));
        initialized = true;
      },
    };

    await pm.register(plugin);
    expect(initialized).toBe(true);
  });

  it('should return empty results when no plugins loaded', () => {
    const pm = new PluginManager();
    expect(pm.getLoadedPlugins()).toHaveLength(0);
    expect(pm.getPluginTools()).toHaveLength(0);
    expect(pm.getPluginCommands().size).toBe(0);
  });

  describe('Plugin health tracking', () => {
    it('should track tool call count via health metrics', async () => {
      const pm = new PluginManager();

      const plugin: OdysseusPlugin = {
        manifest: { name: 'health-tool', version: '1.0.0' },
        init: (ctx) => {
          ctx.registerTool({
            name: 'healthy_tool',
            description: 'A healthy tool',
            execute: async () => ({ success: true }),
          });
        },
      };

      await pm.register(plugin);
      const tools = pm.getPluginTools();

      // Execute tool twice
      await tools[0].execute({});
      await tools[0].execute({});

      const health = pm.getPluginHealth();
      expect(health).toHaveLength(1);
      expect(health[0].health.toolCalls).toBe(2);
      expect(health[0].health.toolFailures).toBe(0);
    });

    it('should track tool failure count when execute throws', async () => {
      const pm = new PluginManager();

      const plugin: OdysseusPlugin = {
        manifest: { name: 'failing-tool', version: '1.0.0' },
        init: (ctx) => {
          ctx.registerTool({
            name: 'crashy_tool',
            description: 'A crashy tool',
            execute: async () => { throw new Error('Tool crashed'); },
          });
        },
      };

      await pm.register(plugin);
      const tools = pm.getPluginTools();

      // Execute failing tool — should not throw, returns error result
      const result = await tools[0].execute({});
      expect(result.success).toBe(false);

      const health = pm.getPluginHealth();
      expect(health[0].health.toolCalls).toBe(1);
      expect(health[0].health.toolFailures).toBe(1);
      expect(health[0].health.lastError).toBe('Tool crashed');
      expect(health[0].health.lastErrorAt).toBeGreaterThan(0);
    });

    it('should track command call and failure counts', async () => {
      const pm = new PluginManager();

      const plugin: OdysseusPlugin = {
        manifest: { name: 'cmd-health', version: '1.0.0' },
        init: (ctx) => {
          ctx.registerCommand('good', 'Good cmd', async () => 'ok');
          ctx.registerCommand('bad', 'Bad cmd', async () => { throw new Error('Cmd failed'); });
        },
      };

      await pm.register(plugin);
      const commands = pm.getPluginCommands();

      // Execute good command
      const goodResult = await commands.get('good')!.handler('');
      expect(goodResult).toBe('ok');

      // Execute bad command — should not throw
      const badResult = await commands.get('bad')!.handler('');
      expect(badResult).toContain('Error');

      const health = pm.getPluginHealth();
      expect(health[0].health.commandCalls).toBe(2);
      expect(health[0].health.commandFailures).toBe(1);
    });

    it('should isolate plugin failures from other plugins', async () => {
      const pm = new PluginManager();

      const goodPlugin: OdysseusPlugin = {
        manifest: { name: 'good-plugin', version: '1.0.0' },
        init: (ctx) => {
          ctx.registerTool({
            name: 'good_tool',
            description: 'Good',
            execute: async () => ({ success: true }),
          });
        },
      };

      const badPlugin: OdysseusPlugin = {
        manifest: { name: 'bad-plugin', version: '1.0.0' },
        init: (ctx) => {
          ctx.registerTool({
            name: 'bad_tool',
            description: 'Bad',
            execute: async () => { throw new Error('Boom'); },
          });
        },
      };

      await pm.register(goodPlugin);
      await pm.register(badPlugin);

      const tools = pm.getPluginTools();
      const goodTool = tools.find(t => t.name === 'good_tool')!;
      const badTool = tools.find(t => t.name === 'bad_tool')!;

      // Bad tool fails
      const badResult = await badTool.execute({});
      expect(badResult.success).toBe(false);

      // Good tool still works
      const goodResult = await goodTool.execute({});
      expect(goodResult.success).toBe(true);

      const health = pm.getPluginHealth();
      const badHealth = health.find(h => h.name === 'bad-plugin')!;
      const goodHealth = health.find(h => h.name === 'good-plugin')!;

      expect(badHealth.health.toolFailures).toBe(1);
      expect(goodHealth.health.toolFailures).toBe(0);
    });
  });
});
