#!/usr/bin/env node
const { existsSync, rmSync } = require('node:fs');
const { resolve } = require('node:path');

const WINDOWS_TRANSIENT_CODES = new Set(['EPERM', 'EACCES', 'EBUSY', 'ENOTEMPTY']);

function isWindowsTransientCleanupError(error) {
  return Boolean(error && WINDOWS_TRANSIENT_CODES.has(error.code));
}

function cleanDist({ cwd = process.cwd(), logger = console } = {}) {
  const distPath = resolve(cwd, 'dist');

  if (!existsSync(distPath)) {
    return { cleaned: false, skipped: true, path: distPath };
  }

  try {
    rmSync(distPath, {
      recursive: true,
      force: true,
      maxRetries: 5,
      retryDelay: 200,
    });
    return { cleaned: true, skipped: false, path: distPath };
  } catch (error) {
    if (isWindowsTransientCleanupError(error)) {
      logger.warn(
        `[code-focus] cleanup warning: could not remove ${distPath} (${error.code}). ` +
          'Continuing so the build can overwrite generated files; close VS Code/Explorer panes if the next step still fails.',
      );
      return { cleaned: false, skipped: true, path: distPath, warning: error.code };
    }

    throw error;
  }
}

if (require.main === module) {
  try {
    cleanDist();
  } catch (error) {
    console.error(error && error.stack ? error.stack : error);
    process.exit(1);
  }
}

module.exports = {
  cleanDist,
  isWindowsTransientCleanupError,
};
