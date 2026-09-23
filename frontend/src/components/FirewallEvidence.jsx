import { describeFirewall } from '../lib/firewallCopy.js';
import { formatRelative } from '../lib/format.js';

/**
 * The Capital Firewall's comparison, made visible. Every field here already
 * exists on evaluateFirewall()'s return value (backend/src/core/marketGuard.js)
 * -- this is presentation, not a new computation.
 *
 * PYTH_PARITY compares a Pyth equity feed against Jupiter's executable price;
 * TOKEN_PREMIUM (PreStocks) compares the provider's own mark instead. Both
 * modes return the same shape, so one table serves both. Rows with nothing
 * real to show are skipped rather than displayed as an "unavailable" or
 * "not queried" placeholder.
 */
export default function FirewallEvidence({ evidence }) {
  if (!evidence || evidence.decision === 'NOT_REQUIRED' || evidence.outcome === 'NOT_REQUIRED') return null;
  const decision = evidence.decision ?? evidence.outcome;
  const pass = decision === 'PASS' || decision === 'PASSED';
  const bandLabel = evidence.minPremiumBps != null
    ? `${evidence.minPremiumBps} to +${evidence.maxPremiumBps} bps`
    : (evidence.maxPremiumBps != null ? `up to +${evidence.maxPremiumBps} bps` : null);

  return (
    <div className="receipt firewall-evidence">
      <div className="receipt-title">CAPITAL FIREWALL EVIDENCE</div>
      <Row k="Reference price" v={priceWithSource(evidence.referencePriceUsd, evidence.referenceSource)} />
      <Row k="Executable quote" v={priceWithSource(evidence.tokenPriceUsd, evidence.tokenSource)} />
      <Row k="Premium" v={evidence.premiumBps != null ? `${evidence.premiumBps} bps` : null} />
      <Row k="Policy band" v={bandLabel} />
      <Row k="Freshness" v={(evidence.observedAt || evidence.checkedAt) ? `checked ${formatRelative(evidence.observedAt || evidence.checkedAt)}` : null} />
      <hr />
      <Row
        k="Decision"
        v={pass ? 'PASS' : 'RETAIN'}
        className={pass ? 'preserved-yes' : 'warn'}
      />
      <div className={`notice ${pass ? 'ok' : 'warn'}`} style={{ marginTop: 10 }}>
        {describeFirewall(evidence)}
      </div>
    </div>
  );
}

function priceWithSource(priceUsd, source) {
  if (priceUsd == null && !source) return null;
  if (priceUsd == null) return source;
  return source ? `$${priceUsd} · ${source}` : `$${priceUsd}`;
}

function Row({ k, v, className = '' }) {
  if (v == null || v === '') return null;
  return (
    <div className="receipt-row">
      <span className="k">{k}</span>
      <span className={`v ${className}`}>{v}</span>
    </div>
  );
}
