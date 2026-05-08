/**
 * Plugin System
 *
 * 动态加载和扩展 Agent 能力的插件框架
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * 插件元数据
 */
export interface PluginManifest {
  name: string;
  version: string;
  description?: string;
  author?: string;
}

/**
 * 插件上下文 — 插件通过此接口与 Agent 交互
 */
export interface PluginContext {
  registerTool(tool: { name: string; description: string; execute: (params: unknown) => Promise<{ success: boolean; data?: unknown; error?: string }> }): void;
  registerCommand(name: string, description: string, handler: (args: string) => Promise<string>): void;
  getLogger(): { info(msg: string): void; error(msg: string, err?: unknown): void };
}

/**
 * 插件接口
 */
export interface KillerPlugin {
  manifest: PluginManifest;
  init(context: PluginContext): Promise<void> | void;
  destroy?(): Promise<void> | void;
}

/**
 * 已加载的插件信息
 */
interface LoadedPlugin {
  manifest: PluginManifest;
  plugin: KillerPlugin;
  source: string;
  health: {
    toolCalls: number;
    toolFailures: number;
    commandCalls: number;
    commandFailures: number;
    lastError: string | null;
    lastErrorAt: number | null;
  };
}

/**
 * 插件管理器
 */
export class PluginManager {
  private loadedPlugins: Map<string, LoadedPlugin> = new Map();
  private tools: Array<{ name: string; description: string; execute: (params: unknown) => Promise<{ success: boolean; data?: unknown; error?: string }> }> = [];
  private commands: Map<string, { description: string; handler: (args: string) => Promise<string> }> = new Map();
  private readonly onLog: (msg: string) => void;

  constructor(onLog?: (msg: string) => void) {
    this.onLog = onLog ?? (() => {});
  }

  /**
   * 从目录加载插件
   *
   * 搜索 .killer/plugins/ 和 node_modules/@killer/plugin-*
   */
  async loadFromDirectory(dir: string): Promise<number> {
    if (!fs.existsSync(dir)) {
      return 0;
    }

    let loaded = 0;
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isDirectory() && !entry.isFile()) continue;

      const pluginPath = entry.isDirectory()
        ? path.join(dir, entry.name)
        : path.join(dir, entry.name);

      try {
        const plugin = await this.loadPlugin(pluginPath);
        if (plugin) {
          loaded++;
          this.onLog(`Loaded plugin: ${plugin.manifest.name} v${plugin.manifest.version}`);
        }
      } catch (error) {
        this.onLog(`Failed to load plugin from ${pluginPath}: ${error}`);
      }
    }

    return loaded;
  }

  /**
   * 注册内联插件（编程方式）
   */
  async register(plugin: KillerPlugin): Promise<void> {
    const name = plugin.manifest.name;

    if (this.loadedPlugins.has(name)) {
      throw new Error(`Plugin already loaded: ${name}`);
    }

    await plugin.init(this.createContext(name));

    this.loadedPlugins.set(name, {
      manifest: plugin.manifest,
      plugin,
      source: 'inline',
      health: { toolCalls: 0, toolFailures: 0, commandCalls: 0, commandFailures: 0, lastError: null, lastErrorAt: null },
    });

    this.onLog(`Registered plugin: ${name} v${plugin.manifest.version}`);
  }

  /**
   * 卸载插件
   */
  async unload(name: string): Promise<boolean> {
    const loaded = this.loadedPlugins.get(name);
    if (!loaded) return false;

    if (loaded.plugin.destroy) {
      await loaded.plugin.destroy();
    }

    this.loadedPlugins.delete(name);
    this.onLog(`Unloaded plugin: ${name}`);
    return true;
  }

  /**
   * 获取所有已加载的插件
   */
  getLoadedPlugins(): Array<PluginManifest & { source: string }> {
    return Array.from(this.loadedPlugins.values()).map(p => ({
      ...p.manifest,
      source: p.source,
    }));
  }

  /**
   * 获取插件注册的工具
   */
  getPluginTools(): Array<{ name: string; description: string; execute: (params: unknown) => Promise<{ success: boolean; data?: unknown; error?: string }> }> {
    return [...this.tools];
  }

  /**
   * 获取插件注册的命令
   */
  getPluginCommands(): Map<string, { description: string; handler: (args: string) => Promise<string> }> {
    return new Map(this.commands);
  }

  /**
   * 获取插件健康状态
   */
  getPluginHealth(): Array<PluginManifest & {
    source: string;
    health: LoadedPlugin['health'];
  }> {
    return Array.from(this.loadedPlugins.values()).map(p => ({
      ...p.manifest,
      source: p.source,
      health: p.health,
    }));
  }

  /**
   * 创建插件上下文（带沙箱包装）
   *
   * 工具和命令执行被包装在 try-catch + 超时中，
   * 防止插件崩溃影响主 Agent。
   */
  private createContext(pluginName: string = 'unknown'): PluginContext {
    return {
      registerTool: (tool) => {
        // 包装 execute 为沙箱版本
        const sandboxedExecute = async (params: unknown) => {
          const loaded = this.loadedPlugins.get(pluginName);
          try {
            loaded && loaded.health.toolCalls++;
            const result = await this.withPluginTimeout(
              tool.execute(params),
              pluginName,
              10_000, // 工具执行 10 秒超时
            );
            return result;
          } catch (error) {
            loaded && loaded.health.toolFailures++;
            loaded && (loaded.health.lastError = error instanceof Error ? error.message : String(error));
            loaded && (loaded.health.lastErrorAt = Date.now());
            this.onLog(`Plugin ${pluginName} tool "${tool.name}" failed: ${error instanceof Error ? error.message : String(error)}`);
            return { success: false, error: `Plugin tool "${tool.name}" failed: ${error instanceof Error ? error.message : 'timeout'}` };
          }
        };
        this.tools.push({ name: tool.name, description: tool.description, execute: sandboxedExecute });
        this.onLog(`Plugin registered tool: ${tool.name}`);
      },
      registerCommand: (name, description, handler) => {
        // 包装 handler 为沙箱版本
        const sandboxedHandler = async (args: string) => {
          const loaded = this.loadedPlugins.get(pluginName);
          try {
            loaded && loaded.health.commandCalls++;
            return await this.withPluginTimeout(
              handler(args),
              pluginName,
              15_000, // 命令执行 15 秒超时
            );
          } catch (error) {
            loaded && loaded.health.commandFailures++;
            loaded && (loaded.health.lastError = error instanceof Error ? error.message : String(error));
            loaded && (loaded.health.lastErrorAt = Date.now());
            this.onLog(`Plugin ${pluginName} command "/${name}" failed: ${error instanceof Error ? error.message : String(error)}`);
            return `Error: Plugin command "/${name}" failed — ${error instanceof Error ? error.message : 'timeout'}`;
          }
        };
        this.commands.set(name, { description, handler: sandboxedHandler });
        this.onLog(`Plugin registered command: /${name}`);
      },
      getLogger: () => ({
        info: (msg: string) => this.onLog(msg),
        error: (msg: string, err?: unknown) => this.onLog(`ERROR: ${msg} ${err ?? ''}`),
      }),
    };
  }

  /**
   * 从路径加载单个插件
   */
  private async loadPlugin(pluginPath: string): Promise<KillerPlugin | null> {
    // 尝试加载 JS 文件
    const indexPath = pluginPath.endsWith('.js')
      ? pluginPath
      : path.join(pluginPath, 'index.js');

    if (!fs.existsSync(indexPath)) {
      return null;
    }

    try {
      const module = await import(indexPath);
      const plugin: KillerPlugin = module.default ?? module;

      if (!plugin.manifest || !plugin.init) {
        this.onLog(`Invalid plugin at ${indexPath}: missing manifest or init`);
        return null;
      }

      // Isolate plugin init with timeout — failed plugins are skipped
      try {
        await this.withPluginTimeout(
          Promise.resolve(plugin.init(this.createContext(plugin.manifest.name))),
          plugin.manifest.name,
          5000,
        );
      } catch (initError) {
        this.onLog(`Plugin ${plugin.manifest.name} init failed (skipped): ${initError instanceof Error ? initError.message : String(initError)}`);
        return null;
      }

      this.loadedPlugins.set(plugin.manifest.name, {
        manifest: plugin.manifest,
        plugin,
        source: indexPath,
        health: { toolCalls: 0, toolFailures: 0, commandCalls: 0, commandFailures: 0, lastError: null, lastErrorAt: null },
      });

      return plugin;
    } catch (error) {
      this.onLog(`Failed to import plugin from ${indexPath}: ${error}`);
      return null;
    }
  }

  /**
   * Wrap a plugin operation with a timeout
   */
  private withPluginTimeout<T>(promise: Promise<T>, pluginName: string, ms: number): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error(`Plugin "${pluginName}" timed out after ${ms}ms`)),
        ms,
      );
      promise.then(
        (val) => { clearTimeout(timer); resolve(val); },
        (err) => { clearTimeout(timer); reject(err); },
      );
    });
  }
}
