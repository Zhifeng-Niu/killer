#!/usr/bin/env node

/**
 * Bundle @killer/app into a self-contained CLI.
 *
 * Inlines @killer/core so users only install one package.
 * better-sqlite3 is kept external (native addon — optional).
 */

import { build } from 'esbuild';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync, writeFileSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, '..');
const pkgRoot = join(projectRoot, 'packages', 'killer-app');

const pkg = JSON.parse(readFileSync(join(pkgRoot, 'package.json'), 'utf8'));

const entry = join(pkgRoot, 'src', 'main.ts');
const outfile = join(pkgRoot, 'dist', 'cli.js');

const externalDeps = [
  // Native addon — must be external
  'better-sqlite3',
  // ink + react ecosystem — peer-ish deps, let npm install them
  'react',
  'ink',
  'ink-spinner',
  'ink-text-input',
  // Node built-ins
  'node:*',
];

console.log('  Bundling @killer/app → dist/cli.js ...');

await build({
  entryPoints: [entry],
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'esm',
  outfile,
  // @killer/core is NOT external — it gets inlined
  external: externalDeps,
  banner: {
    js: '#!/usr/bin/env node',
  },
  // Preserve import.meta.url for ESM compatibility
  define: {
    'import.meta.url': 'import.meta.url',
  },
  // Handle .tsx files
  loader: {
    '.tsx': 'tsx',
    '.ts': 'ts',
  },
  // Disable tree-shaking for side-effect imports
  treeShaking: false,
  // Source maps for debugging
  sourcemap: false,
  minify: false,
  // Resolve .js extensions for ESM
  resolveExtensions: ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.json'],
  // Alias @killer/core to its source so esbuild can resolve it
  alias: {
    '@killer/core': join(projectRoot, 'packages', 'killer-core', 'src', 'index.ts'),
  },
  logLevel: 'info',
});

console.log('  ✓ Bundle complete');
