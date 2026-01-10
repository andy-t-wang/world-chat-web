'use client';

import { useUsername } from '@/hooks/useUsername';

interface ReplyBubbleProps {
  /** The text being replied to */
  quotedContent: string;
  /** Address of the original message sender */
  quotedSenderAddress: string;
  /** The reply message content */
  replyContent: string;
  /** Whether this is the current user's message */
  isOwnMessage: boolean;
  /** Whether this is the first message in a group */
  isFirstInGroup: boolean;
  /** Whether this is the last message in a group */
  isLastInGroup: boolean;
  /** Timestamp to display */
  timestamp?: string;
  /** Whether the conversation is verified (for bubble color) */
  isVerified?: boolean;
}

export function ReplyBubble({
  quotedContent,
  quotedSenderAddress,
  replyContent,
  isOwnMessage,
  isFirstInGroup,
  isLastInGroup,
  timestamp,
  isVerified = false,
}: ReplyBubbleProps) {
  const { displayName } = useUsername(quotedSenderAddress);

  // Dynamic border radius based on position in group
  const getReplyRadius = () => {
    if (isOwnMessage) {
      // Outgoing: rounded except bottom-right for last, all rounded for first
      if (isFirstInGroup && isLastInGroup) {
        return 'rounded-tl-[16px] rounded-tr-[16px] rounded-bl-[16px] rounded-br-[4px]';
      }
      if (isFirstInGroup) {
        return 'rounded-tl-[16px] rounded-tr-[16px] rounded-bl-[16px] rounded-br-[16px]';
      }
      if (isLastInGroup) {
        return 'rounded-tl-[16px] rounded-tr-[16px] rounded-bl-[16px] rounded-br-[4px]';
      }
      return 'rounded-[16px]';
    } else {
      // Incoming: rounded except bottom-left for last
      if (isFirstInGroup && isLastInGroup) {
        return 'rounded-tl-[16px] rounded-tr-[16px] rounded-bl-[4px] rounded-br-[16px]';
      }
      if (isFirstInGroup) {
        return 'rounded-[16px]';
      }
      if (isLastInGroup) {
        return 'rounded-tl-[16px] rounded-tr-[16px] rounded-bl-[4px] rounded-br-[16px]';
      }
      return 'rounded-[16px]';
    }
  };

  // Bubble background color
  const bubbleBg = isOwnMessage
    ? (isVerified ? 'bg-[#005CFF]' : 'bg-[#717680]')
    : 'bg-white';

  const textColor = isOwnMessage ? 'text-white' : 'text-[#181818]';

  return (
    <div className={`flex flex-col gap-[2px] ${isOwnMessage ? 'items-end' : 'items-start'}`}>
      {/* Replied to label */}
      <div className={`flex items-center gap-1 px-1 ${isOwnMessage ? 'justify-end' : 'justify-start'}`}>
        <span className="text-[13px] text-[#9BA3AE]">
          Replied to {displayName}
        </span>
      </div>

      {/* Quoted message with connector bar */}
      <div className={`flex gap-2 items-stretch ${isOwnMessage ? 'flex-row' : 'flex-row-reverse'}`}>
        {/* Quoted message bubble */}
        <div className="max-w-[300px] px-3 py-[7px] bg-[#F9FAFB] rounded-[16px]">
          <p className="text-[15px] text-[#9BA3AE] leading-[1.3] line-clamp-2 break-words">
            {quotedContent}
          </p>
        </div>
        {/* Vertical connector bar */}
        <div className="w-1 bg-[#F3F4F5] rounded-full self-stretch" />
      </div>

      {/* Reply message bubble */}
      <div className={`max-w-[300px] px-3 py-[7px] ${bubbleBg} ${getReplyRadius()}`}>
        <p className={`text-[15px] leading-[1.3] break-words ${textColor} ${isOwnMessage ? 'opacity-90' : ''}`}>
          {replyContent}
        </p>
      </div>

      {/* Timestamp */}
      {timestamp && isLastInGroup && (
        <div className={`flex items-center gap-1 px-1 mt-1 ${isOwnMessage ? 'justify-end' : 'justify-start'}`}>
          <span className="text-[11px] text-[#717680] font-medium">
            {timestamp}
          </span>
        </div>
      )}
    </div>
  );
}
