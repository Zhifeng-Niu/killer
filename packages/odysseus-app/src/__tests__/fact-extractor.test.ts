/**
 * Fact Extractor Tests
 *
 * Tests for real-time fact extraction from user input.
 */

import { describe, it, expect } from 'vitest';
import { extractFacts, type ExtractedFact } from '../orchestrator/fact-extractor.js';

describe('fact-extractor', () => {
  describe('identity extraction', () => {
    it('should extract user name (English)', () => {
      const facts = extractFacts('My name is Alice');
      expect(facts.length).toBeGreaterThanOrEqual(1);
      const nameFact = facts.find(f => f.properties.field === 'name');
      expect(nameFact).toBeDefined();
      expect(nameFact!.properties.name).toBe('Alice');
      expect(nameFact!.category).toBe('identity');
    });

    it('should extract user name (Chinese)', () => {
      const facts = extractFacts('我叫张三');
      expect(facts.length).toBeGreaterThanOrEqual(1);
      const nameFact = facts.find(f => f.properties.field === 'name');
      expect(nameFact).toBeDefined();
      expect(nameFact!.properties.name).toBe('张三');
    });

    it('should extract company name', () => {
      const facts = extractFacts('I work at Google');
      expect(facts.length).toBeGreaterThanOrEqual(1);
      const companyFact = facts.find(f => f.properties.field === 'company');
      expect(companyFact).toBeDefined();
      expect(companyFact!.properties.company).toBe('Google');
    });

    it('should extract role', () => {
      const facts = extractFacts('I am a software engineer');
      expect(facts.length).toBeGreaterThanOrEqual(1);
      const roleFact = facts.find(f => f.properties.field === 'role');
      expect(roleFact).toBeDefined();
    });

    it('should extract location', () => {
      const facts = extractFacts('I live in Tokyo');
      expect(facts.length).toBeGreaterThanOrEqual(1);
      const locationFact = facts.find(f => f.properties.field === 'location');
      expect(locationFact).toBeDefined();
      expect(locationFact!.properties.location).toBe('Tokyo');
    });
  });

  describe('preference extraction', () => {
    it('should extract positive preference', () => {
      const facts = extractFacts('I prefer dark mode');
      expect(facts.length).toBeGreaterThanOrEqual(1);
      const prefFact = facts.find(f => f.category === 'preference' && f.properties.sentiment === 'positive');
      expect(prefFact).toBeDefined();
      expect(String(prefFact!.properties.preference)).toContain('dark mode');
    });

    it('should extract negative preference', () => {
      const facts = extractFacts("I don't like verbose explanations");
      expect(facts.length).toBeGreaterThanOrEqual(1);
      const negFact = facts.find(f => f.category === 'preference' && f.properties.sentiment === 'negative');
      expect(negFact).toBeDefined();
    });

    it('should extract Chinese preference', () => {
      const facts = extractFacts('我喜欢简洁的回答');
      expect(facts.length).toBeGreaterThanOrEqual(1);
      const prefFact = facts.find(f => f.category === 'preference');
      expect(prefFact).toBeDefined();
    });

    it('should extract behavioral instruction', () => {
      const facts = extractFacts('Please always respond in Chinese');
      expect(facts.length).toBeGreaterThanOrEqual(1);
      const instFact = facts.find(f => f.properties.instruction !== undefined);
      expect(instFact).toBeDefined();
    });
  });

  describe('goal extraction', () => {
    it('should extract goal (English)', () => {
      const facts = extractFacts('I want to learn TypeScript');
      expect(facts.length).toBeGreaterThanOrEqual(1);
      const goalFact = facts.find(f => f.category === 'goal');
      expect(goalFact).toBeDefined();
      expect(String(goalFact!.properties.goal)).toContain('learn TypeScript');
    });

    it('should extract goal (Chinese)', () => {
      const facts = extractFacts('我想学好编程');
      expect(facts.length).toBeGreaterThanOrEqual(1);
      const goalFact = facts.find(f => f.category === 'goal');
      expect(goalFact).toBeDefined();
    });
  });

  describe('explicit memory instructions', () => {
    it('should extract remember instruction', () => {
      const facts = extractFacts('Remember that my API key is stored in the .env file');
      expect(facts.length).toBeGreaterThanOrEqual(1);
      const memFact = facts.find(f => f.category === 'fact');
      expect(memFact).toBeDefined();
      expect(memFact!.confidence).toBeGreaterThan(0.8);
    });

    it('should extract Chinese remember instruction', () => {
      const facts = extractFacts('记住：我的项目用的是 React');
      expect(facts.length).toBeGreaterThanOrEqual(1);
      const memFact = facts.find(f => f.category === 'fact');
      expect(memFact).toBeDefined();
    });
  });

  describe('event extraction', () => {
    it('should extract birthday (English)', () => {
      const facts = extractFacts('My birthday is on March 15th');
      expect(facts.length).toBeGreaterThanOrEqual(1);
      const eventFact = facts.find(f => f.category === 'event');
      expect(eventFact).toBeDefined();
      expect(eventFact!.properties.important).toBe(true);
    });

    it('should extract birthday (Chinese)', () => {
      const facts = extractFacts('我的生日是3月15日');
      expect(facts.length).toBeGreaterThanOrEqual(1);
      const eventFact = facts.find(f => f.category === 'event');
      expect(eventFact).toBeDefined();
      expect(eventFact!.properties.important).toBe(true);
    });

    it('should extract upcoming interview', () => {
      const facts = extractFacts('I have an interview tomorrow afternoon');
      expect(facts.length).toBeGreaterThanOrEqual(1);
      const eventFact = facts.find(f => f.category === 'event');
      expect(eventFact).toBeDefined();
      expect(eventFact!.properties.important).toBe(true);
    });

    it('should extract upcoming meeting', () => {
      const facts = extractFacts('I have a meeting with the team at 3pm');
      expect(facts.length).toBeGreaterThanOrEqual(1);
      const eventFact = facts.find(f => f.category === 'event');
      expect(eventFact).toBeDefined();
    });

    it('should extract scheduled event (English)', () => {
      const facts = extractFacts('Tomorrow I\'ll review the PR');
      expect(facts.length).toBeGreaterThanOrEqual(1);
      const eventFact = facts.find(f => f.category === 'event');
      expect(eventFact).toBeDefined();
    });

    it('should extract scheduled event (Chinese)', () => {
      const facts = extractFacts('明天我要开会');
      expect(facts.length).toBeGreaterThanOrEqual(1);
      const eventFact = facts.find(f => f.category === 'event');
      expect(eventFact).toBeDefined();
    });

    it('should extract Chinese schedule event', () => {
      const facts = extractFacts('下周有个面试');
      expect(facts.length).toBeGreaterThanOrEqual(1);
      const eventFact = facts.find(f => f.category === 'event');
      expect(eventFact).toBeDefined();
    });

    it('should extract tonight event', () => {
      const facts = extractFacts('Tonight I will finish the report');
      const eventFact = facts.find(f => f.category === 'event');
      expect(eventFact).toBeDefined();
      if (eventFact!.properties.timeHint) {
        expect(eventFact!.properties.timeHint).toBe('Tonight');
      }
    });
  });

  describe('edge cases', () => {
    it('should return empty array for plain questions', () => {
      const facts = extractFacts('How do I fix this bug?');
      expect(facts).toEqual([]);
    });

    it('should return empty array for greetings', () => {
      const facts = extractFacts('Hello, how are you?');
      expect(facts).toEqual([]);
    });

    it('should not extract from general statements', () => {
      const facts = extractFacts('The weather is nice today');
      expect(facts).toEqual([]);
    });

    it('should deduplicate same field facts', () => {
      const facts = extractFacts('My name is Alice and my name is Bob');
      const nameFacts = facts.filter(f => f.properties.field === 'name');
      expect(nameFacts.length).toBe(1);
    });

    it('should handle multiple fact types in one input', () => {
      const facts = extractFacts('My name is Alice and I want to learn TypeScript');
      expect(facts.length).toBeGreaterThanOrEqual(2);
      expect(facts.some(f => f.category === 'identity')).toBe(true);
      expect(facts.some(f => f.category === 'goal')).toBe(true);
    });
  });

  describe('confidence scoring', () => {
    it('should give higher confidence to explicit remember instructions', () => {
      const facts = extractFacts('Remember that I am a developer');
      const fact = facts.find(f => f.category === 'fact');
      expect(fact).toBeDefined();
      expect(fact!.confidence).toBeGreaterThan(0.8);
    });

    it('should give reasonable confidence for casual mentions', () => {
      const facts = extractFacts('My name is Alice');
      const nameFact = facts.find(f => f.properties.field === 'name');
      expect(nameFact).toBeDefined();
      expect(nameFact!.confidence).toBeGreaterThan(0.6);
    });
  });
});
