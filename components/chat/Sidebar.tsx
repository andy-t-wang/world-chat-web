'use client';

import { useState } from 'react';
import { Search, SquarePen } from 'lucide-react';
import { ConversationList } from './ConversationList';

interface SidebarProps {
  onNewChat?: () => void;
}

export function Sidebar({ onNewChat }: SidebarProps) {
  const [searchQuery, setSearchQuery] = useState('');

  return (
    <aside className="w-[320px] lg:w-[380px] h-full bg-white border-r border-gray-200 flex flex-col shrink-0">
      {/* Header */}
      <header className="shrink-0 px-4 py-3 border-b border-gray-100">
        <div className="flex items-center justify-between mb-3">
          <h1 className="text-xl font-semibold text-[#181818]">Chats</h1>
          <button
            onClick={onNewChat}
            className="w-9 h-9 flex items-center justify-center rounded-lg hover:bg-gray-100 transition-colors"
            aria-label="New chat"
          >
            <SquarePen className="w-5 h-5 text-[#181818]" />
          </button>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#9BA3AE]" />
          <input
            type="text"
            placeholder="Search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="
              w-full h-10 pl-9 pr-3
              bg-[#F5F5F5] rounded-lg
              text-sm text-[#181818] placeholder-[#9BA3AE]
              outline-none focus:ring-2 focus:ring-[#005CFF]/20
              transition-shadow
            "
          />
        </div>
      </header>

      {/* Conversation List */}
      <div className="flex-1 overflow-hidden">
        <ConversationList requestCount={2} />
      </div>
    </aside>
  );
}
