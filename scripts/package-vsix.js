#!/usr/bin/env node
const { mkdirSync } = require('node:fs');
const { spawnSync } = require('node:child_process');
const { join } = require('node:path');
const packageJson = require('../package.json');

const outPath = join('dist', `code-focus-${packageJson.version}.vsix`);
mkdirSync('dist', { recursive: true });

const vsceEntry = require.resolve('@vscode/vsce/vsce');
const result = spawnSync(process.execPath, [vsceEntry, 'package', '--out', outPath], { stdio: 'inherit' });

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

process.exit(result.status ?? 1);
