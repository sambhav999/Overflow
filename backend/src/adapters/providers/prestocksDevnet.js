/**
 * PreStocks Devnet/Judge Adapter.
 *
 * NOT the production PreStocks contract. PreStocks has no devnet deployment,
 * so the Judge Demo settles against this stand-in: a devnet SPL mint
 * (OAIx-DEMO) issued by an adapter keypair, priced from a fixed OpenAI
 * PreStocks reference so every run is reproducible.
 *
 * What is real: the devnet transactions, the TEST USDC that moves, and the
 * Overflow firewall/floor logic that decides how much may move.
 * What is deterministic: the market input (reference + execution price).
 */
export const PRESTOCKS_DEVNET_ADAPTER = {
  label: 'PreStocks Devnet/Judge Adapter',
  underlying: 'OpenAI PreStocks',
  assetSymbol: 'OAIx-DEMO',
  assetDecimals: 8,
  // Deterministic market input. Premium = 100 bps, inside a +150 bps limit.
  referencePriceUsd: '1000.00',
  executionPriceUsd: '1010.00',
  priceSource: 'DETERMINISTIC_MARKET_INPUT',
};

/** Premium of the execution price over the reference, in basis points. */
export function devnetPremiumBps() {
  const ref = Number(PRESTOCKS_DEVNET_ADAPTER.referencePriceUsd);
  const exe = Number(PRESTOCKS_DEVNET_ADAPTER.executionPriceUsd);
  return Math.round(((exe - ref) / ref) * 10000);
}

/**
 * OAIx-DEMO raw units (8dp) for a TEST USDC amount (6dp), at the fixed
 * execution price. Integer math, rounded down: the adapter never over-issues.
 */
export function quoteOaixDemoRaw(usdcAtomic) {
  const priceCents = BigInt(Math.round(Number(PRESTOCKS_DEVNET_ADAPTER.executionPriceUsd) * 100));
  // usdc(6dp) -> asset(8dp): x / 1e6 / (cents/100) * 1e8 = x * 1e4 / cents
  return ((BigInt(usdcAtomic) * 10000n) / priceCents).toString();
}
