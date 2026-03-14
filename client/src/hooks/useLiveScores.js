import { useState, useEffect, useRef, useCallback } from 'react';
import { useScoresSocket } from '../context/ScoresSocketContext';

/**
 * useLiveScores — Reusable hook for consuming real-time score updates.
 *
 * Subscribes to the public /scores Socket.io namespace for a given sport
 * and merges incoming game updates into the local games array.
 * Works for both authenticated and unauthenticated users.
 *
 * @param {string} sportId - Sport to subscribe to (e.g. 'nba', 'ncaab')
 * @param {string} dateStr - Date in YYYY-MM-DD format (used to filter relevant games)
 * @param {Array} initialGames - Games initially loaded via REST API
 * @returns {{ games: Array, isLive: boolean, isDelayed: boolean, lastUpdated: number|null, isAutoUpdating: boolean }}
 *
 * Usage:
 *   const { games, isLive, isDelayed, isAutoUpdating } = useLiveScores('nba', '2026-03-13', dailySchedule);
 *   // Render `games` instead of `dailySchedule`
 */
export default function useLiveScores(sportId, dateStr, initialGames) {
  const { socket, connected, subscribeScores, unsubscribeScores } = useScoresSocket();
  const [games, setGames] = useState(initialGames || []);
  const [isDelayed, setIsDelayed] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);

  // Track the latest initialGames so we can reset when the REST fetch changes
  const initialGamesRef = useRef(initialGames);

  // Reset games when initialGames changes (e.g. sport/date switch triggers new REST fetch)
  useEffect(() => {
    initialGamesRef.current = initialGames;
    setGames(initialGames || []);
    setIsDelayed(false);
    setLastUpdated(null);
  }, [initialGames]);

  // Merge incoming game updates into current state
  const mergeUpdates = useCallback((updatedGames) => {
    if (!updatedGames || updatedGames.length === 0) return;

    setGames(prevGames => {
      const gameMap = new Map(prevGames.map(g => [g.id, g]));
      let hasChanges = false;

      for (const updatedGame of updatedGames) {
        const existing = gameMap.get(updatedGame.id);
        if (existing) {
          // Only update if something actually changed
          if (
            existing.status !== updatedGame.status ||
            existing.statusDetail !== updatedGame.statusDetail ||
            existing.period !== updatedGame.period ||
            existing.clock !== updatedGame.clock ||
            existing.completed !== updatedGame.completed ||
            existing.homeTeam?.score !== updatedGame.homeTeam?.score ||
            existing.awayTeam?.score !== updatedGame.awayTeam?.score
          ) {
            gameMap.set(updatedGame.id, updatedGame);
            hasChanges = true;
          }
        }
        // Don't add games that weren't in the initial set (different date)
      }

      if (!hasChanges) return prevGames;
      return Array.from(gameMap.values());
    });
  }, []);

  // Subscribe to live score socket room
  useEffect(() => {
    if (!sportId || !socket || !connected) return;

    subscribeScores(sportId);

    const handleScoreUpdate = (data) => {
      if (data.sport !== sportId) return;

      setIsDelayed(data.delayed || false);
      setLastUpdated(data.timestamp);

      // If the server sends individual changed games, merge them
      if (data.games && data.games.length > 0) {
        mergeUpdates(data.games);
      }
    };

    socket.on('score-update', handleScoreUpdate);

    return () => {
      socket.off('score-update', handleScoreUpdate);
      unsubscribeScores(sportId);
    };
  }, [sportId, socket, connected, subscribeScores, unsubscribeScores, mergeUpdates]);

  // Re-subscribe when socket reconnects
  useEffect(() => {
    if (!sportId || !socket) return;

    const handleReconnect = () => {
      subscribeScores(sportId);
    };

    socket.on('connect', handleReconnect);
    return () => socket.off('connect', handleReconnect);
  }, [sportId, socket, subscribeScores]);

  // Compute isLive from current games
  const isLive = games.some(g =>
    g.status === 'STATUS_IN_PROGRESS' ||
    g.status === 'STATUS_HALFTIME' ||
    g.status === 'STATUS_END_PERIOD' ||
    g.status === 'STATUS_FIRST_HALF' ||
    g.status === 'STATUS_SECOND_HALF'
  );

  // Auto-updating when socket is connected and there are live games
  const isAutoUpdating = connected && lastUpdated !== null;

  return { games, isLive, isDelayed, lastUpdated, isAutoUpdating };
}
