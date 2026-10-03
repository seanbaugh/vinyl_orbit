import { BarChart3, DollarSign, Headphones } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useStats } from '../api/hooks';
import { CoverCard } from '../components/CoverCard';
import { fmtMoney } from '../lib/format';

const TOP = 15;
const tick = { fill: 'var(--muted)', fontSize: 12 };
const tooltipStyle = {
  contentStyle: { background: 'var(--surface)', border: '1px solid var(--border-strong)', borderRadius: 8, color: 'var(--text)' },
  labelStyle: { color: 'var(--text)', fontWeight: 600 },
  itemStyle: { color: 'var(--text)' },
  cursor: { fill: 'var(--surface-2)' },
};

interface Row { label: string; value: number; href?: string }

/** Single-series horizontal bar chart; every bar carries a direct value label (accent alone may be low-contrast in light mode). */
function HBar({ title, rows, format = String }: { title: string; rows: Row[]; format?: (v: number) => string }) {
  const navigate = useNavigate();
  const shown = rows.slice(0, TOP);
  const more = rows.length - shown.length;
  return (
    <section className="card card-pad">
      <h2 className="section-title">{title}{more > 0 ? ` · top ${TOP} of ${rows.length}` : ''}</h2>
      {shown.length === 0 ? <div className="muted">No data yet.</div> : (
        <div style={{ height: shown.length * 30 + 10 }}>
          <ResponsiveContainer>
            <BarChart data={shown} layout="vertical" margin={{ top: 0, right: 56, bottom: 0, left: 0 }} barCategoryGap={6}>
              <CartesianGrid horizontal={false} stroke="var(--border)" />
              <XAxis type="number" hide />
              <YAxis type="category" dataKey="label" width={150} tick={tick} axisLine={false} tickLine={false} interval={0} />
              <Tooltip {...tooltipStyle} formatter={(v) => [format(Number(v)), title]} />
              <Bar dataKey="value" isAnimationActive={false} fill="var(--accent)" radius={[0, 4, 4, 0]} maxBarSize={20} cursor="pointer"
                onClick={(d) => { const href = (d as unknown as { payload?: Row }).payload?.href; if (href) navigate(href); }}>
                <LabelList dataKey="value" position="right" formatter={(v) => format(Number(v))} style={{ fill: 'var(--text)', fontSize: 12 }} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </section>
  );
}

/** Vertical bars for ordered categories (decades, months). */
function VBar({ title, rows, icon }: { title: string; rows: Row[]; icon?: React.ReactNode }) {
  const navigate = useNavigate();
  return (
    <section className="card card-pad">
      <h2 className="section-title row">{icon}{title}</h2>
      <div style={{ height: 220 }}>
        <ResponsiveContainer>
          <BarChart data={rows} margin={{ top: 20, right: 8, bottom: 0, left: 8 }}>
            <CartesianGrid vertical={false} stroke="var(--border)" />
            <XAxis dataKey="label" tick={tick} axisLine={{ stroke: 'var(--border-strong)' }} tickLine={false} interval={0} />
            <YAxis hide allowDecimals={false} />
            <Tooltip {...tooltipStyle} formatter={(v) => [String(v), title]} />
            <Bar dataKey="value" isAnimationActive={false} fill="var(--accent)" radius={[4, 4, 0, 0]} maxBarSize={44} cursor="pointer"
              onClick={(d) => { const href = (d as unknown as { payload?: Row }).payload?.href; if (href) navigate(href); }}>
              <LabelList dataKey="value" position="top" formatter={(v) => (Number(v) ? String(v) : '')} style={{ fill: 'var(--text)', fontSize: 12 }} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function Stats() {
  const { data: s, isLoading } = useStats();
  if (isLoading || !s) return <div className="empty">Loading…</div>;

  const facetRows = (rows: { value: string; count: number }[], param: string): Row[] =>
    rows.map((r) => ({ label: r.value, value: r.count, href: `/library?${param}=${encodeURIComponent(r.value)}` }));

  return (
    <div className="page">
      <h1 style={{ margin: '4px 4px 0', fontSize: 20 }} className="row"><BarChart3 size={18} className="accent" /> Collection stats</h1>

      <div className="stat-cards">
        <div className="card stat">
          <span className="label"><DollarSign /> Estimated value</span>
          <span className="value">{fmtMoney(s.totalValue, true)}</span>
          <span className="hint">sum of lowest Discogs marketplace prices</span>
        </div>
        <div className="card stat">
          <span className="label"><Headphones /> Plays in the last 12 months</span>
          <span className="value">{s.playsByMonth.reduce((a, b) => a + b.count, 0)}</span>
          <span className="hint">{s.mostPlayed.length ? `most played: ${s.mostPlayed[0].title}` : 'log plays from any record page'}</span>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 460px), 1fr))', gap: 16 }}>
        <VBar title="Records by decade" rows={s.byDecade.map((d) => ({ label: `${d.value}s`, value: d.count, href: `/library?decade=${d.value}` }))} />
        <VBar title="Plays by month" icon={<Headphones size={13} />}
          rows={s.playsByMonth.map((m) => ({ label: MONTHS[Number(m.month.slice(5)) - 1], value: m.count }))} />
        <HBar title="Genres" rows={facetRows(s.byGenre, 'genre')} />
        <HBar title="Formats" rows={facetRows(s.byFormat, 'format')} />
        <HBar title="Styles" rows={facetRows(s.byStyle, 'style')} />
        <HBar title="Labels" rows={facetRows(s.byLabel, 'label')} />
        <HBar title="Value by genre" rows={s.valueByGenre.map((g) => ({ label: g.value, value: Math.round(g.total),
          href: `/library?genre=${encodeURIComponent(g.value)}&sort=value&order=desc` }))} format={(v) => fmtMoney(v, true)} />
      </div>

      {s.mostPlayed.length > 0 && (
        <section className="card shelf">
          <div className="shelf-head"><Headphones size={16} className="accent" /><h2>Most played</h2></div>
          <div className="shelf-row">{s.mostPlayed.map((it) => <CoverCard key={it.id} item={it} />)}</div>
        </section>
      )}
    </div>
  );
}
