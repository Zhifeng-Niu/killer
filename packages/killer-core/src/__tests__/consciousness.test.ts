/**
 * Consciousness 单元测试
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ConsciousnessStream, EventPhase } from '../consciousness/consciousness-stream.js';
import type { ConsciousnessEvent, EventType } from '../consciousness/types.js';

describe('ConsciousnessStream', () => {
  let stream: ConsciousnessStream;

  beforeEach(() => {
    stream = new ConsciousnessStream();
  });

  describe('emit', () => {
    it('应发布事件', () => {
      const event = stream.emit({
        source: 'brainstem',
        type: 'loop.phase_change',
        data: { phase: 'perception' },
      });

      expect(event).toHaveProperty('id');
      expect(event).toHaveProperty('timestamp');
      expect(event.source).toBe('brainstem');
      expect(event.type).toBe('loop.phase_change');
    });

    it('暂停时不发布事件', () => {
      stream.pause();

      const event = stream.emit({
        source: 'cortex',
        type: 'evolution.mutation_generated',
        data: {},
      });

      expect(event).toHaveProperty('id');
      const state = stream.getCurrentState();
      expect(state.length).toBe(0);
    });
  });

  describe('on', () => {
    it('应订阅特定阶段的事件', () => {
      let received: ConsciousnessEvent | undefined;

      stream.on('perception', (event) => {
        received = event;
      });

      stream.emit({
        source: 'brainstem',
        type: 'loop.perception_received',
        data: {},
      });

      expect(received).toBeDefined();
    });

    it('取消订阅应停止接收', () => {
      let count = 0;

      const unsubscribe = stream.on('reasoning', () => {
        count++;
      });

      unsubscribe();

      stream.emit({
        source: 'brainstem',
        type: 'loop.reasoning_complete',
        data: {},
      });

      expect(count).toBe(0);
    });
  });

  describe('onType', () => {
    it('应订阅特定类型的事件', () => {
      let received: ConsciousnessEvent | undefined;

      stream.onType('evolution.mutation_generated', (event) => {
        received = event;
      });

      stream.emit({
        source: 'cortex',
        type: 'evolution.mutation_generated',
        data: {},
      });

      expect(received).toBeDefined();
      expect(received?.type).toBe('evolution.mutation_generated');
    });
  });

  describe('onAll', () => {
    it('应订阅所有事件', () => {
      let count = 0;

      stream.onAll(() => {
        count++;
      });

      stream.emit({
        source: 'brainstem',
        type: 'loop.phase_change',
        data: {},
      });

      stream.emit({
        source: 'cortex',
        type: 'evolution.skill_evolved',
        data: {},
      });

      expect(count).toBe(2);
    });
  });

  describe('getCurrentState', () => {
    it('应返回最近的事件', () => {
      stream.emit({
        source: 'brainstem',
        type: 'loop.phase_change',
        data: {},
      });

      stream.emit({
        source: 'hippocampus',
        type: 'memory.episode_stored',
        data: {},
      });

      const state = stream.getCurrentState();

      expect(state.length).toBe(2);
      expect(state[state.length - 1].source).toBe('hippocampus');
    });

    it('应限制返回数量', () => {
      for (let i = 0; i < 150; i++) {
        stream.emit({
          source: 'brainstem',
          type: 'loop.phase_change',
          data: { index: i },
        });
      }

      const state = stream.getCurrentState();

      expect(state.length).toBeLessThanOrEqual(100);
    });
  });

  describe('getHistory', () => {
    it('应按类型筛选', () => {
      stream.emit({
        source: 'brainstem',
        type: 'loop.phase_change',
        data: {},
      });

      stream.emit({
        source: 'cortex',
        type: 'evolution.mutation_generated',
        data: {},
      });

      stream.emit({
        source: 'cortex',
        type: 'evolution.skill_evolved',
        data: {},
      });

      const evolutionEvents = stream.getHistory({
        eventType: 'evolution.mutation_generated',
      });

      expect(evolutionEvents.length).toBe(1);
      expect(evolutionEvents[0].type).toBe('evolution.mutation_generated');
    });

    it('应按来源筛选', () => {
      stream.emit({
        source: 'brainstem',
        type: 'loop.phase_change',
        data: {},
      });

      stream.emit({
        source: 'cortex',
        type: 'evolution.mutation_generated',
        data: {},
      });

      const brainstemEvents = stream.getHistory({
        source: 'brainstem',
      });

      expect(brainstemEvents.length).toBe(1);
      expect(brainstemEvents[0].source).toBe('brainstem');
    });

    it('应限制返回数量', () => {
      for (let i = 0; i < 50; i++) {
        stream.emit({
          source: 'brainstem',
          type: 'loop.phase_change',
          data: { index: i },
        });
      }

      const history = stream.getHistory({ limit: 10 });

      expect(history.length).toBe(10);
    });
  });

  describe('startSegment/endSegment', () => {
    it('应创建轨迹片段', () => {
      const segmentId = stream.startSegment('perception');

      expect(segmentId).toMatch(/^segment-/);

      stream.endSegment(segmentId, 'success');

      const segment = stream.getCurrentSegment();
      expect(segment).toBeNull();
    });

    it('应自动管理当前片段', () => {
      stream.startSegment('perception');

      const current = stream.getCurrentSegment();
      expect(current).toBeDefined();
      expect(current?.outcome).toBe('partial');
    });
  });

  describe('recordEntry', () => {
    it('应记录轨迹条目', () => {
      stream.startSegment('perception');

      stream.recordEntry({
        eventId: 'evt-1',
        phase: 'perception',
        context: { data: 'test' },
      });

      const current = stream.getCurrentSegment();
      expect(current?.entries.length).toBe(1);
    });

    it('无当前片段时应自动创建', () => {
      stream.recordEntry({
        eventId: 'evt-1',
        phase: 'perception',
        context: {},
      });

      const current = stream.getCurrentSegment();
      expect(current).toBeDefined();
    });
  });

  describe('getTrajectory', () => {
    it('应获取指定时间范围的轨迹', () => {
      const start = Date.now();

      stream.startSegment('perception');
      stream.recordEntry({
        eventId: 'evt-1',
        phase: 'perception',
        context: {},
      });

      const segments = stream.getTrajectory(start, Date.now() + 1000);

      expect(segments.length).toBe(1);
    });
  });

  describe('compressTrajectory', () => {
    it('应压缩轨迹', () => {
      const segment1 = stream.startSegment('perception');
      stream.endSegment(segment1, 'success');

      const segment2 = stream.startSegment('reasoning');
      stream.endSegment(segment2, 'success');

      const compressed = stream.compressTrajectory([segment1, segment2]);

      expect(compressed).toHaveProperty('id');
      expect(compressed).toHaveProperty('compressionRatio');
      expect(compressed.segments).toBe(2);
    });

    it('应提取关键洞察', () => {
      const segment1 = stream.startSegment('perception');
      stream.endSegment(segment1, 'success');

      const segment2 = stream.startSegment('reasoning');
      stream.endSegment(segment2, 'success');

      const segment3 = stream.startSegment('action');
      stream.endSegment(segment3, 'success');

      const compressed = stream.compressTrajectory([segment1, segment2, segment3]);

      expect(Array.isArray(compressed.keyInsights)).toBe(true);
    });
  });

  describe('replay', () => {
    it('应回放轨迹', () => {
      const segmentId = stream.startSegment('perception');

      stream.recordEntry({
        eventId: 'evt-1',
        phase: 'perception',
        context: { step: 1 },
      });

      stream.recordEntry({
        eventId: 'evt-2',
        phase: 'perception',
        context: { step: 2 },
      });

      const entries = stream.replay(segmentId);

      expect(entries.length).toBe(2);
    });

    it('不存在的片段应返回空数组', () => {
      const entries = stream.replay('non-existent');
      expect(entries).toEqual([]);
    });
  });

  describe('pause/resume', () => {
    it('应暂停和恢复事件流', () => {
      stream.pause();

      stream.emit({
        source: 'brainstem',
        type: 'loop.phase_change',
        data: {},
      });

      expect(stream.getCurrentState().length).toBe(0);

      stream.resume();

      stream.emit({
        source: 'brainstem',
        type: 'loop.phase_change',
        data: {},
      });

      expect(stream.getCurrentState().length).toBe(1);
    });
  });

  describe('clear', () => {
    it('应清空历史', async () => {
      stream.emit({
        source: 'brainstem',
        type: 'loop.phase_change',
        data: {},
      });

      await stream.clear();

      expect(stream.getCurrentState().length).toBe(0);
    });
  });

  describe('getStatus', () => {
    it('应返回流状态', () => {
      const status = stream.getStatus();

      expect(status).toHaveProperty('running');
      expect(status).toHaveProperty('eventCount');
      expect(status).toHaveProperty('currentSegmentId');
      expect(status).toHaveProperty('segmentCount');
      expect(status).toHaveProperty('memoryUsage');
    });

    it('暂停时 running 应为 false', () => {
      stream.pause();

      const status = stream.getStatus();

      expect(status.running).toBe(false);
    });

    it('应正确跟踪事件数和片段数', () => {
      stream.emit({ source: 'brainstem', type: 'loop.phase_change', data: {} });
      stream.emit({ source: 'cortex', type: 'evolution.mutation_generated', data: {} });
      stream.startSegment('perception');

      const status = stream.getStatus();

      expect(status.eventCount).toBe(2);
      expect(status.segmentCount).toBe(1);
      expect(status.currentSegmentId).not.toBeNull();
    });
  });

  describe('event buffer overflow', () => {
    it('应限制事件数量为 maxEvents', () => {
      for (let i = 0; i < 10500; i++) {
        stream.emit({ source: 'brainstem', type: 'loop.phase_change', data: { i } });
      }

      const state = stream.getCurrentState();
      expect(state.length).toBeLessThanOrEqual(100);
      expect(stream.getStatus().eventCount).toBeLessThanOrEqual(10000);
    });
  });

  describe('segment overflow', () => {
    it('应限制片段数量为 maxSegments', () => {
      for (let i = 0; i < 1100; i++) {
        const id = stream.startSegment('perception');
        stream.endSegment(id, 'success');
      }

      expect(stream.getStatus().segmentCount).toBeLessThanOrEqual(1000);
    });
  });

  describe('phase filtering', () => {
    it('reasoning 阶段应匹配 loop.reasoning_complete', () => {
      let received: ConsciousnessEvent | undefined;
      stream.on('reasoning', (e) => { received = e; });

      stream.emit({ source: 'brainstem', type: 'loop.reasoning_complete', data: {} });

      expect(received).toBeDefined();
      expect(received!.type).toBe('loop.reasoning_complete');
    });

    it('action 阶段应匹配 loop.action_executed', () => {
      let received: ConsciousnessEvent | undefined;
      stream.on('action', (e) => { received = e; });

      stream.emit({ source: 'brainstem', type: 'loop.action_executed', data: {} });

      expect(received).toBeDefined();
    });

    it('reflection 阶段应匹配 loop.reflection_complete', () => {
      let received: ConsciousnessEvent | undefined;
      stream.on('reflection', (e) => { received = e; });

      stream.emit({ source: 'brainstem', type: 'loop.reflection_complete', data: {} });

      expect(received).toBeDefined();
    });

    it('evolution 阶段应匹配 loop.evolution_complete', () => {
      let received: ConsciousnessEvent | undefined;
      stream.on('evolution', (e) => { received = e; });

      stream.emit({ source: 'brainstem', type: 'loop.evolution_complete', data: {} });

      expect(received).toBeDefined();
    });

    it('evolution 阶段应匹配 evolution.mutation_generated', () => {
      let received: ConsciousnessEvent | undefined;
      stream.on('evolution', (e) => { received = e; });

      stream.emit({ source: 'cortex', type: 'evolution.mutation_generated', data: {} });

      expect(received).toBeDefined();
    });

    it('不匹配的阶段不应收到事件', () => {
      let received = false;
      stream.on('action', () => { received = true; });

      stream.emit({ source: 'brainstem', type: 'loop.perception_received', data: {} });

      expect(received).toBe(false);
    });
  });

  describe('handler error isolation', () => {
    it('一个处理器抛错不应影响其他处理器', () => {
      const received: ConsciousnessEvent[] = [];
      const originalError = console.error;
      console.error = () => {};

      stream.onAll(() => { throw new Error('boom'); });
      stream.onAll((e) => { received.push(e); });

      stream.emit({ source: 'brainstem', type: 'loop.phase_change', data: {} });

      console.error = originalError;
      expect(received).toHaveLength(1);
    });
  });

  describe('getHistory time filtering', () => {
    it('应按 startTime 筛选', () => {
      stream.emit({ source: 'brainstem', type: 'loop.phase_change', data: { idx: 0 } });
      stream.emit({ source: 'brainstem', type: 'loop.phase_change', data: { idx: 1 } });

      const all = stream.getHistory();
      const lastTimestamp = all[all.length - 1].timestamp;

      // 用最后一个事件的时间戳作为 startTime，应至少包含最后一个
      const recent = stream.getHistory({ startTime: lastTimestamp });
      expect(recent.length).toBeGreaterThanOrEqual(1);
      expect(recent.every((e) => e.timestamp >= lastTimestamp)).toBe(true);
    });

    it('应按 endTime 筛选', () => {
      stream.emit({ source: 'brainstem', type: 'loop.phase_change', data: { idx: 0 } });
      stream.emit({ source: 'brainstem', type: 'loop.phase_change', data: { idx: 1 } });

      const all = stream.getHistory();
      const firstTimestamp = all[0].timestamp;

      const early = stream.getHistory({ endTime: firstTimestamp });
      expect(early.length).toBeGreaterThanOrEqual(1);
      expect(early.every((e) => e.timestamp <= firstTimestamp)).toBe(true);
    });

    it('组合 startTime + endTime 应正确筛选', () => {
      stream.emit({ source: 'brainstem', type: 'loop.phase_change', data: { idx: 0 } });
      stream.emit({ source: 'brainstem', type: 'loop.phase_change', data: { idx: 1 } });
      stream.emit({ source: 'brainstem', type: 'loop.phase_change', data: { idx: 2 } });

      const all = stream.getHistory();
      const t0 = all[0].timestamp;
      const t2 = all[2].timestamp;

      const middle = stream.getHistory({ startTime: t0, endTime: t2 });
      expect(middle.length).toBeGreaterThanOrEqual(1);
      expect(middle.every((e) => e.timestamp >= t0 && e.timestamp <= t2)).toBe(true);
    });
  });

  describe('compressTrajectory edge cases', () => {
    it('空片段列表应返回空压缩结果', () => {
      const result = stream.compressTrajectory([]);

      expect(result.segments).toBe(0);
      expect(result.compressed).toEqual([]);
      expect(result.compressionRatio).toBe(0);
    });

    it('不同结果的片段不应合并', () => {
      const s1 = stream.startSegment('perception');
      stream.endSegment(s1, 'success');
      const s2 = stream.startSegment('reasoning');
      stream.endSegment(s2, 'failure');

      const result = stream.compressTrajectory([s1, s2]);

      expect(result.compressed.length).toBe(2);
    });

    it('高失败率应产生 insight', () => {
      const ids: string[] = [];
      for (let i = 0; i < 5; i++) {
        const id = stream.startSegment('perception');
        stream.endSegment(id, 'failure');
        ids.push(id);
      }

      const result = stream.compressTrajectory(ids);

      expect(result.keyInsights).toContain('Significant failure rate detected');
    });

    it('复杂工作流应产生 insight', () => {
      const id = stream.startSegment('perception');
      for (let i = 0; i < 60; i++) {
        stream.recordEntry({ eventId: `evt-${i}`, phase: 'perception', context: {} });
      }
      stream.endSegment(id, 'success');

      const result = stream.compressTrajectory([id]);

      expect(result.keyInsights).toContain('Complex workflows with many steps');
    });
  });

  describe('getCompressedTrajectory', () => {
    it('无轨迹时应返回提示信息', () => {
      const result = stream.getCompressedTrajectory();

      expect(result).toBe('No trajectory recorded');
    });

    it('有轨迹时应返回 JSON 字符串', () => {
      stream.startSegment('perception');
      stream.endSegment(stream.getCurrentSegment()!.id, 'success');

      const result = stream.getCompressedTrajectory();
      const parsed = JSON.parse(result);

      expect(parsed).toHaveProperty('segments');
      expect(parsed).toHaveProperty('insights');
    });
  });
});
