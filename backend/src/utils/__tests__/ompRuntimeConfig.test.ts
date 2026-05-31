import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { prepareOmpRuntimeConfig } from '../ompRuntimeConfig.js';

const tempDirs: string[] = [];

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

describe('prepareOmpRuntimeConfig', () => {
  it('writes an oh-my-pi models.yml for the selected CPC provider', () => {
    const agentDir = mkdtempSync(join(tmpdir(), 'cpc-omp-agent-'));
    tempDirs.push(agentDir);

    const result = prepareOmpRuntimeConfig(agentDir, {
      providerId: 'tokenx24',
      providerName: 'TokenX24',
      baseUrl: 'https://tokenx24.com/v1',
      apiKey: 'secret-token',
      model: { id: 'gpt-5.5', name: 'GPT-5.5', isDefault: true },
    });

    const file = readFileSync(join(agentDir, 'models.yml'), 'utf8');
    const parsed = JSON.parse(file);

    expect(result).toEqual({
      agentDir,
      modelSelector: 'tokenx24/gpt-5.5',
    });
    expect(parsed).toEqual({
      providers: {
        tokenx24: {
          baseUrl: 'https://tokenx24.com/v1',
          apiKey: 'secret-token',
          api: 'openai-completions',
          models: [
            {
              id: 'gpt-5.5',
              name: 'GPT-5.5',
            },
          ],
        },
      },
    });
  });
});
