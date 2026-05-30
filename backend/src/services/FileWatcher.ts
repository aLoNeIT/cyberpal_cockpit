import chokidar, { FSWatcher } from 'chokidar';

export class FileWatcher {
  private watchers: Map<string, FSWatcher> = new Map();

  public onChange: ((workspaceId: string, filePath: string, event: 'add' | 'change' | 'unlink') => void) | null = null;

  watch(workspaceId: string, dirPath: string): void {
    if (this.watchers.has(workspaceId)) {
      this.unwatch(workspaceId);
    }

    const watcher = chokidar.watch(dirPath, {
      ignored: [
        /(^|[\/\\])\../,        // 忽略隐藏文件
        /node_modules/,
        /\.git/,
        /__pycache__/,
        /\.DS_Store/,
      ],
      persistent: true,
      ignoreInitial: true,
      depth: 10,
    });

    watcher.on('add', (filePath: string) => {
      this.onChange?.(workspaceId, filePath, 'add');
    });

    watcher.on('change', (filePath: string) => {
      this.onChange?.(workspaceId, filePath, 'change');
    });

    watcher.on('unlink', (filePath: string) => {
      this.onChange?.(workspaceId, filePath, 'unlink');
    });

    watcher.on('error', (err: Error) => {
      console.error(`[FileWatcher] Error watching ${dirPath}:`, err.message);
    });

    this.watchers.set(workspaceId, watcher);
  }

  unwatch(workspaceId: string): void {
    const watcher = this.watchers.get(workspaceId);
    if (watcher) {
      watcher.close();
      this.watchers.delete(workspaceId);
    }
  }

  isWatching(workspaceId: string): boolean {
    return this.watchers.has(workspaceId);
  }
}
