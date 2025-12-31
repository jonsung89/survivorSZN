const express = require('express');
const router = express.Router();
const { db } = require('../db/init');
const { authMiddleware } = require('../middleware/auth');
const { getCurrentSeason } = require('../services/nfl');
const { v4: uuidv4 } = require('uuid');

// Middleware to get or create user from Firebase auth
const getUserFromFirebase = async (req, res, next) => {
  if (!req.firebaseUser) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  let user = db.prepare('SELECT * FROM users WHERE firebase_uid = ?').get(req.firebaseUser.uid);
  
  if (!user) {
    // This shouldn't happen normally - user should be synced first
    return res.status(404).json({ error: 'User not found. Please sync first.' });
  }

  req.user = { userId: user.id, ...user };
  next();
};

// Sync user from Firebase (called after Firebase auth)
router.post('/sync', authMiddleware, (req, res) => {
  try {
    const { firebaseUid, phone, email, displayName } = req.body;
    
    // Check if user exists
    let user = db.prepare('SELECT * FROM users WHERE firebase_uid = ?').get(firebaseUid);
    
    if (user) {
      // Update existing user
      db.prepare(`
        UPDATE users 
        SET phone = ?, email = ?, display_name = COALESCE(?, display_name), updated_at = CURRENT_TIMESTAMP
        WHERE firebase_uid = ?
      `).run(phone, email, displayName, firebaseUid);
      
      user = db.prepare('SELECT * FROM users WHERE firebase_uid = ?').get(firebaseUid);
    } else {
      // Create new user
      const id = uuidv4();
      db.prepare(`
        INSERT INTO users (id, firebase_uid, phone, email, display_name)
        VALUES (?, ?, ?, ?, ?)
      `).run(id, firebaseUid, phone, email, displayName);
      
      user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
    }

    res.json({
      id: user.id,
      phone: user.phone,
      email: user.email,
      displayName: user.display_name,
      createdAt: user.created_at
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

    db.prepare(`
      UPDATE users SET display_name = ?, updated_at = CURRENT_TIMESTAMP
      WHERE firebase_uid = ?
    `).run(displayName.trim(), req.firebaseUser.uid);

    const user = db.prepare('SELECT * FROM users WHERE firebase_uid = ?').get(req.firebaseUser.uid);

    res.json({
      id: user.id,
      displayName: user.display_name
    });
  } catch (error) {
    console.error('Update display name error:', error);
    res.status(500).json({ error: 'Failed to update display name' });
  }
});

// Get user's pending picks across all leagues
router.get('/pending-picks', authMiddleware, async (req, res) => {
  try {
    const user = db.prepare('SELECT * FROM users WHERE firebase_uid = ?').get(req.firebaseUser.uid);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const { season, week } = await getCurrentSeason();

    // Get all active league memberships
    const memberships = db.prepare(`
      SELECT lm.*, l.name as league_name, l.start_week, l.season
      FROM league_members lm
      JOIN leagues l ON lm.league_id = l.id
      WHERE lm.user_id = ? AND lm.status = 'active' AND l.status = 'active'
    `).all(user.id);

    const pendingPicks = [];

    for (const membership of memberships) {
      // Skip if week is before league start
      if (week < membership.start_week) continue;

      // Check if pick exists for current week
      const pick = db.prepare(`
        SELECT * FROM picks 
        WHERE league_id = ? AND user_id = ? AND week = ?
      `).get(membership.league_id, user.id, week);

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
      currentWeek: week,
      pendingPicks
    });
  } catch (error) {
    console.error('Get pending picks error:', error);
    res.status(500).json({ error: 'Failed to get pending picks' });
  }
});

// Get user's pick history summary
router.get('/history', authMiddleware, (req, res) => {
  try {
    const user = db.prepare('SELECT * FROM users WHERE firebase_uid = ?').get(req.firebaseUser.uid);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const history = db.prepare(`
      SELECT 
        p.week,
        p.team_id,
        p.result,
        l.name as league_name,
        l.id as league_id
      FROM picks p
      JOIN leagues l ON p.league_id = l.id
      WHERE p.user_id = ?
      ORDER BY p.week DESC, l.name ASC
    `).all(user.id);

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
router.get('/stats', authMiddleware, (req, res) => {
  try {
    const user = db.prepare('SELECT * FROM users WHERE firebase_uid = ?').get(req.firebaseUser.uid);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const stats = db.prepare(`
      SELECT 
        COUNT(DISTINCT p.league_id) as leagues_joined,
        COUNT(p.id) as total_picks,
        SUM(CASE WHEN p.result = 'win' THEN 1 ELSE 0 END) as wins,
        SUM(CASE WHEN p.result = 'loss' THEN 1 ELSE 0 END) as losses,
        SUM(CASE WHEN lm.status = 'active' THEN 1 ELSE 0 END) as active_leagues,
        SUM(CASE WHEN lm.status = 'eliminated' THEN 1 ELSE 0 END) as eliminated_leagues
      FROM league_members lm
      LEFT JOIN picks p ON lm.league_id = p.league_id AND lm.user_id = p.user_id
      WHERE lm.user_id = ?
    `).get(user.id);

    res.json({
      leaguesJoined: stats.leagues_joined || 0,
      totalPicks: stats.total_picks || 0,
      wins: stats.wins || 0,
      losses: stats.losses || 0,
      activeLeagues: stats.active_leagues || 0,
      eliminatedLeagues: stats.eliminated_leagues || 0,
      winRate: stats.total_picks > 0 
        ? ((stats.wins / (stats.wins + stats.losses)) * 100).toFixed(1)
        : 0
    });
  } catch (error) {
    console.error('Get stats error:', error);
    res.status(500).json({ error: 'Failed to get stats' });
  }
});

module.exports = router;
