import { ref } from 'vue';
import type { Ref } from 'vue';
import * as api from '@/services/api';
import type { FileContentResponse } from '@/types';

export interface PreviewFile {
  path: string;
  content: string;
  language: string;
}

export interface DiffData {
  oldPath: string;
  newPath: string;
  oldContent: string;
  newContent: string;
}

export function useFilePreview() {
  const currentFile: Ref<PreviewFile | null> = ref(null);
  const diffData: Ref<DiffData | null> = ref(null);
  const loading: Ref<boolean> = ref(false);
  const error: Ref<string | null> = ref(null);

  async function openFile(filePath: string): Promise<void> {
    loading.value = true;
    error.value = null;
    try {
      const result: FileContentResponse = await api.fetchFileContent(filePath);
      currentFile.value = {
        path: result.path,
        content: result.content,
        language: result.language,
      };
      diffData.value = null;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '加载文件失败';
      error.value = message;
      console.error('[useFilePreview] Error opening file:', message);
    } finally {
      loading.value = false;
    }
  }

  async function showDiff(oldPath: string, newPath: string): Promise<void> {
    loading.value = true;
    error.value = null;
    try {
      const [oldResult, newResult] = await Promise.all([
        api.fetchFileContent(oldPath),
        api.fetchFileContent(newPath),
      ]);

      diffData.value = {
        oldPath: oldResult.path,
        newPath: newResult.path,
        oldContent: oldResult.content,
        newContent: newResult.content,
      };
      currentFile.value = null;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '加载差异失败';
      error.value = message;
      console.error('[useFilePreview] Error loading diff:', message);
    } finally {
      loading.value = false;
    }
  }

  function closePreview(): void {
    currentFile.value = null;
    diffData.value = null;
    error.value = null;
  }

  function setPreviewFile(file: PreviewFile): void {
    currentFile.value = file;
    diffData.value = null;
  }

  return {
    currentFile,
    diffData,
    loading,
    error,
    openFile,
    showDiff,
    closePreview,
    setPreviewFile,
  };
}
