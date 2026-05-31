import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import AgentProcessTimeline from '../AgentProcessTimeline.vue';
import type { AgentConversationEvent } from '@/types';

function event(overrides: Partial<AgentConversationEvent>): AgentConversationEvent {
  return {
    id: overrides.id ?? 'evt',
    agentId: overrides.agentId ?? 'agent-1',
    kind: overrides.kind ?? 'assistant',
    title: overrides.title,
    content: overrides.content ?? '',
    status: overrides.status,
    metadata: overrides.metadata,
    createdAt: overrides.createdAt ?? 1,
  };
}

describe('AgentProcessTimeline', () => {
  it('merges adjacent assistant and thinking deltas into readable timeline entries', async () => {
    const wrapper = mount(AgentProcessTimeline, {
      props: {
        events: [
          event({ id: 'user-1', kind: 'user', title: 'User', content: 'Explain it', createdAt: 1 }),
          event({ id: 'thinking-1', kind: 'thinking', title: 'Thinking', content: 'Checking', status: 'running', createdAt: 2 }),
          event({ id: 'thinking-2', kind: 'thinking', title: 'Thinking', content: ' context', status: 'running', createdAt: 3 }),
          event({ id: 'assistant-1', kind: 'assistant', title: 'Assistant', content: 'Done', status: 'running', createdAt: 4 }),
          event({ id: 'assistant-2', kind: 'assistant', title: 'Assistant', content: '.', status: 'running', createdAt: 5 }),
          event({ id: 'summary-1', kind: 'summary', title: 'Summary', content: 'Turn completed.', status: 'completed', createdAt: 6 }),
        ],
      },
    });

    expect(wrapper.get('[data-testid="formal-output"]').text()).toContain('Done.');
    expect(wrapper.text()).not.toContain('Checking context');

    await wrapper.get('[data-testid="process-details-toggle"]').trigger('click');

    expect(wrapper.text()).toContain('Checking context');
  });

  it('keeps thinking and tool events visible before formal output starts', () => {
    const wrapper = mount(AgentProcessTimeline, {
      props: {
        events: [
          event({ id: 'thinking-1', kind: 'thinking', title: 'Thinking', content: 'Checking files', createdAt: 1 }),
          event({ id: 'tool-1', kind: 'tool', title: 'shell_command', content: 'npm test', status: 'running', createdAt: 2 }),
        ],
      },
    });

    expect(wrapper.text()).toContain('Checking files');
    expect(wrapper.text()).toContain('npm test');
  });

  it('collapses thinking and tool details after formal output starts', async () => {
    const wrapper = mount(AgentProcessTimeline, {
      props: {
        events: [
          event({ id: 'thinking-1', kind: 'thinking', title: 'Thinking', content: 'Initial analysis', createdAt: 1 }),
          event({ id: 'tool-1', kind: 'tool', title: 'read_file', content: 'src/main.ts', createdAt: 2 }),
          event({ id: 'assistant-1', kind: 'assistant', title: 'Assistant', content: 'Final answer part 1', createdAt: 3 }),
          event({ id: 'thinking-2', kind: 'thinking', title: 'Thinking', content: 'Late hidden thought', createdAt: 4 }),
          event({ id: 'tool-2', kind: 'tool', title: 'shell_command', content: 'npm test', createdAt: 5 }),
          event({ id: 'assistant-2', kind: 'assistant', title: 'Assistant', content: ' part 2', createdAt: 6 }),
        ],
      },
    });

    const formalOutput = wrapper.get('[data-testid="formal-output"]');

    expect(formalOutput.text()).toContain('Final answer part 1 part 2');
    expect(wrapper.text()).not.toContain('Initial analysis');
    expect(wrapper.text()).not.toContain('Late hidden thought');
    expect(wrapper.text()).not.toContain('npm test');

    await wrapper.get('[data-testid="process-details-toggle"]').trigger('click');

    expect(wrapper.text()).toContain('Initial analysis');
    expect(wrapper.text()).toContain('Late hidden thought');
    expect(wrapper.text()).toContain('npm test');
    const articles = wrapper.findAll('article');
    expect(articles[articles.length - 1].attributes('data-testid')).toBe('formal-output');
  });

  it('keeps user prompts visible after formal output starts', () => {
    const wrapper = mount(AgentProcessTimeline, {
      props: {
        events: [
          event({ id: 'user-1', kind: 'user', title: 'User', content: 'Build this', createdAt: 1 }),
          event({ id: 'thinking-1', kind: 'thinking', title: 'Thinking', content: 'Hidden analysis', createdAt: 2 }),
          event({ id: 'assistant-1', kind: 'assistant', title: 'Assistant', content: 'Formal answer', createdAt: 3 }),
        ],
      },
    });

    expect(wrapper.text()).toContain('Build this');
    expect(wrapper.text()).toContain('Formal answer');
    expect(wrapper.text()).not.toContain('Hidden analysis');
  });
});
