'use client';

import { useAtomValue } from 'jotai';
import { useMemo, useRef, useEffect } from 'react';
import {
  conversationIdsAtom,
  isLoadingConversationsAtom,
  conversationsErrorAtom,
  conversationMetadataVersionAtom,
} from '@/stores/conversations';
import { unreadVersionAtom } from '@/stores/messages';
import { streamManager } from '@/lib/xmtp/StreamManager';

// Debug render counter
let metadataHookRenderCount = 0;

/**
 * Member preview for group avatars
 */
export interface MemberPreview {
  inboxId: string;
  address: string;
}

/**
 * Conversation metadata returned by the hook
 */
export interface ConversationMetadata {
  id: string;
  conversationType: 'dm' | 'group';
  // For DMs
  peerAddress: string;
  peerInboxId: string;
  // For Groups
  groupName?: string;
  groupImageUrl?: string;
  memberCount?: number;
  memberPreviews?: MemberPreview[];
  // Common
  lastMessagePreview: string;
  lastActivityNs: bigint;
  unreadCount: number;
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
  // Subscribe to unread version to re-render when unread counts change
  const unreadVersion = useAtomValue(unreadVersionAtom);

  // Cache metadata reference to avoid creating new Map on every render
  const metadataRef = useRef<Map<string, ConversationMetadata>>(new Map());

  const metadata = useMemo(() => {
    // Get fresh metadata from StreamManager
    metadataRef.current = streamManager.getAllConversationMetadata();
    return metadataRef.current;
  }, [conversationIds, metadataVersion, unreadVersion]); // Refresh when list, metadata, or unread changes

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
  // Subscribe to metadata version to re-render when metadata changes
  const metadataVersion = useAtomValue(conversationMetadataVersionAtom);

  metadataHookRenderCount++;
  console.log(`[useConversationMetadata] Render #${metadataHookRenderCount}, id=${conversationId?.slice(0,8)}, version=${metadataVersion}`);

  // Memoize the result to prevent unnecessary re-renders
  const metadata = useMemo(() => {
    if (!conversationId) return null;
    // Only try to get metadata if the conversation exists in our list
    if (!conversationIds.includes(conversationId)) {
      return null;
    }
    return streamManager.getConversationMetadata(conversationId) ?? null;
  }, [conversationId, conversationIds, metadataVersion]);

  return metadata;
}
