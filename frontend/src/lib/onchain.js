import { api } from './api.js';

/**
 * Sign and submit a registry transaction the API already prepared.
 * Returns null when the program is not configured yet.
 */
export async function settleRegistryTx({ connection, prepared, submit }) {
  if (!prepared?.available || !prepared.transaction) return null;
  if (prepared.simulation && prepared.simulation.ok === false) return null;
  if (!connection?.signTransactionBase64) {
    throw new Error('Connect a wallet before posting the on-chain registry transaction.');
  }
  const signedTransaction = await connection.signTransactionBase64(prepared.transaction);
  return submit({
    signedTransaction,
    rulePda: prepared.rulePda,
    receiptPda: prepared.receiptPda,
  });
}

export async function settleCreateRuleOnchain({ connection, ruleId, prepared }) {
  return settleRegistryTx({
    connection,
    prepared,
    submit: (payload) => api.submitRuleOnchain(ruleId, payload),
  });
}

export async function settleReceiptOnchain({ connection, ruleId, receiptId, prepared }) {
  return settleRegistryTx({
    connection,
    prepared,
    submit: (payload) => api.submitReceiptOnchain(ruleId, receiptId, payload),
  });
}
