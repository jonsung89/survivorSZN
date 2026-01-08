import { useState, useEffect, useMemo, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { 
  Trophy, Users, Settings, ChevronLeft, ChevronRight, 
  Crown, Plus, Minus, Check, X, Calendar, Loader2,
  AlertCircle, Eye, EyeOff, History, AlertTriangle, Edit3,
  Pencil, CalendarCheck, DollarSign, Lock
} from 'lucide-react';
import { leagueAPI, nflAPI, picksAPI } from '../api';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import { useToast } from '../components/Toast';
import Loading from '../components/Loading';
import { ShareLeagueButton, ShareLeagueModal } from '../components/ShareLeague';
import ChatWidget from '../components/ChatWidget';
import Avatar from '../components/Avatar';

// NFL team data for display (keyed by ESPN team ID)
const NFL_TEAMS = {
  '1': { name: 'Falcons', city: 'Atlanta', abbreviation: 'ATL', color: '#A71930', logo: 'https://a.espncdn.com/i/teamlogos/nfl/500/atl.png' },
  '2': { name: 'Bills', city: 'Buffalo', abbreviation: 'BUF', color: '#00338D', logo: 'https://a.espncdn.com/i/teamlogos/nfl/500/buf.png' },
  '3': { name: 'Bears', city: 'Chicago', abbreviation: 'CHI', color: '#0B162A', logo: 'https://a.espncdn.com/i/teamlogos/nfl/500/chi.png' },
  '4': { name: 'Bengals', city: 'Cincinnati', abbreviation: 'CIN', color: '#FB4F14', logo: 'https://a.espncdn.com/i/teamlogos/nfl/500/cin.png' },
  '5': { name: 'Browns', city: 'Cleveland', abbreviation: 'CLE', color: '#311D00', logo: 'https://a.espncdn.com/i/teamlogos/nfl/500/cle.png' },
  '6': { name: 'Cowboys', city: 'Dallas', abbreviation: 'DAL', color: '#003594', logo: 'https://a.espncdn.com/i/teamlogos/nfl/500/dal.png' },
  '7': { name: 'Broncos', city: 'Denver', abbreviation: 'DEN', color: '#FB4F14', logo: 'https://a.espncdn.com/i/teamlogos/nfl/500/den.png' },
  '8': { name: 'Lions', city: 'Detroit', abbreviation: 'DET', color: '#0076B6', logo: 'https://a.espncdn.com/i/teamlogos/nfl/500/det.png' },
  '9': { name: 'Packers', city: 'Green Bay', abbreviation: 'GB', color: '#203731', logo: 'https://a.espncdn.com/i/teamlogos/nfl/500/gb.png' },
  '10': { name: 'Titans', city: 'Tennessee', abbreviation: 'TEN', color: '#4B92DB', logo: 'https://a.espncdn.com/i/teamlogos/nfl/500/ten.png' },
  '11': { name: 'Colts', city: 'Indianapolis', abbreviation: 'IND', color: '#002C5F', logo: 'https://a.espncdn.com/i/teamlogos/nfl/500/ind.png' },
  '12': { name: 'Chiefs', city: 'Kansas City', abbreviation: 'KC', color: '#E31837', logo: 'https://a.espncdn.com/i/teamlogos/nfl/500/kc.png' },
  '13': { name: 'Raiders', city: 'Las Vegas', abbreviation: 'LV', color: '#000000', logo: 'https://a.espncdn.com/i/teamlogos/nfl/500/lv.png' },
  '14': { name: 'Rams', city: 'Los Angeles', abbreviation: 'LAR', color: '#003594', logo: 'https://a.espncdn.com/i/teamlogos/nfl/500/lar.png' },
  '15': { name: 'Dolphins', city: 'Miami', abbreviation: 'MIA', color: '#008E97', logo: 'https://a.espncdn.com/i/teamlogos/nfl/500/mia.png' },
  '16': { name: 'Vikings', city: 'Minnesota', abbreviation: 'MIN', color: '#4F2683', logo: 'https://a.espncdn.com/i/teamlogos/nfl/500/min.png' },
  '17': { name: 'Patriots', city: 'New England', abbreviation: 'NE', color: '#002244', logo: 'https://a.espncdn.com/i/teamlogos/nfl/500/ne.png' },
  '18': { name: 'Saints', city: 'New Orleans', abbreviation: 'NO', color: '#D3BC8D', logo: 'https://a.espncdn.com/i/teamlogos/nfl/500/no.png' },
  '19': { name: 'Giants', city: 'New York', abbreviation: 'NYG', color: '#0B2265', logo: 'https://a.espncdn.com/i/teamlogos/nfl/500/nyg.png' },
  '20': { name: 'Jets', city: 'New York', abbreviation: 'NYJ', color: '#125740', logo: 'https://a.espncdn.com/i/teamlogos/nfl/500/nyj.png' },
  '21': { name: 'Eagles', city: 'Philadelphia', abbreviation: 'PHI', color: '#004C54', logo: 'https://a.espncdn.com/i/teamlogos/nfl/500/phi.png' },
  '22': { name: 'Cardinals', city: 'Arizona', abbreviation: 'ARI', color: '#97233F', logo: 'https://a.espncdn.com/i/teamlogos/nfl/500/ari.png' },
  '23': { name: 'Steelers', city: 'Pittsburgh', abbreviation: 'PIT', color: '#FFB612', logo: 'https://a.espncdn.com/i/teamlogos/nfl/500/pit.png' },
  '24': { name: 'Chargers', city: 'Los Angeles', abbreviation: 'LAC', color: '#0080C6', logo: 'https://a.espncdn.com/i/teamlogos/nfl/500/lac.png' },
  '25': { name: '49ers', city: 'San Francisco', abbreviation: 'SF', color: '#AA0000', logo: 'https://a.espncdn.com/i/teamlogos/nfl/500/sf.png' },
  '26': { name: 'Seahawks', city: 'Seattle', abbreviation: 'SEA', color: '#002244', logo: 'https://a.espncdn.com/i/teamlogos/nfl/500/sea.png' },
  '27': { name: 'Buccaneers', city: 'Tampa Bay', abbreviation: 'TB', color: '#D50A0A', logo: 'https://a.espncdn.com/i/teamlogos/nfl/500/tb.png' },
  '28': { name: 'Commanders', city: 'Washington', abbreviation: 'WAS', color: '#5A1414', logo: 'https://a.espncdn.com/i/teamlogos/nfl/500/wsh.png' },
  '29': { name: 'Panthers', city: 'Carolina', abbreviation: 'CAR', color: '#0085CA', logo: 'https://a.espncdn.com/i/teamlogos/nfl/500/car.png' },
  '30': { name: 'Jaguars', city: 'Jacksonville', abbreviation: 'JAX', color: '#006778', logo: 'https://a.espncdn.com/i/teamlogos/nfl/500/jax.png' },
  '33': { name: 'Ravens', city: 'Baltimore', abbreviation: 'BAL', color: '#241773', logo: 'https://a.espncdn.com/i/teamlogos/nfl/500/bal.png' },
  '34': { name: 'Texans', city: 'Houston', abbreviation: 'HOU', color: '#03202F', logo: 'https://a.espncdn.com/i/teamlogos/nfl/500/hou.png' },
};

export default function LeagueDetail() {
  const { leagueId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { showToast } = useToast();
  const { onlineUsers } = useSocket();
  
  const [league, setLeague] = useState(null);
  const [standings, setStandings] = useState([]);
  const [currentWeek, setCurrentWeek] = useState(1);
  const [selectedWeek, setSelectedWeek] = useState(null);
  const [loadedWeek, setLoadedWeek] = useState(null); // Track which week's data is loaded
  const [loading, setLoading] = useState(true);
  const [loadingStandings, setLoadingStandings] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [settings, setSettings] = useState({ maxStrikes: 1, doublePickWeeks: [], entryFee: 0, prizePotOverride: null });
  const [savingSettings, setSavingSettings] = useState(false);
  const [modifyingStrike, setModifyingStrike] = useState(null);
  const [myPicks, setMyPicks] = useState([]);
  const [strikeDialog, setStrikeDialog] = useState(null); // { member, action, reason }
  const [strikeReason, setStrikeReason] = useState('');
  const [actionLog, setActionLog] = useState([]);
  const [showActionLog, setShowActionLog] = useState(false);
  const [pickDialog, setPickDialog] = useState(null); // { member, week }
  const [selectedTeamsForPick, setSelectedTeamsForPick] = useState([]); // array of teamIds
  const [savingPick, setSavingPick] = useState(false);
  const [pickReason, setPickReason] = useState('');
  const [togglingPayment, setTogglingPayment] = useState(null);
  const [gameStatuses, setGameStatuses] = useState({}); // { teamId: gameStatus }
  const [isChatCollapsed, setIsChatCollapsed] = useState(true); // Track chat sidebar state
  const hasTriggeredUpdateRef = useRef(false);

  const isCommissioner = league?.commissionerId === user?.id;

  // Helper to change week
  const handleWeekChange = (newWeek) => {
    if (newWeek === selectedWeek) return;
    setSelectedWeek(newWeek);
  };

  // Helper to calculate pick result from game status when database result is pending
  const getPickResult = (pick, teamId) => {
    // If database has a definitive result, use it
    if (pick?.result && pick.result !== 'pending') {
      return pick.result;
    }
    
    // Otherwise calculate from game status
    const gameStatus = gameStatuses[String(teamId)];
    if (!gameStatus || gameStatus.state !== 'post') {
      return pick?.result || null; // Game not finished yet
    }
    
    // Game is final - calculate result from scores
    const teamScore = parseInt(gameStatus.team?.score) || 0;
    const opponentScore = parseInt(gameStatus.opponent?.score) || 0;
    
    if (teamScore > opponentScore) {
      return 'win';
    } else if (teamScore < opponentScore) {
      return 'loss';
    } else {
      return 'loss'; // Ties count as losses in survivor pools
    }
  };

  // Helper to get effective strikes (database + any unprocessed losses from completed games)
  // Checks ALL weeks up to currentWeek, not just the selected week
  const getEffectiveStrikes = (member) => {
    if (!member) return 0;
    let strikes = member.strikes || 0;
    
    // Check all weeks up to currentWeek for unprocessed losses
    for (let week = league?.startWeek || 1; week <= currentWeek; week++) {
      const weekData = member.picks?.[week];
      const weekPicks = weekData?.picks || [];
      const displayPicks = weekPicks.length > 0 
        ? weekPicks 
        : (weekData?.teamId ? [{ teamId: weekData.teamId, result: weekData.result }] : []);
      
      for (const pick of displayPicks) {
        const dbResult = pick.result;
        const effectiveResult = getPickResult(pick, pick.teamId);
        
        // If database says pending but game shows loss, add a strike
        if (dbResult !== 'loss' && dbResult !== 'win' && effectiveResult === 'loss') {
          strikes++;
        }
      }
    }
    
    return strikes;
  };

  // Sort standings by effective strikes (ascending), then alphabetically by display name
  const sortedStandings = useMemo(() => {
    if (!standings || standings.length === 0) return [];
    
    return [...standings].sort((a, b) => {
      // First sort by effective strikes (fewer strikes = higher ranking)
      const aStrikes = getEffectiveStrikes(a);
      const bStrikes = getEffectiveStrikes(b);
      
      if (aStrikes !== bStrikes) {
        return aStrikes - bStrikes;
      }
      
      // Then sort alphabetically by display name
      const aName = (a.displayName || '').toLowerCase();
      const bName = (b.displayName || '').toLowerCase();
      return aName.localeCompare(bName);
    });
  }, [standings, currentWeek, gameStatuses, league?.startWeek, league?.maxStrikes]);

  useEffect(() => {
    loadData();
  }, [leagueId]);

  useEffect(() => {
    if (selectedWeek === null) return;
    
    let cancelled = false;
    hasTriggeredUpdateRef.current = false;
    
    const doLoad = async () => {
      setLoadingStandings(true);
      try {
        const result = await leagueAPI.getStandings(leagueId, selectedWeek);
        if (cancelled) return; // Don't update if effect was cleaned up
        
        if (result.success && result.standings) {
          setStandings(result.standings);
          await fetchGameStatuses(result.standings, selectedWeek);
        } else if (Array.isArray(result.standings)) {
          setStandings(result.standings);
          await fetchGameStatuses(result.standings, selectedWeek);
        }
        
        if (!cancelled) {
          setLoadedWeek(selectedWeek);
        }
      } catch (error) {
        console.error('Failed to load standings:', error);
      }
      if (!cancelled) {
        setLoadingStandings(false);
      }
    };
    
    doLoad();
    
    return () => {
      cancelled = true;
    };
  }, [selectedWeek]);

  const loadData = async () => {
    setLoading(true);
    try {
      // Get league details
      const leagueResult = await leagueAPI.getLeague(leagueId);
      if (leagueResult.success && leagueResult.league) {
        setLeague(leagueResult.league);
        setSettings({ 
          maxStrikes: leagueResult.league.maxStrikes,
          doublePickWeeks: leagueResult.league.doublePickWeeks || [],
          entryFee: leagueResult.league.entryFee || 0,
          prizePotOverride: leagueResult.league.prizePotOverride
        });
      } else if (leagueResult.error) {
        showToast(leagueResult.error, 'error');
        navigate('/leagues');
        return;
      } else {
        showToast('Failed to load league', 'error');
        navigate('/leagues');
        return;
      }

      // Get current NFL week
      const seasonResult = await nflAPI.getSeason();
      if (seasonResult.week) {
        // Convert playoff weeks: backend returns week 1-5 with seasonType=3
        // Frontend uses week 19-22 for playoffs (19=WC, 20=DIV, 21=CONF, 22=SB)
        let displayWeek = seasonResult.week;
        if (seasonResult.seasonType === 3) {
          // Map playoff week 1-5 to frontend weeks 19-22
          // Week 1 = Wild Card (19), Week 2 = Divisional (20), Week 3 = Conference (21), Week 4 = Pro Bowl (skip), Week 5 = Super Bowl (22)
          const playoffWeekMap = { 1: 19, 2: 20, 3: 21, 4: 21, 5: 22 };
          displayWeek = playoffWeekMap[seasonResult.week] || 19;
        }
        setCurrentWeek(displayWeek);
        setSelectedWeek(displayWeek);
      }

      // Get my picks
      const picksResult = await picksAPI.getLeaguePicks(leagueId);
      if (picksResult.success && picksResult.picks) {
        setMyPicks(picksResult.picks);
      } else if (Array.isArray(picksResult.picks)) {
        setMyPicks(picksResult.picks);
      }

      // Get commissioner action log
      try {
        const logResult = await leagueAPI.getActionLog(leagueId);
        if (logResult.success && logResult.log) {
          setActionLog(logResult.log);
        }
      } catch (e) {
        // Action log might not exist yet, that's ok
        console.log('No action log found');
      }
    } catch (error) {
      console.error('Load data error:', error);
      showToast('Something went wrong', 'error');
    }
    setLoading(false);
  };

  // Refresh standings (used after admin actions, not for week changes)
  const loadStandings = async (week) => {
    setLoadingStandings(true);
    try {
      const result = await leagueAPI.getStandings(leagueId, week);
      if (result.success && result.standings) {
        setStandings(result.standings);
        await fetchGameStatuses(result.standings, week);
      } else if (Array.isArray(result.standings)) {
        setStandings(result.standings);
        await fetchGameStatuses(result.standings, week);
      }
      setLoadedWeek(week);
    } catch (error) {
      console.error('Failed to load standings:', error);
    }
    setLoadingStandings(false);
  };

  // Fetch game status for all picked teams in the selected week
  const fetchGameStatuses = async (standingsData, week) => {
    // Collect all unique team IDs from picks (regardless of visibility - we need game status for all)
    const teamIds = new Set();
    standingsData.forEach(member => {
      const weekData = member.picks?.[week];
      const weekPicks = weekData?.picks || [];
      const displayPicks = weekPicks.length > 0 
        ? weekPicks 
        : (weekData?.teamId ? [{ teamId: weekData.teamId }] : []);
      
      displayPicks.forEach(pick => {
        if (pick.teamId) {
          teamIds.add(String(pick.teamId));
        }
      });
    });

    if (teamIds.size === 0) {
      setGameStatuses({});
      return;
    }
    
    try {
      // Fetch game status for each team in parallel
      const statusPromises = Array.from(teamIds).map(async (teamId) => {
        try {
          const status = await nflAPI.getTeamGameStatus(teamId, week);
          return { teamId, status };
        } catch (e) {
          console.log(`Failed to get game status for team ${teamId}:`, e);
          return { teamId, status: null };
        }
      });

      const results = await Promise.all(statusPromises);
      const newStatuses = {};
      results.forEach(({ teamId, status }) => {
        if (status) {
          newStatuses[teamId] = status;
        } else {
          // Mark team as having no game this week (e.g., non-playoff team during playoffs)
          newStatuses[teamId] = { noGame: true };
        }
      });
      setGameStatuses(newStatuses);
    } catch (error) {
      console.error('Failed to fetch game statuses:', error);
    }
  };

  // Auto-refresh game statuses for live games
  useEffect(() => {
    // Check if any games are live
    const hasLiveGames = Object.values(gameStatuses).some(g => g?.state === 'in');
    
    if (hasLiveGames) {
      const interval = setInterval(() => {
        if (standings.length > 0 && selectedWeek) {
          fetchGameStatuses(standings, selectedWeek);
        }
      }, 30000); // Refresh every 30 seconds for live games
      
      return () => clearInterval(interval);
    }
  }, [gameStatuses, standings, selectedWeek]);

  // Trigger database update when we detect completed games with pending picks
  useEffect(() => {
    // Skip if we've already triggered an update for this data set
    if (hasTriggeredUpdateRef.current) return;
    
    const checkAndUpdateResults = async () => {
      // Check if any picks have completed games but pending results
      let hasPendingCompletedGames = false;
      
      for (const member of standings) {
        for (let week = league?.startWeek || 1; week <= currentWeek; week++) {
          const weekData = member.picks?.[week];
          const weekPicks = weekData?.picks || [];
          const displayPicks = weekPicks.length > 0 
            ? weekPicks 
            : (weekData?.teamId ? [{ teamId: weekData.teamId, result: weekData.result }] : []);
          
          for (const pick of displayPicks) {
            if (pick.result === 'pending' || !pick.result) {
              const gameStatus = gameStatuses[String(pick.teamId)];
              if (gameStatus?.state === 'post') {
                hasPendingCompletedGames = true;
                break;
              }
            }
          }
          if (hasPendingCompletedGames) break;
        }
        if (hasPendingCompletedGames) break;
      }
      
      if (hasPendingCompletedGames) {
        hasTriggeredUpdateRef.current = true; // Mark as triggered
        try {
          console.log('Detected completed games with pending picks, triggering results update...');
          const result = await picksAPI.updateResults();
          if (result.updated > 0) {
            console.log(`Updated ${result.updated} pick results`);
            // Don't reload standings here - getEffectiveStrikes already shows correct data
            // and reloading causes a flicker. The updated data will show on next page load.
          }
        } catch (error) {
          console.error('Failed to update results:', error);
        }
      }
    };
    
    if (standings.length > 0 && Object.keys(gameStatuses).length > 0 && currentWeek && league) {
      checkAndUpdateResults();
    }
  }, [gameStatuses, standings.length, currentWeek, league?.startWeek]);

  const handleSaveSettings = async () => {
    setSavingSettings(true);
    try {
      const result = await leagueAPI.updateSettings(leagueId, settings);
      if (result.success) {
        setLeague({ 
          ...league, 
          maxStrikes: settings.maxStrikes,
          doublePickWeeks: settings.doublePickWeeks,
          entryFee: settings.entryFee,
          prizePotOverride: settings.prizePotOverride
        });
        setShowSettings(false);
        showToast('Settings updated', 'success');
      } else {
        showToast(result.error || 'Failed to update settings', 'error');
      }
    } catch (error) {
      showToast('Something went wrong', 'error');
    }
    setSavingSettings(false);
  };

  const handleModifyStrikes = async () => {
    if (!strikeDialog || !strikeDialog.action || !strikeDialog.week) return;
    
    const { member, action, week } = strikeDialog;
    setModifyingStrike(member.memberId);
    
    try {
      const result = await leagueAPI.modifyStrikes(leagueId, member.memberId, action, strikeReason, week);
      if (result.success) {
        // Refresh standings and action log
        loadStandings(selectedWeek);
        
        // Add to local action log immediately
        const newLogEntry = {
          id: Date.now(),
          action: action === 'add' ? 'strike_added' : 'strike_removed',
          targetUser: member.displayName,
          week: week,
          reason: strikeReason || 'No reason provided',
          timestamp: new Date().toISOString(),
          performedBy: user?.displayName || 'Commissioner'
        };
        setActionLog(prev => [newLogEntry, ...prev]);
        
        showToast(`Strike ${action === 'add' ? 'added' : 'removed'} for ${member.displayName} (${getWeekLabel(week)})`, 'success');
      } else {
        showToast(result.error || 'Failed to modify strikes', 'error');
      }
    } catch (error) {
      showToast('Something went wrong', 'error');
    }
    
    setModifyingStrike(null);
    setStrikeDialog(null);
    setStrikeReason('');
  };

  const handleTogglePayment = async (member) => {
    setTogglingPayment(member.id);
    try {
      const result = await leagueAPI.togglePayment(leagueId, member.id, !member.hasPaid);
      if (result.success) {
        setLeague(prev => ({
          ...prev,
          members: prev.members.map(m => 
            m.id === member.id ? { ...m, hasPaid: result.hasPaid } : m
          )
        }));
        setStandings(prev => 
          prev.map(m => 
            m.memberId === member.id ? { ...m, hasPaid: result.hasPaid } : m
          )
        );
        showToast(`${member.displayName} marked as ${result.hasPaid ? 'paid' : 'unpaid'}`, 'success');
      }
    } catch (error) {
      showToast('Failed to update payment status', 'error');
    }
    setTogglingPayment(null);
  };

  // Get teams already used by a member
  const getMemberUsedTeams = (member, excludeWeek = null) => {
    if (!member.picks) return new Set();
    const used = new Set();
    Object.entries(member.picks).forEach(([week, pick]) => {
      if (excludeWeek && parseInt(week) === excludeWeek) return;
      if (pick?.teamId) {
        used.add(String(pick.teamId));
      }
    });
    return used;
  };

  // Commissioner: Set pick for a member
  const handleSetMemberPick = async () => {
    if (!pickDialog || selectedTeamsForPick.length === 0) return;
    
    const { member, week } = pickDialog;
    const isDoublePick = (league.doublePickWeeks || []).includes(week);
    const requiredPicks = isDoublePick ? 2 : 1;
    
    if (selectedTeamsForPick.length !== requiredPicks) {
      showToast(`Please select ${requiredPicks} team${requiredPicks > 1 ? 's' : ''} for this week`, 'error');
      return;
    }
    
    setSavingPick(true);
    
    try {
      // Submit picks (1 or 2 depending on week type)
      const results = [];
      for (let i = 0; i < selectedTeamsForPick.length; i++) {
        const teamId = selectedTeamsForPick[i];
        const result = await leagueAPI.setMemberPick(
          leagueId, 
          member.memberId, 
          week, 
          teamId, 
          pickReason,
          i + 1 // pickNumber: 1 or 2
        );
        results.push({ teamId, result });
      }
      
      const allSuccess = results.every(r => r.result.success);
      
      if (allSuccess) {
        // Refresh standings
        loadStandings(selectedWeek);
        
        // Add to local action log for each pick
        for (const { teamId } of results) {
          const team = NFL_TEAMS[teamId];
          const newLogEntry = {
            id: Date.now() + Math.random(),
            action: 'pick_set',
            targetUser: member.displayName,
            week: week,
            teamId: teamId,
            teamName: team?.name || teamId,
            reason: pickReason || 'No reason provided',
            timestamp: new Date().toISOString(),
            performedBy: user?.displayName || 'Commissioner'
          };
          setActionLog(prev => [newLogEntry, ...prev]);
        }
        
        const teamNames = selectedTeamsForPick.map(id => NFL_TEAMS[id]?.name || id).join(' & ');
        showToast(`Pick${isDoublePick ? 's' : ''} set for ${member.displayName} - ${getWeekLabel(week)}: ${teamNames}`, 'success');
      } else {
        const firstError = results.find(r => !r.result.success);
        showToast(firstError?.result.error || 'Failed to set pick', 'error');
      }
    } catch (error) {
      showToast('Something went wrong', 'error');
    }
    
    setSavingPick(false);
    setPickDialog(null);
    setSelectedTeamsForPick([]);
    setPickReason('');
  };

  const getPickForWeek = (week) => {
    return myPicks.find(p => p.week === week);
  };

  // Get all picks for a week (for double pick weeks)
  const getPicksForWeek = (week) => {
    return myPicks.filter(p => p.week === week).sort((a, b) => (a.pickNumber || 1) - (b.pickNumber || 1));
  };

  const needsPickThisWeek = () => {
    if (!league) return false;
    const myMember = league.members?.find(m => m.userId === user?.id);
    if (myMember?.status === 'eliminated') return false;
    if (currentWeek < league.startWeek) return false;
    
    const isDoublePick = (league.doublePickWeeks || []).includes(currentWeek);
    const requiredPicks = isDoublePick ? 2 : 1;
    const currentPicks = getPicksForWeek(currentWeek);
    return currentPicks.length < requiredPicks;
  };

  if (loading) {
    return <Loading fullScreen />;
  }

  if (!league) {
    return null;
  }

  // Generate weeks from league start through end of playoffs (week 22 = Super Bowl)
  const weeks = Array.from(
    { length: 22 - league.startWeek + 1 }, 
    (_, i) => league.startWeek + i
  );

  // Helper to get week label for display
  const getWeekLabel = (week) => {
    if (week <= 18) return `Week ${week}`;
    if (week === 19) return 'Wild Card';
    if (week === 20) return 'Divisional';
    if (week === 21) return 'Conference';
    if (week === 22) return 'Super Bowl';
    return `Week ${week}`;
  };

  return (
    <div className={`transition-all duration-300 ${isChatCollapsed ? 'lg:pr-16' : 'lg:pr-96 xl:pr-[420px]'}`}>
      {/* Main content - scrolls naturally, with padding for fixed chat sidebar */}
      {/* pb-32 on mobile/tablet for chat bar, normal padding on lg+ where chat is sidebar */}
      <div className="max-w-6xl mx-auto px-3 sm:px-4 pt-4 sm:pt-8 pb-32 lg:pb-8">
      {/* Header */}
      <div className="flex flex-col gap-4 mb-6 sm:mb-8">
        <div className="flex items-center gap-3 sm:gap-4 animate-in">
          <div className="w-12 h-12 sm:w-16 sm:h-16 rounded-xl sm:rounded-2xl bg-gradient-to-br from-nfl-blue to-blue-700 flex items-center justify-center shadow-lg flex-shrink-0">
            <Trophy className="w-6 h-6 sm:w-8 sm:h-8 text-white" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="font-display text-xl sm:text-3xl font-bold text-white truncate">{league.name}</h1>
              {isCommissioner && (
                <span className="badge badge-active text-xs flex items-center gap-1">
                  <Crown className="w-3 h-3" />
                  Commish
                </span>
              )}
            </div>
            <p className="text-white/60 text-sm sm:text-base">
              {league.members?.length || 0} members • {league.maxStrikes} strike{league.maxStrikes !== 1 ? 's' : ''} max
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          {needsPickThisWeek() && (
            <Link
              to={`/league/${leagueId}/pick`}
              className="btn-primary flex items-center gap-2 text-sm sm:text-base py-2.5 sm:py-3 flex-1 sm:flex-none justify-center animate-pulse-glow"
            >
              <Calendar className="w-4 h-4 sm:w-5 sm:h-5" />
              Make Pick
            </Link>
          )}
          
          {/* Share button - visible to all members */}
          <ShareLeagueButton onClick={() => setShowShareModal(true)} />
          
          {isCommissioner && (
            <>
              <button
                onClick={() => setShowActionLog(true)}
                className="btn-secondary flex items-center gap-2 text-sm sm:text-base py-2.5 sm:py-3"
              >
                <History className="w-4 h-4 sm:w-5 sm:h-5" />
                <span className="hidden sm:inline">History</span>
              </button>
              <button
                onClick={() => setShowSettings(true)}
                className="btn-secondary flex items-center gap-2 text-sm sm:text-base py-2.5 sm:py-3"
              >
                <Settings className="w-4 h-4 sm:w-5 sm:h-5" />
                <span className="hidden sm:inline">Settings</span>
              </button>
            </>
          )}
          {/* Show action log for non-commissioners too */}
          {!isCommissioner && actionLog.length > 0 && (
            <button
              onClick={() => setShowActionLog(true)}
              className="btn-secondary flex items-center gap-2 text-sm sm:text-base py-2.5 sm:py-3"
            >
              <History className="w-4 h-4 sm:w-5 sm:h-5" />
              <span className="hidden sm:inline">History</span>
            </button>
          )}
        </div>
      </div>

      {/* Prize Pot Display */}
      {(league.entryFee > 0 || league.prizePotOverride) && (
        <div className="glass-card rounded-xl sm:rounded-2xl p-4 sm:p-6 mb-4 sm:mb-6 animate-in" style={{ animationDelay: '25ms' }}>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center">
                <DollarSign className="w-6 h-6 text-white" />
              </div>
              <div>
                <p className="text-white/60 text-sm">Prize Pot{isCommissioner && league.prizePotOverride ? ' (Manual)' : ''}</p>
                <p className="text-2xl sm:text-3xl font-bold text-white">
                  ${(league.prizePotOverride || (league.entryFee * (league.members?.length || 0))).toLocaleString()}
                </p>
              </div>
            </div>
            
            <div className="flex flex-wrap gap-4 sm:gap-6">
              {league.entryFee > 0 && (
                <div className="text-center">
                  <p className="text-white/60 text-xs sm:text-sm">Entry Fee</p>
                  <p className="text-lg sm:text-xl font-semibold text-white">${league.entryFee}</p>
                </div>
              )}
              {isCommissioner && (
                <div className="text-center">
                  <p className="text-white/60 text-xs sm:text-sm">Paid</p>
                  <p className="text-lg sm:text-xl font-semibold text-green-400">
                    {league.members?.filter(m => m.hasPaid).length || 0}/{league.members?.length || 0}
                  </p>
                </div>
              )}
              <div className="text-center">
                <p className="text-white/60 text-xs sm:text-sm">Alive</p>
                <p className="text-lg sm:text-xl font-semibold text-green-400">
                  {league.members?.filter(m => m.status === 'active').length || 0}
                </p>
              </div>
              <div className="text-center">
                <p className="text-white/60 text-xs sm:text-sm">Eliminated</p>
                <p className="text-lg sm:text-xl font-semibold text-red-400">
                  {league.members?.filter(m => m.status === 'eliminated').length || 0}
                </p>
              </div>
              <div className="text-center">
                <p className="text-white/60 text-xs sm:text-sm">Weeks Left</p>
                <p className="text-lg sm:text-xl font-semibold text-white">
                  {currentWeek <= 18 
                    ? `${Math.max(0, 18 - currentWeek + 1)}+4`
                    : Math.max(0, 22 - currentWeek + 1)
                  }
                </p>
              </div>
            </div>
          </div>
          
          <div className="mt-4 pt-4 border-t border-white/10">
            <p className="text-white/50 text-sm">
              💰 Pot splits evenly among all survivors at season end, or winner-takes-all if one remains.
            </p>
          </div>
        </div>
      )}

      {/* Week Selector */}
      <div className="glass-card rounded-xl sm:rounded-2xl p-2 sm:p-4 mb-4 sm:mb-6 h-[60px] sm:h-[72px]" style={{ animationDelay: '50ms' }}>
        <div className="flex items-center justify-between h-full">
          <button
            onClick={() => handleWeekChange(Math.max(league.startWeek, selectedWeek - 1))}
            disabled={selectedWeek <= league.startWeek}
            className="p-2 sm:p-2 hover:bg-white/10 rounded-lg transition-colors disabled:opacity-30 flex-shrink-0"
          >
            <ChevronLeft className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
          </button>

          <div className="flex items-center gap-2 sm:gap-4 overflow-x-auto py-1 sm:py-2 px-2 sm:px-4 scrollbar-hide">
            {weeks.map(week => {
              // Playoff week labels
              const weekLabel = week <= 18 ? week : 
                week === 19 ? 'WC' : 
                week === 20 ? 'DIV' : 
                week === 21 ? 'CONF' : 
                week === 22 ? 'SB' : week;
              const weekFullLabel = week <= 18 ? `Week ${week}` : 
                week === 19 ? 'Wild Card' : 
                week === 20 ? 'Divisional' : 
                week === 21 ? 'Conference' : 
                week === 22 ? 'Super Bowl' : `Week ${week}`;
              
              return (
                <button
                  key={week}
                  onClick={() => handleWeekChange(week)}
                  className={`px-3 sm:px-4 h-[32px] sm:h-[40px] rounded-lg sm:rounded-xl font-medium transition-all whitespace-nowrap text-sm sm:text-base flex-shrink-0 flex items-center justify-center ${
                    selectedWeek === week
                      ? 'bg-nfl-blue text-white shadow-lg'
                      : week === currentWeek
                      ? 'bg-white/10 text-white border border-emerald-500/50'
                      : 'bg-white/5 text-white/60 hover:bg-white/10'
                  }`}
                  title={weekFullLabel}
                >
                  <span className="hidden sm:inline">{week <= 18 ? 'Week ' : ''}</span>{weekLabel}
                  {week === currentWeek && selectedWeek !== week && (
                    <span className="ml-1 text-xs text-emerald-400">●</span>
                  )}
                </button>
              );
            })}
          </div>

          <button
            onClick={() => handleWeekChange(Math.min(22, selectedWeek + 1))}
            disabled={selectedWeek >= 22}
            className="p-2 sm:p-2 hover:bg-white/10 rounded-lg transition-colors disabled:opacity-30 flex-shrink-0"
          >
            <ChevronRight className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
          </button>
        </div>
      </div>

      {/* Your Pick Card - Prominent Game Display */}
      <div className="glass-card rounded-xl sm:rounded-2xl p-4 sm:p-6 mb-4 sm:mb-6 h-[180px] sm:h-[200px]">
        {(loadingStandings || loadedWeek !== selectedWeek) ? (
          // Loading state
          <div className="flex items-center justify-center h-full">
            <Loader2 className="w-8 h-8 text-white/40 animate-spin" />
          </div>
        ) : (() => {
          // Find current user's pick for selected week
          const myStanding = standings.find(m => m.isMe);
          const weekData = myStanding?.picks?.[selectedWeek];
          const weekPicks = weekData?.picks || [];
          const displayPicks = weekPicks.length > 0 
            ? weekPicks 
            : (weekData?.teamId ? [{ teamId: weekData.teamId, result: weekData.result }] : []);
          
          if (displayPicks.length === 0 && selectedWeek >= league.startWeek) {
            // No pick made yet
            const effectiveStrikes = getEffectiveStrikes(myStanding);
            const isEliminated = myStanding?.status === 'eliminated' || effectiveStrikes >= (league?.maxStrikes || 1);
            const isPastWeek = selectedWeek < currentWeek;
            
            // For playoff weeks (19-22), check if matchups are likely TBD
            // Matchups are TBD if we're viewing a future playoff week
            const isPlayoffWeek = selectedWeek > 18;
            const isMatchupsTBD = isPlayoffWeek && selectedWeek > currentWeek;
            
            const canMakePick = selectedWeek >= currentWeek && !isEliminated && !isMatchupsTBD;
            
            return (
              <div className="flex flex-col items-center justify-center h-full">
                {isEliminated ? (
                  <>
                    <X className="w-10 h-10 text-red-400 mb-3" />
                    <p className="text-white font-medium">Eliminated</p>
                    <p className="text-white/50 text-sm mt-1">You're out of the competition</p>
                  </>
                ) : isMatchupsTBD ? (
                  <>
                    <Lock className="w-10 h-10 text-white/30 mb-3" />
                    <p className="text-white/50 font-medium">{getWeekLabel(selectedWeek)} matchups are TBD</p>
                    <p className="text-white/40 text-sm mt-1">
                      {selectedWeek === 19 && 'Matchups set after Week 18'}
                      {selectedWeek === 20 && 'Matchups set after Wild Card'}
                      {selectedWeek === 21 && 'Matchups set after Divisional'}
                      {selectedWeek === 22 && 'Matchups set after Conference'}
                    </p>
                  </>
                ) : isPastWeek ? (
                  <>
                    <AlertCircle className="w-10 h-10 text-white/30 mb-3" />
                    <p className="text-white/50 font-medium">No pick made for {getWeekLabel(selectedWeek)}</p>
                  </>
                ) : (
                  <>
                    <AlertCircle className="w-10 h-10 text-yellow-400 mb-3" />
                    <p className="text-white font-medium">No pick for {getWeekLabel(selectedWeek)}</p>
                    {canMakePick && (
                      <Link
                        to={`/league/${leagueId}/pick?week=${selectedWeek}`}
                        className="inline-flex items-center gap-2 mt-3 px-4 py-2 bg-emerald-600 rounded-lg text-white font-medium hover:bg-emerald-500 transition-colors"
                      >
                        <Calendar className="w-4 h-4" />
                        Make Pick
                      </Link>
                    )}
                  </>
                )}
              </div>
            );
          }
          
          if (displayPicks.length === 0) {
            return (
              <div className="flex items-center justify-center h-full">
                <p className="text-white/50">No pick data for {getWeekLabel(selectedWeek)}</p>
              </div>
            );
          }
          
          // Check if all picks' games are still scheduled or team not playing (can edit)
          const allGamesScheduled = displayPicks.every(pick => {
            const gameStatus = gameStatuses[String(pick.teamId)];
            // Allow edit if: game not started yet, OR team isn't playing (invalid pick)
            return gameStatus?.state === 'pre' || gameStatus?.noGame;
          });
          const myEffectiveStrikes = getEffectiveStrikes(myStanding);
          const isEffectivelyEliminated = myStanding?.status === 'eliminated' || myEffectiveStrikes >= (league?.maxStrikes || 1);
          const canEdit = allGamesScheduled && !isEffectivelyEliminated;
          
          return (
            <>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-medium text-white/60">Your {getWeekLabel(selectedWeek)} Pick{displayPicks.length > 1 ? 's' : ''}</h3>
                {canEdit && (
                  <Link
                    to={`/league/${leagueId}/pick?week=${selectedWeek}`}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white/10 hover:bg-white/20 rounded-lg text-white/80 text-sm font-medium transition-colors"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                    Edit Pick
                  </Link>
                )}
              </div>
            
            <div className={`grid gap-4 ${displayPicks.length > 1 ? 'sm:grid-cols-2' : ''}`}>
              {displayPicks.map((pick, idx) => {
                const team = NFL_TEAMS[String(pick.teamId)];
                const gameStatus = gameStatuses[String(pick.teamId)];
                
                if (!gameStatus) {
                  // Still loading
                  return (
                    <div key={idx} className="bg-white/5 rounded-xl p-4">
                      <div className="flex items-center gap-3">
                        {team?.logo && <img src={team.logo} alt={team.name} className="w-12 h-12" />}
                        <div>
                          <p className="text-white font-semibold text-lg">{team?.city} {team?.name}</p>
                          <p className="text-white/40 text-sm">Loading game info...</p>
                        </div>
                      </div>
                    </div>
                  );
                }
                
                if (gameStatus.noGame) {
                  // Team not playing this week (e.g., non-playoff team during playoffs)
                  return (
                    <div key={idx} className="bg-white/5 rounded-xl p-4">
                      <div className="flex items-center gap-3">
                        {team?.logo && <img src={team.logo} alt={team.name} className="w-12 h-12 opacity-50" />}
                        <div>
                          <p className="text-white/50 font-semibold text-lg">{team?.city} {team?.name}</p>
                          <p className="text-white/40 text-sm">Not playing this week</p>
                        </div>
                      </div>
                    </div>
                  );
                }
                
                const isLive = gameStatus.state === 'in';
                const isFinal = gameStatus.state === 'post';
                const isScheduled = gameStatus.state === 'pre';
                const isWinning = gameStatus.team.score > gameStatus.opponent.score;
                const isLosing = gameStatus.team.score < gameStatus.opponent.score;
                
                // Calculate countdown
                const getCountdown = () => {
                  if (!gameStatus.gameDate) return null;
                  const now = new Date();
                  const gameTime = new Date(gameStatus.gameDate);
                  const diff = gameTime - now;
                  if (diff <= 0) return null;
                  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
                  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
                  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
                  if (days > 0) return `${days}d ${hours}h`;
                  if (hours > 0) return `${hours}h ${minutes}m`;
                  return `${minutes}m`;
                };
                
                const formatGameTime = () => {
                  if (!gameStatus.gameDate) return '';
                  const date = new Date(gameStatus.gameDate);
                  return date.toLocaleString('en-US', { 
                    weekday: 'short',
                    month: 'short',
                    day: 'numeric',
                    hour: 'numeric', 
                    minute: '2-digit',
                    hour12: true 
                  });
                };
                
                return (
                  <div key={idx} className="rounded-xl overflow-hidden bg-gradient-to-r from-slate-800 via-slate-900 to-slate-800 border border-white/10">
                    {/* ESPN-style horizontal layout */}
                    <div className="flex items-center">
                      {/* Left team (your pick) */}
                      <div className={`flex-1 flex items-center gap-3 p-4 ${
                        isFinal && isWinning ? 'bg-gradient-to-r from-emerald-500/10 to-transparent' :
                        isFinal && isLosing ? 'bg-gradient-to-r from-red-500/5 to-transparent' :
                        isLive ? 'bg-gradient-to-r from-white/5 to-transparent' : ''
                      }`}>
                        {/* Logo with pick indicator */}
                        <div className="relative flex-shrink-0">
                          {team?.logo && <img src={team.logo} alt={team.name} className="w-14 h-14" />}
                          {/* Show win/loss indicator for completed games, checkmark for scheduled/live */}
                          {isFinal ? (
                            isWinning ? (
                              <div className="absolute -top-1 -right-1 bg-emerald-500 rounded-full p-0.5" title="Winner!">
                                <Check className="w-3 h-3 text-white" />
                              </div>
                            ) : (
                              <div className="absolute -top-1 -right-1 bg-red-500 rounded-full p-0.5" title="Loss">
                                <X className="w-3 h-3 text-white" />
                              </div>
                            )
                          ) : (
                            <div className="absolute -top-1 -right-1 bg-emerald-500 rounded-full p-0.5" title="Your Pick">
                              <Check className="w-3 h-3 text-white" />
                            </div>
                          )}
                        </div>
                        
                        {/* Score & Info */}
                        <div className="flex flex-col">
                          {(isLive || isFinal) ? (
                            <span className={`text-4xl font-bold ${
                              isWinning ? 'text-white' : 'text-white/50'
                            }`}>
                              {gameStatus.team.score}
                            </span>
                          ) : null}
                          <span className="text-white font-semibold text-sm">{team?.abbreviation}</span>
                          {gameStatus.team.record && (
                            <span className="text-white/40 text-xs">{gameStatus.team.record}</span>
                          )}
                        </div>
                        
                        {/* Winner arrow */}
                        {isFinal && isWinning && (
                          <ChevronLeft className="w-5 h-5 text-emerald-400 ml-auto" />
                        )}
                      </div>
                      
                      {/* Center - Status */}
                      <div className="flex-shrink-0 px-4 py-6 text-center min-w-[100px]">
                        {isScheduled && (
                          <div>
                            <p className="text-white/60 text-xs">{formatGameTime()}</p>
                            {getCountdown() && (
                              <p className="text-emerald-400 text-lg font-bold mt-1">{getCountdown()}</p>
                            )}
                          </div>
                        )}
                        {isLive && (
                          <div>
                            <div className="flex items-center justify-center gap-1.5 text-red-400">
                              <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                              <span className="text-xs font-bold uppercase">{gameStatus.period}Q</span>
                            </div>
                            <p className="text-white text-lg font-bold">{gameStatus.clock}</p>
                          </div>
                        )}
                        {isFinal && (
                          <div>
                            <p className="text-white/50 text-sm font-medium">Final</p>
                            <p className={`text-xs font-bold mt-1 ${isWinning ? 'text-emerald-400' : 'text-red-400'}`}>
                              {isWinning ? 'WIN' : 'LOSS'}
                            </p>
                          </div>
                        )}
                      </div>
                      
                      {/* Right team (opponent) */}
                      {(() => {
                        const oppTeamData = NFL_TEAMS[String(gameStatus.opponent.id)];
                        const oppWinning = gameStatus.opponent.score > gameStatus.team.score;
                        return (
                          <div className={`flex-1 flex items-center justify-end gap-3 p-4 ${
                            isFinal && oppWinning ? 'bg-gradient-to-l from-white/5 to-transparent' : ''
                          }`}>
                            {/* Winner arrow */}
                            {isFinal && oppWinning && (
                              <ChevronRight className="w-5 h-5 text-white/40 mr-auto" />
                            )}
                            
                            {/* Score & Info */}
                            <div className="flex flex-col items-end">
                              {(isLive || isFinal) ? (
                                <span className={`text-4xl font-bold ${
                                  oppWinning ? 'text-white' : 'text-white/50'
                                }`}>
                                  {gameStatus.opponent.score}
                                </span>
                              ) : null}
                              <span className="text-white/70 font-semibold text-sm">{oppTeamData?.abbreviation || gameStatus.opponent.abbreviation}</span>
                              {gameStatus.opponent.record && (
                                <span className="text-white/40 text-xs">{gameStatus.opponent.record}</span>
                              )}
                            </div>
                            
                            {/* Logo */}
                            <div className="flex-shrink-0">
                              {gameStatus.opponent.logo && (
                                <img src={gameStatus.opponent.logo} alt={oppTeamData?.name} className={`w-14 h-14 ${oppWinning ? '' : 'opacity-60'}`} />
                              )}
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                    
                    {/* Live game details - expandable section */}
                    {isLive && gameStatus.situation && (
                      <div className="px-4 pb-3 border-t border-white/5">
                        <div className={`flex items-center justify-center gap-2 text-xs pt-2 ${
                          gameStatus.situation.isRedZone ? 'text-red-400' : 'text-white/50'
                        }`}>
                          <span>
                            {gameStatus.situation.possession && `${gameStatus.situation.possession} ball`}
                            {gameStatus.situation.down && ` • ${gameStatus.situation.down}${['st','nd','rd','th'][gameStatus.situation.down-1] || 'th'} & ${gameStatus.situation.distance}`}
                            {gameStatus.situation.yardLine && ` at ${gameStatus.situation.yardLine}`}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            </>
          );
        })()}
      </div>

      {/* Standings Table */}
      <div className="glass-card rounded-xl sm:rounded-2xl overflow-hidden" style={{ animationDelay: '100ms' }}>
        <div className="p-3 sm:p-4 border-b border-white/10 flex items-center justify-between">
          <h2 className="font-display text-lg sm:text-xl font-semibold text-white flex items-center gap-2">
            <Users className="w-4 h-4 sm:w-5 sm:h-5" />
            Standings
          </h2>
          <span className="text-white/40 text-xs sm:text-sm">{getWeekLabel(selectedWeek)}</span>
        </div>

        {/* Mobile Card View */}
        <div className="sm:hidden divide-y divide-white/5">
          {sortedStandings.map((member, index) => {
            const weekData = member.picks?.[selectedWeek];
            const weekPicks = weekData?.picks || [];
            const isDoublePick = (league.doublePickWeeks || []).includes(selectedWeek);
            
            // For backward compatibility, if no picks array but has teamId, create one
            const displayPicks = weekPicks.length > 0 
              ? weekPicks 
              : (weekData?.teamId ? [{ teamId: weekData.teamId, result: weekData.result, visible: weekData.visible }] : []);
            
            // Calculate effective strikes from completed games
            const effectiveStrikes = getEffectiveStrikes(member);
            const effectivelyEliminated = effectiveStrikes >= (league?.maxStrikes || 1);
            const effectiveStatus = effectivelyEliminated ? 'eliminated' : member.status;
            
            return (
              <div 
                key={member.memberId}
                className={`p-3 ${member.isMe ? 'bg-nfl-blue/10' : ''} ${effectiveStatus === 'eliminated' ? 'opacity-50' : ''}`}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Avatar 
                      userId={member.userId}
                      name={member.displayName}
                      size="sm"
                      isOnline={(onlineUsers[leagueId] || []).some(u => u.userId === member.userId)}
                    />
                    <div>
                      <p className="text-white font-medium text-sm flex items-center gap-1">
                        {member.displayName}
                        {member.isMe && <span className="text-xs text-nfl-blue">(You)</span>}
                      </p>
                      {member.email && (
                        <p className="text-white/40 text-xs truncate max-w-[150px]">{member.email}</p>
                      )}
                    </div>
                  </div>
                  <span className={`badge text-xs ${effectiveStatus === 'active' ? 'badge-active' : 'badge-eliminated'}`}>
                    {effectiveStatus}
                  </span>
                </div>
                
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="flex gap-1">
                      {Array.from({ length: league.maxStrikes }).map((_, i) => (
                        <div key={i} className={`w-2.5 h-2.5 rounded-full ${i < effectiveStrikes ? 'bg-red-500' : 'bg-white/20'}`} />
                      ))}
                    </div>
                    
                    {displayPicks.length > 0 ? (
                      <div className="flex items-center gap-2 ml-2">
                        {displayPicks.map((pick, idx) => {
                          if (pick.visible === false) {
                            return <EyeOff key={idx} className="w-4 h-4 text-white/30" />;
                          }
                          const team = NFL_TEAMS[String(pick.teamId)];
                          const result = getPickResult(pick, pick.teamId);
                          return (
                            <div key={idx} className="flex items-center gap-1">
                              {team?.logo ? (
                                <img src={team.logo} alt={team.name} className="w-5 h-5 object-contain" />
                              ) : (
                                <div className="w-5 h-5 rounded flex items-center justify-center" style={{ backgroundColor: team?.color || '#666' }}>
                                  <span className="text-[8px] text-white font-bold">{team?.abbreviation}</span>
                                </div>
                              )}
                              {!isDoublePick && <span className="text-white/70 text-xs">{team?.name}</span>}
                              {result && result !== 'pending' && (
                                <span className={`text-xs font-bold ${result === 'win' ? 'text-green-400' : 'text-red-400'}`}>
                                  {result === 'win' ? 'W' : 'L'}
                                </span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    ) : selectedWeek <= currentWeek && selectedWeek >= league.startWeek ? (
                      effectiveStatus === 'eliminated' 
                        ? <span className="text-white/20 text-xs ml-2">—</span>
                        : <span className="text-white/30 text-xs ml-2">No pick</span>
                    ) : null}
                  </div>
                  
                  {isCommissioner && (
                    <button
                      onClick={() => setStrikeDialog({ member, action: null, week: selectedWeek })}
                      className="p-1.5 hover:bg-white/10 rounded transition-colors"
                    >
                      <Edit3 className="w-4 h-4 text-white/50" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Desktop Table View */}
        <div className="hidden sm:block overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-white/10">
                <th className="text-left px-4 py-3 text-white/60 text-sm font-medium">Player</th>
                <th className="text-center px-4 py-3 text-white/60 text-sm font-medium">Strikes</th>
                <th className="text-center px-4 py-3 text-white/60 text-sm font-medium">Status</th>
                {isCommissioner && league.entryFee > 0 && (
                  <th className="text-center px-4 py-3 text-white/60 text-sm font-medium">Paid</th>
                )}
                <th className="text-center px-4 py-3 text-white/60 text-sm font-medium">
                  {getWeekLabel(selectedWeek)} Pick{(league.doublePickWeeks || []).includes(selectedWeek) ? 's' : ''}
                  {(league.doublePickWeeks || []).includes(selectedWeek) && (
                    <span className="text-orange-400 ml-1 text-xs">×2</span>
                  )}
                </th>
                {isCommissioner && (
                  <th className="text-center px-4 py-3 text-white/60 text-sm font-medium">Edit</th>
                )}
              </tr>
            </thead>
            <tbody>
              {sortedStandings.map((member, index) => {
                const weekData = member.picks?.[selectedWeek];
                const weekPicks = weekData?.picks || [];
                const isDoublePick = (league.doublePickWeeks || []).includes(selectedWeek);
                
                // For backward compatibility, if no picks array but has teamId, create one
                const displayPicks = weekPicks.length > 0 
                  ? weekPicks 
                  : (weekData?.teamId ? [{ teamId: weekData.teamId, result: weekData.result, visible: weekData.visible, gameStatus: weekData.gameStatus, game: weekData.game }] : []);
                
                // Calculate effective strikes from completed games
                const effectiveStrikes = getEffectiveStrikes(member);
                const effectivelyEliminated = effectiveStrikes >= (league?.maxStrikes || 1);
                const effectiveStatus = effectivelyEliminated ? 'eliminated' : member.status;
                
                return (
                  <tr 
                    key={member.memberId}
                    className={`border-b border-white/5 transition-colors h-[85px] ${
                      member.isMe ? 'bg-nfl-blue/10' : 'hover:bg-white/5'
                    } ${effectiveStatus === 'eliminated' ? 'opacity-50' : ''}`}
                  >
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-3">
                        <Avatar 
                          userId={member.userId}
                          name={member.displayName}
                          size="md"
                          isOnline={(onlineUsers[leagueId] || []).some(u => u.userId === member.userId)}
                        />
                        <div>
                          <p className="text-white font-medium flex items-center gap-2">
                            {member.displayName}
                            {member.isMe && (
                              <span className="text-xs text-nfl-blue">(You)</span>
                            )}
                          </p>
                          {member.email && (
                            <p className="text-white/40 text-xs">{member.email}</p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex items-center justify-center gap-1">
                        {Array.from({ length: league.maxStrikes }).map((_, i) => (
                          <div
                            key={i}
                            className={`w-3 h-3 rounded-full ${
                              i < effectiveStrikes
                                ? 'bg-red-500'
                                : 'bg-white/20'
                            }`}
                          />
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-4 text-center">
                      <span className={`badge ${
                        effectiveStatus === 'active' 
                          ? 'badge-active' 
                          : 'badge-eliminated'
                      }`}>
                        {effectiveStatus}
                      </span>
                    </td>
                    {isCommissioner && league.entryFee > 0 && (
                      <td className="text-center px-4 py-3">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleTogglePayment(member);
                          }}
                          disabled={togglingPayment === member.memberId}
                          className={`px-2 py-1 rounded text-xs font-medium transition-all ${
                            member.hasPaid
                              ? 'bg-green-500/20 text-green-400'
                              : 'bg-red-500/20 text-red-400 hover:bg-red-500/30'
                          }`}
                        >
                          {togglingPayment === member.memberId ? (
                            <Loader2 className="w-3 h-3 animate-spin inline" />
                          ) : member.hasPaid ? (
                            '✓ Paid'
                          ) : (
                            'Unpaid'
                          )}
                        </button>
                      </td>
                    )}
                    <td className="px-4 py-4">
                      <div className="flex items-center justify-center h-[52px]">
                        {displayPicks.length > 0 ? (
                          isDoublePick ? (
                            // Double pick layout: each team as a card with logo, name, W/L
                            <div className="flex items-center gap-4">
                              {displayPicks.map((pick, idx) => {
                                if (pick.visible === false) {
                                  return (
                                    <div key={idx} className="flex flex-col items-center">
                                      <EyeOff className="w-7 h-7 text-white/40" />
                                      <span className="text-white/40 text-xs mt-1">???</span>
                                    </div>
                                  );
                                }
                                const team = NFL_TEAMS[String(pick.teamId)];
                                const result = getPickResult(pick, pick.teamId);
                                return (
                                  <div key={idx} className="flex flex-col items-center">
                                    {team?.logo ? (
                                      <img src={team.logo} alt={team.name} className="w-8 h-8 object-contain" />
                                    ) : (
                                      <div 
                                        className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold"
                                        style={{ backgroundColor: team?.color || '#666' }}
                                      >
                                        {team?.abbreviation}
                                      </div>
                                    )}
                                    <div className="flex items-center gap-1 mt-1">
                                      <span className="text-white/70 text-xs">{team?.abbreviation}</span>
                                      {result && result !== 'pending' && (
                                        <span className={`text-xs font-bold ${
                                          result === 'win' ? 'text-green-400' : 'text-red-400'
                                        }`}>
                                          {result === 'win' ? 'W' : 'L'}
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          ) : (
                            // Single pick layout
                            <div className="flex items-center gap-4">
                              {displayPicks.map((pick, idx) => {
                                if (pick.visible === false) {
                                  return (
                                    <div key={idx} className="flex flex-col items-center">
                                      <EyeOff className="w-7 h-7 text-white/40" />
                                      <span className="text-white/40 text-xs mt-1">???</span>
                                    </div>
                                  );
                                }
                                const team = NFL_TEAMS[String(pick.teamId)];
                                const result = getPickResult(pick, pick.teamId);
                                return (
                                  <div key={idx} className="flex flex-col items-center">
                                    {team?.logo ? (
                                      <img src={team.logo} alt={team.name} className="w-8 h-8 object-contain" />
                                    ) : (
                                      <div 
                                        className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold"
                                        style={{ backgroundColor: team?.color || '#666' }}
                                      >
                                        {team?.abbreviation}
                                      </div>
                                    )}
                                    <div className="flex items-center gap-1 mt-1">
                                      <span className="text-white/70 text-xs">{team?.abbreviation}</span>
                                      {result && result !== 'pending' && (
                                        <span className={`text-xs font-bold ${
                                          result === 'win' ? 'text-green-400' : 'text-red-400'
                                        }`}>
                                          {result === 'win' ? 'W' : 'L'}
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )
                        ) : selectedWeek >= league.startWeek ? (
                          effectiveStatus === 'eliminated'
                            ? <span className="text-white/20 text-sm">—</span>
                            : <span className="text-white/40 text-sm">No pick{isDoublePick ? 's' : ''}</span>
                        ) : (
                          <span className="text-white/30 text-sm">—</span>
                        )}
                      </div>
                    </td>
                    {isCommissioner && (
                      <td className="px-4 py-4">
                        <div className="flex items-center justify-center gap-2">
                          <button
                            onClick={() => setPickDialog({ member, week: selectedWeek })}
                            className="p-1.5 hover:bg-emerald-500/20 rounded-lg transition-colors group"
                            title="Set pick"
                          >
                            <CalendarCheck className="w-4 h-4 text-emerald-400/70 group-hover:text-emerald-400" />
                          </button>
                          <button
                            onClick={() => setStrikeDialog({ member, action: null, week: selectedWeek })}
                            disabled={modifyingStrike === member.memberId}
                            className="p-1.5 hover:bg-white/10 rounded-lg transition-colors disabled:opacity-30 group"
                            title="Modify strikes"
                          >
                            <Pencil className="w-4 h-4 text-white/50 group-hover:text-white" />
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {standings.length === 0 && (
          <div className="p-12 text-center">
            <Users className="w-12 h-12 text-white/20 mx-auto mb-4" />
            <p className="text-white/60">No members yet</p>
          </div>
        )}
      </div>

      {/* My Picks History */}
      <div className="glass-card rounded-2xl mt-6 overflow-hidden" style={{ animationDelay: '200ms' }}>
        <div className="p-4 border-b border-white/10">
          <h2 className="font-display text-xl font-semibold text-white flex items-center gap-2">
            <Eye className="w-5 h-5" />
            My Picks History
          </h2>
        </div>
        
        <div className="p-4">
          {/* Horizontal scroll container - pt-1 and pb-3 to prevent ring clipping */}
          <div 
            className="flex gap-3 overflow-x-auto pt-1 pb-3 px-1 -mx-1 snap-x snap-mandatory scrollbar-hide"
            style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
            ref={(el) => {
              // Auto-scroll to current week on mount
              if (el && currentWeek) {
                const currentIndex = weeks.indexOf(currentWeek);
                if (currentIndex > 0) {
                  const scrollTarget = currentIndex * (96 + 12) - 12; // card width + gap - offset
                  el.scrollLeft = Math.max(0, scrollTarget - 50);
                }
              }
            }}
          >
            {weeks.filter(week => week <= currentWeek + 1).map(week => {
              const weekPicks = getPicksForWeek(week);
              const isDoublePick = (league.doublePickWeeks || []).includes(week);
              const requiredPicks = isDoublePick ? 2 : 1;
              const isCurrent = week === currentWeek;
              
              // Determine overall result using effective results from game status
              const hasWin = weekPicks.some(p => getPickResult(p, p.teamId) === 'win');
              const hasLoss = weekPicks.some(p => getPickResult(p, p.teamId) === 'loss');
              const hasPending = weekPicks.some(p => {
                const result = getPickResult(p, p.teamId);
                return !result || result === 'pending';
              });
              const isComplete = weekPicks.length === requiredPicks;
              
              let bgClass = 'bg-white/5 border border-white/10';
              if (weekPicks.length > 0) {
                if (hasLoss) {
                  bgClass = 'bg-red-500/20 border border-red-500/30';
                } else if (hasPending) {
                  bgClass = 'bg-yellow-500/20 border border-yellow-500/30';
                } else if (hasWin) {
                  bgClass = 'bg-green-500/20 border border-green-500/30';
                }
              } else if (week < league.startWeek) {
                bgClass = 'bg-white/[0.02] border border-white/5';
              }
              
              return (
                <div
                  key={week}
                  className={`flex-shrink-0 flex flex-col items-center p-3 rounded-xl w-24 h-28 snap-start ${bgClass} ${isCurrent ? 'ring-2 ring-emerald-500' : ''}`}
                >
                  <span className="text-xs text-white/50 mb-2 text-center whitespace-nowrap">
                    {week <= 18 ? `Week ${week}` : week === 19 ? 'Wild Card' : week === 20 ? 'Divisional' : week === 21 ? 'Conf' : week === 22 ? 'Super Bowl' : `Week ${week}`}
                    {isDoublePick && <span className="text-orange-400 ml-1">×2</span>}
                  </span>
                  
                  {weekPicks.length > 0 ? (
                    <>
                      <div className="flex items-center gap-1 mb-1">
                        {weekPicks.map((pick, idx) => {
                          const team = NFL_TEAMS[String(pick.teamId)];
                          const result = getPickResult(pick, pick.teamId);
                          return (
                            <div key={idx} className="flex flex-col items-center">
                              {team?.logo ? (
                                <img 
                                  src={team.logo} 
                                  alt={team.name}
                                  className="w-10 h-10 object-contain"
                                  title={team.name}
                                />
                              ) : (
                                <div 
                                  className="w-10 h-10 rounded-full flex items-center justify-center text-white text-xs font-bold"
                                  style={{ backgroundColor: team?.color || '#666' }}
                                >
                                  {team?.abbreviation || pick.teamId}
                                </div>
                              )}
                              {/* Show individual W/L for double picks */}
                              {isDoublePick && result && result !== 'pending' && (
                                <span className={`text-xs font-bold ${
                                  result === 'win' ? 'text-green-400' : 'text-red-400'
                                }`}>
                                  {result === 'win' ? 'W' : 'L'}
                                </span>
                              )}
                            </div>
                          );
                        })}
                        {/* Show placeholder for missing second pick */}
                        {isDoublePick && weekPicks.length < 2 && (
                          <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-white/30 text-lg">
                            ?
                          </div>
                        )}
                      </div>
                      
                      {/* Result display - only for single picks or pending */}
                      {!isDoublePick && (
                        !hasPending ? (
                          <span className={`text-xs font-medium ${
                            hasLoss ? 'text-red-400' : 'text-green-400'
                          }`}>
                            {hasWin ? 'WIN' : 'LOSS'}
                          </span>
                        ) : (
                          <span className="text-xs text-yellow-400">Pending</span>
                        )
                      )}
                      {isDoublePick && hasPending && (
                        <span className="text-xs text-yellow-400">Pending</span>
                      )}
                    </>
                  ) : week >= league.startWeek ? (
                    <div className="flex items-center gap-1">
                      <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-white/30 text-lg">
                        ?
                      </div>
                      {isDoublePick && (
                        <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-white/30 text-lg">
                          ?
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center text-white/20">
                      —
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Settings Modal */}
      {showSettings && (
        <div className="modal-overlay" onClick={() => setShowSettings(false)}>
          <div className="modal-content animate-in max-w-lg" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-semibold text-white flex items-center gap-2">
                <Settings className="w-5 h-5" />
                League Settings
              </h2>
              <button
                onClick={() => setShowSettings(false)}
                className="p-2 hover:bg-white/10 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-white/60" />
              </button>
            </div>

            <div className="space-y-6">
              <div>
                <label className="block text-white/80 text-sm font-medium mb-2">
                  Max Strikes Before Elimination
                </label>
                <div className="flex items-center gap-3">
                  {[1, 2, 3, 4, 5].map(num => (
                    <button
                      key={num}
                      onClick={() => setSettings({ ...settings, maxStrikes: num })}
                      className={`w-12 h-12 rounded-xl font-semibold transition-all ${
                        settings.maxStrikes === num
                          ? 'bg-nfl-blue text-white'
                          : 'bg-white/10 text-white/60 hover:bg-white/15'
                      }`}
                    >
                      {num}
                    </button>
                  ))}
                </div>
                <p className="text-white/40 text-xs mt-2">
                  Players are eliminated after reaching this many strikes
                </p>
              </div>

              {/* Double Pick Weeks */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-white/80 text-sm font-medium">
                    Double Pick Weeks
                  </label>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setSettings({ ...settings, doublePickWeeks: [] })}
                      className={`px-2 py-1 text-xs rounded-lg transition-all ${
                        settings.doublePickWeeks.length === 0
                          ? 'bg-nfl-blue text-white'
                          : 'bg-white/10 text-white/60 hover:bg-white/15'
                      }`}
                    >
                      None
                    </button>
                    <button
                      onClick={() => setSettings({ 
                        ...settings, 
                        doublePickWeeks: Array.from({ length: 22 - league.startWeek + 1 }, (_, i) => league.startWeek + i)
                      })}
                      className={`px-2 py-1 text-xs rounded-lg transition-all ${
                        settings.doublePickWeeks.length === (22 - league.startWeek + 1)
                          ? 'bg-nfl-blue text-white'
                          : 'bg-white/10 text-white/60 hover:bg-white/15'
                      }`}
                    >
                      All Weeks
                    </button>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {Array.from({ length: 22 - league.startWeek + 1 }, (_, i) => league.startWeek + i).map(weekNum => (
                    <button
                      key={weekNum}
                      onClick={() => {
                        const current = settings.doublePickWeeks || [];
                        const newWeeks = current.includes(weekNum)
                          ? current.filter(w => w !== weekNum)
                          : [...current, weekNum].sort((a, b) => a - b);
                        setSettings({ ...settings, doublePickWeeks: newWeeks });
                      }}
                      className={`w-10 h-10 rounded-lg font-medium text-sm transition-all ${
                        (settings.doublePickWeeks || []).includes(weekNum)
                          ? 'bg-orange-500 text-white'
                          : weekNum > 18
                          ? 'bg-purple-500/20 text-white/60 hover:bg-purple-500/30'
                          : 'bg-white/10 text-white/60 hover:bg-white/15'
                      } ${(settings.doublePickWeeks || []).includes(weekNum) ? '' : ''}`}
                    >
                      {weekNum}
                    </button>
                  ))}
                </div>
                <p className="text-white/40 text-xs mt-2">
                  {settings.doublePickWeeks?.length > 0 
                    ? `Members must pick 2 teams in week${settings.doublePickWeeks.length > 1 ? 's' : ''} ${settings.doublePickWeeks.join(', ')}. Each loss = 1 strike.`
                    : 'Select weeks where members must pick 2 teams instead of 1'
                  }
                </p>
              </div>

              {/* Entry Fee */}
              <div>
                <label className="block text-white/80 text-sm font-medium mb-2">
                  Entry Fee per Member
                </label>
                <div className="relative">
                  <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-white/40" />
                  <input
                    type="number"
                    min="0"
                    step="5"
                    value={settings.entryFee || ''}
                    onChange={(e) => setSettings({ ...settings, entryFee: parseFloat(e.target.value) || 0 })}
                    placeholder="0"
                    className="w-full pl-10 pr-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-white/40 focus:outline-none focus:border-nfl-blue"
                  />
                </div>
                <p className="text-white/40 text-xs mt-2">
                  Calculated pot: ${((settings.entryFee || 0) * (league.members?.length || 0)).toLocaleString()}
                </p>
              </div>

              {/* Manual Pot Override */}
              <div>
                <label className="block text-white/80 text-sm font-medium mb-2">
                  Manual Prize Pot Override
                </label>
                <div className="relative">
                  <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-white/40" />
                  <input
                    type="number"
                    min="0"
                    step="10"
                    value={settings.prizePotOverride || ''}
                    onChange={(e) => setSettings({ ...settings, prizePotOverride: e.target.value ? parseFloat(e.target.value) : null })}
                    placeholder="Leave empty to use calculated"
                    className="w-full pl-10 pr-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-white/40 focus:outline-none focus:border-nfl-blue"
                  />
                </div>
                <p className="text-white/40 text-xs mt-2">
                  {settings.prizePotOverride 
                    ? `Using manual pot: $${settings.prizePotOverride.toLocaleString()}`
                    : 'Leave empty to calculate from entry fee × members'
                  }
                </p>
              </div>

              {/* Payment Status - Members List */}
              {(settings.entryFee > 0 || settings.prizePotOverride) && (
                <div>
                  <label className="block text-white/80 text-sm font-medium mb-2">
                    Payment Status
                  </label>
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {league.members?.map(member => (
                      <div 
                        key={member.id}
                        className="flex items-center justify-between p-3 bg-white/5 rounded-lg"
                      >
                        <div className="flex items-center gap-2">
                          <Avatar 
                            userId={member.userId}
                            name={member.displayName}
                            size="sm"
                            isOnline={(onlineUsers[leagueId] || []).some(u => u.userId === member.userId)}
                          />
                          <div>
                            <span className="text-white text-sm">{member.displayName}</span>
                            {member.email && (
                              <p className="text-white/40 text-xs">{member.email}</p>
                            )}
                          </div>
                        </div>
                        <button
                          onClick={() => handleTogglePayment(member)}
                          disabled={togglingPayment === member.id}
                          className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all flex items-center gap-1.5 ${
                            member.hasPaid
                              ? 'bg-green-500/20 text-green-400 hover:bg-green-500/30'
                              : 'bg-white/10 text-white/60 hover:bg-white/15'
                          }`}
                        >
                          {togglingPayment === member.id ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : member.hasPaid ? (
                            <>
                              <Check className="w-4 h-4" />
                              Paid
                            </>
                          ) : (
                            <>
                              <DollarSign className="w-4 h-4" />
                              Mark Paid
                            </>
                          )}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex gap-3">
                <button
                  onClick={() => setShowSettings(false)}
                  className="btn-secondary flex-1"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveSettings}
                  disabled={savingSettings}
                  className="btn-primary flex-1 flex items-center justify-center gap-2"
                >
                  {savingSettings ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <>
                      <Check className="w-5 h-5" />
                      Save Changes
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Strike Modification Dialog */}
      {strikeDialog && (
        <div className="modal-overlay" onClick={() => setStrikeDialog(null)}>
          <div className="modal-content animate-in max-w-md" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-white/10">
                <Edit3 className="w-6 h-6 text-white" />
              </div>
              <div>
                <h2 className="text-xl font-semibold text-white">
                  Modify Strikes
                </h2>
                <p className="text-white/60 text-sm">
                  {strikeDialog.member.displayName} • {strikeDialog.member.strikes}/{league.maxStrikes} strikes
                </p>
              </div>
            </div>

            <div className="space-y-4">
              {/* Strike Visualization */}
              <div className="flex items-center justify-center gap-2 py-3">
                {Array.from({ length: league.maxStrikes }).map((_, i) => (
                  <div
                    key={i}
                    className={`w-6 h-6 rounded-full transition-all ${
                      i < strikeDialog.member.strikes
                        ? 'bg-red-500'
                        : 'bg-white/20'
                    }`}
                  />
                ))}
              </div>

              {/* Action Selection */}
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => setStrikeDialog({ ...strikeDialog, action: 'remove' })}
                  disabled={strikeDialog.member.strikes <= 0}
                  className={`p-4 rounded-xl border-2 transition-all flex flex-col items-center gap-2 ${
                    strikeDialog.action === 'remove'
                      ? 'border-green-500 bg-green-500/20'
                      : 'border-white/10 hover:border-white/30 disabled:opacity-30 disabled:hover:border-white/10'
                  }`}
                >
                  <Minus className="w-6 h-6 text-green-400" />
                  <span className="text-sm font-medium text-white">Remove Strike</span>
                </button>
                <button
                  onClick={() => setStrikeDialog({ ...strikeDialog, action: 'add' })}
                  disabled={strikeDialog.member.strikes >= league.maxStrikes}
                  className={`p-4 rounded-xl border-2 transition-all flex flex-col items-center gap-2 ${
                    strikeDialog.action === 'add'
                      ? 'border-red-500 bg-red-500/20'
                      : 'border-white/10 hover:border-white/30 disabled:opacity-30 disabled:hover:border-white/10'
                  }`}
                >
                  <Plus className="w-6 h-6 text-red-400" />
                  <span className="text-sm font-medium text-white">Add Strike</span>
                </button>
              </div>

              {strikeDialog.action && (
                <>
                  {/* Week Selector */}
                  <div>
                    <label className="block text-white/80 text-sm font-medium mb-2">
                      For Week
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {weeks.filter(w => w <= currentWeek).map(week => (
                        <button
                          key={week}
                          onClick={() => setStrikeDialog({ ...strikeDialog, week })}
                          className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                            strikeDialog.week === week
                              ? 'bg-nfl-blue text-white'
                              : 'bg-white/10 text-white/60 hover:bg-white/20'
                          }`}
                        >
                          {week <= 18 ? week : week === 19 ? 'WC' : week === 20 ? 'DIV' : week === 21 ? 'CONF' : week === 22 ? 'SB' : week}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-3">
                    <p className="text-yellow-200 text-sm">
                      {strikeDialog.action === 'add' 
                        ? `This will add a strike to ${strikeDialog.member.displayName} for ${strikeDialog.week ? getWeekLabel(strikeDialog.week) : '?'}. They will have ${strikeDialog.member.strikes + 1}/${league.maxStrikes} strikes.${strikeDialog.member.strikes + 1 >= league.maxStrikes ? ' They will be eliminated.' : ''}`
                        : `This will remove a strike from ${strikeDialog.member.displayName} for ${strikeDialog.week ? getWeekLabel(strikeDialog.week) : '?'}. They will have ${strikeDialog.member.strikes - 1}/${league.maxStrikes} strikes.`
                      }
                    </p>
                  </div>

                  <div>
                    <label className="block text-white/80 text-sm font-medium mb-2">
                      Reason (visible to all members)
                    </label>
                    <textarea
                      value={strikeReason}
                      onChange={(e) => setStrikeReason(e.target.value)}
                      placeholder="e.g., Missed pick deadline, Commissioner adjustment..."
                      className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-white/30 focus:outline-none focus:border-nfl-blue resize-none"
                      rows={2}
                    />
                  </div>
                </>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => { setStrikeDialog(null); setStrikeReason(''); }}
                  className="btn-secondary flex-1"
                >
                  Cancel
                </button>
                <button
                  onClick={handleModifyStrikes}
                  disabled={modifyingStrike || !strikeDialog.action || !strikeDialog.week}
                  className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl font-semibold transition-all disabled:opacity-50 ${
                    strikeDialog.action === 'add'
                      ? 'bg-red-500 hover:bg-red-600 text-white'
                      : strikeDialog.action === 'remove'
                      ? 'bg-green-500 hover:bg-green-600 text-white'
                      : 'bg-white/10 text-white/50'
                  }`}
                >
                  {modifyingStrike ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <>
                      <Check className="w-5 h-5" />
                      Confirm
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Pick Override Dialog */}
      {pickDialog && (() => {
        const isDoublePick = (league.doublePickWeeks || []).includes(pickDialog.week);
        const requiredPicks = isDoublePick ? 2 : 1;
        const usedTeams = getMemberUsedTeams(pickDialog.member, pickDialog.week);
        
        // Get current picks for the selected week
        const currentWeekPicks = pickDialog.member.picks?.[pickDialog.week]?.picks || [];
        const currentPick = pickDialog.member.picks?.[pickDialog.week];
        
        return (
        <div className="modal-overlay" onClick={() => { setPickDialog(null); setSelectedTeamsForPick([]); setPickReason(''); }}>
          <div className="modal-content animate-in max-w-lg" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-emerald-500/20">
                <CalendarCheck className="w-6 h-6 text-emerald-400" />
              </div>
              <div>
                <h2 className="text-xl font-semibold text-white">
                  Set Pick{isDoublePick ? 's' : ''}
                </h2>
                <p className="text-white/60 text-sm">
                  {pickDialog.member.displayName} • {getWeekLabel(pickDialog.week)}
                  {isDoublePick && <span className="text-orange-400 ml-2">(Double Pick Week)</span>}
                </p>
              </div>
            </div>

            <div className="space-y-4">
              {/* Week Selector */}
              <div>
                <label className="block text-white/80 text-sm font-medium mb-2">
                  Select Week
                </label>
                <div className="flex flex-wrap gap-2">
                  {weeks.map(week => {
                    const weekIsDouble = (league.doublePickWeeks || []).includes(week);
                    const shortLabel = week <= 18 ? week : week === 19 ? 'WC' : week === 20 ? 'DIV' : week === 21 ? 'CONF' : week === 22 ? 'SB' : week;
                    return (
                      <button
                        key={week}
                        onClick={() => {
                          setPickDialog({ ...pickDialog, week });
                          setSelectedTeamsForPick([]); // Clear selection when week changes
                        }}
                        className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                          pickDialog.week === week
                            ? 'bg-nfl-blue text-white'
                            : weekIsDouble
                            ? 'bg-orange-500/20 text-orange-300 hover:bg-orange-500/30'
                            : 'bg-white/10 text-white/60 hover:bg-white/20'
                        }`}
                        title={getWeekLabel(week)}
                      >
                        {shortLabel}
                        {weekIsDouble && pickDialog.week !== week && <span className="ml-1">×2</span>}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Current Pick(s) Display */}
              <div className="bg-white/5 rounded-lg p-3">
                <span className="text-white/50 text-xs">Current Pick{isDoublePick ? 's' : ''}:</span>
                {currentWeekPicks.length > 0 ? (
                  <div className="flex flex-wrap gap-2 mt-1">
                    {currentWeekPicks.map((pick, idx) => {
                      const team = NFL_TEAMS[String(pick.teamId)];
                      const result = getPickResult(pick, pick.teamId);
                      return (
                        <div key={idx} className="flex items-center gap-2 bg-white/5 rounded-lg px-2 py-1">
                          {team?.logo && <img src={team.logo} alt={team.name} className="w-5 h-5" />}
                          <span className="text-white text-sm">{team?.name || pick.teamId}</span>
                          {result && result !== 'pending' && (
                            <span className={`text-xs px-1.5 py-0.5 rounded ${
                              result === 'win' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
                            }`}>
                              {result.toUpperCase()}
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : currentPick?.teamId ? (
                  (() => {
                    const result = getPickResult(currentPick, currentPick.teamId);
                    return (
                      <div className="flex items-center gap-2 mt-1">
                        {NFL_TEAMS[String(currentPick.teamId)]?.logo && (
                          <img src={NFL_TEAMS[String(currentPick.teamId)].logo} alt="" className="w-5 h-5" />
                        )}
                        <span className="text-white text-sm">{NFL_TEAMS[String(currentPick.teamId)]?.name}</span>
                        {result && result !== 'pending' && (
                          <span className={`text-xs px-1.5 py-0.5 rounded ${
                            result === 'win' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
                          }`}>
                            {result.toUpperCase()}
                          </span>
                        )}
                      </div>
                    );
                  })()
                ) : (
                  <p className="text-white/40 text-sm mt-1">No pick for {getWeekLabel(pickDialog.week)}</p>
                )}
              </div>

              {/* Selected Teams Display */}
              {selectedTeamsForPick.length > 0 && (
                <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-3">
                  <span className="text-emerald-300 text-xs">New Pick{isDoublePick ? 's' : ''} ({selectedTeamsForPick.length}/{requiredPicks}):</span>
                  <div className="flex flex-wrap gap-2 mt-1">
                    {selectedTeamsForPick.map((teamId, idx) => {
                      const team = NFL_TEAMS[teamId];
                      return (
                        <div key={teamId} className="flex items-center gap-2 bg-emerald-500/20 rounded-lg px-2 py-1">
                          <span className="text-emerald-300 text-xs font-bold">#{idx + 1}</span>
                          {team?.logo && <img src={team.logo} alt={team.name} className="w-5 h-5" />}
                          <span className="text-white text-sm">{team?.name}</span>
                          <button
                            onClick={() => setSelectedTeamsForPick(prev => prev.filter(id => id !== teamId))}
                            className="text-white/50 hover:text-red-400 ml-1"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Team Selector */}
              <div>
                <label className="block text-white/80 text-sm font-medium mb-2">
                  Select {requiredPicks} Team{requiredPicks > 1 ? 's' : ''}
                </label>
                <div className="grid grid-cols-4 sm:grid-cols-6 gap-2 max-h-[250px] overflow-y-auto p-1">
                  {Object.entries(NFL_TEAMS).map(([teamId, team]) => {
                    const isUsed = usedTeams.has(teamId);
                    const isSelected = selectedTeamsForPick.includes(teamId);
                    const selectionIndex = selectedTeamsForPick.indexOf(teamId);
                    const canSelect = !isUsed && !isSelected && selectedTeamsForPick.length < requiredPicks;
                    
                    return (
                      <button
                        key={teamId}
                        onClick={() => {
                          if (isSelected) {
                            setSelectedTeamsForPick(prev => prev.filter(id => id !== teamId));
                          } else if (canSelect) {
                            setSelectedTeamsForPick(prev => [...prev, teamId]);
                          }
                        }}
                        disabled={isUsed}
                        className={`p-2 rounded-lg flex flex-col items-center gap-1 transition-all relative ${
                          isSelected
                            ? 'bg-emerald-500 ring-2 ring-emerald-400'
                            : isUsed
                            ? 'bg-white/5 opacity-30 cursor-not-allowed'
                            : canSelect
                            ? 'bg-white/5 hover:bg-white/10'
                            : 'bg-white/5 opacity-50'
                        }`}
                        title={isUsed ? `Already used by ${pickDialog.member.displayName}` : team.name}
                      >
                        {isSelected && (
                          <div className="absolute -top-1 -right-1 w-5 h-5 bg-emerald-600 rounded-full flex items-center justify-center text-[10px] text-white font-bold">
                            {selectionIndex + 1}
                          </div>
                        )}
                        <img 
                          src={team.logo} 
                          alt={team.name}
                          className="w-8 h-8 object-contain"
                        />
                        <span className={`text-[10px] font-medium ${isSelected ? 'text-white' : 'text-white/60'}`}>
                          {team.abbreviation}
                        </span>
                      </button>
                    );
                  })}
                </div>
                <p className="text-white/40 text-xs mt-2">
                  {isDoublePick 
                    ? `Select 2 different teams. Grayed out teams have already been used.`
                    : `Grayed out teams have already been used by this player.`
                  }
                </p>
              </div>

              {/* Reason */}
              <div>
                <label className="block text-white/80 text-sm font-medium mb-2">
                  Reason (visible to all members)
                </label>
                <textarea
                  value={pickReason}
                  onChange={(e) => setPickReason(e.target.value)}
                  placeholder="e.g., Player requested change, Missed deadline..."
                  className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-white/30 focus:outline-none focus:border-nfl-blue resize-none"
                  rows={2}
                />
              </div>

              {/* Warning */}
              {selectedTeamsForPick.length === requiredPicks && (
                <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-3">
                  <p className="text-yellow-200 text-sm">
                    This will set {pickDialog.member.displayName}'s {getWeekLabel(pickDialog.week)} pick{isDoublePick ? 's' : ''} to{' '}
                    {selectedTeamsForPick.map(id => NFL_TEAMS[id]?.name).join(' & ')}.
                    {(currentWeekPicks.length > 0 || currentPick?.teamId) && ' This will override their existing pick(s).'}
                  </p>
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => { setPickDialog(null); setSelectedTeamsForPick([]); setPickReason(''); }}
                  className="btn-secondary flex-1"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSetMemberPick}
                  disabled={savingPick || selectedTeamsForPick.length !== requiredPicks}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl font-semibold transition-all bg-nfl-blue hover:bg-nfl-blue/80 text-white disabled:opacity-50"
                >
                  {savingPick ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <>
                      <Check className="w-5 h-5" />
                      Set Pick{isDoublePick ? 's' : ''}
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
        );
      })()}

      {/* Action Log Modal */}
      {showActionLog && (
        <div className="modal-overlay" onClick={() => setShowActionLog(false)}>
          <div className="modal-content animate-in max-w-lg" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-semibold text-white flex items-center gap-2">
                <History className="w-5 h-5" />
                Commissioner Actions
              </h2>
              <button
                onClick={() => setShowActionLog(false)}
                className="p-2 hover:bg-white/10 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-white/60" />
              </button>
            </div>

            <div className="space-y-3 max-h-[400px] overflow-y-auto">
              {actionLog.length === 0 ? (
                <div className="text-center py-8">
                  <History className="w-10 h-10 text-white/20 mx-auto mb-3" />
                  <p className="text-white/40">No commissioner actions yet</p>
                </div>
              ) : (
                actionLog.map((log, idx) => {
                  const team = log.teamId ? NFL_TEAMS[String(log.teamId)] : null;
                  
                  return (
                    <div key={log.id || idx} className="bg-white/5 rounded-xl p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-2">
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                            log.action === 'strike_added' 
                              ? 'bg-red-500/20' 
                              : log.action === 'strike_removed'
                              ? 'bg-green-500/20'
                              : log.action === 'settings_changed'
                              ? 'bg-purple-500/20'
                              : 'bg-emerald-500/20'
                          }`}>
                            {log.action === 'strike_added' ? (
                              <Plus className="w-4 h-4 text-red-400" />
                            ) : log.action === 'strike_removed' ? (
                              <Minus className="w-4 h-4 text-green-400" />
                            ) : log.action === 'settings_changed' ? (
                              <Settings className="w-4 h-4 text-purple-400" />
                            ) : (
                              <CalendarCheck className="w-4 h-4 text-emerald-400" />
                            )}
                          </div>
                          <div>
                            <p className="text-white text-sm font-medium">
                              {log.action === 'strike_added' 
                                ? 'Strike Added' 
                                : log.action === 'strike_removed'
                                ? 'Strike Removed'
                                : log.action === 'settings_changed'
                                ? 'Settings Changed'
                                : 'Pick Set'}
                              {log.week && <span className="text-white/50 font-normal"> • Week {log.week}</span>}
                            </p>
                            <p className="text-white/50 text-xs flex items-center gap-1">
                              {log.action === 'settings_changed' ? (
                                <span>{log.reason}</span>
                              ) : (
                                <>
                                  {log.targetUser}
                                  {log.action === 'pick_set' && team && (
                                    <>
                                      <span>→</span>
                                      {team.logo && <img src={team.logo} alt={team.name} className="w-4 h-4 inline" />}
                                      <span>{team.name}</span>
                                    </>
                                  )}
                                </>
                              )}
                            </p>
                          </div>
                        </div>
                        <span className="text-white/30 text-xs">
                          {new Date(log.timestamp).toLocaleDateString()}
                        </span>
                      </div>
                      {log.reason && log.action !== 'settings_changed' && (
                        <p className="text-white/60 text-sm mt-2 pl-10">
                          "{log.reason}"
                        </p>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      {/* Share Modal */}
      {showShareModal && (
        <ShareLeagueModal
          league={league}
          isCommissioner={isCommissioner}
          onClose={() => setShowShareModal(false)}
          onInviteCodeUpdate={(newCode) => setLeague(prev => ({ ...prev, inviteCode: newCode }))}
        />
      )}
      </div>
      
      {/* Chat sidebar on desktop, floating button on mobile */}
      {league && (
        <ChatWidget 
          leagueId={league.id} 
          leagueName={league.name}
          commissionerId={league.commissionerId}
          members={standings}
          maxStrikes={league.maxStrikes}
          onCollapsedChange={setIsChatCollapsed}
        />
      )}
    </div>
  );
}