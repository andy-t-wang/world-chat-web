'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { QRCodeSVG } from 'qrcode.react';
import Image from 'next/image';
import { useQRXmtpClient } from '@/hooks/useQRXmtpClient';
import { RemoteSigner, generateSessionId } from '@/lib/signing-relay';
import { MessageCircle, Shield, Zap, Loader2, Smartphone, KeyRound, X, RefreshCw } from 'lucide-react';

const MINI_APP_ID = process.env.NEXT_PUBLIC_WORLD_MINI_APP_ID || 'app_your_app_id';

type LoginState =
  | 'generating'
  | 'waiting_for_scan'
  | 'mobile_connected'
  | 'authenticating'
  | 'initializing_xmtp'
  | 'signing'
  | 'success'
  | 'error';

export default function Home() {
  const router = useRouter();
  const [state, setState] = useState<LoginState>('generating');
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [connectedAddress, setConnectedAddress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const signerRef = useRef<RemoteSigner | null>(null);
  const { initializeWithRemoteSigner } = useQRXmtpClient();

  const qrUrl = sessionId
    ? `https://worldcoin.org/mini-app?app_id=${MINI_APP_ID}&path=${encodeURIComponent(`/sign?session=${sessionId}`)}`
    : null;

  const startSession = async () => {
    // Cleanup any existing session
    signerRef.current?.cleanup();

    setState('generating');
    setError(null);
    setConnectedAddress(null);

    try {
      const newSessionId = generateSessionId();
      setSessionId(newSessionId);

      const signer = new RemoteSigner(newSessionId, {
        onMobileConnected: (address) => {
          setConnectedAddress(address);
          setState('mobile_connected');
        },
        onAuthenticating: () => {
          setState('authenticating');
        },
        onAuthenticated: (address) => {
          setConnectedAddress(address);
        },
        onSigningRequest: () => {
          setState('signing');
        },
        onSigningComplete: () => {
          // Stay in current state, don't change
        },
        onError: (err) => {
          setError(err.message);
          setState('error');
        },
      });

      signerRef.current = signer;
      setState('waiting_for_scan');

      // Wait for mobile to connect and authenticate
      await signer.connect();

      // Mobile authenticated, now initialize XMTP
      setState('initializing_xmtp');

      try {
        await initializeWithRemoteSigner(signer.getSigner());
        setState('success');

        // Small delay to show success, then navigate
        setTimeout(() => {
          router.push('/chat');
        }, 500);
      } catch (xmtpError) {
        console.error('XMTP initialization failed:', xmtpError);
        setError(xmtpError instanceof Error ? xmtpError.message : 'Failed to initialize messaging');
        setState('error');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to connect');
      setState('error');
    }
  };

  const handleRetry = () => {
    signerRef.current?.cleanup();
    startSession();
  };

  // Auto-start on mount
  useEffect(() => {
    startSession();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-b from-white to-gray-50 flex flex-col">
      {/* Header */}
      <header className="p-6">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-[#005CFF] flex items-center justify-center">
            <MessageCircle className="w-5 h-5 text-white" />
          </div>
          <span className="text-lg font-semibold text-[#181818]">World Chat</span>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex flex-col items-center justify-center px-6 pb-20">
        <div className="max-w-md w-full">
          {/* Hero */}
          <div className="text-center mb-12">
            <h1 className="text-4xl font-bold text-[#181818] mb-4">
              Private messaging,
              <br />
              <span className="text-[#005CFF]">powered by World</span>
            </h1>
            <p className="text-[#717680] text-lg">
              End-to-end encrypted conversations with verified humans.
              Scan with World App to get started.
            </p>
          </div>

          {/* Features */}
          <div className="grid grid-cols-3 gap-4 mb-10">
            <FeatureCard
              icon={<Shield className="w-5 h-5" />}
              title="E2E Encrypted"
              description="Your messages are yours"
            />
            <FeatureCard
              icon={<Zap className="w-5 h-5" />}
              title="Instant"
              description="Real-time messaging"
            />
            <FeatureCard
              icon={<MessageCircle className="w-5 h-5" />}
              title="Decentralized"
              description="No central servers"
            />
          </div>

          {/* Login Content */}
          <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
            <div className="flex flex-col items-center">
              {/* Header */}
              <div className="flex items-center gap-2 mb-6">
                <Smartphone className="w-6 h-6 text-[#005CFF]" />
                <h2 className="text-lg font-semibold text-[#181818]">
                  Login with World App
                </h2>
              </div>

              {/* QR Code or Status */}
              <div className="w-64 h-64 flex items-center justify-center mb-6 bg-[#F5F5F5] rounded-xl">
                {state === 'generating' && (
                  <Loader2 className="w-8 h-8 text-[#717680] animate-spin" />
                )}

                {state === 'waiting_for_scan' && qrUrl && (
                  <QRCodeSVG
                    value={qrUrl}
                    size={240}
                    level="M"
                    includeMargin
                    className="rounded-lg"
                  />
                )}

                {state === 'mobile_connected' && (
                  <div className="flex flex-col items-center gap-3">
                    <Image
                      src="/human-badge.svg"
                      alt="Verified Human"
                      width={64}
                      height={64}
                    />
                    <p className="text-sm text-[#717680]">Mobile connected!</p>
                  </div>
                )}

                {state === 'authenticating' && (
                  <div className="flex flex-col items-center gap-3">
                    <div className="w-16 h-16 rounded-full bg-[#005CFF]/10 flex items-center justify-center">
                      <KeyRound className="w-8 h-8 text-[#005CFF]" />
                    </div>
                    <p className="text-sm text-[#717680] text-center">
                      Verifying wallet...
                      <br />
                      <span className="text-xs text-[#9BA3AE]">Approve in World App</span>
                    </p>
                  </div>
                )}

                {(state === 'initializing_xmtp' || state === 'signing') && (
                  <div className="flex flex-col items-center gap-3">
                    <Loader2 className="w-8 h-8 text-[#005CFF] animate-spin" />
                    <p className="text-sm text-[#717680] text-center">
                      {state === 'signing' ? 'Approve in World App...' : 'Setting up messaging...'}
                    </p>
                    <p className="text-xs text-[#9BA3AE] text-center">
                      Keep World App open
                    </p>
                  </div>
                )}

                {state === 'success' && (
                  <div className="flex flex-col items-center gap-3">
                    <Image
                      src="/human-badge.svg"
                      alt="Verified Human"
                      width={64}
                      height={64}
                    />
                    <p className="text-sm text-[#717680]">Welcome!</p>
                  </div>
                )}

                {state === 'error' && (
                  <div className="flex flex-col items-center gap-3">
                    <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center">
                      <X className="w-8 h-8 text-red-600" />
                    </div>
                    <p className="text-sm text-red-600 text-center px-4">{error}</p>
                  </div>
                )}
              </div>

              {/* Address */}
              {connectedAddress && state !== 'error' && (
                <p className="text-xs text-[#9BA3AE] mb-4 font-mono">
                  {connectedAddress.slice(0, 6)}...{connectedAddress.slice(-4)}
                </p>
              )}

              {/* Instructions */}
              {state === 'waiting_for_scan' && (
                <p className="text-sm text-[#717680] text-center mb-4">
                  Scan this QR code with World App to login
                </p>
              )}

              {/* Retry button */}
              {state === 'error' && (
                <button
                  onClick={handleRetry}
                  className="flex items-center justify-center gap-2 px-6 py-2 bg-[#005CFF] text-white rounded-lg hover:bg-[#0052E0] transition-colors"
                >
                  <RefreshCw className="w-4 h-4" />
                  Retry
                </button>
              )}
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="p-6 text-center text-sm text-[#9BA3AE]">
        Powered by XMTP Protocol
      </footer>
    </div>
  );
}

function FeatureCard({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="flex flex-col items-center text-center p-4">
      <div className="w-10 h-10 rounded-xl bg-[#005CFF]/10 flex items-center justify-center text-[#005CFF] mb-2">
        {icon}
      </div>
      <h3 className="text-sm font-medium text-[#181818]">{title}</h3>
      <p className="text-xs text-[#717680] mt-1">{description}</p>
    </div>
  );
}
