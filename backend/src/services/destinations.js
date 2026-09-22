/**
 * The destination catalogue: public stocks (xStocks) and private-market tokens
 * (PreStocks), each tagged with a category so earnings can be reported
 * as a public/private split.
 *
 * Every mint is resolved HERE, server-side, by (provider, symbol). The browser
 * names a destination; it never supplies a mint.
 */
import { getAsset, USDC_ASSET } from './assets.js';
import { fetchPreStocks } from '../adapters/providers/private.js';

export const PROVIDERS = ['XSTOCKS', 'PRESTOCKS', 'USDC'];

/** The public-stock destinations offered. Small and deliberate. */
const PUBLIC_DESTINATIONS = ['SPYx', 'QQQx', 'NVDAx'];

function publicShape(asset) {
  return {
    provider: 'XSTOCKS',
    category: 'PUBLIC_STOCK',
    symbol: asset.symbol,
    name: asset.name,
    mint: asset.mint,
    decimals: asset.decimals ?? 8,
    logo: asset.logo ?? null,
    benchmarkSymbol: asset.underlyingSymbol ?? asset.symbol.replace(/x$/i, ''),
    markPriceUsd: null,
    providerTokenPriceUsd: null,
    trading: asset.trading ?? null,
    isTradingHalted: Boolean(asset.isTradingHalted),
  };
}

export async function listAllDestinations() {
  const warnings = [];
  const out = [{ ...USDC_ASSET, provider: 'USDC', category: 'STABLE' }];

  for (const symbol of PUBLIC_DESTINATIONS) {
    const a = await getAsset(symbol).catch(() => null);
    if (a) out.push(publicShape(a));
    else warnings.push(`xStocks ${symbol} unavailable`);
  }

  const [pre] = await Promise.allSettled([fetchPreStocks()]);
  if (pre.status === 'fulfilled') out.push(...pre.value);
  else warnings.push(`PreStocks unavailable: ${pre.reason?.message}`);

  return { destinations: out, warnings };
}

/** Resolve one destination by provider and symbol. Returns null if unknown. */
export async function getDestination(provider, symbol) {
  const p = String(provider || 'XSTOCKS').toUpperCase();
  const s = String(symbol || '').trim();
  if (!s) return null;
  if (p === 'USDC' || s.toUpperCase() === 'USDC') return { ...USDC_ASSET, provider: 'USDC', category: 'STABLE' };
  if (p === 'XSTOCKS') {
    const a = await getAsset(s);
    return a ? publicShape(a) : null;
  }
  const list = p === 'PRESTOCKS' ? await fetchPreStocks() : [];
  return list.find((d) => d.symbol.toUpperCase() === s.toUpperCase()) ?? null;
}
