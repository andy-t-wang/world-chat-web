/**
 * Wagmi Configuration
 * Sets up wallet connectors for browser wallets
 */

import { http, createConfig, createStorage } from 'wagmi';
import { mainnet, optimism, base, worldchain } from 'wagmi/chains';
import { injected, coinbaseWallet, walletConnect } from 'wagmi/connectors';

// WalletConnect project ID - in production, use environment variable
const WALLETCONNECT_PROJECT_ID = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || '';

export const wagmiConfig = createConfig({
  chains: [worldchain, mainnet, optimism, base],
  connectors: [
    // Browser extension wallets (MetaMask, Rabby, etc.)
    injected({
      shimDisconnect: true,
    }),
    // Coinbase Wallet
    coinbaseWallet({
      appName: 'World Chat',
      appLogoUrl: 'https://worldcoin.org/icons/logo-small.svg',
    }),
    // WalletConnect for mobile wallets
    ...(WALLETCONNECT_PROJECT_ID
      ? [
          walletConnect({
            projectId: WALLETCONNECT_PROJECT_ID,
            showQrModal: true,
            metadata: {
              name: 'World Chat',
              description: 'End-to-end encrypted messaging',
              url: 'https://worldchat.app',
              icons: ['https://worldcoin.org/icons/logo-small.svg'],
            },
          }),
        ]
      : []),
  ],
  transports: {
    [worldchain.id]: http(),
    [mainnet.id]: http(),
    [optimism.id]: http(),
    [base.id]: http(),
  },
  // Persist connection state to localStorage for instant reconnection
  storage: createStorage({
    storage: typeof window !== 'undefined' ? window.localStorage : undefined,
    key: 'wagmi-state',
  }),
  ssr: true,
});

// Export chain for convenience
export { worldchain, mainnet, optimism, base };
