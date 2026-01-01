'use client';

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useAtomValue } from 'jotai';
import { Search, MoreHorizontal, Paperclip, Smile, Send, Loader2, AlertCircle, RotateCcw } from 'lucide-react';
import { Avatar } from '@/components/ui/Avatar';
import { VerificationBadge } from '@/components/ui/VerificationBadge';
import { useUsername } from '@/hooks/useUsername';
import { useMessages } from '@/hooks/useMessages';
import { xmtpClientAtom } from '@/stores/client';
import { VIRTUALIZATION } from '@/config/constants';
import type { DecodedMessage } from '@xmtp/browser-sdk';
import type { PendingMessage } from '@/types/messages';

interface MemberPreview {
  inboxId: string;
  address: string;
}

// Helper component to display sender name in group messages
function GroupMessageSender({ address }: { address: string | undefined }) {
  const { displayName } = useUsername(address);
  const name = displayName ?? (address ? `${address.slice(0, 6)}...${address.slice(-4)}` : 'Unknown');

  return (
    <span className="text-xs font-medium text-[#005CFF] ml-1 mb-1 block">
      {name}
    </span>
  );
}

interface MessagePanelProps {
  conversationId: string;
  /** Type of conversation */
  conversationType: 'dm' | 'group';
  /** Peer's wallet address for username/avatar lookup (DMs) */
  peerAddress?: string;
  /** Override display name */
  name?: string;
  /** Override avatar URL */
  avatarUrl?: string | null;
  isVerified?: boolean;
  subtitle?: string;
  /** Group name (for groups) */
  groupName?: string;
  /** Member count (for groups) */
  memberCount?: number;
  /** Member previews for group avatar */
  memberPreviews?: MemberPreview[];
}

export function MessagePanel({
  conversationId,
  conversationType,
  peerAddress,
  name: nameOverride,
  avatarUrl,
  isVerified = false,
  subtitle,
  groupName,
  memberCount,
  memberPreviews,
}: MessagePanelProps) {
  const [message, setMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
  const parentRef = useRef<HTMLDivElement>(null);

  // For DMs: Fetch username from World App Username API
  const { displayName } = useUsername(conversationType === 'dm' ? peerAddress : null);

  // Determine display name based on conversation type
  const name = conversationType === 'group'
    ? (groupName || 'Group Chat')
    : (nameOverride ?? displayName);

  // Subtitle for groups (member count)
  const groupSubtitle = conversationType === 'group' && memberCount
    ? `${memberCount} members`
    : undefined;

  const client = useAtomValue(xmtpClientAtom);

  // Use messages hook
  const {
    messageIds,
    pendingMessages,
    isLoading,
    isInitialLoading,
    hasMore,
    loadMore,
    sendMessage,
    retryMessage,
    getMessage,
  } = useMessages(conversationId);

  // Get own inbox ID for determining message direction
  const ownInboxId = client?.inboxId ?? '';

  // Combine pending and real messages for display - MEMOIZED to prevent re-renders
  // Messages are in reverse chronological order (newest first)
  // We need to reverse for display so oldest is at top
  const displayItems = useMemo(() => {
    const allItems: Array<{ type: 'message' | 'pending'; id: string }> = [
      ...pendingMessages.map((p) => ({ type: 'pending' as const, id: p.id })),
      ...messageIds.map((id) => ({ type: 'message' as const, id })),
    ];
    // Reverse so oldest is first (for natural reading order)
    return [...allItems].reverse();
  }, [pendingMessages, messageIds]);

  // Memoize virtualizer callbacks to prevent re-renders
  const getScrollElement = useCallback(() => parentRef.current, []);
  const estimateSize = useCallback(() => VIRTUALIZATION.MESSAGE_ROW_HEIGHT, []);
  const getItemKey = useCallback((index: number) => displayItems[index]?.id ?? index, [displayItems]);

  const virtualizer = useVirtualizer({
    count: displayItems.length,
    getScrollElement,
    estimateSize,
    overscan: VIRTUALIZATION.OVERSCAN_COUNT,
    getItemKey,
  });

  // Scroll to bottom on new messages
  useEffect(() => {
    if (parentRef.current && displayItems.length > 0) {
      parentRef.current.scrollTop = parentRef.current.scrollHeight;
    }
  }, [displayItems.length]);

  // Load more when scrolling to top
  const handleScroll = useCallback(() => {
    if (!parentRef.current) return;
    const { scrollTop } = parentRef.current;

    // Load more when near the top
    if (scrollTop < 100 && hasMore && !isLoading) {
      loadMore();
    }
  }, [hasMore, isLoading, loadMore]);

  const handleSend = async () => {
    if (!message.trim() || isSending) return;

    const content = message.trim();
    setMessage('');
    setIsSending(true);

    try {
      await sendMessage(content);
    } catch (error) {
      console.error('Failed to send message:', error);
    } finally {
      setIsSending(false);
    }
  };

  const handleRetry = async (pendingId: string) => {
    try {
      await retryMessage(pendingId);
    } catch (error) {
      console.error('Failed to retry message:', error);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Format timestamp
  const formatTime = (ns: bigint): string => {
    const date = new Date(Number(ns / BigInt(1_000_000)));
    return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
  };

  // Check if message should be displayed (filter out read receipts, etc.)
  const shouldDisplayMessage = (message: DecodedMessage): boolean => {
    const typeId = (message.contentType as { typeId?: string })?.typeId;
    // Filter out read receipts - they shouldn't appear as messages
    if (typeId === 'readReceipt') return false;
    return true;
  };

  // Extract message text content
  const getMessageText = (message: DecodedMessage): string | null => {
    const typeId = (message.contentType as { typeId?: string })?.typeId;

    // Skip read receipts entirely
    if (typeId === 'readReceipt') return null;

    // Handle reactions - show emoji
    if (typeId === 'reaction') {
      const content = message.content as { content?: string; action?: string } | undefined;
      if (content?.content) {
        return `Reacted ${content.content}`;
      }
      return null;
    }

    const content = message.content;

    if (typeof content === 'string') {
      return content;
    }

    if (content && typeof content === 'object') {
      // Handle text content
      if ('text' in content && typeof (content as { text?: unknown }).text === 'string') {
        return (content as { text: string }).text;
      }
      // Handle reply content (has nested content object)
      if ('content' in content) {
        const nestedContent = (content as { content: unknown }).content;
        if (typeof nestedContent === 'string') return nestedContent;
        if (nestedContent && typeof nestedContent === 'object' && 'text' in nestedContent) {
          return (nestedContent as { text: string }).text;
        }
      }
    }

    // Filter out unsupported message types (welcome messages, etc.)
    return null;
  };

  return (
    <div className="flex-1 flex flex-col bg-white">
      {/* Header */}
      <header className="shrink-0 h-16 px-4 flex items-center justify-between border-b border-gray-100">
        <div className="flex items-center gap-3">
          {conversationType === 'group' ? (
            <Avatar
              isGroup
              groupName={groupName}
              imageUrl={avatarUrl}
              memberPreviews={memberPreviews}
              size="sm"
            />
          ) : (
            <Avatar address={peerAddress} name={nameOverride} imageUrl={avatarUrl} size="sm" />
          )}
          <div className="flex flex-col">
            <div className="flex items-center gap-1.5">
              <span className="font-semibold text-[#181818]">{name}</span>
              {isVerified && conversationType === 'dm' && <VerificationBadge size="sm" />}
            </div>
            {(subtitle || groupSubtitle) && (
              <span className="text-sm text-[#717680]">{subtitle || groupSubtitle}</span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1">
          <button className="w-9 h-9 flex items-center justify-center rounded-lg hover:bg-gray-100 transition-colors">
            <Search className="w-5 h-5 text-[#717680]" />
          </button>
          <button className="w-9 h-9 flex items-center justify-center rounded-lg hover:bg-gray-100 transition-colors">
            <MoreHorizontal className="w-5 h-5 text-[#717680]" />
          </button>
        </div>
      </header>

      {/* Messages Area */}
      <div
        ref={parentRef}
        onScroll={handleScroll}
        className="flex-1 overflow-auto p-4 bg-[#F5F5F5]"
      >
        {/* Loading indicator */}
        {isInitialLoading ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="w-6 h-6 text-[#005CFF] animate-spin" />
          </div>
        ) : displayItems.length === 0 ? (
          <div className="flex items-center justify-center h-full text-[#717680]">
            <p>No messages yet. Send a message to start the conversation.</p>
          </div>
        ) : (
          <div
            style={{
              height: virtualizer.getTotalSize(),
              position: 'relative',
            }}
          >
            {/* Load more indicator */}
            {isLoading && hasMore && (
              <div className="absolute top-0 left-0 right-0 flex justify-center py-2">
                <Loader2 className="w-5 h-5 text-[#005CFF] animate-spin" />
              </div>
            )}

            {virtualizer.getVirtualItems().map((virtualRow) => {
              const item = displayItems[virtualRow.index];

              if (item.type === 'pending') {
                const pending = pendingMessages.find((p) => p.id === item.id);
                if (!pending) return null;

                return (
                  <div
                    key={item.id}
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '100%',
                      transform: `translateY(${virtualRow.start}px)`,
                    }}
                    className="flex justify-end py-1"
                  >
                    <div className="max-w-[70%]">
                      <div className={`rounded-2xl rounded-tr-md px-4 py-2 ${
                        pending.status === 'failed' ? 'bg-red-100' : 'bg-[#005CFF]/70'
                      }`}>
                        <p className={pending.status === 'failed' ? 'text-red-800' : 'text-white'}>
                          {pending.content}
                        </p>
                      </div>
                      <div className="flex justify-end items-center gap-2 mt-1">
                        {pending.status === 'sending' && (
                          <Loader2 className="w-3 h-3 text-[#9BA3AE] animate-spin" />
                        )}
                        {pending.status === 'failed' && (
                          <>
                            <AlertCircle className="w-3 h-3 text-red-500" />
                            <span className="text-xs text-red-500">Failed</span>
                            <button
                              onClick={() => handleRetry(pending.id)}
                              className="text-xs text-[#005CFF] hover:underline flex items-center gap-1"
                            >
                              <RotateCcw className="w-3 h-3" />
                              Retry
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                );
              }

              // Real message
              const msg = getMessage(item.id);
              if (!msg) return null;

              // Filter out read receipts and other non-displayable messages
              if (!shouldDisplayMessage(msg)) return null;

              const isOwnMessage = msg.senderInboxId === ownInboxId;
              const text = getMessageText(msg);

              // Skip messages with no text content (e.g., reactions handled elsewhere)
              if (text === null) return null;

              if (isOwnMessage) {
                return (
                  <div
                    key={item.id}
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '100%',
                      transform: `translateY(${virtualRow.start}px)`,
                    }}
                    className="flex justify-end py-1"
                  >
                    <div className="max-w-[70%]">
                      <div className="bg-[#005CFF] rounded-2xl rounded-tr-md px-4 py-2">
                        <p className="text-white whitespace-pre-wrap break-words">{text}</p>
                      </div>
                      <div className="flex justify-end">
                        <span className="text-xs text-[#9BA3AE] mt-1 mr-2">
                          {formatTime(msg.sentAtNs)}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              }

              // Incoming message
              // For groups, find sender address from member previews
              const senderAddress = conversationType === 'group'
                ? memberPreviews?.find(m => m.inboxId === msg.senderInboxId)?.address
                : peerAddress;

              return (
                <div
                  key={item.id}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
                  className="flex gap-2 py-1"
                >
                  <Avatar
                    address={senderAddress}
                    name={conversationType === 'dm' ? nameOverride : undefined}
                    imageUrl={conversationType === 'dm' ? avatarUrl : undefined}
                    size="sm"
                    className="shrink-0 mt-1"
                  />
                  <div className="max-w-[70%]">
                    {/* Show sender name for group messages */}
                    {conversationType === 'group' && (
                      <GroupMessageSender address={senderAddress} />
                    )}
                    <div className="bg-white rounded-2xl rounded-tl-md px-4 py-2 shadow-sm">
                      <p className="text-[#181818] whitespace-pre-wrap break-words">{text}</p>
                    </div>
                    <span className="text-xs text-[#9BA3AE] mt-1 ml-2">
                      {formatTime(msg.sentAtNs)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Input Area */}
      <div className="shrink-0 p-4 border-t border-gray-100 bg-white">
        <div className="flex items-end gap-2">
          <button className="w-10 h-10 flex items-center justify-center rounded-lg hover:bg-gray-100 transition-colors shrink-0">
            <Paperclip className="w-5 h-5 text-[#717680]" />
          </button>

          <div className="flex-1 relative">
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Write a message..."
              rows={1}
              className="
                w-full px-4 py-2.5 pr-12
                bg-[#F5F5F5] rounded-xl
                text-[#181818] placeholder-[#9BA3AE]
                outline-none focus:ring-2 focus:ring-[#005CFF]/20
                resize-none max-h-32
                transition-shadow
              "
            />
            <button className="absolute right-3 top-1/2 -translate-y-1/2">
              <Smile className="w-5 h-5 text-[#9BA3AE] hover:text-[#717680] transition-colors" />
            </button>
          </div>

          <button
            onClick={handleSend}
            disabled={!message.trim() || isSending}
            className="
              w-10 h-10 flex items-center justify-center rounded-lg
              bg-[#005CFF] hover:bg-[#0052E0]
              disabled:bg-gray-200 disabled:cursor-not-allowed
              transition-colors shrink-0
            "
          >
            {isSending ? (
              <Loader2 className="w-5 h-5 text-white animate-spin" />
            ) : (
              <Send className="w-5 h-5 text-white" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
