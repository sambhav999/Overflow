/**
 * Private-market token provider: PreStocks.
 *
 * Field names are pinned to what the API ACTUALLY returns (verified live,
 * September 2026) -- not guessed. V4.1's normaliser guessed, looked for `mint`
 * or `mintAddress`, and dropped every PreStocks asset because PreStocks calls it
 * `contract_address`. Its test passed because the fixture used the same guess.
 *
 *   PreStocks  [{ name, symbol, contract_address, markPrice, tokenPrice, ... }]
 *
 * Every price here is a decimal STRING. Nothing is coerced through Number.
 */
const PRESTOCKS_URL = process.env.PRESTOCKS_API_URL || 'https://prestocks.com/api/prestocks';

const CACHE_TTL_MS = 5 * 60 * 1000;
const cache = new Map();

async function getJsonText(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12_000);
  try {
    const res = await fetch(url, { headers: { accept: 'application/json' }, signal: controller.signal });
    const text = await res.text();
    if (!res.ok) throw new Error(`${new URL(url).hostname} returned ${res.status}`);
    return { json: JSON.parse(text), text };
  } finally {
    clearTimeout(timer);
  }
}

/** Pull a numeric field's literal digits from the raw body, so prices keep full precision. */
function literal(text, anchorValue, field) {
  const idx = text.indexOf(anchorValue);
  if (idx === -1) return null;
  const chunk = text.slice(idx, text.indexOf('}', idx) + 1);
  const m = new RegExp(`"${field}"\\s*:\\s*(-?\\d+(?:\\.\\d+)?(?:[eE][-+]?\\d+)?)`).exec(chunk);
  return m ? m[1] : null;
}

function positiveDecimal(s) {
  if (s == null) return null;
  const str = String(s).trim();
  if (!/^\d+(\.\d+)?([eE][-+]?\d+)?$/.test(str)) return null;
  return Number(str) > 0 ? str : null;
}

export function normalizePreStocks(row, rawText = '') {
  const mint = String(row.contract_address ?? '').trim();
  const symbol = String(row.symbol ?? '').trim().toUpperCase();
  if (!mint || !symbol) return null;
  return {
    provider: 'PRESTOCKS',
    category: 'PRIVATE_MARKET',
    symbol,
    name: String(row.name ?? symbol).replace(/\s*PreStocks\s*$/i, '') || symbol,
    mint,
    logo: row.image ?? null,
    markPriceUsd: positiveDecimal(literal(rawText, mint, 'markPrice') ?? row.markPrice),
    providerTokenPriceUsd: positiveDecimal(literal(rawText, mint, 'tokenPrice') ?? row.tokenPrice),
    markValuationUsd: row.markValuation ?? null,
    sourceUrl: row.external_url ?? null,
  };
}

async function cached(key, loader) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.value;
  const value = await loader();
  cache.set(key, { at: Date.now(), value });
  return value;
}

// Frozen snapshot of the live PreStocks catalogue, verified September 2026 --
// used ONLY as a Judge Demo Mode fallback when the live call fails, so a
// flaky network during judging doesn't take down the private-markets picker.
// Never used outside DEMO_MODE, and always tagged `simulated: true`.
const PRESTOCKS_SIMULATED_SNAPSHOT = [
  { name: 'Anduril PreStocks', symbol: 'ANDURIL', contract_address: 'PresTj4Yc2bAR197Er7wz4UUKSfqt6FryBEdAriBoQB', markPrice: '154.58573937', tokenPrice: '154.90797546829887' },
  { name: 'Anthropic PreStocks', symbol: 'ANTHROPIC', contract_address: 'Pren1FvFX6J3E4kXhJuCiAD5aDmGEb7qJRncwA8Lkhw', markPrice: '1047.3719711', tokenPrice: '1059.988541324131' },
  { name: 'Figure AI PreStocks', symbol: 'FIGUREAI', contract_address: 'PreZad18qfPtbxNpMtMuAuX2zVpvkEU8DnJx56faCWd', markPrice: '181.36373437', tokenPrice: '181.32588491572375' },
  { name: 'Kalshi PreStocks', symbol: 'KALSHI', contract_address: 'PreLWGkkeqG1s4HEfFZSy9moCrJ7btsHuUtfcCeoRua', markPrice: '895.32839304', tokenPrice: '888.1303249979064' },
  { name: 'Neuralink PreStocks', symbol: 'NEURALINK', contract_address: 'PrekqLJvJ3qVdXmBGDiexvwUTF4rLFDa6HWS4HJbw9S', markPrice: '336.70540546', tokenPrice: '434.9237658594562' },
  { name: 'OpenAI PreStocks', symbol: 'OPENAI', contract_address: 'PreweJYECqtQwBtpxHL171nL2K6umo692gTm7Q3rpgF', markPrice: '994.4022855061523', tokenPrice: '1114.2171773760422' },
  { name: 'Polymarket PreStocks', symbol: 'POLYMARKET', contract_address: 'Pre8AREmFPtoJFT8mQSXQLh56cwJmM7CFDRuoGBZiUP', markPrice: '144.102964', tokenPrice: '145.81902448087808' },
  { name: 'SpaceX PreStocks', symbol: 'SPACEX', contract_address: 'PreANxuXjsy2pvisWWMNB6YaJNzr7681wJJr2rHsfTh', markPrice: '157.8967793053677', tokenPrice: '117.4615829200521' },
];

export async function fetchPreStocks() {
  return cached('prestocks', async () => {
    try {
      const { json, text } = await getJsonText(PRESTOCKS_URL);
      const rows = Array.isArray(json) ? json : (json?.data ?? json?.items ?? []);
      return rows.map((r) => normalizePreStocks(r, text)).filter(Boolean);
    } catch (err) {
      if (process.env.DEMO_MODE !== 'true') throw err;
      // Judge Demo Mode only: the live catalogue is unreachable, fall back to a
      // frozen snapshot rather than showing an empty private-markets picker.
      return PRESTOCKS_SIMULATED_SNAPSHOT
        .map((r) => normalizePreStocks(r, JSON.stringify(r)))
        .filter(Boolean)
        .map((d) => ({ ...d, simulated: true }));
    }
  });
}
