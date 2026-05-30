import type { FileOperation, ConflictEvent } from '../types/index.js';
import { CONFIG } from '../config.js';

/**
 * 文件冲突检测服务
 * 维护文件操作记录，在指定时间窗口内检测多 Agent 对同一文件的操作冲突
 */
export class ConflictDetector {
  private fileOperations: Map<string, FileOperation[]> = new Map();
  private windowMs: number;

  public onConflict: ((event: ConflictEvent) => void) | null = null;

  constructor(windowMs: number = CONFIG.conflictWindowMs) {
    this.windowMs = windowMs;
  }

  /**
   * 记录某个 agent 的文件操作
   */
  recordOperation(agentId: string, filePath: string, operation: 'create' | 'modify' | 'delete'): void {
    const normalizedPath = filePath.replace(/\\/g, '/');
    const op: FileOperation = {
      agentId,
      filePath: normalizedPath,
      operation,
      timestamp: Date.now(),
    };

    if (!this.fileOperations.has(normalizedPath)) {
      this.fileOperations.set(normalizedPath, []);
    }

    const ops = this.fileOperations.get(normalizedPath)!;
    ops.push(op);

    // 清理过期记录
    this.pruneExpired(normalizedPath);

    // 检测冲突
    const conflict = this.detectConflict(normalizedPath, agentId);
    if (conflict) {
      this.onConflict?.(conflict);
    }
  }

  /**
   * 检测指定文件的冲突
   */
  detectConflict(filePath: string, agentId: string): ConflictEvent | null {
    const normalizedPath = filePath.replace(/\\/g, '/');
    const ops = this.fileOperations.get(normalizedPath);
    if (!ops || ops.length < 2) return null;

    const now = Date.now();

    // 在时间窗口内查找不同 agent 的操作
    for (let i = ops.length - 1; i >= 0; i--) {
      const opB = ops[i];
      if (opB.agentId !== agentId) continue; // 只检查当前 agent 发起的操作
      if (now - opB.timestamp > this.windowMs) continue;

      for (let j = i - 1; j >= 0; j--) {
        const opA = ops[j];
        if (opA.agentId === agentId) continue; // 跳过同一 agent
        if (opB.timestamp - opA.timestamp > this.windowMs) break; // 超出窗口

        return {
          filePath: normalizedPath,
          agentA: opA.agentId,
          agentB: opB.agentId,
          operationA: opA.operation,
          operationB: opB.operation,
          detectedAt: now,
        };
      }
    }

    return null;
  }

  /**
   * 清理 agent 的所有操作记录（agent 退出时调用）
   */
  cleanupAgent(agentId: string): void {
    for (const [path, ops] of this.fileOperations) {
      const filtered = ops.filter((op) => op.agentId !== agentId);
      if (filtered.length === 0) {
        this.fileOperations.delete(path);
      } else {
        this.fileOperations.set(path, filtered);
      }
    }
  }

  /**
   * 获取某文件的冲突历史
   */
  getConflictHistory(filePath: string, limit: number = 10): ConflictEvent[] {
    const normalizedPath = filePath.replace(/\\/g, '/');
    const ops = this.fileOperations.get(normalizedPath) || [];
    const conflicts: ConflictEvent[] = [];

    for (let i = 0; i < ops.length; i++) {
      for (let j = i + 1; j < ops.length; j++) {
        if (ops[i].agentId === ops[j].agentId) continue;
        if (ops[j].timestamp - ops[i].timestamp <= this.windowMs) {
          conflicts.push({
            filePath: normalizedPath,
            agentA: ops[i].agentId,
            agentB: ops[j].agentId,
            operationA: ops[i].operation,
            operationB: ops[j].operation,
            detectedAt: ops[j].timestamp,
          });
        }
      }
    }

    return conflicts.slice(-limit);
  }

  /**
   * 清理指定文件的过期操作记录
   */
  private pruneExpired(filePath: string): void {
    const ops = this.fileOperations.get(filePath);
    if (!ops) return;

    const cutoff = Date.now() - this.windowMs;
    const valid = ops.filter((op) => op.timestamp > cutoff);

    if (valid.length === 0) {
      this.fileOperations.delete(filePath);
    } else {
      this.fileOperations.set(filePath, valid);
    }
  }
}
