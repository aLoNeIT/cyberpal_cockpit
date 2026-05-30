import { homedir } from 'os';
import { join } from 'path';
import { existsSync, mkdirSync } from 'fs';

/**
 * 数据库存储路径辅助函数
 * 统一管理 SQLite 数据库文件和存储目录的创建
 */
function ensureDbDir(dbPath: string): void {
  const dir = join(dbPath, '..');
  // join with .. on a file path gives the parent directory
  const parts = dbPath.replace(/\\/g, '/').split('/');
  parts.pop();
  const parentDir = parts.join('/');
  if (parentDir && !existsSync(parentDir)) {
    mkdirSync(parentDir, { recursive: true });
  }
}

export { ensureDbDir };
