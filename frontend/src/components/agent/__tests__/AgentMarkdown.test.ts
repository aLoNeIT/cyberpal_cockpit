import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import AgentMarkdown from '../AgentMarkdown.vue';

describe('AgentMarkdown', () => {
  it('renders common markdown blocks for agent output', () => {
    const wrapper = mount(AgentMarkdown, {
      props: {
        content: [
          '## Result',
          '',
          '- first item',
          '- second item',
          '',
          '```ts',
          'const ok = true;',
          '```',
        ].join('\n'),
      },
    });

    expect(wrapper.find('h2').text()).toBe('Result');
    expect(wrapper.findAll('li').map((item) => item.text())).toEqual(['first item', 'second item']);
    expect(wrapper.find('pre code').text()).toContain('const ok = true;');
  });

  it('escapes raw html before rendering inline markdown', () => {
    const wrapper = mount(AgentMarkdown, {
      props: {
        content: 'Do not run <script>alert(1)</script> and show `code`.',
      },
    });

    expect(wrapper.find('script').exists()).toBe(false);
    expect(wrapper.html()).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(wrapper.find('code').text()).toBe('code');
  });
});
