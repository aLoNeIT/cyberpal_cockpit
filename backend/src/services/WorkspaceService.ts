import { readdirSync, readFileSync, statSync, existsSync, accessSync, constants } from 'fs';
import { join, extname, basename } from 'path';
import type { FileTreeNode } from '../types/index.js';

const LANGUAGE_MAP: Record<string, string> = {
  '.ts': 'typescript',
  '.tsx': 'typescript',
  '.js': 'javascript',
  '.jsx': 'javascript',
  '.json': 'json',
  '.md': 'markdown',
  '.html': 'html',
  '.css': 'css',
  '.scss': 'scss',
  '.py': 'python',
  '.go': 'go',
  '.rs': 'rust',
  '.java': 'java',
  '.vue': 'html',
  '.yaml': 'yaml',
  '.yml': 'yaml',
  '.xml': 'xml',
  '.sql': 'sql',
  '.sh': 'shell',
  '.bash': 'shell',
  '.env': 'plaintext',
  '.gitignore': 'plaintext',
  '.toml': 'toml',
};

export class WorkspaceService {
  getDirectoryTree(rootPath: string, subPath?: string): FileTreeNode[] {
    const targetPath = subPath ? join(rootPath, subPath) : rootPath;

    if (!this.validatePath(targetPath)) {
      throw new Error(`Invalid path: ${targetPath}`);
    }

    return this.buildTree(targetPath, rootPath);
  }

  readFileContent(filePath: string): string {
    if (!this.validatePath(filePath)) {
      throw new Error(`Invalid path: ${filePath}`);
    }

    const stat = statSync(filePath);
    if (!stat.isFile()) {
      throw new Error(`Not a file: ${filePath}`);
    }

    return readFileSync(filePath, 'utf-8');
  }

  validatePath(filePath: string): boolean {
    try {
      accessSync(filePath, constants.R_OK);
      return true;
    } catch {
      return false;
    }
  }

  getFileLanguage(filePath: string): string {
    const ext = extname(filePath).toLowerCase();
    return LANGUAGE_MAP[ext] || 'plaintext';
  }

  private buildTree(dirPath: string, rootPath: string): FileTreeNode[] {
    const entries = readdirSync(dirPath, { withFileTypes: true });

    const nodes: FileTreeNode[] = [];

    const ignoreList = new Set(['node_modules', '.git', '__pycache__', '.DS_Store', 'dist', '.next', '.nuxt']);

    for (const entry of entries) {
      if (entry.name.startsWith('.') || ignoreList.has(entry.name)) {
        continue;
      }

      const fullPath = join(dirPath, entry.name);

      if (entry.isDirectory()) {
        try {
          const children = this.buildTree(fullPath, rootPath);
          nodes.push({
            name: entry.name,
            path: fullPath,
            type: 'directory',
            children,
          });
        } catch {
          // 跳过无权限的目录
        }
      } else if (entry.isFile()) {
        nodes.push({
          name: entry.name,
          path: fullPath,
          type: 'file',
        });
      }
    }

    // 目录在前，文件在后，按名称排序
    nodes.sort((a, b) => {
      if (a.type !== b.type) {
        return a.type === 'directory' ? -1 : 1;
      }
      return a.name.localeCompare(b.name);
    });

    return nodes;
  }
}
