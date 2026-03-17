const express = require('express');
const router = express.Router();
const { db } = require('../db/supabase');
const { authMiddleware, optionalAuth } = require('../middleware/auth');

// Track gamecast session (authenticated)
router.post('/gamecast-session', authMiddleware, async (req, res) => {
  try {
    const user = await db.getOne(
      'SELECT id, is_admin FROM users WHERE firebase_uid = $1',
      [req.firebaseUser.uid]
    );

    if (!user) return res.status(404).json({ error: 'User not found' });

    // Skip tracking for admin users
    if (user.is_admin) {
      return res.json({ success: true, skipped: true });
    }

    const { gameId, sportId, durationSeconds, expandClicks, startedAt, endedAt } = req.body;

    if (!gameId || !sportId) {
      return res.status(400).json({ error: 'gameId and sportId are required' });
    }

    await db.run(
      `INSERT INTO gamecast_sessions (user_id, game_id, sport_id, duration_seconds, expand_clicks, started_at, ended_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [user.id, gameId, sportId, durationSeconds || 0, expandClicks || 0,
       startedAt || new Date().toISOString(), endedAt || new Date().toISOString()]
    );

    res.json({ success: true });
  } catch (error) {
    console.error('Gamecast session tracking error:', error);
    res.status(500).json({ error: 'Failed to track session' });
  }
});

// Get active announcements (authenticated, returns user-relevant ones)
router.get('/announcements/active', optionalAuth, async (req, res) => {
  try {
    const announcements = await db.getAll(`
      SELECT id, title, message, target_type, target_id, created_at
      FROM announcements
      WHERE is_active = TRUE
      AND (expires_at IS NULL OR expires_at > NOW())
      ORDER BY created_at DESC
      LIMIT 10
    `);

    // If authenticated, filter by user's leagues/sports and admin status
    let filteredAnnouncements = announcements;
    if (req.firebaseUser) {
      const user = await db.getOne('SELECT id, is_admin FROM users WHERE firebase_uid = $1', [req.firebaseUser.uid]);
      if (user) {
        const userLeagues = await db.getAll(
          'SELECT league_id FROM league_members WHERE user_id = $1',
          [user.id]
        );
        const userLeagueIds = new Set(userLeagues.map(l => l.league_id));

        filteredAnnouncements = announcements.filter(a => {
          if (a.target_type === 'admin_only') return user.is_admin === true;
          if (a.target_type === 'all') return true;
          if (a.target_type === 'league') return userLeagueIds.has(a.target_id);
          if (a.target_type === 'sport') return true; // Show sport-level announcements to all
          return true;
        });
      } else {
        // No user record — exclude admin-only announcements
        filteredAnnouncements = announcements.filter(a => a.target_type !== 'admin_only');
      }
    } else {
      // Not authenticated — exclude admin-only announcements
      filteredAnnouncements = announcements.filter(a => a.target_type !== 'admin_only');
    }

    res.json({
      announcements: filteredAnnouncements.map(a => ({
        id: a.id,
        title: a.title,
        message: a.message,
        targetType: a.target_type,
        createdAt: a.created_at,
      })),
    });
  } catch (error) {
    console.error('Active announcements error:', error);
    res.status(500).json({ error: 'Failed to fetch announcements' });
  }
});

module.exports = router;
