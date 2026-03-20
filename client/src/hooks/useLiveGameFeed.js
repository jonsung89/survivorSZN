import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { scheduleAPI } from '../api';
import { createGameState, analyzeNewPlays, getPlayerStatLine } from '../utils/commentaryEngine';

const LIVE_STATUSES = new Set([
  'STATUS_IN_PROGRESS', 'STATUS_HALFTIME', 'STATUS_END_PERIOD',
  'STATUS_FIRST_HALF', 'STATUS_SECOND_HALF', 'in_progress',
]);

function isGameLive(game) {
  return LIVE_STATUSES.has(game?.status);
}

// Max feed items to keep in memory
const MAX_FEED_ITEMS = 200;

/**
 * useLiveGameFeed — Polls play-by-play for all live games and produces
 * a unified, time-sorted feed of plays + system commentary.
 *
 * @param {string} sport - Sport key (e.g., 'ncaab')
 * @param {Array} games - Current games array (from useLiveScores)
 * @param {Object} options
 * @param {Array} options.prospects - Prospect array for NBA prospect mentions
 * @param {boolean} options.enabled - Whether to poll (default: true when any game is live)
 * @param {string|null} options.filterGameId - If set, only show plays for this game
 * @param {string} options.courtType - 'ncaab' or 'nba' (default: 'ncaab')
 * @returns {{ feedItems: Array, isPolling: boolean }}
 */
export default function useLiveGameFeed(sport, games, options = {}) {
  const { prospects = [], enabled, filterGameId = null, courtType = 'ncaab' } = options;

  const [feedItems, setFeedItems] = useState([]);
  const [isPolling, setIsPolling] = useState(false);

  // Persistent refs
  const gameStatesRef = useRef(new Map()); // gameId → GameState
  const seenPlayIdsRef = useRef(new Set());
  const pollTimerRef = useRef(null);
  const mountedRef = useRef(true);

  // Build prospect lookup map
  const prospectMap = useMemo(() => {
    const map = new Map();
    if (!prospects?.length) return map;
    for (const p of prospects) {
      if (p.espnId) map.set(String(p.espnId), p);
    }
    return map;
  }, [prospects]);

  // Get live game IDs
  const liveGameIds = useMemo(() => {
    if (!games?.length) return [];
    return games.filter(isGameLive).map(g => String(g.id));
  }, [games]);

  // Build game lookup
  const gameById = useMemo(() => {
    const map = new Map();
    if (!games?.length) return map;
    for (const g of games) map.set(String(g.id), g);
    return map;
  }, [games]);

  const shouldPoll = enabled !== false && liveGameIds.length > 0;

  // Process batch plays response
  const processBatchResponse = useCallback((data) => {
    if (!data?.games) return;

    const newItems = [];

    for (const [gameId, gameData] of Object.entries(data.games)) {
      if (filterGameId && String(gameId) !== String(filterGameId)) continue;

      const game = gameById.get(String(gameId));
      if (!game) continue;

      const plays = gameData.plays || [];
      if (plays.length === 0) continue;

      // Get or create game state
      if (!gameStatesRef.current.has(gameId)) {
        gameStatesRef.current.set(gameId, createGameState(gameId));
      }
      const gameState = gameStatesRef.current.get(gameId);

      const homeTeam = game.homeTeam;
      const awayTeam = game.awayTeam;

      // Run commentary engine on new plays
      const commentaryItems = analyzeNewPlays(plays, gameState, {
        homeTeam,
        awayTeam,
        courtType,
        prospects: prospectMap,
      });

      // Get latest score from the most recent play
      const lastPlay = plays[plays.length - 1];
      const latestHomeScore = lastPlay?.homeScore ?? 0;
      const latestAwayScore = lastPlay?.awayScore ?? 0;
      const latestPeriod = lastPlay?.period;
      const latestClock = lastPlay?.clock;

      // Add commentary items to feed
      for (const c of commentaryItems) {
        const item = {
          id: `commentary-${gameId}-${c.kind}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          type: 'commentary',
          gameId,
          wallclock: new Date().toISOString(),
          timestamp: Date.now(),
          homeTeam,
          awayTeam,
          // Use play-level score/clock from the commentary engine (when the event happened),
          // falling back to latest if not available
          homeScore: c.playHomeScore ?? latestHomeScore,
          awayScore: c.playAwayScore ?? latestAwayScore,
          period: c.playPeriod ?? latestPeriod,
          clock: c.playClock ?? latestClock,
          commentary: c,
        };
        newItems.push(item);
      }

      // Add new play items (only scoring plays + key plays for the feed)
      for (let i = 0; i < plays.length; i++) {
        const play = plays[i];
        if (seenPlayIdsRef.current.has(play.id)) continue;
        seenPlayIdsRef.current.add(play.id);

        // Filter: only include scoring plays, blocks, steals, turnovers in feed
        const tid = String(play.typeId || '');
        const playText = (play.text || '').toLowerCase();
        const isScoring = play.scoringPlay;
        const isBlock = playText.includes('block');
        const isSteal = playText.includes('steal');
        const isTurnover = TURNOVER_IDS.has(tid) || playText.includes('turnover');
        const isEndPeriod = tid === '412';

        if (!isScoring && !isBlock && !isSteal && !isTurnover && !isEndPeriod) continue;

        // Get player stat line for display
        const pid = play.participants?.[0]?.playerId;
        const playerStatLine = pid ? getPlayerStatLine(gameState, pid, play) : null;

        const item = {
          id: `play-${play.id}`,
          type: 'play',
          gameId,
          wallclock: play.wallclock || new Date().toISOString(),
          timestamp: Date.now(),
          play,
          homeTeam,
          awayTeam,
          homeScore: play.homeScore ?? 0,
          awayScore: play.awayScore ?? 0,
          period: play.period,
          clock: play.clock,
          playerStatLine,
        };
        newItems.push(item);
      }
    }

    if (newItems.length > 0) {
      setFeedItems(prev => {
        const combined = [...newItems, ...prev];
        // Sort by timestamp descending (newest first)
        combined.sort((a, b) => b.timestamp - a.timestamp);
        return combined.slice(0, MAX_FEED_ITEMS);
      });
    }
  }, [gameById, filterGameId, courtType, prospectMap]);

  // Track a "score fingerprint" to detect when WebSocket pushes new scores
  const scoreFingerprint = useMemo(() => {
    if (!games?.length) return '';
    return games
      .filter(isGameLive)
      .map(g => `${g.id}:${g.homeTeam?.score ?? 0}-${g.awayTeam?.score ?? 0}:${g.status}`)
      .join('|');
  }, [games]);

  // Ref for the poll function so we can call it from the score-change effect
  const pollFnRef = useRef(null);
  const lastScorePollRef = useRef(0);

  // Polling effect
  useEffect(() => {
    if (!shouldPoll || !sport) {
      setIsPolling(false);
      if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
      pollFnRef.current = null;
      return;
    }

    mountedRef.current = true;
    setIsPolling(true);

    let cancelled = false;

    const poll = async () => {
      if (cancelled) return;

      try {
        const idsToFetch = filterGameId ? [filterGameId] : liveGameIds;
        if (idsToFetch.length === 0) return;

        const data = await scheduleAPI.getBatchPlays(sport, idsToFetch);
        if (!cancelled && mountedRef.current) {
          processBatchResponse(data);
        }
      } catch (err) {
        // Silently ignore polling errors
      }

      if (!cancelled) {
        // Random interval 5-7 seconds
        const delay = 5000 + Math.random() * 2000;
        pollTimerRef.current = setTimeout(poll, delay);
      }
    };

    pollFnRef.current = poll;

    // Initial fetch immediately
    poll();

    return () => {
      cancelled = true;
      mountedRef.current = false;
      pollFnRef.current = null;
      if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
    };
  }, [shouldPoll, sport, liveGameIds.join(','), filterGameId, processBatchResponse]);

  // Trigger an immediate poll when scores change (WebSocket pushes)
  useEffect(() => {
    if (!scoreFingerprint || !pollFnRef.current) return;
    // Debounce: don't re-poll if we just polled within 2 seconds
    const now = Date.now();
    if (now - lastScorePollRef.current < 2000) return;
    lastScorePollRef.current = now;

    // Cancel the scheduled poll and fire immediately
    if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
    pollFnRef.current();
  }, [scoreFingerprint]);

  // Clean up game states for games that are no longer live
  useEffect(() => {
    const liveSet = new Set(liveGameIds);
    for (const [gameId] of gameStatesRef.current) {
      if (!liveSet.has(gameId)) {
        // Keep state for recently finished games (don't delete immediately)
      }
    }
  }, [liveGameIds]);

  return { feedItems, isPolling };
}

// Re-export for use by other components
const TURNOVER_IDS = new Set(['62', '63', '84', '86', '90']);
