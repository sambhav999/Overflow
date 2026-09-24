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

const health = await get('/health').catch((e) => ({ status: 0, body: { error: e.message } }));
health.status === 200 ? pass('GET /health -> 200') : fail('GET /health -> 200', `got ${health.status}`);
health.body?.mode === 'JUDGE_DEMO' ? pass('mode is JUDGE_DEMO') : fail('mode is JUDGE_DEMO', JSON.stringify(health.body?.mode));
health.body?.demoMode === undefined ? pass('no duplicate demoMode field') : fail('no duplicate demoMode field', 'demoMode still present');
health.body?.network !== 'mainnet-beta' ? pass('no mainnet config', `network=${health.body?.network}`) : fail('no mainnet config', 'network is mainnet-beta');
(health.body?.seeded?.rules ?? 0) >= 2 ? pass('seed data present', `${health.body.seeded.rules} rules`) : fail('seed data present', JSON.stringify(health.body?.seeded));

const session = await get('/demo/session').catch((e) => ({ status: 0, body: { error: e.message } }));
session.status === 200 ? pass('GET /demo/session -> 200') : fail('GET /demo/session -> 200', `got ${session.status}`);
const token = session.body?.token;
token ? pass('demo session issues a token') : fail('demo session issues a token');
const auth = token ? { authorization: `Bearer ${token}` } : {};

const klacx = session.body?.klacx;
const blocked = klacx?.ok === false && klacx?.classification?.supported === false;
blocked ? pass('seeded KLACx is BLOCKED through real classification') : fail('seeded KLACx is BLOCKED through real classification', JSON.stringify(klacx));
const naiveFraction = Number(klacx?.wouldHaveExtracted?.fractionBps ?? 0) / 100;
naiveFraction > 50
  ? pass('naive harvest would have sold most of the position', `${naiveFraction}%`)
  : fail('naive harvest would have sold most of the position', `${naiveFraction}%`);

const receipts = await get('/receipts', auth).catch((e) => ({ status: 0, body: { error: e.message } }));
const list = receipts.body?.receipts || [];
list.length > 0 ? pass('seeded receipts present', `${list.length} receipts`) : fail('seeded receipts present');
const mislabeled = list.filter((r) => r.verification === 'VERIFIED_ON_CHAIN' || r.mode === 'LIVE');
mislabeled.length === 0
  ? pass('seeded receipts are DEMO / SEEDED, never LIVE')
  : fail('seeded receipts are DEMO / SEEDED, never LIVE', JSON.stringify(mislabeled.map((r) => ({ id: r.id, mode: r.mode, verification: r.verification }))));

const rules = await get('/rules', auth);
const hero = (rules.body?.rules || []).find((r) => r.sourceType === 'KAMINO_USDC');
if (!hero) {
  fail('hero Kamino rule present');
} else {
  pass('hero Kamino rule present', hero.id);
  const blockedSubmit = await post(`/rules/${hero.id}/submit`, { signedTransaction: 'AA', requestId: 'x', executionKey: 'y' }, auth);
  blockedSubmit.status === 403 && blockedSubmit.body?.code === 'DEMO_MODE_BLOCKED'
    ? pass('fund-moving submit is blocked')
    : fail('fund-moving submit is blocked', `${blockedSubmit.status} ${JSON.stringify(blockedSubmit.body)}`);
  const blockedRegistry = await post(`/rules/${hero.id}/onchain/submit`, { signedTransaction: 'AA' }, auth);
  blockedRegistry.status === 403 && blockedRegistry.body?.code === 'DEMO_MODE_BLOCKED'
    ? pass('registry submit is blocked')
    : fail('registry submit is blocked', `${blockedRegistry.status} ${JSON.stringify(blockedRegistry.body)}`);
}

console.log(`\n${failures ? `${failures} FAILURE(S)` : 'JUDGE SMOKE PASSED'}\n`);
process.exit(failures ? 1 : 0);
