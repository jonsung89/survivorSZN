import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  Trophy,
  AlertTriangle,
  ChevronRight,
  Plus,
  Users,
  Calendar,
  X
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { leagueAPI, userAPI, nflAPI } from '../api';
import Loading from '../components/Loading';
import { BROADCAST_NETWORKS } from '../sports/nfl/constants';
import { getWeekLabel } from '../sports/nfl/weekUtils';
import { getSportModule, getSportGradient } from '../sports';

// Network broadcast info lookup
const getBroadcastInfo = (broadcast) => {
  if (!broadcast) return null;

  const broadcastUpper = broadcast.toUpperCase();

  for (const [key, value] of Object.entries(BROADCAST_NETWORKS)) {
    if (broadcastUpper.includes(key)) {
      return { name: broadcast, ...value };
    }
  }

  return { name: broadcast, logo: null, color: 'text-white/40' };
};

export default function Dashboard() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [leagues, setLeagues] = useState([]);
  const [pendingPicks, setPendingPicks] = useState([]);
  const [seasonInfo, setSeasonInfo] = useState(null);
  const [firstGame, setFirstGame] = useState(null);
  const [countdown, setCountdown] = useState(null);
  const [allGames, setAllGames] = useState([]);
  const [weekStarted, setWeekStarted] = useState(false);
  const [gameDetails, setGameDetails] = useState({});
  const [winnersDialog, setWinnersDialog] = useState({ open: false, leagueName: '', winners: [] });

  // BroadcastIcon component (same as Schedule.jsx)
  const BroadcastIcon = ({ broadcast }) => {
    const [imgError, setImgError] = useState(false);
    const info = getBroadcastInfo(broadcast);
    if (!info) return null;
    
    if (info.logo && !imgError) {
      return (
        <img 
          src={info.logo} 
          alt={info.name}
          title={info.name}
          className={`w-5 h-5 object-contain ${info.invert ? 'invert' : ''}`}
          onError={() => setImgError(true)}
        />
      );
    }
    
    // Fallback to text only
    return <span className={`text-xs ${info.color}`}>{info.name}</span>;
  };

  useEffect(() => {
    let cancelled = false;
    
    const load = async () => {
      try {
        const [leaguesData, pendingData, seasonData] = await Promise.all([
          leagueAPI.getMyLeagues(),
          userAPI.getPendingPicks(),
          nflAPI.getSeason()
        ]);

        if (cancelled) return;

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

        // Skip schedule fetch if season is over
        if (seasonData?.isSeasonOver) {
          if (!cancelled) setLoading(false);
          return;
        }

        // Fetch schedule to get first game time
        if (seasonData?.week) {
          try {
            const scheduleData = await nflAPI.getSchedule(seasonData.week, null, seasonData.seasonType || 2);

            if (cancelled) return;

            if (scheduleData?.games?.length > 0) {
              const now = new Date();
              const games = scheduleData.games;

              setAllGames(games);

              const hasStartedGames = games.some(g => {
                if (g.status === 'STATUS_IN_PROGRESS' || g.status === 'STATUS_FINAL') return true;
                const gameTime = new Date(g.date);
                return gameTime <= now && g.status !== 'STATUS_SCHEDULED';
              });
              setWeekStarted(hasStartedGames);
            }
          } catch (err) {
            console.error('Failed to fetch schedule:', err);
          }
        }
      } catch (error) {
        console.error('Failed to load dashboard:', error);
      }
      if (!cancelled) {
        setLoading(false);
      }
    };
    
    load();
    
    return () => {
      cancelled = true;
    };
  }, []);

  // Fetch game details for live games (to get betting data)
  useEffect(() => {
    if (!allGames.length) return;
    
    const fetchLiveGameDetails = async () => {
      const now = new Date();
      const liveGames = allGames.filter(g => {
        if (g.status === 'STATUS_IN_PROGRESS') return true;
        const gameTime = new Date(g.date);
        return gameTime <= now && g.status !== 'STATUS_FINAL' && g.status !== 'STATUS_SCHEDULED';
      });
      
      for (const game of liveGames) {
        if (!gameDetails[game.id] && !game.odds) {
          try {
            const details = await nflAPI.getGameDetails(game.id);
            if (details?.betting) {
              setGameDetails(prev => ({ ...prev, [game.id]: details }));
            }
          } catch (err) {
            console.error('Failed to fetch game details:', err);
          }
        }
      }
    };
    
    fetchLiveGameDetails();
  }, [allGames]);

  // Countdown timer effect
  useEffect(() => {
    if (!firstGame?.date) {
      console.log('=== COUNTDOWN: No firstGame, skipping ===');
      return;
    }
    
    console.log('=== COUNTDOWN: Starting timer for', firstGame.shortName || firstGame.name, '===');

    const updateCountdown = () => {
      const now = new Date();
      const gameTime = new Date(firstGame.date);
      const diff = gameTime - now;

      if (diff <= 0) {
        console.log('COUNTDOWN: Game has started, clearing countdown');
        setCountdown(null);
        // Game has started - the auto-refresh will update allGames and firstGame
        return;
      }

      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);

      setCountdown({ days, hours, minutes, seconds });
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);

    return () => clearInterval(interval);
  }, [firstGame]);

  // Recalculate firstGame when allGames updates (e.g., when a game starts)
  useEffect(() => {
    if (!allGames.length) return;
    
    const now = new Date();
    const upcomingGames = allGames
      .filter(g => new Date(g.date) > now && g.status === 'STATUS_SCHEDULED')
      .sort((a, b) => new Date(a.date) - new Date(b.date));
    
    // DEBUG: Log upcoming games calculation
    console.log('=== FIRST GAME CALCULATION ===');
    console.log('All games count:', allGames.length);
    console.log('Upcoming games count:', upcomingGames.length);
    if (upcomingGames.length > 0) {
      console.log('First upcoming game:', upcomingGames[0].shortName || upcomingGames[0].name, upcomingGames[0].date);
    }
    
    if (upcomingGames.length > 0) {
      setFirstGame(upcomingGames[0]);
      console.log('Set firstGame to:', upcomingGames[0].shortName || upcomingGames[0].name);
    } else {
      // No more upcoming games
      setFirstGame(null);
      setCountdown(null);
      console.log('No upcoming games found - cleared firstGame');
    }
  }, [allGames]);

  // Auto-refresh games when week has started (every 60 seconds)
  useEffect(() => {
    if (!weekStarted || !seasonInfo?.week) return;

    const refreshGames = async () => {
      try {
        // Pass seasonType for playoffs (3) vs regular season (2)
        const scheduleData = await nflAPI.getSchedule(seasonInfo.week, null, seasonInfo.seasonType || 2);
        if (scheduleData?.games?.length > 0) {
          setAllGames(scheduleData.games);
        }
      } catch (err) {
        console.error('Failed to refresh games:', err);
      }
    };

    // Refresh if any game is in progress (including halftime)
    const liveStatuses = ['STATUS_IN_PROGRESS', 'STATUS_HALFTIME', 'STATUS_END_PERIOD'];
    const hasLiveGames = allGames.some(g => {
      if (liveStatuses.includes(g.status)) return true;
      // Also refresh if game time has passed but not final
      const gameTime = new Date(g.date);
      const hasStarted = gameTime <= new Date();
      return hasStarted && g.status !== 'STATUS_FINAL' && g.status !== 'STATUS_SCHEDULED';
    });
    
    if (hasLiveGames) {
      const interval = setInterval(refreshGames, 60000); // Every 60 seconds
      return () => clearInterval(interval);
    }
  }, [weekStarted, seasonInfo?.week, seasonInfo?.seasonType, allGames]);

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <Loading text="Loading dashboard..." />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 sm:py-8">
      {/* Welcome Header */}
      <div className="mb-6 sm:mb-8 animate-in">
        <h1 className="text-2xl sm:text-3xl font-display font-bold text-white">
          Welcome back, {user?.displayName || 'Player'}!
        </h1>
        <p className="text-white/60 mt-1 text-base">
          {seasonInfo
            ? seasonInfo.isSeasonOver
              ? `${seasonInfo.season} Season Complete • Offseason`
              : `${getWeekLabel(seasonInfo.week, seasonInfo.seasonType)} • ${seasonInfo.season} Season`
            : 'Loading season info...'}
        </p>
      </div>

      {/* Countdown to Next Game - shows when there are upcoming games and season is active */}
      {!seasonInfo?.isSeasonOver && countdown && firstGame && (
        <div className="mb-6 sm:mb-8 animate-in" style={{ animationDelay: '25ms' }}>
          <div className="glass-card rounded-xl sm:rounded-2xl p-4 sm:p-5 bg-gradient-to-br from-blue-500/20 to-purple-600/20 border border-blue-500/30">
            <div className="flex items-center justify-between gap-4">
              {/* Matchup */}
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2">
                  <div className="flex flex-col items-center">
                    {firstGame.awayTeam?.logo && (
                      <img src={firstGame.awayTeam.logo} alt={firstGame.awayTeam.abbreviation} className="w-10 h-10 sm:w-12 sm:h-12 object-contain" />
                    )}
                    <span className="text-white font-semibold text-sm">{firstGame.awayTeam?.abbreviation}</span>
                  </div>
                  <span className="text-white/40 text-base font-medium px-1">@</span>
                  <div className="flex flex-col items-center">
                    {firstGame.homeTeam?.logo && (
                      <img src={firstGame.homeTeam.logo} alt={firstGame.homeTeam.abbreviation} className="w-10 h-10 sm:w-12 sm:h-12 object-contain" />
                    )}
                    <span className="text-white font-semibold text-sm">{firstGame.homeTeam?.abbreviation}</span>
                  </div>
                </div>
                <div className="hidden sm:block border-l border-white/10 pl-3 ml-1">
                  <p className="text-white/50 text-sm">{weekStarted ? 'Next' : getWeekLabel(seasonInfo?.week, seasonInfo?.seasonType)} Kickoff</p>
                  <p className="text-white/80 text-base">
                    {new Date(firstGame.date).toLocaleDateString('en-US', { 
                      weekday: 'short', 
                      month: 'short', 
                      day: 'numeric',
                      hour: 'numeric',
                      minute: '2-digit'
                    })}
                  </p>
                </div>
              </div>
              
              {/* Countdown */}
              <div className="flex gap-2">
                {countdown.days > 0 && (
                  <div className="text-center px-3 py-2 rounded-lg bg-white/5">
                    <p className="text-2xl font-bold text-white">{countdown.days}</p>
                    <p className="text-white/50 text-xs uppercase">Days</p>
                  </div>
                )}
                <div className="text-center px-3 py-2 rounded-lg bg-white/5">
                  <p className="text-2xl font-bold text-white">{String(countdown.hours).padStart(2, '0')}</p>
                  <p className="text-white/50 text-xs uppercase">Hrs</p>
                </div>
                <div className="text-center px-3 py-2 rounded-lg bg-white/5">
                  <p className="text-2xl font-bold text-white">{String(countdown.minutes).padStart(2, '0')}</p>
                  <p className="text-white/50 text-xs uppercase">Min</p>
                </div>
                <div className="text-center px-3 py-2 rounded-lg bg-white/5">
                  <p className="text-2xl font-bold text-amber-400">{String(countdown.seconds).padStart(2, '0')}</p>
                  <p className="text-white/50 text-xs uppercase">Sec</p>
                </div>
              </div>
            </div>
            
            {/* Mobile date - only show on small screens */}
            <div className="sm:hidden mt-3 pt-3 border-t border-white/10">
              <p className="text-white/50 text-sm mb-1">{weekStarted ? 'Next' : getWeekLabel(seasonInfo?.week, seasonInfo?.seasonType)} Kickoff</p>
              <div className="flex items-center gap-2 text-white/80 text-sm">
                <Calendar className="w-4 h-4" />
                <span>
                  {new Date(firstGame.date).toLocaleDateString('en-US', { 
                    weekday: 'short', 
                    month: 'short', 
                    day: 'numeric',
                    hour: 'numeric',
                    minute: '2-digit'
                  })}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Live Games - shows when week has started and season is active */}
      {!seasonInfo?.isSeasonOver && weekStarted && allGames.length > 0 && (() => {
        const now = new Date();
        
        // Helper to check if game is currently being played
        const isGameLive = (g) => {
          // Include halftime and other mid-game statuses
          const liveStatuses = ['STATUS_IN_PROGRESS', 'STATUS_HALFTIME', 'STATUS_END_PERIOD'];
          if (liveStatuses.includes(g.status)) return true;
          // Also consider game live if game time has passed but not final/scheduled
          const gameTime = new Date(g.date);
          const hasStarted = gameTime <= now;
          const notFinal = g.status !== 'STATUS_FINAL' && g.status !== 'STATUS_SCHEDULED';
          return hasStarted && notFinal;
        };
        
        // Get games that are in progress or recently finished (within last 4 hours)
        const liveOrRecentGames = allGames.filter(g => {
          const gameTime = new Date(g.date);
          const hoursSinceStart = (now - gameTime) / (1000 * 60 * 60);
          const isFinal = g.status === 'STATUS_FINAL';
          return isGameLive(g) || (isFinal && hoursSinceStart <= 4);
        });

        // Also get upcoming games for today
        const upcomingToday = allGames.filter(g => {
          const gameTime = new Date(g.date);
          return gameTime > now && g.status === 'STATUS_SCHEDULED' && gameTime.toDateString() === now.toDateString();
        });

        const gamesToShow = [...liveOrRecentGames, ...upcomingToday].sort((a, b) => {
          const aLive = isGameLive(a);
          const bLive = isGameLive(b);
          if (aLive && !bLive) return -1;
          if (bLive && !aLive) return 1;
          return new Date(a.date) - new Date(b.date);
        });

        if (gamesToShow.length === 0) return null;

        return (
          <div className="mb-6 sm:mb-8 animate-in" style={{ animationDelay: '25ms' }}>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-base font-semibold text-white/70">{getWeekLabel(seasonInfo?.week, seasonInfo?.seasonType)} Games</h2>
              <Link to="/schedule" className="text-sm text-white/60 hover:text-white flex items-center gap-1 transition-colors">
                View All
                <ChevronRight className="w-4 h-4" />
              </Link>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {gamesToShow.slice(0, 6).map((game) => {
                const isLive = isGameLive(game);
                const isFinal = game.status === 'STATUS_FINAL';
                const isUpcoming = !isLive && !isFinal;
                const awayWinning = parseInt(game.awayTeam?.score) > parseInt(game.homeTeam?.score);
                const homeWinning = parseInt(game.homeTeam?.score) > parseInt(game.awayTeam?.score);
                
                // Get odds from game or fall back to gameDetails (for live games)
                const details = gameDetails[game.id];
                const odds = game.odds || details?.betting;
                
                return (
                  <div
                    key={game.id}
                    className={`rounded-xl p-3 ${
                      isLive 
                        ? 'bg-gradient-to-br from-red-500/20 to-orange-500/10 border border-red-500/30' 
                        : 'bg-white/5 border border-white/10'
                    }`}
                  >
                    {/* Header: Status + Broadcast */}
                    <div className="flex items-center justify-between mb-2 text-sm">
                      {isLive && (
                        <div className="flex items-center gap-1.5 text-red-400">
                          <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                          <span className="font-bold">
                            {game.statusDetail || (game.period && game.clock ? `Q${game.period} ${game.clock}` : 'LIVE')}
                          </span>
                        </div>
                      )}
                      {isFinal && (
                        <span className="text-white/50 font-semibold">FINAL</span>
                      )}
                      {isUpcoming && (
                        <span className="text-white/60 font-medium">
                          {new Date(game.date).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                        </span>
                      )}
                      {game.broadcast && <BroadcastIcon broadcast={game.broadcast} />}
                    </div>
                    
                    {/* Teams - compact single line each */}
                    <div className="space-y-1">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          {game.awayTeam?.logo && <img src={game.awayTeam.logo} alt="" className="w-6 h-6" />}
                          <span className={`text-sm font-semibold ${awayWinning && !isUpcoming ? 'text-white' : 'text-white/70'}`}>
                            {game.awayTeam?.abbreviation}
                          </span>
                          <span className="text-sm text-white/40">{game.awayTeam?.record}</span>
                        </div>
                        <span className={`text-lg font-bold ${isUpcoming ? 'text-white/30' : awayWinning ? 'text-white' : 'text-white/50'}`}>
                          {isUpcoming ? '-' : game.awayTeam?.score}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          {game.homeTeam?.logo && <img src={game.homeTeam.logo} alt="" className="w-6 h-6" />}
                          <span className={`text-sm font-semibold ${homeWinning && !isUpcoming ? 'text-white' : 'text-white/70'}`}>
                            {game.homeTeam?.abbreviation}
                          </span>
                          <span className="text-sm text-white/40">{game.homeTeam?.record}</span>
                        </div>
                        <span className={`text-lg font-bold ${isUpcoming ? 'text-white/30' : homeWinning ? 'text-white' : 'text-white/50'}`}>
                          {isUpcoming ? '-' : game.homeTeam?.score}
                        </span>
                      </div>
                    </div>

                    {/* Betting line - show for all non-final games if odds exist */}
                    {(odds?.spread || odds?.overUnder) && !isFinal && (
                      <div className="mt-2 pt-2 border-t border-white/5 flex items-center justify-between text-sm text-white/40">
                        {odds?.spread && (
                          <span>{odds.spread}</span>
                        )}
                        {odds?.overUnder && (
                          <span>O/U {odds.overUnder}</span>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* Pending Picks Alert - hidden when season is over */}
      {!seasonInfo?.isSeasonOver && pendingPicks.length > 0 && (
        <div className="mb-6 sm:mb-8 animate-in" style={{ animationDelay: '50ms' }}>
          <div className="bg-gradient-to-r from-amber-500/20 to-orange-500/20 border border-amber-500/30 rounded-xl p-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-lg bg-amber-500/20 flex items-center justify-center flex-shrink-0">
                <AlertTriangle className="w-5 h-5 text-amber-400" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-amber-300 text-base">
                  You have {pendingPicks.length} pending pick{pendingPicks.length > 1 ? 's' : ''}!
                </h3>
                <p className="text-amber-200/70 text-sm mt-1">
                  Make your {getWeekLabel(seasonInfo?.week, seasonInfo?.seasonType)} selections before games start
                </p>
                <div className="flex flex-wrap gap-2 mt-3">
                  {pendingPicks.map(pick => (
                    <Link
                      key={pick.leagueId}
                      to={`/league/${pick.leagueId}/pick`}
                      className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 active:bg-amber-500/40 text-amber-200 text-sm font-medium transition-colors"
                    >
                      <Trophy className="w-4 h-4" />
                      <span className="truncate max-w-[150px]">{pick.leagueName}</span>
                      <ChevronRight className="w-4 h-4" />
                    </Link>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Leagues Section */}
      <div className="" style={{ animationDelay: '100ms' }}>
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
        ) : (() => {
          const currentLeagues = leagues.filter(l => !l.seasonOver);
          const pastLeagues = leagues.filter(l => l.seasonOver);

          const renderLeagueRow = (league, i, isPast) => {
            const sportMod = getSportModule(league.sportId || 'nfl');
            const isWinner = isPast && league.winners?.some(w => w.isMe);

            return (
              <Link
                key={league.id}
                to={`/league/${league.id}`}
                className={`flex items-center gap-3 p-4 hover:bg-white/[0.04] active:bg-white/[0.06] transition-all ${
                  i !== 0 ? 'border-t border-white/5' : ''
                }`}
              >
                {/* League icon */}
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
                  isWinner
                    ? 'bg-gradient-to-br from-amber-500 to-yellow-600'
                    : league.memberStatus === 'eliminated'
                      ? 'bg-red-500/20'
                      : `bg-gradient-to-br ${getSportGradient(league.sportId)}`
                }`}>
                  <Trophy className={`w-5 h-5 ${
                    isWinner ? 'text-white' : league.memberStatus === 'eliminated' ? 'text-red-400' : 'text-white'
                  }`} />
                </div>

                {/* League name and status */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-white text-base truncate">{league.name}</h3>
                    {league.isCommissioner && <span className="badge badge-active text-xs">Commish</span>}
                    <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-white/10 text-white/40 uppercase">{sportMod.name}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    {isPast ? (
                      isWinner ? (
                        <button
                          onClick={(e) => {
                            e.preventDefault();
                            setWinnersDialog({ open: true, leagueName: league.name, winners: league.winners });
                          }}
                          className="text-amber-400 font-medium hover:text-amber-300 transition-colors"
                        >
                          Winner!{league.winners?.length > 1 && ` (+${league.winners.length - 1} other${league.winners.length > 2 ? 's' : ''})`}
                        </button>
                      ) : league.winners?.length > 0 ? (
                        league.winners.length <= 3 ? (
                          <span className="text-white/50">Won by {league.winners.map(w => w.displayName).join(', ')}</span>
                        ) : (
                          <button
                            onClick={(e) => {
                              e.preventDefault();
                              setWinnersDialog({ open: true, leagueName: league.name, winners: league.winners });
                            }}
                            className="text-white/50 hover:text-white/70 transition-colors"
                          >
                            {league.winners.length} winners
                          </button>
                        )
                      ) : league.memberStatus === 'eliminated' ? (
                        <span className="text-white/40">Eliminated</span>
                      ) : (
                        <span className="text-white/40">Season Complete</span>
                      )
                    ) : (
                      <>
                        <span className={league.memberStatus === 'active' ? 'text-green-400' : 'text-red-400'}>
                          {league.memberStatus === 'active' ? 'Active' : 'Eliminated'}
                        </span>
                        <span className="text-white/30">•</span>
                        <span className="text-white/50">{league.activeCount}/{league.memberCount} alive</span>
                      </>
                    )}
                  </div>
                </div>

                {/* Right side: pick or strike info */}
                <div className="flex items-center gap-3">
                  {!isPast && league.memberStatus === 'active' && league.currentPickTeamId ? (
                    <div className="flex items-center gap-2">
                      {(() => {
                        const team = sportMod.getTeam(league.currentPickTeamId);
                        return team ? (
                          <>
                            {team.logo && <img src={team.logo} alt="" className="w-6 h-6 object-contain" />}
                            <span className="text-white/70 text-sm font-medium">{team.abbreviation}</span>
                          </>
                        ) : null;
                      })()}
                    </div>
                  ) : !isPast && league.memberStatus === 'active' ? (
                    <span className="text-amber-400 text-sm font-medium">No pick</span>
                  ) : null}

                  {/* Strike dots */}
                  <div className="flex gap-1">
                    {Array.from({ length: league.maxStrikes }).map((_, j) => (
                      <div
                        key={j}
                        className={`w-2 h-2 rounded-full ${j < league.strikes ? 'bg-red-500' : 'bg-white/20'}`}
                      />
                    ))}
                  </div>

                  <ChevronRight className="w-4 h-4 text-white/30" />
                </div>
              </Link>
            );
          };

          return (
            <div className="space-y-4">
              {currentLeagues.length > 0 && (
                <div>
                  <h3 className="text-xs font-medium text-white/40 uppercase tracking-wider mb-2">Current Season</h3>
                  <div className="glass-card rounded-xl overflow-hidden">
                    {currentLeagues.slice(0, 10).map((league, i) => renderLeagueRow(league, i, false))}
                  </div>
                </div>
              )}
              {pastLeagues.length > 0 && (
                <div>
                  <h3 className="text-xs font-medium text-white/40 uppercase tracking-wider mb-2">Past Seasons</h3>
                  <div className="glass-card rounded-xl overflow-hidden">
                    {pastLeagues.slice(0, 5).map((league, i) => renderLeagueRow(league, i, true))}
                  </div>
                </div>
              )}
            </div>
          );
        })()}
      </div>

      {/* Quick Actions */}
      <div className="mt-6 sm:mt-8 grid gap-3 sm:gap-4 sm:grid-cols-2" style={{ animationDelay: '500ms' }}>
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