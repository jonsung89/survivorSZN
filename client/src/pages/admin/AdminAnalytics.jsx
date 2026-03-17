import { useState, useEffect } from 'react';
import { BarChart3, Monitor, Smartphone, Sun, Moon, Eye, Clock, MousePointer } from 'lucide-react';
import { adminAPI } from '../../api';
import Loading from '../../components/Loading';

export default function AdminAnalytics() {
  const [stats, setStats] = useState(null);
  const [gamecastStats, setGamecastStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const [analyticsData, gamecastData] = await Promise.all([
          adminAPI.getAnalytics().catch(() => null),
          adminAPI.getGamecastAnalytics().catch(() => null),
        ]);
        setStats(analyticsData);
        setGamecastStats(gamecastData);
      } catch (err) {
        console.error('Failed to load analytics:', err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  if (loading) return <Loading />;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-display font-bold text-fg">Analytics</h1>
        <a
          href="https://console.firebase.google.com/project/survivorszn/analytics"
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm text-fg/40 hover:text-fg transition-colors"
        >
          Open Firebase Console
        </a>
      </div>

      {/* Info banner */}
      <div className="bg-surface rounded-xl border border-fg/5 p-4 mb-6">
        <p className="text-sm text-fg/50">
          General analytics (page views, device type, location, retention) are tracked via Firebase Analytics.
          View detailed reports in the Firebase console. Gamecast-specific metrics are shown below.
        </p>
      </div>

      {/* Gamecast Analytics */}
      <h2 className="text-lg font-display font-bold text-fg mb-4">Gamecast Sessions</h2>

      {!gamecastStats || !gamecastStats.topGames?.length ? (
        <div className="bg-surface rounded-xl border border-fg/5 p-8 text-center text-fg/40 text-sm">
          No gamecast session data yet. Sessions are recorded when users view gamecasts.
        </div>
      ) : (
        <div className="space-y-4">
          {/* Summary cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard
              icon={Eye}
              label="Total Sessions"
              value={gamecastStats.totalSessions}
              color="text-blue-400"
            />
            <StatCard
              icon={Clock}
              label="Avg Duration"
              value={formatDuration(gamecastStats.avgDuration)}
              color="text-emerald-400"
            />
            <StatCard
              icon={MousePointer}
              label="Avg Expand Clicks"
              value={gamecastStats.avgExpandClicks?.toFixed(1)}
              color="text-amber-400"
            />
            <StatCard
              icon={BarChart3}
              label="Unique Users"
              value={gamecastStats.uniqueUsers}
              color="text-purple-400"
            />
          </div>

          {/* Top games */}
          <div className="bg-surface rounded-xl border border-fg/5 overflow-hidden">
            <div className="px-4 py-3 border-b border-fg/10">
              <h3 className="text-sm font-medium text-fg">Top Games by Views</h3>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-fg/10">
                  <th className="text-left px-4 py-2 text-fg/50 font-medium">Game</th>
                  <th className="text-center px-4 py-2 text-fg/50 font-medium">Views</th>
                  <th className="text-center px-4 py-2 text-fg/50 font-medium hidden md:table-cell">Avg Duration</th>
                  <th className="text-center px-4 py-2 text-fg/50 font-medium hidden md:table-cell">Expand Clicks</th>
                </tr>
              </thead>
              <tbody>
                {gamecastStats.topGames.map((game, i) => (
                  <tr key={i} className="border-b border-fg/5 last:border-0">
                    <td className="px-4 py-2.5 text-fg">{game.gameId}</td>
                    <td className="px-4 py-2.5 text-center text-fg/60">{game.views}</td>
                    <td className="px-4 py-2.5 text-center text-fg/60 hidden md:table-cell">
                      {formatDuration(game.avgDuration)}
                    </td>
                    <td className="px-4 py-2.5 text-center text-fg/60 hidden md:table-cell">
                      {game.totalExpandClicks}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
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

function formatDuration(seconds) {
  if (!seconds) return '—';
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  return `${mins}m ${secs}s`;
}
