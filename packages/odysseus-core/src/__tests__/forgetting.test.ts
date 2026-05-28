/**
 * Ebbinghaus Forgetting Curve Tests
 */

import { describe, it, expect } from 'vitest';
import {
  calculateRetention,
  shouldRecall,
  reinforce,
  decay,
  calculateNextReview,
  applyForgettingCurve,
  getMemoryHealth,
  DEFAULT_FORGETTING_CONFIG,
  type ForgettingConfig,
} from '../hippocampus/forgetting.js';
import type { Episode } from '../hippocampus/types.js';

function createEpisode(overrides: Partial<Episode> = {}): Episode {
  return {
    id: 'ep-1',
    timestamp: Date.now() - 1000 * 60 * 60, // 1 hour ago
    title: 'Test episode',
    narrative: 'A test narrative',
    emotionalWeight: 0.8,
    tags: ['test'],
    associations: [],
    decayRate: 24 * 60 * 60 * 1000, // 24 hours stability
    accessCount: 1,
    ...overrides,
  };
}

describe('calculateRetention', () => {
  it('should return 1 for zero elapsed time', () => {
    expect(calculateRetention(1000, 0)).toBe(1);
  });

  it('should return 1 for negative elapsed time', () => {
    expect(calculateRetention(1000, -100)).toBe(1);
  });

  it('should return 0 for zero stability', () => {
    expect(calculateRetention(0, 1000)).toBe(0);
  });

  it('should return 0 for negative stability', () => {
    expect(calculateRetention(-100, 1000)).toBe(0);
  });

  it('should decrease over time (basic Ebbinghaus curve)', () => {
    const stability = 24 * 60 * 60 * 1000; // 24 hours

    const r0 = calculateRetention(stability, 0);
    const r1h = calculateRetention(stability, 60 * 60 * 1000);
    const r12h = calculateRetention(stability, 12 * 60 * 60 * 1000);
    const r24h = calculateRetention(stability, 24 * 60 * 60 * 1000);

    // Should decrease monotonically
    expect(r0).toBe(1);
    expect(r1h).toBeLessThan(1);
    expect(r1h).toBeGreaterThan(r12h);
    expect(r12h).toBeGreaterThan(r24h);
    expect(r24h).toBeCloseTo(Math.exp(-1), 10); // e^(-1) ≈ 0.368
  });

  it('should decay faster with lower stability', () => {
    const time = 60 * 60 * 1000; // 1 hour
    const highStability = 24 * 60 * 60 * 1000;
    const lowStability = 2 * 60 * 60 * 1000;

    const rHigh = calculateRetention(highStability, time);
    const rLow = calculateRetention(lowStability, time);

    expect(rHigh).toBeGreaterThan(rLow);
  });
});

describe('shouldRecall', () => {
  const config: ForgettingConfig = {
    ...DEFAULT_FORGETTING_CONFIG,
    minAccessInterval: 0, // Disable for testing
  };

  it('should return true when retention drops below 70%', () => {
    const episode = createEpisode({
      decayRate: 60 * 60 * 1000, // 1 hour stability
      timestamp: Date.now() - 2 * 60 * 60 * 1000, // 2 hours ago
    });

    expect(shouldRecall(episode, Date.now(), config)).toBe(true);
  });

  it('should return false when retention is still high', () => {
    const episode = createEpisode({
      decayRate: 365 * 24 * 60 * 60 * 1000, // 1 year stability
      timestamp: Date.now() - 1000, // 1 second ago
    });

    expect(shouldRecall(episode, Date.now(), config)).toBe(false);
  });

  it('should return false within minAccessInterval', () => {
    const strictConfig: ForgettingConfig = {
      ...DEFAULT_FORGETTING_CONFIG,
      minAccessInterval: 60 * 60 * 1000, // 1 hour
    };

    const episode = createEpisode({
      timestamp: Date.now() - 1000, // Just accessed
    });

    expect(shouldRecall(episode, Date.now(), strictConfig)).toBe(false);
  });
});

describe('reinforce', () => {
  it('should increase stability by reinforcementFactor', () => {
    const episode = createEpisode({ decayRate: 1000, accessCount: 1 });
    const now = Date.now();

    const reinforced = reinforce(episode, now);

    expect(reinforced.decayRate).toBe(2000); // 1000 * 2.0
  });

  it('should cap at maxStability', () => {
    const config: ForgettingConfig = {
      ...DEFAULT_FORGETTING_CONFIG,
      maxStability: 100,
    };

    const episode = createEpisode({ decayRate: 80, accessCount: 1 });
    const reinforced = reinforce(episode, Date.now(), config);

    expect(reinforced.decayRate).toBe(100); // Capped at max
  });

  it('should increment accessCount', () => {
    const episode = createEpisode({ accessCount: 5 });
    const reinforced = reinforce(episode, Date.now());

    expect(reinforced.accessCount).toBe(6);
  });

  it('should slightly increase emotionalWeight', () => {
    const episode = createEpisode({ emotionalWeight: 0.5 });
    const reinforced = reinforce(episode, Date.now());

    expect(reinforced.emotionalWeight).toBeGreaterThan(0.5);
    expect(reinforced.emotionalWeight).toBeLessThanOrEqual(1);
  });

  it('should cap emotionalWeight at 1', () => {
    const episode = createEpisode({ emotionalWeight: 0.99 });
    const reinforced = reinforce(episode, Date.now());

    expect(reinforced.emotionalWeight).toBeLessThanOrEqual(1);
  });

  it('should update timestamp to now', () => {
    const oldTime = Date.now() - 10000;
    const episode = createEpisode({ timestamp: oldTime });
    const now = Date.now();

    const reinforced = reinforce(episode, now);

    expect(reinforced.timestamp).toBe(now);
  });

  it('should not mutate original episode', () => {
    const episode = createEpisode({ decayRate: 1000, accessCount: 3 });
    reinforce(episode, Date.now());

    expect(episode.accessCount).toBe(3);
    expect(episode.decayRate).toBe(1000);
  });
});

describe('decay', () => {
  it('should reduce emotionalWeight based on retention', () => {
    const episode = createEpisode({
      emotionalWeight: 1.0,
      decayRate: 24 * 60 * 60 * 1000,
      timestamp: Date.now() - 24 * 60 * 60 * 1000, // 24 hours ago
    });

    const decayed = decay(episode, Date.now());

    // After 24h with 24h stability, retention = e^(-1) ≈ 0.368
    expect(decayed.emotionalWeight).toBeCloseTo(Math.exp(-1), 3);
  });

  it('should not change emotionalWeight for fresh memories', () => {
    const now = Date.now();
    const episode = createEpisode({
      emotionalWeight: 0.9,
      timestamp: now,
    });

    const decayed = decay(episode, now);

    expect(decayed.emotionalWeight).toBeCloseTo(0.9, 5);
  });

  it('should not mutate original episode', () => {
    const episode = createEpisode({ emotionalWeight: 0.8 });
    decay(episode, Date.now());

    expect(episode.emotionalWeight).toBe(0.8);
  });
});

describe('calculateNextReview', () => {
  it('should return future timestamp', () => {
    const episode = createEpisode();
    const nextReview = calculateNextReview(episode);

    expect(nextReview).toBeGreaterThan(episode.timestamp);
  });

  it('should schedule review sooner for low stability', () => {
    const lowStability = createEpisode({ decayRate: 60 * 60 * 1000 });
    const highStability = createEpisode({ decayRate: 24 * 60 * 60 * 1000 });

    const nextLow = calculateNextReview(lowStability);
    const nextHigh = calculateNextReview(highStability);

    expect(nextHigh - highStability.timestamp).toBeGreaterThan(nextLow - lowStability.timestamp);
  });

  it('should match the inverse Ebbinghaus formula', () => {
    const episode = createEpisode({ decayRate: 1000, timestamp: 0 });
    const targetRetention = 0.8;

    const nextReview = calculateNextReview(episode, targetRetention);
    // t = -S * ln(R) = -1000 * ln(0.8)
    const expectedTime = -1000 * Math.log(0.8);

    expect(nextReview).toBeCloseTo(expectedTime, 3);
  });
});

describe('applyForgettingCurve', () => {
  it('should mark low-retention memories as dormant', () => {
    const episodes = [
      createEpisode({
        id: 'ep-1',
        emotionalWeight: 0.05, // Very low
        decayRate: 60 * 60 * 1000,
        timestamp: Date.now() - 30 * 24 * 60 * 60 * 1000, // 30 days ago
        tags: ['old'],
      }),
    ];

    const result = applyForgettingCurve(episodes, Date.now());

    expect(result[0].tags).toContain('dormant');
  });

  it('should not mark healthy memories as dormant', () => {
    const episodes = [
      createEpisode({
        emotionalWeight: 0.9,
        timestamp: Date.now() - 1000, // Very recent
      }),
    ];

    const result = applyForgettingCurve(episodes, Date.now());

    expect(result[0].tags).not.toContain('dormant');
  });

  it('should return same number of episodes', () => {
    const episodes = [
      createEpisode({ id: 'ep-1' }),
      createEpisode({ id: 'ep-2' }),
      createEpisode({ id: 'ep-3' }),
    ];

    const result = applyForgettingCurve(episodes, Date.now());

    expect(result).toHaveLength(3);
  });

  it('should not mutate original episodes', () => {
    const episodes = [createEpisode({ tags: ['original'] })];

    applyForgettingCurve(episodes, Date.now());

    expect(episodes[0].tags).toEqual(['original']);
  });
});

describe('getMemoryHealth', () => {
  it('should return "strong" for high retention', () => {
    const episode = createEpisode({
      decayRate: 365 * 24 * 60 * 60 * 1000, // 1 year
      timestamp: Date.now() - 1000, // 1 second ago
    });

    expect(getMemoryHealth(episode, Date.now())).toBe('strong');
  });

  it('should return "moderate" for medium retention', () => {
    const episode = createEpisode({
      decayRate: 24 * 60 * 60 * 1000, // 24 hours
      timestamp: Date.now() - 12 * 60 * 60 * 1000, // 12 hours ago
    });

    // retention = e^(-0.5) ≈ 0.607 → moderate (0.5 <= 0.607 < 0.8)
    expect(getMemoryHealth(episode, Date.now())).toBe('moderate');
  });

  it('should return "weak" for low retention', () => {
    const episode = createEpisode({
      decayRate: 60 * 60 * 1000, // 1 hour
      timestamp: Date.now() - 5 * 60 * 60 * 1000, // 5 hours ago
    });

    // retention = e^(-5) ≈ 0.0067 → weak (< 0.1? no, it's dormant)
    // Let's pick values where retention is between 0.1 and 0.5
    // t/S = 2 → R = e^(-2) ≈ 0.135
    const ep2 = createEpisode({
      decayRate: 1000,
      timestamp: Date.now() - 2000,
    });

    expect(getMemoryHealth(ep2, Date.now())).toBe('weak');
  });

  it('should return "dormant" for very low retention', () => {
    const episode = createEpisode({
      decayRate: 1000,
      timestamp: Date.now() - 10000, // 10x stability
    });

    // retention = e^(-10) ≈ 0.000045 → dormant
    expect(getMemoryHealth(episode, Date.now())).toBe('dormant');
  });
});
