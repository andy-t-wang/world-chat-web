'use client';

import { Pin, BellOff, Image, Video, Ban } from 'lucide-react';
import { Avatar } from '@/components/ui/Avatar';
import { VerificationBadge } from '@/components/ui/VerificationBadge';

export interface ConversationItemProps {
  id: string;
  name: string;
  avatarUrl?: string | null;
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
      <span className="text-[#717680] italic">
        {typingUser ? `${typingUser} is typing...` : 'typing...'}
      </span>
    );
  }

  if (lastMessageType === 'deleted') {
    return (
      <span className="flex items-center gap-1 text-[#717680]">
        <Ban className="w-3.5 h-3.5" />
        You deleted this message
      </span>
    );
  }

  if (lastMessageType === 'reaction' && reactionEmoji) {
    return (
      <span className="text-[#717680]">
        You reacted {reactionEmoji} to "{reactionTarget}"
      </span>
    );
  }

  if (lastMessageType === 'image') {
    return (
      <span className="flex items-center gap-1 text-[#717680]">
        <Image className="w-3.5 h-3.5" />
        {lastMessage || '1 photo'}
      </span>
    );
  }

  if (lastMessageType === 'video') {
    return (
      <span className="flex items-center gap-1 text-[#717680]">
        <Video className="w-3.5 h-3.5" />
        {lastMessage || '1 video'}
      </span>
    );
  }

  return <span className="text-[#717680]">{lastMessage || ''}</span>;
}

export function ConversationItem(props: ConversationItemProps) {
  const {
    name,
    avatarUrl,
    isVerified = false,
    timestamp,
    unreadCount = 0,
    isPinned = false,
    isMuted = false,
    isSelected = false,
    onClick,
  } = props;

  return (
    <button
      onClick={onClick}
      className={`
        w-full flex items-center gap-3 px-4 py-2.5
        transition-colors duration-150 text-left
        ${isSelected
          ? 'bg-[#005CFF] hover:bg-[#0052E0]'
          : 'hover:bg-gray-50 active:bg-gray-100'
        }
      `}
    >
      {/* Avatar */}
      <Avatar name={name} imageUrl={avatarUrl} size="sm" />

      {/* Content */}
      <div className="flex-1 min-w-0 flex items-center gap-3">
        {/* User Info */}
        <div className="flex-1 min-w-0 flex flex-col gap-0.5">
          {/* Name Row */}
          <div className="flex items-center gap-1">
            <span className={`text-[15px] font-medium truncate max-w-[160px] ${isSelected ? 'text-white' : 'text-[#181818]'}`}>
              {name}
            </span>
            {isVerified && <VerificationBadge size="sm" />}
          </div>

          {/* Preview Row */}
          <div className={`text-[14px] leading-[1.3] truncate ${isSelected ? 'text-white/70' : 'text-[#717680]'}`}>
            {formatPreview(props)}
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
                isSelected ? 'bg-white text-[#005CFF]' : 'bg-[#005CFF] text-white'
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
