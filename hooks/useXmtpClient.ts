'use client';

import { useEffect, useCallback, useRef, useState } from 'react';
import { useAccount, useWalletClient } from 'wagmi';
import { useAtom, useSetAtom } from 'jotai';
import type { Client, Identifier } from '@xmtp/browser-sdk';
import { clientLifecycleAtom, xmtpClientAtom, clientStateAtom } from '@/stores/client';
import { streamManager } from '@/lib/xmtp/StreamManager';
import { toBytes, type WalletClient } from 'viem';

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

  const initialize = useCallback(async () => {
    if (!walletClient || !address || initializingRef.current) {
      return;
    }

    // Prevent concurrent initialization
    initializingRef.current = true;
    dispatch({ type: 'INIT_START' });

    try {
      // Dynamically import XMTP to ensure client-side only loading
      const { Client } = await getXmtpModule();

      const signer = createXmtpSigner(walletClient, address);

      const xmtpClient = await Client.create(signer, {
        env: 'production',
        appVersion: 'WorldChat/1.0.0',
      });

      dispatch({ type: 'INIT_SUCCESS', client: xmtpClient });
      console.log('XMTP client initialized:', {
        inboxId: xmtpClient.inboxId,
        address: xmtpClient.accountIdentifier,
      });

      // Initialize StreamManager with the client
      // This loads conversations and starts streaming outside React lifecycle
      await streamManager.initialize(xmtpClient);
      console.log('StreamManager initialized');
    } catch (error) {
      console.error('Failed to initialize XMTP client:', error);
      dispatch({
        type: 'INIT_ERROR',
        error: error instanceof Error ? error : new Error('Failed to initialize XMTP'),
      });
    } finally {
      initializingRef.current = false;
    }
  }, [walletClient, address, dispatch]);

  const disconnect = useCallback(() => {
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
