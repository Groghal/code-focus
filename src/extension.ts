import type { Dirent } from 'node:fs';
import { readFile, readdir } from 'node:fs/promises';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { normalizeRelativePath, type PathMetadata } from './metadata';
import { renderCodePresenterHtml, selectRenderedLineWindow, type CodePresenterLine, type RenderedLineWindow } from './codePresenterHtml';
import { filterProjectFilesByGitignore, getNextProjectFile } from './projectFiles';

const REFRESH_DELAY_MS = 300;
const PAGE_SCROLL_COOLDOWN_MS = 250;
const PRUNED_PROJECT_TREE_DIRECTORIES = new Set(['.git', 'node_modules', '.venv', 'venv', 'dist', 'out', 'coverage', '.next']);
const PROJECT_TREE_WALK_YIELD_INTERVAL = 500;

let panel: vscode.WebviewPanel | undefined;
let refreshTimer: NodeJS.Timeout | undefined;
let refreshSequence = 0;
let lastTextEditor: vscode.TextEditor | undefined;
let presentedDocument: vscode.TextDocument | undefined;
let presentedFileUri: vscode.Uri | undefined;
let presentedFileText: string | undefined;
let presentedWorkspaceFolder: vscode.WorkspaceFolder | undefined;
let presenterTopLine = 0;
let presenterVisibleLineCount = 19;
let presenterWrapColumn = 68;
let cachedProjectFiles: string[] = [];
let cachedProjectFilesWorkspacePath: string | undefined;
let cachedProjectFilesPromise: Promise<string[]> | undefined;
let pageScrollCooldownTimer: NodeJS.Timeout | undefined;
let pageScrollInProgress = false;

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
    vscode.workspace.onDidCreateFiles(() => invalidateProjectFileTree(context)),
    vscode.workspace.onDidDeleteFiles(() => invalidateProjectFileTree(context)),
    vscode.workspace.onDidRenameFiles(() => invalidateProjectFileTree(context)),
  );
  const gitignoreWatcher = vscode.workspace.createFileSystemWatcher('**/.gitignore');
  context.subscriptions.push(
    gitignoreWatcher,
    gitignoreWatcher.onDidChange(() => invalidateProjectFileTree(context)),
    gitignoreWatcher.onDidCreate(() => invalidateProjectFileTree(context)),
    gitignoreWatcher.onDidDelete(() => invalidateProjectFileTree(context)),
  );
}

export function deactivate(): void {
  closePanel();
}

async function showPanel(context: vscode.ExtensionContext): Promise<void> {
  if (!panel) {
    panel = vscode.window.createWebviewPanel(
      'codeFocusPresenterPanel',
      'Code Focus Presenter',
      vscode.ViewColumn.Beside,
      { enableScripts: true, retainContextWhenHidden: true },
    );
    panel.webview.html = renderCodePresenterHtml({
      fullPath: 'Loading Code Focus presenter…',
      firstLine: 0,
      lastLine: 0,
      lines: [],
    });

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
  } else {
    panel.reveal(vscode.ViewColumn.Beside);
  }

  const activeEditor = vscode.window.activeTextEditor;
  if (activeEditor?.document.uri.scheme === 'file') {
    rememberPresentedEditor(activeEditor);
    clearRefreshTimer();
  }
  void refreshPanel(context);
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

  rememberPresentedEditor(editor);
  clearRefreshTimer();
  await refreshPanel(context);
  return true;
}

function rememberPresentedEditor(editor: vscode.TextEditor): void {
  lastTextEditor = editor;
  presentedDocument = editor.document;
  presentedFileUri = undefined;
  presentedFileText = undefined;
  presentedWorkspaceFolder = vscode.workspace.getWorkspaceFolder(editor.document.uri);
  presenterTopLine = getEditorTopLine(editor);
  presenterVisibleLineCount = getEditorVisibleLineCount(editor);
}

function closePanel(): void {
  clearRefreshTimer();
  clearPageScrollCooldownTimer();
  panel?.dispose();
  panel = undefined;
}

function schedulePacedPageScroll(context: vscode.ExtensionContext, direction: 'down' | 'up'): void {
  if (pageScrollCooldownTimer || pageScrollInProgress) {
    return;
  }
  void runPacedPageScroll(context, direction);
}

async function runPacedPageScroll(context: vscode.ExtensionContext, direction: 'down' | 'up'): Promise<void> {
  pageScrollInProgress = true;
  pageScrollCooldownTimer = setTimeout(() => {
    pageScrollCooldownTimer = undefined;
    notifyPageScrollReadyWhenIdle();
  }, PAGE_SCROLL_COOLDOWN_MS);
  try {
    await scrollByScreen(context, direction);
  } finally {
    pageScrollInProgress = false;
    notifyPageScrollReadyWhenIdle();
  }
}

function notifyPageScrollReadyWhenIdle(): void {
  if (pageScrollCooldownTimer || pageScrollInProgress) {
    return;
  }
  void panel?.webview.postMessage({ type: 'pageScrollReady' });
}

function clearPageScrollCooldownTimer(): void {
  if (pageScrollCooldownTimer) {
    clearTimeout(pageScrollCooldownTimer);
    pageScrollCooldownTimer = undefined;
  }
  pageScrollInProgress = false;
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

  const fileUri = vscode.Uri.file(path.join(workspaceFolder.uri.fsPath, ...relativeFilePath.split('/')));
  let fileText: string;
  try {
    fileText = await readFile(fileUri.fsPath, 'utf8');
  } catch {
    vscode.window.showWarningMessage(`Code Focus: cannot read ${relativeFilePath}.`);
    return;
  }

  presentedDocument = undefined;
  presentedFileUri = fileUri;
  presentedFileText = fileText;
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
  const text = getPresentedText();
  if (text === undefined) {
    vscode.window.showWarningMessage('Code Focus: open a text file before using presenter page scroll.');
    return;
  }

  if (!presentedDocument && !presentedFileUri) {
    const document = lastTextEditor?.document;
    if (document?.uri.scheme === 'file') {
      presentedDocument = document;
      presentedWorkspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
    }
  }

  const allLines = buildAllCodeLinesFromText(text);
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

async function refreshPanel(context: vscode.ExtensionContext): Promise<void> {
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
  const projectFiles = getCachedProjectFileTreeForCurrentDocument();
  ensureProjectFileTreeLoading(context);
  const projectFilesLoading = isProjectFileTreeLoadingForCurrentDocument();
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
    projectFilesLoading,
    wrapColumn: presenterWrapColumn,
  });
}

function buildFullPath(): string {
  const fileUri = getPresentedFileUri();
  return fileUri?.fsPath ?? '';
}

function getCachedProjectFileTreeForCurrentDocument(): string[] {
  const fileUri = getPresentedFileUri();
  if (!fileUri) {
    cachedProjectFiles = [];
    cachedProjectFilesWorkspacePath = undefined;
    cachedProjectFilesPromise = undefined;
    return [];
  }

  const workspaceFolder = presentedWorkspaceFolder ?? vscode.workspace.getWorkspaceFolder(fileUri);
  if (!workspaceFolder) {
    const onlyFile = normalizeRelativePath(fileUri.fsPath, undefined);
    cachedProjectFiles = [onlyFile];
    cachedProjectFilesWorkspacePath = undefined;
    cachedProjectFilesPromise = undefined;
    return cachedProjectFiles;
  }

  return cachedProjectFilesWorkspacePath === workspaceFolder.uri.fsPath ? cachedProjectFiles : [];
}

function isProjectFileTreeLoadingForCurrentDocument(): boolean {
  const fileUri = getPresentedFileUri();
  if (!fileUri) {
    return false;
  }
  const workspaceFolder = presentedWorkspaceFolder ?? vscode.workspace.getWorkspaceFolder(fileUri);
  return Boolean(workspaceFolder && cachedProjectFilesWorkspacePath === workspaceFolder.uri.fsPath && cachedProjectFilesPromise);
}

function ensureProjectFileTreeLoading(context: vscode.ExtensionContext): void {
  const fileUri = getPresentedFileUri();
  if (!fileUri) {
    return;
  }
  const workspaceFolder = presentedWorkspaceFolder ?? vscode.workspace.getWorkspaceFolder(fileUri);
  if (!workspaceFolder) {
    return;
  }

  const workspacePath = workspaceFolder.uri.fsPath;
  if (cachedProjectFilesWorkspacePath === workspacePath && cachedProjectFiles.length > 0) {
    return;
  }
  if (cachedProjectFilesWorkspacePath === workspacePath && cachedProjectFilesPromise) {
    return;
  }

  cachedProjectFilesWorkspacePath = workspacePath;
  cachedProjectFilesPromise = discoverProjectFiles(workspaceFolder).then((files) => {
    if (cachedProjectFilesWorkspacePath === workspacePath) {
      cachedProjectFiles = files;
      cachedProjectFilesPromise = undefined;
      scheduleRefresh(context);
    }
    return files;
  }, (error) => {
    if (cachedProjectFilesWorkspacePath === workspacePath) {
      cachedProjectFilesPromise = undefined;
    }
    console.error('Code Focus: failed to collect project file tree', error);
    return [];
  });
}

async function discoverProjectFiles(workspaceFolder: vscode.WorkspaceFolder): Promise<string[]> {
  const relativeFiles = await walkWorkspaceFiles(workspaceFolder.uri.fsPath);
  const gitignoreText = await readWorkspaceGitignore(workspaceFolder);
  return filterProjectFilesByGitignore(relativeFiles, gitignoreText);
}

async function walkWorkspaceFiles(workspaceRoot: string): Promise<string[]> {
  const files: string[] = [];
  let visited = 0;

  async function walkDirectory(directoryPath: string, relativeDirectory = ''): Promise<void> {
    let entries: Dirent[];
    try {
      entries = await readdir(directoryPath, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.isSymbolicLink()) {
        continue;
      }
      const relativePath = relativeDirectory ? `${relativeDirectory}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        if (PRUNED_PROJECT_TREE_DIRECTORIES.has(entry.name)) {
          continue;
        }
        await walkDirectory(path.join(directoryPath, entry.name), relativePath);
      } else if (entry.isFile()) {
        files.push(relativePath);
      }
      visited += 1;
      if (visited % PROJECT_TREE_WALK_YIELD_INTERVAL === 0) {
        await new Promise<void>((resolve) => setImmediate(resolve));
      }
    }
  }

  await walkDirectory(workspaceRoot);
  return files;
}

function invalidateProjectFileTree(context: vscode.ExtensionContext): void {
  cachedProjectFiles = [];
  cachedProjectFilesWorkspacePath = undefined;
  cachedProjectFilesPromise = undefined;
  scheduleRefresh(context);
}

async function readWorkspaceGitignore(workspaceFolder: vscode.WorkspaceFolder): Promise<string> {
  try {
    return await readFile(path.join(workspaceFolder.uri.fsPath, '.gitignore'), 'utf8');
  } catch {
    return '';
  }
}

function buildVisibleCodeLines(): CodePresenterLine[] {
  const text = getPresentedText();
  if (text === undefined) {
    return [];
  }

  return buildRenderedWindowFromText(text).lines;
}

function getPresentedText(): string | undefined {
  if (presentedFileText !== undefined) {
    return presentedFileText;
  }
  const document = presentedDocument ?? lastTextEditor?.document;
  return document?.uri.scheme === 'file' ? document.getText() : undefined;
}

function getPresentedFileUri(): vscode.Uri | undefined {
  if (presentedFileUri) {
    return presentedFileUri;
  }
  const document = presentedDocument ?? lastTextEditor?.document;
  return document?.uri.scheme === 'file' ? document.uri : undefined;
}

function buildRenderedWindowFromText(text: string): RenderedLineWindow {
  return selectRenderedLineWindow(
    buildAllCodeLinesFromText(text),
    presenterTopLine,
    presenterVisibleLineCount,
    presenterWrapColumn,
  );
}

function buildAllCodeLines(document: vscode.TextDocument): CodePresenterLine[] {
  return buildAllCodeLinesFromText(document.getText());
}

function buildAllCodeLinesFromText(text: string): CodePresenterLine[] {
  return text.split(/\r?\n/).map((lineText, index) => ({
    number: index + 1,
    text: lineText,
  }));
}

function buildCurrentMetadata(): PathMetadata | undefined {
  const fileUri = getPresentedFileUri();
  const text = getPresentedText();
  if (!fileUri || text === undefined) {
    return undefined;
  }

  const workspaceFolder = presentedWorkspaceFolder ?? vscode.workspace.getWorkspaceFolder(fileUri);
  const relativePath = normalizeRelativePath(fileUri.fsPath, workspaceFolder?.uri.fsPath);
  const renderedWindow = buildRenderedWindowFromText(text);
  return {
    version: 1,
    path: relativePath,
    firstVisibleLine: renderedWindow.firstLine,
    lastVisibleLine: renderedWindow.lastLine,
  };
}
