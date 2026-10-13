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

export function TrendPanel({ period }: { period: Period }) {
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
    analysisApi.trend(view, group, from, to)
      .then((r) => { if (live) { setData(r); setError(null); } })
      .catch((e) => { if (live) { setError(e.message || 'Could not load the trend'); setData(null); } })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [view, period, group]);

  const limitText = limits[view] ?? '';
  const limit = limitText.trim() !== '' && Number.isFinite(Number(limitText)) ? Number(limitText) : null;
  const xs = useMemo(() => (data?.plots[0]?.buckets ?? []).map((b) => utcMs(b.start)), [data]);
  const groupWord = { day: 'day', week: 'week', month: 'month' }[group];

  return (
    <>
      <Fold id="trend.settings" title="View and limit"
        subtitle={data ? `${data.flights} flights in the selected period (all aircraft)` : undefined}>
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
          <div className="legend">
            <span><i style={{ background: COLORS.blue }} />Average</span>
            <span><i style={{ background: COLORS.red }} />Max</span>
            <span><i style={{ background: COLORS.green }} />Min</span>
            <span><i className="dashed" style={{ borderColor: COLORS.slate }} />Limit</span>
          </div>
        </div>
        <p className="dash-note">The trend covers the whole fleet, so the aircraft selection above does not apply here.</p>
      </Fold>

      {error && <div className="dash-error" role="alert">{error}</div>}

      <div className={`trend-plots ${loading ? 'is-loading' : ''}`}>
        {data?.plots.map((p) => (
          <Fold key={p.param} id={`trend.plot.${p.param}`} title={p.title} subtitle={`${p.unit}, per ${groupWord}`}>
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
          </Fold>
        ))}
        {data && data.plots.length === 0 && <div className="dash-hint">No data in this period.</div>}
      </div>
    </>
  );
}
