'use client';

import { useRef, useMemo, useEffect, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useAtomValue, useSetAtom } from 'jotai';
import { ConversationItem, type ConversationItemProps } from './ConversationItem';
import { ChatRequestsBanner } from './ChatRequestsBanner';
import { selectedConversationIdAtom } from '@/stores/ui';
import { VIRTUALIZATION } from '@/config/constants';
import { useConversations } from '@/hooks/useConversations';
import { Loader2, SearchX } from 'lucide-react';
import { getCachedUsername } from '@/lib/username/service';

interface ConversationListProps {
  requestCount?: number;
  newRequestCount?: number;
  onRequestsClick?: () => void;
  searchQuery?: string;
  bottomPadding?: number;
}

export function ConversationList({
  requestCount = 0,
  newRequestCount = 0,
  onRequestsClick,
  searchQuery = '',
  bottomPadding = 0,
}: ConversationListProps) {
  const parentRef = useRef<HTMLDivElement>(null);
  const selectedId = useAtomValue(selectedConversationIdAtom);
  const setSelectedId = useSetAtom(selectedConversationIdAtom);

  // Use conversations hook - it handles all loading and provides metadata
  const { conversationIds, metadata, isLoading } = useConversations();

  // Track username cache for search
  const [usernameCacheVersion, setUsernameCacheVersion] = useState(0);

  // Refresh username cache periodically when searching
  useEffect(() => {
    if (!searchQuery) return;
    // Trigger a re-render to pick up newly cached usernames
    const interval = setInterval(() => {
      setUsernameCacheVersion(v => v + 1);
    }, 500);
    return () => clearInterval(interval);
  }, [searchQuery]);

  // Filter conversations based on search query and consent state
  // Main list only shows Allowed conversations (Unknown go to requests)
  const filteredIds = useMemo(() => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const _version = usernameCacheVersion; // Dependency to trigger re-filter

    // First filter out Unknown consent (message requests)
    const allowedIds = conversationIds.filter((id) => {
      const data = metadata.get(id);
      // Only show allowed conversations in main list
      return data && data.consentState !== 'unknown';
    });

    if (!searchQuery.trim()) return allowedIds;

    const query = searchQuery.toLowerCase().trim();

    return allowedIds.filter((id) => {
      const data = metadata.get(id);
      if (!data) return false;

      // For groups, search by group name
      if (data.conversationType === 'group') {
        const groupName = data.groupName?.toLowerCase() ?? '';
        return groupName.includes(query);
      }

      // For DMs, search by username (from cache) or address
      if (data.peerAddress) {
        const address = data.peerAddress.toLowerCase();
        // Check if address matches
        if (address.includes(query)) return true;

        // Check if cached username matches
        const cached = getCachedUsername(data.peerAddress);
        if (cached?.username?.toLowerCase().includes(query)) return true;
      }

      return false;
    });
  }, [conversationIds, metadata, searchQuery, usernameCacheVersion]);

  // Format timestamp for display using user's locale
  const formatTimestamp = (ns: bigint): string => {
    if (ns === BigInt(0)) return '';
    const date = new Date(Number(ns / BigInt(1_000_000)));
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();

    if (isToday) {
      // Use user's locale for time format (12h vs 24h based on locale)
      return date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
    }

    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    if (date.toDateString() === yesterday.toDateString()) {
      return 'Yesterday';
    }

    // Use user's locale for date format
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  };

  // Build conversation props from data
  const getConversationProps = (id: string): ConversationItemProps | null => {
    const data = metadata.get(id);
    if (!data) return null;

    // Base props common to all conversation types
    const baseProps = {
      id: data.id,
      conversationType: data.conversationType,
      lastMessage: data.lastMessagePreview ?? undefined,
      timestamp: formatTimestamp(data.lastActivityNs),
      unreadCount: data.unreadCount ?? 0,
    };

    // Add type-specific props
    if (data.conversationType === 'group') {
      return {
        ...baseProps,
        groupName: data.groupName,
        memberCount: data.memberCount,
        memberPreviews: data.memberPreviews,
        avatarUrl: data.groupImageUrl,
      };
    }

    // DM props - isVerified is derived from useUsername in ConversationItem
    return {
      ...baseProps,
      peerAddress: data.peerAddress,
    };
  };

  const virtualizer = useVirtualizer({
    count: filteredIds.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => VIRTUALIZATION.CONVERSATION_ITEM_HEIGHT,
    overscan: VIRTUALIZATION.OVERSCAN_COUNT,
  });

  // Show loading state
  if (isLoading && conversationIds.length === 0) {
    return (
      <div className="flex flex-col h-full items-center justify-center">
        <Loader2 className="w-6 h-6 text-[#005CFF] animate-spin" />
        <p className="text-sm text-[#717680] mt-2">Loading conversations...</p>
      </div>
    );
  }

  // Show empty state (no conversations at all)
  if (!isLoading && conversationIds.length === 0) {
    return (
      <div className="flex flex-col h-full items-center justify-center px-6 text-center">
        <p className="text-[#717680]">No conversations yet</p>
        <p className="text-sm text-[#9BA3AE] mt-1">Start a new conversation to begin chatting</p>
      </div>
    );
  }

  // Show no search results state
  if (searchQuery && filteredIds.length === 0) {
    return (
      <div className="flex flex-col h-full items-center justify-center px-6 text-center">
        <SearchX className="w-10 h-10 text-[#9BA3AE] mb-3" />
        <p className="text-[#717680]">No results found</p>
        <p className="text-sm text-[#9BA3AE] mt-1">Try a different search term</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Chat Requests Banner */}
      {requestCount > 0 && (
        <div className="shrink-0 border-b border-gray-100">
          <ChatRequestsBanner count={requestCount} newCount={newRequestCount} onClick={onRequestsClick} />
        </div>
      )}

      {/* Virtualized Conversation List */}
      <div
        ref={parentRef}
        className="flex-1 overflow-auto"
      >
        <div
          style={{
            height: virtualizer.getTotalSize() + bottomPadding,
            position: 'relative',
          }}
        >
          {virtualizer.getVirtualItems().map((virtualRow) => {
            const id = filteredIds[virtualRow.index];
            const props = getConversationProps(id);

            // Skip rendering if data not loaded yet
            if (!props) {
              return (
                <div
                  key={id}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: virtualRow.size,
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
                  className="flex items-center px-4"
                >
                  <div className="w-10 h-10 rounded-full bg-gray-100 animate-pulse" />
                  <div className="ml-3 flex-1">
                    <div className="h-4 w-24 bg-gray-100 rounded animate-pulse" />
                    <div className="h-3 w-32 bg-gray-100 rounded animate-pulse mt-1" />
                  </div>
                </div>
              );
            }

            return (
              <div
                key={id}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  height: virtualRow.size,
                  transform: `translateY(${virtualRow.start}px)`,
                }}
              >
                <ConversationItem
                  {...props}
                  isSelected={selectedId === id}
                  onClick={() => setSelectedId(id)}
                />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

