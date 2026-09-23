import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { createRule, getRule, listRules, updateRule } from '../db/rules.js';
import { listReceipts, listReceiptsForRule, getReceipt, updateReceipt } from '../db/receipts.js';
import { listSnapshots, getOpenSnapshotForRule } from '../db/snapshots.js';
import { listStranded } from '../db/stranded.js';
import { listDestinations, getAssetDetail, checkSourceRoutable, getAsset } from '../services/assets.js';
import { evaluateRule } from '../services/evaluate.js';
import { prepareExecution, submitExecution } from '../services/execute.js';
import { listReplayEvents, replayEvent } from '../services/replay.js';
import { sdkStatus } from '../adapters/kamino/vault.js';
import { limiterConfig } from '../adapters/jupiter/client.js';
import { getSlot, getSolBalanceLamports, getTokenBalance, getMintInfo, getAccountOwnerProgram, SYSTEM_PROGRAM, USDC_MINT, getSignaturesForAddress } from '../adapters/solana/rpc.js';
import { refreshBaselines } from '../services/drift.js';
import { createNonce, verifySignIn, requireSession, issueSession, SESSION_TTL_MS } from '../auth/session.js';
import { DEMO_WALLET } from '../db/seedDemo.js';
import { lastXstocksSuccess } from '../adapters/xstocks/health.js';
import { listAllDestinations, getDestination, PROVIDERS } from '../services/destinations.js';
import { GUARD_MODES } from '../core/marketGuard.js';
import { listDecisions, earningsRetained } from '../db/decisions.js';
import { incomePortfolio } from '../services/portfolio.js';
import { previewRule } from '../services/preview.js';
import { pollOnce } from '../poller/poll.js';
import { mergeTransactionLog } from '../services/transactions.js';
import { buildPreservationProof } from '../services/proof.js';
import { prepareCreateRuleTx, preparePostReceiptTx, submitRegistryTx, registryStatus } from '../adapters/registry/service.js';
import { rulePda, receiptPda } from '../adapters/registry/encoder.js';
import {
  prepareDeposit, submitDeposit,
  submitHarvestWithdrawal,
  preparePrincipalWithdrawal, submitPrincipalWithdrawal,
  pendingSwapFunds,
} from '../services/kaminoFlows.js';

export const router = Router();

const asyncRoute = (fn) => (req, res) => fn(req, res).catch((err) => {
  console.error(`[${req.method} ${req.path}]`, err);
  res.status(500).json({ error: err.message });
});

/**
 * Shared by create and patch, so the Capital Firewall band can never be
 * validated one way at creation and a looser (or no) way on edit.
 * Returns an error string, or null when the band is valid.
 */
function validateGuardBand(guardMode, maxBps, minBps) {
  if (!GUARD_MODES.includes(guardMode)) return `marketGuardMode must be one of ${GUARD_MODES.join(', ')}`;
  if (guardMode !== 'NONE') {
    if (maxBps === null || !Number.isInteger(maxBps) || maxBps < -5000 || maxBps > 10000) {
      return 'maxPremiumBps must be an integer between -5000 and 10000 when the firewall is on';
    }
    if (minBps !== null && (!Number.isInteger(minBps) || minBps < -5000 || minBps > maxBps)) {
      return 'minPremiumBps must be an integer between -5000 and maxPremiumBps';
    }
  }
  return null;
}

/**
 * The wallet an endpoint acts for comes ONLY from a verified session. It was
 * previously read from `?wallet=`, which let anyone read, create or delete any
 * wallet's rules.
 */
const requireWallet = (req, res) => requireSession(req, res);

/**
 * Load a rule the session wallet owns. A rule owned by someone else is reported
 * as NOT FOUND rather than FORBIDDEN, so the API does not confirm it exists.
 */
function ownedRule(req, res) {
  const wallet = requireSession(req, res);
  if (!wallet) return null;
  const rule = getRule(req.params.id);
  if (!rule || rule.wallet !== wallet) { res.status(404).json({ error: 'rule not found' }); return null; }
  return rule;
}

/**
 * Judge Demo Mode fail-closed guard. Placed at the top of every route that
 * broadcasts a signed FUND-MOVING transaction (a harvest swap, a Kamino
 * deposit/withdrawal), so a judge running the seeded in-memory demo can
 * review the whole flow up to signing but can never actually move funds.
 *
 * Deliberately NOT placed on the registry routes (/onchain/submit) -- those
 * only write a PDA (rent paid by the signer, standard account creation; see
 * programs/overflow-registry/src/lib.rs) and never move product funds, so a
 * real connected wallet can still register the hero rule on-chain for real
 * even while demo mode protects everyone from an actual swap.
 *
 * Returns true (and has already responded) if the request was blocked.
 */
function blockedInDemoMode(res) {
  if (process.env.DEMO_MODE !== 'true') return false;
  res.status(403).json({
    error: 'Judge Demo Mode: fund-moving routes are disabled. This request would broadcast a real transaction.',
    code: 'DEMO_MODE_BLOCKED',
  });
  return true;
}

router.get('/health', asyncRoute(async (_req, res) => {
  const demoMode = process.env.DEMO_MODE === 'true';
  const [slot, kamino] = await Promise.all([getSlot().catch(() => null), sdkStatus().catch((err) => ({ available: false, error: err.message }))]);
  // Only computed in demo mode, and never allowed to fail the health check --
  // a judge deployment reporting 500 because a demo-only readout hiccuped
  // would defeat the entire point of this endpoint.
  let seeded = null;
  if (demoMode) {
    try {
      seeded = { rules: listRules(DEMO_WALLET).length, receipts: listReceipts(DEMO_WALLET).length };
    } catch (err) {
      seeded = { error: err.message };
    }
  }
  res.json({
    ok: true,
    slot,
    network: process.env.NETWORK || 'mainnet-beta',
    rpcConfigured: Boolean(process.env.SOLANA_RPC_URL),
    jupiterKeyConfigured: Boolean(process.env.JUPITER_API_KEY),
    jupiterThrottle: limiterConfig(),
    kamino,
    // Surfaced so the UI can prefill rather than asking a user to paste a vault
    // address. A rule may still override it per-rule.
    defaultKaminoVault: process.env.KAMINO_USDC_VAULT || null,
    registry: registryStatus(),
    mode: 'LIVE',
    demoMode,
    seeded,
    lastXstocksFetchAt: lastXstocksSuccess(),
  });
}));

/* ------------------------------------------------------------------ auth -- */

/** Step 1: a single-use message for the wallet to sign. */
router.post('/auth/nonce', asyncRoute(async (req, res) => {
  const { wallet } = req.body || {};
  if (!wallet) return res.status(400).json({ error: 'wallet is required' });
  try {
    res.json(createNonce(wallet));
  } catch (err) {
    res.status(400).json({ error: err.message, code: 'INVALID_WALLET' });
  }
}));

/** Step 2: verify the signature over the stored message and issue a session. */
router.post('/auth/verify', asyncRoute(async (req, res) => {
  const { wallet, nonce, signature } = req.body || {};
  if (!wallet || !nonce || !signature) {
    return res.status(400).json({ error: 'wallet, nonce and signature are required' });
  }
  try {
    res.json(verifySignIn({ wallet, nonce, signature }));
  } catch (err) {
    res.status(401).json({ error: err.message, code: 'SIGN_IN_FAILED' });
  }
}));

/** Who is signed in, and until when. */
router.get('/auth/session', asyncRoute(async (req, res) => {
  const wallet = requireSession(req, res); if (!wallet) return;
  res.json({ wallet, ttlMs: SESSION_TTL_MS });
}));

/**
 * Judge Demo Mode only: a session for the seeded demo wallet, with no wallet
 * signature required. A judge with no funded Phantom wallet can still see the
 * seeded rule and its verified Proof of Preservation. 404s (not just refuses)
 * outside demo mode, so its existence is not even discoverable in production.
 */
router.get('/demo/session', asyncRoute(async (_req, res) => {
  if (process.env.DEMO_MODE !== 'true') return res.status(404).json({ error: `no route for GET /demo/session` });
  res.json({ ...issueSession(DEMO_WALLET), demo: true });
}));

/* ---------------------------------------------------------------- assets -- */

router.get('/assets/destinations', asyncRoute(async (_req, res) => {
  // Public stocks, private-market tokens, and USDC -- each tagged with a category.
  res.json(await listAllDestinations());
}));

router.get('/assets/:symbol', asyncRoute(async (req, res) => {
  const detail = await getAssetDetail(req.params.symbol);
  if (!detail) return res.status(404).json({ error: 'unknown asset' });
  res.json(detail);
}));

router.get('/assets/:symbol/routable', asyncRoute(async (req, res) => {
  res.json(await checkSourceRoutable(req.params.symbol));
}));

/* ----------------------------------------------------------------- rules -- */

router.get('/rules', asyncRoute(async (req, res) => {
  const wallet = requireWallet(req, res); if (!wallet) return;
  const rules = listRules(wallet);
  const withState = await Promise.all(rules.map(async (rule) => ({
    ...rule,
    evaluation: await evaluateRule(rule).catch((e) => ({ status: 'BLOCKED', reason: e.message, guards: {} })),
    openSnapshot: getOpenSnapshotForRule(rule.id),
  })));
  res.json({ rules: withState });
}));

router.post('/rules', asyncRoute(async (req, res) => {
  const sessionWallet = requireSession(req, res); if (!sessionWallet) return;
  const b = req.body || {};
  if (b.wallet && b.wallet !== sessionWallet) {
    return res.status(403).json({ error: 'You can only create rules for the wallet you signed in with.', code: 'WALLET_MISMATCH' });
  }
  if (!b.sourceType || !b.destinationSymbol) return res.status(400).json({ error: 'sourceType and destinationSymbol are required' });

  // Capital Firewall configuration, validated so a rule cannot be created in a
  // state that could only ever fail closed.
  const provider = String(b.destinationProvider || 'XSTOCKS').toUpperCase();
  if (!PROVIDERS.includes(provider)) return res.status(400).json({ error: `unknown destination provider ${provider}` });
  const guardMode = String(b.marketGuardMode || 'NONE').toUpperCase();
  const maxBps = b.maxPremiumBps === undefined || b.maxPremiumBps === null || b.maxPremiumBps === '' ? null : Number(b.maxPremiumBps);
  const minBps = b.minPremiumBps === undefined || b.minPremiumBps === null || b.minPremiumBps === '' ? null : Number(b.minPremiumBps);
  const bandError = validateGuardBand(guardMode, maxBps, minBps);
  if (bandError) return res.status(400).json({ error: bandError });

  // A source that cannot be routed can never execute, so it is refused at
  // creation -- but only on a CONFIRMED lack of route. An unverified check
  // (rate limit, upstream fault) is not a verdict and must not block anything.
  if (b.sourceType === 'XSTOCK_DIVIDEND') {
    const routable = await checkSourceRoutable(b.sourceSymbol ?? b.sourceId);
    if (!routable.ok) return res.status(400).json({ error: routable.detail ?? routable.reason, code: routable.reason });
  }
  /*
   * Destination mints are resolved SERVER-SIDE from the symbol. A browser-supplied
   * mint would let anything that can reach this endpoint point a rule's earnings
   * at an arbitrary token.
   */
  const destination = await getDestination(provider, b.destinationSymbol);
  if (!destination) return res.status(400).json({ error: `unknown ${provider} destination ${b.destinationSymbol}` });
  if (guardMode === 'TOKEN_PREMIUM' && !destination.markPriceUsd) {
    return res.status(400).json({
      error: `${destination.symbol} publishes no mark price, so a TOKEN_PREMIUM firewall could never evaluate it. Use PYTH_PARITY or NONE.`,
      code: 'GUARD_UNEVALUABLE',
    });
  }
  if (guardMode === 'PYTH_PARITY' && destination.category !== 'PUBLIC_STOCK') {
    return res.status(400).json({
      error: 'PYTH_PARITY compares a tokenized stock with its listed underlying; private-market tokens have none. Use TOKEN_PREMIUM.',
      code: 'GUARD_UNEVALUABLE',
    });
  }
  if (b.destinationMint && b.destinationMint !== destination.mint) {
    return res.status(400).json({
      error: `destinationMint does not match the server-resolved mint for ${b.destinationSymbol}`,
      code: 'DESTINATION_MINT_MISMATCH',
    });
  }
  // Same for the source: never trust a mint from the client.
  let resolvedSourceMint = null;
  if (b.sourceType === 'XSTOCK_DIVIDEND') {
    const sourceAsset = await getAsset(b.sourceSymbol ?? b.sourceId);
    if (!sourceAsset) return res.status(400).json({ error: `unknown source ${b.sourceSymbol ?? b.sourceId}` });
    resolvedSourceMint = sourceAsset.mint;
  } else {
    resolvedSourceMint = USDC_MINT;
  }

  const rule = createRule({
    wallet: sessionWallet,
    sourceType: b.sourceType,
    sourceId: b.sourceId,
    sourceMint: resolvedSourceMint,
    sourceSymbol: b.sourceSymbol ?? null,
    sourceDecimals: b.sourceDecimals ?? 8,
    earningsType: b.sourceType === 'XSTOCK_DIVIDEND' ? 'DIVIDEND' : 'INTEREST',
    destinationMint: destination.mint,
    destinationSymbol: destination.symbol,
    destinationProvider: destination.provider,
    destinationCategory: destination.category,
    marketGuardMode: guardMode,
    maxPremiumBps: guardMode === 'NONE' ? null : maxBps,
    minPremiumBps: guardMode === 'NONE' ? null : minBps,
    destinationDecimals: destination.decimals ?? 8,
    minExecutionUsdAtomic: b.minExecutionUsdAtomic ?? '5000000',
    maxSlippageBps: b.maxSlippageBps ?? 50,
    maxPriceImpactBps: b.maxPriceImpactBps ?? 100,
    allowOvernight: Boolean(b.allowOvernight),
    principalFloorAtomic: b.principalFloorAtomic ?? null,
    principalFloorSource: b.principalFloorAtomic ? (b.principalFloorSource ?? 'USER_CONFIRMED') : null,
    safetyBufferAtomic: b.safetyBufferAtomic ?? null,
    kaminoVault: b.kaminoVault ?? process.env.KAMINO_USDC_VAULT ?? null,
    kaminoShareMint: b.kaminoShareMint ?? null,
  });
  // Record what the position looks like now, so later drift is detectable.
  const baselined = await refreshBaselines(rule).catch(() => rule);
  const onchain = await prepareCreateRuleTx({ rule: baselined }).catch((err) => ({
    available: false,
    reason: 'PREPARE_FAILED',
    detail: err.message,
  }));
  res.status(201).json({ rule: baselined, onchain });
}));

/**
 * Reconfirm the baseline after an external change.
 *
 * A paused rule stays paused until the user accepts the position as it now is --
 * Overflow will not silently resume against a position it no longer understands.
 */
router.post('/rules/:id/reconfirm-baseline', asyncRoute(async (req, res) => {
  const rule = ownedRule(req, res); if (!rule) return;
  const refreshed = await refreshBaselines(rule);
  const resumed = updateRule(refreshed.id, { status: 'ACTIVE', pauseReason: null });
  res.json({ rule: resumed });
}));

router.get('/rules/:id', asyncRoute(async (req, res) => {
  const rule = ownedRule(req, res); if (!rule) return;
  res.json({
    rule,
    evaluation: await evaluateRule(rule),
    snapshots: listSnapshots(rule.id),
    receipts: listReceiptsForRule(rule.id),
    stranded: listStranded(rule.id),
  });
}));

/**
 * Explicit allowlist, never a pass-through of req.body. Everything else a
 * client might send -- principalFloorAtomic, destinationMint, sourceMint,
 * accounting state, execution/receipt history -- is silently ignored here,
 * not written. Those fields stay reachable only from trusted server code
 * (kaminoFlows.js's confirmed-floor updates, the registry's onchain PDA
 * writes), never from a raw client PATCH.
 */
router.patch('/rules/:id', asyncRoute(async (req, res) => {
  const rule = ownedRule(req, res); if (!rule) return;
  const b = req.body || {};
  const patch = {};

  if (b.status !== undefined) {
    const status = String(b.status).toUpperCase();
    if (!['ACTIVE', 'PAUSED', 'ARCHIVED'].includes(status)) {
      return res.status(400).json({ error: 'status must be one of ACTIVE, PAUSED, ARCHIVED' });
    }
    patch.status = status;
  }
  if (b.pauseReason !== undefined) patch.pauseReason = b.pauseReason === null ? null : String(b.pauseReason).slice(0, 500);
  if (b.minExecutionUsdAtomic !== undefined) patch.minExecutionUsdAtomic = String(b.minExecutionUsdAtomic);
  if (b.maxSlippageBps !== undefined) patch.maxSlippageBps = Number(b.maxSlippageBps);
  if (b.maxPriceImpactBps !== undefined) patch.maxPriceImpactBps = Number(b.maxPriceImpactBps);
  if (b.allowOvernight !== undefined) patch.allowOvernight = Boolean(b.allowOvernight);

  // The Capital Firewall band is validated as a whole, using the rule's
  // current values for any field this request does not touch, so a partial
  // edit can never leave the band internally inconsistent.
  if (b.marketGuardMode !== undefined || b.maxPremiumBps !== undefined || b.minPremiumBps !== undefined) {
    const guardMode = b.marketGuardMode !== undefined ? String(b.marketGuardMode).toUpperCase() : (rule.marketGuardMode ?? 'NONE');
    const maxBps = b.maxPremiumBps !== undefined
      ? (b.maxPremiumBps === null || b.maxPremiumBps === '' ? null : Number(b.maxPremiumBps))
      : rule.maxPremiumBps;
    const minBps = b.minPremiumBps !== undefined
      ? (b.minPremiumBps === null || b.minPremiumBps === '' ? null : Number(b.minPremiumBps))
      : rule.minPremiumBps;
    const bandError = validateGuardBand(guardMode, maxBps, minBps);
    if (bandError) return res.status(400).json({ error: bandError });
    patch.marketGuardMode = guardMode;
    patch.maxPremiumBps = guardMode === 'NONE' ? null : maxBps;
    patch.minPremiumBps = guardMode === 'NONE' ? null : minBps;
  }

  if (!Object.keys(patch).length) return res.status(400).json({ error: 'no recognised fields to update' });
  res.json({ rule: updateRule(rule.id, patch) });
}));

/**
 * Archived, never deleted. snapshots/receipts/stranded_funds/execution_intents/
 * policy_decisions all reference rules(id) ON DELETE CASCADE (db/index.js) with
 * foreign_keys enforcement on -- a hard delete here would silently destroy the
 * entire Proof of Preservation history for this rule. Same response shape the
 * frontend already expects ({ deleted: true }); it locally filters the rule
 * out of its list either way.
 */
router.delete('/rules/:id', asyncRoute(async (req, res) => {
  const rule = ownedRule(req, res); if (!rule) return;
  const archived = updateRule(rule.id, { status: 'ARCHIVED', pauseReason: null });
  res.json({ deleted: true, rule: archived });
}));

router.get('/rules/:id/evaluate', asyncRoute(async (req, res) => {
  const rule = ownedRule(req, res); if (!rule) return;
  res.json(await evaluateRule(rule));
}));

/* ------------------------------------------------------------- execution -- */

router.post('/rules/:id/prepare', asyncRoute(async (req, res) => {
  const rule = ownedRule(req, res); if (!rule) return;
  const prepared = await prepareExecution(rule);
  if (!prepared.ok) return res.status(409).json(prepared);
  res.json(prepared);
}));

router.post('/rules/:id/submit', asyncRoute(async (req, res) => {
  const rule = ownedRule(req, res); if (!rule) return;
  if (blockedInDemoMode(res)) return;
  const { signedTransaction, requestId, executionKey, context, intentId } = req.body || {};
  if (!signedTransaction || !requestId || !executionKey) {
    return res.status(400).json({ error: 'signedTransaction, requestId and executionKey are required' });
  }
  // intentId is what binds the signed transaction to what the server authorised.
  const result = await submitExecution({
    rule, signedTransactionBase64: signedTransaction, requestId, executionKey, context, intentId,
  });
  if (result.ok && result.receipt) {
    const onchain = await preparePostReceiptTx({ rule, receipt: result.receipt }).catch((err) => ({
      available: false,
      reason: 'PREPARE_FAILED',
      detail: err.message,
    }));
    res.status(200).json({ ...result, onchain });
    return;
  }
  res.status(result.ok ? 200 : 409).json(result);
}));

router.post('/rules/:id/onchain/submit', asyncRoute(async (req, res) => {
  const rule = ownedRule(req, res); if (!rule) return;
  const { signedTransaction } = req.body || {};
  if (!signedTransaction) return res.status(400).json({ error: 'signedTransaction is required' });
  const submitted = await submitRegistryTx({ signedTransaction });
  if (!submitted.confirmation?.confirmed) {
    return res.status(409).json({
      ok: false,
      reason: 'NOT_CONFIRMED',
      detail: submitted.confirmation?.reason || 'registry transaction did not confirm',
      signature: submitted.signature,
    });
  }
  const derived = rulePda({ owner: rule.wallet, ruleId: rule.id });
  const updated = updateRule(rule.id, {
    onchainPda: req.body.rulePda || derived.address,
    onchainSignature: submitted.signature,
  });
  res.json({ ok: true, rule: updated, signature: submitted.signature, rulePda: derived.address });
}));

router.post('/rules/:id/receipts/:receiptId/onchain/submit', asyncRoute(async (req, res) => {
  const rule = ownedRule(req, res); if (!rule) return;
  const receipt = getReceipt(req.params.receiptId);
  if (!receipt || receipt.ruleId !== rule.id || receipt.wallet !== rule.wallet) {
    return res.status(404).json({ error: 'receipt not found' });
  }
  const { signedTransaction } = req.body || {};
  if (!signedTransaction) return res.status(400).json({ error: 'signedTransaction is required' });
  const submitted = await submitRegistryTx({ signedTransaction });
  if (!submitted.confirmation?.confirmed) {
    return res.status(409).json({
      ok: false,
      reason: 'NOT_CONFIRMED',
      detail: submitted.confirmation?.reason || 'registry transaction did not confirm',
      signature: submitted.signature,
    });
  }
  const derived = receiptPda({ owner: rule.wallet, executionKey: receipt.executionKey });
  const updated = updateReceipt(receipt.id, {
    onchainPda: req.body.receiptPda || derived.address,
    onchainSignature: submitted.signature,
  });
  res.json({ ok: true, receipt: updated, signature: submitted.signature, receiptPda: derived.address });
}));

router.post('/rules/:id/onchain/prepare', asyncRoute(async (req, res) => {
  const rule = ownedRule(req, res); if (!rule) return;
  const onchain = await prepareCreateRuleTx({ rule });
  res.json({ rule, onchain });
}));

router.post('/rules/:id/receipts/:receiptId/onchain/prepare', asyncRoute(async (req, res) => {
  const rule = ownedRule(req, res); if (!rule) return;
  const receipt = getReceipt(req.params.receiptId);
  if (!receipt || receipt.ruleId !== rule.id || receipt.wallet !== rule.wallet) {
    return res.status(404).json({ error: 'receipt not found' });
  }
  const onchain = await preparePostReceiptTx({ rule, receipt });
  res.json({ receipt, onchain });
}));

/* --------------------------------------------------- kamino: deposit -- */

/**
 * Two calls, one signature in between:
 *   POST /deposit          -> unsigned transaction
 *   POST /deposit/submit   -> broadcast, confirm, floor += confirmed amount
 * The floor moves only in the second call, and only on a confirmed signature.
 */
router.post('/rules/:id/deposit', asyncRoute(async (req, res) => {
  const rule = ownedRule(req, res); if (!rule) return;
  const { usdcAtomic } = req.body || {};
  if (!usdcAtomic) return res.status(400).json({ error: 'usdcAtomic is required' });
  const prepared = await prepareDeposit({ rule, usdcAtomic });
  res.status(prepared.ok ? 200 : 409).json(prepared);
}));

router.post('/rules/:id/deposit/submit', asyncRoute(async (req, res) => {
  const rule = ownedRule(req, res); if (!rule) return;
  if (blockedInDemoMode(res)) return;
  const { signedTransaction, intentId } = req.body || {};
  if (!signedTransaction || !intentId) return res.status(400).json({ error: 'signedTransaction and intentId are required' });
  const result = await submitDeposit({ rule, signedTransaction, intentId });
  res.status(result.ok ? 200 : 409).json(result);
}));

/* ------------------------------------------ kamino: harvest withdrawal leg -- */

/**
 * Step 1 of a harvest. POST /prepare returns stage WITHDRAW with the Kamino
 * transaction; this confirms it and records the USDC as awaiting its swap.
 */
router.post('/rules/:id/harvest/withdraw/submit', asyncRoute(async (req, res) => {
  const rule = ownedRule(req, res); if (!rule) return;
  if (blockedInDemoMode(res)) return;
  const { signedTransaction, intentId } = req.body || {};
  if (!signedTransaction || !intentId) return res.status(400).json({ error: 'signedTransaction and intentId are required' });
  const result = await submitHarvestWithdrawal({ rule, signedTransaction, intentId });
  res.status(result.ok ? 200 : 409).json(result);
}));

/* ------------------------------------------- kamino: principal withdrawal -- */

/**
 * Returns the withdrawal plan alongside the transaction, including any
 * shortfall, so an impaired position can never be presented as a full return.
 */
router.post('/rules/:id/withdraw-principal', asyncRoute(async (req, res) => {
  const rule = ownedRule(req, res); if (!rule) return;
  const prepared = await preparePrincipalWithdrawal({ rule, requestedAtomic: req.body?.requestedAtomic });
  res.status(prepared.ok ? 200 : 409).json(prepared);
}));

router.post('/rules/:id/withdraw-principal/submit', asyncRoute(async (req, res) => {
  const rule = ownedRule(req, res); if (!rule) return;
  if (blockedInDemoMode(res)) return;
  const { signedTransaction, intentId } = req.body || {};
  if (!signedTransaction || !intentId) return res.status(400).json({ error: 'signedTransaction and intentId are required' });
  const result = await submitPrincipalWithdrawal({ rule, signedTransaction, intentId });
  res.status(result.ok ? 200 : 409).json(result);
}));

/** USDC out of the vault but not yet swapped. */
router.get('/rules/:id/pending-funds', asyncRoute(async (req, res) => {
  const rule = ownedRule(req, res); if (!rule) return;
  res.json(pendingSwapFunds(rule.id));
}));

/* ------------------------------------------------- firewall + portfolio -- */

/** Every Capital Firewall decision for the signed-in wallet, with its evidence. */
router.get('/decisions', asyncRoute(async (req, res) => {
  const wallet = requireSession(req, res); if (!wallet) return;
  res.json({ decisions: listDecisions(wallet), retained: earningsRetained(wallet) });
}));

/** "Your Earnings Built This" + "Earnings Retained", split public / private. */
router.get('/portfolio', asyncRoute(async (req, res) => {
  const wallet = requireSession(req, res); if (!wallet) return;
  res.json(incomePortfolio(wallet));
}));

/**
 * What a harvest WOULD do right now. Reads live state and runs the firewall as a
 * dry run. Prepares no transaction, withdraws nothing, and records no decision.
 */
router.post('/rules/:id/preview', asyncRoute(async (req, res) => {
  const rule = ownedRule(req, res); if (!rule) return;
  res.json(await previewRule(rule));
}));

/* -------------------------------------------------------------- receipts -- */

router.get('/receipts', asyncRoute(async (req, res) => {
  const wallet = requireWallet(req, res); if (!wallet) return;
  res.json({ receipts: listReceipts(wallet) });
}));

/**
 * Portable Proof JSON (`overflow.preservation-proof.v1`). A pure projection of
 * an already-verified, already-signed receipt -- nothing is recomputed here.
 */
router.get('/rules/:id/receipts/:receiptId/proof', asyncRoute(async (req, res) => {
  const rule = ownedRule(req, res); if (!rule) return;
  const receipt = getReceipt(req.params.receiptId);
  if (!receipt || receipt.ruleId !== rule.id || receipt.wallet !== rule.wallet) {
    return res.status(404).json({ error: 'receipt not found' });
  }
  res.json(buildPreservationProof(receipt));
}));

router.get('/transactions', asyncRoute(async (req, res) => {
  const wallet = requireWallet(req, res); if (!wallet) return;
  const receipts = listReceipts(wallet, 100);
  const rules = listRules(wallet);
  const chain = await getSignaturesForAddress(wallet, { limit: 40 }).catch(() => []);
  res.json({
    wallet,
    network: process.env.NETWORK || 'mainnet-beta',
    transactions: mergeTransactionLog({ chain, receipts, rules }),
  });
}));

/* ---------------------------------------------------------------- replay -- */

router.get('/replay/:symbol/events', asyncRoute(async (req, res) => {
  res.json({ symbol: req.params.symbol, events: await listReplayEvents(req.params.symbol) });
}));

router.post('/replay/:symbol', asyncRoute(async (req, res) => {
  const { corporateActionId, rawBalanceAtomic, tokenDecimals } = req.body || {};
  if (!corporateActionId || !rawBalanceAtomic) {
    return res.status(400).json({ error: 'corporateActionId and rawBalanceAtomic are required' });
  }
  res.json(await replayEvent({
    symbol: req.params.symbol, corporateActionId, rawBalanceAtomic, tokenDecimals: tokenDecimals ?? 8,
  }));
}));

/* ---------------------------------------------------------------- wallet -- */

router.get('/wallet/:address/overview', asyncRoute(async (req, res) => {
  const owner = req.params.address;
  // A failed balance read must NOT be reported as a zero balance: "no SOL" and
  // "could not read" lead to opposite conclusions.
  const [balance, account, slot] = await Promise.all([
    getSolBalanceLamports(owner).then((v) => ({ ok: true, v })).catch((e) => ({ ok: false, error: e.message })),
    getAccountOwnerProgram(owner).catch(() => null),
    getSlot().catch(() => null),
  ]);
  res.json({
    address: owner,
    solLamports: balance.ok ? balance.v.toString() : null,
    sol: balance.ok ? Number(balance.v) / 1e9 : null,
    balanceError: balance.ok ? null : balance.error,
    ownerProgram: account?.owner ?? null,
    canPayFees: account ? account.owner === SYSTEM_PROGRAM : true,
    slot,
  });
}));

router.get('/wallet/:address/token/:mint', asyncRoute(async (req, res) => {
  const [balance, mint] = await Promise.all([
    getTokenBalance({ owner: req.params.address, mint: req.params.mint }),
    getMintInfo(req.params.mint).catch(() => null),
  ]);
  res.json({ balance, mint });
}));

/* ---------------------------------------------------------------- poller -- */

router.post('/poll', asyncRoute(async (req, res) => {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers['x-cron-secret'] !== secret) return res.status(401).json({ error: 'bad cron secret' });
  res.json(await pollOnce());
}));
