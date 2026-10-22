import { useState, useMemo } from 'react';
import React from 'react';
import { 
  Search, ChevronDown, ChevronRight, RotateCcw, 
  Eye, Clock, Database, AlertTriangle, CheckCircle2, ChevronLeft
} from 'lucide-react';
import type { FlightRow } from '@/api/flights';

interface Props {
  flights: FlightRow[];
  loading: boolean;
  selectedFlightId: number | null;
  onSelectFlight: (flightId: number) => void;
}

// Format date into DD-MM-YYYY HH:mm (consistent with IngestionPage)
function formatFlightDate(dtStr: string | null | undefined): string {
  if (!dtStr) return '—';
  try {
    const clean = dtStr.trim();
    if (clean.includes('T')) {
      const [datePart, timePart] = clean.split('T');
      const [y, m, d] = datePart.split('-');
      const time = timePart.slice(0, 5);
      return `${d}-${m}-${y} ${time}`;
    } else if (clean.includes(' ')) {
      const [datePart, timePart] = clean.split(' ');
      const [y, m, d] = datePart.split('-');
      const time = timePart ? timePart.slice(0, 5) : '00:00';
      return `${d}-${m}-${y} ${time}`;
    }
    return clean;
  } catch {
    return dtStr;
  }
}

export function FlightTable({
  flights,
  loading,
  selectedFlightId,
  onSelectFlight,
}: Props) {
  // Filters
  const [search, setSearch] = useState('');
  const [filterAircraft, setFilterAircraft] = useState('All');
  const [filterStatus, setFilterStatus] = useState('All');
  const [filterTime, setFilterTime] = useState('All');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  // Page Size & Pagination (View 5, 10, 20, 50, All)
  const [pageSize, setPageSize] = useState<number>(10);
  const [currentPage, setCurrentPage] = useState<number>(1);

  // Collapsible sub-row state
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());

  // Aircraft options
  const aircraftOptions = useMemo(() => {
    const set = new Set<string>();
    flights.forEach((f) => {
      const ac = f.aircraft_number ? `AC${f.aircraft_number}` : (f.aircraft_id ? `AC${f.aircraft_id}` : null);
      if (ac) set.add(ac);
    });
    return ['All', ...Array.from(set).sort()];
  }, [flights]);

  const toggleRow = (id: number) => {
    const next = new Set(expandedRows);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setExpandedRows(next);
  };

  const handleReset = () => {
    setSearch('');
    setFilterAircraft('All');
    setFilterStatus('All');
    setFilterTime('All');
    setDateFrom('');
    setDateTo('');
    setCurrentPage(1);
  };

  const handleTimeChange = (val: string) => {
    setFilterTime(val);
    setCurrentPage(1);
    const now = new Date();
    if (val === 'All') {
      setDateFrom('');
      setDateTo('');
    } else if (val === '7d') {
      const past = new Date();
      past.setDate(now.getDate() - 7);
      setDateFrom(past.toISOString().slice(0, 10));
      setDateTo(now.toISOString().slice(0, 10));
    } else if (val === '30d') {
      const past = new Date();
      past.setDate(now.getDate() - 30);
      setDateFrom(past.toISOString().slice(0, 10));
      setDateTo(now.toISOString().slice(0, 10));
    }
  };

  // Filtered flights
  const filteredFlights = useMemo(() => {
    return flights.filter((f) => {
      const acStr = f.aircraft_number ? `AC${f.aircraft_number}` : (f.aircraft_id ? `AC${f.aircraft_id}` : '');
      const fNum = String(f.flight_number).padStart(3, '0');
      const flightCode = `${acStr}_${fNum}`.toLowerCase();

      // Aircraft filter
      if (filterAircraft !== 'All' && acStr !== filterAircraft) {
        return false;
      }

      // Status filter
      if (filterStatus !== 'All') {
        const s = (f.status || '').toLowerCase();
        if (filterStatus === 'Completed' && !s.includes('complete')) return false;
        if (filterStatus === 'In Progress' && (!s.includes('progress') && !s.includes('analysing') && !s.includes('uploading'))) return false;
        if (filterStatus === 'Failed' && (!s.includes('fail') && !s.includes('error') && !s.includes('warn'))) return false;
        if (filterStatus === 'Pending' && !s.includes('pending')) return false;
      }

      // Search term
      if (search.trim()) {
        const q = search.toLowerCase();
        const matchesCode = flightCode.includes(q);
        const matchesId = String(f.flight_id).includes(q);
        const matchesDate = (f.flight_date_time || '').toLowerCase().includes(q);
        const matchesAircraft = acStr.toLowerCase().includes(q);
        if (!matchesCode && !matchesId && !matchesDate && !matchesAircraft) return false;
      }

      // Date range filter
      if (dateFrom && f.flight_date_time) {
        if (f.flight_date_time.slice(0, 10) < dateFrom) return false;
      }
      if (dateTo && f.flight_date_time) {
        if (f.flight_date_time.slice(0, 10) > dateTo) return false;
      }

      return true;
    });
  }, [flights, filterAircraft, filterStatus, filterTime, search, dateFrom, dateTo]);

  // Paginated items
  const totalItems = filteredFlights.length;
  const totalPages = pageSize > 0 ? Math.max(1, Math.ceil(totalItems / pageSize)) : 1;
  const safePage = Math.min(currentPage, totalPages);

  const paginatedFlights = useMemo(() => {
    if (pageSize <= 0) return filteredFlights;
    const start = (safePage - 1) * pageSize;
    return filteredFlights.slice(start, start + pageSize);
  }, [filteredFlights, safePage, pageSize]);

  // Status badge matching exact status from database flight_status column
  const renderStatusBadge = (rawStatus: string) => {
    const s = (rawStatus || '').toUpperCase();
    let badgeClass = 'badge-pending';
    if (s.includes('COMPLETE')) {
      badgeClass = 'badge-complete';
    } else if (s.includes('ANALYSING') || s.includes('UPLOADING') || s.includes('PROGRESS')) {
      badgeClass = 'badge-processing';
    } else if (s.includes('FAILED') || s.includes('ERROR') || s.includes('WARN')) {
      badgeClass = 'badge-failed';
    }
    return <span className={`status-badge ${badgeClass}`}>{rawStatus || 'UNKNOWN'}</span>;
  };

  const formatDuration = (start?: string | null, end?: string | null) => {
    if (!start || !end) return '—';
    try {
      const ms = new Date(end).getTime() - new Date(start).getTime();
      if (ms <= 0) return '—';
      const sec = Math.floor(ms / 1000);
      const min = Math.floor(sec / 60);
      const remSec = sec % 60;
      return min > 0 ? `${min}m ${remSec}s` : `${remSec}s`;
    } catch {
      return '—';
    }
  };

  return (
    <div className="flights-table-container">
      {/* 1. Filter Bar (Identical styling to IngestionPage) */}
      <div className="filters">
        <div className="search-box">
          <Search size={18} color="var(--ink-muted)" />
          <input
            type="text"
            placeholder="Search flight ID, aircraft, date..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setCurrentPage(1);
            }}
          />
        </div>

        <select
          value={filterAircraft}
          onChange={(e) => {
            setFilterAircraft(e.target.value);
            setCurrentPage(1);
          }}
        >
          {aircraftOptions.map((opt) => (
            <option key={opt} value={opt}>
              {opt === 'All' ? 'Aircraft: All' : `Aircraft: ${opt}`}
            </option>
          ))}
        </select>

        <select
          value={filterStatus}
          onChange={(e) => {
            setFilterStatus(e.target.value);
            setCurrentPage(1);
          }}
        >
          <option value="All">Status: All</option>
          <option value="Completed">Completed</option>
          <option value="In Progress">In Progress</option>
          <option value="Failed">Failed / Issues</option>
          <option value="Pending">Pending</option>
        </select>

        <select
          value={filterTime}
          onChange={(e) => handleTimeChange(e.target.value)}
        >
          <option value="All">Time: All Dates</option>
          <option value="7d">Last 7 Days</option>
          <option value="30d">Last 30 Days</option>
          <option value="custom">Custom Range</option>
        </select>

        {filterTime === 'custom' && (
          <div className="custom-date-inputs">
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => {
                setDateFrom(e.target.value);
                setCurrentPage(1);
              }}
              className="date-input"
            />
            <span className="date-sep">to</span>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => {
                setDateTo(e.target.value);
                setCurrentPage(1);
              }}
              className="date-input"
            />
          </div>
        )}

        <select
          value={pageSize}
          onChange={(e) => {
            setPageSize(Number(e.target.value));
            setCurrentPage(1);
          }}
          title="Number of rows per page"
        >
          <option value={5}>Show: 5</option>
          <option value={10}>Show: 10</option>
          <option value={20}>Show: 20</option>
          <option value={50}>Show: 50</option>
          <option value={0}>Show: All</option>
        </select>

        <button className="btn-outline" onClick={handleReset} title="Reset all filters" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
          <RotateCcw size={14} />
          <span>Reset</span>
        </button>
      </div>

      {/* 2. Data Table with Colgroup and Guaranteed 1-to-1 Column Alignment */}
      <div className="data-table-wrap">
        <table className="flights-master-table">
          <colgroup>
            <col style={{ width: '70px' }} />
            <col style={{ width: '150px' }} />
            <col style={{ width: '100px' }} />
            <col style={{ width: '180px' }} />
            <col style={{ width: '160px' }} />
            <col style={{ width: '210px' }} />
            <col style={{ width: '130px' }} />
            <col style={{ width: '110px' }} />
          </colgroup>
          <thead>
            <tr>
              <th style={{ textAlign: 'center' }}>Sl. No.</th>
              <th style={{ textAlign: 'left' }}>Flight ID</th>
              <th style={{ textAlign: 'center' }}>Aircraft</th>
              <th style={{ textAlign: 'left' }}>Flight Date &amp; Time</th>
              <th style={{ textAlign: 'right' }}>Configured Mass</th>
              <th style={{ textAlign: 'right' }}>Initial Mass (Before Flight)</th>
              <th style={{ textAlign: 'center' }}>Status</th>
              <th style={{ textAlign: 'center' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={8} style={{ textAlign: 'center', padding: 'var(--s5)' }}>
                  Loading flight records from database...
                </td>
              </tr>
            ) : filteredFlights.length === 0 ? (
              <tr>
                <td colSpan={8} style={{ textAlign: 'center', padding: 'var(--s5)' }}>
                  No flights found matching filters.
                </td>
              </tr>
            ) : (
              paginatedFlights.map((f, idx) => {
                const slNo = pageSize > 0 ? (safePage - 1) * pageSize + idx + 1 : idx + 1;
                const acStr = f.aircraft_number ? `AC${f.aircraft_number}` : (f.aircraft_id ? `AC${f.aircraft_id}` : 'AC');
                const fNum = String(f.flight_number).padStart(3, '0');
                const flightCode = `${acStr}_${fNum}`;
                const isSelected = selectedFlightId === f.flight_id;
                const isExpanded = expandedRows.has(f.flight_id);
                const dateStr = formatFlightDate(f.flight_date_time);
                const configMass = f.configured_mass_kg ? `${f.configured_mass_kg.toLocaleString()} kg` : '—';
                const initMass = f.initial_mass_kg ? `${f.initial_mass_kg.toLocaleString()} kg` : '—';
                const initFuel = f.initial_fuel_kg ? ` (Fuel: ${f.initial_fuel_kg.toLocaleString()} kg)` : '';

                return (
                  <React.Fragment key={f.flight_id}>
                    {/* Primary Data Row - Exactly 8 matching <td> elements */}
                    <tr
                      className={`flights-data-row ${isSelected ? 'is-selected-flight' : ''} ${isExpanded ? 'is-row-expanded' : ''}`}
                      onClick={() => toggleRow(f.flight_id)}
                    >
                      {/* 1. Sl. No. */}
                      <td style={{ textAlign: 'center' }}>
                        <span className="slno-text">{slNo}</span>
                      </td>

                      {/* 2. Flight ID with expand icon */}
                      <td style={{ textAlign: 'left' }}>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ color: 'var(--ink-muted)', display: 'flex', alignItems: 'center' }}>
                            {isExpanded ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                          </span>
                          <strong className="flight-code-text">{flightCode}</strong>
                          <span className="flight-id-sub">#{f.flight_id}</span>
                        </div>
                      </td>

                      {/* 3. Aircraft */}
                      <td style={{ textAlign: 'center' }}>
                        <span className="aircraft-pill">{acStr}</span>
                      </td>

                      {/* 4. Flight Date & Time */}
                      <td style={{ textAlign: 'left' }}>
                        <span className="flight-date-text">{dateStr}</span>
                      </td>

                      {/* 5. Configured Mass */}
                      <td style={{ textAlign: 'right' }}>
                        <strong className="mass-val">{configMass}</strong>
                      </td>

                      {/* 6. Initial Mass before flight */}
                      <td style={{ textAlign: 'right' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                          <strong className="mass-val">{initMass}</strong>
                          {initFuel && (
                            <span className="fuel-hint">{initFuel}</span>
                          )}
                        </div>
                      </td>

                      {/* 7. Status */}
                      <td style={{ textAlign: 'center' }}>
                        {renderStatusBadge(f.status)}
                      </td>

                      {/* 8. Actions */}
                      <td style={{ textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          className={`btn-table-action ${isSelected ? 'active' : ''}`}
                          onClick={() => onSelectFlight(f.flight_id)}
                        >
                          <Eye size={14} />
                          <span>{isSelected ? 'Viewing' : 'View'}</span>
                        </button>
                      </td>
                    </tr>

                    {/* Expandable Accordion Subrow - Exactly colSpan={8} */}
                    {isExpanded && (
                      <tr className="flights-subrow">
                        <td colSpan={8} style={{ padding: '0', background: 'var(--surface-2)' }}>
                          <div className="subrow-content">
                            <div className="subrow-grid">
                              <div className="subrow-block">
                                <span className="subrow-label"><Clock size={13} /> Ingestion Started</span>
                                <b className="subrow-val">{(f.ingestion_start_time || f.upload_start_time) ? (f.ingestion_start_time || f.upload_start_time)!.replace('T', ' ').slice(0, 19) : '—'}</b>
                              </div>

                              <div className="subrow-block">
                                <span className="subrow-label"><CheckCircle2 size={13} /> Ingestion Completed</span>
                                <b className="subrow-val">{(f.ingestion_end_time || f.upload_end_time) ? (f.ingestion_end_time || f.upload_end_time)!.replace('T', ' ').slice(0, 19) : '—'}</b>
                              </div>

                              <div className="subrow-block">
                                <span className="subrow-label"><Database size={13} /> Ingestion Duration</span>
                                <b className="subrow-val">{formatDuration(f.ingestion_start_time || f.upload_start_time, f.ingestion_end_time || f.upload_end_time)}</b>
                              </div>

                              <div className="subrow-block subrow-grow">
                                <span className="subrow-label"><AlertTriangle size={13} /> Remarks &amp; Diagnostics</span>
                                <span className="subrow-val remark-text">
                                  {f.error_message || f.status || 'No issues detected.'}
                                </span>
                              </div>
                            </div>

                            <div className="subrow-actions">
                              <button
                                type="button"
                                className="btn-subrow-view"
                                onClick={() => onSelectFlight(f.flight_id)}
                              >
                                View Flight Telemetry &amp; Signals ↓
                              </button>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })
            )}
          </tbody>
        </table>

        {/* 3. Pagination Footer Inside Table Wrap */}
        <div className="table-pagination-bar">
          <div className="pagination-info">
            {totalItems > 0 ? (
              <>
                Showing <b>{pageSize > 0 ? (safePage - 1) * pageSize + 1 : 1}</b> to{' '}
                <b>{pageSize > 0 ? Math.min(safePage * pageSize, totalItems) : totalItems}</b> of{' '}
                <b>{totalItems}</b> flights
              </>
            ) : (
              '0 flights'
            )}
          </div>

          {pageSize > 0 && totalPages > 1 && (
            <div className="pagination-nav">
              <button
                type="button"
                className="btn-page-nav"
                disabled={safePage <= 1}
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                title="Previous Page"
              >
                <ChevronLeft size={16} />
                <span>Previous</span>
              </button>

              <span className="page-index-label">
                Page <b>{safePage}</b> of <b>{totalPages}</b>
              </span>

              <button
                type="button"
                className="btn-page-nav"
                disabled={safePage >= totalPages}
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                title="Next Page"
              >
                <span>Next</span>
                <ChevronRight size={16} />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
