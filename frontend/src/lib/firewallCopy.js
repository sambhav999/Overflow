/**
 * Translates backend reason/breach codes and verification states into the
 * product's own language. A blocked route is a decision the Capital Firewall
 * made on purpose, not an application failure -- it should never read like one.
 */

/**
 * @param {object} evidence  Anything shaped like evaluateFirewall()'s return
 *   value or a policy_decisions row's evidence_json: { decision|outcome,
 *   breach, maxPremiumBps, minPremiumBps, reason }.
 */
export function describeFirewall(evidence = {}) {
  const decision = evidence.decision ?? evidence.outcome;
  if (decision === 'PASS' || decision === 'PASSED') {
    return 'Price is inside policy. Route approved.';
  }
  if (decision === 'NOT_REQUIRED') {
    return 'No price policy on this rule.';
  }
  switch (evidence.breach) {
    case 'ABOVE_MAX': {
      const pct = evidence.maxPremiumBps != null ? (Number(evidence.maxPremiumBps) / 100).toFixed(2) : null;
      return pct
        ? `Retain earnings — quote exceeds your ${pct}% premium limit.`
        : 'Retain earnings — quote exceeds your premium limit.';
    }
    case 'BELOW_MIN':
      return 'Retain earnings — price is below your policy floor.';
    case 'NO_EVIDENCE':
      return 'Retain earnings — market evidence is stale.';
    default:
      return 'Retain earnings — price outside policy.';
  }
}

/**
 * @param {object} receipt  A receipt row: { status, verification }.
 */
export function describeVerification(receipt = {}) {
  if (receipt.status !== 'CONFIRMED') {
    return { label: 'Not executed', tone: '' };
  }
  if (receipt.verification === 'SEEDED') {
    return { label: 'SEEDED / DEMO — not a live proof', tone: 'warn' };
  }
  if (receipt.verification === 'VERIFIED_ON_CHAIN') {
    return { label: '$0.00 ✓ verified on devnet', tone: 'preserved-yes' };
  }
  if (receipt.verification === 'FAILED') {
    return { label: 'Preservation check failed', tone: 'bad' };
  }
  return { label: 'Awaiting preservation verification', tone: 'warn' };
}

/** The pre-sign / confirmed-but-not-yet-verified line Task 8 specifies. */
export const VERIFYING_ONCHAIN_NOTICE = 'Transaction confirmed. Overflow is verifying source preservation onchain.';
