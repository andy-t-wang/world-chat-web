'use client';

import { store, selectedConversationIdAtom } from '@/stores';

/**
 * Browser notification service for new messages
 * Shows notifications when the tab is not visible
 */

let permissionRequested = false;

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
    // At this point, permission is 'default' (not yet decided)
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
    tag: `message-${conversationId}`, // Replace previous notification from same conversation
    silent: false,
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
 * Update the page title with unread count
 */
let originalTitle: string | null = null;

export function updateTitleWithUnreadCount(unreadCount: number): void {
  if (typeof document === 'undefined') return;

  // Store original title on first call
  if (originalTitle === null) {
    originalTitle = document.title;
  }

  if (unreadCount > 0) {
    const displayCount = unreadCount > 99 ? '99+' : unreadCount;
    const messageText = unreadCount === 1 ? 'New Message' : 'New Messages';
    document.title = `(${displayCount}) ${messageText}`;
  } else {
    document.title = originalTitle;
  }
}

/**
 * Title flashing state for attention-grabbing notifications
 */
let flashInterval: ReturnType<typeof setInterval> | null = null;
let isFlashState = false;
let currentUnreadCount = 0;

/**
 * Start flashing the tab title to get attention
 * Alternates between an attention-grabbing message and the unread count
 */
export function startTitleFlash(unreadCount: number): void {
  if (typeof document === 'undefined') return;

  // Don't flash if tab is visible
  if (isTabVisible()) {
    stopTitleFlash();
    return;
  }

  currentUnreadCount = unreadCount;

  // Already flashing - just update the count
  if (flashInterval) {
    return;
  }

  // Store original title if not already stored
  if (originalTitle === null) {
    originalTitle = document.title;
  }

  const displayCount = unreadCount > 99 ? '99+' : unreadCount;

  // Start flashing immediately with attention state
  isFlashState = true;
  document.title = '💬 New Message!';

  flashInterval = setInterval(() => {
    isFlashState = !isFlashState;
    if (isFlashState) {
      document.title = '💬 New Message!';
    } else {
      document.title = `(${displayCount}) World Chat`;
    }
  }, 1000);
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
  currentUnreadCount = 0;

  // Restore original title
  if (typeof document !== 'undefined' && originalTitle !== null) {
    document.title = originalTitle;
  }
}

/**
 * Check if title is currently flashing
 */
export function isTitleFlashing(): boolean {
  return flashInterval !== null;
}

// Set up visibility change listener to stop flashing when tab becomes visible
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      stopTitleFlash();
    }
  });
}
