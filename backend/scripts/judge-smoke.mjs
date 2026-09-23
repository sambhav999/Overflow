#!/usr/bin/env node
/**
 * Smoke test against a running public Judge Demo API -- not the source, the
 * actual deployed HTTP surface a judge's browser will hit. Run after every
 * deploy, before recording anything, from an incognito-equivalent state
 * (no assumptions about a prior session).
 *
 * Usage: SMOKE_URL=https://solana-poc.onrender.com/api npm run judge:smoke
 * Defaults to http://localhost:8787/api.
 */
const BASE = (process.env.SMOKE_URL || 'http://localhost:8787/api').replace(/\/$/, '');
let failures = 0;
const pass = (l, d = '') => console.log(`  PASS  ${l}${d ? ` — ${d}` : ''}`);
const fail = (l, d = '') => { console.log(`  FAIL  ${l}${d ? ` — ${d}` : ''}`); failures += 1; };

async function get(path, headers = {}) {
  const res = await fetch(`${BASE}${path}`, { headers });
  let body = null;
  try { body = await res.json(); } catch { /* non-JSON */ }
  return { status: res.status, body };
}
async function post(path, payload = {}, headers = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(payload),
  });
  let body = null;
  try { body = await res.json(); } catch { /* non-JSON */ }
  return { status: res.status, body };
}

console.log(`\nOverflow judge:smoke — ${BASE}\n`);

// --- health ---
const health = await get('/health').catch((e) => ({ status: 0, body: { error: e.message } }));
health.status === 200 ? pass('GET /health -> 200') : fail('GET /health -> 200', `got ${health.status}`);
health.body?.demoMode === true ? pass('demoMode is true') : fail('demoMode is true', JSON.stringify(health.body?.demoMode));
health.body?.network !== 'mainnet-beta' ? pass('no mainnet config', `network=${health.body?.network}`) : fail('no mainnet config', 'network is mainnet-beta');
(health.body?.seeded?.rules ?? 0) >= 2 ? pass('seed data present', `${health.body.seeded.rules} rules`) : fail('seed data present', JSON.stringify(health.body?.seeded));

// --- demo session ---
const session = await get('/demo/session').catch((e) => ({ status: 0, body: { error: e.message } }));
session.status === 200 ? pass('GET /demo/session -> 200') : fail('GET /demo/session -> 200', `got ${session.status}`);
const token = session.body?.token;
token ? pass('demo session issues a token') : fail('demo session issues a token');
const auth = token ? { authorization: `Bearer ${token}` } : {};

// --- seeded labels: never VERIFIED_ON_CHAIN ---
const receipts = await get('/receipts', auth).catch((e) => ({ status: 0, body: { error: e.message } }));
const list = receipts.body?.receipts || [];
list.length > 0 ? pass('seeded receipts present', `${list.length} receipts`) : fail('seeded receipts present');
const mislabeled = list.filter((r) => r.verification === 'VERIFIED_ON_CHAIN');
mislabeled.length === 0
  ? pass('seeded receipts never claim VERIFIED_ON_CHAIN')
  : fail('seeded receipts never claim VERIFIED_ON_CHAIN', `${mislabeled.length} row(s) mislabeled`);
const correctlyLabeled = list.filter((r) => r.verification === 'SEEDED');
correctlyLabeled.length === list.length
  ? pass('seeded receipts are labeled SEEDED')
  : fail('seeded receipts are labeled SEEDED', `${list.length - correctlyLabeled.length} row(s) not labeled SEEDED`);

// --- Story B: KLACx 10:1 split blocks through the real classification path ---
const events = await get('/replay/KLACx/events').catch((e) => ({ status: 0, body: { error: e.message } }));
const splitEvent = (events.body?.events || []).find((e) => e.eventType === 'SPLIT' || /split/i.test(e.reason || ''));
if (!splitEvent) {
  fail('KLACx split event found', 'no SPLIT event in replay history right now');
} else {
  pass('KLACx split event found', splitEvent.corporateActionId);
  const replay = await post(`/replay/KLACx`, {
    corporateActionId: splitEvent.corporateActionId,
    rawBalanceAtomic: '1000000000',
    tokenDecimals: 8,
  });
  const blocked = replay.body?.ok === false && replay.body?.classification?.supported === false;
  blocked ? pass('KLACx split is BLOCKED through real classification') : fail('KLACx split is BLOCKED through real classification', JSON.stringify(replay.body));
  const naiveFraction = Number(replay.body?.wouldHaveExtracted?.fractionBps ?? 0) / 100;
  naiveFraction > 50
    ? pass('naive harvest would have sold most of the position', `${naiveFraction}%`)
    : fail('naive harvest would have sold most of the position', `${naiveFraction}%`);
}

console.log(`\n${failures ? `${failures} FAILURE(S)` : 'JUDGE SMOKE PASSED'}\n`);
process.exit(failures ? 1 : 0);
