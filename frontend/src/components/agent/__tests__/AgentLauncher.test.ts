import { mount, flushPromises } from '@vue/test-utils';
import { describe, expect, it, beforeEach, vi } from 'vitest';
import AgentLauncher from '../AgentLauncher.vue';
import * as api from '@/services/api';
import type { WorkspaceConfig } from '@/types';

vi.mock('@/services/api', () => ({
  fetchModels: vi.fn(),
}));

describe('AgentLauncher', () => {
  const workspaces: WorkspaceConfig[] = [
    {
      id: 'ws-1',
      name: 'Workspace 1',
      path: '/workspaces/project-1',
      createdAt: 1,
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('hides invisible models and selects the first visible default fallback', async () => {
    vi.mocked(api.fetchModels).mockResolvedValue([
      {
        id: 'deepseek-chat',
        name: 'DeepSeek V3',
        provider: 'DeepSeek',
        providerId: 'deepseek',
        modelId: 'deepseek-chat',
        selector: 'deepseek/deepseek-chat',
        isDefault: true,
        visible: false,
      },
      {
        id: 'gpt-4o',
        name: 'GPT-4o',
        provider: 'OpenAI',
        providerId: 'openai',
        modelId: 'gpt-4o',
        selector: 'openai/gpt-4o',
        isDefault: false,
        visible: true,
      },
    ]);

    const wrapper = mount(AgentLauncher, {
      props: {
        workspaces,
      },
    });

    await flushPromises();

    const options = wrapper.findAll('option').map((option) => (option.element as HTMLOptionElement).value);
    expect(options).toContain('openai/gpt-4o');
    expect(options).not.toContain('deepseek/deepseek-chat');
    expect((wrapper.get('select').element as HTMLSelectElement).value).toBe('openai/gpt-4o');
  });

  it('does not launch with a hidden-only model selection', async () => {
    vi.mocked(api.fetchModels).mockResolvedValue([
      {
        id: 'deepseek-chat',
        name: 'DeepSeek V3',
        provider: 'DeepSeek',
        providerId: 'deepseek',
        modelId: 'deepseek-chat',
        selector: 'deepseek/deepseek-chat',
        isDefault: true,
        visible: false,
      },
    ]);

    const wrapper = mount(AgentLauncher, {
      props: {
        workspaces,
      },
    });

    await flushPromises();

    expect(wrapper.find('select').exists()).toBe(false);
    await wrapper.find('div.cursor-pointer').trigger('click');

    const launchButton = wrapper.findAll('button').find((button) => button.text().trim() === '启动');
    expect(launchButton).toBeTruthy();
    await launchButton!.trigger('click');

    expect(wrapper.emitted('confirm')?.[0]).toEqual(['/workspaces/project-1', 'ws-1', undefined]);
  });
});
