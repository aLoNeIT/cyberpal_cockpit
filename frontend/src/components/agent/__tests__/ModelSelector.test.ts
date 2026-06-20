import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import ModelSelector from '../ModelSelector.vue';

describe('ModelSelector', () => {
  it('uses stable selectors for duplicate model ids', async () => {
    const wrapper = mount(ModelSelector, {
      props: {
        models: [
          {
            id: 'shared',
            name: 'Shared A',
            provider: 'Alpha',
            providerId: 'alpha',
            modelId: 'shared',
            selector: 'alpha/shared',
            isDefault: true,
            visible: true,
          },
          {
            id: 'shared',
            name: 'Shared B',
            provider: 'Beta',
            providerId: 'beta',
            modelId: 'shared',
            selector: 'beta/shared',
            isDefault: false,
            visible: true,
          },
        ],
        currentModel: 'alpha/shared',
        mode: 'dropdown',
      },
    });

    const values = wrapper.findAll('option').map((option) => (option.element as HTMLOptionElement).value);
    expect(values).toEqual(['', 'alpha/shared', 'beta/shared']);

    await wrapper.get('select').setValue('beta/shared');
    expect(wrapper.emitted('select')).toEqual([['beta/shared']]);
  });
});
