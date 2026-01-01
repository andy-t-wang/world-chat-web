/**
 * Session utilities for auth state caching
 */

/**
 * Check if user was previously connected (wagmi persists this in localStorage)
 */
export function wasConnected(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const state = localStorage.getItem('wagmi-state');
    if (!state) return false;
    const parsed = JSON.parse(state);
    // Check if there's a recent connection
    return parsed?.state?.connections?.length > 0;
  } catch {
    return false;
  }
}
