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
      // Update existing user - DON'T overwrite display_name or email if already set
      const updates = ['updated_at = NOW()'];
      const values = [];
      let paramCount = 0;
      
      // Always update phone if provided
      if (phone) {
        paramCount++;
        updates.push(`phone = $${paramCount}`);
        values.push(phone);
      }
      
      // Only update email if not already set in DB
      if (email && !user.email) {
        paramCount++;
        updates.push(`email = $${paramCount}`);
        values.push(email);
      }
      
      // Only update display_name if not already set in DB
      if (displayName && !user.display_name) {
        paramCount++;
        updates.push(`display_name = $${paramCount}`);
        values.push(displayName);
      }
      
      paramCount++;
      values.push(firebaseUid);
      
      await db.run(`
        UPDATE users SET ${updates.join(', ')}
        WHERE firebase_uid = $${paramCount}
      `, values);
      
      user = await db.getOne('SELECT * FROM users WHERE firebase_uid = $1', [firebaseUid]);
    } else {
      // Create new user
      isNewUser = true;
      const id = uuidv4();
      await db.run(`
        INSERT INTO users (id, firebase_uid, phone, email, display_name)
        VALUES ($1, $2, $3, $4, $5)
      `, [id, firebaseUid, phone, email, displayName]);
      
      user = await db.getOne('SELECT * FROM users WHERE id = $1', [id]);
    }

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
      return res.status(400).json({ error: 'Display name must be at least 2 characters' });
    }

    await db.run(`
      UPDATE users SET display_name = $1, updated_at = NOW()
      WHERE firebase_uid = $2
    `, [displayName.trim(), req.firebaseUser.uid]);

    const user = await db.getOne('SELECT * FROM users WHERE firebase_uid = $1', [req.firebaseUser.uid]);

    res.json({
      id: user.id,
      displayName: user.display_name
    });
  } catch (error) {
    console.error('Update display name error:', error);
    res.status(500).json({ error: 'Failed to update display name' });
  }
});

// Update email
router.put('/email', authMiddleware, async (req, res) => {
  try {
    const { email } = req.body;
    
    if (!email || !email.includes('@')) {
      return res.status(400).json({ error: 'Please enter a valid email address' });
    }

    await db.run(`
      UPDATE users SET email = $1, updated_at = NOW()
      WHERE firebase_uid = $2
    `, [email.trim().toLowerCase(), req.firebaseUser.uid]);

    const user = await db.getOne('SELECT * FROM users WHERE firebase_uid = $1', [req.firebaseUser.uid]);

    res.json({
      success: true,
      email: user.email
    });
  } catch (error) {
    console.error('Update email error:', error);
    res.status(500).json({ error: 'Failed to update email' });
  }
});

// Get user's pending picks across all leagues
router.get('/pending-picks', authMiddleware, async (req, res) => {
  try {
    const user = await db.getOne('SELECT * FROM users WHERE firebase_uid = $1', [req.firebaseUser.uid]);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const { season, week, seasonType } = await getCurrentSeason();
    // Convert ESPN week to internal week
    // ESPN playoffs: 1=Wild Card, 2=Divisional, 3=Conference, 4=Pro Bowl, 5=Super Bowl
    // Internal: 19=Wild Card, 20=Divisional, 21=Conference, 22=Super Bowl
    let internalWeek;
    if (seasonType === 3) {
      if (week === 5) {
        internalWeek = 22; // Super Bowl
      } else if (week === 4) {
        internalWeek = 22; // Pro Bowl week - treat as Super Bowl
      } else {
        internalWeek = week + 18;
      }
    } else {
      internalWeek = week;
    }

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
      if (internalWeek < membership.start_week) continue;

      // Check if pick exists for current week
      const pick = await db.getOne(`
        SELECT * FROM picks 
        WHERE league_id = $1 AND user_id = $2 AND week = $3
      `, [membership.league_id, user.id, internalWeek]);

      if (!pick) {
        pendingPicks.push({
          leagueId: membership.league_id,
          leagueName: membership.league_name,
          week: internalWeek,
          startWeek: membership.start_week
        });
      }
    }

    res.json({
      currentWeek: internalWeek,
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