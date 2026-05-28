/**
 * Prefrontal Cortex 测试
 *
 * 测试前额叶皮层的规划、执行、风险评估和决策功能
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  Planner,
  PlanExecutor,
  RiskAssessor,
  DecisionEngine,
  DEFAULT_PREFRONTAL_CONFIG,
  type Goal,
  type Plan,
  type PlanStep,
} from '../prefrontal/index.js';

describe('Prefrontal Cortex', () => {
  describe('Planner', () => {
    let planner: Planner;

    beforeEach(() => {
      planner = new Planner();
    });

    it('should create a plan from a simple goal', async () => {
      const goal: Goal = {
        id: 'goal_1',
        description: 'Write a test file',
        priority: 0.8,
        status: 'pending',
        createdAt: Date.now(),
      };

      const plan = await planner.createPlan(goal);

      expect(plan).toBeDefined();
      expect(plan.goalId).toBe(goal.id);
      expect(plan.steps).toBeDefined();
      expect(plan.steps.length).toBeGreaterThan(0);
      expect(plan.strategy).toBeDefined();
    });

    it('should decompose goal by arrow separators', async () => {
      const goal: Goal = {
        id: 'goal_2',
        description: 'Step 1 → Step 2 → Step 3',
        priority: 0.5,
        status: 'pending',
        createdAt: Date.now(),
      };

      const plan = await planner.createPlan(goal);

      expect(plan.steps.length).toBe(3);
      expect(plan.steps[0].description).toContain('Step 1');
      expect(plan.steps[1].description).toContain('Step 2');
      expect(plan.steps[2].description).toContain('Step 3');
    });

    it('should set correct step dependencies', async () => {
      const goal: Goal = {
        id: 'goal_3',
        description: 'First step → Second step → Third step',
        priority: 0.5,
        status: 'pending',
        createdAt: Date.now(),
      };

      const plan = await planner.createPlan(goal);

      // First step should have no dependencies
      expect(plan.steps[0].dependencies).toHaveLength(0);

      // Second step should depend on first
      expect(plan.steps[1].dependencies).toContain(plan.steps[0].id);

      // Third step should depend on second
      expect(plan.steps[2].dependencies).toContain(plan.steps[1].id);
    });

    it('should detect exploratory strategy from keywords', async () => {
      const goal: Goal = {
        id: 'goal_4',
        description: 'Research the best approach for this feature',
        priority: 0.7,
        status: 'pending',
        createdAt: Date.now(),
      };

      const plan = await planner.createPlan(goal);

      expect(plan.strategy).toBe('exploratory');
    });

    it('should detect sequential strategy from keywords', async () => {
      const goal: Goal = {
        id: 'goal_5',
        description: 'Build a new component for the app',
        priority: 0.7,
        status: 'pending',
        createdAt: Date.now(),
      };

      const plan = await planner.createPlan(goal);

      expect(plan.strategy).toBe('sequential');
    });

    it('should get ready steps with completed dependencies', async () => {
      const goal: Goal = {
        id: 'goal_6',
        description: 'Step 1 → Step 2 → Step 3',
        priority: 0.5,
        status: 'pending',
        createdAt: Date.now(),
      };

      const plan = await planner.createPlan(goal);

      // Initially only first step is ready
      const initialReady = planner.getReadySteps(plan);
      expect(initialReady).toHaveLength(1);
      expect(initialReady[0].order).toBe(0);

      // Complete first step
      const updatedPlan = planner.updateStepStatus(
        plan,
        plan.steps[0].id,
        'completed',
        {
          success: true,
          completedAt: Date.now(),
        }
      );

      // Now second step should be ready
      const newReady = planner.getReadySteps(updatedPlan);
      expect(newReady).toHaveLength(1);
      expect(newReady[0].order).toBe(1);
    });

    it('should replan after step failure', async () => {
      const goal: Goal = {
        id: 'goal_7',
        description: 'Step 1 → Step 2 → Step 3',
        priority: 0.5,
        status: 'pending',
        createdAt: Date.now(),
      };

      const originalPlan = await planner.createPlan(goal);
      const failedStepId = originalPlan.steps[1].id;

      const replanned = planner.replan(originalPlan, failedStepId);

      expect(replanned.steps[1].id).not.toBe(failedStepId);
      expect(replanned.steps[1].description).toContain('Alternative approach');
      expect(replanned.steps[1].status).toBe('ready');
    });

    it('should update step status correctly', async () => {
      const goal: Goal = {
        id: 'goal_8',
        description: 'Test step update',
        priority: 0.5,
        status: 'pending',
        createdAt: Date.now(),
      };

      const plan = await planner.createPlan(goal);
      const stepId = plan.steps[0].id;

      const result = {
        success: true,
        output: { data: 'test' },
        completedAt: Date.now(),
      };

      const updatedPlan = planner.updateStepStatus(plan, stepId, 'completed', result);

      const updatedStep = updatedPlan.steps.find(s => s.id === stepId);
      expect(updatedStep?.status).toBe('completed');
      expect(updatedStep?.result).toEqual(result);
    });
  });

  describe('PlanExecutor', () => {
    let executor: PlanExecutor;
    let planner: Planner;

    beforeEach(() => {
      planner = new Planner();
      executor = new PlanExecutor(planner);
    });

    it('should submit a goal and create a plan', async () => {
      const goal: Goal = {
        id: 'goal_1',
        description: 'Execute task A → Execute task B',
        priority: 0.8,
        status: 'pending',
        createdAt: Date.now(),
      };

      const plan = await executor.submitGoal(goal);

      expect(plan).toBeDefined();
      expect(plan.goalId).toBe(goal.id);
      expect(executor.getPlan(plan.id)).toEqual(plan);
    });

    it('should get next action from plan', async () => {
      const goal: Goal = {
        id: 'goal_2',
        description: 'First step → Second step',
        priority: 0.7,
        status: 'pending',
        createdAt: Date.now(),
      };

      const plan = await executor.submitGoal(goal);
      const nextAction = executor.getNextAction(plan.id);

      expect(nextAction).toBeDefined();
      expect(nextAction?.order).toBe(0);
      expect(nextAction?.status).toBe('ready');
    });

    it('should report step results and update plan', async () => {
      const goal: Goal = {
        id: 'goal_3',
        description: 'Step A → Step B',
        priority: 0.6,
        status: 'pending',
        createdAt: Date.now(),
      };

      const plan = await executor.submitGoal(goal);
      const firstStep = executor.getNextAction(plan.id);

      expect(firstStep).toBeDefined();

      const result = {
        success: true,
        output: { done: true },
        completedAt: Date.now(),
      };

      executor.reportStepResult(plan.id, firstStep!.id, result);

      const updatedPlan = executor.getPlan(plan.id);
      expect(updatedPlan?.steps[0].status).toBe('completed');
    });

    it('should trigger replan on failed step (non-exploratory)', async () => {
      const goal: Goal = {
        id: 'goal_4',
        description: 'Step 1 → Step 2',
        priority: 0.6,
        status: 'pending',
        createdAt: Date.now(),
      };

      const plan = await executor.submitGoal(goal);
      const firstStep = executor.getNextAction(plan.id);

      const failResult = {
        success: false,
        error: 'Something went wrong',
        completedAt: Date.now(),
      };

      executor.reportStepResult(plan.id, firstStep!.id, failResult);

      // First failure resets to 'ready' for retry
      let updatedPlan = executor.getPlan(plan.id);
      expect(updatedPlan?.steps[0].status).toBe('ready');

      // Second failure also resets to 'ready'
      executor.reportStepResult(plan.id, firstStep!.id, failResult);
      updatedPlan = executor.getPlan(plan.id);
      expect(updatedPlan?.steps[0].status).toBe('ready');

      // Third failure exhausts retries → skipped + replan
      executor.reportStepResult(plan.id, firstStep!.id, failResult);
      updatedPlan = executor.getPlan(plan.id);
      expect(updatedPlan?.steps[0].description).toContain('Alternative approach');
    });

    it('should return active plans', async () => {
      const goal1: Goal = {
        id: 'goal_5',
        description: 'Active task',
        priority: 0.8,
        status: 'in_progress',
        createdAt: Date.now(),
      };

      const goal2: Goal = {
        id: 'goal_6',
        description: 'Another active task',
        priority: 0.7,
        status: 'in_progress',
        createdAt: Date.now(),
      };

      await executor.submitGoal(goal1);
      await executor.submitGoal(goal2);

      const activePlans = executor.getActivePlans();
      expect(activePlans.length).toBeGreaterThanOrEqual(2);
    });

    it('should abandon a plan', async () => {
      const goal: Goal = {
        id: 'goal_7',
        description: 'Task to abandon',
        priority: 0.5,
        status: 'pending',
        createdAt: Date.now(),
      };

      const plan = await executor.submitGoal(goal);
      const abandoned = executor.abandonPlan(plan.id);

      expect(abandoned).toBe(true);

      // Plan should still exist but steps should be skipped
      const retrievedPlan = executor.getPlan(plan.id);
      const allSkipped = retrievedPlan?.steps.every(
        s => s.status === 'completed' || s.status === 'skipped'
      );
      expect(allSkipped).toBe(true);
    });

    it('should get plan by goal ID', async () => {
      const goal: Goal = {
        id: 'goal_8',
        description: 'Test goal lookup',
        priority: 0.6,
        status: 'pending',
        createdAt: Date.now(),
      };

      await executor.submitGoal(goal);

      const plan = executor.getPlanByGoal(goal.id);
      expect(plan).toBeDefined();
      expect(plan?.goalId).toBe(goal.id);
    });

    it('should provide execution stats', async () => {
      const goal: Goal = {
        id: 'goal_9',
        description: 'Step 1 → Step 2',
        priority: 0.7,
        status: 'pending',
        createdAt: Date.now(),
      };

      const plan = await executor.submitGoal(goal);
      const firstStep = executor.getNextAction(plan.id);

      executor.reportStepResult(plan.id, firstStep!.id, {
        success: true,
        completedAt: Date.now(),
      });

      const stats = executor.getStats();
      expect(stats.totalPlans).toBeGreaterThanOrEqual(1);
      expect(stats.completedSteps).toBeGreaterThanOrEqual(1);
    });
  });

  describe('RiskAssessor', () => {
    let assessor: RiskAssessor;

    beforeEach(() => {
      assessor = new RiskAssessor();
    });

    it('should assess low risk for memory store', () => {
      const assessment = assessor.assess({ type: 'memory_store' });

      expect(assessment.level).toBe('negligible');
      expect(assessment.overallScore).toBeLessThan(0.2);
    });

    it('should assess moderate risk for code edit', () => {
      const assessment = assessor.assess({ type: 'code_edit' });

      expect(assessment.level).toBe('moderate');
      expect(assessment.overallScore).toBeGreaterThanOrEqual(0.4);
    });

    it('should assess high risk for file delete', () => {
      const assessment = assessor.assess({ type: 'file_delete' });

      expect(assessment.level).toBe('high');
      expect(assessment.overallScore).toBeGreaterThanOrEqual(0.6);
    });

    it('should assess critical risk for system command', () => {
      const assessment = assessor.assess({ type: 'system_command' });

      expect(assessment.level).toBe('critical');
      expect(assessment.overallScore).toBeGreaterThanOrEqual(0.8);
    });

    it('should provide risk factors', () => {
      const assessment = assessor.assess({ type: 'code_edit' });

      expect(assessment.factors).toBeDefined();
      expect(assessment.factors.length).toBeGreaterThan(0);

      const reversibilityFactor = assessment.factors.find(f => f.name === 'reversibility');
      expect(reversibilityFactor).toBeDefined();
    });

    it('should provide mitigations for risky actions', () => {
      const assessment = assessor.assess({ type: 'code_edit' });

      expect(assessment.mitigations).toBeDefined();
      expect(assessment.mitigations.length).toBeGreaterThan(0);
      expect(assessment.mitigations.some(m => m.includes('测试') || m.includes('backup') || m.toLowerCase().includes('version'))).toBe(true);
    });

    it('should compare two actions', () => {
      const comparison = assessor.compare(
        { type: 'memory_store' },
        { type: 'file_delete' }
      );

      expect(comparison.safer).toBe('action1');
      expect(comparison.action1Risk.overallScore).toBeLessThan(
        comparison.action2Risk.overallScore
      );
    });

    it('should assess batch of actions', () => {
      const actions = [
        { type: 'memory_store' },
        { type: 'code_edit' },
        { type: 'tool_call' },
      ];

      const assessments = assessor.assessBatch(actions);

      expect(assessments).toHaveLength(3);
      expect(assessments[0].level).toBe('negligible');
      expect(assessments[1].level).toBe('moderate');
    });
  });

  describe('DecisionEngine', () => {
    let engine: DecisionEngine;
    let riskAssessor: RiskAssessor;
    let plan: Plan;

    beforeEach(async () => {
      riskAssessor = new RiskAssessor();
      engine = new DecisionEngine(riskAssessor);

      const planner = new Planner();
      const goal: Goal = {
        id: 'goal_1',
        description: 'Step 1 → Step 2 → Step 3',
        priority: 0.8,
        status: 'pending',
        createdAt: Date.now(),
      };
      plan = await planner.createPlan(goal);
    });

    it('should make a decision for a plan', () => {
      const decision = engine.decide(plan, {
        recentSuccessRate: 0.8,
        activeGoals: 1,
      });

      expect(decision).toBeDefined();
      expect(decision.planId).toBe(plan.id);
      expect(decision.chosenStep).toBeDefined();
      expect(decision.confidence).toBeGreaterThanOrEqual(0);
      expect(decision.confidence).toBeLessThanOrEqual(1);
    });

    it('should include risk assessment in decision', () => {
      const decision = engine.decide(plan, {
        recentSuccessRate: 0.7,
        activeGoals: 2,
      });

      expect(decision.riskAssessment).toBeDefined();
      expect(decision.riskAssessment.level).toBeDefined();
      expect(decision.riskAssessment.overallScore).toBeGreaterThanOrEqual(0);
    });

    it('should generate reasoning', () => {
      const decision = engine.decide(plan, {
        recentSuccessRate: 0.9,
        activeGoals: 1,
      });

      expect(decision.reasoning).toBeDefined();
      expect(decision.reasoning.length).toBeGreaterThan(0);
      expect(decision.reasoning).toContain('Selected step');
    });

    it('should provide alternatives for high-risk steps', () => {
      // Add an action to make it higher risk
      plan.steps[0].action = { type: 'system_command', payload: {} };

      const decision = engine.decide(plan, {
        recentSuccessRate: 0.5,
        activeGoals: 3,
      });

      // High risk should trigger alternatives
      if (decision.riskAssessment.overallScore > DEFAULT_PREFRONTAL_CONFIG.riskTolerance) {
        expect(decision.alternatives.length).toBeGreaterThan(0);
      }
    });

    it('should proceed despite high risk in exploratory mode', () => {
      plan.strategy = 'exploratory';
      plan.steps[0].action = { type: 'file_delete', payload: {} };

      const decision = engine.decide(plan, {
        recentSuccessRate: 0.5,
        activeGoals: 1,
      });

      // Even with high risk, exploratory mode should proceed
      expect(decision.reasoning).toBeDefined();
      expect(decision.chosenStep).toBeDefined();
    });

    it('should track decision history', () => {
      engine.decide(plan, { recentSuccessRate: 0.8, activeGoals: 1 });
      engine.decide(plan, { recentSuccessRate: 0.7, activeGoals: 1 });

      const history = engine.getDecisionHistory();
      expect(history.length).toBe(2);
    });

    it('should provide decision statistics', () => {
      engine.decide(plan, { recentSuccessRate: 0.8, activeGoals: 1 });
      engine.decide(plan, { recentSuccessRate: 0.6, activeGoals: 2 });

      const stats = engine.getDecisionStats();

      expect(stats.total).toBe(2);
      expect(stats.byRiskLevel).toBeDefined();
      expect(stats.averageConfidence).toBeGreaterThan(0);
    });

    it('should limit decision history when requested', () => {
      for (let i = 0; i < 10; i++) {
        engine.decide(plan, { recentSuccessRate: 0.8, activeGoals: 1 });
      }

      const limitedHistory = engine.getDecisionHistory(5);
      expect(limitedHistory.length).toBe(5);
    });
  });

  describe('Integration', () => {
    it('should complete full goal-to-execution flow', async () => {
      // Setup
      const planner = new Planner();
      const riskAssessor = new RiskAssessor();
      const decisionEngine = new DecisionEngine(riskAssessor);
      const executor = new PlanExecutor(planner);

      // Create goal
      const goal: Goal = {
        id: 'integration_goal',
        description: 'Research topic → Write code → Test code',
        priority: 0.9,
        status: 'pending',
        createdAt: Date.now(),
      };

      // Submit goal
      const plan = await executor.submitGoal(goal);
      expect(plan.strategy).toBe('exploratory'); // Contains "research"
      expect(plan.steps.length).toBe(3);

      // Get next action
      const nextAction = executor.getNextAction(plan.id);
      expect(nextAction).toBeDefined();

      // Make decision
      const decision = decisionEngine.decide(plan, {
        recentSuccessRate: 0.8,
        activeGoals: 1,
      });

      expect(decision.chosenStep.id).toBe(nextAction!.id);

      // Execute and report result
      executor.reportStepResult(plan.id, nextAction!.id, {
        success: true,
        output: { completed: true },
        completedAt: Date.now(),
      });

      // Verify step completed
      const updatedPlan = executor.getPlan(plan.id);
      expect(updatedPlan?.steps[0].status).toBe('completed');

      // Get next action (should be second step)
      const secondAction = executor.getNextAction(plan.id);
      expect(secondAction?.order).toBe(1);

      // Verify stats
      const stats = executor.getStats();
      expect(stats.completedSteps).toBe(1);
    });

    it('should handle plan abandonment mid-execution', async () => {
      const planner = new Planner();
      const executor = new PlanExecutor(planner);

      const goal: Goal = {
        id: 'abandon_test',
        description: 'Step 1 → Step 2 → Step 3 → Step 4',
        priority: 0.5,
        status: 'pending',
        createdAt: Date.now(),
      };

      const plan = await executor.submitGoal(goal);
      const firstStep = executor.getNextAction(plan.id);

      executor.reportStepResult(plan.id, firstStep!.id, {
        success: true,
        completedAt: Date.now(),
      });

      // Abandon plan
      const abandoned = executor.abandonPlan(plan.id);
      expect(abandoned).toBe(true);

      // All remaining steps should be skipped
      const finalPlan = executor.getPlan(plan.id);
      const uncompletedOrSkipped = finalPlan?.steps.filter(
        s => s.status !== 'completed' && s.status !== 'skipped'
      );
      expect(uncompletedOrSkipped?.length).toBe(0);
    });
  });
});
