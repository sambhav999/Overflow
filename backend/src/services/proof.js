/**
 * Portable Proof JSON.
 *
 * A pure projection of a receipt's already-persisted, already-verified fields
 * into the `overflow.preservation-proof.v1` shape -- nothing here recomputes
 * anything verify.js hasn't already proven. Deterministic given the same
 * receipt, so it can be rebuilt for export without re-signing: the verifier
 * signature stored on the receipt at settlement time still applies.
 *
 * The verifier signs `buildProofPayload()` -- the proof WITHOUT a `verifier`
 * key at all, not with one nulled out. That is the exact text an external
 * verifier must reconstruct: take the served JSON, delete `verifier`,
 * `JSON.stringify` it, and check `signature` against that text with
 * `publicKey`. A signature that covered its own envelope could never be
 * checked against the object as actually delivered.
 */
export const PROOF_SCHEMA = 'overflow.preservation-proof.v1';

export function buildProofPayload(receipt) {
  const outputs = receipt.outputs || {};
  const proofs = receipt.proofs || outputs.proofs || {};
  const isDividend = receipt.kind === 'DIVIDEND';

  return {
    schema: PROOF_SCHEMA,
    ruleId: receipt.ruleId,
    receiptId: receipt.id,
    wallet: receipt.wallet,
    kind: receipt.kind,
    mode: receipt.mode,
    status: receipt.status,
    sourceBefore: isDividend ? (outputs.sourceBeforeRaw ?? null) : (outputs.principalFloorAtomic ?? null),
    protectedFloor: isDividend ? (outputs.exposureBefore ?? null) : (outputs.principalFloorAtomic ?? null),
    earningsGenerated: absString(proofs.authorisedSourceDelta),
    authorizedSpend: proofs.authorisedSourceDelta ?? null,
    observedSpend: proofs.observedSourceDelta ?? null,
    destinationReceived: outputs.outputAmountResult ?? null,
    sourceAfter: isDividend ? (outputs.sourceAfterRaw ?? null) : (outputs.redeemableAfterAtomic ?? null),
    protectedCapitalConsumedAtomic: receipt.preserved ? '0' : null,
    policyHash: receipt.policyHash ?? null,
    solana: { signature: receipt.signature ?? null, slot: receipt.slot ?? null },
  };
}

/** The payload plus the verifier's signature over that exact payload -- what GET /proof serves. */
export function buildPreservationProof(receipt) {
  return {
    ...buildProofPayload(receipt),
    verifier: {
      publicKey: receipt.verifierPubkey ?? null,
      signature: receipt.verifierSignature ?? null,
      algorithm: receipt.verifierPubkey ? 'ed25519' : null,
    },
  };
}

function absString(v) {
  if (v === null || v === undefined) return null;
  try {
    const n = BigInt(v);
    return (n < 0n ? -n : n).toString();
  } catch {
    return null;
  }
}
