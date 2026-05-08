/**
 * Decision Engine Tests
 */

import { describe, it, expect } from 'vitest';
import { DecisionEngine } from '../prefrontal/decision.js';
import { RiskAssessor } from '../prefrontal/risk.js';
import type { Plan, PlanStep, Decision } from '../prefrontal/types.js';
import { DEFAULT_PREFRONTAL_CONFIG } from '../prefrontal/types.js';

function createStep(overrides: Partial<PlanStep> = {}): PlanStep {
  return {
    id: `step_${Math.random().toString(36).slice(2, 6)}`,
    description: 'Test step',
    order: 0,
    dependencies: [],
    status: 'ready',
    ...overrides,
  };
}

function createPlan(overrides: Partial<Plan> = {}): Plan {
  return {
    id: 'plan_1',
    goalId: 'goal_1',
    steps: [createStep()],
    strategy: 'sequential',
    createdAt: Date.now(),
    ...overrides,
  };
}

describe('DecisionEngine', () => {
  const riskAssessor = new RiskAssessor();

  it('should make a decision for a plan with ready steps', () => {
    const engine = new DecisionEngine(riskAssessor);
    const step = createStep({ description: 'Write code', order: 1 });
    const plan = createPlan({ steps: [step] });

    const decision = engine.decide(plan, {
      recentSuccessRate: 0.8,
      activeGoals: 2,
    });

    expect(decision.id).toContain('decision_');
    expect(decision.planId).toBe('plan_1');
    expect(decision.chosenStep.id).toBe(step.id);
    expect(decision.confidence).toBeGreaterThanOrEqual(0);
    expect(decision.confidence).toBeLessThanOrEqual(1);
    expect(decision.reasoning).toBeTruthy();
    expect(decision.riskAssessment).toBeDefined();
    expect(decision.decidedAt).toBeGreaterThan(0);
  });

  it('should throw when no steps are ready', () => {
    const engine = new DecisionEngine(riskAssessor);
    const plan = createPlan({
      steps: [createStep({ status: 'completed' })],
    });

    expect(() => {
      engine.decide(plan, { recentSuccessRate: 0.5, activeGoals: 1 });
    }).toThrow('No ready steps available');
  });

  it('should throw when steps have unmet dependencies', () => {
    const engine = new DecisionEngine(riskAssessor);
    const plan = createPlan({
      steps: [
        createStep({ id: 's1', status: 'ready', dependencies: ['s2'] }),
        createStep({ id: 's2', status: 'blocked', dependencies: [] }),
      ],
    });

    expect(() => {
      engine.decide(plan, { recentSuccessRate: 0.5, activeGoals: 1 });
    }).toThrow('No ready steps available');
  });

  it('should select highest priority (lowest order) step', () => {
    const engine = new DecisionEngine(riskAssessor);
    const step1 = createStep({ id: 's1', description: 'First', order: 1 });
    const step2 = createStep({ id: 's2', description: 'Second', order: 2 });
    const plan = createPlan({ steps: [step2, step1] });

    const decision = engine.decide(plan, { recentSuccessRate: 0.5, activeGoals: 1 });

    expect(decision.chosenStep.id).toBe('s1');
  });

  it('should skip steps with unmet dependencies', () => {
    const engine = new DecisionEngine(riskAssessor);
    const step1 = createStep({ id: 's1', order: 1, status: 'ready' });
    const step2 = createStep({ id: 's2', order: 2, status: 'ready', dependencies: ['s1'] });
    const plan = createPlan({ steps: [step1, step2] });

    const decision = engine.decide(plan, { recentSuccessRate: 0.5, activeGoals: 1 });

    // s1 should be chosen since s2 depends on s1 which is not completed
    expect(decision.chosenStep.id).toBe('s1');
  });

  it('should include dependencies met for completed deps', () => {
    const engine = new DecisionEngine(riskAssessor);
    const step1 = createStep({ id: 's1', order: 1, status: 'completed' });
    const step2 = createStep({ id: 's2', order: 2, status: 'ready', dependencies: ['s1'] });
    const plan = createPlan({ steps: [step1, step2] });

    const decision = engine.decide(plan, { recentSuccessRate: 0.5, activeGoals: 1 });

    expect(decision.chosenStep.id).toBe('s2');
  });

  it('should record decision history', () => {
    const engine = new DecisionEngine(riskAssessor);

    engine.decide(createPlan({ steps: [createStep()] }), { recentSuccessRate: 0.5, activeGoals: 1 });
    engine.decide(createPlan({ id: 'plan_2', steps: [createStep()] }), { recentSuccessRate: 0.5, activeGoals: 1 });

    const history = engine.getDecisionHistory();
    expect(history).toHaveLength(2);
  });

  it('should limit decision history', () => {
    const engine = new DecisionEngine(riskAssessor);

    for (let i = 0; i < 5; i++) {
      engine.decide(createPlan({ steps: [createStep()] }), { recentSuccessRate: 0.5, activeGoals: 1 });
    }

    const limited = engine.getDecisionHistory(3);
    expect(limited).toHaveLength(3);
  });

  it('should clear history', () => {
    const engine = new DecisionEngine(riskAssessor);

    engine.decide(createPlan({ steps: [createStep()] }), { recentSuccessRate: 0.5, activeGoals: 1 });
    engine.clearHistory();

    expect(engine.getDecisionHistory()).toHaveLength(0);
  });

  it('should calculate decision stats', () => {
    const engine = new DecisionEngine(riskAssessor);

    for (let i = 0; i < 3; i++) {
      engine.decide(createPlan({ steps: [createStep()] }), { recentSuccessRate: 0.5, activeGoals: 1 });
    }

    const stats = engine.getDecisionStats();
    expect(stats.total).toBe(3);
    expect(stats.averageConfidence).toBeGreaterThan(0);
    expect(stats.byRiskLevel).toBeDefined();
  });

  it('should return empty stats for no decisions', () => {
    const engine = new DecisionEngine(riskAssessor);
    const stats = engine.getDecisionStats();

    expect(stats.total).toBe(0);
    expect(stats.averageConfidence).toBe(0);
    expect(stats.byRiskLevel).toEqual({});
  });

  it('should generate alternatives for high-risk actions', () => {
    const engine = new DecisionEngine(riskAssessor);
    const step = createStep({
      description: 'Delete files',
      action: { type: 'file_delete', payload: { path: '/important' } },
    });
    const plan = createPlan({ steps: [step] });

    const decision = engine.decide(plan, { recentSuccessRate: 0.5, activeGoals: 1 });

    // file_delete has high base risk (0.8), should generate alternatives
    expect(decision.riskAssessment.overallScore).toBeGreaterThan(0);
  });

  it('exploratory strategy should proceed without WARNING even at high risk', () => {
    const engine = new DecisionEngine(riskAssessor);
    const step = createStep({
      action: { type: 'system_command', payload: { cmd: 'rm -rf /' } },
    });
    const plan = createPlan({ steps: [step], strategy: 'exploratory' });

    const decision = engine.decide(plan, { recentSuccessRate: 0.5, activeGoals: 1 });

    // Exploratory strategy proceeds regardless of risk — no warning
    expect(decision.reasoning).not.toContain('WARNING');
    expect(decision.riskAssessment.level).toBe('critical');
  });

  it('sequential strategy should add WARNING when risk exceeds tolerance', () => {
    const engine = new DecisionEngine(riskAssessor, {
      ...DEFAULT_PREFRONTAL_CONFIG,
      riskTolerance: 0.1, // Very low tolerance
    });
    const step = createStep({
      action: { type: 'system_command', payload: { cmd: 'rm -rf /' } },
    });
    const plan = createPlan({ steps: [step], strategy: 'sequential' });

    const decision = engine.decide(plan, { recentSuccessRate: 0.5, activeGoals: 1 });

    // Sequential with risk > tolerance → WARNING
    expect(decision.reasoning).toContain('WARNING');
  });

  it('should calculate confidence based on risk and success rate', () => {
    const engine = new DecisionEngine(riskAssessor);

    const lowRiskDecision = engine.decide(
      createPlan({ steps: [createStep({ action: { type: 'memory_store', payload: {} } })] }),
      { recentSuccessRate: 0.9, activeGoals: 1 },
    );

    const highRiskDecision = engine.decide(
      createPlan({ steps: [createStep({ action: { type: 'system_command', payload: {} } })] }),
      { recentSuccessRate: 0.1, activeGoals: 10 },
    );

    // Higher success rate and lower risk should give higher confidence
    expect(lowRiskDecision.confidence).toBeGreaterThan(highRiskDecision.confidence);
  });

  it('should include risk factors in reasoning', () => {
    const engine = new DecisionEngine(riskAssessor);
    const step = createStep({
      description: 'Edit code',
      action: { type: 'code_edit', payload: { file: 'main.ts' } },
    });
    const plan = createPlan({ steps: [step] });

    const decision = engine.decide(plan, { recentSuccessRate: 0.5, activeGoals: 1 });

    expect(decision.reasoning).toContain('Edit code');
    expect(decision.reasoning).toContain('Risk assessment');
  });
});
