import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useWallet } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import { VersionedTransaction } from '@solana/web3.js';
import { api, onSessionLost, setSession, currentSession } from './lib/api.js';
import { base64ToBytes, bytesToBase64 } from './lib/bytes.js';
import WalletBar from './components/WalletBar.jsx';
import RuleCard from './components/RuleCard.jsx';
import CreateRule from './components/CreateRule.jsx';
import ReplayPanel from './components/ReplayPanel.jsx';
import Receipt from './components/Receipt.jsx';
import TransactionLog from './components/TransactionLog.jsx';
import Portfolio from './components/Portfolio.jsx';
import IncomePortfolio from './components/IncomePortfolio.jsx';
import FirewallDecisions from './components/FirewallDecisions.jsx';
import StoryCards from './components/StoryCards.jsx';
import { IconRules, IconPortfolio, IconFirewall, IconReceipts, IconReplay, IconMenu, IconClose, Mark } from './components/icons.jsx';
import LiveBoard from './components/LiveBoard.jsx';
import WebGLField from './components/WebGLField.jsx';

// The hero flow, mirrored from backend/src/db/seedDemo.js so the "register
// this on Solana for real" path prefills the exact same rule the seeded
// demo receipt tells the story of, rather than a blank form.
const HERO_RULE_PRESET = {
  sourceType: 'KAMINO_USDC',
  destinationKey: 'PRESTOCKS:OPENAI',
  guardMode: 'TOKEN_PREMIUM',
  maxPremiumBps: '150',
  minPremiumBps: '-300',
  principalFloorUsd: '10000',
  minExecutionUsd: '5',
  maxSlippageBps: '50',
};

// The stat row above the fold, mirroring the seeded Story C receipt exactly
// (backend/src/db/seedDemo.js) rather than a live RPC read -- so the single
// most prominent element on the page can never break on a flaky devnet call.
const HERO_STATS = {
  protectedCapitalUsd: '10,000.00',
  earningsAvailableUsd: '186.40',
  destination: 'OpenAI PreStocks',
  firewallStatus: 'PASS',
};

const GUIDES = {
  rules: [
    {
      img: '/images/explain-keep.png?v=4',
      title: 'What stays',
      blurb: 'Overflow does not consume protected source principal to fund the destination.',
      detail: 'Overflow never takes custody of the equity or the USDC principal. Only newly generated value is eligible to move.',
    },
    {
      img: '/images/explain-gate.png?v=4',
      title: 'The gate',
      blurb: 'A live price check blocks any harvest with a bad quote.',
      detail: 'The Capital Firewall reads a live quote against the band you set. If the quote is outside the band, or the quote is missing, the harvest is retained instead of routed.',
    },
    {
      img: '/images/explain-send.png?v=4',
      title: 'What moves',
      blurb: 'Only the dividend, or the yield above your floor — you sign it.',
      detail: 'Only the dividend, or Kamino yield above the stored floor, can leave. You review the route and sign. Nothing moves unattended.',
    },
  ],
  portfolio: [
    {
      img: '/images/mark-dest.png?v=4',
      title: 'Built',
      fit: 'icon',
      blurb: 'Destination value a confirmed receipt already proved.',
      detail: 'Built is destination value that a confirmed receipt already proved. Quotes, pending withdrawals, and failed swaps are not counted.',
    },
    {
      img: '/images/mark-shield.png?v=4',
      title: 'Retained',
      fit: 'icon',
      blurb: 'Value the firewall held back on the source, not lost.',
      detail: 'Retained is generated value the firewall kept on the source because the quote missed the band, data was missing, or you have not signed a route yet.',
    },
    {
      img: '/images/mark-receipt.png?v=4',
      title: 'Verified',
      fit: 'icon',
      blurb: 'Confirmed on Solana — the audit trail for every move.',
      detail: 'Verified means Solana confirmed the signed execution. The receipt is the audit trail: source survived, destination credited, signature yours.',
    },
  ],
  firewall: [
    {
      img: '/images/mark-yield.png?v=4',
      title: 'Read the quote',
      fit: 'icon',
      blurb: 'Every harvest checks a live market price before anything moves.',
      detail: 'Each harvest reads a market quote at decision time. The chart on this page is illustrative of that comparison. It is not your wallet.',
    },
    {
      img: '/images/explain-gate.png?v=4',
      title: 'Apply the band',
      blurb: 'Inside your allowed range, the route may proceed.',
      detail: 'Your rule names an allowed premium or discount band. Inside the band, the route may proceed. Outside the band, Overflow keeps the value on the source.',
    },
    {
      img: '/images/mark-wallet.png?v=4',
      title: 'Pass or retain',
      fit: 'icon',
      blurb: 'A pass still needs your signature. A retain is logged, not lost.',
      detail: 'A pass still waits for your signature. A retain is logged with its evidence so you can see why nothing moved.',
    },
  ],
  receipts: [
    {
      img: '/images/mark-wallet.png?v=4',
      title: 'You sign',
      fit: 'icon',
      blurb: 'Every execution is a transaction you approve in your wallet.',
      detail: 'Every execution is a transaction you approve in your wallet. Overflow never holds a key and never submits an unsigned payload.',
    },
    {
      img: '/images/mark-receipt.png?v=4',
      title: 'Solana confirms',
      fit: 'icon',
      blurb: 'Only a confirmed transaction ever counts as built.',
      detail: 'After you sign, Solana confirms the transaction. Only a confirmed receipt can change what Overflow reports as built.',
    },
    {
      img: '/images/explain-keep.png?v=4',
      title: 'Source survived',
      blurb: 'Your principal or equity lot is untouched after the harvest.',
      detail: 'The source position is still yours after the harvest. The receipt records that the principal or the equity lot was not spent to fund the route.',
    },
  ],
  replay: [
    {
      img: '/images/mark-replay.png?v=4',
      title: 'Real history',
      fit: 'icon',
      blurb: 'Starts from an actual recorded dividend or split.',
      detail: 'Replay starts from an actual corporate action: a recorded dividend or split. It does not invent a price path or a wallet balance.',
    },
    {
      img: '/images/mark-dividend.png?v=4',
      title: 'Hypothetical',
      fit: 'icon',
      blurb: 'The extra value the formula would have isolated — a what-if.',
      detail: 'The plus is the extra value the formula would have isolated. That number is a what-if. Replay never claims the swap happened.',
    },
    {
      img: '/images/mark-wallet.png?v=4',
      title: 'Nothing signed',
      fit: 'icon',
      blurb: 'No wallet, no transaction — just a calculator on history.',
      detail: 'Replay never opens your wallet, never builds a transaction, and never moves funds. It is a calculator on public history.',
    },
  ],
};

const NAV = [
  { id: 'rules', label: 'Earnings rules', Icon: IconRules },
  { id: 'portfolio', label: 'Earnings built', Icon: IconPortfolio },
  { id: 'firewall', label: 'Capital Firewall', Icon: IconFirewall },
  { id: 'receipts', label: 'Receipts', Icon: IconReceipts },
  { id: 'replay', label: 'Replay', Icon: IconReplay, badge: 'no wallet' },
];

export default function App() {
  const { signTransaction } = useWallet();
  const { setVisible: openWalletModal } = useWalletModal();

  const [connection, setConnection] = useState(null);
  // A connected wallet is only an address. Data loads once it has SIGNED IN.
  const [signedIn, setSignedIn] = useState(false);
  const [portfolio, setPortfolio] = useState(null);
  const [decisions, setDecisions] = useState([]);
  const [health, setHealth] = useState(null);
  const [destinations, setDestinations] = useState([]);
  const [rules, setRules] = useState([]);
  const [receipts, setReceipts] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [tab, setTab] = useState('rules');
  const [creating, setCreating] = useState(false);
  const [createPreset, setCreatePreset] = useState(null);
  const [pendingHeroRule, setPendingHeroRule] = useState(false);
  const [loading, setLoading] = useState(false);
  const [polling, setPolling] = useState(false);
  const [error, setError] = useState(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [openStory, setOpenStory] = useState(null);
  const [klacx, setKlacx] = useState(null);

  const judgeDemo = health?.mode === 'JUDGE_DEMO';

  useEffect(() => {
    api.health().then((h) => {
      setHealth(h);
      // Judge Demo Mode: sign in as the seeded demo wallet with no wallet extension
      // required. Guarded on both ends against a real wallet's own silent
      // restore (WalletBar.jsx) winning the race and being clobbered by this.
      if (h?.mode === 'JUDGE_DEMO') {
        api.demoSession().then((session) => {
          if (session.klacx) setKlacx(session.klacx);
          if (!currentSession()) setSession(session);
          setConnection((c) => c || { address: session.wallet, demo: true });
          setSignedIn(true);
        }).catch(() => {});
      }
    }).catch((e) => setError(`Backend unreachable: ${e.message}`));
    api.destinations().then((r) => setDestinations(r.destinations || [])).catch(() => {});
  }, []);

  useEffect(() => onSessionLost(() => {
    setSignedIn(false);
    setConnection(null);
    setMenuOpen(false);
    setTab('rules');
    // A demo session expiring (30 min TTL) shouldn't strand a judge mid-review
    // behind a wallet prompt -- silently re-establish it.
    if (health?.mode === 'JUDGE_DEMO') {
      api.demoSession().then((session) => {
        setSession(session);
        setConnection({ address: session.wallet, demo: true });
        setSignedIn(true);
        if (session.klacx) setKlacx(session.klacx);
      }).catch(() => {});
    }
  }), [health]);

  const refresh = useCallback(async () => {
    if (!connection || !signedIn) { setRules([]); setReceipts([]); setTransactions([]); setPortfolio(null); setDecisions([]); return; }
    setLoading(true);
    try {
      const [r, rec, txs] = await Promise.all([
        api.listRules(),
        api.receipts().catch(() => ({ receipts: [] })),
        api.transactions().catch(() => ({ transactions: [] })),
      ]);
      setRules(r.rules || []);
      setReceipts(rec.receipts || []);
      setTransactions(txs.transactions || []);
      const [pf, dec] = await Promise.all([
        api.portfolio().catch(() => null),
        api.decisions().catch(() => ({ decisions: [] })),
      ]);
      setPortfolio(pf);
      setDecisions(dec.decisions || []);
      setError(null);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [connection, signedIn]);

  useEffect(() => { refresh(); }, [refresh]);

  // Only CONFIRMED interest harvests count as invested. A quote, a pending
  // withdrawal or a failed swap must never inflate this figure.
  const totalInvestedAtomic = receipts
    .filter((r) => r.kind === 'INTEREST' && r.status === 'CONFIRMED')
    .reduce((sum, r) => sum + BigInt(r.inputs?.harvestableAtomic ?? '0'), 0n)
    .toString();

  async function checkForEvents() {
    setPolling(true);
    try { await api.poll(); await refresh(); }
    catch (e) { setError(e.message); }
    finally { setPolling(false); }
  }

  function goTo(id) {
    setTab(id);
    setMenuOpen(false);
  }

  /**
   * Hero CTA: "Register this rule on Solana". If already signed in, open the
   * form pre-filled right away. Otherwise trigger Connect+sign-in and pick
   * this back up once it lands, so the judge does not have to click twice.
   */
  function startHeroRegistration() {
    if (connection && signedIn) {
      setCreatePreset(HERO_RULE_PRESET);
      setCreating(true);
      goTo('rules');
    } else {
      setPendingHeroRule(true);
      openWalletModal(true);
    }
  }

  /** Bridges wallet-adapter's Transaction signing to the base64 the backend speaks. */
  async function signTransactionBase64ViaWallet(transactionBase64) {
    if (!signTransaction) throw new Error('This wallet cannot sign transactions.');
    const tx = VersionedTransaction.deserialize(base64ToBytes(transactionBase64));
    const signed = await signTransaction(tx);
    return bytesToBase64(signed.serialize());
  }

  useEffect(() => {
    if (!pendingHeroRule || !connection || !signedIn) return;
    setPendingHeroRule(false);
    setCreatePreset(HERO_RULE_PRESET);
    setCreating(true);
    goTo('rules');
  }, [pendingHeroRule, connection, signedIn]);

  useEffect(() => {
    if (!menuOpen) return undefined;
    function onKey(e) {
      if (e.key === 'Escape') setMenuOpen(false);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [menuOpen]);

  const navItems = NAV.map((item) => (
    item.id === 'firewall' && decisions.length
      ? { ...item, label: `${item.label} (${decisions.length})` }
      : item
  ));

  return (
    <>
      <a className="skip-link" href="#main">Skip to content</a>
      <WebGLField />
      <header className={`site-header ${menuOpen ? 'is-open' : ''}`}>
        <div className="header-inner is-in">
          <div className="brand-block">
            <div className="brand-mark">
              <img src="/brand/overflow-mark.png" alt="Overflow" />
            </div>
            <div className="brand-text">
              <span className="brand">Overflow</span>
              <span className="tag">Keep the source</span>
            </div>
          </div>
          <NavList
            items={navItems}
            tab={tab}
            onSelect={goTo}
            className="nav"
            label="Primary"
          />
          <button
            type="button"
            className="menu-toggle"
            aria-expanded={menuOpen}
            aria-controls="mobile-nav"
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
            onClick={() => setMenuOpen((open) => !open)}
          >
            {menuOpen ? <IconClose /> : <IconMenu />}
          </button>
          <WalletBar
            connection={connection}
            signedIn={signedIn}
            onConnect={(c) => setConnection({ ...c, signTransactionBase64: signTransactionBase64ViaWallet })}
            onSignedIn={() => { setSignedIn(true); setMenuOpen(false); }}
            onDisconnect={() => { setConnection(null); setSignedIn(false); setMenuOpen(false); setTab('rules'); }}
          />
        </div>
        <div className={`nav-drawer ${menuOpen ? 'open' : ''}`} id="mobile-nav">
          <div className="nav-drawer-inner">
            <NavList
              items={navItems}
              tab={tab}
              onSelect={goTo}
              className="nav-drawer-list"
              label="Mobile"
            />
          </div>
        </div>
      </header>

      {tab === 'rules' && (
        <Hero
          health={health}
          signedIn={signedIn}
          onViewProof={() => setOpenStory('C')}
          onRegisterOnchain={startHeroRegistration}
          onConnectWallet={() => openWalletModal(true)}
        />
      )}

      {tab === 'rules' && (
        <div className="story-cards-wrap">
          <StoryCards receipts={receipts} decisions={decisions} klacx={klacx} open={openStory} onOpen={setOpenStory} />
          <LiveBoard variant="stream" showFlow />
        </div>
      )}

      <div className="wrap" id="main">
        {error && <p className="page-status" role="status">{error}</p>}

      <div className="page" key={tab}>
      {tab === 'rules' && (
        <>
          {/* The Hero above already carries the flow strip and live chart --
              this stays a plain 3-card guide so the page doesn't repeat it. */}
          <Guide title="How a rule works" items={GUIDES.rules} />
          <div className="section-head">
            <div>
              <div className="section-title">Your earnings rules</div>
              <p className="page-lead">Each rule watches one source and names one destination. Nothing moves until you review and sign.</p>
            </div>
            <div className="section-actions">
              {signedIn && (
                <button className="btn ghost small" onClick={checkForEvents} disabled={polling}>
                  {polling ? 'Checking…' : 'Check for events'}
                </button>
              )}
              {signedIn && !creating && (
                <button className="btn primary small" onClick={() => { setCreatePreset(null); setCreating(true); }}>Create rule</button>
              )}
            </div>
          </div>

          {!connection && !judgeDemo && (
            <EmptyState
              mark="wallet"
              title="Connect a wallet to begin"
              sub="Connecting only shares an address. A later signature proves you control it, and still moves no funds."
            >
              <button type="button" className="btn primary" onClick={() => openWalletModal(true)}>
                Connect wallet
              </button>
            </EmptyState>
          )}

          {connection && !signedIn && !judgeDemo && (
            <EmptyState
              mark="wallet"
              title="Sign in to continue"
              sub="Your wallet will ask you to sign a one-time message. It authorises no transaction."
            />
          )}

          {creating && signedIn && (
            <CreateRule
              connection={connection}
              destinations={destinations}
              defaultKaminoVault={health?.defaultKaminoVault ?? ''}
              preset={createPreset}
              onCreated={() => { setCreating(false); setCreatePreset(null); refresh(); }}
              onCancel={() => { setCreating(false); setCreatePreset(null); }}
            />
          )}

          {signedIn && loading && !rules.length && <div className="card empty"><span className="spinner" /> Reading positions and corporate actions…</div>}

          {signedIn && !loading && !rules.length && !creating && (
            <EmptyState
              mark="lock"
              title="No earnings rules yet"
              sub="Create one to preserve a source position and program where its earnings go."
            >
              <div className="controls">
                <button className="btn primary small" onClick={() => { setCreatePreset(null); setCreating(true); }}>Create rule</button>
              </div>
            </EmptyState>
          )}

          {rules.map((rule) => (
            <RuleCard key={rule.id} rule={rule} connection={connection} onChanged={refresh}
                      onDeleted={(id) => setRules((rs) => rs.filter((r) => r.id !== id))}
                      totalInvestedAtomic={totalInvestedAtomic} />
          ))}

          {signedIn && rules.some((r) => r.sourceType === 'KAMINO_USDC') && (
            <Portfolio connection={connection} destinations={destinations}
                       totalInvestedAtomic={totalInvestedAtomic} />
          )}
        </>
      )}

      {tab === 'portfolio' && (
        <>
          <Stage title="How earnings become holdings" items={GUIDES.portfolio} variant="split" />
          {signedIn
            ? <IncomePortfolio portfolio={portfolio} />
            : (
              <EmptyState
                mark="dest"
                title="Sign in to see what your earnings built"
                sub="Connect and sign in with your wallet to view holdings that receipts have already proven."
              />
            )}
        </>
      )}

      {tab === 'firewall' && (
        <>
          <Stage title="How the Capital Firewall decides" items={GUIDES.firewall} variant="band" />
          <div className="section-head">
            <div>
              <div className="section-title">Capital Firewall decisions</div>
              <p className="page-lead">Every price-policy call is stored with its evidence. Blocks from missing data are logged, not counted as retained.</p>
            </div>
          </div>
          {signedIn
            ? <FirewallDecisions decisions={decisions} />
            : (
              <EmptyState
                mark="shield"
                title="Sign in to see firewall decisions"
                sub="Passed and blocked calls appear here once a rule with a market-price policy reaches execution."
              />
            )}
        </>
      )}

      {tab === 'receipts' && (
        <>
          <Stage title="How an execution is proven" items={GUIDES.receipts} variant="steps" />
          <div className="section-head">
            <div>
              <div className="section-title">Transactions</div>
              <p className="page-lead">Every signature from this wallet. Click a row to open Solscan.</p>
            </div>
          </div>
          {signedIn
            ? <TransactionLog transactions={transactions} loading={loading} />
            : (
              <EmptyState
                mark="receipt"
                title="Sign in to see transactions"
                sub="Harvests, rule registrations, and other signatures from this wallet open in the explorer on click."
              />
            )}
          {signedIn && receipts.length > 0 && (
            <>
              <div className="section-head" style={{ marginTop: 28 }}>
                <div>
                  <div className="section-title">Execution receipts</div>
                  <p className="page-lead">The audit trail for each harvest: source survived, destination credited, signature yours.</p>
                </div>
              </div>
              {receipts.map((r) => <Receipt key={r.id} receipt={r} />)}
            </>
          )}
        </>
      )}

      {tab === 'replay' && (
        <>
          <Stage title="How replay stays honest" items={GUIDES.replay} variant="replay" />
          <div className="section-head">
            <div>
              <div className="section-title">Replay a real corporate action</div>
              <p className="page-lead">Run the extraction formula on historical dividends and splits. Replay never signs and never claims a swap occurred.</p>
            </div>
          </div>
          <ReplayPanel />
        </>
      )}
      </div>

        <footer className="footer">
          <div className="footer-brand">
            <span className="brand-mark">
              <img src="/brand/overflow-mark.png" alt="" />
            </span>
            <div className="footer-brand-text">
              <b>Overflow</b>
              <span className="footer-tag">Keep the source</span>
            </div>
          </div>
          {signedIn && (
            <NavList
              items={navItems}
              tab={tab}
              onSelect={goTo}
              className="footer-nav"
              label="Footer"
            />
          )}
          <div className="footer-legal">
            <p>
              Overflow does not consume protected source principal to fund the destination.
              It preserves a source position and routes only the value it newly generates.
              For an xStocks dividend that means isolating exactly the raw Token-2022 quantity the multiplier
              change created; for Kamino it means spending only value above a stored principal floor.
            </p>
            <p>
              “Preserved” is an accounting and allocation rule, not a capital guarantee. USDC, Kamino, smart
              contracts, liquidity and tokenized-equity issuers all carry risk, and these xStocks mints carry
              Token-2022 transfer-hook, permanent-delegate and pausable extensions. Tokenized equities are not
              available in every jurisdiction; eligibility is your responsibility and is separate from technical
              routing. V1 is non-custodial and every execution is user-signed. Overflow never holds a key and
              never trades unattended. Not investment advice.
            </p>
          </div>
        </footer>
      </div>
    </>
  );
}

function NavList({ items, tab, onSelect, className, label }) {
  return (
    <nav className={className} aria-label={label}>
      {items.map(({ id, label: name, Icon, badge }) => (
        <button
          key={id}
          type="button"
          className={`nav-btn ${tab === id ? 'active' : ''}`}
          aria-current={tab === id ? 'page' : undefined}
          title={name}
          onClick={() => onSelect(id)}
        >
          <Icon />
          <span>{name}</span>
          {badge && <span className="nav-badge">{badge}</span>}
        </button>
      ))}
    </nav>
  );
}

function Hero({ health, signedIn, onViewProof, onRegisterOnchain, onConnectWallet }) {
  const registryLive = Boolean(health?.registry?.configured);
  const judgeDemo = health?.mode === 'JUDGE_DEMO';
  const liveDevnet = Boolean(health && health.mode === 'LIVE_DEVNET' && registryLive);
  return (
    <section className="hero">
      <div className="hero-copy">
        <span className="hero-eyebrow">
          <span className="dot" aria-hidden="true" />
          {health ? `Live on ${health.network}` : 'Solana'}
        </span>
        <h1 className="hero-title">Keep the source.<br /><em>Program the earnings.</em></h1>
        <p className="hero-sub">
          Only new earnings can move, only after you sign, and only inside your policy band.
        </p>

        {judgeDemo && (
          <div className="demo-banner" role="status">JUDGE DEMO — seeded data, funds cannot move.</div>
        )}

        <ul className="hero-stats">
          <li><span className="k">Protected Capital</span><span className="v locked">${HERO_STATS.protectedCapitalUsd}</span></li>
          <li><span className="k">Earnings Available</span><span className="v flow">${HERO_STATS.earningsAvailableUsd}</span></li>
          <li><span className="k">Destination</span><span className="v equity">{HERO_STATS.destination}</span></li>
          <li><span className="k">Firewall Status</span><span className="v preserved-yes">{HERO_STATS.firewallStatus}</span></li>
        </ul>
        <div className="hero-principal-used">
          <span className="k">Principal Used</span>
          <span className="v">$0.00</span>
        </div>
        <p className="hero-stats-caption">Seeded judge scenario: $10,000 protected, $186.40 generated earnings toward OpenAI PreStocks.</p>

        <div className="hero-cta">
          <button type="button" className="btn primary" onClick={onViewProof}>
            View Proof of Preservation
          </button>
          {liveDevnet && (
            <button type="button" className="btn ghost" onClick={registryLive ? onRegisterOnchain : onConnectWallet}>
              Register this rule on Solana
            </button>
          )}
        </div>
        {judgeDemo && signedIn && <p className="hero-live-note">Judge Demo loaded — no wallet required.</p>}
        {!judgeDemo && signedIn && <p className="hero-live-note">Signed in. This exact rule is live in your list below.</p>}
      </div>
    </section>
  );
}

function Stage({ title, items, variant }) {
  return (
    <div className="stage">
      <Guide title={title} items={items} />
      <LiveBoard variant={variant} />
    </div>
  );
}

function Guide({ title, items }) {
  const [open, setOpen] = useState(null);

  useEffect(() => {
    if (!open) return undefined;
    function onKey(e) {
      if (e.key === 'Escape') setOpen(null);
    }
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open]);

  const count = items.length;

  return (
    <section className="guide">
      {title && <h2 className="guide-title">{title}</h2>}
      <div className="story-row" data-count={count} style={{ '--story-count': count }}>
        {items.map((item, i) => (
          <button
            type="button"
            className={`story ${item.fit === 'icon' ? 'icon' : ''}`}
            key={item.title}
            style={{ '--i': i }}
            onClick={() => setOpen(item)}
          >
            <span className="story-media">
              <img src={item.img} alt="" />
            </span>
            <span className="story-step" aria-hidden="true">{String(i + 1).padStart(2, '0')}</span>
            <span className="story-copy">
              <span className="story-title">{item.title}</span>
              {item.blurb && <span className="story-blurb">{item.blurb}</span>}
            </span>
          </button>
        ))}
      </div>
      {open && createPortal(
        <div className="story-modal" role="dialog" aria-modal="true" aria-labelledby="story-modal-title">
          <button type="button" className="story-modal-backdrop" aria-label="Close" onClick={() => setOpen(null)} />
          <div className="story-modal-card">
            <div className={`story-modal-art ${open.fit === 'icon' ? 'icon' : ''}`}>
              <img src={open.img} alt="" />
            </div>
            <div className="story-modal-copy">
              <h2 id="story-modal-title">{open.title}</h2>
              <p>{open.detail}</p>
              <button type="button" className="btn primary small" onClick={() => setOpen(null)}>Got it</button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </section>
  );
}

function EmptyState({ mark, title, sub, children }) {
  return (
    <div className="card empty-state">
      {mark && <Mark kind={mark} size={64} />}
      <div className="empty-copy">
        <div className="empty-title">{title}</div>
        <div className="empty-sub">{sub}</div>
        {children}
      </div>
    </div>
  );
}

