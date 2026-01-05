// lib/wagmi.ts
// Central wagmi configuration for wallet + chain.
// We keep Sepolia only for this project to avoid accidental mainnet usage.

import { http, createConfig } from "wagmi";
import { sepolia } from "wagmi/chains";
import { injected } from "wagmi/connectors";

export const wagmiConfig = createConfig({
  // MetaMask uses the injected connector
  connectors: [injected()],

  // Supported chain(s)
  chains: [sepolia],

  // RPC transport (browser reads can use this),
  // but heavy reads should go through the backend indexer.
  transports: {
    [sepolia.id]: http(),
  },
});
