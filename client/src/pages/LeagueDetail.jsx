import { useState, useEffect, useMemo, useRef } from 'react';
import { useParams, useNavigate, Link, Navigate } from 'react-router-dom';
import { 
  Trophy, Users, Settings, ChevronLeft, ChevronRight, ArrowLeft,
  Crown, Plus, Minus, Check, X, Calendar, Loader2,
  AlertCircle, Eye, EyeOff, History, AlertTriangle, Edit3,
  Pencil, CalendarCheck, DollarSign, Lock
} from 'lucide-react';
import { leagueAPI, nflAPI, picksAPI, trackingAPI } from '../api';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import { useToast } from '../components/Toast';
import Loading from '../components/Loading';
import { ShareLeagueButton, ShareLeagueModal } from '../components/ShareLeague';
import ChatWidget from '../components/ChatWidget';
import Avatar from '../components/Avatar';
import { getSportModule } from '../sports';
import { useThemedLogo } from '../utils/logo';
import AppIcon from '../components/AppIcon';
import CommishBadge from '../components/CommishBadge';

export default function LeagueDetail() {
  const { leagueId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { showToast } = useToast();
  const { onlineUsers } = useSocket();
  const tl = useThemedLogo();

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
  const [currentWeekTeams, setCurrentWeekTeams] = useState([]); // Teams playing this week
  const [seasonOver, setSeasonOver] = useState(false);
  const hasTriggeredUpdateRef = useRef(false);

  const isCommissioner = league?.commissionerId === user?.id;

  // Load sport module dynamically based on league's sport
  const sport = useMemo(() => getSportModule(league?.sportId || 'nfl'), [league?.sportId]);
  const NFL_TEAMS = sport.teams;
  const { getWeekLabel, getShortWeekLabel, getWeekFullLabel, espnToAppWeek } = sport;

  // Helper to change week
  const handleWeekChange = (newWeek) => {
    if (newWeek === selectedWeek) return;
    trackingAPI.event('survivor_week_change', {
      leagueId,
      leagueName: league?.name,
      fromWeek: selectedWeek,
      toWeek: newWeek,
    });
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

  // Helper to get effective strikes
  // throughWeek: if provided, computes strikes entirely from picks data through that week
  //   (DB member.strikes is cumulative across ALL weeks, so we can't use it for week-scoped views)
  // If not provided, uses DB member.strikes + unprocessed additions (for current elimination status)
  const getEffectiveStrikes = (member, throughWeek) => {
    if (!member) return 0;

    const isWeekScoped = throughWeek != null;
    // When week-scoped, compute entirely from picks data (DB strikes is cumulative and not week-scoped)
    let strikes = isWeekScoped ? 0 : (member.strikes || 0);

    const endWeek = isWeekScoped ? throughWeek : currentWeek;
    const lastWeekToCheck = (isWeekScoped && throughWeek < currentWeek)
      ? throughWeek  // viewing a past week — all weeks through it are concluded
      : seasonOver ? currentWeek : currentWeek - 1;

    for (let week = league?.startWeek || 1; week <= endWeek; week++) {
      // Skip Pro Bowl week
      if (week === 22) continue;

      const weekData = member.picks?.[week];
      const weekPicks = weekData?.picks || [];
      const displayPicks = weekPicks.length > 0
        ? weekPicks
        : (weekData?.teamId ? [{ teamId: weekData.teamId, result: weekData.result }] : []);

      if (displayPicks.length === 0 && week <= lastWeekToCheck) {
        // No pick made for a past week = missed pick = strike
        const isDoublePick = (league?.doublePickWeeks || []).includes(week);
        strikes += isDoublePick ? 2 : 1;
      } else {
        for (const pick of displayPicks) {
          const dbResult = pick.result;
          const effectiveResult = getPickResult(pick, pick.teamId);

          if (isWeekScoped) {
            // Week-scoped: count ALL losses (both DB-processed and unprocessed)
            if (dbResult === 'loss' || (dbResult !== 'win' && effectiveResult === 'loss')) {
              strikes++;
            }
          } else {
            // Current status: only count UNPROCESSED losses (DB strikes already covers processed ones)
            if (dbResult !== 'loss' && dbResult !== 'win' && effectiveResult === 'loss') {
              strikes++;
            }
          }
        }
      }
    }

    return strikes;
  };

  // Sort standings by effective strikes through the loaded week
  // Uses loadedWeek (not selectedWeek) so calculations match the currently loaded data
  const sortedStandings = useMemo(() => {
    if (!standings || standings.length === 0) return [];

    const weekForCalc = loadedWeek || selectedWeek;

    const maxStrikes = league?.maxStrikes || 1;

    return [...standings].sort((a, b) => {
      const aStrikes = getEffectiveStrikes(a, weekForCalc);
      const bStrikes = getEffectiveStrikes(b, weekForCalc);
      const aEliminated = aStrikes >= maxStrikes;
      const bEliminated = bStrikes >= maxStrikes;

      // Active members first
      if (aEliminated !== bEliminated) {
        return aEliminated ? 1 : -1;
      }

      // Then by strikes (fewer = higher ranking)
      if (aStrikes !== bStrikes) {
        return aStrikes - bStrikes;
      }

      // Then alphabetically
      const aName = (a.displayName || '').toLowerCase();
      const bName = (b.displayName || '').toLowerCase();
      return aName.localeCompare(bName);
    });
  }, [standings, currentWeek, loadedWeek, selectedWeek, gameStatuses, league?.startWeek, league?.maxStrikes, seasonOver]);

  // Get teams already used by a member
  const getMemberUsedTeams = (member, excludeWeek = null) => {
    if (!member.picks) return new Set();
    const used = new Set();
    Object.entries(member.picks).forEach(([week, pick]) => {
      if (excludeWeek && parseInt(week) === excludeWeek) return;
      
      // Handle single pick (teamId directly on pick)
      if (pick?.teamId) {
        used.add(String(pick.teamId));
      }
      
      // Handle double pick weeks (picks array)
      if (pick?.picks && Array.isArray(pick.picks)) {
        pick.picks.forEach(p => {
          if (p?.teamId) {
            used.add(String(p.teamId));
          }
        });
      }
    });
    return used;
  };

  // Calculate matchup availability for current week (which players have which teams available)
  // Only shows for playoff weeks or when there are 4 or fewer games
  const matchupAvailability = useMemo(() => {
    if (seasonOver) return null;
    if (!standings || standings.length === 0 || !currentWeekTeams || currentWeekTeams.length === 0) {
      return null;
    }
    
    // Only show for playoff weeks (19+) or when 4 or fewer games (8 or fewer teams)
    const isPlayoffWeek = selectedWeek >= 19;
    const isFewGames = currentWeekTeams.length <= 8;
    
    if (!isPlayoffWeek && !isFewGames) {
      return null;
    }
    
    // Group members by their available options
    const groups = {
      bothAvailable: [],    // Has all teams available
      oneTeamOnly: {},      // { teamId: [members] }
      noOptions: []         // Used all teams playing this week
    };
    
    // Only consider active members
    const activeMembers = standings.filter(m => m.status === 'active');
    
    for (const member of activeMembers) {
      // Exclude current week when calculating used teams (show options going into the week)
      const usedTeams = getMemberUsedTeams(member, selectedWeek);
      const availableThisWeek = currentWeekTeams.filter(teamId => !usedTeams.has(String(teamId)));
      
      if (availableThisWeek.length === currentWeekTeams.length) {
        // Has all teams available
        groups.bothAvailable.push(member);
      } else if (availableThisWeek.length === 0) {
        // No options left
        groups.noOptions.push(member);
      } else {
        // Has some but not all teams
        for (const teamId of availableThisWeek) {
          if (!groups.oneTeamOnly[teamId]) {
            groups.oneTeamOnly[teamId] = [];
          }
          groups.oneTeamOnly[teamId].push(member);
        }
      }
    }
    
    return {
      groups,
      teamsPlaying: currentWeekTeams,
      weekLabel: selectedWeek === 23 ? 'Super Bowl' : 
                 selectedWeek === 21 ? 'Conference Championships' :
                 selectedWeek === 20 ? 'Divisional Round' :
                 selectedWeek === 19 ? 'Wild Card' : `Week ${selectedWeek}`
    };
  }, [standings, currentWeekTeams, selectedWeek, seasonOver]);

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
      if (seasonResult.isSeasonOver) {
        setSeasonOver(true);
      }
      if (seasonResult.week) {
        let displayWeek = espnToAppWeek(seasonResult.week, seasonResult.seasonType);
        setCurrentWeek(displayWeek);
        setSelectedWeek(displayWeek);
        
        // Fetch teams playing this week for the matchup options card
        try {
          // For playoff weeks, we need to pass seasonType=3
          const seasonType = displayWeek > 18 ? 3 : 2;
          // Convert to ESPN week format for playoffs (19->1, 20->2, 21->3, 23->5)
          let scheduleWeek = displayWeek;
          if (displayWeek > 18) {
            if (displayWeek === 23) scheduleWeek = 5; // Super Bowl is ESPN week 5
            else scheduleWeek = displayWeek - 18;
          }
          
          const scheduleResult = await nflAPI.getSchedule(scheduleWeek, null, seasonType);
          // Handle both array response and { games: [] } response
          const games = Array.isArray(scheduleResult) ? scheduleResult : 
                        (scheduleResult?.games || scheduleResult?.events || []);
          
          if (games.length > 0) {
            // Extract unique team IDs from all games
            const teamIds = new Set();
            games.forEach(game => {
              // Handle different response formats
              const homeId = game.homeTeam?.id || game.home?.id;
              const awayId = game.awayTeam?.id || game.away?.id;
              if (homeId) teamIds.add(String(homeId));
              if (awayId) teamIds.add(String(awayId));
            });
            setCurrentWeekTeams(Array.from(teamIds));
          }
        } catch (e) {
          console.log('Could not fetch week schedule:', e);
        }
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
    trackingAPI.event('strike_modify', {
      leagueId,
      leagueName: league?.name,
      action,
      memberName: member.displayName,
      week,
    });

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

  // Commissioner: Set pick for a member
  const handleSetMemberPick = async () => {
    if (!pickDialog || selectedTeamsForPick.length === 0) return;

    const { member, week } = pickDialog;
    trackingAPI.event('pick_override', {
      leagueId,
      leagueName: league?.name,
      memberName: member.displayName,
      week,
      teams: selectedTeamsForPick.map(id => NFL_TEAMS[id]?.name || id).join(', '),
    });
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
    if (seasonOver) return false;
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

  // NCAAB bracket leagues redirect to the bracket challenge page
  if (league.sportId === 'ncaab') {
    return <Navigate to={`/league/${leagueId}/bracket`} replace />;
  }

  // Generate weeks from league start through end of playoffs (week 23 = Super Bowl)
  // Skip week 22 (Pro Bowl - no survivor picks)
  const weeks = Array.from(
    { length: 23 - league.startWeek + 1 }, 
    (_, i) => league.startWeek + i
  ).filter(w => w !== 22); // Skip Pro Bowl week

  return (
    <div className={`transition-[padding] duration-300 ${isChatCollapsed ? 'lg:pr-20' : 'lg:pr-[26rem] xl:pr-[28rem]'}`}>
      {/* Main content - scrolls naturally, with padding for fixed chat sidebar */}
      {/* pb-32 on mobile/tablet for chat bar, normal padding on lg+ where chat is sidebar */}
      <div className="max-w-6xl mx-auto px-3 sm:px-4 pt-4 sm:pt-8 pb-32 lg:pb-16 lg:max-w-6xl lg:px-6">
      {/* Header */}
      <div className="flex flex-col gap-4 mb-6 sm:mb-8">
        <Link
          to="/dashboard"
          className="inline-flex items-center gap-1.5 text-fg/70 hover:text-fg text-base font-medium transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          My Leagues
        </Link>
        <div className="flex items-center gap-3 sm:gap-4 animate-in">
          <div className="w-12 h-12 sm:w-16 sm:h-16 rounded-xl sm:rounded-2xl bg-gradient-to-br from-neutral-800 to-neutral-900 flex items-center justify-center shadow-lg flex-shrink-0">
            <AppIcon className="w-9 h-9 sm:w-12 sm:h-12" color="white" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="font-display text-xl sm:text-3xl font-bold text-fg truncate">{league.name}</h1>
            </div>
            <p className="text-fg/60 text-sm sm:text-base">
              {league.members?.length || 0} members • {league.maxStrikes} strike{league.maxStrikes !== 1 ? 's' : ''} max
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          {league?.sportId === 'ncaab' ? (
            <Link
              to={`/league/${leagueId}/bracket`}
              className="btn-primary flex items-center gap-2 text-sm sm:text-base py-2.5 sm:py-3 flex-1 sm:flex-none justify-center"
            >
              <Trophy className="w-4 h-4 sm:w-5 sm:h-5" />
              Bracket
            </Link>
          ) : needsPickThisWeek() && (
            <Link
              to={`/league/${leagueId}/pick`}
              className="btn-primary flex items-center gap-2 text-sm sm:text-base py-2.5 sm:py-3 flex-1 sm:flex-none justify-center animate-pulse-glow"
            >
              <Calendar className="w-4 h-4 sm:w-5 sm:h-5" />
              Make Pick
            </Link>
          )}

          {/* Share button - visible to all members */}
          <ShareLeagueButton onClick={() => {
            trackingAPI.event('share_modal_open', { leagueId, leagueName: league?.name, source: 'survivor_dashboard' });
            setShowShareModal(true);
          }} />
          
          {isCommissioner && (
            <>
              <button
                onClick={() => {
                  trackingAPI.event('action_log_open', { leagueId, leagueName: league?.name });
                  setShowActionLog(true);
                }}
                className="btn-secondary flex items-center gap-2 text-sm sm:text-base py-2.5 sm:py-3"
              >
                <History className="w-4 h-4 sm:w-5 sm:h-5" />
                <span className="hidden sm:inline">History</span>
              </button>
              <button
                onClick={() => {
                  trackingAPI.event('settings_open', { leagueId, leagueName: league?.name, source: 'survivor_dashboard' });
                  setShowSettings(true);
                }}
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
              onClick={() => {
                trackingAPI.event('action_log_open', { leagueId, leagueName: league?.name });
                setShowActionLog(true);
              }}
              className="btn-secondary flex items-center gap-2 text-sm sm:text-base py-2.5 sm:py-3"
            >
              <History className="w-4 h-4 sm:w-5 sm:h-5" />
              <span className="hidden sm:inline">History</span>
            </button>
          )}
        </div>
      </div>

      {/* Season Concluded Banner */}
      {seasonOver && (() => {
        const activeMembers = league.members?.filter(m => m.status === 'active') || [];
        const winners = activeMembers.length > 0 ? activeMembers : null;
        return (
          <div className="glass-card rounded-xl sm:rounded-2xl p-4 sm:p-6 mb-4 sm:mb-6 border border-fg/10 animate-in" style={{ animationDelay: '25ms' }}>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-lg">🏆</span>
              <h2 className="text-lg font-semibold text-fg">Season Complete</h2>
            </div>
            {winners ? (
              <p className="text-fg/70 text-sm mt-1">
                {winners.length === 1 ? 'Winner: ' : `${winners.length} Winners: `}
                {winners.map((w, i) => (
                  <span key={w.userId}>
                    <span className={w.userId === user?.id ? 'text-fg font-medium' : ''}>
                      {w.displayName}{w.userId === user?.id && ' (You)'}
                    </span>
                    {i < winners.length - 1 && ', '}
                  </span>
                ))}
              </p>
            ) : (
              <p className="text-fg/50 text-sm mt-1">No survivors — everyone was eliminated!</p>
            )}
          </div>
        );
      })()}

      {/* Prize Pot Display */}
      {(league.entryFee > 0 || league.prizePotOverride) && (
        <div className="glass-card rounded-xl sm:rounded-2xl p-4 sm:p-6 mb-4 sm:mb-6 animate-in" style={{ animationDelay: '25ms' }}>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center">
                <DollarSign className="w-6 h-6 text-white" />
              </div>
              <div>
                <p className="text-fg/60 text-sm">Prize Pot{isCommissioner && league.prizePotOverride ? ' (Manual)' : ''}</p>
                <p className="text-2xl sm:text-3xl font-bold text-fg">
                  ${(league.prizePotOverride || (league.entryFee * (league.members?.filter(m => m.hasPaid).length || 0))).toLocaleString()}
                </p>
              </div>
            </div>
            
            <div className="flex flex-wrap gap-4 sm:gap-6">
              {league.entryFee > 0 && (
                <div className="text-center">
                  <p className="text-fg/60 text-xs sm:text-sm">Entry Fee</p>
                  <p className="text-lg sm:text-xl font-semibold text-fg">${league.entryFee}</p>
                </div>
              )}
              {isCommissioner && (
                <div className="text-center">
                  <p className="text-fg/60 text-xs sm:text-sm">Paid</p>
                  <p className="text-lg sm:text-xl font-semibold text-green-500">
                    {league.members?.filter(m => m.hasPaid).length || 0}/{league.members?.length || 0}
                  </p>
                </div>
              )}
              <div className="text-center">
                <p className="text-fg/60 text-xs sm:text-sm">Alive</p>
                <p className="text-lg sm:text-xl font-semibold text-green-500">
                  {league.members?.filter(m => m.status === 'active').length || 0}
                </p>
              </div>
              <div className="text-center">
                <p className="text-fg/60 text-xs sm:text-sm">Eliminated</p>
                <p className="text-lg sm:text-xl font-semibold text-red-500">
                  {league.members?.filter(m => m.status === 'eliminated').length || 0}
                </p>
              </div>
              <div className="text-center">
                <p className="text-fg/60 text-xs sm:text-sm">Weeks Left</p>
                <p className="text-lg sm:text-xl font-semibold text-fg">
                  {currentWeek <= 18 
                    ? `${Math.max(0, 18 - currentWeek + 1)}+4`
                    : Math.max(0, 23 - currentWeek + 1)
                  }
                </p>
              </div>
            </div>
          </div>
          
          <div className="mt-4 pt-4 border-t border-fg/10">
            <p className="text-fg/50 text-sm">
              💰 Pot splits evenly among all survivors at season end, or winner-takes-all if one remains.
            </p>
          </div>
        </div>
      )}

      {/* Matchup Options Card - Shows for playoff weeks or few games */}
      {matchupAvailability && (
        <div className="glass-card rounded-xl sm:rounded-2xl p-4 sm:p-6 mb-4 sm:mb-6 animate-in" style={{ animationDelay: '35ms' }}>
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center">
              <Trophy className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="text-fg font-semibold">{matchupAvailability.weekLabel} Options</h3>
              <p className="text-fg/50 text-sm">Who can pick which team</p>
            </div>
          </div>
          
          {/* Mobile: horizontal scroll, Desktop: grid */}
          <div 
            className={`flex sm:grid gap-3 overflow-x-auto sm:overflow-visible pb-2 sm:pb-0 -mx-4 px-4 sm:mx-0 sm:px-0 snap-x snap-mandatory sm:snap-none scrollbar-hide ${
              matchupAvailability.teamsPlaying.length === 2 
                ? 'sm:grid-cols-4' 
                : 'sm:grid-cols-2 lg:grid-cols-4'
            }`}
            style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
          >
            {/* All teams available */}
            <div 
              className="relative overflow-hidden rounded-xl p-3 border border-emerald-500/20 h-[200px] flex flex-col flex-shrink-0 w-[200px] sm:w-auto snap-start sm:snap-align-none"
              style={{
                background: 'linear-gradient(160deg, rgba(16, 185, 129, 0.12) 0%, rgba(0,0,0,0.2) 100%)'
              }}
            >
              {/* Watermark - logos always overlapping in center */}
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                {matchupAvailability.teamsPlaying[0] && (
                  <img 
                    src={tl(NFL_TEAMS[matchupAvailability.teamsPlaying[0]]?.logo)}
                    alt=""
                    className="absolute w-20 h-20 object-contain opacity-[0.06] -translate-x-6 -translate-y-6"
                  />
                )}
                {matchupAvailability.teamsPlaying[1] && (
                  <img 
                    src={tl(NFL_TEAMS[matchupAvailability.teamsPlaying[1]]?.logo)}
                    alt=""
                    className="absolute w-20 h-20 object-contain opacity-[0.06] translate-x-6 translate-y-6"
                  />
                )}
              </div>
              <div className="relative flex flex-col items-start gap-1 mb-2">
                <div className="flex -space-x-3 h-10 items-center">
                  {matchupAvailability.teamsPlaying.map(teamId => {
                    const team = NFL_TEAMS[teamId];
                    return team?.logo ? (
                      <img key={teamId} src={tl(team.logo)} alt="" className="w-10 h-10 object-contain bg-black/20 rounded-full p-1 drop-shadow-lg" />
                    ) : null;
                  })}
                </div>
                <span className="text-emerald-500 text-sm font-semibold">
                  Both Available ({matchupAvailability.groups.bothAvailable.length})
                </span>
              </div>
              <div className="relative flex-1 overflow-y-auto">
                {matchupAvailability.groups.bothAvailable.length > 0 ? (
                  <div className="flex flex-col gap-1 pr-1">
                    {matchupAvailability.groups.bothAvailable.map(member => (
                      <span 
                        key={member.id || member.userId}
                        className="inline-flex items-center gap-1.5 text-xs text-fg/80"
                      >
                        <Avatar userId={member.userId} name={member.displayName} imageUrl={member.profileImageUrl} size="xs" />
                        <span className="truncate">{member.displayName}</span>
                        {member.strikes > 0 && (
                          <span className="text-red-500 flex-shrink-0 text-[10px]">
                            {'✕'.repeat(member.strikes)}
                          </span>
                        )}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-fg/50 text-sm">No one</p>
                )}
              </div>
            </div>
            
            {/* One team only groups - show all teams playing */}
            {matchupAvailability.teamsPlaying.map(teamId => {
              const team = NFL_TEAMS[teamId];
              if (!team) return null;
              const members = matchupAvailability.groups.oneTeamOnly[teamId] || [];
              const teamColor = team.color || '#6B7280';
              
              return (
                <div 
                  key={teamId} 
                  className="relative overflow-hidden rounded-xl p-3 h-[200px] flex flex-col flex-shrink-0 w-[200px] sm:w-auto snap-start"
                  style={{ 
                    background: `linear-gradient(160deg, ${teamColor}20 0%, rgba(0,0,0,0.2) 100%)`,
                    borderColor: `${teamColor}30`,
                    borderWidth: '1px'
                  }}
                >
                  {/* Centered large logo watermark */}
                  <div 
                    className="absolute inset-0 flex items-center justify-center pointer-events-none"
                  >
                    <img
                      src={tl(team.logo)}
                      alt=""
                      className="w-28 h-28 object-contain opacity-[0.06]"
                    />
                  </div>
                  <div className="relative flex flex-col items-start gap-1 mb-2">
                    {team.logo && (
                      <img src={tl(team.logo)} alt={team.name} className="w-10 h-10 object-contain drop-shadow-lg" />
                    )}
                    <span className="text-sm font-semibold text-fg drop-shadow-sm">
                      {team.name} Only ({members.length})
                    </span>
                  </div>
                  <div className="relative flex-1 overflow-y-auto">
                    {members.length > 0 ? (
                      <div className="flex flex-col gap-1 pr-1">
                        {members.map(member => (
                          <span 
                            key={member.id || member.userId}
                            className="inline-flex items-center gap-1.5 text-xs text-fg/80"
                          >
                            <Avatar userId={member.userId} name={member.displayName} imageUrl={member.profileImageUrl} size="xs" />
                            <span className="truncate">{member.displayName}</span>
                            {member.strikes > 0 && (
                              <span className="text-red-500 flex-shrink-0 text-[10px]">
                                {'✕'.repeat(member.strikes)}
                              </span>
                            )}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <p className="text-fg/50 text-sm">No one</p>
                    )}
                  </div>
                </div>
              );
            })}
            
            {/* No options */}
            <div 
              className="relative overflow-hidden rounded-xl p-3 border border-red-500/20 h-[200px] flex flex-col flex-shrink-0 w-[200px] sm:w-auto snap-start"
              style={{
                background: 'linear-gradient(160deg, rgba(239, 68, 68, 0.12) 0%, rgba(0,0,0,0.2) 100%)'
              }}
            >
              {/* Watermark - X icon */}
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <X className="w-24 h-24 text-red-500 opacity-[0.06]" />
              </div>
              <div className="relative flex flex-col items-start gap-1 mb-2">
                <div className="w-10 h-10 rounded-full bg-black/10 flex items-center justify-center">
                  <AlertTriangle className="w-6 h-6 text-red-500" />
                </div>
                <span className="text-red-500 text-sm font-semibold">
                  No Options ({matchupAvailability.groups.noOptions.length})
                </span>
              </div>
              <div className="relative flex-1 overflow-y-auto">
                {matchupAvailability.groups.noOptions.length > 0 ? (
                  <div className="flex flex-col gap-1 pr-1">
                    {matchupAvailability.groups.noOptions.map(member => (
                      <span 
                        key={member.id || member.userId}
                        className="inline-flex items-center gap-1.5 text-xs text-fg/80"
                      >
                        <Avatar userId={member.userId} name={member.displayName} imageUrl={member.profileImageUrl} size="xs" />
                        <span className="truncate">{member.displayName}</span>
                        {member.strikes > 0 && (
                          <span className="text-red-500 flex-shrink-0 text-[10px]">
                            {'✕'.repeat(member.strikes)}
                          </span>
                        )}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-fg/50 text-sm">No one</p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Week Selector */}
      <div className="glass-card rounded-xl sm:rounded-2xl p-2 sm:p-4 mb-4 sm:mb-6 h-[60px] sm:h-[72px]" style={{ animationDelay: '50ms' }}>
        <div className="flex items-center justify-between h-full">
          <button
            onClick={() => handleWeekChange(Math.max(league.startWeek, selectedWeek - 1))}
            disabled={selectedWeek <= league.startWeek}
            className="p-2 sm:p-2 hover:bg-fg/10 rounded-lg transition-colors disabled:opacity-30 flex-shrink-0"
          >
            <ChevronLeft className="w-5 h-5 sm:w-6 sm:h-6 text-fg" />
          </button>

          <div className="flex items-center gap-2 sm:gap-4 overflow-x-auto py-1 sm:py-2 px-2 sm:px-4 scrollbar-hide">
            {weeks.map(week => {
              const weekLabel = getShortWeekLabel(week);
              const weekFullLabel = getWeekFullLabel(week);
              
              return (
                <button
                  key={week}
                  onClick={() => handleWeekChange(week)}
                  className={`px-3 sm:px-4 h-[32px] sm:h-[40px] rounded-lg sm:rounded-xl font-medium transition-all whitespace-nowrap text-sm sm:text-base flex-shrink-0 flex items-center justify-center ${
                    selectedWeek === week
                      ? 'bg-nfl-blue text-white shadow-lg'
                      : week === currentWeek
                      ? 'bg-fg/10 text-fg border border-emerald-500/50'
                      : 'bg-fg/5 text-fg/60 hover:bg-fg/10'
                  }`}
                  title={weekFullLabel}
                >
                  <span className="hidden sm:inline">{week <= 18 ? 'Week ' : ''}</span>{weekLabel}
                  {week === currentWeek && selectedWeek !== week && (
                    <span className="ml-1 text-xs text-emerald-500">●</span>
                  )}
                </button>
              );
            })}
          </div>

          <button
            onClick={() => handleWeekChange(Math.min(23, selectedWeek + 1))}
            disabled={selectedWeek >= 23}
            className="p-2 sm:p-2 hover:bg-fg/10 rounded-lg transition-colors disabled:opacity-30 flex-shrink-0"
          >
            <ChevronRight className="w-5 h-5 sm:w-6 sm:h-6 text-fg" />
          </button>
        </div>
      </div>

      {/* Your Pick Card - Prominent Game Display */}
      <div className="glass-card rounded-xl sm:rounded-2xl p-4 sm:p-6 mb-4 sm:mb-6 h-[180px] sm:h-[200px]">
        {(loadingStandings || loadedWeek !== selectedWeek) ? (
          // Loading state
          <div className="flex items-center justify-center h-full">
            <Loader2 className="w-8 h-8 text-fg/40 animate-spin" />
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
            
            const canMakePick = selectedWeek >= currentWeek && !isEliminated && !isMatchupsTBD && !seasonOver;
            
            return (
              <div className="flex flex-col items-center justify-center h-full">
                {isEliminated ? (
                  <>
                    <X className="w-10 h-10 text-red-500 mb-3" />
                    <p className="text-fg font-medium">Eliminated</p>
                    <p className="text-fg/50 text-sm mt-1">You're out of the competition</p>
                  </>
                ) : isMatchupsTBD ? (
                  <>
                    <Lock className="w-10 h-10 text-fg/30 mb-3" />
                    <p className="text-fg/50 font-medium">{getWeekLabel(selectedWeek)} matchups are TBD</p>
                    <p className="text-fg/40 text-sm mt-1">
                      {selectedWeek === 19 && 'Matchups set after Week 18'}
                      {selectedWeek === 20 && 'Matchups set after Wild Card'}
                      {selectedWeek === 21 && 'Matchups set after Divisional'}
                      {selectedWeek === 22 && 'Matchups set after Conference'}
                    </p>
                  </>
                ) : isPastWeek ? (
                  <>
                    <AlertCircle className="w-10 h-10 text-fg/30 mb-3" />
                    <p className="text-fg/50 font-medium">No pick made for {getWeekLabel(selectedWeek)}</p>
                  </>
                ) : (
                  <>
                    <AlertCircle className="w-10 h-10 text-yellow-400 mb-3" />
                    <p className="text-fg font-medium">No pick for {getWeekLabel(selectedWeek)}</p>
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
                <p className="text-fg/50">No pick data for {getWeekLabel(selectedWeek)}</p>
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
          const canEdit = allGamesScheduled && !isEffectivelyEliminated && !seasonOver;
          
          return (
            <>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-medium text-fg/60">Your {getWeekLabel(selectedWeek)} Pick{displayPicks.length > 1 ? 's' : ''}</h3>
                {canEdit && (
                  <Link
                    to={`/league/${leagueId}/pick?week=${selectedWeek}`}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-fg/10 hover:bg-fg/20 rounded-lg text-fg/80 text-sm font-medium transition-colors"
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
                    <div key={idx} className="bg-fg/5 rounded-xl p-4">
                      <div className="flex items-center gap-3">
                        {team?.logo && <img src={tl(team.logo)} alt={team.name} className="w-12 h-12" />}
                        <div>
                          <p className="text-fg font-semibold text-lg">{team?.city} {team?.name}</p>
                          <p className="text-fg/40 text-sm">Loading game info...</p>
                        </div>
                      </div>
                    </div>
                  );
                }
                
                if (gameStatus.noGame) {
                  // Team not playing this week (e.g., non-playoff team during playoffs)
                  return (
                    <div key={idx} className="bg-fg/5 rounded-xl p-4">
                      <div className="flex items-center gap-3">
                        {team?.logo && <img src={tl(team.logo)} alt={team.name} className="w-12 h-12 opacity-50" />}
                        <div>
                          <p className="text-fg/50 font-semibold text-lg">{team?.city} {team?.name}</p>
                          <p className="text-fg/40 text-sm">Not playing this week</p>
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
                  <div key={idx} className="rounded-xl overflow-hidden bg-gradient-to-r from-elevated via-canvas to-elevated border border-fg/10">
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
                          {team?.logo && <img src={tl(team.logo)} alt={team.name} className="w-14 h-14" />}
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
                              isWinning ? 'text-fg' : 'text-fg/50'
                            }`}>
                              {gameStatus.team.score}
                            </span>
                          ) : null}
                          <span className="text-fg font-semibold text-sm">{team?.abbreviation}</span>
                          {gameStatus.team.record && (
                            <span className="text-fg/40 text-xs">{gameStatus.team.record}</span>
                          )}
                        </div>
                        
                        {/* Winner arrow */}
                        {isFinal && isWinning && (
                          <ChevronLeft className="w-5 h-5 text-emerald-500 ml-auto" />
                        )}
                      </div>
                      
                      {/* Center - Status */}
                      <div className="flex-shrink-0 px-4 py-6 text-center min-w-[100px]">
                        {isScheduled && (
                          <div>
                            <p className="text-fg/60 text-xs">{formatGameTime()}</p>
                            {getCountdown() && (
                              <p className="text-emerald-500 text-lg font-bold mt-1">{getCountdown()}</p>
                            )}
                          </div>
                        )}
                        {isLive && (
                          <div>
                            <div className="flex items-center justify-center gap-1.5 text-red-500">
                              <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                              <span className="text-xs font-bold uppercase">{gameStatus.period}Q</span>
                            </div>
                            <p className="text-fg text-lg font-bold">{gameStatus.clock}</p>
                          </div>
                        )}
                        {isFinal && (
                          <div>
                            <p className="text-fg/50 text-sm font-medium">Final</p>
                            <p className={`text-xs font-bold mt-1 ${isWinning ? 'text-emerald-500' : 'text-red-500'}`}>
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
                              <ChevronRight className="w-5 h-5 text-fg/40 mr-auto" />
                            )}
                            
                            {/* Score & Info */}
                            <div className="flex flex-col items-end">
                              {(isLive || isFinal) ? (
                                <span className={`text-4xl font-bold ${
                                  oppWinning ? 'text-fg' : 'text-fg/50'
                                }`}>
                                  {gameStatus.opponent.score}
                                </span>
                              ) : null}
                              <span className="text-fg/70 font-semibold text-sm">{oppTeamData?.abbreviation || gameStatus.opponent.abbreviation}</span>
                              {gameStatus.opponent.record && (
                                <span className="text-fg/40 text-xs">{gameStatus.opponent.record}</span>
                              )}
                            </div>
                            
                            {/* Logo */}
                            <div className="flex-shrink-0">
                              {gameStatus.opponent.logo && (
                                <img src={tl(gameStatus.opponent.logo)} alt={oppTeamData?.name} className={`w-14 h-14 ${oppWinning ? '' : 'opacity-60'}`} />
                              )}
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                    
                    {/* Live game details - expandable section */}
                    {isLive && gameStatus.situation && (
                      <div className="px-4 pb-3 border-t border-fg/5">
                        <div className={`flex items-center justify-center gap-2 text-xs pt-2 ${
                          gameStatus.situation.isRedZone ? 'text-red-500' : 'text-fg/50'
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
        <div className="p-3 sm:p-4 border-b border-fg/10 flex items-center justify-between">
          <h2 className="font-display text-lg sm:text-xl font-semibold text-fg flex items-center gap-2">
            <Users className="w-4 h-4 sm:w-5 sm:h-5" />
            Standings
          </h2>
          <span className="text-fg/40 text-xs sm:text-sm">
            After {getWeekLabel(loadedWeek || selectedWeek)}{seasonOver && (loadedWeek || selectedWeek) >= currentWeek ? ' (Final)' : ''}
          </span>
        </div>

        {/* isLoadingWeek: true when standings data doesn't match the selected week yet */}
        {(() => {
          const isLoadingWeek = loadingStandings || loadedWeek !== selectedWeek;
          const prizePot = league.prizePotOverride || (league.entryFee * (league.members?.filter(m => m.hasPaid).length || 0));
          const winnerCount = seasonOver ? (league.members?.filter(m => m.status === 'active')?.length || 0) : 0;
          const perWinnerPrize = prizePot > 0 && winnerCount > 0 ? Math.floor(prizePot / winnerCount) : 0;
          return (<>
        {/* Mobile Card View */}
        <div className="sm:hidden divide-y divide-fg/5">
          {sortedStandings.map((member, index) => {
            const displayWeek = loadedWeek || selectedWeek;
            const weekData = member.picks?.[displayWeek];
            const weekPicks = weekData?.picks || [];
            const isDoublePick = (league.doublePickWeeks || []).includes(displayWeek);

            // For backward compatibility, if no picks array but has teamId, create one
            const displayPicks = weekPicks.length > 0
              ? weekPicks
              : (weekData?.teamId ? [{ teamId: weekData.teamId, result: weekData.result, visible: weekData.visible }] : []);

            // Calculate effective strikes through loaded week (matches the data)
            const effectiveStrikes = getEffectiveStrikes(member, displayWeek);
            const effectivelyEliminated = effectiveStrikes >= (league?.maxStrikes || 1);
            // Derive status entirely from strikes (DB member.status is cumulative and not week-scoped)
            const effectiveStatus = effectivelyEliminated ? 'eliminated' : 'active';
            // Show "Winner" only when viewing final week of a concluded season
            const isFinalView = seasonOver && displayWeek >= currentWeek;

            return (
              <div
                key={member.memberId}
                className={`p-3 ${member.isMe ? 'bg-nfl-blue/[0.04]' : ''} ${effectiveStatus === 'eliminated' ? 'opacity-50' : ''}`}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Avatar
                      userId={member.userId}
                      name={member.displayName}
                      imageUrl={member.profileImageUrl}
                      size="sm"
                      isOnline={(onlineUsers[leagueId] || []).some(u => u.userId === member.userId)}
                    />
                    <div>
                      <p className="text-fg font-medium text-sm flex items-center gap-1">
                        {member.displayName}
                        {member.isMe && <span className="text-xs text-nfl-blue">(You)</span>}
                        {member.userId === league?.commissionerId && <CommishBadge />}
                      </p>
                      <p className="text-fg/40 text-xs truncate max-w-[150px]">
                        {member.firstName && member.lastName
                          ? `${member.firstName} ${member.lastName}`
                          : member.email}
                      </p>
                    </div>
                  </div>
                  {isLoadingWeek ? (
                    <div className="shimmer h-5 w-14 rounded" />
                  ) : isFinalView && effectiveStatus === 'active' ? (
                    <span className="flex items-center gap-1" title="Winner">
                      <span className="text-sm">🏆</span>
                      {perWinnerPrize > 0 && <span className="text-sm font-medium text-green-500">${perWinnerPrize.toLocaleString()}</span>}
                    </span>
                  ) : (
                    <span className={`badge text-xs ${effectiveStatus === 'active' ? 'badge-active' : 'badge-eliminated'}`}>
                      {effectiveStatus}
                    </span>
                  )}
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {isLoadingWeek ? (
                      <>
                        <div className="shimmer h-2.5 w-16 rounded-full" />
                        <div className="shimmer h-5 w-24 rounded ml-2" />
                      </>
                    ) : (
                      <>
                        <div className="flex gap-1">
                          {Array.from({ length: league.maxStrikes }).map((_, i) => (
                            <div key={i} className={`w-2.5 h-2.5 rounded-full ${i < effectiveStrikes ? 'bg-red-500' : 'bg-fg/20'}`} />
                          ))}
                        </div>

                        {displayPicks.length > 0 ? (
                          <div className="flex items-center gap-2 ml-2">
                            {displayPicks.map((pick, idx) => {
                              if (pick.visible === false) {
                                return <EyeOff key={idx} className="w-4 h-4 text-fg/30" />;
                              }
                              const team = NFL_TEAMS[String(pick.teamId)];
                              const result = getPickResult(pick, pick.teamId);
                              return (
                                <div key={idx} className="flex items-center gap-1">
                                  {team?.logo ? (
                                    <img src={tl(team.logo)} alt={team.name} className="w-5 h-5 object-contain" />
                                  ) : (
                                    <div className="w-5 h-5 rounded flex items-center justify-center" style={{ backgroundColor: team?.color || '#666' }}>
                                      <span className="text-[8px] text-white font-bold">{team?.abbreviation}</span>
                                    </div>
                                  )}
                                  {!isDoublePick && <span className="text-fg/70 text-xs">{team?.name}</span>}
                                  {result && result !== 'pending' && (
                                    <span className={`text-xs font-bold ${result === 'win' ? 'text-green-500' : 'text-red-500'}`}>
                                      {result === 'win' ? 'W' : 'L'}
                                    </span>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        ) : selectedWeek <= currentWeek && selectedWeek >= league.startWeek ? (
                          effectiveStatus === 'eliminated'
                            ? <span className="text-fg/20 text-xs ml-2">—</span>
                            : <span className="text-fg/30 text-xs ml-2">No pick</span>
                        ) : null}
                      </>
                    )}
                  </div>
                  
                  {isCommissioner && (
                    <div className="flex items-center gap-1">
                      {league.entryFee > 0 && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleTogglePayment(member);
                          }}
                          disabled={togglingPayment === member.memberId}
                          className={`px-2 py-1 rounded text-xs font-medium transition-all ${
                            member.hasPaid
                              ? 'bg-green-500/20 text-green-500'
                              : 'bg-red-500/20 text-red-500 hover:bg-red-500/30'
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
                      )}
                      <button
                        onClick={() => setStrikeDialog({ member, action: null, week: selectedWeek })}
                        className="p-1.5 hover:bg-fg/10 rounded transition-colors"
                      >
                        <Edit3 className="w-4 h-4 text-fg/50" />
                      </button>
                    </div>
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
              <tr className="border-b border-fg/10">
                <th className="text-left px-4 py-3 text-fg/60 text-sm font-medium">Player</th>
                <th className="text-center px-4 py-3 text-fg/60 text-sm font-medium">Strikes</th>
                <th className="text-center px-4 py-3 text-fg/60 text-sm font-medium">Status</th>
                {isCommissioner && league.entryFee > 0 && (
                  <th className="text-center px-4 py-3 text-fg/60 text-sm font-medium">Paid</th>
                )}
                <th className="text-center px-4 py-3 text-fg/60 text-sm font-medium">
                  {getWeekLabel(selectedWeek)} Pick{(league.doublePickWeeks || []).includes(selectedWeek) ? 's' : ''}
                  {(league.doublePickWeeks || []).includes(selectedWeek) && (
                    <span className="text-orange-400 ml-1 text-xs">×2</span>
                  )}
                </th>
                {isCommissioner && (
                  <th className="text-center px-4 py-3 text-fg/60 text-sm font-medium">Edit</th>
                )}
              </tr>
            </thead>
            <tbody>
              {sortedStandings.map((member, index) => {
                const displayWeek = loadedWeek || selectedWeek;
                const weekData = member.picks?.[displayWeek];
                const weekPicks = weekData?.picks || [];
                const isDoublePick = (league.doublePickWeeks || []).includes(displayWeek);

                // For backward compatibility, if no picks array but has teamId, create one
                const displayPicks = weekPicks.length > 0
                  ? weekPicks
                  : (weekData?.teamId ? [{ teamId: weekData.teamId, result: weekData.result, visible: weekData.visible, gameStatus: weekData.gameStatus, game: weekData.game }] : []);

                // Calculate effective strikes through loaded week (matches the data)
                const effectiveStrikes = getEffectiveStrikes(member, displayWeek);
                const effectivelyEliminated = effectiveStrikes >= (league?.maxStrikes || 1);
                // Derive status entirely from strikes (DB member.status is cumulative and not week-scoped)
                const effectiveStatus = effectivelyEliminated ? 'eliminated' : 'active';
                // Show "Winner" only when viewing final week of a concluded season
                const isFinalView = seasonOver && displayWeek >= currentWeek;

                return (
                  <tr
                    key={member.memberId}
                    className={`border-b border-fg/5 transition-colors h-[85px] ${
                      member.isMe ? 'bg-nfl-blue/[0.04]' : 'hover:bg-fg/5'
                    } ${effectiveStatus === 'eliminated' ? 'opacity-50' : ''}`}
                  >
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-3">
                        <Avatar
                          userId={member.userId}
                          name={member.displayName}
                          imageUrl={member.profileImageUrl}
                          size="md"
                          isOnline={(onlineUsers[leagueId] || []).some(u => u.userId === member.userId)}
                        />
                        <div>
                          <p className="text-fg font-medium flex items-center gap-2">
                            {member.displayName}
                            {member.isMe && (
                              <span className="text-xs text-nfl-blue">(You)</span>
                            )}
                            {member.userId === league?.commissionerId && <CommishBadge />}
                          </p>
                          <p className="text-fg/40 text-xs">
                            {member.firstName && member.lastName
                              ? `${member.firstName} ${member.lastName}`
                              : member.email}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      {isLoadingWeek ? (
                        <div className="flex justify-center"><div className="shimmer h-3 w-20 rounded-full" /></div>
                      ) : (
                        <div className="flex items-center justify-center gap-1">
                          {Array.from({ length: league.maxStrikes }).map((_, i) => (
                            <div
                              key={i}
                              className={`w-3 h-3 rounded-full ${
                                i < effectiveStrikes
                                  ? 'bg-red-500'
                                  : 'bg-fg/20'
                              }`}
                            />
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-4 text-center">
                      {isLoadingWeek ? (
                        <div className="flex justify-center"><div className="shimmer h-5 w-16 rounded" /></div>
                      ) : isFinalView && effectiveStatus === 'active' ? (
                        <span className="inline-flex items-center gap-1" title="Winner">
                          <span className="text-base">🏆</span>
                          {perWinnerPrize > 0 && <span className="text-sm font-medium text-green-500">${perWinnerPrize.toLocaleString()}</span>}
                        </span>
                      ) : (
                        <span className={`badge ${effectiveStatus === 'active' ? 'badge-active' : 'badge-eliminated'}`}>
                          {effectiveStatus}
                        </span>
                      )}
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
                              ? 'bg-green-500/20 text-green-500'
                              : 'bg-red-500/20 text-red-500 hover:bg-red-500/30'
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
                        {isLoadingWeek ? (
                          <div className="flex flex-col items-center gap-1">
                            <div className="shimmer w-8 h-8 rounded-full" />
                            <div className="shimmer h-3 w-12 rounded" />
                          </div>
                        ) : displayPicks.length > 0 ? (
                          isDoublePick ? (
                            // Double pick layout: each team as a card with logo, name, W/L
                            <div className="flex items-center gap-4">
                              {displayPicks.map((pick, idx) => {
                                if (pick.visible === false) {
                                  return (
                                    <div key={idx} className="flex flex-col items-center">
                                      <EyeOff className="w-7 h-7 text-fg/40" />
                                      <span className="text-fg/40 text-xs mt-1">???</span>
                                    </div>
                                  );
                                }
                                const team = NFL_TEAMS[String(pick.teamId)];
                                const result = getPickResult(pick, pick.teamId);
                                return (
                                  <div key={idx} className="flex flex-col items-center">
                                    {team?.logo ? (
                                      <img src={tl(team.logo)} alt={team.name} className="w-8 h-8 object-contain" />
                                    ) : (
                                      <div 
                                        className="w-8 h-8 rounded-full flex items-center justify-center text-fg text-xs font-bold"
                                        style={{ backgroundColor: team?.color || '#666' }}
                                      >
                                        {team?.abbreviation}
                                      </div>
                                    )}
                                    <div className="flex items-center gap-1 mt-1">
                                      <span className="text-fg/70 text-xs">{team?.abbreviation}</span>
                                      {result && result !== 'pending' && (
                                        <span className={`text-xs font-bold ${
                                          result === 'win' ? 'text-green-500' : 'text-red-500'
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
                                      <EyeOff className="w-7 h-7 text-fg/40" />
                                      <span className="text-fg/40 text-xs mt-1">???</span>
                                    </div>
                                  );
                                }
                                const team = NFL_TEAMS[String(pick.teamId)];
                                const result = getPickResult(pick, pick.teamId);
                                return (
                                  <div key={idx} className="flex flex-col items-center">
                                    {team?.logo ? (
                                      <img src={tl(team.logo)} alt={team.name} className="w-8 h-8 object-contain" />
                                    ) : (
                                      <div 
                                        className="w-8 h-8 rounded-full flex items-center justify-center text-fg text-xs font-bold"
                                        style={{ backgroundColor: team?.color || '#666' }}
                                      >
                                        {team?.abbreviation}
                                      </div>
                                    )}
                                    <div className="flex items-center gap-1 mt-1">
                                      <span className="text-fg/70 text-xs">{team?.abbreviation}</span>
                                      {result && result !== 'pending' && (
                                        <span className={`text-xs font-bold ${
                                          result === 'win' ? 'text-green-500' : 'text-red-500'
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
                            ? <span className="text-fg/20 text-sm">—</span>
                            : <span className="text-fg/40 text-sm">No pick{isDoublePick ? 's' : ''}</span>
                        ) : (
                          <span className="text-fg/30 text-sm">—</span>
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
                            <CalendarCheck className="w-4 h-4 text-emerald-500/70 group-hover:text-emerald-500" />
                          </button>
                          <button
                            onClick={() => setStrikeDialog({ member, action: null, week: selectedWeek })}
                            disabled={modifyingStrike === member.memberId}
                            className="p-1.5 hover:bg-fg/10 rounded-lg transition-colors disabled:opacity-30 group"
                            title="Modify strikes"
                          >
                            <Pencil className="w-4 h-4 text-fg/50 group-hover:text-fg" />
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
        </>);
        })()}

        {standings.length === 0 && (
          <div className="p-12 text-center">
            <Users className="w-12 h-12 text-fg/20 mx-auto mb-4" />
            <p className="text-fg/60">No members yet</p>
          </div>
        )}
      </div>

      {/* My Picks History */}
      <div className="glass-card rounded-2xl mt-6 overflow-hidden" style={{ animationDelay: '200ms' }}>
        <div className="p-4 border-b border-fg/10">
          <h2 className="font-display text-xl font-semibold text-fg flex items-center gap-2">
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
            {(() => {
              // Compute the week the user was eliminated (strikes >= maxStrikes)
              const maxStrikes = league.maxStrikes || 1;
              let cumulativeStrikes = 0;
              let eliminatedAfterWeek = null;
              const lastWeek = seasonOver ? currentWeek : currentWeek - 1;
              for (let w = league.startWeek; w <= lastWeek; w++) {
                if (w === 22) continue; // Skip Pro Bowl
                const wPicks = getPicksForWeek(w);
                const isDP = (league.doublePickWeeks || []).includes(w);
                if (wPicks.length === 0) {
                  cumulativeStrikes += isDP ? 2 : 1;
                } else {
                  for (const p of wPicks) {
                    const r = getPickResult(p, p.teamId);
                    if (r === 'loss') cumulativeStrikes++;
                  }
                }
                if (cumulativeStrikes >= maxStrikes && eliminatedAfterWeek === null) {
                  eliminatedAfterWeek = w;
                }
              }
              return weeks.filter(week => week <= currentWeek + 1).map(week => {
              const isElimBeforeThisWeek = eliminatedAfterWeek !== null && week > eliminatedAfterWeek;
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
              
              let bgClass = 'bg-fg/5 border border-fg/10';
              const isPastWeek = week < currentWeek || (week === currentWeek && seasonOver);
              if (isElimBeforeThisWeek && weekPicks.length === 0 && isPastWeek) {
                // Already eliminated — gray/muted card
                bgClass = 'bg-fg/[0.02] border border-fg/5';
              } else if (weekPicks.length > 0) {
                if (hasLoss) {
                  bgClass = 'bg-red-500/20 border border-red-500/30';
                } else if (hasPending) {
                  bgClass = 'bg-yellow-500/20 border border-yellow-500/30';
                } else if (hasWin) {
                  bgClass = 'bg-green-500/20 border border-green-500/30';
                }
              } else if (week >= league.startWeek && isPastWeek) {
                // Missed pick while still active = strike
                bgClass = 'bg-red-500/20 border border-red-500/30';
              } else if (week < league.startWeek) {
                bgClass = 'bg-fg/[0.02] border border-fg/5';
              }
              
              return (
                <div
                  key={week}
                  className={`flex-shrink-0 flex flex-col items-center p-3 rounded-xl w-24 h-28 snap-start ${bgClass} ${isCurrent ? 'ring-2 ring-emerald-500' : ''}`}
                >
                  <span className="text-xs text-fg/50 mb-2 text-center whitespace-nowrap">
                    {getWeekFullLabel(week)}
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
                                  src={tl(team.logo)}
                                  alt={team.name}
                                  className="w-10 h-10 object-contain"
                                  title={team.name}
                                />
                              ) : (
                                <div 
                                  className="w-10 h-10 rounded-full flex items-center justify-center text-fg text-xs font-bold"
                                  style={{ backgroundColor: team?.color || '#666' }}
                                >
                                  {team?.abbreviation || pick.teamId}
                                </div>
                              )}
                              {/* Show individual W/L for double picks */}
                              {isDoublePick && result && result !== 'pending' && (
                                <span className={`text-xs font-bold ${
                                  result === 'win' ? 'text-green-500' : 'text-red-500'
                                }`}>
                                  {result === 'win' ? 'W' : 'L'}
                                </span>
                              )}
                            </div>
                          );
                        })}
                        {/* Show placeholder for missing second pick */}
                        {isDoublePick && weekPicks.length < 2 && (
                          <div className="w-10 h-10 rounded-full bg-fg/10 flex items-center justify-center text-fg/30 text-lg">
                            ?
                          </div>
                        )}
                      </div>
                      
                      {/* Result display - only for single picks or pending */}
                      {!isDoublePick && (
                        !hasPending ? (
                          <span className={`text-xs font-medium ${
                            hasLoss ? 'text-red-500' : 'text-green-500'
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
                    (week < currentWeek || (week === currentWeek && seasonOver)) ? (
                      isElimBeforeThisWeek ? (
                        // Already eliminated before this week — gray/muted
                        <>
                          <div className="w-10 h-10 rounded-full bg-fg/5 flex items-center justify-center">
                            <span className="text-fg/15 text-lg">—</span>
                          </div>
                          <span className="text-xs font-medium text-fg/20">OUT</span>
                        </>
                      ) : (
                        // Still active but missed — red
                        <>
                          <div className="flex items-center gap-1 mb-1">
                            <div className="w-10 h-10 rounded-full bg-red-500/20 flex items-center justify-center">
                              <X className="w-5 h-5 text-red-500" />
                            </div>
                            {isDoublePick && (
                              <div className="w-10 h-10 rounded-full bg-red-500/20 flex items-center justify-center">
                                <X className="w-5 h-5 text-red-500" />
                              </div>
                            )}
                          </div>
                          <span className="text-xs font-medium text-red-500">MISS</span>
                        </>
                      )
                    ) : (
                      <div className="flex items-center gap-1">
                        <div className="w-10 h-10 rounded-full bg-fg/10 flex items-center justify-center text-fg/30 text-lg">
                          ?
                        </div>
                        {isDoublePick && (
                          <div className="w-10 h-10 rounded-full bg-fg/10 flex items-center justify-center text-fg/30 text-lg">
                            ?
                          </div>
                        )}
                      </div>
                    )
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-fg/5 flex items-center justify-center text-fg/20">
                      —
                    </div>
                  )}
                </div>
              );
            });
            })()}
          </div>
        </div>
      </div>

      {/* Settings Modal */}
      {showSettings && (
        <div className="modal-overlay" onClick={() => setShowSettings(false)}>
          <div className="modal-content animate-in max-w-lg" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-semibold text-fg flex items-center gap-2">
                <Settings className="w-5 h-5" />
                League Settings
              </h2>
              <button
                onClick={() => setShowSettings(false)}
                className="p-2 hover:bg-fg/10 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-fg/60" />
              </button>
            </div>

            <div className="space-y-6">
              <div>
                <label className="block text-fg/80 text-sm font-medium mb-2">
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
                          : 'bg-fg/10 text-fg/60 hover:bg-fg/15'
                      }`}
                    >
                      {num}
                    </button>
                  ))}
                </div>
                <p className="text-fg/40 text-xs mt-2">
                  Players are eliminated after reaching this many strikes
                </p>
              </div>

              {/* Double Pick Weeks */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-fg/80 text-sm font-medium">
                    Double Pick Weeks
                  </label>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setSettings({ ...settings, doublePickWeeks: [] })}
                      className={`px-2 py-1 text-xs rounded-lg transition-all ${
                        settings.doublePickWeeks.length === 0
                          ? 'bg-nfl-blue text-white'
                          : 'bg-fg/10 text-fg/60 hover:bg-fg/15'
                      }`}
                    >
                      None
                    </button>
                    <button
                      onClick={() => setSettings({ 
                        ...settings, 
                        doublePickWeeks: Array.from({ length: 23 - league.startWeek + 1 }, (_, i) => league.startWeek + i).filter(w => w !== 22)
                      })}
                      className={`px-2 py-1 text-xs rounded-lg transition-all ${
                        settings.doublePickWeeks.length === Array.from({ length: 23 - league.startWeek + 1 }, (_, i) => league.startWeek + i).filter(w => w !== 22).length
                          ? 'bg-nfl-blue text-white'
                          : 'bg-fg/10 text-fg/60 hover:bg-fg/15'
                      }`}
                    >
                      All Weeks
                    </button>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {Array.from({ length: 23 - league.startWeek + 1 }, (_, i) => league.startWeek + i).filter(w => w !== 22).map(weekNum => (
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
                          ? 'bg-orange-500 text-fg'
                          : weekNum > 18
                          ? 'bg-purple-500/20 text-fg/60 hover:bg-purple-500/30'
                          : 'bg-fg/10 text-fg/60 hover:bg-fg/15'
                      } ${(settings.doublePickWeeks || []).includes(weekNum) ? '' : ''}`}
                    >
                      {weekNum}
                    </button>
                  ))}
                </div>
                <p className="text-fg/40 text-xs mt-2">
                  {settings.doublePickWeeks?.length > 0 
                    ? `Members must pick 2 teams in week${settings.doublePickWeeks.length > 1 ? 's' : ''} ${settings.doublePickWeeks.join(', ')}. Each loss = 1 strike.`
                    : 'Select weeks where members must pick 2 teams instead of 1'
                  }
                </p>
              </div>

              {/* Entry Fee */}
              <div>
                <label className="block text-fg/80 text-sm font-medium mb-2">
                  Entry Fee per Member
                </label>
                <div className="relative">
                  <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-fg/40" />
                  <input
                    type="number"
                    min="0"
                    step="5"
                    value={settings.entryFee || ''}
                    onChange={(e) => setSettings({ ...settings, entryFee: parseFloat(e.target.value) || 0 })}
                    placeholder="0"
                    className="w-full pl-10 pr-4 py-3 bg-fg/5 border border-fg/10 rounded-xl text-fg placeholder-fg/40 focus:outline-none focus:border-nfl-blue"
                  />
                </div>
                <p className="text-fg/40 text-xs mt-2">
                  Calculated pot: ${((settings.entryFee || 0) * (league.members?.length || 0)).toLocaleString()}
                </p>
              </div>

              {/* Manual Pot Override */}
              <div>
                <label className="block text-fg/80 text-sm font-medium mb-2">
                  Manual Prize Pot Override
                </label>
                <div className="relative">
                  <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-fg/40" />
                  <input
                    type="number"
                    min="0"
                    step="10"
                    value={settings.prizePotOverride || ''}
                    onChange={(e) => setSettings({ ...settings, prizePotOverride: e.target.value ? parseFloat(e.target.value) : null })}
                    placeholder="Leave empty to use calculated"
                    className="w-full pl-10 pr-4 py-3 bg-fg/5 border border-fg/10 rounded-xl text-fg placeholder-fg/40 focus:outline-none focus:border-nfl-blue"
                  />
                </div>
                <p className="text-fg/40 text-xs mt-2">
                  {settings.prizePotOverride 
                    ? `Using manual pot: $${settings.prizePotOverride.toLocaleString()}`
                    : 'Leave empty to calculate from entry fee × members'
                  }
                </p>
              </div>

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
              <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-fg/10">
                <Edit3 className="w-6 h-6 text-fg" />
              </div>
              <div>
                <h2 className="text-xl font-semibold text-fg">
                  Modify Strikes
                </h2>
                <p className="text-fg/60 text-sm">
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
                        : 'bg-fg/20'
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
                      : 'border-fg/10 hover:border-fg/30 disabled:opacity-30 disabled:hover:border-fg/10'
                  }`}
                >
                  <Minus className="w-6 h-6 text-green-500" />
                  <span className="text-sm font-medium text-fg">Remove Strike</span>
                </button>
                <button
                  onClick={() => setStrikeDialog({ ...strikeDialog, action: 'add' })}
                  disabled={strikeDialog.member.strikes >= league.maxStrikes}
                  className={`p-4 rounded-xl border-2 transition-all flex flex-col items-center gap-2 ${
                    strikeDialog.action === 'add'
                      ? 'border-red-500 bg-red-500/20'
                      : 'border-fg/10 hover:border-fg/30 disabled:opacity-30 disabled:hover:border-fg/10'
                  }`}
                >
                  <Plus className="w-6 h-6 text-red-500" />
                  <span className="text-sm font-medium text-fg">Add Strike</span>
                </button>
              </div>

              {strikeDialog.action && (
                <>
                  {/* Week Selector */}
                  <div>
                    <label className="block text-fg/80 text-sm font-medium mb-2">
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
                              : 'bg-fg/10 text-fg/60 hover:bg-fg/20'
                          }`}
                        >
                          {getShortWeekLabel(week)}
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
                    <label className="block text-fg/80 text-sm font-medium mb-2">
                      Reason (visible to all members)
                    </label>
                    <textarea
                      value={strikeReason}
                      onChange={(e) => setStrikeReason(e.target.value)}
                      placeholder="e.g., Missed pick deadline, Commissioner adjustment..."
                      className="w-full px-4 py-3 bg-fg/5 border border-fg/10 rounded-xl text-fg placeholder-fg/30 focus:outline-none focus:border-nfl-blue resize-none"
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
                      : 'bg-fg/10 text-fg/50'
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
                <CalendarCheck className="w-6 h-6 text-emerald-500" />
              </div>
              <div>
                <h2 className="text-xl font-semibold text-fg">
                  Set Pick{isDoublePick ? 's' : ''}
                </h2>
                <p className="text-fg/60 text-sm">
                  {pickDialog.member.displayName} • {getWeekLabel(pickDialog.week)}
                  {isDoublePick && <span className="text-orange-400 ml-2">(Double Pick Week)</span>}
                </p>
              </div>
            </div>

            <div className="space-y-4">
              {/* Week Selector */}
              <div>
                <label className="block text-fg/80 text-sm font-medium mb-2">
                  Select Week
                </label>
                <div className="flex flex-wrap gap-2">
                  {weeks.map(week => {
                    const weekIsDouble = (league.doublePickWeeks || []).includes(week);
                    const shortLabel = getShortWeekLabel(week);
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
                            : 'bg-fg/10 text-fg/60 hover:bg-fg/20'
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
              <div className="bg-fg/5 rounded-lg p-3">
                <span className="text-fg/50 text-xs">Current Pick{isDoublePick ? 's' : ''}:</span>
                {currentWeekPicks.length > 0 ? (
                  <div className="flex flex-wrap gap-2 mt-1">
                    {currentWeekPicks.map((pick, idx) => {
                      const team = NFL_TEAMS[String(pick.teamId)];
                      const result = getPickResult(pick, pick.teamId);
                      return (
                        <div key={idx} className="flex items-center gap-2 bg-fg/5 rounded-lg px-2 py-1">
                          {team?.logo && <img src={tl(team.logo)} alt={team.name} className="w-5 h-5" />}
                          <span className="text-fg text-sm">{team?.name || pick.teamId}</span>
                          {result && result !== 'pending' && (
                            <span className={`text-xs px-1.5 py-0.5 rounded ${
                              result === 'win' ? 'bg-green-500/20 text-green-500' : 'bg-red-500/20 text-red-500'
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
                          <img src={tl(NFL_TEAMS[String(currentPick.teamId)].logo)} alt="" className="w-5 h-5" />
                        )}
                        <span className="text-fg text-sm">{NFL_TEAMS[String(currentPick.teamId)]?.name}</span>
                        {result && result !== 'pending' && (
                          <span className={`text-xs px-1.5 py-0.5 rounded ${
                            result === 'win' ? 'bg-green-500/20 text-green-500' : 'bg-red-500/20 text-red-500'
                          }`}>
                            {result.toUpperCase()}
                          </span>
                        )}
                      </div>
                    );
                  })()
                ) : (
                  <p className="text-fg/40 text-sm mt-1">No pick for {getWeekLabel(pickDialog.week)}</p>
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
                          {team?.logo && <img src={tl(team.logo)} alt={team.name} className="w-5 h-5" />}
                          <span className="text-fg text-sm">{team?.name}</span>
                          <button
                            onClick={() => setSelectedTeamsForPick(prev => prev.filter(id => id !== teamId))}
                            className="text-fg/50 hover:text-red-500 ml-1"
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
                <label className="block text-fg/80 text-sm font-medium mb-2">
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
                            ? 'bg-fg/5 opacity-30 cursor-not-allowed'
                            : canSelect
                            ? 'bg-fg/5 hover:bg-fg/10'
                            : 'bg-fg/5 opacity-50'
                        }`}
                        title={isUsed ? `Already used by ${pickDialog.member.displayName}` : team.name}
                      >
                        {isSelected && (
                          <div className="absolute -top-1 -right-1 w-5 h-5 bg-emerald-600 rounded-full flex items-center justify-center text-[10px] text-white font-bold">
                            {selectionIndex + 1}
                          </div>
                        )}
                        <img
                          src={tl(team.logo)}
                          alt={team.name}
                          className="w-8 h-8 object-contain"
                        />
                        <span className={`text-[10px] font-medium ${isSelected ? 'text-fg' : 'text-fg/60'}`}>
                          {team.abbreviation}
                        </span>
                      </button>
                    );
                  })}
                </div>
                <p className="text-fg/40 text-xs mt-2">
                  {isDoublePick 
                    ? `Select 2 different teams. Grayed out teams have already been used.`
                    : `Grayed out teams have already been used by this player.`
                  }
                </p>
              </div>

              {/* Reason */}
              <div>
                <label className="block text-fg/80 text-sm font-medium mb-2">
                  Reason (visible to all members)
                </label>
                <textarea
                  value={pickReason}
                  onChange={(e) => setPickReason(e.target.value)}
                  placeholder="e.g., Player requested change, Missed deadline..."
                  className="w-full px-4 py-3 bg-fg/5 border border-fg/10 rounded-xl text-fg placeholder-fg/30 focus:outline-none focus:border-nfl-blue resize-none"
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
              <h2 className="text-xl font-semibold text-fg flex items-center gap-2">
                <History className="w-5 h-5" />
                Commissioner Actions
              </h2>
              <button
                onClick={() => setShowActionLog(false)}
                className="p-2 hover:bg-fg/10 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-fg/60" />
              </button>
            </div>

            <div className="space-y-3 max-h-[400px] overflow-y-auto">
              {actionLog.length === 0 ? (
                <div className="text-center py-8">
                  <History className="w-10 h-10 text-fg/20 mx-auto mb-3" />
                  <p className="text-fg/40">No commissioner actions yet</p>
                </div>
              ) : (
                actionLog.map((log, idx) => {
                  const team = log.teamId ? NFL_TEAMS[String(log.teamId)] : null;
                  
                  return (
                    <div key={log.id || idx} className="bg-fg/5 rounded-xl p-4">
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
                              <Plus className="w-4 h-4 text-red-500" />
                            ) : log.action === 'strike_removed' ? (
                              <Minus className="w-4 h-4 text-green-500" />
                            ) : log.action === 'settings_changed' ? (
                              <Settings className="w-4 h-4 text-purple-400" />
                            ) : (
                              <CalendarCheck className="w-4 h-4 text-emerald-500" />
                            )}
                          </div>
                          <div>
                            <p className="text-fg text-sm font-medium">
                              {log.action === 'strike_added' 
                                ? 'Strike Added' 
                                : log.action === 'strike_removed'
                                ? 'Strike Removed'
                                : log.action === 'settings_changed'
                                ? 'Settings Changed'
                                : 'Pick Set'}
                              {log.week && <span className="text-fg/50 font-normal"> • Week {log.week}</span>}
                            </p>
                            <p className="text-fg/50 text-xs flex items-center gap-1">
                              {log.action === 'settings_changed' ? (
                                <span>{log.reason}</span>
                              ) : (
                                <>
                                  {log.targetUser}
                                  {log.action === 'pick_set' && team && (
                                    <>
                                      <span>→</span>
                                      {team.logo && <img src={tl(team.logo)} alt={team.name} className="w-4 h-4 inline" />}
                                      <span>{team.name}</span>
                                    </>
                                  )}
                                </>
                              )}
                            </p>
                          </div>
                        </div>
                        <span className="text-fg/40 text-xs whitespace-nowrap">
                          {new Date(log.timestamp).toLocaleDateString()}
                        </span>
                      </div>
                      {log.reason && log.action !== 'settings_changed' && (
                        <p className="text-fg/60 text-sm mt-2 pl-10">
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