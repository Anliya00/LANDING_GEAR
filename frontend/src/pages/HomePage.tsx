import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { 
  Plane, Database, AlertTriangle, Settings, 
  FileText, ChevronRight, ArrowUp, CheckCircle2
} from 'lucide-react';
import { useSession, roleLabel } from '@/auth/guards';
import { api } from '@/api/client';
import './HomePage.css';

interface RealFlightItem {
  flight_id: string;
  raw_id: number;
  date: string;
  aircraft: string;
  status: string;
  badgeType: 'completed' | 'progress' | 'pending' | 'warning';
}

export default function HomePage() {
  const { user } = useSession();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [totalFlights, setTotalFlights] = useState<number>(0);
  const [pendingIngestion, setPendingIngestion] = useState<number>(0);
  const [flightsWithIssues, setFlightsWithIssues] = useState<number>(0);
  const [configGaps, setConfigGaps] = useState<number>(0);
  const [recentFlights, setRecentFlights] = useState<RealFlightItem[]>([]);

  useEffect(() => {
    async function loadRealData() {
      setLoading(true);
      try {
        // Fetch flights, folders, and aircraft configuration
        const [flightsRes, foldersRes, aircraftRes] = await Promise.all([
          api.get<any[]>('/flights').catch(() => []),
          api.get<{ folders: any[] }>('/ingestion/folders').catch(() => ({ folders: [] })),
          api.get<any[]>('/aircrafts').catch(() => [])
        ]);

        const dbFlights = Array.isArray(flightsRes) ? flightsRes : [];
        const dbFolders = foldersRes?.folders || [];
        const dbAircraft = Array.isArray(aircraftRes) ? aircraftRes : [];

        // 1. Total Flights
        setTotalFlights(dbFlights.length);

        // 2. Flights with issues / warnings
        const issues = dbFlights.filter(f => {
          const s = (f.status || '').toLowerCase();
          return s.includes('fail') || s.includes('warn');
        }).length;
        setFlightsWithIssues(issues);

        // 3. Pending Ingestion folders
        const pending = dbFolders.filter(f => {
          const s = (f.status || '').toLowerCase();
          return s === 'pending' || s === 'uploading';
        }).length;
        setPendingIngestion(pending);

        // 4. Configuration Gaps (aircraft with no mass configured)
        const gaps = dbAircraft.filter(a => a.aircraft_mass_kg === null || a.aircraft_mass_kg === undefined).length;
        setConfigGaps(gaps);

        // 5. Map original flight data for table
        const mapped: RealFlightItem[] = dbFlights.map(f => {
          const rawStatus = (f.status || '').toUpperCase();
          let badgeType: RealFlightItem['badgeType'] = 'pending';

          if (rawStatus.includes('COMPLETE')) {
            badgeType = 'completed';
          } else if (rawStatus.includes('UPLOADING') || rawStatus.includes('ANALYSING') || rawStatus.includes('PROGRESS')) {
            badgeType = 'progress';
          } else if (rawStatus.includes('FAIL') || rawStatus.includes('WARN')) {
            badgeType = 'warning';
          } else {
            badgeType = 'pending';
          }

          let dateStr = '—';
          if (f.flight_date_time) {
            try {
              dateStr = f.flight_date_time.slice(0, 10);
            } catch {
              dateStr = String(f.flight_date_time);
            }
          }

          const fNumStr = f.flight_number !== undefined ? String(f.flight_number).padStart(3, '0') : '001';
          const acStr = f.aircraft_number ? `AC${f.aircraft_number}` : (f.aircraft_id ? `AC${f.aircraft_id}` : 'AC');

          return {
            flight_id: `${acStr}_${fNumStr}`,
            raw_id: f.flight_id,
            date: dateStr,
            aircraft: acStr,
            status: f.status || 'UNKNOWN',
            badgeType
          };
        });

        setRecentFlights(mapped);
      } catch (err) {
        console.error('Failed to load dashboard data', err);
      } finally {
        setLoading(false);
      }
    }

    loadRealData();
  }, []);

  const roleName = roleLabel(user?.roles) || 'Engineer';
  const welcomeName = user?.display_name || user?.username || roleName;

  const renderBadge = (status: string, type: RealFlightItem['badgeType']) => {
    return <span className={`home-status-pill ${type}`}>{status}</span>;
  };

  return (
    <div className="home-page">
      {/* Hero Banner */}
      <div className="home-hero">
        <div className="home-hero-overlay" />
        <div className="home-hero-content">
          <h1>Welcome, {welcomeName}</h1>
          <p>Monitor flights, analyse landing gear performance and data health.</p>
        </div>
        <div className="home-hero-stat">
          <span className="home-hero-stat-value">{totalFlights}</span>
          <span className="home-hero-stat-label">Total Flights in System</span>
        </div>
      </div>

      {/* KPI Metric Cards Grid */}
      <div className="home-kpi-grid">
        {/* Card 1: Total Flights */}
        <div className="kpi-card">
          <div className="kpi-header">
            <div className="kpi-icon-wrap blue">
              <Plane size={24} />
            </div>
            <div className="kpi-body">
              <span className="kpi-value">{totalFlights}</span>
              <span className="kpi-label">Total Flights</span>
            </div>
          </div>
          <div className="kpi-footer kpi-trend-green">
            <ArrowUp size={15} /> {totalFlights > 0 ? `+${totalFlights} recorded` : 'System active'}
          </div>
        </div>

        {/* Card 2: Pending Ingestion */}
        <div className="kpi-card">
          <div className="kpi-header">
            <div className="kpi-icon-wrap amber">
              <Database size={24} />
            </div>
            <div className="kpi-body">
              <span className="kpi-value">{pendingIngestion}</span>
              <span className="kpi-label">Pending Ingestion</span>
            </div>
          </div>
          <div className={`kpi-footer ${pendingIngestion > 0 ? 'kpi-trend-amber' : 'kpi-trend-green'}`}>
            {pendingIngestion > 0 ? `↑ ${pendingIngestion} awaiting ingest` : '✓ All folders ingested'}
          </div>
        </div>

        {/* Card 3: Flights with Issues */}
        <div className="kpi-card">
          <div className="kpi-header">
            <div className="kpi-icon-wrap red">
              <AlertTriangle size={24} />
            </div>
            <div className="kpi-body">
              <span className="kpi-value">{flightsWithIssues}</span>
              <span className="kpi-label">Flights with Issues</span>
            </div>
          </div>
          <div className={`kpi-footer ${flightsWithIssues > 0 ? 'kpi-trend-red' : 'kpi-trend-green'}`}>
            {flightsWithIssues > 0 ? `↑ ${flightsWithIssues} flagged` : '✓ Zero anomaly flags'}
          </div>
        </div>

        {/* Card 4: Configuration Gaps */}
        <div className="kpi-card">
          <div className="kpi-header">
            <div className="kpi-icon-wrap purple">
              <Settings size={24} />
            </div>
            <div className="kpi-body">
              <span className="kpi-value">{configGaps}</span>
              <span className="kpi-label">Configuration Gaps</span>
            </div>
          </div>
          <div className={`kpi-footer ${configGaps > 0 ? 'kpi-trend-amber' : 'kpi-trend-green'}`}>
            {configGaps > 0 ? '→ Needs review' : '✓ Fleet mass registered'}
          </div>
        </div>
      </div>

      {/* Lower Two-Column Section */}
      <div className="home-lower-grid">
        {/* Left: Recent Flights (100% Original Data) */}
        <div className="home-card">
          <div className="home-card-header">
            <h2>Recent Flights</h2>
            <Link to="/flights" className="home-view-all-link">
              View All →
            </Link>
          </div>
          <div className="home-flights-table-wrap">
            <table className="home-flights-table">
              <thead>
                <tr>
                  <th>Flight ID</th>
                  <th>Date</th>
                  <th>Aircraft</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {recentFlights.map((f) => (
                  <tr key={f.raw_id}>
                    <td className="flight-id-cell">{f.flight_id}</td>
                    <td>{f.date}</td>
                    <td>{f.aircraft}</td>
                    <td>{renderBadge(f.status, f.badgeType)}</td>
                    <td>
                      <button 
                        type="button" 
                        className="home-action-btn"
                        onClick={() => navigate(`/flights?flight_id=${f.raw_id}`)}
                      >
                        View
                      </button>
                    </td>
                  </tr>
                ))}
                {!loading && recentFlights.length === 0 && (
                  <tr>
                    <td colSpan={5} className="home-empty-notice">
                      No flights recorded yet. Go to <Link to="/ingestion" style={{color: 'var(--accent)'}}>Data Ingestion</Link> to scan and ingest flights.
                    </td>
                  </tr>
                )}
                {loading && (
                  <tr>
                    <td colSpan={5} className="home-empty-notice">
                      Loading flight records...
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right: Needs Your Attention */}
        <div className="home-card">
          <div className="home-card-header">
            <h2>Needs Your Attention</h2>
          </div>
          <div className="attention-list">
            <Link to="/ingestion" className="attention-item">
              <div className="attention-left">
                <div className={`attention-icon-wrap ${pendingIngestion > 0 ? 'amber-fill' : 'green-fill'}`}>
                  {pendingIngestion > 0 ? <Database size={20} /> : <CheckCircle2 size={20} />}
                </div>
                <span className="attention-title">
                  {pendingIngestion > 0 
                    ? `${pendingIngestion} flights waiting for data ingestion` 
                    : 'All folder ingestions up to date'}
                </span>
              </div>
              <ChevronRight size={18} className="attention-arrow" />
            </Link>

            <Link to="/flights" className="attention-item">
              <div className="attention-left">
                <div className={`attention-icon-wrap ${flightsWithIssues > 0 ? 'red-fill' : 'green-fill'}`}>
                  {flightsWithIssues > 0 ? <AlertTriangle size={20} /> : <CheckCircle2 size={20} />}
                </div>
                <span className="attention-title">
                  {flightsWithIssues > 0 
                    ? `${flightsWithIssues} flights with anomaly flags` 
                    : 'No flight anomalies detected'}
                </span>
              </div>
              <ChevronRight size={18} className="attention-arrow" />
            </Link>

            <Link to="/configuration" className="attention-item">
              <div className="attention-left">
                <div className={`attention-icon-wrap ${configGaps > 0 ? 'amber-fill' : 'green-fill'}`}>
                  {configGaps > 0 ? <Settings size={20} /> : <CheckCircle2 size={20} />}
                </div>
                <span className="attention-title">
                  {configGaps > 0 
                    ? `${configGaps} aircraft mass configuration missing` 
                    : 'Fleet configuration complete'}
                </span>
              </div>
              <ChevronRight size={18} className="attention-arrow" />
            </Link>

            <Link to="/plots/retraction" className="attention-item">
              <div className="attention-left">
                <div className="attention-icon-wrap blue-fill">
                  <FileText size={20} />
                </div>
                <span className="attention-title">
                  {totalFlights > 0 
                    ? `${totalFlights} flight analyses ready for inspection` 
                    : 'Ready for flight parameter analysis'}
                </span>
              </div>
              <ChevronRight size={18} className="attention-arrow" />
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}