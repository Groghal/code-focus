import * as path from 'node:path';

export interface PathMetadata {
  version: 1;
  path: string;
  firstVisibleLine: number;
  lastVisibleLine: number;
}

export function normalizeRelativePath(filePath: string, workspaceRoot?: string): string {
  const rawRelative = workspaceRoot ? path.relative(workspaceRoot, filePath) : filePath;
  const normalized = rawRelative.replace(/\\/g, '/');
  return normalized.replace(/^\/+/, '');
}
