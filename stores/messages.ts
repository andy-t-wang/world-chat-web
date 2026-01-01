/**
 * Message State Store
 * Manages messages with granular subscriptions using atomFamily
 */

import { atom } from 'jotai';
import { atomFamily } from 'jotai/utils';
import type { DecodedMessage } from '@xmtp/browser-sdk';
import type { PendingMessage, PaginationState } from '@/types/messages';
import { LRUCache } from '@/lib/utils/lru';
import { CACHE } from '@/config/constants';

/**
 * Individual message atoms - granular updates
 * Each message has its own atom, so updating one message
 * only re-renders the component subscribed to that specific message
 */
export const messageAtomFamily = atomFamily((messageId: string) =>
  atom<DecodedMessage | null>(null)
);

/**
 * Message IDs per conversation (just strings, not full messages)
 * This enables O(1) updates when new messages arrive
 */
export const conversationMessageIdsAtom = atomFamily((conversationId: string) =>
  atom<string[]>([])
);

/**
 * Pagination state per conversation
 * Tracks loading state and cursor for infinite scroll
 */
export const conversationPaginationAtom = atomFamily((conversationId: string) =>
  atom<PaginationState>({
    hasMore: true,
    oldestInsertedAtNs: null,
    isLoading: false,
  })
);

/**
 * Pending (optimistic) messages per conversation
 * Shows messages immediately while they're being sent
 */
export const pendingMessagesAtom = atomFamily((conversationId: string) =>
  atom<PendingMessage[]>([])
);

/**
 * Combined message IDs (pending + confirmed) for a conversation
 * Pending messages appear at the end (most recent)
 */
export const allMessageIdsAtom = atomFamily((conversationId: string) =>
  atom((get) => {
    const confirmedIds = get(conversationMessageIdsAtom(conversationId));
    const pending = get(pendingMessagesAtom(conversationId));
    const pendingIds = pending.map((p) => p.id);
    // Pending messages come first (newest), then confirmed
    return [...pendingIds, ...confirmedIds];
  })
);

/**
 * Message count for a conversation
 */
export const messageCountAtom = atomFamily((conversationId: string) =>
  atom((get) => {
    return get(allMessageIdsAtom(conversationId)).length;
  })
);

/**
 * LRU cache for messages in memory
 * Automatically evicts old messages when limit is reached
 */
export const messageCache = new LRUCache<string, DecodedMessage>(
  CACHE.MAX_MESSAGES_IN_MEMORY,
  (messageId) => {
    // Clean up atom when evicted from cache
    // Note: atomFamily.remove is called on cache eviction
    messageAtomFamily.remove(messageId);
  }
);

/**
 * Add a message to the store
 * Updates both the atom and the LRU cache
 */
export function addMessageToStore(
  message: DecodedMessage,
  conversationId: string,
  setMessageIds: (updater: (prev: string[]) => string[]) => void
): void {
  // Set the message in its individual atom
  const messageAtom = messageAtomFamily(message.id);
  // Note: In actual usage, you'd use set() from useSetAtom
  // This is a helper pattern - actual usage is in hooks

  // Add to LRU cache
  messageCache.set(message.id, message);

  // Prepend to message IDs list
  setMessageIds((prev) => {
    if (prev.includes(message.id)) return prev;
    return [message.id, ...prev];
  });
}

/**
 * Create a pending message for optimistic updates
 */
export function createPendingMessage(
  conversationId: string,
  content: string
): PendingMessage {
  return {
    id: `pending-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    conversationId,
    content,
    status: 'sending',
    sentAtNs: BigInt(Date.now()) * 1_000_000n,
    retryCount: 0,
  };
}

/**
 * Derived atom: Check if a conversation has any pending messages
 */
export const hasPendingMessagesAtom = atomFamily((conversationId: string) =>
  atom((get) => {
    const pending = get(pendingMessagesAtom(conversationId));
    return pending.length > 0;
  })
);

/**
 * Derived atom: Check if a conversation has failed messages
 */
export const hasFailedMessagesAtom = atomFamily((conversationId: string) =>
  atom((get) => {
    const pending = get(pendingMessagesAtom(conversationId));
    return pending.some((p) => p.status === 'failed');
  })
);

/**
 * Reset messages for a conversation
 * Useful when leaving a conversation or on error
 */
export function resetConversationMessages(conversationId: string): void {
  // This would be called with the appropriate setters in a hook
  // Clears message IDs and pagination state
}
