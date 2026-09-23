/**
 * Tracks the last time a live xStocks API call actually succeeded, so /health
 * can surface staleness instead of a judge silently hitting a dead dependency.
 * In-memory only -- resets on restart, same as everything else in this process.
 */
let lastSuccessAt = null;

export function recordXstocksSuccess() {
  lastSuccessAt = new Date().toISOString();
}

export function lastXstocksSuccess() {
  return lastSuccessAt;
}
