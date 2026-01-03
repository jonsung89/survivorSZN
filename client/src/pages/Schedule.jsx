import { useState, useEffect, useRef } from 'react';
import { Calendar, ChevronLeft, ChevronRight, ChevronDown, ChevronUp, Trophy, TrendingUp, Users, Target, AlertTriangle } from 'lucide-react';
import { nflAPI } from '../api';
import Loading from '../components/Loading';
import TeamInfoDialog from '../components/TeamInfoDialog';

// Playoff round names
const PLAYOFF_ROUNDS = {
  1: 'Wild Card Round',
  2: 'Divisional Round',
  3: 'Conference Championships',
  5: 'Super Bowl'
};

export default function Schedule() {
  const [season, setSeason] = useState(2024);
  const [currentWeek, setCurrentWeek] = useState(1);
  const [currentSeasonType, setCurrentSeasonType] = useState(2);
  const [selectedWeek, setSelectedWeek] = useState(1);
  const [selectedSeasonType, setSelectedSeasonType] = useState(2); // 2 = regular, 3 = playoffs
  const [schedule, setSchedule] = useState([]);
  const [playoffSchedule, setPlayoffSchedule] = useState({}); // { roundNum: games[] }
  const [loading, setLoading] = useState(true);
  const [scheduleLoading, setScheduleLoading] = useState(false);
  const [showSeasonDropdown, setShowSeasonDropdown] = useState(false);
  const [currentYear, setCurrentYear] = useState(2024);
  const [expandedGame, setExpandedGame] = useState(null);
  const [gameDetails, setGameDetails] = useState({});
  const [gameInjuries, setGameInjuries] = useState({});
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [initialLoadDone, setInitialLoadDone] = useState(false);
  const [teamInfoDialog, setTeamInfoDialog] = useState({ open: false, team: null });
  
  const weekTabsRef = useRef(null);
  const weekButtonRefs = useRef({});
  const seasonDropdownRef = useRef(null);

  // Generate season options (current year back to 2020)
  const seasonOptions = Array.from({ length: currentYear - 2019 }, (_, i) => currentYear - i);
  const playoffRoundNumbers = [1, 2, 3, 5]; // Wild Card, Divisional, Conference, Super Bowl

  useEffect(() => {
    loadSeason();
  }, []);

  useEffect(() => {
    // Only load schedule when user changes week/season after initial load
    if (!initialLoadDone) return;
    
    if (selectedSeasonType === 2 && selectedWeek) {
      loadSchedule(selectedWeek, season, 2);
      // Auto-scroll to selected week tab
      setTimeout(() => {
        const key = `2-${selectedWeek}`;
        const button = weekButtonRefs.current[key];
        if (button && weekTabsRef.current) {
          button.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
        }
      }, 100);
    }
  }, [selectedWeek, season, selectedSeasonType, initialLoadDone]);

  // Load all playoff rounds when switching to playoffs
  useEffect(() => {
    if (!initialLoadDone) return;
    if (selectedSeasonType === 3) {
      loadAllPlayoffRounds(season);
    }
  }, [selectedSeasonType, season, initialLoadDone]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (seasonDropdownRef.current && !seasonDropdownRef.current.contains(event.target)) {
        setShowSeasonDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const loadSeason = async () => {
    try {
      const result = await nflAPI.getSeason();
      if (result.season) {
        const year = result.season;
        const week = result.week;
        const seasonType = result.seasonType || 2;
        
        setSeason(year);
        setCurrentYear(year);
        setCurrentWeek(week);
        setCurrentSeasonType(seasonType);
        setSelectedWeek(week);
        setSelectedSeasonType(seasonType);
        
        // Directly load the schedule for the current week
        if (seasonType === 2) {
          await loadSchedule(week, year, 2);
          // Scroll to current week tab after data loads
          setTimeout(() => {
            const key = `2-${week}`;
            const button = weekButtonRefs.current[key];
            if (button && weekTabsRef.current) {
              button.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
            }
          }, 100);
        } else if (seasonType === 3) {
          await loadAllPlayoffRounds(year);
        }
      }
    } catch (error) {
      console.error('Failed to load season:', error);
    }
    setLoading(false);
    setInitialLoadDone(true);
  };

  const loadSchedule = async (week, targetSeason, seasonType) => {
    setScheduleLoading(true);
    try {
      const result = await nflAPI.getSchedule(week, targetSeason, seasonType);
      if (result.games) {
        setSchedule(result.games);
      } else {
        setSchedule([]);
      }
    } catch (error) {
      console.error('Failed to load schedule:', error);
      setSchedule([]);
    }
    setScheduleLoading(false);
  };

  const loadAllPlayoffRounds = async (targetSeason) => {
    setScheduleLoading(true);
    try {
      const results = await Promise.all(
        playoffRoundNumbers.map(async (round) => {
          try {
            const result = await nflAPI.getSchedule(round, targetSeason, 3);
            return { round, games: result.games || [] };
          } catch (e) {
            console.error(`Failed to load playoff round ${round}:`, e);
            return { round, games: [] };
          }
        })
      );
      
      const playoffData = {};
      results.forEach(({ round, games }) => {
        if (games.length > 0) {
          playoffData[round] = games;
        }
      });
      setPlayoffSchedule(playoffData);
    } catch (error) {
      console.error('Failed to load playoff schedule:', error);
      setPlayoffSchedule({});
    }
    setScheduleLoading(false);
  };

  const handleSeasonChange = (newSeason) => {
    setSeason(newSeason);
    setShowSeasonDropdown(false);
    // Reset to week 1 regular season when changing seasons
    setSelectedWeek(1);
    setSelectedSeasonType(2);
  };

  const toggleGameExpand = async (gameId, game = null) => {
    if (expandedGame === gameId) {
      setExpandedGame(null);
      return;
    }
    
    setExpandedGame(gameId);
    
    // Fetch details if we don't have them
    if (!gameDetails[gameId]) {
      setDetailsLoading(true);
      try {
        const details = await nflAPI.getGameDetails(gameId);
        console.log('Game details received:', details);
        setGameDetails(prev => ({ ...prev, [gameId]: details }));
      } catch (error) {
        console.error('Failed to load game details:', error);
        // Set empty object so we don't keep retrying
        setGameDetails(prev => ({ ...prev, [gameId]: {} }));
      }
      setDetailsLoading(false);
    }
    
    // Fetch injuries if we don't have them and have team info
    if (!gameInjuries[gameId] && game) {
      try {
        const teamIds = [];
        if (game.homeTeam?.id) teamIds.push(game.homeTeam.id);
        if (game.awayTeam?.id) teamIds.push(game.awayTeam.id);
        
        if (teamIds.length > 0) {
          const injuries = await nflAPI.getInjuriesForTeams(teamIds);
          setGameInjuries(prev => ({ ...prev, [gameId]: injuries }));
        }
      } catch (error) {
        console.log('Could not fetch injuries:', error);
        setGameInjuries(prev => ({ ...prev, [gameId]: {} }));
      }
    }
  };

  const formatDay = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric'
    });
  };

  const isGamePast = (game) => {
    return game.status === 'STATUS_FINAL' || game.status === 'final';
  };

  const isGameLive = (game) => {
    return game.status === 'STATUS_IN_PROGRESS' || game.status === 'in_progress';
  };

  const getStatusDisplay = (game) => {
    if (isGameLive(game)) {
      return (
        <span className="flex items-center gap-1.5 text-xs font-semibold text-red-400 bg-red-500/20 px-2 py-1 rounded-full">
          <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
          LIVE
        </span>
      );
    }
    if (isGamePast(game)) {
      return (
        <span className="text-xs font-medium text-white/50 bg-white/10 px-2 py-1 rounded-full">
          Final
        </span>
      );
    }
    const date = new Date(game.date);
    return (
      <span className="text-xs text-white/60">
        {date.toLocaleTimeString('en-US', {
          hour: 'numeric',
          minute: '2-digit',
          hour12: true
        })}
      </span>
    );
  };

  // Helper to get broadcast network logo
  const getBroadcastInfo = (broadcast) => {
    if (!broadcast) return null;
    
    const broadcastUpper = broadcast.toUpperCase();
    
    // Map of networks to their logo URLs
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
    
    // Find matching network
    for (const [key, value] of Object.entries(networks)) {
      if (broadcastUpper.includes(key)) {
        return { name: broadcast, ...value };
      }
    }
    
    // Default - no logo
    return { name: broadcast, logo: null, color: 'text-white/40' };
  };

  // Render broadcast with logo (text only as fallback)
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

  // Open team info dialog
  const openTeamInfo = (team, e) => {
    e?.stopPropagation();
    if (team?.id) {
      setTeamInfoDialog({ 
        open: true, 
        team: {
          id: team.id,
          name: team.displayName || team.name,
          abbreviation: team.abbreviation,
          logo: team.logo,
          record: team.record,
          color: team.color
        }
      });
    }
  };

  // Clickable team component
  const ClickableTeam = ({ team, children, className = '' }) => (
    <button
      onClick={(e) => openTeamInfo(team, e)}
      className={`hover:opacity-80 transition-opacity cursor-pointer ${className}`}
    >
      {children}
    </button>
  );

  const getScore = (team) => {
    if (!team?.score && team?.score !== 0) return null;
    if (typeof team.score === 'object') {
      return parseInt(team.score.displayValue || team.score.value || 0);
    }
    return parseInt(team.score) || 0;
  };

  // Group games by date
  const groupedGames = schedule.reduce((acc, game) => {
    const day = formatDay(game.date);
    if (!acc[day]) {
      acc[day] = [];
    }
    acc[day].push(game);
    return acc;
  }, {});

  const regularWeeks = Array.from({ length: 18 }, (_, i) => i + 1);

  const isCurrentSelection = () => {
    return season === currentYear && 
           selectedSeasonType === currentSeasonType && 
           selectedWeek === currentWeek;
  };

  // Render expanded content for upcoming games
  const renderUpcomingGameDetails = (game) => {
    const details = gameDetails[game.id];
    const odds = game.odds || details?.betting;
    
    return (
      <div className="mt-3 pt-3 border-t border-white/10 space-y-4">
        {/* Betting Lines */}
        {odds && (
          <div className="space-y-2">
            <h4 className="text-xs font-semibold text-white/50 uppercase tracking-wide flex items-center gap-1.5">
              <Target className="w-3.5 h-3.5" />
              Betting Lines
            </h4>
            <div className="grid grid-cols-3 gap-2">
              {odds.spread && (
                <div className="bg-white/5 rounded-lg p-2 text-center">
                  <div className="text-xs text-white/50">Spread</div>
                  <div className="text-sm font-semibold text-white">{odds.spread}</div>
                </div>
              )}
              {odds.overUnder && (
                <div className="bg-white/5 rounded-lg p-2 text-center">
                  <div className="text-xs text-white/50">O/U</div>
                  <div className="text-sm font-semibold text-white">{odds.overUnder}</div>
                </div>
              )}
              {(odds.homeMoneyLine || odds.awayMoneyLine) && (
                <div className="bg-white/5 rounded-lg p-2 text-center">
                  <div className="text-xs text-white/50">Moneyline</div>
                  <div className="text-xs font-semibold text-white">
                    {game.awayTeam?.abbreviation} {odds.awayMoneyLine > 0 ? '+' : ''}{odds.awayMoneyLine}
                  </div>
                  <div className="text-xs font-semibold text-white">
                    {game.homeTeam?.abbreviation} {odds.homeMoneyLine > 0 ? '+' : ''}{odds.homeMoneyLine}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
        
        {/* Win Probability */}
        {details?.winProbability && (
          <div className="space-y-2">
            <h4 className="text-xs font-semibold text-white/50 uppercase tracking-wide flex items-center gap-1.5">
              <TrendingUp className="w-3.5 h-3.5" />
              Win Probability
            </h4>
            <div className="flex items-center gap-2">
              <span className="text-xs text-white/70 w-10">{game.awayTeam?.abbreviation}</span>
              <div className="flex-1 h-2 bg-white/10 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-nfl-blue rounded-full"
                  style={{ width: `${Number(details.winProbability.awayWinPct) || 50}%` }}
                />
              </div>
              <span className="text-xs font-medium text-white w-12 text-right">
                {Math.round(Number(details.winProbability.awayWinPct) || 50)}%
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-white/70 w-10">{game.homeTeam?.abbreviation}</span>
              <div className="flex-1 h-2 bg-white/10 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-green-500 rounded-full"
                  style={{ width: `${Number(details.winProbability.homeWinPct) || 50}%` }}
                />
              </div>
              <span className="text-xs font-medium text-white w-12 text-right">
                {Math.round(Number(details.winProbability.homeWinPct) || 50)}%
              </span>
            </div>
          </div>
        )}

        {/* Team Season Stats */}
        <div className="space-y-2">
          <h4 className="text-xs font-semibold text-white/50 uppercase tracking-wide flex items-center gap-1.5">
            <TrendingUp className="w-3.5 h-3.5" />
            Season Averages
          </h4>
          <div className="grid grid-cols-2 gap-3">
            {/* Away Team Stats */}
            <div className="bg-white/5 rounded-lg p-2.5">
              <div className="flex items-center gap-2 mb-2">
                {game.awayTeam?.logo && (
                  <img src={game.awayTeam.logo} alt="" className="w-5 h-5" />
                )}
                <span className="text-xs font-medium text-white">{game.awayTeam?.abbreviation}</span>
              </div>
              <div className="space-y-1 text-xs">
                <div className="flex justify-between">
                  <span className="text-white/50">PPG</span>
                  <span className="text-white font-medium">{game.awayTeam?.avgPointsFor || '-'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-white/50">Opp PPG</span>
                  <span className="text-white font-medium">{game.awayTeam?.avgPointsAgainst || '-'}</span>
                </div>
                {game.awayTeam?.streak && (
                  <div className="flex justify-between">
                    <span className="text-white/50">Streak</span>
                    <span className={`font-medium ${game.awayTeam.streak.type === 'W' ? 'text-green-400' : 'text-red-400'}`}>
                      {game.awayTeam.streak.type}{game.awayTeam.streak.count}
                    </span>
                  </div>
                )}
              </div>
            </div>
            {/* Home Team Stats */}
            <div className="bg-white/5 rounded-lg p-2.5">
              <div className="flex items-center gap-2 mb-2">
                {game.homeTeam?.logo && (
                  <img src={game.homeTeam.logo} alt="" className="w-5 h-5" />
                )}
                <span className="text-xs font-medium text-white">{game.homeTeam?.abbreviation}</span>
              </div>
              <div className="space-y-1 text-xs">
                <div className="flex justify-between">
                  <span className="text-white/50">PPG</span>
                  <span className="text-white font-medium">{game.homeTeam?.avgPointsFor || '-'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-white/50">Opp PPG</span>
                  <span className="text-white font-medium">{game.homeTeam?.avgPointsAgainst || '-'}</span>
                </div>
                {game.homeTeam?.streak && (
                  <div className="flex justify-between">
                    <span className="text-white/50">Streak</span>
                    <span className={`font-medium ${game.homeTeam.streak.type === 'W' ? 'text-green-400' : 'text-red-400'}`}>
                      {game.homeTeam.streak.type}{game.homeTeam.streak.count}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
        
        {/* Injuries */}
        {(() => {
          const injuriesData = gameInjuries[game.id] || {};
          
          // Position priority for sorting
          const positionPriority = ['QB', 'RB', 'WR', 'TE', 'LT', 'LG', 'C', 'RG', 'RT', 'OL', 'DE', 'DT', 'DL', 'LB', 'CB', 'S', 'DB', 'K', 'P'];
          const sortByPosition = (a, b) => {
            const aIdx = positionPriority.indexOf(a.player.position);
            const bIdx = positionPriority.indexOf(b.player.position);
            return (aIdx === -1 ? 99 : aIdx) - (bIdx === -1 ? 99 : bIdx);
          };
          
          const getTeamInjuries = (teamId) => {
            const teamInjuries = injuriesData[teamId] || [];
            return teamInjuries
              .filter(i => {
                const status = (i.status || '').toLowerCase();
                return status.includes('out') || status.includes('doubtful') || status.includes('ir') || status.includes('injured reserve');
              })
              .sort(sortByPosition)
              .map(i => {
                let status = i.status || '';
                if (status.toLowerCase().includes('injured reserve')) status = 'IR';
                else if (status.toLowerCase() === 'out') status = 'Out';
                else if (status.toLowerCase() === 'doubtful') status = 'Doubtful';
                return { ...i, displayStatus: status };
              });
          };
          
          const awayInjuries = getTeamInjuries(game.awayTeam?.id);
          const homeInjuries = getTeamInjuries(game.homeTeam?.id);
          
          if (awayInjuries.length === 0 && homeInjuries.length === 0) return null;
          
          const InjuryList = ({ injuries: injList, teamName }) => {
            const [expanded, setExpanded] = useState(false);
            const keyInjuries = injList.slice(0, 3);
            const hasMore = injList.length > 3;
            const displayList = expanded ? injList : keyInjuries;
            
            return (
              <div className="text-xs text-white/60 space-y-0.5">
                {displayList.map((inj, i) => (
                  <div key={i}>
                    <span className={inj.displayStatus === 'Doubtful' ? 'text-yellow-400' : 'text-red-400'}>
                      {inj.displayStatus}
                    </span>
                    {' '}{inj.player.name} <span className="text-white/40">({inj.player.position})</span>
                  </div>
                ))}
                {hasMore && (
                  <button
                    onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}
                    className="text-white/40 hover:text-white/60 mt-1"
                  >
                    {expanded ? '← Show less' : `+${injList.length - 3} more`}
                  </button>
                )}
              </div>
            );
          };
          
          return (
            <div className="space-y-3">
              <h4 className="text-xs font-medium text-white/40 uppercase tracking-wide">
                Injuries
              </h4>
              <div className="grid grid-cols-2 gap-4">
                {/* Away Team */}
                <div>
                  <div className="flex items-center gap-2 mb-1.5">
                    {game.awayTeam?.logo && <img src={game.awayTeam.logo} alt="" className="w-4 h-4" />}
                    <span className="text-xs text-white/50">{game.awayTeam?.abbreviation}</span>
                  </div>
                  {awayInjuries.length > 0 ? <InjuryList injuries={awayInjuries} /> : (
                    <span className="text-xs text-white/30">None</span>
                  )}
                </div>
                {/* Home Team */}
                <div>
                  <div className="flex items-center gap-2 mb-1.5">
                    {game.homeTeam?.logo && <img src={game.homeTeam.logo} alt="" className="w-4 h-4" />}
                    <span className="text-xs text-white/50">{game.homeTeam?.abbreviation}</span>
                  </div>
                  {homeInjuries.length > 0 ? <InjuryList injuries={homeInjuries} /> : (
                    <span className="text-xs text-white/30">None</span>
                  )}
                </div>
              </div>
            </div>
          );
        })()}
      </div>
    );
  };

  // Render expanded content for completed games
  const renderCompletedGameDetails = (game) => {
    const details = gameDetails[game.id];
    
    if (detailsLoading && expandedGame === game.id && !details) {
      return (
        <div className="mt-3 pt-3 border-t border-white/10 flex justify-center py-4">
          <div className="w-5 h-5 border-2 border-nfl-blue border-t-transparent rounded-full animate-spin" />
        </div>
      );
    }

    const hasLeaders = details?.leaders && details.leaders.length > 0;
    const hasScoringPlays = details?.scoringPlays && details.scoringPlays.length > 0;
    const hasTeamStats = details?.teamStats?.home || details?.teamStats?.away;

    // Group leaders by team
    const leadersByTeam = {};
    if (hasLeaders) {
      details.leaders.forEach(leader => {
        const team = leader.player?.team || 'Unknown';
        if (!leadersByTeam[team]) {
          leadersByTeam[team] = [];
        }
        leadersByTeam[team].push(leader);
      });
    }

    return (
      <div className="mt-3 pt-3 border-t border-white/10 space-y-4">
        {/* Top Performers by Team */}
        {hasLeaders ? (
          <div className="space-y-3">
            <h4 className="text-xs font-semibold text-white/50 uppercase tracking-wide flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5" />
              Top Performers
            </h4>
            
            {/* Mobile Layout - Stacked by team */}
            <div className="sm:hidden space-y-3">
              {Object.entries(leadersByTeam).map(([teamAbbr, leaders]) => (
                <div key={teamAbbr} className="space-y-2">
                  {/* Team Header */}
                  <div className="flex items-center gap-2">
                    {leaders[0]?.player?.teamLogo ? (
                      <img src={leaders[0].player.teamLogo} alt={teamAbbr} className="w-5 h-5" />
                    ) : null}
                    <span className="text-xs font-semibold text-white/70">{teamAbbr}</span>
                  </div>
                  
                  {/* Leaders Grid */}
                  <div className="grid grid-cols-2 gap-2">
                    {leaders.map((leader, idx) => (
                      <div key={idx} className="bg-white/5 rounded-lg p-2 flex items-start gap-2">
                        {leader.player?.headshot ? (
                          <img 
                            src={leader.player.headshot} 
                            alt={leader.player?.name}
                            className="w-10 h-10 rounded-full object-cover flex-shrink-0"
                          />
                        ) : (
                          <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-white/50 text-xs flex-shrink-0">
                            {leader.player?.position || '?'}
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="text-[10px] text-white/40 uppercase">{leader.displayName}</div>
                          <div className="text-xs font-medium text-white truncate">{leader.player?.name || 'Unknown'}</div>
                          <div className="text-[11px] text-emerald-400 font-medium leading-tight">{leader.value}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop Layout - Side by side */}
            <div className="hidden sm:grid sm:grid-cols-2 gap-4">
              {/* Away Team - Left */}
              {(() => {
                const awayLeaders = leadersByTeam[game.awayTeam?.abbreviation] || [];
                return (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 pb-1 border-b border-white/10">
                      {game.awayTeam?.logo && (
                        <img src={game.awayTeam.logo} alt={game.awayTeam?.abbreviation} className="w-6 h-6" />
                      )}
                      <span className="text-sm font-semibold text-white">{game.awayTeam?.abbreviation}</span>
                    </div>
                    <div className="space-y-2">
                      {awayLeaders.map((leader, idx) => (
                        <div key={idx} className="bg-white/5 rounded-lg p-2.5 flex items-center gap-3">
                          {leader.player?.headshot ? (
                            <img 
                              src={leader.player.headshot} 
                              alt={leader.player?.name}
                              className="w-11 h-11 rounded-full object-cover flex-shrink-0"
                            />
                          ) : (
                            <div className="w-11 h-11 rounded-full bg-white/10 flex items-center justify-center text-white/50 text-xs flex-shrink-0">
                              {leader.player?.position || '?'}
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <div className="text-[10px] text-white/40 uppercase">{leader.displayName}</div>
                            <div className="text-sm font-medium text-white">{leader.player?.name || 'Unknown'}</div>
                            <div className="text-xs text-emerald-400 font-medium">{leader.value}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}

              {/* Home Team - Right */}
              {(() => {
                const homeLeaders = leadersByTeam[game.homeTeam?.abbreviation] || [];
                return (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 pb-1 border-b border-white/10">
                      {game.homeTeam?.logo && (
                        <img src={game.homeTeam.logo} alt={game.homeTeam?.abbreviation} className="w-6 h-6" />
                      )}
                      <span className="text-sm font-semibold text-white">{game.homeTeam?.abbreviation}</span>
                    </div>
                    <div className="space-y-2">
                      {homeLeaders.map((leader, idx) => (
                        <div key={idx} className="bg-white/5 rounded-lg p-2.5 flex items-center gap-3">
                          {leader.player?.headshot ? (
                            <img 
                              src={leader.player.headshot} 
                              alt={leader.player?.name}
                              className="w-11 h-11 rounded-full object-cover flex-shrink-0"
                            />
                          ) : (
                            <div className="w-11 h-11 rounded-full bg-white/10 flex items-center justify-center text-white/50 text-xs flex-shrink-0">
                              {leader.player?.position || '?'}
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <div className="text-[10px] text-white/40 uppercase">{leader.displayName}</div>
                            <div className="text-sm font-medium text-white">{leader.player?.name || 'Unknown'}</div>
                            <div className="text-xs text-emerald-400 font-medium">{leader.value}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
        ) : null}

        {/* Scoring Summary */}
        {details?.scoringPlays && details.scoringPlays.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-xs font-semibold text-white/50 uppercase tracking-wide">
              Scoring Summary
            </h4>
            <div className="space-y-1.5 max-h-48 overflow-y-auto">
              {details.scoringPlays.map((play, idx) => (
                <div key={idx} className="bg-white/5 rounded-lg p-2 text-xs">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-white/50">Q{play.quarter} {play.time}</span>
                    <span className="font-medium text-white">
                      {game.awayTeam?.abbreviation} {play.awayScore} - {play.homeScore} {game.homeTeam?.abbreviation}
                    </span>
                  </div>
                  <div className="text-white/70">{play.team} - {play.description}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Final Stats Comparison */}
        {hasTeamStats && (
          <div className="space-y-2">
            <h4 className="text-xs font-semibold text-white/50 uppercase tracking-wide">
              Team Stats
            </h4>
            <div className="space-y-1.5">
              {['totalYards', 'passingYards', 'rushingYards', 'turnovers', 'possession'].map(stat => {
                const awayStat = details.teamStats.away?.[stat];
                const homeStat = details.teamStats.home?.[stat];
                if (!awayStat && !homeStat) return null;
                
                const statLabels = {
                  totalYards: 'Total Yards',
                  passingYards: 'Passing',
                  rushingYards: 'Rushing',
                  turnovers: 'Turnovers',
                  possession: 'Time of Poss.'
                };
                
                return (
                  <div key={stat} className="flex items-center text-xs">
                    <span className="w-12 text-right font-medium text-white">{awayStat || '-'}</span>
                    <div className="flex-1 text-center text-white/50 px-2">{statLabels[stat]}</div>
                    <span className="w-12 text-left font-medium text-white">{homeStat || '-'}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* If no details at all */}
        {!hasLeaders && !hasScoringPlays && !hasTeamStats && (
          <div className="text-center text-white/40 text-sm py-2">
            No additional details available for this game
          </div>
        )}
      </div>
    );
  };

  // Render a single game card
  const renderGameCard = (game, index) => {
    const isPast = isGamePast(game);
    const isLive = isGameLive(game);
    const isExpanded = expandedGame === game.id;
    
    // Format date for mobile
    const gameDate = new Date(game.date);
    const dateStr = gameDate.toLocaleDateString('en-US', { weekday: 'short', month: 'numeric', day: 'numeric' });
    const timeStr = gameDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
    
    return (
      <div
        key={game.id || index}
        className={`
          glass-card rounded-xl p-3 sm:p-4 transition-all cursor-pointer hover:bg-white/5
          ${isLive ? 'ring-2 ring-red-500/50 bg-red-500/5' : ''}
          ${isExpanded ? 'ring-1 ring-white/20' : ''}
        `}
        onClick={() => toggleGameExpand(game.id, game)}
      >
        {/* Mobile Layout - Vertical Stack */}
        <div className="sm:hidden">
          <div className="flex">
            {/* Teams Column */}
            <div className="flex-1 space-y-2">
              {/* Away Team */}
              <div className={`flex items-center gap-2.5 ${isPast && getScore(game.awayTeam) < getScore(game.homeTeam) ? 'opacity-50' : ''}`}>
                <ClickableTeam team={game.awayTeam} className="flex items-center gap-2.5">
                  {game.awayTeam?.logo ? (
                    <img 
                      src={game.awayTeam.logo} 
                      alt={game.awayTeam.abbreviation}
                      className="w-7 h-7 object-contain flex-shrink-0"
                    />
                  ) : (
                    <div 
                      className="w-7 h-7 rounded-full flex items-center justify-center text-white font-bold text-xs flex-shrink-0"
                      style={{ backgroundColor: game.awayTeam?.color || '#666' }}
                    >
                      {game.awayTeam?.abbreviation || '?'}
                    </div>
                  )}
                  <span className="text-white font-medium text-sm">
                    {game.awayTeam?.name || game.awayTeam?.abbreviation || 'TBD'}
                  </span>
                </ClickableTeam>
                {isPast || isLive ? (
                  <span className={`ml-auto font-bold text-base ${
                    isPast && getScore(game.awayTeam) > getScore(game.homeTeam) ? 'text-green-400' : 'text-white'
                  }`}>
                    {getScore(game.awayTeam) ?? 0}
                  </span>
                ) : (
                  <span className="ml-auto text-white/50 text-sm">{game.awayTeam?.record}</span>
                )}
              </div>
              
              {/* Home Team */}
              <div className={`flex items-center gap-2.5 ${isPast && getScore(game.homeTeam) < getScore(game.awayTeam) ? 'opacity-50' : ''}`}>
                <ClickableTeam team={game.homeTeam} className="flex items-center gap-2.5">
                  {game.homeTeam?.logo ? (
                    <img 
                      src={game.homeTeam.logo} 
                      alt={game.homeTeam.abbreviation}
                      className="w-7 h-7 object-contain flex-shrink-0"
                    />
                  ) : (
                    <div 
                      className="w-7 h-7 rounded-full flex items-center justify-center text-white font-bold text-xs flex-shrink-0"
                      style={{ backgroundColor: game.homeTeam?.color || '#666' }}
                    >
                      {game.homeTeam?.abbreviation || '?'}
                    </div>
                  )}
                  <span className="text-white font-medium text-sm">
                    {game.homeTeam?.name || game.homeTeam?.abbreviation || 'TBD'}
                  </span>
                </ClickableTeam>
                {isPast || isLive ? (
                  <span className={`ml-auto font-bold text-base ${
                    isPast && getScore(game.homeTeam) > getScore(game.awayTeam) ? 'text-green-400' : 'text-white'
                  }`}>
                    {getScore(game.homeTeam) ?? 0}
                  </span>
                ) : (
                  <span className="ml-auto text-white/50 text-sm">{game.homeTeam?.record}</span>
                )}
              </div>
            </div>
            
            {/* Game Info Column */}
            <div className="flex-shrink-0 pl-4 border-l border-white/10 ml-4 flex flex-col justify-center items-end min-w-[70px]">
              {isLive ? (
                <span className="flex items-center justify-end gap-1.5 text-xs font-semibold text-red-400">
                  <span className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse" />
                  LIVE
                </span>
              ) : isPast ? (
                <span className="text-xs font-medium text-white/50">Final</span>
              ) : (
                <>
                  <span className="text-xs text-white/70 font-medium">{dateStr}</span>
                  <span className="text-xs text-white/50">{timeStr}</span>
                  {game.broadcast && <BroadcastIcon broadcast={game.broadcast} />}
                </>
              )}
              <ChevronDown className={`w-4 h-4 text-white/30 mt-1 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
            </div>
          </div>
          
          {/* Expanded Content - Mobile */}
          {isExpanded && (
            isPast ? renderCompletedGameDetails(game) : renderUpcomingGameDetails(game)
          )}
        </div>

        {/* Desktop Layout - Horizontal */}
        <div className="hidden sm:block">
          {/* Game Header */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              {getStatusDisplay(game)}
              {game.broadcast && !isPast && <BroadcastIcon broadcast={game.broadcast} />}
            </div>
            <div className="flex items-center gap-2">
              {game.venue && (
                <span className="text-xs text-white/40 truncate max-w-[150px]">
                  {game.venue}
                </span>
              )}
              <ChevronDown className={`w-4 h-4 text-white/30 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
            </div>
          </div>

          {/* Teams */}
          <div className="flex items-center gap-4">
            {/* Away Team */}
            <ClickableTeam team={game.awayTeam} className={`flex-1 flex items-center gap-3 ${isPast && getScore(game.awayTeam) < getScore(game.homeTeam) ? 'opacity-50' : ''}`}>
              {game.awayTeam?.logo ? (
                <img 
                  src={game.awayTeam.logo} 
                  alt={game.awayTeam.abbreviation}
                  className="w-10 h-10 object-contain"
                />
              ) : (
                <div 
                  className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-xs"
                  style={{ backgroundColor: game.awayTeam?.color || '#666' }}
                >
                  {game.awayTeam?.abbreviation || '?'}
                </div>
              )}
              <div className="min-w-0 text-left">
                <div className="text-white font-medium text-base truncate">
                  {game.awayTeam?.name || game.awayTeam?.abbreviation || 'TBD'}
                </div>
                {game.awayTeam?.record && (
                  <div className="text-xs text-white/40">{game.awayTeam.record}</div>
                )}
              </div>
            </ClickableTeam>

            {/* Score / VS */}
            <div className="flex-shrink-0 text-center min-w-[80px]">
              {isPast || isLive ? (
                <div className="flex items-center justify-center gap-2">
                  <span className={`text-2xl font-bold ${
                    isPast && getScore(game.awayTeam) > getScore(game.homeTeam) ? 'text-green-400' : 'text-white'
                  }`}>
                    {getScore(game.awayTeam) ?? 0}
                  </span>
                  <span className="text-white/30">-</span>
                  <span className={`text-2xl font-bold ${
                    isPast && getScore(game.homeTeam) > getScore(game.awayTeam) ? 'text-green-400' : 'text-white'
                  }`}>
                    {getScore(game.homeTeam) ?? 0}
                  </span>
                </div>
              ) : (
                <span className="text-white/30 text-sm">vs</span>
              )}
            </div>

            {/* Home Team */}
            <ClickableTeam team={game.homeTeam} className={`flex-1 flex items-center justify-end gap-3 ${isPast && getScore(game.homeTeam) < getScore(game.awayTeam) ? 'opacity-50' : ''}`}>
              <div className="min-w-0 text-right">
                <div className="text-white font-medium text-base truncate">
                  {game.homeTeam?.name || game.homeTeam?.abbreviation || 'TBD'}
                </div>
                {game.homeTeam?.record && (
                  <div className="text-xs text-white/40">{game.homeTeam.record}</div>
                )}
              </div>
              {game.homeTeam?.logo ? (
                <img 
                  src={game.homeTeam.logo} 
                  alt={game.homeTeam.abbreviation}
                  className="w-10 h-10 object-contain"
                />
              ) : (
                <div 
                  className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-xs"
                  style={{ backgroundColor: game.homeTeam?.color || '#666' }}
                >
                  {game.homeTeam?.abbreviation || '?'}
                </div>
              )}
            </ClickableTeam>
          </div>
          
          {/* Expanded Content - Desktop */}
          {isExpanded && (
            isPast ? renderCompletedGameDetails(game) : renderUpcomingGameDetails(game)
          )}
        </div>
      </div>
    );
  };

  if (loading) {
    return <Loading fullScreen />;
  }

  return (
    <div className="max-w-3xl mx-auto px-3 sm:px-4 pt-0 sm:py-8 pb-4">
      {/* Header with Season Dropdown */}
      <div className="mb-4 sm:mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-white">
            NFL Schedule
          </h1>
          <p className="text-white/60 text-sm sm:text-base mt-1">
            {selectedSeasonType === 3 
              ? `${season} Playoffs` 
              : `${season} Regular Season`
            }
          </p>
        </div>
        
        {/* Current Week Button & Season Dropdown */}
        <div className="flex items-center gap-2">
          {/* Current Week Button - show when not viewing current */}
          {(selectedSeasonType !== currentSeasonType || 
            (selectedSeasonType === 2 && selectedWeek !== currentWeek) || 
            season !== currentYear) && (
            <button
              onClick={() => {
                setSeason(currentYear);
                setSelectedSeasonType(currentSeasonType);
                if (currentSeasonType === 2) {
                  setSelectedWeek(currentWeek);
                }
              }}
              className="flex items-center gap-1.5 px-3 py-2 bg-nfl-blue hover:bg-blue-600 rounded-lg transition-colors text-white text-sm font-medium"
            >
              <Calendar className="w-4 h-4" />
              <span className="hidden sm:inline">Current</span>
            </button>
          )}
          
          {/* Season Dropdown */}
          <div className="relative" ref={seasonDropdownRef}>
            <button
              onClick={() => setShowSeasonDropdown(!showSeasonDropdown)}
              className="flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/15 rounded-lg transition-colors text-white text-sm font-medium"
            >
              {season}
              <ChevronDown className={`w-4 h-4 transition-transform ${showSeasonDropdown ? 'rotate-180' : ''}`} />
            </button>
            
            {showSeasonDropdown && (
              <div className="absolute left-0 sm:right-0 sm:left-auto mt-2 w-36 bg-[#1a1f2e] border border-white/20 rounded-lg shadow-2xl z-50 overflow-hidden">
                {seasonOptions.map(year => (
                  <button
                    key={year}
                    onClick={() => handleSeasonChange(year)}
                    className={`w-full px-4 py-2.5 text-left text-sm transition-colors ${
                      year === season 
                        ? 'bg-nfl-blue text-white' 
                        : 'text-white hover:bg-white/10'
                    }`}
                  >
                    {year} Season
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Season Type Toggle */}
      <div className="flex gap-2 mb-4">
        <button
          onClick={() => {
            setSelectedSeasonType(2);
            // If on current season, go to current week; otherwise go to week 1
            if (season === currentYear && currentSeasonType === 2) {
              setSelectedWeek(currentWeek);
            } else {
              setSelectedWeek(1);
            }
          }}
          className={`flex-1 sm:flex-none px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            selectedSeasonType === 2
              ? 'bg-nfl-blue text-white'
              : 'bg-white/5 text-white/60 hover:bg-white/10'
          }`}
        >
          Regular Season
        </button>
        <button
          onClick={() => {
            setSelectedSeasonType(3);
          }}
          className={`flex-1 sm:flex-none px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            selectedSeasonType === 3
              ? 'bg-nfl-blue text-white'
              : 'bg-white/5 text-white/60 hover:bg-white/10'
          }`}
        >
          Playoffs
        </button>
      </div>

      {/* Week Selector - Only show for regular season */}
      {selectedSeasonType === 2 && (
        <div className="mb-4 sm:mb-6">
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                if (selectedWeek > 1) {
                  setSelectedWeek(selectedWeek - 1);
                }
              }}
              disabled={selectedWeek <= 1}
              className="p-2 bg-white/5 hover:bg-white/10 rounded-lg transition-colors disabled:opacity-30 flex-shrink-0"
            >
              <ChevronLeft className="w-5 h-5 text-white" />
            </button>
            
            <div className="flex-1 overflow-x-auto scrollbar-hide" ref={weekTabsRef}>
              <div className="flex gap-1.5 sm:gap-2 pb-1">
                {regularWeeks.map(week => {
                  const isSelected = selectedWeek === week;
                  const isCurrent = season === currentYear && currentSeasonType === 2 && week === currentWeek;
                  
                  return (
                    <button
                      key={`regular-${week}`}
                      ref={el => weekButtonRefs.current[`2-${week}`] = el}
                      onClick={() => setSelectedWeek(week)}
                      className={`
                        relative px-3 sm:px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-all flex-shrink-0
                        ${isSelected 
                          ? 'bg-nfl-blue text-white' 
                          : 'bg-white/5 text-white/60 hover:bg-white/10 hover:text-white'
                        }
                      `}
                    >
                      <span className="hidden sm:inline">Week </span>{week}
                      {isCurrent && (
                        <span className={`absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full ${isSelected ? 'bg-yellow-400' : 'bg-green-500'}`} />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
            
            <button
              onClick={() => {
                if (selectedWeek < 18) {
                  setSelectedWeek(selectedWeek + 1);
                }
              }}
              disabled={selectedWeek >= 18}
              className="p-2 bg-white/5 hover:bg-white/10 rounded-lg transition-colors disabled:opacity-30 flex-shrink-0"
            >
              <ChevronRight className="w-5 h-5 text-white" />
            </button>
          </div>
        </div>
      )}

      {/* Loading state for schedule */}
      {scheduleLoading ? (
        <div className="glass-card rounded-xl p-12 text-center">
          <div className="w-8 h-8 border-2 border-nfl-blue border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-white/50">Loading schedule...</p>
        </div>
      ) : selectedSeasonType === 3 ? (
        /* Playoffs - All rounds on one page */
        Object.keys(playoffSchedule).length === 0 ? (
          <div className="glass-card rounded-xl p-8 sm:p-12 text-center">
            <Trophy className="w-12 h-12 sm:w-16 sm:h-16 text-white/20 mx-auto mb-4" />
            <h3 className="text-lg sm:text-xl font-semibold text-white mb-2">No Playoff Games Found</h3>
            <p className="text-white/60 text-sm sm:text-base">
              {season} playoff schedule is not available yet
            </p>
          </div>
        ) : (
          <div className="space-y-8">
            {playoffRoundNumbers.map(round => {
              const games = playoffSchedule[round];
              if (!games || games.length === 0) return null;
              
              return (
                <div key={round}>
                  {/* Round Header */}
                  <div className="flex items-center gap-3 mb-4">
                    <Trophy className={`w-5 h-5 ${round === 5 ? 'text-yellow-400' : 'text-white/60'}`} />
                    <h2 className={`text-lg sm:text-xl font-bold ${round === 5 ? 'text-yellow-400' : 'text-white'}`}>
                      {PLAYOFF_ROUNDS[round]}
                    </h2>
                    <div className="flex-1 h-px bg-white/10" />
                  </div>
                  
                  {/* Games for this round */}
                  <div className="space-y-2">
                    {games.map((game, index) => renderGameCard(game, `${round}-${index}`))}
                  </div>
                </div>
              );
            })}
          </div>
        )
      ) : schedule.length === 0 ? (
        <div className="glass-card rounded-xl p-8 sm:p-12 text-center">
          <Calendar className="w-12 h-12 sm:w-16 sm:h-16 text-white/20 mx-auto mb-4" />
          <h3 className="text-lg sm:text-xl font-semibold text-white mb-2">No Games Found</h3>
          <p className="text-white/60 text-sm sm:text-base">
            Week {selectedWeek} schedule is not available
          </p>
        </div>
      ) : (
        /* Regular Season - Games by Day */
        <div className="space-y-6">
          {Object.entries(groupedGames).map(([day, games]) => (
            <div key={day}>
              <h2 className="text-sm font-semibold text-white/50 uppercase tracking-wider mb-3 flex items-center gap-2">
                <Calendar className="w-4 h-4" />
                {day}
              </h2>
              
              <div className="space-y-2">
                {games.map((game, index) => renderGameCard(game, index))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Team Info Dialog */}
      {teamInfoDialog.open && (
        <TeamInfoDialog 
          team={teamInfoDialog.team}
          onClose={() => setTeamInfoDialog({ open: false, team: null })}
        />
      )}
    </div>
  );
}