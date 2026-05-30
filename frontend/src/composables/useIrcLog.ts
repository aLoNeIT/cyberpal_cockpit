import { ref, computed } from 'vue';
import type { Ref, ComputedRef } from 'vue';
import { v4 as uuidv4 } from 'uuid';
import type { IrcMessage, IrcMessageType } from '@/types';

export interface IrcFilter {
  from?: string;
  to?: string;
  type?: IrcMessageType | 'all';
}

export function useIrcLog() {
  const messages: Ref<IrcMessage[]> = ref([]);
  const filter: Ref<IrcFilter> = ref({});
  const maxMessages = 1000;

  function addMessage(type: IrcMessageType, from: string, to: string | undefined, message: string): void {
    const msg: IrcMessage = {
      id: uuidv4(),
      type,
      from,
      to,
      message,
      timestamp: Date.now(),
    };

    messages.value.unshift(msg);

    // 超出上限时移除最早的消息
    if (messages.value.length > maxMessages) {
      messages.value = messages.value.slice(0, maxMessages);
    }
  }

  const filteredMessages: ComputedRef<IrcMessage[]> = computed(() => {
    let result = messages.value;

    if (filter.value.from) {
      result = result.filter((m) => m.from === filter.value.from);
    }
    if (filter.value.to) {
      result = result.filter((m) => m.to === filter.value.to);
    }
    if (filter.value.type && filter.value.type !== 'all') {
      result = result.filter((m) => m.type === filter.value.type);
    }

    return result;
  });

  function setFilter(partial: Partial<IrcFilter>): void {
    filter.value = { ...filter.value, ...partial };
  }

  function clearFilter(): void {
    filter.value = {};
  }

  function clearAll(): void {
    messages.value = [];
    filter.value = {};
  }

  return {
    messages,
    filter,
    filteredMessages,
    addMessage,
    setFilter,
    clearFilter,
    clearAll,
  };
}
