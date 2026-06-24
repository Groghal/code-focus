import { match } from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

const extensionSource = readFileSync(join(__dirname, '..', '..', 'src', 'extension.ts'), 'utf8');

test('metadata refresh falls back to the last file text editor when the webview takes focus', () => {
  match(extensionSource, /lastTextEditor/);
  match(extensionSource, /rememberTextEditor\(/);
  match(extensionSource, /activeTextEditor[\s\S]*\?\?[\s\S]*lastTextEditor/);
});

test('visible range changes refresh metadata immediately with the scrolled text editor', () => {
  match(extensionSource, /onDidChangeTextEditorVisibleRanges\(\(event\) =>/);
  match(extensionSource, /onDidChangeTextEditorVisibleRanges[\s\S]*rememberTextEditor\(event\.textEditor\)/);
  match(extensionSource, /onDidChangeTextEditorVisibleRanges[\s\S]*refreshPanel\(context\)/);
});
