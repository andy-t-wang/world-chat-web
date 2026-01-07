'use client';

import { useState, useEffect, useRef } from 'react';
import { useAtom, useSetAtom } from 'jotai';
import { Search, SquarePen, X, Settings, Link2, Link2Off, Volume2, VolumeX, MessageSquare, MessageSquareOff, LogOut } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { clearSession } from '@/lib/auth/session';
import { clearSessionCache } from '@/lib/storage';
import { streamManager } from '@/lib/xmtp/StreamManager';
import { ConversationList } from './ConversationList';
import { MessageRequestsView } from './MessageRequestsView';
import { NotificationBanner } from './NotificationBanner';
import { UpdateBanner } from './UpdateBanner';
import { linkPreviewEnabledAtom, soundMutedAtom, hideEmptyConversationsAtom } from '@/stores/settings';
import { showMessageRequestsAtom } from '@/stores/ui';
import { useMessageRequests } from '@/hooks/useConversations';

// Global settings dropdown component
function GlobalSettingsDropdown() {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [linkPreviewEnabled, setLinkPreviewEnabled] = useAtom(linkPreviewEnabledAtom);
  const [soundMuted, setSoundMuted] = useAtom(soundMutedAtom);
  const [hideEmptyConversations, setHideEmptyConversations] = useAtom(hideEmptyConversationsAtom);
  const [version, setVersion] = useState<string | null>(null);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const handleLogout = async () => {
    if (isLoggingOut) return;
    setIsLoggingOut(true);
    try {
      // Stop all XMTP streams
      streamManager.cleanup();
      // Clear web session
      clearSession();
      // Clear storage (uses Electron encrypted storage or localStorage)
      await clearSessionCache();
      // Redirect to login
      router.push('/');
    } catch (error) {
      console.error('Logout failed:', error);
      setIsLoggingOut(false);
    }
  };

  // Fetch version from Electron
  useEffect(() => {
    const electronAPI = (window as { electronAPI?: { getVersion?: () => Promise<string> } }).electronAPI;
    if (electronAPI?.getVersion) {
      electronAPI.getVersion().then(setVersion).catch(() => {});
    }
  }, []);

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
        <div className="absolute right-0 bottom-full mb-1 w-64 bg-white rounded-xl shadow-lg border border-gray-200 py-2 z-50">
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
          <button
            onClick={() => setSoundMuted(!soundMuted)}
            className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-gray-50 transition-colors"
          >
            {soundMuted ? (
              <VolumeX className="w-5 h-5 text-[#9BA3AE]" />
            ) : (
              <Volume2 className="w-5 h-5 text-[#00C230]" />
            )}
            <div className="flex-1 text-left">
              <p className="text-[14px] text-[#181818]">Notification Sounds</p>
              <p className="text-[12px] text-[#717680]">
                {soundMuted ? 'Sounds are muted' : 'Play sound on new messages'}
              </p>
            </div>
            <div
              className={`w-10 h-6 rounded-full p-0.5 transition-colors ${
                !soundMuted ? 'bg-[#00C230]' : 'bg-[#D6D9DD]'
              }`}
            >
              <div
                className={`w-5 h-5 rounded-full bg-white shadow transition-transform ${
                  !soundMuted ? 'translate-x-4' : 'translate-x-0'
                }`}
              />
            </div>
          </button>
          <div className="px-3 py-1.5 text-xs font-medium text-[#9BA3AE] uppercase tracking-wider border-t border-gray-100 mt-1 pt-2">
            Display
          </div>
          <button
            onClick={() => setHideEmptyConversations(!hideEmptyConversations)}
            className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-gray-50 transition-colors"
          >
            {hideEmptyConversations ? (
              <MessageSquareOff className="w-5 h-5 text-[#00C230]" />
            ) : (
              <MessageSquare className="w-5 h-5 text-[#9BA3AE]" />
            )}
            <div className="flex-1 text-left">
              <p className="text-[14px] text-[#181818]">Hide Empty Chats</p>
              <p className="text-[12px] text-[#717680]">
                {hideEmptyConversations ? 'Chats with no messages hidden' : 'Showing all chats'}
              </p>
            </div>
            <div
              className={`w-10 h-6 rounded-full p-0.5 transition-colors ${
                hideEmptyConversations ? 'bg-[#00C230]' : 'bg-[#D6D9DD]'
              }`}
            >
              <div
                className={`w-5 h-5 rounded-full bg-white shadow transition-transform ${
                  hideEmptyConversations ? 'translate-x-4' : 'translate-x-0'
                }`}
              />
            </div>
          </button>

          {/* Version */}
          {version && (
            <div className="px-3 py-2 border-t border-gray-100 mt-1">
              <p className="text-[11px] text-[#9BA3AE] text-center">
                World Chat v{version}
              </p>
            </div>
          )}

          {/* Logout */}
          <div className="border-t border-gray-100 mt-1 pt-1">
            <button
              onClick={handleLogout}
              disabled={isLoggingOut}
              className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-red-50 transition-colors text-red-500 disabled:opacity-50"
            >
              <LogOut className="w-5 h-5" />
              <span className="text-[14px]">
                {isLoggingOut ? 'Logging out...' : 'Log Out'}
              </span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

interface SidebarProps {
  onNewChat?: () => void;
  className?: string;
  width?: number;
}

export function Sidebar({ onNewChat, className, width }: SidebarProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  const [showRequests, setShowRequests] = useAtom(showMessageRequestsAtom);
  const { requestCount, newRequestCount } = useMessageRequests();

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

  // Show MessageRequestsView when toggled
  if (showRequests) {
    return (
      <aside
        className={`h-full bg-white border-r border-gray-200 flex flex-col shrink-0 ${className || ''}`}
        style={{ width: width || 320 }}
      >
        {/* Electron drag region */}
        <div className="electron-drag h-8 shrink-0" />
        <MessageRequestsView onBack={() => setShowRequests(false)} />
      </aside>
    );
  }

  return (
    <aside
      className={`h-full bg-white border-r border-gray-200 flex flex-col shrink-0 ${className || ''}`}
      style={{ width: width || 320 }}
    >
      {/* Electron drag region */}
      <div className="electron-drag h-8 shrink-0" />
      {/* Header */}
      <header className="shrink-0 px-4 pb-3 border-b border-gray-100">
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

      {/* Notification Permission Banner */}
      <NotificationBanner />

      {/* Conversation List - with bottom padding for pinned settings */}
      <div className="flex-1 overflow-hidden relative">
        <ConversationList
          searchQuery={debouncedQuery}
          bottomPadding={64}
          requestCount={requestCount}
          newRequestCount={newRequestCount}
          onRequestsClick={() => setShowRequests(true)}
        />

        {/* Pinned Settings Footer */}
        <div className="absolute bottom-0 left-0 right-0 h-14 bg-gradient-to-t from-white via-white to-transparent pointer-events-none" />
        <div className="absolute bottom-0 left-0 right-0 px-4 py-3 pointer-events-auto flex justify-end">
          <GlobalSettingsDropdown />
        </div>
      </div>

      {/* Update Banner (Electron only) */}
      <UpdateBanner />
    </aside>
  );
}
