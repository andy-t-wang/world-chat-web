'use client';

import { useAtomValue } from 'jotai';
import { useMemo, useRef } from 'react';
import {
  conversationIdsAtom,
  isLoadingConversationsAtom,
  conversationsErrorAtom,
} from '@/stores/conversations';
import { streamManager } from '@/lib/xmtp/StreamManager';

// Debug counter for hook tracking
let useConversationsCallCount = 0;
let useConversationMetadataCallCount = 0;

/**
 * Conversation metadata returned by the hook
 */
export interface ConversationMetadata {
  id: string;
  peerAddress: string;
  peerInboxId: string;
  lastMessagePreview: string;
  lastActivityNs: bigint;
}

/**
 * Hook to access conversations list
 *
 * This is a simple subscription hook - all data loading is handled by StreamManager.
 * Components using this hook will automatically re-render when conversations change.
 */
export function useConversations() {
  const callId = ++useConversationsCallCount;
  console.log(`[useConversations#${callId}] Hook called`);

  const conversationIds = useAtomValue(conversationIdsAtom);
  const isLoading = useAtomValue(isLoadingConversationsAtom);
  const error = useAtomValue(conversationsErrorAtom);

  console.log(`[useConversations#${callId}] conversationIds.length=${conversationIds.length}, isLoading=${isLoading}`);

  // Cache metadata reference to avoid creating new Map on every render
  // Only update when conversationIds changes (indicating new conversations loaded)
  const metadataRef = useRef<Map<string, ConversationMetadata>>(new Map());

  const metadata = useMemo(() => {
    // Get fresh metadata from StreamManager
    metadataRef.current = streamManager.getAllConversationMetadata();
    return metadataRef.current;
  }, [conversationIds]); // Only refresh when conversation list changes

  return {
    conversationIds,
    metadata,
    isLoading,
    error,
  };
}

/**
 * Hook to get metadata for a single conversation
 * Uses conversationIds subscription to detect when to re-check metadata
 */
export function useConversationMetadata(conversationId: string | null): ConversationMetadata | null {
  const callId = ++useConversationMetadataCallCount;
  console.log(`[useConversationMetadata#${callId}] Hook called for ${conversationId?.slice(0, 8) ?? 'null'}`);

  // Subscribe to conversationIds to know when conversations are loaded
  const conversationIds = useAtomValue(conversationIdsAtom);
  console.log(`[useConversationMetadata#${callId}] conversationIds.length=${conversationIds.length}`);

  // Memoize the result to prevent unnecessary re-renders
  const metadata = useMemo(() => {
    if (!conversationId) return null;
    // Only try to get metadata if the conversation exists in our list
    if (!conversationIds.includes(conversationId)) {
      console.log(`[useConversationMetadata#${callId}] Conversation not in list`);
      return null;
    }
    const result = streamManager.getConversationMetadata(conversationId) ?? null;
    console.log(`[useConversationMetadata#${callId}] Got metadata: ${result ? 'exists' : 'null'}`);
    return result;
  }, [conversationId, conversationIds]);

  return metadata;
}
