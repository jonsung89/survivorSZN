import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Trophy, Users, Plus, Search, ChevronRight, AlertCircle, X } from 'lucide-react';
import { leagueAPI } from '../api';
import { useAuth } from '../context/AuthContext';
import Loading from '../components/Loading';
import { getSportModule, getSportGradient, getSportBadgeClasses } from '../sports';
import SportBadge from '../components/SportBadge';
import CommishBadge from '../components/CommishBadge';
import AppIcon from '../components/AppIcon';
import LeagueMembersDialog from '../components/LeagueMembersDialog';

export default function Leagues() {
  const { user } = useAuth();
  const [leagues, setLeagues] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [winnersDialog, setWinnersDialog] = useState({ open: false, leagueName: '', winners: [], prizePool: 0 });
  const [bracketDialog, setBracketDialog] = useState({ open: false, leagueName: '', brackets: [], totalSubmitted: 0 });
  const [membersDialog, setMembersDialog] = useState({ open: false, leagueId: null, leagueName: '', defaultTab: 'winners' });

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
    const isBracketLeague = sportMod.gameType === 'bracket';
    const isWinner = league.seasonOver && league.winners?.some(w => w.isMe);
    const isPast = league.seasonOver;

    return (
      <Link
        key={league.id}
        to={`/league/${league.id}`}
        className="glass-card rounded-xl sm:rounded-2xl p-4 sm:p-6 block hover:bg-fg/10 active:bg-fg/15 transition-all group"
      >
        <div className="flex items-center gap-3 sm:gap-4">
          <button
            className="relative flex-shrink-0 hover:scale-105 transition-transform"
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); setMembersDialog({ open: true, leagueId: league.id, leagueName: league.name, defaultTab: 'winners' }); }}
          >
            <AppIcon
              className="w-12 h-12 sm:w-14 sm:h-14"
              color={league.memberStatus === 'eliminated' && !isWinner
                ? 'rgb(139 92 246 / 0.25)'
                : 'rgb(139 92 246)'}
            />
            {isWinner ? (
              <div className="absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full bg-amber-500 flex items-center justify-center shadow-sm">
                <Trophy className="w-3 h-3 text-white" />
              </div>
            ) : league.memberStatus === 'eliminated' && (
              <div className="absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full bg-red-500 flex items-center justify-center shadow-sm">
                <X className="w-3 h-3 text-white" strokeWidth={3} />
              </div>
            )}
          </button>
          <div className="flex-1 min-w-0 overflow-hidden">
            <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
              <h2 className="text-base sm:text-xl font-semibold text-fg/90 group-hover:text-fg transition-colors truncate min-w-0">
                {league.name}
              </h2>
              {league.isCommissioner && <CommishBadge />}
              <SportBadge sportId={league.sportId} />
            </div>
            <div className="flex items-center gap-3 sm:gap-4 mt-1 text-xs sm:text-sm text-fg/60 min-w-0 overflow-hidden">
              <span className="flex items-center gap-1 flex-shrink-0">
                <Users className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                {league.memberCount}
              </span>
              {!isBracketLeague && (
                <>
                  <span>{league.maxStrikes} strike{league.maxStrikes !== 1 ? 's' : ''}</span>
                  <span className="hidden sm:inline">Week {league.startWeek} start</span>
                </>
              )}
              {isBracketLeague && (() => {
                const bs = league.bracketStats;
                if (!bs || bs.brackets.length === 0) return <span className="text-fg/40 hidden sm:inline">No bracket</span>;
                const best = bs.brackets.find(b => b.isSubmitted) || bs.brackets[0];
                const submittedCount = bs.brackets.filter(b => b.isSubmitted).length;
                // Hide on mobile — shown on right side instead
                return best.isSubmitted ? (
                  <span className="font-semibold text-fg/80 hidden sm:inline">
                    {best.score} pts
                    {best.rank && bs.totalSubmitted > 1 && (
                      <span className="text-fg/40 font-normal"> · #{best.rank} of {bs.totalSubmitted}</span>
                    )}
                    {bs.brackets.length > 1 && (
                      <span className="text-fg/40 font-normal"> · {submittedCount}/{bs.brackets.length} brackets</span>
                    )}
                  </span>
                ) : best.pickCount >= best.totalPicks ? (
                  <span className="text-fg/60 hidden sm:inline">
                    {best.name || `Bracket ${best.bracketNumber}`}
                  </span>
                ) : (
                  <span className="text-fg/60 hidden sm:inline">
                    {best.name || `Bracket ${best.bracketNumber}`} · {best.pickCount}/{best.totalPicks} picks
                  </span>
                );
              })()}
              {isPast && <span className="text-fg/40">{league.season} Season</span>}
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-4 flex-shrink-0">
            {/* Status & Strikes */}
            <div className="flex flex-col sm:flex-row items-end sm:items-center gap-1.5 sm:gap-4">
              {!isBracketLeague ? (
                <div className="flex items-center gap-1">
                  {Array.from({ length: league.maxStrikes }).map((_, i) => (
                    <div
                      key={i}
                      className={`w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full ${
                        i < league.strikes ? 'bg-red-500' : 'bg-fg/20'
                      }`}
                    />
                  ))}
                </div>
              ) : league.bracketStats?.brackets?.length > 0 ? (() => {
                const bs = league.bracketStats;
                const hasSubmitted = bs.brackets.some(b => b.isSubmitted);
                const best = bs.brackets.find(b => b.isSubmitted) || bs.brackets[0];
                const submittedCount = bs.brackets.filter(b => b.isSubmitted).length;
                const bestUnsubmitted = bs.brackets.find(b => !b.isSubmitted);
                const allPicksDone = bestUnsubmitted && bestUnsubmitted.pickCount >= bestUnsubmitted.totalPicks;
                return (
                  <>
                    {/* Desktop: full badge */}
                    <span className={`hidden sm:inline badge text-xs ${
                      hasSubmitted ? 'badge-active'
                        : allPicksDone ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20'
                        : 'bg-fg/[0.06] text-fg/50 border-fg/10'
                    }`}>
                      {hasSubmitted ? `${best.score} pts` : allPicksDone ? 'Not submitted' : 'Incomplete'}
                    </span>
                    {/* Mobile: score badge or progress ring — tappable */}
                    <button
                      className="sm:hidden"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setBracketDialog({ open: true, leagueName: league.name, brackets: bs.brackets, totalSubmitted: bs.totalSubmitted });
                      }}
                    >
                      {hasSubmitted ? (
                        <span className="text-xs font-semibold px-2 py-0.5 rounded-md bg-green-500/15 text-green-500">
                          {best.score} pts
                        </span>
                      ) : allPicksDone ? (
                        <AlertCircle className="w-6 h-6 text-rose-500" />
                      ) : (() => {
                        const pct = best.pickCount / best.totalPicks;
                        const r = 10; const circ = 2 * Math.PI * r;
                        return (
                          <svg width="28" height="28" viewBox="0 0 28 28" className="block">
                            <circle cx="14" cy="14" r={r} fill="none" className="stroke-neutral-200 dark:stroke-neutral-600" strokeWidth="3" />
                            <circle cx="14" cy="14" r={r} fill="none" className="stroke-neutral-500 dark:stroke-neutral-300" strokeWidth="3"
                              strokeLinecap="round"
                              strokeDasharray={circ}
                              strokeDashoffset={circ * (1 - pct)}
                              transform="rotate(-90 14 14)"
                            />
                          </svg>
                        );
                      })()}
                    </button>
                  </>
                );
              })() : null}
              {isPast ? (
                isWinner ? (
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      const prizePool = league.prizePotOverride || (league.entryFee * league.memberCount) || 0;
                      setWinnersDialog({ open: true, leagueName: league.name, winners: league.winners, prizePool });
                    }}
                    className="hidden sm:inline text-xs font-semibold px-2 py-0.5 rounded-md bg-amber-500/15 text-amber-600 hover:bg-amber-500/25 transition-colors cursor-pointer"
                  >
                    Winner!{league.winners?.length > 1 && ` (+${league.winners.length - 1})`}
                  </button>
                ) : league.winners?.length > 0 ? (
                  league.winners.length <= 3 ? (
                    <span className="hidden sm:inline text-fg/40 text-xs">Won by {league.winners.map(w => w.displayName).join(', ')}</span>
                  ) : (
                    <button
                      onClick={(e) => {
                        e.preventDefault();
                        const prizePool = league.prizePotOverride || (league.entryFee * league.memberCount) || 0;
                        setWinnersDialog({ open: true, leagueName: league.name, winners: league.winners, prizePool });
                      }}
                      className="hidden sm:inline badge text-xs bg-fg/10 text-fg/50 border-fg/20 hover:bg-fg/15 hover:text-fg/70 transition-colors cursor-pointer"
                    >
                      {league.winners.length} winners
                    </button>
                  )
                ) : null
              ) : league.memberStatus === 'eliminated' ? (
                <span className="hidden sm:inline badge badge-eliminated text-xs">eliminated</span>
              ) : null}
            </div>
            <ChevronRight className="w-5 h-5 text-fg/40 group-hover:text-fg/60 group-hover:translate-x-1 transition-all hidden sm:block" />
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
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-fg">My Leagues</h1>
          <p className="text-fg/60 mt-1 text-sm sm:text-base">Manage your leagues</p>
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
              <h3 className="text-xs font-medium text-fg/40 uppercase tracking-wider mb-3">Current Season</h3>
              <div className="space-y-3 sm:space-y-4">
                {currentLeagues.map(league => renderLeagueCard(league))}
              </div>
            </div>
          )}
          {pastLeagues.length > 0 && (
            <div>
              <h3 className="text-xs font-medium text-fg/40 uppercase tracking-wider mb-3">Past Seasons</h3>
              <div className="space-y-3 sm:space-y-4">
                {pastLeagues.map(league => renderLeagueCard(league))}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="glass-card rounded-xl sm:rounded-2xl p-8 sm:p-12 text-center">
          <Trophy className="w-12 h-12 sm:w-16 sm:h-16 text-fg/20 mx-auto mb-4" />
          <h2 className="text-lg sm:text-xl font-semibold text-fg mb-2">No leagues yet</h2>
          <p className="text-fg/60 text-sm sm:text-base mb-6">Create a league or join an existing one to get started</p>
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
      {winnersDialog.open && (() => {
        const pool = winnersDialog.prizePool;
        const perWinner = pool && winnersDialog.winners.length > 0
          ? pool / winnersDialog.winners.length
          : 0;
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setWinnersDialog({ open: false, leagueName: '', winners: [], prizePool: 0 })}>
            <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" />
            <div className="bg-elevated border border-fg/10 rounded-2xl p-6 max-w-sm w-full relative z-10 animate-in shadow-xl" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-fg">{winnersDialog.leagueName}</h3>
                <button onClick={() => setWinnersDialog({ open: false, leagueName: '', winners: [], prizePool: 0 })} className="text-fg/40 hover:text-fg/60 transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>

              {pool > 0 && (
                <div className="flex items-center gap-4 mb-4 p-3 rounded-xl bg-gradient-to-r from-amber-600/10 to-orange-600/10 border border-amber-600/20">
                  <div className="text-center flex-1">
                    <p className="text-fg/50 text-xs uppercase tracking-wide">Prize Pool</p>
                    <p className="text-lg font-bold text-fg">${pool.toLocaleString()}</p>
                  </div>
                  {winnersDialog.winners.length > 0 && (
                    <>
                      <div className="w-px h-8 bg-fg/10" />
                      <div className="text-center flex-1">
                        <p className="text-fg/50 text-xs uppercase tracking-wide">Per Winner</p>
                        <p className="text-lg font-bold text-green-600">${perWinner.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
                      </div>
                    </>
                  )}
                </div>
              )}

              <p className="text-fg/50 text-sm mb-3">{winnersDialog.winners.length} Winner{winnersDialog.winners.length !== 1 ? 's' : ''}</p>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {winnersDialog.winners.map((w, i) => (
                  <div key={i} className="flex items-center gap-3 p-2 rounded-lg bg-fg/5">
                    <div className="w-6 h-6 rounded-md bg-gradient-to-br from-amber-600 to-orange-600 flex items-center justify-center flex-shrink-0">
                      <Trophy className="w-3.5 h-3.5 text-white" />
                    </div>
                    <span className="text-fg text-sm">{w.displayName}</span>
                    <div className="flex items-center gap-2 ml-auto">
                      {perWinner > 0 && <span className="text-green-600 text-xs font-semibold">${perWinner.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>}
                      {w.isMe && <span className="text-amber-600 text-xs font-semibold bg-amber-600/15 px-1.5 py-0.5 rounded">You</span>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        );
      })()}

      {/* Bracket Status Dialog */}
      {bracketDialog.open && (() => {
        const { brackets, totalSubmitted } = bracketDialog;
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setBracketDialog({ open: false, leagueName: '', brackets: [], totalSubmitted: 0 })}>
            <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" />
            <div className="bg-elevated border border-fg/10 rounded-2xl p-6 max-w-sm w-full relative z-10 animate-in shadow-xl" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-fg">{bracketDialog.leagueName}</h3>
                <button onClick={() => setBracketDialog({ open: false, leagueName: '', brackets: [], totalSubmitted: 0 })} className="text-fg/40 hover:text-fg/60 transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-3 max-h-72 overflow-y-auto">
                {brackets.map((b, i) => (
                  <div key={i} className="p-3 rounded-xl bg-fg/[0.03] border border-fg/5">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-sm font-medium text-fg">{b.name || `Bracket ${b.bracketNumber}`}</span>
                      <span className={`text-xs font-medium px-2 py-0.5 rounded ${
                        b.isSubmitted
                          ? 'bg-green-500/15 text-green-500'
                          : b.pickCount >= b.totalPicks
                            ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400'
                            : 'bg-fg/[0.06] text-fg/50'
                      }`}>
                        {b.isSubmitted ? 'Submitted' : b.pickCount >= b.totalPicks ? 'Not submitted' : 'Incomplete'}
                      </span>
                    </div>
                    {/* Progress bar */}
                    <div className="h-1.5 rounded-full bg-fg/10 mb-1.5">
                      <div
                        className={`h-full rounded-full transition-all ${
                          b.isSubmitted ? 'bg-green-500' : b.pickCount >= b.totalPicks ? 'bg-rose-500' : 'bg-fg/30'
                        }`}
                        style={{ width: `${(b.pickCount / b.totalPicks) * 100}%` }}
                      />
                    </div>
                    <div className="flex items-center justify-between text-xs text-fg/50">
                      <span>{b.pickCount}/{b.totalPicks} picks</span>
                      {b.isSubmitted && (
                        <span className="font-semibold text-fg/80">
                          {b.score} pts{b.rank && totalSubmitted > 1 && ` · #${b.rank} of ${totalSubmitted}`}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        );
      })()}

      {/* Members Status Dialog */}
      {membersDialog.open && (
        <LeagueMembersDialog
          leagueId={membersDialog.leagueId}
          leagueName={membersDialog.leagueName}
          defaultTab={membersDialog.defaultTab}
          onClose={() => setMembersDialog({ open: false, leagueId: null, leagueName: '', defaultTab: 'winners' })}
        />
      )}
    </div>
  );
}
