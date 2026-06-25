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
  match(extensionSource, /onDidChangeTextEditorVisibleRanges[\s\S]*presentTextEditor\(context, event\.textEditor/);
});

test('active editor changes update the presenter document without reloading VS Code', () => {
  match(extensionSource, /onDidChangeActiveTextEditor\(\(editor\) =>/);
  match(extensionSource, /onDidChangeActiveTextEditor[\s\S]*presentTextEditor\(context, editor/);
  match(extensionSource, /presentedDocument = editor\.document/);
  match(extensionSource, /presenterTopLine = getEditorTopLine\(editor\)/);
  match(extensionSource, /presenterVisibleLineCount = getEditorVisibleLineCount\(editor\)/);
});

test('reload command forces Code Focus to reload from the active editor', () => {
  match(extensionSource, /registerCommand\('codeFocus\.reloadFromActiveEditor', \(\) => reloadFromActiveEditor\(context\)\)/);
  match(extensionSource, /async function reloadFromActiveEditor\(context: vscode\.ExtensionContext\): Promise<void>/);
  match(extensionSource, /presentTextEditor\(context, vscode\.window\.activeTextEditor, \{ showWarning: true \}\)/);
  match(extensionSource, /Code Focus: open a text file before reloading from the active editor\./);
});
