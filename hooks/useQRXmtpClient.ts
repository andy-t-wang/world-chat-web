'use client';

import { useCallback, useRef } from 'react';
import { useSetAtom, useAtom } from 'jotai';
import type { Client } from '@xmtp/browser-sdk';
import { clientLifecycleAtom, clientStateAtom } from '@/stores/client';
import { streamManager } from '@/lib/xmtp/StreamManager';
import { RemoteSigner } from '@/lib/signing-relay';

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

      try {
        // Dynamically import XMTP and content types
        const [{ Client }, { ReactionCodec }, { ReplyCodec }, { ReadReceiptCodec }] =
          await Promise.all([
            getXmtpModule(),
            import('@xmtp/content-type-reaction'),
            import('@xmtp/content-type-reply'),
            import('@xmtp/content-type-read-receipt'),
          ]);

        const xmtpClient = await Client.create(signer, {
          env: 'production',
          appVersion: 'WorldChat/1.0.0',
          codecs: [new ReactionCodec(), new ReplyCodec(), new ReadReceiptCodec()],
        });

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
