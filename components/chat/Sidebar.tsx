'use client';

import { useState, useEffect, useRef } from 'react';
import { useAtom } from 'jotai';
import { Search, SquarePen, X, Settings, Link2, Link2Off } from 'lucide-react';
import { ConversationList } from './ConversationList';
import { linkPreviewEnabledAtom } from '@/stores/settings';

// Global settings dropdown component
function GlobalSettingsDropdown() {
  const [isOpen, setIsOpen] = useState(false);
  const [linkPreviewEnabled, setLinkPreviewEnabled] = useAtom(linkPreviewEnabledAtom);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-9 h-9 flex items-center justify-center rounded-lg hover:bg-gray-100 transition-colors"
        title="Settings"
      >
        <Settings className="w-5 h-5 text-[#181818]" />
      </button>

      {isOpen && (
        <div className="absolute left-0 top-full mt-1 w-64 bg-white rounded-xl shadow-lg border border-gray-200 py-2 z-50">
          <div className="px-3 py-1.5 text-xs font-medium text-[#9BA3AE] uppercase tracking-wider">
            Privacy
          </div>
          <button
            onClick={() => setLinkPreviewEnabled(!linkPreviewEnabled)}
            className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-gray-50 transition-colors"
          >
            {linkPreviewEnabled ? (
              <Link2 className="w-5 h-5 text-[#00C230]" />
            ) : (
              <Link2Off className="w-5 h-5 text-[#9BA3AE]" />
            )}
            <div className="flex-1 text-left">
              <p className="text-[14px] text-[#181818]">Link Previews</p>
              <p className="text-[12px] text-[#717680]">
                {linkPreviewEnabled ? 'URLs will be fetched for previews' : 'URLs won\'t be fetched'}
              </p>
            </div>
            <div
              className={`w-10 h-6 rounded-full p-0.5 transition-colors ${
                linkPreviewEnabled ? 'bg-[#00C230]' : 'bg-[#D6D9DD]'
              }`}
            >
              <div
                className={`w-5 h-5 rounded-full bg-white shadow transition-transform ${
                  linkPreviewEnabled ? 'translate-x-4' : 'translate-x-0'
                }`}
              />
            </div>
          </button>
        </div>
      )}
    </div>
  );
}

interface SidebarProps {
  onNewChat?: () => void;
}

export function Sidebar({ onNewChat }: SidebarProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  // Debounce search query - 250ms after user stops typing
  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    debounceRef.current = setTimeout(() => {
      setDebouncedQuery(searchQuery);
    }, 250);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [searchQuery]);

  const clearSearch = () => {
    setSearchQuery('');
    setDebouncedQuery('');
  };

  return (
    <aside className="w-[320px] lg:w-[380px] h-full bg-white border-r border-gray-200 flex flex-col shrink-0">
      {/* Header */}
      <header className="shrink-0 px-4 py-3 border-b border-gray-100">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-1">
            <h1 className="text-xl font-semibold text-[#181818]">Chats</h1>
            <GlobalSettingsDropdown />
          </div>
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
              w-full h-10 pl-9 pr-9
              bg-[#F5F5F5] rounded-lg
              text-sm text-[#181818] placeholder-[#9BA3AE]
              outline-none focus:ring-2 focus:ring-[#005CFF]/20
              transition-shadow
            "
          />
          {searchQuery && (
            <button
              onClick={clearSearch}
              className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#9BA3AE] hover:text-[#717680]"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </header>

      {/* Conversation List */}
      <div className="flex-1 overflow-hidden">
        <ConversationList searchQuery={debouncedQuery} />
      </div>
    </aside>
  );
}
