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
  assert.ok(!receipts.some((r) => /KLAC/i.test(r.inputs?.symbol || '')));
  assert.ok(receipts.every((r) => r.verification !== 'VERIFIED_ON_CHAIN' && r.mode !== 'LIVE'));

  // Story A stays seeded: no chain transaction, so no signature.
  const dividend = receipts.find((r) => r.kind === 'DIVIDEND');
  assert.equal(dividend.mode, 'DEMO');
  assert.equal(dividend.verification, 'SEEDED');
  assert.equal(dividend.signature, null);
  assert.equal(buildProofPayload(dividend).label, 'SEEDED DEMO');

  // Story C is backed by the real devnet run: 186.40 TEST USDC moved, 10,000 untouched.
  const interest = receipts.find((r) => r.kind === 'INTEREST');
  assert.equal(interest.mode, 'DEVNET');
  assert.equal(interest.verification, 'DEVNET_TX');
  assert.ok(interest.signature);
  assert.equal(interest.inputs.harvestableAtomic, '186400000');
  assert.equal(interest.outputs.devnet.principalAfterTestUsdc, '10000');
  assert.equal(interest.preserved, true);
  assert.match(interest.inputs.destinationSymbol, /^OAIx-DEMO/);
  const proof = buildProofPayload(interest);
  assert.equal(proof.mode, 'DEVNET');
  assert.equal(proof.label, undefined);
  assert.equal(proof.protectedCapitalConsumedAtomic, '0');

  assert.equal(listRules(DEMO_WALLET).length, 2);
});
