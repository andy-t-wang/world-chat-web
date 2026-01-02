'use client';

import { useCallback, useRef, useEffect } from 'react';
import { useSetAtom, useAtom } from 'jotai';
import type { Client } from '@xmtp/browser-sdk';
import { toBytes } from 'viem';
import { clientLifecycleAtom, clientStateAtom } from '@/stores/client';
import { streamManager } from '@/lib/xmtp/StreamManager';
import { RemoteSigner } from '@/lib/signing-relay';
import { clearSession } from '@/lib/auth/session';

const XMTP_SESSION_KEY = 'xmtp-session-cache';

interface SessionCache {
  address: string;
  inboxId: string;
  timestamp: number;
}

/**
 * Get cached session from localStorage
 */
function getCachedSession(): SessionCache | null {
  if (typeof window === 'undefined') return null;
  try {
    const cached = localStorage.getItem(XMTP_SESSION_KEY);
    if (!cached) return null;
    const session: SessionCache = JSON.parse(cached);
    // Check if session is not too old (7 days)
    const maxAge = 7 * 24 * 60 * 60 * 1000;
    if (Date.now() - session.timestamp < maxAge) {
      return session;
    }
    return null;
  } catch {
    return null;
  }
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
    localStorage.setItem('world-chat-connected', 'true');
  } catch {
    // Ignore localStorage errors
  }
}

/**
 * Create a cached signer for restoring sessions
 * This signer uses the cached address and throws if signing is needed
 * (which shouldn't happen for existing installations)
 */
function createCachedSigner(address: string) {
  return {
    type: 'SCW' as const,
    getIdentifier: () => ({
      identifier: address.toLowerCase(),
      identifierKind: 'Ethereum' as const,
    }),
    signMessage: async (): Promise<Uint8Array> => {
      // For existing installations, XMTP shouldn't need to sign
      // If it does, we need to re-authenticate via QR
      throw new Error('Session expired - please scan QR code to reconnect');
    },
    getChainId: () => BigInt(480), // World Chain
  };
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
  restoreSession: () => Promise<boolean>;
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
  const restoringRef = useRef(false);

  /**
   * Try to restore session from cache (for page reloads)
   * Returns true if successful, false if QR login is needed
   */
  const restoreSession = useCallback(async (): Promise<boolean> => {
    if (restoringRef.current || initializingRef.current || client) {
      return !!client;
    }

    const cachedSession = getCachedSession();
    if (!cachedSession) {
      console.log('[QRXmtpClient] No cached session to restore');
      return false;
    }

    restoringRef.current = true;
    dispatch({ type: 'INIT_START' });

    try {
      console.log('[QRXmtpClient] Restoring session for:', cachedSession.address);

      const [{ Client }, { ReactionCodec }, { ReplyCodec }, { ReadReceiptCodec }] =
        await Promise.all([
          getXmtpModule(),
          import('@xmtp/content-type-reaction'),
          import('@xmtp/content-type-reply'),
          import('@xmtp/content-type-read-receipt'),
        ]);

      // Create a cached signer - works for existing installations
      const cachedSigner = createCachedSigner(cachedSession.address);

      const startTime = Date.now();
      const xmtpClient = await Client.create(cachedSigner, {
        env: 'production',
        appVersion: 'WorldChat/1.0.0',
        codecs: [new ReactionCodec(), new ReplyCodec(), new ReadReceiptCodec()],
      });
      const duration = Date.now() - startTime;

      console.log('[QRXmtpClient] Session restored in', duration, 'ms');
      console.log('[QRXmtpClient] InboxId:', xmtpClient.inboxId);

      // Update cache timestamp
      if (xmtpClient.inboxId) {
        cacheSession(cachedSession.address, xmtpClient.inboxId);
      }

      dispatch({ type: 'INIT_SUCCESS', client: xmtpClient });
      await streamManager.initialize(xmtpClient);

      return true;
    } catch (error) {
      console.error('[QRXmtpClient] Failed to restore session:', error);
      // Clear invalid session
      clearSession();
      dispatch({
        type: 'INIT_ERROR',
        error: error instanceof Error ? error : new Error('Failed to restore session'),
      });
      return false;
    } finally {
      restoringRef.current = false;
    }
  }, [client, dispatch]);

  const initializeWithRemoteSigner = useCallback(
    async (signer: ReturnType<RemoteSigner['getSigner']>) => {
      if (initializingRef.current) {
        return;
      }

      initializingRef.current = true;
      dispatch({ type: 'INIT_START' });

      const address = signer.getIdentifier().identifier;

      try {
        const [{ Client }, { ReactionCodec }, { ReplyCodec }, { ReadReceiptCodec }] =
          await Promise.all([
            getXmtpModule(),
            import('@xmtp/content-type-reaction'),
            import('@xmtp/content-type-reply'),
            import('@xmtp/content-type-read-receipt'),
          ]);

        console.log('[QRXmtpClient] Creating XMTP client with remote signer...');
        console.log('[QRXmtpClient] Signer address:', address);

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

        // Cache session for page reloads
        if (xmtpClient.inboxId) {
          cacheSession(address, xmtpClient.inboxId);
        }

        dispatch({ type: 'INIT_SUCCESS', client: xmtpClient });
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
    restoreSession,
  };
}
