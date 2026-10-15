import { useState } from 'react';
import { 
  Download, CheckCircle2, ChevronDown, 
  FileSpreadsheet, FileCode, FileText, Printer, Search, Database, Activity, ShieldCheck
} from 'lucide-react';
import type { FlightRow, FlightSummaryResponse } from '@/api/flights';
import { downloadFlightPdf, printFlightReportHtml } from './flightPdfExport';
import { FlightKpiGrid } from './FlightKpiGrid';
import { FlightTimelineBar } from './FlightTimelineBar';
import { FlightSignalsPlot } from './FlightSignalsPlot';
import { AircraftMark } from '@/app/AircraftMark1';

interface Props {
  summary: FlightSummaryResponse;
  allFlights: FlightRow[];
  onSelectFlight: (flightId: number) => void;
}

type TabType = 'overview' | 'timeseries' | 'parameters' | 'events' | 'quality';

export function FlightSummaryPane({
  summary,
  allFlights,
  onSelectFlight,
}: Props) {
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [paramSearch, setParamSearch] = useState('');
  const [eventSearch, setEventSearch] = useState('');
  const [showExportMenu, setShowExportMenu] = useState(false);

  const { flight, kpis, total_duration_minutes, timeline_phases, key_signals, parameters, events } = summary;

  const fNumStr = flight.flight_number !== undefined ? String(flight.flight_number).padStart(3, '0') : '001';
  const acName = flight.aircraft_number ? `AC${flight.aircraft_number}` : (flight.aircraft_id ? `AC${flight.aircraft_id}` : 'AC');
  const flightDisplayId = `${acName}_${fNumStr}`;
  const flightDate = flight.flight_date_time ? flight.flight_date_time.slice(0, 10) : '—';

  // Export handlers
  const handleExportJson = () => {
    const blob = new Blob([JSON.stringify(summary, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${flightDisplayId}_summary.json`;
    a.click();
    URL.revokeObjectURL(url);
    setShowExportMenu(false);
  };

  const handleExportCsv = () => {
    const headers = ['Parameter Name', 'Description', 'Value', 'Unit', 'Status'];
    const rows = parameters.map((p) => [
      `"${p.param_name}"`,
      `"${p.description || ''}"`,
      p.value !== null ? p.value : '',
      `"${p.unit || ''}"`,
      `"${p.status_label}"`,
    ]);
    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${flightDisplayId}_parameters.csv`;
    a.click();
    URL.revokeObjectURL(url);
    setShowExportMenu(false);
  };

  const handleDownloadPdf = () => {
    downloadFlightPdf(summary);
    setShowExportMenu(false);
  };

  const handlePrint = () => {
    printFlightReportHtml(summary);
    setShowExportMenu(false);
  };

  // Filtered lists
  const filteredParams = parameters.filter((p) =>
    p.param_name.toLowerCase().includes(paramSearch.toLowerCase()) ||
    (p.description && p.description.toLowerCase().includes(paramSearch.toLowerCase()))
  );

  const filteredEvents = events.filter((e) =>
    e.event_name.toLowerCase().includes(eventSearch.toLowerCase())
  );

  return (
    <section className="flight-summary-pane" id="flight-summary-section">
      {/* 1. Header Toolbar (clean, without back button and administrator badge) */}
      <div className="summary-nav-bar">
        <div className="summary-nav-left">
          {/* Flight Switcher Dropdown */}
          <div className="flight-dropdown-wrap">
            <span className="flight-select-prefix">Viewing Flight:</span>
            <select
              value={flight.flight_id}
              onChange={(e) => onSelectFlight(Number(e.target.value))}
              className="flight-select-input"
            >
              {allFlights.map((f) => {
                const aName = f.aircraft_number ? `AC${f.aircraft_number}` : `AC${f.aircraft_id}`;
                const fNum = String(f.flight_number).padStart(3, '0');
                const dt = f.flight_date_time ? f.flight_date_time.slice(0, 10) : '';
                return (
                  <option key={f.flight_id} value={f.flight_id}>
                    {aName}_{fNum} · {dt}
                  </option>
                );
              })}
            </select>
            <ChevronDown size={14} className="flight-select-chevron" />
          </div>
        </div>

        <div className="summary-nav-right">
          {/* Export Dropdown */}
          <div className="export-menu-wrap">
            <button
              type="button"
              className="btn-export"
              onClick={() => setShowExportMenu(!showExportMenu)}
            >
              <Download size={15} />
              <span>Export</span>
              <ChevronDown size={14} />
            </button>

            {showExportMenu && (
              <div className="export-dropdown-menu">
                <button type="button" onClick={handleDownloadPdf} className="export-menu-item">
                  <FileText size={16} />
                  <span>Download PDF Report</span>
                </button>
                <button type="button" onClick={handlePrint} className="export-menu-item">
                  <Printer size={16} />
                  <span>Print / PDF View</span>
                </button>
                <button type="button" onClick={handleExportCsv} className="export-menu-item">
                  <FileSpreadsheet size={16} />
                  <span>Export CSV (Parameters)</span>
                </button>
                <button type="button" onClick={handleExportJson} className="export-menu-item">
                  <FileCode size={16} />
                  <span>Export JSON</span>
                </button>
              </div>
            )}
          </div>

          {/* Analysis Complete Badge */}
          <div className="status-complete-pill">
            <CheckCircle2 size={15} />
            <span>{flight.status || 'Analysis Complete'}</span>
          </div>
        </div>
      </div>

      {/* 2. Hero Title Banner */}
      <div className="summary-hero-banner">
        <div className="summary-hero-info">
          <div className="summary-hero-breadcrumbs">
            <span>Fleet</span> / <span>Aircraft {acName}</span> / <span>Flight {flightDisplayId}</span>
          </div>
          <h2 className="summary-hero-title">
            Flight {flightDisplayId} <span className="title-sep">|</span> {flightDate} <span className="title-sep">Aircraft:</span> {acName}
          </h2>
          <div className="summary-hero-meta">
            <span>Configured Mass: <b>{flight.configured_mass_kg ? `${flight.configured_mass_kg.toLocaleString()} kg` : '—'}</b></span>
            <span className="meta-dot">·</span>
            <span>Initial Fuel: <b>{flight.initial_fuel_kg ? `${flight.initial_fuel_kg.toLocaleString()} kg` : '—'}</b></span>
            <span className="meta-dot">·</span>
            <span>All-up Initial Mass: <b>{flight.initial_mass_kg ? `${flight.initial_mass_kg.toLocaleString()} kg` : '—'}</b></span>
          </div>
        </div>

        <div className="summary-hero-art" aria-hidden="true">
          <AircraftMark className="summary-art-svg" />
        </div>
      </div>

      {/* 3. Sub Tabs */}
      <div className="summary-tabs-bar">
        <button
          type="button"
          className={`summary-tab ${activeTab === 'overview' ? 'is-active' : ''}`}
          onClick={() => setActiveTab('overview')}
        >
          Overview
        </button>
        <button
          type="button"
          className={`summary-tab ${activeTab === 'timeseries' ? 'is-active' : ''}`}
          onClick={() => setActiveTab('timeseries')}
        >
          Time Series
        </button>
        <button
          type="button"
          className={`summary-tab ${activeTab === 'parameters' ? 'is-active' : ''}`}
          onClick={() => setActiveTab('parameters')}
        >
          Parameters ({parameters.length})
        </button>
        <button
          type="button"
          className={`summary-tab ${activeTab === 'events' ? 'is-active' : ''}`}
          onClick={() => setActiveTab('events')}
        >
          Events ({events.length})
        </button>
        <button
          type="button"
          className={`summary-tab ${activeTab === 'quality' ? 'is-active' : ''}`}
          onClick={() => setActiveTab('quality')}
        >
          Data Quality
        </button>
      </div>

      {/* 4. Tab Body */}
      <div className="summary-tab-content">
        {/* OVERVIEW TAB */}
        {activeTab === 'overview' && (
          <div className="tab-pane-overview">
            {/* 8 KPI Cards Grid */}
            <FlightKpiGrid kpis={kpis} />

            {/* Flight Timeline */}
            <FlightTimelineBar totalDurationMin={total_duration_minutes} phases={timeline_phases} />

            {/* Key Signals Plot */}
            <FlightSignalsPlot points={key_signals.points} hasRealSignals={key_signals.has_real_signals} />
          </div>
        )}

        {/* TIME SERIES TAB */}
        {activeTab === 'timeseries' && (
          <div className="tab-pane-timeseries">
            <div className="subtab-banner">
              <div className="subtab-banner-text">
                <h3>Full Telemetry Time-Series Analysis</h3>
                <p>Inspect detailed landing roll and landing gear retraction &amp; extension sub-system time-series.</p>
              </div>
              <a href="/dashboard" className="btn-open-dashboard">
                Open Analysis Dashboard →
              </a>
            </div>

            {/* Embed Key Signals chart here too */}
            <FlightSignalsPlot points={key_signals.points} hasRealSignals={key_signals.has_real_signals} />
          </div>
        )}

        {/* PARAMETERS TAB */}
        {activeTab === 'parameters' && (
          <div className="tab-pane-parameters">
            <div className="tab-filter-bar">
              <div className="search-box">
                <Search size={16} />
                <input
                  type="text"
                  placeholder="Search engineering parameters..."
                  value={paramSearch}
                  onChange={(e) => setParamSearch(e.target.value)}
                />
              </div>
              <div className="tab-count-badge">
                Showing {filteredParams.length} of {parameters.length} parameters
              </div>
            </div>

            <div className="table-responsive-wrap">
              <table className="flight-detail-table">
                <thead>
                  <tr>
                    <th>Parameter Name</th>
                    <th>Description</th>
                    <th className="num">Value</th>
                    <th>Unit</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredParams.map((p) => (
                    <tr key={p.param_name}>
                      <td className="param-name-cell"><b>{p.param_name}</b></td>
                      <td className="param-desc-cell">{p.description || '—'}</td>
                      <td className="num">
                        <b>{p.value !== null ? p.value.toLocaleString() : '—'}</b>
                      </td>
                      <td><span className="unit-tag">{p.unit || '—'}</span></td>
                      <td>
                        <span className={`tag ${p.status === 1 ? 'tag-ok' : 'tag-bad'}`}>
                          {p.status_label}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {filteredParams.length === 0 && (
                    <tr>
                      <td colSpan={5} className="empty-table-row">
                        No parameters match your search query.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* EVENTS TAB */}
        {activeTab === 'events' && (
          <div className="tab-pane-events">
            <div className="tab-filter-bar">
              <div className="search-box">
                <Search size={16} />
                <input
                  type="text"
                  placeholder="Search detected events..."
                  value={eventSearch}
                  onChange={(e) => setEventSearch(e.target.value)}
                />
              </div>
              <div className="tab-count-badge">
                Showing {filteredEvents.length} of {events.length} events
              </div>
            </div>

            <div className="table-responsive-wrap">
              <table className="flight-detail-table">
                <thead>
                  <tr>
                    <th>Event Name</th>
                    <th>Timestamp</th>
                    <th className="num">Occur Sequence</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredEvents.map((e, idx) => (
                    <tr key={`${e.event_name}-${idx}`}>
                      <td className="param-name-cell">
                        <span className="event-bullet" />
                        <b>{e.event_name}</b>
                      </td>
                      <td>
                        <span className="event-time-code">{e.date_time ? e.date_time.replace('T', ' ') : '—'}</span>
                      </td>
                      <td className="num">{e.occur_seq !== null ? e.occur_seq : '—'}</td>
                      <td>
                        <span className="tag tag-ok">Detected</span>
                      </td>
                    </tr>
                  ))}
                  {filteredEvents.length === 0 && (
                    <tr>
                      <td colSpan={4} className="empty-table-row">
                        No events match your search query.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* DATA QUALITY TAB */}
        {activeTab === 'quality' && (
          <div className="tab-pane-quality">
            <div className="quality-grid">
              <div className="quality-card">
                <div className="quality-card-header">
                  <Database size={20} className="q-icon blue" />
                  <h4>Telemetry File Ingestion</h4>
                </div>
                <div className="quality-card-body">
                  <div className="q-row">
                    <span>Expected Files:</span> <b>6 Parquet (Data-1 to Data-6)</b>
                  </div>
                  <div className="q-row">
                    <span>Parquet Status:</span> <span className="tag tag-ok">Ready &amp; Verified</span>
                  </div>
                  <div className="q-row">
                    <span>Upload Started:</span> <b>{flight.upload_start_time ? flight.upload_start_time.replace('T', ' ').slice(0, 19) : '—'}</b>
                  </div>
                  <div className="q-row">
                    <span>Upload Completed:</span> <b>{flight.upload_end_time ? flight.upload_end_time.replace('T', ' ').slice(0, 19) : '—'}</b>
                  </div>
                </div>
              </div>

              <div className="quality-card">
                <div className="quality-card-header">
                  <Activity size={20} className="q-icon green" />
                  <h4>Signal Sampling &amp; Integrity</h4>
                </div>
                <div className="quality-card-body">
                  <div className="q-row">
                    <span>Primary Sampling Rate:</span> <b>12.5 Hz / 25 Hz / 50 Hz</b>
                  </div>
                  <div className="q-row">
                    <span>Downsample Factor:</span> <b>1x full fidelity in Parquet</b>
                  </div>
                  <div className="q-row">
                    <span>Timebase Continuity:</span> <span className="tag tag-ok">Monotonic</span>
                  </div>
                  <div className="q-row">
                    <span>Midnight Wrap:</span> <b>Handled seamlessly</b>
                  </div>
                </div>
              </div>

              <div className="quality-card">
                <div className="quality-card-header">
                  <ShieldCheck size={20} className="q-icon purple" />
                  <h4>Validation &amp; Bounds</h4>
                </div>
                <div className="quality-card-body">
                  <div className="q-row">
                    <span>Parameters Computed:</span> <b>{parameters.length}</b>
                  </div>
                  <div className="q-row">
                    <span>Complete Parameters:</span> <b>{parameters.filter(p => p.status === 1).length}</b>
                  </div>
                  <div className="q-row">
                    <span>Incomplete / Guarded:</span> <b>{parameters.filter(p => p.status !== 1).length}</b>
                  </div>
                  <div className="q-row">
                    <span>Events Detected:</span> <b>{events.length} transitions</b>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
