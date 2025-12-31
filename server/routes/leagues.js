const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcryptjs');
const { db } = require('../db/init');
const { authMiddleware } = require('../middleware/auth');
const { getCurrentSeason } = require('../services/nfl');

// Helper to get user from Firebase UID
const getUser = (req) => {
  return db.prepare('SELECT * FROM users WHERE firebase_uid = ?').get(req.firebaseUser.uid);
};

// Create a new league
router.post('/', authMiddleware, async (req, res) => {
  try {
    const user = getUser(req);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const { name, password, maxStrikes = 1, startWeek = 1 } = req.body;
    
    if (!name || name.trim().length < 3) {
      return res.status(400).json({ error: 'League name must be at least 3 characters' });
    }

    if (!password || password.length < 4) {
      return res.status(400).json({ error: 'Password must be at least 4 characters' });
    }

    if (maxStrikes < 1 || maxStrikes > 5) {
      return res.status(400).json({ error: 'Max strikes must be between 1 and 5' });
    }

    if (startWeek < 1 || startWeek > 18) {
      return res.status(400).json({ error: 'Start week must be between 1 and 18' });
    }

    const { season } = await getCurrentSeason();
    const passwordHash = await bcrypt.hash(password, 10);
    const leagueId = uuidv4();
    const memberId = uuidv4();

    // Create league
    db.prepare(`
      INSERT INTO leagues (id, name, password_hash, commissioner_id, max_strikes, start_week, season)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(leagueId, name.trim(), passwordHash, user.id, maxStrikes, startWeek, season);

    // Add commissioner as first member
    db.prepare(`
      INSERT INTO league_members (id, league_id, user_id, status)
      VALUES (?, ?, ?, 'active')
    `).run(memberId, leagueId, user.id);

    res.json({
      success: true,
      league: {
        id: leagueId,
        name: name.trim(),
        maxStrikes,
        startWeek,
        season,
        isCommissioner: true
      }
    });
  } catch (error) {
    console.error('Create league error:', error);
    res.status(500).json({ error: 'Failed to create league' });
  }
});

// Search for leagues by name
router.get('/search', authMiddleware, (req, res) => {
  try {
    const { query } = req.query;
    
    if (!query || query.trim().length < 2) {
      return res.status(400).json({ error: 'Search query must be at least 2 characters' });
    }

    const leagues = db.prepare(`
      SELECT 
        l.id, 
        l.name, 
        l.max_strikes,
        l.start_week,
        l.season,
        l.status,
        COUNT(lm.id) as member_count,
        u.display_name as commissioner_name
      FROM leagues l
      LEFT JOIN league_members lm ON l.id = lm.league_id
      LEFT JOIN users u ON l.commissioner_id = u.id
      WHERE l.name LIKE ? AND l.status = 'active'
      GROUP BY l.id
      LIMIT 20
    `).all(`%${query.trim()}%`);

    res.json(leagues.map(l => ({
      id: l.id,
      name: l.name,
      maxStrikes: l.max_strikes,
      startWeek: l.start_week,
      season: l.season,
      memberCount: l.member_count,
      commissionerName: l.commissioner_name || 'Unknown'
    })));
  } catch (error) {
    console.error('Search leagues error:', error);
    res.status(500).json({ error: 'Failed to search leagues' });
  }
});

// Join a league
router.post('/:leagueId/join', authMiddleware, async (req, res) => {
  try {
    const user = getUser(req);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const { leagueId } = req.params;
    const { password } = req.body;

    const league = db.prepare('SELECT * FROM leagues WHERE id = ?').get(leagueId);
    
    if (!league) {
      return res.status(404).json({ error: 'League not found' });
    }

    if (league.status !== 'active') {
      return res.status(400).json({ error: 'This league is no longer active' });
    }

    // Check password
    const validPassword = await bcrypt.compare(password, league.password_hash);
    if (!validPassword) {
      return res.status(400).json({ error: 'Incorrect password' });
    }

    // Check if already a member
    const existingMember = db.prepare(`
      SELECT * FROM league_members WHERE league_id = ? AND user_id = ?
    `).get(leagueId, user.id);

    if (existingMember) {
      return res.status(400).json({ error: 'You are already a member of this league' });
    }

    // Join league
    const memberId = uuidv4();
    db.prepare(`
      INSERT INTO league_members (id, league_id, user_id, status)
      VALUES (?, ?, ?, 'active')
    `).run(memberId, leagueId, user.id);

    res.json({
      success: true,
      message: 'Successfully joined league'
    });
  } catch (error) {
    console.error('Join league error:', error);
    res.status(500).json({ error: 'Failed to join league' });
  }
});

// Get user's leagues
router.get('/my-leagues', authMiddleware, (req, res) => {
  try {
    const user = getUser(req);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const leagues = db.prepare(`
      SELECT 
        l.id, 
        l.name, 
        l.max_strikes,
        l.start_week,
        l.season,
        l.status,
        l.commissioner_id,
        lm.strikes,
        lm.status as member_status,
        COUNT(DISTINCT lm2.id) as member_count
      FROM leagues l
      INNER JOIN league_members lm ON l.id = lm.league_id AND lm.user_id = ?
      LEFT JOIN league_members lm2 ON l.id = lm2.league_id
      GROUP BY l.id
      ORDER BY l.created_at DESC
    `).all(user.id);

    res.json(leagues.map(l => ({
      id: l.id,
      name: l.name,
      maxStrikes: l.max_strikes,
      startWeek: l.start_week,
      season: l.season,
      status: l.status,
      strikes: l.strikes,
      memberStatus: l.member_status,
      memberCount: l.member_count,
      isCommissioner: l.commissioner_id === user.id
    })));
  } catch (error) {
    console.error('Get my leagues error:', error);
    res.status(500).json({ error: 'Failed to get leagues' });
  }
});

// Get league details
router.get('/:leagueId', authMiddleware, (req, res) => {
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

    const league = db.prepare(`
      SELECT l.*, u.display_name as commissioner_name
      FROM leagues l
      LEFT JOIN users u ON l.commissioner_id = u.id
      WHERE l.id = ?
    `).get(leagueId);

    if (!league) {
      return res.status(404).json({ error: 'League not found' });
    }

    // Get members with their status
    const members = db.prepare(`
      SELECT 
        lm.id as member_id,
        lm.user_id,
        lm.strikes,
        lm.status,
        lm.joined_at,
        u.display_name,
        u.phone
      FROM league_members lm
      LEFT JOIN users u ON lm.user_id = u.id
      WHERE lm.league_id = ?
      ORDER BY lm.strikes ASC, lm.joined_at ASC
    `).all(leagueId);

    res.json({
      id: league.id,
      name: league.name,
      maxStrikes: league.max_strikes,
      startWeek: league.start_week,
      season: league.season,
      status: league.status,
      commissionerId: league.commissioner_id,
      commissionerName: league.commissioner_name || 'Unknown',
      isCommissioner: league.commissioner_id === user.id,
      myStrikes: membership.strikes,
      myStatus: membership.status,
      members: members.map(m => ({
        id: m.member_id,
        displayName: m.display_name || `User-${m.user_id.slice(0, 6)}`,
        strikes: m.strikes,
        status: m.status,
        joinedAt: m.joined_at,
        isMe: m.user_id === user.id
      }))
    });
  } catch (error) {
    console.error('Get league error:', error);
    res.status(500).json({ error: 'Failed to get league details' });
  }
});

// Commissioner: Update league settings
router.put('/:leagueId/settings', authMiddleware, (req, res) => {
  try {
    const user = getUser(req);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const { leagueId } = req.params;
    const { maxStrikes, startWeek } = req.body;

    const league = db.prepare('SELECT * FROM leagues WHERE id = ?').get(leagueId);
    
    if (!league) {
      return res.status(404).json({ error: 'League not found' });
    }

    if (league.commissioner_id !== user.id) {
      return res.status(403).json({ error: 'Only the commissioner can update settings' });
    }

    const updates = [];
    const params = [];

    if (maxStrikes !== undefined) {
      if (maxStrikes < 1 || maxStrikes > 5) {
        return res.status(400).json({ error: 'Max strikes must be between 1 and 5' });
      }
      updates.push('max_strikes = ?');
      params.push(maxStrikes);
    }

    if (startWeek !== undefined) {
      if (startWeek < 1 || startWeek > 18) {
        return res.status(400).json({ error: 'Start week must be between 1 and 18' });
      }
      updates.push('start_week = ?');
      params.push(startWeek);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No valid updates provided' });
    }

    updates.push('updated_at = CURRENT_TIMESTAMP');
    params.push(leagueId);

    db.prepare(`UPDATE leagues SET ${updates.join(', ')} WHERE id = ?`).run(...params);

    res.json({ success: true, message: 'Settings updated' });
  } catch (error) {
    console.error('Update settings error:', error);
    res.status(500).json({ error: 'Failed to update settings' });
  }
});

// Commissioner: Modify member strikes
router.post('/:leagueId/members/:memberId/strikes', authMiddleware, (req, res) => {
  try {
    const user = getUser(req);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const { leagueId, memberId } = req.params;
    const { action } = req.body; // 'add' or 'remove'

    const league = db.prepare('SELECT * FROM leagues WHERE id = ?').get(leagueId);
    
    if (!league) {
      return res.status(404).json({ error: 'League not found' });
    }

    if (league.commissioner_id !== user.id) {
      return res.status(403).json({ error: 'Only the commissioner can modify strikes' });
    }

    const member = db.prepare(`
      SELECT * FROM league_members WHERE id = ? AND league_id = ?
    `).get(memberId, leagueId);

    if (!member) {
      return res.status(404).json({ error: 'Member not found' });
    }

    let newStrikes = member.strikes;
    let newStatus = member.status;

    if (action === 'add') {
      newStrikes = Math.min(member.strikes + 1, league.max_strikes);
      if (newStrikes >= league.max_strikes) {
        newStatus = 'eliminated';
      }
    } else if (action === 'remove') {
      newStrikes = Math.max(member.strikes - 1, 0);
      if (newStrikes < league.max_strikes && member.status === 'eliminated') {
        newStatus = 'active';
      }
    } else {
      return res.status(400).json({ error: 'Invalid action. Use "add" or "remove"' });
    }

    db.prepare(`
      UPDATE league_members SET strikes = ?, status = ? WHERE id = ?
    `).run(newStrikes, newStatus, memberId);

    res.json({ 
      success: true, 
      newStrikes, 
      newStatus,
      message: `${action === 'add' ? 'Added' : 'Removed'} strike`
    });
  } catch (error) {
    console.error('Modify strikes error:', error);
    res.status(500).json({ error: 'Failed to modify strikes' });
  }
});

// Get league standings/leaderboard
router.get('/:leagueId/standings', authMiddleware, async (req, res) => {
  try {
    const user = getUser(req);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const { leagueId } = req.params;
    const { week } = req.query;

    // Check membership
    const membership = db.prepare(`
      SELECT * FROM league_members WHERE league_id = ? AND user_id = ?
    `).get(leagueId, user.id);

    if (!membership) {
      return res.status(403).json({ error: 'You are not a member of this league' });
    }

    const league = db.prepare('SELECT * FROM leagues WHERE id = ?').get(leagueId);

    // Get current week from NFL API
    const { getCurrentSeason, getWeekSchedule } = require('../services/nfl');
    const { season, week: currentWeek } = await getCurrentSeason();
    const targetWeek = week ? parseInt(week) : currentWeek;

    // Get schedule for the target week to determine game status
    const weekGames = await getWeekSchedule(season, targetWeek);
    const now = new Date();

    // Get all members with their picks
    const standings = db.prepare(`
      SELECT 
        lm.id as member_id,
        lm.user_id,
        lm.strikes,
        lm.status,
        u.display_name
      FROM league_members lm
      LEFT JOIN users u ON lm.user_id = u.id
      WHERE lm.league_id = ?
      ORDER BY lm.strikes ASC, u.display_name ASC
    `).all(leagueId);

    // Get picks for each week from start_week to target_week
    const memberPicks = {};
    for (const member of standings) {
      memberPicks[member.user_id] = {};
    }

    const allPicks = db.prepare(`
      SELECT p.*, u.display_name
      FROM picks p
      LEFT JOIN users u ON p.user_id = u.id
      WHERE p.league_id = ? AND p.week <= ?
    `).all(leagueId, targetWeek);

    for (const pick of allPicks) {
      if (!memberPicks[pick.user_id]) continue;
      memberPicks[pick.user_id][pick.week] = {
        teamId: pick.team_id,
        result: pick.result,
        gameId: pick.game_id
      };
    }

    // Determine which picks to show based on game status
    const result = standings.map(member => {
      const picks = {};
      
      for (let w = league.start_week; w <= targetWeek; w++) {
        const pick = memberPicks[member.user_id]?.[w];
        
        if (!pick) {
          picks[w] = { status: 'no_pick', visible: true };
          continue;
        }

        // Find the game for this pick
        const isCurrentWeek = w === targetWeek;
        const game = weekGames.find(g => 
          g.homeTeam?.id === pick.teamId || g.awayTeam?.id === pick.teamId
        );

        // Determine visibility:
        // - Past weeks: always show
        // - Current week: show if game has started or finished
        // - Future weeks: never show (but shouldn't happen with our logic)
        let visible = true;
        if (isCurrentWeek && game) {
          const gameStart = new Date(game.date);
          visible = gameStart <= now;
        }

        // For other users, hide future picks
        if (!visible && member.user_id !== user.id) {
          picks[w] = { status: 'hidden', visible: false };
        } else {
          picks[w] = {
            teamId: pick.teamId,
            result: pick.result,
            visible: true
          };
        }
      }

      return {
        memberId: member.member_id,
        userId: member.user_id,
        displayName: member.display_name || `User-${member.user_id.slice(0, 6)}`,
        strikes: member.strikes,
        status: member.status,
        isMe: member.user_id === user.id,
        picks
      };
    });

    res.json({
      leagueId,
      season: league.season,
      startWeek: league.start_week,
      currentWeek,
      targetWeek,
      maxStrikes: league.max_strikes,
      standings: result
    });
  } catch (error) {
    console.error('Get standings error:', error);
    res.status(500).json({ error: 'Failed to get standings' });
  }
});

module.exports = router;
