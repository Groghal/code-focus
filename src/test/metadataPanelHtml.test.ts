import assert from 'node:assert/strict';
import test from 'node:test';

import { renderMetadataPanelHtml } from '../metadataPanelHtml';

test('renders only the machine-readable metadata image by default', () => {
  const html = renderMetadataPanelHtml({
    metadataImageDataUrl: 'data:image/png;base64,abc',
    payload: 'SR1|src/index.ts|1|20|abcd1234',
    label: 'src/index.ts 1-20',
  });

  assert.match(html, /data:image\/png;base64,abc/);
  assert.doesNotMatch(html, /SR1\|src\/index\.ts\|1\|20\|abcd1234/);
  assert.doesNotMatch(html, /src\/index\.ts 1-20/);
  assert.doesNotMatch(html, /<h1>Code Focus Metadata<\/h1>/);
  assert.doesNotMatch(html, /Keep this panel visible\./);
});

test('can render debug details when explicitly requested', () => {
  const html = renderMetadataPanelHtml({
    metadataImageDataUrl: 'data:image/png;base64,abc',
    payload: 'SR1|src/index.ts|1|20|abcd1234',
    label: 'src/index.ts 1-20',
    showDetails: true,
  });

  assert.match(html, /data:image\/png;base64,abc/);
  assert.match(html, /SR1\|src\/index\.ts\|1\|20\|abcd1234/);
  assert.match(html, /src\/index\.ts 1-20/);
  assert.match(html, /Code Focus Metadata/);
});
