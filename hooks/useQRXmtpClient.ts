'use client';

import { useCallback, useRef } from 'react';
import { useSetAtom, useAtom } from 'jotai';
import type { Client } from '@xmtp/browser-sdk';
import { clientLifecycleAtom, clientStateAtom } from '@/stores/client';
import { streamManager } from '@/lib/xmtp/StreamManager';
import { RemoteSigner } from '@/lib/signing-relay';

const XMTP_SESSION_KEY = 'xmtp-session-cache';

interface SessionCache {
  address: string;
  inboxId: string;
  timestamp: number;
}

/**
 * Cache the XMTP session info for faster reconnection
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
    // Also set wagmi-compatible flag so chat page knows we have a session
    localStorage.setItem('world-chat-connected', 'true');
  } catch {
    // Ignore localStorage errors
  }
}

/**
 * Dynamically import the XMTP browser SDK
 */
async function getXmtpModule() {
  const module = await import('@xmtp/browser-sdk');
  return module;
}

interface UseQRXmtpClientResult {
  client: Client | null;
  isInitializing: boolean;
  isReady: boolean;
  error: Error | null;
  initializeWithRemoteSigner: (signer: ReturnType<RemoteSigner['getSigner']>) => Promise<void>;
}

/**
 * Hook to create XMTP client using a remote signer (QR login flow)
 *
 * XMTP installations are persisted in OPFS (browser storage).
 * Client.create() will reuse existing installations for the same address.
 */
export function useQRXmtpClient(): UseQRXmtpClientResult {
  const [clientState] = useAtom(clientStateAtom);
  const client = clientState.client;
  const dispatch = useSetAtom(clientLifecycleAtom);
  const initializingRef = useRef(false);

  const initializeWithRemoteSigner = useCallback(
    async (signer: ReturnType<RemoteSigner['getSigner']>) => {
      if (initializingRef.current) {
        return;
      }

      initializingRef.current = true;
      dispatch({ type: 'INIT_START' });

      const address = signer.getIdentifier().identifier;

      try {
        // Dynamically import XMTP and content types
        const [{ Client }, { ReactionCodec }, { ReplyCodec }, { ReadReceiptCodec }] =
          await Promise.all([
            getXmtpModule(),
            import('@xmtp/content-type-reaction'),
            import('@xmtp/content-type-reply'),
            import('@xmtp/content-type-read-receipt'),
          ]);

        console.log('[QRXmtpClient] Creating XMTP client with remote signer...');
        console.log('[QRXmtpClient] Signer address:', address);
        console.log('[QRXmtpClient] Signer type:', signer.type);
        console.log('[QRXmtpClient] Chain ID:', signer.getChainId?.()?.toString());

        // Check for existing session before creating
        const existingSession = localStorage.getItem('xmtp-session-cache');
        if (existingSession) {
          const parsed = JSON.parse(existingSession);
          console.log('[QRXmtpClient] Found existing session cache:', {
            address: parsed.address,
            inboxId: parsed.inboxId,
            age: Math.round((Date.now() - parsed.timestamp) / 1000) + 's ago',
          });
        } else {
          console.log('[QRXmtpClient] No existing session cache - may create new installation');
        }

        // Client.create() automatically reuses existing installations stored in OPFS
        // for the same address - no new installation created if one exists
        const startTime = Date.now();
        const xmtpClient = await Client.create(signer, {
          env: 'production',
          appVersion: 'WorldChat/1.0.0',
          codecs: [new ReactionCodec(), new ReplyCodec(), new ReadReceiptCodec()],
        });
        const duration = Date.now() - startTime;

        console.log('[QRXmtpClient] XMTP client created in', duration, 'ms');
        console.log('[QRXmtpClient] InboxId:', xmtpClient.inboxId);
        console.log('[QRXmtpClient] InstallationId:', xmtpClient.installationId);

        // If creation was fast (<2s), likely reused existing installation
        if (duration < 2000) {
          console.log('[QRXmtpClient] Fast creation - likely reused existing installation');
        } else {
          console.log('[QRXmtpClient] Slow creation - may have created new installation');
        }

        // Cache session for faster future loads
        if (xmtpClient.inboxId) {
          cacheSession(address, xmtpClient.inboxId);
        }

        dispatch({ type: 'INIT_SUCCESS', client: xmtpClient });

        // Initialize StreamManager with the client
        await streamManager.initialize(xmtpClient);
      } catch (error) {
        console.error('Failed to initialize XMTP client with remote signer:', error);
        dispatch({
          type: 'INIT_ERROR',
          error: error instanceof Error ? error : new Error('Failed to initialize XMTP'),
        });
        throw error;
      } finally {
        initializingRef.current = false;
      }
    },
    [dispatch]
  );

  return {
    client,
    isInitializing: clientState.isInitializing,
    isReady: client !== null && !clientState.isInitializing && !clientState.error,
    error: clientState.error,
    initializeWithRemoteSigner,
  };
}
