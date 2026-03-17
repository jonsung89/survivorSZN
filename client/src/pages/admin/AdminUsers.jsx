import { useState, useEffect, useCallback } from 'react';
import { Search, ChevronLeft, ChevronRight, X, Shield, ShieldOff, UserX, UserCheck } from 'lucide-react';
import { adminAPI } from '../../api';
import { useToast } from '../../components/Toast';
import Loading from '../../components/Loading';

export default function AdminUsers() {
  const { showToast } = useToast();
  const [users, setUsers] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [selectedUser, setSelectedUser] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(null);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const data = await adminAPI.getUsers({ search, page, limit: 25 });
      setUsers(data.users);
      setTotal(data.total);
      setTotalPages(data.totalPages);
    } catch (err) {
      console.error('Failed to fetch users:', err);
    } finally {
      setLoading(false);
    }
  }, [search, page]);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  // Debounce search
  const [searchInput, setSearchInput] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const handleUserClick = async (userId) => {
    setDetailLoading(true);
    try {
      const data = await adminAPI.getUser(userId);
      setSelectedUser(data);
    } catch (err) {
      console.error('Failed to fetch user:', err);
    } finally {
      setDetailLoading(false);
    }
  };

  const getUserName = (user) => {
    if (user.firstName && user.lastName) return `${user.firstName} ${user.lastName}`;
    if (user.firstName) return user.firstName;
    return user.displayName || '—';
  };

  const formatDateTime = (dateStr) => {
    if (!dateStr) return '—';
    const d = new Date(dateStr);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) +
      ' ' + d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  };

  const handleToggleAdmin = async () => {
    if (!selectedUser) return;
    setActionLoading('admin');
    try {
      const result = await adminAPI.toggleUserAdmin(selectedUser.id);
      setSelectedUser(prev => ({ ...prev, isAdmin: result.isAdmin }));
      showToast(result.isAdmin ? 'User promoted to admin' : 'Admin role removed', 'success');
      fetchUsers();
    } catch (err) {
      showToast(err.message || 'Failed to toggle admin', 'error');
    } finally {
      setActionLoading(null);
    }
  };

  const handleToggleDisabled = async () => {
    if (!selectedUser) return;
    setActionLoading('disabled');
    try {
      const result = await adminAPI.toggleUserDisabled(selectedUser.id);
      setSelectedUser(prev => ({ ...prev, isDisabled: result.isDisabled }));
      showToast(result.isDisabled ? 'Account disabled' : 'Account enabled', 'success');
      fetchUsers();
    } catch (err) {
      showToast(err.message || 'Failed to toggle account', 'error');
    } finally {
      setActionLoading(null);
    }
  };

  const getInitials = (user) => {
    if (user.firstName && user.lastName) return (user.firstName[0] + user.lastName[0]).toUpperCase();
    if (user.displayName) return user.displayName.slice(0, 2).toUpperCase();
    return '?';
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-display font-bold text-fg">Users</h1>
        <span className="text-sm text-fg/40">{total} total</span>
      </div>

      {/* Search */}
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-fg/30" />
        <input
          type="text"
          placeholder="Search by name, email, or phone..."
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          className="w-full pl-10 pr-4 py-2.5 bg-surface border border-fg/10 rounded-lg text-fg text-sm placeholder:text-fg/30 focus:outline-none focus:border-fg/20"
        />
      </div>

      {loading ? <Loading /> : (
        <>
          {/* Table */}
          <div className="bg-surface rounded-xl border border-fg/5 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-fg/10">
                    <th className="text-left px-4 py-3 text-fg/50 font-medium">Name</th>
                    <th className="text-left px-4 py-3 text-fg/50 font-medium hidden md:table-cell">Email</th>
                    <th className="text-left px-4 py-3 text-fg/50 font-medium hidden lg:table-cell">Phone</th>
                    <th className="text-center px-4 py-3 text-fg/50 font-medium">Leagues</th>
                    <th className="text-left px-4 py-3 text-fg/50 font-medium hidden md:table-cell">Last Login</th>
                    <th className="text-left px-4 py-3 text-fg/50 font-medium hidden lg:table-cell">Created</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((user) => (
                    <tr
                      key={user.id}
                      onClick={() => handleUserClick(user.id)}
                      className="border-b border-fg/5 last:border-0 hover:bg-fg/5 cursor-pointer transition-colors"
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          {user.profileImageUrl ? (
                            <img src={user.profileImageUrl} alt="" className="w-7 h-7 rounded-full object-cover flex-shrink-0" />
                          ) : (
                            <div className="w-7 h-7 rounded-full bg-fg/10 flex items-center justify-center text-fg/50 text-sm font-medium flex-shrink-0">
                              {getInitials(user)}
                            </div>
                          )}
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-fg font-medium truncate">{getUserName(user)}</span>
                              {user.isAdmin && (
                                <span className="text-[10px] font-bold text-amber-400 bg-amber-400/10 px-1.5 py-0.5 rounded flex-shrink-0">ADMIN</span>
                              )}
                            </div>
                            {user.displayName && user.firstName && (
                              <span className="text-sm text-fg/40 truncate block">@{user.displayName}</span>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-fg/60 hidden md:table-cell">{user.email || '—'}</td>
                      <td className="px-4 py-3 text-fg/60 hidden lg:table-cell">{user.phone || '—'}</td>
                      <td className="px-4 py-3 text-center text-fg/60">{user.leagueCount}</td>
                      <td className="px-4 py-3 text-fg/40 hidden md:table-cell">
                        {formatDateTime(user.lastLoginAt)}
                      </td>
                      <td className="px-4 py-3 text-fg/40 hidden lg:table-cell">
                        {user.createdAt ? new Date(user.createdAt).toLocaleDateString() : '—'}
                      </td>
                    </tr>
                  ))}
                  {users.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-fg/40">No users found</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-4 mt-4">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="p-2 rounded-lg bg-fg/5 text-fg/50 disabled:opacity-20"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-sm text-fg/50">{page} of {totalPages}</span>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="p-2 rounded-lg bg-fg/5 text-fg/50 disabled:opacity-20"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </>
      )}

      {/* User detail slide-over */}
      {selectedUser && (
        <div className="fixed inset-0 z-50 flex justify-end" onClick={() => setSelectedUser(null)}>
          <div className="absolute inset-0 bg-black/50" />
          <div
            className="relative w-full max-w-md bg-surface border-l border-fg/10 overflow-y-auto animate-in"
            onClick={(e) => e.stopPropagation()}
          >
            {detailLoading ? <Loading /> : (
              <div className="p-6">
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-3">
                    {selectedUser.profileImageUrl ? (
                      <img src={selectedUser.profileImageUrl} alt="" className="w-12 h-12 rounded-full object-cover" />
                    ) : (
                      <div className="w-12 h-12 rounded-full bg-fg/10 flex items-center justify-center text-fg/50 text-lg font-medium">
                        {getInitials(selectedUser)}
                      </div>
                    )}
                    <div>
                      <h2 className="text-lg font-display font-bold text-fg">
                        {getUserName(selectedUser)}
                      </h2>
                      {selectedUser.displayName && selectedUser.firstName && (
                        <span className="text-sm text-fg/40">@{selectedUser.displayName}</span>
                      )}
                    </div>
                  </div>
                  <button onClick={() => setSelectedUser(null)} className="p-1 text-fg/40 hover:text-fg">
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="space-y-4">
                  {selectedUser.firstName && <InfoRow label="First Name" value={selectedUser.firstName} />}
                  {selectedUser.lastName && <InfoRow label="Last Name" value={selectedUser.lastName} />}
                  <InfoRow label="Display Name" value={selectedUser.displayName} />
                  <InfoRow label="Email" value={selectedUser.email} />
                  <InfoRow label="Phone" value={selectedUser.phone} />
                  <InfoRow label="Firebase UID" value={selectedUser.firebaseUid} mono />
                  <InfoRow label="Admin" value={selectedUser.isAdmin ? 'Yes' : 'No'} />
                  <InfoRow label="Last Login" value={formatDateTime(selectedUser.lastLoginAt)} />
                  <InfoRow label="Created" value={formatDateTime(selectedUser.createdAt)} />

                  {selectedUser.leagues?.length > 0 && (
                    <div>
                      <h3 className="text-sm font-medium text-fg/50 mb-2">Leagues ({selectedUser.leagues.length})</h3>
                      <div className="space-y-2">
                        {selectedUser.leagues.map((l) => (
                          <div key={l.id} className="bg-fg/5 rounded-lg px-3 py-2">
                            <div className="flex items-center justify-between">
                              <span className="text-sm font-medium text-fg">{l.name}</span>
                              <span className="text-sm text-fg/40 uppercase">{l.sportId}</span>
                            </div>
                            <div className="flex items-center gap-3 mt-1 text-sm text-fg/40">
                              <span>{l.isCommissioner ? 'Commissioner' : 'Member'}</span>
                              <span>Strikes: {l.strikes}</span>
                              <span className={l.memberStatus === 'active' ? 'text-emerald-400' : 'text-red-400'}>
                                {l.memberStatus}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Actions */}
                  <div className="pt-4 mt-4 border-t border-fg/10 space-y-2">
                    <h3 className="text-sm font-medium text-fg/50 mb-2">Actions</h3>
                    <button
                      onClick={handleToggleAdmin}
                      disabled={actionLoading === 'admin'}
                      className="flex items-center gap-2 w-full px-3 py-2 text-sm rounded-lg bg-fg/5 text-fg/60 hover:text-fg hover:bg-fg/10 transition-colors disabled:opacity-50"
                    >
                      {selectedUser.isAdmin ? <ShieldOff className="w-4 h-4" /> : <Shield className="w-4 h-4" />}
                      {actionLoading === 'admin' ? 'Updating...' : selectedUser.isAdmin ? 'Remove Admin' : 'Make Admin'}
                    </button>
                    <button
                      onClick={handleToggleDisabled}
                      disabled={actionLoading === 'disabled'}
                      className={`flex items-center gap-2 w-full px-3 py-2 text-sm rounded-lg transition-colors disabled:opacity-50 ${
                        selectedUser.isDisabled
                          ? 'bg-fg/5 text-emerald-400 hover:bg-emerald-400/10'
                          : 'bg-fg/5 text-red-400 hover:bg-red-400/10'
                      }`}
                    >
                      {selectedUser.isDisabled ? <UserCheck className="w-4 h-4" /> : <UserX className="w-4 h-4" />}
                      {actionLoading === 'disabled' ? 'Updating...' : selectedUser.isDisabled ? 'Enable Account' : 'Disable Account'}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function InfoRow({ label, value, mono }) {
  return (
    <div>
      <span className="text-sm text-fg/40 block">{label}</span>
      <span className={`text-sm text-fg ${mono ? 'font-mono text-sm' : ''}`}>{value || '—'}</span>
    </div>
  );
}
