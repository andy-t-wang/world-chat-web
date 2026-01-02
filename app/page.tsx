'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAccount } from 'wagmi';
import { ConnectWallet } from '@/components/auth/ConnectWallet';
import { QRLogin } from '@/components/auth/QRLogin';
import { useQRXmtpClient } from '@/hooks/useQRXmtpClient';
import { wasConnected } from '@/lib/auth/session';
import { MessageCircle, Shield, Zap, Loader2, Smartphone, Wallet } from 'lucide-react';

type LoginMethod = 'wallet' | 'qr';

export default function Home() {
  const router = useRouter();
  const { isConnected, isReconnecting } = useAccount();
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const [hadPreviousSession, setHadPreviousSession] = useState(false);
  const [loginMethod, setLoginMethod] = useState<LoginMethod>('wallet');
  const [isQRLoggingIn, setIsQRLoggingIn] = useState(false);
  const { initializeWithRemoteSigner } = useQRXmtpClient();

  // Check for previous session on mount
  useEffect(() => {
    const previouslyConnected = wasConnected();
    setHadPreviousSession(previouslyConnected);
    // Give wagmi a moment to reconnect if there was a previous session
    if (!previouslyConnected) {
      setIsCheckingAuth(false);
    }
  }, []);

  // Redirect to chat when connected
  useEffect(() => {
    if (isConnected) {
      router.push('/chat');
    } else if (hadPreviousSession && !isReconnecting) {
      // Previous session but couldn't reconnect - show login
      setIsCheckingAuth(false);
    }
  }, [isConnected, isReconnecting, hadPreviousSession, router]);

  // Show loading while checking auth or reconnecting
  if (isCheckingAuth && hadPreviousSession) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-white to-gray-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-16 h-16 rounded-2xl bg-[#005CFF]/10 flex items-center justify-center">
            <MessageCircle className="w-8 h-8 text-[#005CFF]" />
          </div>
          <div className="flex items-center gap-2">
            <Loader2 className="w-5 h-5 text-[#005CFF] animate-spin" />
            <span className="text-[#717680]">Reconnecting...</span>
          </div>
        </div>
      </div>
    );
  }

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
              <span className="text-[#005CFF]">powered by Web3</span>
            </h1>
            <p className="text-[#717680] text-lg">
              End-to-end encrypted conversations with anyone, anywhere.
              Connect your wallet to get started.
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

          {/* Login Method Toggle */}
          <div className="flex gap-2 mb-4">
            <button
              onClick={() => setLoginMethod('wallet')}
              className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl border transition-colors ${
                loginMethod === 'wallet'
                  ? 'bg-[#005CFF] text-white border-[#005CFF]'
                  : 'bg-white text-[#717680] border-gray-200 hover:border-[#005CFF]'
              }`}
            >
              <Wallet className="w-5 h-5" />
              <span className="font-medium">Browser Wallet</span>
            </button>
            <button
              onClick={() => setLoginMethod('qr')}
              className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl border transition-colors ${
                loginMethod === 'qr'
                  ? 'bg-[#005CFF] text-white border-[#005CFF]'
                  : 'bg-white text-[#717680] border-gray-200 hover:border-[#005CFF]'
              }`}
            >
              <Smartphone className="w-5 h-5" />
              <span className="font-medium">World App</span>
            </button>
          </div>

          {/* Login Content */}
          <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
            {loginMethod === 'wallet' ? (
              <ConnectWallet onConnect={() => router.push('/chat')} />
            ) : isQRLoggingIn ? (
              <div className="flex flex-col items-center gap-4 py-8">
                <Loader2 className="w-8 h-8 text-[#005CFF] animate-spin" />
                <p className="text-[#717680]">Setting up secure messaging...</p>
              </div>
            ) : (
              <QRLogin
                onSuccess={async (signer) => {
                  setIsQRLoggingIn(true);
                  try {
                    await initializeWithRemoteSigner(signer);
                    router.push('/chat');
                  } catch (error) {
                    console.error('QR login failed:', error);
                    setIsQRLoggingIn(false);
                  }
                }}
                onCancel={() => setLoginMethod('wallet')}
              />
            )}
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
