import { describe, expect, it } from 'vitest';
import { sep } from 'path';
import {
  resolveAgentArgsPrefix,
  resolveAgentCommand,
  resolveBundledAgentEntryPath,
  resolveBundledAgentPath,
  resolveBundledRuntimePath,
} from '../agentBinary.js';

describe('agent binary resolution', () => {
  it('uses OH_MY_PI_PATH when explicitly configured', () => {
    expect(resolveAgentCommand({ OH_MY_PI_PATH: 'C:/tools/omp.cmd' })).toBe('C:/tools/omp.cmd');
  });

  it('falls back to the bundled Bun runtime when no override is configured', () => {
    const command = resolveAgentCommand({});
    expect(command).toBe(resolveBundledRuntimePath());
  });

  it('uses the spawnable bundled Bun executable on Windows', () => {
    expect(resolveBundledRuntimePath('win32')).toContain(`${sep}node_modules${sep}bun${sep}bin${sep}bun.exe`);
  });

  it('uses the bundled Bun runtime on non-Windows platforms', () => {
    expect(resolveBundledRuntimePath('linux')).toContain(`${sep}node_modules${sep}.bin${sep}bun`);
  });

  it('resolves the oh-my-pi CLI entry from the project dependency', () => {
    expect(resolveBundledAgentEntryPath()).toContain(
      `${sep}node_modules${sep}@oh-my-pi${sep}pi-coding-agent${sep}src${sep}cli.ts`
    );
  });

  it('passes the bundled CLI entry as an argument when no override is configured', () => {
    expect(resolveAgentArgsPrefix({})).toEqual([resolveBundledAgentEntryPath()]);
  });

  it('does not add a bundled CLI argument when OH_MY_PI_PATH is configured', () => {
    expect(resolveAgentArgsPrefix({ OH_MY_PI_PATH: 'C:/tools/custom-agent.cmd' })).toEqual([]);
  });

  it('still exposes the bundled omp shim path for diagnostics', () => {
    expect(resolveBundledAgentPath('win32')).toContain(`${sep}node_modules${sep}.bin${sep}omp.cmd`);
  });
});
