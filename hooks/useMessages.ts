'use client';

import { useEffect, useCallback, useState, useMemo, useRef } from 'react';
import { useAtomValue, useAtom } from 'jotai';
import {
  allConversationMessageIdsAtom,
  allConversationPaginationAtom,
  allPendingMessagesAtom,
  messageCache,
} from '@/stores/messages';
import { streamManager } from '@/lib/xmtp/StreamManager';
import type { DecodedMessage } from '@xmtp/browser-sdk';
import type { PendingMessage, PaginationState } from '@/types/messages';

// Debug counter for hook invocation tracking
let useMessagesCallCount = 0;

const DEFAULT_PAGINATION: PaginationState = {
  hasMore: true,
  oldestMessageNs: null,
  isLoading: false,
};

/**
 * MODULE-LEVEL guard to prevent duplicate loads across component instances
 * Similar to the pattern used in useUsername
 */
const loadingConversations = new Set<string>();
const loadedConversations = new Set<string>();

/**
 * Hook to access and manage messages for a conversation
 *
 * This hook:
 * - Subscribes to Map-based atoms (avoids atomFamily multi-instance issues)
 * - Triggers StreamManager to load/stream messages on mount
 * - Provides send/retry actions that delegate to StreamManager
 */
export function useMessages(conversationId: string | null) {
  const callId = ++useMessagesCallCount;
  const renderCountRef = useRef(0);
  renderCountRef.current++;

  console.log(`[useMessages#${callId}] Hook called (render ${renderCountRef.current}) for ${conversationId?.slice(0, 8) ?? 'null'}`);

  // Subscribe to the full Maps - React will only re-render when Maps change
  const messageIdsMap = useAtomValue(allConversationMessageIdsAtom);
  const paginationMap = useAtomValue(allConversationPaginationAtom);
  const [pendingMessagesMap, setPendingMessagesMap] = useAtom(allPendingMessagesAtom);

  console.log(`[useMessages#${callId}] Maps loaded: messageIdsMap.size=${messageIdsMap.size}, paginationMap.size=${paginationMap.size}`);

  // Derive values for this specific conversation
  const messageIds = useMemo(
    () => (conversationId ? messageIdsMap.get(conversationId) ?? [] : []),
    [messageIdsMap, conversationId]
  );

  const pagination = useMemo(
    () => (conversationId ? paginationMap.get(conversationId) ?? DEFAULT_PAGINATION : DEFAULT_PAGINATION),
    [paginationMap, conversationId]
  );

  const pendingMessages = useMemo(
    () => (conversationId ? pendingMessagesMap.get(conversationId) ?? [] : []),
    [pendingMessagesMap, conversationId]
  );

  // Helper to update pending messages for this conversation
  const setPendingMessages = useCallback(
    (updater: (prev: PendingMessage[]) => PendingMessage[]) => {
      if (!conversationId) return;
      setPendingMessagesMap((prevMap) => {
        const newMap = new Map(prevMap);
        const current = prevMap.get(conversationId) ?? [];
        newMap.set(conversationId, updater(current));
        return newMap;
      });
    },
    [conversationId, setPendingMessagesMap]
  );

  // Track initial loading state - derived from module-level guards
  const [isInitialLoading, setIsInitialLoading] = useState(() => {
    // If already loaded or loading, don't show loading state
    if (!conversationId) return false;
    const initial = !loadedConversations.has(conversationId) && !loadingConversations.has(conversationId);
    console.log(`[useMessages#${callId}] Initial isInitialLoading=${initial}`);
    return initial;
  });

  // Load messages when conversation opens
  useEffect(() => {
    console.log(`[useMessages#${callId}] useEffect triggered for ${conversationId?.slice(0, 8) ?? 'null'}`);

    if (!conversationId) {
      console.log(`[useMessages#${callId}] No conversationId, setting isInitialLoading=false`);
      setIsInitialLoading(false);
      return;
    }

    // Use MODULE-LEVEL guards to prevent duplicate loads across instances
    if (loadedConversations.has(conversationId)) {
      console.log(`[useMessages#${callId}] Already loaded, setting isInitialLoading=false`);
      setIsInitialLoading(false);
      return;
    }

    if (loadingConversations.has(conversationId)) {
      console.log(`[useMessages#${callId}] Already loading, skipping`);
      // Another instance is already loading, just wait
      return;
    }

    // Mark as loading
    console.log(`[useMessages#${callId}] Starting load for ${conversationId.slice(0, 8)}`);
    loadingConversations.add(conversationId);
    setIsInitialLoading(true);

    // Tell StreamManager to load messages for this conversation
    streamManager.loadMessagesForConversation(conversationId).finally(() => {
      console.log(`[useMessages#${callId}] Load complete for ${conversationId.slice(0, 8)}`);
      loadingConversations.delete(conversationId);
      loadedConversations.add(conversationId);
      setIsInitialLoading(false);
    });
  }, [conversationId]);

  // Load more (older) messages
  const loadMore = useCallback(async () => {
    if (!conversationId || pagination.isLoading || !pagination.hasMore) return;
    await streamManager.loadMoreMessages(conversationId);
  }, [conversationId, pagination.isLoading, pagination.hasMore]);

  // Send a message
  const sendMessage = useCallback(
    async (content: string): Promise<boolean> => {
      if (!conversationId || !content.trim()) return false;

      // Create pending message for optimistic UI
      const pendingId = `pending-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const pending: PendingMessage = {
        id: pendingId,
        conversationId,
        content: content.trim(),
        status: 'sending',
        sentAtNs: BigInt(Date.now()) * 1_000_000n,
        retryCount: 0,
      };

      setPendingMessages((prev) => [pending, ...prev]);

      try {
        await streamManager.sendMessage(conversationId, content);
        // Remove pending on success (stream will add the real message)
        setPendingMessages((prev) => prev.filter((p) => p.id !== pendingId));
        return true;
      } catch (error) {
        console.error('Failed to send message:', error);
        // Mark as failed
        setPendingMessages((prev) =>
          prev.map((p) =>
            p.id === pendingId ? { ...p, status: 'failed' as const } : p
          )
        );
        return false;
      }
    },
    [conversationId, setPendingMessages]
  );

  // Retry a failed message
  const retryMessage = useCallback(
    async (pendingId: string): Promise<boolean> => {
      const pending = pendingMessages.find((p) => p.id === pendingId);
      if (!pending || pending.status !== 'failed' || !conversationId) return false;

      // Mark as sending
      setPendingMessages((prev) =>
        prev.map((p) =>
          p.id === pendingId
            ? { ...p, status: 'sending' as const, retryCount: p.retryCount + 1 }
            : p
        )
      );

      try {
        await streamManager.sendMessage(conversationId, pending.content);
        setPendingMessages((prev) => prev.filter((p) => p.id !== pendingId));
        return true;
      } catch (error) {
        console.error('Failed to retry message:', error);
        setPendingMessages((prev) =>
          prev.map((p) =>
            p.id === pendingId ? { ...p, status: 'failed' as const } : p
          )
        );
        return false;
      }
    },
    [conversationId, pendingMessages, setPendingMessages]
  );

  // Get a message from cache
  const getMessage = useCallback((messageId: string): DecodedMessage | null => {
    return messageCache.get(messageId) ?? null;
  }, []);

  return {
    messageIds,
    pendingMessages,
    isLoading: pagination.isLoading,
    isInitialLoading,
    hasMore: pagination.hasMore,
    loadMore,
    sendMessage,
    retryMessage,
    getMessage,
  };
}

/**
 * Hook to get a single message by ID
 */
export function useMessage(messageId: string | null) {
  const message = messageId ? messageCache.get(messageId) : null;
  return message;
}
