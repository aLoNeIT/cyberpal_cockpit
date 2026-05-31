import { ref } from 'vue';
import type { Ref } from 'vue';
import { getWSClient, type MessageHandler } from '@/services/ws';
import type { WSMessage } from '@/types';

export function useWebSocket() {
  const client = getWSClient();
  const connected: Ref<boolean> = ref(false);

  client.onConnected = () => {
    connected.value = true;
  };

  client.onDisconnected = () => {
    connected.value = false;
  };

  function connect(): void {
    client.connect();
  }

  function disconnect(): void {
    client.disconnect();
  }

  function onMessage(type: string, handler: (message: WSMessage) => void): void {
    client.on(type, handler as MessageHandler);
  }

  function offMessage(type: string, handler: (message: WSMessage) => void): void {
    client.off(type, handler as MessageHandler);
  }

  function send(message: Partial<WSMessage> & { type: string }): void {
    client.send(message);
  }

  function subscribe(agentId: string): void {
    client.subscribe(agentId);
  }

  function unsubscribe(agentId: string): void {
    client.unsubscribe(agentId);
  }

  function reconnect(): void {
    client.disconnect();
    client.connect();
  }

  return {
    connected,
    connect,
    disconnect,
    onMessage,
    offMessage,
    send,
    subscribe,
    unsubscribe,
    reconnect,
  };
}
