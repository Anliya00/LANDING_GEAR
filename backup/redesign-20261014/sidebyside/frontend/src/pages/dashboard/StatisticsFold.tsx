import { useEffect, useState } from 'react';
import {
  ArrowDownToLine, ArrowUpFromLine, ChevronsDown, ChevronsUp, Gauge, MoveHorizontal,
  PlaneLanding, PlaneTakeoff, Ruler, TrendingDown, Wind,
} from 'lucide-react';
import { analysisApi, type FlightRow, type StatCard, type StatsResponse } from '@/api/analysis';
import { Fold, periodRange, type Period } from './controls';
import { fmtNum, pad, unitLabel } from './format';

const ICONS: Record<string, { icon: typeof Gauge; tone: 'blue' | 'orange' }> = {
  extension: { icon: ChevronsDown, tone: 'blue' },
  retraction: { icon: ChevronsUp, tone: 'blue' },
  mass_up: { icon: PlaneTakeoff, tone: 'blue' },
  mass_down: { icon: PlaneLanding, tone: 'blue' },
  sink: { icon: TrendingDown, tone: 'orange' },
  nx_max: { icon: MoveHorizontal, tone: 'orange' },
  nx_avg: { icon: Gauge, tone: 'blue' },
  runway: { icon: Ruler, tone: 'blue' },
  chute: { icon: Wind, tone: 'orange' },
  nz_up: { icon: ArrowUpFromLine, tone: 'orange' },
  nz_down: { icon: ArrowDownToLine, tone: 'orange' },
};

/** Cards show whole numbers for mass and distance, two places for everything else. */
const WHOLE = new Set(['AC_TAKEOFF_MASS', 'AC_LANDING_MASS', 'LANDING_ROLL_DISTANCE', 'GROUND_SPEED_CHUTE_DEPLOYMENT']);

/** Where the average sits between the lowest and highest value in the period. */
function RangeBar({ card }: { card: StatCard }) {
  if (card.flights === 0 || card.min === null || card.max === null || card.avg === null) return <div className="range range-empty" />;
  const span = card.max - card.min;
  const pos = span > 0 ? ((card.avg - card.min) / span) * 100 : 50;
  return <div className="range" aria-hidden="true"><div className="range-track"><i style={{ left: `${pos}%` }} /></div></div>;
}

const GROUPS: { id: string; title: string; sub: string; kinds: string[] }[] = [
  { id: 'gear', title: 'Landing gear cycle', sub: 'Lever event to last gear locked', kinds: ['extension', 'retraction'] },
  { id: 'takeoff', title: 'Take-off', sub: 'Mass at lift-off and load in the take-off roll', kinds: ['mass_up', 'nz_up'] },
  { id: 'landing', title: 'Landing and landing roll', sub: 'Touchdown, chute selection and the roll to 10 kt', kinds: ['mass_down', 'sink', 'chute', 'nx_max', 'nx_avg', 'runway', 'nz_down'] },
];

const flightLabel = (n: number | null) => (n === null ? '—' : `F${pad(n, 4)}`);

function Kpi({ label, value, hint }: { label: string; value: React.ReactNode; hint?: string }) {
  return (
    <div className="kpi"><span className="kpi-label">{label}</span><b className="kpi-value">{value}</b>{hint && <span className="kpi-hint">{hint}</span>}</div>
  );
}

function Card({ card }: { card: StatCard }) {
  const { icon: Icon, tone } = ICONS[card.kind] ?? { icon: Gauge, tone: 'blue' as const };
  const digits = WHOLE.has(card.param) ? 0 : 2;
  const empty = card.flights === 0;
  return (
    <article className={`stat-card ${empty ? 'is-empty' : ''}`}>
      <header>
        <span className={`stat-icon tone-${tone}`}><Icon size={22} /></span>
        <h3>{card.title}</h3>
      </header>
      <div className="stat-label">Average</div>
      <div className="stat-main">
        <span className="stat-value">{empty ? '—' : fmtNum(card.avg, digits)}</span>
        {!empty && <span className="stat-unit">{unitLabel(card.unit)}</span>}
      </div>
      <RangeBar card={card} />
      <footer>
        <span>Min <b>{empty ? '—' : fmtNum(card.min, digits)}</b></span>
        <span>Max <b>{empty ? '—' : fmtNum(card.max, digits)}</b></span>
        <span>Flights <b>{card.flights}</b></span>
      </footer>
    </article>
  );
}

export function StatisticsPanel({ period, aircraft }: { period: Period; aircraft: number | null }) {
  const [data, setData] = useState<StatsResponse | null>(null);
  const [recent, setRecent] = useState<FlightRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let live = true;
    setLoading(true);
    const { from, to } = periodRange(period);
    analysisApi.stats(from, to, aircraft)
      .then((r) => { if (live) { setData(r); setError(null); } })
      .catch((e) => { if (live) setError(e.message || 'Could not load statistics'); })
      .finally(() => { if (live) setLoading(false); });
    analysisApi.flights({ aircraft, from, to })
      .then((r) => { if (live) setRecent(r.flights.slice(0, 8)); })
      .catch(() => { if (live) setRecent([]); });
    return () => { live = false; };
  }, [period, aircraft]);

  const cards = data?.cards ?? [];
  const withData = cards.filter((c) => c.flights > 0).length;
  const known = new Set(GROUPS.flatMap((g) => g.kinds));
  const groups = [...GROUPS, { id: 'other', title: 'Other', sub: '', kinds: [] as string[] }]
    .map((g) => ({ ...g, cards: cards.filter((c) => (g.id === 'other' ? !known.has(c.kind) : g.kinds.includes(c.kind))) }))
    .filter((g) => g.cards.length > 0);

  return (
    <>
      <div className={`kpi-row ${loading ? 'is-loading' : ''}`}>
        <Kpi label="Flights analysed" value={data?.flights ?? '—'} hint={aircraft ? `AC${aircraft}` : 'All aircraft'} />
        <Kpi label="Parameters" value={cards.length || '—'} hint="tracked per flight" />
        <Kpi label="With data" value={cards.length ? withData : '—'} hint="in this selection" />
        <Kpi label="No data yet" value={cards.length ? cards.length - withData : '—'} hint="nothing computed" />
      </div>
      {error && <div className="dash-error" role="alert">{error}</div>}
      {groups.map((g) => (
        <Fold key={g.id} id={`stats.${g.id}`} title={g.title} subtitle={g.sub || undefined}>
          <div className={`stat-grid ${loading ? 'is-loading' : ''}`}>
            {g.cards.map((c) => <Card key={c.param} card={c} />)}
          </div>
        </Fold>
      ))}
      <Fold id="stats.recent" title="Flights in this selection" subtitle={`${data?.flights ?? 0} flights, newest first`}>
        {recent.length === 0 ? <div className="dash-hint">No flights with results in this selection.</div> : (
          <table className="dash-table">
            <thead><tr><th>Flight</th><th>Aircraft</th><th>Date</th><th>Start</th><th className="num">Flight ID</th></tr></thead>
            <tbody>
              {recent.map((f) => (
                <tr key={f.flight_id}>
                  <td>{flightLabel(f.flight_number)}</td>
                  <td>{f.aircraft_number !== null ? `AC${f.aircraft_number}` : '—'}</td>
                  <td>{f.date ?? '—'}</td><td>{f.start ?? '—'}</td><td className="num">{f.flight_id}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Fold>
    </>
  );
}
