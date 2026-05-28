/**
 * Brainstem 主循环测试
 */

import { describe, it, expect, vi } from 'vitest';
import { BrainstemLoop } from './loop-impl.js';
import { MockLLMProvider } from './llm.js';
import { ToolExecutor, ReadFileTool, MemoryStoreTool } from './tools.js';
import type { LoopState, Perception } from './types.js';

describe('BrainstemLoop', () => {
  const createTestLoop = (config = {}) => {
    const llm = new MockLLMProvider();
    const tools = new ToolExecutor();
    tools.register(new ReadFileTool());
    tools.register(new MemoryStoreTool());

    return new BrainstemLoop(llm, tools, {
      perceptionInterval: 10,
      dreamingMode: false,
      maxConcurrentActions: 5,
      debugLogging: false,
      ...config,
    });
  };

  it('应该创建循环实例', () => {
    const loop = createTestLoop();

    expect(loop.getState().phase).toBe('perceive');
    expect(loop.getState().currentPerception).toBeNull();
  });

  it('应该能够注入感知', () => {
    const loop = createTestLoop();

    const perception: Perception = {
      id: 'test_1',
      timestamp: Date.now(),
      source: 'cli',
      data: { message: 'test' },
      priority: 'normal',
    };

    loop.injectPerception(perception);

    // 验证状态
    const state = loop.getState();
    expect(state.phase).toBe('perceive');
  });

  it('应该能够订阅事件', () => {
    const loop = createTestLoop();
    const callback = vi.fn();

    loop.on('phaseChange', callback);

    const perception: Perception = {
      id: 'test_1',
      timestamp: Date.now(),
      source: 'cli',
      data: { message: 'test' },
      priority: 'normal',
    };

    loop.injectPerception(perception);

    // 启动循环
    const startPromise = loop.start();

    // 等待一小段时间
    return new Promise<void>((resolve) => {
      setTimeout(async () => {
        await loop.stop();
        await startPromise;
        // 验证回调被调用
        expect(callback).toHaveBeenCalled();
        resolve();
      }, 100);
    });
  });

  it('应该能够取消订阅事件', () => {
    const loop = createTestLoop();
    const callback = vi.fn();

    loop.on('phaseChange', callback);
    loop.off('phaseChange', callback);

    const perception: Perception = {
      id: 'test_1',
      timestamp: Date.now(),
      source: 'cli',
      data: { message: 'test' },
      priority: 'normal',
    };

    loop.injectPerception(perception);

    // 由于没有监听器，回调不应该被调用
    expect(callback).not.toHaveBeenCalled();
  });

  it('应该在梦境模式下生成内部感知', async () => {
    const loop = createTestLoop({
      dreamingMode: true,
      perceptionInterval: 10,
    });

    const perceptionReceived = vi.fn();
    loop.on('perceptionReceived', perceptionReceived);

    // 启动循环但不等待它完成（它会一直运行）
    const startPromise = loop.start().catch(() => {
      // 忽略 stop 导致的任何错误
    });

    // 等待足够时间让至少一个完整循环运行
    // perceive + reason(LLM mock 50ms) + act + reflect + evolve
    await new Promise(resolve => setTimeout(resolve, 500));

    // 停止循环
    await loop.stop();
    await startPromise;

    // 验证至少收到了一个感知
    expect(perceptionReceived).toHaveBeenCalled();
  }, 15000); // 15秒超时

  it('应该支持多个事件监听器', () => {
    const loop = createTestLoop();
    const callback1 = vi.fn();
    const callback2 = vi.fn();

    loop.on('phaseChange', callback1);
    loop.on('phaseChange', callback2);

    const perception: Perception = {
      id: 'test_1',
      timestamp: Date.now(),
      source: 'cli',
      data: { message: 'test' },
      priority: 'normal',
    };

    loop.injectPerception(perception);

    // 启动循环
    const startPromise = loop.start();

    return new Promise<void>((resolve) => {
      setTimeout(async () => {
        await loop.stop();
        await startPromise;
        // 两个回调都应该被调用
        expect(callback1).toHaveBeenCalled();
        expect(callback2).toHaveBeenCalled();
        resolve();
      }, 100);
    });
  });

  it('应该处理空感知队列', async () => {
    const loop = createTestLoop();

    // 不注入任何感知
    const startPromise = loop.start();

    await new Promise<void>((resolve) => {
      setTimeout(async () => {
        await loop.stop();
        await startPromise;
        // 循环应该正常停止
        expect(loop.getState().phase).toBe('perceive');
        resolve();
      }, 50);
    });
  });

  it('应该更新循环状态通过各个阶段', async () => {
    const loop = createTestLoop();

    const phases: string[] = [];
    loop.on('phaseChange', (state: LoopState) => {
      phases.push(state.phase);
    });

    const perception: Perception = {
      id: 'test_1',
      timestamp: Date.now(),
      source: 'cli',
      data: { message: 'test' },
      priority: 'normal',
    };

    loop.injectPerception(perception);

    const startPromise = loop.start();

    await new Promise<void>((resolve) => {
      setTimeout(async () => {
        await loop.stop();
        await startPromise;
        // 验证所有阶段都被访问
        expect(phases).toContain('perceive');
        expect(phases).toContain('reason');
        expect(phases).toContain('act');
        expect(phases).toContain('reflect');
        expect(phases).toContain('evolve');
        resolve();
      }, 200);
    });
  });

  it('应该支持高优先级感知', async () => {
    const loop = createTestLoop();

    const perception: Perception = {
      id: 'test_1',
      timestamp: Date.now(),
      source: 'cli',
      data: { message: 'critical' },
      priority: 'critical',
    };

    loop.injectPerception(perception);

    const reasoningComplete = vi.fn();
    loop.on('reasoningComplete', reasoningComplete);

    const startPromise = loop.start();

    await new Promise<void>((resolve) => {
      setTimeout(async () => {
        await loop.stop();
        await startPromise;
        expect(reasoningComplete).toHaveBeenCalled();
        resolve();
      }, 100);
    });
  });

  it('应该能够启动和停止多次', async () => {
    const loop = createTestLoop();

    // 第一次启动停止
    const startPromise1 = loop.start();
    await new Promise(resolve => setTimeout(resolve, 50));
    await loop.stop();
    await startPromise1;

    // 第二次启动停止
    const startPromise2 = loop.start();
    await new Promise(resolve => setTimeout(resolve, 50));
    await loop.stop();
    await startPromise2;

    // 应该正常完成
    expect(loop.getState().phase).toBe('perceive');
  });

  it('应该正确处理推理阶段', async () => {
    const loop = createTestLoop();

    const reasoningComplete = vi.fn();
    loop.on('reasoningComplete', (state: LoopState) => {
      expect(state.currentReasoning).toBeDefined();
      expect(state.currentReasoning?.confidence).toBeGreaterThanOrEqual(0);
      expect(state.currentReasoning?.confidence).toBeLessThanOrEqual(1);
      reasoningComplete();
    });

    const perception: Perception = {
      id: 'test_1',
      timestamp: Date.now(),
      source: 'cli',
      data: { message: 'test' },
      priority: 'normal',
    };

    loop.injectPerception(perception);

    const startPromise = loop.start();

    await new Promise<void>((resolve) => {
      setTimeout(async () => {
        await loop.stop();
        await startPromise;
        expect(reasoningComplete).toHaveBeenCalled();
        resolve();
      }, 100);
    });
  });

  it('应该正确处理行动阶段', async () => {
    const loop = createTestLoop();

    const actionExecuted = vi.fn();
    loop.on('actionExecuted', (state: LoopState) => {
      expect(state.currentAction).toBeDefined();
      expect(state.currentAction?.status).toMatch(/^(pending|executing|completed|failed)$/);
      actionExecuted();
    });

    const perception: Perception = {
      id: 'test_1',
      timestamp: Date.now(),
      source: 'cli',
      data: { message: 'test' },
      priority: 'normal',
    };

    loop.injectPerception(perception);

    const startPromise = loop.start();

    await new Promise<void>((resolve) => {
      setTimeout(async () => {
        await loop.stop();
        await startPromise;
        expect(actionExecuted).toHaveBeenCalled();
        resolve();
      }, 100);
    });
  });

  it('应该正确处理反思阶段', async () => {
    const loop = createTestLoop();

    const reflectionComplete = vi.fn();
    loop.on('reflectionComplete', (state: LoopState) => {
      expect(state.currentReflection).toBeDefined();
      expect(state.currentReflection?.outcome).toMatch(/^(success|partial|failure)$/);
      reflectionComplete();
    });

    const perception: Perception = {
      id: 'test_1',
      timestamp: Date.now(),
      source: 'cli',
      data: { message: 'test' },
      priority: 'normal',
    };

    loop.injectPerception(perception);

    const startPromise = loop.start();

    await new Promise<void>((resolve) => {
      setTimeout(async () => {
        await loop.stop();
        await startPromise;
        expect(reflectionComplete).toHaveBeenCalled();
        resolve();
      }, 100);
    });
  });

  it('应该正确处理演化阶段', async () => {
    const loop = createTestLoop();

    const evolutionComplete = vi.fn();
    loop.on('evolutionComplete', (state: LoopState) => {
      expect(state.currentEvolution).toBeDefined();
      expect(Array.isArray(state.currentEvolution?.mutations)).toBe(true);
      evolutionComplete();
    });

    const perception: Perception = {
      id: 'test_1',
      timestamp: Date.now(),
      source: 'cli',
      data: { message: 'test' },
      priority: 'normal',
    };

    loop.injectPerception(perception);

    const startPromise = loop.start();

    await new Promise<void>((resolve) => {
      setTimeout(async () => {
        await loop.stop();
        await startPromise;
        expect(evolutionComplete).toHaveBeenCalled();
        resolve();
      }, 100);
    });
  });
});
