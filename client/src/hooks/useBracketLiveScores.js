import { useState, useEffect, useMemo, useCallback } from 'react';
import { useScoresSocket } from '../context/ScoresSocketContext';

/**
 * useBracketLiveScores — Real-time score updates for bracket matchup cells.
 *
 * Maps websocket game events to bracket slot numbers using ESPN event IDs.
 * Returns a liveSlotData map with per-slot game status, scores, and timing.
 *
 * @param {Object} tournamentData - Tournament data with slots containing espnEventId
 * @returns {{ liveSlotData: Object, connected: boolean }}
 */
export default function useBracketLiveScores(tournamentData) {
  const { socket, connected, subscribeScores, unsubscribeScores } = useScoresSocket();
  const [liveSlotData, setLiveSlotData] = useState({});

  // Build a map of espnEventId → slotNumber from tournament data
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

  const hasSlots = Object.keys(eventToSlot).length > 0;

  // Merge incoming game updates into liveSlotData
  const handleScoreUpdate = useCallback((data) => {
    if (data.sport !== 'ncaab' || !data.games?.length) return;

    setLiveSlotData(prev => {
      let updated = { ...prev };
      let hasChanges = false;

      for (const game of data.games) {
        const slot = eventToSlot[String(game.id)];
        if (slot === undefined) continue;

        // Build competitors array from game data
        const competitors = [];
        if (game.homeTeam) {
          competitors.push({
            teamId: String(game.homeTeam.id),
            score: game.homeTeam.score,
            homeAway: 'home',
          });
        }
        if (game.awayTeam) {
          competitors.push({
            teamId: String(game.awayTeam.id),
            score: game.awayTeam.score,
            homeAway: 'away',
          });
        }

        const newData = {
          status: game.status,
          statusDetail: game.statusDetail,
          clock: game.clock,
          period: game.period,
          competitors,
          broadcast: game.broadcast,
        };

        // Check if anything actually changed
        const existing = prev[slot];
        if (
          !existing ||
          existing.status !== newData.status ||
          existing.statusDetail !== newData.statusDetail ||
          existing.clock !== newData.clock ||
          existing.period !== newData.period ||
          existing.competitors?.[0]?.score !== newData.competitors?.[0]?.score ||
          existing.competitors?.[1]?.score !== newData.competitors?.[1]?.score
        ) {
          updated[slot] = newData;
          hasChanges = true;
        }
      }

      return hasChanges ? updated : prev;
    });
  }, [eventToSlot]);

  // Subscribe to ncaab scores
  useEffect(() => {
    if (!hasSlots || !socket || !connected) return;

    subscribeScores('ncaab');
    socket.on('score-update', handleScoreUpdate);

    return () => {
      socket.off('score-update', handleScoreUpdate);
      unsubscribeScores('ncaab');
    };
  }, [hasSlots, socket, connected, subscribeScores, unsubscribeScores, handleScoreUpdate]);

  // Re-subscribe on reconnect
  useEffect(() => {
    if (!hasSlots || !socket) return;

    const handleReconnect = () => {
      subscribeScores('ncaab');
    };

    socket.on('connect', handleReconnect);
    return () => socket.off('connect', handleReconnect);
  }, [hasSlots, socket, subscribeScores]);

  return { liveSlotData, connected };
}
