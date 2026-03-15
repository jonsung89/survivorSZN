import { useMemo } from 'react';

// ESPN type IDs
const DEF_REBOUND_ID = '155';
const OFF_REBOUND_ID = '156';
const REBOUND_IDS = new Set([OFF_REBOUND_ID, DEF_REBOUND_ID]);
const FOUL_IDS = new Set(['42', '43', '44', '45']);
const TURNOVER_IDS = new Set(['62', '63', '84', '86', '90']);

function createEmptyStats() {
  return {
    points: 0,
    fgMade: 0, fgAttempted: 0,
    threeMade: 0, threeAttempted: 0,
    ftMade: 0, ftAttempted: 0,
    rebounds: 0, offRebounds: 0, defRebounds: 0,
    assists: 0, fouls: 0, turnovers: 0,
  };
}

function getOrCreate(map, id) {
  let s = map.get(id);
  if (!s) { s = createEmptyStats(); map.set(id, s); }
  return s;
}

/**
 * Compute running player stats from the plays array.
 * Returns a Map<playerId, stats>.
 */
export function usePlayerGameStats(plays) {
  return useMemo(() => {
    const stats = new Map();
    for (const play of plays) {
      const pid = play.participants?.[0]?.playerId;
      const tid = String(play.typeId);

      if (pid && play.shootingPlay) {
        const s = getOrCreate(stats, pid);
        const pts = play.pointsAttempted || play.scoreValue || 0;
        if (pts === 1) {
          // Free throw
          s.ftAttempted++;
          if (play.scoringPlay) { s.ftMade++; s.points += 1; }
        } else {
          // Field goal
          s.fgAttempted++;
          if (pts === 3) s.threeAttempted++;
          if (play.scoringPlay) {
            s.fgMade++;
            s.points += play.scoreValue;
            if (play.scoreValue === 3) s.threeMade++;
          }
        }
      }

      const playText = (play.text || '').toLowerCase();

      if (pid && (REBOUND_IDS.has(tid) || (!play.shootingPlay && playText.includes('rebound')))) {
        const s = getOrCreate(stats, pid);
        s.rebounds++;
        // Prefer text-based detection over typeId — ESPN typeIds can be unreliable
        if (playText.includes('offensive')) s.offRebounds++;
        else if (playText.includes('defensive')) s.defRebounds++;
        else if (tid === OFF_REBOUND_ID) s.offRebounds++;
        else if (tid === DEF_REBOUND_ID) s.defRebounds++;
      }
      if (pid && (FOUL_IDS.has(tid) || playText.includes('foul'))) {
        getOrCreate(stats, pid).fouls++;
      }
      if (pid && (TURNOVER_IDS.has(tid) || playText.includes('turnover'))) {
        getOrCreate(stats, pid).turnovers++;
      }

      // Assist: second participant on a made shot
      if (play.scoringPlay && play.participants?.[1]?.playerId) {
        getOrCreate(stats, play.participants[1].playerId).assists++;
      }
    }
    return stats;
  }, [plays.length]);
}

/**
 * Get a display label for a play based on its type and the player's cumulative stats.
 * Returns { line1, line2, color } or null.
 */
export function getPlayLabel(play, playerStats) {
  const pid = play.participants?.[0]?.playerId;
  if (!pid) return null;
  const s = playerStats.get(pid);
  if (!s) return null;

  const tid = String(play.typeId);

  // Scoring plays
  if (play.scoringPlay && play.shootingPlay) {
    const pts = play.scoreValue;
    return {
      line1: `+${pts}`,
      line2: `${s.points} PTS`,
      color: '#22c55e',
    };
  }

  // Missed shots
  if (play.shootingPlay && !play.scoringPlay) {
    const pct = s.fgAttempted > 0
      ? Math.round((s.fgMade / s.fgAttempted) * 100)
      : 0;
    return {
      line1: 'MISS',
      line2: `${s.fgMade}/${s.fgAttempted} FG (${pct}%)`,
      color: '#ef4444',
    };
  }

  // Rebounds
  if (REBOUND_IDS.has(tid)) {
    const playText = (play.text || '').toLowerCase();
    const isOff = playText.includes('offensive') || (!playText.includes('defensive') && tid === OFF_REBOUND_ID);
    const specific = isOff ? s.offRebounds : s.defRebounds;
    const abbr = isOff ? 'OREB' : 'DREB';
    return {
      line1: isOff ? 'OFF REB' : 'DEF REB',
      line2: `${specific} ${abbr} · ${s.rebounds} REB`,
      color: '#ffffff',
    };
  }

  // Fouls
  if (FOUL_IDS.has(tid)) {
    return {
      line1: 'FOUL',
      line2: `${s.fouls} PF`,
      color: '#f97316',
    };
  }

  // Turnovers
  if (TURNOVER_IDS.has(tid)) {
    return {
      line1: 'TO',
      line2: `${s.turnovers} TO`,
      color: '#ef4444',
    };
  }

  return null;
}
