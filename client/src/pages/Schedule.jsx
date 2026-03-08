import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Calendar, ChevronLeft, ChevronRight, ChevronDown, ChevronUp, Trophy, TrendingUp, Users, Target, AlertTriangle, ArrowRight } from 'lucide-react';
import { nflAPI, scheduleAPI } from '../api';
import { getSportModule } from '../sports';
import { useAuth } from '../context/AuthContext';
import Loading from '../components/Loading';
import TeamInfoDialog from '../components/TeamInfoDialog';
import StatRankingDialog from '../components/StatRankingDialog';
import BoxScore from '../components/BoxScore';
import { PLAYOFF_ROUNDS, BROADCAST_NETWORKS } from '../sports/nfl/constants';

const SPORT_TABS = [
  { id: 'nfl', name: 'NFL', implemented: true, scheduleType: 'weekly' },
  { id: 'nba', name: 'NBA', implemented: true, scheduleType: 'daily' },
  { id: 'mlb', name: 'MLB', implemented: true, scheduleType: 'daily' },
  { id: 'nhl', name: 'NHL', implemented: true, scheduleType: 'daily' },
  { id: 'ncaab', name: 'NCAAB', implemented: true, scheduleType: 'daily' },
];

const SEASON_STATS_CONFIG = {
  nfl: [
    { key: 'avgPointsFor', label: 'PPG', source: 'game' },
    { key: 'avgPointsAgainst', label: 'Opp PPG', source: 'game' },
  ],
  nba: [
    { key: 'avgPoints', label: 'PPG' },
    { key: 'avgPointsAgainst', label: 'Opp PPG', source: 'details' },
    { key: 'fieldGoalPct', label: 'FG%' },
    { key: 'threePointFieldGoalPct', label: '3PT%' },
    { key: 'avgRebounds', label: 'RPG' },
    { key: 'avgAssists', label: 'APG' },
  ],
  ncaab: [
    { key: 'avgPoints', label: 'PPG' },
    { key: 'avgPointsAgainst', label: 'Opp PPG', source: 'details' },
    { key: 'fieldGoalPct', label: 'FG%' },
    { key: 'threePointFieldGoalPct', label: '3PT%' },
    { key: 'avgRebounds', label: 'RPG' },
    { key: 'avgAssists', label: 'APG' },
  ],
  mlb: [
    { key: 'runs', label: 'Runs' },
    { key: 'avg', label: 'AVG' },
    { key: 'ERA', label: 'ERA' },
    { key: 'hits', label: 'Hits' },
    { key: 'saves', label: 'SV' },
    { key: 'errors', label: 'Errors' },
  ],
  nhl: [
    { key: 'goals', label: 'Goals' },
    { key: 'ytdGoals', label: 'Season GF' },
    { key: 'assists', label: 'Assists' },
    { key: 'saves', label: 'Saves' },
    { key: 'savePct', label: 'SV%' },
    { key: 'points', label: 'Points' },
  ],
};

// Color-code rankings: green (top tier), amber (mid), red (bottom)
const getRankColor = (rankStr) => {
  if (!rankStr) return 'text-white/50';
  const rank = parseInt(rankStr);
  if (isNaN(rank)) return 'text-white/50';
  if (rank <= 10) return 'text-emerald-400';
  if (rank <= 22) return 'text-amber-400';
  return 'text-red-400';
};

const TeamRankBadge = ({ team }) => {
  const current = Number(team?.ranking?.current);
  // ESPN uses high sentinel ranks (commonly 99) for effectively unranked teams.
  if (!Number.isFinite(current) || current <= 0 || current >= 99) return null;
  const movement = team?.ranking?.movement;

  let movementText = '';
  let movementClass = 'text-white/50';
  if (typeof movement === 'number') {
    if (movement > 0) {
      movementText = `▲${movement}`;
      movementClass = 'text-emerald-400';
    } else if (movement < 0) {
      movementText = `▼${Math.abs(movement)}`;
      movementClass = 'text-red-400';
    } else {
      movementText = '—';
      movementClass = 'text-white/40';
    }
  }

  return (
    <span className="inline-flex items-center gap-1 text-sm font-medium text-white/45">
      <span>#{current}</span>
      {movementText && <span className={movementClass}>{movementText}</span>}
    </span>
  );
};

const parseStandingSummary = (summary) => {
  if (!summary) return null;
  const m = String(summary).match(/(\d+)(?:st|nd|rd|th)\s+in\s+(.+)/i);
  if (!m) return null;
  const rank = parseInt(m[1], 10);
  if (!Number.isFinite(rank)) return null;
  return { rank, context: m[2] };
};

const parseConferenceLabelFromSummary = (summary) => {
  if (!summary) return null;
  const upper = String(summary).toUpperCase();
  if (upper.includes('AFC')) return 'AFC';
  if (upper.includes('NFC')) return 'NFC';
  if (upper.includes('EASTERN')) return 'East';
  if (upper.includes('WESTERN')) return 'West';
  if (upper.includes('AL ')) return 'AL';
  if (upper.includes('NL ')) return 'NL';
  return null;
};

const parseDivisionLabelFromSummary = (summary) => {
  const parsed = parseStandingSummary(summary);
  if (!parsed?.context) return null;
  // Examples:
  // "Atlantic Division" -> "Atlantic"
  // "NFC South" -> "NFC South"
  // "AL East" -> "AL East"
  return parsed.context.replace(/\s+Division$/i, '').trim();
};

const StandingBadge = ({ label, rank }) => {
  if (!label || !rank) return null;
  return <span className="text-sm font-medium text-white/45">{label} #{rank}</span>;
};

export default function Schedule() {
  const { user } = useAuth();
  const [selectedSport, setSelectedSport] = useState('nfl');
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
  const [statRankingDialog, setStatRankingDialog] = useState(null);
  const [selectedDate, setSelectedDate] = useState(() => {
    const today = new Date();
    return today.toISOString().split('T')[0]; // YYYY-MM-DD
  });
  const [dailySchedule, setDailySchedule] = useState([]);
  const [dailyLoading, setDailyLoading] = useState(false);
  const [leagueRanksByStat, setLeagueRanksByStat] = useState({});
  const [leagueRanksLoaded, setLeagueRanksLoaded] = useState(false);
  
  const weekTabsRef = useRef(null);
  const weekButtonRefs = useRef({});
  const seasonDropdownRef = useRef(null);

  const getTeamStandingBadges = (team) => {
    if (!team) return [];
    const badges = [];
    const conf = team.standingsRanks?.conference;
    const div = team.standingsRanks?.division;
    const parsedSummary = parseStandingSummary(team.standingSummary);
    const divisionLabel = parseDivisionLabelFromSummary(team.standingSummary);
    const summaryDivRank = parsedSummary && /division/i.test(parsedSummary.context) ? parsedSummary.rank : null;

    if (selectedSport === 'nba') {
      if (conf?.rank) badges.push({ label: conf.label || 'Conf', rank: conf.rank });
      if (div?.rank || summaryDivRank) badges.push({ label: divisionLabel || 'Div', rank: div?.rank || summaryDivRank });
    } else if (selectedSport === 'mlb') {
      if (conf?.rank) badges.push({ label: conf.label || 'Lg', rank: conf.rank });
      if (div?.rank || summaryDivRank) badges.push({ label: divisionLabel || 'Div', rank: div?.rank || summaryDivRank });
    } else if (selectedSport === 'nhl') {
      if (conf?.rank) badges.push({ label: conf.label || 'Conf', rank: conf.rank });
      if (summaryDivRank) badges.push({ label: divisionLabel || 'Div', rank: summaryDivRank });
    } else if (selectedSport === 'nfl') {
      const confLabel = parseConferenceLabelFromSummary(team.standingSummary) || conf?.label || 'Conf';
      if (conf?.rank) badges.push({ label: confLabel, rank: conf.rank });
      if (div?.rank) badges.push({ label: divisionLabel || 'Div', rank: div.rank });
    }

    return badges;
  };

  // DatePicker component for daily sports
  const DatePicker = ({ date, onChange }) => {
    const dateObj = new Date(date + 'T12:00:00'); // noon to avoid timezone issues
    const formatted = dateObj.toLocaleDateString('en-US', {
      weekday: 'long', month: 'long', day: 'numeric', year: 'numeric'
    });

    const changeDate = (delta) => {
      const d = new Date(date + 'T12:00:00');
      d.setDate(d.getDate() + delta);
      onChange(d.toISOString().split('T')[0]);
    };

    const isToday = date === new Date().toISOString().split('T')[0];

    return (
      <div className="flex items-center gap-2 mb-4 sm:mb-6">
        <button onClick={() => changeDate(-1)} className="p-2 bg-white/5 hover:bg-white/10 rounded-lg transition-colors flex-shrink-0">
          <ChevronLeft className="w-5 h-5 text-white" />
        </button>
        <div className="flex-1 text-center">
          <span className="text-white font-medium text-sm sm:text-base">{formatted}</span>
        </div>
        <button onClick={() => changeDate(1)} className="p-2 bg-white/5 hover:bg-white/10 rounded-lg transition-colors flex-shrink-0">
          <ChevronRight className="w-5 h-5 text-white" />
        </button>
        {!isToday && (
          <button
            onClick={() => onChange(new Date().toISOString().split('T')[0])}
            className="px-3 py-2 bg-white/10 hover:bg-white/15 rounded-lg transition-colors text-white text-sm font-medium flex-shrink-0"
          >
            Today
          </button>
        )}
      </div>
    );
  };

  // Generate season options (current year back to 2020)
  const seasonOptions = Array.from({ length: currentYear - 2019 }, (_, i) => currentYear - i);
  const playoffRoundNumbers = [1, 2, 3, 5]; // Wild Card, Divisional, Conference, Super Bowl

  useEffect(() => {
    let cancelled = false;

    const loadSeason = async () => {
      try {
        const result = await nflAPI.getSeason();
        if (cancelled) return;
        
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
      if (!cancelled) {
        setLoading(false);
        setInitialLoadDone(true);
      }
    };
    
    loadSeason();
    
    return () => {
      cancelled = true;
    };
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

  // Load daily schedule for non-NFL sports
  useEffect(() => {
    const sportTab = SPORT_TABS.find(s => s.id === selectedSport);
    if (!sportTab || sportTab.scheduleType !== 'daily') return;

    let cancelled = false;
    const loadDailySchedule = async () => {
      setDailyLoading(true);
      try {
        const result = await scheduleAPI.getScheduleByDate(selectedSport, selectedDate);
        if (!cancelled) {
          setDailySchedule(result.games || []);
        }
      } catch (error) {
        console.error('Failed to load daily schedule:', error);
        if (!cancelled) setDailySchedule([]);
      }
      if (!cancelled) setDailyLoading(false);
    };

    loadDailySchedule();
    return () => { cancelled = true; };
  }, [selectedSport, selectedDate]);

  // Preload league-wide rankings for season-average stat labels shown on cards.
  useEffect(() => {
    let cancelled = false;

    const loadLeagueRanks = async () => {
      setLeagueRanksLoaded(false);
      const config = SEASON_STATS_CONFIG[selectedSport] || SEASON_STATS_CONFIG.nfl;
      let statKeys = [...new Set(config.map((s) => s.key).filter(Boolean))];
      // NCAAB has a much larger team pool; only prefetch Opp PPG rank (missing from scoreboard metadata).
      if (selectedSport === 'ncaab') {
        statKeys = statKeys.filter((k) => k === 'avgPointsAgainst');
      }

      if (statKeys.length === 0) {
        setLeagueRanksByStat({});
        setLeagueRanksLoaded(true);
        return;
      }

      const entries = await Promise.all(
        statKeys.map(async (statKey) => {
          try {
            const data = await scheduleAPI.getStatRankings(selectedSport, statKey);
            if (!data?.success || !Array.isArray(data.rankings)) return [statKey, null];
            const teamRankMap = data.rankings.reduce((acc, item) => {
              if (item?.team?.id && item?.rank) acc[String(item.team.id)] = item.rankDisplayValue || String(item.rank);
              return acc;
            }, {});
            return [statKey, teamRankMap];
          } catch {
            return [statKey, null];
          }
        })
      );

      if (cancelled) return;
      const next = {};
      entries.forEach(([key, value]) => {
        if (key && value) next[key] = value;
      });
      setLeagueRanksByStat(next);
      setLeagueRanksLoaded(true);
    };

    loadLeagueRanks();
    return () => {
      cancelled = true;
    };
  }, [selectedSport]);

  // Handle sport tab change
  const handleSportChange = (sportId) => {
    setSelectedSport(sportId);
    setExpandedGame(null);
    setGameDetails({});
    setGameInjuries({});
    // Reset date to today for daily sports
    const sportTab = SPORT_TABS.find(s => s.id === sportId);
    if (sportTab?.scheduleType === 'daily') {
      setSelectedDate(new Date().toISOString().split('T')[0]);
    }
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
        const sportTab = SPORT_TABS.find(s => s.id === selectedSport);
        const details = sportTab?.scheduleType === 'daily'
          ? await scheduleAPI.getGameDetails(selectedSport, gameId)
          : await nflAPI.getGameDetails(gameId);
        setGameDetails(prev => ({ ...prev, [gameId]: details }));
      } catch (error) {
        console.error('Failed to load game details:', error);
        setGameDetails(prev => ({ ...prev, [gameId]: {} }));
      }
      setDetailsLoading(false);
    }

    // Injuries only for NFL
    if (selectedSport === 'nfl' && !gameInjuries[gameId] && game) {
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

    // Get sport-specific broadcast networks
    const sportModule = getSportModule(selectedSport);
    const sportNetworks = sportModule?.broadcastNetworks || {};
    const allNetworks = { ...BROADCAST_NETWORKS, ...sportNetworks };

    for (const [key, value] of Object.entries(allNetworks)) {
      if (broadcastUpper.includes(key.toUpperCase())) {
        return { name: broadcast, ...value };
      }
    }

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
                  <div className="text-sm font-semibold text-white">
                    {game.awayTeam?.abbreviation} {odds.awayMoneyLine > 0 ? '+' : ''}{odds.awayMoneyLine}
                  </div>
                  <div className="text-sm font-semibold text-white">
                    {game.homeTeam?.abbreviation} {odds.homeMoneyLine > 0 ? '+' : ''}{odds.homeMoneyLine}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
        
        {/* Win Probability */}
        {details?.winProbability && (() => {
          const awayPct = Math.round(Number(details.winProbability.awayWinPct) || 50);
          const homePct = Math.round(Number(details.winProbability.homeWinPct) || 50);

          // Pick a color visible on dark backgrounds — use alternateColor if primary is too dark
          const visibleColor = (team) => {
            const primary = team?.color || '#6B7280';
            const hex = primary.replace('#', '');
            const r = parseInt(hex.substring(0, 2), 16);
            const g = parseInt(hex.substring(2, 4), 16);
            const b = parseInt(hex.substring(4, 6), 16);
            // Relative luminance threshold — below this, the color vanishes on dark bg
            const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
            if (luminance < 0.25 && team?.alternateColor) return team.alternateColor;
            return primary;
          };

          const awayColor = visibleColor(game.awayTeam);
          const homeColor = visibleColor(game.homeTeam);
          return (
            <div className="space-y-2">
              <h4 className="text-xs font-semibold text-white/50 uppercase tracking-wide flex items-center gap-1.5">
                <TrendingUp className="w-3.5 h-3.5" />
                Win Probability
              </h4>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="text-xs font-medium text-white">{game.awayTeam?.abbreviation}</span>
                  <span className="text-xs font-bold text-white">{awayPct}%</span>
                </div>
                <div className="flex-1 h-3 rounded-full overflow-hidden flex">
                  <div
                    className="h-full transition-all duration-300"
                    style={{ width: `${awayPct}%`, backgroundColor: awayColor }}
                  />
                  <div
                    className="h-full transition-all duration-300"
                    style={{ width: `${homePct}%`, backgroundColor: homeColor }}
                  />
                </div>
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="text-xs font-bold text-white">{homePct}%</span>
                  <span className="text-xs font-medium text-white">{game.homeTeam?.abbreviation}</span>
                </div>
              </div>
            </div>
          );
        })()}

        {/* Team Season Stats — Sport-specific */}
        {(() => {
          const config = SEASON_STATS_CONFIG[selectedSport] || SEASON_STATS_CONFIG.nfl;

          // Build stat rows for a team from scoreboard + details data
          const getTeamStats = (team, side) => {
            const scoreboard = team?.seasonStats || {};
            const detailStats = details?.seasonAverages?.[side]?.stats || {};
            const streak = details?.seasonAverages?.[side]?.streak || (selectedSport === 'nfl' ? team?.streak : null);
            const lastTen = details?.seasonAverages?.[side]?.lastTen;

            const stats = config.map(({ key, label, source }) => {
              const leagueRank = leagueRanksByStat[key]?.[String(team?.id)] || null;
              const fallbackRank = leagueRanksLoaded ? scoreboard[key]?.rank || null : null;
              // NFL embeds avgPointsFor/avgPointsAgainst directly on team object
              if (source === 'game') return { label, value: team?.[key] || '-', rank: leagueRank || fallbackRank, statKey: key };
              // Details-only stats (like opp PPG from boxscore)
              if (source === 'details') return { label, value: detailStats[key]?.displayValue || '-', rank: leagueRank || fallbackRank, statKey: key };
              // Default: try scoreboard stats first, then detail stats
              const val = scoreboard[key]?.displayValue || detailStats[key]?.displayValue;
              const rank = leagueRank || fallbackRank;
              return { label, value: val || '-', rank, statKey: key };
            });

            return { stats, streak, lastTen };
          };

          const awayData = getTeamStats(game.awayTeam, 'away');
          const homeData = getTeamStats(game.homeTeam, 'home');

          // Check if any stats have actual values (not all dashes)
          const hasData = [...awayData.stats, ...homeData.stats].some(s => s.value !== '-');
          if (!hasData && !awayData.streak && !homeData.streak) return null;

          const canClickStat = true;

          const TeamSeasonColumn = ({ team, data }) => (
            <div className="bg-white/5 rounded-lg p-3">
              <div className="flex items-center gap-2 mb-2.5">
                {team?.logo && <img src={team.logo} alt="" className="w-6 h-6 object-contain" />}
                <span className="text-sm font-semibold text-white">{team?.abbreviation}</span>
              </div>
              <div className="space-y-1.5 text-sm">
                {data.stats.map((stat, i) => (
                  <div
                    key={i}
                    className={`flex justify-between items-center rounded px-1 -mx-1 ${canClickStat ? 'cursor-pointer hover:bg-white/10 transition-colors' : ''}`}
                    onClick={canClickStat ? (e) => {
                      e.stopPropagation();
                      setStatRankingDialog({
                        statKey: stat.statKey,
                        statLabel: stat.label,
                        currentTeamIds: [game.homeTeam?.id, game.awayTeam?.id].filter(Boolean)
                      });
                    } : undefined}
                  >
                    <span className="text-white/50">{stat.label}</span>
                    <span className="text-white font-medium">
                      {stat.value}
                      {stat.rank && <span className={`ml-1 text-xs ${getRankColor(stat.rank)}`}>({stat.rank})</span>}
                    </span>
                  </div>
                ))}
                {data.lastTen && (
                  <div className="flex justify-between items-center px-1 -mx-1">
                    <span className="text-white/50">Last 10</span>
                    <span className="text-white font-medium">{data.lastTen}</span>
                  </div>
                )}
                {data.streak && (
                  <div className="flex justify-between items-center px-1 -mx-1">
                    <span className="text-white/50">Streak</span>
                    <span className={`font-medium ${data.streak.type === 'W' ? 'text-green-400' : 'text-red-400'}`}>
                      {data.streak.type}{data.streak.count}
                    </span>
                  </div>
                )}
              </div>
            </div>
          );

          return (
            <div className="space-y-2">
              <h4 className="text-xs font-semibold text-white/50 uppercase tracking-wide flex items-center gap-1.5">
                <TrendingUp className="w-3.5 h-3.5" />
                Season Averages
              </h4>
              <div className="grid grid-cols-2 gap-3">
                <TeamSeasonColumn team={game.awayTeam} data={awayData} />
                <TeamSeasonColumn team={game.homeTeam} data={homeData} />
              </div>
            </div>
          );
        })()}
        
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

  // Get sport-specific stat labels for completed game details
  const getStatLabels = () => {
    if (selectedSport === 'nba' || selectedSport === 'ncaab') {
      return {
        fieldGoalPct: 'FG%',
        threePointPct: '3PT%',
        freeThrowPct: 'FT%',
        rebounds: 'Rebounds',
        assists: 'Assists',
        turnovers: 'Turnovers',
      };
    }
    if (selectedSport === 'mlb') {
      return {
        hits: 'Hits',
        runs: 'Runs',
        errors: 'Errors',
        leftOnBase: 'LOB',
        battingAvg: 'Batting Avg',
        strikeouts: 'Strikeouts',
      };
    }
    if (selectedSport === 'nhl') {
      return {
        shotsOnGoal: 'Shots on Goal',
        powerPlays: 'Power Plays',
        penaltyMinutes: 'Penalty Min.',
        faceoffPct: 'Faceoff %',
        hits: 'Hits',
        blockedShots: 'Blocked Shots',
      };
    }
    // NFL default
    return {
      totalYards: 'Total Yards',
      passingYards: 'Passing',
      rushingYards: 'Rushing',
      turnovers: 'Turnovers',
      possession: 'Time of Poss.',
    };
  };

  // Render expanded content for completed games
  const renderCompletedGameDetails = (game) => {
    const details = gameDetails[game.id];
    
    if (detailsLoading && expandedGame === game.id && !details) {
      return (
        <div className="mt-3 pt-3 border-t border-white/10 flex justify-center py-4">
          <div className={`w-5 h-5 border-2 ${selectedSport === 'nfl' ? 'border-nfl-blue' : 'border-white/30'} border-t-transparent rounded-full animate-spin`} />
        </div>
      );
    }

    const hasLeaders = details?.leaders && details.leaders.length > 0;
    const hasScoringPlays = details?.scoringPlays && details.scoringPlays.length > 0;
    const hasTeamStats = details?.teamStats?.home || details?.teamStats?.away;
    const hasPlayerStats = details?.playerStats?.teams?.length > 0;

    const formatTeamStatValue = (value) => {
      if (!value || typeof value !== 'string') return value;
      const m = value.match(/^(\d+)\s*-\s*(\d+)$/);
      if (!m) return value;
      const made = parseInt(m[1], 10);
      const attempts = parseInt(m[2], 10);
      if (!Number.isFinite(made) || !Number.isFinite(attempts)) return value;

      const ratio = `${made}/${attempts}`;
      if (attempts <= 0) return ratio;

      const pct = Math.round((made / attempts) * 100);
      return `${pct}% (${ratio})`;
    };

    const renderTeamStatValue = (value, align = 'right') => {
      if (!value || typeof value !== 'string') return <>{value || '-'}</>;
      const m = value.match(/^(\d+)%\s+\((\d+\/\d+)\)$/);
      if (!m) return <>{value}</>;

      return (
        <span className={`inline-flex items-center gap-1 ${align === 'right' ? 'justify-end' : 'justify-start'}`}>
          <span className="text-white">{m[1]}%</span>
          <span className="text-white/55">({m[2]})</span>
        </span>
      );
    };

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

        {/* Box Score */}
        {hasPlayerStats && (
          <BoxScore playerStats={details.playerStats} game={game} />
        )}

        {/* Scoring Summary */}
        {details?.scoringPlays && details.scoringPlays.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-xs font-semibold text-white/50 uppercase tracking-wide">
              {selectedSport === 'nhl' ? 'Goals' : 'Scoring Summary'}
            </h4>
            <div className="space-y-1.5 max-h-48 overflow-y-auto">
              {details.scoringPlays.map((play, idx) => (
                <div key={idx} className="bg-white/5 rounded-lg p-2 text-xs">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-white/50">
                      {play.periodLabel || `Q${play.quarter}`} {play.time}
                    </span>
                    <span className="font-medium text-white">
                      {game.awayTeam?.abbreviation} {play.awayScore} - {play.homeScore} {game.homeTeam?.abbreviation}
                    </span>
                  </div>
                  <div className="text-white/70 flex items-center gap-1.5">
                    {play.teamLogo && <img src={play.teamLogo} alt="" className="w-4 h-4" />}
                    {play.team} - {play.description}
                  </div>
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
              {Object.entries(getStatLabels()).map(([statKey, label]) => {
                const awayStat = formatTeamStatValue(details.teamStats.away?.[statKey]);
                const homeStat = formatTeamStatValue(details.teamStats.home?.[statKey]);
                if (!awayStat && !homeStat) return null;

                return (
                  <div key={statKey} className="flex items-center text-sm">
                    <span className="w-20 text-right font-medium whitespace-nowrap">
                      {renderTeamStatValue(awayStat, 'right')}
                    </span>
                    <div className="flex-1 text-center text-white/50 px-2">{label}</div>
                    <span className="w-20 text-left font-medium whitespace-nowrap">
                      {renderTeamStatValue(homeStat, 'left')}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* If no details at all */}
        {!hasLeaders && !hasScoringPlays && !hasTeamStats && !hasPlayerStats && (
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
                <ClickableTeam team={game.awayTeam}>
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
                </ClickableTeam>
                <ClickableTeam team={game.awayTeam}>
                  <span className="text-white font-medium text-sm hover:underline">
                    {game.awayTeam?.name || game.awayTeam?.abbreviation || 'TBD'}
                  </span>
                </ClickableTeam>
                {selectedSport === 'ncaab' && <TeamRankBadge team={game.awayTeam} />}
                {isPast || isLive ? (
                  <span className={`ml-auto font-bold text-base ${
                    isPast && getScore(game.awayTeam) > getScore(game.homeTeam) ? 'text-green-400' : 'text-white'
                  }`}>
                    {getScore(game.awayTeam) ?? 0}
                  </span>
                ) : (
                  <div className="ml-auto flex items-center gap-2 text-sm">
                    {game.awayTeam?.record && <span className="text-sm font-medium text-white/45">{game.awayTeam.record}</span>}
                    {getTeamStandingBadges(game.awayTeam).map((b, i) => (
                      <StandingBadge key={`${b.label}-${b.rank}-${i}`} label={b.label} rank={b.rank} />
                    ))}
                  </div>
                )}
              </div>

              {/* Home Team */}
              <div className={`flex items-center gap-2.5 ${isPast && getScore(game.homeTeam) < getScore(game.awayTeam) ? 'opacity-50' : ''}`}>
                <ClickableTeam team={game.homeTeam}>
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
                </ClickableTeam>
                <ClickableTeam team={game.homeTeam}>
                  <span className="text-white font-medium text-sm hover:underline">
                    {game.homeTeam?.name || game.homeTeam?.abbreviation || 'TBD'}
                  </span>
                </ClickableTeam>
                {selectedSport === 'ncaab' && <TeamRankBadge team={game.homeTeam} />}
                {isPast || isLive ? (
                  <span className={`ml-auto font-bold text-base ${
                    isPast && getScore(game.homeTeam) > getScore(game.awayTeam) ? 'text-green-400' : 'text-white'
                  }`}>
                    {getScore(game.homeTeam) ?? 0}
                  </span>
                ) : (
                  <div className="ml-auto flex items-center gap-2 text-sm">
                    {game.homeTeam?.record && <span className="text-sm font-medium text-white/45">{game.homeTeam.record}</span>}
                    {getTeamStandingBadges(game.homeTeam).map((b, i) => (
                      <StandingBadge key={`${b.label}-${b.rank}-${i}`} label={b.label} rank={b.rank} />
                    ))}
                  </div>
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
            <div className={`flex-1 flex items-center gap-3 ${isPast && getScore(game.awayTeam) < getScore(game.homeTeam) ? 'opacity-50' : ''}`}>
              <ClickableTeam team={game.awayTeam}>
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
              </ClickableTeam>
              <ClickableTeam team={game.awayTeam} className="min-w-0 text-left">
                <div className="text-white font-medium text-base truncate hover:underline">
                  {game.awayTeam?.name || game.awayTeam?.abbreviation || 'TBD'}
                </div>
                {(game.awayTeam?.record ||
                  game.awayTeam?.standingSummary ||
                  getTeamStandingBadges(game.awayTeam).length > 0 ||
                  (selectedSport === 'ncaab' && game.awayTeam?.ranking?.current)) && (
                  <div className="mt-0.5 flex items-center gap-2 text-sm">
                    {game.awayTeam?.record && (
                      <span className="text-sm font-medium text-white/45">{game.awayTeam.record}</span>
                    )}
                    {getTeamStandingBadges(game.awayTeam).map((b, i) => (
                      <StandingBadge key={`${b.label}-${b.rank}-${i}`} label={b.label} rank={b.rank} />
                    ))}
                    {selectedSport === 'ncaab' && <TeamRankBadge team={game.awayTeam} />}
                  </div>
                )}
              </ClickableTeam>
            </div>

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
            <div className={`flex-1 flex items-center justify-end gap-3 ${isPast && getScore(game.homeTeam) < getScore(game.awayTeam) ? 'opacity-50' : ''}`}>
              <ClickableTeam team={game.homeTeam} className="min-w-0 text-right">
                <div className="text-white font-medium text-base truncate hover:underline">
                  {game.homeTeam?.name || game.homeTeam?.abbreviation || 'TBD'}
                </div>
                {(game.homeTeam?.record ||
                  game.homeTeam?.standingSummary ||
                  getTeamStandingBadges(game.homeTeam).length > 0 ||
                  (selectedSport === 'ncaab' && game.homeTeam?.ranking?.current)) && (
                  <div className="mt-0.5 flex items-center justify-end gap-2 text-sm">
                    {game.homeTeam?.record && (
                      <span className="text-sm font-medium text-white/45">{game.homeTeam.record}</span>
                    )}
                    {getTeamStandingBadges(game.homeTeam).map((b, i) => (
                      <StandingBadge key={`${b.label}-${b.rank}-${i}`} label={b.label} rank={b.rank} />
                    ))}
                    {selectedSport === 'ncaab' && <TeamRankBadge team={game.homeTeam} />}
                  </div>
                )}
              </ClickableTeam>
              <ClickableTeam team={game.homeTeam}>
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

  const selectedSportTab = SPORT_TABS.find(s => s.id === selectedSport);

  return (
    <div className="max-w-3xl mx-auto px-3 sm:px-4 pt-0 sm:py-8 pb-4">
      {/* Sport Tabs */}
      <div className="flex gap-2 mb-4 animate-in">
        {SPORT_TABS.map(sport => (
          <button
            key={sport.id}
            onClick={() => handleSportChange(sport.id)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              selectedSport === sport.id
                ? 'bg-white/15 text-white'
                : 'bg-white/5 text-white/40 hover:text-white/60'
            }`}
          >
            {sport.name}
          </button>
        ))}
      </div>

      {/* Sign up CTA for unauthenticated users */}
      {!user && (
        <div className="mb-4 animate-in">
          <Link
            to="/login"
            className="block rounded-xl bg-gradient-to-r from-amber-500/10 to-yellow-600/10 border border-amber-500/20 p-3 sm:p-4 hover:from-amber-500/15 hover:to-yellow-600/15 transition-all group"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-amber-500 to-yellow-600 flex items-center justify-center flex-shrink-0">
                <Trophy className="w-5 h-5 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-white font-semibold text-sm sm:text-base">Join a Survivor Pool</p>
                <p className="text-white/50 text-xs sm:text-sm">Sign in to create or join a league and start making picks</p>
              </div>
              <ArrowRight className="w-5 h-5 text-amber-400/60 group-hover:text-amber-400 group-hover:translate-x-0.5 transition-all flex-shrink-0" />
            </div>
          </Link>
        </div>
      )}

      {selectedSportTab?.scheduleType === 'daily' ? (
        /* Daily sport rendering (NBA, MLB, NHL, NCAAB) */
        <>
          {/* Header */}
          <div className="mb-4 sm:mb-6 animate-in">
            <h1 className="font-display text-2xl sm:text-3xl font-bold text-white">
              {selectedSportTab?.name} Schedule
            </h1>
          </div>

          {/* Date Picker */}
          <DatePicker date={selectedDate} onChange={setSelectedDate} />

          {/* Loading / Games */}
          {dailyLoading ? (
            <div className="glass-card rounded-xl p-12 text-center">
              <div className="w-8 h-8 border-2 border-white/30 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
              <p className="text-white/50">Loading schedule...</p>
            </div>
          ) : dailySchedule.length === 0 ? (
            <div className="glass-card rounded-xl p-8 sm:p-12 text-center">
              <Calendar className="w-12 h-12 sm:w-16 sm:h-16 text-white/20 mx-auto mb-4" />
              <h3 className="text-lg sm:text-xl font-semibold text-white mb-2">No Games Found</h3>
              <p className="text-white/60 text-sm sm:text-base">
                No {selectedSportTab?.name} games scheduled for this date
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              {(() => {
                const grouped = dailySchedule.reduce((acc, game) => {
                  const day = formatDay(game.date);
                  if (!acc[day]) acc[day] = [];
                  acc[day].push(game);
                  return acc;
                }, {});

                return Object.entries(grouped).map(([day, games]) => (
                  <div key={day}>
                    <h2 className="text-sm font-semibold text-white/50 uppercase tracking-wider mb-3 flex items-center gap-2">
                      <Calendar className="w-4 h-4" />
                      {day}
                    </h2>
                    <div className="space-y-2">
                      {games.map((game, index) => renderGameCard(game, index))}
                    </div>
                  </div>
                ));
              })()}
            </div>
          )}
        </>
      ) : (
        /* NFL weekly rendering - all existing code preserved */
        <>
          {/* Header with Season Dropdown */}
          <div className="mb-4 sm:mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 animate-in">
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

                <div className="flex-1 overflow-x-auto scrollbar-hide pt-2" ref={weekTabsRef}>
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
                            <span className={`absolute -top-1.5 -right-1 w-2.5 h-2.5 rounded-full ${isSelected ? 'bg-yellow-400' : 'bg-green-500'}`} />
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
        </>
      )}

      {/* Team Info Dialog */}
      {teamInfoDialog.open && (
        <TeamInfoDialog
          team={teamInfoDialog.team}
          sport={selectedSport}
          onClose={() => setTeamInfoDialog({ open: false, team: null })}
        />
      )}

      {/* Stat Ranking Dialog */}
      {statRankingDialog && (
        <StatRankingDialog
          sport={selectedSport}
          statKey={statRankingDialog.statKey}
          statLabel={statRankingDialog.statLabel}
          currentTeamIds={statRankingDialog.currentTeamIds}
          onClose={() => setStatRankingDialog(null)}
        />
      )}
    </div>
  );
}
