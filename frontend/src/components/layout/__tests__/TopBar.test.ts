import { mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import TopBar from '../TopBar.vue';

vi.mock('@/composables/useTheme', () => ({
  useTheme: () => ({ mode: { value: 'dark' } }),
  setMode: vi.fn(),
}));

describe('TopBar', () => {
  it('shows input, output, cache, and USD cost usage from props', () => {
    const wrapper = mount(TopBar, {
      props: {
        mode: 'grid',
        rightPanelOpen: false,
        agentCount: 2,
        connected: true,
        inputTokens: 1000,
        outputTokens: 250,
        cachedTokens: 3425,
        estimatedCost: 0.037,
      },
    });

    expect(wrapper.text()).toContain('IN 1,000');
    expect(wrapper.text()).toContain('OUT 250');
    expect(wrapper.text()).toContain('CACHE 3,425');
    expect(wrapper.text()).toContain('$0.0370');
  });
});
