import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Eye, Clock, ChevronDown, ChevronLeft, ChevronRight, Users, Copy, Check, X, FileText, MousePointerClick, Monitor, Smartphone, Tablet } from 'lucide-react';
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
  if (staticPages[path]) return { label: staticPages[path] };

  // /league/:id — Survivor Dashboard
  const leagueMatch = path.match(/^\/league\/([^/]+)$/);
  if (leagueMatch) {
    return { label: 'Survivor Dashboard', params: { league: leagueMatch[1].substring(0, 8) } };
  }
  // /league/:id/pick — Make Pick
  const pickMatch = path.match(/^\/league\/([^/]+)\/pick$/);
  if (pickMatch) {
    return { label: 'Make Pick', params: { league: pickMatch[1].substring(0, 8) } };
  }
  // /league/:id/bracket — Bracket Dashboard
  const bracketDashMatch = path.match(/^\/league\/([^/]+)\/bracket$/);
  if (bracketDashMatch) {
    return { label: 'Bracket Dashboard', params: { league: bracketDashMatch[1].substring(0, 8) } };
  }
  // /league/:id/bracket/:bracketId — Fill/View Bracket
  const bracketFillMatch = path.match(/^\/league\/([^/]+)\/bracket\/([^/]+)$/);
  if (bracketFillMatch) {
    return { label: 'View Bracket', params: { league: bracketFillMatch[1].substring(0, 8), bracket: bracketFillMatch[2].substring(0, 8) } };
  }
  // /join/:inviteCode
  const joinMatch = path.match(/^\/join\/(.+)$/);
  if (joinMatch) return { label: 'Join via Invite', params: { code: joinMatch[1] } };
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
    return { label: adminNames[sub] || `Admin: ${sub}` };
  }
  return { label: path };
}

function formatEventName(event, data) {
  const labels = {
    game_card_expand: 'Expanded game card',
    game_card_collapse: 'Collapsed game card',
    game_tab_switch: 'Switched game tab',
    box_score_expand: 'Expanded box score',
    sport_tab_switch: 'Switched sport',
    bracket_submit: 'Submitted bracket',
    bracket_reset: 'Reset bracket',
    bracket_tab_switch: 'Switched bracket tab',
    bracket_view_click: 'Viewed bracket',
    bracket_score_expand: 'Expanded bracket score',
    bracket_score_dialog_open: 'Opened score dialog',
    bracket_status_dialog_open: 'Opened status dialog',
    bracket_fill_navigate: 'Navigated bracket fill',
    bracket_final_four_preview: 'Previewed Final Four',
    matchup_detail_open: 'Opened matchup detail',
    matchup_detail_close: 'Closed matchup detail',
    matchup_detail_dialog_open: 'Opened matchup dialog',
    matchup_tab_switch: 'Switched matchup tab',
    matchup_detail_tab_switch: 'Switched matchup detail tab',
    matchup_pick: 'Made bracket pick',
    pick_team_select: 'Selected team',
    pick_submit: 'Submitted pick',
    pick_week_change: 'Changed pick week',
    pick_override: 'Overrode pick',
    pick_distribution_open: 'Viewed pick distribution',
    team_info_dialog_open: 'Opened team info',
    team_info_tab_switch: 'Switched team info tab',
    stat_ranking_dialog_open: 'Opened stat rankings',
    tournament_game_dialog_open: 'Opened tournament game',
    tournament_game_tab_switch: 'Switched tournament game tab',
    tournament_game_filter: 'Filtered tournament games',
    prospect_dialog_open: 'Opened prospect details',
    prospect_sort: 'Sorted prospects',
    prospect_filter: 'Filtered prospects',
    prospect_game_log_expand: 'Expanded prospect game log',
    league_create: 'Created league',
    league_join: 'Joined league',
    league_join_invite: 'Joined via invite',
    members_dialog_open: 'Opened members dialog',
    members_tab_switch: 'Switched members tab',
    winners_dialog_open: 'Viewed winners',
    share_modal_open: 'Opened share modal',
    share_copy: 'Copied share link',
    share_native: 'Used native share',
    share_regenerate_code: 'Regenerated invite code',
    share_qr_toggle: 'Toggled QR code',
    settings_open: 'Opened settings',
    action_log_open: 'Viewed action log',
    chat_open: 'Opened chat',
    chat_close: 'Closed chat',
    chat_message_send: 'Sent chat message',
    final_four_share_to_chat: 'Shared Final Four to chat',
    notifications_open: 'Opened notifications',
    notification_click: 'Clicked notification',
    theme_toggle: 'Toggled theme',
    edit_profile_open: 'Opened profile editor',
    profile_save: 'Saved profile',
    logout: 'Logged out',
    leaderboard_bracket_navigate: 'Navigated leaderboard',
    survivor_week_change: 'Changed survivor week',
    strike_modify: 'Modified strike',
    // Daily Recap
    recap_view: 'Viewed daily recap',
    recap_tab_switch: 'Switched recap tab',
    recap_date_navigate: 'Navigated recap date',
    // Live Feed
    live_feed_view: 'Viewed live feed',
    live_feed_play_click: 'Clicked live feed play',
    live_feed_commentary_click: 'Clicked live feed commentary',
    live_feed_new_plays_click: 'Scrolled to new plays',
    // Bracket Challenge extras
    prize_pot_click: 'Opened prize pot',
    payment_status_toggle: 'Toggled payment status',
    league_name_edit: 'Edited league name',
    tournament_date_navigate: 'Navigated tournament date',
  };

  return labels[event] || event.replace(/_/g, ' ');
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
          <div className="flex items-center gap-1.5">
            <span className="text-fg font-medium">{user.name}</span>
            {user.deviceType && (
              <span className="text-fg/40" title={user.deviceType}>
                {user.deviceType === 'mobile' ? <Smartphone className="w-3.5 h-3.5" /> :
                 user.deviceType === 'tablet' ? <Tablet className="w-3.5 h-3.5" /> :
                 <Monitor className="w-3.5 h-3.5" />}
              </span>
            )}
          </div>
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
  const [timeline, setTimeline] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    adminAPI.getSessionPages(userId, start, end).then(data => {
      setTimeline(data.timeline || data.pages?.map(p => ({ type: 'page', path: p.path, timestamp: p.timestamp })) || []);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [userId, start, end]);

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  const sessionStart = new Date(start);
  const eventCount = timeline ? timeline.filter(t => t.type === 'event').length : 0;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60" />
      <div
        className={`relative z-10 w-full max-w-2xl max-h-[80vh] rounded-2xl shadow-2xl overflow-hidden flex flex-col ${isDark ? 'bg-gray-900' : 'bg-white'}`}
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
              {eventCount > 0 && <>{' '}&middot;{' '}{eventCount} events</>}
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-fg/60 hover:text-fg hover:bg-fg/10 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Timeline */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-12 text-fg/50 text-sm">Loading...</div>
          ) : !timeline?.length ? (
            <div className="flex items-center justify-center py-12 text-fg/50 text-sm">No activity found.</div>
          ) : (
            <div className="divide-y divide-fg/5">
              {timeline.map((item, i) => {
                const timestamp = new Date(item.timestamp);
                const prevTimestamp = i > 0 ? new Date(timeline[i - 1].timestamp) : null;
                const gap = prevTimestamp ? Math.round((timestamp - prevTimestamp) / 1000) : null;
                const isPage = item.type === 'page';

                return (
                  <div key={i} className={`flex items-start gap-3 px-5 ${isPage ? 'py-3' : 'py-2'}`}>
                    {isPage ? (
                      <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${isDark ? 'bg-blue-500/15' : 'bg-blue-50'}`}>
                        <FileText className={`w-3.5 h-3.5 ${isDark ? 'text-blue-400' : 'text-blue-500'}`} />
                      </div>
                    ) : (
                      <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${isDark ? 'bg-amber-500/15' : 'bg-amber-50'}`}>
                        <MousePointerClick className={`w-3.5 h-3.5 ${isDark ? 'text-amber-400' : 'text-amber-600'}`} />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      {isPage ? (() => {
                        const { label, params } = formatPagePath(item.path);
                        return (
                          <>
                            <p className="text-sm font-medium text-fg">{label}</p>
                            <p className="text-xs text-fg/40 font-mono break-all">{item.path}</p>
                            {params && Object.keys(params).length > 0 && (
                              <div className="mt-1">
                                <div className="flex flex-wrap gap-x-4 gap-y-0.5">
                                  {Object.entries(params).map(([key, val]) => (
                                    <div key={key} className="flex items-baseline gap-1.5">
                                      <span className="text-xs text-fg/40">{key}</span>
                                      <span className="text-xs text-fg/55 font-mono">{String(val)}</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </>
                        );
                      })() : (
                        <>
                          <p className="text-sm text-fg/70">{formatEventName(item.event)}</p>
                          {item.data && Object.keys(item.data).length > 0 && (
                            <div className="mt-1">
                              <div className="flex flex-wrap gap-x-4 gap-y-0.5">
                                {Object.entries(item.data).map(([key, val]) => (
                                  <div key={key} className="flex items-baseline gap-1.5">
                                    <span className="text-xs text-fg/40">{key}</span>
                                    <span className="text-xs text-fg/55 font-mono">{typeof val === 'object' ? JSON.stringify(val) : String(val)}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-sm text-fg/60">
                        {timestamp.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', second: '2-digit' })}
                      </p>
                      {i > 0 && gap != null && gap > 0 && (
                        <p className="text-sm text-fg/30">+{formatDuration(gap)}</p>
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
