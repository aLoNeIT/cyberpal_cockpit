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
  it('merges adjacent assistant and thinking deltas into readable timeline entries', () => {
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

    const articles = wrapper.findAll('article');

    expect(articles).toHaveLength(4);
    expect(articles[1].text()).toContain('Checking context');
    expect(articles[2].text()).toContain('Done.');
  });
});
