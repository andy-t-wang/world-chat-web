'use client';

import { useEffect, useCallback, useRef } from 'react';
import { useAccount, useWalletClient } from 'wagmi';
import { useAtom, useSetAtom } from 'jotai';
import type { Client, Identifier } from '@xmtp/browser-sdk';
import { clientLifecycleAtom, xmtpClientAtom, clientStateAtom } from '@/stores/client';
import { streamManager } from '@/lib/xmtp/StreamManager';
import { toBytes, type WalletClient } from 'viem';

const XMTP_SESSION_KEY = 'xmtp-session-cache';

interface SessionCache {
  address: string;
  inboxId: string;
  timestamp: number;
}

/**
 * Check if we have a cached XMTP session for this address
 */
function getCachedSession(address: string): SessionCache | null {
  if (typeof window === 'undefined') return null;
  try {
    const cached = localStorage.getItem(XMTP_SESSION_KEY);
    if (!cached) return null;
    const session: SessionCache = JSON.parse(cached);
    // Check if session is for this address and not too old (7 days)
    const maxAge = 7 * 24 * 60 * 60 * 1000;
    if (session.address.toLowerCase() === address.toLowerCase() &&
        Date.now() - session.timestamp < maxAge) {
      return session;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Cache the XMTP session info
 */
function cacheSession(address: string, inboxId: string): void {
  if (typeof window === 'undefined') return;
  try {
    const session: SessionCache = {
      address: address.toLowerCase(),
      inboxId,
      timestamp: Date.now(),
    };
    localStorage.setItem(XMTP_SESSION_KEY, JSON.stringify(session));
  } catch {
    // Ignore localStorage errors
  }
}

/**
 * Clear the cached session
 */
function clearSessionCache(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(XMTP_SESSION_KEY);
  } catch {
    // Ignore localStorage errors
  }
}

/**
 * Dynamically import the XMTP browser SDK
 * This ensures it only loads client-side
 */
async function getXmtpModule() {
  const module = await import('@xmtp/browser-sdk');
  return module;
}

/**
 * Creates an XMTP-compatible signer from a viem WalletClient
 */
function createXmtpSigner(walletClient: WalletClient, address: string) {
  return {
    type: 'EOA' as const,
    getIdentifier: () => ({
      identifier: address.toLowerCase(),
      identifierKind: 'Ethereum' as const,
    }),
    signMessage: async (message: string): Promise<Uint8Array> => {
      const signature = await walletClient.signMessage({
        account: walletClient.account!,
        message,
      });
      return toBytes(signature);
    },
  };
}

interface UseXmtpClientResult {
  client: Client | null;
  isInitializing: boolean;
  isReady: boolean;
  /** True if restoring an existing session (faster, no signature needed) */
  isRestoringSession: boolean;
  error: Error | null;
  initialize: () => Promise<void>;
  disconnect: () => void;
}

/**
 * Hook to manage XMTP client lifecycle
 * Automatically initializes when wallet is connected
 */
export function useXmtpClient(): UseXmtpClientResult {
  const { address, isConnected } = useAccount();
  const { data: walletClient } = useWalletClient();
  const [clientState] = useAtom(clientStateAtom);
  const client = clientState.client;
  const dispatch = useSetAtom(clientLifecycleAtom);
  const initializingRef = useRef(false);
  const isRestoringRef = useRef(false);

  // Check if we have a cached session on mount
  const hasCachedSession = address ? getCachedSession(address) !== null : false;

  const initialize = useCallback(async () => {
    if (!walletClient || !address || initializingRef.current) {
      return;
    }

    // Capture address after guard for type safety (narrowed from `string | undefined`)
    const walletAddress: string = address;

    // Check if we're restoring an existing session
    const cachedSession = getCachedSession(walletAddress);
    isRestoringRef.current = cachedSession !== null;

    // Prevent concurrent initialization
    initializingRef.current = true;
    dispatch({ type: 'INIT_START' });

    try {
      // Dynamically import XMTP and content types
      const [{ Client }, { ReactionCodec }, { ReplyCodec }, { ReadReceiptCodec }] = await Promise.all([
        getXmtpModule(),
        import('@xmtp/content-type-reaction'),
        import('@xmtp/content-type-reply'),
        import('@xmtp/content-type-read-receipt'),
      ]);

      const signer = createXmtpSigner(walletClient, walletAddress);

      const xmtpClient = await Client.create(signer, {
        env: 'production',
        appVersion: 'WorldChat/1.0.0',
        codecs: [new ReactionCodec(), new ReplyCodec(), new ReadReceiptCodec()],
      });

      // Cache the session for faster future loads
      if (xmtpClient.inboxId) {
        cacheSession(walletAddress, xmtpClient.inboxId);
      }

      dispatch({ type: 'INIT_SUCCESS', client: xmtpClient });

      // Initialize StreamManager with the client
      // This loads conversations and starts streaming outside React lifecycle
      await streamManager.initialize(xmtpClient);
    } catch (error) {
      console.error('Failed to initialize XMTP client:', error);
      // Clear cache on error - session may be invalid
      clearSessionCache();
      dispatch({
        type: 'INIT_ERROR',
        error: error instanceof Error ? error : new Error('Failed to initialize XMTP'),
      });
    } finally {
      initializingRef.current = false;
      isRestoringRef.current = false;
    }
  }, [walletClient, address, dispatch]);

  const disconnect = useCallback(() => {
    clearSessionCache();
    streamManager.cleanup();
    dispatch({ type: 'DISCONNECT' });
  }, [dispatch]);

  // Auto-initialize when wallet is connected
  useEffect(() => {
    if (isConnected && walletClient && address && !client && !clientState.isInitializing) {
      initialize();
    }
  }, [isConnected, walletClient, address, client, clientState.isInitializing, initialize]);

  // Disconnect when wallet disconnects
  useEffect(() => {
    if (!isConnected && client) {
      disconnect();
    }
  }, [isConnected, client, disconnect]);

  return {
    client,
    isInitializing: clientState.isInitializing,
    isReady: client !== null && !clientState.isInitializing && !clientState.error,
    isRestoringSession: hasCachedSession && clientState.isInitializing,
    error: clientState.error,
    initialize,
    disconnect,
  };
}

/**
 * Hook to check if an address can receive XMTP messages
 */
export function useCanMessage() {
  const [client] = useAtom(xmtpClientAtom);

  const canMessage = useCallback(
    async (address: string): Promise<boolean> => {
      if (!client) return false;

      try {
        const identifier: Identifier = {
          identifier: address.toLowerCase(),
          identifierKind: 'Ethereum',
        };
        const result = await client.canMessage([identifier]);
        return result.get(address.toLowerCase()) ?? false;
      } catch (error) {
        console.error('Failed to check canMessage:', error);
        return false;
      }
    },
    [client]
  );

  return { canMessage };
}
