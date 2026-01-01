'use client';

import { useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useAtomValue, useSetAtom } from 'jotai';
import { ConversationItem, type ConversationItemProps } from './ConversationItem';
import { ChatRequestsBanner } from './ChatRequestsBanner';
import { selectedConversationIdAtom } from '@/stores/ui';
import { VIRTUALIZATION } from '@/config/constants';
import { useConversations } from '@/hooks/useConversations';
import { Loader2 } from 'lucide-react';

interface ConversationListProps {
  requestCount?: number;
  onRequestsClick?: () => void;
}

export function ConversationList({
  requestCount = 0,
  onRequestsClick
}: ConversationListProps) {
  const parentRef = useRef<HTMLDivElement>(null);
  const selectedId = useAtomValue(selectedConversationIdAtom);
  const setSelectedId = useSetAtom(selectedConversationIdAtom);

  // Use conversations hook - it handles all loading and provides metadata
  const { conversationIds, metadata, isLoading } = useConversations();

  // Format timestamp for display
  const formatTimestamp = (ns: bigint): string => {
    if (ns === BigInt(0)) return '';
    const date = new Date(Number(ns / BigInt(1_000_000)));
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();

    if (isToday) {
      return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
    }

    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    if (date.toDateString() === yesterday.toDateString()) {
      return 'Yesterday';
    }

    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
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

    // DM props
    return {
      ...baseProps,
      peerAddress: data.peerAddress,
      isVerified: true, // TODO: Check verification status
    };
  };

  const virtualizer = useVirtualizer({
    count: conversationIds.length,
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

  // Show empty state
  if (!isLoading && conversationIds.length === 0) {
    return (
      <div className="flex flex-col h-full items-center justify-center px-6 text-center">
        <p className="text-[#717680]">No conversations yet</p>
        <p className="text-sm text-[#9BA3AE] mt-1">Start a new conversation to begin chatting</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Chat Requests Banner */}
      {requestCount > 0 && (
        <div className="shrink-0 border-b border-gray-100">
          <ChatRequestsBanner count={requestCount} onClick={onRequestsClick} />
        </div>
      )}

      {/* Virtualized Conversation List */}
      <div
        ref={parentRef}
        className="flex-1 overflow-auto"
      >
        <div
          style={{
            height: virtualizer.getTotalSize(),
            position: 'relative',
          }}
        >
          {virtualizer.getVirtualItems().map((virtualRow) => {
            const id = conversationIds[virtualRow.index];
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

