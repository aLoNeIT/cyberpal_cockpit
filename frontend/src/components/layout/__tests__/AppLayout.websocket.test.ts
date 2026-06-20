import { mount } from '@vue/test-utils';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { ref } from 'vue';
import AppLayout from '../AppLayout.vue';
import type { AgentConversationEvent, WSMessage } from '@/types';

vi.mock('../TopBar.vue', () => ({ default: { template: '<div><slot /></div>' } }));
vi.mock('../LeftPanel.vue', () => ({ default: { template: '<div><slot /></div>' } }));
vi.mock('../CenterPanel.vue', () => ({ default: { template: '<div><slot /></div>' } }));
vi.mock('../RightPanel.vue', () => ({ default: { template: '<div><slot /></div>' } }));
vi.mock('@/components/common/ResizeHandle.vue', () => ({ default: { template: '<div><slot /></div>' } }));
vi.mock('@/components/agent/AgentLauncher.vue', () => ({ default: { template: '<div><slot /></div>' } }));
vi.mock('@/components/preview/CodePreview.vue', () => ({ default: { template: '<div><slot /></div>' } }));
vi.mock('@/components/irc/IrcLogPanel.vue', () => ({ default: { template: '<div><slot /></div>' } }));
vi.mock('@/components/conflict/ConflictToast.vue', () => ({ default: { template: '<div><slot /></div>' } }));
vi.mock('@/components/budget/BudgetPanel.vue', () => ({ default: { template: '<div><slot /></div>' } }));
vi.mock('@/components/settings/SettingsPage.vue', () => ({ default: { template: '<div><slot /></div>' } }));

const handlers = new Map<string, (message: WSMessage) => void>();

const wsMock = {
  connected: ref(true),
  connect: vi.fn(),
  subscribe: vi.fn(),
  unsubscribe: vi.fn(),
  onMessage: vi.fn((type: string, handler: (message: WSMessage) => void) => {
    handlers.set(type, handler);
  }),
  offMessage: vi.fn(),
};

const agentsMock = {
  agents: ref(new Map()),
  agentList: ref([]),
  terminalOutputs: ref(new Map()),
  markdownOutputs: ref(new Map()),
  conversationEvents: ref(new Map()),
  sendStates: ref(new Map()),
  launchError: ref(null),
  activeConflicts: ref([]),
  loadAgents: vi.fn().mockResolvedValue([]),
  appendOutput: vi.fn(),
  appendConversationEvent: vi.fn().mockReturnValue(true),
  appendFormalOutput: vi.fn(),
  updateStatus: vi.fn(),
  handleTaskSpawn: vi.fn(),
  handleTaskResult: vi.fn(),
  handleIrc: vi.fn(),
  handleConflict: vi.fn(),
  clearLaunchError: vi.fn(),
  createAgent: vi.fn(),
  killAgent: vi.fn(),
  sendStdin: vi.fn(),
  dismissConflict: vi.fn(),
};

vi.mock('@/composables/useLayout', () => ({
  useLayout: () => ({
    mode: ref('grid'),
    leftWidth: ref(240),
    rightWidth: ref(320),
    rightPanelOpen: ref(false),
    ircPanelOpen: ref(false),
    budgetPanelOpen: ref(false),
    activeAgentId: ref(null),
    leftPanelTab: ref('workspaces'),
    ensureActiveAgent: vi.fn(),
    toggleMode: vi.fn(),
    toggleRightPanel: vi.fn(),
    toggleIrcPanel: vi.fn(),
    setActiveAgent: vi.fn(),
    setMode: vi.fn(),
    setLeftWidth: vi.fn(),
    setRightWidth: vi.fn(),
    setLeftPanelTab: vi.fn(),
  }),
}));

vi.mock('@/composables/useWorkspaces', () => ({
  useWorkspaces: () => ({
    workspaces: ref([]),
    loadFromStorage: vi.fn(),
    syncFromServer: vi.fn(),
    getTree: vi.fn(),
    getCachedTree: vi.fn(() => []),
    addWorkspace: vi.fn(),
    removeWorkspace: vi.fn(),
  }),
}));

vi.mock('@/composables/useAgents', () => ({
  useAgents: () => agentsMock,
}));

vi.mock('@/composables/useWebSocket', () => ({
  useWebSocket: () => wsMock,
}));

vi.mock('@/composables/useFilePreview', () => ({
  useFilePreview: () => ({
    currentFile: ref(null),
    openFile: vi.fn(),
  }),
}));

vi.mock('@/composables/useSessionTree', () => ({
  useSessionTree: () => ({
    agentTree: ref([]),
  }),
}));

vi.mock('@/composables/useIrcLog', () => ({
  useIrcLog: () => ({
    filteredMessages: ref([]),
    filter: ref({}),
    addMessage: vi.fn(),
    setFilter: vi.fn(),
    clearFilter: vi.fn(),
  }),
}));

vi.mock('@/composables/useBudget', () => ({
  useBudget: () => ({
    tokenRecords: ref(new Map()),
    init: vi.fn(),
    onTokenUpdate: vi.fn(),
    onBudgetWarning: vi.fn(),
  }),
}));

function mountLayout() {
  return mount(AppLayout, {
    global: {
      stubs: {
        TopBar: true,
        LeftPanel: true,
        CenterPanel: true,
        RightPanel: true,
        ResizeHandle: true,
        AgentLauncher: true,
        CodePreview: true,
        IrcLogPanel: true,
        ConflictToast: true,
        BudgetPanel: true,
        SettingsPage: true,
      },
    },
  });
}

describe('AppLayout WebSocket routing', () => {
  beforeEach(() => {
    handlers.clear();
    vi.clearAllMocks();
    agentsMock.loadAgents.mockResolvedValue([]);
    agentsMock.appendConversationEvent.mockReturnValue(true);
  });

  it('routes raw stdout to terminal only and formal assistant content from structured events', () => {
    mountLayout();

    handlers.get('agent:stdout')?.({
      type: 'agent:stdout',
      agentId: 'agent-1',
      payload: { data: 'Final answer' },
      timestamp: 1,
    });

    expect(agentsMock.appendOutput).toHaveBeenCalledWith('agent-1', 'Final answer', false);
    expect(agentsMock.appendFormalOutput).not.toHaveBeenCalled();

    const assistantEvent: AgentConversationEvent = {
      id: 'evt-1',
      agentId: 'agent-1',
      kind: 'assistant',
      title: 'Assistant',
      content: 'Final answer',
      status: 'running',
      createdAt: 2,
    };

    handlers.get('agent:event')?.({
      type: 'agent:event',
      agentId: 'agent-1',
      payload: assistantEvent,
      timestamp: 2,
    });

    expect(agentsMock.appendConversationEvent).toHaveBeenCalledWith(assistantEvent, false);
    expect(agentsMock.appendFormalOutput).toHaveBeenCalledWith('agent-1', 'Final answer');
  });

  it('routes completed assistant structured events to terminal output when no raw stdout arrived', () => {
    mountLayout();
    agentsMock.appendOutput.mockClear();

    const assistantEvent: AgentConversationEvent = {
      id: 'evt-turn-end',
      agentId: 'agent-1',
      kind: 'assistant',
      title: 'Assistant',
      content: 'Final answer from turn end',
      status: 'completed',
      createdAt: 2,
    };

    handlers.get('agent:event')?.({
      type: 'agent:event',
      agentId: 'agent-1',
      payload: assistantEvent,
      timestamp: 2,
    });

    expect(agentsMock.appendConversationEvent).toHaveBeenCalledWith(assistantEvent, false);
    expect(agentsMock.appendFormalOutput).toHaveBeenCalledWith('agent-1', 'Final answer from turn end');
    expect(agentsMock.appendOutput).toHaveBeenCalledWith('agent-1', 'Final answer from turn end', false);
  });

  it('does not append formal output for duplicate structured events', () => {
    agentsMock.appendConversationEvent.mockReturnValue(false);
    mountLayout();

    handlers.get('agent:event')?.({
      type: 'agent:event',
      agentId: 'agent-1',
      payload: {
        id: 'evt-1',
        agentId: 'agent-1',
        kind: 'assistant',
        content: 'Final answer',
        createdAt: 1,
      },
      timestamp: 1,
    });

    expect(agentsMock.appendFormalOutput).not.toHaveBeenCalled();
  });

  it('unregisters WebSocket handlers when the layout unmounts', () => {
    const wrapper = mountLayout();
    const registered = [...handlers.entries()];

    wrapper.unmount();

    for (const [type, handler] of registered) {
      expect(wsMock.offMessage).toHaveBeenCalledWith(type, handler);
    }
  });
});
