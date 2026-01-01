'use client';

import { Pin, BellOff, Image, Video, Ban } from 'lucide-react';
import { Avatar } from '@/components/ui/Avatar';
import { VerificationBadge } from '@/components/ui/VerificationBadge';
import { useUsername } from '@/hooks/useUsername';

interface MemberPreview {
  inboxId: string;
  address: string;
}

export interface ConversationItemProps {
  id: string;
  /** Type of conversation */
  conversationType: 'dm' | 'group';
  /** Peer's wallet address - used for DMs */
  peerAddress?: string;
  /** Override display name (if not using username lookup) */
  name?: string;
  /** Override avatar URL (if not using profile picture lookup) */
  avatarUrl?: string | null;
  /** Group name - for groups */
  groupName?: string;
  /** Number of members - for groups */
  memberCount?: number;
  /** Member previews for group avatars */
  memberPreviews?: MemberPreview[];
  isVerified?: boolean;
  lastMessage?: string | null;
  lastMessageType?: 'text' | 'image' | 'video' | 'deleted' | 'reaction';
  reactionEmoji?: string;
  reactionTarget?: string;
  isTyping?: boolean;
  typingUser?: string;
  timestamp?: string;
  unreadCount?: number;
  isPinned?: boolean;
  isMuted?: boolean;
  isSelected?: boolean;
  onClick?: () => void;
}

function formatPreview(props: ConversationItemProps): React.ReactNode {
  const { isTyping, typingUser, lastMessageType, lastMessage, reactionEmoji, reactionTarget } = props;

  if (isTyping) {
    return (
      <span className="italic">
        {typingUser ? `${typingUser} is typing...` : 'typing...'}
      </span>
    );
  }

  if (lastMessageType === 'deleted') {
    return (
      <span className="flex items-center gap-1">
        <Ban className="w-3.5 h-3.5" />
        You deleted this message
      </span>
    );
  }

  if (lastMessageType === 'reaction' && reactionEmoji) {
    return (
      <span>
        You reacted {reactionEmoji} to "{reactionTarget}"
      </span>
    );
  }

  if (lastMessageType === 'image') {
    return (
      <span className="flex items-center gap-1">
        <Image className="w-3.5 h-3.5" />
        {lastMessage || '1 photo'}
      </span>
    );
  }

  if (lastMessageType === 'video') {
    return (
      <span className="flex items-center gap-1">
        <Video className="w-3.5 h-3.5" />
        {lastMessage || '1 video'}
      </span>
    );
  }

  return <span>{lastMessage || 'New conversation'}</span>;
}

export function ConversationItem(props: ConversationItemProps) {
  const {
    conversationType,
    peerAddress,
    name: nameOverride,
    avatarUrl,
    groupName,
    memberCount,
    memberPreviews,
    isVerified = false,
    timestamp,
    unreadCount = 0,
    isPinned = false,
    isMuted = false,
    isSelected = false,
    onClick,
  } = props;

  // For DMs: Fetch username and profile picture from World App Username API
  const { displayName } = useUsername(conversationType === 'dm' ? peerAddress : null);

  // Determine display name based on conversation type
  const name = conversationType === 'group'
    ? (groupName || 'Group Chat')
    : (nameOverride ?? displayName);

  // Subtitle for groups (member count)
  const subtitle = conversationType === 'group' && memberCount
    ? `${memberCount} members`
    : undefined;

  return (
    <button
      onClick={onClick}
      className={`
        w-full flex items-center gap-3 px-4 py-2.5
        transition-colors duration-150 text-left
        ${isSelected
          ? 'bg-[#3B82F6] hover:bg-[#2563EB]'
          : 'hover:bg-gray-50 active:bg-gray-100'
        }
      `}
    >
      {/* Avatar */}
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

      {/* Content */}
      <div className="flex-1 min-w-0 flex items-center gap-3">
        {/* User/Group Info */}
        <div className="flex-1 min-w-0 flex flex-col gap-0.5">
          {/* Name Row */}
          <div className="flex items-center gap-1">
            <span className={`text-[15px] font-medium truncate max-w-[160px] ${isSelected ? 'text-white' : 'text-[#181818]'}`}>
              {name}
            </span>
            {isVerified && conversationType === 'dm' && <VerificationBadge size="sm" />}
          </div>

          {/* Preview Row - show subtitle for groups if no last message, otherwise show preview */}
          <div className={`text-[14px] leading-[1.3] truncate ${isSelected ? 'text-white/70' : 'text-[#717680]'}`}>
            {props.lastMessage ? formatPreview(props) : (subtitle || formatPreview(props))}
          </div>
        </div>

        {/* Right Side */}
        <div className="flex flex-col items-end gap-1 shrink-0">
          {/* Timestamp */}
          {timestamp && (
            <span className={`text-[13px] leading-[1.3] ${isSelected ? 'text-white/70' : 'text-[#9BA3AE]'}`}>
              {timestamp}
            </span>
          )}

          {/* Indicators */}
          <div className="flex items-center gap-1.5">
            {isMuted && (
              <BellOff className={`w-4 h-4 ${isSelected ? 'text-white/70' : 'text-[#9BA3AE]'}`} />
            )}
            {isPinned && (
              <Pin className={`w-4 h-4 ${isSelected ? 'text-white/70' : 'text-[#9BA3AE]'}`} />
            )}
            {unreadCount > 0 && (
              <span className={`min-w-[20px] h-5 px-1.5 rounded-full text-xs font-medium flex items-center justify-center ${
                isSelected ? 'bg-white text-[#3B82F6]' : 'bg-[#3B82F6] text-white'
              }`}>
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </div>
        </div>
      </div>
    </button>
  );
}
