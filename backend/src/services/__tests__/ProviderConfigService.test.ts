import { describe, it, expect, vi } from 'vitest';
import { ProviderConfigService } from '../ProviderConfigService.js';

function createRepoWithProviders(providers: Array<{ id: string; config: any }>) {
  return {
    seedDefaults: vi.fn(),
    findAll: vi.fn().mockResolvedValue(providers),
    insert: vi.fn(),
    deleteById: vi.fn(),
    update: vi.fn(),
    updateApiKey: vi.fn(),
  };
}

describe('ProviderConfigService', () => {
  describe('getMergedModels', () => {
    it('keeps provider-specific selectors, skips hidden models, and hides whole providers', async () => {
      const repo = createRepoWithProviders([
        {
          id: 'alpha',
          config: {
            name: 'Alpha',
            baseUrl: 'https://alpha.example.com',
            apiKey: 'secret-alpha',
            visible: true,
            models: [
              { id: 'shared', name: 'Shared Visible', isDefault: true, visible: true },
              { id: 'alpha-hidden', name: 'Alpha Hidden', visible: false },
            ],
          },
        },
        {
          id: 'beta',
          config: {
            name: 'Beta',
            baseUrl: 'https://beta.example.com',
            apiKey: 'secret-beta',
            visible: false,
            models: [
              { id: 'shared', name: 'Shared Visible From Beta', visible: true },
            ],
          },
        },
      ]);
      const service = new ProviderConfigService(repo as any);
      await service.init();

      const models = service.getMergedModels();
      expect(models).toHaveLength(2);
      expect(models[0]).toMatchObject({
        id: 'shared',
        name: 'Shared Visible',
        provider: 'Alpha',
        isDefault: true,
        providerId: 'alpha',
        modelId: 'shared',
        selector: 'alpha/shared',
        visible: true,
      });
      expect(models[1]).toMatchObject({
        id: 'alpha-hidden',
        name: 'Alpha Hidden',
        provider: 'Alpha',
        isDefault: false,
        providerId: 'alpha',
        modelId: 'alpha-hidden',
        selector: 'alpha/alpha-hidden',
        visible: false,
      });
      expect(models).not.toEqual(expect.arrayContaining([
        expect.objectContaining({ provider: 'Beta' }),
      ]));
      expect(models.find((model) => model.providerId === 'beta')).toBeUndefined();
    });
  });

  describe('getModelRuntimeConfig', () => {
    it('resolves a bare model id to raw provider runtime config', async () => {
      const repo = createRepoWithProviders([
        {
          id: 'tokenx24',
          config: {
            name: 'TokenX24',
            baseUrl: 'https://tokenx24.com/v1',
            apiKey: 'secret-token',
            models: [
              { id: 'gpt-5.4', name: 'GPT-5.4', visible: true },
              { id: 'gpt-5.5', name: 'GPT-5.5', isDefault: true, visible: true },
            ],
          },
        },
      ]);
      const service = new ProviderConfigService(repo as any);
      await service.init();

      const runtimeConfig = service.getModelRuntimeConfig('gpt-5.5');

      expect(runtimeConfig).toEqual({
        providerId: 'tokenx24',
        providerName: 'TokenX24',
        baseUrl: 'https://tokenx24.com/v1',
        apiKey: 'secret-token',
        model: { id: 'gpt-5.5', name: 'GPT-5.5', isDefault: true, visible: true },
      });
    });

    it('resolves an explicit provider/model selector without exposing masked keys', async () => {
      const repo = createRepoWithProviders([
        {
          id: 'tokenx24',
          config: {
            name: 'TokenX24',
            baseUrl: 'https://tokenx24.com/v1',
            apiKey: 'secret-token',
            models: [{ id: 'gpt-5.5', name: 'GPT-5.5', visible: true }],
          },
        },
      ]);
      const service = new ProviderConfigService(repo as any);
      await service.init();

      const runtimeConfig = service.getModelRuntimeConfig('tokenx24/gpt-5.5');

      expect(runtimeConfig?.providerId).toBe('tokenx24');
      expect(runtimeConfig?.apiKey).toBe('secret-token');
      expect(service.getProviderDetail('tokenx24')?.apiKey).toBe('secr****oken');
    });

    it('returns null when the selected provider has no usable API key', async () => {
      const repo = createRepoWithProviders([
        {
          id: 'tokenx24',
          config: {
            name: 'TokenX24',
            baseUrl: 'https://tokenx24.com/v1',
            apiKey: '',
            models: [{ id: 'gpt-5.5', name: 'GPT-5.5', visible: true }],
          },
        },
      ]);
      const service = new ProviderConfigService(repo as any);
      await service.init();

      expect(service.getModelRuntimeConfig('gpt-5.5')).toBeNull();
    });

    it('returns null when the stored API key is only a masked placeholder', async () => {
      const repo = createRepoWithProviders([
        {
          id: 'tokenx24',
          config: {
            name: 'TokenX24',
            baseUrl: 'https://tokenx24.com/v1',
            apiKey: 'shif********baba',
            models: [{ id: 'gpt-5.5', name: 'GPT-5.5', visible: true }],
          },
        },
      ]);
      const service = new ProviderConfigService(repo as any);
      await service.init();

      expect(service.getModelRuntimeConfig('gpt-5.5')).toBeNull();
    });
  });

  describe('getProviderSummaries', () => {
    it('includes provider visibility and does not mark providers configured when the stored API key is masked', async () => {
      const repo = createRepoWithProviders([
        {
          id: 'tokenx24',
          config: {
            name: 'TokenX24',
            baseUrl: 'https://tokenx24.com/v1',
            apiKey: 'shif********baba',
            visible: false,
            models: [{ id: 'gpt-5.5', name: 'GPT-5.5' }],
          },
        },
      ]);
      const service = new ProviderConfigService(repo as any);
      await service.init();

      expect(service.getProviderSummaries()).toEqual([
        { id: 'tokenx24', name: 'TokenX24', configured: false, modelCount: 1, visible: false },
      ]);
    });
  });

  describe('updateProvider', () => {
    it('preserves the existing raw API key when the update contains its masked display value', async () => {
      const repo = createRepoWithProviders([
        {
          id: 'tokenx24',
          config: {
            name: 'TokenX24',
            baseUrl: 'https://tokenx24.com/v1',
            apiKey: 'secret-token',
            visible: true,
            models: [{ id: 'gpt-5.5', name: 'GPT-5.5', visible: true }],
          },
        },
      ]);
      const service = new ProviderConfigService(repo as any);
      await service.init();

      const updated = await service.updateProvider('tokenx24', {
        baseUrl: 'https://tokenx24.com/v1',
        apiKey: 'secr****oken',
      });

      expect(updated?.apiKey).toBe('secret-token');
      expect(service.getModelRuntimeConfig('gpt-5.5')?.apiKey).toBe('secret-token');
      expect(repo.update).toHaveBeenCalledWith(
        'tokenx24',
        expect.not.objectContaining({ apiKey: expect.any(String) }),
      );
    });

    it('stores provider visibility when requested', async () => {
      const repo = createRepoWithProviders([
        {
          id: 'tokenx24',
          config: {
            name: 'TokenX24',
            baseUrl: 'https://tokenx24.com/v1',
            apiKey: 'secret-token',
            visible: true,
            models: [{ id: 'gpt-5.5', name: 'GPT-5.5', visible: true }],
          },
        },
      ]);
      const service = new ProviderConfigService(repo as any);
      await service.init();

      const updated = await service.updateProvider('tokenx24', {
        visible: false,
      });

      expect(updated?.visible).toBe(false);
      expect(service.getModelRuntimeConfig('gpt-5.5')).toBeNull();
      expect(repo.update).toHaveBeenCalledWith(
        'tokenx24',
        expect.objectContaining({ visible: false }),
      );
    });
  });

  describe('getModelRuntimeConfig', () => {
    it('does not resolve models from hidden providers', async () => {
      const repo = createRepoWithProviders([
        {
          id: 'hidden-provider',
          config: {
            name: 'Hidden Provider',
            baseUrl: 'https://hidden.example.com',
            apiKey: 'secret-token',
            visible: false,
            models: [{ id: 'gpt-5.5', name: 'GPT-5.5', visible: true }],
          },
        },
      ]);
      const service = new ProviderConfigService(repo as any);
      await service.init();

      expect(service.getModelRuntimeConfig('gpt-5.5')).toBeNull();
    });
  });
});
