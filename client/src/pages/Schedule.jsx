import { useState, useEffect, useRef, useCallback } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Calendar, ChevronLeft, ChevronRight, ChevronDown, ChevronUp, Trophy, TrendingUp, Users, Target, AlertTriangle, ArrowRight } from 'lucide-react';
import { nflAPI, scheduleAPI } from '../api';
import { getSportModule } from '../sports';
import { useAuth } from '../context/AuthContext';
import Loading from '../components/Loading';
import BrandLogo from '../components/BrandLogo';
import TeamInfoDialog from '../components/TeamInfoDialog';
import StatRankingDialog from '../components/StatRankingDialog';
import BoxScore from '../components/BoxScore';
import { PLAYOFF_ROUNDS, BROADCAST_NETWORKS } from '../sports/nfl/constants';
import { useThemedLogo, useThemedColor } from '../utils/logo';
import useLiveScores from '../hooks/useLiveScores';
import { useScoresSocket } from '../context/ScoresSocketContext';
import useAnimatedScore from '../hooks/useAnimatedScore';
import Gamecast from '../components/Gamecast';
import ShotChart from '../components/ShotChart';

/** Get today's date as YYYY-MM-DD in local timezone (not UTC) */
function getLocalDateStr(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

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
    { key: 'avg', label: 'AVG' },
    { key: 'runs', label: 'R' },
    { key: 'hits', label: 'H' },
    { key: 'ERA', label: 'ERA' },
    { key: 'saves', label: 'SV' },
    { key: 'wins', label: 'W' },
  ],
  nhl: [
    { key: 'avgGoals', label: 'GF/G', rankingsKey: 'goals' },
    { key: 'avgGoalsAgainst', label: 'GA/G' },
    { key: 'powerPlayPct', label: 'PP%', rankingsKey: 'powerPlayGoals' },
    { key: 'penaltyKillPct', label: 'PK%' },
    { key: 'savePct', label: 'SV%' },
    { key: 'avgShots', label: 'SOG/G', rankingsKey: 'shotsTotal' },
  ],
};

// Color-code rankings: green (top tier), amber (mid), red (bottom)
const getRankColor = (rankStr) => {
  if (!rankStr) return 'text-fg/50';
  const rank = parseInt(rankStr);
  if (isNaN(rank)) return 'text-fg/50';
  if (rank <= 10) return 'text-rank-good';
  if (rank <= 22) return 'text-rank-mid';
  return 'text-red-500';
};

const TeamRankBadge = ({ team }) => {
  const current = Number(team?.ranking?.current);
  // ESPN uses high sentinel ranks (commonly 99) for effectively unranked teams.
  if (!Number.isFinite(current) || current <= 0 || current >= 99) return null;
  const movement = team?.ranking?.movement;

  let movementText = '';
  let movementClass = 'text-fg/50';
  if (typeof movement === 'number') {
    if (movement > 0) {
      movementText = `▲${movement}`;
      movementClass = 'text-rank-good';
    } else if (movement < 0) {
      movementText = `▼${Math.abs(movement)}`;
      movementClass = 'text-red-500';
    }
    // No em dash for zero movement — just omit it
  }

  return (
    <span className="inline-flex items-center gap-1 text-sm font-medium text-fg/45">
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
  return <span className="font-medium text-fg/45">{label} #{rank}</span>;
};

export default function Schedule() {
  const { user } = useAuth();
  const tl = useThemedLogo();
  const tc = useThemedColor();
  const [searchParams, setSearchParams] = useSearchParams();
  const initialUrlParams = useRef({
    sport: searchParams.get('sport'),
    week: searchParams.get('week'),
    date: searchParams.get('date'),
  });
  const [selectedSport, setSelectedSport] = useState(() => {
    const urlSport = initialUrlParams.current.sport;
    return (urlSport && SPORT_TABS.some(s => s.id === urlSport)) ? urlSport : 'nfl';
  });
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
    const urlDate = initialUrlParams.current.date;
    if (urlDate && /^\d{4}-\d{2}-\d{2}$/.test(urlDate)) return urlDate;
    return getLocalDateStr(); // YYYY-MM-DD
  });
  const [dailySchedule, setDailySchedule] = useState([]);
  const [dailyLoading, setDailyLoading] = useState(false);
  const [leagueRanksByStat, setLeagueRanksByStat] = useState({});
  const [leagueRanksLoaded, setLeagueRanksLoaded] = useState(false);
  const [sportStatuses, setSportStatuses] = useState({});
  const [dailySportSeasons, setDailySportSeasons] = useState({});
  const [showDailySeasonDropdown, setShowDailySeasonDropdown] = useState(false);

  const [detailTab, setDetailTab] = useState('summary');
  const weekTabsRef = useRef(null);
  const weekButtonRefs = useRef({});
  const seasonDropdownRef = useRef(null);
  const dailySeasonDropdownRef = useRef(null);

  // Live score updates for daily sports (NBA, NCAAB, etc.)
  const selectedSportTab = SPORT_TABS.find(s => s.id === selectedSport);
  const liveScoresSportId = selectedSportTab?.scheduleType === 'daily' ? selectedSport : null;
  const liveData = useLiveScores(liveScoresSportId, selectedDate, dailySchedule);
  const liveGames = liveData.games;

  // Socket access for score-triggered early gamecast fetch
  const { socket: scoresSocket, connected: scoresConnected } = useScoresSocket();

  // Reset detail tab when expanded game changes
  useEffect(() => {
    setDetailTab('summary');
  }, [expandedGame]);

  /*
   * ── Gamecast Live Polling with Score-Triggered Early Fetch ──────────────
   *
   * Two systems work together to keep the gamecast up-to-date:
   *
   * 1. BASELINE POLLING (setInterval, 15s):
   *    Fetches full game details (play-by-play, box score, shot chart) every
   *    15 seconds. This catches all updates including ones the score poller
   *    doesn't detect (e.g. new plays that don't change the score).
   *
   * 2. SCORE-TRIGGERED EARLY FETCH (Socket.io listener):
   *    The live score poller pushes `score-update` events via Socket.io when
   *    it detects score/status/clock changes. When the client receives a
   *    score-update for the game currently open in gamecast, it:
   *      - Immediately fetches fresh game details (skipping if fetched <5s ago)
   *      - Resets the 15s baseline timer so the next poll is a full 15s away
   *
   *    This reduces the delay between a score change appearing on the game
   *    card and the corresponding play showing up in the gamecast feed.
   *
   * The two systems share a single intervalRef so the early fetch can reset
   * the baseline timer without creating duplicate intervals.
   *
   * Debug info (lastFetchTime, nextFetchTime, fetchTrigger) is tracked in
   * gamecastDebugRef and passed to the Gamecast component for display when
   * debug mode is enabled.
   */
  const expandedGameRef = useRef(expandedGame);
  expandedGameRef.current = expandedGame;
  const detailTabRef = useRef(detailTab);
  detailTabRef.current = detailTab;

  // Ref to hold the baseline polling interval so the socket listener can reset it
  const gamecastIntervalRef = useRef(null);
  // Timestamp of the last gamecast fetch — used to debounce early fetches (<5s apart)
  const lastGamecastFetchRef = useRef(0);
  // Ref for a pending delayed early fetch (when score changes within debounce window)
  const pendingEarlyFetchRef = useRef(null);
  // Debug state for the Gamecast timer overlay
  const [gamecastDebug, setGamecastDebug] = useState({
    lastFetchTime: null,    // when the last fetch completed (ms timestamp)
    nextFetchTime: null,    // when the next baseline fetch is scheduled (ms timestamp)
    fetchTrigger: null,     // 'timer' | 'score-update' — what triggered the last fetch
    socketEvents: [],       // recent socket score-update events with diffs (max 10)
    fetchEvents: [],        // recent gamecast fetch events with trigger type (max 10)
  });

  /*
   * ── Debug: Socket Event Logger ─────────────────────────────────────────
   * Listens for all score-update events on the socket and logs them with
   * human-readable diffs (e.g. "score 95→98", "clock 3:42→3:20").
   * Only tracks events for the currently expanded game.
   * Keeps the last 10 events to avoid unbounded memory growth.
   */
  const prevGameSnapshotRef = useRef(null); // snapshot of last known game state for diffing (debug logger)
  // Separate snapshot for the early fetch handler — must be independent from the debug
  // logger's snapshot so they don't interfere with each other's diff detection.
  const earlyFetchSnapshotRef = useRef(null);

  // Track recently finished games so they stay sorted with live games for a grace period.
  // Map<gameId, finishedTimestamp>. Games are kept here for RECENTLY_FINISHED_MS (5 min)
  // so the card doesn't jump position while the user is still watching final plays animate.
  const RECENTLY_FINISHED_MS = 5 * 60 * 1000;
  const recentlyFinishedRef = useRef(new Map());


  // When games transition to final, record them in recentlyFinishedRef.
  // Clean up entries older than RECENTLY_FINISHED_MS so the map doesn't grow forever.
  useEffect(() => {
    if (!liveGames.length) return;
    const finished = recentlyFinishedRef.current;
    for (const game of liveGames) {
      const isFinal = game.status === 'STATUS_FINAL' || game.status === 'final';
      if (isFinal && !finished.has(game.id)) {
        finished.set(game.id, Date.now());
      }
    }
    // Prune expired entries
    const now = Date.now();
    for (const [id, ts] of finished) {
      if (now - ts > RECENTLY_FINISHED_MS) finished.delete(id);
    }
  }, [liveGames]);

  // Periodic cleanup of recently finished map (every 60s)
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      const finished = recentlyFinishedRef.current;
      let changed = false;
      for (const [id, ts] of finished) {
        if (now - ts > RECENTLY_FINISHED_MS) {
          finished.delete(id);
          changed = true;
        }
      }
      // Force re-render so sorting updates when grace period expires
      if (changed) setLiveGames(prev => [...prev]);
    }, 60000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!scoresSocket || !scoresConnected || !expandedGame) return;

    const handleDebugScoreUpdate = (data) => {
      if (data.sport !== selectedSport) return;
      if (!data.games || data.games.length === 0) return;

      const updatedGame = data.games.find(g => g.id === expandedGame);
      if (!updatedGame) return;

      // Build a diff by comparing to the previous snapshot
      const prev = prevGameSnapshotRef.current;
      const changes = [];

      if (prev) {
        if (prev.homeScore !== updatedGame.homeTeam?.score) {
          changes.push(`${updatedGame.homeTeam?.abbreviation || 'Home'} score ${prev.homeScore ?? '?'}→${updatedGame.homeTeam?.score ?? '?'}`);
        }
        if (prev.awayScore !== updatedGame.awayTeam?.score) {
          changes.push(`${updatedGame.awayTeam?.abbreviation || 'Away'} score ${prev.awayScore ?? '?'}→${updatedGame.awayTeam?.score ?? '?'}`);
        }
        if (prev.clock !== (updatedGame.clock || updatedGame.statusDetail)) {
          changes.push(`clock ${prev.clock ?? '?'}→${updatedGame.clock || updatedGame.statusDetail || '?'}`);
        }
        if (prev.period !== updatedGame.period) {
          changes.push(`period ${prev.period ?? '?'}→${updatedGame.period ?? '?'}`);
        }
        if (prev.status !== updatedGame.status) {
          changes.push(`status ${prev.status ?? '?'}→${updatedGame.status ?? '?'}`);
        }
      } else {
        changes.push('initial snapshot');
      }

      // Save current state as the new snapshot for next diff
      prevGameSnapshotRef.current = {
        homeScore: updatedGame.homeTeam?.score,
        awayScore: updatedGame.awayTeam?.score,
        clock: updatedGame.clock || updatedGame.statusDetail,
        period: updatedGame.period,
        status: updatedGame.status,
      };


      // Only log if there are actual changes (skip if just initial snapshot with no diff)
      const event = {
        time: Date.now(),
        changes,
        gamesInPayload: data.games.length, // how many games were in this socket push
      };

      setGamecastDebug(prev => ({
        ...prev,
        socketEvents: [event, ...(prev.socketEvents || [])].slice(0, 10), // keep last 10
      }));
    };

    scoresSocket.on('score-update', handleDebugScoreUpdate);
    return () => scoresSocket.off('score-update', handleDebugScoreUpdate);
  }, [scoresSocket, scoresConnected, expandedGame, selectedSport]);

  // Reset debug socket events, snapshots, and lag data when expanded game changes
  useEffect(() => {
    prevGameSnapshotRef.current = null;
    earlyFetchSnapshotRef.current = null;
    setGamecastDebug(prev => ({ ...prev, socketEvents: [] }));
  }, [expandedGame]);

  const expandedGameStatus = liveGames.find(g => g.id === expandedGame)?.status;

  // Refetch game details when the expanded game's status changes (e.g. scheduled → live)
  // This ensures stale cached details (from when the game was scheduled) get replaced
  const prevExpandedStatusRef = useRef(null);
  useEffect(() => {
    if (!expandedGame || !expandedGameStatus) return;
    const prev = prevExpandedStatusRef.current;
    prevExpandedStatusRef.current = expandedGameStatus;
    // Skip the initial mount (prev is null) — only react to actual status transitions
    if (!prev || prev === expandedGameStatus) return;

    const sportTab = SPORT_TABS.find(s => s.id === selectedSport);
    const fetchFn = sportTab?.scheduleType === 'daily'
      ? () => scheduleAPI.getGameDetails(selectedSport, expandedGame, { live: isGameLive({ status: expandedGameStatus }) })
      : () => nflAPI.getGameDetails(expandedGame);

    fetchFn().then(data => {
      if (data) setGameDetails(prev => ({ ...prev, [expandedGame]: data }));
    }).catch(() => {});
  }, [expandedGame, expandedGameStatus, selectedSport]);

  useEffect(() => {
    if (!expandedGame) return;
    if (detailTab !== 'gamecast' && detailTab !== 'shotchart') return;

    const game = liveGames.find(g => g.id === expandedGame);
    if (!game) return;

    const isFinal = game.status === 'STATUS_FINAL' || game.status === 'final';
    const isLive =
      game.status === 'STATUS_IN_PROGRESS' ||
      game.status === 'STATUS_HALFTIME' ||
      game.status === 'STATUS_END_PERIOD' ||
      game.status === 'STATUS_FIRST_HALF' ||
      game.status === 'STATUS_SECOND_HALF' ||
      game.status === 'in_progress';

    // Game just went final — keep polling until we receive the "End of Game" play
    // (typeId 412 with game-ending text). ESPN's scoreboard goes final before the
    // play-by-play is fully updated, so we can't stop immediately. We poll until:
    //   1. The fetched plays contain an end-of-game marker (primary stop signal), OR
    //   2. The recently-finished grace period expires (fallback safety net)
    if (isFinal) {
      const FINAL_POLL_INTERVAL = 6000; // 6s between fetches
      let cancelled = false;

      const sportTab = SPORT_TABS.find(s => s.id === selectedSport);
      const fetchFn = sportTab?.scheduleType === 'daily'
        ? () => scheduleAPI.getGameDetails(selectedSport, expandedGame, { live: true })
        : () => nflAPI.getGameDetails(expandedGame);

      // Check if plays contain the end-of-game marker (typeId 412 with final-period text)
      const hasEndOfGamePlay = (plays) => {
        if (!plays || plays.length === 0) return false;
        const tail = plays.slice(-5);
        return tail.some(p => {
          const tid = String(p.typeId || p.type?.id || '');
          if (tid !== '412') return false;
          const text = (p.shortText || p.text || '').toLowerCase();
          // Match "end of game", "end of 4th quarter", "end of 2nd half", "overtime", etc.
          // but NOT mid-game markers like "end of 1st quarter" or "halftime"
          return text.includes('game') ||
            text.includes('4th') ||
            text.includes('2nd half') ||
            text.includes('overtime') ||
            text.includes('ot');
        });
      };

      const poll = () => {
        if (cancelled) return;

        // Fallback: stop if game is no longer in recently-finished grace period
        const finishedAt = recentlyFinishedRef.current.get(expandedGame);
        if (finishedAt && Date.now() - finishedAt > RECENTLY_FINISHED_MS) return;

        fetchFn().then(data => {
          if (cancelled) return;
          if (data) {
            setGameDetails(prev => ({ ...prev, [expandedGame]: data }));
            // Primary stop: we have the end-of-game play
            if (hasEndOfGamePlay(data.plays)) return;
          }
          if (!cancelled) {
            gamecastIntervalRef.current = setTimeout(poll, FINAL_POLL_INTERVAL);
          }
        }).catch(() => {
          if (!cancelled) {
            gamecastIntervalRef.current = setTimeout(poll, FINAL_POLL_INTERVAL);
          }
        });
      };

      poll();

      return () => {
        cancelled = true;
        if (gamecastIntervalRef.current) clearTimeout(gamecastIntervalRef.current);
        gamecastIntervalRef.current = null;
      };
    }

    if (!isLive) return;

    const BREAK_STATUSES = ['STATUS_HALFTIME', 'STATUS_END_PERIOD'];
    const onBreak = BREAK_STATUSES.includes(game.status);
    const POLL_MIN = onBreak ? 25000 : 6000;   // slower during halftime/breaks
    const POLL_MAX = onBreak ? 35000 : 11000;
    const DEBOUNCE_MS = 5000;    // minimum gap between early-triggered fetches
    // ESPN updates their scoreboard endpoint before their play-by-play endpoint.
    // Without this delay, a score-triggered fetch would often return stale play-by-play
    // data because we'd hit the endpoint before ESPN has propagated the update.
    // 5 seconds gives their play-by-play time to sync with the scoreboard.
    const SCORE_FETCH_DELAY = 5000;

    const sportTab = SPORT_TABS.find(s => s.id === selectedSport);
    const fetchFn = sportTab?.scheduleType === 'daily'
      ? () => scheduleAPI.getGameDetails(selectedSport, expandedGame, { live: true })
      : () => nflAPI.getGameDetails(expandedGame);

    /**
     * Fetch full game details and update state.
     * @param {'timer'|'score-update'} trigger — what caused this fetch (for debug display)
     */
    const fetchDetails = (trigger = 'timer') => {
      // Guard: only fetch if still on gamecast/shotchart for the same game
      if (expandedGameRef.current !== expandedGame) return;
      if (detailTabRef.current !== 'gamecast' && detailTabRef.current !== 'shotchart') return;

      lastGamecastFetchRef.current = Date.now();

      fetchFn().then(data => {
        if (data) {
          setGameDetails(prev => ({ ...prev, [expandedGame]: data }));
        }

        // Update debug info after fetch completes (preserve socketEvents & fetchEvents)
        const now = Date.now();
        const playCount = data?.plays?.length ?? 0;
        setGamecastDebug(prev => {
          const prevPlayCount = prev.lastPlayCount ?? playCount;
          const newPlays = Math.max(0, playCount - prevPlayCount);

          // Calculate how stale the first new play is (seconds between play wallclock and fetch time)
          let staleSec = null;
          if (newPlays > 0 && data?.plays?.length > 0) {
            const firstNewPlay = data.plays[prevPlayCount];
            if (firstNewPlay?.wallclock) {
              const playTime = new Date(firstNewPlay.wallclock).getTime();
              if (!isNaN(playTime)) {
                staleSec = Math.round((now - playTime) / 1000);
              }
            }
          }

          const nextTime = now + POLL_MIN + Math.floor(Math.random() * (POLL_MAX - POLL_MIN + 1));

          return {
            ...prev,
            lastFetchTime: now,
            nextFetchTime: nextTime,
            fetchTrigger: trigger,
            lastPlayCount: playCount,
            fetchEvents: [{ time: now, trigger, newPlays, staleSec }, ...(prev.fetchEvents || [])].slice(0, 10),
          };
        });
      }).catch(() => {});
    };

    /**
     * Start (or restart) the polling cycle with randomized 6–11s jitter.
     * Uses chained setTimeout instead of setInterval so each tick gets fresh jitter.
     */
    const startInterval = () => {
      if (gamecastIntervalRef.current) clearTimeout(gamecastIntervalRef.current);
      const scheduleNext = () => {
        const delay = POLL_MIN + Math.floor(Math.random() * (POLL_MAX - POLL_MIN + 1));
        gamecastIntervalRef.current = setTimeout(() => {
          fetchDetails('timer');
          scheduleNext();
        }, delay);
      };
      scheduleNext();
    };

    // Fetch immediately, then start the polling interval
    fetchDetails('timer');
    startInterval();

    /**
     * Socket listener: when a score-update arrives for the expanded game,
     * trigger an early gamecast fetch (with debounce) and reset the baseline timer.
     */
    const handleScoreUpdateForGamecast = (data) => {
      if (data.sport !== selectedSport) return;
      if (!data.games || data.games.length === 0) return;

      // Check if any of the updated games match the one we have expanded
      const currentExpandedGame = expandedGameRef.current;
      if (!currentExpandedGame) return;
      const currentDetailTab = detailTabRef.current;
      if (currentDetailTab !== 'gamecast' && currentDetailTab !== 'shotchart') return;

      const updatedGame = data.games.find(g => g.id === currentExpandedGame);
      if (!updatedGame) return;

      // Only trigger early fetch on meaningful changes (score, status, period).
      // Clock-only ticks happen every ~15s and would just duplicate the baseline poll.
      // Uses its own snapshot ref (earlyFetchSnapshotRef) separate from the debug
      // logger's snapshot, so the two listeners don't interfere with each other.
      const prevSnap = earlyFetchSnapshotRef.current;
      if (prevSnap) {
        const scoreChanged =
          prevSnap.homeScore !== updatedGame.homeTeam?.score ||
          prevSnap.awayScore !== updatedGame.awayTeam?.score;
        const statusChanged = prevSnap.status !== updatedGame.status;
        const periodChanged = prevSnap.period !== updatedGame.period;
        if (!scoreChanged && !statusChanged && !periodChanged) return;
      }

      // Update the early fetch snapshot so next event can diff against this one
      earlyFetchSnapshotRef.current = {
        homeScore: updatedGame.homeTeam?.score,
        awayScore: updatedGame.awayTeam?.score,
        status: updatedGame.status,
        period: updatedGame.period,
      };

      // Debounce: if we fetched less than 5s ago, schedule a delayed fetch instead
      // of dropping the event entirely. This handles the common case where a score
      // update arrives right after a timer fetch.
      const elapsed = Date.now() - lastGamecastFetchRef.current;
      if (elapsed < DEBOUNCE_MS) {
        // Clear any existing pending fetch to avoid duplicates
        if (pendingEarlyFetchRef.current) clearTimeout(pendingEarlyFetchRef.current);
        // Use whichever is longer: the remaining debounce time or the ESPN
        // play-by-play delay, so we always wait at least SCORE_FETCH_DELAY
        const delay = Math.max(DEBOUNCE_MS - elapsed, SCORE_FETCH_DELAY);
        const delaySeconds = (delay / 1000).toFixed(1);

        // Log the delayed fetch in the debug panel so the user can see it was queued
        setGamecastDebug(prev => ({
          ...prev,
          fetchEvents: [
            { time: Date.now(), trigger: 'score-update', delayed: delaySeconds },
            ...(prev.fetchEvents || []),
          ].slice(0, 10),
        }));

        pendingEarlyFetchRef.current = setTimeout(() => {
          pendingEarlyFetchRef.current = null;
          fetchDetails('score-update');
          startInterval();
        }, delay);
        return;
      }

      // Delay score-triggered fetch by 3s to let ESPN's play-by-play endpoint
      // catch up with the scoreboard. Without this delay, we'd often get stale
      // play-by-play data because ESPN updates the scoreboard before the play-by-play.
      if (pendingEarlyFetchRef.current) clearTimeout(pendingEarlyFetchRef.current);
      pendingEarlyFetchRef.current = setTimeout(() => {
        pendingEarlyFetchRef.current = null;
        fetchDetails('score-update');
        startInterval(); // restart polling countdown from the fetch
      }, SCORE_FETCH_DELAY);
    };

    // Attach the socket listener if connected
    if (scoresSocket && scoresConnected) {
      scoresSocket.on('score-update', handleScoreUpdateForGamecast);
    }

    return () => {
      if (gamecastIntervalRef.current) clearTimeout(gamecastIntervalRef.current);
      gamecastIntervalRef.current = null;
      if (pendingEarlyFetchRef.current) clearTimeout(pendingEarlyFetchRef.current);
      pendingEarlyFetchRef.current = null;
      if (scoresSocket) {
        scoresSocket.off('score-update', handleScoreUpdateForGamecast);
      }
    };
  }, [expandedGame, expandedGameStatus, detailTab, selectedSport, scoresSocket, scoresConnected]); // eslint-disable-line react-hooks/exhaustive-deps

  // Sync selected sport/week/date → URL query params
  useEffect(() => {
    const params = new URLSearchParams();
    params.set('sport', selectedSport);
    const sportTab = SPORT_TABS.find(s => s.id === selectedSport);
    if (sportTab?.scheduleType === 'weekly') {
      params.set('week', String(selectedWeek));
    } else {
      params.set('date', selectedDate);
    }
    setSearchParams(params, { replace: true });
  }, [selectedSport, selectedWeek, selectedDate, setSearchParams]);

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
      onChange(getLocalDateStr(d));
    };

    const isToday = date === getLocalDateStr();

    return (
      <div className="flex items-center gap-2 mb-4 sm:mb-6">
        <button onClick={() => changeDate(-1)} className="p-2 bg-fg/5 hover:bg-fg/10 rounded-lg transition-colors flex-shrink-0">
          <ChevronLeft className="w-5 h-5 text-fg" />
        </button>
        <div className="flex-1 text-center">
          <span className="text-fg font-medium text-sm sm:text-base">{formatted}</span>
        </div>
        <button onClick={() => changeDate(1)} className="p-2 bg-fg/5 hover:bg-fg/10 rounded-lg transition-colors flex-shrink-0">
          <ChevronRight className="w-5 h-5 text-fg" />
        </button>
        {!isToday && (
          <button
            onClick={() => onChange(getLocalDateStr())}
            className="px-3 py-2 bg-fg/10 hover:bg-fg/15 rounded-lg transition-colors text-fg text-sm font-medium flex-shrink-0"
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

  // Daily sport season helpers
  const SPLIT_YEAR_SPORTS = ['nba', 'nhl', 'ncaab'];

  const formatSeasonYear = (sport, seasonYear) => {
    if (!seasonYear) return '';
    if (SPLIT_YEAR_SPORTS.includes(sport)) return `${seasonYear - 1}-${String(seasonYear).slice(2)}`;
    return String(seasonYear);
  };

  const getSeasonTypeLabel = (seasonType) => {
    if (seasonType === 1) return 'Preseason';
    if (seasonType === 3) return 'Postseason';
    return 'Regular Season';
  };

  const getDailySeasonOptions = (sport) => {
    const cur = dailySportSeasons[sport]?.season || new Date().getFullYear();
    return Array.from({ length: 6 }, (_, i) => cur - i);
  };

  const getDefaultDateForSeason = (sport, seasonYear) => {
    if (SPLIT_YEAR_SPORTS.includes(sport)) return `${seasonYear - 1}-11-01`;
    return `${seasonYear}-04-01`;
  };

  const handleDailySeasonChange = (newSeasonYear) => {
    const originalSeasonYear = dailySportSeasons[selectedSport]?.season;
    setDailySportSeasons(prev => ({
      ...prev,
      [selectedSport]: { ...prev[selectedSport], season: newSeasonYear, seasonType: 2 },
    }));
    setShowDailySeasonDropdown(false);
    if (newSeasonYear === originalSeasonYear) {
      setSelectedDate(getLocalDateStr());
    } else {
      setSelectedDate(getDefaultDateForSeason(selectedSport, newSeasonYear));
    }
  };

  useEffect(() => {
    let cancelled = false;

    const loadInitial = async () => {
      try {
        // Fetch NFL season + all sport statuses in parallel
        const [nflResult, ...dailyResults] = await Promise.allSettled([
          nflAPI.getSeason(),
          scheduleAPI.getSeason('nba'),
          scheduleAPI.getSeason('mlb'),
          scheduleAPI.getSeason('nhl'),
          scheduleAPI.getSeason('ncaab'),
        ]);

        if (cancelled) return;

        // Compute sport season statuses for tab indicators
        const statuses = {};
        const dailySports = ['nba', 'mlb', 'nhl', 'ncaab'];

        if (nflResult.status === 'fulfilled') {
          const nfl = nflResult.value;
          if (nfl.displayName === 'Offseason' || nfl.isSeasonOver) {
            // off-season — no indicator
          } else if (nfl.seasonType === 1) {
            statuses.nfl = 'preseason';
          } else {
            statuses.nfl = 'active';
          }
        }
        const seasonData = {};
        dailySports.forEach((sport, i) => {
          if (dailyResults[i].status === 'fulfilled') {
            const result = dailyResults[i].value;
            const st = result.seasonType;
            if (st === 2 || st === 3) statuses[sport] = 'active';
            else if (st === 1) statuses[sport] = 'preseason';
            seasonData[sport] = { season: result.season, seasonType: st };
          }
        });
        setSportStatuses(statuses);
        setDailySportSeasons(seasonData);

        // Auto-select first in-season sport if no URL param was provided
        let activeSport = selectedSport;
        if (!initialUrlParams.current.sport) {
          const firstActive = SPORT_TABS.find(s => statuses[s.id] === 'active');
          if (firstActive && firstActive.id !== selectedSport) {
            activeSport = firstActive.id;
            setSelectedSport(firstActive.id);
          }
        }

        // Process NFL season data
        const result = nflResult.status === 'fulfilled' ? nflResult.value : null;
        if (result?.season) {
          const year = result.season;
          const week = result.week;
          const seasonType = result.seasonType || 2;

          setSeason(year);
          setCurrentYear(year);
          setCurrentWeek(week);
          setCurrentSeasonType(seasonType);
          setSelectedSeasonType(seasonType);

          // Use URL week param on first load if valid, otherwise use current week
          const urlWeek = initialUrlParams.current.week;
          let targetWeek = week;
          if (urlWeek) {
            const w = parseInt(urlWeek);
            if (w >= 1 && w <= 18) targetWeek = w;
            initialUrlParams.current.week = null;
          }
          setSelectedWeek(targetWeek);

          // Only load NFL schedule if NFL is the active sport
          if (activeSport === 'nfl') {
            if (seasonType === 2) {
              await loadSchedule(targetWeek, year, 2);
              setTimeout(() => {
                const key = `2-${targetWeek}`;
                const button = weekButtonRefs.current[key];
                if (button && weekTabsRef.current) {
                  button.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
                }
              }, 100);
            } else if (seasonType === 3) {
              await loadAllPlayoffRounds(year);
            }
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

    loadInitial();

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
      if (dailySeasonDropdownRef.current && !dailySeasonDropdownRef.current.contains(event.target)) {
        setShowDailySeasonDropdown(false);
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

  // Auto-refetch when a scheduled game's start time passes (transition to live)
  useEffect(() => {
    const sportTab = SPORT_TABS.find(s => s.id === selectedSport);
    if (!sportTab || sportTab.scheduleType !== 'daily') return;
    if (!liveGames || liveGames.length === 0) return;

    // Find games that haven't started yet
    const scheduledStatuses = new Set(['STATUS_SCHEDULED', 'pre', 'STATUS_POSTPONED']);
    const getNextCheckTime = () => {
      const now = Date.now();
      let soonest = Infinity;
      let hasOverdue = false;

      for (const game of liveGames) {
        // Skip games that are already live or final
        if (isGameLive(game) || isGamePast(game)) continue;
        // Only care about scheduled games
        const status = game.status || '';
        if (!scheduledStatuses.has(status) && status !== '') continue;

        const startTime = game.date ? new Date(game.date).getTime() : 0;
        if (startTime <= 0) continue;

        if (startTime <= now) {
          // Game should have started but status hasn't updated
          hasOverdue = true;
        } else if (startTime < soonest) {
          soonest = startTime;
        }
      }

      return { hasOverdue, soonest };
    };

    const { hasOverdue, soonest } = getNextCheckTime();

    // If a game is overdue (start time passed, still scheduled), poll every 30s
    if (hasOverdue) {
      const interval = setInterval(async () => {
        try {
          const result = await scheduleAPI.getScheduleByDate(selectedSport, selectedDate);
          if (result.games) setDailySchedule(result.games);
        } catch { /* ignore */ }
      }, 30000);
      return () => clearInterval(interval);
    }

    // If a game is starting soon, set a timeout to start checking at start time
    if (soonest < Infinity) {
      const delay = Math.max(0, soonest - Date.now());
      const timer = setTimeout(async () => {
        try {
          const result = await scheduleAPI.getScheduleByDate(selectedSport, selectedDate);
          if (result.games) setDailySchedule(result.games);
        } catch { /* ignore */ }
      }, delay);
      return () => clearTimeout(timer);
    }
  }, [selectedSport, selectedDate, liveGames]);

  // Preload league-wide rankings for season-average stat labels shown on cards.
  useEffect(() => {
    let cancelled = false;

    const loadLeagueRanks = async () => {
      setLeagueRanksLoaded(false);
      const config = SEASON_STATS_CONFIG[selectedSport] || SEASON_STATS_CONFIG.nfl;
      let statKeys = [...new Set(config.map((s) => s.rankingsKey || s.key).filter(Boolean))];
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
    setShowDailySeasonDropdown(false);
    // Reset date to today for daily sports
    const sportTab = SPORT_TABS.find(s => s.id === sportId);
    if (sportTab?.scheduleType === 'daily') {
      setSelectedDate(getLocalDateStr());
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

    // Fetch details if we don't have them, or refetch if game is live (details may be stale)
    const liveGame = game || liveGames.find(g => g.id === gameId);
    const gameLive = liveGame && isGameLive(liveGame);
    const needsFetch = !gameDetails[gameId] || gameLive;
    if (needsFetch) {
      if (!gameDetails[gameId]) setDetailsLoading(true);
      try {
        const sportTab = SPORT_TABS.find(s => s.id === selectedSport);
        const details = sportTab?.scheduleType === 'daily'
          ? await scheduleAPI.getGameDetails(selectedSport, gameId, { live: gameLive })
          : await nflAPI.getGameDetails(gameId);
        setGameDetails(prev => ({ ...prev, [gameId]: details }));
      } catch (error) {
        console.error('Failed to load game details:', error);
        if (!gameDetails[gameId]) setGameDetails(prev => ({ ...prev, [gameId]: {} }));
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
    if (
      game.status === 'STATUS_IN_PROGRESS' ||
      game.status === 'STATUS_HALFTIME' ||
      game.status === 'STATUS_END_PERIOD' ||
      game.status === 'STATUS_FIRST_HALF' ||
      game.status === 'STATUS_SECOND_HALF' ||
      game.status === 'in_progress'
    ) return true;

    // Recently finished games stay sorted with live games for a 5-minute grace period
    // so the card doesn't jump away while the user is still watching final plays
    const isFinal = game.status === 'STATUS_FINAL' || game.status === 'final';
    if (isFinal && recentlyFinishedRef.current.has(game.id)) {
      const finishedAt = recentlyFinishedRef.current.get(game.id);
      if (Date.now() - finishedAt < RECENTLY_FINISHED_MS) return true;
    }

    return false;
  };

  // Sort: live games first, then by start time ascending
  const sortGames = (games) => {
    return [...games].sort((a, b) => {
      const aLive = isGameLive(a) ? 0 : 1;
      const bLive = isGameLive(b) ? 0 : 1;
      if (aLive !== bLive) return aLive - bLive;
      return new Date(a.date) - new Date(b.date);
    });
  };

  const getStatusDisplay = (game) => {
    if (isGameLive(game)) {
      return (
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1.5 text-xs font-bold text-white bg-red-600 px-2.5 py-1 rounded-full">
            <span className="w-2 h-2 bg-white rounded-full animate-pulse" />
            {game.statusDetail || 'LIVE'}
          </span>
          {liveData.isAutoUpdating && (
            <span className="flex items-center gap-1 text-xs text-fg/40">
              <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
              Auto update
            </span>
          )}
        </div>
      );
    }
    if (isGamePast(game)) {
      return (
        <span className="text-xs font-medium text-fg/80 bg-fg/10 px-2 py-1 rounded-full">
          Final
        </span>
      );
    }
    const date = new Date(game.date);
    return (
      <span className="text-sm text-fg/80">
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

    return { name: broadcast, logo: null, color: 'text-fg/40' };
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
    
    // Fallback to text only — keep small, allow wrapping for long names
    return <span className={`text-[11px] leading-tight ${info.color}`}>{info.name}</span>;
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
      className={`hover:opacity-80 transition-opacity cursor-pointer text-left ${className}`}
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
      <div className="mt-3 pt-3 border-t border-fg/10 space-y-4">
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
              <h4 className="text-sm font-semibold text-fg/50 uppercase tracking-wide flex items-center gap-1.5">
                <Target className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                Betting Lines
              </h4>
              <div className={gridClass}>
                {hasSpread && (
                  <div className="bg-fg/5 rounded-lg p-2 sm:p-3 text-center">
                    <div className="text-sm text-fg/50">Spread</div>
                    <div className="text-sm sm:text-base font-semibold text-fg">{odds.spread}</div>
                  </div>
                )}
                {hasOU && (
                  <div className="bg-fg/5 rounded-lg p-2 sm:p-3 text-center">
                    <div className="text-sm text-fg/50">O/U</div>
                    <div className="text-sm sm:text-base font-semibold text-fg">{odds.overUnder}</div>
                  </div>
                )}
                {hasML && (
                  <div className="bg-fg/5 rounded-lg p-2 sm:p-3 text-center">
                    <div className="text-sm text-fg/50">Moneyline</div>
                    <div className="text-sm sm:text-base font-semibold text-fg">
                      {game.awayTeam?.abbreviation} {odds.awayMoneyLine > 0 ? '+' : ''}{odds.awayMoneyLine}
                    </div>
                    <div className="text-sm sm:text-base font-semibold text-fg">
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
              <h4 className="text-sm font-semibold text-fg/50 uppercase tracking-wide flex items-center gap-1.5">
                <TrendingUp className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                Win Probability
              </h4>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="text-sm font-medium text-fg">{game.awayTeam?.abbreviation}</span>
                  <span className="text-sm font-bold text-fg">{awayPct}%</span>
                </div>
                <div className="flex-1 h-3 sm:h-4 rounded-full overflow-hidden flex">
                  <div
                    className="h-full transition-all duration-300"
                    style={{
                      width: `${awayPct}%`,
                      backgroundColor: awayColor,
                      backgroundImage: `repeating-linear-gradient(
                        -45deg,
                        transparent,
                        transparent 3px,
                        rgba(255,255,255,0.15) 3px,
                        rgba(255,255,255,0.15) 5px
                      )`
                    }}
                  />
                  <div
                    className="h-full transition-all duration-300"
                    style={{ width: `${homePct}%`, backgroundColor: homeColor }}
                  />
                </div>
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="text-sm font-bold text-fg">{homePct}%</span>
                  <span className="text-sm font-medium text-fg">{game.homeTeam?.abbreviation}</span>
                </div>
              </div>
            </div>
          );
        })()}

        {/* Team Season Stats — Sport-specific */}
        {(() => {
          const isPreseason = sportStatuses[selectedSport] === 'preseason';
          const config = SEASON_STATS_CONFIG[selectedSport] || SEASON_STATS_CONFIG.nfl;

          // Build stat rows for a team from scoreboard + details data
          const getTeamStats = (team, side) => {
            const scoreboard = team?.seasonStats || {};
            const detailStats = details?.seasonAverages?.[side]?.stats || {};
            const streak = details?.seasonAverages?.[side]?.streak || (selectedSport === 'nfl' ? team?.streak : null);
            const lastTen = details?.seasonAverages?.[side]?.lastTen;

            const stats = config.map(({ key, label, source, rankingsKey }) => {
              const rKey = rankingsKey || key;
              const leagueRank = leagueRanksByStat[rKey]?.[String(team?.id)] || null;
              const fallbackRank = leagueRanksLoaded ? scoreboard[key]?.rank || null : null;
              // NFL embeds avgPointsFor/avgPointsAgainst directly on team object
              if (source === 'game') return { label, value: team?.[key] || '-', rank: leagueRank || fallbackRank, statKey: rKey };
              // Details-only stats (like opp PPG from boxscore)
              if (source === 'details') return { label, value: detailStats[key]?.displayValue || '-', rank: leagueRank || fallbackRank, statKey: rKey };
              // Default: try scoreboard stats first, then detail stats
              const val = scoreboard[key]?.displayValue || detailStats[key]?.displayValue;
              const rank = leagueRank || fallbackRank;
              return { label, value: val || '-', rank, statKey: rKey };
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
            <div className="bg-fg/5 rounded-lg p-3 sm:p-4">
              <div className="flex items-center gap-2 mb-2.5">
                {team?.logo && <img src={tl(team.logo)} alt="" className="w-6 h-6 object-contain" />}
                <span className="text-sm sm:text-base font-semibold text-fg">{team?.abbreviation}</span>
              </div>
              <div className="space-y-1.5 sm:space-y-2 text-sm sm:text-base">
                {data.stats.map((stat, i) => (
                  <div
                    key={i}
                    className={`flex justify-between items-center rounded px-1 -mx-1 ${canClickStat ? 'cursor-pointer hover:bg-fg/10 transition-colors' : ''}`}
                    onClick={canClickStat ? (e) => {
                      e.stopPropagation();
                      setStatRankingDialog({
                        statKey: stat.statKey,
                        statLabel: stat.label,
                        currentTeamIds: [game.homeTeam?.id, game.awayTeam?.id].filter(Boolean)
                      });
                    } : undefined}
                  >
                    <span className="text-fg/50">{stat.label}</span>
                    <span className={`font-medium ${stat.rank ? getRankColor(stat.rank) : 'text-fg'}`}>
                      {stat.value}
                      {stat.rank && <span className="ml-1 text-sm">({stat.rank})</span>}
                    </span>
                  </div>
                ))}
                {data.lastTen && (
                  <div className="flex justify-between items-center px-1 -mx-1">
                    <span className="text-fg/50">Last 10</span>
                    <span className="text-fg font-medium">{data.lastTen}</span>
                  </div>
                )}
                {data.streak && (
                  <div className="flex justify-between items-center px-1 -mx-1">
                    <span className="text-fg/50">Streak</span>
                    <span className={`font-medium ${data.streak.type === 'W' ? 'text-green-500' : 'text-red-500'}`}>
                      {data.streak.type}{data.streak.count}
                    </span>
                  </div>
                )}
              </div>
            </div>
          );

          return (
            <div className="space-y-2">
              <h4 className="text-sm font-semibold text-fg/50 uppercase tracking-wide flex items-center gap-1.5">
                <TrendingUp className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                {isPreseason ? 'Preseason Stats' : 'Season Averages'}
              </h4>
              <div className="grid grid-cols-2 gap-3">
                <TeamSeasonColumn team={game.awayTeam} data={awayData} />
                <TeamSeasonColumn team={game.homeTeam} data={homeData} />
              </div>
            </div>
          );
        })()}
        
        {/* Probable Pitchers (MLB) */}
        {details?.probablePitchers && details.probablePitchers.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-sm font-semibold text-fg/50 uppercase tracking-wide flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              Probable Pitchers
            </h4>
            <div className="grid grid-cols-2 gap-3">
              {details.probablePitchers.map((pitcher, i) => (
                <div key={i} className="bg-fg/5 rounded-lg p-3 flex items-center gap-3">
                  {pitcher.headshot ? (
                    <img src={pitcher.headshot} alt="" className="w-12 h-12 rounded-full object-cover bg-fg/10 flex-shrink-0" />
                  ) : (
                    <div className="w-12 h-12 rounded-full bg-fg/10 flex items-center justify-center text-fg/30 text-xs font-bold flex-shrink-0">
                      {pitcher.team?.abbreviation || 'P'}
                    </div>
                  )}
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      {pitcher.team?.logo && <img src={tl(pitcher.team.logo)} alt="" className="w-4 h-4 object-contain" />}
                      <span className="text-sm text-fg/50">{pitcher.team?.abbreviation}</span>
                    </div>
                    <div className="text-sm font-semibold text-fg truncate">{pitcher.name}</div>
                    {Object.keys(pitcher.stats || {}).length > 0 && (
                      <div className="text-sm text-fg/50 mt-0.5">
                        {pitcher.stats.W && pitcher.stats.L ? `${pitcher.stats.W}-${pitcher.stats.L}` : ''}
                        {pitcher.stats.ERA ? ` · ${pitcher.stats.ERA} ERA` : ''}
                        {pitcher.stats.WHIP ? ` · ${pitcher.stats.WHIP} WHIP` : ''}
                        {pitcher.stats.K ? ` · ${pitcher.stats.K} K` : ''}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Last 5 Games */}
        {details?.lastFiveGames && (() => {
          const teams = [
            { team: game.awayTeam, games: details.lastFiveGames[game.awayTeam?.abbreviation] },
            { team: game.homeTeam, games: details.lastFiveGames[game.homeTeam?.abbreviation] }
          ].filter(t => t.games?.length > 0);
          if (teams.length === 0) return null;
          return (
            <div className="space-y-2">
              <h4 className="text-sm font-semibold text-fg/50 uppercase tracking-wide flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                Last 5 Games
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {teams.map(({ team, games }) => (
                  <div key={team?.id} className="bg-fg/5 rounded-lg p-2 sm:p-3">
                    <div className="flex items-center gap-2 mb-2">
                      {team?.logo && <img src={tl(team.logo)} alt="" className="w-5 h-5 object-contain" />}
                      {selectedSport === 'ncaab' ? (
                        <span className="text-sm font-semibold text-fg">
                          {(() => { const r = Number(team?.ranking?.current); return (Number.isFinite(r) && r > 0 && r < 99) ? `#${r} ` : ''; })()}
                          {team?.name || team?.abbreviation}
                          {team?.record && <span className="text-fg/45 font-medium ml-1.5">({team.record})</span>}
                        </span>
                      ) : (
                        <span className="text-sm font-semibold text-fg">
                          {team?.abbreviation}
                          {team?.record && <span className="text-fg/45 font-medium ml-1.5">{team.record}</span>}
                        </span>
                      )}
                    </div>
                    <div className="space-y-1.5">
                      {games.map((g, i) => {
                        const dateStr = g.date ? (() => {
                          const d = new Date(g.date);
                          return `${d.getMonth() + 1}/${d.getDate()}`;
                        })() : '';
                        return (
                          <div key={i} className="flex items-center justify-between text-sm">
                            <div className="flex items-center gap-1.5 sm:gap-1.5 min-w-0">
                              <span className="text-fg/40 w-7 sm:w-auto flex-shrink-0 text-xs sm:text-sm">{dateStr}</span>
                              <span className="text-fg/50 w-5 sm:w-5 sm:text-sm sm:text-fg/40 flex-shrink-0 text-center">{g.atVs === 'vs' ? 'vs.' : '@'}</span>
                              {g.opponentLogo && <img src={tl(g.opponentLogo)} alt="" className="w-4 h-4 sm:w-5 sm:h-5 object-contain flex-shrink-0" />}
                              <span className="text-fg/70 truncate">
                                <span className="hidden min-[400px]:inline sm:hidden">{g.opponentName || g.opponent}</span>
                                <span className="min-[400px]:hidden">{g.opponent || g.opponentName}</span>
                                <span className="hidden sm:inline">{g.opponentName || g.opponent}</span>
                                {g.opponentRecord && <span className="text-fg/40 ml-1">({g.opponentRecord})</span>}
                              </span>
                            </div>
                            <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
                              <span className={`font-bold ${g.result === 'W' ? 'text-green-500' : g.result === 'L' ? 'text-red-500' : 'text-fg/50'}`}>
                                {g.result}
                              </span>
                              <span className="text-fg/60 font-medium">{g.score}</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })()}

        {/* Injuries (daily sports — from game summary) */}
        {details?.injuries && (() => {
          const awayKey = game.awayTeam?.abbreviation;
          const homeKey = game.homeTeam?.abbreviation;
          const awayInj = details.injuries[awayKey] || [];
          const homeInj = details.injuries[homeKey] || [];
          // Filter to key injuries only
          const filterKey = (list) => list.filter(p => {
            const s = (p.status || '').toLowerCase();
            return s.includes('out') || s.includes('day-to-day') || s === 'doubtful';
          }).slice(0, 5);
          const awayFiltered = filterKey(awayInj);
          const homeFiltered = filterKey(homeInj);
          if (awayFiltered.length === 0 && homeFiltered.length === 0) return null;
          const InjList = ({ injuries: injList }) => (
            <div className="text-sm text-fg/60 space-y-0.5">
              {injList.map((inj, i) => (
                <div key={i}>
                  <span className={inj.status?.toLowerCase().includes('out') ? 'text-red-500' : 'text-yellow-400'}>
                    {inj.status}
                  </span>
                  {' '}{inj.name} <span className="text-fg/40">({inj.position})</span>
                </div>
              ))}
            </div>
          );
          return (
            <div className="space-y-2">
              <h4 className="text-sm font-semibold text-fg/50 uppercase tracking-wide flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                Injury Report
              </h4>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="flex items-center gap-2 mb-1.5">
                    {game.awayTeam?.logo && <img src={tl(game.awayTeam.logo)} alt="" className="w-4 h-4" />}
                    <span className="text-sm text-fg/50">{awayKey}</span>
                  </div>
                  {awayFiltered.length > 0 ? <InjList injuries={awayFiltered} /> : <span className="text-sm text-fg/30">None reported</span>}
                </div>
                <div>
                  <div className="flex items-center gap-2 mb-1.5">
                    {game.homeTeam?.logo && <img src={tl(game.homeTeam.logo)} alt="" className="w-4 h-4" />}
                    <span className="text-sm text-fg/50">{homeKey}</span>
                  </div>
                  {homeFiltered.length > 0 ? <InjList injuries={homeFiltered} /> : <span className="text-sm text-fg/30">None reported</span>}
                </div>
              </div>
            </div>
          );
        })()}

        {/* NFL Injuries (from separate injury endpoint) */}
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
              <div className="text-sm text-fg/60 space-y-0.5">
                {displayList.map((inj, i) => (
                  <div key={i}>
                    <span className={inj.displayStatus === 'Doubtful' ? 'text-yellow-400' : 'text-red-500'}>
                      {inj.displayStatus}
                    </span>
                    {' '}{inj.player.name} <span className="text-fg/40">({inj.player.position})</span>
                  </div>
                ))}
                {hasMore && (
                  <button
                    onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}
                    className="text-fg/40 hover:text-fg/60 mt-1"
                  >
                    {expanded ? '← Show less' : `+${injList.length - 3} more`}
                  </button>
                )}
              </div>
            );
          };
          
          return (
            <div className="space-y-3">
              <h4 className="text-sm font-medium text-fg/40 uppercase tracking-wide">
                Injuries
              </h4>
              <div className="grid grid-cols-2 gap-4">
                {/* Away Team */}
                <div>
                  <div className="flex items-center gap-2 mb-1.5">
                    {game.awayTeam?.logo && <img src={tl(game.awayTeam.logo)} alt="" className="w-4 h-4" />}
                    <span className="text-sm text-fg/50">{game.awayTeam?.abbreviation}</span>
                  </div>
                  {awayInjuries.length > 0 ? <InjuryList injuries={awayInjuries} /> : (
                    <span className="text-sm text-fg/30">None</span>
                  )}
                </div>
                {/* Home Team */}
                <div>
                  <div className="flex items-center gap-2 mb-1.5">
                    {game.homeTeam?.logo && <img src={tl(game.homeTeam.logo)} alt="" className="w-4 h-4" />}
                    <span className="text-sm text-fg/50">{game.homeTeam?.abbreviation}</span>
                  </div>
                  {homeInjuries.length > 0 ? <InjuryList injuries={homeInjuries} /> : (
                    <span className="text-sm text-fg/30">None</span>
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
        <div className="mt-3 pt-3 border-t border-fg/10 flex justify-center py-4">
          <div className={`w-5 h-5 border-2 ${selectedSport === 'nfl' ? 'border-nfl-blue' : 'border-fg/30'} border-t-transparent rounded-full animate-spin`} />
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
          <span className="text-fg">{m[1]}%</span>
          <span className="text-fg/55">({m[2]})</span>
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

    const isBasketball = selectedSport === 'nba' || selectedSport === 'ncaab';
    const hasPlays = details?.plays && details.plays.length > 0;

    return (
      <div className="mt-3 pt-3 border-t border-fg/10 space-y-4">
        {/* Detail tabs for basketball sports */}
        {isBasketball && hasPlays && (
          <div className="flex gap-1">
            {['summary', ...(hasPlayerStats ? ['boxscore'] : []), 'gamecast', 'shotchart'].map(tab => (
              <button
                key={tab}
                onClick={(e) => { e.stopPropagation(); setDetailTab(tab); }}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                  detailTab === tab
                    ? 'bg-fg/15 text-fg/90'
                    : 'bg-fg/5 text-fg/40 hover:bg-fg/10 hover:text-fg/60'
                }`}
              >
                {tab === 'summary' ? 'Summary' : tab === 'boxscore' ? 'Box Score' : tab === 'gamecast' ? 'Gamecast' : 'Shot Chart'}
              </button>
            ))}
          </div>
        )}

        {/* Gamecast tab */}
        {isBasketball && detailTab === 'gamecast' && hasPlays && (
          <div onClick={(e) => e.stopPropagation()}>
            <Gamecast
              plays={details.plays}
              game={game}
              courtType={selectedSport}
              isPaused={
                game.status === 'STATUS_HALFTIME' ||
                game.status === 'STATUS_END_PERIOD' ||
                /timeout|time.?out/i.test(game.statusDetail || '')
              }
              gamecastDebug={gamecastDebug}
            />
          </div>
        )}

        {/* Shot Chart tab */}
        {isBasketball && detailTab === 'shotchart' && hasPlays && (
          <div onClick={(e) => e.stopPropagation()}>
            <ShotChart
              plays={details.plays}
              game={game}
              courtType={selectedSport}
            />
          </div>
        )}

        {/* Box Score tab */}
        {isBasketball && detailTab === 'boxscore' && hasPlayerStats && (
          <div onClick={(e) => e.stopPropagation()}>
            <BoxScore playerStats={details.playerStats} game={game} alwaysExpanded />
          </div>
        )}

        {/* Summary tab (default — original content) */}
        {(!isBasketball || detailTab === 'summary' || !hasPlays) && <>
        {/* Top Performers by Team */}
        {hasLeaders ? (
          <div className="space-y-2">
            <h4 className="text-xs sm:text-sm font-semibold text-fg/70 uppercase tracking-wide flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              Top Performers
            </h4>

            <div className="grid grid-cols-2 gap-4">
              {[game.awayTeam, game.homeTeam].map((team) => {
                const teamLeaders = leadersByTeam[team?.abbreviation] || [];
                if (teamLeaders.length === 0) return <div key={team?.abbreviation || 'unknown'} />;
                return (
                  <div key={team?.abbreviation} className="space-y-2">
                    <div className="flex items-center gap-2 pb-1 border-b border-fg/10">
                      {team?.logo && (
                        <img src={tl(team.logo)} alt={team?.abbreviation} className="w-5 h-5 sm:w-6 sm:h-6" />
                      )}
                      <span className="text-xs sm:text-sm font-semibold text-fg">{team?.abbreviation}</span>
                    </div>
                    <div className="space-y-1.5">
                      {teamLeaders.map((leader, idx) => (
                        <div key={idx} className="flex items-center gap-2.5">
                          {leader.player?.headshot ? (
                            <img
                              src={leader.player.headshot}
                              alt={leader.player?.name}
                              className="w-8 h-8 rounded-full object-cover flex-shrink-0"
                            />
                          ) : (
                            <div className="w-8 h-8 rounded-full bg-fg/10 flex items-center justify-center text-fg/50 text-[10px] flex-shrink-0">
                              {leader.player?.position || '?'}
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <div className="text-xs sm:text-sm font-medium text-fg truncate">{leader.player?.name || 'Unknown'}</div>
                            <div className="text-[11px] sm:text-xs text-fg/50">{leader.value}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}

        {/* Box Score (non-basketball sports only — basketball uses tab) */}
        {!isBasketball && hasPlayerStats && (
          <BoxScore playerStats={details.playerStats} game={game} />
        )}

        {/* Scoring Summary */}
        {details?.scoringPlays && details.scoringPlays.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-sm font-semibold text-fg/50 uppercase tracking-wide">
              {selectedSport === 'nhl' ? 'Goals' : 'Scoring Summary'}
            </h4>
            <div className="space-y-1.5 max-h-48 overflow-y-auto">
              {details.scoringPlays.map((play, idx) => (
                <div key={idx} className="bg-fg/5 rounded-lg p-2 sm:p-3 text-sm">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-fg/50">
                      {play.periodLabel || `Q${play.quarter}`} {play.time}
                    </span>
                    <span className="font-medium text-fg">
                      {game.awayTeam?.abbreviation} {play.awayScore} - {play.homeScore} {game.homeTeam?.abbreviation}
                    </span>
                  </div>
                  <div className="text-fg/70 flex items-center gap-1.5">
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
            <h4 className="text-sm font-semibold text-fg/50 uppercase tracking-wide">
              Team Stats
            </h4>
            <div className="space-y-1.5">
              {Object.entries(getStatLabels()).map(([statKey, label]) => {
                const awayStat = formatTeamStatValue(details.teamStats.away?.[statKey]);
                const homeStat = formatTeamStatValue(details.teamStats.home?.[statKey]);
                if (!awayStat && !homeStat) return null;

                return (
                  <div key={statKey} className="flex items-center text-sm sm:text-base">
                    <span className="w-20 sm:w-24 text-right font-medium whitespace-nowrap">
                      {renderTeamStatValue(awayStat, 'right')}
                    </span>
                    <div className="flex-1 text-center text-fg/50 px-2">{label}</div>
                    <span className="w-20 sm:w-24 text-left font-medium whitespace-nowrap">
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
          <div className="text-center text-fg/40 text-sm py-2">
            No additional details available for this game
          </div>
        )}
        </>}
      </div>
    );
  };

  // Animated score display component
  const ScoreDisplay = ({ score, className }) => {
    const animating = useAnimatedScore(score);
    return (
      <span className={`${className} inline-block ${animating ? 'score-animate' : ''}`}>
        {score ?? 0}
      </span>
    );
  };

  /** Inline rank prefix for mobile — returns a span with "#N " or null */
  const rankPrefix = (team) => {
    const r = Number(team?.ranking?.current);
    if (!Number.isFinite(r) || r <= 0 || r >= 99) return null;
    return <span className="text-fg/50 font-semibold">#{r} </span>;
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
          glass-card rounded-xl p-3 sm:p-4 transition-all cursor-pointer overflow-hidden ${isExpanded ? '' : 'hover:bg-fg/5'}
          ${isLive ? 'ring-1 ring-red-500/30' : ''}
          ${isExpanded ? 'ring-1 ring-white/20' : ''}
        `}
        onClick={() => toggleGameExpand(game.id, game)}
      >
        {/* Mobile Layout - Vertical Stack */}
        <div className="sm:hidden">
          {game.notes && (
            <div className="text-[11px] text-fg/50 font-medium mb-1.5 truncate">{game.notes}</div>
          )}
          <div className="flex">
            {/* Teams Column */}
            <div className="flex-1 space-y-2">
              {/* Away Team */}
              <div className={`flex items-start gap-2.5 ${isPast && getScore(game.awayTeam) < getScore(game.homeTeam) ? 'opacity-50' : ''}`}>
                <ClickableTeam team={game.awayTeam}>
                  {game.awayTeam?.logo ? (
                    <img
                      src={tl(game.awayTeam.logo)}
                      alt={game.awayTeam.abbreviation}
                      className="w-7 h-7 object-contain flex-shrink-0"
                    />
                  ) : (
                    <div
                      className="w-7 h-7 rounded-full flex items-center justify-center text-white font-bold text-[10px] flex-shrink-0 overflow-hidden"
                      style={{ backgroundColor: game.awayTeam?.color || '#666' }}
                    >
                      {(game.awayTeam?.abbreviation || '?').slice(0, 3)}
                    </div>
                  )}
                </ClickableTeam>
                {isPast || isLive ? (
                  <>
                    {selectedSport === 'ncaab' && <TeamRankBadge team={game.awayTeam} />}
                    <ClickableTeam team={game.awayTeam}>
                      <span className="text-fg font-medium text-base hover:underline">
                        {game.awayTeam?.name || game.awayTeam?.abbreviation || 'TBD'}
                      </span>
                    </ClickableTeam>
                    <ScoreDisplay
                      score={getScore(game.awayTeam)}
                      className={`ml-auto font-bold text-base ${
                        isPast && getScore(game.awayTeam) < getScore(game.homeTeam) ? 'text-fg/40' : 'text-fg'
                      }`}
                    />
                  </>
                ) : (
                  <span className="flex-1 min-w-0 text-base leading-snug">
                      <span className="text-fg font-medium hover:underline hover:opacity-80 cursor-pointer" onClick={(e) => openTeamInfo(game.awayTeam, e)}>
                        {selectedSport === 'ncaab' && rankPrefix(game.awayTeam)}{game.awayTeam?.name || game.awayTeam?.abbreviation || 'TBD'}
                      </span>
                      {game.awayTeam?.record && <span className="text-sm text-fg/45 font-medium ml-1.5 whitespace-nowrap">{game.awayTeam.record}</span>}
                  </span>
                )}
              </div>

              {/* Home Team */}
              <div className={`flex items-start gap-2.5 ${isPast && getScore(game.homeTeam) < getScore(game.awayTeam) ? 'opacity-50' : ''}`}>
                <ClickableTeam team={game.homeTeam}>
                  {game.homeTeam?.logo ? (
                    <img
                      src={tl(game.homeTeam.logo)}
                      alt={game.homeTeam.abbreviation}
                      className="w-7 h-7 object-contain flex-shrink-0"
                    />
                  ) : (
                    <div
                      className="w-7 h-7 rounded-full flex items-center justify-center text-white font-bold text-[10px] flex-shrink-0 overflow-hidden"
                      style={{ backgroundColor: game.homeTeam?.color || '#666' }}
                    >
                      {(game.homeTeam?.abbreviation || '?').slice(0, 3)}
                    </div>
                  )}
                </ClickableTeam>
                {isPast || isLive ? (
                  <>
                    {selectedSport === 'ncaab' && <TeamRankBadge team={game.homeTeam} />}
                    <ClickableTeam team={game.homeTeam}>
                      <span className="text-fg font-medium text-base hover:underline">
                        {game.homeTeam?.name || game.homeTeam?.abbreviation || 'TBD'}
                      </span>
                    </ClickableTeam>
                    <ScoreDisplay
                      score={getScore(game.homeTeam)}
                      className={`ml-auto font-bold text-base ${
                        isPast && getScore(game.homeTeam) < getScore(game.awayTeam) ? 'text-fg/40' : 'text-fg'
                      }`}
                    />
                  </>
                ) : (
                  <span className="flex-1 min-w-0 text-base leading-snug">
                        <span className="text-fg font-medium hover:underline hover:opacity-80 cursor-pointer" onClick={(e) => openTeamInfo(game.homeTeam, e)}>
                          {selectedSport === 'ncaab' && rankPrefix(game.homeTeam)}{game.homeTeam?.name || game.homeTeam?.abbreviation || 'TBD'}
                        </span>
                        {game.homeTeam?.record && <span className="text-sm text-fg/45 font-medium ml-1.5 whitespace-nowrap">{game.homeTeam.record}</span>}
                  </span>
                )}
              </div>
            </div>
            
            {/* Game Info Column */}
            <div className="flex-shrink-0 pl-4 border-l border-fg/10 ml-4 flex flex-col justify-center items-end max-w-[90px]">
              {isLive ? (
                <div className="flex flex-col items-end gap-0.5">
                  <span className="flex items-center justify-end gap-1.5 text-xs font-bold text-white bg-red-600 px-2 py-0.5 rounded-full">
                    <span className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" />
                    LIVE
                  </span>
                  {game.statusDetail && (
                    <span className="text-sm text-fg/50">{game.statusDetail}</span>
                  )}
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
              <ChevronDown className={`w-4 h-4 text-fg/30 mt-1 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
            </div>
          </div>
          
          {/* Expanded Content - Mobile */}
          {isExpanded && (
            (isPast || isLive) ? renderCompletedGameDetails(game) : renderUpcomingGameDetails(game)
          )}
        </div>

        {/* Desktop Layout - Horizontal */}
        <div className="hidden sm:block">
          {/* Game Header */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              {getStatusDisplay(game)}
              {game.broadcast && !isPast && <BroadcastIcon broadcast={game.broadcast} />}
              {game.notes && (
                <span className="text-xs text-fg/70 bg-fg/5 px-2 py-0.5 rounded-full font-medium">
                  {game.notes}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {game.venue && (
                <span className="text-xs text-fg/60 truncate max-w-[200px]">
                  {game.venue}
                </span>
              )}
              <ChevronDown className={`w-4 h-4 text-fg/30 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
            </div>
          </div>

          {/* Teams */}
          <div className="flex items-center gap-4">
            {/* Away Team */}
            <div className={`flex-1 flex items-center gap-3 ${isPast && getScore(game.awayTeam) < getScore(game.homeTeam) ? 'opacity-50' : ''}`}>
              <ClickableTeam team={game.awayTeam}>
                {game.awayTeam?.logo ? (
                  <img
                    src={tl(game.awayTeam.logo)}
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
                <div className="text-fg font-medium text-base truncate hover:underline flex items-center gap-1.5">
                  {selectedSport === 'ncaab' && <TeamRankBadge team={game.awayTeam} />}
                  <span className="truncate">{game.awayTeam?.name || game.awayTeam?.abbreviation || 'TBD'}</span>
                </div>
                {(game.awayTeam?.record ||
                  game.awayTeam?.standingSummary ||
                  getTeamStandingBadges(game.awayTeam).length > 0) && (
                  <div className="mt-0.5 flex items-center gap-2 text-sm">
                    {game.awayTeam?.record && (
                      <span className="text-sm font-medium text-fg/45">{game.awayTeam.record}</span>
                    )}
                    {getTeamStandingBadges(game.awayTeam).map((b, i) => (
                      <StandingBadge key={`${b.label}-${b.rank}-${i}`} label={b.label} rank={b.rank} />
                    ))}
                  </div>
                )}
              </ClickableTeam>
            </div>

            {/* Score / VS */}
            <div className="flex-shrink-0 text-center min-w-[80px]">
              {isPast || isLive ? (
                <div className="flex items-center justify-center gap-2">
                  <ScoreDisplay
                    score={getScore(game.awayTeam)}
                    className={`text-2xl font-bold ${
                      isPast && getScore(game.awayTeam) < getScore(game.homeTeam) ? 'text-fg/40' : 'text-fg'
                    }`}
                  />
                  <span className="text-fg/30">-</span>
                  <ScoreDisplay
                    score={getScore(game.homeTeam)}
                    className={`text-2xl font-bold ${
                      isPast && getScore(game.homeTeam) < getScore(game.awayTeam) ? 'text-fg/40' : 'text-fg'
                    }`}
                  />
                </div>
              ) : (
                <span className="text-fg/30 text-sm">vs</span>
              )}
            </div>

            {/* Home Team */}
            <div className={`flex-1 flex items-center justify-end gap-3 ${isPast && getScore(game.homeTeam) < getScore(game.awayTeam) ? 'opacity-50' : ''}`}>
              <ClickableTeam team={game.homeTeam} className="min-w-0 text-right">
                <div className="text-fg font-medium text-base truncate hover:underline flex items-center justify-end gap-1.5">
                  {selectedSport === 'ncaab' && <TeamRankBadge team={game.homeTeam} />}
                  <span className="truncate">{game.homeTeam?.name || game.homeTeam?.abbreviation || 'TBD'}</span>
                </div>
                {(game.homeTeam?.record ||
                  game.homeTeam?.standingSummary ||
                  getTeamStandingBadges(game.homeTeam).length > 0) && (
                  <div className="mt-0.5 flex items-center justify-end gap-2 text-sm">
                    {game.homeTeam?.record && (
                      <span className="text-sm font-medium text-fg/45">{game.homeTeam.record}</span>
                    )}
                    {getTeamStandingBadges(game.homeTeam).map((b, i) => (
                      <StandingBadge key={`${b.label}-${b.rank}-${i}`} label={b.label} rank={b.rank} />
                    ))}
                  </div>
                )}
              </ClickableTeam>
              <ClickableTeam team={game.homeTeam}>
                {game.homeTeam?.logo ? (
                  <img
                    src={tl(game.homeTeam.logo)}
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
            (isPast || isLive) ? renderCompletedGameDetails(game) : renderUpcomingGameDetails(game)
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
      {/* Sport Tabs */}
      <div className="flex gap-2 mb-4 animate-in">
        {SPORT_TABS.map(sport => (
          <button
            key={sport.id}
            onClick={() => handleSportChange(sport.id)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors relative ${
              selectedSport === sport.id
                ? 'bg-fg/15 text-fg'
                : 'bg-fg/5 text-fg/40 hover:text-fg/60'
            }`}
          >
            {sport.name}
            {sportStatuses[sport.id] === 'active' && (
              <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-emerald-500" />
            )}
            {sportStatuses[sport.id] === 'preseason' && (
              <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-amber-400" />
            )}
          </button>
        ))}
      </div>

      {/* Sign up CTA for unauthenticated users */}
      {!user && (
        <div className="mb-4 animate-in">
          <Link
            to="/login"
            className="block glass-card rounded-xl p-3 sm:p-4 hover:bg-fg/[0.06] transition-all group"
          >
            <div className="flex items-center gap-3">
              <BrandLogo size="md" className="flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-fg font-semibold text-sm sm:text-base">Join a Survivor Pool</p>
                <p className="text-fg/50 text-sm">Sign in to create or join a league and start making picks</p>
              </div>
              <ArrowRight className="w-5 h-5 text-fg/30 group-hover:text-fg/60 group-hover:translate-x-0.5 transition-all flex-shrink-0" />
            </div>
          </Link>
        </div>
      )}

      {selectedSportTab?.scheduleType === 'daily' ? (
        /* Daily sport rendering (NBA, MLB, NHL, NCAAB) */
        <>
          {/* Header with Season Info & Dropdown */}
          <div className="relative z-10 mb-4 sm:mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 animate-in">
            <div>
              <h1 className="font-display text-2xl sm:text-3xl font-bold text-fg">
                {selectedSportTab?.name} Schedule
              </h1>
              {dailySportSeasons[selectedSport] && (
                <p className="text-fg/60 text-sm sm:text-base mt-1">
                  {formatSeasonYear(selectedSport, dailySportSeasons[selectedSport].season)}{' '}
                  {getSeasonTypeLabel(dailySportSeasons[selectedSport].seasonType)}
                </p>
              )}
            </div>

            {dailySportSeasons[selectedSport] && (
              <div className="relative" ref={dailySeasonDropdownRef}>
                <button
                  onClick={() => setShowDailySeasonDropdown(!showDailySeasonDropdown)}
                  className="flex items-center gap-2 px-4 py-2 bg-fg/10 hover:bg-fg/15 rounded-lg transition-colors text-fg text-sm font-medium"
                >
                  {formatSeasonYear(selectedSport, dailySportSeasons[selectedSport].season)}
                  <ChevronDown className={`w-4 h-4 transition-transform ${showDailySeasonDropdown ? 'rotate-180' : ''}`} />
                </button>

                {showDailySeasonDropdown && (
                  <div className="absolute left-0 sm:right-0 sm:left-auto mt-2 w-36 bg-elevated border border-fg/20 rounded-lg shadow-2xl z-50 overflow-hidden">
                    {getDailySeasonOptions(selectedSport).map(year => (
                      <button
                        key={year}
                        onClick={() => handleDailySeasonChange(year)}
                        className={`w-full px-4 py-2.5 text-left text-sm transition-colors ${
                          year === dailySportSeasons[selectedSport]?.season
                            ? 'bg-fg/20 text-fg font-semibold'
                            : 'text-fg hover:bg-fg/10'
                        }`}
                      >
                        {formatSeasonYear(selectedSport, year)}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Date Picker */}
          <DatePicker date={selectedDate} onChange={setSelectedDate} />

          {/* Delayed scores banner */}
          {liveData.isDelayed && (
            <div className="flex items-center gap-2 text-xs text-amber-400/80 bg-amber-400/10 px-3 py-2 rounded-lg mb-3">
              <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
              Scores may be delayed
            </div>
          )}

          {/* Loading / Games */}
          {dailyLoading ? (
            <div className="glass-card rounded-xl p-12 text-center">
              <div className="w-8 h-8 border-2 border-fg/30 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
              <p className="text-fg/50">Loading schedule...</p>
            </div>
          ) : liveGames.length === 0 ? (
            <div className="glass-card rounded-xl p-8 sm:p-12 text-center">
              <Calendar className="w-12 h-12 sm:w-16 sm:h-16 text-fg/20 mx-auto mb-4" />
              <h3 className="text-lg sm:text-xl font-semibold text-fg mb-2">No Games Found</h3>
              <p className="text-fg/60 text-sm sm:text-base">
                No {selectedSportTab?.name} games scheduled for this date
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              {(() => {
                const grouped = liveGames.reduce((acc, game) => {
                  const day = formatDay(game.date);
                  if (!acc[day]) acc[day] = [];
                  acc[day].push(game);
                  return acc;
                }, {});

                return Object.entries(grouped).map(([day, games]) => (
                  <div key={day}>
                    <h2 className="text-sm font-semibold text-fg/50 uppercase tracking-wider mb-3 flex items-center gap-2">
                      <Calendar className="w-4 h-4" />
                      {day}
                    </h2>
                    <div className="space-y-2">
                      {sortGames(games).map((game, index) => renderGameCard(game, index))}
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
              <h1 className="font-display text-2xl sm:text-3xl font-bold text-fg">
                NFL Schedule
              </h1>
              <p className="text-fg/60 text-sm sm:text-base mt-1">
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
                  className="flex items-center gap-2 px-4 py-2 bg-fg/10 hover:bg-fg/15 rounded-lg transition-colors text-fg text-sm font-medium"
                >
                  {season}
                  <ChevronDown className={`w-4 h-4 transition-transform ${showSeasonDropdown ? 'rotate-180' : ''}`} />
                </button>

                {showSeasonDropdown && (
                  <div className="absolute left-0 sm:right-0 sm:left-auto mt-2 w-36 bg-elevated border border-fg/20 rounded-lg shadow-2xl z-50 overflow-hidden">
                    {seasonOptions.map(year => (
                      <button
                        key={year}
                        onClick={() => handleSeasonChange(year)}
                        className={`w-full px-4 py-2.5 text-left text-sm transition-colors ${
                          year === season
                            ? 'bg-nfl-blue text-white'
                            : 'text-fg hover:bg-fg/10'
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
                  : 'bg-fg/5 text-fg/60 hover:bg-fg/10'
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
                  : 'bg-fg/5 text-fg/60 hover:bg-fg/10'
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
                  className="p-2 bg-fg/5 hover:bg-fg/10 rounded-lg transition-colors disabled:opacity-30 flex-shrink-0"
                >
                  <ChevronLeft className="w-5 h-5 text-fg" />
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
                              : 'bg-fg/5 text-fg/60 hover:bg-fg/10 hover:text-fg'
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
                  className="p-2 bg-fg/5 hover:bg-fg/10 rounded-lg transition-colors disabled:opacity-30 flex-shrink-0"
                >
                  <ChevronRight className="w-5 h-5 text-fg" />
                </button>
              </div>
            </div>
          )}

          {/* Loading state for schedule */}
          {scheduleLoading ? (
            <div className="glass-card rounded-xl p-12 text-center">
              <div className="w-8 h-8 border-2 border-nfl-blue border-t-transparent rounded-full animate-spin mx-auto mb-3" />
              <p className="text-fg/50">Loading schedule...</p>
            </div>
          ) : selectedSeasonType === 3 ? (
            /* Playoffs - All rounds on one page */
            Object.keys(playoffSchedule).length === 0 ? (
              <div className="glass-card rounded-xl p-8 sm:p-12 text-center">
                <Trophy className="w-12 h-12 sm:w-16 sm:h-16 text-fg/20 mx-auto mb-4" />
                <h3 className="text-lg sm:text-xl font-semibold text-fg mb-2">No Playoff Games Found</h3>
                <p className="text-fg/60 text-sm sm:text-base">
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
                        <Trophy className={`w-5 h-5 ${round === 5 ? 'text-yellow-400' : 'text-fg/60'}`} />
                        <h2 className={`text-lg sm:text-xl font-bold ${round === 5 ? 'text-yellow-400' : 'text-fg'}`}>
                          {PLAYOFF_ROUNDS[round]}
                        </h2>
                        <div className="flex-1 h-px bg-fg/10" />
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
              <Calendar className="w-12 h-12 sm:w-16 sm:h-16 text-fg/20 mx-auto mb-4" />
              <h3 className="text-lg sm:text-xl font-semibold text-fg mb-2">No Games Found</h3>
              <p className="text-fg/60 text-sm sm:text-base">
                Week {selectedWeek} schedule is not available
              </p>
            </div>
          ) : (
            /* Regular Season - Games by Day */
            <div className="space-y-6">
              {Object.entries(groupedGames).map(([day, games]) => (
                <div key={day}>
                  <h2 className="text-sm font-semibold text-fg/50 uppercase tracking-wider mb-3 flex items-center gap-2">
                    <Calendar className="w-4 h-4" />
                    {day}
                  </h2>

                  <div className="space-y-2">
                    {sortGames(games).map((game, index) => renderGameCard(game, index))}
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
