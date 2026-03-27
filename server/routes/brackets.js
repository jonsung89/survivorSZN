const express = require('express');
const router = express.Router();
const { db } = require('../db/supabase');
const { authMiddleware } = require('../middleware/auth');
const { getTournamentBracket, getTeamBreakdown, getMatchupPrediction, getTournamentResults, getSelectionSundayDate, getFirstGameTime, generateConciseReport, generateMatchupReport, generateAllReports, getStoredReport, getStoredMatchupReport, getProspectTournamentStats, syncTournamentFromESPN, buildTournamentDataFromDB, refreshGameFromESPN, propagateFirstFourWinners } = require('../services/ncaab-tournament');
const { generateAndStoreRecap } = require('../services/daily-recap');
const { getDraftProspects, enrichPlayersWithDraftRank, getProspectsFromDB, getCurrentDraftYear } = require('../services/nba-draft');
const { SCORING_PRESETS, ROUND_BOUNDARIES, calculateBracketScore, calculatePotentialPoints, getSlotRound, getNextSlot, getRegionForSlot, getChildSlots, countPicks, DEFAULT_REGIONS } = require('../utils/bracket-slots');

// Total games in the bracket (derived from round boundaries)
const TOTAL_BRACKET_GAMES = ROUND_BOUNDARIES[ROUND_BOUNDARIES.length - 1].end;

// Auto-refresh tournament data if stale or if First Four play-in games have resolved
async function autoRefreshTournamentData(challenge) {
  const storedTeams = Object.keys(challenge.tournament_data?.teams || {}).length;
  const storedSlots = challenge.tournament_data?.slots || {};
  const filledR64 = Object.keys(storedSlots)
    .filter(k => parseInt(k) <= 32 && storedSlots[k]?.team1 && storedSlots[k]?.team2).length;

  // Check for unresolved First Four placeholders in R64 slots
  const firstFourSlots = Object.keys(storedSlots)
    .filter(k => parseInt(k) <= 32)
    .filter(k => storedSlots[k]?.team1?.isFirstFour || storedSlots[k]?.team2?.isFirstFour);
  const hasUnresolvedFirstFour = firstFourSlots.length > 0;

  if (hasUnresolvedFirstFour) {
    // Only patch First Four placeholder teams — do NOT replace entire tournament structure
    // (full replacement can reorder regions and break slot assignments)
    try {
      const freshData = await getTournamentBracket(challenge.season);
      const td = challenge.tournament_data;
      let patched = 0;

      for (const slotKey of firstFourSlots) {
        const slot = td.slots[slotKey];
        for (const pos of ['team1', 'team2']) {
          if (!slot[pos]?.isFirstFour) continue;
          const ffEventId = slot[pos].firstFourEventId;
          // Find the resolved game in fresh data by its ESPN event ID
          const ffGame = ffEventId ? freshData.events?.[ffEventId] : null;
          if (ffGame?.status === 'STATUS_FINAL') {
            const winner = ffGame.team1?.winner ? ffGame.team1 : ffGame.team2;
            slot[pos] = winner;
            // Also add the resolved team to the teams map
            if (winner.id) td.teams[winner.id] = winner;
            patched++;
          }
        }
      }

      if (patched > 0) {
        await db.query(
          'UPDATE bracket_challenges SET tournament_data = $1, updated_at = NOW() WHERE id = $2',
          [JSON.stringify(td), challenge.id]
        );
        console.log(`Patched ${patched} First Four placeholder(s) for challenge ${challenge.id}`);
      }
    } catch (refreshErr) {
      console.error('Failed to patch First Four data:', refreshErr.message);
    }
  } else if (storedTeams < 64 || filledR64 < 32) {
    // Full refresh only when bracket is genuinely incomplete (not yet populated)
    try {
      const freshData = await getTournamentBracket(challenge.season);
      const freshTeams = Object.keys(freshData.teams || {}).length;
      if (freshTeams >= 64) {
        await db.query(
          'UPDATE bracket_challenges SET tournament_data = $1, updated_at = NOW() WHERE id = $2',
          [JSON.stringify(freshData), challenge.id]
        );
        challenge.tournament_data = freshData;
        console.log(`Refreshed tournament data for challenge ${challenge.id}: ${storedTeams} → ${freshTeams} teams`);
      }
    } catch (refreshErr) {
      console.error('Failed to refresh tournament data:', refreshErr.message);
    }
  }
}

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

    // Sync tournament data from ESPN into normalized tables
    const tournament = await syncTournamentFromESPN(league.season);
    const tournamentData = tournament ? await buildTournamentDataFromDB(tournament.id) : await getTournamentBracket(league.season);

    const parsedFee = parseFloat(entryFee) || 0;

    const challenge = await db.getOne(`
      INSERT INTO bracket_challenges (league_id, season, max_brackets_per_user, scoring_preset, scoring_system, tiebreaker_type, entry_deadline, entry_fee, tournament_data, tournament_id, status)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'open')
      RETURNING *
    `, [leagueId, league.season, maxBracketsPerUser, scoringPreset, JSON.stringify(scoringSystem), tiebreakerType, entryDeadline || null, parsedFee, JSON.stringify(tournamentData), tournament?.id || null]);

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

    // Build tournament data from normalized tables if available, fall back to JSONB
    if (challenge.tournament_id) {
      challenge.tournament_data = await buildTournamentDataFromDB(challenge.tournament_id) || challenge.tournament_data;
    } else {
      await autoRefreshTournamentData(challenge);
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

    // Build tournament data from normalized tables if available, fall back to JSONB
    if (challenge.tournament_id) {
      challenge.tournament_data = await buildTournamentDataFromDB(challenge.tournament_id) || challenge.tournament_data;
    } else {
      await autoRefreshTournamentData(challenge);
    }

    const myBrackets = await db.getAll('SELECT * FROM brackets WHERE challenge_id = $1 AND user_id = $2 ORDER BY bracket_number', [challenge.id, user.id]);

    // Build results from tournament_games if available, fall back to bracket_results
    const resultsMap = {};
    if (challenge.tournament_id) {
      const games = await db.getAll(
        `SELECT slot_number, espn_event_id, winning_team_espn_id as winning_team_id, losing_team_espn_id as losing_team_id,
                CASE WHEN winning_team_espn_id IS NULL THEN NULL WHEN winning_team_espn_id = team1_espn_id THEN team1_score ELSE team2_score END as winning_score,
                CASE WHEN winning_team_espn_id IS NULL THEN NULL WHEN winning_team_espn_id = team1_espn_id THEN team2_score ELSE team1_score END as losing_score,
                round, status, completed_at
         FROM tournament_games WHERE tournament_id = $1 AND slot_number IS NOT NULL`,
        [challenge.tournament_id]
      );
      for (const g of games) {
        resultsMap[g.slot_number] = g;
      }
    } else {
      const results = await db.getAll('SELECT * FROM bracket_results WHERE challenge_id = $1', [challenge.id]);
      for (const r of results) {
        resultsMap[r.slot_number] = r;
      }
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

    const { picks, tiebreakerValue, tiebreakerScores, name } = req.body;

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

    if (tiebreakerScores !== undefined) {
      updates.push(`tiebreaker_scores = $${idx++}`);
      values.push(JSON.stringify(tiebreakerScores));
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
      UPDATE brackets SET picks = '{}', tiebreaker_value = NULL, tiebreaker_scores = NULL, is_submitted = false, submitted_at = NULL, updated_at = NOW()
      WHERE id = $1 RETURNING *
    `, [bracket.id]);

    res.json({ success: true, bracket: updated });
  } catch (error) {
    console.error('Error resetting bracket:', error);
    res.status(500).json({ error: 'Failed to reset bracket' });
  }
});

// Get NBA draft prospect rankings — reads from DB (source of truth), falls back to Tankathon
router.get('/draft-prospects', async (req, res) => {
  try {
    // Try DB first
    const dbProspects = await getProspectsFromDB('nba', getCurrentDraftYear());
    if (dbProspects.length > 0) {
      return res.json({ prospects: dbProspects, source: 'db' });
    }
    // Fallback to Tankathon cache if DB is empty
    const prospects = await getDraftProspects();
    res.json({ prospects, source: 'tankathon' });
  } catch (error) {
    console.error('Error fetching draft prospects:', error);
    res.status(500).json({ error: 'Failed to fetch draft prospects' });
  }
});

// Get prospect tournament watch data
router.get('/prospect-watch', async (req, res) => {
  try {
    const season = parseInt(req.query.season) || new Date().getFullYear();
    const data = await getProspectTournamentStats(season);
    res.json(data);
  } catch (error) {
    console.error('Error fetching prospect watch data:', error);
    res.status(500).json({ error: 'Failed to fetch prospect watch data' });
  }
});

// Get a single bracket with results
router.get('/:bracketId', authMiddleware, async (req, res) => {
  try {
    const user = await getUser(req);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const bracket = await db.getOne(`
      SELECT b.*, bc.scoring_system, bc.tournament_data, bc.tiebreaker_type, bc.status as challenge_status,
             bc.season as challenge_season, bc.tournament_id, u.display_name as user_display_name
      FROM brackets b
      JOIN bracket_challenges bc ON b.challenge_id = bc.id
      JOIN users u ON b.user_id = u.id
      WHERE b.id = $1
    `, [req.params.bracketId]);
    if (!bracket) return res.status(404).json({ error: 'Bracket not found' });

    // Build tournament data from normalized tables if available
    if (bracket.tournament_id) {
      bracket.tournament_data = await buildTournamentDataFromDB(bracket.tournament_id) || bracket.tournament_data;
    }

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

    // Build results from tournament_games if available
    const resultsMap = {};
    if (bracket.tournament_id) {
      const games = await db.getAll(
        `SELECT slot_number, espn_event_id, winning_team_espn_id as winning_team_id, losing_team_espn_id as losing_team_id,
                CASE WHEN winning_team_espn_id IS NULL THEN NULL WHEN winning_team_espn_id = team1_espn_id THEN team1_score ELSE team2_score END as winning_score,
                CASE WHEN winning_team_espn_id IS NULL THEN NULL WHEN winning_team_espn_id = team1_espn_id THEN team2_score ELSE team1_score END as losing_score,
                round, status, completed_at
         FROM tournament_games WHERE tournament_id = $1 AND slot_number IS NOT NULL`,
        [bracket.tournament_id]
      );
      for (const g of games) { resultsMap[g.slot_number] = g; }
    } else {
      const results = await db.getAll('SELECT * FROM bracket_results WHERE challenge_id = $1', [bracket.challenge_id]);
      for (const r of results) { resultsMap[r.slot_number] = r; }
    }

    res.json({ bracket, results: resultsMap });
  } catch (error) {
    console.error('Error fetching bracket:', error);
    res.status(500).json({ error: 'Failed to fetch bracket' });
  }
});

// ─── Tournament Data (Public) ────────────────────────────────────────────────

// Get tournament bracket structure
// Uses buildTournamentDataFromDB when a tournament exists in the DB, so that
// slot numbering is consistent with the canonical region ordering used when
// users filled their brackets. Falls back to getTournamentBracket (live ESPN
// data) when no DB tournament exists yet (pre-bracket-set).
router.get('/tournament/:season', async (req, res) => {
  try {
    const season = parseInt(req.params.season);
    // Check if we have a DB tournament for this season
    const tournament = await db.getOne('SELECT id FROM tournaments WHERE season = $1', [season]);
    if (tournament) {
      const data = await buildTournamentDataFromDB(tournament.id);
      return res.json(data);
    }
    // No DB tournament yet — use live ESPN data
    const bracket = await getTournamentBracket(season);
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

    // Enrich key players with NBA draft rankings
    if (breakdown.keyPlayers?.length > 0) {
      await enrichPlayersWithDraftRank(breakdown.keyPlayers);
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

    // Get bracket data — prefer normalized tables, fall back to JSONB
    const tournament = await db.getOne('SELECT id FROM tournaments WHERE season = $1', [season]);
    let tournamentData = null;
    if (tournament) {
      tournamentData = await buildTournamentDataFromDB(tournament.id);
    }
    if (!tournamentData) {
      const challenge = await db.getOne(
        `SELECT tournament_data FROM bracket_challenges WHERE season = $1 ORDER BY created_at DESC LIMIT 1`,
        [season]
      );
      tournamentData = challenge?.tournament_data;
    }

    if (!tournamentData?.slots) {
      return res.status(404).json({ error: 'No bracket data found' });
    }

    const slots = tournamentData.slots;
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
      const teams = tournamentData?.teams || {};
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
      const regionNames = tournamentData?.regions || DEFAULT_REGIONS;

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

    // Get matchups for the round — prefer normalized tables, fall back to JSONB
    const tournament = await db.getOne('SELECT id FROM tournaments WHERE season = $1', [season]);
    let tournamentData = null;
    if (tournament) {
      tournamentData = await buildTournamentDataFromDB(tournament.id);
    }
    if (!tournamentData) {
      const challenge = await db.getOne(
        `SELECT tournament_data FROM bracket_challenges WHERE season = $1 ORDER BY created_at DESC LIMIT 1`,
        [season]
      );
      tournamentData = challenge?.tournament_data;
    }

    if (!tournamentData?.slots) {
      return res.status(404).json({ error: 'No bracket data found' });
    }

    const slots = tournamentData.slots;
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

    // Group challenges by season/tournament to avoid duplicate ESPN fetches
    const seasonMap = {};
    for (const c of activeChallenges) {
      if (!seasonMap[c.season]) seasonMap[c.season] = [];
      seasonMap[c.season].push(c);
    }

    for (const [season, challenges] of Object.entries(seasonMap)) {
      const espnResults = await getTournamentResults(parseInt(season));

      // Sync to tournament_games if any challenge has tournament_id
      const tournamentId = challenges.find(c => c.tournament_id)?.tournament_id;
      if (tournamentId) {
        // Re-sync from ESPN to update team IDs, event-to-slot mappings, and
        // scores for later rounds as teams advance through the bracket.
        // This is essential because later-round games (S16, E8, etc.) are
        // initially created with placeholder team IDs when earlier rounds
        // haven't completed yet. Without this re-sync, team IDs stay as
        // placeholders (-1, -2) and event-to-slot mappings can be wrong.
        try {
          await syncTournamentFromESPN(parseInt(season));
        } catch (err) {
          console.error('[update-results] syncTournamentFromESPN failed:', err.message);
        }

        // Build event→slot map and team mapping from tournament_games (after sync)
        const tGames = await db.getAll('SELECT slot_number, espn_event_id, team1_espn_id, team2_espn_id FROM tournament_games WHERE tournament_id = $1 AND slot_number IS NOT NULL', [tournamentId]);
        const eventToSlot = {};
        const eventToGame = {};
        const slotToEvent = {};
        for (const g of tGames) {
          if (g.espn_event_id) {
            eventToSlot[g.espn_event_id] = g.slot_number;
            eventToGame[g.espn_event_id] = g;
            slotToEvent[g.slot_number] = g.espn_event_id;
          }
        }

        // Clean up stale bracket_results where the event-to-slot mapping changed
        // (e.g., when an ESPN event was initially assigned to the wrong slot)
        for (const challenge of challenges) {
          await db.run(`
            DELETE FROM bracket_results
            WHERE challenge_id = $1
              AND espn_event_id IS NOT NULL
              AND slot_number IN (
                SELECT br.slot_number FROM bracket_results br
                JOIN tournament_games tg ON tg.tournament_id = $2 AND tg.slot_number = br.slot_number
                WHERE br.challenge_id = $1 AND tg.espn_event_id != br.espn_event_id
              )
          `, [challenge.id, tournamentId]);
        }

        let hasFirstGameStarted = false;
        for (const [eventId, result] of Object.entries(espnResults)) {
          const slotNum = eventToSlot[eventId];
          if (result.status !== 'pending') hasFirstGameStarted = true;

          if (result.status === 'final' && result.winningTeamId && slotNum) {
            // Map scores to correct team1/team2 using ESPN IDs
            const gameRow = eventToGame[eventId];
            let t1Score = result.winningScore;
            let t2Score = result.losingScore;
            // Also update team IDs if they're still placeholders or missing
            let team1Id = gameRow?.team1_espn_id;
            let team2Id = gameRow?.team2_espn_id;
            if (gameRow && result.competitors && result.competitors.length >= 2) {
              const c1 = result.competitors.find(c => String(c.teamId) === String(gameRow.team1_espn_id));
              const c2 = result.competitors.find(c => String(c.teamId) === String(gameRow.team2_espn_id));
              if (c1) t1Score = c1.score;
              if (c2) t2Score = c2.score;
              // If team IDs are placeholders (negative or null), populate from competitors
              if (!team1Id || parseInt(team1Id) < 0 || !team2Id || parseInt(team2Id) < 0) {
                team1Id = String(result.competitors[0].teamId);
                team2Id = String(result.competitors[1].teamId);
                t1Score = result.competitors[0].score;
                t2Score = result.competitors[1].score;
              }
            }
            await db.run(`
              UPDATE tournament_games SET
                winning_team_espn_id = $1, losing_team_espn_id = $2,
                team1_score = $3, team2_score = $4,
                team1_espn_id = COALESCE(NULLIF($7, ''), team1_espn_id),
                team2_espn_id = COALESCE(NULLIF($8, ''), team2_espn_id),
                status = 'final', completed_at = COALESCE(completed_at, NOW()), updated_at = NOW()
              WHERE tournament_id = $5 AND slot_number = $6
            `, [result.winningTeamId, result.losingTeamId, t1Score, t2Score, tournamentId, slotNum, team1Id, team2Id]);
            totalUpdated++;
          } else if (result.status === 'in_progress' && slotNum) {
            // Also update team IDs for in-progress games with placeholder teams
            const gameRow = eventToGame[eventId];
            let team1Id = null;
            let team2Id = null;
            if (gameRow && result.competitors && result.competitors.length >= 2) {
              if (!gameRow.team1_espn_id || parseInt(gameRow.team1_espn_id) < 0 || !gameRow.team2_espn_id || parseInt(gameRow.team2_espn_id) < 0) {
                team1Id = String(result.competitors[0].teamId);
                team2Id = String(result.competitors[1].teamId);
              }
            }
            await db.run(`
              UPDATE tournament_games SET
                status = 'in_progress',
                team1_espn_id = COALESCE(NULLIF($3, ''), team1_espn_id),
                team2_espn_id = COALESCE(NULLIF($4, ''), team2_espn_id),
                updated_at = NOW()
              WHERE tournament_id = $1 AND slot_number = $2 AND status != 'final'
            `, [tournamentId, slotNum, team1Id, team2Id]);
          }

          // Also update by espn_event_id for First Four games (no slot_number)
          if (!slotNum && (result.status === 'final' || result.status === 'in_progress')) {
            // Look up existing team order to assign scores correctly
            const ff = await db.getOne('SELECT team1_espn_id, team2_espn_id FROM tournament_games WHERE tournament_id = $1 AND espn_event_id = $2', [tournamentId, eventId]);
            let ffT1Score = result.winningScore;
            let ffT2Score = result.losingScore;
            if (ff && result.competitors) {
              const c1 = result.competitors.find(c => String(c.teamId) === String(ff.team1_espn_id));
              const c2 = result.competitors.find(c => String(c.teamId) === String(ff.team2_espn_id));
              if (c1) ffT1Score = c1.score;
              if (c2) ffT2Score = c2.score;
            }
            await db.run(`
              UPDATE tournament_games SET
                winning_team_espn_id = CASE WHEN $1::text IS NOT NULL THEN $1 ELSE winning_team_espn_id END,
                losing_team_espn_id = CASE WHEN $2::text IS NOT NULL THEN $2 ELSE losing_team_espn_id END,
                team1_score = COALESCE($3::int, team1_score), team2_score = COALESCE($4::int, team2_score),
                status = $5, completed_at = CASE WHEN $5 = 'final' THEN COALESCE(completed_at, NOW()) ELSE completed_at END,
                updated_at = NOW()
              WHERE tournament_id = $6 AND espn_event_id = $7
            `, [result.winningTeamId || null, result.losingTeamId || null, ffT1Score, ffT2Score, result.status, tournamentId, eventId]);
          }
        }

        // Propagate First Four winners into R64 slots
        await propagateFirstFourWinners(tournamentId);

        // Failsafe: detect stuck games (in_progress but game clock at 0:00 or status looks final)
        // and auto-refetch from ESPN game summary API
        const stuckGames = await db.getAll(
          `SELECT id, espn_event_id, slot_number, status_detail, updated_at
           FROM tournament_games
           WHERE tournament_id = $1
             AND status = 'in_progress'
             AND espn_event_id IS NOT NULL
             AND (
               status_detail ILIKE '%0:00%'
               OR status_detail ILIKE '%final%'
               OR status_detail ILIKE '%end of%'
               OR updated_at < NOW() - INTERVAL '10 minutes'
             )`,
          [tournamentId]
        );
        for (const stuck of stuckGames) {
          try {
            console.log(`[Failsafe] Auto-refetching stuck game ${stuck.id} (slot ${stuck.slot_number}, ESPN ${stuck.espn_event_id}, status_detail: "${stuck.status_detail}", last updated: ${stuck.updated_at})`);
            await refreshGameFromESPN(tournamentId, stuck.id);
            totalUpdated++;
          } catch (err) {
            console.error(`[Failsafe] Failed to refetch game ${stuck.id}:`, err.message);
          }
        }

        // Build results map from tournament_games for scoring
        const allGames = await db.getAll(
          `SELECT slot_number, winning_team_espn_id as winning_team_id, losing_team_espn_id as losing_team_id,
                  CASE WHEN winning_team_espn_id IS NULL THEN NULL WHEN winning_team_espn_id = team1_espn_id THEN team1_score ELSE team2_score END as winning_score,
                  CASE WHEN winning_team_espn_id IS NULL THEN NULL WHEN winning_team_espn_id = team1_espn_id THEN team2_score ELSE team1_score END as losing_score,
                  status, completed_at
           FROM tournament_games WHERE tournament_id = $1 AND slot_number IS NOT NULL`,
          [tournamentId]
        );
        const resultsMap = {};
        for (const g of allGames) { resultsMap[g.slot_number] = g; }

        // Recalculate scores + auto-lock for all challenges in this season
        for (const challenge of challenges) {
          if (hasFirstGameStarted && challenge.status === 'open') {
            await db.run("UPDATE bracket_challenges SET status = 'locked', updated_at = NOW() WHERE id = $1", [challenge.id]);
          }
          const scoringSystem = challenge.scoring_system || [1, 2, 4, 8, 16, 32];
          const brackets = await db.getAll('SELECT id, picks FROM brackets WHERE challenge_id = $1 AND is_submitted = true', [challenge.id]);
          for (const bracket of brackets) {
            const { totalScore } = calculateBracketScore(bracket.picks || {}, resultsMap, scoringSystem);
            await db.run('UPDATE brackets SET total_score = $1, updated_at = NOW() WHERE id = $2', [totalScore, bracket.id]);
          }

          // Dual-write to bracket_results for backward compatibility
          for (const [eventId, result] of Object.entries(espnResults)) {
            const slotNum = eventToSlot[eventId];
            if (!slotNum) continue;
            if (result.status === 'final' && result.winningTeamId) {
              await db.run(`
                INSERT INTO bracket_results (challenge_id, slot_number, espn_event_id, winning_team_id, losing_team_id, winning_score, losing_score, round, status, completed_at)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'final', NOW())
                ON CONFLICT (challenge_id, slot_number) DO UPDATE SET
                  winning_team_id = EXCLUDED.winning_team_id, losing_team_id = EXCLUDED.losing_team_id,
                  winning_score = EXCLUDED.winning_score, losing_score = EXCLUDED.losing_score,
                  status = 'final', completed_at = COALESCE(bracket_results.completed_at, NOW())
              `, [challenge.id, slotNum, eventId, result.winningTeamId, result.losingTeamId, result.winningScore, result.losingScore, getSlotRound(slotNum)]);
            } else if (result.status === 'in_progress') {
              await db.run(`
                INSERT INTO bracket_results (challenge_id, slot_number, espn_event_id, round, status)
                VALUES ($1, $2, $3, $4, 'in_progress')
                ON CONFLICT (challenge_id, slot_number) DO UPDATE SET status = 'in_progress'
              `, [challenge.id, slotNum, eventId, getSlotRound(slotNum)]);
            }
          }
        }
      } else {
        // Legacy path: no tournament_id, use old per-challenge logic
        for (const challenge of challenges) {
          const tournamentData = challenge.tournament_data || {};
          const slots = tournamentData.slots || {};
          const eventToSlot = {};
          for (const [slotNum, slotData] of Object.entries(slots)) {
            if (slotData.espnEventId) eventToSlot[slotData.espnEventId] = parseInt(slotNum);
          }
          const existingResults = await db.getAll('SELECT * FROM bracket_results WHERE challenge_id = $1', [challenge.id]);
          for (const er of existingResults) {
            if (er.espn_event_id) eventToSlot[er.espn_event_id] = er.slot_number;
          }
          let hasFirstGameStarted = false;
          for (const [eventId, result] of Object.entries(espnResults)) {
            const slotNum = eventToSlot[eventId];
            if (!slotNum) continue;
            if (result.status !== 'pending') hasFirstGameStarted = true;
            if (result.status === 'final' && result.winningTeamId) {
              await db.run(`
                INSERT INTO bracket_results (challenge_id, slot_number, espn_event_id, winning_team_id, losing_team_id, winning_score, losing_score, round, status, completed_at)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'final', NOW())
                ON CONFLICT (challenge_id, slot_number) DO UPDATE SET
                  winning_team_id = EXCLUDED.winning_team_id, losing_team_id = EXCLUDED.losing_team_id,
                  winning_score = EXCLUDED.winning_score, losing_score = EXCLUDED.losing_score,
                  status = 'final', completed_at = COALESCE(bracket_results.completed_at, NOW())
              `, [challenge.id, slotNum, eventId, result.winningTeamId, result.losingTeamId, result.winningScore, result.losingScore, getSlotRound(slotNum)]);
              totalUpdated++;
            } else if (result.status === 'in_progress') {
              await db.run(`
                INSERT INTO bracket_results (challenge_id, slot_number, espn_event_id, round, status)
                VALUES ($1, $2, $3, $4, 'in_progress')
                ON CONFLICT (challenge_id, slot_number) DO UPDATE SET status = 'in_progress'
              `, [challenge.id, slotNum, eventId, getSlotRound(slotNum)]);
            }
          }
          if (hasFirstGameStarted && challenge.status === 'open') {
            await db.run("UPDATE bracket_challenges SET status = 'locked', updated_at = NOW() WHERE id = $1", [challenge.id]);
          }
          const allResults = await db.getAll('SELECT * FROM bracket_results WHERE challenge_id = $1', [challenge.id]);
          const resultsMap = {};
          for (const r of allResults) { resultsMap[r.slot_number] = r; }
          const scoringSystem = challenge.scoring_system || [1, 2, 4, 8, 16, 32];
          const brackets = await db.getAll('SELECT id, picks FROM brackets WHERE challenge_id = $1 AND is_submitted = true', [challenge.id]);
          for (const bracket of brackets) {
            const { totalScore } = calculateBracketScore(bracket.picks || {}, resultsMap, scoringSystem);
            await db.run('UPDATE brackets SET total_score = $1, updated_at = NOW() WHERE id = $2', [totalScore, bracket.id]);
          }
        }
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

    // Build results from tournament_games if available, fall back to bracket_results
    const resultsMap = {};
    const eliminatedTeamIds = [];
    if (challenge.tournament_id) {
      const games = await db.getAll(
        `SELECT slot_number, espn_event_id, winning_team_espn_id as winning_team_id, losing_team_espn_id as losing_team_id,
                CASE WHEN winning_team_espn_id IS NULL THEN NULL WHEN winning_team_espn_id = team1_espn_id THEN team1_score ELSE team2_score END as winning_score,
                CASE WHEN winning_team_espn_id IS NULL THEN NULL WHEN winning_team_espn_id = team1_espn_id THEN team2_score ELSE team1_score END as losing_score,
                round, status, completed_at
         FROM tournament_games WHERE tournament_id = $1 AND slot_number IS NOT NULL`,
        [challenge.tournament_id]
      );
      for (const g of games) {
        resultsMap[g.slot_number] = g;
        if (g.status === 'final' && g.losing_team_id) eliminatedTeamIds.push(String(g.losing_team_id));
      }
    } else {
      const results = await db.getAll('SELECT * FROM bracket_results WHERE challenge_id = $1', [challenge.id]);
      for (const r of results) {
        resultsMap[r.slot_number] = r;
        if (r.status === 'final' && r.losing_team_id) eliminatedTeamIds.push(String(r.losing_team_id));
      }
    }

    const scoringSystem = challenge.scoring_system || [1, 2, 4, 8, 16, 32];

    const leaderboard = brackets.map((b, idx) => {
      const { roundScores, correctPicks, totalDecided } = calculateBracketScore(b.picks || {}, resultsMap, scoringSystem);
      const potentialPoints = calculatePotentialPoints(b.picks || {}, resultsMap, scoringSystem);

      // Extract Final Four + Championship picks (slots 57-63) for preview
      const picks = b.picks || {};
      const finalFourPicks = {};
      for (let s = 57; s <= 63; s++) {
        if (picks[s] || picks[String(s)]) finalFourPicks[s] = picks[s] || picks[String(s)];
      }

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
        tiebreakerScores: b.tiebreaker_scores || null,
        championTeamId: picks[63] || picks['63'] || null,
        finalFourPicks,
        picks,
        isCurrentUser: b.user_id === user.id,
      };
    });

    // Determine the current round (highest round with any decided games)
    let currentRound = 0;
    for (const r of Object.values(resultsMap)) {
      if (r.status === 'final') {
        const rb = ROUND_BOUNDARIES.find(rb => r.slot_number >= rb.start && r.slot_number <= rb.end);
        if (rb) {
          const roundIdx = ROUND_BOUNDARIES.indexOf(rb);
          if (roundIdx > currentRound) currentRound = roundIdx;
        }
      }
    }

    // Calculate actual championship total for tiebreaker comparison
    const champResult = resultsMap[63];
    let actualChampTotal = null;
    if (champResult && champResult.status === 'final' && champResult.winning_score != null && champResult.losing_score != null) {
      actualChampTotal = parseInt(champResult.winning_score) + parseInt(champResult.losing_score);
      // Add tiebreaker diff to each entry
      for (const entry of leaderboard) {
        if (entry.tiebreakerValue != null) {
          entry.tiebreakerDiff = Math.abs(entry.tiebreakerValue - actualChampTotal);
        }
      }
    }

    // Sort: total points → potential points → correct picks → current round points → tiebreaker
    leaderboard.sort((a, b) => {
      if (b.totalScore !== a.totalScore) return b.totalScore - a.totalScore;
      if (b.potentialPoints !== a.potentialPoints) return b.potentialPoints - a.potentialPoints;
      if (b.correctPicks !== a.correctPicks) return b.correctPicks - a.correctPicks;
      const aRoundPts = a.roundScores?.[currentRound] || 0;
      const bRoundPts = b.roundScores?.[currentRound] || 0;
      if (bRoundPts !== aRoundPts) return bRoundPts - aRoundPts;
      // Final tiebreaker: closer to actual championship total score
      if (challenge.tiebreaker_type === 'total_score') {
        const champResult = resultsMap[63];
        if (champResult && champResult.status === 'final' && champResult.winning_score != null && champResult.losing_score != null) {
          const actualTotal = parseInt(champResult.winning_score) + parseInt(champResult.losing_score);
          const aDiff = Math.abs((a.tiebreakerValue || 0) - actualTotal);
          const bDiff = Math.abs((b.tiebreakerValue || 0) - actualTotal);
          return aDiff - bDiff; // Lower difference (closer prediction) wins
        }
        // Championship not final yet — don't use tiebreaker
      }
      return 0;
    });
    // Competition ranking: tied entries get the same rank, next rank skips (1, 2, 2, 4)
    leaderboard.forEach((entry, idx) => {
      if (idx === 0) {
        entry.rank = 1;
      } else {
        const prev = leaderboard[idx - 1];
        const isTied = entry.totalScore === prev.totalScore &&
          entry.potentialPoints === prev.potentialPoints &&
          entry.correctPicks === prev.correctPicks &&
          (entry.roundScores?.[currentRound] || 0) === (prev.roundScores?.[currentRound] || 0) &&
          (entry.tiebreakerDiff ?? 999) === (prev.tiebreakerDiff ?? 999);
        if (isTied) {
          entry.rank = prev.rank; // Same rank for ties
        } else {
          entry.rank = idx + 1; // Skip ranks (competition ranking: 1, 2, 2, 4)
        }
      }
    });

    // Check if tournament has started (to control bracket visibility)
    const tournamentStarted = await checkTournamentStarted(challenge.season);

    res.json({ leaderboard, results: resultsMap, scoringSystem, entryFee: parseFloat(challenge.entry_fee) || 0, tournamentStarted, eliminatedTeamIds, actualChampTotal });
  } catch (error) {
    console.error('Error fetching leaderboard:', error);
    res.status(500).json({ error: 'Failed to fetch leaderboard' });
  }
});

// ─── Daily Recap ──────────────────────────────────────────────────────────────

// Get recap for a specific date
router.get('/tournaments/:tournamentId/recap', authMiddleware, async (req, res) => {
  try {
    const { tournamentId } = req.params;
    const { date, leagueId } = req.query;
    if (!date || !leagueId) return res.status(400).json({ error: 'date and leagueId required' });

    const recap = await db.getOne(
      `SELECT * FROM daily_recaps WHERE tournament_id = $1 AND league_id = $2 AND recap_date = $3`,
      [tournamentId, leagueId, date]
    );
    if (!recap) return res.status(404).json({ error: 'No recap for this date' });
    res.json(recap);
  } catch (error) {
    console.error('Error fetching recap:', error);
    res.status(500).json({ error: 'Failed to fetch recap' });
  }
});

// Get available recap dates
router.get('/tournaments/:tournamentId/recap-dates', authMiddleware, async (req, res) => {
  try {
    const { tournamentId } = req.params;
    const { leagueId } = req.query;
    if (!leagueId) return res.status(400).json({ error: 'leagueId required' });

    const rows = await db.getAll(
      `SELECT recap_date FROM daily_recaps WHERE tournament_id = $1 AND league_id = $2 ORDER BY recap_date DESC`,
      [tournamentId, leagueId]
    );
    res.json(rows.map(r => r.recap_date));
  } catch (error) {
    console.error('Error fetching recap dates:', error);
    res.status(500).json({ error: 'Failed to fetch recap dates' });
  }
});

// Generate a recap (admin only)
router.post('/tournaments/:tournamentId/generate-recap', authMiddleware, async (req, res) => {
  try {
    const user = await getUser(req);
    if (!user?.is_admin) return res.status(403).json({ error: 'Admin only' });

    const { tournamentId } = req.params;
    const { leagueId, date, customPrompt } = req.body;
    if (!leagueId || !date) return res.status(400).json({ error: 'leagueId and date required' });

    const recap = await generateAndStoreRecap(tournamentId, leagueId, date, customPrompt || null);

    // Send TL;DR to league chat as ai_recap message (one per date per league)
    const io = req.app.get('io');
    if (io) {
      const metadataJson = JSON.stringify({ recapDate: date, recapId: recap.id });
      // Check if ai_recap message already exists for this league+date
      const existing = await db.getOne(
        `SELECT id FROM chat_messages WHERE league_id = $1 AND message_type = 'ai_recap' AND metadata->>'recapDate' = $2`,
        [leagueId, date]
      );
      let systemMsg;
      if (existing) {
        // Update existing message
        systemMsg = await db.getOne(
          `UPDATE chat_messages SET message = $1, metadata = $2 WHERE id = $3 RETURNING id, created_at`,
          [recap.tldr, metadataJson, existing.id]
        );
      } else {
        systemMsg = await db.getOne(
          `INSERT INTO chat_messages (league_id, user_id, message, message_type, metadata)
           VALUES ($1, $2, $3, 'ai_recap', $4)
           RETURNING id, created_at`,
          [leagueId, user.id, recap.tldr, metadataJson]
        );
      }
      if (systemMsg) {
        io.to(`league:${leagueId}`).emit('new-message', {
          id: systemMsg.id,
          league_id: leagueId,
          user_id: user.id,
          message: recap.tldr,
          messageType: 'ai_recap',
          message_type: 'ai_recap',
          metadata: { recapDate: date, recapId: recap.id },
          gif: null,
          replyTo: null,
          reactions: {},
          created_at: systemMsg.created_at,
          display_name: 'AI Recap',
          profile_image_url: null,
        });
      }
    }

    res.json(recap);
  } catch (error) {
    console.error('Error generating recap:', error);
    res.status(500).json({ error: error.message || 'Failed to generate recap' });
  }
});

module.exports = router;
