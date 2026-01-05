import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { 
  Trophy, 
  AlertTriangle, 
  ChevronRight, 
  Plus,
  Users,
  Calendar
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { leagueAPI, userAPI, nflAPI } from '../api';
import Loading from '../components/Loading';

// Network broadcast info with logos (same as Schedule.jsx)
const getBroadcastInfo = (broadcast) => {
  if (!broadcast) return null;
  
  const broadcastUpper = broadcast.toUpperCase();
  
  const networks = {
    'ESPN': {
      logo: 'https://a.espncdn.com/favicon.ico',
      color: 'text-red-400'
    },
    'ESPN+': {
      logo: 'https://a.espncdn.com/favicon.ico',
      color: 'text-red-400'
    },
    'ABC': {
      logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/2f/ABC-2021-LOGO.svg/120px-ABC-2021-LOGO.svg.png',
      color: 'text-yellow-400'
    },
    'CBS': {
      logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/4e/CBS_logo.svg/100px-CBS_logo.svg.png',
      color: 'text-blue-400',
      invert: true
    },
    'FOX': {
      logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c0/Fox_Broadcasting_Company_logo_%282019%29.svg/100px-Fox_Broadcasting_Company_logo_%282019%29.svg.png',
      color: 'text-blue-300',
      invert: true
    },
    'NBC': {
      logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/3f/NBC_logo.svg/100px-NBC_logo.svg.png',
      color: 'text-purple-400'
    },
    'PEACOCK': {
      logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/3f/NBC_logo.svg/100px-NBC_logo.svg.png',
      color: 'text-purple-400'
    },
    'NFL NETWORK': {
      logo: 'https://static.www.nfl.com/league/apps/clubs/icons/NFL_favicon.ico',
      color: 'text-blue-400'
    },
    'NFLN': {
      logo: 'https://static.www.nfl.com/league/apps/clubs/icons/NFL_favicon.ico',
      color: 'text-blue-400'
    },
    'AMAZON': {
      logo: 'https://images-na.ssl-images-amazon.com/images/G/01/primevideo/seo/primevideo-seo-logo.png',
      color: 'text-cyan-400'
    },
    'PRIME': {
      logo: 'https://images-na.ssl-images-amazon.com/images/G/01/primevideo/seo/primevideo-seo-logo.png',
      color: 'text-cyan-400'
    },
    'PRIME VIDEO': {
      logo: 'https://images-na.ssl-images-amazon.com/images/G/01/primevideo/seo/primevideo-seo-logo.png',
      color: 'text-cyan-400'
    },
    'NETFLIX': {
      logo: 'https://assets.nflxext.com/us/ffe/siteui/common/icons/nficon2016.ico',
      color: 'text-red-500'
    }
  };
  
  for (const [key, value] of Object.entries(networks)) {
    if (broadcastUpper.includes(key)) {
      return { name: broadcast, ...value };
    }
  }
  
  return { name: broadcast, logo: null, color: 'text-white/40' };
};

const NFL_TEAMS = {
  '1': { name: 'Falcons', abbreviation: 'ATL', logo: 'https://a.espncdn.com/i/teamlogos/nfl/500/atl.png' },
  '2': { name: 'Bills', abbreviation: 'BUF', logo: 'https://a.espncdn.com/i/teamlogos/nfl/500/buf.png' },
  '3': { name: 'Bears', abbreviation: 'CHI', logo: 'https://a.espncdn.com/i/teamlogos/nfl/500/chi.png' },
  '4': { name: 'Bengals', abbreviation: 'CIN', logo: 'https://a.espncdn.com/i/teamlogos/nfl/500/cin.png' },
  '5': { name: 'Browns', abbreviation: 'CLE', logo: 'https://a.espncdn.com/i/teamlogos/nfl/500/cle.png' },
  '6': { name: 'Cowboys', abbreviation: 'DAL', logo: 'https://a.espncdn.com/i/teamlogos/nfl/500/dal.png' },
  '7': { name: 'Broncos', abbreviation: 'DEN', logo: 'https://a.espncdn.com/i/teamlogos/nfl/500/den.png' },
  '8': { name: 'Lions', abbreviation: 'DET', logo: 'https://a.espncdn.com/i/teamlogos/nfl/500/det.png' },
  '9': { name: 'Packers', abbreviation: 'GB', logo: 'https://a.espncdn.com/i/teamlogos/nfl/500/gb.png' },
  '10': { name: 'Titans', abbreviation: 'TEN', logo: 'https://a.espncdn.com/i/teamlogos/nfl/500/ten.png' },
  '11': { name: 'Colts', abbreviation: 'IND', logo: 'https://a.espncdn.com/i/teamlogos/nfl/500/ind.png' },
  '12': { name: 'Chiefs', abbreviation: 'KC', logo: 'https://a.espncdn.com/i/teamlogos/nfl/500/kc.png' },
  '13': { name: 'Raiders', abbreviation: 'LV', logo: 'https://a.espncdn.com/i/teamlogos/nfl/500/lv.png' },
  '14': { name: 'Rams', abbreviation: 'LAR', logo: 'https://a.espncdn.com/i/teamlogos/nfl/500/lar.png' },
  '15': { name: 'Dolphins', abbreviation: 'MIA', logo: 'https://a.espncdn.com/i/teamlogos/nfl/500/mia.png' },
  '16': { name: 'Vikings', abbreviation: 'MIN', logo: 'https://a.espncdn.com/i/teamlogos/nfl/500/min.png' },
  '17': { name: 'Patriots', abbreviation: 'NE', logo: 'https://a.espncdn.com/i/teamlogos/nfl/500/ne.png' },
  '18': { name: 'Saints', abbreviation: 'NO', logo: 'https://a.espncdn.com/i/teamlogos/nfl/500/no.png' },
  '19': { name: 'Giants', abbreviation: 'NYG', logo: 'https://a.espncdn.com/i/teamlogos/nfl/500/nyg.png' },
  '20': { name: 'Jets', abbreviation: 'NYJ', logo: 'https://a.espncdn.com/i/teamlogos/nfl/500/nyj.png' },
  '21': { name: 'Eagles', abbreviation: 'PHI', logo: 'https://a.espncdn.com/i/teamlogos/nfl/500/phi.png' },
  '22': { name: 'Cardinals', abbreviation: 'ARI', logo: 'https://a.espncdn.com/i/teamlogos/nfl/500/ari.png' },
  '23': { name: 'Steelers', abbreviation: 'PIT', logo: 'https://a.espncdn.com/i/teamlogos/nfl/500/pit.png' },
  '24': { name: 'Chargers', abbreviation: 'LAC', logo: 'https://a.espncdn.com/i/teamlogos/nfl/500/lac.png' },
  '25': { name: '49ers', abbreviation: 'SF', logo: 'https://a.espncdn.com/i/teamlogos/nfl/500/sf.png' },
  '26': { name: 'Seahawks', abbreviation: 'SEA', logo: 'https://a.espncdn.com/i/teamlogos/nfl/500/sea.png' },
  '27': { name: 'Buccaneers', abbreviation: 'TB', logo: 'https://a.espncdn.com/i/teamlogos/nfl/500/tb.png' },
  '28': { name: 'Commanders', abbreviation: 'WAS', logo: 'https://a.espncdn.com/i/teamlogos/nfl/500/wsh.png' },
  '29': { name: 'Panthers', abbreviation: 'CAR', logo: 'https://a.espncdn.com/i/teamlogos/nfl/500/car.png' },
  '30': { name: 'Jaguars', abbreviation: 'JAX', logo: 'https://a.espncdn.com/i/teamlogos/nfl/500/jax.png' },
  '33': { name: 'Ravens', abbreviation: 'BAL', logo: 'https://a.espncdn.com/i/teamlogos/nfl/500/bal.png' },
  '34': { name: 'Texans', abbreviation: 'HOU', logo: 'https://a.espncdn.com/i/teamlogos/nfl/500/hou.png' },
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

        // Fetch schedule to get first game time
        if (seasonData?.week) {
          try {
            const scheduleData = await nflAPI.getSchedule(seasonData.week);
            if (cancelled) return;
            
            if (scheduleData?.games?.length > 0) {
              const now = new Date();
              const games = scheduleData.games;
              
              // Store all games for the week
              setAllGames(games);
              
              // Check if any games have started (in progress, final, or past scheduled time)
              const hasStartedGames = games.some(g => {
                if (g.status === 'STATUS_IN_PROGRESS' || g.status === 'STATUS_FINAL') return true;
                // Also check if scheduled time has passed
                const gameTime = new Date(g.date);
                return gameTime <= now && g.status !== 'STATUS_SCHEDULED';
              });
              setWeekStarted(hasStartedGames);
              
              // If week hasn't started, find first upcoming game for countdown
              if (!hasStartedGames) {
                const upcomingGames = games
                  .filter(g => new Date(g.date) > now)
                  .sort((a, b) => new Date(a.date) - new Date(b.date));
                
                if (upcomingGames.length > 0) {
                  setFirstGame(upcomingGames[0]);
                }
              }
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
    if (!firstGame?.date || weekStarted) return;

    const updateCountdown = () => {
      const now = new Date();
      const gameTime = new Date(firstGame.date);
      const diff = gameTime - now;

      if (diff <= 0) {
        setCountdown(null);
        setWeekStarted(true);
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
  }, [firstGame, weekStarted]);

  // Auto-refresh games when week has started (every 60 seconds)
  useEffect(() => {
    if (!weekStarted || !seasonInfo?.week) return;

    const refreshGames = async () => {
      try {
        const scheduleData = await nflAPI.getSchedule(seasonInfo.week);
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
  }, [weekStarted, seasonInfo?.week, allGames]);

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
          {seasonInfo ? `Week ${seasonInfo.week} • ${seasonInfo.season} Season` : 'Loading season info...'}
        </p>
      </div>

      {/* Countdown to First Game - only before week starts */}
      {countdown && firstGame && !weekStarted && (
        <div className="mb-6 sm:mb-8 animate-in" style={{ animationDelay: '25ms' }}>
          <div className="glass-card rounded-xl sm:rounded-2xl p-4 sm:p-5 bg-gradient-to-br from-nfl-blue/20 to-purple-600/20 border border-nfl-blue/30">
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
                  <p className="text-white/50 text-sm">Week {seasonInfo?.week} Kickoff</p>
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
              <p className="text-white/50 text-sm mb-1">Week {seasonInfo?.week} Kickoff</p>
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

      {/* Live Games - shows when week has started */}
      {weekStarted && allGames.length > 0 && (() => {
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
              <h2 className="text-base font-semibold text-white/70">Week {seasonInfo?.week} Games</h2>
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

      {/* Pending Picks Alert */}
      {pendingPicks.length > 0 && (
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
                  Make your Week {seasonInfo?.week} selections before games start
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
        ) : (
          <div className="glass-card rounded-xl overflow-hidden">
            {leagues.slice(0, 10).map((league, i) => (
              <Link
                key={league.id}
                to={`/league/${league.id}`}
                className={`flex items-center gap-3 p-4 hover:bg-white/[0.04] active:bg-white/[0.06] transition-all ${
                  i !== 0 ? 'border-t border-white/5' : ''
                }`}
              >
                {/* League icon */}
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
                  league.memberStatus === 'eliminated' 
                    ? 'bg-red-500/20' 
                    : 'bg-gradient-to-br from-nfl-blue to-blue-700'
                }`}>
                  <Trophy className={`w-5 h-5 ${
                    league.memberStatus === 'eliminated' ? 'text-red-400' : 'text-white'
                  }`} />
                </div>
                
                {/* League name and status */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-white text-base truncate">
                      {league.name}
                    </h3>
                    {league.isCommissioner && (
                      <span className="text-purple-400 text-sm">★</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <span className={league.memberStatus === 'active' ? 'text-green-400' : 'text-red-400'}>
                      {league.memberStatus === 'active' ? 'Active' : 'Eliminated'}
                    </span>
                    <span className="text-white/30">•</span>
                    <span className="text-white/50">
                      {league.activeCount}/{league.memberCount} alive
                    </span>
                  </div>
                </div>
                
                {/* Current pick */}
                <div className="flex items-center gap-3">
                  {league.memberStatus === 'active' && league.currentPickTeamId ? (
                    <div className="flex items-center gap-2">
                      {NFL_TEAMS[String(league.currentPickTeamId)]?.logo && (
                        <img src={NFL_TEAMS[String(league.currentPickTeamId)].logo} alt="" className="w-6 h-6 object-contain" />
                      )}
                      <span className="text-white/70 text-sm font-medium">
                        {NFL_TEAMS[String(league.currentPickTeamId)]?.abbreviation}
                      </span>
                    </div>
                  ) : league.memberStatus === 'active' ? (
                    <span className="text-amber-400 text-sm font-medium">No pick</span>
                  ) : null}
                  
                  {/* Strike dots */}
                  <div className="flex gap-1">
                    {Array.from({ length: league.maxStrikes }).map((_, j) => (
                      <div
                        key={j}
                        className={`w-2 h-2 rounded-full ${
                          j < league.strikes ? 'bg-red-500' : 'bg-white/20'
                        }`}
                      />
                    ))}
                  </div>
                  
                  <ChevronRight className="w-4 h-4 text-white/30" />
                </div>
              </Link>
            ))}
          </div>
        )}
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
    </div>
  );
}