const express = require('express');
const router = express.Router();
const { db } = require('../db/supabase');
const { authMiddleware } = require('../middleware/auth');
const { getTournamentBracket, getTeamBreakdown, getMatchupPrediction, getTournamentResults, getSelectionSundayDate, generateConciseReport, generateAllReports, getStoredReport } = require('../services/ncaab-tournament');
const { SCORING_PRESETS, ROUND_BOUNDARIES, calculateBracketScore, calculatePotentialPoints, getSlotRound, countPicks } = require('../utils/bracket-slots');

// Total games in the bracket (derived from round boundaries)
const TOTAL_BRACKET_GAMES = ROUND_BOUNDARIES[ROUND_BOUNDARIES.length - 1].end;

const getUser = async (req) => {
  return db.getOne('SELECT * FROM users WHERE firebase_uid = $1', [req.firebaseUser.uid]);
};

// ─── Challenge Management (Commissioner) ─────────────────────────────────────

// Create bracket challenge for a league
router.post('/challenges', authMiddleware, async (req, res) => {
  try {
    const user = await getUser(req);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const { leagueId, maxBracketsPerUser = 1, scoringPreset = 'standard', customScoring, tiebreakerType = 'total_score', entryDeadline, entryFee } = req.body;

    // Validate league exists and user is commissioner
    const league = await db.getOne('SELECT * FROM leagues WHERE id = $1', [leagueId]);
    if (!league) return res.status(404).json({ error: 'League not found' });
    if (league.commissioner_id !== user.id) return res.status(403).json({ error: 'Only the commissioner can create a bracket challenge' });
    if (league.sport_id !== 'ncaab') return res.status(400).json({ error: 'Bracket challenges are only available for NCAAB leagues' });

    // Determine scoring system
    let scoringSystem;
    if (scoringPreset === 'custom' && Array.isArray(customScoring) && customScoring.length === 6) {
      scoringSystem = customScoring.map(n => parseInt(n) || 0);
    } else {
      scoringSystem = SCORING_PRESETS[scoringPreset]?.points || SCORING_PRESETS.standard.points;
    }

    // Fetch tournament data from ESPN
    const tournamentData = await getTournamentBracket(league.season);

    const parsedFee = parseFloat(entryFee) || 0;

    const challenge = await db.getOne(`
      INSERT INTO bracket_challenges (league_id, season, max_brackets_per_user, scoring_preset, scoring_system, tiebreaker_type, entry_deadline, entry_fee, tournament_data, status)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'open')
      RETURNING *
    `, [leagueId, league.season, maxBracketsPerUser, scoringPreset, JSON.stringify(scoringSystem), tiebreakerType, entryDeadline || null, parsedFee, JSON.stringify(tournamentData)]);

    // Keep league entry_fee in sync
    if (parsedFee > 0) {
      await db.run('UPDATE leagues SET entry_fee = $1 WHERE id = $2', [parsedFee, leagueId]);
    }

    res.json({ success: true, challenge });
  } catch (error) {
    if (error.code === '23505') {
      return res.status(409).json({ error: 'A bracket challenge already exists for this league and season' });
    }
    console.error('Error creating bracket challenge:', error);
    res.status(500).json({ error: 'Failed to create bracket challenge' });
  }
});

// Update bracket challenge settings
router.put('/challenges/:challengeId', authMiddleware, async (req, res) => {
  try {
    const user = await getUser(req);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const challenge = await db.getOne('SELECT bc.*, l.commissioner_id FROM bracket_challenges bc JOIN leagues l ON bc.league_id = l.id WHERE bc.id = $1', [req.params.challengeId]);
    if (!challenge) return res.status(404).json({ error: 'Challenge not found' });
    if (challenge.commissioner_id !== user.id) return res.status(403).json({ error: 'Only the commissioner can update settings' });
    if (challenge.status !== 'open') return res.status(400).json({ error: 'Cannot update a locked or completed challenge' });

    const { maxBracketsPerUser, scoringPreset, customScoring, tiebreakerType, entryDeadline, entryFee } = req.body;
    const updates = [];
    const values = [];
    let idx = 1;

    if (maxBracketsPerUser !== undefined) {
      updates.push(`max_brackets_per_user = $${idx++}`);
      values.push(maxBracketsPerUser);
    }
    if (scoringPreset !== undefined) {
      updates.push(`scoring_preset = $${idx++}`);
      values.push(scoringPreset);

      let scoringSystem;
      if (scoringPreset === 'custom' && Array.isArray(customScoring) && customScoring.length === 6) {
        scoringSystem = customScoring.map(n => parseInt(n) || 0);
      } else {
        scoringSystem = SCORING_PRESETS[scoringPreset]?.points || SCORING_PRESETS.standard.points;
      }
      updates.push(`scoring_system = $${idx++}`);
      values.push(JSON.stringify(scoringSystem));
    }
    if (tiebreakerType !== undefined) {
      updates.push(`tiebreaker_type = $${idx++}`);
      values.push(tiebreakerType);
    }
    if (entryDeadline !== undefined) {
      updates.push(`entry_deadline = $${idx++}`);
      values.push(entryDeadline);
    }
    if (entryFee !== undefined) {
      updates.push(`entry_fee = $${idx++}`);
      values.push(parseFloat(entryFee) || 0);
    }

    if (!updates.length) return res.status(400).json({ error: 'No fields to update' });

    updates.push(`updated_at = NOW()`);
    values.push(req.params.challengeId);

    const updated = await db.getOne(`UPDATE bracket_challenges SET ${updates.join(', ')} WHERE id = $${idx} RETURNING *`, values);

    // Keep league entry_fee in sync
    if (entryFee !== undefined) {
      await db.run('UPDATE leagues SET entry_fee = $1 WHERE id = $2', [parseFloat(entryFee) || 0, updated.league_id]);
    }

    res.json({ success: true, challenge: updated });
  } catch (error) {
    console.error('Error updating bracket challenge:', error);
    res.status(500).json({ error: 'Failed to update bracket challenge' });
  }
});

// Get bracket challenge for a league
router.get('/challenges/league/:leagueId', authMiddleware, async (req, res) => {
  try {
    const user = await getUser(req);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const challenge = await db.getOne('SELECT * FROM bracket_challenges WHERE league_id = $1 ORDER BY season DESC LIMIT 1', [req.params.leagueId]);
    if (!challenge) return res.json({ challenge: null });

    // Auto-refresh tournament data if stale (fewer than 64 teams means bracket wasn't released yet when challenge was created)
    const storedTeams = Object.keys(challenge.tournament_data?.teams || {}).length;
    if (storedTeams < 64) {
      try {
        const freshData = await getTournamentBracket(challenge.season);
        const freshTeams = Object.keys(freshData.teams || {}).length;
        if (freshTeams >= 64) {
          await db.query('UPDATE bracket_challenges SET tournament_data = $1 WHERE id = $2', [JSON.stringify(freshData), challenge.id]);
          challenge.tournament_data = freshData;
          console.log(`Refreshed tournament data for challenge ${challenge.id}: ${storedTeams} → ${freshTeams} teams`);
        }
      } catch (refreshErr) {
        console.error('Failed to refresh tournament data:', refreshErr.message);
      }
    }

    // Get user's brackets
    const myBrackets = await db.getAll('SELECT * FROM brackets WHERE challenge_id = $1 AND user_id = $2 ORDER BY bracket_number', [challenge.id, user.id]);

    // Get bracket count per challenge
    const bracketCount = await db.getOne('SELECT COUNT(*) as count FROM brackets WHERE challenge_id = $1', [challenge.id]);

    res.json({
      challenge: {
        ...challenge,
        tournament_data: challenge.tournament_data,
        scoring_system: challenge.scoring_system,
      },
      myBrackets,
      totalBrackets: parseInt(bracketCount?.count || 0),
    });
  } catch (error) {
    console.error('Error fetching bracket challenge:', error);
    res.status(500).json({ error: 'Failed to fetch bracket challenge' });
  }
});

// Get bracket challenge by ID
router.get('/challenges/:challengeId', authMiddleware, async (req, res) => {
  try {
    const user = await getUser(req);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const challenge = await db.getOne('SELECT * FROM bracket_challenges WHERE id = $1', [req.params.challengeId]);
    if (!challenge) return res.status(404).json({ error: 'Challenge not found' });

    // Auto-refresh tournament data if stale
    const storedTeams = Object.keys(challenge.tournament_data?.teams || {}).length;
    if (storedTeams < 64) {
      try {
        const freshData = await getTournamentBracket(challenge.season);
        const freshTeams = Object.keys(freshData.teams || {}).length;
        if (freshTeams >= 64) {
          await db.query('UPDATE bracket_challenges SET tournament_data = $1 WHERE id = $2', [JSON.stringify(freshData), challenge.id]);
          challenge.tournament_data = freshData;
          console.log(`Refreshed tournament data for challenge ${challenge.id}: ${storedTeams} → ${freshTeams} teams`);
        }
      } catch (refreshErr) {
        console.error('Failed to refresh tournament data:', refreshErr.message);
      }
    }

    const myBrackets = await db.getAll('SELECT * FROM brackets WHERE challenge_id = $1 AND user_id = $2 ORDER BY bracket_number', [challenge.id, user.id]);
    const results = await db.getAll('SELECT * FROM bracket_results WHERE challenge_id = $1', [challenge.id]);

    const resultsMap = {};
    for (const r of results) {
      resultsMap[r.slot_number] = r;
    }

    res.json({ challenge, myBrackets, results: resultsMap });
  } catch (error) {
    console.error('Error fetching challenge:', error);
    res.status(500).json({ error: 'Failed to fetch challenge' });
  }
});

// ─── Bracket CRUD (Users) ────────────────────────────────────────────────────

// Create a new bracket
router.post('/challenges/:challengeId/brackets', authMiddleware, async (req, res) => {
  try {
    const user = await getUser(req);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const challenge = await db.getOne('SELECT * FROM bracket_challenges WHERE id = $1', [req.params.challengeId]);
    if (!challenge) return res.status(404).json({ error: 'Challenge not found' });
    if (challenge.status !== 'open') return res.status(400).json({ error: 'This bracket challenge is no longer accepting entries' });

    // Check entry deadline
    if (challenge.entry_deadline && new Date() > new Date(challenge.entry_deadline)) {
      return res.status(400).json({ error: 'Entry deadline has passed' });
    }

    // Verify user is league member
    const member = await db.getOne('SELECT * FROM league_members WHERE league_id = $1 AND user_id = $2', [challenge.league_id, user.id]);
    if (!member) return res.status(403).json({ error: 'You must be a league member to create a bracket' });

    // Check bracket count limit
    const existing = await db.getAll('SELECT * FROM brackets WHERE challenge_id = $1 AND user_id = $2', [challenge.id, user.id]);
    if (existing.length >= challenge.max_brackets_per_user) {
      return res.status(400).json({ error: `Maximum of ${challenge.max_brackets_per_user} bracket(s) allowed per user` });
    }

    const bracketNumber = existing.length + 1;
    const { name } = req.body;

    const bracket = await db.getOne(`
      INSERT INTO brackets (challenge_id, user_id, bracket_number, name, picks)
      VALUES ($1, $2, $3, $4, '{}')
      RETURNING *
    `, [challenge.id, user.id, bracketNumber, name || `Bracket ${bracketNumber}`]);

    res.json({ success: true, bracket });
  } catch (error) {
    console.error('Error creating bracket:', error);
    res.status(500).json({ error: 'Failed to create bracket' });
  }
});

// Update bracket picks
router.put('/:bracketId', authMiddleware, async (req, res) => {
  try {
    const user = await getUser(req);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const bracket = await db.getOne('SELECT b.*, bc.status as challenge_status, bc.entry_deadline FROM brackets b JOIN bracket_challenges bc ON b.challenge_id = bc.id WHERE b.id = $1', [req.params.bracketId]);
    if (!bracket) return res.status(404).json({ error: 'Bracket not found' });
    if (bracket.user_id !== user.id) return res.status(403).json({ error: 'Not your bracket' });
    if (bracket.is_submitted) return res.status(400).json({ error: 'Bracket has already been submitted and cannot be edited' });
    if (bracket.challenge_status !== 'open') return res.status(400).json({ error: 'This bracket challenge is no longer accepting changes' });

    if (bracket.entry_deadline && new Date() > new Date(bracket.entry_deadline)) {
      return res.status(400).json({ error: 'Entry deadline has passed' });
    }

    const { picks, tiebreakerValue, name } = req.body;

    const updates = [];
    const values = [];
    let idx = 1;

    if (picks !== undefined) {
      // Merge with existing picks (allow partial updates)
      const existingPicks = bracket.picks || {};
      const mergedPicks = { ...existingPicks, ...picks };
      // Remove null/undefined entries
      for (const key of Object.keys(mergedPicks)) {
        if (mergedPicks[key] === null || mergedPicks[key] === undefined) {
          delete mergedPicks[key];
        }
      }
      updates.push(`picks = $${idx++}`);
      values.push(JSON.stringify(mergedPicks));
    }

    if (tiebreakerValue !== undefined) {
      updates.push(`tiebreaker_value = $${idx++}`);
      values.push(tiebreakerValue);
    }

    if (name !== undefined) {
      updates.push(`name = $${idx++}`);
      values.push(name);
    }

    if (!updates.length) return res.status(400).json({ error: 'No fields to update' });

    updates.push(`updated_at = NOW()`);
    values.push(req.params.bracketId);

    const updated = await db.getOne(`UPDATE brackets SET ${updates.join(', ')} WHERE id = $${idx} RETURNING *`, values);
    res.json({ success: true, bracket: updated });
  } catch (error) {
    console.error('Error updating bracket:', error);
    res.status(500).json({ error: 'Failed to update bracket' });
  }
});

// Submit (lock) bracket
router.post('/:bracketId/submit', authMiddleware, async (req, res) => {
  try {
    const user = await getUser(req);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const bracket = await db.getOne('SELECT b.*, bc.status as challenge_status, bc.entry_deadline, bc.tiebreaker_type FROM brackets b JOIN bracket_challenges bc ON b.challenge_id = bc.id WHERE b.id = $1', [req.params.bracketId]);
    if (!bracket) return res.status(404).json({ error: 'Bracket not found' });
    if (bracket.user_id !== user.id) return res.status(403).json({ error: 'Not your bracket' });
    if (bracket.is_submitted) return res.status(400).json({ error: 'Already submitted' });
    if (bracket.challenge_status !== 'open') return res.status(400).json({ error: 'Challenge is no longer accepting submissions' });

    if (bracket.entry_deadline && new Date() > new Date(bracket.entry_deadline)) {
      return res.status(400).json({ error: 'Entry deadline has passed' });
    }

    // Validate all picks are filled
    const pickCount = countPicks(bracket.picks || {});
    if (pickCount < TOTAL_BRACKET_GAMES) {
      return res.status(400).json({ error: `Bracket is incomplete. ${pickCount}/${TOTAL_BRACKET_GAMES} picks made.` });
    }

    // Validate tiebreaker
    if (bracket.tiebreaker_type === 'total_score' && !bracket.tiebreaker_value && bracket.tiebreaker_value !== 0) {
      return res.status(400).json({ error: 'Tiebreaker value is required' });
    }

    const updated = await db.getOne(`
      UPDATE brackets SET is_submitted = true, submitted_at = NOW(), updated_at = NOW() WHERE id = $1 RETURNING *
    `, [bracket.id]);

    res.json({ success: true, bracket: updated });
  } catch (error) {
    console.error('Error submitting bracket:', error);
    res.status(500).json({ error: 'Failed to submit bracket' });
  }
});

// Get a single bracket with results
router.get('/:bracketId', authMiddleware, async (req, res) => {
  try {
    const user = await getUser(req);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const bracket = await db.getOne(`
      SELECT b.*, bc.scoring_system, bc.tournament_data, bc.tiebreaker_type, bc.status as challenge_status,
             u.display_name as user_display_name
      FROM brackets b
      JOIN bracket_challenges bc ON b.challenge_id = bc.id
      JOIN users u ON b.user_id = u.id
      WHERE b.id = $1
    `, [req.params.bracketId]);
    if (!bracket) return res.status(404).json({ error: 'Bracket not found' });

    const results = await db.getAll('SELECT * FROM bracket_results WHERE challenge_id = $1', [bracket.challenge_id]);
    const resultsMap = {};
    for (const r of results) {
      resultsMap[r.slot_number] = r;
    }

    res.json({ bracket, results: resultsMap });
  } catch (error) {
    console.error('Error fetching bracket:', error);
    res.status(500).json({ error: 'Failed to fetch bracket' });
  }
});

// ─── Tournament Data (Public) ────────────────────────────────────────────────

// Get tournament bracket structure
router.get('/tournament/:season', async (req, res) => {
  try {
    const bracket = await getTournamentBracket(parseInt(req.params.season));
    res.json(bracket);
  } catch (error) {
    console.error('Error fetching tournament data:', error);
    res.status(500).json({ error: 'Failed to fetch tournament data' });
  }
});

// Get Selection Sunday date (derived from ESPN standings API)
router.get('/tournament/:season/selection-date', async (req, res) => {
  try {
    const result = await getSelectionSundayDate(parseInt(req.params.season));
    if (!result) {
      return res.status(404).json({ error: 'Selection date not available for this season' });
    }
    res.json(result);
  } catch (error) {
    console.error('Error fetching selection date:', error);
    res.status(500).json({ error: 'Failed to fetch selection date' });
  }
});

// Get detailed team breakdown
router.get('/tournament/:season/team/:teamId', async (req, res) => {
  try {
    const season = parseInt(req.params.season);
    const teamId = req.params.teamId;
    const breakdown = await getTeamBreakdown(teamId, season);

    // Enrich with seed from tournament data if available
    if (!breakdown.seed) {
      const bracket = await getTournamentBracket(season);
      const tournamentTeam = bracket.teams?.[teamId];
      if (tournamentTeam?.seed) {
        breakdown.seed = tournamentTeam.seed;
      }
    }

    res.json(breakdown);
  } catch (error) {
    console.error('Error fetching team breakdown:', error);
    res.status(500).json({ error: 'Failed to fetch team breakdown' });
  }
});

// Get concise scouting report for a team (on-demand, cached)
router.get('/tournament/:season/team/:teamId/concise-report', async (req, res) => {
  try {
    const season = parseInt(req.params.season);
    const teamId = req.params.teamId;

    // Check pre-generated report in DB first
    const stored = await getStoredReport(teamId, season);
    if (stored?.conciseReport) {
      return res.json({ conciseReport: stored.conciseReport });
    }

    // Fallback: generate on-demand from full breakdown
    const breakdown = await getTeamBreakdown(teamId, season);
    if (!breakdown?.summary) {
      return res.status(404).json({ error: 'No scouting report available' });
    }

    const concise = await generateConciseReport(teamId, breakdown.name, breakdown.summary);
    if (!concise) {
      return res.status(500).json({ error: 'Failed to generate concise report' });
    }

    res.json({ conciseReport: concise });
  } catch (error) {
    console.error('Error generating concise report:', error);
    res.status(500).json({ error: 'Failed to generate concise report' });
  }
});

// ─── Admin: Pre-generate AI Scouting Reports ────────────────────────────────

// Generate/regenerate AI scouting reports for all tournament teams
router.post('/admin/generate-reports', async (req, res) => {
  try {
    const { season = new Date().getFullYear(), teamId, force = false } = req.body;
    console.log(`[Admin] Generating scouting reports for season ${season}${teamId ? ` (team ${teamId})` : ''}${force ? ' (force)' : ''}`);

    const result = await generateAllReports(season, { teamId, force });
    res.json(result);
  } catch (error) {
    console.error('Error generating reports:', error);
    res.status(500).json({ error: error.message || 'Failed to generate reports' });
  }
});

// Get matchup prediction
router.get('/tournament/:season/matchup/:eventId', async (req, res) => {
  try {
    const prediction = await getMatchupPrediction(req.params.eventId);
    res.json(prediction || { homeWinPct: 50, awayWinPct: 50 });
  } catch (error) {
    console.error('Error fetching matchup prediction:', error);
    res.status(500).json({ error: 'Failed to fetch prediction' });
  }
});

// ─── Scoring & Leaderboard ───────────────────────────────────────────────────

// Update results for all active bracket challenges
router.post('/update-results', async (req, res) => {
  try {
    const activeChallenges = await db.getAll("SELECT * FROM bracket_challenges WHERE status IN ('open', 'locked')");
    let totalUpdated = 0;

    for (const challenge of activeChallenges) {
      const espnResults = await getTournamentResults(challenge.season);
      const tournamentData = challenge.tournament_data || {};
      const slots = tournamentData.slots || {};

      // Map ESPN event IDs to slot numbers
      const eventToSlot = {};
      for (const [slotNum, slotData] of Object.entries(slots)) {
        if (slotData.espnEventId) {
          eventToSlot[slotData.espnEventId] = parseInt(slotNum);
        }
      }

      // Also check bracket_results for event mappings
      const existingResults = await db.getAll('SELECT * FROM bracket_results WHERE challenge_id = $1', [challenge.id]);
      for (const er of existingResults) {
        if (er.espn_event_id) {
          eventToSlot[er.espn_event_id] = er.slot_number;
        }
      }

      let hasFirstGameStarted = false;

      for (const [eventId, result] of Object.entries(espnResults)) {
        const slotNum = eventToSlot[eventId];
        if (!slotNum) continue;

        if (result.status !== 'pending') hasFirstGameStarted = true;

        if (result.status === 'final' && result.winningTeamId) {
          const round = getSlotRound(slotNum);
          await db.run(`
            INSERT INTO bracket_results (challenge_id, slot_number, espn_event_id, winning_team_id, losing_team_id, winning_score, losing_score, round, status, completed_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'final', NOW())
            ON CONFLICT (challenge_id, slot_number) DO UPDATE SET
              winning_team_id = EXCLUDED.winning_team_id,
              losing_team_id = EXCLUDED.losing_team_id,
              winning_score = EXCLUDED.winning_score,
              losing_score = EXCLUDED.losing_score,
              status = 'final',
              completed_at = COALESCE(bracket_results.completed_at, NOW())
          `, [challenge.id, slotNum, eventId, result.winningTeamId, result.losingTeamId, result.winningScore, result.losingScore, round]);
          totalUpdated++;
        } else if (result.status === 'in_progress') {
          await db.run(`
            INSERT INTO bracket_results (challenge_id, slot_number, espn_event_id, round, status)
            VALUES ($1, $2, $3, $4, 'in_progress')
            ON CONFLICT (challenge_id, slot_number) DO UPDATE SET status = 'in_progress'
          `, [challenge.id, slotNum, eventId, getSlotRound(slotNum)]);
        }
      }

      // Auto-lock challenge when first game starts
      if (hasFirstGameStarted && challenge.status === 'open') {
        await db.run("UPDATE bracket_challenges SET status = 'locked', updated_at = NOW() WHERE id = $1", [challenge.id]);
      }

      // Recalculate scores for all brackets in this challenge
      const allResults = await db.getAll('SELECT * FROM bracket_results WHERE challenge_id = $1', [challenge.id]);
      const resultsMap = {};
      for (const r of allResults) {
        resultsMap[r.slot_number] = r;
      }

      const scoringSystem = challenge.scoring_system || [1, 2, 4, 8, 16, 32];
      const brackets = await db.getAll('SELECT id, picks FROM brackets WHERE challenge_id = $1 AND is_submitted = true', [challenge.id]);

      for (const bracket of brackets) {
        const { totalScore } = calculateBracketScore(bracket.picks || {}, resultsMap, scoringSystem);
        await db.run('UPDATE brackets SET total_score = $1, updated_at = NOW() WHERE id = $2', [totalScore, bracket.id]);
      }
    }

    res.json({ success: true, updated: totalUpdated });
  } catch (error) {
    console.error('Error updating bracket results:', error);
    res.status(500).json({ error: 'Failed to update results' });
  }
});

// Get leaderboard for a challenge
router.get('/challenges/:challengeId/leaderboard', authMiddleware, async (req, res) => {
  try {
    const user = await getUser(req);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const challenge = await db.getOne('SELECT * FROM bracket_challenges WHERE id = $1', [req.params.challengeId]);
    if (!challenge) return res.status(404).json({ error: 'Challenge not found' });

    const brackets = await db.getAll(`
      SELECT b.id, b.user_id, b.bracket_number, b.name, b.picks, b.tiebreaker_value, b.total_score, b.is_submitted, b.submitted_at,
             u.display_name
      FROM brackets b
      JOIN users u ON b.user_id = u.id
      WHERE b.challenge_id = $1 AND b.is_submitted = true
      ORDER BY b.total_score DESC, b.tiebreaker_value ASC
    `, [challenge.id]);

    const results = await db.getAll('SELECT * FROM bracket_results WHERE challenge_id = $1', [challenge.id]);
    const resultsMap = {};
    for (const r of results) {
      resultsMap[r.slot_number] = r;
    }

    const scoringSystem = challenge.scoring_system || [1, 2, 4, 8, 16, 32];

    const leaderboard = brackets.map((b, idx) => {
      const { roundScores, correctPicks, totalDecided } = calculateBracketScore(b.picks || {}, resultsMap, scoringSystem);
      const potentialPoints = calculatePotentialPoints(b.picks || {}, resultsMap, scoringSystem);

      return {
        rank: idx + 1,
        bracketId: b.id,
        userId: b.user_id,
        displayName: b.display_name,
        bracketName: b.name,
        bracketNumber: b.bracket_number,
        totalScore: b.total_score,
        roundScores,
        correctPicks,
        totalDecided,
        potentialPoints,
        tiebreakerValue: b.tiebreaker_value,
        isCurrentUser: b.user_id === user.id,
      };
    });

    // Re-rank with tiebreakers
    leaderboard.sort((a, b) => {
      if (b.totalScore !== a.totalScore) return b.totalScore - a.totalScore;
      // Tiebreaker: closer to actual championship total score
      if (challenge.tiebreaker_type === 'total_score') {
        // For now, just sort by tiebreaker_value (will be compared to actual when championship is done)
        return (a.tiebreakerValue || 999) - (b.tiebreakerValue || 999);
      }
      return 0;
    });
    leaderboard.forEach((entry, idx) => { entry.rank = idx + 1; });

    res.json({ leaderboard, results: resultsMap, scoringSystem, entryFee: parseFloat(challenge.entry_fee) || 0 });
  } catch (error) {
    console.error('Error fetching leaderboard:', error);
    res.status(500).json({ error: 'Failed to fetch leaderboard' });
  }
});

module.exports = router;
