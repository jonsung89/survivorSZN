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
    const now = new Date();
    const day1 = new Date(now - 24 * 3600000).toISOString();
    const day7 = new Date(now - 7 * 24 * 3600000).toISOString();
    const day30 = new Date(now - 30 * 24 * 3600000).toISOString();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();

    const [users, leagues, reports, brackets, active24h, active7d, active30d, chatToday, signupTrend, leagueTrend] = await Promise.all([
      db.getOne('SELECT COUNT(*) as count FROM users'),
      db.getOne('SELECT COUNT(*) as count FROM leagues'),
      db.getOne('SELECT COUNT(*) as count FROM scouting_reports'),
      db.getOne('SELECT COUNT(*) as count FROM brackets'),
      db.getOne('SELECT COUNT(*) as count FROM users WHERE last_login_at >= $1', [day1]),
      db.getOne('SELECT COUNT(*) as count FROM users WHERE last_login_at >= $1', [day7]),
      db.getOne('SELECT COUNT(*) as count FROM users WHERE last_login_at >= $1', [day30]),
      db.getOne('SELECT COUNT(*) as count FROM chat_messages WHERE created_at >= $1', [todayStart]),
      db.getAll(
        `SELECT DATE(created_at) as date, COUNT(*) as count
         FROM users WHERE created_at >= $1
         GROUP BY DATE(created_at) ORDER BY date`,
        [day30]
      ),
      db.getAll(
        `SELECT DATE(created_at) as date, COUNT(*) as count
         FROM leagues WHERE created_at >= $1
         GROUP BY DATE(created_at) ORDER BY date`,
        [day30]
      ),
    ]);

    res.json({
      userCount: parseInt(users.count),
      leagueCount: parseInt(leagues.count),
      reportCount: parseInt(reports.count),
      bracketCount: parseInt(brackets.count),
      activeUsers: {
        day1: parseInt(active24h.count),
        day7: parseInt(active7d.count),
        day30: parseInt(active30d.count),
      },
      chatMessagesToday: parseInt(chatToday.count),
      signupTrend: signupTrend.map(r => ({ date: r.date, count: parseInt(r.count) })),
      leagueTrend: leagueTrend.map(r => ({ date: r.date, count: parseInt(r.count) })),
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
      `SELECT u.id, u.display_name, u.first_name, u.last_name, u.profile_image_url, u.email, u.phone, u.is_admin, u.created_at, u.last_login_at,
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
        firstName: u.first_name,
        lastName: u.last_name,
        profileImageUrl: u.profile_image_url,
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
      `SELECT id, display_name, first_name, last_name, profile_image_url, email, phone, firebase_uid, is_admin, is_disabled, created_at, updated_at, last_login_at
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
      firstName: user.first_name,
      lastName: user.last_name,
      profileImageUrl: user.profile_image_url,
      email: user.email,
      phone: user.phone,
      firebaseUid: user.firebase_uid,
      isAdmin: user.is_admin || false,
      isDisabled: user.is_disabled || false,
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
    const { search = '', page = 1, limit = 25, sportId, status } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    const conditions = [];
    const params = [];

    if (search) {
      params.push(`%${search}%`);
      conditions.push(`l.name ILIKE $${params.length}`);
    }

    if (sportId) {
      params.push(sportId);
      conditions.push(`l.sport_id = $${params.length}`);
    }

    if (status) {
      params.push(status);
      conditions.push(`l.status = $${params.length}`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

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

// ─── User Management Actions ──────────────────────────────────────────────

router.put('/users/:id/toggle-admin', async (req, res) => {
  try {
    // Prevent self-demotion
    if (req.params.id === req.adminUser.id) {
      return res.status(400).json({ error: 'Cannot change your own admin status' });
    }
    const user = await db.getOne(
      'UPDATE users SET is_admin = NOT is_admin, updated_at = NOW() WHERE id = $1 RETURNING id, is_admin',
      [req.params.id]
    );
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ id: user.id, isAdmin: user.is_admin });
  } catch (error) {
    console.error('Toggle admin error:', error);
    res.status(500).json({ error: 'Failed to toggle admin status' });
  }
});

router.put('/users/:id/toggle-disabled', async (req, res) => {
  try {
    if (req.params.id === req.adminUser.id) {
      return res.status(400).json({ error: 'Cannot disable your own account' });
    }
    const user = await db.getOne(
      'UPDATE users SET is_disabled = NOT is_disabled, updated_at = NOW() WHERE id = $1 RETURNING id, is_disabled',
      [req.params.id]
    );
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ id: user.id, isDisabled: user.is_disabled });
  } catch (error) {
    console.error('Toggle disabled error:', error);
    res.status(500).json({ error: 'Failed to toggle disabled status' });
  }
});

// ─── Chat Moderation ──────────────────────────────────────────────────────

router.get('/chat/leagues', async (req, res) => {
  try {
    const leagues = await db.getAll(`
      SELECT l.id, l.name, l.sport_id,
             (SELECT COUNT(*) FROM chat_messages cm WHERE cm.league_id = l.id) as message_count,
             (SELECT MAX(cm.created_at) FROM chat_messages cm WHERE cm.league_id = l.id) as last_message_at
      FROM leagues l
      ORDER BY last_message_at DESC NULLS LAST
    `);
    res.json({
      leagues: leagues.map(l => ({
        id: l.id,
        name: l.name,
        sportId: l.sport_id,
        messageCount: parseInt(l.message_count),
      })),
    });
  } catch (error) {
    console.error('Chat leagues error:', error);
    res.status(500).json({ error: 'Failed to fetch chat leagues' });
  }
});

router.get('/chat/leagues/:id/messages', async (req, res) => {
  try {
    const { search = '', page = 1, limit = 50 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const conditions = ['cm.league_id = $1'];
    const params = [req.params.id];

    if (search) {
      params.push(`%${search}%`);
      conditions.push(`cm.message ILIKE $${params.length}`);
    }

    const whereClause = `WHERE ${conditions.join(' AND ')}`;

    const total = await db.getOne(
      `SELECT COUNT(*) as count FROM chat_messages cm ${whereClause}`,
      params
    );

    const dataParams = [...params, parseInt(limit), offset];
    const messages = await db.getAll(
      `SELECT cm.id, cm.user_id, cm.message, cm.gif, cm.deleted_at, cm.deleted_by, cm.created_at,
              u.display_name, u.profile_image_url
       FROM chat_messages cm
       JOIN users u ON cm.user_id = u.id
       ${whereClause}
       ORDER BY cm.created_at DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      dataParams
    );

    res.json({
      messages: messages.map(m => ({
        id: m.id,
        userId: m.user_id,
        message: m.message,
        gif: m.gif,
        displayName: m.display_name,
        profileImageUrl: m.profile_image_url,
        deletedAt: m.deleted_at,
        deletedBy: m.deleted_by,
        createdAt: m.created_at,
      })),
      total: parseInt(total.count),
      page: parseInt(page),
      totalPages: Math.ceil(parseInt(total.count) / parseInt(limit)),
    });
  } catch (error) {
    console.error('Chat messages error:', error);
    res.status(500).json({ error: 'Failed to fetch chat messages' });
  }
});

router.delete('/chat/messages/:id', async (req, res) => {
  try {
    await db.run(
      `UPDATE chat_messages SET message = NULL, gif = NULL, deleted_at = NOW(), deleted_by = 'admin' WHERE id = $1`,
      [req.params.id]
    );
    res.json({ success: true });
  } catch (error) {
    console.error('Delete chat message error:', error);
    res.status(500).json({ error: 'Failed to delete message' });
  }
});

router.get('/chat/reports', async (req, res) => {
  try {
    const reports = await db.getAll(`
      SELECT cr.id, cr.message_id, cr.reason, cr.status, cr.created_at,
             cm.message as message_content, cm.user_id as sender_id,
             u_sender.display_name as sender_name,
             u_reporter.display_name as reporter_name,
             l.name as league_name
      FROM chat_reports cr
      JOIN chat_messages cm ON cm.id = cr.message_id
      JOIN users u_sender ON u_sender.id = cm.user_id
      JOIN users u_reporter ON u_reporter.id = cr.reported_by
      JOIN leagues l ON l.id = cr.league_id
      WHERE cr.status = 'pending'
      ORDER BY cr.created_at DESC
    `);
    res.json({
      reports: reports.map(r => ({
        id: r.id,
        messageId: r.message_id,
        messageContent: r.message_content,
        senderName: r.sender_name,
        reporterName: r.reporter_name,
        leagueName: r.league_name,
        reason: r.reason,
        status: r.status,
        createdAt: r.created_at,
      })),
    });
  } catch (error) {
    console.error('Chat reports error:', error);
    res.status(500).json({ error: 'Failed to fetch reports' });
  }
});

router.put('/chat/reports/:id/resolve', async (req, res) => {
  try {
    const { action } = req.body; // 'resolved' or 'dismissed'
    await db.run(
      `UPDATE chat_reports SET status = $1, resolved_by = $2, resolved_at = NOW() WHERE id = $3`,
      [action, req.adminUser.id, req.params.id]
    );
    res.json({ success: true });
  } catch (error) {
    console.error('Resolve report error:', error);
    res.status(500).json({ error: 'Failed to resolve report' });
  }
});

router.post('/chat/bans', async (req, res) => {
  try {
    const { userId, leagueId, reason, expiresAt } = req.body;
    if (!userId) return res.status(400).json({ error: 'userId is required' });

    const ban = await db.getOne(
      `INSERT INTO chat_bans (user_id, league_id, banned_by, reason, expires_at)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [userId, leagueId || null, req.adminUser.id, reason || null, expiresAt || null]
    );
    res.json({ id: ban.id, success: true });
  } catch (error) {
    console.error('Create ban error:', error);
    res.status(500).json({ error: 'Failed to create ban' });
  }
});

router.get('/chat/bans', async (req, res) => {
  try {
    const bans = await db.getAll(`
      SELECT cb.id, cb.user_id, cb.league_id, cb.reason, cb.expires_at, cb.created_at,
             u.display_name, l.name as league_name
      FROM chat_bans cb
      JOIN users u ON u.id = cb.user_id
      LEFT JOIN leagues l ON l.id = cb.league_id
      WHERE cb.expires_at IS NULL OR cb.expires_at > NOW()
      ORDER BY cb.created_at DESC
    `);
    res.json({
      bans: bans.map(b => ({
        id: b.id,
        userId: b.user_id,
        leagueId: b.league_id,
        displayName: b.display_name,
        leagueName: b.league_name,
        reason: b.reason,
        expiresAt: b.expires_at,
        createdAt: b.created_at,
      })),
    });
  } catch (error) {
    console.error('Get bans error:', error);
    res.status(500).json({ error: 'Failed to fetch bans' });
  }
});

router.delete('/chat/bans/:id', async (req, res) => {
  try {
    await db.run('DELETE FROM chat_bans WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (error) {
    console.error('Remove ban error:', error);
    res.status(500).json({ error: 'Failed to remove ban' });
  }
});

// ─── Gamecast Analytics ───────────────────────────────────────────────────

router.get('/analytics/gamecast', async (req, res) => {
  try {
    const [summary, topGames] = await Promise.all([
      db.getOne(`
        SELECT COUNT(*) as total_sessions,
               AVG(duration_seconds) as avg_duration,
               AVG(expand_clicks) as avg_expand_clicks,
               COUNT(DISTINCT user_id) as unique_users
        FROM gamecast_sessions
      `),
      db.getAll(`
        SELECT game_id, sport_id,
               COUNT(*) as views,
               AVG(duration_seconds) as avg_duration,
               SUM(expand_clicks) as total_expand_clicks
        FROM gamecast_sessions
        GROUP BY game_id, sport_id
        ORDER BY views DESC
        LIMIT 20
      `),
    ]);

    res.json({
      totalSessions: parseInt(summary.total_sessions),
      avgDuration: parseFloat(summary.avg_duration) || 0,
      avgExpandClicks: parseFloat(summary.avg_expand_clicks) || 0,
      uniqueUsers: parseInt(summary.unique_users),
      topGames: topGames.map(g => ({
        gameId: g.game_id,
        sportId: g.sport_id,
        views: parseInt(g.views),
        avgDuration: parseFloat(g.avg_duration) || 0,
        totalExpandClicks: parseInt(g.total_expand_clicks),
      })),
    });
  } catch (error) {
    console.error('Gamecast analytics error:', error);
    res.status(500).json({ error: 'Failed to fetch gamecast analytics' });
  }
});

// ─── Announcements ────────────────────────────────────────────────────────

router.get('/announcements', async (req, res) => {
  try {
    const announcements = await db.getAll(`
      SELECT * FROM announcements ORDER BY created_at DESC
    `);
    res.json({
      announcements: announcements.map(a => ({
        id: a.id,
        title: a.title,
        message: a.message,
        targetType: a.target_type,
        targetId: a.target_id,
        isActive: a.is_active,
        expiresAt: a.expires_at,
        createdAt: a.created_at,
      })),
    });
  } catch (error) {
    console.error('Get announcements error:', error);
    res.status(500).json({ error: 'Failed to fetch announcements' });
  }
});

router.post('/announcements', async (req, res) => {
  try {
    const { title, message, targetType, targetId, expiresAt } = req.body;
    if (!title || !message) return res.status(400).json({ error: 'Title and message are required' });

    const announcement = await db.getOne(
      `INSERT INTO announcements (title, message, target_type, target_id, created_by, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [title, message, targetType || 'all', targetId || null, req.adminUser.id, expiresAt || null]
    );
    res.json({ id: announcement.id, success: true });
  } catch (error) {
    console.error('Create announcement error:', error);
    res.status(500).json({ error: 'Failed to create announcement' });
  }
});

router.put('/announcements/:id', async (req, res) => {
  try {
    const fields = [];
    const params = [];
    let paramIndex = 1;

    for (const [key, value] of Object.entries(req.body)) {
      const columnMap = {
        title: 'title', message: 'message', targetType: 'target_type',
        targetId: 'target_id', isActive: 'is_active', expiresAt: 'expires_at',
      };
      if (columnMap[key] !== undefined) {
        fields.push(`${columnMap[key]} = $${paramIndex}`);
        params.push(value);
        paramIndex++;
      }
    }

    if (fields.length === 0) return res.status(400).json({ error: 'No fields to update' });

    params.push(req.params.id);
    await db.run(
      `UPDATE announcements SET ${fields.join(', ')} WHERE id = $${paramIndex}`,
      params
    );
    res.json({ success: true });
  } catch (error) {
    console.error('Update announcement error:', error);
    res.status(500).json({ error: 'Failed to update announcement' });
  }
});

router.delete('/announcements/:id', async (req, res) => {
  try {
    await db.run('DELETE FROM announcements WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (error) {
    console.error('Delete announcement error:', error);
    res.status(500).json({ error: 'Failed to delete announcement' });
  }
});

module.exports = router;
