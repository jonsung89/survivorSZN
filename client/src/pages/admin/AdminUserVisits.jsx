import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Eye, Clock, ChevronDown, ChevronLeft, ChevronRight, Users, Copy, Check, X, FileText } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import { adminAPI } from '../../api';

function getLocalDateStr(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function addDays(dateStr, days) {
  const d = new Date(dateStr + 'T12:00:00');
  d.setDate(d.getDate() + days);
  return getLocalDateStr(d);
}

function addMonths(dateStr, months) {
  const d = new Date(dateStr + 'T12:00:00');
  d.setMonth(d.getMonth() + months);
  return getLocalDateStr(d);
}

function formatDateLabel(dateStr, period) {
  const d = new Date(dateStr + 'T12:00:00');
  if (period === 'monthly') {
    return d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  }
  const today = getLocalDateStr();
  if (dateStr === today) return 'Today';
  if (dateStr === addDays(today, -1)) return 'Yesterday';
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

function formatDuration(seconds) {
  if (!seconds) return '—';
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  if (mins >= 60) {
    const hrs = Math.floor(mins / 60);
    const remainMins = mins % 60;
    return `${hrs}h ${remainMins}m`;
  }
  return `${mins}m ${secs}s`;
}

function formatPagePath(path) {
  const staticPages = {
    '/dashboard': 'Dashboard',
    '/leagues': 'My Leagues',
    '/leagues/create': 'Create League',
    '/leagues/join': 'Join League',
    '/schedule': 'Scores & Schedule',
    '/login': 'Login',
    '/privacy': 'Privacy Policy',
    '/terms': 'Terms of Service',
  };
  if (staticPages[path]) return staticPages[path];

  // /league/:id — Survivor Dashboard
  const leagueMatch = path.match(/^\/league\/([^/]+)$/);
  if (leagueMatch) {
    const id = leagueMatch[1].substring(0, 8);
    return `Survivor Dashboard (league: ${id})`;
  }
  // /league/:id/pick — Make Pick
  const pickMatch = path.match(/^\/league\/([^/]+)\/pick$/);
  if (pickMatch) {
    const id = pickMatch[1].substring(0, 8);
    return `Make Pick (league: ${id})`;
  }
  // /league/:id/bracket — Bracket Dashboard
  const bracketDashMatch = path.match(/^\/league\/([^/]+)\/bracket$/);
  if (bracketDashMatch) {
    const id = bracketDashMatch[1].substring(0, 8);
    return `Bracket Dashboard (league: ${id})`;
  }
  // /league/:id/bracket/:bracketId — Fill/View Bracket
  const bracketFillMatch = path.match(/^\/league\/([^/]+)\/bracket\/([^/]+)$/);
  if (bracketFillMatch) {
    const lid = bracketFillMatch[1].substring(0, 8);
    const bid = bracketFillMatch[2].substring(0, 8);
    return `View Bracket (league: ${lid}, bracket: ${bid})`;
  }
  // /join/:inviteCode
  const joinMatch = path.match(/^\/join\/(.+)$/);
  if (joinMatch) return `Join via Invite (code: ${joinMatch[1]})`;
  // Admin pages
  if (path.startsWith('/admin')) {
    const sub = path.replace('/admin/', '').replace('/admin', '');
    const adminNames = {
      '': 'Admin Dashboard',
      'users': 'Admin: Users',
      'leagues': 'Admin: Leagues',
      'chat': 'Admin: Chat Moderation',
      'analytics': 'Admin: Analytics',
      'analytics/user-visits': 'Admin: User Visits',
      'announcements': 'Admin: Announcements',
      'ncaab/reports': 'Admin: Scouting Reports',
      'ncaab/matchups': 'Admin: Matchups',
      'ncaab/bracket-test': 'Admin: Bracket Test',
      'ncaab/prospects': 'Admin: NBA Prospects',
    };
    return adminNames[sub] || `Admin: ${sub}`;
  }
  return path;
}

export default function AdminUserVisits() {
  const [visitPeriod, setVisitPeriod] = useState('daily');
  const [visitDate, setVisitDate] = useState(getLocalDateStr());
  const [visitData, setVisitData] = useState(null);
  const [visitLoading, setVisitLoading] = useState(true);
  const [expandedUser, setExpandedUser] = useState(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setVisitLoading(true);
      try {
        const data = await adminAPI.getUserVisits(visitPeriod, visitDate);
        if (!cancelled) setVisitData(data);
      } catch (err) {
        console.error('Failed to load user visits:', err);
      } finally {
        if (!cancelled) setVisitLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [visitPeriod, visitDate]);

  const navigateDate = (direction) => {
    if (visitPeriod === 'monthly') {
      setVisitDate(addMonths(visitDate, direction));
    } else {
      setVisitDate(addDays(visitDate, direction));
    }
    setExpandedUser(null);
  };

  const totalVisits = visitData?.users?.reduce((sum, u) => sum + u.visitCount, 0) || 0;
  const totalUsers = visitData?.users?.length || 0;
  const avgSessionTime = totalUsers > 0
    ? visitData.users.reduce((sum, u) => sum + u.avgSessionSeconds, 0) / totalUsers
    : 0;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-display font-bold text-fg">User Visits</h1>
        <div className="flex items-center gap-1 bg-surface rounded-lg border border-fg/10 p-0.5">
          <button
            onClick={() => { setVisitPeriod('daily'); setVisitDate(getLocalDateStr()); setExpandedUser(null); }}
            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${visitPeriod === 'daily' ? 'bg-fg/10 text-fg' : 'text-fg/50 hover:text-fg'}`}
          >
            Daily
          </button>
          <button
            onClick={() => { setVisitPeriod('monthly'); setVisitDate(getLocalDateStr()); setExpandedUser(null); }}
            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${visitPeriod === 'monthly' ? 'bg-fg/10 text-fg' : 'text-fg/50 hover:text-fg'}`}
          >
            Monthly
          </button>
        </div>
      </div>

      {/* Date navigation */}
      <div className="flex items-center justify-center gap-4 mb-4">
        <button onClick={() => navigateDate(-1)} className="p-1.5 rounded-lg hover:bg-fg/10 transition-colors text-fg/60 hover:text-fg">
          <ChevronLeft className="w-5 h-5" />
        </button>
        <span className="text-sm font-semibold text-fg min-w-[140px] text-center">
          {formatDateLabel(visitDate, visitPeriod)}
        </span>
        <button
          onClick={() => navigateDate(1)}
          disabled={visitDate >= getLocalDateStr()}
          className="p-1.5 rounded-lg hover:bg-fg/10 transition-colors text-fg/60 hover:text-fg disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4 mb-4">
        <StatCard icon={Users} label="Unique Users" value={totalUsers} color="text-blue-400" />
        <StatCard icon={Eye} label="Total Visits" value={totalVisits} color="text-emerald-400" />
        <StatCard icon={Clock} label="Avg Session" value={formatDuration(avgSessionTime)} color="text-amber-400" />
      </div>

      {/* User table */}
      <div className="bg-surface rounded-xl border border-fg/5 overflow-hidden">
        {visitLoading ? (
          <div className="flex items-center justify-center py-12 text-fg/40 text-sm">Loading...</div>
        ) : !visitData?.users?.length ? (
          <div className="flex items-center justify-center py-12 text-fg/40 text-sm">No visits recorded for this period.</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-fg/10">
                <th className="text-left px-4 py-2.5 text-fg/50 font-medium">User</th>
                <th className="text-center px-4 py-2.5 text-fg/50 font-medium">Visits</th>
                <th className="text-center px-4 py-2.5 text-fg/50 font-medium hidden sm:table-cell">Page Views</th>
                <th className="text-center px-4 py-2.5 text-fg/50 font-medium hidden md:table-cell">Avg Session</th>
                <th className="text-left px-4 py-2.5 text-fg/50 font-medium hidden lg:table-cell">Location</th>
                <th className="text-left px-4 py-2.5 text-fg/50 font-medium hidden lg:table-cell">Last Visit</th>
                <th className="w-10 px-2"></th>
              </tr>
            </thead>
            <tbody>
              {visitData.users.map((user) => {
                const isExpanded = expandedUser === user.userId;
                return (
                  <UserVisitRow
                    key={user.userId}
                    user={user}
                    isExpanded={isExpanded}
                    onToggle={() => setExpandedUser(isExpanded ? null : user.userId)}
                  />
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function UserVisitRow({ user, isExpanded, onToggle }) {
  const [copied, setCopied] = useState(false);
  const [sessionDialog, setSessionDialog] = useState(null); // { start, end, userName }

  const copyId = (e) => {
    e.stopPropagation();
    navigator.clipboard.writeText(user.userId);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const openSessionPages = (e, session) => {
    e.stopPropagation();
    setSessionDialog({
      userId: user.userId,
      userName: user.name,
      start: session.start,
      end: session.end,
      duration: session.duration,
      pageCount: session.pages,
    });
  };

  return (
    <>
      <tr
        className="border-b border-fg/5 last:border-0 cursor-pointer hover:bg-fg/3 transition-colors"
        onClick={onToggle}
      >
        <td className="px-4 py-2.5">
          <div className="text-fg font-medium">{user.name}</div>
          <div className="flex items-center gap-1 mt-0.5">
            <span className="text-fg/40 text-sm font-mono">{user.userId}</span>
            <button
              onClick={copyId}
              className="p-0.5 rounded hover:bg-fg/10 transition-colors text-fg/30 hover:text-fg/60"
              title="Copy user ID"
            >
              {copied ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
            </button>
          </div>
        </td>
        <td className="px-4 py-2.5 text-center text-fg font-semibold">{user.visitCount}</td>
        <td className="px-4 py-2.5 text-center text-fg/70 hidden sm:table-cell">{user.totalPageViews}</td>
        <td className="px-4 py-2.5 text-center text-fg/70 hidden md:table-cell">{formatDuration(user.avgSessionSeconds)}</td>
        <td className="px-4 py-2.5 text-fg/70 hidden lg:table-cell">{user.location || '—'}</td>
        <td className="px-4 py-2.5 text-fg/70 hidden lg:table-cell">
          {user.lastVisitAt ? new Date(user.lastVisitAt).toLocaleString(undefined, {
            month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
          }) : '—'}
        </td>
        <td className="px-2 py-2.5">
          <ChevronDown className={`w-4 h-4 text-fg/30 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
        </td>
      </tr>
      {isExpanded && user.sessions?.length > 0 && (
        <tr>
          <td colSpan={7} className="px-4 pb-3 pt-0">
            <div className="bg-fg/3 rounded-lg border border-fg/5 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-fg/10">
                    <th className="text-left px-3 py-2 text-fg/40 font-medium">Session Start</th>
                    <th className="text-center px-3 py-2 text-fg/40 font-medium">Duration</th>
                    <th className="text-center px-3 py-2 text-fg/40 font-medium">Pages</th>
                  </tr>
                </thead>
                <tbody>
                  {user.sessions.map((s, i) => (
                    <tr
                      key={i}
                      className="border-b border-fg/5 last:border-0 cursor-pointer hover:bg-fg/5 transition-colors"
                      onClick={(e) => openSessionPages(e, s)}
                    >
                      <td className="px-3 py-2 text-fg/70">
                        {new Date(s.start).toLocaleString(undefined, {
                          month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
                        })}
                      </td>
                      <td className="px-3 py-2 text-center text-fg/70">{formatDuration(s.duration)}</td>
                      <td className="px-3 py-2 text-center text-fg/70">{s.pages}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </td>
        </tr>
      )}
      {sessionDialog && createPortal(
        <SessionPagesDialog
          {...sessionDialog}
          onClose={() => setSessionDialog(null)}
        />,
        document.body
      )}
    </>
  );
}

function SessionPagesDialog({ userId, userName, start, end, duration, pageCount, onClose }) {
  const { isDark } = useTheme();
  const [pages, setPages] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    adminAPI.getSessionPages(userId, start, end).then(data => {
      setPages(data.pages || []);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [userId, start, end]);

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  const sessionStart = new Date(start);

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60" />
      <div
        className={`relative z-10 w-full max-w-md max-h-[80vh] rounded-2xl shadow-2xl overflow-hidden flex flex-col ${isDark ? 'bg-gray-900' : 'bg-white'}`}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className={`flex items-center justify-between px-5 py-3.5 border-b ${isDark ? 'border-white/10' : 'border-black/10'}`}>
          <div>
            <h2 className="text-base font-bold text-fg">{userName}</h2>
            <p className="text-sm text-fg/50">
              {sessionStart.toLocaleString(undefined, {
                month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
              })}
              {' '}&middot;{' '}{formatDuration(duration)}{' '}&middot;{' '}{pageCount} pages
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-fg/60 hover:text-fg hover:bg-fg/10 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Page list */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-12 text-fg/50 text-sm">Loading...</div>
          ) : !pages?.length ? (
            <div className="flex items-center justify-center py-12 text-fg/50 text-sm">No page views found.</div>
          ) : (
            <div className="divide-y divide-fg/5">
              {pages.map((page, i) => {
                const timestamp = new Date(page.timestamp);
                const prevTimestamp = i > 0 ? new Date(pages[i - 1].timestamp) : null;
                const timeOnPage = prevTimestamp
                  ? Math.round((timestamp - prevTimestamp) / 1000)
                  : null;

                return (
                  <div key={i} className="flex items-center gap-3 px-5 py-3">
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${isDark ? 'bg-white/5' : 'bg-black/5'}`}>
                      <span className="text-sm font-semibold text-fg/50">{i + 1}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-fg truncate">{formatPagePath(page.path)}</p>
                      <p className="text-sm text-fg/40 font-mono truncate">{page.path}</p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-sm text-fg/60">
                        {timestamp.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', second: '2-digit' })}
                      </p>
                      {i > 0 && timeOnPage != null && (
                        <p className="text-sm text-fg/30">+{formatDuration(timeOnPage)}</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, color }) {
  return (
    <div className="bg-surface rounded-xl p-4 border border-fg/5">
      <div className={`p-2 rounded-lg bg-fg/5 ${color} w-fit mb-2`}>
        <Icon className="w-4 h-4" />
      </div>
      <p className="text-2xl font-display font-bold text-fg">{value ?? '—'}</p>
      <p className="text-sm text-fg/50 mt-0.5">{label}</p>
    </div>
  );
}
