import { useEffect, useState } from 'react';
import { formatRaw, formatUsd } from '../lib/format.js';
import PremiumGauge from './PremiumGauge.jsx';
import FirewallEvidence from './FirewallEvidence.jsx';

/**
 * Explain Before Signing.
 *
 * Everything here is already computed server-side by prepare/evaluate; this
 * just lays it out as one checklist immediately above the sign button, so
 * nothing about what's about to move, what stays protected, and what it
 * costs is left implicit in separate grids the user has to piece together.
 */
export default function ExplainBeforeSigning({ rule, summary, firewall, quote }) {
  const [, forceTick] = useState(0);
  useEffect(() => {
    if (!quote?.quotedAt) return undefined;
    const id = setInterval(() => forceTick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [quote?.quotedAt]);

  if (!summary && !quote) return null;

  const decision = firewall?.decision ?? 'NOT_REQUIRED';
  const blocked = decision === 'BLOCK';
  const fmt = (v) => (summary?.unit === 'USD' ? formatUsd(v) : `${formatRaw(v, rule.sourceDecimals ?? 8, 6)} ${summary?.symbol ?? ''}`);

  return (
    <div className="explain-panel">
      <div className="explain-title">Explain before signing</div>

      {summary && (
        <div className="rule-meta" style={{ marginTop: 0, paddingTop: 0, borderTop: 'none' }}>
          <div><div className="meta-k">Protected floor</div><div className="meta-v money locked">{fmt(summary.protectedFloor)}</div></div>
          <div><div className="meta-k">Eligible earnings</div><div className="meta-v money preserved-yes">{fmt(summary.eligibleEarnings)}</div></div>
          <div><div className="meta-k">Total position</div><div className="meta-v money">{fmt(summary.totalPosition)}</div></div>
        </div>
      )}

      {firewall && decision !== 'NOT_REQUIRED' && (
        <div style={{ marginTop: 12 }}>
          <PremiumGauge premiumBps={firewall.premiumBps} maxPremiumBps={firewall.maxPremiumBps}
                        minPremiumBps={firewall.minPremiumBps} decision={decision} />
          <FirewallEvidence evidence={firewall} symbol={rule.destinationSymbol} />
        </div>
      )}

      <div className="rule-meta">
        <div><div className="meta-k">Max slippage</div><div className="meta-v money">{rule.maxSlippageBps} bps</div></div>
        <div><div className="meta-k">Route</div><div className="meta-v">{(quote?.routePlan || []).map((r) => r.label).join(' → ') || '—'}</div></div>
        <div>
          <div className="meta-k">Quote fetched</div>
          <div className="meta-v">{quote?.quotedAt ? `${secondsAgo(quote.quotedAt)}s ago` : '—'}</div>
        </div>
      </div>

      <div className={`verdict verdict-${blocked ? 'FAILED' : 'VERIFIED_ON_CHAIN'}`} style={{ marginTop: 12 }}>
        {blocked ? '✕ WOULD BLOCK' : '✓ PASSES CAPITAL FIREWALL'}
      </div>
    </div>
  );
}

function secondsAgo(iso) {
  return Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
}
