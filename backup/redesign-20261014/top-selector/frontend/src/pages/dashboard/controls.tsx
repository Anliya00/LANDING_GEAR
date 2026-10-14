import { useMemo, useRef, useState } from 'react';
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react';
import { useDismiss } from './charts';
import { addDays, isoDate, monthName, pad, parseIso, todayIso } from './format';

/* ---------------------------------------------------------------------------
   Fold — a titled, collapsible section of the dashboard.
   --------------------------------------------------------------------------- */

export function Fold({
  title, subtitle, compact = false, children,
}: {
  /** kept so existing call sites compile; sections no longer collapse */
  id?: string;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  defaultOpen?: boolean;
  compact?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section className={`fold fold-flat ${compact ? 'fold-compact' : ''} is-open`}>
      <header className="fold-head">
        <span className="fold-title">{title}</span>
        {subtitle && <span className="fold-sub">{subtitle}</span>}
      </header>
      <div className="fold-body">{children}</div>
    </section>
  );
}

/* ---------------------------------------------------------------------------
   PeriodBar — "Last N / All data / From / To". Shared by Statistics and Trend.
   --------------------------------------------------------------------------- */

export type PeriodMode = 'preset' | 'all' | 'custom';
export interface Period { mode: PeriodMode; from: string; to: string }

/** The dates sent to the API; null means "no bound" (all data). */
export function periodRange(p: Period): { from: string | null; to: string | null } {
  return p.mode === 'all' ? { from: null, to: null } : { from: p.from, to: p.to };
}

export function presetPeriod(kind: 'days30' | 'month1'): Period {
  const to = todayIso();
  if (kind === 'days30') return { mode: 'preset', from: addDays(to, -29), to };
  const d = parseIso(to);
  d.setMonth(d.getMonth() - 1);
  return { mode: 'preset', from: isoDate(d), to };
}

export function PeriodBar({
  period, onChange, presetLabel, preset, count, countLabel = 'flights in selected period',
}: {
  period: Period;
  onChange: (p: Period) => void;
  presetLabel: string;
  preset: 'days30' | 'month1';
  count: number | null;
  countLabel?: string;
}) {
  return (
    <div className="dash-toolbar">
      <span className="dash-label">Period</span>
      <button type="button" className={`chip ${period.mode === 'preset' ? 'is-on' : ''}`}
        onClick={() => onChange(presetPeriod(preset))}>{presetLabel}</button>
      <button type="button" className={`chip ${period.mode === 'all' ? 'is-on' : ''}`}
        onClick={() => onChange({ ...period, mode: 'all' })}>All data</button>

      <label className="dash-field">
        <span className="dash-label">From</span>
        <input type="date" value={period.from} max={period.to || undefined}
          onChange={(e) => e.target.value && onChange({ mode: 'custom', from: e.target.value, to: period.to })} />
      </label>
      <label className="dash-field">
        <span className="dash-label">To</span>
        <input type="date" value={period.to} min={period.from || undefined}
          onChange={(e) => e.target.value && onChange({ mode: 'custom', from: period.from, to: e.target.value })} />
      </label>

      <span className="dash-grow" />
      {count !== null && <span className="dash-count"><b>{count}</b> {countLabel}</span>}
    </div>
  );
}

/* ---------------------------------------------------------------------------
   DatePicker — a calendar that only lets you pick days that have flight data.
   --------------------------------------------------------------------------- */

const WEEKDAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];

export function DatePicker({
  value, available, onChange,
}: {
  value: string | null;
  /** ISO dates with data; every other day is disabled */
  available: string[];
  onChange: (v: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useDismiss(open, () => setOpen(false), ref);

  const enabled = useMemo(() => new Set(available), [available]);
  const anchor = value ?? available[available.length - 1] ?? todayIso();
  const [view, setView] = useState(() => { const d = parseIso(anchor); return { y: d.getFullYear(), m: d.getMonth() }; });

  const first = new Date(view.y, view.m, 1);
  const lead = (first.getDay() + 6) % 7; // Monday first
  const days = new Date(view.y, view.m + 1, 0).getDate();
  const cells: (string | null)[] = [
    ...Array(lead).fill(null),
    ...Array.from({ length: days }, (_, i) => `${view.y}-${pad(view.m + 1)}-${pad(i + 1)}`),
  ];

  const step = (delta: number) => {
    const d = new Date(view.y, view.m + delta, 1);
    setView({ y: d.getFullYear(), m: d.getMonth() });
  };

  return (
    <div className="datepicker" ref={ref}>
      <button type="button" className="chip" onClick={() => {
        if (!open) { const d = parseIso(anchor); setView({ y: d.getFullYear(), m: d.getMonth() }); }
        setOpen((o) => !o);
      }} aria-haspopup="dialog" aria-expanded={open}>
        <Calendar size={15} />
        {value ?? 'All dates'}
      </button>
      {open && (
        <div className="datepicker-pop" role="dialog" aria-label="Choose a flight date">
          <div className="datepicker-head">
            <button type="button" className="icon-btn" onClick={() => step(-1)} aria-label="Previous month"><ChevronLeft size={18} /></button>
            <b>{monthName(view.m)} {view.y}</b>
            <button type="button" className="icon-btn" onClick={() => step(1)} aria-label="Next month"><ChevronRight size={18} /></button>
          </div>
          <div className="datepicker-grid">
            {WEEKDAYS.map((w) => <span key={w} className="datepicker-wd">{w}</span>)}
            {cells.map((iso, i) => iso === null ? <span key={i} /> : (
              <button key={iso} type="button" disabled={!enabled.has(iso)}
                className={`datepicker-day ${enabled.has(iso) ? 'has-data' : ''} ${iso === value ? 'is-sel' : ''}`}
                onClick={() => { onChange(iso); setOpen(false); }}>
                {Number(iso.slice(8))}
              </button>
            ))}
          </div>
          <div className="datepicker-foot">
            <span className="datepicker-key"><i /> has flight data</span>
            <button type="button" className="link-btn" onClick={() => { onChange(null); setOpen(false); }}>All dates</button>
          </div>
        </div>
      )}
    </div>
  );
}
