import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import type { ProviderModelRuntimeConfig } from '../types/index.js';

export interface OmpRuntimeConfigResult {
  agentDir: string;
  modelSelector: string;
}

export function prepareOmpRuntimeConfig(
  agentDir: string,
  config: ProviderModelRuntimeConfig,
): OmpRuntimeConfigResult {
  mkdirSync(agentDir, { recursive: true });

  const modelSelector = `${config.providerId}/${config.model.id}`;
  const modelsConfig = {
    providers: {
      [config.providerId]: {
        baseUrl: config.baseUrl,
        apiKey: config.apiKey,
        api: 'openai-completions',
        models: [
          {
            id: config.model.id,
            name: config.model.name,
          },
        ],
      },
    },
  };

  writeFileSync(join(agentDir, 'models.yml'), JSON.stringify(modelsConfig, null, 2), 'utf8');

  return {
    agentDir,
    modelSelector,
  };
}
