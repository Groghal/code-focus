import { doesNotMatch, match } from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

const extensionSource = readFileSync(join(__dirname, '..', '..', 'src', 'extension.ts'), 'utf8');

test('presenter does not handle fullscreen requests', () => {
  doesNotMatch(extensionSource, /message\.type === 'toggleFullscreen'/);
  doesNotMatch(extensionSource, /workbench\.action\.toggleFullScreen/);
});

test('presenter file-tree clicks read the requested workspace file without stealing focus from the webview', () => {
  match(extensionSource, /message\.type === 'openFile'/);
  match(extensionSource, /openPresenterFile\(/);
  match(extensionSource, /readFile\(fileUri\.fsPath, 'utf8'\)/);
  match(extensionSource, /presentedFileText = fileText/);
  match(extensionSource, /presentedFileUri = fileUri/);
  match(extensionSource, /filterProjectFilesByGitignore/);
  match(extensionSource, /getNextProjectFile/);
});

test('presenter file switching does not open a normal editor with VS Code document APIs', () => {
  match(extensionSource, /readFile\(fileUri\.fsPath, 'utf8'\)/);
  match(extensionSource, /Code Focus: loaded the file in the presenter/);
  if (/showTextDocument/.test(extensionSource) || /workspace\.openTextDocument/.test(extensionSource)) {
    throw new Error('Presenter file clicks must not call VS Code document/editor APIs because they can steal focus or wait for language-service work.');
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

test('extension host acknowledges page scroll only after 250ms cooldown and ignores stale ready acks', () => {
  match(extensionSource, /const PAGE_SCROLL_COOLDOWN_MS = 250;/);
  match(extensionSource, /let pageScrollCooldownTimer: NodeJS\.Timeout \| undefined;/);
  match(extensionSource, /let pageScrollInProgress = false;/);
  match(extensionSource, /let pageScrollSequence = 0;/);
  doesNotMatch(extensionSource, /pendingPageScrollDirection/);
  match(extensionSource, /function schedulePacedPageScroll\(context: vscode\.ExtensionContext, direction: 'down' \| 'up'\): void/);
  match(extensionSource, /if \(pageScrollCooldownTimer \|\| pageScrollInProgress\) \{\s*return;\s*\}/);
  match(extensionSource, /void runPacedPageScroll\(context, direction\);/);
  match(extensionSource, /const scrollSequence = \+\+pageScrollSequence;/);
  match(extensionSource, /pageScrollInProgress = true;[\s\S]*pageScrollCooldownTimer = setTimeout\([\s\S]*notifyPageScrollReadyWhenIdle\(scrollSequence\);[\s\S]*await scrollByScreen\(context, direction\);/);
  match(extensionSource, /function notifyPageScrollReadyWhenIdle\(scrollSequence: number\): void/);
  match(extensionSource, /if \(scrollSequence !== pageScrollSequence\) \{/);
  match(extensionSource, /panel\?\.webview\.postMessage\(\{ type: 'pageScrollReady', scrollSequence \}\)/);
  doesNotMatch(extensionSource, /function flushPendingPageScroll/);
  doesNotMatch(extensionSource, /const nextDirection = pendingPageScrollDirection/);
  doesNotMatch(extensionSource, /function tryLockPageScroll/);
  doesNotMatch(extensionSource, /if \(!tryLockPageScroll\(\)\)/);
});
