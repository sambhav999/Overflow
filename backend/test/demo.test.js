import test from 'node:test';
import assert from 'node:assert/strict';

process.env.DATABASE_PATH = ':memory:';
process.env.SESSION_SECRET = 'test-secret-that-is-at-least-thirty-two-characters-long';

const { getDb } = await import('../src/db/index.js');
const { seedDemoData, getSeededKlacxEvaluation, buildKlacxBlockedEvaluation, DEMO_WALLET } = await import('../src/db/seedDemo.js');
const { listReceipts } = await import('../src/db/receipts.js');
const { listRules } = await import('../src/db/rules.js');
const { usdToUsdcAtomic } = await import('../src/core/units.js');
const { buildProofPayload } = await import('../src/services/proof.js');

test('usdToUsdcAtomic converts judge-demo dollars on the server', () => {
  assert.equal(usdToUsdcAtomic('10000'), '10000000000');
  assert.equal(usdToUsdcAtomic('186.40'), '186400000');
  assert.equal(usdToUsdcAtomic('not-a-number'), null);
});

test('KLACx 10:1 is a blocked evaluation from the real classifiers, with no receipt', () => {
  getDb();
  seedDemoData();
  const ev = getSeededKlacxEvaluation() ?? buildKlacxBlockedEvaluation();
  assert.equal(ev.ok, false);
  assert.equal(ev.status, 'BLOCKED');
  assert.equal(ev.mode, 'DEMO');
  assert.equal(ev.classification.supported, false);
  assert.equal(ev.classification.eventType, 'SPLIT');
  assert.equal(ev.plausibility.ok, false);
  assert.equal(ev.plausibility.reason, 'IMPLAUSIBLE_DIVIDEND_SIZE');
  assert.ok(BigInt(ev.wouldHaveExtracted.fractionBps) > 8900n);

  const receipts = listReceipts(DEMO_WALLET);
  assert.equal(receipts.length, 2);
  assert.ok(receipts.every((r) => r.mode === 'DEMO'));
  assert.ok(receipts.every((r) => r.verification === 'SEEDED'));
  assert.ok(receipts.every((r) => r.signature == null));
  assert.ok(!receipts.some((r) => /KLAC/i.test(r.inputs?.symbol || '')));

  const interest = receipts.find((r) => r.kind === 'INTEREST');
  assert.equal(interest.inputs.destinationSymbol, 'OpenAI PreStocks');
  const proof = buildProofPayload(interest);
  assert.equal(proof.mode, 'DEMO');
  assert.equal(proof.label, 'SEEDED DEMO');

  assert.equal(listRules(DEMO_WALLET).length, 2);
});
