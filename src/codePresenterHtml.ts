import { compareProjectFilePaths } from './projectFiles';

export interface CodePresenterLine {
  number: number;
  text: string;
}

interface RenderedCodeRow {
  wrapPrefix: string;
  text: string;
}

export interface RenderedLineWindow {
  firstLine: number;
  lastLine: number;
  nextTopLine: number;
  lines: CodePresenterLine[];
}

export interface CodePresenterHtmlInput {
  fullPath: string;
  activeRelativePath?: string;
  firstLine: number;
  lastLine: number;
  lines: CodePresenterLine[];
  projectFiles?: string[];
  projectFilesLoading?: boolean;
  wrapColumn?: number;
}

const DEFAULT_WRAP_COLUMN = 100;
const WRAP_PREFIX = 'WR>';
const BLANK_PREFIX = 'BR>';
const SPACE_PREFIX = 'S';
const TAB_VISIBLE_WIDTH = 2;
const WRAP_EDGE_GUARD_COLUMNS = 4;
const MAX_RENDERED_TREE_FILES = 240;
const TREE_ACTIVE_CONTEXT_FILES = 120;

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function splitDisplayPath(fullPath: string, activeRelativePath: string): { openedFolder: string; openedFile: string } {
  const normalized = fullPath.replace(/\\/g, '/');
  const relative = activeRelativePath.replace(/\\/g, '/');
  if (relative && normalized.endsWith(`/${relative}`)) {
    return {
      openedFolder: normalized.slice(0, normalized.length - relative.length - 1) || '/',
      openedFile: relative,
    };
  }
  const lastSlash = normalized.lastIndexOf('/');
  if (lastSlash < 0) {
    return { openedFolder: '.', openedFile: normalized };
  }
  return {
    openedFolder: normalized.slice(0, lastSlash) || '/',
    openedFile: normalized.slice(lastSlash + 1) || normalized,
  };
}

export function renderCodePresenterHtml(input: CodePresenterHtmlInput): string {
  const activeRelativePath = input.activeRelativePath ?? '';
  const displayPath = splitDisplayPath(input.fullPath, activeRelativePath);
  const openedFolder = escapeHtml(displayPath.openedFolder);
  const openedFile = escapeHtml(displayPath.openedFile);
  const lineRange = `${input.firstLine}-${input.lastLine}`;
  const rows = renderRows(input.lines, input.wrapColumn ?? DEFAULT_WRAP_COLUMN);
  const fileTree = renderProjectFileTree(input.projectFiles ?? [], activeRelativePath, input.projectFilesLoading ?? false);
  const lines = rows.length > 0
    ? rows.map((row) => `
        <div class="code-line${row.wrapPrefix ? ' wrapped-continuation' : ''}">
          <span class="wrap-prefix">${escapeHtml(row.wrapPrefix)}</span>
          <code>${escapeHtml(row.text) || '&nbsp;'}</code>
        </div>`).join('')
    : '<div class="empty-state">Open a file or scroll the source editor to render code here.</div>';

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Code Focus Presenter</title>
  <style>
    :root {
      color-scheme: light;
      --page-bg: #ffffff;
      --code-bg: #ffffff;
      --code-fg: #0f172a;
      --wrap-prefix: #b91c1c;
      --border: #cbd5e1;
      --metadata-bg: #ffffff;
      --metadata-fg: #0f172a;
      --muted: #475569;
      --readable-code-font: "IBM Plex Mono", "DejaVu Sans Mono", "JetBrains Mono", Consolas, "Liberation Mono", monospace;
    }

    * { box-sizing: border-box; }

    html, body {
      margin: 0;
      min-height: 100vh;
      background: var(--page-bg);
      color: var(--code-fg);
    }

    body {
      font-family: Arial, Helvetica, sans-serif;
      overflow: hidden;
    }

    .presenter-frame {
      width: 100vw;
      height: 100vh;
      display: grid;
      grid-template-rows: 172px 1fr;
      grid-template-columns: minmax(260px, 18vw) 1fr;
      background: var(--page-bg);
    }

    .metadata-strip {
      display: grid;
      grid-column: 1 / -1;
      align-content: start;
      grid-template-rows: 36px 24px 24px 24px 28px;
      padding: 10px 28px 12px;
      background: var(--metadata-bg);
      border-bottom: 4px solid var(--border);
      color: var(--metadata-fg);
      overflow: hidden;
    }

    .metadata-strip > div {
      display: contents;
    }

    .metadata-opened-folder {
      align-items: center;
      color: var(--muted);
      display: flex;
      flex-wrap: nowrap;
      gap: 0.65ch;
      font-family: var(--readable-code-font);
      grid-row: 1;
      line-height: 36px;
      min-width: 0;
      overflow: hidden;
      white-space: nowrap;
    }

    .metadata-folder-label {
      font: 800 clamp(14px, 1.05vw, 19px)/1.1 Arial, Helvetica, sans-serif;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }

    .metadata-folder,
    .metadata-path {
      font-family: var(--readable-code-font);
      font-weight: 800;
      overflow-wrap: anywhere;
      word-break: break-word;
      white-space: normal;
    }

    .metadata-folder {
      font-size: clamp(18px, 1.35vw, 26px);
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .metadata-path {
      color: var(--metadata-fg);
      display: -webkit-box;
      font-size: clamp(17px, 1.35vw, 24px);
      grid-row: 2 / span 3;
      line-height: 24px;
      margin-top: 0;
      max-height: 72px;
      overflow: hidden;
      -webkit-box-orient: vertical;
      -webkit-line-clamp: 3;
    }

    .metadata-lines {
      align-self: end;
      grid-row: 5;
      margin-top: 0;
      color: var(--muted);
      font: 700 clamp(14px, 1.1vw, 20px)/1.15 var(--readable-code-font);
    }


    .file-tree {
      overflow-y: auto;
      overflow-x: auto;
      border-right: 4px solid var(--border);
      background: #f8fafc;
      padding: 18px 14px;
      font: 700 clamp(14px, 0.95vw, 19px)/1.45 ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
    }

    .file-tree-title {
      margin-bottom: 12px;
      color: var(--muted);
      text-transform: uppercase;
      letter-spacing: 0.08em;
      font-size: 0.82em;
    }

    .file-tree-items {
      display: grid;
      gap: 4px;
      padding-bottom: 24px;
    }

    .file-tree-directory,
    .file-tree-file {
      color: #334155;
      overflow-wrap: anywhere;
      word-break: normal;
    }

    .file-tree-directory {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      color: #64748b;
      margin-top: 6px;
    }

    .file-tree-file {
      appearance: none;
      border: 0;
      border-radius: 8px;
      background: transparent;
      cursor: pointer;
      display: block;
      font: inherit;
      padding: 3px 6px;
      text-align: left;
      white-space: normal;
      width: 100%;
    }

    .file-tree-file:hover,
    .file-tree-file:focus-visible {
      background: #e2e8f0;
      color: #0f172a;
      outline: 2px solid #94a3b8;
      outline-offset: 1px;
    }

    .file-tree-file[aria-current="true"] {
      color: #0f172a;
      background: #e2e8f0;
    }

    .code-viewport {
      overflow: hidden;
      background: var(--code-bg);
      padding: 22px 32px 28px;
      border: 0;
    }

    .code-lines {
      display: grid;
      gap: 0;
      font-family: var(--readable-code-font);
      font-variant-ligatures: none;
      font-feature-settings: "liga" 0, "calt" 0;
      font-size: clamp(22px, 1.55vw, 34px);
      line-height: 1.35;
      font-weight: 500;
      letter-spacing: 0;
      tab-size: 2;
    }

    .code-line {
      display: grid;
      grid-template-columns: 6ch 1fr;
      min-width: 0;
      white-space: pre;
    }

    .wrap-prefix {
      color: var(--wrap-prefix);
      font-weight: 800;
      user-select: none;
    }

    .code-line code {
      display: block;
      min-width: 0;
      overflow: hidden;
      color: var(--code-fg);
      background: transparent;
      font: inherit;
      font-variant-ligatures: none;
      font-feature-settings: "liga" 0, "calt" 0;
    }

    .empty-state {
      margin: 8vh auto 0;
      max-width: 900px;
      color: var(--muted);
      font: 700 clamp(24px, 2vw, 40px)/1.3 Arial, Helvetica, sans-serif;
      text-align: center;
    }
  </style>
</head>
<body>
  <main class="presenter-frame">
    <section class="metadata-strip" aria-label="Source file and visible line range">
      <div>
        <div class="metadata-opened-folder"><span class="metadata-folder-label">Opened folder:</span><span class="metadata-folder">${openedFolder}</span></div>
        <div class="metadata-path">${openedFile}</div>
        <div class="metadata-lines">shown lines: ${lineRange}</div>
      </div>
    </section>
    <aside class="file-tree" aria-label="Project file tree">
      <div class="file-tree-title">Project files</div>
      <div class="file-tree-items">
        ${fileTree}
      </div>
    </aside>
    <section class="code-viewport" aria-label="Rendered source code viewport">
      <div class="code-lines">
        ${lines}
      </div>
    </section>
  </main>
  <script>
    (() => {
      const vscode = typeof acquireVsCodeApi === 'function' ? acquireVsCodeApi() : undefined;
      let presenterState = vscode?.getState?.() || {};
      const savePresenterState = (patch) => {
        presenterState = { ...presenterState, ...patch };
        vscode?.setState?.(presenterState);
      };
      const preventManualScroll = (event) => {
        if (event.target.closest('.file-tree')) {
          return;
        }
        event.preventDefault();
      };
      const reportViewportMetrics = () => {
        const viewport = document.querySelector('.code-viewport');
        const codeLines = document.querySelector('.code-lines');
        if (!viewport || !codeLines) {
          return;
        }
        const viewportStyle = window.getComputedStyle(viewport);
        const codeStyle = window.getComputedStyle(codeLines);
        const cssLineHeight = Number.parseFloat(codeStyle.lineHeight);
        if (!Number.isFinite(cssLineHeight) || cssLineHeight <= 0) {
          return;
        }
        const horizontalPadding = Number.parseFloat(viewportStyle.paddingLeft) + Number.parseFloat(viewportStyle.paddingRight);
        const verticalPadding = Number.parseFloat(viewportStyle.paddingTop) + Number.parseFloat(viewportStyle.paddingBottom);
        const contentHeight = Math.max(0, viewport.clientHeight - verticalPadding);
        const renderedRow = codeLines.querySelector('.code-line');
        const measuredRowHeight = renderedRow?.getBoundingClientRect().height ?? 0;
        const rowHeight = Number.isFinite(measuredRowHeight) && measuredRowHeight > 0
          ? measuredRowHeight
          : cssLineHeight;
        const visibleLineCount = Math.max(1, Math.floor(contentHeight / rowHeight));
        const measure = document.createElement('span');
        measure.textContent = '00000000000000000000';
        measure.style.visibility = 'hidden';
        measure.style.position = 'absolute';
        measure.style.font = codeStyle.font;
        codeLines.appendChild(measure);
        const charWidth = measure.getBoundingClientRect().width / 20;
        measure.remove();
        if (!Number.isFinite(charWidth) || charWidth <= 0) {
          vscode?.postMessage({ type: 'viewportMetrics', visibleLineCount });
          return;
        }
        const prefixWidth = charWidth * 6;
        const codeColumnWidth = Math.max(charWidth * 20, viewport.clientWidth - horizontalPadding - prefixWidth);
        const measuredColumns = Math.floor(codeColumnWidth / charWidth);
        const wrapColumn = Math.max(20, measuredColumns - ${WRAP_EDGE_GUARD_COLUMNS});
        vscode?.postMessage({ type: 'viewportMetrics', visibleLineCount, wrapColumn });
      };
      window.addEventListener('wheel', preventManualScroll, { passive: false });
      window.addEventListener('touchmove', preventManualScroll, { passive: false });
      window.addEventListener('resize', () => requestAnimationFrame(reportViewportMetrics));
      requestAnimationFrame(reportViewportMetrics);
      const fileTree = document.querySelector('.file-tree');
      const activeFileButton = document.querySelector('.file-tree-file[aria-current="true"]');
      const activeRelativePath = activeFileButton?.dataset.filePath || '';
      fileTree?.addEventListener('scroll', () => {
        savePresenterState({ fileTreeScrollTop: fileTree.scrollTop, activeRelativePath, revealActiveFile: false });
      });
      requestAnimationFrame(() => {
        if (!fileTree) {
          return;
        }
        const activeFileChanged = Boolean(activeRelativePath && presenterState.activeRelativePath !== activeRelativePath);
        if (typeof presenterState.fileTreeScrollTop === 'number' && !presenterState.revealActiveFile && !activeFileChanged) {
          fileTree.scrollTop = presenterState.fileTreeScrollTop;
          return;
        }
        activeFileButton?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
        savePresenterState({ fileTreeScrollTop: fileTree.scrollTop, activeRelativePath, revealActiveFile: false });
      });
      const PAGE_SCROLL_REPEAT_DELAY_MS = 250;
      let pageScrollInFlight = Boolean(presenterState.pageScrollInFlight);
      let spaceHeld = Boolean(presenterState.spaceHeld);
      let heldSpaceDirection = presenterState.heldSpaceDirection === 'up' ? 'up' : 'down';
      let nextPageScrollAt = Number.isFinite(presenterState.nextPageScrollAt) ? presenterState.nextPageScrollAt : 0;
      let requestedScrollSequence = Number.isFinite(presenterState.requestedScrollSequence) ? presenterState.requestedScrollSequence : 0;
      const rememberPageScrollState = () => {
        savePresenterState({ pageScrollInFlight, spaceHeld, heldSpaceDirection, nextPageScrollAt, requestedScrollSequence });
      };
      const requestPageScroll = (direction) => {
        const now = Date.now();
        if (pageScrollInFlight || now < nextPageScrollAt) {
          return;
        }
        pageScrollInFlight = true;
        heldSpaceDirection = direction;
        nextPageScrollAt = now + PAGE_SCROLL_REPEAT_DELAY_MS;
        requestedScrollSequence += 1;
        savePresenterState({ fileTreeScrollTop: fileTree?.scrollTop || 0, activeRelativePath, revealActiveFile: true });
        rememberPageScrollState();
        vscode?.postMessage({ type: 'pageScroll', direction, scrollSequence: requestedScrollSequence });
      };
      window.addEventListener('message', (event) => {
        if (event.data?.type !== 'pageScrollReady') {
          return;
        }
        if (Number.isFinite(event.data.scrollSequence) && event.data.scrollSequence !== requestedScrollSequence) {
          return;
        }
        pageScrollInFlight = false;
        rememberPageScrollState();
        if (spaceHeld) {
          const delayMs = Math.max(0, nextPageScrollAt - Date.now());
          setTimeout(() => requestPageScroll(heldSpaceDirection), delayMs);
        }
      });
      window.addEventListener('keydown', (event) => {
        if (event.code !== 'Space') {
          return;
        }
        event.preventDefault();
        spaceHeld = true;
        heldSpaceDirection = event.shiftKey ? 'up' : 'down';
        rememberPageScrollState();
        requestPageScroll(heldSpaceDirection);
      });
      window.addEventListener('keyup', (event) => {
        if (event.code === 'Space') {
          spaceHeld = false;
          rememberPageScrollState();
        }
      });
      document.querySelector('.file-tree')?.addEventListener('click', (event) => {
        const fileButton = event.target.closest('[data-file-path]');
        if (!fileButton) {
          return;
        }
        savePresenterState({ fileTreeScrollTop: fileTree?.scrollTop || 0, activeRelativePath, revealActiveFile: true });
        vscode?.postMessage({ type: 'openFile', path: fileButton.dataset.filePath });
      });
    })();
  </script>
</body>
</html>`;
}

function renderProjectFileTree(projectFiles: string[], activeRelativePath: string, loading = false): string {
  if (loading && projectFiles.length === 0) {
    return '<div class="file-tree-directory">Loading project files…</div>';
  }
  if (projectFiles.length === 0) {
    return '<div class="file-tree-directory">No workspace files</div>';
  }

  const sortedFiles = [...projectFiles].sort(compareProjectFilePaths);
  const windowed = windowProjectFiles(sortedFiles, activeRelativePath);
  const rendered: string[] = [];
  if (windowed.wasWindowed) {
    rendered.push(`<div class="file-tree-directory">Showing ${windowed.files.length} of ${sortedFiles.length} files around active file</div>`);
    if (windowed.startIndex > 0) {
      rendered.push(`<div class="file-tree-directory">… ${windowed.startIndex} earlier files hidden</div>`);
    }
  }

  const seenDirectories = new Set<string>();
  for (const filePath of windowed.files) {
    const parts = filePath.split('/').filter(Boolean);
    const filename = parts.at(-1) ?? filePath;
    parts.slice(0, -1).forEach((directory, index) => {
      const directoryPath = parts.slice(0, index + 1).join('/');
      if (seenDirectories.has(directoryPath)) {
        return;
      }
      seenDirectories.add(directoryPath);
      const depth = index;
      rendered.push(`<div class="file-tree-directory" style="padding-left: ${depth * 16}px">${escapeHtml(directory)}</div>`);
    });

    const escapedPath = escapeHtml(filePath);
    const escapedFilename = escapeHtml(filename);
    const current = filePath === activeRelativePath ? ' aria-current="true"' : '';
    const depth = Math.max(0, parts.length - 1);
    rendered.push(`<button type="button" class="file-tree-file" data-file-path="${escapedPath}" style="padding-left: ${depth * 16 + 6}px"${current}>${escapedFilename}</button>`);
  }

  if (windowed.wasWindowed && windowed.endIndex < sortedFiles.length) {
    rendered.push(`<div class="file-tree-directory">… ${sortedFiles.length - windowed.endIndex} later files hidden</div>`);
  }

  return rendered.join('');
}

function windowProjectFiles(projectFiles: string[], activeRelativePath: string): { files: string[]; startIndex: number; endIndex: number; wasWindowed: boolean } {
  if (projectFiles.length <= MAX_RENDERED_TREE_FILES) {
    return { files: projectFiles, startIndex: 0, endIndex: projectFiles.length, wasWindowed: false };
  }

  const activeIndex = projectFiles.indexOf(activeRelativePath);
  const centerIndex = activeIndex >= 0 ? activeIndex : 0;
  const halfWindow = Math.min(TREE_ACTIVE_CONTEXT_FILES, Math.floor(MAX_RENDERED_TREE_FILES / 2));
  const maxStart = Math.max(0, projectFiles.length - MAX_RENDERED_TREE_FILES);
  const startIndex = Math.max(0, Math.min(maxStart, centerIndex - halfWindow));
  const endIndex = Math.min(projectFiles.length, startIndex + MAX_RENDERED_TREE_FILES);
  return {
    files: projectFiles.slice(startIndex, endIndex),
    startIndex,
    endIndex,
    wasWindowed: true,
  };
}

export function selectRenderedLineWindow(
  lines: CodePresenterLine[],
  startIndex: number,
  visibleRowCount: number,
  wrapColumn = DEFAULT_WRAP_COLUMN,
): RenderedLineWindow {
  const rowBudget = Math.max(1, Math.floor(visibleRowCount));
  const safeStartIndex = Math.max(0, Math.min(startIndex, lines.length));
  const selected: CodePresenterLine[] = [];
  let usedRows = 0;
  let index = safeStartIndex;

  while (index < lines.length) {
    const candidate = lines[index];
    const candidateRows = renderRows([candidate], wrapColumn).length;
    if (candidateRows > rowBudget && selected.length === 0) {
      index += 1;
      continue;
    }
    if (usedRows + candidateRows > rowBudget) {
      break;
    }
    selected.push(candidate);
    usedRows += candidateRows;
    index += 1;
  }

  const firstLine = selected[0]?.number ?? 0;
  const lastLine = selected.at(-1)?.number ?? 0;
  return {
    firstLine,
    lastLine,
    nextTopLine: index,
    lines: selected,
  };
}

export function renderRows(lines: CodePresenterLine[], wrapColumn = DEFAULT_WRAP_COLUMN): RenderedCodeRow[] {
  const column = Math.max(20, Math.floor(wrapColumn));
  return lines.flatMap((line) => wrapLine(line, column));
}

function wrapLine(line: CodePresenterLine, wrapColumn: number): RenderedCodeRow[] {
  if (line.text.trim().length === 0) {
    return [{ wrapPrefix: BLANK_PREFIX, text: '' }];
  }

  const indentation = leadingVisibleSpaceCount(line.text);
  const firstPrefix = `${SPACE_PREFIX}${indentation}>`;
  const visibleText = line.text;

  if (visibleText.length <= wrapColumn) {
    return [{ wrapPrefix: firstPrefix, text: visibleText }];
  }

  const rows: RenderedCodeRow[] = [];
  let start = 0;
  while (start < visibleText.length) {
    const remaining = visibleText.length - start;
    if (remaining <= wrapColumn) {
      rows.push({
        wrapPrefix: start === 0 ? firstPrefix : WRAP_PREFIX,
        text: visibleText.slice(start),
      });
      break;
    }

    const breakAt = findWrapBreak(visibleText, start, wrapColumn);
    rows.push({
      wrapPrefix: start === 0 ? firstPrefix : WRAP_PREFIX,
      text: visibleText.slice(start, breakAt),
    });
    start = breakAt;
  }
  return rows;
}

function leadingVisibleSpaceCount(text: string): number {
  let count = 0;
  for (const character of text) {
    if (character === ' ') {
      count += 1;
      continue;
    }
    if (character === '\t') {
      count += TAB_VISIBLE_WIDTH;
      continue;
    }
    break;
  }
  return count;
}

function findWrapBreak(text: string, start: number, wrapColumn: number): number {
  const hardBreak = Math.min(text.length, start + wrapColumn);
  const minimumUsefulBreak = start + Math.floor(wrapColumn * 0.65);

  for (let index = hardBreak; index > minimumUsefulBreak; index -= 1) {
    if (/\s/.test(text[index - 1] ?? '')) {
      const breakBeforeWhitespace = index - 1;
      if (breakBeforeWhitespace > start) {
        return breakBeforeWhitespace;
      }
    }
  }

  return hardBreak;
}
