'use client';

import { ReactNode, useState } from 'react';
import { WagmiProvider as WagmiConfigProvider } from 'wagmi';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { wagmiConfig } from '@/lib/wagmi/config';

interface WagmiProviderProps {
  children: ReactNode;
}

export function WagmiProvider({ children }: WagmiProviderProps) {
  // Create a new QueryClient for each session to avoid hydration issues
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // Don't refetch on window focus in development
            refetchOnWindowFocus: false,
            // Retry failed requests once
            retry: 1,
            // Cache for 5 minutes
            staleTime: 5 * 60 * 1000,
          },
        },
      })
  );

  return (
    <WagmiConfigProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    </WagmiConfigProvider>
  );
}
