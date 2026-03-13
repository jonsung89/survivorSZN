import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  Trophy,
  AlertTriangle,
  AlertCircle,
  ChevronRight,
  Plus,
  Users,
  Calendar,
  X
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { leagueAPI, userAPI, nflAPI } from '../api';
import Loading from '../components/Loading';
import AppIcon from '../components/AppIcon';
import { BROADCAST_NETWORKS } from '../sports/nfl/constants';
import { getWeekLabel } from '../sports/nfl/weekUtils';
import { getSportModule, getSportGradient, getSportBadgeClasses } from '../sports';
import SportBadge from '../components/SportBadge';
import LeagueMembersDialog from '../components/LeagueMembersDialog';
import { useThemedLogo } from '../utils/logo';

// Network broadcast info lookup
const getBroadcastInfo = (broadcast) => {
  if (!broadcast) return null;

  const broadcastUpper = broadcast.toUpperCase();

  for (const [key, value] of Object.entries(BROADCAST_NETWORKS)) {
    if (broadcastUpper.includes(key)) {
      return { name: broadcast, ...value };
    }
  }

  return { name: broadcast, logo: null, color: 'text-fg/40' };
};

export default function Dashboard() {
  const { user } = useAuth();
  const tl = useThemedLogo();
  const [loading, setLoading] = useState(true);
  const [leagues, setLeagues] = useState([]);
  const [pendingPicks, setPendingPicks] = useState([]);
  const [seasonInfo, setSeasonInfo] = useState(null);
  const [firstGame, setFirstGame] = useState(null);
  const [countdown, setCountdown] = useState(null);
  const [allGames, setAllGames] = useState([]);
  const [weekStarted, setWeekStarted] = useState(false);
  const [gameDetails, setGameDetails] = useState({});
  const [winnersDialog, setWinnersDialog] = useState({ open: false, leagueName: '', winners: [], prizePool: 0 });
  const [bracketDialog, setBracketDialog] = useState({ open: false, leagueName: '', brackets: [], totalSubmitted: 0 });
  const [membersDialog, setMembersDialog] = useState({ open: false, leagueId: null, leagueName: '', defaultTab: 'winners' });
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
        <h1 className="text-2xl sm:text-3xl font-display font-bold text-fg">
          Welcome back, {user?.displayName || 'Player'}!
        </h1>
        {seasonInfo && !seasonInfo.isSeasonOver && (
          <p className="text-fg/60 mt-1 text-base">
            {`${getWeekLabel(seasonInfo.week, seasonInfo.seasonType)} • ${seasonInfo.season} Season`}
          </p>
        )}
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
                      <img src={tl(firstGame.awayTeam.logo)} alt={firstGame.awayTeam.abbreviation} className="w-10 h-10 sm:w-12 sm:h-12 object-contain" />
                    )}
                    <span className="text-fg font-semibold text-sm">{firstGame.awayTeam?.abbreviation}</span>
                  </div>
                  <span className="text-fg/40 text-base font-medium px-1">@</span>
                  <div className="flex flex-col items-center">
                    {firstGame.homeTeam?.logo && (
                      <img src={tl(firstGame.homeTeam.logo)} alt={firstGame.homeTeam.abbreviation} className="w-10 h-10 sm:w-12 sm:h-12 object-contain" />
                    )}
                    <span className="text-fg font-semibold text-sm">{firstGame.homeTeam?.abbreviation}</span>
                  </div>
                </div>
                <div className="hidden sm:block border-l border-fg/10 pl-3 ml-1">
                  <p className="text-fg/50 text-sm">{weekStarted ? 'Next' : getWeekLabel(seasonInfo?.week, seasonInfo?.seasonType)} Kickoff</p>
                  <p className="text-fg/80 text-base">
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
                  <div className="text-center px-3 py-2 rounded-lg bg-fg/5">
                    <p className="text-2xl font-bold text-fg">{countdown.days}</p>
                    <p className="text-fg/50 text-xs uppercase">Days</p>
                  </div>
                )}
                <div className="text-center px-3 py-2 rounded-lg bg-fg/5">
                  <p className="text-2xl font-bold text-fg">{String(countdown.hours).padStart(2, '0')}</p>
                  <p className="text-fg/50 text-xs uppercase">Hrs</p>
                </div>
                <div className="text-center px-3 py-2 rounded-lg bg-fg/5">
                  <p className="text-2xl font-bold text-fg">{String(countdown.minutes).padStart(2, '0')}</p>
                  <p className="text-fg/50 text-xs uppercase">Min</p>
                </div>
                <div className="text-center px-3 py-2 rounded-lg bg-fg/5">
                  <p className="text-2xl font-bold text-amber-500">{String(countdown.seconds).padStart(2, '0')}</p>
                  <p className="text-fg/50 text-xs uppercase">Sec</p>
                </div>
              </div>
            </div>
            
            {/* Mobile date - only show on small screens */}
            <div className="sm:hidden mt-3 pt-3 border-t border-fg/10">
              <p className="text-fg/50 text-sm mb-1">{weekStarted ? 'Next' : getWeekLabel(seasonInfo?.week, seasonInfo?.seasonType)} Kickoff</p>
              <div className="flex items-center gap-2 text-fg/80 text-sm">
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
              <h2 className="text-base font-semibold text-fg/70">{getWeekLabel(seasonInfo?.week, seasonInfo?.seasonType)} Games</h2>
              <Link to="/schedule" className="text-sm text-fg/60 hover:text-fg flex items-center gap-1 transition-colors">
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
                        : 'bg-fg/5 border border-fg/10'
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
                        <span className="text-fg/50 font-semibold">FINAL</span>
                      )}
                      {isUpcoming && (
                        <span className="text-fg/60 font-medium">
                          {new Date(game.date).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                        </span>
                      )}
                      {game.broadcast && <BroadcastIcon broadcast={game.broadcast} />}
                    </div>
                    
                    {/* Teams - compact single line each */}
                    <div className="space-y-1">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          {game.awayTeam?.logo && <img src={tl(game.awayTeam.logo)} alt="" className="w-6 h-6" />}
                          <span className={`text-sm font-semibold ${awayWinning && !isUpcoming ? 'text-fg' : 'text-fg/70'}`}>
                            {game.awayTeam?.abbreviation}
                          </span>
                          <span className="text-sm text-fg/40">{game.awayTeam?.record}</span>
                        </div>
                        <span className={`text-lg font-bold ${isUpcoming ? 'text-fg/30' : awayWinning ? 'text-fg' : 'text-fg/50'}`}>
                          {isUpcoming ? '-' : game.awayTeam?.score}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          {game.homeTeam?.logo && <img src={tl(game.homeTeam.logo)} alt="" className="w-6 h-6" />}
                          <span className={`text-sm font-semibold ${homeWinning && !isUpcoming ? 'text-fg' : 'text-fg/70'}`}>
                            {game.homeTeam?.abbreviation}
                          </span>
                          <span className="text-sm text-fg/40">{game.homeTeam?.record}</span>
                        </div>
                        <span className={`text-lg font-bold ${isUpcoming ? 'text-fg/30' : homeWinning ? 'text-fg' : 'text-fg/50'}`}>
                          {isUpcoming ? '-' : game.homeTeam?.score}
                        </span>
                      </div>
                    </div>

                    {/* Betting line - show for all non-final games if odds exist */}
                    {(odds?.spread || odds?.overUnder) && !isFinal && (
                      <div className="mt-2 pt-2 border-t border-fg/5 flex items-center justify-between text-sm text-fg/40">
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
                <AlertTriangle className="w-5 h-5 text-amber-600" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-amber-600 text-base">
                  You have {pendingPicks.length} pending pick{pendingPicks.length > 1 ? 's' : ''}!
                </h3>
                <p className="text-amber-600/70 text-sm mt-1">
                  Make your {getWeekLabel(seasonInfo?.week, seasonInfo?.seasonType)} selections before games start
                </p>
                <div className="flex flex-wrap gap-2 mt-3">
                  {pendingPicks.map(pick => (
                    <Link
                      key={pick.leagueId}
                      to={`/league/${pick.leagueId}/pick`}
                      className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 active:bg-amber-500/40 text-fg/80 text-sm font-medium transition-colors"
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
          <h2 className="text-lg sm:text-xl font-display font-semibold text-fg">My Leagues</h2>
          <Link
            to="/leagues"
            className="text-sm text-fg/60 hover:text-fg flex items-center gap-1 transition-colors"
          >
            View All
            <ChevronRight className="w-4 h-4" />
          </Link>
        </div>

        {leagues.length === 0 ? (
          <div className="glass-card rounded-xl p-6 sm:p-8 text-center">
            <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-fg/5 flex items-center justify-center mx-auto mb-4">
              <Trophy className="w-7 h-7 sm:w-8 sm:h-8 text-fg/30" />
            </div>
            <h3 className="text-base sm:text-lg font-semibold text-fg mb-2">No leagues yet</h3>
            <p className="text-fg/50 text-sm mb-4">Join a league or create your own to get started</p>
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
            const isBracketLeague = sportMod.gameType === 'bracket';
            const isWinner = isPast && league.winners?.some(w => w.isMe);

            return (
              <Link
                key={league.id}
                to={`/league/${league.id}`}
                className={`flex items-center gap-2.5 sm:gap-3 p-3 sm:p-4 hover:bg-fg/[0.04] active:bg-fg/[0.06] transition-all ${
                  i !== 0 ? 'border-t border-fg/5' : ''
                }`}
              >
                {/* League icon — clickable to open members dialog */}
                <button
                  className="relative flex-shrink-0 hover:scale-105 transition-transform"
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); setMembersDialog({ open: true, leagueId: league.id, leagueName: league.name, defaultTab: 'winners' }); }}
                >
                  <AppIcon
                    className="w-10 h-10"
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

                {/* League name and status */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <h3 className="font-semibold text-fg text-sm sm:text-base truncate max-w-[60vw] sm:max-w-none">{league.name}</h3>
                    <SportBadge sportId={league.sportId} />
                  </div>
                  {/* Mobile-only status row (non-bracket only — bracket info moved to right side) */}
                  <div className="flex items-center gap-2 text-sm sm:hidden">
                    {isBracketLeague ? null : isPast ? null : (
                      <>
                        <span className={league.memberStatus === 'active' ? 'text-green-500' : 'text-red-500'}>
                          {league.memberStatus === 'active' ? 'Active' : 'Eliminated'}
                        </span>
                        <span className="text-fg/30">•</span>
                        <span className="text-fg/50">{league.activeCount}/{league.memberCount} alive</span>
                      </>
                    )}
                  </div>
                </div>

                {/* Right side: status (desktop) + pick/strike info */}
                <div className="flex items-center gap-2 sm:gap-3">
                  {/* Desktop-only status */}
                  <div className="hidden sm:flex items-center gap-2 text-sm">
                    {isBracketLeague ? (() => {
                      const bs = league.bracketStats;
                      if (!bs || bs.brackets.length === 0) return <span className="text-fg/40">No bracket</span>;
                      const best = bs.brackets.find(b => b.isSubmitted) || bs.brackets[0];
                      return best.isSubmitted ? (
                        <>
                          <span className="text-violet-400 font-semibold">{best.score} pts</span>
                          {best.rank && bs.totalSubmitted > 1 && (
                            <>
                              <span className="text-fg/30">•</span>
                              <span className="text-fg/50">#{best.rank} of {bs.totalSubmitted}</span>
                            </>
                          )}
                        </>
                      ) : (
                        <span className="text-fg/60">{best.name || `Bracket ${best.bracketNumber}`}{best.pickCount < best.totalPicks ? ` · ${best.pickCount}/${best.totalPicks} picks` : ''}</span>
                      );
                    })() : isPast ? null : (
                      <>
                        <span className={league.memberStatus === 'active' ? 'text-green-500' : 'text-red-500'}>
                          {league.memberStatus === 'active' ? 'Active' : 'Eliminated'}
                        </span>
                        <span className="text-fg/30">•</span>
                        <span className="text-fg/50">{league.activeCount}/{league.memberCount} alive</span>
                      </>
                    )}
                  </div>

                  {isBracketLeague ? (
                    league.bracketStats?.brackets?.length > 0 ? (() => {
                      const bs = league.bracketStats;
                      const hasSubmitted = bs.brackets.some(b => b.isSubmitted);
                      const best = bs.brackets.find(b => b.isSubmitted) || bs.brackets[0];
                      const bestUnsubmitted = bs.brackets.find(b => !b.isSubmitted);
                      const allPicksDone = bestUnsubmitted && bestUnsubmitted.pickCount >= bestUnsubmitted.totalPicks;
                      return (
                        <>
                          {/* Desktop: full badge */}
                          <span className={`hidden sm:inline text-xs font-medium px-2 py-0.5 rounded ${
                            hasSubmitted
                              ? 'bg-green-500/15 text-green-500'
                              : allPicksDone
                                ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400'
                                : 'bg-fg/[0.06] text-fg/50'
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
                              <span className="text-xs font-semibold px-2 py-0.5 rounded bg-green-500/15 text-green-500">
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
                    })() : null
                  ) : !isPast && league.memberStatus === 'active' && league.currentPickTeamId ? (
                    <div className="flex items-center gap-2">
                      {(() => {
                        const team = sportMod.getTeam(league.currentPickTeamId);
                        return team ? (
                          <>
                            {team.logo && <img src={tl(team.logo)} alt="" className="w-6 h-6 object-contain" />}
                            <span className="text-fg/70 text-sm font-medium">{team.abbreviation}</span>
                          </>
                        ) : null;
                      })()}
                    </div>
                  ) : !isPast && league.memberStatus === 'active' ? (
                    <span className="text-amber-600 text-sm font-medium">No pick</span>
                  ) : null}

                  {/* Strike dots (hide for bracket leagues) */}
                  {!isBracketLeague && <div className="flex gap-1">
                    {Array.from({ length: league.maxStrikes }).map((_, j) => (
                      <div
                        key={j}
                        className={`w-2 h-2 rounded-full ${j < league.strikes ? 'bg-red-500' : 'bg-fg/20'}`}
                      />
                    ))}
                  </div>}

                  <ChevronRight className="w-4 h-4 text-fg/30" />
                </div>
              </Link>
            );
          };

          return (
            <div className="space-y-4">
              {currentLeagues.length > 0 && (
                <div>
                  <h3 className="text-xs font-medium text-fg/40 uppercase tracking-wider mb-2">Current Season</h3>
                  <div className="glass-card rounded-xl overflow-hidden">
                    {currentLeagues.slice(0, 10).map((league, i) => renderLeagueRow(league, i, false))}
                  </div>
                </div>
              )}
              {pastLeagues.length > 0 && (
                <div>
                  <h3 className="text-xs font-medium text-fg/40 uppercase tracking-wider mb-2">Past Seasons</h3>
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
          className="glass-card rounded-xl p-4 sm:p-5 hover:bg-fg/[0.06] active:bg-fg/[0.08] transition-all group flex items-center gap-3 sm:gap-4"
        >
          <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-gradient-to-br from-green-500 to-green-600 flex items-center justify-center flex-shrink-0">
            <Plus className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-fg text-sm sm:text-base">Create a League</h3>
            <p className="text-fg/50 text-xs sm:text-sm">Start your own survivor pool</p>
          </div>
          <ChevronRight className="w-5 h-5 text-fg/30 group-hover:text-fg/60 transition-colors flex-shrink-0" />
        </Link>

        <Link
          to="/leagues/join"
          className="glass-card rounded-xl p-4 sm:p-5 hover:bg-fg/[0.06] active:bg-fg/[0.08] transition-all group flex items-center gap-3 sm:gap-4"
        >
          <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center flex-shrink-0">
            <Users className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-fg text-sm sm:text-base">Join a League</h3>
            <p className="text-fg/50 text-xs sm:text-sm">Find and join existing pools</p>
          </div>
          <ChevronRight className="w-5 h-5 text-fg/30 group-hover:text-fg/60 transition-colors flex-shrink-0" />
        </Link>
      </div>

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
                <div className="flex items-center gap-4 mb-4 p-3 rounded-xl border border-fg/10">
                  <div className="text-center flex-1">
                    <p className="text-fg/40 text-xs uppercase tracking-wide">Prize Pool</p>
                    <p className="text-lg font-bold text-fg">${pool.toLocaleString()}</p>
                  </div>
                  {winnersDialog.winners.length > 0 && (
                    <>
                      <div className="w-px h-8 bg-fg/10" />
                      <div className="text-center flex-1">
                        <p className="text-fg/40 text-xs uppercase tracking-wide">Per Winner</p>
                        <p className="text-lg font-bold text-green-500">${perWinner.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
                      </div>
                    </>
                  )}
                </div>
              )}

              <p className="text-fg/40 text-sm mb-3">{winnersDialog.winners.length} Winner{winnersDialog.winners.length !== 1 ? 's' : ''}</p>
              <div className="divide-y divide-fg/5 max-h-64 overflow-y-auto">
                {winnersDialog.winners.map((w, i) => (
                  <div key={i} className="flex items-center gap-3 py-2.5">
                    <span className="text-base flex-shrink-0">🏆</span>
                    <span className="text-fg text-sm">{w.displayName}</span>
                    <div className="flex items-center gap-2 ml-auto">
                      {perWinner > 0 && <span className="text-green-500 text-sm font-medium">${perWinner.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>}
                      {w.isMe && <span className="text-fg/50 text-xs font-medium">(You)</span>}
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