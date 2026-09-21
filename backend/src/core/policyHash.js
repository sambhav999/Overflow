/**
 * Policy freeze.
 *
 * A rule's guard fields (premium band, floor, slippage, destination...) are
 * mutable via PATCH /rules/:id at any time, including between an execution's
 * prepare and submit steps. This hash lets submit refuse to act on a rule
 * that changed out from under the intent it prepared, the same way the
 * existing message-hash check refuses a transaction that changed underneath
 * it -- fail closed rather than silently executing against a stale review.
 */
import { createHash } from 'node:crypto';

const GUARD_FIELDS = [
  'marketGuardMode',
  'minPremiumBps',
  'maxPremiumBps',
  'minExecutionUsdAtomic',
  'maxSlippageBps',
  'maxPriceImpactBps',
  'principalFloorAtomic',
  'allowOvernight',
  'destinationMint',
];

/** SHA-256 hex digest of the rule's current guard configuration. */
export function computePolicyHash(rule) {
  const snapshot = Object.fromEntries(GUARD_FIELDS.map((k) => [k, rule[k] ?? null]));
  return createHash('sha256').update(JSON.stringify(snapshot)).digest('hex');
}
