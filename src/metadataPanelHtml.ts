export interface MetadataPanelHtmlInput {
  metadataImageDataUrl: string;
  payload: string;
  label: string;
  showDetails?: boolean;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function renderMetadataPanelHtml(input: MetadataPanelHtmlInput): string {
  const metadataImageDataUrl = escapeHtml(input.metadataImageDataUrl);
  const payload = escapeHtml(input.payload);
  const label = escapeHtml(input.label);
  const details = input.showDetails
    ? `
    <h1>Code Focus Metadata</h1>
    <div class="label">${label}</div>
    <code>${payload}</code>
    <div class="hint">Keep this panel visible.</div>`
    : '';

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Code Focus Metadata</title>
  <style>
    :root {
      color-scheme: light;
      --bg: #ffffff;
      --fg: #111827;
      --muted: #4b5563;
      --border: #d1d5db;
    }

    * { box-sizing: border-box; }

    body {
      margin: 0;
      min-height: 100vh;
      display: grid;
      place-items: center;
      background: var(--bg);
      color: var(--fg);
      font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }

    main {
      width: min(96vw, 560px);
      padding: 8px;
      background: #fff;
      text-align: center;
    }

    h1 {
      margin: 0 0 12px;
      font-size: 18px;
      line-height: 1.2;
    }

    img {
      width: min(90vw, 520px);
      height: min(90vw, 520px);
      image-rendering: pixelated;
      background: white;
      border: 12px solid white;
    }

    .label {
      margin-top: 10px;
      font-size: 16px;
      font-weight: 700;
      word-break: break-word;
    }

    code {
      display: block;
      margin-top: 10px;
      padding: 10px;
      border-radius: 8px;
      background: #f3f4f6;
      color: #111827;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
      font-size: 13px;
      line-height: 1.35;
      white-space: pre-wrap;
      word-break: break-all;
      text-align: left;
    }

    .hint {
      margin-top: 8px;
      color: var(--muted);
      font-size: 12px;
    }
  </style>
</head>
<body>
  <main>
    <img alt="Machine-readable metadata" src="${metadataImageDataUrl}">
    ${details}
  </main>
</body>
</html>`;
}
