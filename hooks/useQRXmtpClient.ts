'use client';

import { useCallback, useRef, useEffect } from 'react';
import { useSetAtom, useAtom } from 'jotai';
import type { Client } from '@xmtp/browser-sdk';
import { toBytes } from 'viem';
import { clientLifecycleAtom, clientStateAtom } from '@/stores/client';
import { streamManager } from '@/lib/xmtp/StreamManager';
import { RemoteSigner } from '@/lib/signing-relay';
import { clearSession } from '@/lib/auth/session';
import { isLockedByAnotherTab, acquireTabLock, releaseTabLock } from '@/lib/tab-lock';

const XMTP_SESSION_KEY = 'xmtp-session-cache';

// Module cache for faster subsequent loads
let cachedModules: Awaited<ReturnType<typeof loadAllModules>> | null = null;
let moduleLoadPromise: Promise<Awaited<ReturnType<typeof loadAllModules>>> | null = null;

/**
 * Load all XMTP modules in parallel (cached)
 */
async function loadAllModules() {
  const [
    xmtpModule,
    reactionModule,
    replyModule,
    readReceiptModule,
    remoteAttachmentModule,
    transactionRefModule,
  ] = await Promise.all([
    import('@xmtp/browser-sdk'),
    import('@xmtp/content-type-reaction'),
    import('@xmtp/content-type-reply'),
    import('@xmtp/content-type-read-receipt'),
    import('@xmtp/content-type-remote-attachment'),
    import('@/lib/xmtp/TransactionReferenceCodec'),
  ]);

  return {
    Client: xmtpModule.Client,
    ReactionCodec: reactionModule.ReactionCodec,
    ReplyCodec: replyModule.ReplyCodec,
    ReadReceiptCodec: readReceiptModule.ReadReceiptCodec,
    RemoteAttachmentCodec: remoteAttachmentModule.RemoteAttachmentCodec,
    AttachmentCodec: remoteAttachmentModule.AttachmentCodec,
    TransactionReferenceCodec: transactionRefModule.TransactionReferenceCodec,
  };
}

/**
 * Get cached modules or load them (deduplicates concurrent requests)
 */
async function getModules() {
  if (cachedModules) return cachedModules;

  if (!moduleLoadPromise) {
    moduleLoadPromise = loadAllModules().then(modules => {
      cachedModules = modules;
      return modules;
    });
  }

  return moduleLoadPromise;
}

/**
 * Pre-load modules in background (call early to warm cache)
 */
export function preloadXmtpModules() {
  if (typeof window === 'undefined') return;
  // Start loading modules in background
  getModules().catch(() => {
    // Ignore errors - will retry when actually needed
  });
}

// Auto-preload on module import (starts loading immediately when this file is imported)
if (typeof window !== 'undefined') {
  // Use requestIdleCallback to load during idle time, fallback to setTimeout
  const schedulePreload = window.requestIdleCallback || ((cb: () => void) => setTimeout(cb, 1));
  schedulePreload(() => preloadXmtpModules());
}

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
   * Throws 'TAB_LOCKED' error if another tab has the XMTP client
   */
  const restoreSession = useCallback(async (): Promise<boolean> => {
    if (restoringRef.current || initializingRef.current || client) {
      return !!client;
    }

    const cachedSession = getCachedSession();
    if (!cachedSession) {
      return false;
    }

    // Check if another tab has the XMTP client
    if (isLockedByAnotherTab()) {
      throw new Error('TAB_LOCKED');
    }

    // Try to acquire the lock
    if (!acquireTabLock()) {
      throw new Error('TAB_LOCKED');
    }

    restoringRef.current = true;
    dispatch({ type: 'INIT_START' });

    try {
      // Use cached modules for faster load
      const {
        Client,
        ReactionCodec,
        ReplyCodec,
        ReadReceiptCodec,
        RemoteAttachmentCodec,
        AttachmentCodec,
        TransactionReferenceCodec,
      } = await getModules();

      // Create a cached signer - works for existing installations
      const cachedSigner = createCachedSigner(cachedSession.address);

      const xmtpClient = await Client.create(cachedSigner, {
        env: 'production',
        appVersion: 'WorldChat/1.0.0',
        codecs: [
          new ReactionCodec(),
          new ReplyCodec(),
          new ReadReceiptCodec(),
          new AttachmentCodec(),
          new RemoteAttachmentCodec(),
          new TransactionReferenceCodec(),
        ],
      });

      // Update cache timestamp
      if (xmtpClient.inboxId) {
        cacheSession(cachedSession.address, xmtpClient.inboxId);
      }

      dispatch({ type: 'INIT_SUCCESS', client: xmtpClient });

      // Initialize StreamManager in background (don't block UI)
      streamManager.initialize(xmtpClient).catch((error) => {
        console.error('[QRXmtpClient] StreamManager initialization error:', error);
      });

      return true;
    } catch (error) {
      console.error('[QRXmtpClient] Failed to restore session:', error);

      // Release the tab lock on failure
      releaseTabLock();

      // Only clear session if it's truly invalid (signing was required)
      // For other errors (network, etc.), keep session so user can retry
      const errorMessage = error instanceof Error ? error.message : String(error);
      const isSessionExpired = errorMessage.includes('Session expired') ||
                               errorMessage.includes('scan QR') ||
                               errorMessage.includes('signature');

      if (isSessionExpired) {
        clearSession();
      }

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

      // Check if another tab has the XMTP client
      if (isLockedByAnotherTab()) {
        throw new Error('TAB_LOCKED');
      }

      // Try to acquire the lock
      if (!acquireTabLock()) {
        throw new Error('TAB_LOCKED');
      }

      initializingRef.current = true;
      dispatch({ type: 'INIT_START' });

      const address = signer.getIdentifier().identifier;

      try {
        // Use cached modules for faster load
        const {
          Client,
          ReactionCodec,
          ReplyCodec,
          ReadReceiptCodec,
          RemoteAttachmentCodec,
          AttachmentCodec,
          TransactionReferenceCodec,
        } = await getModules();

        const xmtpClient = await Client.create(signer, {
          env: 'production',
          appVersion: 'WorldChat/1.0.0',
          codecs: [
            new ReactionCodec(),
            new ReplyCodec(),
            new ReadReceiptCodec(),
            new AttachmentCodec(),
            new RemoteAttachmentCodec(),
            new TransactionReferenceCodec(),
          ],
        });

        // Cache session for page reloads
        if (xmtpClient.inboxId) {
          cacheSession(address, xmtpClient.inboxId);
        }

        dispatch({ type: 'INIT_SUCCESS', client: xmtpClient });

        // Initialize StreamManager in background (don't block UI)
        streamManager.initialize(xmtpClient).catch((error) => {
          console.error('[QRXmtpClient] StreamManager initialization error:', error);
        });
      } catch (error) {
        console.error('Failed to initialize XMTP client with remote signer:', error);
        // Release the tab lock on failure
        releaseTabLock();
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
