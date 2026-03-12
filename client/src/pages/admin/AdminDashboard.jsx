import { useState, useEffect } from 'react';
import { Users, Trophy, FileText, Brackets } from 'lucide-react';
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

  return (
    <div>
      <h1 className="text-2xl font-display font-bold text-fg mb-6">Dashboard</h1>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
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
    </div>
  );
}
