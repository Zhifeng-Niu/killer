/**
 * Plugin Lifecycle
 *
 * 处理插件的加载、注册和卸载逻辑。
 * 从 agent.ts 提取以减少职责耦合。
 */

import * as path from 'node:path';
import * as os from 'node:os';

import type { ToolExecutor } from '@killer/core';
import type { PluginManager, KillerPlugin } from '../plugins/index.js';
import type { MinimalLogger } from './background-tasks.js';

/**
 * 插件生命周期依赖
 */
export interface PluginLifecycleDeps {
  readonly pluginManager: PluginManager;
  readonly tools: ToolExecutor;
  readonly logger: MinimalLogger;
}

/**
 * 从 .killer/plugins/ 自动加载插件并注册工具和命令
 */
export async function loadPlugins(deps: PluginLifecycleDeps): Promise<void> {
  // 从项目目录和用户目录加载
  const pluginDirs = [
    path.join(process.cwd(), '.killer', 'plugins'),
    path.join(os.homedir(), '.killer', 'plugins'),
  ];

  for (const dir of pluginDirs) {
    try {
      const count = await deps.pluginManager.loadFromDirectory(dir);
      if (count > 0) {
        deps.logger.info(`Loaded ${count} plugin(s) from ${dir}`);
      }
    } catch (error) {
      deps.logger.error(`Failed to load plugins from ${dir}`, error);
    }
  }

  // 将插件工具注册到 ToolExecutor
  const pluginTools = deps.pluginManager.getPluginTools();
  for (const tool of pluginTools) {
    deps.tools.register({
      name: tool.name,
      description: tool.description,
      execute: tool.execute as (params: unknown) => Promise<import('@killer/core').ToolResult>,
    });
    deps.logger.info(`Registered plugin tool: ${tool.name}`);
  }

  // 将插件命令注册到 CommandHandler
  const pluginCommands = deps.pluginManager.getPluginCommands();
  for (const [name] of pluginCommands) {
    deps.logger.info(`Registered plugin command: /${name}`);
  }
}

/**
 * 注册内联插件（编程方式）
 */
export async function registerPlugin(
  plugin: KillerPlugin,
  deps: PluginLifecycleDeps,
): Promise<void> {
  await deps.pluginManager.register(plugin);

  // 注册新工具
  const tools = deps.pluginManager.getPluginTools();
  const latestTool = tools[tools.length - 1];
  if (latestTool) {
    deps.tools.register({
      name: latestTool.name,
      description: latestTool.description,
      execute: latestTool.execute as (params: unknown) => Promise<import('@killer/core').ToolResult>,
    });
  }
}

/**
 * 卸载插件
 */
export async function unloadPlugin(
  name: string,
  deps: PluginLifecycleDeps,
): Promise<boolean> {
  return deps.pluginManager.unload(name);
}
