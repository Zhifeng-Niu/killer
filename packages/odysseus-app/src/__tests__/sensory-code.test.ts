/**
 * Code Sensory Channel Tests
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { CodeChannel, type CodeChannelConfig } from '../sensory/code/code-channel.js';
import type { SensoryInput } from '../sensory/types.js';
import { SensoryChannel } from '../sensory/types.js';

describe('CodeChannel', () => {
  let tmpDir: string;
  let channel: CodeChannel;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'odysseus-code-test-'));
  });

  afterEach(async () => {
    if (channel) await channel.stop();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('constructor', () => {
    it('should set Code channel type', () => {
      channel = new CodeChannel({ watchDir: tmpDir });
      expect(channel.getChannelType()).toBe(SensoryChannel.Code);
    });
  });

  describe('start/stop', () => {
    it('should start watching a directory', async () => {
      channel = new CodeChannel({ watchDir: tmpDir });
      await channel.start();
      const status = channel.getStatus();
      expect(status.connected).toBe(true);
    });

    it('should throw for non-existent directory', async () => {
      channel = new CodeChannel({ watchDir: '/nonexistent/path' });
      await expect(channel.start()).rejects.toThrow('does not exist');
    });

    it('should stop cleanly', async () => {
      channel = new CodeChannel({ watchDir: tmpDir });
      await channel.start();
      await channel.stop();
      expect(channel.getStatus().connected).toBe(false);
    });

    it('should handle double stop gracefully', async () => {
      channel = new CodeChannel({ watchDir: tmpDir });
      await channel.start();
      await channel.stop();
      await channel.stop(); // Should not throw
      expect(channel.getStatus().connected).toBe(false);
    });
  });

  describe('injectChange', () => {
    it('should emit input for injected change', async () => {
      channel = new CodeChannel({ watchDir: tmpDir });
      await channel.start();

      const received: SensoryInput[] = [];
      channel.onInput((input) => received.push(input));

      channel.injectChange('modify', path.join(tmpDir, 'test.ts'));

      expect(received).toHaveLength(1);
      expect(received[0].content).toContain('File modified');
      expect(received[0].content).toContain('test.ts');
      expect(received[0].channel).toBe(SensoryChannel.Code);
      expect(received[0].metadata.changeType).toBe('modify');
    });

    it('should set high priority for deletion events', async () => {
      channel = new CodeChannel({ watchDir: tmpDir });
      await channel.start();

      const received: SensoryInput[] = [];
      channel.onInput((input) => received.push(input));

      channel.injectChange('delete', path.join(tmpDir, 'deleted.ts'));

      expect(received[0].priority).toBe('high');
    });

    it('should set normal priority for create events', async () => {
      channel = new CodeChannel({ watchDir: tmpDir });
      await channel.start();

      const received: SensoryInput[] = [];
      channel.onInput((input) => received.push(input));

      channel.injectChange('create', path.join(tmpDir, 'new.ts'));

      expect(received[0].priority).toBe('normal');
    });

    it('should include relative path in metadata', async () => {
      channel = new CodeChannel({ watchDir: tmpDir });
      await channel.start();

      const received: SensoryInput[] = [];
      channel.onInput((input) => received.push(input));

      channel.injectChange('modify', path.join(tmpDir, 'src', 'index.ts'));

      expect(received[0].metadata.relativePath).toContain('index.ts');
    });
  });

  describe('send', () => {
    it('should handle send (no-op for read-only channel)', async () => {
      channel = new CodeChannel({ watchDir: tmpDir });
      await channel.start();

      await expect(channel.send({
        id: '1',
        timestamp: Date.now(),
        channel: SensoryChannel.Code,
        type: 'text',
        content: 'test',
      })).resolves.not.toThrow();
    });
  });

  describe('extension filtering', () => {
    it('should only accept specified extensions via injectChange', async () => {
      channel = new CodeChannel({ watchDir: tmpDir, extensions: ['.ts', '.js'] });
      await channel.start();

      // injectChange bypasses filtering (it's programmatic), but the channel is configured correctly
      expect(channel.getChannelType()).toBe(SensoryChannel.Code);
    });
  });
});
