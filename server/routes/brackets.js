const express = require('express');
const router = express.Router();
const { db } = require('../db/supabase');
const { authMiddleware } = require('../middleware/auth');
const { getTournamentBracket, getTeamBreakdown, getMatchupPrediction, getTournamentResults, getSelectionSundayDate, getFirstGameTime, generateConciseReport, generateMatchupReport, generateAllReports, getStoredReport, getStoredMatchupReport } = require('../services/ncaab-tournament');
const { SCORING_PRESETS, ROUND_BOUNDARIES, calculateBracketScore, calculatePotentialPoints, getSlotRound, getNextSlot, getRegionForSlot, getChildSlots, countPicks, DEFAULT_REGIONS } = require('../utils/bracket-slots');

// Total games in the bracket (derived from round boundaries)
const TOTAL_BRACKET_GAMES = ROUND_BOUNDARIES[ROUND_BOUNDARIES.length - 1].end;

const getUser = async (req) => {
  return db.getOne('SELECT * FROM users WHERE firebase_uid = $1', [req.firebaseUser.uid]);
};

// Check if tournament has started based on first R64 game time
const checkTournamentStarted = async (season) => {
  const firstGameTime = await getFirstGameTime(season);
  if (!firstGameTime) return false;
  return new Date() >= new Date(firstGameTime);
};

// Pre-generate matchup reports for a submitted bracket's hypothetical matchups
// Extracts all unique team pairs from picks and queues background generation
async function preGenerateMatchupReports(picks, season) {
  if (!picks || Object.keys(picks).length === 0) return;

  // Collect all unique matchup pairs from the bracket
  // For each slot beyond R64, the two teams come from the child slots' winners
  const matchupPairs = new Set();

  for (let slot = ROUND_BOUNDARIES[1].start; slot <= ROUND_BOUNDARIES[ROUND_BOUNDARIES.length - 1].end; slot++) {
    const children = getChildSlots(slot);
    if (!children) continue;
    const team1Id = picks[String(children[0])];
    const team2Id = picks[String(children[1])];
    if (team1Id && team2Id && team1Id !== team2Id) {
      // Sort IDs to match the caching key used in generateMatchupReport
      const sorted = [team1Id, team2Id].sort();
      matchupPairs.add(`${sorted[0]}|${sorted[1]}`);
    }
  }

  if (matchupPairs.size === 0) return;

  console.log(`🔄 Pre-generating ${matchupPairs.size} matchup reports for submitted bracket...`);

  let generated = 0;
  let skipped = 0;

  for (const pair of matchupPairs) {
    const [team1Id, team2Id] = pair.split('|');
    try {
      // Check if already cached
      const stored = await getStoredMatchupReport(team1Id, team2Id, season);
      if (stored?.report && stored?.conciseReport) {
        skipped++;
        continue;
      }

      // Fetch team data and generate
      const [team1Data, team2Data] = await Promise.all([
        getTeamBreakdown(team1Id, season),
        getTeamBreakdown(team2Id, season),
      ]);

      if (team1Data && team2Data) {
        await generateMatchupReport(team1Data, team2Data, season);
        generated++;
      }
    } catch (err) {
      console.error(`  ⚠️ Failed to pre-generate matchup ${team1Id} vs ${team2Id}:`, err.message);
    }
  }

  console.log(`✅ Pre-generation complete: ${generated} generated, ${skipped} already cached`);
}

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

    // Log settings changes
    try {
      const changes = [];
      if (maxBracketsPerUser !== undefined && maxBracketsPerUser !== challenge.max_brackets_per_user) {
        changes.push(`Max brackets: ${challenge.max_brackets_per_user} → ${maxBracketsPerUser}`);
      }
      if (scoringPreset !== undefined && scoringPreset !== challenge.scoring_preset) {
        changes.push(`Scoring: ${challenge.scoring_preset} → ${scoringPreset}`);
      }
      if (tiebreakerType !== undefined && tiebreakerType !== challenge.tiebreaker_type) {
        changes.push(`Tiebreaker: ${challenge.tiebreaker_type} → ${tiebreakerType}`);
      }
      if (entryFee !== undefined && (parseFloat(entryFee) || 0) !== (parseFloat(challenge.entry_fee) || 0)) {
        changes.push(`Entry fee: $${parseFloat(challenge.entry_fee) || 0} → $${parseFloat(entryFee) || 0}`);
      }
      if (entryDeadline !== undefined) {
        const oldDeadline = challenge.entry_deadline ? new Date(challenge.entry_deadline).toLocaleString() : 'auto';
        const newDeadline = entryDeadline ? new Date(entryDeadline).toLocaleString() : 'auto';
        if (oldDeadline !== newDeadline) {
          changes.push(`Entry deadline: ${oldDeadline} → ${newDeadline}`);
        }
      }
      if (changes.length > 0) {
        await db.run(`
          INSERT INTO commissioner_actions (id, league_id, performed_by, action, reason, created_at)
          VALUES ($1, $2, $3, $4, $5, NOW())
        `, [
          require('uuid').v4(),
          challenge.league_id,
          user.id,
          'challenge_settings_changed',
          changes.join(', ')
        ]);
      }
    } catch (logError) {
      console.log('Could not log action:', logError.message);
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

    // Auto-refresh tournament data if stale (fewer than 64 teams or incomplete R64 slots)
    const storedTeams = Object.keys(challenge.tournament_data?.teams || {}).length;
    const storedSlots = challenge.tournament_data?.slots || {};
    const filledR64 = Object.keys(storedSlots).filter(k => parseInt(k) <= 32 && storedSlots[k]?.team1 && storedSlots[k]?.team2).length;
    if (storedTeams < 64 || filledR64 < 32) {
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

    // Auto-refresh tournament data if stale (fewer than 64 teams or incomplete R64 slots)
    const storedTeams = Object.keys(challenge.tournament_data?.teams || {}).length;
    const storedSlots2 = challenge.tournament_data?.slots || {};
    const filledR64_2 = Object.keys(storedSlots2).filter(k => parseInt(k) <= 32 && storedSlots2[k]?.team1 && storedSlots2[k]?.team2).length;
    if (storedTeams < 64 || filledR64_2 < 32) {
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

    // Check if tournament has started
    if (await checkTournamentStarted(challenge.season)) {
      return res.status(400).json({ error: 'Tournament has already started — brackets are locked' });
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

    const bracket = await db.getOne('SELECT b.*, bc.status as challenge_status, bc.entry_deadline, bc.season FROM brackets b JOIN bracket_challenges bc ON b.challenge_id = bc.id WHERE b.id = $1', [req.params.bracketId]);
    if (!bracket) return res.status(404).json({ error: 'Bracket not found' });
    if (bracket.user_id !== user.id) return res.status(403).json({ error: 'Not your bracket' });
    if (bracket.challenge_status !== 'open') return res.status(400).json({ error: 'This bracket challenge is no longer accepting changes' });

    if (bracket.entry_deadline && new Date() > new Date(bracket.entry_deadline)) {
      return res.status(400).json({ error: 'Entry deadline has passed' });
    }

    // Check if tournament has started — no edits after tipoff
    if (await checkTournamentStarted(bracket.season)) {
      return res.status(400).json({ error: 'Tournament has already started — brackets are locked' });
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

    const bracket = await db.getOne('SELECT b.*, bc.status as challenge_status, bc.entry_deadline, bc.tiebreaker_type, bc.season FROM brackets b JOIN bracket_challenges bc ON b.challenge_id = bc.id WHERE b.id = $1', [req.params.bracketId]);
    if (!bracket) return res.status(404).json({ error: 'Bracket not found' });
    if (bracket.user_id !== user.id) return res.status(403).json({ error: 'Not your bracket' });
    if (bracket.is_submitted) return res.status(400).json({ error: 'Already submitted' });
    if (bracket.challenge_status !== 'open') return res.status(400).json({ error: 'Challenge is no longer accepting submissions' });

    if (bracket.entry_deadline && new Date() > new Date(bracket.entry_deadline)) {
      return res.status(400).json({ error: 'Entry deadline has passed' });
    }

    // Check if tournament has started
    if (await checkTournamentStarted(bracket.season)) {
      return res.status(400).json({ error: 'Tournament has already started — brackets are locked' });
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

    // Background: pre-generate matchup reports for this bracket's hypothetical matchups
    // (fire-and-forget — don't block the response)
    preGenerateMatchupReports(bracket.picks, bracket.season).catch(err => {
      console.error('Background matchup pre-generation error:', err.message);
    });
  } catch (error) {
    console.error('Error submitting bracket:', error);
    res.status(500).json({ error: 'Failed to submit bracket' });
  }
});

// Reset bracket (clear all picks)
router.post('/:bracketId/reset', authMiddleware, async (req, res) => {
  try {
    const user = await getUser(req);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const bracket = await db.getOne('SELECT b.*, bc.status as challenge_status, bc.season FROM brackets b JOIN bracket_challenges bc ON b.challenge_id = bc.id WHERE b.id = $1', [req.params.bracketId]);
    if (!bracket) return res.status(404).json({ error: 'Bracket not found' });
    if (bracket.user_id !== user.id) return res.status(403).json({ error: 'Not your bracket' });
    if (bracket.challenge_status !== 'open') return res.status(400).json({ error: 'Challenge is no longer accepting changes' });

    if (await checkTournamentStarted(bracket.season)) {
      return res.status(400).json({ error: 'Tournament has already started — brackets are locked' });
    }

    const updated = await db.getOne(`
      UPDATE brackets SET picks = '{}', tiebreaker_value = NULL, is_submitted = false, submitted_at = NULL, updated_at = NOW()
      WHERE id = $1 RETURNING *
    `, [bracket.id]);

    res.json({ success: true, bracket: updated });
  } catch (error) {
    console.error('Error resetting bracket:', error);
    res.status(500).json({ error: 'Failed to reset bracket' });
  }
});

// Get a single bracket with results
router.get('/:bracketId', authMiddleware, async (req, res) => {
  try {
    const user = await getUser(req);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const bracket = await db.getOne(`
      SELECT b.*, bc.scoring_system, bc.tournament_data, bc.tiebreaker_type, bc.status as challenge_status,
             bc.season as challenge_season, u.display_name as user_display_name
      FROM brackets b
      JOIN bracket_challenges bc ON b.challenge_id = bc.id
      JOIN users u ON b.user_id = u.id
      WHERE b.id = $1
    `, [req.params.bracketId]);
    if (!bracket) return res.status(404).json({ error: 'Bracket not found' });

    // Block viewing other users' brackets until tournament starts
    if (bracket.user_id !== user.id) {
      const season = bracket.challenge_season || bracket.tournament_data?.season;
      if (season) {
        const started = await checkTournamentStarted(season);
        if (!started) {
          return res.status(403).json({ error: 'Brackets are hidden until the tournament starts' });
        }
      }
    }

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

// Get first game time (for countdown / lock logic)
router.get('/tournament/:season/first-game-time', async (req, res) => {
  try {
    const firstGameTime = await getFirstGameTime(parseInt(req.params.season));
    res.json({ firstGameTime });
  } catch (error) {
    console.error('Error fetching first game time:', error);
    res.status(500).json({ error: 'Failed to fetch first game time' });
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

// Get AI matchup analysis report for two teams (on-demand, cached)
router.get('/tournament/:season/matchup-report/:team1Id/:team2Id', async (req, res) => {
  try {
    const season = parseInt(req.params.season);
    const { team1Id, team2Id } = req.params;

    // Check stored report first
    const stored = await getStoredMatchupReport(team1Id, team2Id, season);
    if (stored?.report && stored?.conciseReport) {
      return res.json({ matchupReport: stored.report, conciseReport: stored.conciseReport });
    }

    // Fetch both team breakdowns
    const [team1Data, team2Data] = await Promise.all([
      getTeamBreakdown(team1Id, season),
      getTeamBreakdown(team2Id, season),
    ]);

    if (!team1Data || !team2Data) {
      return res.status(404).json({ error: 'Team data not available for matchup analysis' });
    }

    const result = await generateMatchupReport(team1Data, team2Data, season);
    if (!result) {
      return res.status(500).json({ error: 'Failed to generate matchup report' });
    }

    res.json({ matchupReport: result.report, conciseReport: result.conciseReport });
  } catch (error) {
    console.error('Error generating matchup report:', error);
    res.status(500).json({ error: 'Failed to generate matchup report' });
  }
});

// ─── Admin: Matchup Reports Management ──────────────────────────────────────

// List all matchup reports for a season
router.get('/admin/matchup-reports/:season', async (req, res) => {
  try {
    const season = parseInt(req.params.season);
    const reports = await db.getAll(
      `SELECT team1_id, team2_id, round, report IS NOT NULL as has_report, concise_report IS NOT NULL as has_concise, generated_at
       FROM matchup_reports WHERE season = $1 ORDER BY generated_at DESC`,
      [season]
    );
    res.json({ reports });
  } catch (error) {
    console.error('Error listing matchup reports:', error);
    res.status(500).json({ error: 'Failed to list matchup reports' });
  }
});

// Get tournament matchups by round (from ESPN bracket data)
router.get('/admin/matchups/:season', async (req, res) => {
  try {
    const season = parseInt(req.params.season);
    const round = req.query.round || null;

    // Get bracket data from an active challenge to find real matchups
    const challenge = await db.getOne(
      `SELECT tournament_data FROM bracket_challenges WHERE season = $1 ORDER BY created_at DESC LIMIT 1`,
      [season]
    );

    if (!challenge?.tournament_data?.slots) {
      return res.status(404).json({ error: 'No bracket data found' });
    }

    const slots = challenge.tournament_data.slots;
    const matchups = [];
    const roundNames = { 0: 'Round of 64', 1: 'Round of 32', 2: 'Sweet 16', 3: 'Elite 8', 4: 'Final Four', 5: 'Championship' };

    for (const [slotNum, slotData] of Object.entries(slots)) {
      const slot = parseInt(slotNum);
      const slotRound = getSlotRound(slot);
      const roundName = roundNames[slotRound] || `Round ${slotRound}`;

      if (round && roundName !== round) continue;

      // Support both flat (homeTeamId/team1Id) and nested (team1.id/team2.id) formats
      const team1Id = slotData.homeTeamId || slotData.team1Id || slotData.team1?.id;
      const team2Id = slotData.awayTeamId || slotData.team2Id || slotData.team2?.id;

      // Skip placeholder/TBD teams (string 'TBD' or negative IDs like -1, -2)
      if (!team1Id || !team2Id || team1Id === 'TBD' || team2Id === 'TBD' || String(team1Id).startsWith('-') || String(team2Id).startsWith('-')) continue;

      // Check if we have a stored report
      const stored = await getStoredMatchupReport(team1Id, team2Id, season);

      matchups.push({
        slot,
        round: roundName,
        roundNum: slotRound,
        team1Id,
        team2Id,
        team1Name: slotData.homeTeamName || slotData.team1Name || slotData.team1?.name || team1Id,
        team2Name: slotData.awayTeamName || slotData.team2Name || slotData.team2?.name || team2Id,
        team1Logo: slotData.homeTeamLogo || slotData.team1Logo || slotData.team1?.logo,
        team2Logo: slotData.awayTeamLogo || slotData.team2Logo || slotData.team2?.logo,
        team1Seed: slotData.homeTeamSeed || slotData.team1Seed || slotData.team1?.seed,
        team2Seed: slotData.awayTeamSeed || slotData.team2Seed || slotData.team2?.seed,
        hasReport: !!stored?.report,
        hasConcise: !!stored?.conciseReport,
        generatedAt: stored?.generatedAt || null,
      });
    }

    // Sort by round then slot
    matchups.sort((a, b) => a.roundNum - b.roundNum || a.slot - b.slot);

    // Build available rounds from slot-based matchups
    const slotRounds = [...new Set(matchups.map(m => m.round))];

    // Check if there are cached reports beyond what's in the slot matchups
    const cachedReports = await db.getAll(
      `SELECT team1_id, team2_id, round, generated_at FROM matchup_reports WHERE season = $1 AND report IS NOT NULL`,
      [season]
    );

    // Build a set of team pairs already shown from slots
    const slotPairs = new Set(matchups.map(m => {
      const [s1, s2] = [String(m.team1Id), String(m.team2Id)].sort();
      return `${s1}-${s2}`;
    }));

    // Find cached reports not in slot matchups
    const extraCached = cachedReports.filter(r => {
      const [s1, s2] = [String(r.team1_id), String(r.team2_id)].sort();
      return !slotPairs.has(`${s1}-${s2}`);
    });

    // If requesting "All Cached" or there are extra cached reports, include them
    const availableRounds = [...slotRounds];
    if (extraCached.length > 0 || cachedReports.length > slotPairs.size) {
      availableRounds.push('All Cached');
    }

    if (round === 'All Cached') {
      // Build team → R64 slot mapping from tournament data
      const teams = challenge.tournament_data?.teams || {};
      const teamToR64Slot = {};
      for (const [slotNum, slotData] of Object.entries(slots)) {
        const s = parseInt(slotNum);
        if (s < 1 || s > 32) continue; // R64 slots only
        const t1 = slotData.homeTeamId || slotData.team1Id || slotData.team1?.id;
        const t2 = slotData.awayTeamId || slotData.team2Id || slotData.team2?.id;
        if (t1 && !String(t1).startsWith('-')) teamToR64Slot[String(t1)] = s;
        if (t2 && !String(t2).startsWith('-')) teamToR64Slot[String(t2)] = s;
      }

      // Get region names from tournament data or use defaults
      const regionNames = challenge.tournament_data?.regions || DEFAULT_REGIONS;

      // For two teams, find the round they'd meet by tracing bracket paths
      function getMeetingRound(teamId1, teamId2) {
        const s1 = teamToR64Slot[String(teamId1)];
        const s2 = teamToR64Slot[String(teamId2)];
        if (!s1 || !s2) return { roundNum: -1, roundName: 'Other', region: null };

        // Build ancestor chains (slot at each round level)
        const chain1 = [s1], chain2 = [s2];
        let curr1 = s1, curr2 = s2;
        for (let r = 0; r < 5; r++) {
          curr1 = getNextSlot(curr1);
          curr2 = getNextSlot(curr2);
          if (curr1) chain1.push(curr1);
          if (curr2) chain2.push(curr2);
        }

        // Find the first common slot — that's where they'd meet
        for (let i = 0; i < chain1.length; i++) {
          const idx2 = chain2.indexOf(chain1[i]);
          if (idx2 !== -1) {
            const meetSlot = chain1[i];
            const meetRound = getSlotRound(meetSlot);
            const roundName = roundNames[meetRound] || `Round ${meetRound}`;
            const region = getRegionForSlot(meetSlot, regionNames);
            return { roundNum: meetRound, roundName, region };
          }
        }
        return { roundNum: -1, roundName: 'Other', region: null };
      }

      const cachedMatchups = cachedReports.map((r, idx) => {
        const t1 = teams[r.team1_id] || {};
        const t2 = teams[r.team2_id] || {};
        const meeting = getMeetingRound(r.team1_id, r.team2_id);
        return {
          slot: -(idx + 1),
          round: meeting.roundName,
          roundNum: meeting.roundNum,
          region: meeting.region,
          team1Id: r.team1_id,
          team2Id: r.team2_id,
          team1Name: t1.name || t1.shortName || r.team1_id,
          team2Name: t2.name || t2.shortName || r.team2_id,
          team1Logo: t1.logo || null,
          team2Logo: t2.logo || null,
          team1Seed: t1.seed || null,
          team2Seed: t2.seed || null,
          hasReport: true,
          hasConcise: true,
          generatedAt: r.generated_at,
        };
      });
      // Sort by round number, then region, then seed
      cachedMatchups.sort((a, b) => a.roundNum - b.roundNum || (a.region || '').localeCompare(b.region || '') || (a.team1Seed || 99) - (b.team1Seed || 99));
      return res.json({ matchups: cachedMatchups, rounds: availableRounds });
    }

    res.json({ matchups, rounds: availableRounds });
  } catch (error) {
    console.error('Error fetching matchups:', error);
    res.status(500).json({ error: 'Failed to fetch matchups' });
  }
});

// Generate/regenerate a single matchup report
router.post('/admin/matchup-reports/generate', async (req, res) => {
  try {
    const { season = new Date().getFullYear(), team1Id, team2Id, round = null, force = false } = req.body;

    const [team1Data, team2Data] = await Promise.all([
      getTeamBreakdown(team1Id, season),
      getTeamBreakdown(team2Id, season),
    ]);

    if (!team1Data || !team2Data) {
      return res.status(404).json({ error: 'Team data not available' });
    }

    const result = await generateMatchupReport(team1Data, team2Data, season, { force, round });
    if (!result) {
      return res.status(500).json({ error: 'Failed to generate matchup report' });
    }

    res.json({ success: true, report: result.report, conciseReport: result.conciseReport });
  } catch (error) {
    console.error('Error generating matchup report:', error);
    res.status(500).json({ error: 'Failed to generate matchup report' });
  }
});

// Bulk generate matchup reports for a round
router.post('/admin/matchup-reports/generate-round', async (req, res) => {
  try {
    const { season = new Date().getFullYear(), round, force = false } = req.body;

    // Get matchups for the round
    const challenge = await db.getOne(
      `SELECT tournament_data FROM bracket_challenges WHERE season = $1 ORDER BY created_at DESC LIMIT 1`,
      [season]
    );

    if (!challenge?.tournament_data?.slots) {
      return res.status(404).json({ error: 'No bracket data found' });
    }

    const slots = challenge.tournament_data.slots;
    const roundNames = { 0: 'Round of 64', 1: 'Round of 32', 2: 'Sweet 16', 3: 'Elite 8', 4: 'Final Four', 5: 'Championship' };
    const matchupsToGenerate = [];

    for (const [slotNum, slotData] of Object.entries(slots)) {
      const slot = parseInt(slotNum);
      const slotRound = getSlotRound(slot);
      const roundName = roundNames[slotRound] || `Round ${slotRound}`;

      if (roundName !== round) continue;

      const team1Id = slotData.homeTeamId || slotData.team1Id || slotData.team1?.id;
      const team2Id = slotData.awayTeamId || slotData.team2Id || slotData.team2?.id;

      if (!team1Id || !team2Id || team1Id === 'TBD' || team2Id === 'TBD' || String(team1Id).startsWith('-') || String(team2Id).startsWith('-')) continue;

      if (!force) {
        const stored = await getStoredMatchupReport(team1Id, team2Id, season);
        if (stored?.report && stored?.conciseReport) continue;
      }

      matchupsToGenerate.push({ team1Id, team2Id });
    }

    let generated = 0;
    let failed = 0;

    for (const { team1Id, team2Id } of matchupsToGenerate) {
      try {
        const [team1Data, team2Data] = await Promise.all([
          getTeamBreakdown(team1Id, season),
          getTeamBreakdown(team2Id, season),
        ]);

        if (!team1Data || !team2Data) {
          failed++;
          continue;
        }

        const result = await generateMatchupReport(team1Data, team2Data, season, { force, round });
        if (result) {
          generated++;
        } else {
          failed++;
        }
      } catch (err) {
        console.warn(`[Admin] Matchup report failed for ${team1Id} vs ${team2Id}:`, err.message);
        failed++;
      }
    }

    res.json({
      success: true,
      generated,
      failed,
      skipped: matchupsToGenerate.length === 0 ? 'All reports already exist' : undefined,
      total: matchupsToGenerate.length
    });
  } catch (error) {
    console.error('Error generating round matchup reports:', error);
    res.status(500).json({ error: 'Failed to generate matchup reports' });
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

// ─── Admin: clear entry deadline ─────────────────────────────────────────────
router.post('/admin/clear-deadline/:challengeId', async (req, res) => {
  try {
    await db.run('UPDATE bracket_challenges SET entry_deadline = NULL WHERE id = $1', [req.params.challengeId]);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/admin/challenges', async (req, res) => {
  try {
    const challenges = await db.getAll("SELECT id, league_id, status, entry_deadline, season FROM bracket_challenges ORDER BY created_at DESC");
    res.json(challenges);
  } catch (error) {
    res.status(500).json({ error: error.message });
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
    // Competition ranking: tied scores get the same rank, next rank skips (1, 2, 2, 4)
    leaderboard.forEach((entry, idx) => {
      if (idx === 0) {
        entry.rank = 1;
      } else if (entry.totalScore === leaderboard[idx - 1].totalScore) {
        entry.rank = leaderboard[idx - 1].rank; // Same rank for ties
      } else {
        entry.rank = idx + 1; // Skip ranks (competition ranking: 1, 2, 2, 4)
      }
    });

    // Check if tournament has started (to control bracket visibility)
    const tournamentStarted = await checkTournamentStarted(challenge.season);

    res.json({ leaderboard, results: resultsMap, scoringSystem, entryFee: parseFloat(challenge.entry_fee) || 0, tournamentStarted });
  } catch (error) {
    console.error('Error fetching leaderboard:', error);
    res.status(500).json({ error: 'Failed to fetch leaderboard' });
  }
});

module.exports = router;
