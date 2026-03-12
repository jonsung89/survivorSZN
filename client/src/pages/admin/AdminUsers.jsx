import { useState, useEffect, useCallback } from 'react';
import { Search, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { adminAPI } from '../../api';
import Loading from '../../components/Loading';

export default function AdminUsers() {
  const [users, setUsers] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [selectedUser, setSelectedUser] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

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
                        <div className="flex items-center gap-2">
                          <span className="text-fg font-medium">{user.displayName || '—'}</span>
                          {user.isAdmin && (
                            <span className="text-[10px] font-bold text-amber-400 bg-amber-400/10 px-1.5 py-0.5 rounded">ADMIN</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-fg/60 hidden md:table-cell">{user.email || '—'}</td>
                      <td className="px-4 py-3 text-fg/60 hidden lg:table-cell">{user.phone || '—'}</td>
                      <td className="px-4 py-3 text-center text-fg/60">{user.leagueCount}</td>
                      <td className="px-4 py-3 text-fg/40 hidden md:table-cell">
                        {user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleDateString() : '—'}
                      </td>
                    </tr>
                  ))}
                  {users.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-fg/40">No users found</td>
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
                  <h2 className="text-lg font-display font-bold text-fg">
                    {selectedUser.displayName || 'No Name'}
                  </h2>
                  <button onClick={() => setSelectedUser(null)} className="p-1 text-fg/40 hover:text-fg">
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="space-y-4">
                  <InfoRow label="Email" value={selectedUser.email} />
                  <InfoRow label="Phone" value={selectedUser.phone} />
                  <InfoRow label="Firebase UID" value={selectedUser.firebaseUid} mono />
                  <InfoRow label="Admin" value={selectedUser.isAdmin ? 'Yes' : 'No'} />
                  <InfoRow label="Last Login" value={selectedUser.lastLoginAt ? new Date(selectedUser.lastLoginAt).toLocaleString() : 'Never'} />
                  <InfoRow label="Joined" value={new Date(selectedUser.createdAt).toLocaleString()} />

                  {selectedUser.leagues?.length > 0 && (
                    <div>
                      <h3 className="text-sm font-medium text-fg/50 mb-2">Leagues ({selectedUser.leagues.length})</h3>
                      <div className="space-y-2">
                        {selectedUser.leagues.map((l) => (
                          <div key={l.id} className="bg-fg/5 rounded-lg px-3 py-2">
                            <div className="flex items-center justify-between">
                              <span className="text-sm font-medium text-fg">{l.name}</span>
                              <span className="text-xs text-fg/40 uppercase">{l.sportId}</span>
                            </div>
                            <div className="flex items-center gap-3 mt-1 text-xs text-fg/40">
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
      <span className="text-xs text-fg/40 block">{label}</span>
      <span className={`text-sm text-fg ${mono ? 'font-mono text-xs' : ''}`}>{value || '—'}</span>
    </div>
  );
}
