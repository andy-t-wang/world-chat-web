'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAccount } from 'wagmi';
import { ConnectWallet } from '@/components/auth/ConnectWallet';
import { MessageCircle, Shield, Zap } from 'lucide-react';

export default function Home() {
  const router = useRouter();
  const { isConnected } = useAccount();

  // Redirect to chat when connected
  useEffect(() => {
    if (isConnected) {
      router.push('/chat');
    }
  }, [isConnected, router]);

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

          {/* Connect Wallet */}
          <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
            <ConnectWallet onConnect={() => router.push('/chat')} />
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
