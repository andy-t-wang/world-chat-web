/**
 * World App Username Service
 * Fetches and caches username records from the World App Username API
 */

import { USERNAME_API } from '@/config/constants';
import { LRUCache } from '@/lib/utils/lru';
import type { Address, UsernameRecord, QueryMultiplePayload } from '@/types/username';

interface CacheEntry {
  record: UsernameRecord | null;
  timestamp: number;
}

/** Singleton cache for username records */
const usernameCache = new LRUCache<string, CacheEntry>(USERNAME_API.MAX_CACHE_SIZE);

/** Pending requests to deduplicate concurrent fetches */
const pendingRequests = new Map<string, Promise<UsernameRecord | null>>();

/**
 * Normalize address to lowercase for cache key consistency
 */
function normalizeAddress(address: string): string {
  return address.toLowerCase();
}

/**
 * Check if a cache entry is still valid
 */
function isCacheValid(entry: CacheEntry): boolean {
  return Date.now() - entry.timestamp < USERNAME_API.CACHE_TTL_MS;
}

/**
 * Resolve a single address to a username record
 */
export async function resolveAddress(address: string): Promise<UsernameRecord | null> {
  const normalizedAddress = normalizeAddress(address);

  // Check cache first
  const cached = usernameCache.get(normalizedAddress);
  if (cached && isCacheValid(cached)) {
    return cached.record;
  }

  // Deduplicate concurrent requests for the same address
  const pending = pendingRequests.get(normalizedAddress);
  if (pending) {
    return pending;
  }

  const fetchPromise = (async () => {
    try {
      const response = await fetch(`${USERNAME_API.BASE_URL}/api/v1/${address}`);

      if (response.status === 404) {
        // Cache null result for addresses without usernames
        usernameCache.set(normalizedAddress, { record: null, timestamp: Date.now() });
        return null;
      }

      if (response.status === 301) {
        // Handle redirect for renamed usernames
        const newUrl = response.headers.get('Location');
        if (newUrl) {
          const redirectResponse = await fetch(newUrl);
          if (redirectResponse.ok) {
            const record = await redirectResponse.json() as UsernameRecord;
            usernameCache.set(normalizedAddress, { record, timestamp: Date.now() });
            return record;
          }
        }
        return null;
      }

      if (!response.ok) {
        throw new Error(`Username API error: ${response.status}`);
      }

      const record = await response.json() as UsernameRecord;
      usernameCache.set(normalizedAddress, { record, timestamp: Date.now() });
      return record;
    } catch (error) {
      console.error(`Failed to resolve address ${address}:`, error);
      return null;
    } finally {
      pendingRequests.delete(normalizedAddress);
    }
  })();

  pendingRequests.set(normalizedAddress, fetchPromise);
  return fetchPromise;
}

/**
 * Resolve multiple addresses in a single batch request
 * More efficient for conversation lists
 */
export async function resolveAddresses(addresses: string[]): Promise<Map<string, UsernameRecord | null>> {
  const results = new Map<string, UsernameRecord | null>();
  const uncachedAddresses: Address[] = [];

  // Check cache for each address
  for (const address of addresses) {
    const normalizedAddress = normalizeAddress(address);
    const cached = usernameCache.get(normalizedAddress);

    if (cached && isCacheValid(cached)) {
      results.set(normalizedAddress, cached.record);
    } else {
      uncachedAddresses.push(address as Address);
    }
  }

  // If all addresses were cached, return immediately
  if (uncachedAddresses.length === 0) {
    return results;
  }

  // Batch fetch uncached addresses
  try {
    const payload: QueryMultiplePayload = {
      addresses: uncachedAddresses.slice(0, USERNAME_API.MAX_BATCH_SIZE),
    };

    const response = await fetch(`${USERNAME_API.BASE_URL}/api/v1/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`Username batch query failed: ${response.status}`);
    }

    const records = await response.json() as UsernameRecord[];

    // Create a map of address -> record for quick lookup
    const recordMap = new Map<string, UsernameRecord>();
    for (const record of records) {
      recordMap.set(normalizeAddress(record.address), record);
    }

    // Update cache and results for all queried addresses
    for (const address of uncachedAddresses) {
      const normalizedAddress = normalizeAddress(address);
      const record = recordMap.get(normalizedAddress) ?? null;

      usernameCache.set(normalizedAddress, { record, timestamp: Date.now() });
      results.set(normalizedAddress, record);
    }
  } catch (error) {
    console.error('Failed to batch resolve addresses:', error);

    // Mark all uncached addresses as null in results
    for (const address of uncachedAddresses) {
      results.set(normalizeAddress(address), null);
    }
  }

  return results;
}

/**
 * Search for usernames by prefix
 */
export async function searchUsernames(query: string): Promise<UsernameRecord[]> {
  if (!query || query.length < 1 || query.length > 14) {
    return [];
  }

  try {
    const response = await fetch(
      `${USERNAME_API.BASE_URL}/api/v1/search/${encodeURIComponent(query)}`
    );

    if (!response.ok) {
      return [];
    }

    const records = await response.json() as UsernameRecord[];

    // Cache each result
    for (const record of records) {
      usernameCache.set(normalizeAddress(record.address), {
        record,
        timestamp: Date.now(),
      });
    }

    return records;
  } catch (error) {
    console.error('Failed to search usernames:', error);
    return [];
  }
}

/**
 * Get the avatar URL for a username, with optional fallback
 */
export function getAvatarUrl(username: string, options?: { minimized?: boolean; fallback?: string }): string {
  const params = new URLSearchParams();
  if (options?.minimized) params.set('minimized', 'true');
  if (options?.fallback) params.set('fallback', options.fallback);

  const queryString = params.toString();
  return `${USERNAME_API.BASE_URL}/api/v1/avatar/${encodeURIComponent(username)}${queryString ? `?${queryString}` : ''}`;
}

/**
 * Clear the username cache (useful for testing or logout)
 */
export function clearUsernameCache(): void {
  usernameCache.clear();
  pendingRequests.clear();
}

/**
 * Get a cached username record without fetching
 */
export function getCachedUsername(address: string): UsernameRecord | null | undefined {
  const cached = usernameCache.get(normalizeAddress(address));
  if (cached && isCacheValid(cached)) {
    return cached.record;
  }
  return undefined;
}
