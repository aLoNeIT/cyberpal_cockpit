import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { readdirSync, statSync } from 'fs';
import { homedir } from 'os';
import type { WorkspaceService } from '../services/WorkspaceService.js';
import type { FileWatcher } from '../services/FileWatcher.js';
import type { WorkspaceRepository } from '../db/repositories/WorkspaceRepository.js';
import type { ApiResponse, WorkspaceConfig, FileTreeNode, FileContentResponse, WorkspaceCreateRequest, FsBrowseResponse, FsHomeResponse, FsDrivesResponse } from '../types/index.js';

export function createWorkspaceRoutes(
  workspaceService: WorkspaceService,
  fileWatcher: FileWatcher,
  workspaceRepo: WorkspaceRepository
): Router {
  const router = Router();

  // GET /api/workspaces — 获取工作区列表
  router.get('/workspaces', async (_req: Request, res: Response) => {
    try {
      const list: WorkspaceConfig[] = await workspaceRepo.findAll();
      const response: ApiResponse<WorkspaceConfig[]> = {
        code: 0,
        data: list,
        message: 'ok',
      };
      res.json(response);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '内部错误';
      const response: ApiResponse<null> = {
        code: -1,
        data: null,
        message,
      };
      res.status(500).json(response);
    }
  });

  // POST /api/workspaces — 添加工作区
  router.post('/workspaces', async (req: Request, res: Response) => {
    try {
      const { name, path }: WorkspaceCreateRequest = req.body;

      if (!name || !path) {
        const response: ApiResponse<null> = {
          code: -1,
          data: null,
          message: 'name 和 path 为必填项',
        };
        res.status(400).json(response);
        return;
      }

      if (!workspaceService.validatePath(path)) {
        const response: ApiResponse<null> = {
          code: -1,
          data: null,
          message: `Path does not exist or is not readable: ${path}`,
        };
        res.status(400).json(response);
        return;
      }

      // 检查是否已存在相同路径的工作区
      const existing = await workspaceRepo.findByPath(path);
      if (existing) {
        const response: ApiResponse<null> = {
          code: -1,
          data: null,
          message: `Workspace with path already exists: ${path}`,
        };
        res.status(400).json(response);
        return;
      }

      const id = uuidv4();
      const workspace: WorkspaceConfig = {
        id,
        name,
        path,
        createdAt: Date.now(),
      };

      // 持久化到数据库
      await workspaceRepo.create(workspace);

      // 启动文件监听
      fileWatcher.watch(id, path);

      const response: ApiResponse<WorkspaceConfig> = {
        code: 0,
        data: workspace,
        message: '工作区创建成功',
      };
      res.status(201).json(response);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '内部错误';
      const response: ApiResponse<null> = {
        code: -1,
        data: null,
        message,
      };
      res.status(400).json(response);
    }
  });

  // DELETE /api/workspaces/:id — 删除工作区
  router.delete('/workspaces/:id', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;

      const existing = await workspaceRepo.findById(id);
      if (!existing) {
        const response: ApiResponse<null> = {
          code: -1,
          data: null,
          message: '工作区不存在',
        };
        res.status(404).json(response);
        return;
      }

      // 停止文件监听
      fileWatcher.unwatch(id);

      // 从数据库删除
      await workspaceRepo.deleteById(id);

      const response: ApiResponse<null> = {
        code: 0,
        data: null,
        message: '工作区已删除',
      };
      res.json(response);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '内部错误';
      const response: ApiResponse<null> = {
        code: -1,
        data: null,
        message,
      };
      res.status(500).json(response);
    }
  });

  // GET /api/workspaces/:id/tree — 获取目录树
  router.get('/workspaces/:id/tree', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const subPath = req.query.path as string | undefined;

      const workspace = await workspaceRepo.findById(id);
      if (!workspace) {
        const response: ApiResponse<null> = {
          code: -1,
          data: null,
          message: '工作区不存在',
        };
        res.status(404).json(response);
        return;
      }

      const tree: FileTreeNode[] = workspaceService.getDirectoryTree(workspace.path, subPath);
      const response: ApiResponse<FileTreeNode[]> = {
        code: 0,
        data: tree,
        message: 'ok',
      };
      res.json(response);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '内部错误';
      const response: ApiResponse<null> = {
        code: -1,
        data: null,
        message,
      };
      res.status(400).json(response);
    }
  });

  // GET /api/files/content — 获取文件内容
  router.get('/files/content', (req: Request, res: Response) => {
    try {
      const filePath = req.query.path as string;

      if (!filePath) {
        const response: ApiResponse<null> = {
          code: -1,
          data: null,
          message: 'path 查询参数为必填项',
        };
        res.status(400).json(response);
        return;
      }

      const content = workspaceService.readFileContent(filePath);
      const language = workspaceService.getFileLanguage(filePath);

      const fileContent: FileContentResponse = {
        path: filePath,
        content,
        language,
      };

      const response: ApiResponse<FileContentResponse> = {
        code: 0,
        data: fileContent,
        message: 'ok',
      };
      res.json(response);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '内部错误';
      const response: ApiResponse<null> = {
        code: -1,
        data: null,
        message,
      };
      res.status(400).json(response);
    }
  });

  // ============ Feature 2: 文件系统浏览 ============

  // GET /api/fs/drives — 返回可用驱动器列表
  router.get('/fs/drives', (_req: Request, res: Response) => {
    try {
      const drives: string[] = [];
      if (process.platform === 'win32') {
        // Windows: 枚举 A-Z 驱动器
        for (let i = 65; i <= 90; i++) {
          const letter = String.fromCharCode(i);
          try {
            statSync(`${letter}:\\`);
            drives.push(`${letter}:\\`);
          } catch {
            // 驱动器不存在或不可访问
          }
        }
      } else {
        // Unix: 根目录就是 /
        drives.push('/');
      }
      const home = homedir();
      const homeDrive = process.platform === 'win32' ? home.slice(0, 2) + '\\' : '/';
      const response: ApiResponse<FsDrivesResponse> = {
        code: 0,
        data: { drives, homeDrive },
        message: 'ok',
      };
      res.json(response);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '内部错误';
      res.status(500).json({ code: -1, data: null, message });
    }
  });

  // GET /api/fs/home — 返回用户 home 目录
  router.get('/fs/home', (_req: Request, res: Response) => {
    try {
      const home = homedir();
      const response: ApiResponse<FsHomeResponse> = {
        code: 0,
        data: { path: home },
        message: 'ok',
      };
      res.json(response);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '内部错误';
      res.status(500).json({ code: -1, data: null, message });
    }
  });

  // GET /api/fs/browse — 浏览目录（仅返回子目录）
  router.get('/fs/browse', (req: Request, res: Response) => {
    try {
      const targetPath = req.query.path as string;

      if (!targetPath) {
        res.status(400).json({ code: -1, data: null, message: 'path query parameter is required' });
        return;
      }

      if (!workspaceService.validatePath(targetPath)) {
        res.status(400).json({ code: -1, data: null, message: `Path does not exist or is not readable: ${targetPath}` });
        return;
      }

      const entries = readdirSync(targetPath, { withFileTypes: true });
      const dirs = entries
        .filter((entry) => {
          if (!entry.isDirectory()) return false;
          if (entry.name.startsWith('.')) return false;
          return true;
        })
        .map((entry) => ({
          name: entry.name,
          path: `${targetPath}${targetPath.endsWith('/') || targetPath.endsWith('\\') ? '' : '/'}${entry.name}`,
          type: 'directory' as const,
        }))
        .sort((a, b) => a.name.localeCompare(b.name));

      const response: ApiResponse<FsBrowseResponse> = {
        code: 0,
        data: { path: targetPath, entries: dirs },
        message: 'ok',
      };
      res.json(response);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '内部错误';
      res.status(400).json({ code: -1, data: null, message });
    }
  });

  return router;
}
