import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useIrcLog } from '../useIrcLog';
import type { IrcMessage } from '@/types';

// Mock uuid
vi.mock('uuid', () => {
  let counter = 0;
  return {
    v4: vi.fn(() => {
      counter++;
      return `irc-msg-${counter}`;
    }),
  };
});

describe('useIrcLog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ============ addMessage ============

  describe('addMessage', () => {
    it('should add a message with correct fields', () => {
      const { addMessage, messages } = useIrcLog();
      addMessage('dm', 'agent-1', 'agent-2', 'Hello there!');

      expect(messages.value).toHaveLength(1);
      const msg = messages.value[0];
      expect(msg.type).toBe('dm');
      expect(msg.from).toBe('agent-1');
      expect(msg.to).toBe('agent-2');
      expect(msg.message).toBe('Hello there!');
      expect(msg.id).toBeDefined();
      expect(typeof msg.timestamp).toBe('number');
    });

    it('should handle broadcast messages (to is undefined)', () => {
      const { addMessage, messages } = useIrcLog();
      addMessage('broadcast', 'agent-1', undefined, 'Announcement!');

      expect(messages.value).toHaveLength(1);
      expect(messages.value[0].type).toBe('broadcast');
      expect(messages.value[0].to).toBeUndefined();
    });

    it('should prepend messages (newest first)', () => {
      const { addMessage, messages } = useIrcLog();
      addMessage('dm', 'a', 'b', 'First');
      addMessage('dm', 'c', 'd', 'Second');

      expect(messages.value).toHaveLength(2);
      expect(messages.value[0].message).toBe('Second'); // newest first
      expect(messages.value[1].message).toBe('First');
    });

    it('should cap messages at 1000', () => {
      const { addMessage, messages } = useIrcLog();

      // Add 1100 messages
      for (let i = 0; i < 1100; i++) {
        addMessage('dm', 'from', 'to', `Message ${i}`);
      }

      expect(messages.value.length).toBeLessThanOrEqual(1000);
      // Oldest should be dropped, newest should be message 1099
      expect(messages.value[0].message).toBe('Message 1099');
    });
  });

  // ============ filteredMessages ============

  describe('filteredMessages', () => {
    it('should return all messages when no filter set', () => {
      const { addMessage, filteredMessages } = useIrcLog();
      addMessage('dm', 'a', 'b', 'msg1');
      addMessage('broadcast', 'c', undefined, 'msg2');

      expect(filteredMessages.value).toHaveLength(2);
    });

    it('should filter by from', () => {
      const { addMessage, filteredMessages, setFilter } = useIrcLog();
      addMessage('dm', 'agent-a', 'b', 'from A');
      addMessage('dm', 'agent-b', 'c', 'from B');
      addMessage('dm', 'agent-a', 'd', 'from A again');

      setFilter({ from: 'agent-a' });

      expect(filteredMessages.value).toHaveLength(2);
      expect(filteredMessages.value.every((m) => m.from === 'agent-a')).toBe(true);
    });

    it('should filter by to', () => {
      const { addMessage, filteredMessages, setFilter } = useIrcLog();
      addMessage('dm', 'a', 'recipient-x', 'to X');
      addMessage('dm', 'b', 'recipient-y', 'to Y');

      setFilter({ to: 'recipient-x' });

      expect(filteredMessages.value).toHaveLength(1);
      expect(filteredMessages.value[0].to).toBe('recipient-x');
    });

    it('should filter by type', () => {
      const { addMessage, filteredMessages, setFilter } = useIrcLog();
      addMessage('dm', 'a', 'b', 'dm msg');
      addMessage('broadcast', 'c', undefined, 'broadcast msg');
      addMessage('dm', 'd', 'e', 'another dm');

      setFilter({ type: 'dm' });

      expect(filteredMessages.value).toHaveLength(2);
      expect(filteredMessages.value.every((m) => m.type === 'dm')).toBe(true);
    });

    it('should show all when filter type is "all"', () => {
      const { addMessage, filteredMessages, setFilter } = useIrcLog();
      addMessage('dm', 'a', 'b', 'dm');
      addMessage('broadcast', 'c', undefined, 'broadcast');

      setFilter({ type: 'all' });

      expect(filteredMessages.value).toHaveLength(2);
    });

    it('should combine multiple filters', () => {
      const { addMessage, filteredMessages, setFilter } = useIrcLog();
      addMessage('dm', 'agent-x', 'target-1', 'match');
      addMessage('dm', 'agent-y', 'target-1', 'wrong from');
      addMessage('broadcast', 'agent-x', undefined, 'wrong type');

      setFilter({ from: 'agent-x', type: 'dm', to: 'target-1' });

      expect(filteredMessages.value).toHaveLength(1);
      expect(filteredMessages.value[0].message).toBe('match');
    });
  });

  // ============ setFilter / clearFilter ============

  describe('setFilter and clearFilter', () => {
    it('should merge with existing filter', () => {
      const { filter, setFilter } = useIrcLog();
      setFilter({ from: 'agent-a' });
      setFilter({ type: 'dm' });

      expect(filter.value.from).toBe('agent-a');
      expect(filter.value.type).toBe('dm');
    });

    it('should clear all filters', () => {
      const { filter, setFilter, clearFilter } = useIrcLog();
      setFilter({ from: 'agent-a', type: 'dm' });
      clearFilter();

      expect(filter.value).toEqual({});
    });
  });

  // ============ clearAll ============

  describe('clearAll', () => {
    it('should clear all messages and filters', () => {
      const { addMessage, setFilter, clearAll, messages, filter } = useIrcLog();
      addMessage('dm', 'a', 'b', 'test');
      setFilter({ from: 'a' });

      clearAll();

      expect(messages.value).toEqual([]);
      expect(filter.value).toEqual({});
    });
  });
});
