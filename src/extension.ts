import { readFile } from 'node:fs/promises';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { normalizeRelativePath, type PathMetadata } from './metadata';
import { renderCodePresenterHtml, selectRenderedLineWindow, type CodePresenterLine, type RenderedLineWindow } from './codePresenterHtml';
import { filterProjectFilesByGitignore, getNextProjectFile } from './projectFiles';

const REFRESH_DELAY_MS = 300;
const PAGE_SCROLL_COOLDOWN_MS = 300;

let panel: vscode.WebviewPanel | undefined;
let refreshTimer: NodeJS.Timeout | undefined;
let refreshSequence = 0;
let lastTextEditor: vscode.TextEditor | undefined;
let presentedDocument: vscode.TextDocument | undefined;
let presentedWorkspaceFolder: vscode.WorkspaceFolder | undefined;
let presenterTopLine = 0;
let presenterVisibleLineCount = 19;
let presenterWrapColumn = 68;
let cachedProjectFiles: string[] = [];
let pageScrollCooldownTimer: NodeJS.Timeout | undefined;
let pageScrollInProgress = false;
let pendingPageScrollDirection: 'down' | 'up' | undefined;

export function activate(context: vscode.ExtensionContext): void {
  rememberTextEditor(vscode.window.activeTextEditor);
  context.subscriptions.push(
    vscode.commands.registerCommand('codeFocus.showPanel', () => showPanel(context)),
    vscode.commands.registerCommand('codeFocus.reloadFromActiveEditor', () => reloadFromActiveEditor(context)),
    vscode.window.onDidChangeActiveTextEditor((editor) => {
      if (editor?.document.uri.scheme === 'file') {
        void presentTextEditor(context, editor, { showWarning: false });
        return;
      }
      rememberTextEditor(editor);
      scheduleRefresh(context);
    }),
    vscode.window.onDidChangeTextEditorVisibleRanges((event) => {
      void presentTextEditor(context, event.textEditor, { showWarning: false });
    }),
    vscode.workspace.onDidChangeTextDocument(() => scheduleRefresh(context)),
  );
}

export function deactivate(): void {
  closePanel();
}

async function showPanel(context: vscode.ExtensionContext): Promise<void> {
  await presentTextEditor(context, vscode.window.activeTextEditor, { showWarning: false });
  if (!panel) {
    panel = vscode.window.createWebviewPanel(
      'codeFocusPresenterPanel',
      'Code Focus Presenter',
      vscode.ViewColumn.Beside,
      { enableScripts: true, retainContextWhenHidden: true },
    );

    panel.webview.onDidReceiveMessage((message: { type?: string; direction?: string; path?: string; visibleLineCount?: number; wrapColumn?: number }) => {
      if (message.type === 'pageScroll') {
        schedulePacedPageScroll(context, message.direction === 'up' ? 'up' : 'down');
      } else if (message.type === 'openFile') {
        void openPresenterFile(context, message.path);
      } else if (message.type === 'viewportMetrics') {
        rememberPresenterViewportMetrics(context, message.visibleLineCount, message.wrapColumn);
      }
    });

    panel.onDidDispose(() => {
      panel = undefined;
      clearRefreshTimer();
      clearPageScrollCooldownTimer();
    });
  }

  await refreshPanel(context);
  vscode.window.showInformationMessage('Code Focus presenter started. Use this webview for a focused human-readable code view.');
}

async function reloadFromActiveEditor(context: vscode.ExtensionContext): Promise<void> {
  const loaded = await presentTextEditor(context, vscode.window.activeTextEditor, { showWarning: true });
  if (loaded && !panel) {
    await showPanel(context);
  }
}

async function presentTextEditor(
  context: vscode.ExtensionContext,
  editor: vscode.TextEditor | undefined,
  options: { showWarning: boolean },
): Promise<boolean> {
  if (!editor || editor.document.uri.scheme !== 'file') {
    if (options.showWarning) {
      vscode.window.showWarningMessage('Code Focus: open a text file before reloading from the active editor.');
    }
    return false;
  }

  lastTextEditor = editor;
  presentedDocument = editor.document;
  presentedWorkspaceFolder = vscode.workspace.getWorkspaceFolder(editor.document.uri);
  presenterTopLine = getEditorTopLine(editor);
  presenterVisibleLineCount = getEditorVisibleLineCount(editor);
  clearRefreshTimer();
  await refreshPanel(context);
  return true;
}

function closePanel(): void {
  clearRefreshTimer();
  clearPageScrollCooldownTimer();
  panel?.dispose();
  panel = undefined;
}

function schedulePacedPageScroll(context: vscode.ExtensionContext, direction: 'down' | 'up'): void {
  if (pageScrollCooldownTimer || pageScrollInProgress) {
    pendingPageScrollDirection = direction;
    return;
  }
  void runPacedPageScroll(context, direction);
}

async function runPacedPageScroll(context: vscode.ExtensionContext, direction: 'down' | 'up'): Promise<void> {
  pageScrollInProgress = true;
  pageScrollCooldownTimer = setTimeout(() => {
    pageScrollCooldownTimer = undefined;
    flushPendingPageScroll(context);
  }, PAGE_SCROLL_COOLDOWN_MS);
  try {
    await scrollByScreen(context, direction);
  } finally {
    pageScrollInProgress = false;
    flushPendingPageScroll(context);
  }
}

function flushPendingPageScroll(context: vscode.ExtensionContext): void {
  if (pageScrollCooldownTimer || pageScrollInProgress) {
    return;
  }
  const nextDirection = pendingPageScrollDirection;
  pendingPageScrollDirection = undefined;
  if (nextDirection) {
    void runPacedPageScroll(context, nextDirection);
  }
}

function clearPageScrollCooldownTimer(): void {
  if (pageScrollCooldownTimer) {
    clearTimeout(pageScrollCooldownTimer);
    pageScrollCooldownTimer = undefined;
  }
  pageScrollInProgress = false;
  pendingPageScrollDirection = undefined;
}

function rememberPresenterViewportMetrics(
  context: vscode.ExtensionContext,
  visibleLineCount: number | undefined,
  wrapColumn: number | undefined,
): void {
  const nextVisibleLineCount = typeof visibleLineCount === 'number' && Number.isInteger(visibleLineCount) && visibleLineCount >= 1
    ? visibleLineCount
    : presenterVisibleLineCount;
  const nextWrapColumn = typeof wrapColumn === 'number' && Number.isInteger(wrapColumn) && wrapColumn >= 20
    ? wrapColumn
    : presenterWrapColumn;

  if (presenterVisibleLineCount === nextVisibleLineCount && presenterWrapColumn === nextWrapColumn) {
    return;
  }

  presenterVisibleLineCount = nextVisibleLineCount;
  presenterWrapColumn = nextWrapColumn;
  clearRefreshTimer();
  void refreshPanel(context);
}

async function openPresenterFile(context: vscode.ExtensionContext, relativeFilePath: string | undefined): Promise<void> {
  if (!relativeFilePath || path.isAbsolute(relativeFilePath) || relativeFilePath.split('/').includes('..')) {
    vscode.window.showWarningMessage('Code Focus: cannot open an invalid project file path.');
    return;
  }

  const workspaceFolder = presentedWorkspaceFolder ?? getCurrentWorkspaceFolder();
  if (!workspaceFolder) {
    vscode.window.showWarningMessage('Code Focus: open a workspace folder before using presenter file switching.');
    return;
  }

  const document = await vscode.workspace.openTextDocument(vscode.Uri.file(path.join(workspaceFolder.uri.fsPath, ...relativeFilePath.split('/'))));
  presentedDocument = document;
  presentedWorkspaceFolder = workspaceFolder;
  presenterTopLine = 0;
  clearRefreshTimer();
  await refreshPanel(context);
  vscode.window.setStatusBarMessage('Code Focus: loaded the file in the presenter without opening a normal editor.', 2500);
}

function getCurrentWorkspaceFolder(): vscode.WorkspaceFolder | undefined {
  const editor = vscode.window.activeTextEditor ?? lastTextEditor;
  if (editor?.document.uri.scheme === 'file') {
    return vscode.workspace.getWorkspaceFolder(editor.document.uri);
  }
  return vscode.workspace.workspaceFolders?.[0];
}

async function scrollByScreen(context: vscode.ExtensionContext, direction: 'down' | 'up'): Promise<void> {
  const document = presentedDocument ?? lastTextEditor?.document;
  if (!document || document.uri.scheme !== 'file') {
    vscode.window.showWarningMessage('Code Focus: open a text file before using presenter page scroll.');
    return;
  }

  if (!presentedDocument) {
    presentedDocument = document;
    presentedWorkspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
  }

  const allLines = buildAllCodeLines(document);
  const currentWindow = selectRenderedLineWindow(allLines, presenterTopLine, presenterVisibleLineCount, presenterWrapColumn);

  if (direction === 'down' && currentWindow.nextTopLine >= allLines.length) {
    const metadata = buildCurrentMetadata();
    const nextFile = getNextProjectFile(cachedProjectFiles, metadata?.path);
    if (nextFile) {
      await openPresenterFile(context, nextFile);
      return;
    }
  }

  presenterTopLine = direction === 'down'
    ? Math.min(allLines.length, Math.max(presenterTopLine + 1, currentWindow.nextTopLine))
    : findPreviousRenderedTopLine(allLines, presenterTopLine);

  clearRefreshTimer();
  await refreshPanel(context);
}

function findPreviousRenderedTopLine(allLines: CodePresenterLine[], currentTopLine: number): number {
  if (currentTopLine <= 0) {
    return 0;
  }

  let previousTopLine = 0;
  let scanTopLine = 0;
  while (scanTopLine < currentTopLine) {
    const window = selectRenderedLineWindow(allLines, scanTopLine, presenterVisibleLineCount, presenterWrapColumn);
    const nextTopLine = Math.max(scanTopLine + 1, window.nextTopLine);
    if (nextTopLine >= currentTopLine) {
      return previousTopLine;
    }
    previousTopLine = scanTopLine;
    scanTopLine = nextTopLine;
  }

  return previousTopLine;
}

function scheduleRefresh(context: vscode.ExtensionContext): void {
  if (!panel) {
    return;
  }

  clearRefreshTimer();
  refreshTimer = setTimeout(() => {
    void refreshPanel(context);
  }, REFRESH_DELAY_MS);
}

function clearRefreshTimer(): void {
  if (refreshTimer) {
    clearTimeout(refreshTimer);
    refreshTimer = undefined;
  }
}

function rememberTextEditor(editor: vscode.TextEditor | undefined): void {
  if (editor?.document.uri.scheme === 'file') {
    lastTextEditor = editor;
    if (!presentedDocument) {
      presentedDocument = editor.document;
      presentedWorkspaceFolder = vscode.workspace.getWorkspaceFolder(editor.document.uri);
      presenterTopLine = getEditorTopLine(editor);
      presenterVisibleLineCount = getEditorVisibleLineCount(editor);
    }
  }
}

function getEditorTopLine(editor: vscode.TextEditor): number {
  const visibleRange = editor.visibleRanges[0] ?? new vscode.Range(editor.selection.active, editor.selection.active);
  return Math.max(0, visibleRange.start.line);
}

function getEditorVisibleLineCount(editor: vscode.TextEditor): number {
  const visibleRange = editor.visibleRanges[0] ?? new vscode.Range(editor.selection.active, editor.selection.active);
  return Math.max(1, visibleRange.end.line - visibleRange.start.line + 1);
}

async function refreshPanel(_context: vscode.ExtensionContext): Promise<void> {
  if (!panel) {
    return;
  }

  const sequence = ++refreshSequence;
  const metadata = buildCurrentMetadata();
  if (!metadata) {
    if (sequence !== refreshSequence || !panel) {
      return;
    }
    panel.webview.html = renderCodePresenterHtml({
      fullPath: 'Open a text file to render it in the controlled presenter',
      firstLine: 0,
      lastLine: 0,
      lines: [],
    });
    return;
  }

  if (sequence !== refreshSequence || !panel) {
    return;
  }
  const codeLines = buildVisibleCodeLines();
  const projectFiles = await buildProjectFileTree();
  if (sequence !== refreshSequence || !panel) {
    return;
  }
  panel.webview.html = renderCodePresenterHtml({
    fullPath: buildFullPath(),
    activeRelativePath: metadata.path,
    firstLine: metadata.firstVisibleLine,
    lastLine: metadata.lastVisibleLine,
    lines: codeLines,
    projectFiles,
    wrapColumn: presenterWrapColumn,
  });
}

function buildFullPath(): string {
  const document = presentedDocument ?? lastTextEditor?.document;
  return document?.uri.scheme === 'file' ? document.uri.fsPath : '';
}

async function buildProjectFileTree(): Promise<string[]> {
  const document = presentedDocument ?? lastTextEditor?.document;
  if (!document || document.uri.scheme !== 'file') {
    cachedProjectFiles = [];
    return [];
  }

  const workspaceFolder = presentedWorkspaceFolder ?? vscode.workspace.getWorkspaceFolder(document.uri);
  if (!workspaceFolder) {
    const onlyFile = normalizeRelativePath(document.uri.fsPath, undefined);
    cachedProjectFiles = [onlyFile];
    return cachedProjectFiles;
  }

  const files = await vscode.workspace.findFiles(
    new vscode.RelativePattern(workspaceFolder, '**/*'),
    new vscode.RelativePattern(workspaceFolder, '**/{.git,node_modules,.venv,venv,dist,out,coverage,.next}/**'),
  );
  const relativeFiles = files.map((uri) => normalizeRelativePath(uri.fsPath, workspaceFolder.uri.fsPath));
  const gitignoreText = await readWorkspaceGitignore(workspaceFolder);
  cachedProjectFiles = filterProjectFilesByGitignore(relativeFiles, gitignoreText);
  return cachedProjectFiles;
}

async function readWorkspaceGitignore(workspaceFolder: vscode.WorkspaceFolder): Promise<string> {
  try {
    return await readFile(path.join(workspaceFolder.uri.fsPath, '.gitignore'), 'utf8');
  } catch {
    return '';
  }
}

function buildVisibleCodeLines(): CodePresenterLine[] {
  const document = presentedDocument ?? lastTextEditor?.document;
  if (!document || document.uri.scheme !== 'file') {
    return [];
  }

  return buildRenderedWindow(document).lines;
}

function buildRenderedWindow(document: vscode.TextDocument): RenderedLineWindow {
  return selectRenderedLineWindow(
    buildAllCodeLines(document),
    presenterTopLine,
    presenterVisibleLineCount,
    presenterWrapColumn,
  );
}

function buildAllCodeLines(document: vscode.TextDocument): CodePresenterLine[] {
  return document.getText().split(/\r?\n/).map((text, index) => ({
    number: index + 1,
    text,
  }));
}

function buildCurrentMetadata(): PathMetadata | undefined {
  const document = presentedDocument ?? lastTextEditor?.document;
  if (!document || document.uri.scheme !== 'file') {
    return undefined;
  }

  const workspaceFolder = presentedWorkspaceFolder ?? vscode.workspace.getWorkspaceFolder(document.uri);
  const relativePath = normalizeRelativePath(document.uri.fsPath, workspaceFolder?.uri.fsPath);
  const renderedWindow = buildRenderedWindow(document);
  return {
    version: 1,
    path: relativePath,
    firstVisibleLine: renderedWindow.firstLine,
    lastVisibleLine: renderedWindow.lastLine,
  };
}
