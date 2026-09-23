import { useMemo } from 'react';
import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react';
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui';
import { clusterApiUrl } from '@solana/web3.js';

/**
 * Wallet Standard wallets (Phantom, Solflare, Backpack...) register themselves
 * automatically with @solana/wallet-adapter-react -- no explicit adapter list
 * needed, so `wallets={[]}` below is intentional, not a placeholder.
 */
export default function WalletContextProvider({ children }) {
  const cluster = import.meta.env.VITE_SOLANA_CLUSTER === 'devnet' ? 'devnet' : 'mainnet-beta';
  const endpoint = useMemo(() => clusterApiUrl(cluster), [cluster]);

  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={[]} autoConnect>
        <WalletModalProvider>{children}</WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}
