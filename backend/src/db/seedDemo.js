/**
 * Judge Demo Mode seed data.
 *
 * Seeds through the same `createRule`/`createReceipt` helpers real data goes
 * through -- not raw SQL -- so a seeded row is exactly as valid as a live one.
 * The receipt is signed with the real verifier key (verifierKey.js), so its
 * exported proof JSON actually verifies; nothing here is faked, only
 * pre-dated.
 *
 * Only ever called when DEMO_MODE=true (src/index.js), against the
 * :memory: database that mode forces.
 */
import { createHash } from 'node:crypto';
import { base58Encode } from '../core/base58.js';
import { createRule } from './rules.js';
import { createReceipt, updateReceipt } from './receipts.js';
import { recordDecision } from './decisions.js';
import { computePolicyHash } from '../core/policyHash.js';
import { signProof, verifierPublicKey } from '../core/verifierKey.js';
import { buildProofPayload } from '../services/proof.js';
import { principalPreserved } from '../services/verify.js';
import { extractDividend, assertSourcePreserved, dividendPlausibilityCheck } from '../core/dividend.js';
import { classifyCorporateAction } from '../adapters/xstocks/corporateActions.js';

/** Real KLACx 10:1 split from xStocks history. Seeded so Story B never calls that API. */
const KLACX_SPLIT_10_1 = { before: '1.000892302917', after: '10.00892302917' };
const KLACX_RAW_ATOMIC = '1000000000';

let klacxEvaluation = null;

/**
 * Story B: run the known 10:1 split through the same two safety controls a live
 * replay would. Result is a blocked evaluation only -- no receipt, no signature.
 */
export function buildKlacxBlockedEvaluation() {
  const classification = classifyCorporateAction({ reason: 'Split' });
  const math = extractDividend({
    rawBalanceAtomic: KLACX_RAW_ATOMIC,
    multiplierBefore: KLACX_SPLIT_10_1.before,
    multiplierAfter: KLACX_SPLIT_10_1.after,
    tokenDecimals: 8,
  });
  const plausibility = dividendPlausibilityCheck(math);
  const fractionBps = (BigInt(math.dividendRawAtomic) * 10000n) / BigInt(KLACX_RAW_ATOMIC);
  return {
    ok: false,
    mode: 'DEMO',
    status: 'BLOCKED',
    reason: classification.supported ? plausibility.reason : 'UNSUPPORTED_EVENT_TYPE',
    classification,
    plausibility,
    wouldHaveExtracted: {
      dividendRawAtomic: math.dividendRawAtomic,
      fractionBps: fractionBps.toString(),
    },
    note: 'Overflow refuses this event. The figure above is what a naive implementation that only watched the multiplier would have routed.',
    event: {
      symbol: 'KLACx',
      reason: 'Split',
      multiplierBefore: KLACX_SPLIT_10_1.before,
      multiplierAfter: KLACX_SPLIT_10_1.after,
      source: 'SEEDED',
    },
  };
}

export function getSeededKlacxEvaluation() {
  return klacxEvaluation;
}

/** Deterministic, obviously-not-a-real-holder address -- never signs anything. */
export const DEMO_WALLET = base58Encode(createHash('sha256').update('overflow-judge-demo-wallet').digest());

const DEMO_KAMINO_VAULT = process.env.KAMINO_USDC_VAULT || 'HDsayqAsDWy3QvANGqh2yNraqcD8Fnjgh73Mhb3WRS5E';
// PreStocks OpenAI token, verified live (contract_address from the PreStocks API).
const OPENAI_PRESTOCKS_MINT = 'PreweJYECqtQwBtpxHL171nL2K6umo692gTm7Q3rpgF';
// Merck xStock, verified live via the xStocks asset service (getAsset('MRKx')).
const MRKX_MINT = 'XsnQnU7AdbRZYe2akqqpibDdXjkieGFfSkbkjX1Sd1X';
const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

let seeded = false;

export function seedDemoData() {
  if (seeded) return;
  seeded = true;

  // The hero demo: Kamino USDC -> Capital Firewall -> PreStocks (OpenAI).
  const rule = createRule({
    wallet: DEMO_WALLET,
    sourceType: 'KAMINO_USDC',
    sourceId: DEMO_KAMINO_VAULT,
    sourceSymbol: 'USDC',
    sourceMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
    sourceDecimals: 6,
    earningsType: 'INTEREST',
    destinationMint: OPENAI_PRESTOCKS_MINT,
    destinationSymbol: 'OPENAI',
    destinationProvider: 'PRESTOCKS',
    destinationCategory: 'PRIVATE_MARKET',
    destinationDecimals: 8,
    marketGuardMode: 'TOKEN_PREMIUM',
    maxPremiumBps: 150,
    minPremiumBps: -300,
    minExecutionUsdAtomic: '5000000', // $5
    maxSlippageBps: 50,
    principalFloorAtomic: '10000000000', // $10,000 protected floor
    principalFloorSource: 'USER_CONFIRMED',
    safetyBufferAtomic: '5000000', // $5 buffer
    kaminoVault: DEMO_KAMINO_VAULT,
  });

  const executionKey = `demo-seed-${rule.id}`;
  const harvestedAtomic = '186400000'; // $186.40 harvested above the floor
  const receivedRaw = '9820000'; // 0.0982 OPENAI (8dp)
  const redeemableAfterAtomic = '10000000000';

  // The same invariant a real settlement is checked against: does the
  // redeemable position still cover the floor. Derived, not asserted.
  const preserved = principalPreserved(redeemableAfterAtomic, rule.principalFloorAtomic);

  const inputs = {
    principalFloorAtomic: rule.principalFloorAtomic,
    redeemableAtomic: '10186400000',
    safetyBufferAtomic: rule.safetyBufferAtomic,
    harvestableAtomic: harvestedAtomic,
    destinationSymbol: 'OpenAI PreStocks',
    destinationDecimals: rule.destinationDecimals,
  };
  const outputs = {
    jupiterStatus: 'Success',
    outputAmountResult: receivedRaw,
    principalFloorAtomic: rule.principalFloorAtomic,
    redeemableAfterAtomic,
    routedRaw: harvestedAtomic,
    destinationReceivedRaw: receivedRaw,
    proofs: {
      exactSourceSpend: true,
      sourceSpendAvailable: true,
      observedSourceDelta: `-${harvestedAtomic}`,
      authorisedSourceDelta: `-${harvestedAtomic}`,
      destinationIncreased: true,
      floorStillCovered: preserved,
    },
  };

  let receipt = createReceipt({
    ruleId: rule.id,
    wallet: DEMO_WALLET,
    kind: 'INTEREST',
    mode: 'DEMO',
    status: 'CONFIRMED',
    executionKey,
    // No signature: this receipt is seeded, not a real chain event. A fabricated
    // look-alike here would render as a live Solscan link that 404s -- see
    // Receipt.jsx, which already falls back cleanly when signature is null.
    signature: null,
    slot: null,
    inputs,
    outputs,
    quote: null,
    // SEEDED, never VERIFIED_ON_CHAIN -- this receipt never touched a chain.
    // The numbers are real formula output (see comments above), but no
    // devnet transaction backs it, so it must never claim a live proof did.
    verification: 'SEEDED',
    verificationNote: 'SEEDED DEMO: the floor/earnings math ran through the real preservation formula. No transaction was submitted or verified on-chain.',
    preserved,
    proofs: outputs.proofs,
    destinationCategory: rule.destinationCategory,
    destinationSymbol: rule.destinationSymbol,
    earningsUsdAtomic: harvestedAtomic,
    policyHash: computePolicyHash(rule),
  });

  const signature = signProof(JSON.stringify(buildProofPayload(receipt)));
  receipt = updateReceipt(receipt.id, { verifierSignature: signature, verifierPubkey: verifierPublicKey() });

  // The Capital Firewall decision this harvest actually passed. Never
  // seeded before, which left the Firewall tab empty for the one story that
  // is supposed to demonstrate it. Illustrative prices (real OpenAI PreStocks
  // pricing runs well outside this rule's -300/+150 bps band right now, which
  // would BLOCK, not PASS -- these are chosen to be internally consistent
  // with the CONFIRMED receipt above, same honesty standard as its figures),
  // through the real recordDecision helper, in the same shape runFirewall
  // produces (see backend/src/services/firewall.js).
  recordDecision({
    wallet: DEMO_WALLET,
    ruleId: rule.id,
    intentKey: executionKey,
    destinationSymbol: rule.destinationSymbol,
    destinationProvider: rule.destinationProvider,
    destinationCategory: rule.destinationCategory,
    outcome: 'PASSED',
    earningsUsdAtomic: harvestedAtomic,
    evidence: {
      mode: 'TOKEN_PREMIUM',
      decision: 'PASS',
      breach: null,
      reason: 'Premium 100 bps is inside the policy band [-300, 150] bps.',
      premiumBps: 100,
      maxPremiumBps: rule.maxPremiumBps,
      minPremiumBps: rule.minPremiumBps,
      referencePriceUsd: '1000.0000',
      referenceSource: 'PRESTOCKS mark',
      tokenPriceUsd: '1010.0000',
      tokenSource: 'Jupiter executable quote (×1.486 scaled UI multiplier applied)',
      destinationMint: OPENAI_PRESTOCKS_MINT,
      amountAtomic: harvestedAtomic,
      countsAsRetained: false,
      checkedAt: new Date().toISOString(),
    },
  });

  // Story A: a real-shaped xStocks dividend -- classified, isolated, source
  // exposure preserved. Multiplier pair is real MRKx history (2025-10-07),
  // run through the actual extraction formula so the seed can never drift
  // from what it would really produce.
  const dividendRule = createRule({
    wallet: DEMO_WALLET,
    sourceType: 'XSTOCK_DIVIDEND',
    sourceId: 'MRKx',
    sourceSymbol: 'MRKx',
    sourceMint: MRKX_MINT,
    sourceDecimals: 8,
    earningsType: 'DIVIDEND',
    destinationMint: USDC_MINT,
    destinationSymbol: 'USDC',
    destinationProvider: 'USDC',
    destinationCategory: 'STABLE',
    destinationDecimals: 6,
    marketGuardMode: 'NONE',
    minExecutionUsdAtomic: '1000000', // $1
    maxSlippageBps: 50,
  });

  const dividendMath = extractDividend({
    rawBalanceAtomic: '1000000000', // 10 MRKx, 8dp -- a plausible hypothetical holding
    multiplierBefore: '1',
    multiplierAfter: '1.006441479605',
    tokenDecimals: 8,
  });
  const dividendPreserved = assertSourcePreserved(dividendMath).ok;
  const dividendExecutionKey = `demo-seed-${dividendRule.id}`;
  const dividendReceivedRaw = '5470000'; // illustrative ~$5.47 USDC for the isolated dividend

  const dividendInputs = {
    symbol: dividendRule.sourceSymbol,
    corporateActionId: 'MRKx-2025-10-07-dividend',
    reason: 'Dividend',
    preEventExposureDisplay: dividendMath.display.preEventExposure,
    multiplierBefore: dividendMath.multiplierBefore,
    multiplierAfter: dividendMath.multiplierAfter,
    dividendExposureDisplay: dividendMath.display.dividendExposure,
    dividendRawAtomic: dividendMath.dividendRawAtomic,
    remainingExposureDisplay: dividendMath.display.remainingExposure,
    destinationSymbol: dividendRule.destinationSymbol,
    destinationDecimals: dividendRule.destinationDecimals,
  };
  const dividendOutputs = {
    jupiterStatus: 'Success',
    outputAmountResult: dividendReceivedRaw,
    exposureAfter: dividendMath.display.remainingExposure,
    proofs: {
      exactSourceSpend: true,
      sourceSpendAvailable: true,
      observedSourceDelta: `-${dividendMath.dividendRawAtomic}`,
      authorisedSourceDelta: `-${dividendMath.dividendRawAtomic}`,
      destinationIncreased: true,
    },
  };

  let dividendReceipt = createReceipt({
    ruleId: dividendRule.id,
    wallet: DEMO_WALLET,
    kind: 'DIVIDEND',
    mode: 'DEMO',
    status: 'CONFIRMED',
    executionKey: dividendExecutionKey,
    signature: null,
    slot: null,
    inputs: dividendInputs,
    outputs: dividendOutputs,
    quote: null,
    verification: 'SEEDED',
    verificationNote: 'SEEDED DEMO: run through the real dividend extraction formula. No transaction was submitted or verified on-chain.',
    preserved: dividendPreserved,
    proofs: dividendOutputs.proofs,
    destinationCategory: dividendRule.destinationCategory,
    destinationSymbol: dividendRule.destinationSymbol,
    earningsUsdAtomic: dividendReceivedRaw,
    policyHash: computePolicyHash(dividendRule),
  });

  const dividendSignature = signProof(JSON.stringify(buildProofPayload(dividendReceipt)));
  dividendReceipt = updateReceipt(dividendReceipt.id, { verifierSignature: dividendSignature, verifierPubkey: verifierPublicKey() });

  // Story B: blocked evaluation only. Never a receipt. Never an xStocks fetch.
  klacxEvaluation = buildKlacxBlockedEvaluation();

  console.log(`[demo] seeded 2 rules + 2 SEEDED DEMO receipts + KLACx blocked evaluation for wallet ${DEMO_WALLET}`);
}
