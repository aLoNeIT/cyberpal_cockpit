import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import { nextTick } from 'vue';
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

    const messages = wrapper.findAll('[data-testid="conversation-message"]').map((node) => node.text());

    expect(messages).toEqual([
      expect.stringContaining('Explain it'),
      expect.stringContaining('Done.'),
    ]);
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

    expect(wrapper.find('[data-testid="formal-output"]').exists()).toBe(false);
    expect(wrapper.text()).toContain('Final answer part 1 part 2');
    expect(wrapper.text()).not.toContain('Initial analysis');
    expect(wrapper.text()).not.toContain('Late hidden thought');
    expect(wrapper.text()).not.toContain('npm test');

    await wrapper.get('[data-testid="process-details-toggle"]').trigger('click');

    expect(wrapper.text()).toContain('Initial analysis');
    expect(wrapper.text()).toContain('Late hidden thought');
    expect(wrapper.text()).toContain('npm test');
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

  it('keeps user and assistant messages in chronological conversation order', () => {
    const wrapper = mount(AgentProcessTimeline, {
      props: {
        events: [
          event({ id: 'user-1', kind: 'user', title: 'User', content: 'First prompt', createdAt: 1 }),
          event({ id: 'assistant-1', kind: 'assistant', title: 'Assistant', content: 'First answer', createdAt: 2 }),
          event({ id: 'user-2', kind: 'user', title: 'User', content: 'Second prompt', createdAt: 3 }),
          event({ id: 'assistant-2', kind: 'assistant', title: 'Assistant', content: 'Second answer', createdAt: 4 }),
        ],
      },
    });

    const messages = wrapper.findAll('[data-testid="conversation-message"]').map((node) => node.text());

    expect(messages).toEqual([
      expect.stringContaining('First prompt'),
      expect.stringContaining('First answer'),
      expect.stringContaining('Second prompt'),
      expect.stringContaining('Second answer'),
    ]);
    expect(wrapper.find('[data-testid="formal-output"]').exists()).toBe(false);
  });

  it('renders assistant markdown in the default message stream without trusting raw html', () => {
    const wrapper = mount(AgentProcessTimeline, {
      props: {
        events: [
          event({
            id: 'assistant-1',
            kind: 'assistant',
            title: 'Assistant',
            content: [
              '## Plan',
              '',
              '- keep context',
              '- show `code`',
              '',
              '<script>alert(1)</script>',
            ].join('\n'),
            createdAt: 1,
          }),
        ],
      },
    });

    const message = wrapper.get('[data-testid="conversation-message"]');
    expect(message.find('h2').text()).toBe('Plan');
    expect(message.findAll('li').map((item) => item.text())).toEqual(['keep context', 'show code']);
    expect(message.find('code').text()).toBe('code');
    expect(message.find('script').exists()).toBe(false);
    expect(message.html()).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
  });

  it('keeps error events visible after assistant output starts', () => {
    const wrapper = mount(AgentProcessTimeline, {
      props: {
        events: [
          event({ id: 'user-1', kind: 'user', title: 'User', content: 'Run build', createdAt: 1 }),
          event({ id: 'assistant-1', kind: 'assistant', title: 'Assistant', content: 'Starting build.', createdAt: 2 }),
          event({ id: 'thinking-1', kind: 'thinking', title: 'Thinking', content: 'Hidden retry planning', status: 'running', createdAt: 3 }),
          event({ id: 'stderr-1', kind: 'stderr', title: '发送失败', content: 'Network disconnected', status: 'error', createdAt: 3 }),
          event({ id: 'tool-1', kind: 'tool', title: 'npm test', content: 'exit code 1', status: 'error', createdAt: 4 }),
        ],
      },
    });

    expect(wrapper.text()).toContain('Network disconnected');
    expect(wrapper.text()).toContain('exit code 1');
    expect(wrapper.text()).not.toContain('Hidden retry planning');
    expect(wrapper.text()).toContain('过程详情');
  });

  it('shows tool metadata when command output is stored outside content', () => {
    const wrapper = mount(AgentProcessTimeline, {
      props: {
        events: [
          event({
            id: 'tool-1',
            kind: 'tool',
            title: 'shell_command',
            content: '',
            status: 'completed',
            metadata: {
              args: { command: 'npm run build' },
              result: 'built successfully',
            },
            createdAt: 1,
          }),
        ],
      },
    });

    expect(wrapper.text()).toContain('npm run build');
    expect(wrapper.text()).toContain('built successfully');
  });

  it('scrolls to the latest message when new events arrive', async () => {
    const wrapper = mount(AgentProcessTimeline, {
      props: {
        events: [
          event({ id: 'assistant-1', kind: 'assistant', title: 'Assistant', content: 'First', createdAt: 1 }),
        ],
      },
    });

    await wrapper.setProps({
      events: [
        event({ id: 'assistant-1', kind: 'assistant', title: 'Assistant', content: 'First', createdAt: 1 }),
        event({ id: 'assistant-2', kind: 'assistant', title: 'Assistant', content: ' second', createdAt: 2 }),
      ],
    });
    await nextTick();

    const messages = wrapper.findAll('[data-testid="conversation-message"]');
    expect(messages.some((node) => node.text().includes('First second'))).toBe(true);
  });

  it('limits rendered conversation DOM nodes for long streams while keeping recent messages visible', () => {
    const events = Array.from({ length: 140 }, (_, index) => event({
      id: `assistant-${index}`,
      kind: 'assistant',
      title: 'Assistant',
      content: `message ${index}`,
      createdAt: index,
    }));

    const wrapper = mount(AgentProcessTimeline, {
      props: { events },
    });

    expect(wrapper.find('[data-testid="conversation-window-notice"]').exists()).toBe(true);
    expect(wrapper.findAll('[data-testid="conversation-message"]').length).toBeLessThan(140);
    expect(wrapper.findAll('[data-testid="conversation-message"]').some((node) => node.text().includes('message 139'))).toBe(true);
    expect(wrapper.findAll('[data-testid="conversation-message"]').some((node) => node.text().includes('message 0'))).toBe(false);
  });

  it('renders only a visible slice of long streams after scrolling near the bottom', async () => {
    const events = Array.from({ length: 140 }, (_, index) => event({
      id: `assistant-${index}`,
      kind: 'assistant',
      title: 'Assistant',
      content: `message ${index}`,
      createdAt: index,
    }));

    const wrapper = mount(AgentProcessTimeline, {
      props: { events },
    });

    const scroller = wrapper.get('[data-testid="process-timeline-scroll"]').element as HTMLDivElement;
    Object.defineProperty(scroller, 'clientHeight', { configurable: true, value: 320 });
    Object.defineProperty(scroller, 'scrollHeight', { configurable: true, value: 2800 });
    Object.defineProperty(scroller, 'scrollTop', { configurable: true, value: 2480, writable: true });

    scroller.dispatchEvent(new Event('scroll'));
    await nextTick();

    const messages = wrapper.findAll('[data-testid="conversation-message"]');
    expect(messages.length).toBeLessThan(140);
    expect(messages.some((node) => node.text().includes('message 139'))).toBe(true);
    expect(messages.some((node) => node.text().includes('message 0'))).toBe(false);
  });
});
