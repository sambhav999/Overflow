/**
 * User-facing status framing. The backend keeps its own reason vocabulary
 * (BLOCKED, IMPLAUSIBLE_DIVIDEND_SIZE, FIREWALL_BLOCKED, ...) -- this is only
 * about how a BLOCKED evaluation reads to a judge: protection working is
 * calm and expected, so it reads RETAIN, not an alarming red BLOCKED. Red is
 * reserved for the cases that actually are a technical failure.
 */

const TECHNICAL_FAILURE = /could not be read|could not fetch|read failed|unreachable|rpc error|network error|failed to fetch/i;

/** True only for genuine technical failures: a read/network problem, not a policy decision. */
export function isTechnicalFailure(reason) {
  return TECHNICAL_FAILURE.test(String(reason || ''));
}

// Reason-text signals for a BLOCKED result that is specifically a protection
// decision (a corporate action refused, source preservation refused, an
// implausible dividend size, a firewall retain) rather than an
// administrative state (paused, not configured, already executed).
const PROTECTION_WORKED = /split|stock split|implausible|preserv|firewall|impaired|retain/i;

/** The word a status badge should show for a rule's evaluation status. */
export function statusBadgeText(status, reason) {
  if (status === 'BLOCKED' && !isTechnicalFailure(reason) && PROTECTION_WORKED.test(String(reason || ''))) {
    return 'RETAIN';
  }
  return status;
}

/** CSS modifier class added on top of status-BLOCKED for a genuine failure. */
export function statusBadgeClass(status, reason) {
  return status === 'BLOCKED' && isTechnicalFailure(reason) ? 'technical-failure' : '';
}
