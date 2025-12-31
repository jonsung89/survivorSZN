const express = require('express');
const router = express.Router();
const { db } = require('../db/supabase');
const { authMiddleware } = require('../middleware/auth');
const { getCurrentSeason } = require('../services/nfl');
const { v4: uuidv4 } = require('uuid');

// Sync user from Firebase (called after Firebase auth)
router.post('/sync', authMiddleware, async (req, res) => {
  try {
    const { firebaseUid, phone, email, displayName } = req.body;
    
    // Check if user exists
    let user = await db.getOne('SELECT * FROM users WHERE firebase_uid = $1', [firebaseUid]);
    let isNewUser = false;
    
    if (user) {
      // Update existing user - ONLY update phone/email if provided
      // NEVER touch display_name - user controls that themselves
      await db.run(`
        UPDATE users 
        SET phone = COALESCE($1, phone), 
            email = COALESCE($2, email), 
            updated_at = NOW()
        WHERE firebase_uid = $3
      `, [phone, email, firebaseUid]);
      
      // Re-fetch to get the actual stored values
      user = await db.getOne('SELECT * FROM users WHERE firebase_uid = $1', [firebaseUid]);
    } else {
      // Create new user - set display_name from OAuth provider initially
      isNewUser = true;
      const id = uuidv4();
      await db.run(`
        INSERT INTO users (id, firebase_uid, phone, email, display_name)
        VALUES ($1, $2, $3, $4, $5)
      `, [id, firebaseUid, phone, email, displayName]);
      
      user = await db.getOne('SELECT * FROM users WHERE id = $1', [id]);
    }

    // Return user data - displayName from database is the source of truth
    res.json({
      id: user.id,
      phone: user.phone,
      email: user.email,
      displayName: user.display_name,
      createdAt: user.created_at,
      isNewUser
    });
  } catch (error) {
    console.error('Sync user error:', error);
    res.status(500).json({ error: 'Failed to sync user' });
  }
});

// Update display name
router.put('/display-name', authMiddleware, async (req, res) => {
  try {
    const { displayName } = req.body;
    
    if (!displayName || displayName.trim().length < 2) {
      return res.status(400).json({ success: false, error: 'Display name must be at least 2 characters' });
    }

    // Check if user exists
    const existingUser = await db.getOne('SELECT * FROM users WHERE firebase_uid = $1', [req.firebaseUser.uid]);
    
    if (!existingUser) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    // Update the display name
    const updateResult = await db.getOne(`
      UPDATE users SET display_name = $1, updated_at = NOW()
      WHERE firebase_uid = $2
      RETURNING id, display_name
    `, [displayName.trim(), req.firebaseUser.uid]);

    if (!updateResult) {
      return res.status(500).json({ 
        success: false, 
        error: 'Update failed - check RLS policies in Supabase' 
      });
    }

    res.json({
      success: true,
      id: updateResult.id,
      displayName: updateResult.display_name
    });
  } catch (error) {
    console.error('Update display name error:', error);
    res.status(500).json({ success: false, error: 'Failed to update display name' });
  }
});

// Get user's pending picks across all leagues
router.get('/pending-picks', authMiddleware, async (req, res) => {
  try {
    const user = await db.getOne('SELECT * FROM users WHERE firebase_uid = $1', [req.firebaseUser.uid]);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const { season, week } = await getCurrentSeason();

    // Get all active league memberships
    const memberships = await db.getAll(`
      SELECT lm.*, l.name as league_name, l.start_week, l.season
      FROM league_members lm
      JOIN leagues l ON lm.league_id = l.id
      WHERE lm.user_id = $1 AND lm.status = 'active' AND l.status = 'active'
    `, [user.id]);

    const pendingPicks = [];

    for (const membership of memberships) {
      // Skip if week is before league start
      if (week < membership.start_week) continue;

      // Check if pick exists for current week
      const pick = await db.getOne(`
        SELECT * FROM picks 
        WHERE league_id = $1 AND user_id = $2 AND week = $3
      `, [membership.league_id, user.id, week]);

      if (!pick) {
        pendingPicks.push({
          leagueId: membership.league_id,
          leagueName: membership.league_name,
          week,
          startWeek: membership.start_week
        });
      }
    }

    res.json({
      success: true,
      currentWeek: week,
      pendingPicks
    });
  } catch (error) {
    console.error('Get pending picks error:', error);
    res.status(500).json({ error: 'Failed to get pending picks' });
  }
});

// Get user's pick history summary
router.get('/history', authMiddleware, async (req, res) => {
  try {
    const user = await db.getOne('SELECT * FROM users WHERE firebase_uid = $1', [req.firebaseUser.uid]);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const history = await db.getAll(`
      SELECT 
        p.week,
        p.team_id,
        p.result,
        l.name as league_name,
        l.id as league_id
      FROM picks p
      JOIN leagues l ON p.league_id = l.id
      WHERE p.user_id = $1
      ORDER BY p.week DESC, l.name ASC
    `, [user.id]);

    // Group by league
    const byLeague = {};
    for (const pick of history) {
      if (!byLeague[pick.league_id]) {
        byLeague[pick.league_id] = {
          leagueId: pick.league_id,
          leagueName: pick.league_name,
          picks: []
        };
      }
      byLeague[pick.league_id].picks.push({
        week: pick.week,
        teamId: pick.team_id,
        result: pick.result
      });
    }

    res.json(Object.values(byLeague));
  } catch (error) {
    console.error('Get history error:', error);
    res.status(500).json({ error: 'Failed to get history' });
  }
});

// Get user stats
router.get('/stats', authMiddleware, async (req, res) => {
  try {
    const user = await db.getOne('SELECT * FROM users WHERE firebase_uid = $1', [req.firebaseUser.uid]);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const stats = await db.getOne(`
      SELECT 
        COUNT(DISTINCT p.league_id) as leagues_joined,
        COUNT(p.id) as total_picks,
        SUM(CASE WHEN p.result = 'win' THEN 1 ELSE 0 END) as wins,
        SUM(CASE WHEN p.result = 'loss' THEN 1 ELSE 0 END) as losses
      FROM league_members lm
      LEFT JOIN picks p ON lm.league_id = p.league_id AND lm.user_id = p.user_id
      WHERE lm.user_id = $1
    `, [user.id]);

    const memberStats = await db.getOne(`
      SELECT 
        SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active_leagues,
        SUM(CASE WHEN status = 'eliminated' THEN 1 ELSE 0 END) as eliminated_leagues
      FROM league_members
      WHERE user_id = $1
    `, [user.id]);

    const totalPicks = parseInt(stats.total_picks) || 0;
    const wins = parseInt(stats.wins) || 0;
    const losses = parseInt(stats.losses) || 0;

    res.json({
      leaguesJoined: parseInt(stats.leagues_joined) || 0,
      totalPicks,
      wins,
      losses,
      activeLeagues: parseInt(memberStats?.active_leagues) || 0,
      eliminatedLeagues: parseInt(memberStats?.eliminated_leagues) || 0,
      winRate: (wins + losses) > 0 
        ? ((wins / (wins + losses)) * 100).toFixed(1)
        : 0
    });
  } catch (error) {
    console.error('Get stats error:', error);
    res.status(500).json({ error: 'Failed to get stats' });
  }
});

module.exports = router;