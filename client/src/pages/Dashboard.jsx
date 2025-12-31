import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { 
  Trophy, 
  AlertTriangle, 
  ChevronRight, 
  Plus,
  Users
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { leagueAPI, userAPI, nflAPI } from '../api';
import Loading from '../components/Loading';

export default function Dashboard() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [leagues, setLeagues] = useState([]);
  const [pendingPicks, setPendingPicks] = useState([]);
  const [seasonInfo, setSeasonInfo] = useState(null);

  useEffect(() => {
    loadDashboard();
  }, []);

  const loadDashboard = async () => {
    try {
      const [leaguesData, pendingData, seasonData] = await Promise.all([
        leagueAPI.getMyLeagues(),
        userAPI.getPendingPicks(),
        nflAPI.getSeason()
      ]);

      // Handle new API response format: { success: true, leagues: [...] }
      if (leaguesData.success && leaguesData.leagues) {
        setLeagues(leaguesData.leagues);
      } else if (Array.isArray(leaguesData)) {
        setLeagues(leaguesData);
      } else {
        setLeagues([]);
      }

      // Handle pending picks response
      if (pendingData.success && pendingData.pendingPicks) {
        setPendingPicks(pendingData.pendingPicks);
      } else if (pendingData.pendingPicks) {
        setPendingPicks(pendingData.pendingPicks);
      } else {
        setPendingPicks([]);
      }

      setSeasonInfo(seasonData);
    } catch (error) {
      console.error('Failed to load dashboard:', error);
    }
    setLoading(false);
  };

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <Loading text="Loading dashboard..." />
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-3 sm:px-4 py-4 sm:py-8">
      {/* Welcome Header */}
      <div className="mb-6 sm:mb-8 animate-in">
        <h1 className="text-2xl sm:text-3xl font-display font-bold text-white">
          Welcome back, {user?.displayName || 'Player'}!
        </h1>
        <p className="text-white/60 mt-1 text-sm sm:text-base">
          {seasonInfo ? `Week ${seasonInfo.week} • ${seasonInfo.season} Season` : 'Loading season info...'}
        </p>
      </div>

      {/* Pending Picks Alert */}
      {pendingPicks.length > 0 && (
        <div className="mb-6 sm:mb-8 animate-in" style={{ animationDelay: '50ms' }}>
          <div className="bg-gradient-to-r from-amber-500/20 to-orange-500/20 border border-amber-500/30 rounded-xl p-3 sm:p-4">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-lg bg-amber-500/20 flex items-center justify-center flex-shrink-0">
                <AlertTriangle className="w-4 h-4 sm:w-5 sm:h-5 text-amber-400" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-amber-300 text-sm sm:text-base">
                  You have {pendingPicks.length} pending pick{pendingPicks.length > 1 ? 's' : ''}!
                </h3>
                <p className="text-amber-200/70 text-xs sm:text-sm mt-1">
                  Make your Week {seasonInfo?.week} selections before games start
                </p>
                <div className="flex flex-wrap gap-2 mt-3">
                  {pendingPicks.map(pick => (
                    <Link
                      key={pick.leagueId}
                      to={`/league/${pick.leagueId}/pick`}
                      className="inline-flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 active:bg-amber-500/40 text-amber-200 text-xs sm:text-sm transition-colors"
                    >
                      <Trophy className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                      <span className="truncate max-w-[120px] sm:max-w-none">{pick.leagueName}</span>
                      <ChevronRight className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                    </Link>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Leagues Section */}
      <div className="animate-in" style={{ animationDelay: '100ms' }}>
        <div className="flex items-center justify-between mb-3 sm:mb-4">
          <h2 className="text-lg sm:text-xl font-display font-semibold text-white">My Leagues</h2>
          <Link
            to="/leagues"
            className="text-sm text-white/60 hover:text-white flex items-center gap-1 transition-colors"
          >
            View All
            <ChevronRight className="w-4 h-4" />
          </Link>
        </div>

        {leagues.length === 0 ? (
          <div className="glass-card rounded-xl p-6 sm:p-8 text-center">
            <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-white/5 flex items-center justify-center mx-auto mb-4">
              <Trophy className="w-7 h-7 sm:w-8 sm:h-8 text-white/30" />
            </div>
            <h3 className="text-base sm:text-lg font-semibold text-white mb-2">No leagues yet</h3>
            <p className="text-white/50 text-sm mb-4">Join a league or create your own to get started</p>
            <div className="flex flex-col sm:flex-row justify-center gap-2 sm:gap-3">
              <Link to="/leagues/join" className="btn-secondary text-sm py-2.5">
                Join League
              </Link>
              <Link to="/leagues/create" className="btn-primary text-sm py-2.5">
                <Plus className="w-4 h-4 mr-2 inline" />
                Create League
              </Link>
            </div>
          </div>
        ) : (
          <div className="grid gap-3 sm:gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {leagues.slice(0, 6).map((league, i) => (
              <Link
                key={league.id}
                to={`/league/${league.id}`}
                className="glass-card rounded-xl p-4 sm:p-5 hover:bg-white/[0.06] active:bg-white/[0.08] transition-all group animate-in"
                style={{ animationDelay: `${350 + i * 50}ms` }}
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
                    <div className={`w-10 h-10 sm:w-12 sm:h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${
                      league.memberStatus === 'eliminated' 
                        ? 'bg-red-500/20' 
                        : 'bg-gradient-to-br from-nfl-blue to-blue-700'
                    }`}>
                      <Trophy className={`w-5 h-5 sm:w-6 sm:h-6 ${
                        league.memberStatus === 'eliminated' ? 'text-red-400' : 'text-white'
                      }`} />
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-semibold text-white group-hover:text-white/90 transition-colors text-sm sm:text-base truncate">
                        {league.name}
                      </h3>
                      <p className="text-white/50 text-xs sm:text-sm">
                        {league.memberCount} member{league.memberCount !== 1 ? 's' : ''}
                      </p>
                    </div>
                  </div>
                  <ChevronRight className="w-5 h-5 text-white/30 group-hover:text-white/60 transition-colors flex-shrink-0" />
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`badge text-xs ${
                      league.memberStatus === 'active' ? 'badge-active' : 'badge-eliminated'
                    }`}>
                      {league.memberStatus === 'active' ? 'Active' : 'Eliminated'}
                    </span>
                    {league.isCommissioner && (
                      <span className="badge bg-purple-500/20 text-purple-300 text-xs">
                        Commish
                      </span>
                    )}
                  </div>
                  
                  {/* Strike dots */}
                  <div className="flex gap-1">
                    {Array.from({ length: league.maxStrikes }).map((_, j) => (
                      <div
                        key={j}
                        className={`strike-dot ${
                          j < league.strikes ? 'strike-dot-filled' : 'strike-dot-empty'
                        }`}
                      />
                    ))}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Quick Actions */}
      <div className="mt-6 sm:mt-8 grid gap-3 sm:gap-4 sm:grid-cols-2 animate-in" style={{ animationDelay: '500ms' }}>
        <Link
          to="/leagues/create"
          className="glass-card rounded-xl p-4 sm:p-5 hover:bg-white/[0.06] active:bg-white/[0.08] transition-all group flex items-center gap-3 sm:gap-4"
        >
          <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-gradient-to-br from-green-500 to-green-600 flex items-center justify-center flex-shrink-0">
            <Plus className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-white text-sm sm:text-base">Create a League</h3>
            <p className="text-white/50 text-xs sm:text-sm">Start your own survivor pool</p>
          </div>
          <ChevronRight className="w-5 h-5 text-white/30 group-hover:text-white/60 transition-colors flex-shrink-0" />
        </Link>

        <Link
          to="/leagues/join"
          className="glass-card rounded-xl p-4 sm:p-5 hover:bg-white/[0.06] active:bg-white/[0.08] transition-all group flex items-center gap-3 sm:gap-4"
        >
          <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center flex-shrink-0">
            <Users className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-white text-sm sm:text-base">Join a League</h3>
            <p className="text-white/50 text-xs sm:text-sm">Find and join existing pools</p>
          </div>
          <ChevronRight className="w-5 h-5 text-white/30 group-hover:text-white/60 transition-colors flex-shrink-0" />
        </Link>
      </div>
    </div>
  );
}