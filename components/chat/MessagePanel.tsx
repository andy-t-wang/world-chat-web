'use client';

import { useState, useRef, useEffect, useCallback, useMemo, useLayoutEffect } from 'react';
import { useAtomValue } from 'jotai';
import { Search, MoreHorizontal, Paperclip, Smile, Send, Loader2, AlertCircle, RotateCcw, Lock } from 'lucide-react';
import { Avatar } from '@/components/ui/Avatar';
import { VerificationBadge } from '@/components/ui/VerificationBadge';
import { useUsername } from '@/hooks/useUsername';
import { useMessages } from '@/hooks/useMessages';
import { xmtpClientAtom } from '@/stores/client';
import { readReceiptVersionAtom, reactionsVersionAtom } from '@/stores/messages';
import { streamManager } from '@/lib/xmtp/StreamManager';
import type { DecodedMessage } from '@xmtp/browser-sdk';

// Common reaction emojis
const REACTION_EMOJIS = ['❤️', '👍', '👎', '😂', '😮', '😢'];

// Reaction picker component
interface ReactionPickerProps {
  position: { x: number; y: number };
  onSelect: (emoji: string) => void;
  onClose: () => void;
}

function ReactionPicker({ position, onSelect, onClose }: ReactionPickerProps) {
  const pickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  return (
    <div
      ref={pickerRef}
      className="fixed z-50 bg-white rounded-full shadow-lg border border-gray-200 px-2 py-1.5 flex gap-1"
      style={{ left: position.x, top: position.y }}
    >
      {REACTION_EMOJIS.map((emoji) => (
        <button
          key={emoji}
          onClick={() => onSelect(emoji)}
          className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors text-lg"
        >
          {emoji}
        </button>
      ))}
    </div>
  );
}

// Display reactions below a message (overlapping style per Figma)
interface MessageReactionsProps {
  messageId: string;
  isOwnMessage: boolean;
}

function MessageReactions({ messageId, isOwnMessage }: MessageReactionsProps) {
  const _reactionsVersion = useAtomValue(reactionsVersionAtom);
  const reactions = streamManager.getReactions(messageId);

  if (reactions.length === 0) return null;

  // Group reactions by emoji
  const grouped = reactions.reduce((acc, r) => {
    acc[r.emoji] = (acc[r.emoji] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  return (
    <div className={`flex gap-1 -mt-2 relative z-10 ${isOwnMessage ? 'justify-end pr-1' : 'justify-start pl-1'}`}>
      {Object.entries(grouped).map(([emoji, count]) => (
        <div
          key={emoji}
          className="inline-flex items-center h-[24px] px-[9px] bg-[#F3F4F5] border-2 border-white rounded-[13px] text-[16px]"
        >
          <span className="tracking-[4.8px]">{emoji}</span>
          {count > 1 && <span className="text-xs text-[#717680] ml-0.5">{count}</span>}
        </div>
      ))}
    </div>
  );
}

interface MemberPreview {
  inboxId: string;
  address: string;
}

// Helper component to display sender name above messages
function SenderName({ address }: { address: string | undefined }) {
  const { displayName } = useUsername(address);
  const name = displayName ?? (address ? `${address.slice(0, 6)}...${address.slice(-4)}` : 'Unknown');

  return (
    <span className="text-[13px] text-[#717680] mb-1 ml-1 block">
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

  // Reaction picker state
  const [reactionPicker, setReactionPicker] = useState<{
    messageId: string;
    position: { x: number; y: number };
  } | null>(null);

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

  // Handle right-click to show reaction picker
  const handleMessageContextMenu = useCallback((e: React.MouseEvent, messageId: string) => {
    e.preventDefault();
    setReactionPicker({
      messageId,
      position: { x: e.clientX, y: e.clientY - 50 },
    });
  }, []);

  // Handle reaction selection
  const handleReactionSelect = useCallback(async (emoji: string) => {
    if (!reactionPicker) return;
    try {
      await streamManager.sendReaction(conversationId, reactionPicker.messageId, emoji);
    } catch (error) {
      console.error('Failed to send reaction:', error);
    }
    setReactionPicker(null);
  }, [conversationId, reactionPicker]);

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
              {/* E2EE Banner for empty state (no messages yet) */}
              {displayItems.length === 0 && (
                <div className="flex items-center justify-center py-8">
                  <div className="bg-[#F9FAFB] border border-[#F3F4F5] rounded-xl px-3 py-2 text-center max-w-[286px]">
                    <div className="flex items-center justify-center gap-0.5 mb-0.5">
                      <Lock className="w-[11px] h-[11px] text-[#181818]" />
                      <span className="text-[13px] text-[#181818] leading-[1.3]">
                        Messages are end-to-end encrypted
                      </span>
                    </div>
                    <p className="text-[13px] text-[#181818] leading-[1.3]">
                      and only visible within this chat.
                    </p>
                    <p className="text-[13px] text-[#181818] leading-[1.2]">
                      Secured by XMTP.
                    </p>
                  </div>
                </div>
              )}
              {displayItems.map((item, index) => {
                // Date separator - show encryption banner after first date separator
                if (item.type === 'date-separator') {
                  const isFirstDateSeparator = displayItems.findIndex(i => i.type === 'date-separator') === index;
                  return (
                    <div key={item.id}>
                      <div className="flex items-center justify-center py-4">
                        <span className="px-3 py-1.5 bg-white border border-[#F3F4F5] rounded-lg text-xs text-[#717680] font-medium">
                          {item.date}
                        </span>
                      </div>
                      {/* E2EE Banner - shown after first date separator */}
                      {isFirstDateSeparator && (
                        <div className="flex items-center justify-center pb-4">
                          <div className="bg-[#F9FAFB] border border-[#F3F4F5] rounded-xl px-3 py-2 text-center max-w-[286px]">
                            <div className="flex items-center justify-center gap-0.5 mb-0.5">
                              <Lock className="w-[11px] h-[11px] text-[#181818]" />
                              <span className="text-[13px] text-[#181818] leading-[1.3]">
                                Messages are end-to-end encrypted
                              </span>
                            </div>
                            <p className="text-[13px] text-[#181818] leading-[1.3]">
                              and only visible within this chat.
                            </p>
                            <p className="text-[13px] text-[#181818] leading-[1.2]">
                              Secured by XMTP.
                            </p>
                          </div>
                        </div>
                      )}
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
                        <div
                          className={`bg-[#005CFF] px-3 py-2 ${senderRadius} cursor-pointer`}
                          onContextMenu={(e) => handleMessageContextMenu(e, item.id)}
                        >
                          <p className="text-white text-[15px] leading-[1.35] whitespace-pre-wrap break-words">{text}</p>
                        </div>
                        <MessageReactions messageId={item.id} isOwnMessage={true} />
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
                // For group chats, look up address from memberPreviews
                // For DMs, use the peerAddress
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
                    <div className="w-8 h-8 shrink-0 flex items-end">
                      {isLastInGroup && (
                        <Avatar
                          address={senderAddress}
                          size="sm"
                        />
                      )}
                    </div>
                    <div className="max-w-[300px] flex flex-col">
                      {/* Sender name - show on first message in group for all incoming messages */}
                      {isFirstInGroup && (
                        <SenderName address={senderAddress} />
                      )}
                      <div
                        className={`bg-white px-3 py-2 ${recipientRadius} cursor-pointer`}
                        onContextMenu={(e) => handleMessageContextMenu(e, item.id)}
                      >
                        <p className="text-[#181818] text-[15px] leading-[1.35] whitespace-pre-wrap break-words">{text}</p>
                      </div>
                      <MessageReactions messageId={item.id} isOwnMessage={false} />
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
      <div className="shrink-0 px-4 py-3 border-t border-gray-100 bg-white">
        <div className="flex items-center gap-2">
          <button className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors shrink-0">
            <Paperclip className="w-5 h-5 text-[#717680]" />
          </button>
          <div className="flex-1 relative flex items-center">
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Write a message..."
              rows={1}
              className="w-full px-4 py-2.5 pr-12 bg-[#F5F5F5] rounded-full text-[#181818] placeholder-[#9BA3AE] outline-none focus:ring-2 focus:ring-[#005CFF]/20 resize-none max-h-32 transition-shadow"
            />
            <button className="absolute right-3 top-1/2 -translate-y-1/2">
              <Smile className="w-5 h-5 text-[#9BA3AE] hover:text-[#717680] transition-colors" />
            </button>
          </div>
          <button
            onClick={handleSend}
            disabled={!message.trim() || isSending}
            className="w-10 h-10 flex items-center justify-center rounded-full bg-[#005CFF] hover:bg-[#0052E0] disabled:bg-gray-200 disabled:cursor-not-allowed transition-colors shrink-0"
          >
            {isSending ? (
              <Loader2 className="w-5 h-5 text-white animate-spin" />
            ) : (
              <Send className="w-5 h-5 text-white" />
            )}
          </button>
        </div>
      </div>

      {/* Reaction Picker */}
      {reactionPicker && (
        <ReactionPicker
          position={reactionPicker.position}
          onSelect={handleReactionSelect}
          onClose={() => setReactionPicker(null)}
        />
      )}
    </div>
  );
}
