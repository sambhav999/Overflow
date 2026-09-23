import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useWallet } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import { api, setSession, restoreSession, clearSession } from '../lib/api.js';
import { bytesToBase64 } from '../lib/bytes.js';
import { tagError, trace, traceError } from '../lib/trace.js';
import { shortAddress } from '../lib/format.js';
import { IconWallet, IconPower } from './icons.jsx';

/**
 * Connect (via wallet-adapter, any Wallet Standard wallet) and sign in as one
 * step. A cancelled or failed signature disconnects, so the header never
 * shows Sign in and Disconnect at the same time.
 */
export default function WalletBar({ connection, signedIn, onConnect, onSignedIn, onDisconnect }) {
  const { publicKey, connected, wallet, disconnect, signMessage } = useWallet();
  const { setVisible } = useWalletModal();
  const address = publicKey?.toBase58() || null;

  const [signing, setSigning] = useState(false);
  const [modal, setModal] = useState(null);
  const provingRef = useRef(false);

  const [sol, setSol] = useState(null);
  const [solError, setSolError] = useState(null);

  useEffect(() => {
    if (!connection?.address || !signedIn || connection?.demo) {
      setSol(null);
      setSolError(null);
      return undefined;
    }
    let cancelled = false;
    async function loadSol() {
      try {
        const overview = await api.walletOverview(connection.address);
        if (cancelled) return;
        setSolError(overview.balanceError || null);
        setSol(typeof overview.sol === 'number' ? overview.sol : null);
      } catch (err) {
        if (!cancelled) {
          setSol(null);
          setSolError(err.message);
        }
      }
    }
    loadSol();
    const id = setInterval(loadSol, 20_000);
    return () => { cancelled = true; clearInterval(id); };
  }, [connection?.address, signedIn]);

  async function prove(addr) {
    trace('signin:prove:start', { address: addr });
    let nonceRes;
    try {
      nonceRes = await api.authNonce(addr);
      trace('signin:nonce:ok', { nonce: nonceRes?.nonce, messageChars: nonceRes?.message?.length });
    } catch (err) {
      throw tagError(err, { stage: 'api-nonce', source: 'api' });
    }
    let signature;
    try {
      const sigBytes = await signMessage(new TextEncoder().encode(nonceRes.message));
      signature = bytesToBase64(sigBytes);
      trace('signin:signature:ok', { signatureChars: signature?.length });
    } catch (err) {
      throw tagError(err, { stage: 'wallet-sign', source: wallet?.adapter?.name?.toLowerCase() || 'wallet' });
    }
    try {
      const session = await api.authVerify(addr, nonceRes.nonce, signature);
      trace('signin:verify:ok', { wallet: session?.wallet, expiresAt: session?.expiresAt });
      setSession(session);
      onConnect({ address: addr, walletName: wallet?.adapter?.name || null });
      onSignedIn(session);
    } catch (err) {
      throw tagError(err, { stage: 'api-verify', source: 'api' });
    }
  }

  // Once wallet-adapter has connected a wallet, restore an existing session
  // or run sign-in-with-Solana. This is the one place a connected wallet
  // becomes an authenticated `connection` the rest of the app can trust.
  useEffect(() => {
    if (!connected || !address || signedIn || provingRef.current) return;
    provingRef.current = true;
    (async () => {
      const existing = restoreSession(address);
      if (existing) {
        trace('connect:restored-session', { wallet: existing.wallet, expiresAt: existing.expiresAt });
        onConnect({ address, walletName: wallet?.adapter?.name || null });
        onSignedIn(existing);
        return;
      }
      if (!signMessage) {
        setModal({
          missing: true,
          title: 'This wallet cannot sign in',
          message: `${wallet?.adapter?.name || 'This wallet'} cannot sign messages, so Overflow cannot verify it.`,
        });
        await disconnect().catch(() => {});
        return;
      }
      setSigning(true);
      try {
        await prove(address);
      } catch (err) {
        const dump = traceError('connect:fail', err);
        const message = err?.message || dump.message || String(err);
        const cancelled = /reject|denied|cancel|4001/i.test(message);
        if (!cancelled) {
          setModal({
            title: 'Could not sign in',
            message: 'Overflow could not verify this wallet. Try again in a moment.',
            steps: ['Keep your wallet unlocked on a Solana account.', 'Tap Try again and approve the sign-in message.'],
          });
        }
        await disconnect().catch(() => {});
        onDisconnect();
      } finally {
        setSigning(false);
      }
    })().finally(() => { provingRef.current = false; });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected, address, signedIn]);

  async function handleConnectClick() {
    trace('connect:click');
    setModal(null);
    setVisible(true);
  }

  async function handleDisconnect() {
    clearSession(connection?.address);
    try { await disconnect(); } catch { /* already gone */ }
    onDisconnect();
  }

  const walletModal = modal && createPortal(
    <div className="story-modal" role="dialog" aria-modal="true" aria-labelledby="wallet-modal-title">
      <button type="button" className="story-modal-backdrop" aria-label="Close" onClick={() => setModal(null)} />
      <div className="wallet-modal-card">
        <h2 id="wallet-modal-title">{modal.title}</h2>
        <p className="wallet-modal-copy">{modal.message}</p>
        {modal.steps?.length ? (
          <ol className="wallet-modal-steps">
            {modal.steps.map((step) => <li key={step}>{step}</li>)}
          </ol>
        ) : null}
        <div className="wallet-modal-actions">
          {!modal.missing && (
            <button type="button" className="btn primary" onClick={() => { setModal(null); setVisible(true); }}>
              Try again
            </button>
          )}
          <button type="button" className="btn ghost" onClick={() => setModal(null)}>Close</button>
        </div>
      </div>
    </div>,
    document.body,
  );

  if (connection?.demo && signedIn) {
    return (
      <div className="mast-right">
        <div className="wallet-chip demo">
          <span className="avatar"><IconWallet width={13} height={13} color="#fff" /></span>
          <span className="addr">Judge Demo</span>
        </div>
        <button className="btn ghost small wallet-connect-real" onClick={handleConnectClick}>
          Connect real wallet
        </button>
        {walletModal}
      </div>
    );
  }

  if (connection && signedIn) {
    const lowSol = typeof sol === 'number' && sol < 0.003;
    return (
      <div className="mast-right">
        <div className="wallet-chip">
          <span className="avatar"><IconWallet width={13} height={13} color="#fff" /></span>
          <span className="addr">{shortAddress(connection.address)}</span>
          <span className={`wallet-sol ${lowSol ? 'is-low' : ''}`} title={solError || 'SOL available to pay fees'}>
            {typeof sol === 'number' ? `${sol.toFixed(sol >= 1 ? 2 : 4)} SOL` : (solError ? 'SOL ?' : '…')}
          </span>
          <button className="disconnect-btn" onClick={handleDisconnect} title="Disconnect" aria-label="Disconnect wallet">
            <IconPower width={13} height={13} />
          </button>
        </div>
        {lowSol && (
          <div className="wallet-sol-warn" role="status">
            Not enough SOL for fees. Need about 0.003 SOL in this wallet.
          </div>
        )}
        {walletModal}
      </div>
    );
  }

  return (
    <div className="mast-right">
      <button className="btn primary" onClick={handleConnectClick} disabled={signing}>
        {signing ? <span className="spinner" /> : <IconWallet width={14} height={14} />}
        {signing ? 'Check your wallet…' : 'Connect wallet'}
      </button>
      {walletModal}
    </div>
  );
}
