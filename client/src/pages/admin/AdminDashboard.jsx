import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Users, LogIn, Activity, UserPlus, Trophy, MessageSquare,
  Target, Monitor, ExternalLink, Eye, Globe, RefreshCw,
  BarChart3, Calendar, UserX, Gamepad2, X,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { adminAPI } from '../../api';
import Loading from '../../components/Loading';
import Avatar from '../../components/Avatar';
import StatCard from './components/StatCard';
import TimeRangeSelector from './components/TimeRangeSelector';
import DashboardAreaChart from './components/DashboardAreaChart';
import DashboardBarChart from './components/DashboardBarChart';
import HorizontalBarChart from './components/HorizontalBarChart';
import useChartTheme from './components/useChartTheme';

// Merge multiple trend arrays by date into a single array for multi-series charts
function mergeTrendsByDate(trendMap) {
  const dateMap = {};
  for (const [key, entries] of Object.entries(trendMap)) {
    for (const { date, count } of entries) {
      if (!dateMap[date]) dateMap[date] = { date };
      dateMap[date][key] = count;
    }
  }
  const allKeys = Object.keys(trendMap);
  const merged = Object.values(dateMap).sort((a, b) => a.date.localeCompare(b.date));
  for (const row of merged) {
    for (const key of allKeys) {
      if (row[key] === undefined) row[key] = 0;
    }
  }
  return merged;
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

function formatDuration(seconds) {
  if (!seconds || seconds < 1) return '0s';
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s > 0 ? `${m}m ${s}s` : `${m}m`;
}

function formatEventName(name) {
  return name.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

const MAIN_CHART_SERIES = [
  { key: 'dau', label: 'Active Users', color: '#3b82f6' },
  { key: 'signups', label: 'Signups', color: '#10b981' },
];

// Human-readable page names for the Top Pages chart
const PAGE_NAME_MAP = {
  '/dashboard': 'Dashboard',
  '/league/:id': 'League Home',
  '/league/:id/bracket': 'League Bracket',
  '/league/:id/bracket/:id': 'Bracket View',
  '/league/:id/pick': 'Survivor Pick',
  '/leagues': 'My Leagues',
  '/leagues/join': 'Join League',
  '/leagues/create': 'Create League',
  '/join/:id': 'Invite Link',
  '/login': 'Login',
  '/schedule': 'Schedule',
  '/privacy': 'Privacy Policy',
  '/terms': 'Terms of Service',
  '/': 'Home',
  '/admin': 'Admin Dashboard',
};

function formatPageName(path) {
  if (!path) return path;
  return PAGE_NAME_MAP[path] || path;
}

const TOP_PAGES_RANGES = [
  { label: 'Today', value: 'today' },
  { label: '7D', value: '7d' },
  { label: '30D', value: '30d' },
  { label: 'This Month', value: 'month' },
  { label: 'This Year', value: 'year' },
];

const TAB_LABELS = {
  summary: 'Summary',
  boxscore: 'Box Score',
  gamecast: 'Gamecast',
  shotchart: 'Shot Chart',
  team1: 'Team Scouting',
  team2: 'Team Scouting',
  matchup: 'Head-to-Head',
};

const SPORT_LABELS = {
  nba: 'NBA',
  ncaab: 'NCAAB',
  nfl: 'NFL',
  nhl: 'NHL',
  mlb: 'MLB',
};

export default function AdminDashboard() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [range, setRange] = useState(30);
  const [activeSeries, setActiveSeries] = useState(['dau', 'signups']);
  const [onlineUsers, setOnlineUsers] = useState(0);
  const [topPagesRange, setTopPagesRange] = useState('30d');
  const [topPages, setTopPages] = useState([]);
  const [topPagesLoading, setTopPagesLoading] = useState(false);
  const [scheduleEngagement, setScheduleEngagement] = useState(null);
  const [bracketEngagement, setBracketEngagement] = useState(null);
  const [anonymousUsage, setAnonymousUsage] = useState(null);
  const [deviceBreakdown, setDeviceBreakdown] = useState(null);
  const [onlineUsersDialogOpen, setOnlineUsersDialogOpen] = useState(false);
  const [onlineUsersList, setOnlineUsersList] = useState([]);
  const [onlineUsersLoading, setOnlineUsersLoading] = useState(false);
  // Top Pages drill-down
  const [topPagesDetailOpen, setTopPagesDetailOpen] = useState(false);
  const [topPagesDetailData, setTopPagesDetailData] = useState(null);
  const [topPagesDetailLoading, setTopPagesDetailLoading] = useState(false);
  const [topPagesDetailLabel, setTopPagesDetailLabel] = useState('');
  // Bracket Engagement drill-down
  const [bracketDetailOpen, setBracketDetailOpen] = useState(false);
  const [bracketDetailData, setBracketDetailData] = useState(null);
  const [bracketDetailLoading, setBracketDetailLoading] = useState(false);
  const [bracketDetailTitle, setBracketDetailTitle] = useState('');
  // Schedule Engagement drill-down
  const [schedDetailOpen, setSchedDetailOpen] = useState(false);
  const [schedDetailData, setSchedDetailData] = useState(null);
  const [schedDetailLoading, setSchedDetailLoading] = useState(false);
  const [schedDetailTitle, setSchedDetailTitle] = useState('');
  // Per-section stat view toggle (default to 'today')
  const [schedStatView, setSchedStatView] = useState('today');
  const [bracketStatView, setBracketStatView] = useState('today');
  const chartTheme = useChartTheme();
  const onlineIntervalRef = useRef(null);

  const fetchStats = useCallback(async (r, isRefresh = false) => {
    try {
      if (isRefresh) setRefreshing(true);
      const data = await adminAPI.getDashboardStats(r);
      setStats(data);
      setOnlineUsers(data.onlineUsers || 0);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchStats(range, !loading);
  }, [range]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch engagement data when range changes
  useEffect(() => {
    const fetchEngagement = async () => {
      try {
        const [sched, bracket, anon, devices] = await Promise.all([
          adminAPI.getScheduleEngagement(range),
          adminAPI.getBracketEngagement(range),
          adminAPI.getAnonymousUsage(range),
          adminAPI.getDeviceBreakdown(range),
        ]);
        setScheduleEngagement(sched);
        setBracketEngagement(bracket);
        setAnonymousUsage(anon);
        setDeviceBreakdown(devices);
      } catch { /* ignore */ }
    };
    fetchEngagement();
  }, [range]);

  // Poll online users every 30 seconds
  useEffect(() => {
    const pollOnline = async () => {
      try {
        const data = await adminAPI.getOnlineUsers();
        setOnlineUsers(data.onlineUsers || 0);
      } catch { /* ignore */ }
    };
    onlineIntervalRef.current = setInterval(pollOnline, 30000);
    return () => clearInterval(onlineIntervalRef.current);
  }, []);

  // Fetch top pages when range changes
  useEffect(() => {
    const fetchTopPages = async () => {
      setTopPagesLoading(true);
      try {
        const data = await adminAPI.getTopPages(topPagesRange);
        setTopPages(data.topPages || []);
      } catch { /* ignore */ }
      setTopPagesLoading(false);
    };
    fetchTopPages();
  }, [topPagesRange]);

  const toggleSeries = (key) => {
    setActiveSeries(prev => {
      if (prev.includes(key)) {
        if (prev.length === 1) return prev;
        return prev.filter(k => k !== key);
      }
      return [...prev, key];
    });
  };

  const handleRefresh = () => {
    fetchStats(range, true);
  };

  const handleOnlineUsersClick = async () => {
    setOnlineUsersDialogOpen(true);
    setOnlineUsersLoading(true);
    try {
      const data = await adminAPI.getOnlineUsersDetail();
      setOnlineUsersList(data.users || []);
    } catch {
      setOnlineUsersList([]);
    }
    setOnlineUsersLoading(false);
  };

  const handleTopPageBarClick = async (barData) => {
    // barData has the row from the chart; we need the original path (not the label)
    const item = topPages.find(p => formatPageName(p.path) === barData.label);
    if (!item) return;
    setTopPagesDetailLabel(barData.label);
    setTopPagesDetailOpen(true);
    setTopPagesDetailLoading(true);
    try {
      const data = await adminAPI.getTopPagesDetail(item.path, topPagesRange);
      setTopPagesDetailData(data);
    } catch {
      setTopPagesDetailData(null);
    }
    setTopPagesDetailLoading(false);
  };

  const handleBracketStatClick = async (metric, title) => {
    setBracketDetailTitle(title);
    setBracketDetailOpen(true);
    setBracketDetailLoading(true);
    try {
      const data = await adminAPI.getBracketEngagementDetail(metric, range);
      setBracketDetailData(data);
    } catch {
      setBracketDetailData(null);
    }
    setBracketDetailLoading(false);
  };

  const handleSchedStatClick = async (metric, title) => {
    setSchedDetailTitle(title);
    setSchedDetailOpen(true);
    setSchedDetailLoading(true);
    try {
      const data = await adminAPI.getScheduleEngagementDetail(metric, range);
      setSchedDetailData(data);
    } catch {
      setSchedDetailData(null);
    }
    setSchedDetailLoading(false);
  };

  if (loading) return <Loading />;
  if (error) return <div className="text-red-400 text-center py-8">{error}</div>;

  // Build merged data for the main chart
  const selectedTrends = {};
  for (const key of activeSeries) {
    if (stats?.trends?.[key]) {
      selectedTrends[key] = stats.trends[key];
    }
  }
  const mergedMainData = mergeTrendsByDate(selectedTrends);
  const activeDataKeys = MAIN_CHART_SERIES.filter(s => activeSeries.includes(s.key));

  // Leagues subtitle
  const activeL = stats?.engagement?.activeLeagues ?? 0;
  const totalL = stats?.engagement?.totalLeagues ?? 0;
  const leagueSubtitle = totalL > activeL ? `${totalL} total` : null;

  // Returning users subtitle for logins
  const returning = stats?.today?.returningUsers ?? 0;
  const newU = stats?.today?.newUsers ?? 0;
  const loginSubtitle = returning > 0 || newU > 0
    ? `${returning} returning${newU > 0 ? `, ${newU} new` : ''}`
    : null;

  // Schedule engagement chart data
  const schedTabData = (scheduleEngagement?.tabBreakdown || []).map(r => ({
    name: TAB_LABELS[r.tab] || r.tab,
    count: r.count,
  }));
  const schedSportData = (scheduleEngagement?.sportBreakdown || []).map(r => ({
    name: SPORT_LABELS[r.sportId] || r.sportId?.toUpperCase(),
    count: r.expands,
  }));

  // Bracket engagement chart data — merge tabs with same label (e.g. team1+team2 → "Team Scouting")
  const bracketTabDataRaw = (bracketEngagement?.tabBreakdown || []).map(r => ({
    name: TAB_LABELS[r.tab] || r.tab,
    count: r.count,
  }));
  const bracketTabMerged = {};
  for (const r of bracketTabDataRaw) {
    bracketTabMerged[r.name] = (bracketTabMerged[r.name] || 0) + r.count;
  }
  const bracketTabData = Object.entries(bracketTabMerged)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);

  // Anonymous usage chart data
  const anonEventData = (anonymousUsage?.topEvents || []).map(r => ({
    name: formatEventName(r.event),
    count: r.count,
  }));
  const anonSportData = (anonymousUsage?.sportBreakdown || []).map(r => ({
    name: SPORT_LABELS[r.sportId] || r.sportId?.toUpperCase(),
    count: r.count,
  }));

  // Device breakdown chart data
  const devicePageViewData = (deviceBreakdown?.pageViewDevices || [])
    .filter(r => r.deviceType !== 'unknown')
    .map(r => ({
      name: r.deviceType.charAt(0).toUpperCase() + r.deviceType.slice(1),
      count: r.count,
    }));
  const deviceUniqueUserData = (deviceBreakdown?.uniqueUserDevices || [])
    .filter(r => r.deviceType !== 'unknown')
    .map(r => ({
      name: r.deviceType.charAt(0).toUpperCase() + r.deviceType.slice(1),
      count: r.uniqueUsers,
    }));

  // Compute device percentages for stat display
  const totalDeviceViews = devicePageViewData.reduce((sum, d) => sum + d.count, 0);
  const mobileViews = devicePageViewData.find(d => d.name === 'Mobile')?.count || 0;
  const desktopViews = devicePageViewData.find(d => d.name === 'Desktop')?.count || 0;
  const mobilePct = totalDeviceViews > 0 ? Math.round((mobileViews / totalDeviceViews) * 100) : 0;
  const desktopPct = totalDeviceViews > 0 ? Math.round((desktopViews / totalDeviceViews) * 100) : 0;

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-display font-bold text-fg">Dashboard</h1>
        <div className="flex items-center gap-3">
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="p-2 rounded-lg bg-fg/5 hover:bg-fg/10 text-fg/50 hover:text-fg transition-colors disabled:opacity-50"
            title="Refresh data"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
          <TimeRangeSelector value={range} onChange={setRange} />
        </div>
      </div>

      {/* Row 1: Today Stats (4 cards) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard
          label="Online Now"
          value={onlineUsers}
          icon={Globe}
          iconColor="text-emerald-400"
          live
          description="Users currently connected to the app via WebSocket. Updates every 30 seconds."
          onClick={handleOnlineUsersClick}
        />
        <StatCard
          label="Page Views Today"
          value={stats?.today?.pageViews}
          icon={Eye}
          iconColor="text-violet-400"
          delta={stats?.today?.pageViewsDelta}
          deltaLabel="vs yesterday"
          subtitle={`${stats?.today?.uniqueVisitors ?? 0} unique visitors`}
          description="Total page navigations by non-admin users today. Each route change counts as one view. Unique visitors = distinct users who visited."
        />
        <StatCard
          label="Signups Today"
          value={stats?.today?.signups}
          icon={UserPlus}
          iconColor="text-emerald-400"
          delta={stats?.today?.signupsDelta}
          deltaLabel="vs yesterday"
          description="New user accounts created today (completed onboarding)."
        />
        <StatCard
          label="Logins Today"
          value={stats?.today?.logins}
          icon={LogIn}
          iconColor="text-amber-400"
          delta={stats?.today?.loginsDelta}
          deltaLabel="vs yesterday"
          subtitle={loginSubtitle}
          description="Distinct users who opened the app today. Returning = existed before today. New = signed up today."
        />
      </div>

      {/* Row 2: Platform Totals (3 cards) */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <StatCard
          label="Total Users"
          value={stats?.today?.totalUsers}
          icon={Users}
          iconColor="text-purple-400"
          delta={stats?.today?.totalUsersDelta}
          deltaLabel="past 7 days"
          description="All registered users across the platform."
        />
        <StatCard
          label="Active (24h)"
          value={stats?.today?.active24h}
          icon={Activity}
          iconColor="text-blue-400"
          delta={stats?.today?.active24hDelta}
          deltaLabel="vs prior 24h"
          description="Users who logged in within the last 24 hours (rolling window, not calendar day)."
        />
        <StatCard
          label="Active Leagues"
          value={activeL}
          icon={Trophy}
          iconColor="text-amber-400"
          subtitle={leagueSubtitle}
          description="Leagues with 'active' status. Total includes completed and archived leagues."
        />
      </div>

      {/* Row 3: Main Trend Chart */}
      <div className="bg-surface rounded-xl p-5 border border-fg/5 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-medium text-fg">User Activity</h3>
          <div className="flex items-center gap-1 flex-wrap">
            {MAIN_CHART_SERIES.map(series => (
              <button
                key={series.key}
                onClick={() => toggleSeries(series.key)}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-sm transition-colors ${
                  activeSeries.includes(series.key)
                    ? 'bg-fg/10 text-fg'
                    : 'text-fg/30 hover:text-fg/50'
                }`}
              >
                <div
                  className="w-2 h-2 rounded-full"
                  style={{ backgroundColor: activeSeries.includes(series.key) ? series.color : 'currentColor' }}
                />
                {series.label}
              </button>
            ))}
          </div>
        </div>
        {mergedMainData.length > 0 ? (
          <DashboardAreaChart
            data={mergedMainData}
            dataKeys={activeDataKeys}
            height={280}
          />
        ) : (
          <div className="h-[280px] flex items-center justify-center text-fg/30 text-sm">
            No data for selected range
          </div>
        )}
      </div>

      {/* Row 4: Top Pages & Chat Activity */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        {/* Top Pages */}
        <div className="bg-surface rounded-xl p-5 border border-fg/5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-violet-400" />
              <h3 className="text-sm font-medium text-fg">Top Pages</h3>
              {topPagesLoading && (
                <div className="w-3 h-3 border-2 border-fg/20 border-t-fg/60 rounded-full animate-spin" />
              )}
            </div>
            <div className="flex items-center bg-fg/5 rounded-lg p-0.5 gap-0.5">
              {TOP_PAGES_RANGES.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => setTopPagesRange(opt.value)}
                  className={`px-2 py-1 text-sm rounded-md transition-colors ${
                    topPagesRange === opt.value
                      ? 'bg-surface text-fg shadow-sm'
                      : 'text-fg/40 hover:text-fg/60'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
          {topPages.length > 0 ? (
            <HorizontalBarChart
              data={topPages.map(p => ({ ...p, label: formatPageName(p.path) }))}
              dataKey="views"
              labelKey="label"
              color={chartTheme.colors.quaternary}
              height={Math.max(200, topPages.length * 30)}
              onBarClick={handleTopPageBarClick}
            />
          ) : (
            <div className="h-[200px] flex items-center justify-center text-fg/30 text-sm">
              {topPagesLoading ? 'Loading...' : 'No page view data yet'}
            </div>
          )}
        </div>

        {/* Chat Activity */}
        <div className="bg-surface rounded-xl p-5 border border-fg/5">
          <div className="flex items-center gap-2 mb-4">
            <MessageSquare className="w-4 h-4 text-blue-400" />
            <h3 className="text-sm font-medium text-fg">Chat Activity</h3>
          </div>
          {stats?.trends?.chatMessages?.length > 0 ? (
            <DashboardAreaChart
              data={stats.trends.chatMessages}
              dataKeys={[{ key: 'count', label: 'Messages', color: chartTheme.colors.primary }]}
              height={200}
            />
          ) : (
            <div className="h-[200px] flex items-center justify-center text-fg/30 text-sm">
              No chat data
            </div>
          )}
        </div>
      </div>

      {/* Row 5: Monthly Trends (MAU + Leagues + Gamecast) */}
      <div className="bg-surface rounded-xl p-5 border border-fg/5 mb-6">
        <div className="flex items-center gap-2 mb-4">
          <Calendar className="w-4 h-4 text-purple-400" />
          <h3 className="text-sm font-medium text-fg">Monthly Trends</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div>
            <p className="text-sm text-fg/40 mb-2">Active Users</p>
            {stats?.monthly?.mau?.length > 0 ? (
              <DashboardBarChart
                data={stats.monthly.mau}
                color={chartTheme.colors.quaternary}
                height={160}
              />
            ) : (
              <div className="h-[160px] flex items-center justify-center text-fg/30 text-sm">
                No data
              </div>
            )}
          </div>
          <div>
            <p className="text-sm text-fg/40 mb-2">New Leagues</p>
            {stats?.monthly?.newLeagues?.length > 0 ? (
              <DashboardBarChart
                data={stats.monthly.newLeagues}
                color={chartTheme.colors.secondary}
                height={160}
              />
            ) : (
              <div className="h-[160px] flex items-center justify-center text-fg/30 text-sm">
                No data
              </div>
            )}
          </div>
          <div>
            <p className="text-sm text-fg/40 mb-2">Gamecast Sessions</p>
            {stats?.monthly?.gamecastSessions?.length > 0 ? (
              <DashboardBarChart
                data={stats.monthly.gamecastSessions}
                color={chartTheme.colors.primary}
                height={160}
              />
            ) : (
              <div className="h-[160px] flex items-center justify-center text-fg/30 text-sm">
                No data
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Row 6: Engagement Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
        <StatCard
          label="Brackets Submitted"
          value={stats?.engagement?.bracketsSubmitted}
          icon={Trophy}
          iconColor="text-amber-400"
          description="Total brackets submitted across all March Madness challenges."
        />
        <StatCard
          label="Gamecast Sessions (30d)"
          value={stats?.engagement?.gamecastSessions30d}
          icon={Monitor}
          iconColor="text-blue-400"
          description="Times users opened the live gamecast view in the past 30 days."
        />
        <StatCard
          label="Picks Made (30d)"
          value={stats?.engagement?.picksMade30d}
          icon={Target}
          iconColor="text-emerald-400"
          description="Survivor pool picks submitted in the past 30 days."
        />
      </div>

      {/* Row 7: Schedule & Gamecast Engagement */}
      <div className="bg-surface rounded-xl p-5 border border-fg/5 mb-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Gamepad2 className="w-4 h-4 text-blue-400" />
            <h3 className="text-sm font-medium text-fg">Schedule & Gamecast Engagement</h3>
          </div>
          <div className="flex items-center bg-fg/5 rounded-lg p-0.5 gap-0.5">
            {[{ label: 'Today', value: 'today' }, { label: `${range}D`, value: 'range' }].map(opt => (
              <button
                key={opt.value}
                onClick={() => setSchedStatView(opt.value)}
                className={`px-2.5 py-1 text-sm rounded-md transition-colors ${
                  schedStatView === opt.value
                    ? 'bg-surface text-fg shadow-sm'
                    : 'text-fg/40 hover:text-fg/60'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Summary stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-5">
          <div
            className="p-3 rounded-lg bg-fg/5 cursor-pointer hover:bg-fg/10 transition-colors"
            onClick={() => handleSchedStatClick('gameCardExpands', 'Game Cards Opened')}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleSchedStatClick('gameCardExpands', 'Game Cards Opened'); } }}
          >
            <p className="text-2xl font-bold text-fg">
              {schedStatView === 'today'
                ? (scheduleEngagement?.today?.gameCardExpands ?? 0).toLocaleString()
                : (scheduleEngagement?.gameCardExpands?.total ?? 0).toLocaleString()
              }
            </p>
            <p className="text-sm text-fg/40">Game Cards Opened</p>
            {schedStatView === 'today' && scheduleEngagement?.gameCardExpands?.total > 0 && (
              <p className="text-sm text-fg/30 mt-0.5">{scheduleEngagement.gameCardExpands.total.toLocaleString()} in {range}D</p>
            )}
            {schedStatView !== 'today' && scheduleEngagement?.today?.gameCardExpands > 0 && (
              <p className="text-sm text-fg/30 mt-0.5">{scheduleEngagement.today.gameCardExpands} today</p>
            )}
          </div>
          <div
            className="p-3 rounded-lg bg-fg/5 cursor-pointer hover:bg-fg/10 transition-colors"
            onClick={() => handleSchedStatClick('uniqueUsers', 'Unique Users')}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleSchedStatClick('uniqueUsers', 'Unique Users'); } }}
          >
            <p className="text-2xl font-bold text-fg">
              {schedStatView === 'today'
                ? (scheduleEngagement?.today?.uniqueUsers ?? 0).toLocaleString()
                : (scheduleEngagement?.gameCardExpands?.uniqueUsers ?? 0).toLocaleString()
              }
            </p>
            <p className="text-sm text-fg/40">Unique Users</p>
            {schedStatView === 'today' && scheduleEngagement?.gameCardExpands?.uniqueUsers > 0 && (
              <p className="text-sm text-fg/30 mt-0.5">{scheduleEngagement.gameCardExpands.uniqueUsers.toLocaleString()} in {range}D</p>
            )}
            {schedStatView !== 'today' && scheduleEngagement?.today?.uniqueUsers > 0 && (
              <p className="text-sm text-fg/30 mt-0.5">{scheduleEngagement.today.uniqueUsers} today</p>
            )}
          </div>
          <div className="p-3 rounded-lg bg-fg/5">
            <p className="text-2xl font-bold text-fg">
              {formatDuration(schedStatView === 'today'
                ? scheduleEngagement?.today?.avgViewDuration
                : scheduleEngagement?.avgViewDuration
              )}
            </p>
            <p className="text-sm text-fg/40">Avg View Time</p>
            {schedStatView === 'today' && scheduleEngagement?.avgViewDuration > 0 && (
              <p className="text-sm text-fg/30 mt-0.5">{formatDuration(scheduleEngagement.avgViewDuration)} in {range}D</p>
            )}
            {schedStatView !== 'today' && scheduleEngagement?.today?.avgViewDuration > 0 && (
              <p className="text-sm text-fg/30 mt-0.5">{formatDuration(scheduleEngagement.today.avgViewDuration)} today</p>
            )}
          </div>
          <div className="p-3 rounded-lg bg-fg/5">
            <p className="text-2xl font-bold text-fg">{schedTabData.reduce((sum, r) => sum + r.count, 0).toLocaleString()}</p>
            <p className="text-sm text-fg/40">Tab Switches</p>
          </div>
        </div>

        {/* Charts row */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-5">
          <div>
            <p className="text-sm text-fg/40 mb-2">Tab Popularity</p>
            {schedTabData.length > 0 ? (
              <HorizontalBarChart
                data={schedTabData}
                dataKey="count"
                labelKey="name"
                color={chartTheme.colors.primary}
                height={Math.max(120, schedTabData.length * 32)}
              />
            ) : (
              <div className="h-[120px] flex items-center justify-center text-fg/30 text-sm">No data yet</div>
            )}
          </div>
          <div>
            <p className="text-sm text-fg/40 mb-2">By Sport</p>
            {schedSportData.length > 0 ? (
              <HorizontalBarChart
                data={schedSportData}
                dataKey="count"
                labelKey="name"
                color={chartTheme.colors.secondary}
                height={Math.max(120, schedSportData.length * 32)}
              />
            ) : (
              <div className="h-[120px] flex items-center justify-center text-fg/30 text-sm">No data yet</div>
            )}
          </div>
        </div>

        {/* Top games table */}
        {scheduleEngagement?.topGames?.length > 0 && (
          <div className="mb-5">
            <p className="text-sm text-fg/40 mb-2">Top Games</p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-fg/40 border-b border-fg/10">
                    <th className="text-left py-2 font-medium">Game</th>
                    <th className="text-left py-2 font-medium">Sport</th>
                    <th className="text-right py-2 font-medium">Opens</th>
                    <th className="text-right py-2 font-medium">Avg Duration</th>
                  </tr>
                </thead>
                <tbody>
                  {scheduleEngagement.topGames.slice(0, 5).map((g, i) => (
                    <tr key={i} className="border-b border-fg/5">
                      <td className="py-2 text-fg/70">{g.gameName || g.gameId?.substring(0, 12)}</td>
                      <td className="py-2 text-fg/60">{SPORT_LABELS[g.sportId] || g.sportId?.toUpperCase()}</td>
                      <td className="py-2 text-fg text-right font-medium">{g.expands}</td>
                      <td className="py-2 text-fg/60 text-right">{formatDuration(g.avgDuration)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Daily trend */}
        {scheduleEngagement?.dailyTrend?.length > 0 && (
          <div>
            <p className="text-sm text-fg/40 mb-2">Daily Game Card Opens</p>
            <DashboardAreaChart
              data={scheduleEngagement.dailyTrend}
              dataKeys={[{ key: 'count', label: 'Opens', color: chartTheme.colors.primary }]}
              height={160}
            />
          </div>
        )}
      </div>

      {/* Row 8: March Madness Engagement */}
      <div className="bg-surface rounded-xl p-5 border border-fg/5 mb-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Trophy className="w-4 h-4 text-amber-400" />
            <h3 className="text-sm font-medium text-fg">March Madness Engagement</h3>
          </div>
          <div className="flex items-center bg-fg/5 rounded-lg p-0.5 gap-0.5">
            {[{ label: 'Today', value: 'today' }, { label: `${range}D`, value: 'range' }].map(opt => (
              <button
                key={opt.value}
                onClick={() => setBracketStatView(opt.value)}
                className={`px-2.5 py-1 text-sm rounded-md transition-colors ${
                  bracketStatView === opt.value
                    ? 'bg-surface text-fg shadow-sm'
                    : 'text-fg/40 hover:text-fg/60'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Summary stats */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-5">
          <div
            className="p-3 rounded-lg bg-fg/5 cursor-pointer hover:bg-fg/10 transition-colors"
            onClick={() => handleBracketStatClick('matchupDetails', 'Matchup Details Viewed')}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleBracketStatClick('matchupDetails', 'Matchup Details Viewed'); } }}
          >
            <p className="text-2xl font-bold text-fg">
              {bracketStatView === 'today'
                ? (bracketEngagement?.today?.matchupDetailsOpened ?? 0).toLocaleString()
                : (bracketEngagement?.matchupDetailsOpened?.total ?? 0).toLocaleString()
              }
            </p>
            <p className="text-sm text-fg/40">Matchup Details Viewed</p>
            {bracketStatView === 'today' && bracketEngagement?.matchupDetailsOpened?.total > 0 && (
              <p className="text-sm text-fg/30 mt-0.5">{bracketEngagement.matchupDetailsOpened.total.toLocaleString()} in {range}D</p>
            )}
            {bracketStatView !== 'today' && bracketEngagement?.today?.matchupDetailsOpened > 0 && (
              <p className="text-sm text-fg/30 mt-0.5">{bracketEngagement.today.matchupDetailsOpened} today</p>
            )}
          </div>
          <div
            className="p-3 rounded-lg bg-fg/5 cursor-pointer hover:bg-fg/10 transition-colors"
            onClick={() => handleBracketStatClick('uniqueUsers', 'Unique Users')}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleBracketStatClick('uniqueUsers', 'Unique Users'); } }}
          >
            <p className="text-2xl font-bold text-fg">
              {bracketStatView === 'today'
                ? (bracketEngagement?.today?.uniqueUsers ?? 0).toLocaleString()
                : (bracketEngagement?.matchupDetailsOpened?.uniqueUsers ?? 0).toLocaleString()
              }
            </p>
            <p className="text-sm text-fg/40">Unique Users</p>
            {bracketStatView === 'today' && bracketEngagement?.matchupDetailsOpened?.uniqueUsers > 0 && (
              <p className="text-sm text-fg/30 mt-0.5">{bracketEngagement.matchupDetailsOpened.uniqueUsers.toLocaleString()} in {range}D</p>
            )}
            {bracketStatView !== 'today' && bracketEngagement?.today?.uniqueUsers > 0 && (
              <p className="text-sm text-fg/30 mt-0.5">{bracketEngagement.today.uniqueUsers} today</p>
            )}
          </div>
          <div className="p-3 rounded-lg bg-fg/5">
            <p className="text-2xl font-bold text-fg">
              {formatDuration(bracketStatView === 'today'
                ? bracketEngagement?.today?.avgViewDuration
                : bracketEngagement?.avgViewDuration
              )}
            </p>
            <p className="text-sm text-fg/40">Avg Time per Matchup</p>
            {bracketStatView === 'today' && bracketEngagement?.avgViewDuration > 0 && (
              <p className="text-sm text-fg/30 mt-0.5">{formatDuration(bracketEngagement.avgViewDuration)} in {range}D</p>
            )}
            {bracketStatView !== 'today' && bracketEngagement?.today?.avgViewDuration > 0 && (
              <p className="text-sm text-fg/30 mt-0.5">{formatDuration(bracketEngagement.today.avgViewDuration)} today</p>
            )}
          </div>
        </div>

        {/* Charts row */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-5">
          <div>
            <p className="text-sm text-fg/40 mb-2">Tab Breakdown</p>
            {bracketTabData.length > 0 ? (
              <HorizontalBarChart
                data={bracketTabData}
                dataKey="count"
                labelKey="name"
                color={chartTheme.colors.tertiary || '#f59e0b'}
                height={Math.max(100, bracketTabData.length * 32)}
              />
            ) : (
              <div className="h-[100px] flex items-center justify-center text-fg/30 text-sm">No data yet</div>
            )}
          </div>
          <div>
            <p className="text-sm text-fg/40 mb-2">Most Viewed Matchups</p>
            {bracketEngagement?.topMatchups?.length > 0 ? (
              <div className="space-y-2">
                {bracketEngagement.topMatchups.slice(0, 5).map((m, i) => {
                  const team1 = m.team1Name || (m.team1Id ? `Team ${m.team1Id}` : 'TBD');
                  const team2 = m.team2Name || (m.team2Id ? `Team ${m.team2Id}` : 'TBD');
                  return (
                    <div key={i} className="flex items-center justify-between p-2 rounded-lg bg-fg/5">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-sm font-medium text-fg/30 flex-shrink-0">#{i + 1}</span>
                        <span className="text-sm text-fg truncate">
                          {team1} vs {team2}
                        </span>
                      </div>
                      <span className="text-sm font-medium text-fg flex-shrink-0 ml-2">{m.views} views</span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="h-[100px] flex items-center justify-center text-fg/30 text-sm">No data yet</div>
            )}
          </div>
        </div>

        {/* Daily trend */}
        {bracketEngagement?.dailyTrend?.length > 0 && (
          <div>
            <p className="text-sm text-fg/40 mb-2">Daily Matchup Detail Views</p>
            <DashboardAreaChart
              data={bracketEngagement.dailyTrend}
              dataKeys={[{ key: 'count', label: 'Views', color: '#f59e0b' }]}
              height={160}
            />
          </div>
        )}
      </div>

      {/* Row 9: Non-Authenticated Visitors */}
      <div className="bg-surface rounded-xl p-5 border border-fg/5 mb-6">
        <div className="flex items-center gap-2 mb-4">
          <UserX className="w-4 h-4 text-red-400" />
          <h3 className="text-sm font-medium text-fg">Non-Authenticated Visitors</h3>
          <span className="text-sm text-fg/30">({range}D)</span>
        </div>

        {/* Summary stats */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-5">
          <div className="p-3 rounded-lg bg-fg/5">
            <p className="text-2xl font-bold text-fg">{anonymousUsage?.uniqueSessions?.toLocaleString() ?? 0}</p>
            <p className="text-sm text-fg/40">Unique Visitors</p>
          </div>
          <div className="p-3 rounded-lg bg-fg/5">
            <p className="text-2xl font-bold text-fg">{anonymousUsage?.totalEvents?.toLocaleString() ?? 0}</p>
            <p className="text-sm text-fg/40">Total Interactions</p>
          </div>
          <div className="p-3 rounded-lg bg-fg/5">
            <p className="text-2xl font-bold text-fg">
              {anonymousUsage?.uniqueSessions ? Math.round(anonymousUsage.totalEvents / anonymousUsage.uniqueSessions) : 0}
            </p>
            <p className="text-sm text-fg/40">Avg Interactions / Visitor</p>
          </div>
        </div>

        {/* Charts row */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-5">
          <div>
            <p className="text-sm text-fg/40 mb-2">Top Actions</p>
            {anonEventData.length > 0 ? (
              <HorizontalBarChart
                data={anonEventData}
                dataKey="count"
                labelKey="name"
                color={chartTheme.colors.tertiary || '#ef4444'}
                height={Math.max(120, anonEventData.length * 28)}
              />
            ) : (
              <div className="h-[120px] flex items-center justify-center text-fg/30 text-sm">No data yet</div>
            )}
          </div>
          <div>
            <p className="text-sm text-fg/40 mb-2">Sports Interest</p>
            {anonSportData.length > 0 ? (
              <HorizontalBarChart
                data={anonSportData}
                dataKey="count"
                labelKey="name"
                color={chartTheme.colors.quaternary}
                height={Math.max(120, anonSportData.length * 32)}
              />
            ) : (
              <div className="h-[120px] flex items-center justify-center text-fg/30 text-sm">No data yet</div>
            )}
          </div>
        </div>

        {/* Daily trend */}
        {anonymousUsage?.dailyTrend?.length > 0 && (
          <div>
            <p className="text-sm text-fg/40 mb-2">Daily Anonymous Activity</p>
            <DashboardAreaChart
              data={anonymousUsage.dailyTrend}
              dataKeys={[
                { key: 'sessions', label: 'Visitors', color: '#ef4444' },
                { key: 'events', label: 'Interactions', color: chartTheme.colors.quaternary },
              ]}
              height={160}
            />
          </div>
        )}
      </div>

      {/* Row 10: Mobile vs Desktop */}
      <div className="bg-surface rounded-xl p-5 border border-fg/5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium text-fg">Mobile vs Desktop</h3>
          <Monitor className="w-4 h-4 text-fg/30" />
        </div>

        {/* Summary stats */}
        <div className="grid grid-cols-3 gap-4">
          <div>
            <p className="text-sm text-fg/40">Mobile</p>
            <p className="text-2xl font-bold text-fg">{mobilePct}%</p>
            <p className="text-sm text-fg/30">{mobileViews.toLocaleString()} views</p>
          </div>
          <div>
            <p className="text-sm text-fg/40">Desktop</p>
            <p className="text-2xl font-bold text-fg">{desktopPct}%</p>
            <p className="text-sm text-fg/30">{desktopViews.toLocaleString()} views</p>
          </div>
          <div>
            <p className="text-sm text-fg/40">Total</p>
            <p className="text-2xl font-bold text-fg">{totalDeviceViews.toLocaleString()}</p>
            <p className="text-sm text-fg/30">page views</p>
          </div>
        </div>

        {/* Charts */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <p className="text-sm text-fg/40 mb-2">Page Views by Device</p>
            {devicePageViewData.length > 0 ? (
              <HorizontalBarChart data={devicePageViewData} />
            ) : (
              <div className="h-[120px] flex items-center justify-center text-fg/30 text-sm">No data yet</div>
            )}
          </div>
          <div>
            <p className="text-sm text-fg/40 mb-2">Unique Users by Device</p>
            {deviceUniqueUserData.length > 0 ? (
              <HorizontalBarChart data={deviceUniqueUserData} />
            ) : (
              <div className="h-[120px] flex items-center justify-center text-fg/30 text-sm">No data yet</div>
            )}
          </div>
        </div>

        {/* Daily trend */}
        {deviceBreakdown?.dailyTrend?.length > 0 && (
          <div>
            <p className="text-sm text-fg/40 mb-2">Daily Device Trend</p>
            <DashboardAreaChart
              data={deviceBreakdown.dailyTrend}
              dataKeys={[
                { key: 'desktop', label: 'Desktop', color: chartTheme.colors.primary },
                { key: 'mobile', label: 'Mobile', color: chartTheme.colors.secondary },
                { key: 'tablet', label: 'Tablet', color: chartTheme.colors.quaternary },
              ]}
              height={160}
            />
          </div>
        )}
      </div>

      {/* Row 11: Recent Signups & Quick Actions */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Recent Signups */}
        <div className="bg-surface rounded-xl p-5 border border-fg/5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-medium text-fg">Recent Signups</h3>
            <Link to="/admin/users" className="text-sm text-fg/40 hover:text-fg/60 transition-colors">
              View all →
            </Link>
          </div>
          {stats?.recentSignups?.length > 0 ? (
            <div className="space-y-3">
              {stats.recentSignups.map(user => (
                <div key={user.id} className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-fg/10 flex items-center justify-center overflow-hidden flex-shrink-0">
                    {user.profileImageUrl ? (
                      <img src={user.profileImageUrl} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-sm font-medium text-fg/40">
                        {(user.displayName || '?')[0].toUpperCase()}
                      </span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-fg truncate">
                      {user.displayName || 'Unnamed'}
                    </p>
                    <p className="text-sm text-fg/40 truncate">
                      {user.email || 'No email'}
                    </p>
                  </div>
                  <p className="text-sm text-fg/30 flex-shrink-0">
                    {timeAgo(user.createdAt)}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-fg/30">No signups yet</p>
          )}
        </div>

        {/* Quick Actions */}
        <div className="bg-surface rounded-xl p-5 border border-fg/5">
          <h3 className="text-sm font-medium text-fg mb-3">Quick Actions</h3>
          <div className="flex flex-wrap gap-2">
            <Link
              to="/admin/ncaab/reports"
              className="px-3 py-2 text-sm text-fg/60 bg-fg/5 rounded-lg hover:bg-fg/10 transition-colors"
            >
              Generate Reports
            </Link>
            <Link
              to="/admin/users"
              className="px-3 py-2 text-sm text-fg/60 bg-fg/5 rounded-lg hover:bg-fg/10 transition-colors"
            >
              View Users
            </Link>
            <Link
              to="/admin/chat"
              className="px-3 py-2 text-sm text-fg/60 bg-fg/5 rounded-lg hover:bg-fg/10 transition-colors"
            >
              Moderate Chat
            </Link>
            <Link
              to="/admin/announcements"
              className="px-3 py-2 text-sm text-fg/60 bg-fg/5 rounded-lg hover:bg-fg/10 transition-colors"
            >
              Send Announcement
            </Link>
            <a
              href="https://console.firebase.google.com/project/survivorszn/analytics"
              target="_blank"
              rel="noopener noreferrer"
              className="px-3 py-2 text-sm text-fg/60 bg-fg/5 rounded-lg hover:bg-fg/10 transition-colors flex items-center gap-1.5"
            >
              <span>Firebase Analytics</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>
        </div>
      </div>

      {/* Online Users Dialog */}
      {onlineUsersDialogOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setOnlineUsersDialogOpen(false)} />
          <div className="relative bg-elevated rounded-xl shadow-2xl border border-fg/10 w-full max-w-md max-h-[70vh] flex flex-col animate-in">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-fg/10">
              <div className="flex items-center gap-2.5">
                <div className="flex items-center gap-1.5">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                  </span>
                </div>
                <h2 className="text-lg font-display font-bold text-fg">Online Now</h2>
                <span className="text-sm text-fg/40">({onlineUsersList.length})</span>
              </div>
              <button
                onClick={() => setOnlineUsersDialogOpen(false)}
                className="p-1.5 rounded-lg hover:bg-fg/10 transition-colors"
                aria-label="Close"
              >
                <X className="w-5 h-5 text-fg/50" />
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto px-5 py-3">
              {onlineUsersLoading ? (
                <div className="flex items-center justify-center py-8">
                  <div className="w-6 h-6 border-2 border-fg/20 border-t-fg/60 rounded-full animate-spin" />
                </div>
              ) : onlineUsersList.length === 0 ? (
                <p className="text-sm text-fg/40 text-center py-8">No users online right now</p>
              ) : (
                <div className="space-y-2">
                  {onlineUsersList.map(u => (
                    <Link
                      key={u.id}
                      to={`/admin/users/${u.id}`}
                      onClick={() => setOnlineUsersDialogOpen(false)}
                      className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-fg/5 transition-colors"
                    >
                      <Avatar
                        userId={u.id}
                        name={u.displayName || 'User'}
                        imageUrl={u.profileImageUrl}
                        size="sm"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-fg truncate">
                          {u.displayName || 'Unnamed'}
                        </p>
                        <p className="text-sm text-fg/40 truncate">
                          {u.email || u.phone || ''}
                        </p>
                      </div>
                      <span className="relative flex h-2 w-2 flex-shrink-0">
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                      </span>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Top Pages Detail Dialog */}
      {topPagesDetailOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setTopPagesDetailOpen(false)} />
          <div className="relative bg-elevated rounded-xl shadow-2xl border border-fg/10 w-full max-w-lg max-h-[70vh] flex flex-col animate-in">
            <div className="flex items-center justify-between px-5 py-4 border-b border-fg/10">
              <div className="flex items-center gap-2.5">
                <BarChart3 className="w-4 h-4 text-violet-400" />
                <h2 className="text-lg font-display font-bold text-fg">{topPagesDetailLabel}</h2>
                {topPagesDetailData && (
                  <span className="text-sm text-fg/40">({topPagesDetailData.totalViews?.toLocaleString()} total views)</span>
                )}
              </div>
              <button
                onClick={() => setTopPagesDetailOpen(false)}
                className="p-1.5 rounded-lg hover:bg-fg/10 transition-colors"
              >
                <X className="w-5 h-5 text-fg/50" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-3">
              {topPagesDetailLoading ? (
                <div className="flex items-center justify-center py-8">
                  <div className="w-6 h-6 border-2 border-fg/20 border-t-fg/60 rounded-full animate-spin" />
                </div>
              ) : !topPagesDetailData?.breakdown?.length ? (
                <p className="text-sm text-fg/40 text-center py-8">
                  {topPagesDetailData?.totalViews
                    ? `${topPagesDetailData.totalViews.toLocaleString()} total views — no per-league breakdown available for this page.`
                    : 'No data available'}
                </p>
              ) : (
                <div className="space-y-1">
                  {topPagesDetailData.breakdown.map((item, i) => (
                    <Link
                      key={item.entityId}
                      to={`/admin/leagues/${item.entityId}`}
                      onClick={() => setTopPagesDetailOpen(false)}
                      className="flex items-center justify-between p-3 rounded-lg hover:bg-fg/5 transition-colors"
                    >
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <span className="text-sm font-medium text-fg/30 flex-shrink-0 w-6 text-right">#{i + 1}</span>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-fg truncate">{item.entityName}</p>
                          <p className="text-sm text-fg/30 font-mono truncate">{item.entityId.substring(0, 8)}...</p>
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0 ml-3">
                        <p className="text-sm font-medium text-fg">{item.views.toLocaleString()} views</p>
                        <p className="text-sm text-fg/30">{item.uniqueVisitors} unique</p>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Bracket Engagement Detail Dialog */}
      {bracketDetailOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setBracketDetailOpen(false)} />
          <div className="relative bg-elevated rounded-xl shadow-2xl border border-fg/10 w-full max-w-lg max-h-[70vh] flex flex-col animate-in">
            <div className="flex items-center justify-between px-5 py-4 border-b border-fg/10">
              <div className="flex items-center gap-2.5">
                <Trophy className="w-4 h-4 text-amber-400" />
                <h2 className="text-lg font-display font-bold text-fg">{bracketDetailTitle}</h2>
              </div>
              <button
                onClick={() => setBracketDetailOpen(false)}
                className="p-1.5 rounded-lg hover:bg-fg/10 transition-colors"
              >
                <X className="w-5 h-5 text-fg/50" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-3">
              {bracketDetailLoading ? (
                <div className="flex items-center justify-center py-8">
                  <div className="w-6 h-6 border-2 border-fg/20 border-t-fg/60 rounded-full animate-spin" />
                </div>
              ) : !bracketDetailData?.items?.length ? (
                <p className="text-sm text-fg/40 text-center py-8">No data available</p>
              ) : bracketDetailData.metric === 'matchupDetails' ? (
                <div className="space-y-1">
                  {bracketDetailData.items.map((m, i) => {
                    const team1 = m.team1Name || (m.team1Id ? `Team ${m.team1Id}` : 'TBD');
                    const team2 = m.team2Name || (m.team2Id ? `Team ${m.team2Id}` : 'TBD');
                    return (
                      <div key={i} className="flex items-center justify-between p-3 rounded-lg bg-fg/5">
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          <span className="text-sm font-medium text-fg/30 flex-shrink-0 w-6 text-right">#{i + 1}</span>
                          <span className="text-sm text-fg truncate">{team1} vs {team2}</span>
                        </div>
                        <div className="text-right flex-shrink-0 ml-3">
                          <p className="text-sm font-medium text-fg">{m.views} views</p>
                          <p className="text-sm text-fg/30">{m.uniqueUsers} unique</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : bracketDetailData.metric === 'uniqueUsers' ? (
                <div className="space-y-1">
                  {bracketDetailData.items.map((u, i) => (
                    <Link
                      key={u.userId}
                      to={`/admin/users/${u.userId}`}
                      onClick={() => setBracketDetailOpen(false)}
                      className="flex items-center gap-3 p-3 rounded-lg hover:bg-fg/5 transition-colors"
                    >
                      <span className="text-sm font-medium text-fg/30 flex-shrink-0 w-6 text-right">#{i + 1}</span>
                      <Avatar
                        userId={u.userId}
                        name={u.displayName || 'User'}
                        imageUrl={u.profileImageUrl}
                        size="sm"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-fg truncate">{u.displayName || 'Unnamed'}</p>
                        <p className="text-sm text-fg/40 truncate">{u.email || ''}</p>
                      </div>
                      <span className="text-sm font-medium text-fg flex-shrink-0">{u.views} views</span>
                    </Link>
                  ))}
                </div>
              ) : (
                <div className="space-y-1">
                  {bracketDetailData.items.map((item, i) => (
                    <div key={i} className="flex items-center justify-between p-3 rounded-lg bg-fg/5">
                      <span className="text-sm text-fg">{item.tabLabel || item.tab}</span>
                      <div className="text-right flex-shrink-0 ml-3">
                        <p className="text-sm font-medium text-fg">{item.count} switches</p>
                        <p className="text-sm text-fg/30">{item.uniqueUsers} unique</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Schedule Engagement Detail Dialog */}
      {schedDetailOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setSchedDetailOpen(false)} />
          <div className="relative bg-elevated rounded-xl shadow-2xl border border-fg/10 w-full max-w-lg max-h-[70vh] flex flex-col animate-in">
            <div className="flex items-center justify-between px-5 py-4 border-b border-fg/10">
              <div className="flex items-center gap-2.5">
                <Gamepad2 className="w-4 h-4 text-blue-400" />
                <h2 className="text-lg font-display font-bold text-fg">{schedDetailTitle}</h2>
              </div>
              <button
                onClick={() => setSchedDetailOpen(false)}
                className="p-1.5 rounded-lg hover:bg-fg/10 transition-colors"
              >
                <X className="w-5 h-5 text-fg/50" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-3">
              {schedDetailLoading ? (
                <div className="flex items-center justify-center py-8">
                  <div className="w-6 h-6 border-2 border-fg/20 border-t-fg/60 rounded-full animate-spin" />
                </div>
              ) : !schedDetailData?.items?.length ? (
                <p className="text-sm text-fg/40 text-center py-8">No data available</p>
              ) : schedDetailData.metric === 'gameCardExpands' ? (
                <div className="space-y-1">
                  {schedDetailData.items.map((g, i) => (
                    <div key={i} className="flex items-center justify-between p-3 rounded-lg bg-fg/5">
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <span className="text-sm font-medium text-fg/30 flex-shrink-0 w-6 text-right">#{i + 1}</span>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-fg truncate">{g.gameName || g.gameId}</p>
                          <p className="text-sm text-fg/30">{g.sportLabel}</p>
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0 ml-3">
                        <p className="text-sm font-medium text-fg">{g.views} opens</p>
                        <p className="text-sm text-fg/30">{g.uniqueUsers} unique · {formatDuration(g.avgDuration)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : schedDetailData.metric === 'uniqueUsers' ? (
                <div className="space-y-1">
                  {schedDetailData.items.map((u, i) => (
                    <Link
                      key={u.userId}
                      to={`/admin/users/${u.userId}`}
                      onClick={() => setSchedDetailOpen(false)}
                      className="flex items-center gap-3 p-3 rounded-lg hover:bg-fg/5 transition-colors"
                    >
                      <span className="text-sm font-medium text-fg/30 flex-shrink-0 w-6 text-right">#{i + 1}</span>
                      <Avatar
                        userId={u.userId}
                        name={u.displayName || 'User'}
                        imageUrl={u.profileImageUrl}
                        size="sm"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-fg truncate">{u.displayName || 'Unnamed'}</p>
                        <p className="text-sm text-fg/40 truncate">{u.email || ''}</p>
                      </div>
                      <span className="text-sm font-medium text-fg flex-shrink-0">{u.views} opens</span>
                    </Link>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
