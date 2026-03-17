import { useState, useEffect, useCallback } from 'react';
import {
  Search, ChevronLeft, ChevronRight, ChevronUp, ChevronDown, X, Shield, ShieldOff,
  UserX, UserCheck, Eye, Zap, MessageSquare, ArrowLeft, Monitor, Smartphone, Tablet,
  LogIn,
} from 'lucide-react';
import { adminAPI } from '../../api';
import { useToast } from '../../components/Toast';
import Loading from '../../components/Loading';

const COLUMNS = [
  { key: 'name', label: 'Name', align: 'left', hiddenClass: '' },
  { key: 'email', label: 'Email', align: 'left', hiddenClass: 'hidden md:table-cell' },
  { key: 'phone', label: 'Phone', align: 'left', hiddenClass: 'hidden lg:table-cell', sortable: false },
  { key: 'leagues', label: 'Leagues', align: 'center', hiddenClass: '' },
  { key: 'last_login_at', label: 'Last Login', align: 'left', hiddenClass: 'hidden md:table-cell' },
  { key: 'created_at', label: 'Created', align: 'left', hiddenClass: 'hidden lg:table-cell' },
];

const ACTIVITY_TYPE_CONFIG = {
  pageview: { icon: Eye, label: 'Page View', color: 'text-blue-400' },
  event: { icon: Zap, label: 'Event', color: 'text-amber-400' },
  chat: { icon: MessageSquare, label: 'Chat', color: 'text-emerald-400' },
  login: { icon: LogIn, label: 'Login', color: 'text-purple-400' },
};

const ACTIVITY_FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'pageview', label: 'Page Views' },
  { key: 'event', label: 'Events' },
  { key: 'chat', label: 'Chat' },
  { key: 'login', label: 'Logins' },
];

function formatEventName(name) {
  if (!name) return '—';
  return name.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function timeAgo(dateStr) {
  const now = new Date();
  const date = new Date(dateStr);
  const seconds = Math.floor((now - date) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function DeviceIcon({ type }) {
  if (type === 'mobile') return <Smartphone className="w-3.5 h-3.5 text-fg/30" />;
  if (type === 'tablet') return <Tablet className="w-3.5 h-3.5 text-fg/30" />;
  if (type === 'desktop') return <Monitor className="w-3.5 h-3.5 text-fg/30" />;
  return null;
}

function ActivityDescription({ activity }) {
  const { type, description } = activity;
  if (type === 'pageview') return <span className="text-fg/70">{description || '—'}</span>;
  if (type === 'event') return <span className="text-fg/70">{formatEventName(description)}</span>;
  if (type === 'chat') return <span className="text-fg/70 italic">{description || '—'}</span>;
  return <span className="text-fg/70">{description}</span>;
}

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
  const [sortBy, setSortBy] = useState('last_login_at');
  const [sortOrder, setSortOrder] = useState('desc');

  // Full activity view state
  const [showFullActivity, setShowFullActivity] = useState(false);
  const [activityFilter, setActivityFilter] = useState('all');
  const [activityPage, setActivityPage] = useState(1);
  const [activityData, setActivityData] = useState(null);
  const [activityLoading, setActivityLoading] = useState(false);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const data = await adminAPI.getUsers({ search, page, limit: 25, sort: sortBy, order: sortOrder });
      setUsers(data.users);
      setTotal(data.total);
      setTotalPages(data.totalPages);
    } catch (err) {
      console.error('Failed to fetch users:', err);
    } finally {
      setLoading(false);
    }
  }, [search, page, sortBy, sortOrder]);

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

  // Fetch full activity when filter/page changes
  useEffect(() => {
    if (!showFullActivity || !selectedUser) return;
    const fetchActivity = async () => {
      setActivityLoading(true);
      try {
        const data = await adminAPI.getUserActivity(selectedUser.id, {
          page: activityPage,
          limit: 25,
          type: activityFilter,
        });
        setActivityData(data);
      } catch (err) {
        console.error('Failed to fetch activity:', err);
      } finally {
        setActivityLoading(false);
      }
    };
    fetchActivity();
  }, [showFullActivity, selectedUser, activityFilter, activityPage]);

  const handleSort = (columnKey) => {
    if (sortBy === columnKey) {
      setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(columnKey);
      setSortOrder(columnKey === 'name' ? 'asc' : 'desc');
    }
    setPage(1);
  };

  const handleUserClick = async (userId) => {
    setDetailLoading(true);
    setShowFullActivity(false);
    setActivityFilter('all');
    setActivityPage(1);
    setActivityData(null);
    try {
      const data = await adminAPI.getUser(userId);
      setSelectedUser(data);
    } catch (err) {
      console.error('Failed to fetch user:', err);
    } finally {
      setDetailLoading(false);
    }
  };

  const handleCloseSlideOver = () => {
    setSelectedUser(null);
    setShowFullActivity(false);
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
                    {COLUMNS.map((col) => {
                      const isSortable = col.sortable !== false;
                      const isActive = sortBy === col.key;
                      return (
                        <th
                          key={col.key}
                          className={`${col.align === 'center' ? 'text-center' : 'text-left'} px-4 py-3 font-medium ${col.hiddenClass} ${
                            isSortable ? 'cursor-pointer select-none hover:text-fg/70 transition-colors' : ''
                          } ${isActive ? 'text-fg/80' : 'text-fg/50'}`}
                          onClick={() => isSortable && handleSort(col.key)}
                        >
                          <span className={`inline-flex items-center gap-1 ${col.align === 'center' ? 'justify-center' : ''}`}>
                            {col.label}
                            {isSortable && isActive && (
                              sortOrder === 'asc'
                                ? <ChevronUp className="w-3.5 h-3.5" />
                                : <ChevronDown className="w-3.5 h-3.5" />
                            )}
                          </span>
                        </th>
                      );
                    })}
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
        <div className="fixed inset-0 z-50 flex justify-end" onClick={handleCloseSlideOver}>
          <div className="absolute inset-0 bg-black/50" />
          <div
            className={`relative bg-surface border-l border-fg/10 overflow-y-auto animate-in ${
              showFullActivity ? 'w-full max-w-2xl' : 'w-full max-w-md'
            }`}
            onClick={(e) => e.stopPropagation()}
          >
            {detailLoading ? <Loading /> : showFullActivity ? (
              /* Full Activity View */
              <div className="p-6">
                <div className="flex items-center gap-3 mb-6">
                  <button
                    onClick={() => setShowFullActivity(false)}
                    className="p-1 text-fg/40 hover:text-fg transition-colors"
                  >
                    <ArrowLeft className="w-5 h-5" />
                  </button>
                  <div className="flex-1">
                    <h2 className="text-lg font-display font-bold text-fg">Activity Log</h2>
                    <p className="text-sm text-fg/40">{getUserName(selectedUser)}</p>
                  </div>
                  <button onClick={handleCloseSlideOver} className="p-1 text-fg/40 hover:text-fg">
                    <X className="w-5 h-5" />
                  </button>
                </div>

                {/* Filter tabs */}
                <div className="flex gap-1 mb-4">
                  {ACTIVITY_FILTERS.map(f => (
                    <button
                      key={f.key}
                      onClick={() => { setActivityFilter(f.key); setActivityPage(1); }}
                      className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${
                        activityFilter === f.key
                          ? 'bg-fg/15 text-fg'
                          : 'bg-fg/5 text-fg/40 hover:bg-fg/10 hover:text-fg/60'
                      }`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>

                {activityLoading ? <Loading /> : (
                  <>
                    {/* Activity table */}
                    <div className="bg-fg/3 rounded-xl border border-fg/5 overflow-hidden">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-fg/10">
                            <th className="text-left px-4 py-2.5 text-fg/50 font-medium w-24">Type</th>
                            <th className="text-left px-4 py-2.5 text-fg/50 font-medium">Description</th>
                            <th className="text-center px-4 py-2.5 text-fg/50 font-medium w-16 hidden sm:table-cell">Device</th>
                            <th className="text-right px-4 py-2.5 text-fg/50 font-medium w-44">Date & Time</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(activityData?.activities || []).map((a, i) => {
                            const config = ACTIVITY_TYPE_CONFIG[a.type] || ACTIVITY_TYPE_CONFIG.event;
                            const Icon = config.icon;
                            return (
                              <tr key={i} className="border-b border-fg/5 last:border-0">
                                <td className="px-4 py-2.5">
                                  <span className={`inline-flex items-center gap-1.5 text-sm ${config.color}`}>
                                    <Icon className="w-3.5 h-3.5" />
                                    {config.label}
                                  </span>
                                </td>
                                <td className="px-4 py-2.5">
                                  <ActivityDescription activity={a} />
                                </td>
                                <td className="px-4 py-2.5 text-center hidden sm:table-cell">
                                  <DeviceIcon type={a.deviceType} />
                                </td>
                                <td className="px-4 py-2.5 text-right text-fg/40">
                                  {formatDateTime(a.createdAt)}
                                </td>
                              </tr>
                            );
                          })}
                          {(!activityData?.activities || activityData.activities.length === 0) && (
                            <tr>
                              <td colSpan={4} className="px-4 py-8 text-center text-fg/40">No activity found</td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>

                    {/* Activity pagination */}
                    {activityData && activityData.totalPages > 1 && (
                      <div className="flex items-center justify-between mt-4">
                        <span className="text-sm text-fg/40">{activityData.total} total</span>
                        <div className="flex items-center gap-4">
                          <button
                            onClick={() => setActivityPage(p => Math.max(1, p - 1))}
                            disabled={activityPage === 1}
                            className="p-2 rounded-lg bg-fg/5 text-fg/50 disabled:opacity-20"
                          >
                            <ChevronLeft className="w-4 h-4" />
                          </button>
                          <span className="text-sm text-fg/50">{activityPage} of {activityData.totalPages}</span>
                          <button
                            onClick={() => setActivityPage(p => Math.min(activityData.totalPages, p + 1))}
                            disabled={activityPage === activityData.totalPages}
                            className="p-2 rounded-lg bg-fg/5 text-fg/50 disabled:opacity-20"
                          >
                            <ChevronRight className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            ) : (
              /* Normal user detail view */
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
                  <button onClick={handleCloseSlideOver} className="p-1 text-fg/40 hover:text-fg">
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

                  {/* Recent Activity */}
                  <div className="pt-4 mt-4 border-t border-fg/10">
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="text-sm font-medium text-fg/50">Recent Activity</h3>
                    </div>
                    {selectedUser.recentActivity?.length > 0 ? (
                      <div className="space-y-1">
                        {selectedUser.recentActivity.map((a, i) => {
                          const config = ACTIVITY_TYPE_CONFIG[a.type] || ACTIVITY_TYPE_CONFIG.event;
                          const Icon = config.icon;
                          return (
                            <div key={i} className="flex items-center gap-2.5 py-1.5">
                              <Icon className={`w-3.5 h-3.5 shrink-0 ${config.color}`} />
                              <span className="text-sm text-fg/70 truncate flex-1">
                                {a.type === 'event' ? formatEventName(a.description) : a.description || '—'}
                              </span>
                              {a.deviceType && <DeviceIcon type={a.deviceType} />}
                              <span className="text-sm text-fg/30 shrink-0">{timeAgo(a.createdAt)}</span>
                            </div>
                          );
                        })}
                        <button
                          onClick={() => setShowFullActivity(true)}
                          className="w-full mt-2 py-2 text-sm font-medium text-fg/50 hover:text-fg/70 bg-fg/5 hover:bg-fg/8 rounded-lg transition-colors"
                        >
                          View All Activity →
                        </button>
                      </div>
                    ) : (
                      <p className="text-sm text-fg/30">No activity recorded</p>
                    )}
                  </div>

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
