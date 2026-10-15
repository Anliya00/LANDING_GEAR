import { useEffect, useState, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Plane, AlertTriangle, RefreshCw, CheckCircle2, Database } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { flightsApi, type FlightRow, type FlightSummaryResponse } from '@/api/flights';
import { FlightTable } from './FlightTable';
import { FlightSummaryPane } from './FlightSummaryPane';
import './FlightsPage.css';

export default function FlightsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const urlFlightId = searchParams.get('flight_id');

  const [flights, setFlights] = useState<FlightRow[]>([]);
  const [loadingFlights, setLoadingFlights] = useState(true);
  const [flightError, setFlightError] = useState<string | null>(null);

  const [selectedFlightId, setSelectedFlightId] = useState<number | null>(null);
  const [summary, setSummary] = useState<FlightSummaryResponse | null>(null);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);

  const summaryRef = useRef<HTMLDivElement>(null);

  // 1. Load all flights
  const loadFlights = async () => {
    setLoadingFlights(true);
    setFlightError(null);
    try {
      const data = await flightsApi.list();
      const list = Array.isArray(data) ? data : [];
      setFlights(list);

      // If URL had flight_id, select that flight
      if (urlFlightId) {
        const idNum = Number(urlFlightId);
        if (!isNaN(idNum) && list.some((f) => f.flight_id === idNum)) {
          setSelectedFlightId(idNum);
        } else if (list.length > 0) {
          const firstComplete = list.find((f) => (f.status || '').toUpperCase().includes('COMPLETE')) || list[0];
          setSelectedFlightId(firstComplete.flight_id);
        }
      } else if (list.length > 0) {
        const firstComplete = list.find((f) => (f.status || '').toUpperCase().includes('COMPLETE')) || list[0];
        setSelectedFlightId(firstComplete.flight_id);
      }
    } catch (err: any) {
      console.error('Failed to load flights', err);
      setFlightError(err?.message || 'Could not load flights from database.');
    } finally {
      setLoadingFlights(false);
    }
  };

  useEffect(() => {
    loadFlights();
  }, []);

  // 2. Load summary when selectedFlightId changes
  useEffect(() => {
    if (!selectedFlightId) {
      setSummary(null);
      return;
    }

    // Sync with query string
    setSearchParams({ flight_id: String(selectedFlightId) }, { replace: true });

    let active = true;
    setLoadingSummary(true);
    setSummaryError(null);

    flightsApi.getSummary(selectedFlightId)
      .then((data) => {
        if (active) {
          setSummary(data);
        }
      })
      .catch((err: any) => {
        if (active) {
          console.error('Failed to load summary', err);
          setSummaryError(err?.message || 'Could not load diagnostic summary for this flight.');
        }
      })
      .finally(() => {
        if (active) {
          setLoadingSummary(false);
        }
      });

    return () => {
      active = false;
    };
  }, [selectedFlightId]);

  // Handle select flight & scroll down
  const handleSelectFlight = (flightId: number) => {
    setSelectedFlightId(flightId);
    setTimeout(() => {
      summaryRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
  };

  // Fleet stats
  const totalCount = flights.length;
  const completedCount = flights.filter((f) => (f.status || '').toUpperCase().includes('COMPLETE')).length;
  const pendingCount = flights.filter((f) => {
    const s = (f.status || '').toUpperCase();
    return s.includes('PENDING') || s.includes('PROGRESS') || s.includes('UPLOADING') || s.includes('ANALYSING');
  }).length;
  const issuesCount = flights.filter((f) => {
    const s = (f.status || '').toUpperCase();
    return s.includes('FAIL') || s.includes('WARN') || s.includes('ERROR');
  }).length;

  return (
    <div className="flights-page">
      {/* Standard SFTAD Page Header with Aeronautical Banner */}
      <PageHeader
        title="Flights"
        description="Fleet flight register, configured aircraft mass, ingestion tracking, and telemetry diagnostics."
        banner={true}
        actions={
          <button
            type="button"
            className="btn-secondary"
            onClick={loadFlights}
            disabled={loadingFlights}
            title="Reload flight records from database"
          >
            <RefreshCw size={18} className={loadingFlights ? 'spin' : ''} /> Refresh
          </button>
        }
      />

      {/* KPI Stats Cards Row (matching other pages) */}
      <div className="stats-cards">
        {/* Card 1: Total Flights */}
        <div className="stat-card">
          <div className="stat-card-header">
            <div className="stat-icon blue">
              <Plane size={26} />
            </div>
            <div className="stat-info">
              <span className="stat-value">{totalCount}</span>
              <span className="stat-label">Total Flights</span>
            </div>
          </div>
          <div className="stat-footer stat-blue">
            {totalCount > 0 ? `+${totalCount} recorded in system` : 'Database ready'}
          </div>
        </div>

        {/* Card 2: Completed Flights */}
        <div className="stat-card">
          <div className="stat-card-header">
            <div className="stat-icon green">
              <CheckCircle2 size={26} />
            </div>
            <div className="stat-info">
              <span className="stat-value">{completedCount}</span>
              <span className="stat-label">Analysed</span>
            </div>
          </div>
          <div className="stat-footer stat-green">
            ✓ Full diagnostic telemetry available
          </div>
        </div>

        {/* Card 3: Pending Ingestion/Analysis */}
        <div className="stat-card">
          <div className="stat-card-header">
            <div className="stat-icon amber">
              <Database size={26} />
            </div>
            <div className="stat-info">
              <span className="stat-value">{pendingCount}</span>
              <span className="stat-label">Pending / In Progress</span>
            </div>
          </div>
          <div className={`stat-footer ${pendingCount > 0 ? 'stat-amber' : 'stat-green'}`}>
            {pendingCount > 0 ? `↑ ${pendingCount} in pipeline` : '✓ Ingestion queue clear'}
          </div>
        </div>

        {/* Card 4: Flagged Issues */}
        <div className="stat-card">
          <div className="stat-card-header">
            <div className="stat-icon red">
              <AlertTriangle size={26} />
            </div>
            <div className="stat-info">
              <span className="stat-value">{issuesCount}</span>
              <span className="stat-label">Flagged Issues</span>
            </div>
          </div>
          <div className={`stat-footer ${issuesCount > 0 ? 'stat-red' : 'stat-green'}`}>
            {issuesCount > 0 ? `↑ ${issuesCount} need inspection` : '✓ Zero anomaly flags'}
          </div>
        </div>
      </div>

      {flightError && (
        <div className="flights-alert-error">
          <AlertTriangle size={18} />
          <span>{flightError}</span>
          <button type="button" onClick={loadFlights}>Retry</button>
        </div>
      )}

      {/* TOP PORTION: FLIGHTS MASTER TABLE WITH EXPANDABLE ROWS */}
      <FlightTable
        flights={flights}
        loading={loadingFlights}
        selectedFlightId={selectedFlightId}
        onSelectFlight={handleSelectFlight}
      />

      {/* BOTTOM PORTION: FLIGHT SUMMARY PANE (REVEALED DOWN TO THE TABLE) */}
      <div ref={summaryRef} className="summary-anchor">
        {loadingSummary && (
          <div className="summary-loading-card">
            <RefreshCw size={24} className="spin-icon" />
            <p>Loading flight telemetry, KPI metrics and signals from database...</p>
          </div>
        )}

        {summaryError && (
          <div className="flights-alert-error">
            <AlertTriangle size={18} />
            <span>{summaryError}</span>
            <button type="button" onClick={() => selectedFlightId && handleSelectFlight(selectedFlightId)}>Retry</button>
          </div>
        )}

        {!loadingSummary && summary && (
          <FlightSummaryPane
            summary={summary}
            allFlights={flights}
            onSelectFlight={handleSelectFlight}
          />
        )}
      </div>
    </div>
  );
}
