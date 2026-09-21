import { formatRaw, formatUsd } from '../lib/format.js';

/**
 * Capital Firewall summary: total position, protected floor, and routable
 * earnings together in one place. The three numbers already exist separately
 * across the app (PrincipalFlow, ExposureBar); this is the one spot they sit
 * side by side regardless of rule type.
 */
export default function FirewallSummary({ rule, summary }) {
  if (!summary) return null;
  const fmt = (v) => (summary.unit === 'USD'
    ? formatUsd(v)
    : `${formatRaw(v, rule.sourceDecimals ?? 8, 6)} ${summary.symbol ?? ''}`);

  return (
    <div className="firewall-summary">
      <div className="firewall-summary-label">Capital Firewall</div>
      <div className="proof-strip">
        <div className="proof-box">
          <div className="k">Total position</div>
          <div className="v">{fmt(summary.totalPosition)}</div>
        </div>
        <div className="proof-box good">
          <div className="k">Protected floor</div>
          <div className="v">{fmt(summary.protectedFloor)}</div>
        </div>
        <div className="proof-box">
          <div className="k">Routable earnings</div>
          <div className="v equity">{fmt(summary.eligibleEarnings)}</div>
        </div>
      </div>
    </div>
  );
}
