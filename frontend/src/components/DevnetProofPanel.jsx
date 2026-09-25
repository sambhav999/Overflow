import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { explorerUrl, shortAddress, formatRelative } from '../lib/format.js';
import ProofBadges from './ProofBadges.jsx';

const solscanAccount = (address) => `https://solscan.io/account/${address}?cluster=devnet`;

/**
 * Bottom of the home page: the Judge Demo's devnet transactions, re-checked
 * live against Solana devnet on every load (GET /devnet/proof), plus the judge
 * wallet's current balances -- so anyone can confirm the money movement is
 * real without leaving the page.
 */
export default function DevnetProofPanel() {
  const [proof, setProof] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let alive = true;
    api.devnetProof()
      .then((p) => { if (alive) setProof(p); })
      .catch((err) => { if (alive) setError(err.message); });
    return () => { alive = false; };
  }, []);

  return (
    <section className="devnet-panel">
      <div className="section-head">
        <div>
          <div className="section-title">On-chain proof · Solana devnet</div>
          <p className="page-lead">
            Every transaction behind the demo, re-checked live on devnet when this page loads.
            Only 186.40 TEST USDC moved; the 10,000 TEST USDC principal is read back untouched.
          </p>
        </div>
      </div>

      <div className="card devnet-card">
        <ProofBadges />
        {error && <div className="notice bad" style={{ marginTop: 12 }}>Could not reach devnet: {error}</div>}
        {!proof && !error && <div className="hint" style={{ marginTop: 12 }}>Checking Solana devnet…</div>}
        {proof && (
          <>
            <div className="devnet-balances">
              <div>
                <span className="k">Judge wallet · TEST USDC</span>
                <span className={`v ${proof.balances.principalUntouched ? 'preserved-yes' : 'bad'}`}>
                  {Number(proof.balances.testUsdc).toLocaleString()} {proof.balances.principalUntouched ? '✓ untouched' : '✕ changed'}
                </span>
              </div>
              <div>
                <span className="k">Judge wallet · OAIx-DEMO</span>
                <span className="v equity">{proof.balances.oaixDemo}</span>
              </div>
              <div>
                <span className="k">Transactions</span>
                <span className={`v ${proof.allConfirmed ? 'preserved-yes' : 'warn'}`}>
                  {proof.transactions.filter((t) => t.ok).length}/{proof.transactions.length} confirmed
                </span>
              </div>
            </div>

            <div className="devnet-tx-list">
              {proof.transactions.map((t) => (
                <div className="receipt-row" key={t.signature}>
                  <span className="k">{t.label}</span>
                  <span className="v">
                    <span className={`devnet-status ${t.ok ? 'ok' : 'no'}`}>{t.ok ? `✓ ${t.status}` : t.status}</span>
                    <a href={explorerUrl(t.signature)} target="_blank" rel="noreferrer">{shortAddress(t.signature, 6)} ↗</a>
                  </span>
                </div>
              ))}
            </div>

            <div className="hint" style={{ marginTop: 10 }}>
              Judge wallet <a href={solscanAccount(proof.judgeUser)} target="_blank" rel="noreferrer">{shortAddress(proof.judgeUser, 6)} ↗</a>
              {' · '}Settled via {proof.adapter} (deterministic market input, not the production PreStocks contract)
              {' · '}checked {formatRelative(proof.checkedAt)}
            </div>
          </>
        )}
      </div>
    </section>
  );
}
