import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import { nextTick } from 'vue';
import AgentInput from '../AgentInput.vue';

describe('AgentInput', () => {
  it('sends a multiline prompt with Enter and clears the editor', async () => {
    const wrapper = mount(AgentInput, {
      props: {
        disabled: false,
      },
    });

    const textarea = wrapper.get('textarea');
    await textarea.setValue('first line\nsecond line');
    await textarea.trigger('keydown', { key: 'Enter' });

    expect(wrapper.emitted('send')).toEqual([['first line\nsecond line']]);
    expect((textarea.element as HTMLTextAreaElement).value).toBe('');
  });

  it('keeps editing when Shift+Enter is pressed', async () => {
    const wrapper = mount(AgentInput, {
      props: {
        disabled: false,
      },
    });

    const textarea = wrapper.get('textarea');
    await textarea.setValue('first line');
    await textarea.trigger('keydown', { key: 'Enter', shiftKey: true });

    expect(wrapper.emitted('send')).toBeUndefined();
    expect((textarea.element as HTMLTextAreaElement).value).toBe('first line');
  });

  it('keeps focus in the editor after sending from the button', async () => {
    const wrapper = mount(AgentInput, {
      props: {
        disabled: false,
      },
      attachTo: document.body,
    });

    const textarea = wrapper.get('textarea');
    await textarea.setValue('continue working');
    await wrapper.get('button').trigger('click');
    await nextTick();

    expect(document.activeElement).toBe(textarea.element);

    wrapper.unmount();
  });

  it('shows local feedback instead of sending an empty prompt', async () => {
    const wrapper = mount(AgentInput, {
      props: {
        disabled: false,
      },
    });

    await wrapper.get('textarea').trigger('keydown', { key: 'Enter' });

    expect(wrapper.emitted('send')).toBeUndefined();
    expect(wrapper.text()).toContain('请输入指令');
  });
});
