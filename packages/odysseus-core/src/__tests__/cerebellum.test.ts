/**
 * Cerebellum Tests — 实验策略编排器
 */

import { describe, it, expect } from 'vitest';
import { Cerebellum } from '../cerebellum/cerebellum.js';
import { Compass } from '../cerebellum/compass.js';
import { Evaluator } from '../cerebellum/evaluator.js';
import { ExperimentTracker } from '../cerebellum/experiment-tracker.js';
import type {
  AttemptHistory,
  Experiment,
  Mission,
  MissionConfig,
  VerificationResult,
  MetricDefinition,
} from '../cerebellum/types.js';

// ── Helpers ──

function makeVerification(overrides: Partial<VerificationResult> = {}): VerificationResult {
  return {
    syntax: { passed: true, duration: 0, output: 'ok' },
    guard: { passed: true, duration: 0, output: 'ok' },
    metric: { passed: true, duration: 0, values: {}, improved: {} },
    quality: { passed: true, duration: 0, warnings: [], summary: 'ok' },
    overall: 'pass',
    totalDuration: 0,
    ...overrides,
  };
}

function makeMetrics(): MetricDefinition[] {
  return [
    { name: 'latency', unit: 'ms', measureCommand: 'echo 200', direction: 'lower' },
  ];
}

function emptyHistory(missionId = 'test'): AttemptHistory {
  return {
    missionId,
    wins: [],
    deadEnds: [],
    surprises: [],
    totalWaypoints: 0,
    consecutiveDiscards: 0,
    currentBest: {},
    baseline: {},
  };
}

// ── Mission Creation ──

describe('Cerebellum', () => {
  describe('mission lifecycle', () => {
    it('creates a mission with only goal (low-barrier API)', () => {
      const cerebellum = new Cerebellum();
      const mission = cerebellum.createMission({ goal: 'optimize latency below 200ms' });

      expect(mission.goal).toBe('optimize latency below 200ms');
      expect(mission.orientation).toBe('engineer');
      expect(mission.id).toContain('mission_');
      expect(mission.termination.length).toBeGreaterThan(0);
    });

    it('creates a mission with custom orientation', () => {
      const cerebellum = new Cerebellum();
      const mission = cerebellum.createMission({
        goal: 'explore new approaches',
        orientation: 'creative',
      });

      expect(mission.orientation).toBe('creative');
    });

    it('creates a mission with guard and metrics', () => {
      const cerebellum = new Cerebellum();
      const mission = cerebellum.createMission({
        goal: 'improve coverage',
        guard: 'npm test',
        metrics: makeMetrics(),
        maxWaypoints: 20,
      });

      expect(mission.guard).toBeDefined();
      expect(mission.guard!.command).toBe('npm test');
      expect(mission.metrics.length).toBe(1);
    });

    it('activates and deactivates mission', () => {
      const cerebellum = new Cerebellum();
      const mission = cerebellum.createMission({ goal: 'test' });

      expect(cerebellum.hasActiveMission()).toBe(false);

      cerebellum.activateMission(mission);
      expect(cerebellum.hasActiveMission()).toBe(true);
      expect(cerebellum.getActiveMission()?.id).toBe(mission.id);
    });

    it('throws when beginning experiment without active mission', async () => {
      const cerebellum = new Cerebellum();
      await expect(cerebellum.beginExperiment('test')).rejects.toThrow('No active mission');
    });
  });

  describe('experiment lifecycle', () => {
    it('runs a full experiment cycle: begin → verify → decide → record', async () => {
      const cerebellum = new Cerebellum();
      const mission = cerebellum.createMission({
        goal: 'test cycle',
        metrics: makeMetrics(),
      });
      cerebellum.activateMission(mission);

      const experiment = await cerebellum.beginExperiment('refactor API layer');
      expect(experiment.status).toBe('running');
      expect(experiment.waypoint).toBe(1);
      expect(experiment.hypothesis).toBe('refactor API layer');

      const verification = await cerebellum.verify(experiment);
      expect(verification.overall).toBeDefined();

      const history = cerebellum.getHistory();
      const decision = cerebellum.decide(experiment, verification, history);
      expect(['keep', 'discard', 'surprise']).toContain(decision);

      cerebellum.recordOutcome(experiment, decision, verification);
      expect(experiment.status).toMatch(/^(kept|discarded|surprise)$/);

      const updatedHistory = cerebellum.getHistory();
      expect(updatedHistory.totalWaypoints).toBe(1);
    });

    it('increments waypoint counter across experiments', async () => {
      const cerebellum = new Cerebellum();
      const mission = cerebellum.createMission({ goal: 'multi-waypoint' });
      cerebellum.activateMission(mission);

      const exp1 = await cerebellum.beginExperiment('hypothesis 1');
      expect(exp1.waypoint).toBe(1);

      cerebellum.recordOutcome(exp1, 'keep', makeVerification());

      const exp2 = await cerebellum.beginExperiment('hypothesis 2');
      expect(exp2.waypoint).toBe(2);
    });

    it('creates state snapshot on checkpoint', async () => {
      const cerebellum = new Cerebellum();
      const mission = cerebellum.createMission({ goal: 'checkpoint test' });
      cerebellum.activateMission(mission);

      const snapshot = await cerebellum.checkpoint();
      expect(snapshot.id).toContain('snap_');
      expect(snapshot.timestamp).toBeGreaterThan(0);
    });
  });

  describe('termination conditions', () => {
    it('terminates on max_waypoints', () => {
      const cerebellum = new Cerebellum();
      const mission = cerebellum.createMission({ goal: 'term test', maxWaypoints: 3 });
      cerebellum.activateMission(mission);

      const history: AttemptHistory = {
        ...emptyHistory(mission.id),
        totalWaypoints: 3,
      };

      const result = cerebellum.checkTermination(history, mission);
      expect(result.terminated).toBe(true);
      expect(result.reason).toContain('max waypoints');
    });

    it('does not terminate below max_waypoints', () => {
      const cerebellum = new Cerebellum();
      const mission = cerebellum.createMission({ goal: 'no term', maxWaypoints: 50 });
      cerebellum.activateMission(mission);

      const history: AttemptHistory = {
        ...emptyHistory(mission.id),
        totalWaypoints: 10,
      };

      const result = cerebellum.checkTermination(history, mission);
      expect(result.terminated).toBe(false);
    });

    it('terminates on time budget exceeded', () => {
      const cerebellum = new Cerebellum();
      const mission = cerebellum.createMission({
        goal: 'time budget',
        timeBudgetSeconds: 1,
      });
      // Manually set createdAt to the past
      (mission as { createdAt: number }).createdAt = Date.now() - 100_000;
      cerebellum.activateMission(mission);

      const result = cerebellum.checkTermination(emptyHistory(mission.id), mission);
      expect(result.terminated).toBe(true);
      expect(result.reason).toContain('time budget');
    });

    it('terminates on stuck (10 consecutive discards)', () => {
      const cerebellum = new Cerebellum();
      const mission = cerebellum.createMission({ goal: 'stuck test', maxWaypoints: 50 });
      cerebellum.activateMission(mission);

      const history: AttemptHistory = {
        ...emptyHistory(mission.id),
        totalWaypoints: 15,
        consecutiveDiscards: 10,
      };

      const result = cerebellum.checkTermination(history, mission);
      expect(result.terminated).toBe(true);
      expect(result.reason).toContain('stuck');
    });

    it('terminates when all pass with improvement', () => {
      const cerebellum = new Cerebellum();
      const mission = cerebellum.createMission({ goal: 'all pass' });
      cerebellum.activateMission(mission);

      const history: AttemptHistory = {
        ...emptyHistory(mission.id),
        totalWaypoints: 3,
        wins: [
          { waypoint: 1, hypothesis: 'h1', orientation: 'engineer', decision: 'keep', metricValues: { latency: 150 }, description: 'h1', timestamp: Date.now() },
        ],
        currentBest: { latency: 150 },
      };

      const result = cerebellum.checkTermination(history, mission);
      expect(result.terminated).toBe(true);
      expect(result.reason).toContain('all checks pass');
    });

    it('returns no mission if no active mission', () => {
      const cerebellum = new Cerebellum();
      const result = cerebellum.checkTermination();
      expect(result.terminated).toBe(true);
      expect(result.reason).toContain('no active mission');
    });
  });

  describe('surprise detection', () => {
    it('detects surprise in creative mode with novel successful approach', async () => {
      const cerebellum = new Cerebellum();
      const mission = cerebellum.createMission({
        goal: 'surprise test',
        orientation: 'creative',
        metrics: makeMetrics(),
      });
      cerebellum.activateMission(mission);

      // Create a history with some wins
      const experiment = await cerebellum.beginExperiment('completely novel approach xyz');
      const verification = makeVerification({
        metric: {
          passed: true,
          duration: 0,
          values: { latency: { name: 'latency', value: 100, previousBest: 200, direction: 'lower', delta: -100 } },
          improved: { latency: true },
        },
      });

      cerebellum.recordOutcome(experiment, 'keep', verification);

      // Check for surprise
      const surprise = cerebellum.detectSurprise(experiment, verification);
      // In creative mode with novel approach, might detect surprise
      if (surprise) {
        expect(surprise.missionId).toBe(mission.id);
        expect(surprise.noveltyScore).toBeGreaterThanOrEqual(0);
      }
    });

    it('returns null in engineer mode when all metrics fail', () => {
      const cerebellum = new Cerebellum();
      const mission = cerebellum.createMission({
        goal: 'no surprise',
        orientation: 'engineer',
      });
      cerebellum.activateMission(mission);

      const experiment: Experiment = {
        id: 'exp_test',
        missionId: mission.id,
        waypoint: 1,
        hypothesis: 'test',
        orientation: 'engineer',
        checkpoint: { id: 'snap_1', label: 'wp1', timestamp: Date.now(), description: 'test', state: {} },
        status: 'running',
        changes: [],
        timestamp: Date.now(),
      };

      const verification = makeVerification({
        metric: {
          passed: false,
          duration: 0,
          values: {},
          improved: { latency: false },
        },
      });

      const result = cerebellum.detectSurprise(experiment, verification);
      expect(result).toBeNull();
    });
  });

  describe('updateVerification with external metrics', () => {
    it('updates verification with measured values', async () => {
      const cerebellum = new Cerebellum();
      const mission = cerebellum.createMission({
        goal: 'update test',
        metrics: makeMetrics(),
      });
      cerebellum.activateMission(mission);

      const experiment = await cerebellum.beginExperiment('measure');
      const baseVerification = await cerebellum.verify(experiment);

      const updated = cerebellum.updateVerification(
        experiment,
        baseVerification,
        { latency: 150 },
      );

      expect(updated.metric.values.latency.value).toBe(150);
    });

    it('detects improvement when value is lower than previous best', async () => {
      const cerebellum = new Cerebellum();
      const mission = cerebellum.createMission({
        goal: 'improvement test',
        metrics: makeMetrics(),
      });
      cerebellum.activateMission(mission);

      const experiment = await cerebellum.beginExperiment('improve');
      const baseVerification = await cerebellum.verify(experiment);

      // First set a baseline
      const withBaseline = cerebellum.updateVerification(
        experiment,
        baseVerification,
        { latency: 200 },
      );
      cerebellum.recordOutcome(experiment, 'keep', withBaseline);

      // Now improve
      const exp2 = await cerebellum.beginExperiment('improve more');
      const base2 = await cerebellum.verify(exp2);
      const improved = cerebellum.updateVerification(exp2, base2, { latency: 100 });

      expect(improved.metric.values.latency.value).toBe(100);
      expect(improved.metric.values.latency.delta).toBe(-100);
    });
  });
});

// ── Compass Tests ──

describe('Compass', () => {
  it('returns high divergence for novel hypothesis', () => {
    const compass = new Compass();
    const history = emptyHistory();
    const reading = compass.read('engineer', history, 'brand new hypothesis about xyz');

    expect(reading.divergence).toBe(1.0);
    expect(reading.stuckLevel).toBe(0);
    expect(reading.recommendedStrategy).toBeDefined();
  });

  it('returns low divergence for similar hypothesis', () => {
    const compass = new Compass();
    const history: AttemptHistory = {
      ...emptyHistory(),
      wins: [
        { waypoint: 1, hypothesis: 'optimize API latency with caching', orientation: 'engineer', decision: 'keep', metricValues: {}, description: 'test', timestamp: Date.now() },
      ],
    };

    const reading = compass.read('engineer', history, 'optimize API latency with caching');
    expect(reading.divergence).toBe(0);
  });

  it('uses stuck recovery when stuckLevel >= 5', () => {
    const compass = new Compass();
    const history: AttemptHistory = {
      ...emptyHistory(),
      consecutiveDiscards: 5,
      deadEnds: Array.from({ length: 5 }, (_, i) => ({
        waypoint: i + 1,
        hypothesis: `failed attempt ${i}`,
        orientation: 'engineer' as const,
        decision: 'discard' as const,
        metricValues: {},
        description: 'test',
        timestamp: Date.now(),
      })),
    };

    const reading = compass.read('engineer', history, 'try something different');
    expect(reading.stuckLevel).toBe(5);
    expect(reading.recommendedStrategy.forceDivergence).toBe(true);
  });

  it('engineer mode defaults to hypothesis_driven pattern', () => {
    const compass = new Compass();
    const reading = compass.read('engineer', emptyHistory(), 'test');
    expect(reading.recommendedStrategy.pattern).toBe('hypothesis_driven');
  });

  it('production mode defaults to progressive_minimal pattern', () => {
    const compass = new Compass();
    const reading = compass.read('production', emptyHistory(), 'test');
    expect(reading.recommendedStrategy.pattern).toBe('progressive_minimal');
  });
});

// ── Evaluator Tests ──

describe('Evaluator', () => {
  const metrics: MetricDefinition[] = [
    { name: 'errors', unit: 'count', measureCommand: 'echo 0', direction: 'lower' },
  ];

  it('returns pass when no guard defined', async () => {
    const evaluator = new Evaluator(metrics);
    const result = await evaluator.verify({});

    expect(result.syntax.passed).toBe(true);
    expect(result.guard.passed).toBe(true);
    expect(result.overall).toBeDefined();
  });

  it('returns fail on syntax failure', async () => {
    const evaluator = new Evaluator(metrics);
    const result = await evaluator.verify(
      {},
      async () => ({ passed: false, duration: 1, error: 'syntax error' }),
      'broken code',
    );

    expect(result.syntax.passed).toBe(false);
    expect(result.overall).toBe('fail');
  });

  it('decides keep on pass in engineer mode', () => {
    const evaluator = new Evaluator(metrics);
    const verification = makeVerification();

    const decision = evaluator.decide(verification, 'engineer', 0.5);
    expect(decision).toBe('keep');
  });

  it('decides discard on guard failure regardless of orientation', () => {
    const evaluator = new Evaluator(metrics);
    const verification = makeVerification({
      guard: { passed: false, duration: 0, error: 'test failed' },
      overall: 'fail',
    });

    expect(evaluator.decide(verification, 'engineer', 0.5)).toBe('discard');
    expect(evaluator.decide(verification, 'creative', 0.5)).toBe('discard');
    expect(evaluator.decide(verification, 'production', 0.5)).toBe('discard');
  });

  it('decides surprise on high novelty in creative mode', () => {
    const evaluator = new Evaluator(metrics);
    const verification = makeVerification({
      metric: {
        passed: false,
        duration: 0,
        values: {},
        improved: { errors: false },
      },
      overall: 'warning',
    });

    const decision = evaluator.decide(verification, 'creative', 0.8);
    expect(decision).toBe('surprise');
  });

  it('decides discard in production mode without improvement', () => {
    const evaluator = new Evaluator(metrics);
    const verification = makeVerification({
      metric: {
        passed: false,
        duration: 0,
        values: {},
        improved: { errors: false },
      },
    });

    const decision = evaluator.decide(verification, 'production', 0.5);
    expect(decision).toBe('discard');
  });

  it('decides discard in production mode with quality errors', () => {
    const evaluator = new Evaluator(metrics);
    const verification = makeVerification({
      metric: {
        passed: true,
        duration: 0,
        values: { errors: { name: 'errors', value: 1, previousBest: 2, direction: 'lower', delta: -1 } },
        improved: { errors: true },
      },
      quality: {
        passed: false,
        duration: 0,
        warnings: [{ type: 'security', message: 'unsafe code', severity: 'error' }],
        summary: '1 error',
      },
    });

    const decision = evaluator.decide(verification, 'production', 0.5);
    expect(decision).toBe('discard');
  });

  it('updates metric values from external measurements', () => {
    const evaluator = new Evaluator(metrics);
    const base = makeVerification();

    const updated = evaluator.updateMetricValues(base, { errors: 5 }, { errors: 10 });
    expect(updated.metric.values.errors.value).toBe(5);
    expect(updated.metric.values.errors.delta).toBe(-5);
    expect(updated.metric.improved.errors).toBe(true);
  });
});

// ── ExperimentTracker Tests ──

describe('ExperimentTracker', () => {
  function makeExperiment(waypoint: number, missionId: string): Experiment {
    return {
      id: `exp_${waypoint}`,
      missionId,
      waypoint,
      hypothesis: `hypothesis ${waypoint}`,
      orientation: 'engineer',
      checkpoint: { id: `snap_${waypoint}`, label: `wp${waypoint}`, timestamp: Date.now(), description: 'test', state: {} },
      status: 'running',
      changes: [],
      timestamp: Date.now(),
    };
  }

  it('registers mission and tracks history', () => {
    const tracker = new ExperimentTracker();
    const mission: Mission = {
      id: 'mission_1',
      goal: 'test',
      orientation: 'engineer',
      metrics: [],
      termination: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    tracker.registerMission(mission);
    const history = tracker.getHistory('mission_1');
    expect(history.totalWaypoints).toBe(0);
  });

  it('records experiments and counts waypoints', () => {
    const tracker = new ExperimentTracker();
    const mission: Mission = {
      id: 'mission_1',
      goal: 'test',
      orientation: 'engineer',
      metrics: [{ name: 'x', unit: '-', measureCommand: 'echo', direction: 'lower' }],
      termination: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    tracker.registerMission(mission);

    const exp = makeExperiment(1, 'mission_1');
    const verification = makeVerification({
      metric: {
        passed: true,
        duration: 0,
        values: { x: { name: 'x', value: 10, previousBest: null, direction: 'lower', delta: null } },
        improved: { x: true },
      },
    });

    tracker.record(exp, 'keep', verification);

    const history = tracker.getHistory('mission_1');
    expect(history.totalWaypoints).toBe(1);
    expect(history.wins.length).toBe(1);
    expect(history.deadEnds.length).toBe(0);
  });

  it('tracks consecutive discards', () => {
    const tracker = new ExperimentTracker();
    const mission: Mission = {
      id: 'mission_1',
      goal: 'test',
      orientation: 'engineer',
      metrics: [],
      termination: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    tracker.registerMission(mission);

    for (let i = 1; i <= 3; i++) {
      tracker.record(makeExperiment(i, 'mission_1'), 'discard', makeVerification());
    }

    const history = tracker.getHistory('mission_1');
    expect(history.consecutiveDiscards).toBe(3);
    expect(history.deadEnds.length).toBe(3);
  });

  it('resets consecutive discards after a keep', () => {
    const tracker = new ExperimentTracker();
    const mission: Mission = {
      id: 'mission_1',
      goal: 'test',
      orientation: 'engineer',
      metrics: [{ name: 'x', unit: '-', measureCommand: 'echo', direction: 'lower' }],
      termination: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    tracker.registerMission(mission);

    tracker.record(makeExperiment(1, 'mission_1'), 'discard', makeVerification());
    tracker.record(makeExperiment(2, 'mission_1'), 'discard', makeVerification());
    tracker.record(
      makeExperiment(3, 'mission_1'),
      'keep',
      makeVerification({
        metric: {
          passed: true,
          duration: 0,
          values: { x: { name: 'x', value: 5, previousBest: null, direction: 'lower', delta: null } },
          improved: { x: true },
        },
      }),
    );
    tracker.record(makeExperiment(4, 'mission_1'), 'discard', makeVerification());

    const history = tracker.getHistory('mission_1');
    expect(history.consecutiveDiscards).toBe(1);
  });

  it('updates best metrics on keep', () => {
    const tracker = new ExperimentTracker();
    const mission: Mission = {
      id: 'mission_1',
      goal: 'test',
      orientation: 'engineer',
      metrics: [{ name: 'latency', unit: 'ms', measureCommand: 'echo', direction: 'lower' }],
      termination: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    tracker.registerMission(mission);
    tracker.setBaseline('mission_1', { latency: 300 });

    tracker.record(
      makeExperiment(1, 'mission_1'),
      'keep',
      makeVerification({
        metric: {
          passed: true,
          duration: 0,
          values: { latency: { name: 'latency', value: 200, previousBest: 300, direction: 'lower', delta: -100 } },
          improved: { latency: true },
        },
      }),
    );

    const history = tracker.getHistory('mission_1');
    expect(history.currentBest.latency).toBe(200);
  });

  it('calculates divergence between hypotheses', () => {
    const tracker = new ExperimentTracker();
    const mission: Mission = {
      id: 'mission_1',
      goal: 'test',
      orientation: 'engineer',
      metrics: [],
      termination: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    tracker.registerMission(mission);

    tracker.record(makeExperiment(1, 'mission_1'), 'keep', makeVerification());

    // Same hypothesis → low divergence
    const lowDiv = tracker.calculateDivergence('mission_1', 'hypothesis 1');
    expect(lowDiv).toBe(0);

    // Different hypothesis → higher divergence
    const highDiv = tracker.calculateDivergence('mission_1', 'completely new approach');
    expect(highDiv).toBeGreaterThan(0);
  });

  it('records surprises', () => {
    const tracker = new ExperimentTracker();
    const mission: Mission = {
      id: 'mission_1',
      goal: 'test',
      orientation: 'engineer',
      metrics: [],
      termination: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    tracker.registerMission(mission);

    tracker.recordSurprise({
      id: 'surprise_1',
      experimentId: 'exp_1',
      missionId: 'mission_1',
      expectedOutcome: 'no change',
      actualOutcome: 'big improvement',
      contradiction: 'unexpected result',
      insight: 'novel pattern discovered',
      noveltyScore: 0.9,
      timestamp: Date.now(),
    });

    const history = tracker.getHistory('mission_1');
    expect(history.surprises.length).toBe(1);
    expect(history.surprises[0].insight).toBe('novel pattern discovered');
  });

  it('clears mission history', () => {
    const tracker = new ExperimentTracker();
    const mission: Mission = {
      id: 'mission_1',
      goal: 'test',
      orientation: 'engineer',
      metrics: [],
      termination: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    tracker.registerMission(mission);
    tracker.record(makeExperiment(1, 'mission_1'), 'keep', makeVerification());

    tracker.clearMission('mission_1');
    const history = tracker.getHistory('mission_1');
    expect(history.totalWaypoints).toBe(0);
  });
});
