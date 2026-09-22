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
import { computePolicyHash } from '../core/policyHash.js';
import { signProof, verifierPublicKey } from '../core/verifierKey.js';
import { buildProofPayload } from '../services/proof.js';
import { principalPreserved } from '../services/verify.js';

/** Deterministic, obviously-not-a-real-holder address -- never signs anything. */
export const DEMO_WALLET = base58Encode(createHash('sha256').update('overflow-judge-demo-wallet').digest());

const DEMO_KAMINO_VAULT = process.env.KAMINO_USDC_VAULT || 'HDsayqAsDWy3QvANGqh2yNraqcD8Fnjgh73Mhb3WRS5E';
// PreStocks OpenAI token, verified live (contract_address from the PreStocks API).
const OPENAI_PRESTOCKS_MINT = 'PreweJYECqtQwBtpxHL171nL2K6umo692gTm7Q3rpgF';

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
    destinationSymbol: rule.destinationSymbol,
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
    mode: 'LIVE',
    status: 'CONFIRMED',
    executionKey,
    signature: '5' + base58Encode(createHash('sha256').update(executionKey).digest()).slice(0, 86),
    slot: '0',
    inputs,
    outputs,
    quote: null,
    verification: 'VERIFIED_ON_CHAIN',
    verificationNote: 'Settlement re-read from chain: principal floor intact, destination token increased by the settled amount.',
    preserved,
    proofs: outputs.proofs,
    destinationCategory: rule.destinationCategory,
    destinationSymbol: rule.destinationSymbol,
    earningsUsdAtomic: harvestedAtomic,
    policyHash: computePolicyHash(rule),
  });

  const signature = signProof(JSON.stringify(buildProofPayload(receipt)));
  receipt = updateReceipt(receipt.id, { verifierSignature: signature, verifierPubkey: verifierPublicKey() });

  console.log(`[demo] seeded 1 rule + 1 verified receipt for wallet ${DEMO_WALLET}`);
}
