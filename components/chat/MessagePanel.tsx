"use client";

import {
  useState,
  useRef,
  useEffect,
  useCallback,
  useMemo,
  useLayoutEffect,
} from "react";
import { useAtomValue, useAtom } from "jotai";
import {
  MoreHorizontal,
  Paperclip,
  Send,
  Loader2,
  AlertCircle,
  RotateCcw,
  Lock,
  LogOut,
  Clock,
} from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { VerificationBadge } from "@/components/ui/VerificationBadge";
import { MessageText, MessageLinkPreview } from "./MessageContent";
import { isJustUrl, extractUrls } from "./LinkPreview";
import { PaymentMessage } from "./PaymentMessage";
import { ImageMessage } from "./ImageMessage";
import { ImageGrid } from "./ImageGrid";
import { MultiAttachmentMessage } from "./MultiAttachmentMessage";
import { RequestActionBar } from "./RequestActionBar";
import { MessageContextMenu } from "./MessageContextMenu";
import { ReplyPreview } from "./ReplyPreview";
import { ReplyBubble } from "./ReplyBubble";
import { ReactionDetailsMenu } from "./ReactionDetailsMenu";
import { chatBackgroundStyle } from "./ChatBackground";
import { replyingToAtom } from "@/stores/ui";
import {
  isTransactionReference,
  normalizeTransactionReference,
  type TransactionReference,
} from "@/lib/xmtp/TransactionReferenceCodec";
import type { RemoteAttachmentContent } from "@/types/attachments";
import {
  isMultiAttachment,
  isSingleAttachment,
  isMultiAttachmentWrapper,
  extractAttachments,
} from "@/types/attachments";
import { useUsername } from "@/hooks/useUsername";
import { useMessages } from "@/hooks/useMessages";
import { xmtpClientAtom } from "@/stores/client";
import {
  readReceiptVersionAtom,
  reactionsVersionAtom,
} from "@/stores/messages";
import { linkPreviewEnabledAtom } from "@/stores/settings";
import { streamManager } from "@/lib/xmtp/StreamManager";
import type { DecodedMessage } from "@xmtp/browser-sdk";
import type { PendingMessage } from "@/types/messages";

// Common reaction emojis
const REACTION_EMOJIS = ["❤️", "👍", "👎", "😂", "😮", "😢"];

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
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
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
  memberPreviews?: MemberPreview[];
  peerAddress?: string;
  ownInboxId?: string;
}

function MessageReactions({
  messageId,
  isOwnMessage,
  memberPreviews,
  peerAddress,
  ownInboxId,
}: MessageReactionsProps) {
  const _reactionsVersion = useAtomValue(reactionsVersionAtom);
  const reactions = streamManager.getReactions(messageId);
  const [reactionMenu, setReactionMenu] = useState<{
    emoji: string;
    reactors: Array<{ inboxId: string; address?: string; isYou?: boolean }>;
    position: { x: number; y: number };
  } | null>(null);

  if (reactions.length === 0) return null;

  // Group reactions by emoji with sender info
  const grouped = reactions.reduce((acc, r) => {
    if (!acc[r.emoji]) {
      acc[r.emoji] = [];
    }
    // Look up address from inboxId
    const isYou = r.senderInboxId === ownInboxId;
    let address: string | undefined;
    if (isYou) {
      address = undefined; // Will show "You"
    } else if (memberPreviews) {
      address = memberPreviews.find(
        (m) => m.inboxId === r.senderInboxId
      )?.address;
    } else {
      address = peerAddress;
    }
    acc[r.emoji].push({ inboxId: r.senderInboxId, address, isYou });
    return acc;
  }, {} as Record<string, Array<{ inboxId: string; address?: string; isYou?: boolean }>>);

  const handleContextMenu = (
    e: React.MouseEvent,
    emoji: string,
    reactors: Array<{ inboxId: string; address?: string; isYou?: boolean }>
  ) => {
    e.preventDefault();
    e.stopPropagation();
    setReactionMenu({
      emoji,
      reactors,
      position: { x: e.clientX, y: e.clientY },
    });
  };

  return (
    <>
      <div
        className={`flex gap-1 -mt-2 relative z-10 ${
          isOwnMessage ? "justify-end pr-1" : "justify-start pl-1"
        }`}
      >
        {Object.entries(grouped).map(([emoji, reactors]) => (
          <div
            key={emoji}
            className="inline-flex items-center h-[24px] px-[9px] bg-[#F3F4F5] border-2 border-white rounded-[13px] text-[16px] cursor-pointer hover:bg-[#EBECEF] transition-colors"
            onContextMenu={(e) => handleContextMenu(e, emoji, reactors)}
            onClick={(e) => handleContextMenu(e, emoji, reactors)}
            title={`${reactors.length} ${
              reactors.length === 1 ? "reaction" : "reactions"
            }`}
          >
            <span>{emoji}</span>
            {reactors.length > 1 && (
              <span className="text-xs text-[#717680] ml-1">
                {reactors.length}
              </span>
            )}
          </div>
        ))}
      </div>
      {reactionMenu && (
        <ReactionDetailsMenu
          emoji={reactionMenu.emoji}
          reactors={reactionMenu.reactors}
          position={reactionMenu.position}
          onClose={() => setReactionMenu(null)}
        />
      )}
    </>
  );
}

interface MemberPreview {
  inboxId: string;
  address: string;
}

// Helper component to display sender name above messages
function SenderName({ address }: { address: string | undefined }) {
  const { displayName } = useUsername(address);
  const name =
    displayName ??
    (address ? `${address.slice(0, 6)}...${address.slice(-4)}` : "Unknown");

  return (
    <span className="text-[13px] text-[#86868B] mb-1 ml-1 block">{name}</span>
  );
}

// Telegram-style message sending animation - satisfying pop and slide
function AnimatedMessageWrapper({
  children,
  className = "",
  isSending = false,
}: {
  children: React.ReactNode;
  className?: string;
  isSending?: boolean;
}) {
  const [animationPhase, setAnimationPhase] = useState<'initial' | 'pop' | 'settle'>('initial');

  useEffect(() => {
    // Phase 1: Quick pop up with slight overshoot
    const popFrame = requestAnimationFrame(() => {
      setAnimationPhase('pop');
    });

    // Phase 2: Settle into final position
    const settleTimer = setTimeout(() => {
      setAnimationPhase('settle');
    }, 150);

    return () => {
      cancelAnimationFrame(popFrame);
      clearTimeout(settleTimer);
    };
  }, []);

  const getTransform = () => {
    switch (animationPhase) {
      case 'initial':
        return 'translateY(16px) scale(0.98)';
      case 'pop':
        return 'translateY(-2px) scale(1)';
      case 'settle':
        return 'translateY(0) scale(1)';
    }
  };

  return (
    <div
      className={`${className}`}
      style={{
        opacity: animationPhase === 'initial' ? 0 : 1,
        transform: getTransform(),
        transition: animationPhase === 'pop'
          ? 'all 0.15s cubic-bezier(0.34, 1.56, 0.64, 1)'
          : 'all 0.1s ease-out',
      }}
    >
      {children}
    </div>
  );
}

// Pending message bubble with send animation
interface PendingMessageBubbleProps {
  pending: PendingMessage;
  onRetry: (id: string) => void;
  isVerified?: boolean;
  isFirstInGroup?: boolean;
}

function PendingMessageBubble({
  pending,
  onRetry,
  isVerified = false,
  isFirstInGroup = true,
}: PendingMessageBubbleProps) {
  // Format current time for the timestamp
  const timeString = new Date().toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
  // Darker blue for pending verified, gray for unverified
  const bubbleBg =
    pending.status === "failed"
      ? "bg-red-100"
      : isVerified
      ? "bg-[#004ACC]"
      : "bg-[#717680]";

  // Match the radius logic from sent messages
  const senderRadius = isFirstInGroup
    ? "rounded-tl-[16px] rounded-tr-[16px] rounded-bl-[16px] rounded-br-[4px]"
    : "rounded-tl-[16px] rounded-tr-[4px] rounded-bl-[16px] rounded-br-[4px]";

  return (
    <AnimatedMessageWrapper className={`flex flex-col items-end ${isFirstInGroup ? "mt-3" : "mt-0.5"}`}>
      <div className="max-w-[300px]">
        <div
          className={`px-3 py-2 ${senderRadius} ${bubbleBg}`}
        >
          <p
            className={`text-[15px] leading-[1.35] ${
              pending.status === "failed" ? "text-red-800" : "text-white"
            }`}
          >
            {pending.content}
          </p>
        </div>
      </div>
      {/* Always show timestamp row - matches sent message layout exactly */}
      <div className="flex justify-end items-center gap-1.5 mt-1 pr-1">
        <span className="text-[11px] text-[#86868B] font-medium">
          {timeString}
        </span>
        {pending.status === "sending" && (
          <Clock className="w-3 h-3 text-[#86868B]" />
        )}
        {pending.status === "failed" && (
          <>
            <AlertCircle className="w-3 h-3 text-red-500" />
            <button
              onClick={() => onRetry(pending.id)}
              className="text-[11px] text-[#005CFF] hover:underline flex items-center gap-1"
            >
              <RotateCcw className="w-3 h-3" />
              Retry
            </button>
          </>
        )}
      </div>
    </AnimatedMessageWrapper>
  );
}

// Display item types for rendering
type DisplayItem =
  | { type: "date-separator"; date: string; id: string }
  | {
      type: "message";
      id: string;
      isFirstInGroup: boolean;
      isLastInGroup: boolean;
      showAvatar: boolean;
    }
  | { type: "pending"; id: string };

interface MessagePanelProps {
  conversationId: string;
  conversationType: "dm" | "group";
  peerAddress?: string;
  name?: string;
  avatarUrl?: string | null;
  isVerified?: boolean;
  subtitle?: string;
  groupName?: string;
  memberCount?: number;
  verifiedCount?: number;
  unverifiedCount?: number;
  memberPreviews?: MemberPreview[];
  isMessageRequest?: boolean;
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
  verifiedCount,
  unverifiedCount,
  memberPreviews,
  isMessageRequest = false,
}: MessagePanelProps) {
  const [message, setMessage] = useState("");
  const [isSending, setIsSending] = useState(false);
  const parentRef = useRef<HTMLDivElement>(null);

  // Reaction picker state
  const [reactionPicker, setReactionPicker] = useState<{
    messageId: string;
    position: { x: number; y: number };
  } | null>(null);

  // Context menu state (for Reply/Copy)
  const [contextMenu, setContextMenu] = useState<{
    messageId: string;
    content: string;
    senderAddress: string;
    position: { x: number; y: number };
  } | null>(null);

  // Reply state
  const [replyingTo, setReplyingTo] = useAtom(replyingToAtom);

  // Menu dropdown state
  const [showMenu, setShowMenu] = useState(false);
  const [isLeavingGroup, setIsLeavingGroup] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const { displayName } = useUsername(
    conversationType === "dm" ? peerAddress : null
  );
  const name =
    conversationType === "group"
      ? groupName || "Group Chat"
      : nameOverride ?? displayName;

  // Build group subtitle with verified/unverified counts
  const groupSubtitle:
    | { verified: number; unverified: number }
    | { total: number }
    | undefined =
    conversationType === "group"
      ? verifiedCount !== undefined && unverifiedCount !== undefined
        ? { verified: verifiedCount, unverified: unverifiedCount }
        : memberCount
        ? { total: memberCount }
        : undefined
      : undefined;

  const client = useAtomValue(xmtpClientAtom);
  const _readReceiptVersion = useAtomValue(readReceiptVersionAtom);
  const linkPreviewEnabled = useAtomValue(linkPreviewEnabledAtom);

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

  const ownInboxId = client?.inboxId ?? "";

  // Check if message should be displayed
  const shouldDisplayMessage = useCallback((msg: DecodedMessage): boolean => {
    const typeId = (msg.contentType as { typeId?: string })?.typeId;
    if (typeId === "readReceipt") return false;
    // Transaction references are displayed as payment cards
    if (typeId === "transactionReference") return true;
    // Remote attachments (images) are displayed as image cards - single or multi
    // Handle both old and new naming conventions
    if (
      typeId === "remoteAttachment" ||
      typeId === "remoteStaticAttachment" ||
      typeId === "multiRemoteAttachment" ||
      typeId === "multiRemoteStaticAttachment"
    )
      return true;
    return true;
  }, []);

  // Extract message text content
  const getMessageText = useCallback((msg: DecodedMessage): string | null => {
    const typeId = (msg.contentType as { typeId?: string })?.typeId;
    if (typeId === "readReceipt") return null;
    // Transaction references render as payment cards, not text
    if (typeId === "transactionReference") return null;
    // Remote attachments render as image cards, not text (handle both old and new naming)
    if (
      typeId === "remoteAttachment" ||
      typeId === "remoteStaticAttachment" ||
      typeId === "multiRemoteAttachment" ||
      typeId === "multiRemoteStaticAttachment"
    )
      return null;
    // Also check content shape for remote attachments (single or multi)
    if (isSingleAttachment(msg.content) || isMultiAttachment(msg.content))
      return null;
    if (typeId === "reaction") {
      const content = msg.content as { content?: string } | undefined;
      return content?.content ? `Reacted ${content.content}` : null;
    }

    let content = msg.content;

    // If content is undefined, try to decode from encodedContent
    if (content === undefined || content === null) {
      const encodedContent = (
        msg as { encodedContent?: { content?: Uint8Array } }
      ).encodedContent;
      if (encodedContent?.content) {
        try {
          const decoded = new TextDecoder().decode(encodedContent.content);
          // Try parsing as JSON first (for structured content)
          try {
            content = JSON.parse(decoded);
          } catch {
            // Not JSON, use as plain string
            content = decoded;
          }
        } catch {
          // Failed to decode
        }
      }
    }

    // Check for raw image attachment data (undecoded) - don't display as text
    if (typeof content === "string") {
      // If it looks like raw remote attachment data (contains CDN URL), don't display
      if (content.includes("chat-assets.toolsforhumanity.com")) {
        return null;
      }
      return content;
    }
    if (content && typeof content === "object") {
      if (
        "text" in content &&
        typeof (content as { text?: unknown }).text === "string"
      ) {
        return (content as { text: string }).text;
      }
      if ("content" in content) {
        const nested = (content as { content: unknown }).content;
        if (typeof nested === "string") return nested;
        if (nested && typeof nested === "object" && "text" in nested) {
          return (nested as { text: string }).text;
        }
      }
    }

    // Fallback: try to get fallback text from the message
    const fallback = (msg as { fallback?: string }).fallback;
    if (fallback && typeof fallback === "string") {
      return fallback;
    }

    return null;
  }, []);

  // Format date for separator following: Today → Yesterday → Day of week → Calendar date
  const formatDateSeparator = useCallback((ns: bigint): string => {
    const date = new Date(Number(ns / BigInt(1_000_000)));
    const now = new Date();

    // Reset time parts for accurate day comparison
    const dateOnly = new Date(
      date.getFullYear(),
      date.getMonth(),
      date.getDate()
    );
    const nowOnly = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const diffDays = Math.floor(
      (nowOnly.getTime() - dateOnly.getTime()) / (1000 * 60 * 60 * 24)
    );

    if (diffDays === 0) return "Today";
    if (diffDays === 1) return "Yesterday";

    // Within the last week, show day of week
    if (diffDays < 7) {
      return date.toLocaleDateString(undefined, { weekday: "long" });
    }

    // Older than a week, show full date
    return date.toLocaleDateString(undefined, {
      month: "long",
      day: "numeric",
      year: "numeric",
    });
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
    const messageData: Array<{
      id: string;
      senderId: string;
      dateKey: string;
      sentAtNs: bigint;
    }> = [];

    for (const id of reversedIds) {
      const msg = getMessage(id);
      if (!msg) continue;

      const typeId = (msg.contentType as { typeId?: string })?.typeId;
      if (typeId === "readReceipt") continue;

      // Check if has displayable content
      let content = msg.content;

      // If content is undefined, try to decode from encodedContent
      if (content === undefined || content === null) {
        const encodedContent = (
          msg as { encodedContent?: { content?: Uint8Array } }
        ).encodedContent;
        if (encodedContent?.content) {
          try {
            const decoded = new TextDecoder().decode(encodedContent.content);
            try {
              content = JSON.parse(decoded);
            } catch {
              content = decoded;
            }
          } catch {
            // Failed to decode
          }
        }
      }

      let hasDisplayableContent = false;

      // String content (basic text messages)
      if (typeof content === "string" && content.length > 0) {
        hasDisplayableContent = true;
      } else if (content && typeof content === "object") {
        // Text content in object form
        if ("text" in content) hasDisplayableContent = true;
        // Reply content (nested)
        else if ("content" in content) hasDisplayableContent = true;
        // Transaction references - our format
        else if ("txHash" in content) hasDisplayableContent = true;
        // Transaction references - XMTP format (World App)
        else if ("reference" in content) hasDisplayableContent = true;
        // Remote attachments (images) - single or multi
        else if (isSingleAttachment(content) || isMultiAttachment(content))
          hasDisplayableContent = true;
      }

      // Always show reactions, transaction references, and images by typeId
      if (typeId === "reaction") hasDisplayableContent = true;
      if (typeId === "transactionReference") hasDisplayableContent = true;
      // Handle both old and new attachment type naming
      if (
        typeId === "remoteAttachment" ||
        typeId === "remoteStaticAttachment" ||
        typeId === "multiRemoteAttachment" ||
        typeId === "multiRemoteStaticAttachment"
      )
        hasDisplayableContent = true;

      if (!hasDisplayableContent) continue;

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
          type: "date-separator",
          date: formatDateSeparator(curr.sentAtNs),
          id: `date-${curr.dateKey}`,
        });
      }

      // Determine if first/last in group
      const isFirstInGroup =
        !prev ||
        prev.senderId !== curr.senderId ||
        prev.dateKey !== curr.dateKey ||
        curr.sentAtNs - prev.sentAtNs > fiveMinutesNs;

      const isLastInGroup =
        !next ||
        next.senderId !== curr.senderId ||
        next.dateKey !== curr.dateKey ||
        next.sentAtNs - curr.sentAtNs > fiveMinutesNs;

      const isOwnMessage = curr.senderId === ownInboxId;

      items.push({
        type: "message",
        id: curr.id,
        isFirstInGroup,
        isLastInGroup,
        showAvatar: isFirstInGroup && !isOwnMessage,
      });
    }

    // Add pending messages at the end, but skip if a matching real message exists
    // This prevents the "jump" when both pending and real message briefly coexist
    for (const pending of pendingMessages) {
      // Check if any recent message matches this pending content
      const recentMessageIds = messageIds.slice(0, 5); // Check first 5 (newest)
      const matchingRealMessage = recentMessageIds.some((msgId) => {
        const msg = getMessage(msgId);
        if (!msg) return false;
        // Check if content matches and it's an own message
        const msgContent = typeof msg.content === "string" ? msg.content : "";
        return (
          msgContent === pending.content && msg.senderInboxId === ownInboxId
        );
      });

      if (!matchingRealMessage) {
        items.push({ type: "pending", id: pending.id });
      }
    }

    return items;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messageIds.join(","), pendingMessages.length, ownInboxId]);

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
    const replyToId = replyingTo?.messageId;
    setMessage("");
    setReplyingTo(null); // Clear reply state
    setIsSending(true);
    try {
      await sendMessage(content, replyToId);
    } catch (error) {
      console.error("Failed to send message:", error);
    } finally {
      setIsSending(false);
    }
  };

  const handleRetry = async (pendingId: string) => {
    try {
      await retryMessage(pendingId);
    } catch (error) {
      console.error("Failed to retry message:", error);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const formatTime = (ns: bigint): string => {
    const date = new Date(Number(ns / BigInt(1_000_000)));
    return date.toLocaleTimeString(undefined, {
      hour: "numeric",
      minute: "2-digit",
    });
  };

  // Handle right-click to show context menu
  const handleMessageContextMenu = useCallback(
    (
      e: React.MouseEvent,
      messageId: string,
      content: string,
      senderAddress: string
    ) => {
      e.preventDefault();
      setContextMenu({
        messageId,
        content,
        senderAddress,
        position: { x: e.clientX, y: e.clientY },
      });
    },
    []
  );

  // Handle reply from context menu
  const handleReply = useCallback(() => {
    if (!contextMenu) return;
    setReplyingTo({
      messageId: contextMenu.messageId,
      content: contextMenu.content,
      senderAddress: contextMenu.senderAddress,
    });
    setContextMenu(null);
  }, [contextMenu, setReplyingTo]);

  // Handle copy from context menu
  const handleCopy = useCallback(() => {
    if (!contextMenu) return;
    navigator.clipboard.writeText(contextMenu.content);
    setContextMenu(null);
  }, [contextMenu]);

  // Handle reaction selection
  const handleReactionSelect = useCallback(
    async (emoji: string) => {
      if (!reactionPicker) return;
      try {
        await streamManager.sendReaction(
          conversationId,
          reactionPicker.messageId,
          emoji
        );
      } catch (error) {
        console.error("Failed to send reaction:", error);
      }
      setReactionPicker(null);
    },
    [conversationId, reactionPicker]
  );

  // Close menu when clicking outside
  useEffect(() => {
    if (!showMenu) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowMenu(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showMenu]);

  // Handle leave group
  const handleLeaveGroup = useCallback(async () => {
    if (
      !client ||
      !client.inboxId ||
      conversationType !== "group" ||
      isLeavingGroup
    )
      return;

    setIsLeavingGroup(true);
    setShowMenu(false);

    try {
      const conversation = await client.conversations.getConversationById(
        conversationId
      );
      if (conversation && "removeMembers" in conversation) {
        // Remove self from group using removeMembers with own inboxId
        const group = conversation as {
          removeMembers: (ids: string[]) => Promise<void>;
        };
        await group.removeMembers([client.inboxId]);
        // Remove from local conversation list
        streamManager.removeConversation(conversationId);
      }
    } catch (error) {
      console.error("Failed to leave group:", error);
    } finally {
      setIsLeavingGroup(false);
    }
  }, [client, conversationType, conversationId, isLeavingGroup]);

  return (
    <div className="flex-1 flex flex-col bg-white">
      {/* Header */}
      <header className="shrink-0 h-16 px-4 flex items-center justify-between border-b border-gray-100">
        <div className="flex items-center gap-3">
          {conversationType === "group" ? (
            <Avatar
              isGroup
              groupName={groupName}
              imageUrl={avatarUrl}
              memberPreviews={memberPreviews}
              size="md"
            />
          ) : (
            <Avatar
              address={peerAddress}
              name={nameOverride}
              imageUrl={avatarUrl}
              size="md"
            />
          )}
          <div className="flex flex-col">
            <div className="flex items-center gap-1.5">
              <span className="font-semibold text-[#1D1D1F]">{name}</span>
              {isVerified && conversationType === "dm" && (
                <VerificationBadge size="sm" />
              )}
            </div>
            {subtitle && (
              <span className="text-sm text-[#86868B]">{subtitle}</span>
            )}
            {!subtitle && groupSubtitle && (
              <div className="flex items-center gap-1 text-sm text-[#86868B]">
                {"verified" in groupSubtitle ? (
                  <>
                    <VerificationBadge size="xs" />
                    <span>
                      {groupSubtitle.verified}{" "}
                      {groupSubtitle.verified === 1 ? "human" : "humans"}
                      {groupSubtitle.unverified > 0 &&
                        `, ${groupSubtitle.unverified} not verified`}
                    </span>
                  </>
                ) : (
                  <span>{groupSubtitle.total} members</span>
                )}
              </div>
            )}
          </div>
        </div>
        {/* Menu button - only show for groups */}
        {conversationType === "group" && (
          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setShowMenu(!showMenu)}
              className="w-9 h-9 flex items-center justify-center rounded-lg hover:bg-gray-100 transition-colors"
            >
              <MoreHorizontal className="w-5 h-5 text-[#717680]" />
            </button>

            {/* Dropdown menu */}
            {showMenu && (
              <div className="absolute right-0 top-full mt-1 bg-white rounded-xl shadow-lg border border-gray-100 py-1 min-w-[160px] z-50">
                <button
                  onClick={handleLeaveGroup}
                  disabled={isLeavingGroup}
                  className="w-full px-4 py-2.5 text-left text-[15px] text-red-600 hover:bg-gray-50 transition-colors flex items-center gap-2 disabled:opacity-50"
                >
                  {isLeavingGroup ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <LogOut className="w-4 h-4" />
                  )}
                  Leave group
                </button>
              </div>
            )}
          </div>
        )}
      </header>

      {/* Messages Area */}
      <div
        ref={parentRef}
        onScroll={handleScroll}
        className="flex-1 overflow-auto flex flex-col"
        style={chatBackgroundStyle}
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
              {/* Find the last own message to only show status there */}
              {(() => {
                // Find the last own message ID (excluding pending)
                const lastOwnMessageId = displayItems.reduce<string | null>(
                  (acc, item) => {
                    if (item.type === "message") {
                      const msg = getMessage(item.id);
                      if (msg && msg.senderInboxId === ownInboxId) {
                        return item.id;
                      }
                    }
                    return acc;
                  },
                  null
                );

                return displayItems.map((item, index) => {
                  // Date separator - show encryption banner after first date separator
                  if (item.type === "date-separator") {
                    const isFirstDateSeparator =
                      displayItems.findIndex(
                        (i) => i.type === "date-separator"
                      ) === index;
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

                  // Pending message - matches layout of sent messages exactly
                  if (item.type === "pending") {
                    const pending = pendingMessages.find(
                      (p) => p.id === item.id
                    );
                    if (!pending) return null;

                    // Check if previous item was an own message to determine grouping
                    const prevItem = index > 0 ? displayItems[index - 1] : null;
                    let isPendingFirstInGroup = true;
                    if (prevItem && prevItem.type === "message") {
                      const prevMsg = getMessage(prevItem.id);
                      if (prevMsg && prevMsg.senderInboxId === ownInboxId) {
                        // Previous message was from us, so this continues the group
                        isPendingFirstInGroup = false;
                      }
                    } else if (prevItem && prevItem.type === "pending") {
                      // Previous item is also a pending message from us
                      isPendingFirstInGroup = false;
                    }

                    return (
                      <PendingMessageBubble
                        key={item.id}
                        pending={pending}
                        onRetry={handleRetry}
                        isVerified={isVerified}
                        isFirstInGroup={isPendingFirstInGroup}
                      />
                    );
                  }

                  // Regular message
                  const msg = getMessage(item.id);
                  if (!msg) return null;

                  const isOwnMessage = msg.senderInboxId === ownInboxId;
                  const text = getMessageText(msg);
                  const { isFirstInGroup, isLastInGroup, showAvatar } = item;

                  // Check if this is a transaction reference (payment message)
                  const typeId = (msg.contentType as { typeId?: string })
                    ?.typeId;

                  // Try to get transaction content - may need to decode from fallback
                  let txContent = msg.content;

                  // If content is undefined but we have a transaction type, try to decode from fallback/encodedContent
                  if (typeId === "transactionReference" && !txContent) {
                    // Check for encodedContent (raw bytes that weren't decoded)
                    const encodedContent = (
                      msg as { encodedContent?: { content?: Uint8Array } }
                    ).encodedContent;
                    if (encodedContent?.content) {
                      try {
                        const decoded = new TextDecoder().decode(
                          encodedContent.content
                        );
                        txContent = JSON.parse(decoded);
                      } catch {
                        // Decode failed
                      }
                    }

                  }

                  const isPayment =
                    typeId === "transactionReference" &&
                    isTransactionReference(txContent);

                  // For payment messages, render PaymentMessage component
                  if (isPayment) {
                    const txRef = normalizeTransactionReference(
                      txContent as TransactionReference
                    );
                    return (
                      <div
                        key={item.id}
                        className={`flex ${
                          isOwnMessage ? "justify-end" : "items-start gap-3"
                        } ${isFirstInGroup ? "mt-3" : "mt-0.5"}`}
                      >
                        {/* Avatar for incoming payment */}
                        {!isOwnMessage && (
                          <div className="w-8 h-8 shrink-0 flex items-end mt-auto">
                            {isLastInGroup && (
                              <Avatar
                                address={
                                  conversationType === "group"
                                    ? memberPreviews?.find(
                                        (m) => m.inboxId === msg.senderInboxId
                                      )?.address
                                    : peerAddress
                                }
                                size="sm"
                              />
                            )}
                          </div>
                        )}
                        <div className="flex flex-col">
                          {/* Sender name for incoming */}
                          {!isOwnMessage && isFirstInGroup && (
                            <SenderName
                              address={
                                conversationType === "group"
                                  ? memberPreviews?.find(
                                      (m) => m.inboxId === msg.senderInboxId
                                    )?.address
                                  : peerAddress
                              }
                            />
                          )}
                          <PaymentMessage
                            txRef={txRef}
                            isOwnMessage={isOwnMessage}
                            sentAtNs={msg.sentAtNs}
                          />
                          {isLastInGroup && (
                            <span
                              className={`text-[11px] text-[#717680] font-medium mt-1 ${
                                isOwnMessage ? "text-right pr-1" : "ml-1"
                              }`}
                            >
                              {formatTime(msg.sentAtNs)}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  }

                  // For image messages, render ImageMessage or ImageGrid component
                  // Check for various attachment formats
                  const attachmentContent = msg.content;

                  // For multi-attachment types, show placeholder (SDK doesn't export codec yet)
                  const isMultiType =
                    typeId === "multiRemoteStaticAttachment" ||
                    typeId === "multiRemoteAttachment";
                  if (isMultiType) {
                    return (
                      <div
                        key={item.id}
                        className={`flex ${
                          isOwnMessage ? "justify-end" : "items-start gap-3"
                        } ${isFirstInGroup ? "mt-3" : "mt-0.5"}`}
                      >
                        {!isOwnMessage && (
                          <div className="w-8 h-8 shrink-0 flex items-end mt-auto">
                            {isLastInGroup && (
                              <Avatar
                                address={
                                  conversationType === "group"
                                    ? memberPreviews?.find(
                                        (m) => m.inboxId === msg.senderInboxId
                                      )?.address
                                    : peerAddress
                                }
                                size="sm"
                              />
                            )}
                          </div>
                        )}
                        <div className="flex flex-col">
                          {!isOwnMessage && isFirstInGroup && (
                            <SenderName
                              address={
                                conversationType === "group"
                                  ? memberPreviews?.find(
                                      (m) => m.inboxId === msg.senderInboxId
                                    )?.address
                                  : peerAddress
                              }
                            />
                          )}
                          <MultiAttachmentMessage isOwnMessage={isOwnMessage} />
                          <MessageReactions
                            messageId={item.id}
                            isOwnMessage={isOwnMessage}
                            memberPreviews={memberPreviews}
                            peerAddress={peerAddress}
                            ownInboxId={ownInboxId}
                          />
                          {isLastInGroup && (
                            <span
                              className={`text-[11px] text-[#717680] font-medium mt-1 ${
                                isOwnMessage ? "text-right pr-1" : "ml-1"
                              }`}
                            >
                              {formatTime(msg.sentAtNs)}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  }

                  const hasMultiAttachments =
                    isMultiAttachment(attachmentContent);
                  const hasMultiWrapper =
                    isMultiAttachmentWrapper(attachmentContent);
                  const hasSingleAttachment =
                    isSingleAttachment(attachmentContent);
                  const attachments = extractAttachments(attachmentContent);

                  // Check for raw/undecoded content (string with CDN URL embedded)
                  const contentStr =
                    typeof msg.content === "string" ? msg.content : "";
                  const hasRawCdnUrl = contentStr.includes(
                    "chat-assets.toolsforhumanity.com"
                  );

                  const hasAnyAttachment =
                    hasSingleAttachment ||
                    hasMultiAttachments ||
                    hasMultiWrapper;
                  // Handle single attachment types (multi-attachment types are handled above)
                  const isAttachmentType =
                    typeId === "remoteAttachment" ||
                    typeId === "remoteStaticAttachment";
                  const isImage =
                    (isAttachmentType || hasAnyAttachment) && attachmentContent;
                  const isRawImageData =
                    isAttachmentType && hasRawCdnUrl && !hasAnyAttachment;

                  // For raw undecoded image data, show a placeholder instead of gibberish
                  if (isRawImageData) {
                    return (
                      <div
                        key={item.id}
                        className={`flex ${
                          isOwnMessage ? "justify-end" : "items-start gap-3"
                        } ${isFirstInGroup ? "mt-3" : "mt-0.5"}`}
                      >
                        {!isOwnMessage && (
                          <div className="w-8 h-8 shrink-0 flex items-end mt-auto">
                            {isLastInGroup && (
                              <Avatar
                                address={
                                  conversationType === "group"
                                    ? memberPreviews?.find(
                                        (m) => m.inboxId === msg.senderInboxId
                                      )?.address
                                    : peerAddress
                                }
                                size="sm"
                              />
                            )}
                          </div>
                        )}
                        <div className="flex flex-col">
                          {!isOwnMessage && isFirstInGroup && (
                            <SenderName
                              address={
                                conversationType === "group"
                                  ? memberPreviews?.find(
                                      (m) => m.inboxId === msg.senderInboxId
                                    )?.address
                                  : peerAddress
                              }
                            />
                          )}
                          <div className="bg-[#F3F4F5] border border-[rgba(0,0,0,0.1)] rounded-[16px] px-4 py-3 text-[#717680] text-sm">
                            <div className="flex items-center gap-2">
                              <AlertCircle className="w-4 h-4" />
                              <span>Image unavailable - reload required</span>
                            </div>
                          </div>
                          {isLastInGroup && (
                            <span
                              className={`text-[11px] text-[#717680] font-medium mt-1 ${
                                isOwnMessage ? "text-right pr-1" : "ml-1"
                              }`}
                            >
                              {formatTime(msg.sentAtNs)}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  }

                  if (isImage) {
                    return (
                      <div
                        key={item.id}
                        className={`flex ${
                          isOwnMessage ? "justify-end" : "items-start gap-3"
                        } ${isFirstInGroup ? "mt-3" : "mt-0.5"}`}
                      >
                        {/* Avatar for incoming image */}
                        {!isOwnMessage && (
                          <div className="w-8 h-8 shrink-0 flex items-end mt-auto">
                            {isLastInGroup && (
                              <Avatar
                                address={
                                  conversationType === "group"
                                    ? memberPreviews?.find(
                                        (m) => m.inboxId === msg.senderInboxId
                                      )?.address
                                    : peerAddress
                                }
                                size="sm"
                              />
                            )}
                          </div>
                        )}
                        <div className="flex flex-col">
                          {/* Sender name for incoming */}
                          {!isOwnMessage && isFirstInGroup && (
                            <SenderName
                              address={
                                conversationType === "group"
                                  ? memberPreviews?.find(
                                      (m) => m.inboxId === msg.senderInboxId
                                    )?.address
                                  : peerAddress
                              }
                            />
                          )}
                          {/* Render ImageGrid for multiple attachments, ImageMessage for single */}
                          {attachments && attachments.length > 1 ? (
                            <ImageGrid
                              attachments={attachments}
                              isOwnMessage={isOwnMessage}
                            />
                          ) : attachments && attachments.length === 1 ? (
                            <ImageMessage
                              remoteAttachment={attachments[0]}
                              isOwnMessage={isOwnMessage}
                            />
                          ) : (
                            <ImageMessage
                              remoteAttachment={
                                attachmentContent as RemoteAttachmentContent
                              }
                              isOwnMessage={isOwnMessage}
                            />
                          )}
                          <MessageReactions
                            messageId={item.id}
                            isOwnMessage={isOwnMessage}
                            memberPreviews={memberPreviews}
                            peerAddress={peerAddress}
                            ownInboxId={ownInboxId}
                          />
                          {isLastInGroup && (
                            <span
                              className={`text-[11px] text-[#717680] font-medium mt-1 ${
                                isOwnMessage ? "text-right pr-1" : "ml-1"
                              }`}
                            >
                              {formatTime(msg.sentAtNs)}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  }

                  // Skip if text is null (non-displayable content types)
                  if (text === null) return null;

                  // Check if this is a reply message
                  const isReply = typeId === "reply";
                  if (isReply) {
                    // Extract reply content structure
                    const replyContent = msg.content as
                      | {
                          content?: string;
                          reference?: string;
                        }
                      | undefined;

                    const replyText = replyContent?.content ?? "";
                    const referencedMessageId = replyContent?.reference;

                    // Look up the original message
                    let quotedContent = "";
                    let quotedSenderAddress = "";
                    if (referencedMessageId) {
                      const originalMsg = getMessage(referencedMessageId);
                      if (originalMsg) {
                        quotedContent = getMessageText(originalMsg) ?? "";
                        // Get sender address
                        quotedSenderAddress =
                          conversationType === "group"
                            ? memberPreviews?.find(
                                (m) => m.inboxId === originalMsg.senderInboxId
                              )?.address ?? ""
                            : originalMsg.senderInboxId === ownInboxId
                            ? ""
                            : peerAddress ?? "";
                      }
                    }

                    // Get sender address for current message
                    const replySenderAddress =
                      conversationType === "group"
                        ? memberPreviews?.find(
                            (m) => m.inboxId === msg.senderInboxId
                          )?.address
                        : peerAddress;

                    return (
                      <div
                        key={item.id}
                        className={`flex ${
                          isOwnMessage ? "justify-end" : "items-start gap-3"
                        } ${isFirstInGroup ? "mt-3" : "mt-0.5"}`}
                      >
                        {/* Avatar for incoming replies */}
                        {!isOwnMessage && (
                          <div className="w-8 h-8 shrink-0 flex items-end mt-auto">
                            {isLastInGroup && (
                              <Avatar address={replySenderAddress} size="sm" />
                            )}
                          </div>
                        )}
                        <div
                          className="flex flex-col"
                          onContextMenu={(e) =>
                            handleMessageContextMenu(
                              e,
                              item.id,
                              replyText,
                              replySenderAddress ?? ""
                            )
                          }
                        >
                          {/* Sender name for incoming */}
                          {!isOwnMessage && isFirstInGroup && (
                            <SenderName address={replySenderAddress} />
                          )}
                          <ReplyBubble
                            quotedContent={quotedContent}
                            quotedSenderAddress={quotedSenderAddress}
                            replyContent={replyText}
                            isOwnMessage={isOwnMessage}
                            isFirstInGroup={isFirstInGroup}
                            isLastInGroup={isLastInGroup}
                            timestamp={
                              isLastInGroup
                                ? formatTime(msg.sentAtNs)
                                : undefined
                            }
                            isVerified={isVerified}
                          />
                          <MessageReactions
                            messageId={item.id}
                            isOwnMessage={isOwnMessage}
                            memberPreviews={memberPreviews}
                            peerAddress={peerAddress}
                            ownInboxId={ownInboxId}
                          />
                        </div>
                      </div>
                    );
                  }

                  // Outgoing message (sender)
                  if (isOwnMessage) {
                    const isRead = streamManager.isMessageRead(
                      conversationId,
                      msg.sentAtNs
                    );
                    const isUrlOnly = linkPreviewEnabled && isJustUrl(text);

                    // Sender bubble: all corners 16px except bottom-right is 8px (pointing to sender)
                    const senderRadius =
                      isFirstInGroup && isLastInGroup
                        ? "rounded-tl-[16px] rounded-tr-[16px] rounded-bl-[16px] rounded-br-[4px]"
                        : isFirstInGroup
                        ? "rounded-tl-[16px] rounded-tr-[16px] rounded-bl-[16px] rounded-br-[4px]"
                        : isLastInGroup
                        ? "rounded-tl-[16px] rounded-tr-[4px] rounded-bl-[16px] rounded-br-[4px]"
                        : "rounded-tl-[16px] rounded-tr-[4px] rounded-bl-[16px] rounded-br-[4px]";

                    // URL-only message: link preview IS the bubble
                    if (isUrlOnly) {
                      return (
                        <div
                          key={item.id}
                          className={`flex flex-col items-end ${
                            isFirstInGroup ? "mt-3" : "mt-0.5"
                          }`}
                        >
                          <div
                            onContextMenu={(e) =>
                              handleMessageContextMenu(e, item.id, text, "")
                            }
                          >
                            <MessageLinkPreview
                              text={text}
                              isOwnMessage={true}
                            />
                            <MessageReactions
                              messageId={item.id}
                              isOwnMessage={true}
                              memberPreviews={memberPreviews}
                              peerAddress={peerAddress}
                              ownInboxId={ownInboxId}
                            />
                          </div>
                          {/* Hide timestamp if there's a pending message after this - prevents jump on send */}
                          {isLastInGroup && !(displayItems[index + 1]?.type === "pending") && (
                            <div className="flex justify-end items-center gap-1.5 mt-1 pr-1">
                              <span className="text-[11px] text-[#86868B] font-medium">
                                {formatTime(msg.sentAtNs)}
                              </span>
                              {item.id === lastOwnMessageId &&
                                (isRead ? (
                                  <span className="text-[11px] text-[#00C230] font-medium">
                                    Read
                                  </span>
                                ) : (
                                  <span className="text-[11px] text-[#86868B]">
                                    Sent
                                  </span>
                                ))}
                            </div>
                          )}
                        </div>
                      );
                    }

                    return (
                      <div
                        key={item.id}
                        className={`flex flex-col items-end ${
                          isFirstInGroup ? "mt-3" : "mt-0.5"
                        }`}
                      >
                        <div className="max-w-[300px]">
                          <div
                            className={`${isVerified ? "bg-[#007AFF] shadow-sm shadow-[#007AFF]/20" : "bg-[#717680]"} px-3 py-2 ${senderRadius}`}
                            onContextMenu={(e) =>
                              handleMessageContextMenu(e, item.id, text, "")
                            }
                          >
                            <MessageText text={text} isOwnMessage={true} />
                          </div>
                          <MessageReactions
                            messageId={item.id}
                            isOwnMessage={true}
                            memberPreviews={memberPreviews}
                            peerAddress={peerAddress}
                            ownInboxId={ownInboxId}
                          />
                        </div>
                        {/* Link preview outside the bubble for messages with text + URL */}
                        {linkPreviewEnabled && extractUrls(text).length > 0 && (
                          <div className="mt-2">
                            <MessageLinkPreview
                              text={text}
                              isOwnMessage={true}
                            />
                          </div>
                        )}
                        {/* Hide timestamp if there's a pending message after this - prevents jump on send */}
                        {isLastInGroup && !(displayItems[index + 1]?.type === "pending") && (
                          <div className="flex justify-end items-center gap-1.5 mt-1 pr-1">
                            <span className="text-[11px] text-[#86868B] font-medium">
                              {formatTime(msg.sentAtNs)}
                            </span>
                            {/* Only show Sent/Read on the very last own message */}
                            {item.id === lastOwnMessageId &&
                              (isRead ? (
                                <span className="text-[11px] text-[#00C230] font-medium">
                                  Read
                                </span>
                              ) : (
                                <span className="text-[11px] text-[#86868B]">
                                  Sent
                                </span>
                              ))}
                          </div>
                        )}
                      </div>
                    );
                  }

                  // Incoming message (recipient)
                  // For group chats, look up address from memberPreviews
                  // For DMs, use the peerAddress
                  const senderAddress =
                    conversationType === "group"
                      ? memberPreviews?.find(
                          (m) => m.inboxId === msg.senderInboxId
                        )?.address
                      : peerAddress;

                  const isUrlOnly = linkPreviewEnabled && isJustUrl(text);

                  // Recipient bubble: all corners 16px except bottom-left is 4px (pointing to sender)
                  const recipientRadius =
                    isFirstInGroup && isLastInGroup
                      ? "rounded-tl-[16px] rounded-tr-[16px] rounded-bl-[4px] rounded-br-[16px]"
                      : isFirstInGroup
                      ? "rounded-tl-[16px] rounded-tr-[16px] rounded-bl-[4px] rounded-br-[16px]"
                      : isLastInGroup
                      ? "rounded-tl-[4px] rounded-tr-[16px] rounded-bl-[4px] rounded-br-[16px]"
                      : "rounded-tl-[4px] rounded-tr-[16px] rounded-bl-[4px] rounded-br-[16px]";

                  // URL-only incoming message: link preview IS the bubble
                  if (isUrlOnly) {
                    return (
                      <div
                        key={item.id}
                        className={`flex items-start gap-3 ${
                          isFirstInGroup ? "mt-3" : "mt-0.5"
                        }`}
                      >
                        <div className="w-8 h-8 shrink-0 flex items-end mt-auto">
                          {isLastInGroup && (
                            <Avatar address={senderAddress} size="sm" />
                          )}
                        </div>
                        <div className="flex flex-col">
                          {isFirstInGroup && (
                            <SenderName address={senderAddress} />
                          )}
                          <div
                            onContextMenu={(e) =>
                              handleMessageContextMenu(
                                e,
                                item.id,
                                text,
                                senderAddress ?? ""
                              )
                            }
                          >
                            <MessageLinkPreview
                              text={text}
                              isOwnMessage={false}
                            />
                            <MessageReactions
                              messageId={item.id}
                              isOwnMessage={false}
                              memberPreviews={memberPreviews}
                              peerAddress={peerAddress}
                              ownInboxId={ownInboxId}
                            />
                          </div>
                          {isLastInGroup && (
                            <span className="text-[11px] text-[#717680] font-medium mt-1 ml-1">
                              {formatTime(msg.sentAtNs)}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  }

                  return (
                    <div
                      key={item.id}
                      className={`flex items-start gap-3 ${
                        isFirstInGroup ? "mt-3" : "mt-0.5"
                      }`}
                    >
                      {/* Avatar - only show on last message of group, otherwise spacer */}
                      <div className="w-8 h-8 shrink-0 flex items-end mt-auto">
                        {isLastInGroup && (
                          <Avatar address={senderAddress} size="sm" />
                        )}
                      </div>
                      <div className="flex flex-col">
                        {/* Sender name - show on first message in group for all incoming messages */}
                        {isFirstInGroup && (
                          <SenderName address={senderAddress} />
                        )}
                        <div className="max-w-[300px]">
                          <div
                            className={`bg-[#F2F2F7] px-3 py-2 ${recipientRadius}`}
                            onContextMenu={(e) =>
                              handleMessageContextMenu(
                                e,
                                item.id,
                                text,
                                senderAddress ?? ""
                              )
                            }
                          >
                            <MessageText text={text} isOwnMessage={false} />
                          </div>
                          <MessageReactions
                            messageId={item.id}
                            isOwnMessage={false}
                            memberPreviews={memberPreviews}
                            peerAddress={peerAddress}
                            ownInboxId={ownInboxId}
                          />
                        </div>
                        {/* Link preview outside the bubble for messages with text + URL */}
                        {linkPreviewEnabled && extractUrls(text).length > 0 && (
                          <div className="mt-2">
                            <MessageLinkPreview
                              text={text}
                              isOwnMessage={false}
                            />
                          </div>
                        )}
                        {isLastInGroup && (
                          <span className="text-[11px] text-[#717680] font-medium mt-1 ml-1">
                            {formatTime(msg.sentAtNs)}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                });
              })()}
            </div>
          </div>
        )}
      </div>

      {/* Reply Preview */}
      {replyingTo && !isMessageRequest && (
        <ReplyPreview
          senderAddress={replyingTo.senderAddress}
          content={replyingTo.content}
          onDismiss={() => setReplyingTo(null)}
        />
      )}

      {/* Input Area or Action Bar for Message Requests */}
      {isMessageRequest ? (
        <RequestActionBar
          conversationId={conversationId}
          peerAddress={peerAddress}
        />
      ) : (
        <div className="shrink-0 px-4 py-2 border-t border-[#E5E5EA] bg-white">
          <div className="flex items-center gap-2">
            <button
              onClick={() =>
                alert("Coming soon! Ping Takis to work on this 📎")
              }
              className="w-11 h-11 flex items-center justify-center rounded-xl hover:bg-[#F2F2F7] transition-colors shrink-0 self-stretch"
            >
              <Paperclip className="w-5 h-5 text-[#86868B]" />
            </button>
            <textarea
              value={message}
              onChange={(e) => {
                setMessage(e.target.value);
                // Auto-resize textarea
                e.target.style.height = 'auto';
                e.target.style.height = Math.min(e.target.scrollHeight, 128) + 'px';
              }}
              onKeyDown={handleKeyDown}
              placeholder="Write a message..."
              rows={1}
              className="flex-1 min-w-0 px-4 py-2.5 bg-[#F2F2F7] border border-[#E5E5EA] rounded-2xl text-[#1D1D1F] placeholder-[#86868B] outline-none focus:ring-2 focus:ring-[#007AFF]/20 focus:border-[#007AFF]/30 resize-none leading-[1.4] transition-all"
              style={{ minHeight: '44px', maxHeight: '128px' }}
            />
            <button
              onClick={handleSend}
              disabled={!message.trim() || isSending}
              className="w-11 h-11 flex items-center justify-center rounded-xl bg-[#007AFF] hover:bg-[#0066CC] disabled:bg-[#E5E5EA] disabled:cursor-not-allowed transition-colors shrink-0 self-stretch active:scale-95"
            >
              {isSending ? (
                <Loader2 className="w-5 h-5 text-white animate-spin" />
              ) : (
                <Send className="w-5 h-5 text-white" />
              )}
            </button>
          </div>
        </div>
      )}

      {/* Context Menu */}
      {contextMenu && (
        <MessageContextMenu
          position={contextMenu.position}
          onReply={handleReply}
          onCopy={handleCopy}
          onClose={() => setContextMenu(null)}
        />
      )}

      {/* Reaction Picker (still available for emoji reactions) */}
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
