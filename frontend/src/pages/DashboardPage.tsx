import { useEffect, useState } from 'react';
import { BarChart3, LineChart, TrendingUp, RefreshCw } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { analysisApi, type FlightRow, type Meta } from '@/api/analysis';
import { preloadPlotly } from './dashboard/charts';
import { FlightSelector } from './dashboard/FlightSelector';
import { PeriodBar, presetPeriod, type Period } from './dashboard/controls';
import { usePersistedState } from './dashboard/persist';
import { StatisticsPanel } from './dashboard/StatisticsFold';
import { TimeSeriesPanel } from './dashboard/TimeSeriesFold';
import { TrendPanel } from './dashboard/TrendFold';
import './dashboard/dashboard.css';

type Section = 'statistics' | 'timeseries' | 'trend';
const SECTIONS: { id: Section; label: string; icon: typeof BarChart3 }[] = [
  { id: 'statistics', label: 'Statistics', icon: BarChart3 },
  { id: 'timeseries', label: 'Time series plots', icon: LineChart },
  { id: 'trend', label: 'Trend', icon: TrendingUp },
];

/**
 * Analysis Dashboard (requirements D6, section 4).
 *
 * Period and aircraft sit above everything; the three sections are tabs under
 * them; everything inside a section is a drop-down. All panels stay mounted
 * and every choice is remembered, so switching tabs never loses a selection.
 */
export default function DashboardPage() {
  const [meta, setMeta] = useState<Meta | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [section, setSection] = usePersistedState<Section>('section', 'statistics');
  const [period, setPeriod] = usePersistedState<Period>('period', () => presetPeriod('month1'));
  const [aircraft, setAircraft] = usePersistedState<number | null>('aircraft', null);
  const [selected, setSelected] = usePersistedState<FlightRow | null>('flight.selected', null);
  const [resetKey, setResetKey] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => { preloadPlotly(); }, []);

  useEffect(() => {
    analysisApi.meta().then(setMeta).catch((e) => setError(e.message || 'Could not reach the analysis service'));
  }, []);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      Object.keys(localStorage).forEach((k) => {
        if (k.startsWith('sftad.dashboard.')) {
          localStorage.removeItem(k);
        }
      });
    } catch { /* ignore */ }
    setAircraft(null);
    setSelected(null);
    setPeriod(presetPeriod('month1'));
    setResetKey((prev) => prev + 1);

    try {
      const data = await analysisApi.meta();
      setMeta(data);
      setError(null);
    } catch (e: any) {
      setError(e.message || 'Could not reach the analysis service');
    } finally {
      setRefreshing(false);
    }
  };

  const extent = meta?.extent;
  return (
    <div className="dash">
      <PageHeader
        title="Analysis Dashboard"
        description={
          extent && extent.flights
            ? `${extent.flights} analysed flights, ${extent.first} to ${extent.last}`
            : 'Telemetry diagnostics, landing gear cycle analysis, and parameter trends.'
        }
        banner={true}
        actions={
          <button
            type="button"
            className="btn-secondary"
            onClick={handleRefresh}
            disabled={refreshing}
            title="Refresh dashboard, reload metadata, and reset plotted curves"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}
          >
            <RefreshCw size={16} className={refreshing ? 'spin' : ''} /> Refresh
          </button>
        }
      />
      {error && <div className="dash-error" role="alert">{error}</div>}

      <div className="dash-filters">
         <label className="dash-field dash-aircraft">
          <span className="dash-label">Aircraft</span>
          <select value={aircraft ?? ''} onChange={(e) => setAircraft(e.target.value ? Number(e.target.value) : null)}>
            <option value="">All aircraft</option>
            {(meta?.aircraft ?? []).map((a) => <option key={a} value={a}>AC{a}</option>)}
          </select>
        </label>
        <PeriodBar period={period} onChange={setPeriod} preset="month1" presetLabel="Last 1 month" count={null} />
       
      </div>

      {section !== 'trend' && (
        <FlightSelector key={resetKey} aircraft={aircraft} period={period} selected={selected} onSelect={setSelected}
          hint={section === 'statistics' ? 'none picked: all flights together' : undefined} />
      )}

      <nav className="dash-tabs" role="tablist" aria-label="Dashboard sections">
        {SECTIONS.map((s) => (
          <button
            key={s.id}
            type="button"
            role="tab"
            aria-selected={section === s.id}
            className={`dash-tab ${section === s.id ? 'is-on' : ''}`}
            onClick={() => setSection(s.id)}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}
          >
            <s.icon size={18} />
            <span>{s.label}</span>
          </button>
        ))}
      </nav>

      <div className="dash-panel" role="tabpanel" hidden={section !== 'statistics'}>
        <StatisticsPanel period={period} aircraft={aircraft} selected={selected} />
      </div>
      <div className="dash-panel" role="tabpanel" hidden={section !== 'timeseries'}>
        <TimeSeriesPanel key={resetKey} meta={meta} selected={selected} />
      </div>
      <div className="dash-panel" role="tabpanel" hidden={section !== 'trend'}>
        <TrendPanel period={period} aircraft={aircraft} />
      </div>
    </div>
  );
}

