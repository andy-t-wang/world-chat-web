'use client';

import { store, selectedConversationIdAtom } from '@/stores';

/**
 * Browser notification service for new messages
 * Shows notifications when the tab is not visible
 */

let permissionRequested = false;
let audioContext: AudioContext | null = null;

// Title state
let baseTitle = 'World Chat';
let currentChatName: string | null = null;
let flashInterval: ReturnType<typeof setInterval> | null = null;
let isFlashState = false;
let pendingNotification: { senderName: string; isCurrentChat: boolean } | null = null;

/**
 * Get or create AudioContext for notification sounds
 */
function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;

  if (!audioContext) {
    audioContext = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
  }
  return audioContext;
}

/**
 * Play notification sound using Web Audio API
 * Creates a pleasant two-tone chime
 */
export function playNotificationSound(): void {
  const ctx = getAudioContext();
  if (!ctx) return;

  // Resume context if suspended (required for autoplay policies)
  if (ctx.state === 'suspended') {
    ctx.resume().catch(() => {});
  }

  const now = ctx.currentTime;

  // Create a pleasant two-tone notification sound
  const frequencies = [830, 1046]; // G5 and C6 - pleasant chime
  const duration = 0.15;
  const gap = 0.08;

  frequencies.forEach((freq, i) => {
    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);

    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(freq, now);

    // Envelope for smooth sound
    const startTime = now + i * (duration + gap);
    gainNode.gain.setValueAtTime(0, startTime);
    gainNode.gain.linearRampToValueAtTime(0.3, startTime + 0.02);
    gainNode.gain.exponentialRampToValueAtTime(0.01, startTime + duration);

    oscillator.start(startTime);
    oscillator.stop(startTime + duration);
  });
}

/**
 * Check if the browser tab is currently visible
 */
export function isTabVisible(): boolean {
  if (typeof document === 'undefined') return true;
  return document.visibilityState === 'visible';
}

/**
 * Request notification permission from the user
 * Only requests once per session
 */
export async function requestNotificationPermission(): Promise<boolean> {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return false;
  }

  if (Notification.permission === 'granted') {
    return true;
  }

  if (Notification.permission === 'denied') {
    return false;
  }

  // Only request once per session
  if (permissionRequested) {
    return false;
  }

  permissionRequested = true;
  const result = await Notification.requestPermission();
  return result === 'granted';
}

/**
 * Show a browser notification for a new message
 */
export function showMessageNotification(options: {
  conversationId: string;
  senderName: string;
  messagePreview: string;
  avatarUrl?: string;
}): void {
  const { conversationId, senderName, messagePreview, avatarUrl } = options;

  // Don't show if tab is visible
  if (isTabVisible()) {
    return;
  }

  // Don't show if notifications not supported or not permitted
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return;
  }

  if (Notification.permission !== 'granted') {
    return;
  }

  // Truncate long messages
  const truncatedPreview = messagePreview.length > 100
    ? messagePreview.slice(0, 100) + '...'
    : messagePreview;

  const notification = new Notification(senderName, {
    body: truncatedPreview,
    icon: avatarUrl || '/icon-192.png',
    tag: `message-${conversationId}`,
    silent: true, // We play our own sound
  });

  // Handle click - focus tab and select conversation
  notification.onclick = () => {
    window.focus();
    store.set(selectedConversationIdAtom, conversationId);
    notification.close();
  };

  // Auto-close after 5 seconds
  setTimeout(() => {
    notification.close();
  }, 5000);
}

/**
 * Set the current chat name for tab title
 * Call this when selecting a conversation
 */
export function setCurrentChatName(chatName: string | null): void {
  currentChatName = chatName;
  updateTabTitleDisplay();
}

/**
 * Update the tab title display based on current state
 */
function updateTabTitleDisplay(): void {
  if (typeof document === 'undefined') return;

  if (pendingNotification) {
    // We have a pending notification - show notification state
    if (pendingNotification.isCurrentChat && currentChatName) {
      // On current chat: "<Chat Name> · messaged you"
      document.title = `${currentChatName} · messaged you`;
    } else if (isFlashState) {
      // Flashing state: show sender notification
      document.title = `${pendingNotification.senderName} messaged you`;
    } else if (currentChatName) {
      // Non-flash state: show chat name
      document.title = currentChatName;
    } else {
      document.title = baseTitle;
    }
  } else if (currentChatName) {
    // Normal state with chat selected: "<Chat Name> | World Chat"
    document.title = `${currentChatName} | World Chat`;
  } else {
    // No chat selected
    document.title = baseTitle;
  }
}

/**
 * Update the page title with unread count (legacy, now just updates display)
 */
export function updateTitleWithUnreadCount(unreadCount: number): void {
  if (unreadCount === 0) {
    // Clear notification state
    pendingNotification = null;
    stopTitleFlash();
  }
  updateTabTitleDisplay();
}

/**
 * Start tab title notification for new message
 * @param senderName - Name of the person who sent the message
 * @param isCurrentChat - Whether the message is in the currently selected chat
 */
export function startTitleFlash(senderName: string, isCurrentChat: boolean = false): void {
  if (typeof document === 'undefined') return;

  // Don't change if tab is visible
  if (isTabVisible()) {
    stopTitleFlash();
    return;
  }

  pendingNotification = { senderName, isCurrentChat };

  // Play notification sound
  playNotificationSound();

  if (isCurrentChat) {
    // On current chat - just show static "<Chat Name> · messaged you"
    updateTabTitleDisplay();
  } else {
    // Different chat - flash between chat name and "{sender} messaged you"
    if (flashInterval) {
      // Already flashing, just update the sender
      return;
    }

    isFlashState = false;
    updateTabTitleDisplay();

    flashInterval = setInterval(() => {
      isFlashState = !isFlashState;
      updateTabTitleDisplay();
    }, 1500);
  }
}

/**
 * Stop flashing and restore normal title
 */
export function stopTitleFlash(): void {
  if (flashInterval) {
    clearInterval(flashInterval);
    flashInterval = null;
  }
  isFlashState = false;
  pendingNotification = null;
  updateTabTitleDisplay();
}

/**
 * Check if title is currently showing notification
 */
export function isTitleFlashing(): boolean {
  return pendingNotification !== null;
}

// Set up visibility change listener to restore title when tab becomes visible
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      stopTitleFlash();
    }
  });
}
