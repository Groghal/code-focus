import ignore = require('ignore');

const DEFAULT_IGNORED_PATTERNS = [
  '.git/',
  'node_modules/',
  '.venv/',
  'venv/',
  'dist/',
  'out/',
  'coverage/',
  '.next/',
];

export function compareProjectFilePaths(left: string, right: string): number {
  const leftParts = left.replace(/\\/g, '/').split('/').filter(Boolean);
  const rightParts = right.replace(/\\/g, '/').split('/').filter(Boolean);
  const partCount = Math.min(leftParts.length, rightParts.length);

  for (let index = 0; index < partCount; index += 1) {
    const leftPart = leftParts[index];
    const rightPart = rightParts[index];
    const caseInsensitive = leftPart.toLocaleLowerCase('en-US').localeCompare(rightPart.toLocaleLowerCase('en-US'), 'en-US');
    if (caseInsensitive !== 0) {
      return caseInsensitive;
    }
    const exact = leftPart.localeCompare(rightPart, 'en-US');
    if (exact !== 0) {
      return exact;
    }
  }

  return leftParts.length - rightParts.length;
}

export function filterProjectFilesByGitignore(projectFiles: string[], gitignoreText = ''): string[] {
  const matcher = ignore()
    .add(DEFAULT_IGNORED_PATTERNS)
    .add(gitignoreText);

  return projectFiles
    .map((filePath) => filePath.replace(/\\/g, '/'))
    .filter((filePath) => filePath.length > 0 && !filePath.startsWith('../') && !matcher.ignores(filePath))
    .sort(compareProjectFilePaths);
}

export function getNextProjectFile(projectFiles: string[], activeRelativePath: string | undefined): string | undefined {
  if (projectFiles.length === 0) {
    return undefined;
  }
  if (!activeRelativePath) {
    return projectFiles[0];
  }

  const activeIndex = projectFiles.indexOf(activeRelativePath);
  if (activeIndex < 0) {
    return undefined;
  }

  return projectFiles[activeIndex + 1];
}
