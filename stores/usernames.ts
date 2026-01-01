/**
 * Username State Store
 * Jotai atoms for managing username lookups with granular subscriptions
 */

import { atom } from 'jotai';
import { atomFamily } from 'jotai/utils';
import type { UsernameRecord } from '@/types/username';

interface UsernameState {
  record: UsernameRecord | null;
  isLoading: boolean;
  error: Error | null;
}

/**
 * Individual username atoms - granular updates per address
 * Using atomFamily so each address has its own atom
 */
export const usernameAtomFamily = atomFamily((address: string) =>
  atom<UsernameState>({
    record: null,
    isLoading: false,
    error: null,
  })
);

/**
 * Batch loading state for conversation list optimization
 */
export const isLoadingUsernamesAtom = atom<boolean>(false);

/**
 * Addresses that have been queried (to avoid re-fetching)
 */
export const queriedAddressesAtom = atom<Set<string>>(new Set<string>());
