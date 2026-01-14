'use client';

import { useState, useEffect, useCallback } from 'react';
import type { TickerPriceData } from '@/app/api/ticker-price/route';
import { isSupportedTicker } from '@/config/tickers';

/**
 * In-memory cache for ticker price data
 * Survives component remounts, shared across all instances
 */
interface CacheEntry {
  data: TickerPriceData;
  timestamp: number;
  isStale?: boolean;
}

const tickerCache = new Map<string, CacheEntry>();
const pendingRequests = new Map<string, Promise<TickerPriceData>>();

// Simple event system for cache updates
const cacheListeners = new Map<string, Set<() => void>>();

function subscribeToCacheUpdates(symbol: string, callback: () => void): () => void {
  if (!cacheListeners.has(symbol)) {
    cacheListeners.set(symbol, new Set());
  }
  cacheListeners.get(symbol)!.add(callback);
  return () => {
    cacheListeners.get(symbol)?.delete(callback);
  };
}

function notifyCacheUpdate(symbol: string): void {
  cacheListeners.get(symbol)?.forEach((cb) => cb());
}

// Client-side cache TTL (use cached data for 2 minutes before refetching)
const CACHE_TTL_MS = 2 * 60 * 1000;

// Retry configuration
const MAX_RETRIES = 2;
const DEFAULT_RETRY_DELAY = 5000; // 5 seconds default
const MAX_RETRY_DELAY = 30000; // Cap at 30 seconds (don't wait full 60s)

export interface UseTickerPriceResult {
  data: TickerPriceData | null;
  isLoading: boolean;
  error: string | null;
  isStale: boolean;
  /** Status message during loading (e.g., "Retrying...") */
  status: string | null;
  retry: () => void;
}

/**
 * Fetch ticker price with retry logic
 */
async function fetchTickerPrice(
  symbol: string,
  attempt = 0,
  onStatus?: (status: string | null) => void
): Promise<TickerPriceData> {
  const response = await fetch(`/api/ticker-price?symbol=${encodeURIComponent(symbol)}`);

  if (response.status === 429) {
    // Rate limited - check if we should retry
    if (attempt < MAX_RETRIES) {
      const retryAfter = response.headers.get('Retry-After');
      // Use server's retry-after but cap it at MAX_RETRY_DELAY
      const serverDelay = retryAfter ? parseInt(retryAfter, 10) * 1000 : DEFAULT_RETRY_DELAY;
      const delay = Math.min(serverDelay, MAX_RETRY_DELAY);

      // Update status so user knows we're retrying
      const waitSeconds = Math.ceil(delay / 1000);
      onStatus?.(`Rate limited, retrying in ${waitSeconds}s...`);

      await new Promise((resolve) => setTimeout(resolve, delay));
      onStatus?.(null);
      return fetchTickerPrice(symbol, attempt + 1, onStatus);
    }
    throw new Error('Rate limited - please try again later');
  }

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || `Failed to fetch price: ${response.status}`);
  }

  return response.json();
}

/**
 * Hook to fetch and cache ticker price data
 * @param symbol Ticker symbol without $ prefix (e.g., "WLD", "BTC")
 */
export function useTickerPrice(symbol: string | null): UseTickerPriceResult {
  // Initialize from cache if available
  const [data, setData] = useState<TickerPriceData | null>(() => {
    if (!symbol) return null;
    const cached = tickerCache.get(symbol);
    return cached?.data ?? null;
  });
  const [isLoading, setIsLoading] = useState(() => {
    if (!symbol) return false;
    const cached = tickerCache.get(symbol);
    // Loading if no cache or cache is expired
    return !cached || Date.now() - cached.timestamp > CACHE_TTL_MS;
  });
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [isStale, setIsStale] = useState(() => {
    if (!symbol) return false;
    const cached = tickerCache.get(symbol);
    return cached?.isStale ?? false;
  });

  const fetchData = useCallback(async (sym: string, force = false) => {
    // Check if ticker is supported
    if (!isSupportedTicker(sym)) {
      setError('Unsupported ticker');
      setIsLoading(false);
      return;
    }

    // Check cache (unless forcing refresh)
    if (!force) {
      const cached = tickerCache.get(sym);
      if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
        setData(cached.data);
        setIsStale(cached.isStale ?? false);
        setIsLoading(false);
        setError(null);
        setStatus(null);
        return;
      }
    }

    setIsLoading(true);
    setError(null);
    setStatus(null);

    // Deduplicate concurrent requests
    let fetchPromise = pendingRequests.get(sym);
    if (!fetchPromise) {
      fetchPromise = fetchTickerPrice(sym, 0, setStatus);
      pendingRequests.set(sym, fetchPromise);
    }

    try {
      const priceData = await fetchPromise;
      const stale = 'stale' in priceData && (priceData as { stale?: boolean }).stale === true;

      // Update cache
      tickerCache.set(sym, {
        data: priceData,
        timestamp: Date.now(),
        isStale: stale,
      });

      setData(priceData);
      setIsStale(stale);
      setError(null);
      setStatus(null);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch price';
      setError(errorMessage);
      setStatus(null);

      // Keep showing stale data if available
      const cached = tickerCache.get(sym);
      if (cached) {
        setData(cached.data);
        setIsStale(true);
      }
    } finally {
      setIsLoading(false);
      pendingRequests.delete(sym);
    }
  }, []);

  // Fetch on mount or symbol change
  useEffect(() => {
    if (!symbol) {
      setData(null);
      setIsLoading(false);
      setError(null);
      setIsStale(false);
      setStatus(null);
      return;
    }

    fetchData(symbol);
  }, [symbol, fetchData]);

  // Subscribe to external cache updates (e.g., when modal refreshes)
  useEffect(() => {
    if (!symbol) return;

    const unsubscribe = subscribeToCacheUpdates(symbol, () => {
      const cached = tickerCache.get(symbol);
      if (cached) {
        setData(cached.data);
        setIsStale(cached.isStale ?? false);
        setError(null);
      }
    });

    return unsubscribe;
  }, [symbol]);

  // Retry function for manual refresh
  const retry = useCallback(() => {
    if (symbol) {
      fetchData(symbol, true);
    }
  }, [symbol, fetchData]);

  return { data, isLoading, error, isStale, status, retry };
}

/**
 * Clear the ticker price cache (useful for testing)
 */
export function clearTickerCache(): void {
  tickerCache.clear();
  pendingRequests.clear();
}

/**
 * Update the cache with new data (used when modal refreshes)
 * Also notifies any listening hooks to update
 */
export function updateTickerCache(symbol: string, data: TickerPriceData): void {
  tickerCache.set(symbol, {
    data,
    timestamp: Date.now(),
    isStale: false,
  });
  notifyCacheUpdate(symbol);
}
