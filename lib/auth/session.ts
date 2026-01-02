/**
 * Session utilities for auth state caching
 */

const XMTP_SESSION_KEY = 'xmtp-session-cache';
const WORLD_CHAT_CONNECTED_KEY = 'world-chat-connected';

/**
 * Check if there's an active QR login session
 */
export function hasQRSession(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    // Check QR login session flag
    const qrConnected = localStorage.getItem(WORLD_CHAT_CONNECTED_KEY);
    if (qrConnected === 'true') {
      return true;
    }

    // Check XMTP session cache
    const xmtpSession = localStorage.getItem(XMTP_SESSION_KEY);
    if (xmtpSession) {
      const parsed = JSON.parse(xmtpSession);
      // Check if session is not too old (7 days)
      const maxAge = 7 * 24 * 60 * 60 * 1000;
      if (parsed.timestamp && Date.now() - parsed.timestamp < maxAge) {
        return true;
      }
    }

    return false;
  } catch {
    return false;
  }
}

/**
 * Alias for hasQRSession for backwards compatibility
 */
export function wasConnected(): boolean {
  return hasQRSession();
}

/**
 * Clear all session data (logout)
 */
export function clearSession(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(WORLD_CHAT_CONNECTED_KEY);
    localStorage.removeItem(XMTP_SESSION_KEY);
  } catch {
    // Ignore errors
  }
}
