#!/usr/bin/env node

/**
 * Cross-platform build script
 * Works on Windows, macOS, and Linux
 */

import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

function run(cmd, args, cwd) {
  return execFileSync(cmd, args, { stdio: 'inherit', cwd: join(__dirname, cwd) });
}

// Step 1: Build odysseus-core
console.log('Building @odysseus/core...');
run('npx', ['tsc'], 'packages/odysseus-core');

// Step 2: Build odysseus-app
console.log('Building @odysseus/app...');
run('pnpm', ['run', 'build'], 'packages/odysseus-app');

console.log('Build complete.');
