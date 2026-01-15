'use client';

import { useState, useEffect, useRef } from 'react';
import { useAtom, useSetAtom } from 'jotai';
import { Search, SquarePen, X, Settings, Link2, Link2Off, Volume2, VolumeX, MessageSquare, MessageSquareOff, LogOut, RefreshCw, Sun, Moon, Monitor, Share2, Check } from 'lucide-react';
import { clearSession } from '@/lib/auth/session';
import { clearSessionCache } from '@/lib/storage';
import { streamManager } from '@/lib/xmtp/StreamManager';
import { ConversationList } from './ConversationList';
import { MessageRequestsView } from './MessageRequestsView';
import { NotificationBanner } from './NotificationBanner';
import { UpdateBanner } from './UpdateBanner';
import { linkPreviewEnabledAtom, soundMutedAtom, hideEmptyConversationsAtom, themePreferenceAtom, type ThemePreference } from '@/stores/settings';
import { showMessageRequestsAtom } from '@/stores/ui';
import { useMessageRequests } from '@/hooks/useConversations';

// Global settings dropdown component
function GlobalSettingsDropdown() {
  const [isOpen, setIsOpen] = useState(false);
  const [linkPreviewEnabled, setLinkPreviewEnabled] = useAtom(linkPreviewEnabledAtom);
  const [soundMuted, setSoundMuted] = useAtom(soundMutedAtom);
  const [hideEmptyConversations, setHideEmptyConversations] = useAtom(hideEmptyConversationsAtom);
  const [themePreference, setThemePreference] = useAtom(themePreferenceAtom);
  const [version, setVersion] = useState<string | null>(null);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [isCheckingUpdates, setIsCheckingUpdates] = useState(false);
  const [isElectron, setIsElectron] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Download link - use NEXT_PUBLIC_URL or fallback
  const BASE_URL = process.env.NEXT_PUBLIC_URL || 'https://world-chat-web.vercel.app';
  const DOWNLOAD_URL = `${BASE_URL}/download`;

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
      // Hard redirect to login (works better in Electron)
      window.location.href = '/';
    } catch (error) {
      console.error('Logout failed:', error);
      setIsLoggingOut(false);
    }
  };

  // Fetch version and detect Electron
  useEffect(() => {
    const electronAPI = (window as { electronAPI?: { isElectron?: boolean; getVersion?: () => Promise<string> } }).electronAPI;
    if (electronAPI?.isElectron) {
      setIsElectron(true);
    }
    if (electronAPI?.getVersion) {
      electronAPI.getVersion().then(setVersion).catch(() => {});
    }
  }, []);

  const handleCheckForUpdates = async () => {
    if (isCheckingUpdates) return;
    setIsCheckingUpdates(true);

    try {
      const electronAPI = (window as { electronAPI?: { checkForUpdates?: () => Promise<void> } }).electronAPI;
      if (electronAPI?.checkForUpdates) {
        // Electron: trigger auto-updater check
        await electronAPI.checkForUpdates();
        // Give feedback that check was initiated
        setTimeout(() => setIsCheckingUpdates(false), 2000);
      } else {
        // Web: hard refresh to get latest version
        window.location.reload();
      }
    } catch (error) {
      console.error('Check for updates failed:', error);
      setIsCheckingUpdates(false);
    }
  };

  const handleCopyDownloadLink = async () => {
    try {
      await navigator.clipboard.writeText(DOWNLOAD_URL);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy link:', error);
    }
  };

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
        className="w-9 h-9 flex items-center justify-center rounded-lg hover:bg-[var(--bg-hover)] transition-colors"
        title="Settings"
      >
        <Settings className="w-5 h-5 text-[var(--text-primary)]" />
      </button>

      {isOpen && (
        <div className="absolute right-0 bottom-full mb-1 w-64 bg-[var(--bg-primary)] rounded-xl shadow-lg border border-[var(--border-default)] py-2 z-50">
          {/* Appearance */}
          <div className="px-3 py-1.5 text-xs font-medium text-[var(--text-tertiary)] uppercase tracking-wider">
            Appearance
          </div>
          <div className="px-3 py-2">
            <div className="flex items-center gap-1 p-1 bg-[var(--bg-tertiary)] rounded-lg">
              <button
                onClick={() => setThemePreference('light')}
                className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-md text-[13px] font-medium transition-all ${
                  themePreference === 'light'
                    ? 'bg-[var(--bg-primary)] text-[var(--text-primary)] shadow-sm'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
              >
                <Sun className="w-3.5 h-3.5" />
                Light
              </button>
              <button
                onClick={() => setThemePreference('system')}
                className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-md text-[13px] font-medium transition-all ${
                  themePreference === 'system'
                    ? 'bg-[var(--bg-primary)] text-[var(--text-primary)] shadow-sm'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
              >
                <Monitor className="w-3.5 h-3.5" />
                System
              </button>
              <button
                onClick={() => setThemePreference('dark')}
                className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-md text-[13px] font-medium transition-all ${
                  themePreference === 'dark'
                    ? 'bg-[var(--bg-primary)] text-[var(--text-primary)] shadow-sm'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
              >
                <Moon className="w-3.5 h-3.5" />
                Dark
              </button>
            </div>
          </div>

          <div className="px-3 py-1.5 text-xs font-medium text-[var(--text-tertiary)] uppercase tracking-wider border-t border-[var(--border-subtle)] mt-1 pt-2">
            Privacy
          </div>
          <button
            onClick={() => setLinkPreviewEnabled(!linkPreviewEnabled)}
            className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-[var(--bg-hover)] transition-colors"
          >
            {linkPreviewEnabled ? (
              <Link2 className="w-5 h-5 text-[var(--accent-green)]" />
            ) : (
              <Link2Off className="w-5 h-5 text-[var(--text-tertiary)]" />
            )}
            <div className="flex-1 text-left">
              <p className="text-[14px] text-[var(--text-primary)]">Rich Previews</p>
              <p className="text-[12px] text-[var(--text-secondary)]">
                {linkPreviewEnabled ? 'Show link & ticker previews' : 'No link or ticker previews'}
              </p>
            </div>
            <div
              className={`w-10 h-6 rounded-full p-0.5 transition-colors ${
                linkPreviewEnabled ? 'bg-[var(--toggle-bg-on)]' : 'bg-[var(--toggle-bg-off)]'
              }`}
            >
              <div
                className={`w-5 h-5 rounded-full bg-[var(--bg-primary)] shadow transition-transform ${
                  linkPreviewEnabled ? 'translate-x-4' : 'translate-x-0'
                }`}
              />
            </div>
          </button>
          <button
            onClick={() => setSoundMuted(!soundMuted)}
            className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-[var(--bg-hover)] transition-colors"
          >
            {soundMuted ? (
              <VolumeX className="w-5 h-5 text-[var(--text-tertiary)]" />
            ) : (
              <Volume2 className="w-5 h-5 text-[var(--accent-green)]" />
            )}
            <div className="flex-1 text-left">
              <p className="text-[14px] text-[var(--text-primary)]">Notification Sounds</p>
              <p className="text-[12px] text-[var(--text-secondary)]">
                {soundMuted ? 'Sounds are muted' : 'Play sound on new messages'}
              </p>
            </div>
            <div
              className={`w-10 h-6 rounded-full p-0.5 transition-colors ${
                !soundMuted ? 'bg-[var(--toggle-bg-on)]' : 'bg-[var(--toggle-bg-off)]'
              }`}
            >
              <div
                className={`w-5 h-5 rounded-full bg-[var(--bg-primary)] shadow transition-transform ${
                  !soundMuted ? 'translate-x-4' : 'translate-x-0'
                }`}
              />
            </div>
          </button>
          <div className="px-3 py-1.5 text-xs font-medium text-[var(--text-tertiary)] uppercase tracking-wider border-t border-[var(--border-subtle)] mt-1 pt-2">
            Display
          </div>
          <button
            onClick={() => setHideEmptyConversations(!hideEmptyConversations)}
            className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-[var(--bg-hover)] transition-colors"
          >
            {hideEmptyConversations ? (
              <MessageSquareOff className="w-5 h-5 text-[var(--accent-green)]" />
            ) : (
              <MessageSquare className="w-5 h-5 text-[var(--text-tertiary)]" />
            )}
            <div className="flex-1 text-left">
              <p className="text-[14px] text-[var(--text-primary)]">Hide Empty Chats</p>
              <p className="text-[12px] text-[var(--text-secondary)]">
                {hideEmptyConversations ? 'Chats with no messages hidden' : 'Showing all chats'}
              </p>
            </div>
            <div
              className={`w-10 h-6 rounded-full p-0.5 transition-colors ${
                hideEmptyConversations ? 'bg-[var(--toggle-bg-on)]' : 'bg-[var(--toggle-bg-off)]'
              }`}
            >
              <div
                className={`w-5 h-5 rounded-full bg-[var(--bg-primary)] shadow transition-transform ${
                  hideEmptyConversations ? 'translate-x-4' : 'translate-x-0'
                }`}
              />
            </div>
          </button>

          {/* Updates */}
          <div className="px-3 py-1.5 text-xs font-medium text-[var(--text-tertiary)] uppercase tracking-wider border-t border-[var(--border-subtle)] mt-1 pt-2">
            Updates
          </div>
          <button
            onClick={handleCheckForUpdates}
            disabled={isCheckingUpdates}
            className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-[var(--bg-hover)] transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-5 h-5 text-[var(--accent-blue)] ${isCheckingUpdates ? 'animate-spin' : ''}`} />
            <div className="flex-1 text-left">
              <p className="text-[14px] text-[var(--text-primary)]">
                {isCheckingUpdates ? 'Checking...' : 'Check for Updates'}
              </p>
              <p className="text-[12px] text-[var(--text-secondary)]">
                {isElectron ? 'Download and install updates' : 'Refresh to get latest version'}
              </p>
            </div>
          </button>
          <button
            onClick={handleCopyDownloadLink}
            className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-[var(--bg-hover)] transition-colors"
          >
            {linkCopied ? (
              <Check className="w-5 h-5 text-[var(--accent-green)]" />
            ) : (
              <Share2 className="w-5 h-5 text-[var(--text-tertiary)]" />
            )}
            <div className="flex-1 text-left">
              <p className="text-[14px] text-[var(--text-primary)]">
                {linkCopied ? 'Link Copied!' : 'Share Download Link'}
              </p>
              <p className="text-[12px] text-[var(--text-secondary)]">
                Copy the macOS app download link
              </p>
            </div>
          </button>

          {/* Version */}
          {version && (
            <div className="px-3 py-2 border-t border-[var(--border-subtle)] mt-1">
              <p className="text-[11px] text-[var(--text-tertiary)] text-center">
                World Chat v{version}
              </p>
            </div>
          )}

          {/* Logout */}
          <div className="border-t border-[var(--border-subtle)] mt-1 pt-1">
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
        className={`h-full bg-[var(--bg-primary)] border-r border-[var(--border-default)] flex flex-col shrink-0 ${className || ''}`}
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
      className={`h-full bg-[var(--bg-primary)] border-r border-[var(--border-default)] flex flex-col shrink-0 ${className || ''}`}
      style={{ width: width || 320 }}
    >
      {/* Electron drag region */}
      <div className="electron-drag h-8 shrink-0" />
      {/* Header */}
      <header className="shrink-0 px-4 pb-3 border-b border-[var(--border-subtle)]">
        <div className="flex items-center justify-between mb-3">
          <h1 className="text-xl font-semibold text-[var(--text-primary)]">Chats</h1>
          <button
            onClick={onNewChat}
            className="w-9 h-9 flex items-center justify-center rounded-lg hover:bg-[var(--bg-hover)] transition-colors"
            aria-label="New chat"
          >
            <SquarePen className="w-5 h-5 text-[var(--text-primary)]" />
          </button>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-tertiary)]" />
          <input
            type="text"
            placeholder="Search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="
              w-full h-10 pl-9 pr-9
              bg-[var(--bg-tertiary)] rounded-lg
              text-sm text-[var(--text-primary)] placeholder-[var(--text-tertiary)]
              outline-none focus:ring-2 focus:ring-[var(--accent-blue)]/20
              transition-shadow
            "
          />
          {searchQuery && (
            <button
              onClick={clearSearch}
              className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"
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

        {/* Floating Update Button (Electron only) */}
        <UpdateBanner />

        {/* Pinned Settings Footer */}
        <div className="absolute bottom-0 left-0 right-0 h-14 bg-gradient-to-t from-[var(--bg-primary)] via-[var(--bg-primary)] to-transparent pointer-events-none" />
        <div className="absolute bottom-0 left-0 right-0 px-4 py-3 pointer-events-auto flex justify-end">
          <GlobalSettingsDropdown />
        </div>
      </div>
    </aside>
  );
}
