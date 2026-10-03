import DOMPurify from 'dompurify';
import { marked } from 'marked';
import { ExternalLink, Play as PlayIcon, Star, Trash2 } from 'lucide-react';
import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { Line, LineChart, ResponsiveContainer, Tooltip, YAxis } from 'recharts';
import type { ReleaseDetail } from '@api/api-types';
import { useAddPlay, useDeletePlay, useRelease, useSaveNote } from '../api/hooks';
import { CoverImage } from '../components/CoverImage';
import { CrateMenu } from '../components/CrateMenu';
import { Lightbox } from '../components/Lightbox';
import { TagEditor } from '../components/TagEditor';
import { fmtDate, fmtInt, fmtMoney, fmtRelative, fmtSeconds } from '../lib/format';

const TABS = ['tracks', 'notes', 'history', 'details'] as const;
type Tab = (typeof TABS)[number];

export function Release() {
  const id = Number(useParams().id);
  const { data: r, isLoading, error } = useRelease(id);
  const [sp, setSp] = useSearchParams();
  const tab: Tab = (TABS as readonly string[]).includes(sp.get('tab') ?? '') ? (sp.get('tab') as Tab) : 'tracks';
  const [lightbox, setLightbox] = useState<number | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const addPlay = useAddPlay(id);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2200);
    return () => clearTimeout(t);
  }, [toast]);

  if (isLoading) return <div className="empty">Loading…</div>;
  if (error || !r) return <div className="empty">{error ? (error as Error).message : 'Record not found.'}</div>;

  const label = r.labels[0];
  const runtime = r.sides.reduce((sum, s) => sum + (s.totalSeconds ?? 0), 0);

  return (
    <div className="page">
      {r.removed && <div className="banner">This record is no longer in your Discogs collection. Your notes and plays are kept.</div>}
      <div className="card">
        <div className="release-head">
          <CoverImage src={r.coverUrl} alt={r.title} onClick={() => r.images.length && setLightbox(0)} />
          <div style={{ minWidth: 0 }}>
            <h1>{r.title}</h1>
            <div className="release-artists">
              <Link to={`/library?artist=${encodeURIComponent(r.artists)}`}>{r.artists}</Link>
            </div>
            <div className="meta-line">
              {label && (
                <span>
                  <Link className="link" to={`/library?label=${encodeURIComponent(label.name)}`}>{label.name}</Link>
                  {label.catno && label.catno !== 'none' ? ` · ${label.catno}` : ''}
                </span>
              )}
              <span>{r.formatSummary}</span>
              {r.year && <Link className="link" to={`/library?decade=${Math.floor(r.year / 10) * 10}`}>{r.year}</Link>}
              {r.country && <span>{r.country}</span>}
              {r.copies > 1 && <span>{r.copies} copies</span>}
            </div>
            <div className="row wrap" style={{ marginBottom: 12 }}>
              {r.genres.map((g) => <Link key={g} className="chip" to={`/library?genre=${encodeURIComponent(g)}`}>{g}</Link>)}
              {r.styles.map((s) => <Link key={s} className="chip" to={`/library?style=${encodeURIComponent(s)}`}>{s}</Link>)}
            </div>
            <TagEditor releaseId={r.id} tags={r.tags} />
            <div className="actions">
              <button className="btn btn-primary" onClick={() => addPlay.mutate({}, { onSuccess: () => setToast('Logged a play') })}>
                <PlayIcon /> Played it
              </button>
              <CrateMenu releaseId={r.id} inCrates={r.crates} />
              <a className="btn" href={r.discogsUrl} target="_blank" rel="noreferrer"><ExternalLink /> Discogs</a>
            </div>
            <div className="row wrap">
              <span className="chip" title="Lowest price on the Discogs marketplace">Lowest {fmtMoney(r.lowestPrice)}</span>
              <span className="chip">{fmtInt(r.numForSale)} for sale</span>
              {r.communityRating !== null && (r.communityVotes ?? 0) > 0 && (
                <span className="chip"><Star /> {r.communityRating.toFixed(2)} ({fmtInt(r.communityVotes)})</span>
              )}
              {r.have !== null && <span className="chip">Have {fmtInt(r.have)} · Want {fmtInt(r.want)}</span>}
              <span className="chip">▶ {r.playCount} play{r.playCount === 1 ? '' : 's'}{r.lastPlayedAt ? ` · ${fmtRelative(r.lastPlayedAt)}` : ''}</span>
            </div>
          </div>
        </div>

        <div className="tabs" role="tablist">
          {TABS.map((t) => (
            <button key={t} role="tab" aria-selected={tab === t} className={tab === t ? 'active' : ''}
              onClick={() => setSp(t === 'tracks' ? {} : { tab: t }, { replace: true })}>
              {t === 'tracks' ? `Tracks${runtime ? ` · ${fmtSeconds(runtime)}` : ''}` : t[0].toUpperCase() + t.slice(1)}
              {t === 'notes' && r.note ? ' •' : ''}
            </button>
          ))}
        </div>
        <div className="tab-body">
          {tab === 'tracks' && <Tracks r={r} />}
          {tab === 'notes' && <Notes r={r} />}
          {tab === 'history' && <History r={r} />}
          {tab === 'details' && <Details r={r} />}
        </div>
      </div>

      {lightbox !== null && <Lightbox images={r.images} startIdx={lightbox} alt={r.title} onClose={() => setLightbox(null)} />}
      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  );
}

function Tracks({ r }: { r: ReleaseDetail }) {
  if (!r.detailSyncedAt) return <div className="muted">The tracklist will appear after the next sync.</div>;
  if (!r.sides.length) return <div className="muted">Discogs has no tracklist for this release.</div>;
  return (
    <>
      {r.sides.map((s, i) => (
        <div key={i} className="side-card">
          <div className="side-head">
            <span>{s.side ? (s.side.startsWith('Disc') ? s.side : `Side ${s.side}`) : 'Tracks'}</span>
            {s.totalSeconds !== null && <span className="muted">{fmtSeconds(s.totalSeconds)}</span>}
          </div>
          {s.tracks.map((t, j) =>
            t.type === 'heading' ? (
              <div key={j} className="track-heading">{t.title}</div>
            ) : (
              <div key={j} className="track">
                <span className="pos">{t.position}</span>
                <div style={{ minWidth: 0 }}>
                  <div>{t.title}</div>
                  {t.artists && <div className="muted" style={{ fontSize: 12 }}>{t.artists}</div>}
                  {t.credits && <div className="credits">{t.credits}</div>}
                </div>
                <span className="dur">{t.duration}</span>
              </div>
            ),
          )}
        </div>
      ))}
    </>
  );
}

type NoteMode = 'edit' | 'preview' | 'split';
type SaveState = { kind: 'idle' } | { kind: 'saving' } | { kind: 'saved'; at: string } | { kind: 'failed' };

const draftKey = (id: number) => `vo-note-draft-${id}`;
const readDraft = (id: number) => { try { return localStorage.getItem(draftKey(id)); } catch { return null; } };
const writeDraft = (id: number, v: string | null) => {
  try {
    if (v === null) localStorage.removeItem(draftKey(id));
    else localStorage.setItem(draftKey(id), v);
  } catch { /* storage unavailable */ }
};

function Notes({ r }: { r: ReleaseDetail }) {
  const saved = r.note?.bodyMd ?? '';
  const [text, setText] = useState(() => readDraft(r.id) ?? saved);
  const [mode, setMode] = useState<NoteMode>(() => (saved || readDraft(r.id) ? 'split' : 'edit'));
  const [state, setState] = useState<SaveState>(r.note ? { kind: 'saved', at: r.note.updatedAt } : { kind: 'idle' });
  const save = useSaveNote(r.id);
  const lastSent = useRef(saved);

  // Debounced autosave; on failure keep a local draft and retry every 5 s.
  useEffect(() => {
    if (text === lastSent.current && state.kind !== 'failed') return;
    const delay = state.kind === 'failed' ? 5000 : 800;
    const t = setTimeout(() => {
      setState({ kind: 'saving' });
      save.mutate(text, {
        onSuccess: (n) => {
          lastSent.current = text;
          writeDraft(r.id, null);
          setState({ kind: 'saved', at: n.updatedAt ?? new Date().toISOString() });
        },
        onError: () => {
          writeDraft(r.id, text);
          setState({ kind: 'failed' });
        },
      });
    }, delay);
    return () => clearTimeout(t);
  }, [text, state.kind]); // eslint-disable-line react-hooks/exhaustive-deps

  const html = useMemo(() => DOMPurify.sanitize(marked.parse(text || '*Nothing yet.*', { async: false }) as string), [text]);
  const status = state.kind === 'saving' ? 'Saving…'
    : state.kind === 'saved' ? `Saved ${new Date(state.at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`
    : state.kind === 'failed' ? 'Save failed — retrying' : '';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div className="row">
        <div className="seg" role="group" aria-label="Notes view">
          {(['edit', 'split', 'preview'] as NoteMode[]).map((m) => (
            <button key={m} className={mode === m ? 'active' : ''} style={{ width: 'auto', padding: '0 12px' }} onClick={() => setMode(m)}>
              {m[0].toUpperCase() + m.slice(1)}
            </button>
          ))}
        </div>
        <span className={state.kind === 'failed' ? 'sync-error' : 'muted'} style={{ marginLeft: 'auto', fontSize: 12 }}>{status}</span>
      </div>
      <div className={`notes-editor${mode === 'split' ? ' split' : ''}`}>
        {mode !== 'preview' && (
          <textarea value={text} onChange={(e) => setText(e.target.value)} aria-label="Notes (Markdown)"
            placeholder={'Write anything — pressing, condition, where you bought it, favourite tracks…\n\nMarkdown works: **bold**, - lists, > quotes'} />
        )}
        {mode !== 'edit' && <div className="markdown card card-pad" dangerouslySetInnerHTML={{ __html: html }} />}
      </div>
    </div>
  );
}

function History({ r }: { r: ReleaseDetail }) {
  const today = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(today);
  const [note, setNote] = useState('');
  const addPlay = useAddPlay(r.id);
  const delPlay = useDeletePlay(r.id);
  const prices = r.priceHistory.filter((p) => p.lowestPrice !== null);

  const log = () => {
    // A play logged for today keeps the current time; past dates are recorded at local noon.
    const playedAt = date === today ? new Date().toISOString() : new Date(`${date}T12:00:00`).toISOString();
    addPlay.mutate({ playedAt, note: note.trim() || null }, { onSuccess: () => setNote('') });
  };

  return (
    <div style={{ display: 'grid', gap: 20 }}>
      <section>
        <h3 className="section-title">Listening log · {r.playCount} play{r.playCount === 1 ? '' : 's'}</h3>
        <div className="row wrap" style={{ marginBottom: 12 }}>
          <input type="date" className="input" value={date} max={today} onChange={(e) => setDate(e.target.value)} aria-label="Play date" />
          <input className="input grow" style={{ minWidth: 180 }} placeholder="Note (optional)" value={note}
            onChange={(e) => setNote(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && log()} aria-label="Play note" />
          <button className="btn btn-primary" onClick={log} disabled={addPlay.isPending}><PlayIcon /> Log a play</button>
        </div>
        {r.plays.length ? (
          <div className="card">
            {r.plays.map((p) => (
              <div key={p.id} className="list-row">
                <span style={{ width: 120 }}>{fmtDate(p.playedAt)}</span>
                <span className="grow muted ellipsis">{p.note}</span>
                <button className="btn btn-sm btn-ghost" onClick={() => delPlay.mutate(p.id)} aria-label="Delete play"><Trash2 /></button>
              </div>
            ))}
          </div>
        ) : <div className="muted">No plays logged yet.</div>}
      </section>

      <section>
        <h3 className="section-title">Lowest price over time</h3>
        {prices.length < 2 ? (
          <div className="muted">Not enough data yet — a price point is recorded each time the record refreshes (weekly).
            {prices.length === 1 && ` Current: ${fmtMoney(prices[0].lowestPrice)}.`}</div>
        ) : (
          <div style={{ height: 120 }}>
            <ResponsiveContainer>
              <LineChart data={prices}>
                <YAxis hide domain={['auto', 'auto']} />
                <Tooltip formatter={(v) => fmtMoney(Number(v))} labelFormatter={(_, p) => fmtDate(p?.[0]?.payload?.date)}
                  contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8 }} />
                <Line isAnimationActive={false} type="monotone" dataKey="lowestPrice" stroke="var(--accent)" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </section>
    </div>
  );
}

function Details({ r }: { r: ReleaseDetail }) {
  const creditsByRole = new Map<string, string[]>();
  for (const c of r.credits) creditsByRole.set(c.role, [...(creditsByRole.get(c.role) ?? []), c.name]);
  return (
    <div style={{ display: 'grid', gap: 24 }}>
      {r.discogsNotes && (
        <section>
          <h3 className="section-title">Release notes</h3>
          <div style={{ whiteSpace: 'pre-wrap' }}>{r.discogsNotes}</div>
        </section>
      )}
      <section>
        <h3 className="section-title">Release</h3>
        <dl className="kv">
          <dt>Released</dt><dd>{r.released ?? r.year ?? '—'}</dd>
          <dt>Country</dt><dd>{r.country ?? '—'}</dd>
          <dt>Labels</dt><dd>{r.labels.map((l) => `${l.name}${l.catno && l.catno !== 'none' ? ` – ${l.catno}` : ''}`).join(', ') || '—'}</dd>
          <dt>Added to collection</dt><dd>{fmtDate(r.dateAdded)}</dd>
          <dt>Last synced</dt><dd>{r.detailSyncedAt ? fmtRelative(r.detailSyncedAt) : 'not yet'}</dd>
        </dl>
      </section>
      {creditsByRole.size > 0 && (
        <section>
          <h3 className="section-title">Credits</h3>
          <dl className="kv">
            {[...creditsByRole].map(([role, names]) => <Fragment key={role}><dt>{role}</dt><dd>{names.join(', ')}</dd></Fragment>)}
          </dl>
        </section>
      )}
      {r.companies.length > 0 && (
        <section>
          <h3 className="section-title">Companies</h3>
          <dl className="kv">
            {r.companies.map((c, i) => <Fragment key={i}><dt>{c.role}</dt><dd>{c.name}</dd></Fragment>)}
          </dl>
        </section>
      )}
      {r.identifiers.length > 0 && (
        <section>
          <h3 className="section-title">Barcodes & identifiers</h3>
          <dl className="kv">
            {r.identifiers.map((x, i) => (
              <Fragment key={i}><dt>{x.type}{x.description ? ` (${x.description})` : ''}</dt><dd>{x.value}</dd></Fragment>
            ))}
          </dl>
        </section>
      )}
      {r.videos.length > 0 && (
        <section>
          <h3 className="section-title">Videos</h3>
          <div style={{ display: 'grid', gap: 6 }}>
            {r.videos.map((v) => (
              <a key={v.uri} className="link row" href={v.uri} target="_blank" rel="noreferrer"><ExternalLink size={14} /> {v.title}</a>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
