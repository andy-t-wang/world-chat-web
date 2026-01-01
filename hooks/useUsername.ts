/**
 * Username Hook
 * React hook for fetching and displaying World App usernames
 */

'use client';

import { useEffect } from 'react';
import { useAtom, useSetAtom } from 'jotai';
import { usernameAtomFamily, queriedAddressesAtom } from '@/stores/usernames';
import { resolveAddress, resolveAddresses, getCachedUsername } from '@/lib/username/service';
import type { UsernameRecord } from '@/types/username';

interface UseUsernameResult {
  /** The username record if found */
  record: UsernameRecord | null;
  /** Whether the username is currently loading */
  isLoading: boolean;
  /** Any error that occurred during fetch */
  error: Error | null;
  /** Display name (username or truncated address) */
  displayName: string;
  /** Profile picture URL if available */
  profilePicture: string | null;
}

/**
 * Truncate an address to a display-friendly format
 */
function truncateAddress(address: string): string {
  if (address.length <= 10) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

/**
 * Hook to get username data for a single address
 */
export function useUsername(address: string | null | undefined): UseUsernameResult {
  const normalizedAddress = address?.toLowerCase() ?? '';
  const [state, setState] = useAtom(usernameAtomFamily(normalizedAddress));
  const setQueriedAddresses = useSetAtom(queriedAddressesAtom);

  useEffect(() => {
    if (!address) return;

    // Check if already cached
    const cached = getCachedUsername(address);
    if (cached !== undefined) {
      setState({
        record: cached,
        isLoading: false,
        error: null,
      });
      return;
    }

    // Skip if already loading
    if (state.isLoading) return;

    // Fetch username
    setState((prev) => ({ ...prev, isLoading: true }));

    resolveAddress(address)
      .then((record) => {
        setState({
          record,
          isLoading: false,
          error: null,
        });
        setQueriedAddresses((prev: Set<string>) => new Set([...prev, normalizedAddress]));
      })
      .catch((error) => {
        setState({
          record: null,
          isLoading: false,
          error: error instanceof Error ? error : new Error('Failed to fetch username'),
        });
      });
  }, [address, normalizedAddress, state.isLoading, setState, setQueriedAddresses]);

  return {
    record: state.record,
    isLoading: state.isLoading,
    error: state.error,
    displayName: state.record?.username ?? (address ? truncateAddress(address) : ''),
    profilePicture: state.record?.minimized_profile_picture_url ?? state.record?.profile_picture_url ?? null,
  };
}

/**
 * Hook to batch-fetch usernames for multiple addresses
 * More efficient for conversation lists
 */
export function useBatchUsernames(addresses: string[]): void {
  const setQueriedAddresses = useSetAtom(queriedAddressesAtom);

  useEffect(() => {
    if (addresses.length === 0) return;

    // Filter to only addresses we haven't queried yet
    const newAddresses = addresses.filter((addr) => {
      const cached = getCachedUsername(addr);
      return cached === undefined;
    });

    if (newAddresses.length === 0) return;

    resolveAddresses(newAddresses).then(() => {
      setQueriedAddresses((prev: Set<string>) => {
        const next = new Set(prev);
        for (const addr of newAddresses) {
          next.add(addr.toLowerCase());
        }
        return next;
      });

      // Update individual atoms with results
      // The atoms will be populated via the cache on next render
    });
  }, [addresses, setQueriedAddresses]);
}

/**
 * Get display name from a username record or address
 */
export function getDisplayName(record: UsernameRecord | null, address: string): string {
  return record?.username ?? truncateAddress(address);
}
