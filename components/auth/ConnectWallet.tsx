'use client';

import { useConnect, useAccount, useDisconnect } from 'wagmi';
import { Wallet, Loader2, ChevronRight, LogOut } from 'lucide-react';

interface ConnectWalletProps {
  onConnect?: () => void;
}

export function ConnectWallet({ onConnect }: ConnectWalletProps) {
  const { connectors, connect, isPending, error } = useConnect();
  const { isConnected, address } = useAccount();
  const { disconnect } = useDisconnect();

  // If already connected, show disconnect option
  if (isConnected && address) {
    return (
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-3 p-4 bg-green-50 rounded-xl border border-green-200">
          <div className="w-10 h-10 rounded-full bg-green-500 flex items-center justify-center">
            <Wallet className="w-5 h-5 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-green-800">Connected</p>
            <p className="text-xs text-green-600 truncate font-mono">
              {address.slice(0, 6)}...{address.slice(-4)}
            </p>
          </div>
          <button
            onClick={() => disconnect()}
            className="p-2 hover:bg-green-100 rounded-lg transition-colors"
            title="Disconnect"
          >
            <LogOut className="w-5 h-5 text-green-700" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold text-[#181818] mb-2">
        Connect your wallet
      </h2>

      {connectors.map((connector) => (
        <button
          key={connector.uid}
          onClick={() => {
            connect(
              { connector },
              {
                onSuccess: () => {
                  onConnect?.();
                },
              }
            );
          }}
          disabled={isPending}
          className="flex items-center gap-3 w-full p-4 bg-white hover:bg-gray-50
                     active:bg-gray-100 rounded-xl border border-gray-200
                     transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center">
            <ConnectorIcon name={connector.name} />
          </div>
          <div className="flex-1 text-left">
            <p className="text-[15px] font-medium text-[#181818]">
              {connector.name}
            </p>
            <p className="text-[13px] text-[#717680]">
              {getConnectorDescription(connector.name)}
            </p>
          </div>
          {isPending ? (
            <Loader2 className="w-5 h-5 text-[#005CFF] animate-spin" />
          ) : (
            <ChevronRight className="w-5 h-5 text-[#9BA3AE]" />
          )}
        </button>
      ))}

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-sm text-red-600">{error.message}</p>
        </div>
      )}

      <p className="text-xs text-[#9BA3AE] text-center mt-2">
        By connecting, you agree to our Terms of Service
      </p>
    </div>
  );
}

function ConnectorIcon({ name }: { name: string }) {
  // Simple icon based on connector name
  const lowerName = name.toLowerCase();

  if (lowerName.includes('metamask')) {
    return (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
        <path d="M21.5 3L13.5 9L15 5.5L21.5 3Z" fill="#E17726" stroke="#E17726" strokeWidth="0.5"/>
        <path d="M2.5 3L10.4 9.1L9 5.5L2.5 3Z" fill="#E27625" stroke="#E27625" strokeWidth="0.5"/>
        <path d="M18.5 16.5L16.5 20L21 21.5L22 16.6L18.5 16.5Z" fill="#E27625" stroke="#E27625" strokeWidth="0.5"/>
        <path d="M2 16.6L3 21.5L7.5 20L5.5 16.5L2 16.6Z" fill="#E27625" stroke="#E27625" strokeWidth="0.5"/>
        <path d="M7.3 10.5L6 12.5L10.5 12.7L10.3 8L7.3 10.5Z" fill="#E27625" stroke="#E27625" strokeWidth="0.5"/>
        <path d="M16.7 10.5L13.6 7.9L13.5 12.7L18 12.5L16.7 10.5Z" fill="#E27625" stroke="#E27625" strokeWidth="0.5"/>
        <path d="M7.5 20L10.2 18.5L7.9 16.6L7.5 20Z" fill="#E27625" stroke="#E27625" strokeWidth="0.5"/>
        <path d="M13.8 18.5L16.5 20L16.1 16.6L13.8 18.5Z" fill="#E27625" stroke="#E27625" strokeWidth="0.5"/>
      </svg>
    );
  }

  if (lowerName.includes('coinbase')) {
    return (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
        <rect width="24" height="24" rx="6" fill="#0052FF"/>
        <path d="M12 4C7.6 4 4 7.6 4 12C4 16.4 7.6 20 12 20C16.4 20 20 16.4 20 12C20 7.6 16.4 4 12 4ZM14.5 14.5H9.5V9.5H14.5V14.5Z" fill="white"/>
      </svg>
    );
  }

  if (lowerName.includes('walletconnect')) {
    return (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
        <path d="M6.6 8.4C9.6 5.4 14.4 5.4 17.4 8.4L17.8 8.8C17.9 8.9 17.9 9.1 17.8 9.2L16.5 10.5C16.45 10.55 16.35 10.55 16.3 10.5L15.8 10C13.7 7.9 10.3 7.9 8.2 10L7.7 10.5C7.65 10.55 7.55 10.55 7.5 10.5L6.2 9.2C6.1 9.1 6.1 8.9 6.2 8.8L6.6 8.4ZM19.8 10.8L21 12C21.1 12.1 21.1 12.3 21 12.4L16.2 17.2C16.1 17.3 15.9 17.3 15.8 17.2L12.4 13.8C12.375 13.775 12.325 13.775 12.3 13.8L8.9 17.2C8.8 17.3 8.6 17.3 8.5 17.2L3.7 12.4C3.6 12.3 3.6 12.1 3.7 12L4.9 10.8C5 10.7 5.2 10.7 5.3 10.8L8.7 14.2C8.725 14.225 8.775 14.225 8.8 14.2L12.2 10.8C12.3 10.7 12.5 10.7 12.6 10.8L16 14.2C16.025 14.225 16.075 14.225 16.1 14.2L19.5 10.8C19.6 10.7 19.7 10.7 19.8 10.8Z" fill="#3B99FC"/>
      </svg>
    );
  }

  // Default wallet icon
  return <Wallet className="w-5 h-5 text-[#717680]" />;
}

function getConnectorDescription(name: string): string {
  const lowerName = name.toLowerCase();

  if (lowerName.includes('metamask')) {
    return 'Connect with MetaMask extension';
  }
  if (lowerName.includes('coinbase')) {
    return 'Connect with Coinbase Wallet';
  }
  if (lowerName.includes('walletconnect')) {
    return 'Scan with your mobile wallet';
  }
  if (lowerName.includes('injected')) {
    return 'Connect with browser wallet';
  }

  return 'Connect your wallet';
}
