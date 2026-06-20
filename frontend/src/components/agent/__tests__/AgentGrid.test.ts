import { mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import AgentGrid from '../AgentGrid.vue';
import type { AgentInfo } from '@/types';

vi.mock('../AgentCell.vue', () => ({
  default: {
    props: ['agent'],
    emits: ['send-input', 'kill'],
    template: '<section data-testid="agent-cell-full">{{ agent.id }}<button data-testid="full-send" @click="$emit(\'send-input\', \'full prompt\')" /></section>',
  },
}));

vi.mock('../AgentCellSummary.vue', () => ({
  default: {
    props: ['agent'],
    emits: ['focus', 'send-input', 'kill'],
    template: '<section data-testid="agent-cell-summary" @click="$emit(\'focus\')">{{ agent.id }}<button data-testid="summary-send" @click.stop="$emit(\'send-input\', \'summary prompt\')" /><button data-testid="summary-kill" @click.stop="$emit(\'kill\')" /></section>',
  },
}));

function agent(id: string): AgentInfo {
  return {
    id,
    cwd: `E:/Work/${id}`,
    status: 'running',
    pid: 100,
    workspaceId: null,
    createdAt: 1,
    parentId: null,
    childIds: [],
    isOrphaned: false,
  };
}

describe('AgentGrid', () => {
  it('mounts the full heavy cell only for the active agent', () => {
    const wrapper = mount(AgentGrid, {
      props: {
        agents: [agent('agent-1'), agent('agent-2'), agent('agent-3')],
        activeAgentId: 'agent-2',
        terminalOutputs: new Map(),
        markdownOutputs: new Map(),
        conversationEvents: new Map(),
        sendStates: new Map(),
      },
    });

    expect(wrapper.findAll('[data-testid="agent-cell-full"]')).toHaveLength(1);
    expect(wrapper.find('[data-testid="agent-cell-full"]').text()).toContain('agent-2');
    expect(wrapper.findAll('[data-testid="agent-cell-summary"]')).toHaveLength(2);
  });

  it('focuses a summary cell and still allows compact sending from it', async () => {
    const wrapper = mount(AgentGrid, {
      props: {
        agents: [agent('agent-1'), agent('agent-2')],
        activeAgentId: 'agent-1',
        terminalOutputs: new Map(),
        markdownOutputs: new Map(),
        conversationEvents: new Map(),
        sendStates: new Map(),
      },
    });

    await wrapper.get('[data-testid="agent-cell-summary"]').trigger('click');
    expect(wrapper.emitted('focus-agent')).toEqual([['agent-2']]);

    await wrapper.get('[data-testid="summary-send"]').trigger('click');
    expect(wrapper.emitted('send-input')).toEqual([['agent-2', 'summary prompt']]);
  });

  it('forwards kill from summary cells to the parent layout', async () => {
    const wrapper = mount(AgentGrid, {
      props: {
        agents: [agent('agent-1'), agent('agent-2')],
        activeAgentId: 'agent-1',
        terminalOutputs: new Map(),
        markdownOutputs: new Map(),
        conversationEvents: new Map(),
        sendStates: new Map(),
      },
    });

    await wrapper.get('[data-testid="summary-kill"]').trigger('click');

    expect(wrapper.emitted('kill-agent')).toEqual([['agent-2']]);
  });
});
