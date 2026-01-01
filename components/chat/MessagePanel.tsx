'use client';

import { useState } from 'react';
import { Search, MoreHorizontal, Paperclip, Smile, Send } from 'lucide-react';
import { Avatar } from '@/components/ui/Avatar';
import { VerificationBadge } from '@/components/ui/VerificationBadge';

interface MessagePanelProps {
  conversationId: string;
  name: string;
  avatarUrl?: string | null;
  isVerified?: boolean;
  subtitle?: string;
}

export function MessagePanel({
  conversationId,
  name,
  avatarUrl,
  isVerified = false,
  subtitle,
}: MessagePanelProps) {
  const [message, setMessage] = useState('');

  const handleSend = () => {
    if (!message.trim()) return;
    console.log('Send message:', message);
    setMessage('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex-1 flex flex-col bg-white">
      {/* Header */}
      <header className="shrink-0 h-16 px-4 flex items-center justify-between border-b border-gray-100">
        <div className="flex items-center gap-3">
          <Avatar name={name} imageUrl={avatarUrl} size="sm" />
          <div className="flex flex-col">
            <div className="flex items-center gap-1.5">
              <span className="font-semibold text-[#181818]">{name}</span>
              {isVerified && <VerificationBadge size="sm" />}
            </div>
            {subtitle && (
              <span className="text-sm text-[#717680]">{subtitle}</span>
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
      <div className="flex-1 overflow-auto p-4 bg-[#F5F5F5]">
        {/* Placeholder - Messages will go here */}
        <div className="flex flex-col gap-4">
          {/* Sample incoming message */}
          <div className="flex gap-2 max-w-[70%]">
            <Avatar name={name} imageUrl={avatarUrl} size="sm" className="shrink-0 mt-1" />
            <div>
              <div className="bg-white rounded-2xl rounded-tl-md px-4 py-2 shadow-sm">
                <p className="text-[#181818]">Hey! How are you doing?</p>
              </div>
              <span className="text-xs text-[#9BA3AE] mt-1 ml-2">10:30 AM</span>
            </div>
          </div>

          {/* Sample outgoing message */}
          <div className="flex justify-end">
            <div className="max-w-[70%]">
              <div className="bg-[#005CFF] rounded-2xl rounded-tr-md px-4 py-2">
                <p className="text-white">I'm doing great, thanks for asking!</p>
              </div>
              <div className="flex justify-end">
                <span className="text-xs text-[#9BA3AE] mt-1 mr-2">10:31 AM</span>
              </div>
            </div>
          </div>

          {/* Sample incoming with reply quote */}
          <div className="flex gap-2 max-w-[70%]">
            <Avatar name={name} imageUrl={avatarUrl} size="sm" className="shrink-0 mt-1" />
            <div>
              <div className="bg-white rounded-2xl rounded-tl-md px-4 py-2 shadow-sm">
                <div className="border-l-2 border-[#005CFF] pl-2 mb-2 text-sm text-[#717680]">
                  I'm doing great, thanks for asking!
                </div>
                <p className="text-[#181818]">That's great to hear! Want to grab coffee later?</p>
              </div>
              <span className="text-xs text-[#9BA3AE] mt-1 ml-2">10:32 AM</span>
            </div>
          </div>
        </div>
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
            disabled={!message.trim()}
            className="
              w-10 h-10 flex items-center justify-center rounded-lg
              bg-[#005CFF] hover:bg-[#0052E0]
              disabled:bg-gray-200 disabled:cursor-not-allowed
              transition-colors shrink-0
            "
          >
            <Send className="w-5 h-5 text-white" />
          </button>
        </div>
      </div>
    </div>
  );
}
