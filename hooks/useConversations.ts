'use client';

import { useAtomValue } from 'jotai';
import { useMemo, useRef } from 'react';
import {
  conversationIdsAtom,
  isLoadingConversationsAtom,
  conversationsErrorAtom,
  conversationMetadataVersionAtom,
} from '@/stores/conversations';
import { streamManager } from '@/lib/xmtp/StreamManager';

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
  const conversationIds = useAtomValue(conversationIdsAtom);
  const isLoading = useAtomValue(isLoadingConversationsAtom);
  const error = useAtomValue(conversationsErrorAtom);
  // Subscribe to metadata version to re-render when any metadata changes
  const metadataVersion = useAtomValue(conversationMetadataVersionAtom);

  // Cache metadata reference to avoid creating new Map on every render
  const metadataRef = useRef<Map<string, ConversationMetadata>>(new Map());

  const metadata = useMemo(() => {
    // Get fresh metadata from StreamManager
    metadataRef.current = streamManager.getAllConversationMetadata();
    return metadataRef.current;
  }, [conversationIds, metadataVersion]); // Refresh when list or metadata changes

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
  // Subscribe to conversationIds to know when conversations are loaded
  const conversationIds = useAtomValue(conversationIdsAtom);

  // Memoize the result to prevent unnecessary re-renders
  const metadata = useMemo(() => {
    if (!conversationId) return null;
    // Only try to get metadata if the conversation exists in our list
    if (!conversationIds.includes(conversationId)) {
      return null;
    }
    return streamManager.getConversationMetadata(conversationId) ?? null;
  }, [conversationId, conversationIds]);

  return metadata;
}
