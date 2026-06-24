import assert from 'node:assert/strict';
import test from 'node:test';

import { normalizeRelativePath, type PathMetadata } from '../metadata';

test('normalizes relative paths to portable forward-slash paths', () => {
  assert.equal(normalizeRelativePath('src\\extension.ts'), 'src/extension.ts');
  assert.equal(normalizeRelativePath('/workspace/app/src/index.ts', '/workspace/app'), 'src/index.ts');
});

test('stores only presenter path and visible line range metadata', () => {
  const metadata: PathMetadata = {
    version: 1,
    path: 'src/extension.ts',
    firstVisibleLine: 12,
    lastVisibleLine: 48,
  };

  assert.deepEqual(metadata, {
    version: 1,
    path: 'src/extension.ts',
    firstVisibleLine: 12,
    lastVisibleLine: 48,
  });
  assert.deepEqual(Object.keys(metadata), ['version', 'path', 'firstVisibleLine', 'lastVisibleLine']);
});
