import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { 
  Trophy, 
  AlertTriangle, 
  ChevronRight, 
  Plus,
  Users,
  Clock,
  Calendar
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { leagueAPI, userAPI, nflAPI } from '../api';
import Loading from '../components/Loading';

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

  useEffect(() => {
    loadDashboard();
  }, []);

  // Countdown timer effect
  useEffect(() => {
    if (!firstGame?.date) return;

    const updateCountdown = () => {
      const now = new Date();
      const gameTime = new Date(firstGame.date);
      const diff = gameTime - now;

      if (diff <= 0) {
        setCountdown(null);
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

      // Fetch schedule to get first game time
      if (seasonData?.week) {
        try {
          const scheduleData = await nflAPI.getSchedule(seasonData.week);
          if (scheduleData?.games?.length > 0) {
            // Find the first upcoming game
            const now = new Date();
            const upcomingGames = scheduleData.games
              .filter(g => new Date(g.date) > now)
              .sort((a, b) => new Date(a.date) - new Date(b.date));
            
            if (upcomingGames.length > 0) {
              setFirstGame(upcomingGames[0]);
            }
          }
        } catch (err) {
          console.error('Failed to fetch schedule:', err);
        }
      }
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
    <div className="max-w-4xl mx-auto px-3 sm:px-4 py-4 sm:py-8">
      {/* Welcome Header */}
      <div className="mb-6 sm:mb-8 animate-in">
        <h1 className="text-2xl sm:text-3xl font-display font-bold text-white">
          Welcome back, {user?.displayName || 'Player'}!
        </h1>
        <p className="text-white/60 mt-1 text-sm sm:text-base">
          {seasonInfo ? `Week ${seasonInfo.week} • ${seasonInfo.season} Season` : 'Loading season info...'}
        </p>
      </div>

      {/* Countdown to First Game */}
      {countdown && firstGame && (
        <div className="mb-6 sm:mb-8 animate-in" style={{ animationDelay: '25ms' }}>
          <div className="glass-card rounded-xl sm:rounded-2xl p-4 sm:p-5 bg-gradient-to-br from-nfl-blue/20 to-purple-600/20 border border-nfl-blue/30">
            <div className="flex items-center justify-between gap-4">
              {/* Matchup */}
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2">
                  <div className="flex flex-col items-center">
                    {firstGame.awayTeam?.logo && (
                      <img src={firstGame.awayTeam.logo} alt={firstGame.awayTeam.abbreviation} className="w-9 h-9 sm:w-11 sm:h-11 object-contain" />
                    )}
                    <span className="text-white font-semibold text-xs sm:text-sm">{firstGame.awayTeam?.abbreviation}</span>
                  </div>
                  <span className="text-white/40 text-sm font-medium px-1">@</span>
                  <div className="flex flex-col items-center">
                    {firstGame.homeTeam?.logo && (
                      <img src={firstGame.homeTeam.logo} alt={firstGame.homeTeam.abbreviation} className="w-9 h-9 sm:w-11 sm:h-11 object-contain" />
                    )}
                    <span className="text-white font-semibold text-xs sm:text-sm">{firstGame.homeTeam?.abbreviation}</span>
                  </div>
                </div>
                <div className="hidden sm:block border-l border-white/10 pl-3 ml-1">
                  <p className="text-white/50 text-xs">Week {seasonInfo?.week} Kickoff</p>
                  <p className="text-white/80 text-sm">
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
              <div className="flex gap-1.5 sm:gap-2">
                {countdown.days > 0 && (
                  <div className="text-center px-2 sm:px-3 py-1.5 sm:py-2 rounded-lg bg-white/5">
                    <p className="text-xl sm:text-2xl font-bold text-white">{countdown.days}</p>
                    <p className="text-white/50 text-[10px] sm:text-xs uppercase">Days</p>
                  </div>
                )}
                <div className="text-center px-2 sm:px-3 py-1.5 sm:py-2 rounded-lg bg-white/5">
                  <p className="text-xl sm:text-2xl font-bold text-white">{String(countdown.hours).padStart(2, '0')}</p>
                  <p className="text-white/50 text-[10px] sm:text-xs uppercase">Hrs</p>
                </div>
                <div className="text-center px-2 sm:px-3 py-1.5 sm:py-2 rounded-lg bg-white/5">
                  <p className="text-xl sm:text-2xl font-bold text-white">{String(countdown.minutes).padStart(2, '0')}</p>
                  <p className="text-white/50 text-[10px] sm:text-xs uppercase">Min</p>
                </div>
                <div className="text-center px-2 sm:px-3 py-1.5 sm:py-2 rounded-lg bg-white/5">
                  <p className="text-xl sm:text-2xl font-bold text-amber-400">{String(countdown.seconds).padStart(2, '0')}</p>
                  <p className="text-white/50 text-[10px] sm:text-xs uppercase">Sec</p>
                </div>
              </div>
            </div>
            
            {/* Mobile date - only show on small screens */}
            <div className="sm:hidden mt-3 pt-3 border-t border-white/10">
              <p className="text-white/50 text-xs mb-1">Week {seasonInfo?.week} Kickoff</p>
              <div className="flex items-center gap-2 text-white/80 text-xs">
                <Calendar className="w-3.5 h-3.5" />
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
          <div className="glass-card rounded-xl overflow-hidden">
            {leagues.slice(0, 10).map((league, i) => (
              <Link
                key={league.id}
                to={`/league/${league.id}`}
                className={`flex items-center gap-3 p-3 sm:p-4 hover:bg-white/[0.04] active:bg-white/[0.06] transition-all ${
                  i !== 0 ? 'border-t border-white/5' : ''
                }`}
              >
                {/* League icon */}
                <div className={`w-8 h-8 sm:w-9 sm:h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${
                  league.memberStatus === 'eliminated' 
                    ? 'bg-red-500/20' 
                    : 'bg-gradient-to-br from-nfl-blue to-blue-700'
                }`}>
                  <Trophy className={`w-4 h-4 ${
                    league.memberStatus === 'eliminated' ? 'text-red-400' : 'text-white'
                  }`} />
                </div>
                
                {/* League name and status */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="font-medium text-white text-sm truncate">
                      {league.name}
                    </h3>
                    {league.isCommissioner && (
                      <span className="text-purple-400 text-xs">★</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-xs">
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
                    <div className="flex items-center gap-1.5">
                      {NFL_TEAMS[String(league.currentPickTeamId)]?.logo && (
                        <img src={NFL_TEAMS[String(league.currentPickTeamId)].logo} alt="" className="w-5 h-5 object-contain" />
                      )}
                      <span className="text-white/70 text-xs font-medium">
                        {NFL_TEAMS[String(league.currentPickTeamId)]?.abbreviation}
                      </span>
                    </div>
                  ) : league.memberStatus === 'active' ? (
                    <span className="text-amber-400 text-xs">No pick</span>
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