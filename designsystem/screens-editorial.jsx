// ── EDITORIAL THEME ───────────────────────────────────────────────
// Notion / Linear-inspired. Warm off-white bg. One teal accent.
// Typography-first hierarchy. 1px borders instead of shadows.

const ED = {
  bg: '#FAFAF8',
  surf: '#FFFFFF',
  border: '#E5E3DE',
  borderS: '#EFEDE8',
  accent: '#1A8A72',
  accentL: '#E6F5F2',
  accentRing: 'rgba(26, 138, 114, 0.12)',
  accentShadow: 'rgba(26, 138, 114, 0.25)',
  accentShadowLg: 'rgba(26, 138, 114, 0.35)',
  text: '#1A1916',
  sub: '#37352F',
  muted: '#9B9790',
  dim: '#D8D5CF',
  green: '#0F7E4A',
  greenL: '#EDFBF3',
  red: '#E03E3E',
  redL: '#FEF2F2',
  warn: '#B89A2E',
  warnL: '#FAF4DD'
};

const EdBase = ({ children, fontFamily, style = {} }) =>
<div style={{
  fontFamily: fontFamily || "'Space Grotesk', sans-serif",
  background: ED.bg,
  color: ED.text,
  width: '100%', height: '100%', overflowY: 'auto',
  ...style
}}>
    {children}
  </div>;


const Div = ({ style = {} }) => <div style={{ height: 1, background: ED.border, ...style }} />;

// Section header — UPPERCASE small caps
const SectionLabel = ({ children, style = {} }) =>
<div style={{
  fontSize: 10, color: ED.muted, letterSpacing: '0.09em',
  textTransform: 'uppercase', fontWeight: 500, ...style
}}>{children}</div>;


// ── Tab bar (shared) ────────────────────────────────────────────
// Minimal stroke icons. Create is elevated as the centered primary action.
const TabIcon = ({ name, color, size = 20 }) => {
  const s = { width: size, height: size, fill: 'none', stroke: color, strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round' };
  if (name === 'home')
  return <svg viewBox="0 0 24 24" {...s}><path d="M4 11l8-7 8 7v9H4z" /></svg>;
  if (name === 'library')
  return <svg viewBox="0 0 24 24" {...s}><rect x="5" y="4" width="14" height="16" rx="1.5" /><path d="M9 4v16" /></svg>;
  if (name === 'explore')
  return <svg viewBox="0 0 24 24" {...s}><circle cx="12" cy="12" r="8" /><path d="M15.5 8.5L13 13l-4.5 2.5L11 11z" strokeLinejoin="round" /></svg>;
  if (name === 'profile')
  return <svg viewBox="0 0 24 24" {...s}><circle cx="12" cy="9" r="3.5" /><path d="M5 20c1.4-3.6 4-5 7-5s5.6 1.4 7 5" /></svg>;
  return null;
};

function TabBar({ active, onChange }) {
  const tabs = [
  { id: 'home', label: 'Today', icon: 'home' },
  { id: 'library', label: 'Library', icon: 'library' },
  { id: 'explore', label: 'Explore', icon: 'explore' },
  { id: 'profile', label: 'You', icon: 'profile' }];

  // split: 2 left tabs + create + 2 right tabs
  const left = tabs.slice(0, 2);
  const right = tabs.slice(2);

  const renderTab = (t) => {
    const isActive = active === t.id;
    const color = isActive ? ED.text : ED.muted;
    return (
      <button key={t.id} onClick={() => onChange(t.id)} style={{
        flex: 1, padding: '8px 0 0', background: 'none', border: 'none',
        cursor: 'pointer', display: 'flex', flexDirection: 'column',
        alignItems: 'center', gap: 3,
        fontFamily: 'inherit'
      }}>
        <TabIcon name={t.icon} color={color} />
        <span style={{
          fontFamily: "'JetBrains Mono', ui-monospace, monospace",
          fontSize: 10, letterSpacing: '0.02em',
          fontWeight: isActive ? 700 : 500, color
        }}>{t.label}</span>
      </button>);

  };

  const isCreate = active === 'create';

  return (
    <div style={{
      position: 'absolute', left: 0, right: 0, bottom: 0,
      display: 'flex', alignItems: 'flex-end',
      borderTop: `1px solid ${ED.border}`,
      background: ED.surf, paddingBottom: 14, paddingTop: 0,
      height: 64
    }}>
      {left.map(renderTab)}

      {/* Create — elevated FAB */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative' }}>
        <button onClick={() => onChange('create')} aria-label="Create" style={{
          position: 'absolute', top: -22, left: '50%', transform: 'translateX(-50%)',
          width: 52, height: 52, borderRadius: '50%',
          background: ED.accent, border: `3px solid ${ED.bg}`,
          color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: isCreate ?
          `0 0 0 2px ${ED.accentShadow}, 0 4px 14px ${ED.accentShadowLg}` :
          `0 2px 8px ${ED.accentShadow}`,
          fontFamily: 'inherit', padding: 0,
          transition: 'box-shadow 0.15s'
        }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round">
            <path d="M12 5v14M5 12h14" />
          </svg>
        </button>
        <span style={{
          fontFamily: "'JetBrains Mono', ui-monospace, monospace",
          marginTop: 36, fontSize: 10, letterSpacing: '0.02em',
          fontWeight: isCreate ? 700 : 600,
          color: isCreate ? ED.accent : ED.text
        }}>Create</span>
      </div>

      {right.map(renderTab)}
    </div>);

}

// ── Editorial: Home / Today ─────────────────────────────────────
function EditorialHome({ goto, fontFamily }) {
  const due = [
  { id: 'd1', topic: 'World History', card: 'The Treaty of Westphalia (1648)', count: 4 },
  { id: 'd2', topic: 'Spanish · A2', card: '"Quedar" vs "Quedarse"', count: 7 },
  { id: 'd3', topic: 'Microeconomics', card: 'Cross-price elasticity', count: 3 },
  { id: 'd4', topic: 'Cell Biology', card: 'Krebs cycle — net ATP yield', count: 5 }];


  return (
    <EdBase fontFamily={fontFamily} style={{ paddingBottom: 70 }}>
      {/* Top bar */}
      <div style={{ padding: '20px 18px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, borderBottom: `1px solid ${ED.border}` }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <SectionLabel>Tuesday · April 29</SectionLabel>
          <div style={{ fontWeight: 800, letterSpacing: '-0.025em', marginTop: 2, fontSize: "18px" }}>Good morning,Alex</div>
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.03em', color: ED.accent, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>47</div>
          <SectionLabel style={{ fontSize: 9, marginTop: 4 }}>Day Streak</SectionLabel>
        </div>
      </div>

      {/* Hero — focus queue number */}
      <div style={{ padding: '22px 20px 18px', borderBottom: `1px solid ${ED.border}`, background: ED.surf }}>
        <SectionLabel style={{ marginBottom: 8 }}>Focus Queue</SectionLabel>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <span style={{ fontSize: 52, fontWeight: 900, letterSpacing: '-0.04em', lineHeight: 1 }}>19</span>
          <span style={{ fontSize: 13, color: ED.muted }}>cards due today</span>
          <span style={{ marginLeft: 'auto', fontSize: 12, color: ED.muted }}>~12 min</span>
        </div>
        {/* Goal bar */}
        <div style={{ height: 2, borderRadius: 1, background: ED.dim, marginTop: 14, overflow: 'hidden' }}>
          <div style={{ width: '32%', height: '100%', background: ED.accent }} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
          <span style={{ fontSize: 10, color: ED.muted }}>6 of 19 reviewed</span>
          <span style={{ fontSize: 10, color: ED.muted }}>Daily goal: 19</span>
        </div>
        <button onClick={() => goto('quiz')} style={{
          width: '100%', marginTop: 16, padding: '13px', borderRadius: 8,
          border: 'none', background: ED.accent, color: '#fff',
          fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit'
        }}>Start review →</button>
      </div>

      {/* Today's queue list — card style */}
      <div style={{ padding: '16px 16px 4px' }}>
        <div style={{ padding: '0 4px 10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <SectionLabel>Up Next</SectionLabel>
          <span style={{ fontSize: 11, color: ED.muted }}>by topic</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {due.map((d) => (
            <div key={d.id} onClick={() => goto('quiz')} style={{
              background: ED.surf, border: `1px solid ${ED.border}`, borderRadius: 10,
              padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer'
            }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <SectionLabel style={{ fontSize: 9.5, marginBottom: 3 }}>{d.topic}</SectionLabel>
                <div style={{ fontSize: 13, fontWeight: 500, color: ED.sub, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.card}</div>
              </div>
              <span style={{ fontSize: 11, color: ED.accent, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{d.count} due</span>
              <span style={{ fontSize: 16, color: ED.dim }}>›</span>
            </div>
          ))}
        </div>
      </div>

      {/* Two-up stats */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', background: ED.surf, borderBottom: `1px solid ${ED.border}` }}>
        {[
        { label: 'Reviewed', val: '128', sub: 'this week' },
        { label: 'Accuracy', val: '84%', sub: '7-day avg' }].
        map((item, i) =>
        <div key={item.label} style={{ padding: '16px 18px', borderRight: i === 0 ? `1px solid ${ED.border}` : 'none' }}>
            <SectionLabel style={{ marginBottom: 6 }}>{item.label}</SectionLabel>
            <div style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-0.03em', lineHeight: 1 }}>{item.val}</div>
            <div style={{ fontSize: 11, color: ED.muted, marginTop: 4 }}>{item.sub}</div>
          </div>
        )}
      </div>

      {/* Empty CTA — quiet */}
      <div style={{ padding: '16px 20px 24px' }}>
        <div onClick={() => goto('create')} style={{
          padding: '14px 16px', border: `1px dashed ${ED.dim}`, borderRadius: 10,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          cursor: 'pointer'
        }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600 }}>Make a new set</div>
            <div style={{ fontSize: 11, color: ED.muted, marginTop: 2 }}>Generate cards from a question or doc</div>
          </div>
          <span style={{ fontSize: 18, color: ED.muted }}>+</span>
        </div>
      </div>
    </EdBase>);

}

// ── Editorial: Library (list of decks) ──────────────────────────
function EditorialLibrary({ goto, openDeck, fontFamily }) {
  const decks = [
  { id: 'hist', title: 'World History · 1500–1900', cards: 84, due: 7, pct: 62, sub: 'Treaties, revolutions, colonization' },
  { id: 'span', title: 'Spanish · A2', cards: 142, due: 11, pct: 48, sub: 'Verbs, prepositions, idioms' },
  { id: 'econ', title: 'Microeconomics 101', cards: 56, due: 3, pct: 79, sub: 'Supply, demand, elasticity' },
  { id: 'bio', title: 'Cell Biology', cards: 73, due: 5, pct: 88, sub: 'Organelles, cycles, genetics' },
  { id: 'mgmt', title: 'Operations Management', cards: 41, due: 0, pct: 94, sub: 'Lean, queues, capacity' }];


  return (
    <EdBase fontFamily={fontFamily} style={{ paddingBottom: 70 }}>
      {/* Top bar */}
      <div style={{ padding: '18px 20px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: `1px solid ${ED.border}` }}>
        <div style={{ fontSize: 19, fontWeight: 800, letterSpacing: '-0.025em' }}>Library</div>
        <span style={{ fontSize: 12, color: ED.accent, fontWeight: 600 }}>Filter</span>
      </div>

      {/* Search */}
      <div style={{ padding: '12px 20px', borderBottom: `1px solid ${ED.border}`, background: ED.surf }}>
        <div style={{ padding: '9px 12px', border: `1px solid ${ED.border}`, borderRadius: 8, fontSize: 13, color: ED.muted, background: ED.bg }}>Search decks</div>
      </div>

      {/* Stats summary */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', borderBottom: `1px solid ${ED.border}`, background: ED.surf }}>
        {[
        { v: '5', l: 'decks' },
        { v: '396', l: 'cards' },
        { v: '26', l: 'due' }].
        map((s, i) =>
        <div key={s.l} style={{ padding: '14px 16px', borderRight: i < 2 ? `1px solid ${ED.border}` : 'none' }}>
            <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.03em', lineHeight: 1 }}>{s.v}</div>
            <SectionLabel style={{ fontSize: 9.5, marginTop: 5 }}>{s.l}</SectionLabel>
          </div>
        )}
      </div>

      {/* Deck rows — card style */}
      <div style={{ padding: '16px 16px 24px' }}>
        <div style={{ padding: '0 4px 10px' }}>
          <SectionLabel>All Decks</SectionLabel>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {decks.map((d) => (
            <div key={d.id} onClick={() => openDeck(d.id)} style={{
              background: ED.surf, border: `1px solid ${ED.border}`, borderRadius: 10,
              padding: '14px 14px', cursor: 'pointer'
            }}>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
                <div style={{ fontSize: 14, fontWeight: 700, letterSpacing: '-0.015em', color: ED.text }}>{d.title}</div>
                <span style={{ fontSize: 11, color: d.due > 0 ? ED.accent : ED.muted, fontWeight: 600, flexShrink: 0 }}>
                  {d.due > 0 ? `${d.due} due` : 'caught up'}
                </span>
              </div>
              <div style={{ fontSize: 11.5, color: ED.muted, marginTop: 3 }}>{d.sub}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10 }}>
                <div style={{ flex: 1, height: 2, borderRadius: 1, background: ED.dim, overflow: 'hidden' }}>
                  <div style={{ width: `${d.pct}%`, height: '100%', background: ED.accent }} />
                </div>
                <span style={{ fontSize: 10.5, color: ED.muted, fontVariantNumeric: 'tabular-nums', width: 60, textAlign: 'right' }}>{d.cards} cards</span>
                <span style={{ fontSize: 10.5, color: ED.text, fontWeight: 700, fontVariantNumeric: 'tabular-nums', width: 30, textAlign: 'right' }}>{d.pct}%</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </EdBase>);

}

// ── Editorial: Deck detail ──────────────────────────────────────
function EditorialDeckDetail({ deckId, back, goto, fontFamily }) {
  const decks = {
    hist: {
      title: 'World History · 1500–1900', sub: 'Treaties, revolutions, colonization',
      cards: 84, due: 7, mastered: 52, pct: 62,
      list: [
      { n: '01', q: 'The Treaty of Westphalia (1648)', status: 'due' },
      { n: '02', q: 'Causes of the French Revolution', status: 'mastered' },
      { n: '03', q: 'Meiji Restoration — key reforms', status: 'learning' },
      { n: '04', q: 'Berlin Conference outcomes', status: 'due' },
      { n: '05', q: 'The Concert of Europe', status: 'mastered' }]

    },
    span: {
      title: 'Spanish · A2', sub: 'Verbs, prepositions, idioms',
      cards: 142, due: 11, mastered: 68, pct: 48,
      list: [
      { n: '01', q: '"Quedar" vs "Quedarse"', status: 'due' },
      { n: '02', q: 'Por vs Para — usage table', status: 'learning' },
      { n: '03', q: 'Subjunctive triggers (WEIRDO)', status: 'due' },
      { n: '04', q: '"Echar de menos" — translation', status: 'mastered' },
      { n: '05', q: 'Reflexive change-of-state verbs', status: 'learning' }]

    },
    econ: {
      title: 'Microeconomics 101', sub: 'Supply, demand, elasticity',
      cards: 56, due: 3, mastered: 44, pct: 79,
      list: [
      { n: '01', q: 'Cross-price elasticity', status: 'due' },
      { n: '02', q: 'Marginal rate of substitution', status: 'mastered' },
      { n: '03', q: 'Giffen goods — definition', status: 'learning' },
      { n: '04', q: 'Producer surplus on a graph', status: 'mastered' }]

    },
    bio: {
      title: 'Cell Biology', sub: 'Organelles, cycles, genetics',
      cards: 73, due: 5, mastered: 64, pct: 88,
      list: [
      { n: '01', q: 'Krebs cycle — net ATP yield', status: 'due' },
      { n: '02', q: 'Mitochondrial DNA inheritance', status: 'mastered' },
      { n: '03', q: 'Phases of mitosis', status: 'mastered' },
      { n: '04', q: 'Golgi apparatus function', status: 'learning' }]

    },
    mgmt: {
      title: 'Operations Management', sub: 'Lean, queues, capacity',
      cards: 41, due: 0, mastered: 38, pct: 94,
      list: [
      { n: '01', q: "Little's Law — formula", status: 'mastered' },
      { n: '02', q: 'Bottleneck identification steps', status: 'mastered' },
      { n: '03', q: 'Kanban — 6 core practices', status: 'mastered' }]

    }
  };
  const d = decks[deckId] || decks.hist;
  const statusColor = { due: ED.accent, learning: ED.warn, mastered: ED.muted };
  const statusBg = { due: ED.accentL, learning: ED.warnL, mastered: ED.bg };

  return (
    <EdBase fontFamily={fontFamily} style={{ paddingBottom: 70 }}>
      {/* Top nav */}
      <div style={{ padding: '14px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: `1px solid ${ED.border}` }}>
        <span onClick={back} style={{ fontSize: 13, color: ED.muted, cursor: 'pointer' }}>← Library</span>
        <span style={{ fontSize: 12, color: ED.accent, fontWeight: 600 }}>Edit</span>
      </div>

      {/* Title block */}
      <div style={{ padding: '20px 20px 18px', background: ED.surf, borderBottom: `1px solid ${ED.border}` }}>
        <SectionLabel style={{ marginBottom: 8 }}>Deck</SectionLabel>
        <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.03em', lineHeight: 1.2 }}>{d.title}</div>
        <div style={{ fontSize: 12.5, color: ED.muted, marginTop: 6 }}>{d.sub}</div>

        {/* Mastery line */}
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 18 }}>
          <span style={{ fontSize: 38, fontWeight: 900, letterSpacing: '-0.04em', lineHeight: 1 }}>{d.pct}%</span>
          <span style={{ fontSize: 12, color: ED.muted }}>mastery</span>
          <span style={{ marginLeft: 'auto', fontSize: 11.5, color: ED.muted }}>{d.mastered} of {d.cards}</span>
        </div>
        <div style={{ height: 2, borderRadius: 1, background: ED.dim, marginTop: 10, overflow: 'hidden' }}>
          <div style={{ width: `${d.pct}%`, height: '100%', background: ED.accent }} />
        </div>
      </div>

      {/* Stat row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', background: ED.surf, borderBottom: `1px solid ${ED.border}` }}>
        {[
        { v: d.cards, l: 'cards' },
        { v: d.due, l: 'due' },
        { v: d.mastered, l: 'mastered' }].
        map((s, i) =>
        <div key={s.l} style={{ padding: '14px 16px', borderRight: i < 2 ? `1px solid ${ED.border}` : 'none' }}>
            <div style={{ fontSize: 24, fontWeight: 800, letterSpacing: '-0.03em', lineHeight: 1 }}>{s.v}</div>
            <SectionLabel style={{ fontSize: 9.5, marginTop: 5 }}>{s.l}</SectionLabel>
          </div>
        )}
      </div>

      {/* CTA */}
      <div style={{ padding: '14px 20px', background: ED.surf, borderBottom: `1px solid ${ED.border}` }}>
        <button onClick={() => goto('quiz')} style={{
          width: '100%', padding: '12px', borderRadius: 8,
          border: 'none', background: ED.accent, color: '#fff',
          fontSize: 13.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit'
        }}>Review {d.due} due →</button>
      </div>

      {/* Cards list — card style */}
      <div style={{ padding: '16px 16px 24px' }}>
        <div style={{ padding: '0 4px 10px' }}>
          <SectionLabel>Cards</SectionLabel>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {d.list.map((c) => (
            <div key={c.n} style={{
              background: ED.surf, border: `1px solid ${ED.border}`, borderRadius: 10,
              padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer'
            }}>
              <div style={{ fontSize: 10.5, color: ED.muted, fontVariantNumeric: 'tabular-nums', fontWeight: 600, width: 22 }}>{c.n}</div>
              <div style={{ flex: 1, fontSize: 13, color: ED.sub, fontWeight: 500 }}>{c.q}</div>
              <span style={{
                fontSize: 9.5, padding: '3px 8px', borderRadius: 10,
                background: statusBg[c.status], color: statusColor[c.status],
                letterSpacing: '0.06em', textTransform: 'uppercase', fontWeight: 600
              }}>{c.status}</span>
            </div>
          ))}
        </div>
      </div>
    </EdBase>);

}

// ── Editorial: Profile ─────────────────────────────────────────
function EditorialProfile({ fontFamily }) {
  const days = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
  const active = [true, true, true, true, false, false, false];

  return (
    <EdBase fontFamily={fontFamily} style={{ paddingBottom: 70 }}>
      <div style={{ padding: '20px 20px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: `1px solid ${ED.border}` }}>
        <span style={{ fontSize: 13, fontWeight: 600, letterSpacing: '-0.01em' }}>Alex Morgan</span>
        <span style={{ fontSize: 12, color: ED.muted }}>Level 14</span>
      </div>

      <div style={{ padding: '18px 20px', display: 'flex', alignItems: 'center', gap: 14, borderBottom: `1px solid ${ED.border}` }}>
        <div style={{ width: 44, height: 44, borderRadius: '50%', background: ED.accent, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, fontWeight: 700, color: '#fff', flexShrink: 0 }}>A</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 17, fontWeight: 700, letterSpacing: '-0.02em' }}>Alex Morgan</div>
          <div style={{ fontSize: 12, color: ED.muted, marginTop: 2 }}>Member since Jan 2025</div>
        </div>
        <div style={{ fontSize: 12, color: ED.accent, fontWeight: 600 }}>Edit</div>
      </div>

      <div style={{ padding: '20px 20px 18px', borderBottom: `1px solid ${ED.border}`, background: ED.surf }}>
        <SectionLabel style={{ marginBottom: 8 }}>Current Streak</SectionLabel>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <span style={{ fontSize: 52, fontWeight: 900, letterSpacing: '-0.04em', lineHeight: 1 }}>47</span>
          <span style={{ fontSize: 13, color: ED.muted }}>days</span>
          <span style={{ marginLeft: 'auto', fontSize: 12, color: ED.muted }}>Best: 61</span>
        </div>
        <div style={{ display: 'flex', gap: 6, marginTop: 14 }}>
          {days.map((d, i) =>
          <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
              <div style={{ width: '100%', aspectRatio: '1', borderRadius: 4, background: active[i] ? ED.accent : ED.bg, border: `1.5px solid ${active[i] ? ED.accent : ED.border}` }} />
              <div style={{ fontSize: 9, color: ED.muted, fontWeight: 500 }}>{d}</div>
            </div>
          )}
        </div>
        <div style={{ height: 2, borderRadius: 1, background: ED.dim, marginTop: 14, overflow: 'hidden' }}>
          <div style={{ width: '78%', height: '100%', background: ED.accent }} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
          <span style={{ fontSize: 10, color: ED.muted }}>78% to monthly goal</span>
          <span style={{ fontSize: 10, color: ED.muted }}>Goal: 60 days</span>
        </div>
      </div>

      <div style={{ background: ED.surf, borderBottom: `1px solid ${ED.border}` }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', borderBottom: `1px solid ${ED.border}` }}>
          {[
          { label: 'Accuracy', val: '84%', sub: 'avg across all decks' },
          { label: 'Certificates', val: '3', sub: 'completed' }].
          map((item, i) =>
          <div key={item.label} style={{ padding: '16px 18px', borderRight: i === 0 ? `1px solid ${ED.border}` : 'none' }}>
              <SectionLabel style={{ marginBottom: 6 }}>{item.label}</SectionLabel>
              <div style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-0.03em', lineHeight: 1 }}>{item.val}</div>
              <div style={{ fontSize: 11, color: ED.muted, marginTop: 4 }}>{item.sub}</div>
            </div>
          )}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr' }}>
          {[
          { label: 'Global rank', val: '#12', sub: 'this week' },
          { label: 'Focus queue', val: '5', sub: 'cards due today' }].
          map((item, i) =>
          <div key={item.label} style={{ padding: '16px 18px', borderRight: i === 0 ? `1px solid ${ED.border}` : 'none' }}>
              <SectionLabel style={{ marginBottom: 6 }}>{item.label}</SectionLabel>
              <div style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-0.03em', lineHeight: 1 }}>{item.val}</div>
              <div style={{ fontSize: 11, color: ED.muted, marginTop: 4 }}>{item.sub}</div>
            </div>
          )}
        </div>
      </div>

      <div style={{ background: ED.surf, borderBottom: `1px solid ${ED.border}` }}>
        <div style={{ padding: '14px 18px 10px' }}>
          <SectionLabel>Recently Mastered</SectionLabel>
        </div>
        {[
        { topic: 'Treaty of Westphalia', pct: 92 },
        { topic: 'Por vs Para', pct: 87 },
        { topic: 'Cross-price elasticity', pct: 79 }].
        map((item, idx, arr) =>
        <div key={item.topic}>
            <div style={{ padding: '10px 18px', display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ flex: 1, fontSize: 13, fontWeight: 500, color: ED.sub }}>{item.topic}</div>
              <div style={{ width: 48, height: 2, borderRadius: 1, background: ED.dim, overflow: 'hidden', flexShrink: 0 }}>
                <div style={{ width: `${item.pct}%`, height: '100%', background: ED.accent }} />
              </div>
              <div style={{ fontSize: 12, color: ED.accent, fontWeight: 700, width: 32, textAlign: 'right' }}>{item.pct}%</div>
            </div>
            {idx < arr.length - 1 && <Div style={{ margin: '0 18px' }} />}
          </div>
        )}
        <div style={{ height: 10 }} />
      </div>
    </EdBase>);

}

// ── Editorial: Create — interactive ────────────────────────────
function EditorialCreate({ fontFamily }) {
  const [prompt, setPrompt] = React.useState('Explain the causes of the French Revolution');
  const [phase, setPhase] = React.useState('idle'); // idle | generating | done
  const [cards, setCards] = React.useState([]);
  const [kept, setKept] = React.useState({});

  const PRESET = [
  { n: '01', tag: 'Core Concept', title: 'What sparked the French Revolution?',
    body: 'A convergence of fiscal crisis, Enlightenment political thought, and a rigid estate system that excluded the bourgeoisie from real power.',
    ex: '"Let them eat cake" — apocryphal, but captures the disconnect of Versailles from rural famine.' },
  { n: '02', tag: 'Mechanism', title: 'The Estates-General (1789)' },
  { n: '03', tag: 'Consequence', title: 'From Bastille to the Terror' }];


  const generate = () => {
    if (!prompt.trim()) return;
    setPhase('generating');
    setCards([]);
    setKept({});
    PRESET.forEach((c, i) => {
      setTimeout(() => {
        setCards((prev) => [...prev, c]);
        if (i === PRESET.length - 1) setPhase('done');
      }, 350 + i * 350);
    });
  };

  return (
    <EdBase fontFamily={fontFamily} style={{ paddingBottom: 70 }}>
      <div style={{ padding: '18px 20px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: `1px solid ${ED.border}` }}>
        <span style={{ fontSize: 15, fontWeight: 700, letterSpacing: '-0.02em' }}>New card set</span>
        <span style={{ fontSize: 12, color: ED.accent, fontWeight: 600 }}>History</span>
      </div>

      <div style={{ background: ED.surf, borderBottom: `1px solid ${ED.border}` }}>
        <div style={{ padding: '14px 18px 6px' }}>
          <SectionLabel style={{ marginBottom: 10 }}>What do you want to learn?</SectionLabel>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Type a question, paste a passage, or describe a topic…"
            style={{
              width: '100%', minHeight: 64, border: 'none', outline: 'none',
              resize: 'none', background: 'transparent', color: ED.text,
              fontSize: 15, lineHeight: 1.55, fontFamily: 'inherit'
            }} />
          
        </div>
        <div style={{ display: 'flex', alignItems: 'center', borderTop: `1px solid ${ED.border}` }}>
          {['Attach', 'Voice', 'Doc'].map((label, i) =>
          <button key={label} style={{ padding: '9px 14px', background: 'none', border: 'none', borderRight: `1px solid ${ED.border}`, fontSize: 11.5, cursor: 'pointer', color: ED.muted, fontFamily: 'inherit', letterSpacing: '0.04em', textTransform: 'uppercase', fontWeight: 600 }}>{label}</button>
          )}
          <button onClick={generate} disabled={phase === 'generating'} style={{
            marginLeft: 'auto', padding: '9px 16px', background: 'none',
            border: 'none', color: phase === 'generating' ? ED.muted : ED.accent,
            fontSize: 13, fontWeight: 700, cursor: phase === 'generating' ? 'default' : 'pointer',
            fontFamily: 'inherit'
          }}>{phase === 'generating' ? 'Generating…' : 'Generate →'}</button>
        </div>
      </div>

      {/* Generated label */}
      <div style={{ padding: '14px 18px 10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <SectionLabel>
          {phase === 'idle' && 'Awaiting prompt'}
          {phase === 'generating' && `Generating — ${cards.length} of ${PRESET.length}`}
          {phase === 'done' && `Generated — ${cards.length} cards`}
        </SectionLabel>
        {phase === 'done' && <span style={{ fontSize: 12, color: ED.accent, fontWeight: 600, cursor: 'pointer' }}>Save all</span>}
      </div>

      {/* Empty state */}
      {phase === 'idle' &&
      <div style={{ margin: '0 16px 16px', padding: '24px 18px', border: `1px dashed ${ED.dim}`, borderRadius: 10, textAlign: 'center' }}>
          <div style={{ fontSize: 13, color: ED.muted, lineHeight: 1.6 }}>Cards will appear here.<br />Try: "Verb conjugation in Spanish," or paste a paragraph.</div>
        </div>
      }

      {/* Loading skeletons */}
      {phase === 'generating' && cards.length === 0 &&
      <div style={{ margin: '0 16px' }}>
          {[0, 1, 2].map((i) =>
        <div key={i} style={{ background: ED.surf, border: `1px solid ${ED.border}`, borderRadius: 10, padding: '14px', marginBottom: 6 }}>
              <div style={{ height: 8, width: 80, background: ED.dim, borderRadius: 2, marginBottom: 8, opacity: 0.5 }} />
              <div style={{ height: 14, width: '70%', background: ED.dim, borderRadius: 2, opacity: 0.5 }} />
            </div>
        )}
        </div>
      }

      {/* Generated cards */}
      {cards.map((c, i) => i === 0 ?
      <div key={c.n} style={{ background: ED.surf, border: `1px solid ${ED.border}`, margin: '0 16px', borderRadius: 10 }}>
          <div style={{ padding: '12px 14px', borderBottom: `1px solid ${ED.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <SectionLabel style={{ marginBottom: 4 }}>Card {c.n} · {c.tag}</SectionLabel>
              <div style={{ fontSize: 15, fontWeight: 700, letterSpacing: '-0.015em', lineHeight: 1.3 }}>{c.title}</div>
            </div>
            <span style={{ fontSize: 12, color: ED.accent, fontWeight: 600, marginLeft: 10, flexShrink: 0 }}>Edit</span>
          </div>
          <div style={{ padding: '12px 14px' }}>
            <div style={{ fontSize: 13, color: ED.sub, lineHeight: 1.65, marginBottom: 12 }}>{c.body}</div>
            {c.ex &&
          <div style={{ border: `1px solid ${ED.border}`, borderRadius: 6, padding: '10px 12px', background: ED.bg }}>
                <SectionLabel style={{ marginBottom: 5 }}>Example</SectionLabel>
                <div style={{ fontSize: 12, color: ED.sub, fontFamily: 'monospace', lineHeight: 1.6 }}>{c.ex}</div>
              </div>
          }
          </div>
          <div style={{ display: 'flex', borderTop: `1px solid ${ED.border}` }}>
            {[
          { label: 'Discard', color: ED.muted, key: 'discard' },
          { label: 'Regenerate', color: ED.muted, key: 'regen' },
          { label: kept[c.n] ? 'Kept ✓' : 'Keep', color: ED.accent, key: 'keep' }].
          map((b, j, arr) =>
          <button key={b.key} onClick={() => b.key === 'keep' && setKept({ ...kept, [c.n]: true })} style={{
            flex: 1, padding: '10px 0', background: 'none', border: 'none',
            borderRight: j < arr.length - 1 ? `1px solid ${ED.border}` : 'none',
            color: b.color, fontSize: 12, cursor: 'pointer',
            fontFamily: 'inherit', fontWeight: b.key === 'keep' ? 700 : 400
          }}>{b.label}</button>
          )}
          </div>
        </div> :

      <div key={c.n} style={{ margin: '6px 16px 0', background: ED.surf, border: `1px solid ${ED.border}`, borderRadius: 10, padding: '12px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}>
          <div>
            <SectionLabel style={{ marginBottom: 3 }}>Card {c.n}</SectionLabel>
            <div style={{ fontSize: 14, fontWeight: 600 }}>{c.title}</div>
          </div>
          <span style={{ fontSize: 16, color: ED.dim }}>›</span>
        </div>
      )}

      <div style={{ height: 24 }} />
    </EdBase>);

}

// ── Editorial: Quiz — multi-question with mode switching ───────
const QUESTIONS = [
{
  mode: 'mcq',
  topic: 'World History',
  q: 'What was the Treaty of Westphalia (1648) most known for establishing?',
  opts: [
  'The principle of state sovereignty in international relations',
  'The abolition of the Holy Roman Empire entirely',
  'A unified European currency system',
  'The Catholic Church\u2019s authority over secular states'],

  correct: 0,
  explain: 'Westphalia ended the Thirty Years\u2019 War and codified the principle that states have authority over their own territory — the bedrock of the modern state system.'
},
{
  mode: 'recall',
  topic: 'Spanish · A2',
  q: 'Translate to English: "Echar de menos"',
  answer: 'to miss',
  explain: '"Echar de menos" means to miss someone or something. Latin American Spanish often uses "extrañar" instead.'
},
{
  mode: 'flip',
  topic: 'Microeconomics',
  q: 'Cross-price elasticity of demand',
  back: 'Measures how the quantity demanded of one good changes in response to a price change of another. Positive → substitutes; negative → complements.'
},
{
  mode: 'mcq',
  topic: 'Cell Biology',
  q: 'What is the net ATP yield per glucose molecule from the Krebs cycle alone?',
  opts: ['2 ATP', '4 ATP', '6 ATP', '36 ATP'],
  correct: 0,
  explain: 'The Krebs cycle directly produces 2 ATP (or GTP) per glucose. Most ATP comes later from the electron transport chain.'
}];


// ── Editorial: Explore — discover decks ─────────────────────────
function EditorialExplore({ openDeck, fontFamily }) {
  const [activeCat, setActiveCat] = React.useState('all');

  const categories = [
    { id: 'all', label: 'All' },
    { id: 'lang', label: 'Languages' },
    { id: 'sci',  label: 'Science' },
    { id: 'hist', label: 'History' },
    { id: 'tech', label: 'Tech' },
    { id: 'arts', label: 'Arts' }
  ];

  const featured = {
    id: 'feat-stoic',
    title: 'Stoic Philosophy',
    sub: 'Marcus Aurelius, Epictetus, Seneca · 64 cards',
    author: 'Curated by MemQ',
    learners: '12.4k'
  };

  const trending = [
    { id: 't1', title: 'Japanese · N5 Kanji', sub: '103 cards · @hiro',          cat: 'lang', new: true,  learners: '8.2k' },
    { id: 't2', title: 'Organic Chemistry I', sub: 'Functional groups · @melb', cat: 'sci',  new: false, learners: '5.6k' },
    { id: 't3', title: 'Roman Emperors',      sub: '49 emperors · @classics',   cat: 'hist', new: false, learners: '3.1k' },
    { id: 't4', title: 'Big-O Complexity',    sub: 'Algorithms · @csprep',      cat: 'tech', new: true,  learners: '9.8k' },
    { id: 't5', title: 'Renaissance Painters',sub: '32 cards · @atlas',         cat: 'arts', new: false, learners: '2.4k' },
    { id: 't6', title: 'French · A1 Verbs',   sub: '58 conjugations · @lou',    cat: 'lang', new: false, learners: '6.0k' }
  ];

  const filtered = activeCat === 'all' ? trending : trending.filter((d) => d.cat === activeCat);

  return (
    <EdBase fontFamily={fontFamily} style={{ paddingBottom: 70 }}>
      {/* Top bar */}
      <div style={{ padding: '18px 20px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: `1px solid ${ED.border}` }}>
        <div style={{ fontSize: 19, fontWeight: 800, letterSpacing: '-0.025em' }}>Explore</div>
        <span style={{ fontSize: 12, color: ED.accent, fontWeight: 600 }}>Search</span>
      </div>

      {/* Featured deck — editorial hero */}
      <div style={{ padding: '18px 20px 20px', borderBottom: `1px solid ${ED.border}`, background: ED.surf }}>
        <SectionLabel style={{ color: ED.accent, fontWeight: 600, marginBottom: 10 }}>Featured · This week</SectionLabel>
        <div onClick={() => openDeck && openDeck(featured.id)} style={{
          background: ED.bg, border: `1px solid ${ED.border}`, borderRadius: 12,
          padding: '20px 18px', cursor: 'pointer', position: 'relative', overflow: 'hidden'
        }}>
          {/* corner ornament */}
          <div style={{ position: 'absolute', top: 14, right: 14, fontSize: 10, color: ED.muted, letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 600, fontFamily: "'JetBrains Mono', ui-monospace, monospace" }}>№ 04</div>
          <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.03em', lineHeight: 1.15, marginTop: 8 }}>{featured.title}</div>
          <div style={{ fontSize: 12.5, color: ED.muted, marginTop: 6, lineHeight: 1.5 }}>{featured.sub}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 14, paddingTop: 12, borderTop: `1px solid ${ED.borderS}` }}>
            <span style={{ fontSize: 11, color: ED.text, fontWeight: 600 }}>{featured.author}</span>
            <span style={{ width: 3, height: 3, borderRadius: '50%', background: ED.dim }} />
            <span style={{ fontSize: 11, color: ED.muted, fontVariantNumeric: 'tabular-nums' }}>{featured.learners} learners</span>
          </div>
        </div>
      </div>

      {/* Category chips */}
      <div style={{ borderBottom: `1px solid ${ED.border}`, background: ED.surf, padding: '12px 20px', overflowX: 'auto' }}>
        <div style={{ display: 'flex', gap: 6 }}>
          {categories.map((c) => {
            const isActive = activeCat === c.id;
            return (
              <button key={c.id} onClick={() => setActiveCat(c.id)} style={{
                padding: '6px 11px', borderRadius: 999, fontSize: 12,
                fontWeight: isActive ? 700 : 500,
                background: isActive ? ED.text : 'transparent',
                color: isActive ? ED.surf : ED.sub,
                border: `1px solid ${isActive ? ED.text : ED.border}`,
                cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap'
              }}>{c.label}</button>
            );
          })}
        </div>
      </div>

      {/* Trending list */}
      <div style={{ padding: '16px 16px 24px' }}>
        <div style={{ padding: '0 4px 10px', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <SectionLabel>Trending</SectionLabel>
          <span style={{ fontSize: 10.5, color: ED.muted, fontVariantNumeric: 'tabular-nums' }}>{filtered.length} decks</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {filtered.map((d, i) => (
            <div key={d.id} onClick={() => openDeck && openDeck(d.id)} style={{
              background: ED.surf, border: `1px solid ${ED.border}`, borderRadius: 10,
              padding: '14px 14px', cursor: 'pointer', display: 'flex', gap: 12, alignItems: 'flex-start'
            }}>
              <div style={{
                width: 32, height: 32, borderRadius: 6, flexShrink: 0,
                background: ED.bg, border: `1px solid ${ED.border}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontFamily: "'JetBrains Mono', ui-monospace, monospace",
                fontSize: 12, fontWeight: 700, color: ED.muted, fontVariantNumeric: 'tabular-nums'
              }}>{String(i + 1).padStart(2, '0')}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, letterSpacing: '-0.015em', color: ED.text }}>{d.title}</div>
                  {d.new && <span style={{ fontSize: 9, padding: '2px 6px', borderRadius: 3, background: ED.accentL, color: ED.accent, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' }}>New</span>}
                </div>
                <div style={{ fontSize: 11.5, color: ED.muted, marginTop: 3 }}>{d.sub}</div>
                <div style={{ fontSize: 10.5, color: ED.muted, marginTop: 8, fontVariantNumeric: 'tabular-nums', letterSpacing: '0.02em' }}>{d.learners} learners</div>
              </div>
              <div style={{ alignSelf: 'center', color: ED.muted, fontSize: 18, lineHeight: 1 }}>›</div>
            </div>
          ))}
        </div>
      </div>
    </EdBase>);
}


function EditorialQuiz({ fontFamily }) {
  const [idx, setIdx] = React.useState(0);
  const [selected, setSelected] = React.useState(null);
  const [revealed, setRevealed] = React.useState(false);
  const [recallText, setRecallText] = React.useState('');
  const [flipped, setFlipped] = React.useState(false);

  const total = QUESTIONS.length;
  const q = QUESTIONS[idx];
  const progress = (idx + (revealed ? 1 : 0)) / total * 100;

  const next = () => {
    if (idx < total - 1) {
      setIdx(idx + 1);
      setSelected(null);
      setRevealed(false);
      setRecallText('');
      setFlipped(false);
    } else {
      // restart
      setIdx(0);setSelected(null);setRevealed(false);setRecallText('');setFlipped(false);
    }
  };

  const recallCorrect = recallText.trim().toLowerCase().includes('miss');

  return (
    <EdBase fontFamily={fontFamily} style={{ paddingBottom: 70 }}>
      {/* Progress */}
      <div style={{ height: 2, background: ED.dim }}>
        <div style={{ width: `${progress}%`, height: '100%', background: ED.accent, transition: 'width 0.25s' }} />
      </div>

      {/* Nav */}
      <div style={{ padding: '14px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: `1px solid ${ED.border}` }}>
        <span style={{ fontSize: 13, color: ED.muted }}>← Back</span>
        <span style={{ fontSize: 12, color: ED.muted, fontVariantNumeric: 'tabular-nums' }}>{idx + 1} of {total}</span>
      </div>

      {/* Topic + question */}
      <div style={{ padding: '20px 20px 0' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <SectionLabel style={{ color: ED.accent, fontWeight: 600, fontSize: 10.5 }}>{q.topic}</SectionLabel>
          <span style={{ fontSize: 9.5, padding: '2px 7px', borderRadius: 9, background: ED.bg, border: `1px solid ${ED.border}`, color: ED.muted, letterSpacing: '0.06em', textTransform: 'uppercase', fontWeight: 600 }}>
            {q.mode === 'mcq' ? 'Choose' : q.mode === 'recall' ? 'Recall' : 'Flashcard'}
          </span>
        </div>
        <div style={{ fontSize: 19, fontWeight: 700, lineHeight: 1.38, letterSpacing: '-0.025em' }}>{q.q}</div>
      </div>

      {/* MCQ */}
      {q.mode === 'mcq' &&
      <div style={{ margin: '20px 20px 0', display: 'flex', flexDirection: 'column', background: ED.surf, border: `1px solid ${ED.border}`, borderRadius: 10, overflow: 'hidden' }}>
          {q.opts.map((opt, i) => {
          const isSelected = selected === i;
          const isCorrect = i === q.correct;
          let leftColor = 'transparent',bg = 'transparent',textColor = ED.text;
          let labelColor = ED.muted,labelBg = ED.bg;
          if (revealed && isCorrect) {leftColor = ED.green;bg = ED.greenL;textColor = ED.green;labelColor = '#fff';labelBg = ED.green;} else
          if (revealed && isSelected && !isCorrect) {leftColor = ED.red;bg = ED.redL;textColor = ED.red;labelColor = '#fff';labelBg = ED.red;} else
          if (!revealed && isSelected) {leftColor = ED.accent;labelColor = '#fff';labelBg = ED.accent;}

          return (
            <div key={i} onClick={() => !revealed && setSelected(i)} style={{ display: 'flex', borderBottom: i < q.opts.length - 1 ? `1px solid ${ED.border}` : 'none', cursor: revealed ? 'default' : 'pointer', background: bg, transition: 'background 0.15s' }}>
                <div style={{ width: 3, background: leftColor, flexShrink: 0 }} />
                <div style={{ display: 'flex', gap: 11, padding: '13px 14px', flex: 1, alignItems: 'flex-start' }}>
                  <div style={{ width: 22, height: 22, borderRadius: 5, background: labelBg, border: `1px solid ${revealed || isSelected ? 'transparent' : ED.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: labelColor, flexShrink: 0 }}>
                    {revealed && isCorrect ? (
                      <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7" /></svg>
                    ) : revealed && isSelected && !isCorrect ? (
                      <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round"><path d="M6 6l12 12M18 6l-12 12" /></svg>
                    ) : String.fromCharCode(65 + i)}
                  </div>
                  <div style={{ fontSize: 14, lineHeight: 1.5, color: textColor, paddingTop: 3, fontWeight: revealed && (isCorrect || isSelected && !isCorrect) ? 500 : 400 }}>{opt}</div>
                </div>
              </div>);

        })}
        </div>
      }

      {/* Recall */}
      {q.mode === 'recall' &&
      <div style={{ margin: '20px 20px 0' }}>
          <div style={{ background: ED.surf, border: `1px solid ${revealed ? (recallCorrect ? ED.green : ED.red) + '50' : ED.border}`, borderRadius: 10, overflow: 'hidden' }}>
            <textarea
            value={recallText}
            onChange={(e) => setRecallText(e.target.value)}
            disabled={revealed}
            placeholder="Type your answer…"
            style={{ width: '100%', minHeight: 80, padding: '14px', border: 'none', outline: 'none', resize: 'none', background: 'transparent', color: ED.text, fontSize: 15, lineHeight: 1.55, fontFamily: 'inherit' }} />
          
            <div style={{ borderTop: `1px solid ${ED.border}`, padding: '8px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: ED.bg }}>
              <span style={{ fontSize: 11, color: ED.muted }}>{recallText.length} characters</span>
              {revealed &&
            <span style={{ fontSize: 11, fontWeight: 700, color: recallCorrect ? ED.green : ED.red, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                  {recallCorrect ? '✓ Match' : '✗ No match'}
                </span>
            }
            </div>
          </div>
          {revealed &&
        <div style={{ marginTop: 12, padding: '12px 14px', background: ED.surf, border: `1px solid ${ED.border}`, borderRadius: 8 }}>
              <SectionLabel style={{ marginBottom: 5 }}>Answer</SectionLabel>
              <div style={{ fontSize: 14, fontWeight: 600, color: ED.text }}>{q.answer}</div>
            </div>
        }
        </div>
      }

      {/* Flashcard flip */}
      {q.mode === 'flip' &&
      <div style={{ margin: '20px 20px 0' }}>
          <div onClick={() => setFlipped(!flipped)} style={{
          background: ED.surf, border: `1px solid ${ED.border}`, borderRadius: 10,
          padding: '24px 20px', cursor: 'pointer', minHeight: 140, position: 'relative'
        }}>
            <SectionLabel style={{ marginBottom: 10 }}>{flipped ? 'Back' : 'Front · tap to flip'}</SectionLabel>
            {!flipped ?
          <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: '-0.02em', lineHeight: 1.35 }}>{q.q}</div> :

          <div style={{ fontSize: 14, lineHeight: 1.6, color: ED.sub }}>{q.back}</div>
          }
            <div style={{ position: 'absolute', top: 14, right: 14, fontSize: 10.5, color: ED.muted, letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 600 }}>
              {flipped ? '← Front' : 'Tap →'}
            </div>
          </div>
          {flipped &&
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6, marginTop: 12 }}>
              {[
          { label: 'Again', color: ED.red },
          { label: 'Hard', color: ED.warn },
          { label: 'Good', color: ED.accent },
          { label: 'Easy', color: ED.green }].
          map((b) =>
          <button key={b.label} onClick={next} style={{
            padding: '10px 0', background: ED.surf, border: `1px solid ${ED.border}`,
            borderRadius: 8, color: b.color, fontSize: 12, fontWeight: 700,
            cursor: 'pointer', fontFamily: 'inherit'
          }}>{b.label}</button>
          )}
            </div>
        }
        </div>
      }

      {/* Feedback (mcq + recall) */}
      {revealed && q.mode !== 'flip' && q.explain &&
      <div style={{ margin: '12px 20px 0', padding: '12px 14px',
        background: q.mode === 'recall' && !recallCorrect ? ED.redL : ED.greenL,
        border: `1px solid ${q.mode === 'recall' && !recallCorrect ? ED.red : ED.green}30`,
        borderRadius: 8 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: q.mode === 'recall' && !recallCorrect ? ED.red : ED.green, marginBottom: 3, letterSpacing: '0.04em' }}>
            {q.mode === 'recall' ? recallCorrect ? 'Correct' : 'Not quite' :
          selected === q.correct ? 'Correct' : 'Incorrect'}
          </div>
          <div style={{ fontSize: 12, color: ED.sub, lineHeight: 1.6 }}>{q.explain}</div>
        </div>
      }

      {/* CTA — hidden for flip mode (uses confidence buttons) */}
      {q.mode !== 'flip' &&
      <div style={{ padding: '14px 20px 24px' }}>
          <button
          onClick={() => {
            if (!revealed) {
              if (q.mode === 'mcq' && selected === null) return;
              if (q.mode === 'recall' && !recallText.trim()) return;
              setRevealed(true);
            } else {
              next();
            }
          }}
          disabled={!revealed && (q.mode === 'mcq' && selected === null || q.mode === 'recall' && !recallText.trim())}
          style={{
            width: '100%', padding: '14px', borderRadius: 8, border: 'none',
            background: !revealed && (q.mode === 'mcq' && selected === null || q.mode === 'recall' && !recallText.trim()) ? ED.dim : ED.accent,
            color: '#fff', fontSize: 14, fontWeight: 700,
            cursor: 'pointer', fontFamily: 'inherit'
          }}>
          
            {revealed ? idx === total - 1 ? 'Restart' : 'Next question →' : 'Check answer'}
          </button>
        </div>
      }
    </EdBase>);

}

Object.assign(window, {
  EditorialHome, EditorialLibrary, EditorialDeckDetail,
  EditorialProfile, EditorialCreate, EditorialQuiz, EditorialExplore,
  TabBar, ED
});