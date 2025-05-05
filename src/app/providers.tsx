"use client";

import * as React from "react";
import { RainbowKitProvider, getDefaultConfig } from "@rainbow-me/rainbowkit";
import { avalanche, baseSepolia, sepolia } from "wagmi/chains";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider } from "wagmi";

const config = getDefaultConfig({
  appName: "JKPT",
  projectId: "ed3488dca46e90854aad49512f12974f",
  chains: [
    {
      ...sepolia,
      rpcUrls: {
        default: { http: ['https://ethereum-sepolia-rpc.publicnode.com'] },
        public: { http: ['https://endpoints.omniatech.io/v1/eth/sepolia/public'] }
      }
    },
    avalanche
  ],
  ssr: true,
});

const queryClient = new QueryClient();

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider>{children}</RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
