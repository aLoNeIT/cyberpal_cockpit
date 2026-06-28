import { Router } from 'express';
import { existsSync, readdirSync, statSync } from 'fs';
import { dirname, resolve } from 'path';
import type { ApiResponse, TerminalFileEntry, TerminalListResponse } from '../types/index.js';

const PRELOAD_CHILD_LIMIT = 50;

function createError(message: string): ApiResponse<null> {
  return {
    code: -1,
    data: null,
    message,
  };
}

function createEntry(dirPath: string, name: string, includeChildren: boolean): TerminalFileEntry {
  const entryPath = resolve(dirPath, name);
  const stat = statSync(entryPath);
  const type: TerminalFileEntry['type'] = stat.isDirectory() ? 'directory' : 'file';
  const entry: TerminalFileEntry = {
    name,
    path: entryPath,
    type,
    size: stat.isDirectory() ? 0 : stat.size,
    modifiedAt: stat.mtimeMs,
  };

  if (type !== 'directory') {
    return entry;
  }

  const childNames = readdirSync(entryPath);
  entry.hasChildren = childNames.length > 0;

  if (includeChildren && childNames.length <= PRELOAD_CHILD_LIMIT) {
    entry.children = readEntries(entryPath, false);
  }

  return entry;
}

function readEntries(dirPath: string, includeChildren: boolean): TerminalFileEntry[] {
  const resolvedPath = resolve(dirPath);
  return readdirSync(resolvedPath, { withFileTypes: true })
    .map((dirent) => createEntry(resolvedPath, dirent.name, includeChildren))
    .sort((a, b) => {
      if (a.type !== b.type) {
        return a.type === 'directory' ? -1 : 1;
      }
      return a.name.localeCompare(b.name);
    });
}

function listDirectory(dirPath: string): TerminalListResponse {
  const resolvedPath = resolve(dirPath);
  const rootStat = statSync(resolvedPath);

  if (!rootStat.isDirectory()) {
    throw new Error('path must be a readable directory');
  }

  const entries = readEntries(resolvedPath, true);

  const parentPath = dirname(resolvedPath);

  return {
    path: resolvedPath,
    parentPath: parentPath === resolvedPath ? null : parentPath,
    entries,
  };
}

export function createDemoTerminalRoutes(): Router {
  const router = Router();

  router.get('/demo-terminal/list', (req, res) => {
    const dirPath = typeof req.query.path === 'string' ? req.query.path : '';

    if (!dirPath) {
      return res.status(400).json(createError('path 查询参数为必填项'));
    }

    try {
      if (!existsSync(dirPath)) {
        return res.status(400).json(createError('path 不存在或不可读'));
      }

      const data = listDirectory(dirPath);
      return res.json({
        code: 0,
        data,
        message: 'ok',
      } satisfies ApiResponse<TerminalListResponse>);
    } catch (err) {
      return res.status(400).json(createError(err instanceof Error ? err.message : 'path 不存在或不可读'));
    }
  });

  return router;
}
