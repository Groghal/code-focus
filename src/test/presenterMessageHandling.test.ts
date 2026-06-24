import { doesNotMatch, match } from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

const extensionSource = readFileSync(join(__dirname, '..', '..', 'src', 'extension.ts'), 'utf8');

test('presenter does not handle fullscreen requests', () => {
  doesNotMatch(extensionSource, /message\.type === 'toggleFullscreen'/);
  doesNotMatch(extensionSource, /workbench\.action\.toggleFullScreen/);
});

test('presenter file-tree clicks load the requested workspace file without stealing focus from the webview', () => {
  match(extensionSource, /message\.type === 'openFile'/);
  match(extensionSource, /openPresenterFile\(/);
  match(extensionSource, /workspace\.openTextDocument/);
  match(extensionSource, /presentedDocument = document/);
  match(extensionSource, /filterProjectFilesByGitignore/);
  match(extensionSource, /getNextProjectFile/);
});

test('presenter file switching does not open a normal editor with showTextDocument', () => {
  match(extensionSource, /openTextDocument/);
  match(extensionSource, /Code Focus: loaded the file in the presenter/);
  if (/showTextDocument/.test(extensionSource)) {
    throw new Error('Presenter file clicks must not call vscode.window.showTextDocument because that steals focus from the webview.');
  }
});

test('presenter page scrolling defaults to the measured 19 visible code rows', () => {
  match(extensionSource, /let presenterVisibleLineCount = 19;/);
});

test('presenter page scrolling advances by complete rendered-row windows with no overlap', () => {
  match(extensionSource, /selectRenderedLineWindow\(allLines, presenterTopLine, presenterVisibleLineCount, presenterWrapColumn\)/);
  match(extensionSource, /currentWindow\.nextTopLine/);
  doesNotMatch(extensionSource, /visibleLineCount - 1/);
});

test('extension host paces held page scrolls with one pending request instead of dropping or bursting', () => {
  match(extensionSource, /const PAGE_SCROLL_COOLDOWN_MS = 300;/);
  match(extensionSource, /let pageScrollCooldownTimer: NodeJS\.Timeout \| undefined;/);
  match(extensionSource, /let pageScrollInProgress = false;/);
  match(extensionSource, /let pendingPageScrollDirection: 'down' \| 'up' \| undefined;/);
  match(extensionSource, /function schedulePacedPageScroll\(context: vscode\.ExtensionContext, direction: 'down' \| 'up'\): void/);
  match(extensionSource, /if \(pageScrollCooldownTimer \|\| pageScrollInProgress\) \{/);
  match(extensionSource, /pendingPageScrollDirection = direction;/);
  match(extensionSource, /void runPacedPageScroll\(context, direction\);/);
  match(extensionSource, /pageScrollInProgress = true;[\s\S]*pageScrollCooldownTimer = setTimeout\([\s\S]*await scrollByScreen\(context, direction\);/);
  match(extensionSource, /function flushPendingPageScroll\(context: vscode\.ExtensionContext\): void/);
  match(extensionSource, /const nextDirection = pendingPageScrollDirection;/);
  match(extensionSource, /if \(nextDirection\) \{/);
  doesNotMatch(extensionSource, /function tryLockPageScroll/);
  doesNotMatch(extensionSource, /if \(!tryLockPageScroll\(\)\)/);
});
