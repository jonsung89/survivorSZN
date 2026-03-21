/**
 * Commentary Engine — Pure-function module that analyzes play-by-play data
 * across games and generates contextual commentary items for the live feed.
 *
 * No React dependencies — testable and reusable.
 */
import { parseClockToSeconds, formatClockDuration } from './clockUtils';

// ── Play Type Constants ──────────────────────────────────────────────────
const REBOUND_IDS = new Set(['155', '156']);
const FOUL_IDS = new Set(['42', '43', '44', '45']);
const TURNOVER_IDS = new Set(['62', '63', '84', '86', '90']);
const END_PERIOD_ID = '412';
const TIMEOUT_ID = '16';
const SUBSTITUTION_ID = '18';

// IDs to skip in commentary (no meaningful plays)
const SKIP_IDS = new Set([TIMEOUT_ID, SUBSTITUTION_ID]);

// ── GameState Factory ────────────────────────────────────────────────────
export function createGameState(gameId) {
  return {
    gameId,
    lastProcessedPlayIndex: -1,
    // Lead tracking
    leadChanges: 0,
    currentLeadTeam: null, // teamId or null (tied)
    largestLead: 0,
    largestLeadTeam: null,
    lastTiedScore: null,
    // Run tracking
    runTracker: {
      teamId: null,
      points: 0,
      opponentPoints: 0,
      startClock: null,
      startPeriod: null,
    },
    // Per-player streaks
    playerStreaks: new Map(), // playerId → { consecutiveScores, consecutiveMisses, ... }
    // Per-team tracking
    teamDroughts: new Map(), // teamId → { lastFGClock, lastFGPeriod, missedFGs }
    // Per-player running stats
    playerStats: new Map(), // playerId → { points, fgMade, fgAttempted, threeMade, ... }
    // Recent plays buffer (for block→score, steal→score)
    recentPlays: [], // last 5 plays
    // Comeback tracking
    maxTrailingMargin: new Map(), // teamId → max margin they trailed by
    // Commentary cooldowns
    commentaryCooldowns: new Map(), // `${kind}` → timestamp
    // Track if game started
    hasStarted: false,
    // Period tracking
    lastPeriod: 0,
  };
}

function getOrCreatePlayerStreak(state, playerId) {
  let s = state.playerStreaks.get(playerId);
  if (!s) {
    s = {
      consecutiveScores: 0,
      consecutiveMisses: 0,
      consecutiveFTs: 0,
      consecutiveFTMisses: 0,
      consecutiveAssists: 0,
      assistsWithoutTO: 0,
      lastScoringTeamId: null,
    };
    state.playerStreaks.set(playerId, s);
  }
  return s;
}

function getOrCreatePlayerStats(state, playerId) {
  let s = state.playerStats.get(playerId);
  if (!s) {
    s = {
      points: 0,
      fgMade: 0, fgAttempted: 0,
      threeMade: 0, threeAttempted: 0,
      ftMade: 0, ftAttempted: 0,
      rebounds: 0, offRebounds: 0, defRebounds: 0,
      assists: 0, fouls: 0, turnovers: 0,
      steals: 0, blocks: 0,
    };
    state.playerStats.set(playerId, s);
  }
  return s;
}

function getOrCreateDrought(state, teamId) {
  let d = state.teamDroughts.get(teamId);
  if (!d) {
    d = { lastFGClock: null, lastFGPeriod: null, missedFGs: 0 };
    state.teamDroughts.set(teamId, d);
  }
  return d;
}

// ── Helper: Check if in clutch time ──────────────────────────────────────
function isClutchTime(play, courtType) {
  const period = play.period?.number || play.period;
  const clock = parseClockToSeconds(play.clock?.displayValue || play.clock);
  if (clock == null) return false;

  // NCAAB: 2nd half or OT (period >= 2), last 2 minutes
  // NBA: 4th quarter or OT (period >= 4), last 2 minutes
  const isLate = courtType === 'ncaab' ? period >= 2 : period >= 4;
  return isLate && clock <= 120;
}

function isVeryLate(play, courtType) {
  const period = play.period?.number || play.period;
  const clock = parseClockToSeconds(play.clock?.displayValue || play.clock);
  if (clock == null) return false;
  const isLate = courtType === 'ncaab' ? period >= 2 : period >= 4;
  return isLate && clock <= 60;
}

function isEndOfRegulation(play, courtType) {
  const period = play.period?.number || play.period;
  return courtType === 'ncaab' ? period === 2 : period === 4;
}

// ── Helper: Get elapsed game time between two clock/period combos ────────
function getElapsedSeconds(startClock, startPeriod, endClock, endPeriod, courtType) {
  if (startClock == null || endClock == null) return 0;
  const periodLength = courtType === 'ncaab' ? 1200 : 720; // 20 min halves or 12 min quarters
  const startTotal = (startPeriod - 1) * periodLength + (periodLength - startClock);
  const endTotal = (endPeriod - 1) * periodLength + (periodLength - endClock);
  return Math.max(0, endTotal - startTotal);
}

// ── Cooldown check ───────────────────────────────────────────────────────
function canEmit(state, kind, now, cooldownMs = 12000) {
  const last = state.commentaryCooldowns.get(kind);
  if (last && now - last < cooldownMs) return false;
  state.commentaryCooldowns.set(kind, now);
  return true;
}

// ── Commentary item factory ──────────────────────────────────────────────
function makeCommentary(kind, text, opts = {}) {
  return {
    kind,
    text,
    subtext: opts.subtext || '',
    icon: opts.icon || '',
    priority: opts.priority || 5,
    teamColor: opts.teamColor || null,
    teamLogo: opts.teamLogo || null,
    prospectInfo: opts.prospectInfo || null,
    playerHeadshot: opts.playerHeadshot || null,
    playerTeamColor: opts.playerTeamColor || null,
    playerTeamLogo: opts.playerTeamLogo || null,
    // Play context — score/clock at the time the commentary was triggered
    playHomeScore: opts.playHomeScore ?? null,
    playAwayScore: opts.playAwayScore ?? null,
    playPeriod: opts.playPeriod ?? null,
    playClock: opts.playClock ?? null,
    // If set, this commentary should be merged into the play item instead of shown separately
    mergeWithPlay: opts.mergeWithPlay || false,
    // The play ID this commentary was triggered by (for merging)
    triggerPlayId: opts.triggerPlayId || null,
    // Enrichment type for merged commentary — tells getPlayAction how to weave it in
    enrichType: opts.enrichType || null,
    // Extra data for enrichment (e.g., streak count, milestone value)
    enrichData: opts.enrichData || null,
  };
}

// Get player display name
function playerName(play, idx = 0) {
  const p = play.participants?.[idx];
  if (!p) return '';
  const name = p.shortName || p.name || '';
  return p.jersey ? `#${p.jersey} ${name}` : name;
}

// Extract player visual info from a play for commentary items
function playerVisuals(play, playTeam, idx = 0) {
  const p = play.participants?.[idx];
  if (!p) return {};
  return {
    playerHeadshot: p.headshot || null,
    playerTeamColor: playTeam?.color || null,
    playerTeamLogo: playTeam?.logo || null,
  };
}

function teamName(team) {
  return team?.abbreviation || team?.name || 'Team';
}

// ── Main Analysis Function ───────────────────────────────────────────────
/**
 * Analyze new plays for a single game and return commentary items.
 *
 * @param {Array} allPlays - All plays seen so far for this game (chronological)
 * @param {Object} gameState - Mutable GameState object
 * @param {Object} ctx - { homeTeam, awayTeam, courtType, prospects }
 *   homeTeam/awayTeam: { id, name, abbreviation, logo, color }
 *   prospects: Map<espnPlayerId, prospectInfo>
 * @returns {Array<{kind, text, subtext, icon, priority, teamColor, teamLogo, prospectInfo}>}
 */
export function analyzeNewPlays(allPlays, gameState, ctx) {
  const { homeTeam, awayTeam, courtType = 'ncaab', prospects } = ctx;
  const commentary = [];
  const now = Date.now();

  // Only process new plays
  const startIdx = gameState.lastProcessedPlayIndex + 1;
  if (startIdx >= allPlays.length) return commentary;

  const newPlays = allPlays.slice(startIdx);

  for (const play of newPlays) {
    gameState.lastProcessedPlayIndex++;
    const tid = String(play.typeId || '');

    // Skip administrative plays
    if (SKIP_IDS.has(tid)) continue;

    // Track commentary count so we can stamp play context on new items
    const commentaryStartLen = commentary.length;

    const pid = play.participants?.[0]?.playerId;
    const playTeamId = play.team?.id;
    const playTeam = playTeamId === homeTeam?.id ? homeTeam : playTeamId === awayTeam?.id ? awayTeam : null;
    const otherTeam = playTeam === homeTeam ? awayTeam : homeTeam;
    const homeScore = play.homeScore ?? 0;
    const awayScore = play.awayScore ?? 0;
    const margin = Math.abs(homeScore - awayScore);
    const leadTeamId = homeScore > awayScore ? homeTeam?.id : awayScore > homeScore ? awayTeam?.id : null;
    const clock = parseClockToSeconds(play.clock?.displayValue || play.clock);
    const period = play.period?.number || play.period || 1;
    const playText = (play.text || '').toLowerCase();

    // Update recent plays buffer
    gameState.recentPlays.push(play);
    if (gameState.recentPlays.length > 5) gameState.recentPlays.shift();

    // ── Update player stats ──────────────────────────────────────────
    if (pid) {
      const ps = getOrCreatePlayerStats(gameState, pid);

      if (play.shootingPlay) {
        const pts = play.pointsAttempted || play.scoreValue || 0;
        if (pts === 1) {
          ps.ftAttempted++;
          if (play.scoringPlay) { ps.ftMade++; ps.points += 1; }
        } else {
          ps.fgAttempted++;
          if (pts === 3) ps.threeAttempted++;
          if (play.scoringPlay) {
            ps.fgMade++;
            ps.points += play.scoreValue;
            if (play.scoreValue === 3) ps.threeMade++;
          }
        }
      }
      if (REBOUND_IDS.has(tid) || (!play.shootingPlay && playText.includes('rebound'))) {
        ps.rebounds++;
        if (playText.includes('offensive')) ps.offRebounds++;
        else if (playText.includes('defensive')) ps.defRebounds++;
      }
      if (FOUL_IDS.has(tid) || playText.includes('foul')) ps.fouls++;
      if (TURNOVER_IDS.has(tid) || playText.includes('turnover')) ps.turnovers++;
      if (playText.includes('steal')) ps.steals++;
      if (playText.includes('block')) ps.blocks++;

      // Assist: second participant on a made shot
      if (play.scoringPlay && play.participants?.[1]?.playerId) {
        const assistPid = play.participants[1].playerId;
        getOrCreatePlayerStats(gameState, assistPid).assists++;
      }
    }

    // ── End of Period ────────────────────────────────────────────────
    if (tid === END_PERIOD_ID) {
      const periodText = (play.shortText || play.text || '').toUpperCase();
      if (periodText.includes('HALF') || period === 1) {
        // Halftime
        const hName = teamName(homeTeam);
        const aName = teamName(awayTeam);
        commentary.push(makeCommentary('halftime',
          `HALFTIME: ${homeScore > awayScore ? hName : aName} ${Math.max(homeScore, awayScore)}, ${homeScore > awayScore ? aName : hName} ${Math.min(homeScore, awayScore)}`,
          { icon: '⏸️', priority: 8 }
        ));
      } else if (isEndOfRegulation(play, courtType) && homeScore === awayScore) {
        commentary.push(makeCommentary('overtime',
          `HEADING TO OVERTIME! Tied at ${homeScore}`,
          { icon: '🔥', priority: 10 }
        ));
      }
      gameState.lastPeriod = period;
      continue;
    }

    // ── First points of the game ─────────────────────────────────────
    if (play.scoringPlay && !gameState.hasStarted) {
      gameState.hasStarted = true;
      if (playTeam && canEmit(gameState, 'first_points', now, 0)) {
        commentary.push(makeCommentary('first_points',
          `First points: ${playerName(play)} ${play.scoreValue === 3 ? 'with a three-pointer' : 'puts it in'}`,
          { icon: '🏀', teamColor: playTeam.color, teamLogo: playTeam.logo, priority: 6, ...playerVisuals(play, playTeam) }
        ));
      }
    } else if (play.scoringPlay || play.shootingPlay) {
      gameState.hasStarted = true;
    }

    // ── Lead Change Detection ────────────────────────────────────────
    if (play.scoringPlay && leadTeamId !== gameState.currentLeadTeam) {
      const prevLeader = gameState.currentLeadTeam;
      gameState.currentLeadTeam = leadTeamId;

      if (leadTeamId === null) {
        // Game tied
        if (prevLeader !== null && canEmit(gameState, 'tied', now)) {
          gameState.lastTiedScore = homeScore;
          commentary.push(makeCommentary('tied',
            `We're all tied up at ${homeScore}!`,
            { icon: '⚖️', priority: 7 }
          ));
        }
      } else if (prevLeader !== null && prevLeader !== leadTeamId) {
        // Actual lead change
        gameState.leadChanges++;
        const leaderTeam = leadTeamId === homeTeam?.id ? homeTeam : awayTeam;
        if (canEmit(gameState, 'lead_change', now)) {
          let text = `Lead change! ${teamName(leaderTeam)} takes a ${Math.max(homeScore, awayScore)}-${Math.min(homeScore, awayScore)} lead`;
          if (gameState.leadChanges >= 5) {
            text += ` — ${gameState.leadChanges} lead changes tonight`;
          }
          commentary.push(makeCommentary('lead_change', text, {
            icon: '🔄', teamColor: leaderTeam.color, teamLogo: leaderTeam.logo, priority: 7,
          }));
        }
      }
    }

    // ── Largest Lead ─────────────────────────────────────────────────
    if (play.scoringPlay && margin > gameState.largestLead && margin >= 15) {
      gameState.largestLead = margin;
      gameState.largestLeadTeam = leadTeamId;
      const leaderTeam = leadTeamId === homeTeam?.id ? homeTeam : awayTeam;
      if (canEmit(gameState, 'largest_lead', now, 30000)) {
        commentary.push(makeCommentary('largest_lead',
          `${teamName(leaderTeam)} extends to their largest lead — ${margin} points`,
          { icon: '📈', teamColor: leaderTeam.color, teamLogo: leaderTeam.logo, priority: 5 }
        ));
      }
    }

    // ── Blowout Alert ────────────────────────────────────────────────
    if (play.scoringPlay && margin >= 20) {
      const leaderTeam = leadTeamId === homeTeam?.id ? homeTeam : awayTeam;
      if (canEmit(gameState, 'blowout', now, 60000)) {
        commentary.push(makeCommentary('blowout',
          `This one's getting out of hand — ${teamName(leaderTeam)} leads by ${margin}`,
          { icon: '💨', teamColor: leaderTeam.color, teamLogo: leaderTeam.logo, priority: 4 }
        ));
      }
    }

    // ── Comeback / Momentum Shift ────────────────────────────────────
    if (play.scoringPlay && playTeam) {
      // Track max trailing margin
      const trailingTeamId = leadTeamId && leadTeamId !== playTeam.id ? playTeam.id : null;
      if (trailingTeamId && margin > 0) {
        const prev = gameState.maxTrailingMargin.get(trailingTeamId) || 0;
        if (margin > prev) gameState.maxTrailingMargin.set(trailingTeamId, margin);
      }

      // Check for comeback
      if (leadTeamId === playTeam.id || leadTeamId === null) {
        const wasDown = gameState.maxTrailingMargin.get(playTeam.id) || 0;
        if (wasDown >= 10 && margin <= 2 && canEmit(gameState, 'comeback', now, 30000)) {
          if (leadTeamId === playTeam.id) {
            commentary.push(makeCommentary('comeback',
              `INCREDIBLE COMEBACK! ${teamName(playTeam)} was down ${wasDown} and now leads!`,
              { icon: '🔥', teamColor: playTeam.color, teamLogo: playTeam.logo, priority: 9 }
            ));
          } else {
            commentary.push(makeCommentary('comeback',
              `${teamName(playTeam)} fights back from ${wasDown} down to tie it!`,
              { icon: '🔥', teamColor: playTeam.color, teamLogo: playTeam.logo, priority: 9 }
            ));
          }
        }
      }
    }

    // ── Scoring Run Detection ────────────────────────────────────────
    // Emit run commentary when the RUNNING team scores (not when opponent breaks it)
    if (play.scoringPlay && playTeam) {
      const run = gameState.runTracker;
      if (run.teamId === playTeam.id) {
        // Same team scoring — extend the run
        run.points += play.scoreValue || 0;

        // Emit commentary on the running team's score when they hit 8+ points
        const elapsed = getElapsedSeconds(run.startClock, run.startPeriod, clock, period, courtType);
        const timeStr = elapsed > 0 ? ` over the last ${formatClockDuration(elapsed)}` : '';
        if (run.points >= 8 && run.opponentPoints <= 2 && canEmit(gameState, 'run', now, 15000)) {
          const runTeam = run.teamId === homeTeam?.id ? homeTeam : awayTeam;
          const runText = run.opponentPoints === 0
            ? `${teamName(runTeam)} on a ${run.points}-0 run${timeStr}`
            : `${teamName(runTeam)} on a ${run.points}-${run.opponentPoints} run${timeStr}`;
          commentary.push(makeCommentary('run', runText, {
            icon: '🏃', teamColor: runTeam.color, teamLogo: runTeam.logo, priority: 7,
          }));
        }
      } else if (run.teamId === null) {
        // Start new run
        run.teamId = playTeam.id;
        run.points = play.scoreValue || 0;
        run.opponentPoints = 0;
        run.startClock = clock;
        run.startPeriod = period;
      } else {
        // Other team scored — track opponent points in the run
        run.opponentPoints += play.scoreValue || 0;

        // If opponent has scored enough, the run is over
        if (run.opponentPoints > 4) {
          // Start new run for this team
          run.teamId = playTeam.id;
          run.points = play.scoreValue || 0;
          run.opponentPoints = 0;
          run.startClock = clock;
          run.startPeriod = period;
        }
      }
    } else if (play.scoringPlay && !playTeam) {
      // Unknown team scored — break any run
      gameState.runTracker.teamId = null;
    }

    // ── Player Scoring Streak (field goals only, not free throws) ───
    const isFreeThrow = play.pointsAttempted === 1 || play.scoreValue === 1;
    if (pid && play.shootingPlay && !isFreeThrow && playTeam) {
      const streak = getOrCreatePlayerStreak(gameState, pid);
      const ps = getOrCreatePlayerStats(gameState, pid);

      if (play.scoringPlay && play.scoreValue >= 2) {
        streak.consecutiveScores++;
        streak.consecutiveMisses = 0;

        if (streak.consecutiveScores >= 3 && canEmit(gameState, `streak_${pid}`, now)) {
          commentary.push(makeCommentary('player_streak',
            `${playerName(play)} is on fire — ${streak.consecutiveScores} straight buckets (${ps.points} PTS)`,
            { icon: '🔥', teamColor: playTeam.color, teamLogo: playTeam.logo, priority: 7,
              mergeWithPlay: true, triggerPlayId: play.id,
              enrichType: 'hot_streak', enrichData: { count: streak.consecutiveScores, points: ps.points },
              ...playerVisuals(play, playTeam) }
          ));
        }
      } else if (!play.scoringPlay) {
        streak.consecutiveMisses++;
        streak.consecutiveScores = 0;

        if (streak.consecutiveMisses >= 4 && canEmit(gameState, `cold_${pid}`, now, 20000)) {
          const fgLine = ps.fgAttempted > 0 ? `${ps.fgMade}/${ps.fgAttempted}` : '';
          commentary.push(makeCommentary('player_cold',
            `${playerName(play)} has missed ${streak.consecutiveMisses} straight from the field (${fgLine} FG)`,
            { icon: '❄️', teamColor: playTeam.color, teamLogo: playTeam.logo, priority: 4,
              mergeWithPlay: true, triggerPlayId: play.id,
              enrichType: 'cold_streak', enrichData: { count: streak.consecutiveMisses, fg: fgLine },
              ...playerVisuals(play, playTeam) }
          ));
        }
      }
    }

    // ── Free Throw Streaks ───────────────────────────────────────────
    if (pid && play.shootingPlay && (play.pointsAttempted === 1 || play.scoreValue === 1)) {
      const streak = getOrCreatePlayerStreak(gameState, pid);
      const ps = getOrCreatePlayerStats(gameState, pid);

      if (play.scoringPlay) {
        streak.consecutiveFTs++;
        streak.consecutiveFTMisses = 0;
        if (streak.consecutiveFTs >= 8 && canEmit(gameState, `ft_streak_${pid}`, now, 20000)) {
          commentary.push(makeCommentary('ft_streak',
            `Perfect from the line — ${playerName(play)} is ${ps.ftMade}/${ps.ftAttempted} FT`,
            { icon: '🎯', priority: 4,
              mergeWithPlay: true, triggerPlayId: play.id,
              enrichType: 'ft_perfect', enrichData: { made: ps.ftMade, attempted: ps.ftAttempted },
              ...playerVisuals(play, playTeam) }
          ));
        }
      } else {
        streak.consecutiveFTMisses++;
        streak.consecutiveFTs = 0;
        if (streak.consecutiveFTMisses >= 3 && canEmit(gameState, `ft_miss_${pid}`, now, 20000)) {
          commentary.push(makeCommentary('ft_drought',
            `Struggling at the line — ${playerName(play)} has missed ${streak.consecutiveFTMisses} straight free throws`,
            { icon: '😬', priority: 4,
              mergeWithPlay: true, triggerPlayId: play.id,
              enrichType: 'ft_cold', enrichData: { count: streak.consecutiveFTMisses },
              ...playerVisuals(play, playTeam) }
          ));
        }
      }
    }

    // ── Scoring Milestone ────────────────────────────────────────────
    if (pid && play.scoringPlay) {
      const ps = getOrCreatePlayerStats(gameState, pid);
      const milestones = [40, 35, 30, 25, 20];
      for (const m of milestones) {
        if (ps.points >= m && ps.points - (play.scoreValue || 0) < m) {
          if (canEmit(gameState, `milestone_${pid}_${m}`, now, 0)) {
            commentary.push(makeCommentary('scoring_milestone',
              `${playerName(play)} now has ${ps.points} POINTS tonight!`,
              { icon: m >= 30 ? '💥' : '⭐', teamColor: playTeam?.color, teamLogo: playTeam?.logo, priority: m >= 30 ? 9 : 7,
                mergeWithPlay: true, triggerPlayId: play.id,
                enrichType: 'milestone', enrichData: { points: ps.points, milestone: m },
                ...playerVisuals(play, playTeam) }
            ));
          }
          break;
        }
      }
    }

    // ── Perfect Shooting ─────────────────────────────────────────────
    if (pid && play.scoringPlay && play.shootingPlay && play.scoreValue >= 2) {
      const ps = getOrCreatePlayerStats(gameState, pid);
      if (ps.fgMade >= 5 && ps.fgMade === ps.fgAttempted && canEmit(gameState, `perfect_${pid}`, now, 30000)) {
        commentary.push(makeCommentary('perfect_shooting',
          `${playerName(play)} is ${ps.fgMade}-for-${ps.fgAttempted} from the field — hasn't missed!`,
          { icon: '🎯', teamColor: playTeam?.color, teamLogo: playTeam?.logo, priority: 6,
            mergeWithPlay: true, triggerPlayId: play.id,
            enrichType: 'perfect_fg', enrichData: { made: ps.fgMade, attempted: ps.fgAttempted },
            ...playerVisuals(play, playTeam) }
        ));
      }
    }

    // ── Assist Streak ────────────────────────────────────────────────
    if (play.scoringPlay && play.participants?.[1]?.playerId) {
      const assistPid = play.participants[1].playerId;
      const streak = getOrCreatePlayerStreak(gameState, assistPid);
      streak.assistsWithoutTO++;
      if (streak.assistsWithoutTO >= 4 && canEmit(gameState, `ast_streak_${assistPid}`, now, 20000)) {
        const ps = getOrCreatePlayerStats(gameState, assistPid);
        const assister = play.participants[1];
        const name = assister.jersey ? `#${assister.jersey} ${assister.shortName || ''}` : (assister.shortName || '');
        commentary.push(makeCommentary('assist_streak',
          `${name} has ${streak.assistsWithoutTO} straight assists with no turnovers (${ps.assists} AST)`,
          { icon: '🎯', priority: 5, ...playerVisuals(play, playTeam, 1) }
        ));
      }
    }
    // Reset assist streak on turnover
    if (pid && (TURNOVER_IDS.has(tid) || playText.includes('turnover'))) {
      const streak = getOrCreatePlayerStreak(gameState, pid);
      streak.assistsWithoutTO = 0;
    }

    // ── Scoring Drought ──────────────────────────────────────────────
    if (playTeam) {
      const drought = getOrCreateDrought(gameState, playTeam.id);
      if (play.shootingPlay && play.scoringPlay && play.scoreValue >= 2) {
        // Made FG — check if drought was significant
        if (drought.lastFGClock != null && drought.missedFGs >= 5) {
          const elapsed = getElapsedSeconds(drought.lastFGClock, drought.lastFGPeriod, clock, period, courtType);
          if (elapsed >= 180 && canEmit(gameState, `drought_end_${playTeam.id}`, now)) {
            commentary.push(makeCommentary('drought_end',
              `${teamName(playTeam)} finally breaks through! No field goal for ${formatClockDuration(elapsed)}`,
              { icon: '💧', teamColor: playTeam.color, teamLogo: playTeam.logo, priority: 6 }
            ));
          }
        }
        drought.lastFGClock = clock;
        drought.lastFGPeriod = period;
        drought.missedFGs = 0;
      } else if (play.shootingPlay && !play.scoringPlay && play.pointsAttempted !== 1) {
        // Missed FG (not FT)
        drought.missedFGs++;
        if (drought.lastFGClock != null) {
          const elapsed = getElapsedSeconds(drought.lastFGClock, drought.lastFGPeriod, clock, period, courtType);
          if (elapsed >= 180 && drought.missedFGs >= 5 && canEmit(gameState, `drought_${playTeam.id}`, now, 20000)) {
            commentary.push(makeCommentary('scoring_drought',
              `${teamName(playTeam)} without a field goal for ${formatClockDuration(elapsed)}`,
              { icon: '🧊', teamColor: playTeam.color, teamLogo: playTeam.logo, priority: 6 }
            ));
          }
        }
      }
    }

    // ── Double-Double / Triple-Double Watch ──────────────────────────
    if (pid && play.scoringPlay) {
      const ps = getOrCreatePlayerStats(gameState, pid);
      const cats = [
        { val: ps.points, label: 'pts' },
        { val: ps.rebounds, label: 'reb' },
        { val: ps.assists, label: 'ast' },
        { val: ps.steals, label: 'stl' },
        { val: ps.blocks, label: 'blk' },
      ];
      const doubleDigit = cats.filter(c => c.val >= 10);
      const nearDouble = cats.filter(c => c.val >= 8);

      if (doubleDigit.length >= 2 && nearDouble.length >= 3 && canEmit(gameState, `triple_watch_${pid}`, now, 45000)) {
        const statLine = cats.filter(c => c.val >= 6).map(c => `${c.val} ${c.label}`).join(', ');
        commentary.push(makeCommentary('triple_double_watch',
          `Triple-double watch: ${playerName(play)} with ${statLine}`,
          { icon: '👀', teamColor: playTeam?.color, teamLogo: playTeam?.logo, priority: 8, ...playerVisuals(play, playTeam) }
        ));
      } else if (doubleDigit.length === 1 && nearDouble.length >= 2 && canEmit(gameState, `double_watch_${pid}`, now, 45000)) {
        const statLine = cats.filter(c => c.val >= 8).map(c => `${c.val} ${c.label}`).join(', ');
        commentary.push(makeCommentary('double_double_watch',
          `${playerName(play)} closing in on a double-double — ${statLine}`,
          { icon: '👀', teamColor: playTeam?.color, teamLogo: playTeam?.logo, priority: 5, ...playerVisuals(play, playTeam) }
        ));
      }
    }

    // ── Block → Score / Steal → Score ────────────────────────────────
    if (play.scoringPlay && playTeam && gameState.recentPlays.length >= 2) {
      const prev = gameState.recentPlays[gameState.recentPlays.length - 2];
      const prevText = (prev?.text || '').toLowerCase();
      const prevTeamId = prev?.team?.id;

      // Block by same team → fast break score
      if (prevText.includes('block') && prevTeamId === playTeam.id && canEmit(gameState, 'block_score', now)) {
        commentary.push(makeCommentary('block_and_score',
          `BLOCK and score! ${teamName(playTeam)} converts on the other end!`,
          { icon: '🚫', teamColor: playTeam.color, teamLogo: playTeam.logo, priority: 7 }
        ));
      }

      // Steal/turnover → fast break score
      if ((prevText.includes('steal') || prevText.includes('turnover')) && prevTeamId !== playTeam.id && canEmit(gameState, 'steal_score', now)) {
        commentary.push(makeCommentary('steal_and_score',
          `Steal and score! Transition bucket for ${teamName(playTeam)}`,
          { icon: '💨', teamColor: playTeam.color, teamLogo: playTeam.logo, priority: 6 }
        ));
      }
    }

    // ── And-One Detection ────────────────────────────────────────────
    if (play.scoringPlay && play.shootingPlay && play.scoreValue >= 2 && playTeam) {
      if (playText.includes('and one') || playText.includes('and-one') || playText.includes('and 1')) {
        if (canEmit(gameState, 'and_one', now)) {
          commentary.push(makeCommentary('and_one',
            `AND ONE! ${playerName(play)} scores through contact`,
            { icon: '💪', teamColor: playTeam.color, teamLogo: playTeam.logo, priority: 7,
              mergeWithPlay: true, triggerPlayId: play.id,
              enrichType: 'and_one',
              ...playerVisuals(play, playTeam) }
          ));
        }
      }
    }

    // ── Buzzer Beater ────────────────────────────────────────────────
    // Only field goals (not free throws) at 0:00 or 0:01 — actual buzzer beaters
    if (play.scoringPlay && play.scoreValue >= 2 && clock != null && clock <= 1) {
      if (canEmit(gameState, 'buzzer_beater', now, 0)) {
        const periodLabel = period === 1 ? 'the first half' : period === 2 ? 'the second half' : `OT${period - 2}`;
        const shotDesc = play.scoreValue === 3 ? 'THREE at the buzzer' : 'BUZZER BEATER';
        commentary.push(makeCommentary('buzzer_beater',
          `${shotDesc} by ${playerName(play)} at the end of ${periodLabel}!`,
          { icon: '🚨', teamColor: playTeam?.color, teamLogo: playTeam?.logo, priority: 10,
            mergeWithPlay: true, triggerPlayId: play.id,
            enrichType: 'buzzer_beater', enrichData: { periodLabel },
            ...playerVisuals(play, playTeam) }
        ));
      }
    }

    // ── Clutch Time ──────────────────────────────────────────────────
    if (isClutchTime(play, courtType) && margin <= 5) {
      // Entry into clutch time
      if (canEmit(gameState, 'clutch_entry', now, 60000)) {
        const leaderTeam = leadTeamId === homeTeam?.id ? homeTeam : awayTeam;
        const clockDisplay = play.clock?.displayValue || play.clock || '';
        if (leadTeamId) {
          commentary.push(makeCommentary('clutch_time',
            `CLUTCH TIME — ${teamName(leaderTeam)} leads by ${margin} with ${clockDisplay} remaining!`,
            { icon: '⏱️', priority: 9 }
          ));
        } else {
          commentary.push(makeCommentary('clutch_time',
            `CLUTCH TIME — Tied at ${homeScore} with ${clockDisplay} left!`,
            { icon: '⏱️', priority: 9 }
          ));
        }
      }

      // Game-tying shot
      if (play.scoringPlay && homeScore === awayScore && isVeryLate(play, courtType)) {
        if (canEmit(gameState, 'game_tying', now, 0)) {
          const clockDisplay = play.clock?.displayValue || play.clock || '';
          const shotType = play.scoreValue === 3 ? 'Three-pointer' : 'Basket';
          commentary.push(makeCommentary('game_tying',
            `GAME TIED! ${shotType} by ${playerName(play)} with ${clockDisplay} remaining!`,
            { icon: '🚨', teamColor: playTeam?.color, teamLogo: playTeam?.logo, priority: 10,
              mergeWithPlay: true, triggerPlayId: play.id,
              enrichType: 'game_tying', enrichData: { clockDisplay },
              ...playerVisuals(play, playTeam) }
          ));
        }
      }

      // Go-ahead bucket — only when the scoring team actually TAKES the lead
      // (they must have been tied or trailing before this play)
      if (play.scoringPlay && leadTeamId === playTeam?.id &&
          gameState.currentLeadTeam !== playTeam?.id &&
          clock != null && clock <= 30) {
        if (canEmit(gameState, 'go_ahead', now, 0)) {
          const clockDisplay = play.clock?.displayValue || play.clock || '';
          commentary.push(makeCommentary('go_ahead',
            `GO-AHEAD BUCKET by ${playerName(play)} with ${clockDisplay} left!`,
            { icon: '🚨', teamColor: playTeam?.color, teamLogo: playTeam?.logo, priority: 10,
              mergeWithPlay: true, triggerPlayId: play.id,
              enrichType: 'go_ahead', enrichData: { clockDisplay },
              ...playerVisuals(play, playTeam) }
          ));
        }
      }

      // Clutch turnover
      if ((TURNOVER_IDS.has(tid) || playText.includes('turnover')) && margin <= 3 && isVeryLate(play, courtType)) {
        if (canEmit(gameState, 'clutch_turnover', now)) {
          const clockDisplay = play.clock?.displayValue || play.clock || '';
          commentary.push(makeCommentary('clutch_turnover',
            `Costly turnover! ${teamName(playTeam)} gives it away with ${clockDisplay} left`,
            { icon: '😱', teamColor: playTeam?.color, teamLogo: playTeam?.logo, priority: 8 }
          ));
        }
      }

      // Clutch steal
      if (playText.includes('steal') && margin <= 3 && isVeryLate(play, courtType)) {
        if (canEmit(gameState, 'clutch_steal', now)) {
          const clockDisplay = play.clock?.displayValue || play.clock || '';
          commentary.push(makeCommentary('clutch_steal',
            `HUGE STEAL! ${teamName(playTeam)} takes it with ${clockDisplay} remaining`,
            { icon: '🔥', teamColor: playTeam?.color, teamLogo: playTeam?.logo, priority: 9 }
          ));
        }
      }
    }

    // ── NBA Prospect Detection ───────────────────────────────────────
    if (pid && prospects && prospects.size > 0) {
      const prospect = prospects.get(String(pid));
      if (prospect) {
        const ps = getOrCreatePlayerStats(gameState, pid);

        // Prospect scoring play
        if (play.scoringPlay && canEmit(gameState, `prospect_${pid}`, now, 15000)) {
          let statLine = `${ps.points} PTS`;
          if (play.scoreValue === 3) {
            statLine += ` · ${ps.threeMade}/${ps.threeAttempted} 3PT`;
            if (ps.threeAttempted >= 3) {
              statLine += ` (${Math.round(ps.threeMade / ps.threeAttempted * 100)}%)`;
            }
          }
          statLine += ` · ${ps.fgMade}/${ps.fgAttempted} FG`;

          commentary.push(makeCommentary('prospect',
            `#${prospect.rank} Pick ${prospect.name} ${play.scoreValue === 3 ? 'drains a three' : 'scores'} — ${statLine}`,
            {
              icon: '🏀',
              teamColor: playTeam?.color,
              teamLogo: playTeam?.logo,
              priority: 7,
              prospectInfo: { rank: prospect.rank, name: prospect.name },
              ...playerVisuals(play, playTeam),
            }
          ));
        }

        // Prospect milestone
        if (play.scoringPlay) {
          const prospectMilestones = [30, 25, 20, 15];
          for (const m of prospectMilestones) {
            if (ps.points >= m && ps.points - (play.scoreValue || 0) < m) {
              if (canEmit(gameState, `prospect_milestone_${pid}_${m}`, now, 0)) {
                commentary.push(makeCommentary('prospect_milestone',
                  `Draft stock ${m >= 25 ? 'soaring' : 'rising'}! ${prospect.name} up to ${ps.points} points`,
                  {
                    icon: '📈',
                    teamColor: playTeam?.color,
                    teamLogo: playTeam?.logo,
                    priority: 8,
                    prospectInfo: { rank: prospect.rank, name: prospect.name },
                    ...playerVisuals(play, playTeam),
                  }
                ));
              }
              break;
            }
          }
        }

        // Prospect big defensive play
        if ((playText.includes('block') || playText.includes('steal')) && canEmit(gameState, `prospect_def_${pid}`, now, 20000)) {
          const playType = playText.includes('block') ? 'block' : 'steal';
          const ps2 = getOrCreatePlayerStats(gameState, pid);
          const statLabel = playType === 'block' ? `${ps2.blocks} BLK` : `${ps2.steals} STL`;
          commentary.push(makeCommentary('prospect',
            `Prospect Watch: ${prospect.name} with the ${playType}! (${statLabel})`,
            {
              icon: '🏀',
              teamColor: playTeam?.color,
              teamLogo: playTeam?.logo,
              priority: 6,
              prospectInfo: { rank: prospect.rank, name: prospect.name },
              ...playerVisuals(play, playTeam),
            }
          ));
        }
      }
    }

    // ── Game Final ───────────────────────────────────────────────────
    if (tid === END_PERIOD_ID) {
      const periodText = (play.shortText || play.text || '').toUpperCase();
      if (periodText.includes('GAME') || periodText.includes('FINAL')) {
        const winner = homeScore > awayScore ? homeTeam : awayTeam;
        const loser = homeScore > awayScore ? awayTeam : homeTeam;
        const wScore = Math.max(homeScore, awayScore);
        const lScore = Math.min(homeScore, awayScore);
        commentary.push(makeCommentary('game_final',
          `FINAL: ${teamName(winner)} ${wScore}, ${teamName(loser)} ${lScore}`,
          { icon: '🏁', teamColor: winner?.color, teamLogo: winner?.logo, priority: 10 }
        ));
      }
    }

    // Stamp play context (score/clock at this play) onto any commentary items generated
    const playHomeScore = play.homeScore ?? 0;
    const playAwayScore = play.awayScore ?? 0;
    const playPeriod = play.period;
    const playClock = play.clock;
    for (let ci = commentaryStartLen; ci < commentary.length; ci++) {
      commentary[ci].playHomeScore = playHomeScore;
      commentary[ci].playAwayScore = playAwayScore;
      commentary[ci].playPeriod = playPeriod;
      commentary[ci].playClock = playClock;
    }
  }

  return commentary;
}

/**
 * Get a player's current stat line for display in feed items.
 */
export function getPlayerStatLine(gameState, playerId, play) {
  const ps = gameState?.playerStats?.get(playerId);
  if (!ps) return null;

  const playText = ((play?.shortText || '') + ' ' + (play?.text || '')).toLowerCase();
  const isSteal = playText.includes('steal');
  const isBlock = playText.includes('block');
  const isTurnover = playText.includes('turnover');

  const parts = [];

  // For scoring plays, lead with points and shooting
  if (play?.scoringPlay) {
    if (ps.points > 0) parts.push(`${ps.points} PTS`);
    if (play.scoreValue === 3 && ps.threeAttempted > 0) {
      const pct = Math.round(ps.threeMade / ps.threeAttempted * 100);
      parts.push(`3PT ${ps.threeMade}/${ps.threeAttempted} (${pct}%)`);
    }
    if (ps.fgAttempted > 0 && play.scoreValue !== 3) {
      parts.push(`FG ${ps.fgMade}/${ps.fgAttempted}`);
    }
    if (ps.rebounds >= 3) parts.push(`${ps.rebounds} REB`);
    if (ps.assists >= 2) parts.push(`${ps.assists} AST`);
  }
  // For steals, lead with steal count
  else if (isSteal) {
    if (ps.steals > 0) parts.push(`${ps.steals} STL`);
    if (ps.points > 0) parts.push(`${ps.points} PTS`);
  }
  // For blocks, lead with block count
  else if (isBlock) {
    if (ps.blocks > 0) parts.push(`${ps.blocks} BLK`);
    if (ps.points > 0) parts.push(`${ps.points} PTS`);
  }
  // For turnovers, show TO count and points
  else if (isTurnover) {
    if (ps.turnovers > 0) parts.push(`${ps.turnovers} TO`);
    if (ps.points > 0) parts.push(`${ps.points} PTS`);
    if (ps.fgAttempted > 0) parts.push(`FG ${ps.fgMade}/${ps.fgAttempted}`);
  }

  return parts.length > 0 ? parts.join(' · ') : null;
}
