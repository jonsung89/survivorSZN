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

// Get geolocation from IP (non-blocking, 3s timeout)
async function getGeoFromIP(ip) {
  try {
    if (!ip || ip === '127.0.0.1' || ip === '::1' || ip.startsWith('192.168.') || ip.startsWith('10.')) {
      return { city: null, region: null, country: null };
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    const resp = await fetch(`http://ip-api.com/json/${ip}?fields=city,regionName,countryCode`, { signal: controller.signal });
    clearTimeout(timeout);
    if (!resp.ok) return { city: null, region: null, country: null };
    const data = await resp.json();
    return { city: data.city || null, region: data.regionName || null, country: data.countryCode || null };
  } catch {
    return { city: null, region: null, country: null };
  }
}

// ─── Page View Tracking ─────────────────────────────────────────────────────

router.post('/pageview', optionalAuth, async (req, res) => {
  try {
    const { path, anonId } = req.body;
    if (!path || typeof path !== 'string') {
      return res.status(400).json({ error: 'path is required' });
    }

    const deviceType = getDeviceType(req.headers['user-agent']);
    let userId = null;

    if (req.firebaseUser) {
      // Authenticated user — look up and skip admins/bots
      const user = await db.getOne(
        'SELECT id, is_admin, is_bot FROM users WHERE firebase_uid = $1',
        [req.firebaseUser.uid]
      );
      if (!user || user.is_admin || user.is_bot) {
        return res.json({ ok: true });
      }
      userId = user.id;
    } else if (!anonId) {
      // No auth and no anon ID — skip
      return res.json({ ok: true });
    }

    const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip;

    // Insert pageview immediately (without location), then update with geo in background
    const result = await db.getOne(
      'INSERT INTO page_views (user_id, anon_id, page_path, device_type) VALUES ($1, $2, $3, $4) RETURNING id',
      [userId, userId ? null : (anonId || null), path.substring(0, 255), deviceType]
    );

    // Fire-and-forget: resolve geo and update the row
    if (result?.id) {
      getGeoFromIP(ip).then(geo => {
        if (geo.city) {
          db.run(
            'UPDATE page_views SET city = $1, region = $2, country = $3 WHERE id = $4',
            [geo.city, geo.region, geo.country, result.id]
          ).catch(err => console.error('Pageview geo update error:', err.message));
        }
      });
    }

    res.json({ ok: true });
  } catch (error) {
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

    // If authenticated, look up user and skip admins/bots
    if (req.firebaseUser) {
      const user = await db.getOne(
        'SELECT id, is_admin, is_bot FROM users WHERE firebase_uid = $1',
        [req.firebaseUser.uid]
      );
      if (!user || user.is_admin || user.is_bot) {
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
