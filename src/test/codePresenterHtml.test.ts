import * as assert from 'node:assert/strict';
import { test } from 'node:test';

import { renderCodePresenterHtml, renderRows, selectRenderedLineWindow } from '../codePresenterHtml';

test('renders code in a controlled webview presenter with full path and line range header', () => {
  const html = renderCodePresenterHtml({
    fullPath: '/home/grog/projects/demo/src/index.ts',
    activeRelativePath: 'src/index.ts',
    firstLine: 1,
    lastLine: 2,
    lines: [
      { number: 1, text: 'const answer = 42;' },
      { number: 2, text: 'if (answer !== 0) console.log(answer);' },
    ],
  });

  assert.match(html, /Code Focus Presenter/);
  assert.match(html, /Source file and visible line range/);
  assert.match(html, /\/home\/grog\/projects\/demo<\/span>/);
  assert.match(html, /<div class="metadata-path">src\/index\.ts<\/div>/);
  assert.match(html, /shown lines: 1-2/);
  assert.match(html, /Rendered source code viewport/);
  assert.match(html, /const answer = 42;/);
  assert.match(html, /if \(answer !== 0\) console\.log\(answer\);/);
  assert.match(html, /font-variant-ligatures: none/);
  assert.match(html, /--readable-code-font: "IBM Plex Mono", "DejaVu Sans Mono", "JetBrains Mono"/);
  assert.match(html, /font-family: var\(--readable-code-font\)/);
  assert.match(html, /font-size: clamp\(22px/);
  assert.match(html, /grid-template-rows: 172px 1fr/);
  assert.match(html, /grid-template-rows: 36px 24px 24px 24px 28px/);
  assert.match(html, /align-content: start/);
  assert.match(html, /grid-row: 2 \/ span 3/);
  assert.match(html, /-webkit-line-clamp: 3/);
  assert.doesNotMatch(html, /line-number/);
  assert.doesNotMatch(html, />1<\/span>/);
  assert.doesNotMatch(html, />2<\/span>/);
  assert.doesNotMatch(html, /<img/);
  assert.doesNotMatch(html, /Machine-readable metadata/);
});

test('escapes rendered code without adding hidden debug metadata', () => {
  const html = renderCodePresenterHtml({
    fullPath: '/tmp/src/index.ts',
    firstLine: 1,
    lastLine: 1,
    lines: [{ number: 1, text: '<script>alert("x")</script>' }],
  });

  assert.match(html, /&lt;script&gt;alert\(&quot;x&quot;\)&lt;\/script&gt;/);
  assert.doesNotMatch(html, /SR1\|src\/index\.ts\|1\|1\|abcd1234/);
});

test('does not render hidden metadata controls', () => {
  const html = renderCodePresenterHtml({
    fullPath: '/tmp/src/index.ts',
    firstLine: 1,
    lastLine: 1,
    lines: [{ number: 1, text: 'const ok = true;' }],
  });

  const removedDetailsClass = ['debug', 'details'].join('-');
  assert.doesNotMatch(html, new RegExp(removedDetailsClass));
  assert.doesNotMatch(html, /SR1\|/);
});

test('splits long visual lines with an explicit WR continuation prefix', () => {
  const rows = renderRows([{ number: 7, text: 'abcdefghijklmnopstuvwxyz' }], 20);

  assert.deepEqual(rows, [
    { wrapPrefix: 'S0>', text: 'abcdefghijklmnopstuv' },
    { wrapPrefix: 'WR>', text: 'wxyz' },
  ]);
});

test('prefers wrapping at visible token boundaries instead of splitting words', () => {
  const rows = renderRows([
    {
      number: 2,
      text: '- label: I confirm that I am using English Language Policy link',
    },
  ], 52);

  assert.deepEqual(rows, [
    { wrapPrefix: 'S0>', text: '- label: I confirm that I am using English Language' },
    { wrapPrefix: 'WR>', text: ' Policy link' },
  ]);
});

test('selects only complete source lines that fit in the rendered row budget', () => {
  const window = selectRenderedLineWindow([
    { number: 1, text: 'short one' },
    { number: 2, text: '0123456789abcdefghijWRAPS' },
    { number: 3, text: 'short three' },
  ], 0, 3, 20);

  assert.deepEqual(window, {
    firstLine: 1,
    lastLine: 2,
    nextTopLine: 2,
    lines: [
      { number: 1, text: 'short one' },
      { number: 2, text: '0123456789abcdefghijWRAPS' },
    ],
  });
});

test('does not include a source line when its WR continuations would be partially visible', () => {
  const window = selectRenderedLineWindow([
    { number: 10, text: 'short ten' },
    { number: 11, text: 'short eleven' },
    { number: 12, text: '0123456789abcdefghijWRAPS' },
  ], 0, 3, 20);

  assert.deepEqual(window, {
    firstLine: 10,
    lastLine: 11,
    nextTopLine: 2,
    lines: [
      { number: 10, text: 'short ten' },
      { number: 11, text: 'short eleven' },
    ],
  });
});

test('advances past a line that is too tall to fit a single rendered slide', () => {
  const window = selectRenderedLineWindow([
    { number: 20, text: '0123456789abcdefghij0123456789abcdefghij0123456789abcdefghij' },
    { number: 21, text: 'after huge line' },
  ], 0, 2, 20);

  assert.deepEqual(window, {
    firstLine: 21,
    lastLine: 21,
    nextTopLine: 2,
    lines: [{ number: 21, text: 'after huge line' }],
  });
});

test('renders whitespace-only source lines with explicit BR marker rows', () => {
  const rows = renderRows([
    { number: 1, text: 'const before = true;' },
    { number: 2, text: '    ' },
    { number: 3, text: '\t' },
    { number: 4, text: 'const after = true;' },
  ], 80);

  assert.deepEqual(rows, [
    { wrapPrefix: 'S0>', text: 'const before = true;' },
    { wrapPrefix: 'BR>', text: '' },
    { wrapPrefix: 'BR>', text: '' },
    { wrapPrefix: 'S0>', text: 'const after = true;' },
  ]);
});

test('renders leading indentation with explicit S space-counter prefixes', () => {
  const rows = renderRows([
    { number: 1, text: 'function demo() {' },
    { number: 2, text: '  const answer = 42;' },
    { number: 3, text: '    return answer;' },
  ], 80);

  assert.deepEqual(rows, [
    { wrapPrefix: 'S0>', text: 'function demo() {' },
    { wrapPrefix: 'S2>', text: '  const answer = 42;' },
    { wrapPrefix: 'S4>', text: '    return answer;' },
  ]);
});

test('keeps visible leading spaces after S prefixes for shell-style presenter rows', () => {
  const rows = renderRows([
    { number: 1, text: 'if (! "$?VIRTUAL_ENV_DISABLE_PROMPT") then' },
    { number: 2, text: '    set prompt = \'(.venv) \'"$prompt"' },
    { number: 3, text: '    setenv VIRTUAL_ENV_PROMPT \'(.venv) \'' },
    { number: 4, text: 'endif' },
  ], 120);

  assert.deepEqual(rows, [
    { wrapPrefix: 'S0>', text: 'if (! "$?VIRTUAL_ENV_DISABLE_PROMPT") then' },
    { wrapPrefix: 'S4>', text: '    set prompt = \'(.venv) \'"$prompt"' },
    { wrapPrefix: 'S4>', text: '    setenv VIRTUAL_ENV_PROMPT \'(.venv) \'' },
    { wrapPrefix: 'S0>', text: 'endif' },
  ]);
});

test('preserves repeated in-line spaces visually instead of relying on collapsed HTML whitespace', () => {
  const html = renderCodePresenterHtml({
    fullPath: '/home/grog/projects/demo/src/spaces.ts',
    firstLine: 1,
    lastLine: 1,
    lines: [{ number: 1, text: 'const aligned  =  value;' }],
  });

  assert.match(html, /white-space: pre/);
  assert.match(html, /const aligned  =  value;/);
});

test('renders a clickable, scrollable hierarchical project file tree with the active file highlighted', () => {
  const html = renderCodePresenterHtml({
    fullPath: '/home/grog/projects/demo/src/index.ts',
    activeRelativePath: 'src/index.ts',
    firstLine: 1,
    lastLine: 1,
    lines: [{ number: 1, text: 'export const answer = 42;' }],
    projectFiles: ['package.json', 'src/index.ts', 'src/lib/reader.ts'],
  });

  assert.match(html, /aria-label="Project file tree"/);
  assert.match(html, /overflow-y: auto/);
  assert.match(html, /data-file-path="package\.json"/);
  assert.match(html, /type="button" class="file-tree-file" data-file-path="src\/index\.ts"/);
  assert.doesNotMatch(html, /title="src\/index\.ts"/);
  assert.match(html, /<div class="file-tree-directory"[^>]*>src<\/div>/);
  assert.match(html, /<div class="file-tree-directory"[^>]*>lib<\/div>/);
  assert.match(html, /package\.json/);
  assert.match(html, /data-file-path="src\/index\.ts"[^>]*>index\.ts<\/button>/);
  assert.match(html, /data-file-path="src\/lib\/reader\.ts"[^>]*>reader\.ts<\/button>/);
  assert.match(html, /aria-current="true">index\.ts/);
});

test('reserves stable OCR header rows for the opened root and long relative file path', () => {
  const longPath = 'src/features/super-long-component-name-that-used-to-be-cropped-in-the-presenter-view.tsx';
  const html = renderCodePresenterHtml({
    fullPath: `/home/grog/projects/demo/${longPath}`,
    activeRelativePath: longPath,
    firstLine: 1,
    lastLine: 1,
    lines: [{ number: 1, text: 'export const answer = 42;' }],
    projectFiles: [longPath],
  });

  assert.match(html, /grid-template-rows: 36px 24px 24px 24px 28px/);
  assert.match(html, /align-content: start/);
  assert.match(html, /Opened folder:<\/span><span class="metadata-folder">\/home\/grog\/projects\/demo<\/span>/);
  assert.match(html, new RegExp(`<div class="metadata-path">${longPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}<\\/div>`));
  assert.doesNotMatch(html, new RegExp(`title="${longPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`));
  assert.match(html, /data-file-path="src\/features\/super-long-component-name-that-used-to-be-cropped-in-the-presenter-view\.tsx"[^>]*>super-long-component-name-that-used-to-be-cropped-in-the-presenter-view\.tsx<\/button>/);
});

test('reveals the active file when the presenter active path changes while preserving same-file refresh scroll', () => {
  const html = renderCodePresenterHtml({
    fullPath: '/home/grog/projects/demo/src/next.ts',
    activeRelativePath: 'src/next.ts',
    firstLine: 1,
    lastLine: 19,
    lines: [{ number: 1, text: 'export const next = true;' }],
    projectFiles: ['package.json', 'src/index.ts', 'src/next.ts'],
  });

  assert.match(html, /let presenterState = vscode\?\.getState\?\.\(\) \|\| \{\}/);
  assert.match(html, /const activeRelativePath = activeFileButton\?\.dataset\.filePath \|\| ''/);
  assert.match(html, /const activeFileChanged = Boolean\(activeRelativePath && presenterState\.activeRelativePath !== activeRelativePath\)/);
  assert.match(html, /!presenterState\.revealActiveFile && !activeFileChanged/);
  assert.match(html, /fileTree\.scrollTop = presenterState\.fileTreeScrollTop/);
  assert.match(html, /activeFileButton\?\.scrollIntoView/);
});

test('sorts presenter file tree deterministically before rendering', () => {
  const html = renderCodePresenterHtml({
    fullPath: '/home/grog/projects/demo/src/index.ts',
    activeRelativePath: 'src/index.ts',
    firstLine: 1,
    lastLine: 1,
    lines: [{ number: 1, text: 'export const answer = 42;' }],
    projectFiles: ['src/zeta.ts', 'README.md', 'src/App.ts', 'package.json'],
  });

  const orderedNeedles = [
    'data-file-path="package.json"',
    'data-file-path="README.md"',
    'data-file-path="src/App.ts"',
    'data-file-path="src/index.ts"',
    'data-file-path="src/zeta.ts"',
  ];
  const positions = orderedNeedles.map((needle) => html.indexOf(needle));

  assert.deepEqual(positions.map((position) => position >= 0), [true, true, true, false, true]);
  assert.ok(positions[0] < positions[1]);
  assert.ok(positions[1] < positions[2]);
  assert.ok(positions[2] < positions[4]);
});

test('locks code scrolling while allowing the file tree to scroll and Space to page or advance file', () => {
  const html = renderCodePresenterHtml({
    fullPath: '/home/grog/projects/demo/src/index.ts',
    firstLine: 1,
    lastLine: 1,
    lines: [{ number: 1, text: 'export const answer = 42;' }],
  });

  assert.match(html, /addEventListener\('wheel'/);
  assert.match(html, /event\.preventDefault\(\)/);
  assert.match(html, /event\.target\.closest\('\.file-tree'\)/);
  assert.match(html, /event\.code !== 'Space'/);
  assert.match(html, /postMessage\(\{ type: 'pageScroll', direction: event\.shiftKey \? 'up' : 'down' \}\)/);
});

test('allows held Space repeats to reach the host cooldown gate', () => {
  const html = renderCodePresenterHtml({
    fullPath: '/home/grog/projects/demo/src/index.ts',
    firstLine: 1,
    lastLine: 1,
    lines: [{ number: 1, text: 'export const answer = 42;' }],
  });

  assert.doesNotMatch(html, /PAGE_REPEAT_DELAY_MS/);
  assert.doesNotMatch(html, /lastPageScrollAt/);
  assert.doesNotMatch(html, /if \(event\.repeat\) \{/);
  assert.match(html, /event\.preventDefault\(\);[\s\S]*savePresenterState\(\{[\s\S]*revealActiveFile: true[\s\S]*vscode\?\.postMessage\(\{ type: 'pageScroll', direction: event\.shiftKey \? 'up' : 'down' \}\)/);
});

test('reports measured presenter viewport line and wrap capacity back to the extension host', () => {
  const html = renderCodePresenterHtml({
    fullPath: '/home/grog/projects/demo/src/index.ts',
    firstLine: 48,
    lastLine: 67,
    lines: [{ number: 48, text: 'export const answer = 42;' }],
  });

  assert.match(html, /reportViewportMetrics/);
  assert.match(html, /querySelector\('\.code-viewport'\)/);
  assert.match(html, /querySelector\('\.code-lines'\)/);
  assert.match(html, /querySelector\('\.code-line'\)/);
  assert.match(html, /getBoundingClientRect\(\)\.height/);
  assert.match(html, /Math\.floor\(contentHeight \/ rowHeight\)/);
  assert.match(html, /viewport\.clientHeight - verticalPadding/);
  assert.match(html, /viewport\.clientWidth - horizontalPadding - prefixWidth/);
  assert.match(html, /const measuredColumns = Math\.floor\(codeColumnWidth \/ charWidth\)/);
  assert.match(html, /const wrapColumn = Math\.max\(20, measuredColumns - 4\)/);
  assert.match(html, /postMessage\(\{ type: 'viewportMetrics', visibleLineCount, wrapColumn \}\)/);
});

test('does not render fullscreen controls in the presenter', () => {
  const html = renderCodePresenterHtml({
    fullPath: '/home/grog/projects/demo/src/index.ts',
    firstLine: 1,
    lastLine: 1,
    lines: [{ number: 1, text: 'export const answer = 42;' }],
  });

  assert.doesNotMatch(html, /fullscreen-button/);
  assert.doesNotMatch(html, /Fullscreen/);
  assert.doesNotMatch(html, /toggleFullscreen/);
});

test('file tree buttons request the extension host to open the selected workspace file', () => {
  const html = renderCodePresenterHtml({
    fullPath: '/home/grog/projects/demo/src/index.ts',
    activeRelativePath: 'src/index.ts',
    firstLine: 1,
    lastLine: 1,
    lines: [{ number: 1, text: 'export const answer = 42;' }],
    projectFiles: ['package.json', 'src/index.ts'],
  });

  assert.match(html, /addEventListener\('click'/);
  assert.match(html, /closest\('\[data-file-path\]'\)/);
  assert.match(html, /postMessage\(\{ type: 'openFile', path: fileButton\.dataset\.filePath \}\)/);
});

test('scrolls the active file tree row into view after Space advances files', () => {
  const html = renderCodePresenterHtml({
    fullPath: '/home/grog/projects/demo/src/next.ts',
    activeRelativePath: 'src/next.ts',
    firstLine: 1,
    lastLine: 19,
    lines: [{ number: 1, text: 'export const next = true;' }],
    projectFiles: ['package.json', 'src/index.ts', 'src/next.ts'],
  });

  assert.match(html, /querySelector\('\.file-tree-file\[aria-current="true"\]'\)/);
  assert.match(html, /scrollIntoView\(\{ block: 'nearest'/);
});
