'use client';

import { useAtomValue, useSetAtom } from 'jotai';
import { useMemo, useRef, useCallback } from 'react';
import {
  conversationIdsAtom,
  isLoadingConversationsAtom,
  conversationsErrorAtom,
  conversationMetadataVersionAtom,
} from '@/stores/conversations';
import { unreadVersionAtom } from '@/stores/messages';
import { seenRequestIdsAtom } from '@/stores/settings';
import { streamManager } from '@/lib/xmtp/StreamManager';

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
  // Consent state for message requests
  consentState: 'allowed' | 'denied' | 'unknown';
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

/**
 * Hook to access message requests (Unknown consent conversations)
 *
 * Returns conversation IDs and metadata for conversations where
 * the user hasn't accepted or rejected the contact yet.
 * Also tracks which requests are "new" (haven't been seen yet).
 */
export function useMessageRequests() {
  // Subscribe to metadata version to re-render when metadata changes
  const metadataVersion = useAtomValue(conversationMetadataVersionAtom);
  // Subscribe to unread version for consistency
  const unreadVersion = useAtomValue(unreadVersionAtom);
  // Get seen request IDs from storage
  const seenRequestIds = useAtomValue(seenRequestIdsAtom);
  const setSeenRequestIds = useSetAtom(seenRequestIdsAtom);

  // Get request conversation IDs and metadata
  const { requestIds, metadata, requestCount, newRequestIds, newRequestCount } = useMemo(() => {
    const ids = streamManager.getRequestConversationIds();
    const meta = streamManager.getAllConversationMetadata();
    const count = ids.length;
    // New requests are those not in the seen list
    const seenSet = new Set(seenRequestIds);
    const newIds = ids.filter(id => !seenSet.has(id));
    return {
      requestIds: ids,
      metadata: meta,
      requestCount: count,
      newRequestIds: newIds,
      newRequestCount: newIds.length,
    };
  }, [metadataVersion, unreadVersion, seenRequestIds]);

  // Mark all current requests as seen
  const markAllAsSeen = useCallback(() => {
    if (requestIds.length === 0) return;
    setSeenRequestIds(prev => {
      const seenSet = new Set(prev);
      requestIds.forEach(id => seenSet.add(id));
      return Array.from(seenSet);
    });
  }, [requestIds, setSeenRequestIds]);

  // Check if a specific request is new
  const isNewRequest = useCallback((id: string) => {
    return !seenRequestIds.includes(id);
  }, [seenRequestIds]);

  return {
    requestIds,
    metadata,
    requestCount,
    newRequestIds,
    newRequestCount,
    markAllAsSeen,
    isNewRequest,
  };
}

/**
 * Hook to check if a conversation is a message request
 */
export function useIsMessageRequest(conversationId: string | null): boolean {
  // Subscribe to metadata version to re-render when consent state changes
  const metadataVersion = useAtomValue(conversationMetadataVersionAtom);

  return useMemo(() => {
    if (!conversationId) return false;
    return streamManager.isMessageRequest(conversationId);
  }, [conversationId, metadataVersion]);
}
