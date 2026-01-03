'use client';

import { X } from 'lucide-react';
import { useUsername } from '@/hooks/useUsername';

interface ReplyPreviewProps {
  senderAddress: string;
  content: string;
  onDismiss: () => void;
}

export function ReplyPreview({
  senderAddress,
  content,
  onDismiss,
}: ReplyPreviewProps) {
  const { displayName } = useUsername(senderAddress);

  return (
    <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-white">
      <div className="flex flex-col gap-1 min-w-0 flex-1">
        <span className="text-[15px] font-medium text-[#181818]">
          Replying to {displayName}
        </span>
        <p className="text-[15px] text-[#717680] truncate">
          {content}
        </p>
      </div>
      <button
        onClick={onDismiss}
        className="ml-3 p-1 rounded-full hover:bg-gray-100 transition-colors shrink-0"
        aria-label="Cancel reply"
      >
        <X className="w-5 h-5 text-[#9BA3AE]" />
      </button>
    </div>
  );
}
