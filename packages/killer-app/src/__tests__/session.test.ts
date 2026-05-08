/**
 * Session Manager Tests
 *
 * 测试会话持久化管理器的完整生命周期
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { SessionManager } from '../session/session-manager.js';
import type { SessionSnapshot } from '../session/types.js';

const DUMMY_AGENT_STATE = {
  goals: [] as Array<{ id: string; description: string; priority: number; status: string }>,
  cells: [] as Array<{ id: string; role: string; status: string }>,
  persona: { name: 'Killer', traits: [] as string[], bio: 'Test' },
  memory: { totalEpisodes: 0, shortTermCount: 0, longTermCount: 0, associationCount: 0 },
};
const DUMMY_CONFIG = { llmProvider: 'mock', debugLogging: false };

function createTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'killer-session-test-'));
}

describe('SessionManager', () => {
  let manager: SessionManager;
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
    manager = new SessionManager({
      sessionsDir: tempDir,
      maxSessions: 5,
      autoSave: true,
    });
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('Session Lifecycle', () => {
    it('should start a new session', () => {
      manager.startSession();
      expect(manager.getConversation()).toEqual([]);
    });

    it('should generate unique session IDs', async () => {
      manager.startSession();
      const snap1 = await manager.createSnapshot(DUMMY_AGENT_STATE, DUMMY_CONFIG);

      manager.startSession();
      const snap2 = await manager.createSnapshot(DUMMY_AGENT_STATE, DUMMY_CONFIG);

      expect(snap1.sessionId).not.toBe(snap2.sessionId);
    });

    it('should clear session state', () => {
      manager.startSession();
      manager.addMessage('user', 'hello');
      expect(manager.getConversation().length).toBe(1);

      manager.clearSession();
      expect(manager.getConversation()).toEqual([]);
    });
  });

  describe('Conversation Management', () => {
    it('should add messages to conversation', () => {
      manager.startSession();
      manager.addMessage('user', 'Hello');
      manager.addMessage('assistant', 'Hi there!');
      manager.addMessage('system', 'Context update');

      const conv = manager.getConversation();
      expect(conv.length).toBe(3);
      expect(conv[0]).toEqual({ role: 'user', content: 'Hello', timestamp: expect.any(Number) });
      expect(conv[1]).toEqual({ role: 'assistant', content: 'Hi there!', timestamp: expect.any(Number) });
      expect(conv[2]).toEqual({ role: 'system', content: 'Context update', timestamp: expect.any(Number) });
    });

    it('should return a copy of conversation', () => {
      manager.startSession();
      manager.addMessage('user', 'test');

      const conv1 = manager.getConversation();
      const conv2 = manager.getConversation();

      expect(conv1).not.toBe(conv2);
      expect(conv1).toEqual(conv2);
    });
  });

  describe('Snapshot Creation', () => {
    it('should create a valid snapshot', async () => {
      manager.startSession();
      manager.addMessage('user', 'test message');

      const snapshot = await manager.createSnapshot(
        {
          goals: [{ id: 'g1', description: 'Test goal', priority: 0.8, status: 'active' }],
          cells: [{ id: 'c1', role: 'assistant', status: 'idle' }],
          persona: { name: 'Killer', traits: ['curious'], bio: 'Test agent' },
          memory: { totalEpisodes: 5, shortTermCount: 3, longTermCount: 2, associationCount: 1 },
        },
        DUMMY_CONFIG,
      );

      expect(snapshot.version).toBe('1.0.0');
      expect(snapshot.sessionId).toBeDefined();
      expect(snapshot.startedAt).toBeGreaterThan(0);
      expect(snapshot.savedAt).toBeGreaterThanOrEqual(snapshot.startedAt);
      expect(snapshot.uptime).toBeGreaterThanOrEqual(0);
      expect(snapshot.conversation.length).toBe(1);
      expect(snapshot.agentState.goals.length).toBe(1);
      expect(snapshot.agentState.cells.length).toBe(1);
      expect(snapshot.agentState.persona.name).toBe('Killer');
      expect(snapshot.config.llmProvider).toBe('mock');
    });

    it('should auto-start session if not started', async () => {
      const snapshot = await manager.createSnapshot(DUMMY_AGENT_STATE, DUMMY_CONFIG);
      expect(snapshot.sessionId).toBeDefined();
    });

    it('should include emotional state when present', async () => {
      manager.startSession();
      const snapshot = await manager.createSnapshot(
        {
          goals: [],
          cells: [],
          persona: {
            name: 'Killer',
            traits: [],
            bio: '',
            emotionalState: { primaryEmotion: 'joy', intensity: 0.7, current: { valence: 0.5, arousal: 0.3, dominance: 0.2 }, mood: { valence: 0.5, arousal: 0.3, dominance: 0.2 }, emotionalMemory: [], lastUpdated: Date.now() },
          },
          memory: { totalEpisodes: 0, shortTermCount: 0, longTermCount: 0, associationCount: 0 },
        },
        DUMMY_CONFIG,
      );

      expect(snapshot.agentState.persona.emotionalState).toBeDefined();
      expect(snapshot.agentState.persona.emotionalState!.primaryEmotion).toBe('joy');
    });
  });

  describe('Save and Load', () => {
    it('should save and load a session', async () => {
      manager.startSession();
      manager.addMessage('user', 'persist me');

      const snapshot = await manager.createSnapshot(DUMMY_AGENT_STATE, DUMMY_CONFIG);
      await manager.save(snapshot);

      const manager2 = new SessionManager({ sessionsDir: tempDir });
      const loaded = await manager2.loadLatest();

      expect(loaded).not.toBeNull();
      expect(loaded!.sessionId).toBe(snapshot.sessionId);
      expect(loaded!.conversation.length).toBe(1);
      expect(loaded!.conversation[0].content).toBe('persist me');
    });

    it('should return null when no latest session exists', async () => {
      const loaded = await manager.loadLatest();
      expect(loaded).toBeNull();
    });

    it('should update latest.json on save', async () => {
      manager.startSession();
      const snapshot = await manager.createSnapshot(DUMMY_AGENT_STATE, DUMMY_CONFIG);
      await manager.save(snapshot);

      const latestPath = path.join(tempDir, 'latest.json');
      expect(fs.existsSync(latestPath)).toBe(true);
    });

    it('should not save when no session is active', async () => {
      manager.clearSession();
      const snapshot: SessionSnapshot = {
        version: '1.0.0',
        sessionId: 'test',
        startedAt: Date.now(),
        savedAt: Date.now(),
        uptime: 0,
        conversation: [],
        agentState: DUMMY_AGENT_STATE,
        config: DUMMY_CONFIG,
      };

      await manager.save(snapshot);
      const files = fs.readdirSync(tempDir).filter(f => f.endsWith('.json'));
      expect(files.length).toBe(0);
    });
  });

  describe('Session Listing', () => {
    it('should list saved sessions', async () => {
      for (let i = 0; i < 3; i++) {
        manager.startSession();
        manager.addMessage('user', `message ${i}`);
        const snapshot = await manager.createSnapshot(DUMMY_AGENT_STATE, DUMMY_CONFIG);
        await manager.save(snapshot);
      }

      const sessions = manager.listSessions();
      expect(sessions.length).toBe(3);
    });

    it('should list sessions in reverse chronological order', async () => {
      for (let i = 0; i < 3; i++) {
        manager.startSession();
        const snapshot = await manager.createSnapshot(DUMMY_AGENT_STATE, DUMMY_CONFIG);
        await manager.save(snapshot);
      }

      const sessions = manager.listSessions();
      // Verify descending order by startedAt
      for (let i = 1; i < sessions.length; i++) {
        expect(sessions[i - 1].startedAt).toBeGreaterThanOrEqual(sessions[i].startedAt);
      }
    });

    it('should return empty list when no sessions', () => {
      expect(manager.listSessions()).toEqual([]);
    });
  });

  describe('Session Cleanup', () => {
    it('should cleanup old sessions beyond maxSessions', async () => {
      for (let i = 0; i < 7; i++) {
        manager.startSession();
        const snapshot = await manager.createSnapshot(DUMMY_AGENT_STATE, DUMMY_CONFIG);
        await manager.save(snapshot);
      }

      const sessions = manager.listSessions();
      expect(sessions.length).toBeLessThanOrEqual(5);
    });
  });

  describe('Session Deletion', () => {
    it('should delete a specific session', async () => {
      manager.startSession();
      const snapshot = await manager.createSnapshot(DUMMY_AGENT_STATE, DUMMY_CONFIG);
      await manager.save(snapshot);

      const deleted = await manager.deleteSession(snapshot.sessionId);
      expect(deleted).toBe(true);
      expect(manager.listSessions().length).toBe(0);
    });

    it('should return false for non-existent session', async () => {
      const deleted = await manager.deleteSession('non-existent-id');
      expect(deleted).toBe(false);
    });
  });

  describe('Directory Handling', () => {
    it('should create sessions directory if not exists', () => {
      const newDir = path.join(tempDir, 'nested', 'sessions');
      new SessionManager({ sessionsDir: newDir });
      expect(fs.existsSync(newDir)).toBe(true);
    });
  });

  describe('Hippocampus Data Persistence', () => {
    it('should save hippocampusData in snapshot', async () => {
      manager.startSession();
      const hippocampusData = {
        episodic: [{ id: 'ep1', content: 'First conversation' }],
        semantic: [{ id: 'sem1', label: 'User preference' }],
        procedural: [],
        prospective: [],
        workingMemory: { buffer: [], focus: null },
        narrative: {
          identityStatement: 'I am Killer.',
          chapters: [],
          activeThemes: [],
          relationships: [],
        },
        exportedAt: Date.now(),
      };

      const snapshot = await manager.createSnapshot(
        {
          ...DUMMY_AGENT_STATE,
          hippocampusData,
        },
        DUMMY_CONFIG,
      );
      await manager.save(snapshot);

      // Load and verify
      const loaded = await manager.loadLatest();
      expect(loaded).not.toBeNull();
      expect(loaded!.agentState.hippocampusData).toBeDefined();
      const loadedData = loaded!.agentState.hippocampusData as typeof hippocampusData;
      expect(loadedData.episodic).toHaveLength(1);
      expect(loadedData.episodic[0].id).toBe('ep1');
      expect(loadedData.semantic).toHaveLength(1);
    });

    it('should handle snapshot without hippocampusData (backward compat)', async () => {
      manager.startSession();
      const snapshot = await manager.createSnapshot(DUMMY_AGENT_STATE, DUMMY_CONFIG);
      await manager.save(snapshot);

      const loaded = await manager.loadLatest();
      expect(loaded).not.toBeNull();
      expect(loaded!.agentState.hippocampusData).toBeUndefined();
    });

    it('should persist hippocampusData through save/load cycle', async () => {
      manager.startSession();
      manager.addMessage('user', 'Remember: I love coffee');

      const hippocampusData = {
        episodic: [
          { id: 'ep1', content: 'User said they love coffee', timestamp: Date.now() },
        ],
        semantic: [
          { id: 'sem1', label: 'coffee_preference', associations: ['user', 'beverages'] },
        ],
        procedural: [],
        prospective: [],
        workingMemory: { buffer: [], focus: null },
        narrative: {
          identityStatement: 'I am Killer.',
          chapters: [{ id: 'ch1', title: 'Getting to know the user', summary: 'User loves coffee' }],
          activeThemes: ['user preferences'],
          relationships: [],
        },
        exportedAt: Date.now(),
      };

      const snapshot = await manager.createSnapshot(
        {
          ...DUMMY_AGENT_STATE,
          hippocampusData,
        },
        DUMMY_CONFIG,
      );
      await manager.save(snapshot);

      // Create a new manager and load
      const manager2 = new SessionManager({ sessionsDir: tempDir });
      const loaded = await manager2.loadLatest();

      expect(loaded).not.toBeNull();
      const loadedData = loaded!.agentState.hippocampusData as typeof hippocampusData;
      expect(loadedData.episodic).toHaveLength(1);
      expect(loadedData.narrative.chapters).toHaveLength(1);
      expect(loadedData.narrative.chapters[0].title).toBe('Getting to know the user');
    });
  });

  describe('Auto-Save Frequency', () => {
    it('should auto-save every 3 messages (not 5)', async () => {
      const savedSnapshots: SessionSnapshot[] = [];
      manager.startSession();
      manager.onSave(async (snapshot) => {
        savedSnapshots.push(snapshot);
        await manager.save(snapshot);
      });

      // Add 3 messages — should trigger auto-save
      const agentState = { ...DUMMY_AGENT_STATE };
      for (let i = 0; i < 3; i++) {
        manager.addMessage('user', `Message ${i + 1}`);
        await manager.checkAutoSave(agentState, DUMMY_CONFIG);
      }

      expect(savedSnapshots.length).toBe(1);
    });

    it('should not auto-save on messages 1 and 2', async () => {
      const savedSnapshots: SessionSnapshot[] = [];
      manager.startSession();
      manager.onSave(async (snapshot) => {
        savedSnapshots.push(snapshot);
        await manager.save(snapshot);
      });

      const agentState = { ...DUMMY_AGENT_STATE };
      manager.addMessage('user', 'Message 1');
      await manager.checkAutoSave(agentState, DUMMY_CONFIG);
      manager.addMessage('user', 'Message 2');
      await manager.checkAutoSave(agentState, DUMMY_CONFIG);

      expect(savedSnapshots.length).toBe(0);
    });
  });

  describe('Cell Persistence', () => {
    it('should save cell type and capabilities in snapshot', async () => {
      manager.startSession();
      manager.addMessage('user', 'test');

      const agentState = {
        ...DUMMY_AGENT_STATE,
        cells: [
          { id: 'prime', role: 'prime', status: 'alive', type: 'prime', capabilities: ['reasoning'] },
          { id: 'researcher-123', role: 'researcher-123', status: 'alive', type: 'researcher', capabilities: ['research', 'analysis'] },
          { id: 'artisan-456', role: 'artisan-456', status: 'alive', type: 'artisan', capabilities: ['coding'] },
        ],
        synapseTopology: [
          { from: 'prime', to: 'researcher-123' },
          { from: 'prime', to: 'artisan-456' },
        ],
      };

      const snapshot = await manager.createSnapshot(agentState, DUMMY_CONFIG);
      await manager.save(snapshot);

      const loaded = await manager.loadLatest();
      expect(loaded).not.toBeNull();

      const cells = loaded!.agentState.cells;
      expect(cells.length).toBe(3);
      expect(cells[1].type).toBe('researcher');
      expect(cells[1].capabilities).toContain('research');

      const topology = loaded!.agentState.synapseTopology;
      expect(topology).toBeDefined();
      expect(topology!.length).toBe(2);
      expect(topology![0]).toEqual({ from: 'prime', to: 'researcher-123' });
    });

    it('should handle snapshots without cell details (backward compat)', async () => {
      manager.startSession();
      manager.addMessage('user', 'test');

      // Old format: cells without type/capabilities
      const agentState = {
        ...DUMMY_AGENT_STATE,
        cells: [
          { id: 'prime', role: 'prime', status: 'alive' },
        ],
      };

      const snapshot = await manager.createSnapshot(agentState, DUMMY_CONFIG);
      await manager.save(snapshot);

      const loaded = await manager.loadLatest();
      expect(loaded).not.toBeNull();
      expect(loaded!.agentState.cells[0].type).toBeUndefined();
    });
  });
});
