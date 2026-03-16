const express = require('express');
const router = express.Router();
const { db } = require('../db/supabase');
const { adminMiddleware } = require('../middleware/admin');
const { generateAllReports, getStoredReport, getTournamentBracket } = require('../services/ncaab-tournament');
const { getSlotRound, calculateBracketScore, ROUND_BOUNDARIES } = require('../utils/bracket-slots');

// All routes require admin
router.use(adminMiddleware);

// ─── Dashboard Stats ─────────────────────────────────────────────────────────

router.get('/stats', async (req, res) => {
  try {
    const [users, leagues, reports, brackets] = await Promise.all([
      db.getOne('SELECT COUNT(*) as count FROM users'),
      db.getOne('SELECT COUNT(*) as count FROM leagues'),
      db.getOne('SELECT COUNT(*) as count FROM scouting_reports'),
      db.getOne('SELECT COUNT(*) as count FROM brackets'),
    ]);

    res.json({
      userCount: parseInt(users.count),
      leagueCount: parseInt(leagues.count),
      reportCount: parseInt(reports.count),
      bracketCount: parseInt(brackets.count),
    });
  } catch (error) {
    console.error('Admin stats error:', error);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

// ─── Users ───────────────────────────────────────────────────────────────────

router.get('/users', async (req, res) => {
  try {
    const { search = '', page = 1, limit = 25 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    let whereClause = '';
    const params = [];

    if (search) {
      params.push(`%${search}%`);
      whereClause = `WHERE display_name ILIKE $1 OR email ILIKE $1 OR phone ILIKE $1`;
    }

    const countQuery = `SELECT COUNT(*) as count FROM users ${whereClause}`;
    const total = await db.getOne(countQuery, params);

    const dataParams = [...params, parseInt(limit), offset];
    const users = await db.getAll(
      `SELECT u.id, u.display_name, u.email, u.phone, u.is_admin, u.created_at, u.last_login_at,
              (SELECT COUNT(*) FROM league_members lm WHERE lm.user_id = u.id) as league_count
       FROM users u
       ${whereClause}
       ORDER BY u.last_login_at DESC NULLS LAST
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      dataParams
    );

    res.json({
      users: users.map(u => ({
        id: u.id,
        displayName: u.display_name,
        email: u.email,
        phone: u.phone,
        isAdmin: u.is_admin || false,
        leagueCount: parseInt(u.league_count),
        createdAt: u.created_at,
        lastLoginAt: u.last_login_at,
      })),
      total: parseInt(total.count),
      page: parseInt(page),
      totalPages: Math.ceil(parseInt(total.count) / parseInt(limit)),
    });
  } catch (error) {
    console.error('Admin users error:', error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

router.get('/users/:id', async (req, res) => {
  try {
    const user = await db.getOne(
      `SELECT id, display_name, email, phone, firebase_uid, is_admin, created_at, updated_at, last_login_at
       FROM users WHERE id = $1`,
      [req.params.id]
    );

    if (!user) return res.status(404).json({ error: 'User not found' });

    const leagues = await db.getAll(
      `SELECT l.id, l.name, l.sport_id, l.status, lm.strikes, lm.status as member_status, lm.joined_at,
              CASE WHEN l.commissioner_id = $1 THEN true ELSE false END as is_commissioner
       FROM league_members lm
       JOIN leagues l ON l.id = lm.league_id
       WHERE lm.user_id = $1
       ORDER BY lm.joined_at DESC`,
      [req.params.id]
    );

    res.json({
      id: user.id,
      displayName: user.display_name,
      email: user.email,
      phone: user.phone,
      firebaseUid: user.firebase_uid,
      isAdmin: user.is_admin || false,
      createdAt: user.created_at,
      updatedAt: user.updated_at,
      lastLoginAt: user.last_login_at,
      leagues: leagues.map(l => ({
        id: l.id,
        name: l.name,
        sportId: l.sport_id,
        status: l.status,
        strikes: l.strikes,
        memberStatus: l.member_status,
        isCommissioner: l.is_commissioner,
        joinedAt: l.joined_at,
      })),
    });
  } catch (error) {
    console.error('Admin user detail error:', error);
    res.status(500).json({ error: 'Failed to fetch user' });
  }
});

// ─── Leagues ─────────────────────────────────────────────────────────────────

router.get('/leagues', async (req, res) => {
  try {
    const { search = '', page = 1, limit = 25 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    let whereClause = '';
    const params = [];

    if (search) {
      params.push(`%${search}%`);
      whereClause = `WHERE l.name ILIKE $1`;
    }

    const countQuery = `SELECT COUNT(*) as count FROM leagues l ${whereClause}`;
    const total = await db.getOne(countQuery, params);

    const dataParams = [...params, parseInt(limit), offset];
    const leagues = await db.getAll(
      `SELECT l.id, l.name, l.sport_id, l.status, l.season, l.created_at,
              u.display_name as commissioner_name,
              (SELECT COUNT(*) FROM league_members lm WHERE lm.league_id = l.id) as member_count
       FROM leagues l
       LEFT JOIN users u ON u.id = l.commissioner_id
       ${whereClause}
       ORDER BY l.created_at DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      dataParams
    );

    res.json({
      leagues: leagues.map(l => ({
        id: l.id,
        name: l.name,
        sportId: l.sport_id,
        status: l.status,
        season: l.season,
        commissionerName: l.commissioner_name,
        memberCount: parseInt(l.member_count),
        createdAt: l.created_at,
      })),
      total: parseInt(total.count),
      page: parseInt(page),
      totalPages: Math.ceil(parseInt(total.count) / parseInt(limit)),
    });
  } catch (error) {
    console.error('Admin leagues error:', error);
    res.status(500).json({ error: 'Failed to fetch leagues' });
  }
});

router.get('/leagues/:id', async (req, res) => {
  try {
    const league = await db.getOne(
      `SELECT l.*, u.display_name as commissioner_name
       FROM leagues l
       LEFT JOIN users u ON u.id = l.commissioner_id
       WHERE l.id = $1`,
      [req.params.id]
    );

    if (!league) return res.status(404).json({ error: 'League not found' });

    const members = await db.getAll(
      `SELECT lm.*, u.display_name, u.email, u.phone
       FROM league_members lm
       JOIN users u ON u.id = lm.user_id
       WHERE lm.league_id = $1
       ORDER BY lm.joined_at ASC`,
      [req.params.id]
    );

    res.json({
      id: league.id,
      name: league.name,
      sportId: league.sport_id,
      status: league.status,
      season: league.season,
      maxStrikes: league.max_strikes,
      startWeek: league.start_week,
      commissionerName: league.commissioner_name,
      createdAt: league.created_at,
      members: members.map(m => ({
        id: m.user_id,
        displayName: m.display_name,
        email: m.email,
        strikes: m.strikes,
        status: m.status,
        joinedAt: m.joined_at,
      })),
    });
  } catch (error) {
    console.error('Admin league detail error:', error);
    res.status(500).json({ error: 'Failed to fetch league' });
  }
});

// ─── Scouting Reports ───────────────────────────────────────────────────────

router.get('/reports', async (req, res) => {
  try {
    const { season = new Date().getFullYear() } = req.query;

    // Get tournament teams
    let teams = [];
    try {
      const bracket = await getTournamentBracket(parseInt(season));
      if (bracket?.teams) {
        teams = Object.entries(bracket.teams).map(([id, team]) => ({
          id,
          name: team.name || team.shortName,
          abbreviation: team.abbreviation,
          seed: team.seed,
          logo: team.logo,
        }));
      }
    } catch {
      // Tournament data may not be available
    }

    // Get existing reports with concise_report to detect incomplete ones
    const reports = await db.getAll(
      'SELECT team_id, generated_at, concise_report, report FROM scouting_reports WHERE season = $1',
      [parseInt(season)]
    );

    const reportMap = {};
    let incompleteCount = 0;
    for (const r of reports) {
      const isIncomplete = !r.report || !r.concise_report ||
        (r.concise_report && !/[.!?]$/.test(r.concise_report.trim()));
      reportMap[r.team_id] = { generatedAt: r.generated_at, isIncomplete };
      if (isIncomplete) incompleteCount++;
    }

    // Merge team info with report status
    const teamsWithStatus = teams.map(t => ({
      ...t,
      hasReport: !!reportMap[t.id],
      isIncomplete: reportMap[t.id]?.isIncomplete || false,
      generatedAt: reportMap[t.id]?.generatedAt || null,
    }));

    // Sort: missing reports first, then by seed
    teamsWithStatus.sort((a, b) => {
      if (a.hasReport !== b.hasReport) return a.hasReport ? 1 : -1;
      return (a.seed || 99) - (b.seed || 99);
    });

    res.json({
      season: parseInt(season),
      totalTeams: teams.length,
      reportsGenerated: reports.length,
      incompleteCount,
      teams: teamsWithStatus,
    });
  } catch (error) {
    console.error('Admin reports error:', error);
    res.status(500).json({ error: 'Failed to fetch reports' });
  }
});

router.get('/reports/:teamId', async (req, res) => {
  try {
    const { season = new Date().getFullYear() } = req.query;
    const report = await db.getOne(
      'SELECT team_id, season, report, concise_report, generated_at FROM scouting_reports WHERE team_id = $1 AND season = $2',
      [req.params.teamId, parseInt(season)]
    );

    if (!report) return res.status(404).json({ error: 'Report not found' });

    res.json({
      teamId: report.team_id,
      season: report.season,
      report: report.report,
      conciseReport: report.concise_report,
      generatedAt: report.generated_at,
    });
  } catch (error) {
    console.error('Admin report detail error:', error);
    res.status(500).json({ error: 'Failed to fetch report' });
  }
});

router.post('/reports/generate', async (req, res) => {
  try {
    const { season = new Date().getFullYear(), teamId, force = false, incompleteOnly = false } = req.body;
    console.log(`[Admin] Generating scouting reports for season ${season}${teamId ? ` (team ${teamId})` : ''}${force ? ' (force)' : ''}${incompleteOnly ? ' (incomplete only)' : ''}`);

    const result = await generateAllReports(parseInt(season), { teamId, force, incompleteOnly });
    res.json(result);
  } catch (error) {
    console.error('Admin report generation error:', error);
    res.status(500).json({ error: error.message || 'Failed to generate reports' });
  }
});

// ─── Bracket Challenges (Testing) ──────────────────────────────────────────

router.get('/challenges', async (req, res) => {
  try {
    const challenges = await db.getAll(`
      SELECT bc.id, bc.league_id, bc.season, bc.status, bc.scoring_system, bc.tournament_data,
             l.name as league_name,
             (SELECT COUNT(*) FROM brackets b WHERE b.challenge_id = bc.id) as bracket_count,
             (SELECT COUNT(*) FROM brackets b WHERE b.challenge_id = bc.id AND b.is_submitted = true) as submitted_count
      FROM bracket_challenges bc
      JOIN leagues l ON l.id = bc.league_id
      ORDER BY bc.created_at DESC
    `);

    res.json({
      challenges: challenges.map(c => ({
        id: c.id,
        leagueId: c.league_id,
        leagueName: c.league_name,
        season: c.season,
        status: c.status,
        scoringSystem: c.scoring_system,
        bracketCount: parseInt(c.bracket_count),
        submittedCount: parseInt(c.submitted_count),
        teamCount: Object.keys(c.tournament_data?.teams || {}).length,
      })),
    });
  } catch (error) {
    console.error('Admin challenges error:', error);
    res.status(500).json({ error: 'Failed to fetch challenges' });
  }
});

router.get('/challenges/:id', async (req, res) => {
  try {
    const challenge = await db.getOne(`
      SELECT bc.*, l.name as league_name
      FROM bracket_challenges bc
      JOIN leagues l ON l.id = bc.league_id
      WHERE bc.id = $1
    `, [req.params.id]);

    if (!challenge) return res.status(404).json({ error: 'Challenge not found' });

    const results = await db.getAll(
      'SELECT * FROM bracket_results WHERE challenge_id = $1 ORDER BY slot_number',
      [challenge.id]
    );

    const resultsMap = {};
    for (const r of results) {
      resultsMap[r.slot_number] = {
        slotNumber: r.slot_number,
        winningTeamId: r.winning_team_id,
        losingTeamId: r.losing_team_id,
        winningScore: r.winning_score,
        losingScore: r.losing_score,
        round: r.round,
        status: r.status,
      };
    }

    res.json({
      id: challenge.id,
      leagueName: challenge.league_name,
      season: challenge.season,
      status: challenge.status,
      scoringSystem: challenge.scoring_system,
      tournamentData: challenge.tournament_data,
      results: resultsMap,
    });
  } catch (error) {
    console.error('Admin challenge detail error:', error);
    res.status(500).json({ error: 'Failed to fetch challenge' });
  }
});

router.post('/challenges/:id/set-result', async (req, res) => {
  try {
    const { slotNumber, winningTeamId, losingTeamId, winningScore = 0, losingScore = 0 } = req.body;

    if (!slotNumber || !winningTeamId) {
      return res.status(400).json({ error: 'slotNumber and winningTeamId are required' });
    }

    const challenge = await db.getOne('SELECT * FROM bracket_challenges WHERE id = $1', [req.params.id]);
    if (!challenge) return res.status(404).json({ error: 'Challenge not found' });

    const round = getSlotRound(slotNumber);

    // Insert/update the result
    await db.run(`
      INSERT INTO bracket_results (challenge_id, slot_number, winning_team_id, losing_team_id, winning_score, losing_score, round, status, completed_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, 'final', NOW())
      ON CONFLICT (challenge_id, slot_number) DO UPDATE SET
        winning_team_id = EXCLUDED.winning_team_id,
        losing_team_id = EXCLUDED.losing_team_id,
        winning_score = EXCLUDED.winning_score,
        losing_score = EXCLUDED.losing_score,
        status = 'final',
        completed_at = COALESCE(bracket_results.completed_at, NOW())
    `, [challenge.id, slotNumber, winningTeamId, losingTeamId, winningScore, losingScore, round]);

    // Auto-lock if still open
    if (challenge.status === 'open') {
      await db.run("UPDATE bracket_challenges SET status = 'locked', updated_at = NOW() WHERE id = $1", [challenge.id]);
    }

    // Recalculate scores for all submitted brackets
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

    res.json({ success: true, slotNumber, round });
  } catch (error) {
    console.error('Admin set result error:', error);
    res.status(500).json({ error: 'Failed to set result' });
  }
});

// ─── Delete League ──────────────────────────────────────────────────────────

router.delete('/leagues/:id', async (req, res) => {
  try {
    const deleted = await db.getOne(
      'DELETE FROM leagues WHERE id = $1 RETURNING id, name',
      [req.params.id]
    );
    if (!deleted) {
      return res.status(404).json({ error: 'League not found' });
    }
    res.json({ deleted: true, name: deleted.name });
  } catch (error) {
    console.error('Admin delete league error:', error);
    res.status(500).json({ error: 'Failed to delete league' });
  }
});

// ─── Delete Bracket Challenge ───────────────────────────────────────────────

router.delete('/challenges/:id', async (req, res) => {
  try {
    const deleted = await db.getOne(
      `DELETE FROM bracket_challenges WHERE id = $1
       RETURNING id, (SELECT name FROM leagues WHERE id = bracket_challenges.league_id) as league_name`,
      [req.params.id]
    );
    if (!deleted) {
      return res.status(404).json({ error: 'Challenge not found' });
    }
    res.json({ deleted: true, leagueName: deleted.league_name });
  } catch (error) {
    console.error('Admin delete challenge error:', error);
    res.status(500).json({ error: 'Failed to delete challenge' });
  }
});

module.exports = router;
