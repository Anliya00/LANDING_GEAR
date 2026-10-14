import { useEffect, useMemo, useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { analysisApi, type FlightList, type FlightRow } from '@/api/analysis';
import { DatePicker, Fold, periodRange, type Period } from './controls';
import { pad } from './format';
import { usePersistedState } from './persist';

const flightLabel = (n: number | null) => (n === null ? '—' : `F${pad(n, 4)}`);

/**
 * The flight picker, shared by Statistics and Time series. It sits above the
 * tabs, follows the dashboard-wide period and aircraft, and can be collapsed.
 */
export function FlightSelector({
  aircraft, period, selected, onSelect, hint,
}: {
  aircraft: number | null;
  period: Period;
  selected: FlightRow | null;
  onSelect: (f: FlightRow | null) => void;
  hint?: string;
}) {
  const [date, setDate] = usePersistedState<string | null>('ts.date', null);
  const [fnText, setFnText] = usePersistedState<string>('ts.flightNumber', '');
  const [list, setList] = useState<FlightList>({ flights: [], dates: [], flight_numbers: [] });
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const flightNumber = /^\d+$/.test(fnText.trim()) ? Number(fnText.trim()) : null;

  useEffect(() => {
    let live = true;
    const timer = setTimeout(() => {
      const { from, to } = periodRange(period);
      analysisApi.flights({ aircraft, date, flight_number: flightNumber, from, to })
        .then((r) => { if (live) { setList(r); setError(null); setLoaded(true); } })
        .catch((e) => { if (live) setError(e.message || 'Could not load flights'); });
    }, 150);
    return () => { live = false; clearTimeout(timer); };
  }, [aircraft, date, flightNumber, period]);

  // keep the selection only while it is still in the list
  useEffect(() => {
    if (loaded && selected && !list.flights.some((f) => f.flight_id === selected.flight_id)) onSelect(null);
  }, [list, selected, loaded, onSelect]);

  const flightNumbers = useMemo(() => list.flight_numbers, [list.flight_numbers]);
  const reset = () => { setDate(null); setFnText(''); };

  return (
    <Fold id="flight.select" collapsible title="Select flight"
      subtitle={selected
        ? `${flightLabel(selected.flight_number)} · AC${selected.aircraft_number} · ${selected.date}${selected.start ? ` ${selected.start}` : ''} · ID ${selected.flight_id}`
        : `${list.flights.length} flights match${hint ? ` · ${hint}` : ''}`}>
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
          <button type="button" className="chip" onClick={() => onSelect(null)} title="Clear the selected flight">
            <RotateCcw size={14} /> Clear flight
          </button>
        )}
        <span className="dash-grow" />
        <span className="dash-count"><b>{list.flights.length}</b> flights match{aircraft ? ` AC${aircraft}` : ''}</span>
      </div>

      {error && <div className="dash-error" role="alert">{error}</div>}

      <div className="flight-list" role="listbox" aria-label="Matching flights">
        <div className="flight-row flight-head">
          <span>Flight</span><span>Aircraft</span><span>Date</span><span>Start</span>
        </div>
        <div className="flight-scroll">
          {list.flights.length === 0 && <div className="flight-empty">No flights match these filters.</div>}
          {list.flights.map((f) => (
            <button key={f.flight_id} type="button" role="option" aria-selected={selected?.flight_id === f.flight_id}
              className={`flight-row ${selected?.flight_id === f.flight_id ? 'is-sel' : ''}`}
              onClick={() => onSelect(selected?.flight_id === f.flight_id ? null : f)}>
              <span>{flightLabel(f.flight_number)}</span>
              <span>{f.aircraft_number !== null ? `AC${f.aircraft_number}` : '—'}</span>
              <span>{f.date ?? '—'}</span>
              <span>{f.start ?? '—'}</span>
            </button>
          ))}
        </div>
      </div>
    </Fold>
  );
}
