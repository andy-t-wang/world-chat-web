'use client';

import { useState, useRef, useEffect, useCallback, useMemo, useLayoutEffect } from 'react';
import { useAtomValue } from 'jotai';
import { Search, MoreHorizontal, Paperclip, Smile, Send, Loader2, AlertCircle, RotateCcw, Lock } from 'lucide-react';
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

  // Format date for separator following: Today → Yesterday → Day of week → Calendar date
  const formatDateSeparator = useCallback((ns: bigint): string => {
    const date = new Date(Number(ns / BigInt(1_000_000)));
    const now = new Date();

    // Reset time parts for accurate day comparison
    const dateOnly = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const nowOnly = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const diffDays = Math.floor((nowOnly.getTime() - dateOnly.getTime()) / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';

    // Within the last week, show day of week
    if (diffDays < 7) {
      return date.toLocaleDateString(undefined, { weekday: 'long' });
    }

    // Older than a week, show full date
    return date.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' });
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

  // Scroll to bottom on new messages
  const prevDisplayCountRef = useRef(0);
  useLayoutEffect(() => {
    if (parentRef.current && displayItems.length > 0) {
      // Always scroll to bottom when messages change
      parentRef.current.scrollTop = parentRef.current.scrollHeight;
    }
    prevDisplayCountRef.current = displayItems.length;
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

  return (
    <div className="flex-1 flex flex-col bg-white">
      {/* Header */}
      <header className="shrink-0 h-16 px-4 flex items-center justify-between border-b border-gray-100">
        <div className="flex items-center gap-3">
          {conversationType === 'group' ? (
            <Avatar isGroup groupName={groupName} imageUrl={avatarUrl} memberPreviews={memberPreviews} size="md" />
          ) : (
            <Avatar address={peerAddress} name={nameOverride} imageUrl={avatarUrl} size="md" />
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
        className="flex-1 overflow-auto bg-[#F5F5F5] flex flex-col"
      >
        {isInitialLoading ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="w-6 h-6 text-[#005CFF] animate-spin" />
          </div>
        ) : displayItems.length === 0 ? (
          /* E2EE Empty State Banner */
          <div className="flex-1 flex flex-col items-center justify-center px-4">
            <div className="bg-[#F9FAFB] border border-[#F3F4F5] rounded-xl px-4 py-3 flex items-center gap-3 max-w-xs">
              <div className="w-8 h-8 rounded-full bg-[#F3F4F5] flex items-center justify-center shrink-0">
                <Lock className="w-4 h-4 text-[#717680]" />
              </div>
              <p className="text-sm text-[#717680]">
                Messages are end-to-end encrypted. No one outside of this chat can read them.
              </p>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col min-h-full">
            {/* Spacer to push messages to bottom */}
            <div className="flex-1" />

            {/* Load more indicator */}
            {isLoading && hasMore && (
              <div className="flex justify-center py-3">
                <Loader2 className="w-5 h-5 text-[#005CFF] animate-spin" />
              </div>
            )}

            {/* Messages list */}
            <div className="px-4 pb-4">
              {displayItems.map((item) => {
                // Date separator
                if (item.type === 'date-separator') {
                  return (
                    <div key={item.id} className="flex items-center justify-center py-4">
                      <span className="px-3 py-1.5 bg-white border border-[#F3F4F5] rounded-lg text-xs text-[#717680] font-medium">
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
                    <div key={item.id} className="flex justify-end mt-0.5">
                      <div className="max-w-[300px]">
                        <div className={`px-3 py-2 rounded-tl-[16px] rounded-tr-[16px] rounded-bl-[16px] rounded-br-[4px] ${
                          pending.status === 'failed' ? 'bg-red-100' : 'bg-[#005CFF]/70'
                        }`}>
                          <p className={`text-[15px] leading-[1.35] ${pending.status === 'failed' ? 'text-red-800' : 'text-white'}`}>
                            {pending.content}
                          </p>
                        </div>
                        <div className="flex justify-end items-center gap-1.5 mt-1 pr-1">
                          {pending.status === 'sending' && (
                            <span className="text-[11px] text-[#9BA3AE]">Sending...</span>
                          )}
                          {pending.status === 'failed' && (
                            <>
                              <AlertCircle className="w-3 h-3 text-red-500" />
                              <span className="text-[11px] text-red-500">Failed</span>
                              <button
                                onClick={() => handleRetry(pending.id)}
                                className="text-[11px] text-[#005CFF] hover:underline flex items-center gap-1 ml-1"
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

                // Regular message
                const msg = getMessage(item.id);
                if (!msg) return null;

                const isOwnMessage = msg.senderInboxId === ownInboxId;
                const text = getMessageText(msg);
                if (text === null) return null;

                const { isFirstInGroup, isLastInGroup, showAvatar } = item;

                // Outgoing message (sender)
                if (isOwnMessage) {
                  const isRead = streamManager.isMessageRead(conversationId, msg.sentAtNs);

                  // Sender bubble: all corners 16px except bottom-right is 8px (pointing to sender)
                  const senderRadius = isFirstInGroup && isLastInGroup
                    ? 'rounded-tl-[16px] rounded-tr-[16px] rounded-bl-[16px] rounded-br-[4px]'
                    : isFirstInGroup
                      ? 'rounded-tl-[16px] rounded-tr-[16px] rounded-bl-[16px] rounded-br-[4px]'
                      : isLastInGroup
                        ? 'rounded-tl-[16px] rounded-tr-[4px] rounded-bl-[16px] rounded-br-[4px]'
                        : 'rounded-tl-[16px] rounded-tr-[4px] rounded-bl-[16px] rounded-br-[4px]';

                  return (
                    <div
                      key={item.id}
                      className={`flex justify-end ${isFirstInGroup ? 'mt-3' : 'mt-0.5'}`}
                    >
                      <div className="max-w-[300px]">
                        <div className={`bg-[#005CFF] px-3 py-2 ${senderRadius}`}>
                          <p className="text-white text-[15px] leading-[1.35] whitespace-pre-wrap break-words">{text}</p>
                        </div>
                        {isLastInGroup && (
                          <div className="flex justify-end items-center gap-1.5 mt-1 pr-1">
                            <span className="text-[11px] text-[#9BA3AE]">
                              {formatTime(msg.sentAtNs)}
                            </span>
                            {isRead ? (
                              <span className="text-[11px] text-[#00C230] font-medium">Read</span>
                            ) : (
                              <span className="text-[11px] text-[#9BA3AE]">Sent</span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                }

                // Incoming message (recipient)
                const senderAddress = conversationType === 'group'
                  ? memberPreviews?.find(m => m.inboxId === msg.senderInboxId)?.address
                  : peerAddress;

                // Recipient bubble: all corners 16px except bottom-left is 4px (pointing to sender)
                const recipientRadius = isFirstInGroup && isLastInGroup
                  ? 'rounded-tl-[16px] rounded-tr-[16px] rounded-bl-[4px] rounded-br-[16px]'
                  : isFirstInGroup
                    ? 'rounded-tl-[16px] rounded-tr-[16px] rounded-bl-[4px] rounded-br-[16px]'
                    : isLastInGroup
                      ? 'rounded-tl-[4px] rounded-tr-[16px] rounded-bl-[4px] rounded-br-[16px]'
                      : 'rounded-tl-[4px] rounded-tr-[16px] rounded-bl-[4px] rounded-br-[16px]';

                return (
                  <div
                    key={item.id}
                    className={`flex items-end gap-3 ${isFirstInGroup ? 'mt-3' : 'mt-0.5'}`}
                  >
                    {/* Avatar - only show on last message of group, otherwise spacer */}
                    <div className="w-7 h-7 shrink-0 flex items-end">
                      {isLastInGroup && (
                        <Avatar
                          address={senderAddress}
                          size="sm"
                        />
                      )}
                    </div>
                    <div className="max-w-[300px] flex flex-col">
                      {/* Sender name - only show on first message of group in group chats */}
                      {conversationType === 'group' && isFirstInGroup && (
                        <GroupMessageSender address={senderAddress} />
                      )}
                      <div className={`bg-white px-3 py-2 ${recipientRadius}`}>
                        <p className="text-[#181818] text-[15px] leading-[1.35] whitespace-pre-wrap break-words">{text}</p>
                      </div>
                      {isLastInGroup && (
                        <span className="text-[11px] text-[#9BA3AE] mt-1 ml-1">
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
