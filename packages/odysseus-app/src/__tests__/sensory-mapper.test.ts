/**
 * Sensory Mapper Tests
 *
 * Tests for the pure mapping functions that convert sensory input
 * types to perception types used by the main cognitive loop.
 */

import { describe, it, expect } from 'vitest';
import { mapSensoryPriority, mapSensoryChannelToSource } from '../orchestrator/sensory-mapper.js';

describe('mapSensoryPriority', () => {
  it('should map urgent to critical', () => {
    expect(mapSensoryPriority('urgent')).toBe('critical');
  });

  it('should map high to high', () => {
    expect(mapSensoryPriority('high')).toBe('high');
  });

  it('should map normal to normal', () => {
    expect(mapSensoryPriority('normal')).toBe('normal');
  });

  it('should map low to low', () => {
    expect(mapSensoryPriority('low')).toBe('low');
  });
});

describe('mapSensoryChannelToSource', () => {
  it('should map cli to cli', () => {
    expect(mapSensoryChannelToSource('cli')).toBe('cli');
  });

  it('should map telegram to telegram', () => {
    expect(mapSensoryChannelToSource('telegram')).toBe('telegram');
  });

  it('should map discord to discord', () => {
    expect(mapSensoryChannelToSource('discord')).toBe('discord');
  });

  it('should map web to internal', () => {
    expect(mapSensoryChannelToSource('web')).toBe('internal');
  });

  it('should map file_watcher to file', () => {
    expect(mapSensoryChannelToSource('file_watcher')).toBe('file');
  });

  it('should map code to code', () => {
    expect(mapSensoryChannelToSource('code')).toBe('code');
  });
});
