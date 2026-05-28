/**
 * Cognitive API Endpoint Tests
 *
 * Tests for /health/report, /emotions, /narrative, /predictions endpoints
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { APIServer } from '../api/index.js';
import { registerRoutes } from '../api/routes.js';
import { HealthMonitor } from '../metrics/health-monitor.js';
import { MetricsCollector } from '../metrics/types.js';

/**
 * Create a minimal mock agent with cognitive subsystems
 */
function createMockAgent() {
  const healthMonitor = new HealthMonitor();
  healthMonitor.registerModule('test', () => ({
    name: 'test',
    status: 'healthy',
    score: 0.95,
    lastChecked: Date.now(),
  }));

  return {
    healthMonitor,
    persona: {
      emotionalState: {
        exportState: () => ({
          primaryEmotion: 'curious',
          intensity: 0.6,
          current: { valence: 0.3, arousal: 0.5, dominance: 0.4 },
          mood: { valence: 0.1, arousal: 0.2, dominance: 0.5 },
          emotionalMemory: [
            { id: 'ev1', emotion: 'joy', strength: 0.8, trigger: 'user greeting', timestamp: Date.now() },
          ],
          lastUpdated: Date.now(),
        }),
      },
      predictiveModel: {
        exportState: () => ({
          predictedNeeds: [
            { need: 'code assistance', confidence: 0.85, context: 'coding session' },
          ],
          psychologicalProfile: {
            openness: 0.8,
            conscientiousness: 0.7,
            extraversion: 0.5,
            agreeableness: 0.6,
            neuroticism: 0.3,
          },
          communicationPatterns: [
            { pattern: 'prefers concise answers', confidence: 0.75 },
          ],
        }),
      },
    },
    hippocampus: {
      getNarrative: () => ({
        identityStatement: 'I am Killer, a cognitive agent.',
        activeThemes: ['learning', 'growth'],
        chapters: [
          { id: 'ch1', title: 'First boot', startTime: Date.now() - 1000, endTime: Date.now(), summary: 'Initial activation' },
        ],
        relationships: [],
        currentChapter: 'ch1',
      }),
    },
    hooks: {
      on: () => ({ event: '', handler: () => {} }),
    },
  } as unknown as Parameters<typeof registerRoutes>[1];
}

describe('Cognitive API Endpoints', () => {
  let server: APIServer;
  const port = 14000 + Math.floor(Math.random() * 1000);
  let mockAgent: ReturnType<typeof createMockAgent>;

  beforeEach(async () => {
    MetricsCollector.reset();
    server = new APIServer(port, 'localhost');
    mockAgent = createMockAgent();
    registerRoutes(server, mockAgent);
    await server.start();
  });

  afterEach(async () => {
    await server.stop();
  });

  describe('GET /health/report', () => {
    it('should return detailed health report', async () => {
      const response = await fetch(`http://localhost:${port}/health/report`);
      expect(response.status).toBe(200);

      const body = await response.json() as Record<string, unknown>;
      expect(body.status).toBe('healthy');
      expect(body.overallScore).toBeGreaterThanOrEqual(0);
      expect(body.overallScore).toBeLessThanOrEqual(1);
      expect(Array.isArray(body.modules)).toBe(true);
      expect(body.modules.length).toBeGreaterThan(0);
      expect(body.checkedAt).toBeDefined();
    });
  });

  describe('GET /emotions', () => {
    it('should return current emotional state', async () => {
      const response = await fetch(`http://localhost:${port}/emotions`);
      expect(response.status).toBe(200);

      const body = await response.json() as Record<string, unknown>;
      expect(body.primaryEmotion).toBe('curious');
      expect(body.intensity).toBe(0.6);
      expect(body.current).toEqual({ valence: 0.3, arousal: 0.5, dominance: 0.4 });
      expect(Array.isArray(body.emotionalMemory)).toBe(true);
    });
  });

  describe('GET /narrative', () => {
    it('should return autobiographical narrative', async () => {
      const response = await fetch(`http://localhost:${port}/narrative`);
      expect(response.status).toBe(200);

      const body = await response.json() as Record<string, unknown>;
      expect(body.identityStatement).toBe('I am Killer, a cognitive agent.');
      expect(Array.isArray(body.activeThemes)).toBe(true);
      expect(body.activeThemes).toContain('learning');
      expect(Array.isArray(body.chapters)).toBe(true);
      expect(body.chapters.length).toBe(1);
    });
  });

  describe('GET /predictions', () => {
    it('should return predictive user model state', async () => {
      const response = await fetch(`http://localhost:${port}/predictions`);
      expect(response.status).toBe(200);

      const body = await response.json() as Record<string, unknown>;
      expect(Array.isArray(body.predictedNeeds)).toBe(true);
      expect(body.predictedNeeds.length).toBe(1);
      expect(body.psychologicalProfile).toBeDefined();
      const profile = body.psychologicalProfile as Record<string, number>;
      expect(profile.openness).toBe(0.8);
    });
  });
});
