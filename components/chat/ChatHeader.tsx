'use client';

import { ScanLine, Search } from 'lucide-react';
import { Avatar } from '@/components/ui/Avatar';

interface ChatHeaderProps {
  userName?: string;
  userAvatarUrl?: string;
  onScanClick?: () => void;
  onProfileClick?: () => void;
  onSearchChange?: (query: string) => void;
  searchQuery?: string;
}

export function ChatHeader({
  userName = 'User',
  userAvatarUrl,
  onScanClick,
  onProfileClick,
  onSearchChange,
  searchQuery = '',
}: ChatHeaderProps) {
  return (
    <header className="shrink-0 bg-white">
      {/* Top Bar */}
      <div className="flex items-center justify-between px-6 py-3">
        {/* Scan Icon */}
        <button
          onClick={onScanClick}
          className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors"
          aria-label="Scan QR code"
        >
          <ScanLine className="w-7 h-7 text-[#181818]" />
        </button>

        {/* Title */}
        <h1 className="text-[22px] font-semibold text-[#181818]">
          Chat
        </h1>

        {/* Profile Avatar */}
        <button
          onClick={onProfileClick}
          className="rounded-full hover:opacity-80 transition-opacity"
          aria-label="Profile"
        >
          <Avatar name={userName} imageUrl={userAvatarUrl} size="sm" />
        </button>
      </div>

      {/* Search Bar */}
      <div className="px-6 pb-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[#9BA3AE]" />
          <input
            type="text"
            placeholder="Search"
            value={searchQuery}
            onChange={(e) => onSearchChange?.(e.target.value)}
            className="
              w-full h-11 pl-10 pr-4
              bg-[#F5F5F5] rounded-xl
              text-[15px] text-[#181818] placeholder-[#9BA3AE]
              outline-none focus:ring-2 focus:ring-[#005CFF]/20
              transition-shadow
            "
          />
        </div>
      </div>
    </header>
  );
}
