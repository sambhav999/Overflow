#!/usr/bin/env node
/**
 * One-time devnet execution for the Judge Demo. Produces the real devnet
 * transactions the demo's Proof of Preservation links to.
 *
 *   1. TEST USDC: 10,000 protected principal + 186.40 generated earnings
 *   2. Move exactly 186.40 TEST USDC to the PreStocks Devnet/Judge Adapter
 *   3. Adapter issues OAIx-DEMO at the deterministic execution price
 *   4. Re-read balances: the 10,000 TEST USDC must be untouched
 *
 * Devnet only. Fees are paid by the Solana CLI keypair. Two extra keypairs
 * (judge user, adapter) are created under ~/.config/solana and never enter
 * the repo. Output (public addresses + signatures only) is written to
 * src/db/devnetJudgeExecution.json.
 *
 * Usage: node scripts/devnet-judge-execution.mjs
 */
import { execFileSync } from 'node:child_process';
import { existsSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { PRESTOCKS_DEVNET_ADAPTER, quoteOaixDemoRaw, devnetPremiumBps } from '../src/adapters/providers/prestocksDevnet.js';

const RPC = 'https://api.devnet.solana.com';
const DIR = join(homedir(), '.config', 'solana');
const FEE_PAYER = join(DIR, 'id.json');
const USER_KEY = join(DIR, 'overflow-judge-user.json');
const ADAPTER_KEY = join(DIR, 'overflow-prestocks-devnet-adapter.json');
const OUT = new URL('../src/db/devnetJudgeExecution.json', import.meta.url);

const PRINCIPAL = '10000';
const EARNINGS = '186.40';
const EARNINGS_ATOMIC = '186400000';

const sh = (cmd, args) => execFileSync(cmd, args, { encoding: 'utf8' }).trim();
const spl = (...args) => JSON.parse(sh('spl-token', [...args, '--url', RPC, '--fee-payer', FEE_PAYER, '--output', 'json']));
const pubkey = (file) => sh('solana-keygen', ['pubkey', file]);
const sig = (out) => out.signature ?? out.transactionData?.signature;

for (const f of [USER_KEY, ADAPTER_KEY]) {
  if (!existsSync(f)) sh('solana-keygen', ['new', '--no-bip39-passphrase', '--silent', '-o', f]);
}
const user = pubkey(USER_KEY);
const adapter = pubkey(ADAPTER_KEY);
console.log(`judge user ${user}\nadapter    ${adapter}`);

const testUsdc = spl('create-token', '--decimals', '6');
const oaix = spl('create-token', '--decimals', String(PRESTOCKS_DEVNET_ADAPTER.assetDecimals), '--mint-authority', adapter);
const testUsdcMint = testUsdc.commandOutput.address;
const oaixMint = oaix.commandOutput.address;
console.log(`TEST USDC ${testUsdcMint}\nOAIx-DEMO ${oaixMint}`);

const userUsdc = spl('create-account', testUsdcMint, '--owner', user).commandOutput?.address ?? null;
spl('create-account', testUsdcMint, '--owner', adapter);
spl('create-account', oaixMint, '--owner', user);
const ata = (mint, owner) => sh('spl-token', ['address', '--token', mint, '--owner', owner, '--verbose', '--url', RPC]).match(/Associated token address: (\w+)/)[1];
const userUsdcAta = userUsdc ?? ata(testUsdcMint, user);
const userOaixAta = ata(oaixMint, user);

const depositSig = sig(spl('mint', testUsdcMint, PRINCIPAL, userUsdcAta));
const earningsSig = sig(spl('mint', testUsdcMint, EARNINGS, userUsdcAta));
const transferSig = sig(spl('transfer', testUsdcMint, EARNINGS, adapter, '--owner', USER_KEY, '--allow-unfunded-recipient'));
const oaixRaw = quoteOaixDemoRaw(EARNINGS_ATOMIC);
const oaixUi = (Number(oaixRaw) / 10 ** PRESTOCKS_DEVNET_ADAPTER.assetDecimals).toFixed(PRESTOCKS_DEVNET_ADAPTER.assetDecimals);
const allocationSig = sig(spl('mint', oaixMint, oaixUi, userOaixAta, '--mint-authority', ADAPTER_KEY));

const bal = (mint, owner) => sh('spl-token', ['balance', mint, '--owner', owner, '--url', RPC]);
const userUsdcAfter = bal(testUsdcMint, user);
const userOaixAfter = bal(oaixMint, user);
if (Number(userUsdcAfter) !== Number(PRINCIPAL)) throw new Error(`principal changed: ${userUsdcAfter} TEST USDC`);

const result = {
  cluster: 'devnet',
  adapter: { ...PRESTOCKS_DEVNET_ADAPTER, premiumBps: devnetPremiumBps(), authority: adapter },
  judgeUser: user,
  mints: { testUsdc: testUsdcMint, oaixDemo: oaixMint },
  amounts: { principalTestUsdc: PRINCIPAL, earningsTestUsdc: EARNINGS, earningsAtomic: EARNINGS_ATOMIC, oaixDemoRaw: oaixRaw },
  signatures: { deposit: depositSig, earnings: earningsSig, transfer: transferSig, allocation: allocationSig },
  after: { userTestUsdc: userUsdcAfter, userOaixDemo: userOaixAfter },
  executedAt: new Date().toISOString(),
};
writeFileSync(OUT, `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify(result, null, 2));
