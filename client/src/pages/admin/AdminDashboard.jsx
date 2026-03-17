import { useState, useEffect } from 'react';
import { Users, Trophy, FileText, Brackets, MessageSquare, Activity, UserPlus, TrendingUp } from 'lucide-react';
import { Link } from 'react-router-dom';
import { adminAPI } from '../../api';
import Loading from '../../components/Loading';

const STAT_CARDS = [
  { key: 'userCount', label: 'Users', icon: Users, color: 'text-blue-400' },
  { key: 'leagueCount', label: 'Leagues', icon: Trophy, color: 'text-emerald-400' },
  { key: 'reportCount', label: 'Scouting Reports', icon: FileText, color: 'text-amber-400' },
  { key: 'bracketCount', label: 'Brackets', icon: Brackets, color: 'text-purple-400' },
];

export default function AdminDashboard() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    adminAPI.getStats()
      .then(setStats)
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <Loading />;
  if (error) return <div className="text-red-400 text-center py-8">{error}</div>;

  const maxSignup = Math.max(...(stats?.signupTrend?.map(d => d.count) || [1]), 1);
  const maxLeague = Math.max(...(stats?.leagueTrend?.map(d => d.count) || [1]), 1);

  return (
    <div>
      <h1 className="text-2xl font-display font-bold text-fg mb-6">Dashboard</h1>

      {/* Main stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {STAT_CARDS.map(({ key, label, icon: Icon, color }) => (
          <div key={key} className="bg-surface rounded-xl p-5 border border-fg/5">
            <div className="flex items-center gap-3 mb-3">
              <div className={`p-2 rounded-lg bg-fg/5 ${color}`}>
                <Icon className="w-5 h-5" />
              </div>
            </div>
            <p className="text-3xl font-display font-bold text-fg">
              {stats?.[key]?.toLocaleString() ?? '—'}
            </p>
            <p className="text-sm text-fg/50 mt-1">{label}</p>
          </div>
        ))}
      </div>

      {/* Active users + chat today */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <div className="bg-surface rounded-xl p-5 border border-fg/5">
          <div className="flex items-center gap-2 mb-4">
            <Activity className="w-4 h-4 text-emerald-400" />
            <h3 className="text-sm font-medium text-fg">Active Users</h3>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <p className="text-2xl font-display font-bold text-fg">
                {stats?.activeUsers?.day1?.toLocaleString() ?? '—'}
              </p>
              <p className="text-sm text-fg/40">24 hours</p>
            </div>
            <div>
              <p className="text-2xl font-display font-bold text-fg">
                {stats?.activeUsers?.day7?.toLocaleString() ?? '—'}
              </p>
              <p className="text-sm text-fg/40">7 days</p>
            </div>
            <div>
              <p className="text-2xl font-display font-bold text-fg">
                {stats?.activeUsers?.day30?.toLocaleString() ?? '—'}
              </p>
              <p className="text-sm text-fg/40">30 days</p>
            </div>
          </div>
        </div>

        <div className="bg-surface rounded-xl p-5 border border-fg/5">
          <div className="flex items-center gap-2 mb-4">
            <MessageSquare className="w-4 h-4 text-blue-400" />
            <h3 className="text-sm font-medium text-fg">Chat Activity</h3>
          </div>
          <p className="text-2xl font-display font-bold text-fg">
            {stats?.chatMessagesToday?.toLocaleString() ?? '—'}
          </p>
          <p className="text-sm text-fg/40">Messages today</p>
        </div>
      </div>

      {/* Trends */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        {/* Signup trend */}
        <div className="bg-surface rounded-xl p-5 border border-fg/5">
          <div className="flex items-center gap-2 mb-4">
            <UserPlus className="w-4 h-4 text-blue-400" />
            <h3 className="text-sm font-medium text-fg">New Users (30 days)</h3>
          </div>
          {stats?.signupTrend?.length > 0 ? (
            <MiniBarChart data={stats.signupTrend} max={maxSignup} color="bg-blue-400" />
          ) : (
            <p className="text-sm text-fg/30">No signups in the last 30 days</p>
          )}
        </div>

        {/* League trend */}
        <div className="bg-surface rounded-xl p-5 border border-fg/5">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp className="w-4 h-4 text-emerald-400" />
            <h3 className="text-sm font-medium text-fg">New Leagues (30 days)</h3>
          </div>
          {stats?.leagueTrend?.length > 0 ? (
            <MiniBarChart data={stats.leagueTrend} max={maxLeague} color="bg-emerald-400" />
          ) : (
            <p className="text-sm text-fg/30">No leagues created in the last 30 days</p>
          )}
        </div>
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
        </div>
      </div>
    </div>
  );
}

function MiniBarChart({ data, max, color }) {
  return (
    <div className="flex items-end gap-px h-16">
      {data.map((d, i) => {
        const height = Math.max((d.count / max) * 100, 4);
        const dateLabel = new Date(d.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
        return (
          <div
            key={i}
            className="flex-1 group relative"
            title={`${dateLabel}: ${d.count}`}
          >
            <div
              className={`${color} rounded-t-sm opacity-70 group-hover:opacity-100 transition-opacity`}
              style={{ height: `${height}%` }}
            />
          </div>
        );
      })}
    </div>
  );
}
