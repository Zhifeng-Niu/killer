#!/usr/bin/env node

/**
 * Cross-platform clean script
 * Removes node_modules and dist directories
 */

import { rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const dirs = [
  'node_modules',
  'packages/odysseus-core/node_modules',
  'packages/odysseus-core/dist',
  'packages/odysseus-app/node_modules',
  'packages/odysseus-app/dist',
];

for (const dir of dirs) {
  const path = join(__dirname, dir);
  try {
    rmSync(path, { recursive: true, force: true });
    console.log(`  Removed ${dir}`);
  } catch {
    // Directory may not exist
  }
}

console.log('Clean complete.');
