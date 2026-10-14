import { useEffect, useState } from 'react';
import {
  ArrowDownToLine, ArrowUpFromLine, ChevronsDown, ChevronsUp, Gauge, MoveHorizontal,
  PlaneLanding, PlaneTakeoff, Ruler, TrendingDown, Wind,
} from 'lucide-react';
import { analysisApi, type StatCard, type StatsResponse } from '@/api/analysis';
import { Fold, periodRange, type Period } from './controls';
import { fmtNum, unitLabel } from './format';

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
    return () => { live = false; };
  }, [period, aircraft]);

  return (
    <Fold id="stats.cards" title="Key parameters"
      subtitle={data ? `${data.flights} flights in the selected period${aircraft ? `, AC${aircraft}` : ''}` : undefined}>
      {error && <div className="dash-error" role="alert">{error}</div>}
      <div className={`stat-grid ${loading ? 'is-loading' : ''}`}>
        {(data?.cards ?? []).map((c) => <Card key={c.param} card={c} />)}
      </div>
    </Fold>
  );
}
