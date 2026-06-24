import * as assert from 'node:assert/strict';
import { test } from 'node:test';

import { compareProjectFilePaths, filterProjectFilesByGitignore, getNextProjectFile } from '../projectFiles';

test('filters project file tree entries using .gitignore patterns by default', () => {
  const files = filterProjectFilesByGitignore([
    'README.md',
    'src/index.ts',
    'tmp/generated.ts',
    'nested/secret.env',
    '.venv/bin/activate',
    'venv/lib/python/site-packages/noise.py',
    'dist/extension.js',
    'node_modules/pkg/index.js',
    'coverage/lcov.info',
  ], `
# local noise
tmp/
*.env
`);

  assert.deepEqual(files, ['README.md', 'src/index.ts']);
});

test('sorts project files deterministically by path name', () => {
  const files = [
    'src/zeta.ts',
    'src/components/Button.ts',
    'README.md',
    'src/App.ts',
    'package.json',
    'src/components/alert.ts',
  ].sort(compareProjectFilePaths);

  assert.deepEqual(files, [
    'package.json',
    'README.md',
    'src/App.ts',
    'src/components/alert.ts',
    'src/components/Button.ts',
    'src/zeta.ts',
  ]);
});

test('filtered project files keep deterministic sorted order regardless of discovery order', () => {
  const files = filterProjectFilesByGitignore([
    'src/zeta.ts',
    'README.md',
    'src/App.ts',
    'package.json',
  ]);

  assert.deepEqual(files, ['package.json', 'README.md', 'src/App.ts', 'src/zeta.ts']);
});

test('finds the next visible project file after the active file', () => {
  const files = ['README.md', 'src/a.ts', 'src/b.ts'];

  assert.equal(getNextProjectFile(files, 'README.md'), 'src/a.ts');
  assert.equal(getNextProjectFile(files, 'src/a.ts'), 'src/b.ts');
  assert.equal(getNextProjectFile(files, 'src/b.ts'), undefined);
  assert.equal(getNextProjectFile(files, undefined), 'README.md');
});
