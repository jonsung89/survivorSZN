import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Trophy, Users, Plus, Search, ChevronRight, AlertCircle } from 'lucide-react';
import { leagueAPI } from '../api';
import { useAuth } from '../context/AuthContext';
import Loading from '../components/Loading';

export default function Leagues() {
  const { user } = useAuth();
  const [leagues, setLeagues] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    
    const loadLeagues = async () => {
      try {
        setLoading(true);
        setError(null);
        const result = await leagueAPI.getMyLeagues();
        
        if (cancelled) return;
        
        if (result.success && result.leagues) {
          setLeagues(result.leagues);
        } else if (Array.isArray(result.leagues)) {
          setLeagues(result.leagues);
        } else if (result.error) {
          setError(result.error);
        }
      } catch (err) {
        console.error('Failed to load leagues:', err);
        if (!cancelled) {
          setError('Failed to load leagues');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };
    
    loadLeagues();
    
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return <Loading fullScreen />;
  }

  return (
    <div className="max-w-4xl mx-auto px-3 sm:px-4 py-4 sm:py-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 sm:mb-8  animate-in">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-white">My Leagues</h1>
          <p className="text-white/60 mt-1 text-sm sm:text-base">Manage your survivor pools</p>
        </div>
        <div className="flex items-center gap-2 sm:gap-3">
          <Link
            to="/leagues/join"
            className="btn-secondary flex items-center gap-2 text-sm py-2.5 flex-1 sm:flex-none justify-center"
          >
            <Search className="w-4 h-4" />
            <span>Join</span>
          </Link>
          <Link
            to="/leagues/create"
            className="btn-primary flex items-center gap-2 text-sm py-2.5 flex-1 sm:flex-none justify-center"
          >
            <Plus className="w-4 h-4" />
            <span>Create</span>
          </Link>
        </div>
      </div>

      {/* Error State */}
      {error && (
        <div className="glass-card rounded-xl sm:rounded-2xl p-4 sm:p-6 mb-4 sm:mb-6 border border-red-500/30">
          <div className="flex items-center gap-3 text-red-400 text-sm sm:text-base">
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            <p>{error}</p>
          </div>
        </div>
      )}

      {/* Leagues List */}
      {leagues.length > 0 ? (
        <div className="space-y-3 sm:space-y-4">
          {leagues.map((league, index) => (
            <Link
              key={league.id}
              to={`/league/${league.id}`}
              className="glass-card rounded-xl sm:rounded-2xl p-4 sm:p-6 block hover:bg-white/10 active:bg-white/15 transition-all group"
            >
              <div className="flex items-center gap-3 sm:gap-4">
                <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-xl bg-gradient-to-br from-nfl-blue to-blue-700 flex items-center justify-center shadow-lg flex-shrink-0">
                  <Trophy className="w-6 h-6 sm:w-7 sm:h-7 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="text-base sm:text-xl font-semibold text-white/90 group-hover:text-white transition-colors truncate">
                      {league.name}
                    </h2>
                    {league.isCommissioner && (
                      <span className="badge badge-active text-xs">Commish</span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 sm:gap-4 mt-1 text-xs sm:text-sm text-white/60 flex-wrap">
                    <span className="flex items-center gap-1">
                      <Users className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                      {league.memberCount}
                    </span>
                    <span>{league.maxStrikes} strike{league.maxStrikes !== 1 ? 's' : ''}</span>
                    <span className="hidden sm:inline">Week {league.startWeek} start</span>
                  </div>
                </div>

                <div className="flex items-center gap-2 sm:gap-4 flex-shrink-0">
                  {/* Status & Strikes */}
                  <div className="flex flex-col sm:flex-row items-end sm:items-center gap-1.5 sm:gap-4">
                    <div className="flex items-center gap-1">
                      {Array.from({ length: league.maxStrikes }).map((_, i) => (
                        <div
                          key={i}
                          className={`w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full ${
                            i < league.strikes ? 'bg-red-500' : 'bg-white/20'
                          }`}
                        />
                      ))}
                    </div>
                    <span className={`badge text-xs ${
                      league.memberStatus === 'active' ? 'badge-active' : 'badge-eliminated'
                    }`}>
                      {league.memberStatus}
                    </span>
                  </div>
                  <ChevronRight className="w-5 h-5 text-white/40 group-hover:text-white/60 group-hover:translate-x-1 transition-all hidden sm:block" />
                </div>
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <div className="glass-card rounded-xl sm:rounded-2xl p-8 sm:p-12 text-center">
          <Trophy className="w-12 h-12 sm:w-16 sm:h-16 text-white/20 mx-auto mb-4" />
          <h2 className="text-lg sm:text-xl font-semibold text-white mb-2">No leagues yet</h2>
          <p className="text-white/60 text-sm sm:text-base mb-6">Create a league or join an existing one to get started</p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-4">
            <Link to="/leagues/join" className="btn-secondary w-full sm:w-auto">
              Join League
            </Link>
            <Link to="/leagues/create" className="btn-primary w-full sm:w-auto">
              Create League
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}