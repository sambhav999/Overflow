<p align="center">
  <img src="frontend/public/brand/overflow-logo-full.png" alt="Overflow" width="420">
</p>

<p align="center"><b>Keep the source. Program the earnings.</b></p>

<p align="center">
  Live app: <a href="https://overflow-solana.netlify.app">overflow-solana.netlify.app</a>
  · API health: <a href="https://solana-poc.onrender.com/api/health">solana-poc.onrender.com/api/health</a>
  · Program (devnet): <code>nAAStFqtSRsQbuzUARufKs8URPB6sEeUhHnTDK4HqGp</code>
</p>

> Overflow does not consume protected source principal to fund the destination.
> It routes only newly generated value — classified dividends or yield above a
> stored floor.

For pre-IPO/private-market exposure, Overflow integrates PreStocks exclusively. xStocks are used only for public-equity and corporate-action flows.

---

## Demo

| | |
|---|---|
| Live demo | https://overflow-solana.netlify.app |
| Health check | https://solana-poc.onrender.com/api/health |
| Demo Mode | The public deployment is **devnet + Judge Demo only**. `DEMO_MODE=true` signs a judge in with no wallet, against an in-memory database. Fund-moving and registry submits are hard-blocked (`blockedInDemoMode`). `/api/health` reports `mode: "JUDGE_DEMO"`. See [Judge quick-start](#judge-quick-start). |

## Proof

Two real, independently-confirmed **devnet** transactions against the deployed
[Overflow Registry program](programs/overflow-registry), `nAAStFqtSRsQbuzUARufKs8URPB6sEeUhHnTDK4HqGp`,
for the hero rule (Kamino USDC → PreStocks OPENAI):

| Instruction | Signature | Explorer |
|---|---|---|
| `create_rule` | `NNAYBVJbiaYQjFZ7JF4J9kLBfY6Sq6hj3dhKKqWBdyGxb6kU9Xy5X5DZjUzEbTKZVhRrowsA2bcuVbH4AnMbmLT` | [Solscan (devnet)](https://solscan.io/tx/NNAYBVJbiaYQjFZ7JF4J9kLBfY6Sq6hj3dhKKqWBdyGxb6kU9Xy5X5DZjUzEbTKZVhRrowsA2bcuVbH4AnMbmLT?cluster=devnet) |
| `post_receipt` | `4bVHYZfUyku39w3JbEduqHiAyD9sWLUrceWcKJJFKprFaZjL8M334DZXsakn7GEEutAnFCts6WunZVrKUSLSWEa2` | [Solscan (devnet)](https://solscan.io/tx/4bVHYZfUyku39w3JbEduqHiAyD9sWLUrceWcKJJFKprFaZjL8M334DZXsakn7GEEutAnFCts6WunZVrKUSLSWEa2?cluster=devnet) |

Both independently verified with `solana confirm <signature> --url devnet -v`: `Status: Ok`, `Finalized`.

### Devnet money movement (Judge Demo hero)

Real SPL transfers on devnet with **TEST USDC** (a devnet mint, not Circle USDC), produced by
[`backend/scripts/devnet-judge-execution.mjs`](backend/scripts/devnet-judge-execution.mjs):
10,000 TEST USDC protected + 186.40 TEST USDC generated. Only the 186.40 moves; the
10,000 is re-read afterwards and is untouched.

| Step | Signature | Explorer |
|---|---|---|
| 186.40 TEST USDC → PreStocks Devnet/Judge Adapter | `4bLd5QmzQDNfueouLDwUvQRh9vzoLA3q5iu6uSsvjm3DVxUpK46QZ4WQJ1JjvhwcFPzBsHTEJAzGGArdBUgNzZQ2` | [Solscan (devnet)](https://solscan.io/tx/4bLd5QmzQDNfueouLDwUvQRh9vzoLA3q5iu6uSsvjm3DVxUpK46QZ4WQJ1JjvhwcFPzBsHTEJAzGGArdBUgNzZQ2?cluster=devnet) |
| Adapter issues 0.18455445 OAIx-DEMO | `3rXCmkEQYz8cEa5sGoZz2rERVMR9G9DoFMZD36jJBbYKMwTtkVcZzi9kjFZKXyFSgYBmLe86U6PtfB5TRhGCDD7C` | [Solscan (devnet)](https://solscan.io/tx/3rXCmkEQYz8cEa5sGoZz2rERVMR9G9DoFMZD36jJBbYKMwTtkVcZzi9kjFZKXyFSgYBmLe86U6PtfB5TRhGCDD7C?cluster=devnet) |

Balance deltas on the transfer (`getTransaction`, devnet): judge wallet 10,186.40 → 10,000 TEST USDC,
adapter 0 → 186.40.

**PreStocks Devnet/Judge Adapter** ([`prestocksDevnet.js`](backend/src/adapters/providers/prestocksDevnet.js))
is *not* the production PreStocks contract — PreStocks has no devnet deployment. It issues
`OAIx-DEMO`, a devnet stand-in for OpenAI PreStocks, at a **deterministic** price (reference
$1,000.00, execution $1,010.00 → +1.00% premium, inside the rule's +1.50% limit → PASS).

| Label | Meaning |
|---|---|
| REAL DEVNET TX | the transactions above exist on Solana devnet |
| REAL OVERFLOW LOGIC | floor, firewall and split checks are the production code paths |
| DETERMINISTIC MARKET INPUT | the OpenAI PreStocks price is fixed so every run is reproducible |

> **The program records the receipt; the wallet holds the assets.** The registry does not
> independently enforce or mathematically guarantee capital preservation — it is an
> immutable, timestamped log of what the backend already computed and the user already
> signed. The stronger proof is the full chain: **execution → chain reconciliation →
> verified receipt → optional verifier attestation** (see [Jupiter flow](#jupiter-flow)
> and the `Verdict`/verifier-signature fields on every receipt).

**Devnet only.** No mainnet transaction has been made or is implied here, and none is
planned for this submission — the registry is not deployed to mainnet-beta, and there is no
mainnet deploy path in this repo.

## Judge quick-start

No funded wallet or RPC key needed. The app signs you in automatically.

This submission is **devnet + demo only**. There is no mainnet path.

The hero receipt (Story C, TEST USDC → OAIx-DEMO) is backed by the real devnet transactions
above: `mode: "DEVNET"`, verification `DEVNET_TX` — never `LIVE` and never
`VERIFIED_ON_CHAIN`, because its market input is deterministic. Story A (MRKx dividend) has
no chain transaction and stays labeled **SEEDED DEMO** (`mode: "DEMO"`). Story B is a **seeded blocked evaluation** of the known KLACx 10:1
split, run through `classifyCorporateAction` and `dividendPlausibilityCheck` at boot.
It does not call the xStocks API, so the judge demo still works if that API is down.
No receipt or signature is written for Story B.

Fund-moving routes and registry submits return 403. Real registration and signing stay
on a Live Devnet instance (`mode: "LIVE_DEVNET"`, `DEMO_MODE` unset).

```bash
cd backend
npm ci
npm test                      # 84 tests, no network required
npm run simulate:judge        # http://localhost:8787, DEMO_MODE=true
```

Then, separately:

```bash
cd frontend
npm ci
npm run build                 # production bundle in frontend/dist
npm run dev                   # http://localhost:5173
```

Point the frontend at the local demo backend as usual — the on-chain registry step in Setup
below is optional and can be skipped entirely for a judge run. Or skip local setup entirely
and use the live deployment linked above.

Overflow is a programmable earnings layer for onchain assets. It preserves a source
position and routes only the value that position **newly generates** into a destination
the user chose in advance.

Two earnings sources in V1:

| Source | What is preserved | What moves |
|---|---|---|
| xStocks equity (Token-2022) | Pre-event equity exposure | Exposure created by a dividend |
| Kamino USDC Earn vault | A stored principal floor | Value above that floor |

The receipt is the product: it shows what was earned, what moved, and that the source
position survived — with the inputs needed to re-derive every number.

**Overflow does not consume protected source principal to fund the destination.**

---

## The dividend mechanism

xStocks on Solana use the Token-2022 **Scaled UI Amount** extension. A holder's RAW
balance never changes on a corporate action. Instead the mint's multiplier changes, and
wallets display `raw × multiplier`. A cash dividend therefore arrives as an increase in
effective equity exposure, not as new tokens.

To route the dividend while leaving the original exposure intact:

```
want:        remainingRaw × m1  ==  R × m0
so:          remainingRaw       ==  R × m0 / m1
therefore:   dividendRaw        ==  R − R×m0/m1  ==  R × (m1 − m0) / m1
```

**The implemented formula:**

```
dividendRaw = floor( R × (m1 − m0) / m1 )
```

where `R` is the raw Token-2022 balance, `m0` the multiplier before activation and `m1`
the multiplier after.

Flooring `dividendRaw` rounds `remainingRaw` **up**, which makes

```
remainingExposure ≥ preEventExposure
```

hold **exactly**, with no tolerance. Every quantity is `BigInt`, so that inequality is a
proof rather than an approximation. It is asserted immediately before any transaction is
built, and a failure is a hard stop.

### Verified on real data

Real MRKx dividend, 14 June 2026, on a 10.00000000 MRKx holding:

```
m0 → m1              1.0165817315911818 → 1.0216625054701978
pre-event exposure   10.16581731 MRK
post-event exposure  10.21662505 MRK
dividend created      0.05080773 MRK  (0.4998%)
raw routed out        4,973,045 of 1,000,000,000 raw units
remaining exposure   10.16581731 MRK  ✓ exactly preserved
```

---

## Why only `Dividend`

**A stock split raises the multiplier too — by far more than a dividend does.**

Real events pulled from xStocks multiplier history:

| Asset | Event | Multiplier | Naive extraction would route |
|---|---|---|---|
| MRKx | Dividend | 1.01658 → 1.02166 | 0.50% ✓ |
| KLACx | Split | 1.00089 → **10.00892** | **90.00%** ✗ |
| NFLXx | Split | 1 → **10** | **90.00%** ✗ |
| CRWDx | Split | 1 → **4** | **75.00%** ✗ |
| AZNx | ReverseSplit | 1.00387 → 0.50194 | (multiplier falls) |

A split creates no economic value. An implementation that simply watched the multiplier
rise would have **liquidated 90% of a KLACx holder's position** and called it a dividend.

Event classification is therefore a **safety control, not metadata**. Overflow uses an
**allowlist** so unknown future event types fail closed:

```
SUPPORTED_REASONS = ['Dividend']
```

Values observed across all **832** Solana-deployed xStocks (September 2026):
`Dividend` (583), `Split` (8), `Administrative` (3), `ReverseSplit` (2).

> Note: the live API uses the string `"Dividend"`. Earlier drafts of this spec referred to
> ISO-style codes (`DVCA` / `SPLF` / `SPLR`); those do **not** appear in the xStocks
> response and must not be matched on.

Three independent controls must all pass before an extraction executes:

1. **Classification** — the event is `Dividend` (allowlist).
2. **Direction** — `m1 > m0`, or the maths refuses to run at all.
3. **Plausibility** — the extraction is ≤ 500 bps of the position, or it is blocked.

---

## Raw vs scaled — the rule that governs everything

```
RAW    → every transaction, every calculation, every stored value
SCALED → display only  (scaled = raw × multiplier)
```

Jupiter's `amount` parameter is **raw atomic units** and is never multiplier-adjusted.
`uiAmount` from an RPC is a display figure and never reaches a transaction.

Multipliers carry ~17 significant digits (`1.0216625054701978`), which is at the edge of
IEEE-754 double precision. Overflow extracts the **literal digit string** from the raw
JSON body rather than parsing through a `Number`, then scales it to a `BigInt`. There is
no float anywhere in the accounting path.

The multiplier is also **cross-checked against the chain** before acting. The on-chain
`scaledUiAmountConfig` stores `multiplier`, `newMultiplier` and
`newMultiplierEffectiveTimestamp`, so the effective value is time-dependent — reading
`multiplier` alone returns a stale value after an activation has passed.

---

## Principal-floor accounting (Kamino)

The floor is a **ledger value**, moved only by confirmed user intent:

```
deposit confirmed              → floor += depositedUSDC
principal withdrawal confirmed → floor −= withdrawnUSDC
yield harvest                  → floor unchanged
```

It is **never re-derived from the current position value**. Re-deriving it would let the
floor drift upward as the position appreciates until principal itself became harvestable.

```
harvestable = max(0, redeemableValue − principalFloor − safetyBuffer)
safetyBuffer = max($0.50, 5 bps of floor)
```

**Shares are not 1:1 with USDC.** A live read of the Kamino USDC vault returns an exchange
rate of `1.0586248…` USDC per share. Converting a USDC amount to shares therefore
**rounds down, always** — rounding up is the single most likely way this system would ever
spend principal. The cost of rounding down is dust left earning yield.

If the position is impaired, Overflow reports the real shortfall rather than implying a
guarantee.

---

## Architecture

```
┌────────────────────────────── frontend/ (React + Vite) ──────────────────────────────┐
│  Wallet Standard discovery · signs raw transaction BYTES · holds no secrets           │
└───────────────────────────────────────┬──────────────────────────────────────────────┘
                                        │ HTTP
┌───────────────────────────────────────▼─────────── backend/ (Node + Express) ────────┐
│                                                                                       │
│   routes/ ── services/ ─┬─ evaluate  ──┐                                             │
│                         ├─ execute    ─┤                                             │
│                         └─ replay     ─┤                                             │
│                                        ▼                                             │
│   core/   units · dividend · principal · guards · idempotency · ruleEngine           │
│           └── BigInt only · no SDK imports · no signing                              │
│                                        │                                             │
│   adapters/ ─┬─ xstocks/  assets · multiplier · corporateActions                     │
│              ├─ jupiter/  order → sign → execute   (API key stays here)              │
│              ├─ kamino/   klend-sdk, dynamically loaded, degrades gracefully         │
│              ├─ providers/ PreStocks: verified mint/markPrice/tokenPrice fields      │
│              ├─ pyth/      Pyth Pro reads for PYTH_PARITY (unverified, no key yet)   │
│              ├─ solana/   dependency-free JSON-RPC reads                             │
│              └─ registry/ Overflow Receipt Registry encoder + PDA                    │
│                                                                                       │
│   db/  rules · snapshots · receipts · stranded_funds     (node:sqlite, no native deps)│
│   poller/  corporate-action detection — never signs                                  │
└──────────────────────────────────────────────────────────────────────────────────────┘
                                        │
┌───────────────────────────────────────▼──────────────────────────────────────────────┐
│  programs/overflow-registry  create_rule + post_receipt PDAs  (holds no tokens)       │
└──────────────────────────────────────────────────────────────────────────────────────┘
```

**The rule engine contains no protocol SDK calls.** Adapters return normalized data; the
engine decides eligibility and emits an immutable execution intent. That boundary is what
lets a new earnings source be added without touching the invariant.

The Receipt Registry is a small Solana program. After a harvest confirms, the same wallet
posts a one-time receipt PDA so the execution key cannot be recorded twice on chain.
Until `OVERFLOW_REGISTRY_PROGRAM_ID` is set, the API skips those transactions.

---

## Jupiter flow

```
GET /swap/v2/order  →  user's wallet signs the bytes  →  POST /swap/v2/execute
```

The API key lives only on the backend. The browser talks to Overflow, which proxies.

Guards applied to the live quote immediately before signature — re-evaluated from fresh
data, never trusted from an earlier evaluation:

- a route exists and returns a signable transaction
- `priceImpactPct` is below the configured ceiling
- quote slippage is within the rule's limit
- **the quote amount matches the execution intent exactly**
- the execution key is unused
- the wallet holds enough SOL for fees and token-account rent
- the source balance still covers the extraction

**A quote is not a spend.** Nothing is marked executed because a route existed — only
because a transaction confirmed.

### Partial failure

The interest rule withdraws USDC from Kamino *before* swapping. If the swap then fails,
that USDC is in the wallet and is neither principal nor a completed harvest. It is
recorded in `stranded_funds` and the next execution sweeps it **before** withdrawing
anything more. The receipt shows `PARTIAL`, never `CONFIRMED`.

---

## Kamino money movement

Three flows, each `prepare` -> wallet signs -> `submit`. The backend holds no key:
it compiles an unsigned transaction with the user as fee payer, simulates it, and
hands over the wire bytes.

| Flow | Endpoints |
|---|---|
| Deposit | `POST /rules/:id/deposit` -> `POST /rules/:id/deposit/submit` |
| Harvest withdrawal | `POST /rules/:id/prepare` (stage `WITHDRAW`) -> `POST /rules/:id/harvest/withdraw/submit` |
| Principal withdrawal | `POST /rules/:id/withdraw-principal` -> `POST /rules/:id/withdraw-principal/submit` |

**The principal floor moves only on a confirmed signature**, and only in the submit
call. A failed or timed-out transaction leaves it exactly where it was.

### A harvest is two signatures

Earnings must leave the vault before they can be swapped, and Jupiter returns a
complete hosted transaction that cannot be merged with Kamino instructions. So:

```
stage WITHDRAW   Kamino withdrawal of exactly the harvestable amount
                 -> recorded as "withdrawn, awaiting swap"
stage SWAP       Jupiter swap of that USDC into the destination
                 -> receipt CONFIRMED, record marked swept
```

If the swap fails between those steps the USDC is in the wallet and is already
recorded, so the next execution **sweeps it before withdrawing anything more**.
A retry never withdraws on top of funds that are already out.

### Nothing unsimulated reaches a wallet

Every Kamino transaction is simulated before it is offered for signature. Two
failures that the chain reports identically as a bare `InvalidAccountForFee` are
checked up front and explained in words instead:

- the wallet holds no SOL for fees and rent
- the address is not System-Program-owned (a token account or PDA cannot pay fees)

---

## Live vs Replay Mode

|  | Live | Replay |
|---|---|---|
| Data | Real chain + real APIs | Real historical corporate action |
| Balance | The wallet's actual balance | **Stated hypothetical** |
| Transaction | Signed, broadcast, confirmed | **None** |
| Receipt | `CONFIRMED` with a signature | No receipt is written |
| Labelling | — | `REPLAY MODE` banner on every surface |

Replay Mode exists because dividends are **scheduled events**. A scan of all 832
Solana-deployed xStocks found **zero pending corporate actions** at the time of writing, so
a live dividend cannot be summoned on demand.

Replay is also where the safety control is most visible: replaying the real KLACx 10:1
split shows exactly what a naive implementation would have sold.

**Replay Mode is never presented as live execution.** No signature, no confirmed receipt,
and no claim that any wallet held the replayed position.

---

## Setup

Requires **Node 22+** (uses the built-in `node:sqlite`, so there is no native build step).

```bash
# backend
cd backend
cp .env.example .env          # set SOLANA_RPC_URL at minimum
npm ci
npm test                      # 84 tests, no network required
npm run dev                   # http://localhost:8787

# frontend
cd ../frontend
cp .env.example .env
npm ci
npm run build                 # production bundle in frontend/dist
npm run dev                   # http://localhost:5173
```

`npm ci` installs exactly what's pinned in `package-lock.json` — no local `node_modules`
state is assumed. Verified end to end from a clean install (`node_modules` removed, not
just `rm -rf` on a fresh clone) immediately before this document was last updated.

### Environment

**backend/.env**

| Variable | Required | Notes |
|---|---|---|
| `SOLANA_RPC_URL` | **yes for live** | A public endpoint rate-limits immediately. Use Helius / Triton / QuickNode. |
| `JUPITER_API_KEY` | no | Keyless works for prototyping with tight limits. Stays server-side. |
| `KAMINO_USDC_VAULT` | no | Ships with a verified live vault (`HDsayq…WRS5E`). Used as the default when a rule is created without an explicit vault; a rule may override it. |
| `XSTOCKS_API_BASE` | no | Defaults to the public API; no auth needed. |
| `POLL_INTERVAL_MS` | no | Blank = poll only on demand via `POST /api/poll`. |
| `CRON_SECRET` | no | Required header for `/api/poll` when set. |
| `VERIFIER_SIGNING_KEY` | **yes in production** | Ed25519 seed the server signs Proof of Preservation attestations with. Not a wallet key. |
| `DEMO_MODE` | no | `true` runs Judge Demo Mode (`mode: "JUDGE_DEMO"`). The public judge deploy uses this. Unset only for a Live Devnet instance. |

**frontend/.env** holds no secrets — Vite inlines `VITE_*` into the bundle.

### Pinned dependency versions

`@kamino-finance/klend-sdk@7.3.22` needs `@solana/kit@^2.3.0` (not v4+), and
`@solana-program/compute-budget@^0.8.0` (0.18.x requires kit v8 and will not resolve).
`@kamino-finance/farms-sdk` is pinned to `3.2.24`: version 3.2.26 removed a file that
klend-sdk still imports. These pins are recorded in `backend/package.json` under
`optionalDependencies` and `overrides`.

The Kamino adapter loads dynamically and degrades gracefully — the dividend rule works
whether or not the Kamino dependency resolves. `decimal.js` is a hard `dependency`, not
optional: `adapters/kamino/vault.js` imports it at runtime for the interest rule, and an
`optionalDependency` can be silently skipped by `npm ci` on any install hiccup — that
would break a core feature without `npm ci` itself ever failing.

---

## Tests

```bash
cd backend && npm test
```

84 tests across 11 files, no network required. Highlights:

- the preservation inequality holds across 400 different raw balances
- rounding always favours the user; a sub-unit dividend floors to zero and refuses to swap
- a 10:1 split is caught by **two independent controls**
- a reverse split cannot enter the maths at all
- the allowlist rejects `Split`, `ReverseSplit`, `Administrative` and unknown types
- four consecutive real MRKx dividends compose without breaching the invariant
- the principal floor survives 50 harvests unchanged and does not track an appreciating position
- share conversion never overdraws; an impaired position reports a shortfall
- execution keys are stable per event and distinguish separate observations
- a full deposit -> 52 weekly harvests -> principal withdrawal cycle never moves the
  floor except on deposit and withdrawal
- share conversion rounds down at the **real** vault exchange rate across 500 sizes
- multiple deposits accumulate; over-withdrawal cannot drive the floor negative
- a failed withdrawal leaves the floor untouched
- wallet sign-in messages are single-use and expire; tampering changes the signed hash
- the on-chain PDA derivation matches an independent Rust fixture byte-for-byte
- `create_rule` / `post_receipt` instruction layouts and account orderings are pinned by test
- explorer signature links are tagged and clustered correctly without live chain RPC

---

## Limitations

- **V1 is non-custodial and user-signed.** Overflow holds no key and never trades
  unattended. The poller detects events; it never signs.
- **"Preserved" is an accounting rule, not a capital guarantee.** USDC, Kamino, smart
  contracts, liquidity and issuer structures all carry risk.
- **These xStocks mints carry Token-2022 `transferHook`, `permanentDelegate` and
  `pausableConfig` extensions.** A permanent delegate can move tokens; a pausable mint can
  be frozen. Verified on-chain, disclosed rather than hidden.
- **Routability is time-varying and must be treated as live state, not a fixed property.**
  Of 832 Solana deployments only ~50 dividend-paying assets had a live Jupiter route when
  first sampled. MRKx was refused by both the lite and pro endpoints at that point and
  quoted normally a short time later. A rule is therefore refused at creation only on a
  CONFIRMED lack of route, and the route is always re-quoted against fresh data
  immediately before signing.
- **A rate limit is not a routing verdict.** The keyless Jupiter endpoint returns HTTP 429
  under modest use. `isTradable` reports three outcomes — routable, not routable, and
  `unknown` — because reporting "could not ask" as "no route exists" blocks perfectly
  tradable assets. Probes are cached for 5 minutes, retried with backoff on 429/5xx, and
  the create-rule form debounces its check. Set `JUPITER_API_KEY` to avoid this entirely.
- **Dividends activate at 00:30 UTC**, outside US market hours and in the thinnest book of
  the day. Execution defers to a deeper market unless `allowOvernight` is set.
- **Eligibility for tokenized equities is jurisdictional** and is the user's
  responsibility. It is deliberately separate from technical routing.
- A pending corporate action exposes no stable id, so pre-activation snapshots are keyed on
  activation time and reconciled against the published id once history carries it.
- The default Kamino vault (`HDsayqAsDWy3QvANGqh2yNraqcD8Fnjgh73Mhb3WRS5E`) was verified
  live in September 2026 — 18,278,326 shares issued, 76,810 USDC available, exchange rate
  1.0586 USDC/share. Re-verify before deploying, and note `getTokenLargestAccounts`
  returns nothing for its Token-2022 share mint, which is a quirk of that call and not an
  empty vault.
- `KaminoManager` in klend-sdk 7.x has no `loadVaultFarmState` (that name appears in older
  examples and throws a `TypeError`); `farmState` is an optional argument the SDK resolves
  itself.
- The stock **basket** from the earlier V1 brief is not implemented: a rule routes to one
  destination, not to weighted allocations across several.

---

## Protocol references

- Kamino klend-sdk — vault holdings, APY, exchange rate, deposit/withdraw instructions
- Jupiter Swap V2 — `/order` → sign → `/execute`
- xStocks public API — assets, multiplier, multiplier history
- Token-2022 Scaled UI Amount extension
- Solana Wallet Standard

## Deployment checklist

- [ ] `SOLANA_RPC_URL` points at a dedicated provider
- [ ] `JUPITER_API_KEY` set
- [ ] `KAMINO_USDC_VAULT` verified live
- [x] Deployed URL: frontend — https://overflow-solana.netlify.app · API — https://solana-poc.onrender.com
- [ ] Render env for the **judge** backend: `NETWORK=devnet`, `DEMO_MODE=true`
      (see [deploy/devnet.md](deploy/devnet.md)). No mainnet env.
- [ ] Demo video: $10K protected → $186.40 earned → Firewall PASS → PreStocks allocation →
      unsafe split BLOCKED → $0 principal used → real devnet receipt
- [x] Confirmed transaction signatures: see [Proof](#proof) — real, devnet, independently
      verified with `solana confirm`
