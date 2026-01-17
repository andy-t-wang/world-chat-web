"use client";

import { useState, useEffect } from "react";
import { useAtom } from "jotai";
import {
  ArrowLeft,
  Sun,
  Moon,
  Monitor,
  Link2,
  Link2Off,
  Volume2,
  VolumeX,
  UserPlus,
  UserX,
  MessageSquare,
  MessageSquareOff,
  RefreshCw,
  Share2,
  Check,
  LogOut,
  Settings,
  Globe,
  Loader2,
} from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import {
  linkPreviewEnabledAtom,
  soundMutedAtom,
  hideEmptyConversationsAtom,
  themePreferenceAtom,
  messageRequestNotificationsAtom,
  settingsPanelOpenAtom,
} from "@/stores/settings";
import { streamManager } from "@/lib/xmtp/StreamManager";
import { clearSession } from "@/lib/auth/session";
import { clearSessionCache } from "@/lib/storage";

interface SettingsPanelProps {
  onClose: () => void;
}

// Toggle switch component for consistent styling
function Toggle({ enabled }: { enabled: boolean }) {
  return (
    <div
      role="switch"
      aria-checked={enabled}
      className={`w-11 h-6 rounded-full p-0.5 transition-colors ${
        enabled ? "bg-[var(--toggle-bg-on)]" : "bg-[var(--toggle-bg-off)]"
      }`}
    >
      <div
        className={`w-5 h-5 rounded-full bg-[var(--bg-primary)] shadow transition-transform ${
          enabled ? "translate-x-5" : "translate-x-0"
        }`}
      />
    </div>
  );
}

export function SettingsPanel({ onClose }: SettingsPanelProps) {
  const [linkPreviewEnabled, setLinkPreviewEnabled] = useAtom(linkPreviewEnabledAtom);
  const [soundMuted, setSoundMuted] = useAtom(soundMutedAtom);
  const [hideEmptyConversations, setHideEmptyConversations] = useAtom(hideEmptyConversationsAtom);
  const [themePreference, setThemePreference] = useAtom(themePreferenceAtom);
  const [messageRequestNotifications, setMessageRequestNotifications] = useAtom(messageRequestNotificationsAtom);

  const [version, setVersion] = useState<string | null>(null);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [isCheckingUpdates, setIsCheckingUpdates] = useState(false);
  const [isElectronEnv, setIsElectronEnv] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const [translationAvailable, setTranslationAvailable] = useState(false);

  // Translation hook
  const { isAvailable, initialize, isInitializing, isInitialized, progress: translationProgress, error: translationError } = useTranslation();

  // Download link
  const BASE_URL = process.env.NEXT_PUBLIC_URL || "https://world-chat-web.vercel.app";
  const DOWNLOAD_URL = `${BASE_URL}/download`;

  // Fetch version and detect Electron
  useEffect(() => {
    const electronAPI = (window as { electronAPI?: { isElectron?: boolean; getVersion?: () => Promise<string> } }).electronAPI;
    if (electronAPI?.isElectron) {
      setIsElectronEnv(true);
    }
    if (electronAPI?.getVersion) {
      electronAPI.getVersion().then(setVersion).catch(() => {});
    }
    // Check translation availability
    isAvailable().then(setTranslationAvailable);
  }, [isAvailable]);

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const handleLogout = async () => {
    if (isLoggingOut) return;
    setIsLoggingOut(true);
    try {
      streamManager.cleanup();
      clearSession();
      await clearSessionCache();
      window.location.href = "/";
    } catch (error) {
      console.error("Logout failed:", error);
      setIsLoggingOut(false);
    }
  };

  const handleCheckForUpdates = async () => {
    if (isCheckingUpdates) return;
    setIsCheckingUpdates(true);
    try {
      const electronAPI = (window as { electronAPI?: { checkForUpdates?: () => Promise<void> } }).electronAPI;
      if (electronAPI?.checkForUpdates) {
        await electronAPI.checkForUpdates();
        setTimeout(() => setIsCheckingUpdates(false), 2000);
      } else {
        window.location.reload();
      }
    } catch (error) {
      console.error("Check for updates failed:", error);
      setIsCheckingUpdates(false);
    }
  };

  const handleCopyDownloadLink = async () => {
    try {
      await navigator.clipboard.writeText(DOWNLOAD_URL);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    } catch (error) {
      console.error("Failed to copy link:", error);
    }
  };

  return (
    <div className="flex-1 min-h-0 flex flex-col bg-[var(--bg-primary)]">
      {/* Header */}
      <div className="shrink-0 flex items-center gap-3 px-4 py-3 border-b border-[var(--border-default)]">
        <button
          onClick={onClose}
          className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-[var(--bg-hover)] transition-colors"
        >
          <ArrowLeft className="w-5 h-5 text-[var(--text-secondary)]" />
        </button>
        <h2 className="text-[16px] font-semibold text-[var(--text-primary)]">Settings</h2>
      </div>

      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto">
        {/* Appearance Section */}
        <div className="px-4 py-3">
          <h3 className="text-[12px] font-medium text-[var(--text-tertiary)] uppercase tracking-wider mb-3">
            Appearance
          </h3>
          <div className="flex items-center gap-1 p-1 bg-[var(--bg-tertiary)] rounded-lg">
            <button
              onClick={() => setThemePreference("light")}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-md text-[13px] font-medium transition-all ${
                themePreference === "light"
                  ? "bg-[var(--bg-primary)] text-[var(--text-primary)] shadow-sm"
                  : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              }`}
            >
              <Sun className="w-4 h-4" />
              Light
            </button>
            <button
              onClick={() => setThemePreference("system")}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-md text-[13px] font-medium transition-all ${
                themePreference === "system"
                  ? "bg-[var(--bg-primary)] text-[var(--text-primary)] shadow-sm"
                  : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              }`}
            >
              <Monitor className="w-4 h-4" />
              System
            </button>
            <button
              onClick={() => setThemePreference("dark")}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-md text-[13px] font-medium transition-all ${
                themePreference === "dark"
                  ? "bg-[var(--bg-primary)] text-[var(--text-primary)] shadow-sm"
                  : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              }`}
            >
              <Moon className="w-4 h-4" />
              Dark
            </button>
          </div>
        </div>

        {/* Privacy Section */}
        <div className="px-4 py-3 border-t border-[var(--border-subtle)]">
          <h3 className="text-[12px] font-medium text-[var(--text-tertiary)] uppercase tracking-wider mb-2">
            Privacy
          </h3>

          {/* Rich Previews */}
          <button
            onClick={() => setLinkPreviewEnabled(!linkPreviewEnabled)}
            className="w-full flex items-center gap-3 py-3 hover:bg-[var(--bg-hover)] rounded-lg transition-colors -mx-2 px-2"
          >
            {linkPreviewEnabled ? (
              <Link2 className="w-5 h-5 text-[var(--accent-green)]" />
            ) : (
              <Link2Off className="w-5 h-5 text-[var(--text-tertiary)]" />
            )}
            <div className="flex-1 text-left">
              <p className="text-[14px] text-[var(--text-primary)]">Rich Previews</p>
              <p className="text-[12px] text-[var(--text-secondary)]">
                {linkPreviewEnabled ? "Show link & ticker previews" : "No link or ticker previews"}
              </p>
            </div>
            <Toggle enabled={linkPreviewEnabled} />
          </button>

          {/* Notification Sounds */}
          <button
            onClick={() => setSoundMuted(!soundMuted)}
            className="w-full flex items-center gap-3 py-3 hover:bg-[var(--bg-hover)] rounded-lg transition-colors -mx-2 px-2"
          >
            {soundMuted ? (
              <VolumeX className="w-5 h-5 text-[var(--text-tertiary)]" />
            ) : (
              <Volume2 className="w-5 h-5 text-[var(--accent-green)]" />
            )}
            <div className="flex-1 text-left">
              <p className="text-[14px] text-[var(--text-primary)]">Notification Sounds</p>
              <p className="text-[12px] text-[var(--text-secondary)]">
                {soundMuted ? "Sounds are muted" : "Play sound on new messages"}
              </p>
            </div>
            <Toggle enabled={!soundMuted} />
          </button>

          {/* Request Notifications */}
          <button
            onClick={() => setMessageRequestNotifications(!messageRequestNotifications)}
            className="w-full flex items-center gap-3 py-3 hover:bg-[var(--bg-hover)] rounded-lg transition-colors -mx-2 px-2"
          >
            {messageRequestNotifications ? (
              <UserPlus className="w-5 h-5 text-[var(--accent-green)]" />
            ) : (
              <UserX className="w-5 h-5 text-[var(--text-tertiary)]" />
            )}
            <div className="flex-1 text-left">
              <p className="text-[14px] text-[var(--text-primary)]">Request Notifications</p>
              <p className="text-[12px] text-[var(--text-secondary)]">
                {messageRequestNotifications ? "Notify for new message requests" : "No request notifications"}
              </p>
            </div>
            <Toggle enabled={messageRequestNotifications} />
          </button>
        </div>

        {/* Display Section */}
        <div className="px-4 py-3 border-t border-[var(--border-subtle)]">
          <h3 className="text-[12px] font-medium text-[var(--text-tertiary)] uppercase tracking-wider mb-2">
            Display
          </h3>

          <button
            onClick={() => setHideEmptyConversations(!hideEmptyConversations)}
            className="w-full flex items-center gap-3 py-3 hover:bg-[var(--bg-hover)] rounded-lg transition-colors -mx-2 px-2"
          >
            {hideEmptyConversations ? (
              <MessageSquareOff className="w-5 h-5 text-[var(--accent-green)]" />
            ) : (
              <MessageSquare className="w-5 h-5 text-[var(--text-tertiary)]" />
            )}
            <div className="flex-1 text-left">
              <p className="text-[14px] text-[var(--text-primary)]">Hide Empty Chats</p>
              <p className="text-[12px] text-[var(--text-secondary)]">
                {hideEmptyConversations ? "Chats with no messages hidden" : "Showing all chats"}
              </p>
            </div>
            <Toggle enabled={hideEmptyConversations} />
          </button>
        </div>

        {/* Translation Section - Only show in Electron */}
        {translationAvailable && (
          <div className="px-4 py-3 border-t border-[var(--border-subtle)]">
            <h3 className="text-[12px] font-medium text-[var(--text-tertiary)] uppercase tracking-wider mb-2">
              Translation
            </h3>

            <button
              onClick={() => !isInitialized && !isInitializing && initialize("en")}
              disabled={isInitializing}
              className="w-full flex items-center gap-3 py-3 hover:bg-[var(--bg-hover)] rounded-lg transition-colors -mx-2 px-2"
            >
              {isInitializing ? (
                <Loader2 className="w-5 h-5 text-[var(--accent-blue)] animate-spin" />
              ) : (
                <Globe className={`w-5 h-5 ${isInitialized ? "text-[var(--accent-green)]" : "text-[var(--text-tertiary)]"}`} />
              )}
              <div className="flex-1 text-left">
                <p className="text-[14px] text-[var(--text-primary)]">
                  {isInitializing ? "Downloading Models..." : "Local Translation"}
                </p>
                <p className="text-[12px] text-[var(--text-secondary)]">
                  {isInitializing && translationProgress
                    ? translationProgress.message
                    : "Fully private · Messages never leave your device"}
                </p>
                {/* Progress bar */}
                {isInitializing && translationProgress && (
                  <div className="mt-2 w-full bg-[var(--bg-tertiary)] rounded-full h-1.5 overflow-hidden">
                    <div
                      className="h-full bg-[var(--accent-blue)] transition-all duration-300 ease-out"
                      style={{ width: `${(translationProgress.progress / translationProgress.total) * 100}%` }}
                    />
                  </div>
                )}
                {translationError && (
                  <p className="text-[12px] text-[#FF3B30] mt-1">{translationError}</p>
                )}
              </div>
              <Toggle enabled={isInitialized} />
            </button>
          </div>
        )}

        {/* Updates Section */}
        <div className="px-4 py-3 border-t border-[var(--border-subtle)]">
          <h3 className="text-[12px] font-medium text-[var(--text-tertiary)] uppercase tracking-wider mb-2">
            Updates
          </h3>

          <button
            onClick={handleCheckForUpdates}
            disabled={isCheckingUpdates}
            className="w-full flex items-center gap-3 py-3 hover:bg-[var(--bg-hover)] rounded-lg transition-colors -mx-2 px-2 disabled:opacity-50"
          >
            <RefreshCw className={`w-5 h-5 text-[var(--accent-blue)] ${isCheckingUpdates ? "animate-spin" : ""}`} />
            <div className="flex-1 text-left">
              <p className="text-[14px] text-[var(--text-primary)]">
                {isCheckingUpdates ? "Checking..." : "Check for Updates"}
              </p>
              <p className="text-[12px] text-[var(--text-secondary)]">
                {isElectronEnv ? "Download and install updates" : "Refresh to get latest version"}
              </p>
            </div>
          </button>

          <button
            onClick={handleCopyDownloadLink}
            className="w-full flex items-center gap-3 py-3 hover:bg-[var(--bg-hover)] rounded-lg transition-colors -mx-2 px-2"
          >
            {linkCopied ? (
              <Check className="w-5 h-5 text-[var(--accent-green)]" />
            ) : (
              <Share2 className="w-5 h-5 text-[var(--text-tertiary)]" />
            )}
            <div className="flex-1 text-left">
              <p className="text-[14px] text-[var(--text-primary)]">
                {linkCopied ? "Link Copied!" : "Share Download Link"}
              </p>
              <p className="text-[12px] text-[var(--text-secondary)]">
                Copy the macOS app download link
              </p>
            </div>
          </button>
        </div>

        {/* Version */}
        {version && (
          <div className="px-4 py-3 border-t border-[var(--border-subtle)]">
            <p className="text-[12px] text-[var(--text-tertiary)] text-center">
              World Chat v{version}
            </p>
          </div>
        )}
      </div>

      {/* Footer - Logout Button */}
      <div className="shrink-0 px-4 pt-3 pb-6 border-t border-[var(--border-default)]">
        <button
          onClick={handleLogout}
          disabled={isLoggingOut}
          className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-500 transition-colors disabled:opacity-50"
        >
          <LogOut className="w-5 h-5" />
          <span className="text-[14px] font-medium">
            {isLoggingOut ? "Logging out..." : "Log Out"}
          </span>
        </button>
      </div>
    </div>
  );
}
