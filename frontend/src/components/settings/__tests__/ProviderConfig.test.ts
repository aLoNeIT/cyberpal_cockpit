import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import ProviderConfig from '../ProviderConfig.vue';
import * as api from '@/services/api';

vi.mock('@/services/api', () => ({
  fetchProviders: vi.fn(),
  fetchProviderDetail: vi.fn(),
  updateProvider: vi.fn(),
  createProvider: vi.fn(),
  deleteProvider: vi.fn(),
}));

describe('ProviderConfig', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.fetchProviders).mockResolvedValue([
      { id: 'tokenx24', name: 'TokenX24', configured: true, modelCount: 1 },
    ]);
    vi.mocked(api.fetchProviderDetail).mockResolvedValue({
      id: 'tokenx24',
      name: 'TokenX24',
      baseUrl: 'https://tokenx24.com/v1',
      apiKey: 'shif********baba',
      visible: true,
      models: [{ id: 'gpt-5.5', name: 'GPT-5.5', isDefault: true, visible: true }],
    });
    vi.mocked(api.updateProvider).mockResolvedValue({
      id: 'tokenx24',
      name: 'TokenX24',
      baseUrl: 'https://tokenx24.com/v1',
      apiKey: 'shif********baba',
      visible: true,
      models: [{ id: 'gpt-5.5', name: 'GPT-5.5', isDefault: true, visible: true }],
    });
  });

  it('does not send a masked API key when saving unchanged provider settings', async () => {
    const wrapper = mount(ProviderConfig);
    await flushPromises();

    expect(api.fetchProviderDetail).toHaveBeenCalledWith('tokenx24');

    const nameInput = wrapper.findAll('input').find((input) => input.element.value === 'TokenX24');
    expect(nameInput).toBeTruthy();

    const saveButton = wrapper.findAll('button').find((button) => button.text() === '保存');
    expect(saveButton).toBeTruthy();
    await saveButton!.trigger('click');
    await flushPromises();

    expect(api.updateProvider).toHaveBeenCalledWith('tokenx24', {
      name: 'TokenX24',
      baseUrl: 'https://tokenx24.com/v1',
      visible: true,
      models: [{ id: 'gpt-5.5', name: 'GPT-5.5', isDefault: true, visible: true }],
    });
  });

  it('sends the API key when the user enters a new unmasked value', async () => {
    const wrapper = mount(ProviderConfig);
    await flushPromises();

    const apiKeyInput = wrapper.find('input[type="password"]');
    await apiKeyInput.setValue('new-raw-token');

    const saveButton = wrapper.findAll('button').find((button) => button.text() === '保存');
    expect(saveButton).toBeTruthy();
    await saveButton!.trigger('click');
    await flushPromises();

    expect(api.updateProvider).toHaveBeenCalledWith('tokenx24', {
      name: 'TokenX24',
      baseUrl: 'https://tokenx24.com/v1',
      apiKey: 'new-raw-token',
      visible: true,
      models: [{ id: 'gpt-5.5', name: 'GPT-5.5', isDefault: true, visible: true }],
    });
  });

  it('sends model visibility changes when saving provider settings', async () => {
    const wrapper = mount(ProviderConfig);
    await flushPromises();

    const saveButton = wrapper.findAll('button').find((button) => button.text() === '保存');
    expect(saveButton).toBeTruthy();
    await saveButton!.trigger('click');
    await flushPromises();

    expect(api.updateProvider).toHaveBeenCalledWith('tokenx24', {
      name: 'TokenX24',
      baseUrl: 'https://tokenx24.com/v1',
      visible: true,
      models: [{ id: 'gpt-5.5', name: 'GPT-5.5', isDefault: true, visible: true }],
    });
  });

  it('toggles provider visibility in the detail panel', async () => {
    const wrapper = mount(ProviderConfig);
    await flushPromises();

    const visibilityLabel = wrapper.get('[data-testid="provider-visibility-state"]');
    expect(visibilityLabel.text()).toContain('显示');

    await wrapper.get('[data-testid="provider-visibility-toggle"]').trigger('click');

    expect(visibilityLabel.text()).toContain('隐藏');
  });
});
