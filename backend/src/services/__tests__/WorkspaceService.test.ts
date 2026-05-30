import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { WorkspaceService } from '../WorkspaceService.js';
import type { FileTreeNode } from '../../types/index.js';

describe('WorkspaceService', () => {
  let service: WorkspaceService;
  let tempDir: string;

  beforeEach(() => {
    service = new WorkspaceService();
    // Create a unique temp directory for each test
    tempDir = join(tmpdir(), `cpc-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(tempDir, { recursive: true });
  });

  afterEach(() => {
    // Clean up temp directory
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  // ============ validatePath ============

  describe('validatePath', () => {
    it('should return true for existing readable path', () => {
      expect(service.validatePath(tempDir)).toBe(true);
    });

    it('should return false for non-existent path', () => {
      expect(service.validatePath('/definitely/not/a/real/path/xyz')).toBe(false);
    });

    it('should return true for an existing file', () => {
      const filePath = join(tempDir, 'test.txt');
      writeFileSync(filePath, 'hello');
      expect(service.validatePath(filePath)).toBe(true);
    });
  });

  // ============ getFileLanguage ============

  describe('getFileLanguage', () => {
    it('should return typescript for .ts files', () => {
      expect(service.getFileLanguage('/path/to/file.ts')).toBe('typescript');
    });

    it('should return typescript for .tsx files', () => {
      expect(service.getFileLanguage('/path/to/Component.tsx')).toBe('typescript');
    });

    it('should return javascript for .js files', () => {
      expect(service.getFileLanguage('/path/to/file.js')).toBe('javascript');
    });

    it('should return json for .json files', () => {
      expect(service.getFileLanguage('/path/to/config.json')).toBe('json');
    });

    it('should return markdown for .md files', () => {
      expect(service.getFileLanguage('/path/to/readme.md')).toBe('markdown');
    });

    it('should return python for .py files', () => {
      expect(service.getFileLanguage('/path/to/script.py')).toBe('python');
    });

    it('should return html for .vue files', () => {
      expect(service.getFileLanguage('/path/to/App.vue')).toBe('html');
    });

    it('should return shell for .sh files', () => {
      expect(service.getFileLanguage('/path/to/script.sh')).toBe('shell');
    });

    it('should be case insensitive', () => {
      expect(service.getFileLanguage('/path/to/FILE.TS')).toBe('typescript');
      expect(service.getFileLanguage('/path/to/FILE.PY')).toBe('python');
    });

    it('should return plaintext for unknown extensions', () => {
      expect(service.getFileLanguage('/path/to/file.unknown')).toBe('plaintext');
    });

    it('should return plaintext for files with no extension', () => {
      expect(service.getFileLanguage('/path/to/Makefile')).toBe('plaintext');
    });
  });

  // ============ readFileContent ============

  describe('readFileContent', () => {
    it('should read file content correctly', () => {
      const filePath = join(tempDir, 'hello.txt');
      writeFileSync(filePath, 'Hello, World!');

      const content = service.readFileContent(filePath);
      expect(content).toBe('Hello, World!');
    });

    it('should read UTF-8 content with special characters', () => {
      const filePath = join(tempDir, 'unicode.txt');
      writeFileSync(filePath, '你好世界 🌍');

      const content = service.readFileContent(filePath);
      expect(content).toBe('你好世界 🌍');
    });

    it('should throw for invalid path', () => {
      expect(() => service.readFileContent('/nonexistent/file.txt')).toThrow(
        'Invalid path',
      );
    });

    it('should throw when path is a directory, not a file', () => {
      expect(() => service.readFileContent(tempDir)).toThrow('Not a file');
    });
  });

  // ============ getDirectoryTree ============

  describe('getDirectoryTree', () => {
    it('should return empty array for empty directory', () => {
      const tree = service.getDirectoryTree(tempDir);
      expect(tree).toEqual([]);
    });

    it('should list files in a directory', () => {
      writeFileSync(join(tempDir, 'a.txt'), 'a');
      writeFileSync(join(tempDir, 'b.txt'), 'b');

      const tree = service.getDirectoryTree(tempDir);
      expect(tree).toHaveLength(2);
      expect(tree[0].name).toBe('a.txt');
      expect(tree[0].type).toBe('file');
      expect(tree[1].name).toBe('b.txt');
      expect(tree[1].type).toBe('file');
    });

    it('should list directories before files (sorted)', () => {
      mkdirSync(join(tempDir, 'src'));
      writeFileSync(join(tempDir, 'readme.md'), '# README');

      const tree = service.getDirectoryTree(tempDir);
      expect(tree).toHaveLength(2);
      expect(tree[0].type).toBe('directory');
      expect(tree[0].name).toBe('src');
      expect(tree[1].type).toBe('file');
      expect(tree[1].name).toBe('readme.md');
    });

    it('should recursively build tree with children', () => {
      mkdirSync(join(tempDir, 'src'));
      writeFileSync(join(tempDir, 'src', 'index.ts'), 'export {}');
      writeFileSync(join(tempDir, 'src', 'utils.ts'), 'export const x = 1;');

      const tree = service.getDirectoryTree(tempDir);
      expect(tree).toHaveLength(1);

      const srcNode = tree[0] as FileTreeNode & { children: FileTreeNode[] };
      expect(srcNode.type).toBe('directory');
      expect(srcNode.name).toBe('src');
      expect(srcNode.children).toHaveLength(2);
      expect(srcNode.children![0].name).toBe('index.ts');
      expect(srcNode.children![1].name).toBe('utils.ts');
    });

    it('should accept optional subPath parameter', () => {
      mkdirSync(join(tempDir, 'nested'));
      writeFileSync(join(tempDir, 'nested', 'deep.ts'), 'deep');

      const tree = service.getDirectoryTree(tempDir, 'nested');
      expect(tree).toHaveLength(1);
      expect(tree[0].name).toBe('deep.ts');
    });

    it('should ignore hidden files (starting with .)', () => {
      writeFileSync(join(tempDir, 'visible.txt'), 'visible');
      writeFileSync(join(tempDir, '.hidden'), 'hidden');

      const tree = service.getDirectoryTree(tempDir);
      expect(tree).toHaveLength(1);
      expect(tree[0].name).toBe('visible.txt');
    });

    it('should ignore common directories like node_modules', () => {
      mkdirSync(join(tempDir, 'node_modules'));
      writeFileSync(join(tempDir, 'readme.md'), 'readme');

      const tree = service.getDirectoryTree(tempDir);
      expect(tree).toHaveLength(1);
      // Should only have readme.md, not node_modules
      const names = tree.map((n) => n.name);
      expect(names).not.toContain('node_modules');
      expect(names).toContain('readme.md');
    });

    it('should throw for invalid path', () => {
      expect(() => service.getDirectoryTree('/nonexistent/path')).toThrow('Invalid path');
    });

    it('should include full path in tree nodes', () => {
      writeFileSync(join(tempDir, 'test.ts'), 'test');
      const tree = service.getDirectoryTree(tempDir);
      expect(tree[0].path).toBe(join(tempDir, 'test.ts'));
    });

    it('should sort same-type items alphabetically', () => {
      writeFileSync(join(tempDir, 'z.ts'), 'z');
      writeFileSync(join(tempDir, 'a.ts'), 'a');
      writeFileSync(join(tempDir, 'm.ts'), 'm');

      const tree = service.getDirectoryTree(tempDir);
      expect(tree[0].name).toBe('a.ts');
      expect(tree[1].name).toBe('m.ts');
      expect(tree[2].name).toBe('z.ts');
    });
  });
});
