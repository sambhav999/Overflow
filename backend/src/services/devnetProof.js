/**
 * Live check of the Judge Demo's devnet money movement.
 *
 * Re-reads, from Solana devnet itself, every transaction recorded by
 * scripts/devnet-judge-execution.mjs plus the registry txs, and the judge
 * wallet's current TEST USDC / OAIx-DEMO balances. Always queries devnet --
 * these transactions only exist there -- independent of SOLANA_RPC_URL.
 */
import DEVNET from '../db/devnetJudgeExecution.json' with { type: 'json' };
import { REGISTRY_CREATE_RULE_SIG, REGISTRY_POST_RECEIPT_SIG } from '../db/seedDemo.js';

const DEVNET_RPC = process.env.DEVNET_RPC_URL || 'https://api.devnet.solana.com';
const CACHE_TTL_MS = 60_000;
let cache = null;

export const DEVNET_TRANSACTIONS = [
  { label: '10,000 TEST USDC protected (deposit)', signature: DEVNET.signatures.deposit },
  { label: '186.40 TEST USDC generated (earnings)', signature: DEVNET.signatures.earnings },
  { label: '186.40 TEST USDC → PreStocks Devnet/Judge Adapter', signature: DEVNET.signatures.transfer },
  { label: `${DEVNET.adapter.assetSymbol} allocation`, signature: DEVNET.signatures.allocation },
  { label: 'Registry create_rule', signature: REGISTRY_CREATE_RULE_SIG },
  { label: 'Registry post_receipt', signature: REGISTRY_POST_RECEIPT_SIG },
];

async function devnetRpc(method, params) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    const res = await fetch(DEVNET_RPC, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`devnet RPC ${method} HTTP ${res.status}`);
    const body = await res.json();
    if (body.error) throw new Error(`devnet RPC ${method}: ${body.error.message}`);
    return body.result;
  } finally {
    clearTimeout(timer);
  }
}

/** UI balance string of `mint` held by `owner`, or '0' if it has no account. */
async function tokenBalance(owner, mint) {
  const res = await devnetRpc('getTokenAccountsByOwner', [owner, { mint }, { encoding: 'jsonParsed' }]);
  const account = res?.value?.[0];
  return account?.account?.data?.parsed?.info?.tokenAmount?.uiAmountString ?? '0';
}

export async function devnetProof() {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.value;

  const signatures = DEVNET_TRANSACTIONS.map((t) => t.signature);
  const [statuses, testUsdc, oaixDemo] = await Promise.all([
    devnetRpc('getSignatureStatuses', [signatures, { searchTransactionHistory: true }]),
    tokenBalance(DEVNET.judgeUser, DEVNET.mints.testUsdc),
    tokenBalance(DEVNET.judgeUser, DEVNET.mints.oaixDemo),
  ]);

  const transactions = DEVNET_TRANSACTIONS.map((t, i) => {
    const s = statuses?.value?.[i];
    return {
      ...t,
      found: Boolean(s),
      ok: Boolean(s) && s.err == null,
      status: s?.confirmationStatus ?? 'not found',
      slot: s?.slot ?? null,
    };
  });

  const value = {
    cluster: 'devnet',
    checkedAt: new Date().toISOString(),
    adapter: DEVNET.adapter.label,
    judgeUser: DEVNET.judgeUser,
    mints: DEVNET.mints,
    transactions,
    allConfirmed: transactions.every((t) => t.ok),
    balances: {
      testUsdc,
      oaixDemo,
      expectedTestUsdc: DEVNET.amounts.principalTestUsdc,
      principalUntouched: Number(testUsdc) === Number(DEVNET.amounts.principalTestUsdc),
    },
  };
  cache = { at: Date.now(), value };
  return value;
}
