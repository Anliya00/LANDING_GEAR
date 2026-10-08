import { useEffect, useState, useMemo } from 'react';
import { PageHeader } from '@/components/PageHeader';
import { Folder, Clock, AlertTriangle, CheckCircle, RefreshCw, Search } from 'lucide-react';
import './IngestionPage.css';
import { api } from '@/api/client';
import { useSession } from '@/auth/guards';

interface FolderInfo {
  folder_path: string;
  folder_name: string;
  flight_id: string;
  date_str: string;
  aircraft: string;
  file_count: number;
  size_bytes: number;
  status: string;
  error_message: string | null;
}

interface ScanResult {
  folders: FolderInfo[];
}

export default function IngestionPage() {
  const { can } = useSession();
  const isOperator = can('ingest');
  
  const [folders, setFolders] = useState<FolderInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Tab state
  const [activeTab, setActiveTab] = useState<'incoming' | 'history'>('incoming');

  // Filter state
  const [search, setSearch] = useState('');
  const [filterAircraft, setFilterAircraft] = useState('All');
  const [filterStatus, setFilterStatus] = useState('All');

  const [isIngesting, setIsIngesting] = useState(false);
  const [localUploading, setLocalUploading] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetchFolders();
  }, []);

  // Poll every 3 seconds if anything is in a transient state
  useEffect(() => {
    const hasActive = folders.some(f => {
      const s = f.status.toLowerCase();
      return s === 'uploading' || s === 'analysing' || s === 'pending';
    });
    if (!hasActive && localUploading.size === 0) return;

    const timer = setInterval(() => {
      fetchFolders(true);
    }, 3000);
    return () => clearInterval(timer);
  }, [folders, localUploading]);

  async function fetchFolders(silent = false) {
    if (!silent) setLoading(true);
    try {
      const res = await api.get<ScanResult>('/ingestion/folders');
      setFolders(res.folders);
      
      // Clear localUploading if the server officially reports it's Uploading or beyond
      setLocalUploading(prev => {
        const next = new Set(prev);
        res.folders.forEach(f => {
          const s = f.status.toLowerCase();
          if (s !== 'pending' && next.has(f.folder_name)) {
            next.delete(f.folder_name);
          }
        });
        return next;
      });
      
      setError(null);
    } catch (err: any) {
      if (!silent) setError(err.message || 'Failed to scan folders');
    } finally {
      if (!silent) setLoading(false);
    }
  }

  async function handleIngest(folder_name: string) {
    setIsIngesting(true);
    setLocalUploading(prev => new Set(prev).add(folder_name));
    try {
      const res: any = await api.post('/ingestion/start', { folder_name });
      if (res && res.error) {
        alert("Backend error: " + res.error);
        setLocalUploading(prev => {
          const next = new Set(prev);
          next.delete(folder_name);
          return next;
        });
        setIsIngesting(false);
        return;
      }
    } catch (err: any) {
      alert(err.message || 'Failed to start ingestion');
      setLocalUploading(prev => {
        const next = new Set(prev);
        next.delete(folder_name);
        return next;
      });
    } finally {
      setIsIngesting(false);
    }
  }

  const formatSize = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const getStatusBadge = (status: string) => {
    const s = status.toLowerCase();
    let Icon = Clock;
    let className = 'badge-pending';
    
    if (s.includes('complete')) {
      Icon = CheckCircle;
      className = 'badge-complete';
    } else if (s.includes('failed')) {
      Icon = AlertTriangle;
      className = 'badge-failed';
    } else if (s === 'uploading' || s === 'analysing') {
      Icon = RefreshCw;
      className = 'badge-processing';
    }
    
    return (
      <span className={`status-badge ${className}`}>
        <Icon size={14} /> {status}
      </span>
    );
  };

  const displayFolders = useMemo(() => {
    return folders.map(f => {
      if (localUploading.has(f.folder_name)) {
        return { ...f, status: 'Uploading' };
      }
      return f;
    });
  }, [folders, localUploading]);

  const stats = {
    new: displayFolders.filter(f => f.status.toLowerCase() === 'pending').length,
    processing: displayFolders.filter(f => {
      const s = f.status.toLowerCase();
      return s === 'uploading' || s === 'analysing';
    }).length,
    failed: displayFolders.filter(f => f.status.toLowerCase().includes('failed')).length,
    completed: displayFolders.filter(f => f.status.toLowerCase().includes('complete')).length,
  };

  const filteredFolders = useMemo(() => {
    return displayFolders.filter((f) => {
      // Tab filtering
      const s = f.status.toLowerCase();
      const isDone = s.includes('complete') || s.includes('failed');
      if (activeTab === 'incoming' && isDone) return false;
      if (activeTab === 'history' && !isDone) return false;

      // Search filtering
      if (search) {
        const q = search.toLowerCase();
        if (!f.folder_name.toLowerCase().includes(q) && 
            !f.flight_id.toLowerCase().includes(q) && 
            !f.aircraft.toLowerCase().includes(q)) {
          return false;
        }
      }

      // Aircraft filtering
      if (filterAircraft !== 'All' && f.aircraft !== filterAircraft) return false;

      // Status filtering
      if (filterStatus !== 'All') {
        if (s !== filterStatus.toLowerCase()) return false;
      }

      return true;
    });
  }, [displayFolders, activeTab, search, filterAircraft, filterStatus]);

  // Unique aircrafts for the dropdown
  const aircraftOptions = ['All', ...Array.from(new Set(displayFolders.map(f => f.aircraft)))];

  return (
    <div className="ingestion-page">
      <PageHeader
        title="Data Ingestion / Incoming Files"
        description="Manage incoming flight data folders and ingestion status."
        banner={true}
        actions={
          <button className="btn-secondary" onClick={() => fetchFolders()} disabled={loading}>
            <RefreshCw size={18} className={loading ? 'spin' : ''} /> Refresh
          </button>
        }
      />

      <div className="tabs">
        <button 
          className={`tab ${activeTab === 'incoming' ? 'active' : ''}`}
          onClick={() => setActiveTab('incoming')}
        >
          Incoming Files
        </button>
        <button 
          className={`tab ${activeTab === 'history' ? 'active' : ''}`}
          onClick={() => setActiveTab('history')}
        >
          Ingestion History
        </button>
      </div>

      <div className="stats-cards">
        <div className="stat-card">
          <div className="stat-icon" style={{background: 'rgba(59,130,246,0.1)', color: '#3b82f6'}}>
            <Folder size={24} />
          </div>
          <div className="stat-info">
            <h3>{stats.new}</h3>
            <p>New Folders</p>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon" style={{background: 'rgba(245,158,11,0.1)', color: '#f59e0b'}}>
            <Clock size={24} />
          </div>
          <div className="stat-info">
            <h3>{stats.processing + stats.new}</h3>
            <p>Pending Ingestion</p>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon" style={{background: 'rgba(239,68,68,0.1)', color: '#ef4444'}}>
            <AlertTriangle size={24} />
          </div>
          <div className="stat-info">
            <h3>{stats.failed}</h3>
            <p>Failed</p>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon" style={{background: 'rgba(16,185,129,0.1)', color: '#10b981'}}>
            <CheckCircle size={24} />
          </div>
          <div className="stat-info">
            <h3>{stats.completed}</h3>
            <p>Completed (Total)</p>
          </div>
        </div>
      </div>

      <div className="filters">
        <div className="search-box">
          <Search size={18} color="var(--ink-muted)" />
          <input 
            type="text" 
            placeholder="Search folders, flight ID, or aircraft..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select value={filterAircraft} onChange={(e) => setFilterAircraft(e.target.value)}>
          {aircraftOptions.map(opt => <option key={opt} value={opt}>{opt === 'All' ? 'Aircraft: All' : opt}</option>)}
        </select>
        <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
          <option value="All">Status: All</option>
          <option value="Pending">Pending</option>
          <option value="Uploading">Uploading</option>
          <option value="Upload Complete">Upload Complete</option>
          <option value="Upload Failed">Upload Failed</option>
          <option value="Analysing">Analysing</option>
          <option value="Analysis Complete">Analysis Complete</option>
          <option value="Analysis Failed">Analysis Failed</option>
        </select>
        <button 
          className="btn-outline"
          onClick={() => {
            setSearch('');
            setFilterAircraft('All');
            setFilterStatus('All');
          }}
        >
          Reset
        </button>
      </div>

      <div className="data-table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th><input type="checkbox" /></th>
              <th>Folder Name</th>
              <th>Flight ID</th>
              <th>Date</th>
              <th>Aircraft</th>
              <th>File Count</th>
              <th>Size</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={9} style={{textAlign: 'center', padding: 'var(--s5)'}}>Scanning folders...</td></tr>
            ) : error ? (
              <tr><td colSpan={9} style={{textAlign: 'center', padding: 'var(--s5)', color: 'var(--accent-red)'}}>{error}</td></tr>
            ) : filteredFolders.length === 0 ? (
              <tr><td colSpan={9} style={{textAlign: 'center', padding: 'var(--s5)'}}>No folders found matching filters.</td></tr>
            ) : (
              filteredFolders.map((f, i) => (
                <tr key={i}>
                  <td><input type="checkbox" /></td>
                  <td><strong>{f.folder_name}</strong></td>
                  <td>{f.flight_id}</td>
                  <td className="tnum">{f.date_str}</td>
                  <td>{f.aircraft}</td>
                  <td className="tnum">{f.file_count}</td>
                  <td className="tnum">{formatSize(f.size_bytes)}</td>
                  <td>
                    {getStatusBadge(f.status)}
                    {f.error_message && (
                      <div style={{fontSize: '11px', color: 'var(--accent-red)', marginTop: '4px'}}>
                        {f.error_message}
                      </div>
                    )}
                  </td>
                  <td>
                    <div style={{display: 'flex', gap: '8px'}}>
                      {activeTab !== 'history' && (() => {
                        const isThisRowPending = f.status.toLowerCase() === 'pending';
                        const isAnythingProcessing = displayFolders.some(x => 
                          x.status.toLowerCase() === 'uploading' || 
                          x.status.toLowerCase() === 'analysing'
                        );
                        const isGloballyLocked = isIngesting || isAnythingProcessing;
                        
                        return (
                          <button 
                            className="btn-primary-sm" 
                            disabled={!isThisRowPending || !isOperator || isGloballyLocked}
                            onClick={() => handleIngest(f.folder_name)}
                            title={isGloballyLocked ? "Another ingestion is currently in progress" : ""}
                            style={{ 
                              opacity: (!isThisRowPending || !isOperator || isGloballyLocked) ? 0.5 : 1, 
                              cursor: (!isThisRowPending || !isOperator || isGloballyLocked) ? 'not-allowed' : 'pointer' 
                            }}
                          >
                            Ingest
                          </button>
                        );
                      })()}
                      <button className="btn-secondary" style={{height: '34px'}}>View</button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}