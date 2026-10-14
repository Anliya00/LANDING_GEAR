import { useEffect, useMemo, useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { usePersistedState } from './persist';
import {
  analysisApi, type CycleResponse, type FlightList, type FlightRow, type LandingResponse,
  type Meta, type Panel, type PlotKind, type Trigger, type Value,
} from '@/api/analysis';
import { COLORS, SignalStack, type SignalRow } from './charts';
import { DatePicker, Fold, periodRange, type Period } from './controls';
import { fmtClock, fmtNum, pad, unitLabel } from './format';

const TABS: { id: PlotKind; label: string }[] = [
  { id: 'retraction', label: 'Retraction cycle' },
  { id: 'extension', label: 'Extension cycle' },
  { id: 'landing', label: 'Landing roll' },
];

const flightLabel = (n: number | null) => (n === null ? '—' : `F${pad(n, 4)}`);

/** A number box that only commits a value inside [min, max]; resets on blur if not. */
function BoundedNumber({
  value, min, max, onCommit, label,
}: { value: number; min: number; max: number; onCommit: (v: number) => void; label: string }) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  const commit = () => {
    const n = Number(text);
    if (text.trim() !== '' && Number.isFinite(n)) {
      const clamped = Math.min(Math.max(n, min), max);
      onCommit(clamped);
      setText(String(clamped));
    } else setText(String(value));
  };
  return (
    <label className="dash-field">
      <span className="dash-label">{label}</span>
      <input type="number" className="num-input" value={text} min={min} max={max} step="any"
        title={`Between ${min} and ${max} s`}
        onChange={(e) => setText(e.target.value)} onBlur={commit}
        onKeyDown={(e) => e.key === 'Enter' && commit()} />
    </label>
  );
}

function ValueCell({ label, value, text }: { label: string; value?: Value | null; text?: string }) {
  const shown = text ?? (value && value.complete ? `${fmtNum(value.value)} ${unitLabel(value.unit)}`.trim() : '—');
  return (
    <div className="kv">
      <span className="kv-k">{label}</span>
      <span className="kv-v">{shown}</span>
    </div>
  );
}

/* ---------------------------------------------------------------------------
   Retraction / extension
   --------------------------------------------------------------------------- */

function CyclePanel({ panel, win, trigger, kind }: { panel: Panel; win: { start: number; end: number }; trigger: number; kind: string }) {
  const title = { NOSE: 'Nose door and gear', RH: 'RH door and gear', LH: 'LH door and gear' }[panel.door];
  const s = panel.signals;
  const rows: SignalRow[] = [
    { label: 'Gear uplock', kind: 'binary', lines: [{ name: 'Gear uplock', color: COLORS.purple, points: s.gear_uplock }] },
    { label: 'Gear downlock', kind: 'binary', lines: [{ name: 'Gear downlock', color: COLORS.blue, points: s.gear_downlock }] },
    { label: 'Door uplock', kind: 'binary', lines: [{ name: 'Door uplock', color: COLORS.green, points: s.door_uplock }] },
    { label: 'Door open limit', kind: 'binary', lines: [{ name: 'Door open limit', color: COLORS.orange, points: s.door_open_limit }] },
  ];
  return (
    <Fold id={`ts.${kind}.${panel.door}`} compact
      title={<>{title} <span className={`tag ${panel.complete ? 'tag-ok' : 'tag-bad'}`}>{panel.complete ? 'Complete' : 'Incomplete'}</span></>}
      subtitle={`Door time ${panel.door_time !== null ? `${fmtNum(panel.door_time)} s` : '—'} · Gear time ${panel.gear_time !== null ? `${fmtNum(panel.gear_time)} s` : '—'}`}>
      {!panel.complete && panel.missing && <p className="cycle-missing">{panel.missing}.</p>}
      <SignalStack rows={rows} xMin={win.start} xMax={win.end}
        markers={[{ t: trigger, label: 'Trigger', color: COLORS.slate }]} />
      <p className="cycle-steps">
        {panel.steps.map((st) => (
          <span key={st.n} className={st.t === null ? 'step-missing' : ''}>
            {st.n} {st.name} {st.t === null ? 'not found' : fmtClock(st.t, 1)}
          </span>
        ))}
      </p>
    </Fold>
  );
}

function EventsTable({ rows }: { rows: { group?: string; name: string; t: number | null }[] }) {
  return (
    <div className="dash-table-scroll">
      <table className="dash-table">
        <thead><tr><th>Event</th><th className="num">Time</th><th>Status</th></tr></thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              <td>{r.group ? <span className="ev-group">{r.group}</span> : null}{r.name}</td>
              <td className="num">{r.t === null ? '—' : fmtClock(r.t, 1)}</td>
              <td>{r.t === null ? <span className="tag tag-bad">Not found</span> : <span className="tag tag-ok">Found</span>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CycleView({ data, kind }: { data: CycleResponse; kind: 'retraction' | 'extension' }) {
  return (
    <>
      <Fold id={`ts.${kind}.summary`} title="Computed values"
        subtitle={<span className={data.complete ? 'ok' : 'bad'}>{data.complete ? 'Cycle complete' : 'Cycle incomplete'}</span>}>
        <div className="kv-grid kv-3">
          <ValueCell label={`Total ${kind} cycle time`} value={data.total} />
          <div className="kv">
            <span className="kv-k">Cycle status</span>
            <span className={`kv-v ${data.complete ? 'ok' : 'bad'}`}>{data.complete ? 'Complete' : 'Incomplete'}</span>
          </div>
          <ValueCell label="Trigger time" text={fmtClock(data.trigger_time, 1)} />
        </div>
        <Legend items={[['Gear uplock', COLORS.purple], ['Gear downlock', COLORS.blue], ['Door uplock', COLORS.green], ['Door open limit', COLORS.orange]]} />
      </Fold>
      <Fold id={`ts.${kind}.events`} title="Detected events" compact
        subtitle={`${data.panels.reduce((n, p) => n + p.steps.filter((x) => x.t !== null).length, 0)} found`}>
        <EventsTable rows={data.panels.flatMap((p) => p.steps.map((st) => ({ group: p.door, name: `${st.n} ${st.name}`, t: st.t })))} />
      </Fold>
      {data.panels.map((p) => <CyclePanel key={p.door} panel={p} win={data.window} trigger={data.trigger_time} kind={kind} />)}
    </>
  );
}

function Legend({ items, note }: { items: [string, string, boolean?][]; note?: string }) {
  return (
    <div className="legend">
      {items.map(([name, color, dashed]) => (
        <span key={name}><i className={dashed ? 'dashed' : ''} style={{ background: dashed ? 'transparent' : color, borderColor: color }} />{name}</span>
      ))}
      {note && <em>{note}</em>}
    </div>
  );
}

/* ---------------------------------------------------------------------------
   Landing roll
   --------------------------------------------------------------------------- */

function LandingView({ data }: { data: LandingResponse }) {
  const v = data.values;
  const s = data.signals;
  const rows: SignalRow[] = [
    {
      label: 'Speed (kts)', kind: 'analog', height: 110,
      lines: [
        { name: 'Ground speed', color: COLORS.blue, points: s.ground_speed },
        { name: 'Wheel speed', color: COLORS.red, dashed: true, points: s.wheel_speed },
      ],
    },
    { label: 'Nx', kind: 'analog', height: 84, lines: [{ name: 'Nx', color: COLORS.purple, points: s.nx }] },
    { label: 'Chute select', kind: 'binary', lines: [{ name: 'Chute select', color: COLORS.green, points: s.chute_select }] },
    { label: 'Vert. velocity', kind: 'analog', height: 84, lines: [{ name: 'Vertical velocity', color: COLORS.red, points: s.vertical_velocity }] },
  ];
  const markers = [
    { t: data.touchdown, label: 'Touchdown', color: COLORS.slate },
    ...(data.chute_select !== null ? [{ t: data.chute_select, label: 'Chute', color: COLORS.green }] : []),
    ...(data.ten_kt !== null ? [{ t: data.ten_kt, label: '10 kt', color: COLORS.orange }] : []),
  ];
  return (
    <>
      <Fold id="ts.landing.summary" title="Computed values"
        subtitle={data.has_chute ? 'Chute selected' : 'No chute selected'}>
        <div className="kv-grid kv-3">
          <ValueCell label="Touchdown time" text={fmtClock(data.touchdown, 1)} />
          <ValueCell label="Chute select time" text={data.chute_select !== null ? fmtClock(data.chute_select, 1) : 'Not selected'} />
          <ValueCell label="10 kt point time" text={data.ten_kt !== null ? fmtClock(data.ten_kt, 1) : '—'} />
        </div>
        <hr />
        <div className="kv-grid kv-4">
          <ValueCell label="Sink rate" value={v.sink_rate} />
          <ValueCell label="Chute selection speed" value={v.chute_speed} />
          <ValueCell label="Landing roll distance" value={v.roll_distance} />
          <ValueCell label="Max Nx" value={v.max_nx} />
          <ValueCell label="Avg Nx" value={v.avg_nx} />
          <ValueCell label="Max Nz, landing roll" value={v.max_nz} />
          <ValueCell label="A/c landing mass" value={v.landing_mass} />
        </div>
        {!data.has_chute && <p className="cycle-missing">No chute selection was found in this landing, so the landing roll is not defined.</p>}
        <Legend items={[['Ground speed', COLORS.blue], ['Wheel speed (dashed)', COLORS.red, true]]}
          note="Landing roll runs from chute select to the 10 kt point" />
      </Fold>
      <Fold id="ts.landing.events" title="Detected events" compact>
        <EventsTable rows={[
          { name: 'Touchdown (wheel spin-up)', t: data.touchdown },
          { name: 'Chute selected', t: data.chute_select },
          { name: 'Wheel speed reaches 10 kt', t: data.ten_kt },
        ]} />
      </Fold>
      <Fold id="ts.landing.plot" title="Landing roll signals" compact>
        <SignalStack rows={rows} xMin={data.window.start} xMax={data.window.end} markers={markers} labelWidth={120} />
      </Fold>
    </>
  );
}

/* ---------------------------------------------------------------------------
   The fold
   --------------------------------------------------------------------------- */

export function TimeSeriesPanel({ meta, aircraft, period }: { meta: Meta | null; aircraft: number | null; period: Period }) {
  const [date, setDate] = usePersistedState<string | null>('ts.date', null);
  const [fnText, setFnText] = usePersistedState<string>('ts.flightNumber', '');
  const [list, setList] = useState<FlightList>({ flights: [], dates: [], flight_numbers: [] });
  const [listError, setListError] = useState<string | null>(null);
  const [listLoaded, setListLoaded] = useState(false);
  const [selected, setSelected] = usePersistedState<FlightRow | null>('ts.selected', null);

  const [tab, setTab] = usePersistedState<PlotKind>('ts.tab', 'retraction');
  const [triggers, setTriggers] = useState<Trigger[]>([]);
  const [seqs, setSeqs] = usePersistedState<Record<string, number>>('ts.seq', {});
  const [windows, setWindows] = usePersistedState<Record<string, { before: number; after: number }>>('ts.windows', {});

  const [cycle, setCycle] = useState<CycleResponse | null>(null);
  const [landing, setLanding] = useState<LandingResponse | null>(null);
  const [plotError, setPlotError] = useState<string | null>(null);
  const [plotLoading, setPlotLoading] = useState(false);

  const limits = meta?.windows[tab];
  const seq = triggers.some((t) => t.seq === seqs[`${selected?.flight_id}.${tab}`]) ? seqs[`${selected?.flight_id}.${tab}`] : (triggers[0]?.seq ?? null);
  const setSeq = (v: number) => setSeqs((m) => ({ ...m, [`${selected?.flight_id}.${tab}`]: v }));
  const before = windows[tab]?.before ?? limits?.before.default ?? null;
  const after = windows[tab]?.after ?? limits?.after.default ?? null;
  const setBefore = (v: number) => setWindows((w) => ({ ...w, [tab]: { before: v, after: after ?? v } }));
  const setAfter = (v: number) => setWindows((w) => ({ ...w, [tab]: { before: before ?? v, after: v } }));
  const flightNumber = /^\d+$/.test(fnText.trim()) ? Number(fnText.trim()) : null;

  // flight list: refetch whenever a filter changes
  useEffect(() => {
    let live = true;
    const timer = setTimeout(() => {
      const { from, to } = periodRange(period);
      analysisApi.flights({ aircraft, date, flight_number: flightNumber, from, to })
        .then((r) => { if (live) { setList(r); setListError(null); setListLoaded(true); } })
        .catch((e) => { if (live) setListError(e.message || 'Could not load flights'); });
    }, 150);
    return () => { live = false; clearTimeout(timer); };
  }, [aircraft, date, flightNumber, period]);

  // keep the selection only while it is still in the list
  useEffect(() => {
    if (listLoaded && selected && !list.flights.some((f) => f.flight_id === selected.flight_id)) setSelected(null);
  }, [list, selected, listLoaded, setSelected]);

  // triggers for the chosen flight + tab
  useEffect(() => {
    setCycle(null); setLanding(null); setPlotError(null);
    if (!selected) { setTriggers([]); return; }
    let live = true;
    analysisApi.triggers(selected.flight_id, tab)
      .then((r) => { if (live) setTriggers(r.triggers); })
      .catch((e) => { if (live) { setTriggers([]); setPlotError(e.message); } });
    return () => { live = false; };
  }, [selected, tab]);

  // the plot itself
  useEffect(() => {
    if (!selected || seq === null || before === null || after === null) return;
    let live = true;
    setPlotLoading(true);
    const timer = setTimeout(() => {
      const asked = performance.now();
      const req = tab === 'landing'
        ? analysisApi.landing(selected.flight_id, seq, before, after).then((r) => { if (live) { setLanding(r); setCycle(null); } })
        : analysisApi.cycle(selected.flight_id, tab, seq, before, after).then((r) => { if (live) { setCycle(r); setLanding(null); } });
      req.then(() => { console.debug(`[plot] data fetched in ${Math.round(performance.now() - asked)} ms`); if (live) setPlotError(null); })
        .catch((e) => { if (live) { setPlotError(e.message || 'Could not load the plot'); setCycle(null); setLanding(null); } })
        .finally(() => { if (live) setPlotLoading(false); });
    }, 200);
    return () => { live = false; clearTimeout(timer); };
  }, [selected, tab, seq, before, after]);

  const reset = () => { setDate(null); setFnText(''); };
  const triggerLabel = (t: Trigger) => {
    const when = t.time === null ? '—' : fmtClock(t.time);
    if (tab === 'landing') return `${when} - ${t.complete ? 'Chute selected' : 'No chute selected'}`;
    return `${when} - ${t.complete ? 'Complete' : 'Incomplete'}`;
  };

  const flightNumbers = useMemo(() => list.flight_numbers, [list.flight_numbers]);

  return (
    <>
      <Fold id="ts.select" title="Select flight"
        subtitle={selected ? `${flightLabel(selected.flight_number)} · AC${selected.aircraft_number} · ${selected.date}${selected.start ? ` ${selected.start}` : ''} · ID ${selected.flight_id}` : `${list.flights.length} flights match`}>
        <div className="dash-toolbar">
          <span className="dash-field">
            <span className="dash-label">Date</span>
            <DatePicker value={date} available={list.dates} onChange={setDate} />
          </span>
          <label className="dash-field">
            <span className="dash-label">Flight number</span>
            <input list="flight-numbers" className="fn-input" placeholder="Type or pick" value={fnText}
              inputMode="numeric" onChange={(e) => setFnText(e.target.value)} />
            <datalist id="flight-numbers">
              {flightNumbers.map((n) => <option key={n} value={n}>{flightLabel(n)}</option>)}
            </datalist>
          </label>
          <button type="button" className="chip" onClick={reset}><RotateCcw size={14} /> Reset filters</button>
          {selected && (
            <button type="button" className="chip" onClick={() => setSelected(null)} title="Clear selected flight plot">
              <RotateCcw size={14} /> Clear plot
            </button>
          )}
          <span className="dash-grow" />
          <span className="dash-count"><b>{list.flights.length}</b> flights match{aircraft ? ` AC${aircraft}` : ''}</span>
        </div>

        {listError && <div className="dash-error" role="alert">{listError}</div>}

        <div className="flight-list" role="listbox" aria-label="Matching flights">
          <div className="flight-row flight-head">
            <span>Flight</span><span>Aircraft</span><span>Date</span><span>Start</span>
          </div>
          <div className="flight-scroll">
            {list.flights.length === 0 && <div className="flight-empty">No flights match these filters.</div>}
            {list.flights.map((f) => (
              <button key={f.flight_id} type="button" role="option" aria-selected={selected?.flight_id === f.flight_id}
                className={`flight-row ${selected?.flight_id === f.flight_id ? 'is-sel' : ''}`}
                onClick={() => setSelected(f)}>
                <span>{flightLabel(f.flight_number)}</span>
                <span>{f.aircraft_number !== null ? `AC${f.aircraft_number}` : '—'}</span>
                <span>{f.date ?? '—'}</span>
                <span>{f.start ?? '—'}</span>
              </button>
            ))}
          </div>
        </div>
      </Fold>

      {!selected ? (
        <div className="dash-hint">Pick a flight from the list to see its plots.</div>
      ) : (
        <>
          <Fold id="ts.settings" title="Plot settings"
            subtitle={TABS.find((t) => t.id === tab)?.label}>
            <div className="seg" role="tablist">
              {TABS.map((t) => (
                <button key={t.id} type="button" role="tab" aria-selected={tab === t.id}
                  className={`seg-btn ${tab === t.id ? 'is-on' : ''}`} onClick={() => setTab(t.id)}>{t.label}</button>
              ))}
            </div>
            <div className="dash-toolbar">
              <label className="dash-field">
                <span className="dash-label">{tab === 'landing' ? 'Landing' : 'Trigger'}</span>
                <select value={seq ?? ''} disabled={!triggers.length} onChange={(e) => setSeq(Number(e.target.value))}>
                  {!triggers.length && <option value="">None in this flight</option>}
                  {triggers.map((t) => <option key={t.seq} value={t.seq}>{triggerLabel(t)}</option>)}
                </select>
              </label>
              {limits && before !== null && after !== null && (
                <>
                  <BoundedNumber label="Before (s)" value={before} min={limits.before.min} max={limits.before.max} onCommit={setBefore} />
                  <BoundedNumber label="After (s)" value={after} min={limits.after.min} max={limits.after.max} onCommit={setAfter} />
                  <button type="button" className="chip" onClick={() => setWindows((w) => ({ ...w, [tab]: { before: limits.before.default, after: limits.after.default } }))}>Reset window</button>
                </>
              )}
              {plotLoading && <span className="dash-count">Loading…</span>}
            </div>
          </Fold>

          {plotError && <div className="dash-error" role="alert">{plotError}</div>}
          {!plotError && !triggers.length && (
            <div className="dash-hint">This flight has no {tab === 'landing' ? 'landing' : `${tab} cycle`} to plot.</div>
          )}
          {cycle && tab !== 'landing' && <CycleView data={cycle} kind={tab} />}
          {landing && tab === 'landing' && <LandingView data={landing} />}
        </>
      )}
    </>
  );
}
