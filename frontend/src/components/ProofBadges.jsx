/**
 * What is real and what is fixed in the Judge Demo, stated up front: the
 * devnet transactions and the Overflow decision logic are real; the market
 * price fed into it is deterministic (PreStocks Devnet/Judge Adapter).
 */
export default function ProofBadges() {
  return (
    <ul className="proof-badges" aria-label="Proof labels">
      <li className="proof-badge real">REAL DEVNET TX</li>
      <li className="proof-badge real">REAL OVERFLOW LOGIC</li>
      <li className="proof-badge fixed">DETERMINISTIC MARKET INPUT</li>
    </ul>
  );
}
