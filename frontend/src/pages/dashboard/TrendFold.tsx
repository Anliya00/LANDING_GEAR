import { useEffect, useMemo, useState } from 'react';
import { usePersistedState } from './persist';
import { analysisApi, type TrendGroup, type TrendResponse, type TrendView } from '@/api/analysis';
import { COLORS, LineChart } from './charts';
import { Fold, periodRange, type Period } from './controls';
import { fmtNum } from './format';

const VIEWS: { id: TrendView; label: string }[] = [
  { id: 'extension_total', label: 'LG extension cycle time' },
  { id: 'retraction_total', label: 'LG retraction cycle time' },
  { id: 'retraction_gear', label: 'LH, RH and Nose retraction time' },
  { id: 'extension_gear', label: 'LH, RH and Nose extension time' },
];

const GROUPS: { id: TrendGroup; label: string }[] = [
  { id: 'day', label: 'Day' },
  { id: 'week', label: 'Week' },
  { id: 'month', label: 'Month' },
];

const utcMs = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
};

function TrendSide({ plot, unit }: { plot: TrendResponse['plots'][number]; unit: string }) {
  const used = plot.buckets.filter((b) => b.n > 0);
  const flights = used.reduce((t, b) => t + b.n, 0);
  const avg = flights ? used.reduce((t, b) => t + (b.avg ?? 0) * b.n, 0) / flights : null;
  const lo = used.length ? Math.min(...used.map((b) => b.min ?? Infinity)) : null;
  const hi = used.length ? Math.max(...used.map((b) => b.max ?? -Infinity)) : null;
  return (
    <aside className="trend-side">
      <div className="mini-tiles">
        <div><span>Values</span><b>{flights}</b></div>
        <div><span>Average</span><b>{fmtNum(avg)} <em>{unit}</em></b></div>
        <div><span>Minimum</span><b>{fmtNum(lo)} <em>{unit}</em></b></div>
        <div><span>Maximum</span><b>{fmtNum(hi)} <em>{unit}</em></b></div>
      </div>
      <div className="dash-table-scroll">
        <table className="dash-table">
          <thead><tr><th>Period</th><th className="num">n</th><th className="num">Avg</th><th className="num">Min</th><th className="num">Max</th></tr></thead>
          <tbody>
            {[...plot.buckets].reverse().map((b) => (
              <tr key={b.start} className={b.n === 0 ? 'is-none' : ''}>
                <td>{b.start}</td><td className="num">{b.n}</td>
                <td className="num">{fmtNum(b.avg)}</td><td className="num">{fmtNum(b.min)}</td><td className="num">{fmtNum(b.max)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </aside>
  );
}

export function TrendPanel({ period, aircraft }: { period: Period; aircraft: number | null }) {
  const [view, setView] = usePersistedState<TrendView>('trend.view', 'retraction_total');
  const [group, setGroup] = usePersistedState<TrendGroup>('trend.group', 'day');
  // one limit per view; the number is only a display aid and never reaches the server
  const [limits, setLimits] = usePersistedState<Record<string, string>>('trend.limits', {});
  const [data, setData] = useState<TrendResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let live = true;
    setLoading(true);
    const { from, to } = periodRange(period);
    analysisApi.trend(view, group, from, to, aircraft)
      .then((r) => { if (live) { setData(r); setError(null); } })
      .catch((e) => { if (live) { setError(e.message || 'Could not load the trend'); setData(null); } })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [view, period, group, aircraft]);

  const limitText = limits[view] ?? '';
  const limit = limitText.trim() !== '' && Number.isFinite(Number(limitText)) ? Number(limitText) : null;
  const xs = useMemo(() => (data?.plots[0]?.buckets ?? []).map((b) => utcMs(b.start)), [data]);
  const groupWord = { day: 'day', week: 'week', month: 'month' }[group];

  return (
    <>
      <Fold id="trend.settings" title="View and limit"
        subtitle={data ? `${data.flights} flights in the selected period${aircraft ? `, AC${aircraft}` : ', all aircraft'}` : undefined}>
        <div className="dash-toolbar">
          <label className="dash-field">
            <span className="dash-label">View</span>
            <select value={view} onChange={(e) => setView(e.target.value as TrendView)}>
              {VIEWS.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
            </select>
          </label>
          <label className="dash-field">
            <span className="dash-label">Group by</span>
            <select value={group} onChange={(e) => setGroup(e.target.value as TrendGroup)}>
              {GROUPS.map((g) => <option key={g.id} value={g.id}>{g.label}</option>)}
            </select>
          </label>
          <label className="dash-field">
            <span className="dash-label">Limit (s)</span>
            <input type="number" className="num-input" value={limitText} placeholder="none" step="any"
              onChange={(e) => setLimits((l) => ({ ...l, [view]: e.target.value }))} />
          </label>
        </div>
      </Fold>

      {error && <div className="dash-error" role="alert">{error}</div>}

      <div className={`trend-plots ${loading ? 'is-loading' : ''}`}>
        {data?.plots.map((p) => (
          <Fold key={p.param} id={`trend.plot.${p.param}`} title={p.title} subtitle={`${p.unit}, per ${groupWord}`}>
            <div className="trend-layout">
              <div className="trend-chart">
              <LineChart
                title=""
                unit={p.unit}
                xs={xs}
                limit={limit}
                series={[
                  { name: 'Average', color: COLORS.blue, values: p.buckets.map((b) => b.avg) },
                  { name: 'Max', color: COLORS.red, values: p.buckets.map((b) => b.max) },
                  { name: 'Min', color: COLORS.green, values: p.buckets.map((b) => b.min) },
                ]}
                tip={(i) => {
                  const b = p.buckets[i];
                  if (!b || b.n === 0) return [`${b?.start ?? ''}`, `No flights in this ${groupWord}`];
                  return [b.start, `Average ${fmtNum(b.avg)} s`, `Max ${fmtNum(b.max)} s`, `Min ${fmtNum(b.min)} s`, `${b.n} value${b.n === 1 ? '' : 's'}`];
                }}
              />
              </div>
              <TrendSide plot={p} unit={p.unit} />
            </div>
          </Fold>
        ))}
        {data && data.plots.length === 0 && <div className="dash-hint">No data in this period.</div>}
      </div>
    </>
  );
}
