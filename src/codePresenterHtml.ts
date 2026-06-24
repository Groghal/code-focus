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
  wrapColumn?: number;
}

const DEFAULT_WRAP_COLUMN = 100;
const WRAP_PREFIX = 'WR>';
const BLANK_PREFIX = 'BR>';
const SPACE_PREFIX = 'S';
const TAB_VISIBLE_WIDTH = 2;
const WRAP_EDGE_GUARD_COLUMNS = 4;

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function renderCodePresenterHtml(input: CodePresenterHtmlInput): string {
  const fullPath = escapeHtml(input.fullPath);
  const activeRelativePath = input.activeRelativePath ?? '';
  const lineRange = `${input.firstLine}-${input.lastLine}`;
  const rows = renderRows(input.lines, input.wrapColumn ?? DEFAULT_WRAP_COLUMN);
  const fileTree = renderProjectFileTree(input.projectFiles ?? [], activeRelativePath);
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
      grid-template-rows: minmax(104px, 12vh) 1fr;
      grid-template-columns: minmax(260px, 18vw) 1fr;
      background: var(--page-bg);
    }

    .metadata-strip {
      display: block;
      grid-column: 1 / -1;
      padding: 16px 28px;
      background: var(--metadata-bg);
      border-bottom: 4px solid var(--border);
      color: var(--metadata-fg);
    }

    .metadata-path {
      font: 700 clamp(22px, 2.2vw, 40px)/1.15 var(--readable-code-font);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .metadata-lines {
      margin-top: 8px;
      color: var(--muted);
      font: 700 clamp(16px, 1.35vw, 26px)/1.2 var(--readable-code-font);
    }


    .file-tree {
      overflow-y: auto;
      overflow-x: hidden;
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
      overflow: hidden;
      color: #334155;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .file-tree-directory {
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
        <div class="metadata-path">${fullPath}</div>
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
      requestAnimationFrame(() => {
        document.querySelector('.file-tree-file[aria-current="true"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      });
      window.addEventListener('keydown', (event) => {
        if (event.code !== 'Space') {
          return;
        }
        event.preventDefault();
        vscode?.postMessage({ type: 'pageScroll', direction: event.shiftKey ? 'up' : 'down' });
      });
      document.querySelector('.file-tree')?.addEventListener('click', (event) => {
        const fileButton = event.target.closest('[data-file-path]');
        if (!fileButton) {
          return;
        }
        vscode?.postMessage({ type: 'openFile', path: fileButton.dataset.filePath });
      });
    })();
  </script>
</body>
</html>`;
}

function renderProjectFileTree(projectFiles: string[], activeRelativePath: string): string {
  if (projectFiles.length === 0) {
    return '<div class="file-tree-directory">No workspace files</div>';
  }

  const rendered: string[] = [];
  const seenDirectories = new Set<string>();
  for (const filePath of [...projectFiles].sort(compareProjectFilePaths)) {
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

  return rendered.join('');
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
