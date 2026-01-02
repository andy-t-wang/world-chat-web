'use client';

import { useEffect, useState, useCallback, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Loader2, Check, Smartphone, X, Shield, KeyRound } from 'lucide-react';
import { MobileSigner } from '@/lib/signing-relay';

type SignState =
  | 'connecting'
  | 'authenticating'
  | 'ready'
  | 'signing'
  | 'success'
  | 'error';

function SignPageContent() {
  const searchParams = useSearchParams();
  const sessionId = searchParams.get('session');

  const [state, setState] = useState<SignState>('connecting');
  const [currentMessage, setCurrentMessage] = useState<string | null>(null);
  const [signCount, setSignCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [signer, setSigner] = useState<MobileSigner | null>(null);

  // Sign message using MiniKit
  const signMessage = useCallback(async (message: string): Promise<string> => {
    // Check if MiniKit is available (we're inside World App)
    if (typeof window !== 'undefined' && (window as any).MiniKit) {
      const MiniKit = (window as any).MiniKit;

      if (!MiniKit.isInstalled()) {
        throw new Error('MiniKit not installed');
      }

      const { finalPayload } = await MiniKit.commandsAsync.signMessage({
        message,
      });

      if (finalPayload.status !== 'success') {
        throw new Error('User rejected signing');
      }

      return finalPayload.signature;
    }

    // MiniKit not available - must be opened in World App
    throw new Error('Please open this page in World App');
  }, []);

  // Get wallet address from MiniKit
  const getWalletAddress = useCallback((): string | null => {
    if (typeof window !== 'undefined' && (window as any).MiniKit) {
      const MiniKit = (window as any).MiniKit;
      return MiniKit.walletAddress || null;
    }
    return null;
  }, []);

  // Connect to the signing session
  useEffect(() => {
    if (!sessionId) {
      setError('No session ID provided');
      setState('error');
      return;
    }

    let mobileSigner: MobileSigner | null = null;

    const connect = async () => {
      try {
        // Get wallet address from MiniKit (SEC-009: no dev placeholder)
        const walletAddress = getWalletAddress();

        if (!walletAddress) {
          setError('World App wallet not available. Please open this link in World App.');
          setState('error');
          return;
        }

        mobileSigner = new MobileSigner(
          sessionId,
          walletAddress,
          async (message) => {
            setCurrentMessage(message);
            setState('signing');
            const signature = await signMessage(message);
            setSignCount((c) => c + 1);
            setState('ready');
            setCurrentMessage(null);
            return signature;
          },
          {
            onConnected: () => {
              // Connected but not authenticated yet
              setState('authenticating');
            },
            onAuthChallenge: (challenge) => {
              setCurrentMessage(challenge);
              setState('authenticating');
            },
            onAuthenticated: () => {
              setState('ready');
              setCurrentMessage(null);
            },
            onAuthFailed: (err) => {
              setError(`Authentication failed: ${err}`);
              setState('error');
            },
            onSignRequest: (message) => {
              setCurrentMessage(message);
              setState('signing');
            },
            onSessionComplete: () => {
              setState('success');
            },
            onError: (err) => {
              setError(err.message);
              setState('error');
            },
          }
        );

        setSigner(mobileSigner);
        await mobileSigner.connect();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Connection failed');
        setState('error');
      }
    };

    connect();

    return () => {
      mobileSigner?.cleanup();
    };
  }, [sessionId, signMessage, getWalletAddress]);

  // No session ID
  if (!sessionId) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F5F5F5] p-4">
        <div className="bg-white rounded-2xl p-6 max-w-sm w-full text-center">
          <X className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <h1 className="text-lg font-semibold text-[#181818] mb-2">Invalid Link</h1>
          <p className="text-sm text-[#717680]">
            This link is missing the session ID. Please scan the QR code again.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#F5F5F5] p-4">
      <div className="bg-white rounded-2xl p-6 max-w-sm w-full">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <div className="w-12 h-12 rounded-full bg-[#005CFF]/10 flex items-center justify-center">
            <Shield className="w-6 h-6 text-[#005CFF]" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-[#181818]">
              Web Login
            </h1>
            <p className="text-sm text-[#717680]">
              World Chat
            </p>
          </div>
        </div>

        {/* Status */}
        <div className="bg-[#F5F5F5] rounded-xl p-6 mb-6">
          {state === 'connecting' && (
            <div className="flex flex-col items-center gap-3">
              <Loader2 className="w-10 h-10 text-[#005CFF] animate-spin" />
              <p className="text-sm text-[#717680]">Connecting to web client...</p>
            </div>
          )}

          {state === 'authenticating' && (
            <div className="flex flex-col items-center gap-3">
              <div className="w-16 h-16 rounded-full bg-[#005CFF]/10 flex items-center justify-center">
                <KeyRound className="w-8 h-8 text-[#005CFF]" />
              </div>
              <p className="text-sm text-[#717680] text-center">
                Verifying your wallet...
                <br />
                Approve the signature to continue.
              </p>
              {currentMessage && (
                <div className="w-full mt-2 p-3 bg-white rounded-lg">
                  <p className="text-xs text-[#9BA3AE] mb-1">Verification message:</p>
                  <p className="text-xs text-[#181818] font-mono break-all line-clamp-2">
                    {currentMessage.slice(0, 50)}...
                  </p>
                </div>
              )}
            </div>
          )}

          {state === 'ready' && (
            <div className="flex flex-col items-center gap-3">
              <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center">
                <Check className="w-8 h-8 text-green-600" />
              </div>
              <p className="text-sm text-[#717680] text-center">
                Connected! Keep this page open.
                <br />
                Approve signing requests as they appear.
              </p>
              {signCount > 0 && (
                <p className="text-xs text-[#9BA3AE]">
                  Signed {signCount} message{signCount !== 1 ? 's' : ''}
                </p>
              )}
            </div>
          )}

          {state === 'signing' && (
            <div className="flex flex-col items-center gap-3">
              <Loader2 className="w-10 h-10 text-[#005CFF] animate-spin" />
              <p className="text-sm text-[#717680] text-center">
                Approve the signature request...
              </p>
              {currentMessage && (
                <div className="w-full mt-2 p-3 bg-white rounded-lg">
                  <p className="text-xs text-[#9BA3AE] mb-1">Message to sign:</p>
                  <p className="text-xs text-[#181818] font-mono break-all line-clamp-3">
                    {currentMessage}
                  </p>
                </div>
              )}
            </div>
          )}

          {state === 'success' && (
            <div className="flex flex-col items-center gap-3">
              <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center">
                <Check className="w-8 h-8 text-green-600" />
              </div>
              <p className="text-sm text-[#717680] text-center">
                Login complete!
                <br />
                You can close this page.
              </p>
            </div>
          )}

          {state === 'error' && (
            <div className="flex flex-col items-center gap-3">
              <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center">
                <X className="w-8 h-8 text-red-600" />
              </div>
              <p className="text-sm text-red-600 text-center">{error}</p>
            </div>
          )}
        </div>

        {/* Info */}
        <div className="flex items-start gap-2 text-xs text-[#9BA3AE]">
          <Smartphone className="w-4 h-4 shrink-0 mt-0.5" />
          <p>
            This page securely connects your World App wallet to the web client.
            All messages are verified before signing.
          </p>
        </div>
      </div>
    </div>
  );
}

export default function SignPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-[#F5F5F5]">
          <Loader2 className="w-8 h-8 text-[#005CFF] animate-spin" />
        </div>
      }
    >
      <SignPageContent />
    </Suspense>
  );
}
