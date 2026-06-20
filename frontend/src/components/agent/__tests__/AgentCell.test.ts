import { mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import { nextTick, ref } from 'vue';
import AgentCell from '../AgentCell.vue';
import type { AgentInfo } from '@/types';

vi.mock('../AgentTerminal.vue', () => ({ default: { template: '<div data-testid="agent-terminal" />' } }));
vi.mock('../AgentMarkdown.vue', () => ({ default: { template: '<div data-testid="agent-markdown" />' } }));
vi.mock('../AgentProcessTimeline.vue', () => ({ default: { template: '<div data-testid="agent-process" />' } }));
vi.mock('../WorkerBadge.vue', () => ({ default: { template: '<div />' } }));
vi.mock('@/components/common/StatusBadge.vue', () => ({ default: { template: '<div />' } }));
vi.mock('../ModelSelector.vue', () => ({ default: { template: '<div />' } }));

function agent(overrides: Partial<AgentInfo> = {}): AgentInfo {
  return {
    id: 'agent-1',
    cwd: 'E:/Work/demo',
    status: 'running',
    pid: 1234,
    workspaceId: 'workspace-1',
    createdAt: 1,
    parentId: null,
    childIds: [],
    isOrphaned: false,
    ...overrides,
  };
}

function mountCell(activeAgent: AgentInfo, models = ref<unknown[]>([])) {
  return mount(AgentCell, {
    props: {
      agent: activeAgent,
      terminalOutput: '',
      markdownOutput: '',
      conversationEvents: [],
    },
    global: {
      provide: {
        useAgents: {
          restartAgent: vi.fn(),
        },
        useBudget: {
          models,
        },
      },
      stubs: {
        AgentTerminal: { template: '<div data-testid="agent-terminal" />' },
        AgentMarkdown: { template: '<div data-testid="agent-markdown" />' },
        AgentProcessTimeline: { template: '<div data-testid="agent-process" />' },
        WorkerBadge: true,
        StatusBadge: true,
        ModelSelector: true,
      },
    },
  });
}

describe('AgentCell', () => {
  it('lets the user switch directly between process, terminal, and markdown views', async () => {
    const wrapper = mountCell(agent());

    expect(wrapper.find('[data-testid="agent-process"]').exists()).toBe(true);

    await wrapper.get('[data-testid="view-terminal"]').trigger('click');
    expect(wrapper.find('[data-testid="agent-terminal"]').exists()).toBe(true);

    await wrapper.get('[data-testid="view-markdown"]').trigger('click');
    expect(wrapper.find('[data-testid="agent-markdown"]').exists()).toBe(true);

    await wrapper.get('[data-testid="view-process"]').trigger('click');
    expect(wrapper.find('[data-testid="agent-process"]').exists()).toBe(true);
  });

  it('allows continuing a stopped persisted agent from the cell input', async () => {
    const wrapper = mountCell(agent({
      status: 'stopped',
      pid: null,
      sessionFile: 'E:/Work/demo/.pi/session.json',
    }));

    const textarea = wrapper.get('textarea');
    expect((textarea.element as HTMLTextAreaElement).disabled).toBe(false);

    await textarea.setValue('continue the task');
    await textarea.trigger('keydown', { key: 'Enter' });

    expect(wrapper.emitted('send-input')).toEqual([['continue the task']]);
  });

  it('reacts when the agent enters restarting status', async () => {
    const wrapper = mountCell(agent());

    expect(wrapper.text()).not.toContain('正在切换模型...');

    await wrapper.setProps({
      agent: agent({ status: 'restarting' }),
    });

    expect(wrapper.text()).toContain('正在切换模型...');
  });

  it('shows the model switch control when models load after the cell is mounted', async () => {
    const models = ref<unknown[]>([]);
    const wrapper = mountCell(agent({ model: 'gpt-4o' }), models);

    expect(wrapper.find('[title="切换模型"]').exists()).toBe(false);

    models.value = [
      { id: 'gpt-4o', name: 'GPT-4o', provider: 'openai', isDefault: true },
      { id: 'deepseek-chat', name: 'DeepSeek Chat', provider: 'deepseek', isDefault: false },
    ];
    await nextTick();

    expect(wrapper.find('[title="切换模型"]').exists()).toBe(true);
  });

  it('shows the send state message while waiting for a response', async () => {
    const wrapper = mountCell(agent());

    await wrapper.setProps({
      agent: agent(),
      terminalOutput: '',
      markdownOutput: '',
      conversationEvents: [],
      sendState: { phase: 'busy', message: '等待 Agent 响应...' },
    });

    expect(wrapper.text()).toContain('等待 Agent 响应...');
  });
});
