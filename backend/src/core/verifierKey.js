/**
 * Verifier attestation.
 *
 * After a settlement is re-read from chain and proven (verify.js), the server
 * signs the resulting proof object with its own Ed25519 key -- separate from
 * any wallet key, never used to sign a transaction -- so the proof can be
 * checked offline against a known public key rather than trusted because it
 * came from this API.
 *
 * Mirrors the sign side of the Ed25519 verification already used for wallet
 * sign-in (auth/session.js): Node's built-in `crypto.sign`/`crypto.verify`
 * with `algorithm = null`, no external dependency.
 */
import { createHash, createPrivateKey, createPublicKey, generateKeyPairSync, randomBytes, sign, verify } from 'node:crypto';
import { base58Encode } from './base58.js';

// PKCS8 DER prefix for a raw 32-byte Ed25519 private key (seed).
const ED25519_PKCS8_PREFIX = Buffer.from('302e020100300506032b657004220420', 'hex');
// SPKI DER prefix for a raw 32-byte Ed25519 public key (mirrors session.js).
const ED25519_SPKI_PREFIX = Buffer.from('302a300506032b6570032100', 'hex');

let cached = null;
let ephemeralWarned = false;

function loadKeyPair() {
  if (cached) return cached;
  const raw = process.env.VERIFIER_SIGNING_KEY;
  let privateKey;
  if (raw) {
    const seed = Buffer.from(raw.trim(), raw.trim().length === 64 ? 'hex' : 'base64');
    if (seed.length !== 32) throw new Error('VERIFIER_SIGNING_KEY must decode to exactly 32 bytes (hex or base64).');
    privateKey = createPrivateKey({ key: Buffer.concat([ED25519_PKCS8_PREFIX, seed]), format: 'der', type: 'pkcs8' });
  } else {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('VERIFIER_SIGNING_KEY is required in production.');
    }
    // Development only: an ephemeral keypair, so attestations do not verify across restarts.
    ({ privateKey } = generateKeyPairSync('ed25519'));
    if (!ephemeralWarned) {
      ephemeralWarned = true;
      console.warn('[verifier] VERIFIER_SIGNING_KEY not set; using an ephemeral keypair. Proofs will not verify after a restart.');
    }
  }
  const publicKey = createPublicKey(privateKey);
  const rawPublicKey = publicKey.export({ format: 'der', type: 'spki' }).subarray(ED25519_SPKI_PREFIX.length);
  cached = { privateKey, publicKeyBytes: rawPublicKey, publicKeyBase58: base58Encode(rawPublicKey) };
  return cached;
}

/** SHA-256 hex digest of a canonical (stably-ordered) JSON string. Not secret, just a stable content id. */
export function canonicalHash(obj) {
  return createHash('sha256').update(JSON.stringify(sortKeys(obj))).digest('hex');
}

/** Sign UTF-8 text with the verifier's Ed25519 key. Returns a base64 signature. */
export function signProof(canonicalText) {
  const { privateKey } = loadKeyPair();
  return sign(null, Buffer.from(canonicalText), privateKey).toString('base64');
}

/** The verifier's public key, base58-encoded (Solana-style), for clients to verify against. */
export function verifierPublicKey() {
  return loadKeyPair().publicKeyBase58;
}

/** Check a proof's signature against the verifier's own current key. Used in tests/tooling, not the hot path. */
export function verifyProofSignature({ canonicalText, signatureBase64, publicKeyBytes }) {
  const key = createPublicKey({
    key: Buffer.concat([ED25519_SPKI_PREFIX, Buffer.from(publicKeyBytes)]),
    format: 'der',
    type: 'spki',
  });
  return verify(null, Buffer.from(canonicalText), key, Buffer.from(signatureBase64, 'base64'));
}

function sortKeys(value) {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((k) => [k, sortKeys(value[k])]));
  }
  return value;
}
