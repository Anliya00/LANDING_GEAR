import { useEffect, useState, useMemo } from 'react';
import { 
  Users, UserCheck, ShieldAlert, Shield, Plus, Search, 
  RotateCcw, Edit2, Key, Unlock, Trash2, ChevronDown, ChevronUp,
  X, Check, Lock, ExternalLink
} from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { usersApi, type UserItem, type RoleMatrixItem } from '@/api/users';
import { useSession } from '@/auth/guards';
import type { Role } from '@/auth/roles';
import './users/UsersPage.css';

// Default fallback role matrix if server hasn't responded yet
const DEFAULT_ROLE_PAGES: Record<Role, string[]> = {
  admin: [
    'Home (/)',
    'Flights Catalog & Telemetry (/flights)',
    'Data Ingestion (/ingestion)',
    'Analysis Dashboard (/dashboard)',
    'Aircraft Configuration (/configuration)',
    'User & Role Management (/users)',
  ],
  engineer: [
    'Home (/)',
    'Flights Catalog & Telemetry (/flights)',
    'Data Ingestion (/ingestion)',
    'Analysis Dashboard (/dashboard)',
    'Aircraft Configuration (/configuration)',
  ],
  operator: [
    'Home (/)',
    'Flights Catalog & Telemetry (/flights)',
    'Data Ingestion (/ingestion)',
    'Analysis Dashboard (/dashboard)',
  ],
  viewer: [
    'Home (/)',
    'Flights Catalog & Telemetry (/flights)',
    'Analysis Dashboard (/dashboard)',
  ],
};

const ALL_ROLES: { code: Role; name: string; desc: string }[] = [
  { code: 'admin', name: 'Administrator', desc: 'Full system management, user administration and data configuration' },
  { code: 'engineer', name: 'Engineer', desc: 'Flight telemetry diagnostics, data ingestion and fleet configuration' },
  { code: 'operator', name: 'Import Operator', desc: 'Flight data ingestion, upload verification and folder registration' },
  { code: 'viewer', name: 'Viewer', desc: 'Read-only access to flights catalog and telemetry analytics' },
];

export default function UsersPage() {
  const { user: currentAuthUser } = useSession();

  const [users, setUsers] = useState<UserItem[]>([]);
  const [roleMatrix, setRoleMatrix] = useState<RoleMatrixItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState('All');

  // Matrix Card Accordion toggle
  const [showMatrix, setShowMatrix] = useState(true);

  // Modals state
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserItem | null>(null);
  const [resetPwdUser, setResetPwdUser] = useState<UserItem | null>(null);

  // Form states for Add User
  const [addUsername, setAddUsername] = useState('');
  const [addDisplayName, setAddDisplayName] = useState('');
  const [addEmail, setAddEmail] = useState('');
  const [addPassword, setAddPassword] = useState('');
  const [addConfirmPassword, setAddConfirmPassword] = useState('');
  const [addRoles, setAddRoles] = useState<Role[]>(['viewer']);
  const [addMustChange, setAddMustChange] = useState(true);
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Form states for Edit User
  const [editDisplayName, setEditDisplayName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editStatus, setEditStatus] = useState<'active' | 'inactive'>('active');
  const [editRoles, setEditRoles] = useState<Role[]>([]);
  const [editMustChange, setEditMustChange] = useState(false);

  // Form states for Reset Password
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [resetMustChange, setResetMustChange] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    setError(null);
    try {
      const [uList, rMatrix] = await Promise.all([
        usersApi.list(),
        usersApi.getRolesMatrix().catch(() => []),
      ]);
      setUsers(uList);
      if (rMatrix && rMatrix.length > 0) {
        setRoleMatrix(rMatrix);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load user accounts.');
    } finally {
      setLoading(false);
    }
  }

  // Derive unique accessible pages from a set of roles
  const getPagesForRoles = (roles: Role[]) => {
    const pagesSet = new Set<string>();
    roles.forEach((r) => {
      const serverDef = roleMatrix.find((m) => m.role_code === r);
      const pages = serverDef ? serverDef.accessible_pages : (DEFAULT_ROLE_PAGES[r] || []);
      pages.forEach((p) => pagesSet.add(p));
    });
    return Array.from(pagesSet);
  };

  // Metrics
  const stats = useMemo(() => {
    const total = users.length;
    const active = users.filter((u) => u.status === 'active' && !u.is_locked).length;
    const locked = users.filter((u) => u.is_locked || u.status === 'inactive').length;
    const admins = users.filter((u) => (u.roles || []).includes('admin')).length;
    return { total, active, locked, admins };
  }, [users]);

  // Filtered users
  const filteredUsers = useMemo(() => {
    return users.filter((u) => {
      if (roleFilter !== 'All' && !(u.roles || []).includes(roleFilter as Role)) {
        return false;
      }
      if (statusFilter !== 'All') {
        if (statusFilter === 'active' && (u.status !== 'active' || u.is_locked)) return false;
        if (statusFilter === 'inactive' && u.status !== 'inactive') return false;
        if (statusFilter === 'locked' && !u.is_locked) return false;
      }
      if (search.trim()) {
        const q = search.toLowerCase();
        const matchesUsername = u.username.toLowerCase().includes(q);
        const matchesName = u.display_name.toLowerCase().includes(q);
        const matchesEmail = (u.email || '').toLowerCase().includes(q);
        if (!matchesUsername && !matchesName && !matchesEmail) return false;
      }
      return true;
    });
  }, [users, roleFilter, statusFilter, search]);

  const handleResetFilters = () => {
    setSearch('');
    setRoleFilter('All');
    setStatusFilter('All');
  };

  // Add User Handlers
  const handleOpenAddModal = () => {
    setAddUsername('');
    setAddDisplayName('');
    setAddEmail('');
    setAddPassword('');
    setAddConfirmPassword('');
    setAddRoles(['viewer']);
    setAddMustChange(true);
    setFormError(null);
    setIsAddModalOpen(true);
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (addPassword !== addConfirmPassword) {
      setFormError('Passwords do not match.');
      return;
    }
    if (addPassword.length < 8) {
      setFormError('Password must be at least 8 characters.');
      return;
    }
    if (addRoles.length === 0) {
      setFormError('Please select at least one role for the user.');
      return;
    }

    setFormSubmitting(true);
    try {
      const created = await usersApi.create({
        username: addUsername.trim(),
        display_name: addDisplayName.trim(),
        email: addEmail.trim() || null,
        password: addPassword,
        roles: addRoles,
        must_change_pwd: addMustChange,
      });
      setUsers((prev) => [...prev, created]);
      setIsAddModalOpen(false);
    } catch (err: any) {
      setFormError(err.message || 'Failed to create user account.');
    } finally {
      setFormSubmitting(false);
    }
  };

  // Edit User Handlers
  const handleOpenEditModal = (u: UserItem) => {
    setEditingUser(u);
    setEditDisplayName(u.display_name);
    setEditEmail(u.email || '');
    setEditStatus(u.status);
    setEditRoles([...u.roles]);
    setEditMustChange(u.must_change_pwd);
    setFormError(null);
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;
    setFormError(null);

    if (editRoles.length === 0) {
      setFormError('Please assign at least one role to the user.');
      return;
    }

    setFormSubmitting(true);
    try {
      const updated = await usersApi.update(editingUser.user_id, {
        display_name: editDisplayName.trim(),
        email: editEmail.trim() || null,
        status: editStatus,
        roles: editRoles,
        must_change_pwd: editMustChange,
      });
      setUsers((prev) => prev.map((u) => (u.user_id === updated.user_id ? updated : u)));
      setEditingUser(null);
    } catch (err: any) {
      setFormError(err.message || 'Failed to update user.');
    } finally {
      setFormSubmitting(false);
    }
  };

  // Reset Password Handlers
  const handleOpenResetModal = (u: UserItem) => {
    setResetPwdUser(u);
    setNewPassword('');
    setConfirmNewPassword('');
    setResetMustChange(true);
    setFormError(null);
  };

  const handleResetPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetPwdUser) return;
    setFormError(null);

    if (newPassword !== confirmNewPassword) {
      setFormError('Passwords do not match.');
      return;
    }
    if (newPassword.length < 8) {
      setFormError('Password must be at least 8 characters long.');
      return;
    }

    setFormSubmitting(true);
    try {
      await usersApi.resetPassword(resetPwdUser.user_id, {
        new_password: newPassword,
        must_change_pwd: resetMustChange,
      });
      alert(`Password for '${resetPwdUser.username}' has been successfully updated.`);
      setResetPwdUser(null);
      loadData();
    } catch (err: any) {
      setFormError(err.message || 'Failed to reset password.');
    } finally {
      setFormSubmitting(false);
    }
  };

  // Unlock User
  const handleUnlockUser = async (u: UserItem) => {
    if (!window.confirm(`Unlock account for '${u.username}' and reset failed login attempts?`)) return;
    try {
      await usersApi.unlock(u.user_id);
      loadData();
    } catch (err: any) {
      alert(err.message || 'Failed to unlock user.');
    }
  };

  // Delete User
  const handleDeleteUser = async (u: UserItem) => {
    if (u.user_id === currentAuthUser?.user_id) {
      alert('You cannot delete your own logged-in administrator account.');
      return;
    }
    if (!window.confirm(`Are you sure you want to permanently delete user '${u.username}'? All active sessions and role mappings will be removed.`)) {
      return;
    }
    try {
      await usersApi.delete(u.user_id);
      setUsers((prev) => prev.filter((item) => item.user_id !== u.user_id));
    } catch (err: any) {
      alert(err.message || 'Failed to delete user.');
    }
  };

  return (
    <div className="users-page">
      {/* 1. Page Header with Banner */}
      <PageHeader
        title="User &amp; Role Administration"
        description="Manage user accounts from the Oracle database, assign roles, and configure page access entitlements."
        banner={true}
      />

      {/* 2. Stat Cards Grid (Identical proportions to IngestionPage & FlightsPage) */}
      <div className="user-stats-grid">
        <div className="user-stat-card">
          <div className="user-stat-header">
            <div className="user-stat-icon-wrap blue">
              <Users size={26} />
            </div>
            <div className="user-stat-info">
              <div className="user-stat-num">{stats.total}</div>
              <div className="user-stat-label">Total Users</div>
            </div>
          </div>
          <div className="user-stat-footer">
            <span>Configured in Oracle DB</span>
          </div>
        </div>

        <div className="user-stat-card">
          <div className="user-stat-header">
            <div className="user-stat-icon-wrap green">
              <UserCheck size={26} />
            </div>
            <div className="user-stat-info">
              <div className="user-stat-num">{stats.active}</div>
              <div className="user-stat-label">Active Accounts</div>
            </div>
          </div>
          <div className="user-stat-footer">
            <span style={{ color: 'var(--engaged)' }}>Eligible to sign in</span>
          </div>
        </div>

        <div className="user-stat-card">
          <div className="user-stat-header">
            <div className="user-stat-icon-wrap amber">
              <ShieldAlert size={26} />
            </div>
            <div className="user-stat-info">
              <div className="user-stat-num">{stats.locked}</div>
              <div className="user-stat-label">Locked / Inactive</div>
            </div>
          </div>
          <div className="user-stat-footer">
            <span style={{ color: stats.locked > 0 ? 'var(--caution)' : 'var(--ink-muted)' }}>
              {stats.locked > 0 ? 'Requires admin attention' : 'No account locks'}
            </span>
          </div>
        </div>

        <div className="user-stat-card">
          <div className="user-stat-header">
            <div className="user-stat-icon-wrap purple">
              <Shield size={26} />
            </div>
            <div className="user-stat-info">
              <div className="user-stat-num">{stats.admins}</div>
              <div className="user-stat-label">Administrators</div>
            </div>
          </div>
          <div className="user-stat-footer">
            <span>Privileged administrative access</span>
          </div>
        </div>
      </div>

      {/* 3. Page Access Matrix Overview Card (Collapsible) */}
      <div className="matrix-card">
        <div className="matrix-header" onClick={() => setShowMatrix(!showMatrix)}>
          <div className="matrix-title-group">
            <Shield size={20} color="var(--accent)" />
            <div>
              <h3>Role-to-Page Access Entitlements</h3>
              <div className="matrix-subtitle">
                System permissions determine which application pages each role is allowed to view and interact with.
              </div>
            </div>
          </div>
          <button type="button" className="btn-modal-close" aria-label="Toggle Matrix">
            {showMatrix ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
          </button>
        </div>

        {showMatrix && (
          <div className="matrix-body">
            <table className="matrix-table">
              <thead>
                <tr>
                  <th style={{ width: '180px' }}>Role</th>
                  <th style={{ width: '280px' }}>Responsibilities</th>
                  <th>Accessible Application Pages</th>
                </tr>
              </thead>
              <tbody>
                {ALL_ROLES.map((r) => {
                  const pages = getPagesForRoles([r.code]);
                  return (
                    <tr key={r.code}>
                      <td>
                        <span className={`role-pill role-${r.code}`}>{r.name}</span>
                      </td>
                      <td style={{ color: 'var(--ink-muted)', fontSize: 'var(--text-xs)' }}>
                        {r.desc}
                      </td>
                      <td>
                        <div className="page-chip-list">
                          {pages.map((p) => {
                            const isAdminPage = p.includes('configuration') || p.includes('users');
                            return (
                              <span key={p} className={`page-chip ${isAdminPage ? 'admin-page' : ''}`}>
                                <Check size={12} color={isAdminPage ? 'var(--accent)' : 'var(--engaged)'} />
                                <span>{p}</span>
                              </span>
                            );
                          })}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Error alert banner */}
      {error && (
        <div style={{ padding: '12px 16px', background: 'var(--warning-soft)', border: '1px solid var(--warning)', borderRadius: '8px', color: 'var(--warning)', fontSize: 'var(--text-sm)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span>{error}</span>
          <button className="btn-secondary" style={{ height: '30px', fontSize: 'var(--text-xs)' }} onClick={loadData}>Retry</button>
        </div>
      )}

      {/* 4. Filter Bar */}
      <div className="user-filters">
        <div className="user-search-box">
          <Search size={18} color="var(--ink-muted)" />
          <input
            type="text"
            placeholder="Search username, display name, email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}>
          <option value="All">Role: All Roles</option>
          <option value="admin">Administrator</option>
          <option value="engineer">Engineer</option>
          <option value="operator">Import Operator</option>
          <option value="viewer">Viewer</option>
        </select>

        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="All">Status: All Statuses</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
          <option value="locked">Locked</option>
        </select>

        <button className="btn-secondary" onClick={handleResetFilters} title="Reset filters" style={{ height: '38px' }}>
          <RotateCcw size={15} />
          <span>Reset</span>
        </button>

        <button className="btn-add-user" onClick={handleOpenAddModal}>
          <Plus size={18} />
          <span>Add User</span>
        </button>
      </div>

      {/* 5. Master Users Table */}
      <div className="user-table-wrap">
        <table className="user-master-table">
          <thead>
            <tr>
              <th style={{ width: '60px', textAlign: 'center' }}>Sl. No.</th>
              <th style={{ width: '220px' }}>User Details</th>
              <th style={{ width: '180px' }}>Email</th>
              <th style={{ width: '160px' }}>Assigned Roles</th>
              <th>Page Access Entitlements</th>
              <th style={{ width: '120px', textAlign: 'center' }}>Status</th>
              <th style={{ width: '150px' }}>Last Login</th>
              <th style={{ width: '140px', textAlign: 'center' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={8} style={{ textAlign: 'center', padding: 'var(--s5)' }}>
                  Loading user records from database...
                </td>
              </tr>
            ) : filteredUsers.length === 0 ? (
              <tr>
                <td colSpan={8} style={{ textAlign: 'center', padding: 'var(--s5)' }}>
                  No users found matching the filter criteria.
                </td>
              </tr>
            ) : (
              filteredUsers.map((u, idx) => {
                const assignedPages = getPagesForRoles(u.roles);
                const isCurrentSelf = u.user_id === currentAuthUser?.user_id;

                return (
                  <tr key={u.user_id} className="user-row">
                    {/* Sl. No. */}
                    <td style={{ textAlign: 'center', color: 'var(--ink-muted)', fontWeight: 600 }}>
                      {idx + 1}
                    </td>

                    {/* Username & Name */}
                    <td>
                      <div className="user-primary-info">
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <strong className="user-username-text">{u.username}</strong>
                          {isCurrentSelf && (
                            <span style={{ fontSize: '11px', background: 'var(--accent-soft)', color: 'var(--accent)', padding: '1px 6px', borderRadius: '4px', fontWeight: 700 }}>
                              You
                            </span>
                          )}
                        </div>
                        <span className="user-display-name">{u.display_name}</span>
                        <span className="user-id-hint">ID: #{u.user_id}</span>
                      </div>
                    </td>

                    {/* Email */}
                    <td style={{ color: u.email ? 'var(--ink)' : 'var(--ink-faint)', fontSize: 'var(--text-sm)' }}>
                      {u.email || '—'}
                    </td>

                    {/* Assigned Roles */}
                    <td>
                      <div className="role-badge-group">
                        {(u.roles || []).map((r) => (
                          <span key={r} className={`role-pill role-${r}`}>
                            {r}
                          </span>
                        ))}
                      </div>
                    </td>

                    {/* Page Access Entitlements */}
                    <td>
                      <div className="page-chip-list">
                        {assignedPages.map((page) => (
                          <span key={page} className="page-chip" style={{ fontSize: '11px' }}>
                            {page.split(' ')[0]}
                          </span>
                        ))}
                      </div>
                    </td>

                    {/* Status */}
                    <td style={{ textAlign: 'center' }}>
                      {u.is_locked ? (
                        <span className="status-pill status-locked" title={`Locked. Try again in ${Math.ceil(u.lock_remaining_seconds / 60)} minutes`}>
                          <Lock size={12} /> Locked
                        </span>
                      ) : u.status === 'active' ? (
                        <span className="status-pill status-active">
                          <Check size={12} /> Active
                        </span>
                      ) : (
                        <span className="status-pill status-inactive">Inactive</span>
                      )}
                    </td>

                    {/* Last Login */}
                    <td style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-muted)' }}>
                      {u.last_login_at ? (
                        <div>
                          <div>{new Date(u.last_login_at).toLocaleDateString()}</div>
                          <div style={{ color: 'var(--ink-faint)' }}>{new Date(u.last_login_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                        </div>
                      ) : (
                        <span>Never logged in</span>
                      )}
                    </td>

                    {/* Actions */}
                    <td style={{ textAlign: 'center' }}>
                      <div className="table-action-btns" style={{ justifyContent: 'center' }}>
                        <button
                          type="button"
                          className="btn-icon-action"
                          title="Edit user details and roles"
                          onClick={() => handleOpenEditModal(u)}
                        >
                          <Edit2 size={15} />
                        </button>

                        <button
                          type="button"
                          className="btn-icon-action"
                          title="Reset user password"
                          onClick={() => handleOpenResetModal(u)}
                        >
                          <Key size={15} />
                        </button>

                        {u.is_locked && (
                          <button
                            type="button"
                            className="btn-icon-action warning"
                            title="Unlock account"
                            onClick={() => handleUnlockUser(u)}
                          >
                            <Unlock size={15} />
                          </button>
                        )}

                        <button
                          type="button"
                          className="btn-icon-action danger"
                          title={isCurrentSelf ? 'Cannot delete your own account' : 'Delete user account'}
                          disabled={isCurrentSelf}
                          style={{ opacity: isCurrentSelf ? 0.35 : 1, cursor: isCurrentSelf ? 'not-allowed' : 'pointer' }}
                          onClick={() => handleDeleteUser(u)}
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* 6. Modal: Create New User */}
      {isAddModalOpen && (
        <div className="modal-overlay">
          <div className="modal-dialog">
            <div className="modal-header">
              <h3>Add New User</h3>
              <button type="button" className="btn-modal-close" onClick={() => setIsAddModalOpen(false)}>
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleCreateSubmit}>
              <div className="modal-body">
                {formError && (
                  <div style={{ padding: '10px 14px', background: 'var(--warning-soft)', border: '1px solid var(--warning)', borderRadius: '6px', color: 'var(--warning)', fontSize: 'var(--text-sm)' }}>
                    {formError}
                  </div>
                )}

                <div className="form-group">
                  <label>Username (Sign-in Identifier) *</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="e.g. jsmith or flight_eng_1"
                    value={addUsername}
                    onChange={(e) => setAddUsername(e.target.value)}
                    required
                    autoFocus
                  />
                </div>

                <div className="form-group">
                  <label>Full Name / Display Name *</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="e.g. John Smith"
                    value={addDisplayName}
                    onChange={(e) => setAddDisplayName(e.target.value)}
                    required
                  />
                </div>

                <div className="form-group">
                  <label>Email Address</label>
                  <input
                    type="email"
                    className="form-input"
                    placeholder="e.g. john.smith@ardc.aero"
                    value={addEmail}
                    onChange={(e) => setAddEmail(e.target.value)}
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div className="form-group">
                    <label>Initial Password *</label>
                    <input
                      type="password"
                      className="form-input"
                      placeholder="Min 8 characters"
                      value={addPassword}
                      onChange={(e) => setAddPassword(e.target.value)}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label>Confirm Password *</label>
                    <input
                      type="password"
                      className="form-input"
                      placeholder="Repeat password"
                      value={addConfirmPassword}
                      onChange={(e) => setAddConfirmPassword(e.target.value)}
                      required
                    />
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '2px' }}>
                  <input
                    type="checkbox"
                    id="mustChangePwdAdd"
                    checked={addMustChange}
                    onChange={(e) => setAddMustChange(e.target.checked)}
                    style={{ accentColor: 'var(--accent)', cursor: 'pointer' }}
                  />
                  <label htmlFor="mustChangePwdAdd" style={{ fontSize: 'var(--text-sm)', cursor: 'pointer', color: 'var(--ink)' }}>
                    Require password change on first login
                  </label>
                </div>

                {/* Role Assignment Selection with Live Page Preview */}
                <div className="form-group" style={{ marginTop: '8px' }}>
                  <label>Assigned Roles &amp; System Permissions *</label>
                  <div className="roles-selection-grid">
                    {ALL_ROLES.map((role) => {
                      const isChecked = addRoles.includes(role.code);
                      return (
                        <div
                          key={role.code}
                          className={`role-checkbox-card ${isChecked ? 'is-checked' : ''}`}
                          onClick={() => {
                            if (isChecked) {
                              setAddRoles(addRoles.filter((r) => r !== role.code));
                            } else {
                              setAddRoles([...addRoles, role.code]);
                            }
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => {}}
                            style={{ accentColor: 'var(--accent)', cursor: 'pointer', marginTop: '2px' }}
                          />
                          <div className="role-card-info">
                            <span className="role-card-title">{role.name}</span>
                            <span className="role-card-desc">{role.desc}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Live Page Access Preview */}
                <div className="page-preview-box">
                  <span className="preview-title">
                    <ExternalLink size={14} /> Live Page Access Preview for this User:
                  </span>
                  <div className="preview-pages-list">
                    {getPagesForRoles(addRoles).map((p) => (
                      <span key={p} className="page-chip">
                        <Check size={12} color="var(--engaged)" /> {p}
                      </span>
                    ))}
                    {addRoles.length === 0 && (
                      <span style={{ color: 'var(--warning)', fontSize: 'var(--text-xs)' }}>
                        No roles selected. User will have no page access.
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="modal-footer">
                <button type="button" className="btn-modal-cancel" onClick={() => setIsAddModalOpen(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn-modal-submit" disabled={formSubmitting}>
                  {formSubmitting ? 'Creating User...' : 'Create User'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 7. Modal: Edit User */}
      {editingUser && (
        <div className="modal-overlay">
          <div className="modal-dialog">
            <div className="modal-header">
              <h3>Edit User: {editingUser.username}</h3>
              <button type="button" className="btn-modal-close" onClick={() => setEditingUser(null)}>
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleEditSubmit}>
              <div className="modal-body">
                {formError && (
                  <div style={{ padding: '10px 14px', background: 'var(--warning-soft)', border: '1px solid var(--warning)', borderRadius: '6px', color: 'var(--warning)', fontSize: 'var(--text-sm)' }}>
                    {formError}
                  </div>
                )}

                <div className="form-group">
                  <label>Display Name *</label>
                  <input
                    type="text"
                    className="form-input"
                    value={editDisplayName}
                    onChange={(e) => setEditDisplayName(e.target.value)}
                    required
                  />
                </div>

                <div className="form-group">
                  <label>Email Address</label>
                  <input
                    type="email"
                    className="form-input"
                    value={editEmail}
                    onChange={(e) => setEditEmail(e.target.value)}
                  />
                </div>

                <div className="form-group">
                  <label>Account Status</label>
                  <select
                    className="form-input"
                    value={editStatus}
                    onChange={(e) => setEditStatus(e.target.value as 'active' | 'inactive')}
                  >
                    <option value="active">Active (Permitted to sign in)</option>
                    <option value="inactive">Inactive (Access suspended)</option>
                  </select>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <input
                    type="checkbox"
                    id="mustChangePwdEdit"
                    checked={editMustChange}
                    onChange={(e) => setEditMustChange(e.target.checked)}
                    style={{ accentColor: 'var(--accent)', cursor: 'pointer' }}
                  />
                  <label htmlFor="mustChangePwdEdit" style={{ fontSize: 'var(--text-sm)', cursor: 'pointer', color: 'var(--ink)' }}>
                    Require password change on next login
                  </label>
                </div>

                {/* Role Assignment Selection */}
                <div className="form-group" style={{ marginTop: '6px' }}>
                  <label>Assigned Roles *</label>
                  <div className="roles-selection-grid">
                    {ALL_ROLES.map((role) => {
                      const isChecked = editRoles.includes(role.code);
                      return (
                        <div
                          key={role.code}
                          className={`role-checkbox-card ${isChecked ? 'is-checked' : ''}`}
                          onClick={() => {
                            if (isChecked) {
                              setEditRoles(editRoles.filter((r) => r !== role.code));
                            } else {
                              setEditRoles([...editRoles, role.code]);
                            }
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => {}}
                            style={{ accentColor: 'var(--accent)', cursor: 'pointer', marginTop: '2px' }}
                          />
                          <div className="role-card-info">
                            <span className="role-card-title">{role.name}</span>
                            <span className="role-card-desc">{role.desc}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Live Page Preview */}
                <div className="page-preview-box">
                  <span className="preview-title">
                    <ExternalLink size={14} /> Resulting Accessible Pages:
                  </span>
                  <div className="preview-pages-list">
                    {getPagesForRoles(editRoles).map((p) => (
                      <span key={p} className="page-chip">
                        <Check size={12} color="var(--engaged)" /> {p}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              <div className="modal-footer">
                <button type="button" className="btn-modal-cancel" onClick={() => setEditingUser(null)}>
                  Cancel
                </button>
                <button type="submit" className="btn-modal-submit" disabled={formSubmitting}>
                  {formSubmitting ? 'Saving Changes...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 8. Modal: Reset Password */}
      {resetPwdUser && (
        <div className="modal-overlay">
          <div className="modal-dialog" style={{ maxWidth: '480px' }}>
            <div className="modal-header">
              <h3>Reset Password: {resetPwdUser.username}</h3>
              <button type="button" className="btn-modal-close" onClick={() => setResetPwdUser(null)}>
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleResetPasswordSubmit}>
              <div className="modal-body">
                <p style={{ margin: 0, fontSize: 'var(--text-sm)', color: 'var(--ink-muted)' }}>
                  Enter a new password for user <b>{resetPwdUser.display_name}</b> ({resetPwdUser.username}). This will terminate all active sessions for this account.
                </p>

                {formError && (
                  <div style={{ padding: '10px 14px', background: 'var(--warning-soft)', border: '1px solid var(--warning)', borderRadius: '6px', color: 'var(--warning)', fontSize: 'var(--text-sm)' }}>
                    {formError}
                  </div>
                )}

                <div className="form-group">
                  <label>New Password *</label>
                  <input
                    type="password"
                    className="form-input"
                    placeholder="Min 8 characters"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    required
                    autoFocus
                  />
                </div>

                <div className="form-group">
                  <label>Confirm New Password *</label>
                  <input
                    type="password"
                    className="form-input"
                    placeholder="Repeat new password"
                    value={confirmNewPassword}
                    onChange={(e) => setConfirmNewPassword(e.target.value)}
                    required
                  />
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <input
                    type="checkbox"
                    id="mustChangePwdReset"
                    checked={resetMustChange}
                    onChange={(e) => setResetMustChange(e.target.checked)}
                    style={{ accentColor: 'var(--accent)', cursor: 'pointer' }}
                  />
                  <label htmlFor="mustChangePwdReset" style={{ fontSize: 'var(--text-sm)', cursor: 'pointer', color: 'var(--ink)' }}>
                    Require user to change password on next sign in
                  </label>
                </div>
              </div>

              <div className="modal-footer">
                <button type="button" className="btn-modal-cancel" onClick={() => setResetPwdUser(null)}>
                  Cancel
                </button>
                <button type="submit" className="btn-modal-submit" disabled={formSubmitting}>
                  {formSubmitting ? 'Updating...' : 'Set Password'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}