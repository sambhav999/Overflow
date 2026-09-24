import { createPortal } from 'react-dom';
import { formatRaw } from '../lib/format.js';
import { Mark } from './icons.jsx';
import Receipt from './Receipt.jsx';
import FirewallEvidence from './FirewallEvidence.jsx';

/**
 * The three stories under the hero. A and C reuse seeded receipts/decisions.
 * B is a seeded blocked evaluation (classifyCorporateAction + plausibility)
 * so the judge demo never depends on the xStocks API.
 */
export default function StoryCards({ receipts, decisions, klacx, open, onOpen }) {
  const storyA = receipts.find((r) => r.kind === 'DIVIDEND');
  const storyC = receipts.find((r) => r.kind === 'INTEREST');
  const decisionC = decisions.find((d) => d.ruleId === storyC?.ruleId) ?? decisions[0] ?? null;
  const cOutcome = decisionC?.outcome === 'BLOCKED' ? 'RETAIN' : 'PASS';
  const naivePct = klacx?.wouldHaveExtracted?.fractionBps != null
    ? (Number(klacx.wouldHaveExtracted.fractionBps) / 100).toFixed(0)
    : null;

  const cards = [
    {
      id: 'A', letter: 'A', icon: 'receipt', title: 'MRKx Dividend',
      badge: 'PASS', badgeClass: 'card-pass', sub: 'source kept',
      ready: Boolean(storyA),
    },
    {
      id: 'B', letter: 'B', icon: 'shield', title: 'KLACx 10:1 Split',
      badge: 'RETAIN', badgeClass: 'card-retain',
      sub: naivePct ? `naive path ≈${naivePct}%` : 'seeded evaluation',
      ready: Boolean(klacx),
    },
    {
      id: 'C', letter: 'C', icon: 'dest', title: 'Kamino → OpenAI PreStocks',
      badge: cOutcome, badgeClass: cOutcome === 'RETAIN' ? 'card-retain' : 'card-pass', sub: 'via Capital Firewall',
      ready: Boolean(storyC),
    },
  ];

  return (
    <>
      <ul className="story-cards-row">
        {cards.map((c) => (
          <li key={c.id}>
            <button
              type="button"
              className="story-card"
              onClick={() => onOpen(c.id)}
              disabled={!c.ready}
            >
              <span className="story-card-top">
                <span className="story-card-letter">{c.letter}</span>
                <Mark kind={c.icon} size={26} drawn />
              </span>
              <span className="story-card-title">{c.title}</span>
              <span className={`story-card-badge ${c.badgeClass}`}>{c.badge}</span>
              <span className="story-card-sub">{c.sub}</span>
            </button>
          </li>
        ))}
      </ul>

      {open && createPortal(
        <div className="story-modal" role="dialog" aria-modal="true" aria-labelledby="story-card-title">
          <button type="button" className="story-modal-backdrop" aria-label="Close" onClick={() => onOpen(null)} />
          <div className="story-modal-card story-card-modal">
            <button type="button" className="story-card-modal-close" onClick={() => onOpen(null)} aria-label="Close">×</button>
            {open === 'A' && (storyA ? <Receipt receipt={storyA} /> : <div className="notice">Not seeded yet.</div>)}
            {open === 'B' && (
              klacx ? <KlacxResult result={klacx} /> : <div className="notice">Seeded KLACx evaluation is not available.</div>
            )}
            {open === 'C' && (
              <>
                {decisionC && <FirewallEvidence evidence={{ ...decisionC.evidence, decision: decisionC.outcome }} />}
                {storyC ? <Receipt receipt={storyC} /> : <div className="notice">Not seeded yet.</div>}
              </>
            )}
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}

function KlacxResult({ result }) {
  if (result.ok) {
    return <div className="notice ok">This KLACx event passed the plausibility check.</div>;
  }
  const pct = result.wouldHaveExtracted?.fractionBps != null
    ? (Number(result.wouldHaveExtracted.fractionBps) / 100).toFixed(2)
    : null;
  return (
    <div>
      <div className="eyebrow" style={{ color: 'var(--warn)', fontWeight: 600 }}>
        RETAIN · {result.classification?.eventType}
      </div>
      <div className="notice warn" style={{ marginTop: 10 }}>{result.classification?.detail ?? result.reason}</div>
      {result.wouldHaveExtracted?.dividendRawAtomic && (
        <>
          <div className="receipt" style={{ marginTop: 14 }}>
            <div className="receipt-title">WHAT A NAIVE IMPLEMENTATION WOULD HAVE DONE</div>
            <div className="receipt-row">
              <span className="k">Would have routed</span>
              <span className="v" style={{ color: 'var(--warn)' }}>
                {formatRaw(result.wouldHaveExtracted.dividendRawAtomic, 8, 8)} raw units
                {pct != null ? ` (${pct}% of the position)` : ''}
              </span>
            </div>
          </div>
          <div className="notice warn" style={{ marginTop: 10 }}>{result.note}</div>
        </>
      )}
    </div>
  );
}
