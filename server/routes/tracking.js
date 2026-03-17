const express = require('express');
const router = express.Router();
const { db } = require('../db/supabase');
const { authMiddleware, optionalAuth } = require('../middleware/auth');

// Parse device type from user agent string
function getDeviceType(userAgent) {
  if (!userAgent) return 'unknown';
  const ua = userAgent.toLowerCase();
  if (/mobile|android|iphone|ipod|blackberry|opera mini|iemobile|wpdesktop|windows phone/.test(ua)) return 'mobile';
  if (/ipad|tablet|playbook|silk/.test(ua)) return 'tablet';
  return 'desktop';
}

// ─── Page View Tracking ─────────────────────────────────────────────────────

router.post('/pageview', authMiddleware, async (req, res) => {
  try {
    const { path } = req.body;
    if (!path || typeof path !== 'string') {
      return res.status(400).json({ error: 'path is required' });
    }

    // Look up user to check admin status (skip tracking for admins)
    const user = await db.getOne(
      'SELECT id, is_admin FROM users WHERE firebase_uid = $1',
      [req.firebaseUser.uid]
    );

    if (!user || user.is_admin) {
      // Skip tracking for admins or unknown users, but still return 200
      return res.json({ ok: true });
    }

    const deviceType = getDeviceType(req.headers['user-agent']);

    // Insert page view (fire-and-forget style, but we await for error handling)
    await db.run(
      'INSERT INTO page_views (user_id, page_path, device_type) VALUES ($1, $2, $3)',
      [user.id, path.substring(0, 255), deviceType]
    );

    res.json({ ok: true });
  } catch (error) {
    // Don't fail the request — tracking is best-effort
    console.error('Page view tracking error:', error.message);
    res.json({ ok: true });
  }
});

// ─── Feature Event Tracking ──────────────────────────────────────────────────

router.post('/event', optionalAuth, async (req, res) => {
  try {
    const { event, data, duration, sessionId } = req.body;
    if (!event || typeof event !== 'string') {
      return res.status(400).json({ error: 'event is required' });
    }

    let userId = null;

    // If authenticated, look up user and skip admins
    if (req.firebaseUser) {
      const user = await db.getOne(
        'SELECT id, is_admin FROM users WHERE firebase_uid = $1',
        [req.firebaseUser.uid]
      );
      if (!user || user.is_admin) {
        return res.json({ ok: true });
      }
      userId = user.id;
    }

    // Must have either a user or a session ID
    if (!userId && !sessionId) {
      return res.json({ ok: true });
    }

    const deviceType = getDeviceType(req.headers['user-agent']);

    await db.run(
      `INSERT INTO feature_events (user_id, session_id, event_name, event_data, duration_seconds, device_type)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        userId,
        userId ? null : (sessionId || null),
        event.substring(0, 100),
        JSON.stringify(data || {}),
        typeof duration === 'number' ? Math.round(duration) : null,
        deviceType,
      ]
    );

    res.json({ ok: true });
  } catch (error) {
    console.error('Feature event tracking error:', error.message);
    res.json({ ok: true });
  }
});

module.exports = router;
