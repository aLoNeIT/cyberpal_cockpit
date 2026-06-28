import { computed, ref } from 'vue';
import { getWSClient, type ConnectionChangeEvent, type MessageHandler } from '@/services/ws';
import type {
  TerminalCreatedPayload,
  TerminalCwdPayload,
  TerminalDataPayload,
  TerminalErrorPayload,
  TerminalExitPayload,
} from '@/types';

type TerminalStatus = 'idle' | 'connecting' | 'running' | 'reconnecting' | 'exited' | 'error';

interface TerminalStartOptions {
  cwd?: string;
  cols: number;
  rows: number;
}

interface UsePtyTerminalOptions {
  onData?: (data: string) => void;
  onCwd?: (cwd: string) => void;
}

export function usePtyTerminal(options: UsePtyTerminalOptions = {}) {
  const wsClient = getWSClient();
  const sessionId = ref<string | null>(null);
  const cwd = ref('');
  const status = ref<TerminalStatus>('idle');
  const error = ref<string | null>(null);
  const registered = ref(false);
  let unsubscribeConnectionChange: (() => void) | null = null;
  let lastStartOptions: TerminalStartOptions | null = null;

  const isRunning = computed(() => status.value === 'running');

  const onCreated: MessageHandler = (message) => {
    const payload = message.payload as TerminalCreatedPayload;
    sessionId.value = payload.sessionId;
    cwd.value = payload.cwd;
    status.value = 'running';
    error.value = null;
    options.onCwd?.(payload.cwd);
  };

  const onData: MessageHandler = (message) => {
    const payload = message.payload as TerminalDataPayload;
    if (payload.sessionId !== sessionId.value) return;
    options.onData?.(payload.data);
  };

  const onCwd: MessageHandler = (message) => {
    const payload = message.payload as TerminalCwdPayload;
    if (payload.sessionId !== sessionId.value) return;
    cwd.value = payload.cwd;
    options.onCwd?.(payload.cwd);
  };

  const onExit: MessageHandler = (message) => {
    const payload = message.payload as TerminalExitPayload;
    if (payload.sessionId !== sessionId.value) return;
    sessionId.value = null;
    status.value = 'exited';
  };

  const onError: MessageHandler = (message) => {
    const payload = message.payload as TerminalErrorPayload;
    if (payload.sessionId && payload.sessionId !== sessionId.value) return;
    error.value = payload.message;
    status.value = 'error';
  };

  const onConnectionChange = (event: ConnectionChangeEvent) => {
    if (event.status === 'connected') {
      if (status.value === 'reconnecting' && lastStartOptions) {
        sessionId.value = null;
        start(lastStartOptions);
      }
      return;
    }

    if (event.status === 'reconnecting') {
      sessionId.value = null;
      error.value = 'WebSocket disconnected. Reconnecting terminal session...';
      status.value = 'reconnecting';
      return;
    }

    if (event.status === 'error') {
      error.value = 'WebSocket connection error. Terminal input may be interrupted.';
      if (!sessionId.value && status.value === 'connecting') {
        status.value = 'reconnecting';
        return;
      }
      status.value = sessionId.value ? 'reconnecting' : 'error';
      return;
    }

    if (!sessionId.value && status.value !== 'reconnecting') return;
    sessionId.value = null;
    if (event.reason === 'max-reconnect-attempts') {
      error.value = 'WebSocket reconnect failed. Terminal session stopped; click Restart to try again.';
      status.value = 'error';
      return;
    }

    error.value = 'WebSocket disconnected. Reconnecting terminal session...';
    status.value = 'reconnecting';
  };

  function ensureHandlers(): void {
    if (registered.value) return;
    wsClient.on('terminal:created', onCreated);
    wsClient.on('terminal:data', onData);
    wsClient.on('terminal:cwd', onCwd);
    wsClient.on('terminal:exit', onExit);
    wsClient.on('terminal:error', onError);
    unsubscribeConnectionChange = wsClient.onConnectionChange(onConnectionChange);
    registered.value = true;
  }

  function start(startOptions: TerminalStartOptions): void {
    ensureHandlers();
    lastStartOptions = { ...startOptions };
    wsClient.connect();
    error.value = null;
    status.value = 'connecting';
    wsClient.send({
      type: 'terminal:create',
      payload: {
        cwd: startOptions.cwd,
        cols: startOptions.cols,
        rows: startOptions.rows,
      },
    });
  }

  function sendInput(data: string): void {
    if (!sessionId.value) return;
    wsClient.send({
      type: 'terminal:input',
      payload: { sessionId: sessionId.value, data },
    });
  }

  function resize(cols: number, rows: number): void {
    if (!sessionId.value) return;
    wsClient.send({
      type: 'terminal:resize',
      payload: { sessionId: sessionId.value, cols, rows },
    });
  }

  function requestCwd(): void {
    if (!sessionId.value) return;
    wsClient.send({
      type: 'terminal:cwd-request',
      payload: { sessionId: sessionId.value },
    });
  }

  function kill(): void {
    if (!sessionId.value) return;
    wsClient.send({
      type: 'terminal:kill',
      payload: { sessionId: sessionId.value },
    });
  }

  function restart(startOptions: TerminalStartOptions): void {
    kill();
    sessionId.value = null;
    start(startOptions);
  }

  function dispose(): void {
    lastStartOptions = null;
    kill();
    if (!registered.value) return;
    wsClient.off('terminal:created', onCreated);
    wsClient.off('terminal:data', onData);
    wsClient.off('terminal:cwd', onCwd);
    wsClient.off('terminal:exit', onExit);
    wsClient.off('terminal:error', onError);
    unsubscribeConnectionChange?.();
    unsubscribeConnectionChange = null;
    registered.value = false;
  }

  return {
    sessionId,
    cwd,
    status,
    error,
    isRunning,
    start,
    sendInput,
    resize,
    requestCwd,
    restart,
    kill,
    dispose,
  };
}
