import { Mark } from './icons.jsx';

/**
 * Three stations in a line. The keep rail is dashed. The send rail runs.
 * Labels name this specific hero example concretely (Kamino USDC -> OpenAI
 * stock) rather than the generic Source/Firewall/Destination roles, since a
 * first-time visitor has no reason yet to know what those roles mean.
 */
export default function LiveFlow() {
  return (
    <div className="pipe" role="img" aria-label="Your Kamino USDC savings stay locked. Only the profit passes a price check before buying OpenAI stock.">
      <FlowNode kind="lock" label="Kamino USDC" sub="your savings, untouched" />
      <div className="pipe-rail keep" aria-hidden="true"><span /></div>
      <FlowNode kind="shield" label="Capital Firewall" sub="checks the price is fair" />
      <div className="pipe-rail send" aria-hidden="true"><span /><i /><i /><i /><i /></div>
      <FlowNode kind="dest" label="OpenAI stock" sub="bought with profit only" />
    </div>
  );
}

function FlowNode({ kind, label, sub }) {
  return (
    <div className="flow-node">
      <Mark kind={kind} size={56} />
      <b>{label}</b>
      <span>{sub}</span>
    </div>
  );
}
