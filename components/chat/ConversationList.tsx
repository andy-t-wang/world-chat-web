'use client';

import { useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useAtomValue, useSetAtom } from 'jotai';
import { ConversationItem, type ConversationItemProps } from './ConversationItem';
import { ChatRequestsBanner } from './ChatRequestsBanner';
import {
  filteredConversationIdsAtom,
  conversationMetadataAtom,
} from '@/stores/conversations';
import { selectedConversationIdAtom } from '@/stores/ui';
import { VIRTUALIZATION } from '@/config/constants';

interface ConversationListProps {
  requestCount?: number;
  onRequestsClick?: () => void;
}

// Demo data for initial UI development
// Using mock wallet addresses - in production these come from XMTP conversations
const DEMO_CONVERSATIONS: ConversationItemProps[] = [
  {
    id: '1',
    peerAddress: '0x1234567890123456789012345678901234567890',
    name: 'Dave', // Override name for demo (normally fetched from username API)
    isVerified: true,
    lastMessage: 'Ok!',
    timestamp: '16:14',
    isPinned: true,
  },
  {
    id: '2',
    peerAddress: '0x2345678901234567890123456789012345678901',
    name: 'Ethan Carter',
    isVerified: true,
    lastMessage: 'I mean he wrecked it!',
    timestamp: '16:14',
    unreadCount: 2,
    isMuted: true,
  },
  {
    id: '3',
    peerAddress: '0x3456789012345678901234567890123456789012',
    name: 'Alex',
    isVerified: true,
    isTyping: true,
    typingUser: 'Alex',
    timestamp: '16:14',
  },
  {
    id: '4',
    peerAddress: '0x4567890123456789012345678901234567890123',
    name: 'Munichers',
    isVerified: true,
    isTyping: true,
    typingUser: 'Pal',
    timestamp: '11:23',
    avatarUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=munichers',
  },
  {
    id: '5',
    peerAddress: '0x5678901234567890123456789012345678901234',
    name: 'Tiago',
    isVerified: true,
    lastMessageType: 'reaction',
    reactionEmoji: '🔥',
    reactionTarget: "That's good ad...",
    timestamp: '16:14',
    avatarUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=tiago',
  },
  {
    id: '6',
    peerAddress: '0x6789012345678901234567890123456789012345',
    name: 'Mr. Strickland',
    isVerified: true,
    lastMessageType: 'deleted',
    timestamp: '16:14',
    avatarUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=strickland',
  },
  {
    id: '7',
    peerAddress: '0x7890123456789012345678901234567890123456',
    name: 'Peter',
    isVerified: true,
    lastMessageType: 'image',
    lastMessage: '1 photo, 1 video',
    timestamp: '14',
  },
];

export function ConversationList({
  requestCount = 2,
  onRequestsClick
}: ConversationListProps) {
  const parentRef = useRef<HTMLDivElement>(null);
  const selectedId = useAtomValue(selectedConversationIdAtom);
  const setSelectedId = useSetAtom(selectedConversationIdAtom);

  // In production, this would come from the store
  // const conversationIds = useAtomValue(filteredConversationIdsAtom);
  const conversations = DEMO_CONVERSATIONS;

  const virtualizer = useVirtualizer({
    count: conversations.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => VIRTUALIZATION.CONVERSATION_ITEM_HEIGHT,
    overscan: VIRTUALIZATION.OVERSCAN_COUNT,
  });

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
            const conversation = conversations[virtualRow.index];
            return (
              <div
                key={conversation.id}
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
                  {...conversation}
                  isSelected={selectedId === conversation.id}
                  onClick={() => setSelectedId(conversation.id)}
                />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
