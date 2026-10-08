import { useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { aircraftApi, type Aircraft } from '@/api/aircraft';
import { useSession } from '@/auth/guards';
import './ConfigurationPage.css';

export default function ConfigurationPage() {
  const { can, user } = useSession();
  const isConfigurator = can('configure') || (user?.roles || []).includes('admin');
  console.log('Current user roles:', user?.roles, 'isConfigurator:', isConfigurator);
  const [aircrafts, setAircrafts] = useState<Aircraft[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editMass, setEditMass] = useState<string>('');
  const [saving, setSaving] = useState(false);

  const [adding, setAdding] = useState(false);
  const [addNumber, setAddNumber] = useState('');
  const [addMass, setAddMass] = useState('');
  const [addingBusy, setAddingBusy] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    try {
      setAircrafts(await aircraftApi.list());
    } catch (err: any) {
      setError(err.message || 'Failed to load aircrafts');
    } finally {
      setLoading(false);
    }
  }

  function handleEditClick(a: Aircraft) {
    setEditingId(a.aircraft_id);
    setEditMass(a.aircraft_mass_kg !== null ? String(a.aircraft_mass_kg) : '');
  }

  async function handleSaveClick(id: number) {
    setSaving(true);
    try {
      const parsedMass = editMass.trim() === '' ? null : parseFloat(editMass);
      const updated = await aircraftApi.update(id, { aircraft_mass_kg: parsedMass });
      setAircrafts((prev) => prev.map((a) => (a.aircraft_id === id ? updated : a)));
      setEditingId(null);
    } catch (err: any) {
      alert(err.message || 'Failed to update mass');
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteClick(id: number, number: number) {
    if (!window.confirm(`Are you sure you want to delete AC${number}?`)) return;
    try {
      await aircraftApi.delete(id);
      setAircrafts((prev) => prev.filter((a) => a.aircraft_id !== id));
    } catch (err: any) {
      alert(err.message || 'Failed to delete aircraft');
    }
  }

  async function handleAddSubmit(e: React.FormEvent) {
    e.preventDefault();
    setAddingBusy(true);
    try {
      const num = parseInt(addNumber);
      if (isNaN(num)) throw new Error('Aircraft number must be an integer.');
      
      const parsedMass = addMass.trim() === '' ? null : parseFloat(addMass);
      const created = await aircraftApi.create({ aircraft_number: num, aircraft_mass_kg: parsedMass });
      setAircrafts((prev) => [...prev, created].sort((a, b) => a.aircraft_number - b.aircraft_number));
      setAdding(false);
      setAddNumber('');
      setAddMass('');
    } catch (err: any) {
      alert(err.message || 'Failed to add aircraft');
    } finally {
      setAddingBusy(false);
    }
  }

  function handleCancelEdit() {
    setEditingId(null);
  }

  if (loading) return <div style={{padding: 'var(--s5)'}}>Loading configuration...</div>;
  if (error) return <div style={{ color: 'red', padding: 'var(--s5)' }}>Error: {error}</div>;

  return (
    <div className="config-page">
      <PageHeader
        title="Aircraft Configuration"
        description="Manage the fleet and register aircraft masses required for landing computations."
        banner={true}
      />

      <div className="config-actions">
        {!adding ? (
          <button 
            className="btn-secondary" 
            onClick={() => setAdding(true)}
            disabled={!isConfigurator}
            title={!isConfigurator ? "Requires configure permission" : "Add new aircraft"}
            style={{ opacity: !isConfigurator ? 0.5 : 1, cursor: !isConfigurator ? 'not-allowed' : 'pointer' }}
          >
            <Plus size={18} /> Add Aircraft
          </button>
        ) : (
          <form onSubmit={handleAddSubmit} style={{display: 'flex', gap: 'var(--s3)', alignItems: 'center', background: 'var(--bg-raised)', padding: 'var(--s3)', borderRadius: '8px', border: '1px solid var(--rule)'}}>
            <strong>New Aircraft:</strong>
            <input 
              type="number" 
              className="mass-input" 
              placeholder="Number (e.g. 6)" 
              value={addNumber} 
              onChange={e => setAddNumber(e.target.value)} 
              required 
              autoFocus 
            />
            <input 
              type="number" 
              className="mass-input" 
              placeholder="Mass in kg" 
              value={addMass} 
              onChange={e => setAddMass(e.target.value)} 
            />
            <button type="submit" className="btn-primary-sm" disabled={addingBusy || !isConfigurator}>
              {addingBusy ? 'Saving...' : 'Save'}
            </button>
            <button type="button" className="btn-secondary" style={{height: '34px'}} onClick={() => setAdding(false)}>
              Cancel
            </button>
          </form>
        )}
      </div>

      <div className="data-table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Aircraft</th>
              <th>Registered Mass (kg)</th>
              <th>Flights</th>
              <th>Last Modified</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {aircrafts.map((a) => {
              const isEditing = editingId === a.aircraft_id;
              
              return (
                <tr key={a.aircraft_id}>
                  <td>
                    <strong>AC{a.aircraft_number}</strong>
                  </td>
                  <td className="tnum">
                    {isEditing ? (
                      <input 
                        type="number" 
                        className="mass-input"
                        value={editMass} 
                        onChange={(e) => setEditMass(e.target.value)} 
                        autoFocus
                      />
                    ) : (
                      a.aircraft_mass_kg ? a.aircraft_mass_kg.toLocaleString() : <span style={{color: 'var(--ink-faint)'}}>Not set</span>
                    )}
                  </td>
                  <td className="tnum">{a.flight_count}</td>
                  <td>
                    {a.modified ? new Date(a.modified).toLocaleDateString() : 'Never'}
                  </td>
                  <td>
                    {isEditing ? (
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button className="btn-primary-sm" onClick={() => handleSaveClick(a.aircraft_id)} disabled={saving || !isConfigurator}>
                          {saving ? 'Saving...' : 'Save'}
                        </button>
                        <button className="btn-secondary" style={{height: '34px'}} onClick={handleCancelEdit}>
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button 
                          className="btn-secondary" 
                          style={{height: '34px'}} 
                          onClick={() => handleEditClick(a)}
                          disabled={!isConfigurator}
                          title={!isConfigurator ? "Requires configure permission" : "Edit aircraft mass"}
                        >
                          Edit
                        </button>
                        <button 
                          className="btn-danger" 
                          onClick={() => handleDeleteClick(a.aircraft_id, a.aircraft_number)}
                          title={!isConfigurator ? "Requires configure permission" : (a.flight_count > 0 ? "Cannot delete aircraft with existing flights" : "Delete aircraft")}
                          disabled={!isConfigurator || a.flight_count > 0}
                          style={{ opacity: (!isConfigurator || a.flight_count > 0) ? 0.5 : 1, cursor: (!isConfigurator || a.flight_count > 0) ? 'not-allowed' : 'pointer' }}
                        >
                          Delete
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
            {aircrafts.length === 0 && (
              <tr>
                <td colSpan={5} style={{ textAlign: 'center', padding: 'var(--s5)' }}>
                  No aircraft configured yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}