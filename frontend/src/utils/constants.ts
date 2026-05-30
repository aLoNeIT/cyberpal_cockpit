export const LAYOUT = {
  leftPanel: {
    defaultWidth: 260,
    minWidth: 200,
    maxWidth: 400,
  },
  rightPanel: {
    defaultWidth: 400,
    minWidth: 300,
    maxWidth: 600,
  },
  grid: {
    minCellWidth: 400,
    gap: 12,
    padding: 16,
  },
} as const;

export const CONNECTION = {
  wsUrl: `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/ws`,
  reconnectBaseDelay: 1000,
  reconnectMaxDelay: 30000,
  reconnectMaxAttempts: 10,
  heartbeatInterval: 30000,
  heartbeatTimeout: 60000,
} as const;

export const GRID_COLUMNS_MAP: Record<number, number> = {
  0: 1,
  1: 1,
  2: 2,
  3: 2,
  4: 2,
};

export const STORAGE_KEYS = {
  workspaces: 'workspaces',
  layout: 'layout',
} as const;
