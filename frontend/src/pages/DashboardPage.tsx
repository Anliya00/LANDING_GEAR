import { useEffect, useState } from 'react';
import { PageHeader } from '@/components/PageHeader';
import { analysisApi, type Meta } from '@/api/analysis';
import { preloadPlotly } from './dashboard/charts';
import { PeriodBar, presetPeriod, type Period } from './dashboard/controls';
import { usePersistedState } from './dashboard/persist';
import { StatisticsPanel } from './dashboard/StatisticsFold';
import { TimeSeriesPanel } from './dashboard/TimeSeriesFold';
import { TrendPanel } from './dashboard/TrendFold';
import './dashboard/dashboard.css';

type Section = 'statistics' | 'timeseries' | 'trend';
const SECTIONS: { id: Section; label: string }[] = [
  { id: 'statistics', label: 'Statistics' },
  { id: 'timeseries', label: 'Time series plots' },
  { id: 'trend', label: 'Trend' },
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

  useEffect(() => { preloadPlotly(); }, []);

  useEffect(() => {
    analysisApi.meta().then(setMeta).catch((e) => setError(e.message || 'Could not reach the analysis service'));
  }, []);

  const extent = meta?.extent;
  return (
    <div className="dash">
      <PageHeader
        title="Analysis Dashboard"
        description={
          extent && extent.flights
            ? `${extent.flights} analysed flights, ${extent.first} to ${extent.last}`
            : 'Statistics, time series plots and trends from computed flight results.'
        }
      />
      {error && <div className="dash-error" role="alert">{error}</div>}

      <div className="dash-filters">
        <PeriodBar period={period} onChange={setPeriod} preset="month1" presetLabel="Last 1 month" count={null} />
        <label className="dash-field dash-aircraft">
          <span className="dash-label">Aircraft</span>
          <select value={aircraft ?? ''} onChange={(e) => setAircraft(e.target.value ? Number(e.target.value) : null)}>
            <option value="">All aircraft</option>
            {(meta?.aircraft ?? []).map((a) => <option key={a} value={a}>AC{a}</option>)}
          </select>
        </label>
      </div>

      <nav className="dash-tabs" role="tablist" aria-label="Dashboard sections">
        {SECTIONS.map((s) => (
          <button key={s.id} type="button" role="tab" aria-selected={section === s.id}
            className={`dash-tab ${section === s.id ? 'is-on' : ''}`} onClick={() => setSection(s.id)}>
            {s.label}
          </button>
        ))}
      </nav>

      <div className="dash-panel" role="tabpanel" hidden={section !== 'statistics'}>
        <StatisticsPanel period={period} aircraft={aircraft} />
      </div>
      <div className="dash-panel" role="tabpanel" hidden={section !== 'timeseries'}>
        <TimeSeriesPanel meta={meta} aircraft={aircraft} />
      </div>
      <div className="dash-panel" role="tabpanel" hidden={section !== 'trend'}>
        <TrendPanel period={period} />
      </div>
    </div>
  );
}
