import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const CURRENT_DIR = dirname(fileURLToPath(import.meta.url));
const BACKEND_ROOT = resolve(CURRENT_DIR, '..', '..');

export function resolveBundledAgentPath(platform: NodeJS.Platform = process.platform): string {
  const executable = platform === 'win32' ? 'omp.cmd' : 'omp';
  return resolve(BACKEND_ROOT, 'node_modules', '.bin', executable);
}

export function resolveBundledRuntimePath(platform: NodeJS.Platform = process.platform): string {
  if (platform === 'win32') {
    return resolve(BACKEND_ROOT, 'node_modules', 'bun', 'bin', 'bun.exe');
  }
  return resolve(BACKEND_ROOT, 'node_modules', '.bin', 'bun');
}

export function resolveBundledAgentEntryPath(): string {
  return resolve(BACKEND_ROOT, 'node_modules', '@oh-my-pi', 'pi-coding-agent', 'src', 'cli.ts');
}

export function resolveAgentCommand(env: NodeJS.ProcessEnv = process.env): string {
  const override = env.OH_MY_PI_PATH?.trim();
  return override || resolveBundledRuntimePath();
}

export function resolveAgentArgsPrefix(env: NodeJS.ProcessEnv = process.env): string[] {
  const override = env.OH_MY_PI_PATH?.trim();
  return override ? [] : [resolveBundledAgentEntryPath()];
}
