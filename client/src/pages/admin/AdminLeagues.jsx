import { useState, useEffect, useCallback } from 'react';
import { Search, ChevronLeft, ChevronRight, X, Trash2 } from 'lucide-react';
import { adminAPI } from '../../api';
import { useToast } from '../../components/Toast';
import Loading from '../../components/Loading';

export default function AdminLeagues() {
  const { showToast } = useToast();
  const [leagues, setLeagues] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [selectedLeague, setSelectedLeague] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const fetchLeagues = useCallback(async () => {
    setLoading(true);
    try {
      const data = await adminAPI.getLeagues({ search, page, limit: 25 });
      setLeagues(data.leagues);
      setTotal(data.total);
      setTotalPages(data.totalPages);
    } catch (err) {
      console.error('Failed to fetch leagues:', err);
    } finally {
      setLoading(false);
    }
  }, [search, page]);

  useEffect(() => { fetchLeagues(); }, [fetchLeagues]);

  const [searchInput, setSearchInput] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const handleLeagueClick = async (leagueId) => {
    setDetailLoading(true);
    setConfirmDelete(false);
    try {
      const data = await adminAPI.getLeague(leagueId);
      setSelectedLeague(data);
    } catch (err) {
      console.error('Failed to fetch league:', err);
    } finally {
      setDetailLoading(false);
    }
  };

  const handleDeleteLeague = async () => {
    if (!selectedLeague) return;
    setDeleting(true);
    try {
      await adminAPI.deleteLeague(selectedLeague.id);
      showToast(`Deleted league "${selectedLeague.name}"`, 'success');
      setSelectedLeague(null);
      setConfirmDelete(false);
      fetchLeagues();
    } catch (err) {
      console.error('Failed to delete league:', err);
      showToast('Failed to delete league', 'error');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-display font-bold text-fg">Leagues</h1>
        <span className="text-sm text-fg/40">{total} total</span>
      </div>

      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-fg/30" />
        <input
          type="text"
          placeholder="Search by league name..."
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          className="w-full pl-10 pr-4 py-2.5 bg-surface border border-fg/10 rounded-lg text-fg text-sm placeholder:text-fg/30 focus:outline-none focus:border-fg/20"
        />
      </div>

      {loading ? <Loading /> : (
        <>
          <div className="bg-surface rounded-xl border border-fg/5 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-fg/10">
                    <th className="text-left px-4 py-3 text-fg/50 font-medium">Name</th>
                    <th className="text-left px-4 py-3 text-fg/50 font-medium hidden md:table-cell">Sport</th>
                    <th className="text-center px-4 py-3 text-fg/50 font-medium">Members</th>
                    <th className="text-left px-4 py-3 text-fg/50 font-medium hidden md:table-cell">Commissioner</th>
                    <th className="text-left px-4 py-3 text-fg/50 font-medium hidden lg:table-cell">Status</th>
                    <th className="text-left px-4 py-3 text-fg/50 font-medium hidden lg:table-cell">Created</th>
                  </tr>
                </thead>
                <tbody>
                  {leagues.map((league) => (
                    <tr
                      key={league.id}
                      onClick={() => handleLeagueClick(league.id)}
                      className="border-b border-fg/5 last:border-0 hover:bg-fg/5 cursor-pointer transition-colors"
                    >
                      <td className="px-4 py-3 text-fg font-medium">{league.name}</td>
                      <td className="px-4 py-3 text-fg/60 uppercase hidden md:table-cell">{league.sportId}</td>
                      <td className="px-4 py-3 text-center text-fg/60">{league.memberCount}</td>
                      <td className="px-4 py-3 text-fg/60 hidden md:table-cell">{league.commissionerName || '—'}</td>
                      <td className="px-4 py-3 hidden lg:table-cell">
                        <span className={`text-xs font-medium px-2 py-0.5 rounded ${
                          league.status === 'active' ? 'text-emerald-400 bg-emerald-400/10' : 'text-fg/40 bg-fg/5'
                        }`}>
                          {league.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-fg/40 hidden lg:table-cell">
                        {new Date(league.createdAt).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                  {leagues.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-fg/40">No leagues found</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

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

      {/* League detail slide-over */}
      {selectedLeague && (
        <div className="fixed inset-0 z-50 flex justify-end" onClick={() => setSelectedLeague(null)}>
          <div className="absolute inset-0 bg-black/50" />
          <div
            className="relative w-full max-w-md bg-surface border-l border-fg/10 overflow-y-auto animate-in"
            onClick={(e) => e.stopPropagation()}
          >
            {detailLoading ? <Loading /> : (
              <div className="p-6">
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-lg font-display font-bold text-fg">{selectedLeague.name}</h2>
                  <button onClick={() => setSelectedLeague(null)} className="p-1 text-fg/40 hover:text-fg">
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="space-y-4">
                  <InfoRow label="Sport" value={selectedLeague.sportId?.toUpperCase()} />
                  <InfoRow label="Status" value={selectedLeague.status} />
                  <InfoRow label="Season" value={selectedLeague.season} />
                  <InfoRow label="Commissioner" value={selectedLeague.commissionerName} />
                  <InfoRow label="Max Strikes" value={selectedLeague.maxStrikes} />
                  <InfoRow label="Start Week" value={selectedLeague.startWeek} />
                  <InfoRow label="Created" value={new Date(selectedLeague.createdAt).toLocaleString()} />

                  {selectedLeague.members?.length > 0 && (
                    <div>
                      <h3 className="text-sm font-medium text-fg/50 mb-2">
                        Members ({selectedLeague.members.length})
                      </h3>
                      <div className="space-y-2">
                        {selectedLeague.members.map((m) => (
                          <div key={m.id} className="bg-fg/5 rounded-lg px-3 py-2 flex items-center justify-between">
                            <div>
                              <span className="text-sm font-medium text-fg">{m.displayName || '—'}</span>
                              {m.email && <span className="text-xs text-fg/40 ml-2">{m.email}</span>}
                            </div>
                            <div className="flex items-center gap-2 text-xs text-fg/40">
                              <span>Strikes: {m.strikes}</span>
                              <span className={m.status === 'active' ? 'text-emerald-400' : 'text-red-400'}>
                                {m.status}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Delete league */}
                  <div className="pt-4 mt-4 border-t border-fg/10">
                    {!confirmDelete ? (
                      <button
                        onClick={() => setConfirmDelete(true)}
                        className="flex items-center gap-2 text-sm text-red-400 hover:text-red-300 transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                        Delete League
                      </button>
                    ) : (
                      <div className="space-y-2">
                        <p className="text-sm text-red-400">
                          Delete "{selectedLeague.name}" and all its data? This cannot be undone.
                        </p>
                        <div className="flex gap-2">
                          <button
                            onClick={handleDeleteLeague}
                            disabled={deleting}
                            className="px-3 py-1.5 text-sm font-medium bg-red-500 text-white rounded-lg hover:bg-red-600 disabled:opacity-50"
                          >
                            {deleting ? 'Deleting...' : 'Confirm Delete'}
                          </button>
                          <button
                            onClick={() => setConfirmDelete(false)}
                            disabled={deleting}
                            className="px-3 py-1.5 text-sm text-fg/50 hover:text-fg"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}
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

function InfoRow({ label, value }) {
  return (
    <div>
      <span className="text-xs text-fg/40 block">{label}</span>
      <span className="text-sm text-fg">{value ?? '—'}</span>
    </div>
  );
}
