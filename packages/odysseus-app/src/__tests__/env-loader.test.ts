/**
 * .env File Loader Tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { loadEnvFiles } from '../config/env.js';

describe('loadEnvFiles', () => {
  const tmpDir = path.join(os.tmpdir(), `odysseus-env-test-${Date.now()}`);

  beforeEach(() => {
    fs.mkdirSync(tmpDir, { recursive: true });
    // 清理可能残留的 env vars
    delete process.env._TEST_ODYSSEUS_KEY1;
    delete process.env._TEST_ODYSSEUS_KEY2;
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    delete process.env._TEST_ODYSSEUS_KEY1;
    delete process.env._TEST_ODYSSEUS_KEY2;
  });

  it('should load variables from .env file', () => {
    fs.writeFileSync(path.join(tmpDir, '.env'), [
      '_TEST_ODYSSEUS_KEY1=value1',
      '_TEST_ODYSSEUS_KEY2=value2',
    ].join('\n'));

    const count = loadEnvFiles([tmpDir]);
    expect(count).toBe(2);
    expect(process.env._TEST_ODYSSEUS_KEY1).toBe('value1');
    expect(process.env._TEST_ODYSSEUS_KEY2).toBe('value2');
  });

  it('should not overwrite existing env vars', () => {
    process.env._TEST_ODYSSEUS_KEY1 = 'original';
    fs.writeFileSync(path.join(tmpDir, '.env'), '_TEST_ODYSSEUS_KEY1=overwritten\n');

    loadEnvFiles([tmpDir]);
    expect(process.env._TEST_ODYSSEUS_KEY1).toBe('original');
  });

  it('should handle quoted values', () => {
    fs.writeFileSync(path.join(tmpDir, '.env'), [
      '_TEST_ODYSSEUS_KEY1="double quoted"',
      "_TEST_ODYSSEUS_KEY2='single quoted'",
    ].join('\n'));

    loadEnvFiles([tmpDir]);
    expect(process.env._TEST_ODYSSEUS_KEY1).toBe('double quoted');
    expect(process.env._TEST_ODYSSEUS_KEY2).toBe('single quoted');
  });

  it('should skip comments and empty lines', () => {
    fs.writeFileSync(path.join(tmpDir, '.env'), [
      '# This is a comment',
      '',
      '  # Another comment',
      '_TEST_ODYSSEUS_KEY1=value',
    ].join('\n'));

    const count = loadEnvFiles([tmpDir]);
    expect(count).toBe(1);
    expect(process.env._TEST_ODYSSEUS_KEY1).toBe('value');
  });

  it('should return 0 when no .env files exist', () => {
    const count = loadEnvFiles([tmpDir]);
    expect(count).toBe(0);
  });

  it('should handle multiple directories', () => {
    const dir1 = path.join(tmpDir, 'dir1');
    const dir2 = path.join(tmpDir, 'dir2');
    fs.mkdirSync(dir1, { recursive: true });
    fs.mkdirSync(dir2, { recursive: true });

    fs.writeFileSync(path.join(dir1, '.env'), '_TEST_ODYSSEUS_KEY1=from_dir1');
    fs.writeFileSync(path.join(dir2, '.env'), '_TEST_ODYSSEUS_KEY2=from_dir2');

    const count = loadEnvFiles([dir1, dir2]);
    expect(count).toBe(2);
    expect(process.env._TEST_ODYSSEUS_KEY1).toBe('from_dir1');
    expect(process.env._TEST_ODYSSEUS_KEY2).toBe('from_dir2');
  });
});
