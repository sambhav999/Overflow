import { describeFirewall } from '../lib/firewallCopy.js';

/**
 * The Capital Firewall's comparison, made visible. Every field here already
 * exists on evaluateFirewall()'s return value (backend/src/core/marketGuard.js)
 * -- this is presentation, not a new computation.
 *
 * PYTH_PARITY compares a Pyth equity feed against Jupiter's executable price;
 * TOKEN_PREMIUM (PreStocks) compares the provider's own mark instead. Both
 * modes return the same shape, so one table serves both.
 */
export default function FirewallEvidence({ evidence, symbol }) {
  if (!evidence || evidence.decision === 'NOT_REQUIRED' || evidence.outcome === 'NOT_REQUIRED') return null;
  const isPyth = evidence.mode === 'PYTH_PARITY';
  const decision = evidence.decision ?? evidence.outcome;
  const pass = decision === 'PASS' || decision === 'PASSED';
  const bandLabel = evidence.minPremiumBps != null
    ? `${evidence.minPremiumBps} to +${evidence.maxPremiumBps} bps`
    : `up to +${evidence.maxPremiumBps} bps`;

  return (
    <div className="receipt firewall-evidence">
      <div className="receipt-title">CAPITAL FIREWALL EVIDENCE</div>
      {isPyth ? (
        <>
          <Row k="Underlying Pyth feed" v={evidence.referenceSource ?? 'unavailable'} />
          <Row k="Token Pyth feed" v={`Crypto.${(symbol ?? '').toUpperCase()}/USD — not queried; priced by Jupiter instead`} muted />
        </>
      ) : (
        <>
          <Row k="Reference price" v={evidence.referenceSource ?? 'unavailable'} />
          <Row k="Token price source" v={evidence.tokenSource ?? 'unavailable'} />
        </>
      )}
      <Row k="Jupiter implied price" v={evidence.tokenPriceUsd ? `$${evidence.tokenPriceUsd}` : '—'} />
      <Row k="Allowed band" v={bandLabel} />
      <hr />
      <Row
        k="Decision"
        v={pass ? 'PASS' : 'RETAIN'}
        className={pass ? 'preserved-yes' : 'bad'}
      />
      <div className={`notice ${pass ? 'ok' : 'warn'}`} style={{ marginTop: 10 }}>
        {describeFirewall(evidence)}
      </div>
    </div>
  );
}

function Row({ k, v, className = '', muted = false }) {
  return (
    <div className="receipt-row">
      <span className="k">{k}</span>
      <span className={`v ${className}`} style={muted ? { color: 'var(--soft)', fontSize: 11 } : undefined}>{v}</span>
    </div>
  );
}
