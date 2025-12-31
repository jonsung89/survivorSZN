const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { db } = require('../db/init');
const { authMiddleware } = require('../middleware/auth');
const { getCurrentSeason, getWeekSchedule, hasGameStarted, getGameWinner, getTeam } = require('../services/nfl');

// Helper to get user from Firebase UID
const getUser = (req) => {
  return db.prepare('SELECT * FROM users WHERE firebase_uid = ?').get(req.firebaseUser.uid);
};

// Make a pick for a specific week
router.post('/', authMiddleware, async (req, res) => {
  try {
    const user = getUser(req);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const { leagueId, week, teamId } = req.body;

    if (!leagueId || !week || !teamId) {
      return res.status(400).json({ error: 'League ID, week, and team ID are required' });
    }

    // Validate team exists
    const team = getTeam(teamId);
    if (!team) {
      return res.status(400).json({ error: 'Invalid team' });
    }

    // Check league membership
    const membership = db.prepare(`
      SELECT * FROM league_members WHERE league_id = ? AND user_id = ?
    `).get(leagueId, user.id);

    if (!membership) {
      return res.status(403).json({ error: 'You are not a member of this league' });
    }

    if (membership.status === 'eliminated') {
      return res.status(403).json({ error: 'You have been eliminated from this league' });
    }

    // Get league settings
    const league = db.prepare('SELECT * FROM leagues WHERE id = ?').get(leagueId);

    if (week < league.start_week) {
      return res.status(400).json({ error: `Picks start from week ${league.start_week}` });
    }

    // Get week schedule
    const games = await getWeekSchedule(league.season, week);

    // Check if team is playing this week
    const teamGame = games.find(g => 
      g.homeTeam?.id === teamId || g.awayTeam?.id === teamId
    );

    if (!teamGame) {
      return res.status(400).json({ error: 'This team is on bye this week' });
    }

    // Check if game has started
    if (hasGameStarted(teamGame.date)) {
      return res.status(400).json({ error: 'Cannot pick a team whose game has already started' });
    }

    // Check if team was already used
    const previousPick = db.prepare(`
      SELECT * FROM picks 
      WHERE league_id = ? AND user_id = ? AND team_id = ? AND week != ?
    `).get(leagueId, user.id, teamId, week);

    if (previousPick) {
      return res.status(400).json({ 
        error: `You already used ${team.name} in Week ${previousPick.week}` 
      });
    }

    // Check if already made a pick this week (update if so)
    const existingPick = db.prepare(`
      SELECT * FROM picks WHERE league_id = ? AND user_id = ? AND week = ?
    `).get(leagueId, user.id, week);

    if (existingPick) {
      // Can only update if game hasn't started
      const existingGame = games.find(g => 
        g.homeTeam?.id === existingPick.team_id || g.awayTeam?.id === existingPick.team_id
      );

      if (existingGame && hasGameStarted(existingGame.date)) {
        return res.status(400).json({ error: 'Cannot change pick after game has started' });
      }

      // Update pick
      db.prepare(`
        UPDATE picks SET team_id = ?, game_id = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(teamId, teamGame.id, existingPick.id);

      return res.json({
        success: true,
        message: 'Pick updated successfully',
        pick: {
          id: existingPick.id,
          week,
          teamId,
          teamName: team.name,
          game: {
            id: teamGame.id,
            date: teamGame.date,
            opponent: teamGame.homeTeam.id === teamId ? teamGame.awayTeam : teamGame.homeTeam
          }
        }
      });
    }

    // Create new pick
    const pickId = uuidv4();
    db.prepare(`
      INSERT INTO picks (id, league_id, user_id, week, team_id, game_id)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(pickId, leagueId, user.id, week, teamId, teamGame.id);

    res.json({
      success: true,
      message: 'Pick submitted successfully',
      pick: {
        id: pickId,
        week,
        teamId,
        teamName: team.name,
        game: {
          id: teamGame.id,
          date: teamGame.date,
          opponent: teamGame.homeTeam.id === teamId ? teamGame.awayTeam : teamGame.homeTeam
        }
      }
    });
  } catch (error) {
    console.error('Make pick error:', error);
    res.status(500).json({ error: 'Failed to submit pick' });
  }
});

// Get user's picks for a league
router.get('/league/:leagueId', authMiddleware, async (req, res) => {
  try {
    const user = getUser(req);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const { leagueId } = req.params;

    // Check membership
    const membership = db.prepare(`
      SELECT * FROM league_members WHERE league_id = ? AND user_id = ?
    `).get(leagueId, user.id);

    if (!membership) {
      return res.status(403).json({ error: 'You are not a member of this league' });
    }

    const league = db.prepare('SELECT * FROM leagues WHERE id = ?').get(leagueId);

    // Get all picks
    const picks = db.prepare(`
      SELECT * FROM picks 
      WHERE league_id = ? AND user_id = ?
      ORDER BY week ASC
    `).all(leagueId, user.id);

    // Get used teams
    const usedTeams = picks.map(p => p.team_id);

    // Get current week
    const { week: currentWeek } = await getCurrentSeason();

    res.json({
      leagueId,
      startWeek: league.start_week,
      currentWeek,
      usedTeams,
      picks: picks.map(p => ({
        id: p.id,
        week: p.week,
        teamId: p.team_id,
        team: getTeam(p.team_id),
        result: p.result,
        createdAt: p.created_at
      }))
    });
  } catch (error) {
    console.error('Get picks error:', error);
    res.status(500).json({ error: 'Failed to get picks' });
  }
});

// Get available teams for a specific week
router.get('/available/:leagueId/:week', authMiddleware, async (req, res) => {
  try {
    const user = getUser(req);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const { leagueId, week } = req.params;
    const weekNum = parseInt(week);

    // Check membership
    const membership = db.prepare(`
      SELECT * FROM league_members WHERE league_id = ? AND user_id = ?
    `).get(leagueId, user.id);

    if (!membership) {
      return res.status(403).json({ error: 'You are not a member of this league' });
    }

    const league = db.prepare('SELECT * FROM leagues WHERE id = ?').get(leagueId);

    // Get teams already used
    const usedPicks = db.prepare(`
      SELECT team_id FROM picks 
      WHERE league_id = ? AND user_id = ? AND week != ?
    `).all(leagueId, user.id, weekNum);

    const usedTeams = new Set(usedPicks.map(p => p.team_id));

    // Get current pick for this week
    const currentPick = db.prepare(`
      SELECT * FROM picks WHERE league_id = ? AND user_id = ? AND week = ?
    `).get(leagueId, user.id, weekNum);

    // Get week schedule
    const games = await getWeekSchedule(league.season, weekNum);
    const now = new Date();

    // Build available teams list
    const teamsPlaying = new Map();
    
    for (const game of games) {
      const gameStart = new Date(game.date);
      const isLocked = gameStart <= now;

      if (game.homeTeam) {
        teamsPlaying.set(game.homeTeam.id, {
          team: game.homeTeam,
          game: {
            id: game.id,
            date: game.date,
            status: game.status,
            statusDetail: game.statusDetail,
            isHome: true,
            opponent: game.awayTeam,
            venue: game.venue,
            broadcast: game.broadcast
          },
          isLocked,
          isUsed: usedTeams.has(game.homeTeam.id),
          isCurrentPick: currentPick?.team_id === game.homeTeam.id
        });
      }

      if (game.awayTeam) {
        teamsPlaying.set(game.awayTeam.id, {
          team: game.awayTeam,
          game: {
            id: game.id,
            date: game.date,
            status: game.status,
            statusDetail: game.statusDetail,
            isHome: false,
            opponent: game.homeTeam,
            venue: game.venue,
            broadcast: game.broadcast
          },
          isLocked,
          isUsed: usedTeams.has(game.awayTeam.id),
          isCurrentPick: currentPick?.team_id === game.awayTeam.id
        });
      }
    }

    res.json({
      week: weekNum,
      currentPick: currentPick ? {
        id: currentPick.id,
        teamId: currentPick.team_id,
        team: getTeam(currentPick.team_id)
      } : null,
      teams: Array.from(teamsPlaying.values()).sort((a, b) => 
        a.team.name.localeCompare(b.team.name)
      )
    });
  } catch (error) {
    console.error('Get available teams error:', error);
    res.status(500).json({ error: 'Failed to get available teams' });
  }
});

// Check and update pick results (can be called by a cron job or manually)
router.post('/update-results', async (req, res) => {
  try {
    const { season, week } = await getCurrentSeason();

    // Get all pending picks for completed games
    const pendingPicks = db.prepare(`
      SELECT p.*, l.max_strikes, l.season
      FROM picks p
      JOIN leagues l ON p.league_id = l.id
      WHERE p.result = 'pending'
    `).all();

    let updated = 0;

    for (const pick of pendingPicks) {
      const games = await getWeekSchedule(pick.season, pick.week);
      const game = games.find(g => g.id === pick.game_id);

      if (!game || game.status !== 'STATUS_FINAL') continue;

      const winner = getGameWinner(game);
      let result;

      if (winner === 'TIE') {
        // Ties typically count as losses in survivor pools
        result = 'loss';
      } else if (winner === pick.team_id) {
        result = 'win';
      } else {
        result = 'loss';
      }

      // Update pick result
      db.prepare('UPDATE picks SET result = ? WHERE id = ?').run(result, pick.id);

      // If loss, add strike to member
      if (result === 'loss') {
        const member = db.prepare(`
          SELECT * FROM league_members WHERE league_id = ? AND user_id = ?
        `).get(pick.league_id, pick.user_id);

        if (member) {
          const newStrikes = member.strikes + 1;
          const newStatus = newStrikes >= pick.max_strikes ? 'eliminated' : 'active';

          db.prepare(`
            UPDATE league_members SET strikes = ?, status = ? 
            WHERE league_id = ? AND user_id = ?
          `).run(newStrikes, newStatus, pick.league_id, pick.user_id);
        }
      }

      updated++;
    }

    res.json({ success: true, updated });
  } catch (error) {
    console.error('Update results error:', error);
    res.status(500).json({ error: 'Failed to update results' });
  }
});

// Get pending picks reminder (users who haven't picked)
router.get('/reminders/:leagueId/:week', authMiddleware, async (req, res) => {
  try {
    const user = getUser(req);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const { leagueId, week } = req.params;
    const weekNum = parseInt(week);

    const league = db.prepare('SELECT * FROM leagues WHERE id = ?').get(leagueId);

    if (!league || league.commissioner_id !== user.id) {
      return res.status(403).json({ error: 'Only commissioner can view reminders' });
    }

    // Get active members who haven't picked
    const membersWithoutPicks = db.prepare(`
      SELECT 
        lm.user_id,
        u.display_name,
        u.phone
      FROM league_members lm
      LEFT JOIN users u ON lm.user_id = u.id
      LEFT JOIN picks p ON lm.league_id = p.league_id 
        AND lm.user_id = p.user_id 
        AND p.week = ?
      WHERE lm.league_id = ? 
        AND lm.status = 'active'
        AND p.id IS NULL
    `).all(weekNum, leagueId);

    res.json({
      week: weekNum,
      membersWithoutPicks: membersWithoutPicks.map(m => ({
        userId: m.user_id,
        displayName: m.display_name || `User-${m.user_id.slice(0, 6)}`,
        phone: m.phone
      }))
    });
  } catch (error) {
    console.error('Get reminders error:', error);
    res.status(500).json({ error: 'Failed to get reminders' });
  }
});

module.exports = router;
