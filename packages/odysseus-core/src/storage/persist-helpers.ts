/**
 * Persist Helpers - 持久化辅助函数
 *
 * 提供独立函数用于 HippocampusEngine 的存储集成
 */

import type { HippocampusEngine } from '../hippocampus/memory.js';
import type { IStorage } from './types.js';

/**
 * 保存记忆引擎内容到存储
 *
 * @param engine - 记忆引擎实例
 * @param storage - 存储实例
 */
export async function saveMemory(
  engine: HippocampusEngine,
  storage: IStorage
): Promise<void> {
  // 导出所有记忆
  const exported = engine.export();

  // 保存情节记忆
  for (const episode of exported.episodic) {
    await storage.episodes.save(episode);
  }

  // 保存语义节点
  for (const node of exported.semantic) {
    await storage.semantic.save(node);
  }

  // 保存前瞻记忆
  for (const memory of exported.prospective) {
    await storage.prospective.save(memory);
  }
}

/**
 * 从存储加载记忆到引擎
 *
 * @param engine - 记忆引擎实例
 * @param storage - 存储实例
 */
export async function loadMemory(
  engine: HippocampusEngine,
  storage: IStorage
): Promise<void> {
  // 加载所有数据
  const episodes = await storage.episodes.loadAll();
  const semantic = await storage.semantic.loadAll();
  const prospective = await storage.prospective.loadAll();

  // 导入到引擎
  engine.import({
    episodic: episodes,
    semantic,
    prospective,
  });
}

/**
 * 初始化存储并加载到引擎
 *
 * @param engine - 记忆引擎实例
 * @param storage - 存储实例
 */
export async function initializeStorage(
  engine: HippocampusEngine,
  storage: IStorage
): Promise<void> {
  await storage.initialize();
  await loadMemory(engine, storage);
}
