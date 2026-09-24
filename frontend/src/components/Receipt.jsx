import { useState } from 'react';
import { formatRaw, formatUsd, formatDateTime, explorerUrl, shortAddress } from '../lib/format.js';
import { api } from '../lib/api.js';
import { describeVerification, VERIFYING_ONCHAIN_NOTICE } from '../lib/firewallCopy.js';
import Verdict from './Verdict.jsx';

/**
 * Proof of Preservation. It shows the inputs the decision was made on, the
 * outputs, and -- explicitly, as numbers rather than just a checkmark --
 * what was authorised to move, what was actually observed to move, and that
 * protected capital was never touched.
 *
 * "Confirmed" and "verified" are different claims (see execute.js: delivery
 * succeeding is a separate axis from preservation being proven). A confirmed
 * transaction never gets a checkmark it hasn't earned -- see describeVerification.
 */
export default function Receipt({ receipt }) {
  if (!receipt) return null;
  const { inputs = {}, outputs = {}, proofs = {}, kind, mode, status } = receipt;
  const isDividend = kind === 'DIVIDEND';
  const failed = status !== 'CONFIRMED';
  const verif = describeVerification(receipt);

  return (
    <div className="receipt">
      <div className="receipt-title">
        PROOF OF PRESERVATION — {isDividend ? 'DIVIDEND RULE' : 'INTEREST RULE'} · {status}
        {(mode === 'DEMO' || receipt.verification === 'SEEDED') && ' · SEEDED DEMO'}
        {mode === 'REPLAY' && ' · REPLAY'}
      </div>
      <Verdict
        verification={receipt.verification}
        note={receipt.verificationNote}
        proofs={receipt.proofs}
      />

      {isDividend ? (
        <>
          <Row k="Source" v={`${inputs.symbol ?? '-'}`} />
          <Row k="Corporate action" v={inputs.corporateActionId ?? '-'} />
          <Row k="Event type" v={inputs.reason ?? '-'} />
          <hr />
          <Row k="Pre-event exposure" v={`${inputs.preEventExposureDisplay ?? '-'} ${inputs.symbol ?? ''}`} />
          <Row k="Multiplier" v={`${inputs.multiplierBefore ?? '?'} → ${inputs.multiplierAfter ?? '?'}`} />
          <Row k="Dividend-created exposure" v={`${inputs.dividendExposureDisplay ?? '-'} ${inputs.symbol ?? ''}`} />
          <Row k="Raw units routed" v={inputs.dividendRawAtomic ?? '-'} />
          <hr />
          <Row k="Routed to" v={inputs.destinationSymbol ?? '-'} className="equity" />
          <Row k="Received" v={outputs.outputAmountResult ? formatRaw(outputs.outputAmountResult, inputs.destinationDecimals ?? 8, 8) : '-'} className="equity" />
          <Row k="Remaining source exposure"
               v={`${outputs.exposureAfter ?? inputs.remainingExposureDisplay ?? '-'} ${inputs.symbol ?? ''} ${verif.tone === 'preserved-yes' ? '✓' : ''}`}
               className={verif.tone === 'preserved-yes' ? 'preserved-yes' : (verif.tone === 'bad' ? 'bad' : '')} />
          {verif.tone !== 'preserved-yes' && status === 'CONFIRMED' && receipt.verification !== 'SEEDED' && (
            <div className="hint" style={{ marginTop: 2 }}>
              {verif.tone === 'bad' ? 'Preservation check failed' : VERIFYING_ONCHAIN_NOTICE}
            </div>
          )}
        </>
      ) : (
        <>
          <Row k="Principal floor" v={formatUsd(inputs.principalFloorAtomic)} />
          <Row k="Redeemable value" v={formatUsd(inputs.redeemableAtomic)} />
          <Row k="Safety buffer" v={formatUsd(inputs.safetyBufferAtomic)} />
          <Row k="Earnings harvested" v={formatUsd(inputs.harvestableAtomic)} className="preserved-yes" />
          <hr />
          <Row k="Destination" v={inputs.destinationSymbol ?? '-'} className="equity" />
          <Row k="Received" v={outputs.outputAmountResult ? formatRaw(outputs.outputAmountResult, inputs.destinationDecimals ?? 8, 8) : '-'} className="equity" />
          <Row k="Principal used to buy" v={verif.label} className={verif.tone} />
          {verif.tone === 'warn' && receipt.verification !== 'SEEDED' && (
            <div className="hint" style={{ marginTop: 2 }}>{VERIFYING_ONCHAIN_NOTICE}</div>
          )}
        </>
      )}

      <hr />
      <Row k="Authorized spend" v={proofs.authorisedSourceDelta != null ? absAtomic(proofs.authorisedSourceDelta, isDividend, inputs) : '-'} />
      <Row k="Observed spend" v={proofs.observedSourceDelta != null ? absAtomic(proofs.observedSourceDelta, isDividend, inputs) : '-'} />
      <Row k="Protected capital intentionally consumed"
           v={receipt.preserved === true ? `${formatUsd('0')} ✓` : (receipt.preserved === false ? 'NOT VERIFIED' : '—')}
           className={receipt.preserved === true ? 'preserved-yes' : (receipt.preserved === false ? 'bad' : '')} />

      <hr />
      {receipt.signature ? (
        <Row k="Solana tx" v={<a href={explorerUrl(receipt.signature)} target="_blank" rel="noreferrer">{shortAddress(receipt.signature, 8)}</a>} />
      ) : (
        <Row k="Solana tx" v="— no chain tx (illustrative) —" />
      )}
      {receipt.onchainSignature && (
        <Row k="Registry tx" v={<a href={explorerUrl(receipt.onchainSignature)} target="_blank" rel="noreferrer">{shortAddress(receipt.onchainSignature, 8)}</a>} />
      )}
      {receipt.policyHash && <Row k="Policy hash" v={`${receipt.policyHash.slice(0, 8)}…${receipt.policyHash.slice(-6)}`} />}
      <Row k="Timestamp" v={formatDateTime(receipt.createdAt)} />
      {receipt.error && <div className="notice bad" style={{ marginTop: 10 }}>{receipt.error}</div>}
      {status === 'PARTIAL' && (
        <div className="notice warn" style={{ marginTop: 10 }}>
          Earnings were withdrawn but the swap did not confirm. The USDC is in your wallet and
          is recorded as stranded; the next execution sweeps it before withdrawing anything more.
        </div>
      )}
      {status === 'CONFIRMED' && <ProofDownload receipt={receipt} />}
    </div>
  );
}

/** authorisedSourceDelta/observedSourceDelta are signed atomic deltas (a spend is negative). */
function absAtomic(v, isDividend, inputs) {
  try {
    const n = BigInt(v);
    const abs = (n < 0n ? -n : n).toString();
    return isDividend ? `${formatRaw(abs, 8, 8)} ${inputs.symbol ?? ''}` : formatUsd(abs);
  } catch {
    return '-';
  }
}

function ProofDownload({ receipt }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function download() {
    setBusy(true); setError(null);
    try {
      const proof = await api.receiptProof(receipt.ruleId, receipt.id);
      const blob = new Blob([JSON.stringify(proof, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `overflow-proof-${receipt.id}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="controls" style={{ marginTop: 10 }}>
      <button className="btn small" onClick={download} disabled={busy}>
        {busy ? 'Preparing…' : 'Download proof JSON'}
      </button>
      {error && <span className="pill bad">{error}</span>}
    </div>
  );
}

function Row({ k, v, className = '' }) {
  return (
    <div className="receipt-row">
      <span className="k">{k}</span>
      <span className={`v ${className}`}>{v}</span>
    </div>
  );
}
