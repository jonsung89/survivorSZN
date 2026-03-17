import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Users, LogIn, Activity, UserPlus, Trophy, MessageSquare,
  Target, Monitor, ExternalLink, Eye, Globe, RefreshCw,
  BarChart3, Calendar, UserX, Gamepad2,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { adminAPI } from '../../api';
import Loading from '../../components/Loading';
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
  team1: 'Team 1',
  team2: 'Team 2',
  matchup: 'Matchup',
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
        const [sched, bracket, anon] = await Promise.all([
          adminAPI.getScheduleEngagement(range),
          adminAPI.getBracketEngagement(range),
          adminAPI.getAnonymousUsage(range),
        ]);
        setScheduleEngagement(sched);
        setBracketEngagement(bracket);
        setAnonymousUsage(anon);
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

  // Bracket engagement chart data
  const bracketTabData = (bracketEngagement?.tabBreakdown || []).map(r => ({
    name: TAB_LABELS[r.tab] || r.tab,
    count: r.count,
  }));

  // Anonymous usage chart data
  const anonEventData = (anonymousUsage?.topEvents || []).map(r => ({
    name: formatEventName(r.event),
    count: r.count,
  }));
  const anonSportData = (anonymousUsage?.sportBreakdown || []).map(r => ({
    name: SPORT_LABELS[r.sportId] || r.sportId?.toUpperCase(),
    count: r.count,
  }));

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
              data={topPages}
              dataKey="views"
              labelKey="path"
              color={chartTheme.colors.quaternary}
              height={Math.max(200, topPages.length * 30)}
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
        <div className="flex items-center gap-2 mb-4">
          <Gamepad2 className="w-4 h-4 text-blue-400" />
          <h3 className="text-sm font-medium text-fg">Schedule & Gamecast Engagement</h3>
          <span className="text-sm text-fg/30">({range}D)</span>
        </div>

        {/* Summary stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-5">
          <div className="p-3 rounded-lg bg-fg/5">
            <p className="text-2xl font-bold text-fg">{scheduleEngagement?.gameCardExpands?.total?.toLocaleString() ?? 0}</p>
            <p className="text-sm text-fg/40">Game Cards Opened</p>
          </div>
          <div className="p-3 rounded-lg bg-fg/5">
            <p className="text-2xl font-bold text-fg">{scheduleEngagement?.gameCardExpands?.uniqueUsers?.toLocaleString() ?? 0}</p>
            <p className="text-sm text-fg/40">Unique Users</p>
          </div>
          <div className="p-3 rounded-lg bg-fg/5">
            <p className="text-2xl font-bold text-fg">{formatDuration(scheduleEngagement?.avgViewDuration)}</p>
            <p className="text-sm text-fg/40">Avg View Time</p>
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
                    <th className="text-left py-2 font-medium">Game ID</th>
                    <th className="text-left py-2 font-medium">Sport</th>
                    <th className="text-right py-2 font-medium">Opens</th>
                    <th className="text-right py-2 font-medium">Avg Duration</th>
                  </tr>
                </thead>
                <tbody>
                  {scheduleEngagement.topGames.slice(0, 5).map((g, i) => (
                    <tr key={i} className="border-b border-fg/5">
                      <td className="py-2 text-fg/70 font-mono">{g.gameId?.substring(0, 16)}</td>
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
        <div className="flex items-center gap-2 mb-4">
          <Trophy className="w-4 h-4 text-amber-400" />
          <h3 className="text-sm font-medium text-fg">March Madness Engagement</h3>
          <span className="text-sm text-fg/30">({range}D)</span>
        </div>

        {/* Summary stats */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-5">
          <div className="p-3 rounded-lg bg-fg/5">
            <p className="text-2xl font-bold text-fg">{bracketEngagement?.matchupDetailsOpened?.total?.toLocaleString() ?? 0}</p>
            <p className="text-sm text-fg/40">Matchup Details Viewed</p>
          </div>
          <div className="p-3 rounded-lg bg-fg/5">
            <p className="text-2xl font-bold text-fg">{bracketEngagement?.matchupDetailsOpened?.uniqueUsers?.toLocaleString() ?? 0}</p>
            <p className="text-sm text-fg/40">Unique Users</p>
          </div>
          <div className="p-3 rounded-lg bg-fg/5">
            <p className="text-2xl font-bold text-fg">{formatDuration(bracketEngagement?.avgViewDuration)}</p>
            <p className="text-sm text-fg/40">Avg Time per Matchup</p>
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
                {bracketEngagement.topMatchups.slice(0, 5).map((m, i) => (
                  <div key={i} className="flex items-center justify-between p-2 rounded-lg bg-fg/5">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-fg/30">#{i + 1}</span>
                      <span className="text-sm text-fg">
                        {m.team1Id ? `Slot ${m.slot}` : `Slot ${m.slot}`}
                      </span>
                    </div>
                    <span className="text-sm font-medium text-fg">{m.views} views</span>
                  </div>
                ))}
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

      {/* Row 10: Recent Signups & Quick Actions */}
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
    </div>
  );
}
