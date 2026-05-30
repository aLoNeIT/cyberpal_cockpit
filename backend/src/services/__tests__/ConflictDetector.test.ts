import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { ConflictDetector } from '../ConflictDetector.js';
import type { ConflictEvent } from '../../types/index.js';

describe('ConflictDetector', () => {
  let detector: ConflictDetector;

  beforeEach(() => {
    vi.useFakeTimers();
    // Set system time to a known baseline
    vi.setSystemTime(new Date('2025-01-01T12:00:00Z'));
    detector = new ConflictDetector(60000); // 60s window
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ============ recordOperation ============

  describe('recordOperation', () => {
    it('should record a file operation', () => {
      detector.recordOperation('agent-1', '/path/to/file.ts', 'modify');

      const history = detector.getConflictHistory('/path/to/file.ts');
      expect(history).toHaveLength(0); // Single operation = no conflict
    });

    it('should normalize backslash paths', () => {
      detector.recordOperation('agent-1', 'C:\\path\\to\\file.ts', 'modify');
      detector.recordOperation('agent-2', 'C:/path/to/file.ts', 'modify');

      // Same normalized path should be detected
      const history = detector.getConflictHistory('C:/path/to/file.ts');
      expect(history).toHaveLength(1);
    });

    it('should not assume same-agent operations cause conflict', () => {
      detector.recordOperation('agent-1', '/file.ts', 'modify');
      detector.recordOperation('agent-1', '/file.ts', 'modify');

      const history = detector.getConflictHistory('/file.ts');
      // Same agent shouldn't conflict with itself
      expect(history).toHaveLength(0);
    });
  });

  // ============ detectConflict ============

  describe('detectConflict', () => {
    it('should return null for single operation', () => {
      detector.recordOperation('agent-1', '/file.ts', 'modify');
      const conflict = detector.detectConflict('/file.ts', 'agent-1');
      expect(conflict).toBeNull();
    });

    it('should detect conflict between two agents on same file within window', () => {
      detector.recordOperation('agent-1', '/shared/file.ts', 'modify');

      // Advance 30 seconds (within 60s window)
      vi.advanceTimersByTime(30000);
      detector.recordOperation('agent-2', '/shared/file.ts', 'modify');

      const conflict = detector.detectConflict('/shared/file.ts', 'agent-2');
      expect(conflict).not.toBeNull();
      expect(conflict!.filePath).toBe('/shared/file.ts');
      expect(conflict!.agentA).toBe('agent-1');
      expect(conflict!.agentB).toBe('agent-2');
      expect(conflict!.operationA).toBe('modify');
      expect(conflict!.operationB).toBe('modify');
    });

    it('should not detect conflict when outside time window', () => {
      detector.recordOperation('agent-1', '/file.ts', 'modify');

      // Advance 61 seconds (outside 60s window)
      vi.advanceTimersByTime(61000);
      detector.recordOperation('agent-2', '/file.ts', 'modify');

      const conflict = detector.detectConflict('/file.ts', 'agent-2');
      expect(conflict).toBeNull();
    });

    it('should fire onConflict callback when conflict detected', () => {
      const onConflict = vi.fn();
      detector.onConflict = onConflict;

      detector.recordOperation('agent-1', '/file.ts', 'create');
      vi.advanceTimersByTime(10000);
      detector.recordOperation('agent-2', '/file.ts', 'delete');

      expect(onConflict).toHaveBeenCalledTimes(1);
      const event: ConflictEvent = onConflict.mock.calls[0][0];
      expect(event.agentA).toBe('agent-1');
      expect(event.agentB).toBe('agent-2');
      expect(event.filePath).toBe('/file.ts');
    });

    it('should handle create vs modify conflict', () => {
      detector.recordOperation('agent-1', '/new-file.ts', 'create');
      vi.advanceTimersByTime(5000);
      detector.recordOperation('agent-2', '/new-file.ts', 'modify');

      const conflict = detector.detectConflict('/new-file.ts', 'agent-2');
      expect(conflict).not.toBeNull();
      expect(conflict!.operationA).toBe('create');
      expect(conflict!.operationB).toBe('modify');
    });

    it('should handle delete vs modify conflict', () => {
      detector.recordOperation('agent-1', '/file.ts', 'delete');
      vi.advanceTimersByTime(1000);
      detector.recordOperation('agent-2', '/file.ts', 'modify');

      const conflict = detector.detectConflict('/file.ts', 'agent-2');
      expect(conflict).not.toBeNull();
      expect(conflict!.operationA).toBe('delete');
      expect(conflict!.operationB).toBe('modify');
    });

    it('should return null for non-existent file path', () => {
      const conflict = detector.detectConflict('/nonexistent.ts', 'agent-1');
      expect(conflict).toBeNull();
    });

    it('should respect custom window size', () => {
      const shortDetector = new ConflictDetector(5000); // 5 second window
      shortDetector.recordOperation('agent-1', '/file.ts', 'modify');

      // 6 seconds later — outside window
      vi.advanceTimersByTime(6000);
      shortDetector.recordOperation('agent-2', '/file.ts', 'modify');

      const conflict = shortDetector.detectConflict('/file.ts', 'agent-2');
      expect(conflict).toBeNull();

      // But within default 60s it might be detected
      const conflict60 = detector.detectConflict('/some-other-file.ts', 'agent-3');
      expect(conflict60).toBeNull(); // No operations for this file in detector
    });
  });

  // ============ cleanupAgent ============

  describe('cleanupAgent', () => {
    it('should remove all operations for an agent', () => {
      detector.recordOperation('agent-1', '/file-a.ts', 'modify');
      detector.recordOperation('agent-1', '/file-b.ts', 'create');
      detector.recordOperation('agent-2', '/file-a.ts', 'modify');

      const historyBefore = detector.getConflictHistory('/file-a.ts');
      expect(historyBefore).toHaveLength(1); // agent-1 vs agent-2

      detector.cleanupAgent('agent-1');

      // agent-1's operations on /file-a and /file-b should be removed
      // /file-b should be completely deleted (no more ops)
      const historyB = detector.getConflictHistory('/file-b.ts');
      expect(historyB).toHaveLength(0);

      // /file-a only has agent-2's operation now (single op, no conflict)
      const historyA = detector.getConflictHistory('/file-a.ts');
      expect(historyA).toHaveLength(0); // Single operation after cleanup
    });

    it('should handle cleanup of non-existent agent gracefully', () => {
      expect(() => detector.cleanupAgent('nonexistent')).not.toThrow();
    });
  });

  // ============ getConflictHistory ============

  describe('getConflictHistory', () => {
    it('should return empty array for path with no operations', () => {
      expect(detector.getConflictHistory('/unknown.ts')).toEqual([]);
    });

    it('should return all conflicts for a file within window', () => {
      detector.recordOperation('agent-1', '/file.ts', 'modify');
      vi.advanceTimersByTime(10000);
      detector.recordOperation('agent-2', '/file.ts', 'modify');
      vi.advanceTimersByTime(10000);
      detector.recordOperation('agent-3', '/file.ts', 'create');

      const history = detector.getConflictHistory('/file.ts');
      // Conflicts: (1,2), (1,3), (2,3) — all within 60s window
      expect(history.length).toBeGreaterThanOrEqual(2);
    });

    it('should respect limit parameter', () => {
      // Create many conflicts
      for (let i = 0; i < 20; i++) {
        detector.recordOperation(`agent-${i}`, '/busy.ts', 'modify');
        vi.advanceTimersByTime(100);
      }

      const history = detector.getConflictHistory('/busy.ts', 5);
      expect(history.length).toBeLessThanOrEqual(5);
    });

    it('should return empty array for unknown file', () => {
      expect(detector.getConflictHistory('/nothing-here.txt')).toEqual([]);
    });
  });

  // ============ pruneExpired (via time) ============

  describe('prune expired operations', () => {
    it('should prune operations outside the time window', () => {
      detector.recordOperation('agent-1', '/old.ts', 'modify');

      // Advance past the window
      vi.advanceTimersByTime(120000);

      // The old operation should have been pruned
      // New operation should not conflict with pruned one
      detector.recordOperation('agent-2', '/old.ts', 'modify');

      const history = detector.getConflictHistory('/old.ts');
      // agent-1's op was pruned, so no conflict
      expect(history).toHaveLength(0);
    });

    it('should keep operations within window', () => {
      detector.recordOperation('agent-1', '/recent.ts', 'modify');
      vi.advanceTimersByTime(30000);
      detector.recordOperation('agent-2', '/recent.ts', 'modify');

      // 30s is within 60s window
      const history = detector.getConflictHistory('/recent.ts');
      expect(history.length).toBeGreaterThanOrEqual(1);
    });
  });
});
