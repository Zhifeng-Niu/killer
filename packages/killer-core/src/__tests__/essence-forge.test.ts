/**
 * EssenceForge & EvolveEssenceTool Tests
 *
 * Tests for runtime prompt evolution — agent modifies its own essence
 * without restart.
 */

import { describe, it, expect } from 'vitest';
import {
  EssenceForge,
  EvolveEssenceTool,
} from '../index.js';

describe('EssenceForge', () => {
  it('should add and retrieve a prompt fragment', () => {
    const forge = new EssenceForge();
    const fragment = forge.set('cautious', 'Cautious Mode', 'Always ask before taking irreversible actions');

    expect(fragment.id).toBe('cautious');
    expect(fragment.label).toBe('Cautious Mode');
    expect(fragment.content).toBe('Always ask before taking irreversible actions');
    expect(forge.get('cautious')).toBeDefined();
  });

  it('should update an existing fragment preserving creation time', () => {
    const forge = new EssenceForge();
    const v1 = forge.set('test', 'Test', 'v1 content');

    const v2 = forge.set('test', 'Test Updated', 'v2 content');
    expect(v2.createdAt).toBe(v1.createdAt);
    expect(v2.updatedAt).toBeGreaterThanOrEqual(v1.createdAt);
    expect(v2.content).toBe('v2 content');
  });

  it('should remove a fragment', () => {
    const forge = new EssenceForge();
    forge.set('temp', 'Temp', 'temporary');
    expect(forge.get('temp')).toBeDefined();

    const removed = forge.remove('temp');
    expect(removed).toBe(true);
    expect(forge.get('temp')).toBeUndefined();
  });

  it('should return false when removing non-existent fragment', () => {
    const forge = new EssenceForge();
    expect(forge.remove('ghost')).toBe(false);
  });

  it('should list all fragments', () => {
    const forge = new EssenceForge();
    forge.set('a', 'A', 'content a');
    forge.set('b', 'B', 'content b');

    const all = forge.getAll();
    expect(all).toHaveLength(2);
    expect(all.map(f => f.id)).toContain('a');
    expect(all.map(f => f.id)).toContain('b');
  });

  it('should build empty prompt when no fragments', () => {
    const forge = new EssenceForge();
    expect(forge.buildPrompt()).toBe('');
  });

  it('should build merged prompt from fragments', () => {
    const forge = new EssenceForge();
    forge.set('cautious', 'Cautious Mode', 'Ask before acting');
    forge.set('verbose', 'Verbose Mode', 'Explain your reasoning');

    const prompt = forge.buildPrompt();
    expect(prompt).toContain('SELF-EVOLVED BEHAVIORS');
    expect(prompt).toContain('[Cautious Mode]');
    expect(prompt).toContain('Ask before acting');
    expect(prompt).toContain('[Verbose Mode]');
    expect(prompt).toContain('Explain your reasoning');
  });

  it('should export and import fragments', () => {
    const forge1 = new EssenceForge();
    forge1.set('a', 'A', 'content a');
    forge1.set('b', 'B', 'content b');

    const exported = forge1.exportAll();
    expect(exported).toHaveLength(2);

    const forge2 = new EssenceForge();
    forge2.importAll(exported);
    expect(forge2.getAll()).toHaveLength(2);
    expect(forge2.get('a')?.content).toBe('content a');
  });
});

describe('EvolveEssenceTool', () => {
  it('should add a new behavior fragment', async () => {
    const forge = new EssenceForge();
    const tool = new EvolveEssenceTool(forge);

    const r = await tool.execute({
      action: 'add',
      id: 'cautious',
      label: 'Cautious Mode',
      content: 'Always ask before irreversible actions',
    });

    expect(r.success).toBe(true);
    const data = r.data as { id: string; activeFragments: number };
    expect(data.id).toBe('cautious');
    expect(data.activeFragments).toBe(1);
    expect(forge.get('cautious')).toBeDefined();
  });

  it('should update an existing fragment', async () => {
    const forge = new EssenceForge();
    const tool = new EvolveEssenceTool(forge);

    await tool.execute({ action: 'add', id: 'test', label: 'Test', content: 'v1' });
    const r = await tool.execute({ action: 'update', id: 'test', label: 'Test', content: 'v2' });

    expect(r.success).toBe(true);
    expect(forge.get('test')?.content).toBe('v2');
  });

  it('should remove a fragment', async () => {
    const forge = new EssenceForge();
    const tool = new EvolveEssenceTool(forge);

    await tool.execute({ action: 'add', id: 'temp', label: 'Temp', content: 'temp' });
    const r = await tool.execute({ action: 'remove', id: 'temp' });

    expect(r.success).toBe(true);
    expect(forge.get('temp')).toBeUndefined();
  });

  it('should list fragments', async () => {
    const forge = new EssenceForge();
    const tool = new EvolveEssenceTool(forge);

    await tool.execute({ action: 'add', id: 'a', label: 'A', content: 'content a' });
    await tool.execute({ action: 'add', id: 'b', label: 'B', content: 'content b' });

    const r = await tool.execute({ action: 'list' });
    expect(r.success).toBe(true);
    const data = r.data as { total: number; fragments: Array<{ id: string }> };
    expect(data.total).toBe(2);
    expect(data.fragments.map(f => f.id)).toContain('a');
  });

  it('should reject missing action', async () => {
    const forge = new EssenceForge();
    const tool = new EvolveEssenceTool(forge);
    const r = await tool.execute({});
    expect(r.success).toBe(false);
  });

  it('should reject invalid action', async () => {
    const forge = new EssenceForge();
    const tool = new EvolveEssenceTool(forge);
    const r = await tool.execute({ action: 'invalid' });
    expect(r.success).toBe(false);
  });

  it('should reject missing id for non-list actions', async () => {
    const forge = new EssenceForge();
    const tool = new EvolveEssenceTool(forge);
    const r = await tool.execute({ action: 'add', label: 'L', content: 'C' });
    expect(r.success).toBe(false);
  });

  it('should reject invalid id format', async () => {
    const forge = new EssenceForge();
    const tool = new EvolveEssenceTool(forge);
    const r = await tool.execute({ action: 'add', id: 'BAD-ID!', label: 'L', content: 'C' });
    expect(r.success).toBe(false);
  });

  it('should reject content exceeding max length', async () => {
    const forge = new EssenceForge();
    const tool = new EvolveEssenceTool(forge);
    const r = await tool.execute({ action: 'add', id: 'long', label: 'L', content: 'x'.repeat(2001) });
    expect(r.success).toBe(false);
    expect(r.error).toContain('too long');
  });

  it('should reject missing label/content for add', async () => {
    const forge = new EssenceForge();
    const tool = new EvolveEssenceTool(forge);
    const r = await tool.execute({ action: 'add', id: 'test', content: 'C' });
    expect(r.success).toBe(false);
  });
});
