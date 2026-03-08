import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Trophy, Users, Plus, Search, ChevronRight, AlertCircle, X } from 'lucide-react';
import { leagueAPI } from '../api';
import { useAuth } from '../context/AuthContext';
import Loading from '../components/Loading';
import { getSportModule, getSportGradient } from '../sports';

export default function Leagues() {
  const { user } = useAuth();
  const [leagues, setLeagues] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [winnersDialog, setWinnersDialog] = useState({ open: false, leagueName: '', winners: [] });

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

  const currentLeagues = leagues.filter(l => !l.seasonOver);
  const pastLeagues = leagues.filter(l => l.seasonOver);

  const renderLeagueCard = (league) => {
    const sportMod = getSportModule(league.sportId || 'nfl');
    const isWinner = league.seasonOver && league.winners?.some(w => w.isMe);
    const isPast = league.seasonOver;

    return (
      <Link
        key={league.id}
        to={`/league/${league.id}`}
        className="glass-card rounded-xl sm:rounded-2xl p-4 sm:p-6 block hover:bg-white/10 active:bg-white/15 transition-all group"
      >
        <div className="flex items-center gap-3 sm:gap-4">
          <div className={`w-12 h-12 sm:w-14 sm:h-14 rounded-xl flex items-center justify-center shadow-lg flex-shrink-0 ${
            isWinner
              ? 'bg-gradient-to-br from-amber-500 to-yellow-600'
              : league.memberStatus === 'eliminated'
                ? 'bg-red-500/20'
                : `bg-gradient-to-br ${getSportGradient(league.sportId)}`
          }`}>
            <Trophy className={`w-6 h-6 sm:w-7 sm:h-7 ${
              isWinner ? 'text-white' : league.memberStatus === 'eliminated' ? 'text-red-400' : 'text-white'
            }`} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-base sm:text-xl font-semibold text-white/90 group-hover:text-white transition-colors truncate">
                {league.name}
              </h2>
              {league.isCommissioner && (
                <span className="badge badge-active text-xs">Commish</span>
              )}
              <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-white/10 text-white/40 uppercase">{sportMod.name}</span>
            </div>
            <div className="flex items-center gap-3 sm:gap-4 mt-1 text-xs sm:text-sm text-white/60 flex-wrap">
              <span className="flex items-center gap-1">
                <Users className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                {league.memberCount}
              </span>
              <span>{league.maxStrikes} strike{league.maxStrikes !== 1 ? 's' : ''}</span>
              <span className="hidden sm:inline">Week {league.startWeek} start</span>
              {isPast && <span className="text-white/40">{league.season} Season</span>}
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
              {isPast ? (
                isWinner ? (
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      setWinnersDialog({ open: true, leagueName: league.name, winners: league.winners });
                    }}
                    className="badge text-xs bg-amber-500/20 text-amber-400 border-amber-500/30 hover:bg-amber-500/30 transition-colors cursor-pointer"
                  >
                    Winner!{league.winners?.length > 1 && ` (+${league.winners.length - 1})`}
                  </button>
                ) : league.winners?.length > 0 ? (
                  league.winners.length <= 3 ? (
                    <span className="text-white/40 text-xs">Won by {league.winners.map(w => w.displayName).join(', ')}</span>
                  ) : (
                    <button
                      onClick={(e) => {
                        e.preventDefault();
                        setWinnersDialog({ open: true, leagueName: league.name, winners: league.winners });
                      }}
                      className="badge text-xs bg-white/10 text-white/50 border-white/20 hover:bg-white/15 hover:text-white/70 transition-colors cursor-pointer"
                    >
                      {league.winners.length} winners
                    </button>
                  )
                ) : league.memberStatus === 'eliminated' ? (
                  <span className="badge badge-eliminated text-xs">eliminated</span>
                ) : (
                  <span className="text-white/40 text-xs">Complete</span>
                )
              ) : (
                <span className={`badge text-xs ${
                  league.memberStatus === 'active' ? 'badge-active' : 'badge-eliminated'
                }`}>
                  {league.memberStatus}
                </span>
              )}
            </div>
            <ChevronRight className="w-5 h-5 text-white/40 group-hover:text-white/60 group-hover:translate-x-1 transition-all hidden sm:block" />
          </div>
        </div>
      </Link>
    );
  };

  return (
    <div className="max-w-4xl mx-auto px-3 sm:px-4 py-4 sm:py-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 sm:mb-8 animate-in">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-white">My Leagues</h1>
          <p className="text-white/60 mt-1 text-sm sm:text-base">Manage your leagues</p>
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
        <div className="space-y-6">
          {currentLeagues.length > 0 && (
            <div>
              <h3 className="text-xs font-medium text-white/40 uppercase tracking-wider mb-3">Current Season</h3>
              <div className="space-y-3 sm:space-y-4">
                {currentLeagues.map(league => renderLeagueCard(league))}
              </div>
            </div>
          )}
          {pastLeagues.length > 0 && (
            <div>
              <h3 className="text-xs font-medium text-white/40 uppercase tracking-wider mb-3">Past Seasons</h3>
              <div className="space-y-3 sm:space-y-4">
                {pastLeagues.map(league => renderLeagueCard(league))}
              </div>
            </div>
          )}
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

      {/* Winners Dialog */}
      {winnersDialog.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setWinnersDialog({ open: false, leagueName: '', winners: [] })}>
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" />
          <div className="glass-card rounded-2xl p-6 max-w-sm w-full relative z-10 animate-in" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-white">{winnersDialog.leagueName}</h3>
              <button onClick={() => setWinnersDialog({ open: false, leagueName: '', winners: [] })} className="text-white/40 hover:text-white/60 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-white/50 text-sm mb-3">{winnersDialog.winners.length} Winners</p>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {winnersDialog.winners.map((w, i) => (
                <div key={i} className="flex items-center gap-3 p-2 rounded-lg bg-white/5">
                  <Trophy className="w-4 h-4 text-amber-400 flex-shrink-0" />
                  <span className="text-white text-sm">{w.displayName}</span>
                  {w.isMe && <span className="text-amber-400 text-xs font-medium ml-auto">You</span>}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
