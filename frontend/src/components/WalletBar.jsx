import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  listSolanaWallets,
  onWalletsChanged,
  connectPhantom,
  restorePhantomIfTrusted,
  disconnectWallet,
  signMessageBase64,
  supportsSignMessage,
  explainPhantomConnectError,
  isInternalConnectError,
  PHANTOM_CONNECT_EVENT,
} from '../lib/wallet.js';
import { api, setSession, restoreSession, clearSession } from '../lib/api.js';
import { tagError, trace, traceError } from '../lib/trace.js';
import { shortAddress } from '../lib/format.js';
import { IconWallet, IconPower } from './icons.jsx';

/**
 * Connect and sign in as one step. A cancelled signature disconnects so the
 * header never shows Sign in and Disconnect at the same time. Phantom is the
 * only wallet this bar offers; there is no picker.
 */
export default function WalletBar({ connection, signedIn, onConnect, onSignedIn, onDisconnect }) {
  const [, setWallets] = useState(() => listSolanaWallets());
  const [busy, setBusy] = useState(null);
  const [modal, setModal] = useState(null);
  const connectRef = useRef(null);
  const restoreRef = useRef(false);
  const signedInRef = useRef(signedIn);
  const onConnectRef = useRef(onConnect);
  const onSignedInRef = useRef(onSignedIn);
  signedInRef.current = signedIn;
  onConnectRef.current = onConnect;
  onSignedInRef.current = onSignedIn;

  const [sol, setSol] = useState(null);
  const [solError, setSolError] = useState(null);

  useEffect(() => {
    if (!connection?.address || !signedIn) {
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

  useEffect(() => onWalletsChanged(() => setWallets(listSolanaWallets())), []);

  useEffect(() => {
    const refresh = () => setWallets(listSolanaWallets());
    const id = setInterval(refresh, 400);
    const stop = setTimeout(() => clearInterval(id), 5000);
    window.addEventListener('focus', refresh);
    return () => {
      clearInterval(id);
      clearTimeout(stop);
      window.removeEventListener('focus', refresh);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function silentRestore() {
      if (restoreRef.current || cancelled || signedInRef.current) return;
      const conn = await restorePhantomIfTrusted();
      if (cancelled || !conn) return;
      const existing = restoreSession(conn.address);
      if (!existing) return;
      restoreRef.current = true;
      trace('connect:silent-restore', { address: conn.address, expiresAt: existing.expiresAt });
      onConnectRef.current(conn);
      onSignedInRef.current(existing);
    }
    silentRestore();
    const id = setInterval(silentRestore, 500);
    const stop = setTimeout(() => clearInterval(id), 6000);
    window.addEventListener('focus', silentRestore);
    window.addEventListener('phantom#initialized', silentRestore);
    return () => {
      cancelled = true;
      clearInterval(id);
      clearTimeout(stop);
      window.removeEventListener('focus', silentRestore);
      window.removeEventListener('phantom#initialized', silentRestore);
    };
  }, []);

  async function prove(conn) {
    trace('signin:prove:start', { address: conn.address });
    let nonceRes;
    try {
      nonceRes = await api.authNonce(conn.address);
      trace('signin:nonce:ok', { nonce: nonceRes?.nonce, messageChars: nonceRes?.message?.length });
    } catch (err) {
      throw tagError(err, { stage: 'api-nonce', source: 'api' });
    }
    let signature;
    try {
      signature = await signMessageBase64({ wallet: conn.wallet, account: conn.account, message: nonceRes.message });
      trace('signin:signature:ok', { signatureChars: signature?.length });
    } catch (err) {
      throw tagError(err, { stage: 'wallet-sign', source: 'phantom' });
    }
    try {
      const session = await api.authVerify(conn.address, nonceRes.nonce, signature);
      trace('signin:verify:ok', { wallet: session?.wallet, expiresAt: session?.expiresAt });
      setSession(session);
      restoreRef.current = true;
      onConnect(conn);
      onSignedIn(session);
    } catch (err) {
      throw tagError(err, { stage: 'api-verify', source: 'api' });
    }
  }

  async function handleConnect() {
    trace('connect:click');
    const pending = connectPhantom();
    setBusy('connect');
    setModal(null);
    let wallet = null;
    try {
      const conn = await pending;
      wallet = conn.wallet;
      trace('connect:wallet-ok', { address: conn.address, walletName: wallet?.name });
      const existing = restoreSession(conn.address);
      if (existing) {
        trace('connect:restored-session', { wallet: existing.wallet, expiresAt: existing.expiresAt });
        restoreRef.current = true;
        onConnect(conn);
        onSignedIn(existing);
        return;
      }
      if (!supportsSignMessage(wallet)) {
        await disconnectWallet(wallet);
        setModal({
          missing: true,
          title: 'Phantom cannot sign in',
          message: 'This Phantom build cannot sign messages, so Overflow cannot verify the wallet.',
        });
        return;
      }
      setBusy('sign');
      await prove(conn);
    } catch (err) {
      const dump = traceError('connect:fail', err);
      const phantomCrash = isInternalConnectError(err);
      if (!phantomCrash) {
        try { if (wallet) await disconnectWallet(wallet); } catch (disconnectErr) {
          traceError('connect:disconnect-after-fail', disconnectErr);
        }
      }
      const message = err?.message || dump.message || String(err);
      const cancelled = /reject|denied|cancel|4001/i.test(message);
      if (cancelled) {
        trace('connect:cancelled');
        onDisconnect();
        return;
      }
      const missing = err?.code === 'PHANTOM_MISSING'
        || message === 'PHANTOM_MISSING'
        || /not available|no provider|not found|not installed/i.test(message);
      const explained = explainPhantomConnectError(err);
      setModal(missing
        ? {
          missing: true,
          title: 'Phantom is not in this browser',
          message: 'Install Phantom, or continue in the Phantom app.',
        }
        : {
          title: explained?.title || 'Could not connect',
          message: explained?.message || 'Phantom did not finish connecting. Try again.',
          hint: explained?.hint,
          steps: explained?.steps,
        });
      onDisconnect();
    } finally {
      setBusy(null);
    }
  }

  connectRef.current = handleConnect;

  useEffect(() => {
    function onRequest() {
      connectRef.current?.();
    }
    window.addEventListener(PHANTOM_CONNECT_EVENT, onRequest);
    return () => window.removeEventListener(PHANTOM_CONNECT_EVENT, onRequest);
  }, []);

  async function handleDisconnect() {
    restoreRef.current = false;
    if (connection?.wallet) await disconnectWallet(connection.wallet);
    clearSession(connection?.address);
    onDisconnect();
  }

  const walletModal = modal && createPortal(
    <div className="story-modal" role="dialog" aria-modal="true" aria-labelledby="phantom-modal-title">
      <button type="button" className="story-modal-backdrop" aria-label="Close" onClick={() => setModal(null)} />
      <div className="wallet-modal-card">
        <h2 id="phantom-modal-title">{modal.title || (modal.missing ? 'Phantom is not in this browser' : 'Could not connect')}</h2>
        <p className="wallet-modal-copy">{modal.message}</p>
        {modal.steps?.length ? (
          <ol className="wallet-modal-steps">
            {modal.steps.map((step) => <li key={step}>{step}</li>)}
          </ol>
        ) : null}
        {modal.hint && <p className="wallet-modal-hint">{modal.hint}</p>}
        <div className="wallet-modal-actions">
          {modal.missing && (
            <a className="btn primary" href="https://phantom.app/download" target="_blank" rel="noreferrer">
              Install Phantom
            </a>
          )}
          {!modal.missing && (
            <button type="button" className="btn primary" onClick={() => { setModal(null); connectRef.current?.(); }}>
              Try again
            </button>
          )}
          <a
            className="btn ghost"
            href={`https://phantom.app/ul/browse/${encodeURIComponent(window.location.href)}`}
            target="_blank"
            rel="noreferrer"
          >
            Open in Phantom
          </a>
          <button type="button" className="btn ghost" onClick={() => setModal(null)}>Close</button>
        </div>
      </div>
    </div>,
    document.body,
  );

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
            Not enough SOL for fees. Need about 0.003 SOL in this Phantom wallet.
          </div>
        )}
        {walletModal}
      </div>
    );
  }

  return (
    <div className="mast-right">
      <button className="btn primary" onClick={handleConnect} disabled={Boolean(busy)}>
        {busy ? <span className="spinner" /> : <IconWallet width={14} height={14} />}
        {busy === 'connect' ? 'Connecting…' : busy === 'sign' ? 'Check your wallet…' : 'Connect Phantom'}
      </button>
      {walletModal}
    </div>
  );
}
