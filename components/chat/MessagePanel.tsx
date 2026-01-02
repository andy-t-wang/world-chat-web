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
import { readReceiptVersionAtom } from '@/stores/messages';
import { streamManager } from '@/lib/xmtp/StreamManager';
import type { DecodedMessage } from '@xmtp/browser-sdk';

interface MemberPreview {
  inboxId: string;
  address: string;
}

// Helper component to display sender name in group messages
function GroupMessageSender({ address }: { address: string | undefined }) {
  const { displayName } = useUsername(address);
  const name = displayName ?? (address ? `${address.slice(0, 6)}...${address.slice(-4)}` : 'Unknown');

  return (
    <span className="text-xs font-medium text-[#005CFF] mb-0.5 block">
      {name}
    </span>
  );
}

// Display item types for rendering
type DisplayItem =
  | { type: 'date-separator'; date: string; id: string }
  | { type: 'message'; id: string; isFirstInGroup: boolean; isLastInGroup: boolean; showAvatar: boolean }
  | { type: 'pending'; id: string };

interface MessagePanelProps {
  conversationId: string;
  conversationType: 'dm' | 'group';
  peerAddress?: string;
  name?: string;
  avatarUrl?: string | null;
  isVerified?: boolean;
  subtitle?: string;
  groupName?: string;
  memberCount?: number;
  memberPreviews?: MemberPreview[];
}

// Debug render counter
let messagePanelRenderCount = 0;

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
  messagePanelRenderCount++;
  console.log(`[MessagePanel] Render #${messagePanelRenderCount}, id=${conversationId?.slice(0,8)}, type=${conversationType}`);

  const [message, setMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
  const parentRef = useRef<HTMLDivElement>(null);

  const { displayName } = useUsername(conversationType === 'dm' ? peerAddress : null);
  const name = conversationType === 'group'
    ? (groupName || 'Group Chat')
    : (nameOverride ?? displayName);
  const groupSubtitle = conversationType === 'group' && memberCount
    ? `${memberCount} members`
    : undefined;

  const client = useAtomValue(xmtpClientAtom);
  const _readReceiptVersion = useAtomValue(readReceiptVersionAtom);

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

  const ownInboxId = client?.inboxId ?? '';

  // Check if message should be displayed
  const shouldDisplayMessage = useCallback((msg: DecodedMessage): boolean => {
    const typeId = (msg.contentType as { typeId?: string })?.typeId;
    if (typeId === 'readReceipt') return false;
    return true;
  }, []);

  // Extract message text content
  const getMessageText = useCallback((msg: DecodedMessage): string | null => {
    const typeId = (msg.contentType as { typeId?: string })?.typeId;
    if (typeId === 'readReceipt') return null;
    if (typeId === 'reaction') {
      const content = msg.content as { content?: string } | undefined;
      return content?.content ? `Reacted ${content.content}` : null;
    }

    const content = msg.content;
    if (typeof content === 'string') return content;
    if (content && typeof content === 'object') {
      if ('text' in content && typeof (content as { text?: unknown }).text === 'string') {
        return (content as { text: string }).text;
      }
      if ('content' in content) {
        const nested = (content as { content: unknown }).content;
        if (typeof nested === 'string') return nested;
        if (nested && typeof nested === 'object' && 'text' in nested) {
          return (nested as { text: string }).text;
        }
      }
    }
    return null;
  }, []);

  // Format date for separator
  const formatDateSeparator = useCallback((ns: bigint): string => {
    const date = new Date(Number(ns / BigInt(1_000_000)));
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();
    if (isToday) return 'Today';

    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';

    return date.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
  }, []);

  // Get date key for grouping
  const getDateKey = useCallback((ns: bigint): string => {
    const date = new Date(Number(ns / BigInt(1_000_000)));
    return date.toDateString();
  }, []);

  // Build grouped display items with date separators
  // Note: We build a simplified structure here and compute details at render time
  // to avoid getMessage instability in dependencies
  const displayItems = useMemo((): DisplayItem[] => {
    const items: DisplayItem[] = [];

    // First, collect valid message data
    const reversedIds = [...messageIds].reverse();
    const messageData: Array<{ id: string; senderId: string; dateKey: string; sentAtNs: bigint }> = [];

    for (const id of reversedIds) {
      const msg = getMessage(id);
      if (!msg) continue;

      const typeId = (msg.contentType as { typeId?: string })?.typeId;
      if (typeId === 'readReceipt') continue;

      // Check if has displayable text
      const content = msg.content;
      let hasText = false;
      if (typeof content === 'string') {
        hasText = true;
      } else if (content && typeof content === 'object') {
        if ('text' in content) hasText = true;
        else if ('content' in content) hasText = true;
      }
      if (typeId === 'reaction') hasText = true;
      if (!hasText) continue;

      const date = new Date(Number(msg.sentAtNs / BigInt(1_000_000)));
      messageData.push({
        id,
        senderId: msg.senderInboxId,
        dateKey: date.toDateString(),
        sentAtNs: msg.sentAtNs,
      });
    }

    // Build display items with grouping
    const fiveMinutesNs = BigInt(5 * 60) * BigInt(1_000_000_000);

    for (let i = 0; i < messageData.length; i++) {
      const curr = messageData[i];
      const prev = i > 0 ? messageData[i - 1] : null;
      const next = i < messageData.length - 1 ? messageData[i + 1] : null;

      // Add date separator if date changed
      if (!prev || prev.dateKey !== curr.dateKey) {
        items.push({
          type: 'date-separator',
          date: formatDateSeparator(curr.sentAtNs),
          id: `date-${curr.dateKey}`,
        });
      }

      // Determine if first/last in group
      const isFirstInGroup = !prev ||
        prev.senderId !== curr.senderId ||
        prev.dateKey !== curr.dateKey ||
        curr.sentAtNs - prev.sentAtNs > fiveMinutesNs;

      const isLastInGroup = !next ||
        next.senderId !== curr.senderId ||
        next.dateKey !== curr.dateKey ||
        next.sentAtNs - curr.sentAtNs > fiveMinutesNs;

      const isOwnMessage = curr.senderId === ownInboxId;

      items.push({
        type: 'message',
        id: curr.id,
        isFirstInGroup,
        isLastInGroup,
        showAvatar: isFirstInGroup && !isOwnMessage,
      });
    }

    // Add pending messages at the end
    for (const pending of pendingMessages) {
      items.push({ type: 'pending', id: pending.id });
    }

    return items;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messageIds.join(','), pendingMessages.length, ownInboxId]);

  // Virtualizer callbacks - memoize to prevent infinite re-renders
  const getScrollElement = useCallback(() => parentRef.current, []);
  const estimateSize = useCallback((index: number) => {
    const item = displayItems[index];
    if (item.type === 'date-separator') return 40;
    if (item.type === 'pending') return 60;
    return 50; // Estimated message height
  }, [displayItems]);
  const getItemKey = useCallback((index: number) => displayItems[index]?.id ?? index, [displayItems]);

  // Virtualizer setup
  const virtualizer = useVirtualizer({
    count: displayItems.length,
    getScrollElement,
    estimateSize,
    overscan: 10,
    getItemKey,
  });

  // Scroll to bottom on new messages
  useEffect(() => {
    if (parentRef.current && displayItems.length > 0) {
      parentRef.current.scrollTop = parentRef.current.scrollHeight;
    }
  }, [displayItems.length]);

  // Mark conversation as read - only run once when messages first load
  // Track which conversation was marked to handle conversation switches correctly
  const markedConversationRef = useRef<string | null>(null);
  const hasMessages = messageIds.length > 0;

  useEffect(() => {
    // Only mark if we have a conversation with messages, and haven't already marked THIS conversation
    if (!conversationId || !hasMessages) return;
    if (markedConversationRef.current === conversationId) return;

    // Mark this conversation as read
    markedConversationRef.current = conversationId;

    // Use queueMicrotask to batch with other updates and avoid mid-render state changes
    queueMicrotask(() => {
      streamManager.markConversationAsRead(conversationId);
    });

    const timer = setTimeout(() => {
      streamManager.sendReadReceipt(conversationId);
    }, 500);

    return () => clearTimeout(timer);
  }, [conversationId, hasMessages]);

  // Load more when scrolling to top
  const handleScroll = useCallback(() => {
    if (!parentRef.current) return;
    const { scrollTop } = parentRef.current;
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

  const formatTime = (ns: bigint): string => {
    const date = new Date(Number(ns / BigInt(1_000_000)));
    return date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  };

  // Calculate content height for proper alignment
  const totalSize = virtualizer.getTotalSize();
  const containerHeight = parentRef.current?.clientHeight ?? 0;
  const needsSpacer = totalSize < containerHeight;

  return (
    <div className="flex-1 flex flex-col bg-white">
      {/* Header */}
      <header className="shrink-0 h-16 px-4 flex items-center justify-between border-b border-gray-100">
        <div className="flex items-center gap-3">
          {conversationType === 'group' ? (
            <Avatar isGroup groupName={groupName} imageUrl={avatarUrl} memberPreviews={memberPreviews} size="sm" />
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
        className="flex-1 overflow-auto bg-[#F5F5F5]"
      >
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
              height: needsSpacer ? '100%' : totalSize,
              minHeight: '100%',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            {/* Spacer to push messages to bottom when few messages */}
            {needsSpacer && <div style={{ flex: 1 }} />}

            {/* Load more indicator */}
            {isLoading && hasMore && (
              <div className="flex justify-center py-2">
                <Loader2 className="w-5 h-5 text-[#005CFF] animate-spin" />
              </div>
            )}

            {/* Virtualized messages */}
            <div
              style={{
                height: totalSize,
                position: 'relative',
              }}
            >
              {virtualizer.getVirtualItems().map((virtualRow) => {
                const item = displayItems[virtualRow.index];

                // Date separator
                if (item.type === 'date-separator') {
                  return (
                    <div
                      key={item.id}
                      style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        width: '100%',
                        height: virtualRow.size,
                        transform: `translateY(${virtualRow.start}px)`,
                      }}
                      className="flex items-center justify-center py-2"
                    >
                      <span className="px-3 py-1 bg-white/80 rounded-full text-xs text-[#717680] font-medium shadow-sm">
                        {item.date}
                      </span>
                    </div>
                  );
                }

                // Pending message
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
                        height: virtualRow.size,
                        transform: `translateY(${virtualRow.start}px)`,
                      }}
                      className="flex justify-end px-4 py-0.5"
                    >
                      <div className="max-w-[70%]">
                        <div className={`rounded-2xl rounded-tr-md px-4 py-2 ${
                          pending.status === 'failed' ? 'bg-red-100' : 'bg-[#005CFF]/70'
                        }`}>
                          <p className={pending.status === 'failed' ? 'text-red-800' : 'text-white'}>
                            {pending.content}
                          </p>
                        </div>
                        {pending.status === 'failed' && (
                          <div className="flex justify-end items-center gap-2 mt-1">
                            <AlertCircle className="w-3 h-3 text-red-500" />
                            <span className="text-xs text-red-500">Failed</span>
                            <button
                              onClick={() => handleRetry(pending.id)}
                              className="text-xs text-[#005CFF] hover:underline flex items-center gap-1"
                            >
                              <RotateCcw className="w-3 h-3" />
                              Retry
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                }

                // Regular message
                const msg = getMessage(item.id);
                if (!msg) return null;

                const isOwnMessage = msg.senderInboxId === ownInboxId;
                const text = getMessageText(msg);
                if (text === null) return null;

                const { isFirstInGroup, isLastInGroup, showAvatar } = item;

                if (isOwnMessage) {
                  const isRead = streamManager.isMessageRead(conversationId, msg.sentAtNs);

                  return (
                    <div
                      key={item.id}
                      style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        width: '100%',
                        height: virtualRow.size,
                        transform: `translateY(${virtualRow.start}px)`,
                      }}
                      className={`flex justify-end px-4 ${isFirstInGroup ? 'pt-2' : 'pt-0.5'} ${isLastInGroup ? 'pb-1' : 'pb-0.5'}`}
                    >
                      <div className="max-w-[70%]">
                        <div className={`bg-[#005CFF] px-4 py-2 ${
                          isFirstInGroup && isLastInGroup ? 'rounded-2xl rounded-tr-md' :
                          isFirstInGroup ? 'rounded-2xl rounded-tr-md rounded-br-lg' :
                          isLastInGroup ? 'rounded-2xl rounded-tr-lg rounded-br-md' :
                          'rounded-2xl rounded-r-lg'
                        }`}>
                          <p className="text-white whitespace-pre-wrap break-words">{text}</p>
                        </div>
                        {isLastInGroup && (
                          <div className="flex justify-end items-center gap-1.5 mt-0.5">
                            <span className="text-[11px] text-[#9BA3AE]">
                              {formatTime(msg.sentAtNs)}
                            </span>
                            {isRead && (
                              <span className="text-[11px] text-[#00C230] font-medium">Read</span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                }

                // Incoming message
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
                      height: virtualRow.size,
                      transform: `translateY(${virtualRow.start}px)`,
                    }}
                    className={`flex items-end gap-2 px-4 ${isFirstInGroup ? 'pt-2' : 'pt-0.5'} ${isLastInGroup ? 'pb-1' : 'pb-0.5'}`}
                  >
                    {/* Avatar - only show on first message of group, otherwise spacer */}
                    <div className="w-8 shrink-0 flex items-end">
                      {showAvatar && (
                        <Avatar
                          address={senderAddress}
                          name={conversationType === 'dm' ? nameOverride : undefined}
                          imageUrl={conversationType === 'dm' ? avatarUrl : undefined}
                          size="sm"
                          className="w-7 h-7"
                        />
                      )}
                    </div>
                    <div className="max-w-[70%]">
                      {/* Sender name - only show on first message of group in group chats */}
                      {conversationType === 'group' && isFirstInGroup && (
                        <GroupMessageSender address={senderAddress} />
                      )}
                      <div className={`bg-white px-4 py-2 shadow-sm ${
                        isFirstInGroup && isLastInGroup ? 'rounded-2xl rounded-tl-md' :
                        isFirstInGroup ? 'rounded-2xl rounded-tl-md rounded-bl-lg' :
                        isLastInGroup ? 'rounded-2xl rounded-tl-lg rounded-bl-md' :
                        'rounded-2xl rounded-l-lg'
                      }`}>
                        <p className="text-[#181818] whitespace-pre-wrap break-words">{text}</p>
                      </div>
                      {isLastInGroup && (
                        <span className="text-[11px] text-[#9BA3AE] mt-0.5 ml-1 block">
                          {formatTime(msg.sentAtNs)}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
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
              className="w-full px-4 py-2.5 pr-12 bg-[#F5F5F5] rounded-xl text-[#181818] placeholder-[#9BA3AE] outline-none focus:ring-2 focus:ring-[#005CFF]/20 resize-none max-h-32 transition-shadow"
            />
            <button className="absolute right-3 top-1/2 -translate-y-1/2">
              <Smile className="w-5 h-5 text-[#9BA3AE] hover:text-[#717680] transition-colors" />
            </button>
          </div>
          <button
            onClick={handleSend}
            disabled={!message.trim() || isSending}
            className="w-10 h-10 flex items-center justify-center rounded-lg bg-[#005CFF] hover:bg-[#0052E0] disabled:bg-gray-200 disabled:cursor-not-allowed transition-colors shrink-0"
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
