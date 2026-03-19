import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, X, ChevronDown, TrendingUp, Target, Users } from 'lucide-react';
import { scheduleAPI, trackingAPI } from '../../api';
import { useTheme } from '../../context/ThemeContext';
import { useThemedLogo, useThemedColor } from '../../utils/logo';
import useLiveScores from '../../hooks/useLiveScores';
import useAnimatedScore from '../../hooks/useAnimatedScore';
import { getSportModule } from '../../sports';
import { BROADCAST_NETWORKS } from '../../sports/nfl/constants';
import BoxScore from '../BoxScore';
import Gamecast from '../Gamecast';
import ShotChart from '../ShotChart';
import TeamInfoDialog from '../TeamInfoDialog';
import StatRankingDialog from '../StatRankingDialog';
import MatchupDetailDialog from './MatchupDetailDialog';

const SPORT = 'ncaab';

function getLocalDateStr(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function addDays(dateStr, days) {
  const d = new Date(dateStr + 'T12:00:00');
  d.setDate(d.getDate() + days);
  return getLocalDateStr(d);
}

function formatDateLabel(dateStr) {
  const today = getLocalDateStr();
  const yesterday = addDays(today, -1);
  const tomorrow = addDays(today, 1);
  if (dateStr === today) return 'Today';
  if (dateStr === yesterday) return 'Yesterday';
  if (dateStr === tomorrow) return 'Tomorrow';
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

const isGamePast = (game) => game.status === 'STATUS_FINAL' || game.status === 'final';

const isGameLive = (game) => {
  return (
    game.status === 'STATUS_IN_PROGRESS' ||
    game.status === 'STATUS_HALFTIME' ||
    game.status === 'STATUS_END_PERIOD' ||
    game.status === 'STATUS_FIRST_HALF' ||
    game.status === 'STATUS_SECOND_HALF' ||
    game.status === 'in_progress'
  );
};

const sortGames = (games) => {
  return [...games].sort((a, b) => {
    const aLive = isGameLive(a) ? 0 : 1;
    const bLive = isGameLive(b) ? 0 : 1;
    if (aLive !== bLive) return aLive - bLive;
    // Past games after upcoming
    const aPast = isGamePast(a) ? 1 : 0;
    const bPast = isGamePast(b) ? 1 : 0;
    if (aPast !== bPast) return aPast - bPast;
    return new Date(a.date) - new Date(b.date);
  });
};

// Strip "NCAA Men's Basketball Championship" prefix from notes, show just round info
const formatGameNotes = (notes) => {
  if (!notes) return null;
  // Remove common tournament name prefixes, keep the round/region info
  return notes
    .replace(/^NCAA\s+Men'?s?\s+Basketball\s+Champ(?:ionship)?s?\s*[-–—]\s*/i, '')
    .replace(/^March\s+Madness\s*[-–—]\s*/i, '')
    .trim() || null;
};

const getScore = (team) => {
  if (!team?.score && team?.score !== 0) return null;
  if (typeof team.score === 'object') return parseInt(team.score.displayValue || team.score.value || 0);
  return parseInt(team.score) || 0;
};

// Animated score display
const ScoreDisplay = ({ score, className }) => {
  const animating = useAnimatedScore(score);
  return (
    <span className={`${className} inline-block ${animating ? 'score-animate' : ''}`}>
      {score ?? 0}
    </span>
  );
};

// Rank badge for NCAAB
const TeamRankBadge = ({ team }) => {
  const r = Number(team?.ranking?.current);
  if (!Number.isFinite(r) || r <= 0 || r >= 99) return null;
  return <span className="text-sm font-medium text-fg/45">#{r}</span>;
};

const rankPrefix = (team) => {
  const r = Number(team?.ranking?.current);
  if (!Number.isFinite(r) || r <= 0 || r >= 99) return null;
  return <span className="text-fg/50 font-semibold">#{r} </span>;
};

// Broadcast icon
const BroadcastIcon = ({ broadcast }) => {
  const [imgError, setImgError] = useState(false);
  if (!broadcast) return null;
  const broadcastUpper = broadcast.toUpperCase();
  const sportModule = getSportModule(SPORT);
  const sportNetworks = sportModule?.broadcastNetworks || {};
  const allNetworks = { ...BROADCAST_NETWORKS, ...sportNetworks };
  let info = null;
  for (const [key, value] of Object.entries(allNetworks)) {
    if (broadcastUpper.includes(key.toUpperCase())) {
      info = { name: broadcast, ...value };
      break;
    }
  }
  if (!info) info = { name: broadcast, logo: null, color: 'text-fg/40' };
  if (info.logo && !imgError) {
    return <img src={info.logo} alt={info.name} title={info.name} className={`w-5 h-5 object-contain ${info.invert ? 'invert' : ''}`} onError={() => setImgError(true)} />;
  }
  return <span className={`text-[11px] leading-tight ${info.color}`}>{info.name}</span>;
};

// Season stats config for NCAAB
const SEASON_STATS_CONFIG = [
  { key: 'avgPoints', label: 'PPG' },
  { key: 'avgPointsAgainst', label: 'Opp PPG', source: 'details' },
  { key: 'fieldGoalPct', label: 'FG%' },
  { key: 'threePointFieldGoalPct', label: '3PT%' },
  { key: 'avgRebounds', label: 'RPG' },
  { key: 'avgAssists', label: 'APG' },
];

export default function TournamentGames({ tournamentData, season, leaderboard = [] }) {
  const { isDark } = useTheme();
  const tl = useThemedLogo();
  const tc = useThemedColor();
  const [selectedDate, setSelectedDate] = useState(getLocalDateStr);
  const [dailySchedule, setDailySchedule] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogGame, setDialogGame] = useState(null);
  const [gameDetails, setGameDetails] = useState({});
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [detailTab, setDetailTab] = useState('summary');
  const [teamInfoDialog, setTeamInfoDialog] = useState({ open: false, team: null });
  const [statRankingDialog, setStatRankingDialog] = useState(null);
  const [matchupDialog, setMatchupDialog] = useState(null); // { slot, team1, team2 }
  const [gameFilter, setGameFilter] = useState('all'); // 'all' | 'live' | 'scheduled' | 'final'
  const [pickBreakdownGame, setPickBreakdownGame] = useState(null); // game object for pick breakdown dialog

  // Build espnEventId → slotNumber mapping
  const eventToSlot = useMemo(() => {
    const map = {};
    if (!tournamentData?.slots) return map;
    for (const [slotNum, slotData] of Object.entries(tournamentData.slots)) {
      if (slotData?.espnEventId) {
        map[String(slotData.espnEventId)] = parseInt(slotNum);
      }
    }
    return map;
  }, [tournamentData]);

  // Build pick distribution for each slot, normalized to slot team IDs.
  // Picks may use stale team IDs (from before the field was finalized), so we
  // resolve each pick to the current slot team1/team2 by matching seeds.
  const pickDistribution = useMemo(() => {
    if (!leaderboard?.length || !tournamentData?.slots) return {};
    const teams = tournamentData.teams || {};
    const dist = {};
    for (const [slotNum, slotData] of Object.entries(tournamentData.slots)) {
      const slot = parseInt(slotNum);
      const team1Id = slotData.team1?.id ? String(slotData.team1.id) : null;
      const team2Id = slotData.team2?.id ? String(slotData.team2.id) : null;
      const team1Seed = slotData.team1?.seed;
      const team2Seed = slotData.team2?.seed;
      const team1Pickers = [];
      const team2Pickers = [];

      for (const entry of leaderboard) {
        const pick = entry.picks?.[slot] || entry.picks?.[String(slot)];
        if (!pick) continue;
        const pickStr = String(pick);
        const picker = { displayName: entry.displayName, bracketName: entry.bracketName };

        // Direct ID match
        if (pickStr === team1Id) {
          team1Pickers.push(picker);
        } else if (pickStr === team2Id) {
          team2Pickers.push(picker);
        } else {
          // Stale ID — resolve by matching the picked team's seed to slot team seeds
          const pickedTeam = teams[pickStr];
          if (pickedTeam?.seed && team1Seed && pickedTeam.seed === team1Seed) {
            team1Pickers.push(picker);
          } else if (pickedTeam?.seed && team2Seed && pickedTeam.seed === team2Seed) {
            team2Pickers.push(picker);
          } else {
            // Last resort: assign to team2 (lower seed / underdog)
            team2Pickers.push(picker);
          }
        }
      }

      if (team1Id || team2Id) {
        dist[slot] = {};
        if (team1Id) dist[slot][team1Id] = team1Pickers;
        if (team2Id) dist[slot][team2Id] = team2Pickers;
      }
    }
    return dist;
  }, [leaderboard, tournamentData]);

  // Helper: get pick distribution for a game, mapping slot teams to schedule away/home
  const getGamePickDist = useCallback((game) => {
    const slot = eventToSlot[String(game.id)];
    if (slot === undefined) return null;
    const dist = pickDistribution[slot];
    if (!dist) return null;

    const slotData = tournamentData?.slots?.[slot] || tournamentData?.slots?.[String(slot)];
    const slotTeam1Id = slotData?.team1?.id ? String(slotData.team1.id) : null;

    const team1Picks = (slotTeam1Id && dist[slotTeam1Id]) || [];
    const team2Picks = Object.entries(dist)
      .filter(([id]) => id !== slotTeam1Id)
      .flatMap(([, pickers]) => pickers);

    const total = team1Picks.length + team2Picks.length;
    if (total === 0) return null;

    // Map slot teams to schedule away/home by matching IDs or seeds
    const awayId = String(game.awayTeam?.id);
    const homeId = String(game.homeTeam?.id);
    const awayIsTeam1 = awayId === slotTeam1Id ||
      (slotData?.team1?.seed && game.awayTeam?.seed === slotData.team1.seed);
    const awayPicks = awayIsTeam1 ? team1Picks : team2Picks;
    const homePicks = awayIsTeam1 ? team2Picks : team1Picks;

    return {
      awayId, homeId,
      awayPicks, homePicks,
      awayPct: Math.round((awayPicks.length / total) * 100),
      homePct: Math.round((homePicks.length / total) * 100),
      total,
    };
  }, [eventToSlot, pickDistribution, tournamentData]);
  const [sheetOpen, setSheetOpen] = useState(false); // controls entry animation
  const [sheetClosing, setSheetClosing] = useState(false); // controls exit animation
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const scrollRef = useRef(null);

  // Track scroll position for arrow visibility
  const updateScrollArrows = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 0);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 2);
  }, []);

  // Bottom sheet drag state
  const sheetRef = useRef(null);
  const contentRef = useRef(null);
  const dragStartY = useRef(0);
  const dragStartTime = useRef(0);
  const dragOffsetY = useRef(0);
  const isDraggingSheet = useRef(false);
  const dragFromHandle = useRef(false);
  const [sheetTranslateY, setSheetTranslateY] = useState(0);
  const [sheetDragging, setSheetDragging] = useState(false);

  // Animated close — slide down then unmount
  const animateClose = useCallback(() => {
    setSheetClosing(true);
    setTimeout(() => {
      setDialogGame(null);
      setSheetOpen(false);
      setSheetClosing(false);
      setSheetTranslateY(0);
    }, 300);
  }, []);

  const closeDialog = useCallback(() => animateClose(), [animateClose]);

  // Sheet touch handlers — drag only from handle area (pill + header)
  const onHandleTouchStart = useCallback((e) => {
    const touch = e.touches[0];
    dragStartY.current = touch.clientY;
    dragStartTime.current = Date.now();
    dragOffsetY.current = 0;
    isDraggingSheet.current = false;
    dragFromHandle.current = true;
  }, []);

  const onHandleTouchMove = useCallback((e) => {
    if (!dragFromHandle.current) return;
    const touch = e.touches[0];
    const deltaY = touch.clientY - dragStartY.current;

    if (deltaY > 0) {
      isDraggingSheet.current = true;
      dragOffsetY.current = deltaY;
      setSheetTranslateY(deltaY);
      setSheetDragging(true);
      e.preventDefault();
    }
  }, []);

  const onHandleTouchEnd = useCallback(() => {
    if (!isDraggingSheet.current) {
      dragFromHandle.current = false;
      return;
    }
    isDraggingSheet.current = false;
    dragFromHandle.current = false;
    setSheetDragging(false);

    const delta = dragOffsetY.current;
    const elapsed = Date.now() - dragStartTime.current;
    const fastFlick = delta > 50 && elapsed < 300;

    if (delta > 100 || fastFlick) {
      // Dismiss
      setSheetTranslateY(window.innerHeight);
      setTimeout(() => {
        setDialogGame(null);
        setSheetOpen(false);
        setSheetClosing(false);
        setSheetTranslateY(0);
      }, 300);
    } else {
      // Snap back
      setSheetTranslateY(0);
    }
  }, []);

  // Lock body scroll + handle Escape key when dialog is open
  const backdropClickable = useRef(false);
  useEffect(() => {
    if (dialogGame) {
      document.body.style.overflow = 'hidden';
      backdropClickable.current = false;
      const handleKey = (e) => { if (e.key === 'Escape') animateClose(); };
      document.addEventListener('keydown', handleKey);
      // Trigger entry animation on next frame, enable backdrop click after animation
      requestAnimationFrame(() => {
        setSheetOpen(true);
        setTimeout(() => { backdropClickable.current = true; }, 350);
      });
      return () => { document.body.style.overflow = ''; document.removeEventListener('keydown', handleKey); };
    }
  }, [dialogGame, animateClose]);

  const onBackdropClick = useCallback(() => {
    if (backdropClickable.current) closeDialog();
  }, [closeDialog]);

  // Live scores
  const liveData = useLiveScores(SPORT, selectedDate, dailySchedule);
  const liveGames = liveData.games;

  // Fetch games for selected date
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const result = await scheduleAPI.getScheduleByDate(SPORT, selectedDate);
        if (!cancelled) setDailySchedule(result.games || []);
      } catch {
        if (!cancelled) setDailySchedule([]);
      }
      if (!cancelled) setLoading(false);
    };
    load();
    return () => { cancelled = true; };
  }, [selectedDate]);

  // Auto-refetch when scheduled games should go live
  useEffect(() => {
    if (!liveGames || liveGames.length === 0) return;
    const scheduledStatuses = new Set(['STATUS_SCHEDULED', 'pre', 'STATUS_POSTPONED']);
    const now = Date.now();
    let soonest = Infinity;
    let hasOverdue = false;

    for (const game of liveGames) {
      if (isGameLive(game) || isGamePast(game)) continue;
      const status = game.status || '';
      if (!scheduledStatuses.has(status) && status !== '') continue;
      const startTime = game.date ? new Date(game.date).getTime() : 0;
      if (startTime <= 0) continue;
      if (startTime <= now) hasOverdue = true;
      else if (startTime < soonest) soonest = startTime;
    }

    if (hasOverdue) {
      const interval = setInterval(async () => {
        try {
          const result = await scheduleAPI.getScheduleByDate(SPORT, selectedDate);
          if (result.games) setDailySchedule(result.games);
        } catch { /* ignore */ }
      }, 30000);
      return () => clearInterval(interval);
    }

    if (soonest < Infinity) {
      const delay = Math.max(0, soonest - Date.now());
      const timer = setTimeout(async () => {
        try {
          const result = await scheduleAPI.getScheduleByDate(SPORT, selectedDate);
          if (result.games) setDailySchedule(result.games);
        } catch { /* ignore */ }
      }, delay);
      return () => clearTimeout(timer);
    }
  }, [selectedDate, liveGames]);

  // Track recently finished games — keep in "Live" filter for 5 min grace period
  const RECENTLY_FINISHED_MS = 5 * 60 * 1000;
  const recentlyFinishedRef = useRef(new Map());
  const prevGameStatusesRef = useRef(new Map());
  const [, forceUpdate] = useState(0);

  useEffect(() => {
    if (!liveGames.length) return;
    const prevStatuses = prevGameStatusesRef.current;
    const finished = recentlyFinishedRef.current;
    const LIVE_STATUSES = new Set([
      'STATUS_IN_PROGRESS', 'STATUS_HALFTIME', 'STATUS_END_PERIOD',
      'STATUS_FIRST_HALF', 'STATUS_SECOND_HALF', 'in_progress'
    ]);
    for (const game of liveGames) {
      const isFinal = game.status === 'STATUS_FINAL' || game.status === 'final';
      const prevStatus = prevStatuses.get(game.id);
      if (isFinal && prevStatus && LIVE_STATUSES.has(prevStatus) && !finished.has(game.id)) {
        finished.set(game.id, Date.now());
      }
      prevStatuses.set(game.id, game.status);
    }
    const now = Date.now();
    for (const [id, ts] of finished) {
      if (now - ts > RECENTLY_FINISHED_MS) finished.delete(id);
    }
  }, [liveGames]);

  // Periodic cleanup of recently finished map
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      const finished = recentlyFinishedRef.current;
      let changed = false;
      for (const [id, ts] of finished) {
        if (now - ts > RECENTLY_FINISHED_MS) { finished.delete(id); changed = true; }
      }
      if (changed) forceUpdate(n => n + 1);
    }, 60000);
    return () => clearInterval(interval);
  }, []);

  // Enhanced live check that includes recently finished games
  const isGameLiveOrRecent = useCallback((game) => {
    if (isGameLive(game)) return true;
    const isFinal = game.status === 'STATUS_FINAL' || game.status === 'final';
    if (isFinal && recentlyFinishedRef.current.has(game.id)) {
      const finishedAt = recentlyFinishedRef.current.get(game.id);
      if (Date.now() - finishedAt < RECENTLY_FINISHED_MS) return true;
    }
    return false;
  }, []);

  const sorted = sortGames(liveGames);

  // Apply filter — Live tab includes recently finished games
  const filtered = sorted.filter(game => {
    if (gameFilter === 'all') return true;
    if (gameFilter === 'live') return isGameLiveOrRecent(game);
    if (gameFilter === 'final') return isGamePast(game) && !isGameLiveOrRecent(game);
    if (gameFilter === 'scheduled') return !isGameLive(game) && !isGamePast(game);
    return true;
  });

  // Update scroll arrows when filtered games change
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    requestAnimationFrame(updateScrollArrows);
    el.addEventListener('scroll', updateScrollArrows, { passive: true });
    const observer = new ResizeObserver(updateScrollArrows);
    observer.observe(el);
    return () => { el.removeEventListener('scroll', updateScrollArrows); observer.disconnect(); };
  }, [filtered.length, updateScrollArrows]);

  // Open game dialog + fetch details
  const openGameDialog = async (game) => {
    setDialogGame(game);
    setDetailTab('summary');
    const gameLive = isGameLive(game);
    const needsFetch = !gameDetails[game.id] || gameLive;
    if (needsFetch) {
      setDetailsLoading(true);
      try {
        const details = await scheduleAPI.getGameDetails(SPORT, game.id, { live: gameLive });
        setGameDetails(prev => ({ ...prev, [game.id]: details }));
      } catch { /* ignore */ }
      setDetailsLoading(false);
    }
  };

  // Poll for live game details when dialog is open and on gamecast/shotchart tab
  const gamecastPollRef = useRef(null);
  useEffect(() => {
    if (!dialogGame) return;
    const isLive = isGameLive(dialogGame);
    const needsPoll = isLive && (detailTab === 'gamecast' || detailTab === 'shotchart');
    if (!needsPoll) {
      if (gamecastPollRef.current) clearTimeout(gamecastPollRef.current);
      return;
    }

    let cancelled = false;
    const poll = async () => {
      if (cancelled) return;
      try {
        const details = await scheduleAPI.getGameDetails(SPORT, dialogGame.id, { live: true });
        if (!cancelled) {
          setGameDetails(prev => ({ ...prev, [dialogGame.id]: details }));
        }
      } catch { /* ignore */ }
      if (!cancelled) {
        // Random interval 6-11 seconds for live games
        const delay = 6000 + Math.random() * 5000;
        gamecastPollRef.current = setTimeout(poll, delay);
      }
    };

    // Start polling after initial delay
    gamecastPollRef.current = setTimeout(poll, 6000);

    return () => {
      cancelled = true;
      if (gamecastPollRef.current) clearTimeout(gamecastPollRef.current);
    };
  }, [dialogGame, detailTab]);

  const openTeamInfo = (team, e) => {
    e?.stopPropagation();
    if (team?.id) {
      setTeamInfoDialog({
        open: true,
        team: { id: team.id, name: team.displayName || team.name, abbreviation: team.abbreviation, logo: team.logo, color: team.color },
      });
    }
  };

  // Open matchup dialog for scheduled games (uses bracket slot data)
  const openMatchupForGame = (game) => {
    if (!tournamentData?.slots) return null;
    // Find bracket slot by matching ESPN event ID (game.id)
    const entry = Object.entries(tournamentData.slots).find(
      ([, slotData]) => slotData.espnEventId === game.id || String(slotData.espnEventId) === String(game.id)
    );
    if (!entry) return null;
    const [slotNum, slotData] = entry;
    const team1 = slotData.team1?.id ? tournamentData.teams?.[slotData.team1.id] || slotData.team1 : slotData.team1;
    const team2 = slotData.team2?.id ? tournamentData.teams?.[slotData.team2.id] || slotData.team2 : slotData.team2;
    setMatchupDialog({ slot: parseInt(slotNum), team1, team2 });
    return true;
  };

  const navigateDate = (dir) => {
    setSelectedDate(prev => addDays(prev, dir));
  };

  // ── Render a compact horizontal game card ──
  const renderMiniCard = (game) => {
    const isPast = isGamePast(game);
    const live = isGameLive(game);
    const gameDate = new Date(game.date);
    const timeStr = gameDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });

    return (
      <button
        key={game.id}
        onClick={() => {
          const isScheduled = !isGameLive(game) && !isGamePast(game);
          if (isScheduled && openMatchupForGame(game)) return;
          openGameDialog(game);
        }}
        className={`
          flex-shrink-0 glass-card rounded-xl p-3 sm:p-4 w-[220px] sm:w-[270px] cursor-pointer transition-all hover:bg-fg/5 text-left
          ${live ? 'ring-1 ring-red-500/30' : ''}
        `}
      >
        {formatGameNotes(game.notes) && (
          <div className="text-[11px] sm:text-sm text-fg/50 font-medium mb-1.5 truncate">{formatGameNotes(game.notes)}</div>
        )}
        <div className="space-y-2 sm:space-y-2.5">
          {/* Away Team */}
          <div className={`flex items-center gap-2 sm:gap-2.5 ${isPast && getScore(game.awayTeam) < getScore(game.homeTeam) ? 'opacity-50' : ''}`}>
            {game.awayTeam?.logo ? (
              <img src={tl(game.awayTeam.logo)} alt={game.awayTeam.abbreviation} className="w-6 h-6 sm:w-7 sm:h-7 object-contain flex-shrink-0" />
            ) : (
              <div className="w-6 h-6 sm:w-7 sm:h-7 rounded-full flex items-center justify-center text-white font-bold text-[9px] sm:text-[10px] flex-shrink-0" style={{ backgroundColor: game.awayTeam?.color || '#666' }}>
                {(game.awayTeam?.abbreviation || '?').slice(0, 3)}
              </div>
            )}
            <TeamRankBadge team={game.awayTeam} />
            <span className="text-fg font-medium text-sm sm:text-base truncate flex-1">
              {game.awayTeam?.abbreviation || game.awayTeam?.name || 'TBD'}
            </span>
            {(isPast || live) && (
              <ScoreDisplay
                score={getScore(game.awayTeam)}
                className={`font-bold text-sm sm:text-base ${isPast && getScore(game.awayTeam) < getScore(game.homeTeam) ? 'text-fg/40' : 'text-fg'}`}
              />
            )}
          </div>
          {/* Home Team */}
          <div className={`flex items-center gap-2 sm:gap-2.5 ${isPast && getScore(game.homeTeam) < getScore(game.awayTeam) ? 'opacity-50' : ''}`}>
            {game.homeTeam?.logo ? (
              <img src={tl(game.homeTeam.logo)} alt={game.homeTeam.abbreviation} className="w-6 h-6 sm:w-7 sm:h-7 object-contain flex-shrink-0" />
            ) : (
              <div className="w-6 h-6 sm:w-7 sm:h-7 rounded-full flex items-center justify-center text-white font-bold text-[9px] sm:text-[10px] flex-shrink-0" style={{ backgroundColor: game.homeTeam?.color || '#666' }}>
                {(game.homeTeam?.abbreviation || '?').slice(0, 3)}
              </div>
            )}
            <TeamRankBadge team={game.homeTeam} />
            <span className="text-fg font-medium text-sm sm:text-base truncate flex-1">
              {game.homeTeam?.abbreviation || game.homeTeam?.name || 'TBD'}
            </span>
            {(isPast || live) && (
              <ScoreDisplay
                score={getScore(game.homeTeam)}
                className={`font-bold text-sm sm:text-base ${isPast && getScore(game.homeTeam) < getScore(game.awayTeam) ? 'text-fg/40' : 'text-fg'}`}
              />
            )}
          </div>
        </div>
        {/* Status row */}
        <div className="mt-2 pt-2 border-t border-fg/10 flex items-center justify-between">
          {live ? (
            <span className="flex items-center gap-1.5 text-[11px] sm:text-xs font-bold text-white bg-red-600 px-2 py-0.5 rounded-full">
              <span className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" />
              {game.statusDetail || 'LIVE'}
            </span>
          ) : isPast ? (
            <span className="text-sm sm:text-base font-medium text-fg/50">Final</span>
          ) : (
            <span className="text-sm sm:text-base text-fg/60">{timeStr}</span>
          )}
          {!live && !isPast && game.broadcast && <BroadcastIcon broadcast={game.broadcast} />}
        </div>
        {/* Pick Distribution Bar */}
        {(() => {
          const dist = getGamePickDist(game);
          if (!dist) return null;
          const awayColor = tc(game.awayTeam);
          const homeColor = tc(game.homeTeam);
          return (
            <div
              className="mt-2 pt-2 border-t border-fg/10"
              onClick={(e) => {
                e.stopPropagation();
                setPickBreakdownGame(game);
              }}
            >
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-bold text-fg/60 w-8 text-right">{dist.awayPct}%</span>
                <div className="flex-1 h-2.5 rounded-full overflow-hidden flex bg-fg/10">
                  {dist.awayPct > 0 && (
                    <div
                      className="h-full transition-all duration-300"
                      style={{
                        width: `${dist.awayPct}%`,
                        backgroundColor: awayColor,
                        backgroundImage: 'repeating-linear-gradient(-45deg, transparent, transparent 3px, rgba(255,255,255,0.3) 3px, rgba(255,255,255,0.3) 5px)',
                        borderRadius: dist.homePct === 0 ? '9999px' : '9999px 0 0 9999px',
                      }}
                    />
                  )}
                  {dist.homePct > 0 && (
                    <div
                      className="h-full transition-all duration-300"
                      style={{
                        width: `${dist.homePct}%`,
                        backgroundColor: homeColor,
                        borderRadius: dist.awayPct === 0 ? '9999px' : '0 9999px 9999px 0',
                      }}
                    />
                  )}
                </div>
                <span className="text-sm font-bold text-fg/60 w-8">{dist.homePct}%</span>
              </div>
              <div className="flex justify-between mt-0.5">
                <span className="text-[11px] sm:text-sm text-fg/40">{dist.awayPicks.length} pick{dist.awayPicks.length !== 1 ? 's' : ''}</span>
                <span className="text-[11px] sm:text-sm text-fg/40">{dist.homePicks.length} pick{dist.homePicks.length !== 1 ? 's' : ''}</span>
              </div>
            </div>
          );
        })()}
      </button>
    );
  };

  // ── Render the full game card inside the dialog (reusing Schedule mobile layout) ──
  const renderDialogGameCard = (game) => {
    const isPast = isGamePast(game);
    const live = isGameLive(game);
    const gameDate = new Date(game.date);
    const dateStr = gameDate.toLocaleDateString('en-US', { weekday: 'short', month: 'numeric', day: 'numeric' });
    const timeStr = gameDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });

    return (
      <div>
        {formatGameNotes(game.notes) && (
          <div className="text-sm text-fg/50 font-medium mb-1.5 truncate">{formatGameNotes(game.notes)}</div>
        )}
        <div className="flex">
          {/* Teams Column */}
          <div className="flex-1 space-y-2">
            {/* Away Team */}
            <div className={`flex items-start gap-2.5 ${isPast && getScore(game.awayTeam) < getScore(game.homeTeam) ? 'opacity-50' : ''}`}>
              <button onClick={(e) => openTeamInfo(game.awayTeam, e)} className="hover:opacity-80 transition-opacity cursor-pointer">
                {game.awayTeam?.logo ? (
                  <img src={tl(game.awayTeam.logo)} alt={game.awayTeam.abbreviation} className="w-7 h-7 object-contain flex-shrink-0" />
                ) : (
                  <div className="w-7 h-7 rounded-full flex items-center justify-center text-white font-bold text-[10px] flex-shrink-0" style={{ backgroundColor: game.awayTeam?.color || '#666' }}>
                    {(game.awayTeam?.abbreviation || '?').slice(0, 3)}
                  </div>
                )}
              </button>
              {isPast || live ? (
                <>
                  <TeamRankBadge team={game.awayTeam} />
                  <button onClick={(e) => openTeamInfo(game.awayTeam, e)} className="hover:opacity-80 transition-opacity cursor-pointer text-left">
                    <span className="text-fg font-medium text-base hover:underline">
                      {game.awayTeam?.name || game.awayTeam?.abbreviation || 'TBD'}
                    </span>
                  </button>
                  <ScoreDisplay
                    score={getScore(game.awayTeam)}
                    className={`ml-auto font-bold text-base ${isPast && getScore(game.awayTeam) < getScore(game.homeTeam) ? 'text-fg/40' : 'text-fg'}`}
                  />
                </>
              ) : (
                <span className="flex-1 min-w-0 text-base leading-snug">
                  <span className="text-fg font-medium hover:underline hover:opacity-80 cursor-pointer" onClick={(e) => openTeamInfo(game.awayTeam, e)}>
                    {rankPrefix(game.awayTeam)}{game.awayTeam?.name || game.awayTeam?.abbreviation || 'TBD'}
                  </span>
                  {game.awayTeam?.record && <span className="text-sm text-fg/45 font-medium ml-1.5 whitespace-nowrap">{game.awayTeam.record}</span>}
                </span>
              )}
            </div>

            {/* Home Team */}
            <div className={`flex items-start gap-2.5 ${isPast && getScore(game.homeTeam) < getScore(game.awayTeam) ? 'opacity-50' : ''}`}>
              <button onClick={(e) => openTeamInfo(game.homeTeam, e)} className="hover:opacity-80 transition-opacity cursor-pointer">
                {game.homeTeam?.logo ? (
                  <img src={tl(game.homeTeam.logo)} alt={game.homeTeam.abbreviation} className="w-7 h-7 object-contain flex-shrink-0" />
                ) : (
                  <div className="w-7 h-7 rounded-full flex items-center justify-center text-white font-bold text-[10px] flex-shrink-0" style={{ backgroundColor: game.homeTeam?.color || '#666' }}>
                    {(game.homeTeam?.abbreviation || '?').slice(0, 3)}
                  </div>
                )}
              </button>
              {isPast || live ? (
                <>
                  <TeamRankBadge team={game.homeTeam} />
                  <button onClick={(e) => openTeamInfo(game.homeTeam, e)} className="hover:opacity-80 transition-opacity cursor-pointer text-left">
                    <span className="text-fg font-medium text-base hover:underline">
                      {game.homeTeam?.name || game.homeTeam?.abbreviation || 'TBD'}
                    </span>
                  </button>
                  <ScoreDisplay
                    score={getScore(game.homeTeam)}
                    className={`ml-auto font-bold text-base ${isPast && getScore(game.homeTeam) < getScore(game.awayTeam) ? 'text-fg/40' : 'text-fg'}`}
                  />
                </>
              ) : (
                <span className="flex-1 min-w-0 text-base leading-snug">
                  <span className="text-fg font-medium hover:underline hover:opacity-80 cursor-pointer" onClick={(e) => openTeamInfo(game.homeTeam, e)}>
                    {rankPrefix(game.homeTeam)}{game.homeTeam?.name || game.homeTeam?.abbreviation || 'TBD'}
                  </span>
                  {game.homeTeam?.record && <span className="text-sm text-fg/45 font-medium ml-1.5 whitespace-nowrap">{game.homeTeam.record}</span>}
                </span>
              )}
            </div>
          </div>

          {/* Game Info Column */}
          <div className="flex-shrink-0 pl-4 border-l border-fg/10 ml-4 flex flex-col justify-center items-end max-w-[90px]">
            {live ? (
              <div className="flex flex-col items-end gap-0.5">
                <span className="flex items-center justify-end gap-1.5 text-xs font-bold text-white bg-red-600 px-2 py-0.5 rounded-full">
                  <span className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" />
                  LIVE
                </span>
                {game.statusDetail && <span className="text-sm text-fg/50">{game.statusDetail}</span>}
                {liveData.isAutoUpdating && (
                  <span className="text-xs text-fg/40 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
                    Auto update
                  </span>
                )}
              </div>
            ) : isPast ? (
              <span className="text-sm font-medium text-fg/50">Final</span>
            ) : (
              <>
                <span className="text-sm text-fg/70 font-medium">{dateStr}</span>
                <span className="text-sm text-fg/50">{timeStr}</span>
                {game.broadcast && (
                  <span className="text-right leading-tight mt-0.5">
                    <BroadcastIcon broadcast={game.broadcast} />
                  </span>
                )}
              </>
            )}
          </div>
        </div>

        {/* Expanded Content */}
        <div className="mt-3 pt-3 border-t border-fg/10">
          {(isPast || live) ? renderCompletedDetails(game) : renderUpcomingDetails(game)}
        </div>
      </div>
    );
  };

  // ── Upcoming game details ──
  const renderUpcomingDetails = (game) => {
    const details = gameDetails[game.id];
    const odds = game.odds || details?.betting;

    return (
      <div className="space-y-4">
        {/* Betting Lines */}
        {odds && (() => {
          const hasSpread = !!odds.spread;
          const hasOU = !!odds.overUnder;
          const hasML = !!(odds.homeMoneyLine != null || odds.awayMoneyLine != null);
          const cellCount = [hasSpread, hasOU, hasML].filter(Boolean).length;
          if (cellCount === 0) return null;
          const gridClass = cellCount === 3 ? 'grid grid-cols-3 gap-2' : cellCount === 2 ? 'grid grid-cols-2 gap-2' : 'grid grid-cols-1 gap-2 max-w-xs';
          return (
            <div className="space-y-2">
              <h4 className="text-base font-semibold text-fg/50 uppercase tracking-wide flex items-center gap-1.5">
                <Target className="w-4 h-4" />
                Betting Lines
              </h4>
              <div className={gridClass}>
                {hasSpread && (
                  <div className="bg-fg/5 rounded-lg p-3 text-center">
                    <div className="text-sm text-fg/50">Spread</div>
                    <div className="text-base font-semibold text-fg">{odds.spread}</div>
                  </div>
                )}
                {hasOU && (
                  <div className="bg-fg/5 rounded-lg p-3 text-center">
                    <div className="text-sm text-fg/50">O/U</div>
                    <div className="text-base font-semibold text-fg">{odds.overUnder}</div>
                  </div>
                )}
                {hasML && (
                  <div className="bg-fg/5 rounded-lg p-3 text-center">
                    <div className="text-sm text-fg/50">Moneyline</div>
                    <div className="text-base font-semibold text-fg">
                      {game.awayTeam?.abbreviation} {odds.awayMoneyLine > 0 ? '+' : ''}{odds.awayMoneyLine}
                    </div>
                    <div className="text-base font-semibold text-fg">
                      {game.homeTeam?.abbreviation} {odds.homeMoneyLine > 0 ? '+' : ''}{odds.homeMoneyLine}
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })()}

        {/* Win Probability */}
        {details?.winProbability && (() => {
          const awayPct = Math.round(Number(details.winProbability.awayWinPct) || 50);
          const homePct = Math.round(Number(details.winProbability.homeWinPct) || 50);
          const awayColor = tc(game.awayTeam);
          const homeColor = tc(game.homeTeam);
          return (
            <div className="space-y-2">
              <h4 className="text-base font-semibold text-fg/50 uppercase tracking-wide flex items-center gap-1.5">
                <TrendingUp className="w-4 h-4" />
                Win Probability
              </h4>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="text-base font-medium text-fg">{game.awayTeam?.abbreviation}</span>
                  <span className="text-base font-bold text-fg">{awayPct}%</span>
                </div>
                <div className="flex-1 h-3 rounded-full overflow-hidden flex">
                  <div className="h-full transition-all duration-300" style={{
                    width: `${awayPct}%`, backgroundColor: awayColor,
                    backgroundImage: `repeating-linear-gradient(-45deg, transparent, transparent 3px, rgba(255,255,255,0.3) 3px, rgba(255,255,255,0.3) 5px)`
                  }} />
                  <div className="h-full transition-all duration-300" style={{ width: `${homePct}%`, backgroundColor: homeColor }} />
                </div>
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="text-base font-bold text-fg">{homePct}%</span>
                  <span className="text-base font-medium text-fg">{game.homeTeam?.abbreviation}</span>
                </div>
              </div>
            </div>
          );
        })()}

        {/* Team Season Stats */}
        {details?.seasonAverages && (() => {
          const getTeamStats = (team, side) => {
            const scoreboard = team?.seasonStats || {};
            const detailStats = details?.seasonAverages?.[side]?.stats || {};
            const streak = details?.seasonAverages?.[side]?.streak;
            const lastTen = details?.seasonAverages?.[side]?.lastTen;
            const stats = SEASON_STATS_CONFIG.map(({ key, label, source }) => {
              if (source === 'details') return { label, value: detailStats[key]?.displayValue || '-', statKey: key };
              const val = scoreboard[key]?.displayValue || detailStats[key]?.displayValue;
              return { label, value: val || '-', statKey: key };
            });
            return { stats, streak, lastTen };
          };
          const awayData = getTeamStats(game.awayTeam, 'away');
          const homeData = getTeamStats(game.homeTeam, 'home');
          const hasData = [...awayData.stats, ...homeData.stats].some(s => s.value !== '-');
          if (!hasData && !awayData.streak && !homeData.streak) return null;

          const TeamSeasonColumn = ({ team, data }) => (
            <div className="bg-fg/5 rounded-lg p-3">
              <div className="flex items-center gap-2 mb-2.5">
                {team?.logo && <img src={tl(team.logo)} alt="" className="w-6 h-6 object-contain" />}
                <span className="text-base font-semibold text-fg">{team?.abbreviation}</span>
              </div>
              <div className="space-y-1.5 text-base">
                {data.stats.map((stat, i) => (
                  <div
                    key={i}
                    className="flex justify-between items-center rounded px-1 -mx-1 cursor-pointer hover:bg-fg/10 transition-colors"
                    onClick={(e) => {
                      e.stopPropagation();
                      setStatRankingDialog({ statKey: stat.statKey, statLabel: stat.label, currentTeamIds: [game.homeTeam?.id, game.awayTeam?.id].filter(Boolean) });
                    }}
                  >
                    <span className="text-fg/50">{stat.label}</span>
                    <span className="text-fg font-medium">{stat.value}</span>
                  </div>
                ))}
                {data.streak && (
                  <div className="flex justify-between items-center pt-1 border-t border-fg/5">
                    <span className="text-fg/50">Streak</span>
                    <span className="text-fg font-medium">{data.streak}</span>
                  </div>
                )}
                {data.lastTen && (
                  <div className="flex justify-between items-center">
                    <span className="text-fg/50">Last 10</span>
                    <span className="text-fg font-medium">{data.lastTen}</span>
                  </div>
                )}
              </div>
            </div>
          );

          return (
            <div className="space-y-2">
              <h4 className="text-base font-semibold text-fg/50 uppercase tracking-wide">Season Stats</h4>
              <div className="grid grid-cols-2 gap-3">
                <TeamSeasonColumn team={game.awayTeam} data={awayData} />
                <TeamSeasonColumn team={game.homeTeam} data={homeData} />
              </div>
            </div>
          );
        })()}

        {!gameDetails[game.id] && detailsLoading && (
          <div className="flex justify-center py-4">
            <div className="w-5 h-5 border-2 border-fg/30 border-t-transparent rounded-full animate-spin" />
          </div>
        )}
      </div>
    );
  };

  // ── Completed/live game details ──
  const renderCompletedDetails = (game) => {
    const details = gameDetails[game.id];

    if (detailsLoading && !details) {
      return (
        <div className="flex justify-center py-4">
          <div className="w-5 h-5 border-2 border-fg/30 border-t-transparent rounded-full animate-spin" />
        </div>
      );
    }

    const hasLeaders = details?.leaders && details.leaders.length > 0;
    const hasPlayerStats = details?.playerStats?.teams?.length > 0;
    const hasTeamStats = details?.teamStats?.home || details?.teamStats?.away;
    const hasPlays = details?.plays && details.plays.length > 0;

    const leadersByTeam = {};
    if (hasLeaders) {
      details.leaders.forEach(leader => {
        const team = leader.player?.team || 'Unknown';
        if (!leadersByTeam[team]) leadersByTeam[team] = [];
        leadersByTeam[team].push(leader);
      });
    }

    const formatTeamStatValue = (value) => {
      if (!value || typeof value !== 'string') return value;
      const m = value.match(/^(\d+)\s*-\s*(\d+)$/);
      if (!m) return value;
      const made = parseInt(m[1], 10);
      const attempts = parseInt(m[2], 10);
      if (!Number.isFinite(made) || !Number.isFinite(attempts)) return value;
      const ratio = `${made}/${attempts}`;
      if (attempts <= 0) return ratio;
      return `${Math.round((made / attempts) * 100)}% (${ratio})`;
    };

    const renderTeamStatValue = (value, align = 'right') => {
      if (!value || typeof value !== 'string') return <>{value || '-'}</>;
      const m = value.match(/^(\d+)%\s+\((\d+\/\d+)\)$/);
      if (!m) return <>{value}</>;
      return (
        <span className={`inline-flex items-center gap-1 ${align === 'right' ? 'justify-end' : 'justify-start'}`}>
          <span className="text-fg">{m[1]}%</span>
          <span className="text-fg/55">({m[2]})</span>
        </span>
      );
    };

    const getStatLabels = () => ({
      fieldGoalsMade: 'Field Goals',
      threePointFieldGoalsMade: '3-Pointers',
      freeThrowsMade: 'Free Throws',
      totalRebounds: 'Rebounds',
      offensiveRebounds: 'Off. Rebounds',
      defensiveRebounds: 'Def. Rebounds',
      assists: 'Assists',
      steals: 'Steals',
      blocks: 'Blocks',
      turnovers: 'Turnovers',
      fouls: 'Fouls',
      technicalFouls: 'Technicals',
      flagrantFouls: 'Flagrant',
      largestLead: 'Largest Lead',
      fastBreakPoints: 'Fast Break Pts',
      pointsInPaint: 'Points in Paint',
      pointsOffTurnovers: 'Pts Off Turnovers',
    });

    return (
      <div className="space-y-4">
        {/* Detail tabs for basketball */}
        {hasPlays && (
          <div className="flex gap-1">
            {['summary', ...(hasPlayerStats ? ['boxscore'] : []), 'gamecast', 'shotchart'].map(tab => (
              <button
                key={tab}
                onClick={(e) => { e.stopPropagation(); setDetailTab(tab); }}
                className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                  detailTab === tab ? 'bg-fg/15 text-fg/90' : 'bg-fg/5 text-fg/40 hover:bg-fg/10 hover:text-fg/60'
                }`}
              >
                {tab === 'summary' ? 'Summary' : tab === 'boxscore' ? 'Box Score' : tab === 'gamecast' ? 'Gamecast' : 'Shot Chart'}
              </button>
            ))}
          </div>
        )}

        {/* Gamecast tab */}
        {detailTab === 'gamecast' && hasPlays && (
          <Gamecast
            plays={details.plays}
            game={game}
            courtType={SPORT}
            isPaused={game.status === 'STATUS_HALFTIME' || game.status === 'STATUS_END_PERIOD' || /timeout|time.?out/i.test(game.statusDetail || '')}
          />
        )}

        {/* Shot Chart tab */}
        {detailTab === 'shotchart' && hasPlays && (
          <ShotChart plays={details.plays} game={game} courtType={SPORT} />
        )}

        {/* Box Score tab */}
        {detailTab === 'boxscore' && hasPlayerStats && (
          <BoxScore playerStats={details.playerStats} game={game} alwaysExpanded />
        )}

        {/* Summary tab */}
        {(detailTab === 'summary' || !hasPlays) && <>
          {/* Top Performers */}
          {hasLeaders && (
            <div className="space-y-2">
              <h4 className="text-base font-semibold text-fg/70 uppercase tracking-wide flex items-center gap-1.5">
                <Users className="w-4 h-4" />
                Top Performers
              </h4>
              <div className="grid grid-cols-2 gap-4">
                {[game.awayTeam, game.homeTeam].map((team) => {
                  const teamLeaders = leadersByTeam[team?.abbreviation] || [];
                  if (teamLeaders.length === 0) return <div key={team?.abbreviation || 'unknown'} />;
                  return (
                    <div key={team?.abbreviation} className="space-y-2">
                      <div className="flex items-center gap-2 pb-1 border-b border-fg/10">
                        {team?.logo && <img src={tl(team.logo)} alt={team?.abbreviation} className="w-6 h-6" />}
                        <span className="text-base font-semibold text-fg">{team?.abbreviation}</span>
                      </div>
                      <div className="space-y-2">
                        {teamLeaders.map((leader, idx) => (
                          <div key={idx} className="flex items-center gap-2.5">
                            {leader.player?.headshot ? (
                              <img src={leader.player.headshot} alt={leader.player?.name} className="w-9 h-9 rounded-full object-cover flex-shrink-0" />
                            ) : (
                              <div className="w-9 h-9 rounded-full bg-fg/10 flex items-center justify-center text-fg/50 text-sm flex-shrink-0">
                                {leader.player?.position || '?'}
                              </div>
                            )}
                            <div className="flex-1 min-w-0">
                              <div className="text-base font-medium text-fg truncate">{leader.player?.name || 'Unknown'}</div>
                              <div className="text-sm text-fg/50">{leader.value}</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Scoring Summary */}
          {details?.scoringPlays?.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-base font-semibold text-fg/50 uppercase tracking-wide">Scoring Summary</h4>
              <div className="space-y-1.5 max-h-48 overflow-y-auto">
                {details.scoringPlays.map((play, idx) => (
                  <div key={idx} className="bg-fg/5 rounded-lg p-3 text-base">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-fg/50">{play.periodLabel || `H${play.quarter}`} {play.time}</span>
                      <span className="font-medium text-fg">
                        {game.awayTeam?.abbreviation} {play.awayScore} - {play.homeScore} {game.homeTeam?.abbreviation}
                      </span>
                    </div>
                    <div className="text-fg/70 flex items-center gap-1.5">
                      {play.teamLogo && <img src={play.teamLogo} alt="" className="w-5 h-5" />}
                      {play.team} - {play.description}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Team Stats */}
          {hasTeamStats && (
            <div className="space-y-2">
              <h4 className="text-base font-semibold text-fg/50 uppercase tracking-wide">Team Stats</h4>
              <div className="space-y-1.5">
                {Object.entries(getStatLabels()).map(([statKey, label]) => {
                  const awayStat = formatTeamStatValue(details.teamStats.away?.[statKey]);
                  const homeStat = formatTeamStatValue(details.teamStats.home?.[statKey]);
                  if (!awayStat && !homeStat) return null;
                  return (
                    <div key={statKey} className="flex items-center text-base">
                      <span className="w-24 text-right font-medium whitespace-nowrap">{renderTeamStatValue(awayStat, 'right')}</span>
                      <div className="flex-1 text-center text-fg/50 px-2">{label}</div>
                      <span className="w-24 text-left font-medium whitespace-nowrap">{renderTeamStatValue(homeStat, 'left')}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {!hasLeaders && !details?.scoringPlays?.length && !hasTeamStats && !hasPlayerStats && (
            <div className="text-center text-fg/40 text-base py-2">
              No additional details available for this game
            </div>
          )}
        </>}
      </div>
    );
  };

  const hasGames = sorted.length > 0;
  const liveCount = sorted.filter(g => isGameLiveOrRecent(g)).length;
  const finalCount = sorted.filter(g => isGamePast(g) && !isGameLiveOrRecent(g)).length;
  const scheduledCount = sorted.length - liveCount - finalCount;

  return (
    <div className="glass-card rounded-xl p-4 sm:p-5 mb-5 animate-in border border-fg/10" style={{ animationDelay: '25ms' }}>
      {/* Day Navigation */}
      <div className="flex items-center justify-between mb-3">
        <button onClick={() => navigateDate(-1)} className="p-1.5 rounded-lg hover:bg-fg/10 transition-colors">
          <ChevronLeft className="w-5 h-5 text-fg/60" />
        </button>
        <div className="text-center">
          <span className="text-sm font-semibold text-fg">{formatDateLabel(selectedDate)}</span>
          {selectedDate !== getLocalDateStr() && (
            <button
              onClick={() => setSelectedDate(getLocalDateStr())}
              className="ml-2 text-xs text-fg/40 hover:text-fg/60 transition-colors"
            >
              Today
            </button>
          )}
        </div>
        <button onClick={() => navigateDate(1)} className="p-1.5 rounded-lg hover:bg-fg/10 transition-colors">
          <ChevronRight className="w-5 h-5 text-fg/60" />
        </button>
      </div>

      {/* Filter tabs */}
      {hasGames && !loading && (
        <div className="flex gap-1.5 mb-3 overflow-x-auto scrollbar-hide">
          {[
            { key: 'all', label: 'All', count: sorted.length },
            ...(liveCount > 0 ? [{ key: 'live', label: 'Live', count: liveCount }] : []),
            ...(scheduledCount > 0 ? [{ key: 'scheduled', label: 'Scheduled', count: scheduledCount }] : []),
            ...(finalCount > 0 ? [{ key: 'final', label: 'Final', count: finalCount }] : []),
          ].map(tab => (
            <button
              key={tab.key}
              onClick={() => setGameFilter(tab.key)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-colors whitespace-nowrap ${
                gameFilter === tab.key
                  ? tab.key === 'live' ? 'bg-red-600 text-white' : 'bg-fg/15 text-fg'
                  : 'bg-fg/5 text-fg hover:bg-fg/10'
              }`}
            >
              {tab.key === 'live' && <span className={`w-1.5 h-1.5 rounded-full animate-pulse ${gameFilter === tab.key ? 'bg-white' : 'bg-red-500'}`} />}
              {tab.label}
              <span className="opacity-50">{tab.count}</span>
            </button>
          ))}
        </div>
      )}

      {/* Horizontal scroll of game cards */}
      {loading ? (
        <div className="flex justify-center py-6">
          <div className="w-5 h-5 border-2 border-fg/30 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : !hasGames ? (
        <div className="text-center text-fg/40 text-sm py-4">No games scheduled</div>
      ) : filtered.length === 0 ? (
        <div className="text-center text-fg/40 text-sm py-4">No {gameFilter} games</div>
      ) : (
        <div className="relative">
          {/* Desktop scroll arrows */}
          {canScrollLeft && (
            <button
              className="hidden sm:flex absolute -left-3 top-1/2 -translate-y-1/2 z-20 w-8 h-8 items-center justify-center rounded-full bg-canvas shadow-md border border-fg/10 hover:bg-fg/5 transition-colors"
              onClick={() => scrollRef.current?.scrollBy({ left: -260, behavior: 'smooth' })}
            >
              <ChevronLeft className="w-4 h-4 text-fg/60" />
            </button>
          )}
          <div ref={scrollRef} className="relative z-0 flex gap-3 overflow-x-auto pb-2 -mx-1 px-1 scrollbar-hide">
            {filtered.map(game => renderMiniCard(game))}
          </div>
          {canScrollRight && (
            <button
              className="hidden sm:flex absolute -right-3 top-1/2 -translate-y-1/2 z-20 w-8 h-8 items-center justify-center rounded-full bg-canvas shadow-md border border-fg/10 hover:bg-fg/5 transition-colors"
              onClick={() => scrollRef.current?.scrollBy({ left: 260, behavior: 'smooth' })}
            >
              <ChevronRight className="w-4 h-4 text-fg/60" />
            </button>
          )}
        </div>
      )}

      {/* Game Detail Dialog — portaled to body, bottom sheet on mobile */}
      {dialogGame && createPortal(
        <div
          className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center"
          style={{
            backgroundColor: `rgba(0,0,0,${Math.max(0, 0.5 - (sheetTranslateY / (typeof window !== 'undefined' ? window.innerHeight : 800)) * 0.5)})`,
            touchAction: 'none',
            opacity: sheetOpen && !sheetClosing ? 1 : 0,
            transition: sheetDragging ? 'none' : 'background-color 300ms ease-out, opacity 300ms ease-out',
            pointerEvents: sheetOpen && !sheetClosing ? 'auto' : 'none',
          }}
          onClick={onBackdropClick}
        >
          <div
            ref={sheetRef}
            className={`${isDark ? 'bg-gray-900' : 'bg-white'} rounded-t-2xl sm:rounded-2xl w-full sm:max-w-2xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl border border-fg/10`}
            style={{
              transform: sheetOpen && !sheetClosing
                ? `translateY(${sheetTranslateY}px)`
                : 'translateY(100%)',
              transition: sheetDragging ? 'none' : 'transform 300ms ease-out',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Drag Handle — mobile only, touch events for swipe-to-dismiss */}
            <div
              className="sm:hidden flex justify-center pt-2.5 pb-1 cursor-grab"
              onTouchStart={onHandleTouchStart}
              onTouchMove={onHandleTouchMove}
              onTouchEnd={onHandleTouchEnd}
            >
              <div className="w-10 h-1 rounded-full bg-fg/20" />
            </div>
            {/* Dialog Header — also draggable on mobile */}
            <div
              className="flex items-center justify-between px-4 py-2 sm:py-2.5 border-b border-fg/10 flex-shrink-0"
              onTouchStart={onHandleTouchStart}
              onTouchMove={onHandleTouchMove}
              onTouchEnd={onHandleTouchEnd}
            >
              <span className="text-base font-semibold text-fg">Game Details</span>
              <button onClick={closeDialog} className="p-1.5 rounded-lg hover:bg-fg/10 transition-colors">
                <X className="w-5 h-5 text-fg/60" />
              </button>
            </div>
            {/* Dialog Content */}
            <div ref={contentRef} className="p-4 overflow-y-auto flex-1 overscroll-contain">
              {renderDialogGameCard(dialogGame)}
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Team Info Dialog */}
      {teamInfoDialog.open && (
        <TeamInfoDialog
          team={teamInfoDialog.team}
          sport={SPORT}
          onClose={() => setTeamInfoDialog({ open: false, team: null })}
        />
      )}

      {/* Stat Ranking Dialog */}
      {statRankingDialog && (
        <StatRankingDialog
          sport={SPORT}
          statKey={statRankingDialog.statKey}
          statLabel={statRankingDialog.statLabel}
          currentTeamIds={statRankingDialog.currentTeamIds}
          onClose={() => setStatRankingDialog(null)}
        />
      )}

      {/* Matchup Detail Dialog — for scheduled games, portaled to body */}
      {matchupDialog && createPortal(
        <MatchupDetailDialog
          slot={matchupDialog.slot}
          team1Info={matchupDialog.team1}
          team2Info={matchupDialog.team2}
          season={season}
          onClose={() => setMatchupDialog(null)}
          isReadOnly
        />,
        document.body
      )}

      {/* Pick Breakdown Dialog — portaled to body */}
      {pickBreakdownGame && createPortal(
        <div
          className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center"
          style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
          onClick={() => setPickBreakdownGame(null)}
        >
          <div
            className={`${isDark ? 'bg-gray-900' : 'bg-white'} rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md max-h-[80vh] overflow-hidden flex flex-col shadow-2xl border border-fg/10`}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-fg/10 flex-shrink-0">
              <span className="text-base font-semibold text-fg">Pick Distribution</span>
              <button onClick={() => setPickBreakdownGame(null)} className="p-1.5 rounded-lg hover:bg-fg/10 transition-colors">
                <X className="w-5 h-5 text-fg/60" />
              </button>
            </div>
            {/* Content */}
            <div className="p-4 overflow-y-auto flex-1 overscroll-contain">
              {(() => {
                const game = pickBreakdownGame;
                const dist = getGamePickDist(game);
                if (!dist) return <div className="text-center text-fg/40 text-sm py-4">No picks data available</div>;

                const awayColor = tc(game.awayTeam);
                const homeColor = tc(game.homeTeam);

                return (
                  <div className="space-y-4">
                    {/* Bar */}
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <div className="flex items-center gap-1.5 min-w-0">
                          {game.awayTeam?.logo && <img src={tl(game.awayTeam.logo)} alt="" className="w-5 h-5 object-contain" />}
                          <span className="text-sm font-semibold text-fg">{game.awayTeam?.abbreviation}</span>
                        </div>
                        <span className="text-sm font-bold text-fg ml-auto">{dist.awayPct}%</span>
                      </div>
                      <div className="h-4 rounded-full overflow-hidden flex bg-fg/10 mb-1">
                        {dist.awayPct > 0 && (
                          <div
                            className="h-full transition-all duration-300"
                            style={{
                              width: `${dist.awayPct}%`,
                              backgroundColor: awayColor,
                              backgroundImage: 'repeating-linear-gradient(-45deg, transparent, transparent 3px, rgba(255,255,255,0.3) 3px, rgba(255,255,255,0.3) 5px)',
                              borderRadius: dist.homePct === 0 ? '9999px' : '9999px 0 0 9999px',
                            }}
                          />
                        )}
                        {dist.homePct > 0 && (
                          <div
                            className="h-full transition-all duration-300"
                            style={{
                              width: `${dist.homePct}%`,
                              backgroundColor: homeColor,
                              borderRadius: dist.awayPct === 0 ? '9999px' : '0 9999px 9999px 0',
                            }}
                          />
                        )}
                      </div>
                      <div className="flex items-center gap-2 justify-end">
                        <span className="text-sm font-bold text-fg">{dist.homePct}%</span>
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className="text-sm font-semibold text-fg">{game.homeTeam?.abbreviation}</span>
                          {game.homeTeam?.logo && <img src={tl(game.homeTeam.logo)} alt="" className="w-5 h-5 object-contain" />}
                        </div>
                      </div>
                    </div>

                    {/* Member breakdown */}
                    <div className="space-y-3">
                      {/* Away team picks */}
                      <div>
                        <div className="flex items-center gap-2 mb-2">
                          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: awayColor }} />
                          {game.awayTeam?.logo && <img src={tl(game.awayTeam.logo)} alt="" className="w-5 h-5 object-contain" />}
                          <span className="text-sm font-semibold text-fg">{game.awayTeam?.abbreviation || game.awayTeam?.name}</span>
                          <span className="text-sm text-fg/50 ml-auto">{dist.awayPicks.length} pick{dist.awayPicks.length !== 1 ? 's' : ''}</span>
                        </div>
                        {dist.awayPicks.length > 0 ? (
                          <div className="space-y-1 pl-5">
                            {dist.awayPicks.map((p, i) => (
                              <div key={i} className="flex items-center gap-2 py-1">
                                <Users className="w-3.5 h-3.5 text-fg/30" />
                                <span className="text-sm text-fg">{p.displayName}</span>
                                {p.bracketName && <span className="text-sm text-fg/40">({p.bracketName})</span>}
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="pl-5 text-sm text-fg/30">No picks</div>
                        )}
                      </div>

                      {/* Home team picks */}
                      <div>
                        <div className="flex items-center gap-2 mb-2">
                          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: homeColor }} />
                          {game.homeTeam?.logo && <img src={tl(game.homeTeam.logo)} alt="" className="w-5 h-5 object-contain" />}
                          <span className="text-sm font-semibold text-fg">{game.homeTeam?.abbreviation || game.homeTeam?.name}</span>
                          <span className="text-sm text-fg/50 ml-auto">{dist.homePicks.length} pick{dist.homePicks.length !== 1 ? 's' : ''}</span>
                        </div>
                        {dist.homePicks.length > 0 ? (
                          <div className="space-y-1 pl-5">
                            {dist.homePicks.map((p, i) => (
                              <div key={i} className="flex items-center gap-2 py-1">
                                <Users className="w-3.5 h-3.5 text-fg/30" />
                                <span className="text-sm text-fg">{p.displayName}</span>
                                {p.bracketName && <span className="text-sm text-fg/40">({p.bracketName})</span>}
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="pl-5 text-sm text-fg/30">No picks</div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
