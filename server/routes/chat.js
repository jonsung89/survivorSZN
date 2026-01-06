const express = require('express');
const router = express.Router();
const { db } = require('../db/supabase');
const { authMiddleware } = require('../middleware/auth');

// All routes require authentication
router.use(authMiddleware);

// Helper to get user from Firebase UID
const getUser = async (req) => {
  return await db.getOne('SELECT * FROM users WHERE firebase_uid = $1', [req.firebaseUser.uid]);
};

// Get chat messages for a league (with pagination)
router.get('/leagues/:leagueId/messages', async (req, res) => {
  try {
    const user = await getUser(req);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const { leagueId } = req.params;
    const { before, limit = 50 } = req.query;

    // Verify membership
    const membership = await db.getOne(
      'SELECT id FROM league_members WHERE league_id = $1 AND user_id = $2',
      [leagueId, user.id]
    );

    if (!membership) {
      return res.status(403).json({ error: 'Not a member of this league' });
    }

    // Build query - now includes gif, reply_to, and reactions
    let query = `
      SELECT 
        cm.id,
        cm.user_id,
        cm.message,
        cm.gif,
        cm.reply_to as "replyTo",
        cm.reactions,
        cm.created_at,
        u.display_name
      FROM chat_messages cm
      JOIN users u ON cm.user_id = u.id
      WHERE cm.league_id = $1
    `;
    const params = [leagueId];

    if (before) {
      query += ` AND cm.created_at < $2`;
      params.push(before);
    }

    query += ` ORDER BY cm.created_at DESC LIMIT $${params.length + 1}`;
    params.push(parseInt(limit));

    const messages = await db.getAll(query, params);

    // Return in chronological order, ensuring reactions default to empty object
    const formattedMessages = messages.reverse().map(msg => ({
      ...msg,
      reactions: msg.reactions || {},
      gif: msg.gif || null,
      replyTo: msg.replyTo || null
    }));

    res.json({ messages: formattedMessages });
  } catch (error) {
    console.error('Get messages error:', error);
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
});

// Get unread count for a league
router.get('/leagues/:leagueId/unread', async (req, res) => {
  try {
    const user = await getUser(req);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const { leagueId } = req.params;

    // Get last read timestamp
    const readStatus = await db.getOne(
      'SELECT last_read_at FROM chat_read_status WHERE user_id = $1 AND league_id = $2',
      [user.id, leagueId]
    );

    const lastReadAt = readStatus?.last_read_at || new Date(0);

    // Count messages after last read
    const result = await db.getOne(
      `SELECT COUNT(*) as count FROM chat_messages 
       WHERE league_id = $1 AND created_at > $2 AND user_id != $3`,
      [leagueId, lastReadAt, user.id]
    );

    res.json({ unreadCount: parseInt(result.count) });
  } catch (error) {
    console.error('Get unread count error:', error);
    res.status(500).json({ error: 'Failed to get unread count' });
  }
});

// Get unread counts for all user's leagues
router.get('/unread', async (req, res) => {
  try {
    const user = await getUser(req);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const results = await db.getAll(`
      SELECT 
        lm.league_id,
        COALESCE(
          (SELECT COUNT(*) FROM chat_messages cm 
           WHERE cm.league_id = lm.league_id 
           AND cm.created_at > COALESCE(
             (SELECT last_read_at FROM chat_read_status crs 
              WHERE crs.user_id = $1 AND crs.league_id = lm.league_id),
             '1970-01-01'
           )
           AND cm.user_id != $1
          ), 0
        ) as unread_count
      FROM league_members lm
      WHERE lm.user_id = $1 AND lm.status = 'active'
    `, [user.id]);

    // Convert to object: { leagueId: count }
    const unreadCounts = {};
    results.forEach(r => {
      unreadCounts[r.league_id] = parseInt(r.unread_count);
    });

    res.json({ unreadCounts });
  } catch (error) {
    console.error('Get all unread counts error:', error);
    res.status(500).json({ error: 'Failed to get unread counts' });
  }
});

// Mark messages as read
router.post('/leagues/:leagueId/read', async (req, res) => {
  try {
    const user = await getUser(req);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const { leagueId } = req.params;

    // Upsert read status
    await db.run(`
      INSERT INTO chat_read_status (user_id, league_id, last_read_at)
      VALUES ($1, $2, NOW())
      ON CONFLICT (user_id, league_id) 
      DO UPDATE SET last_read_at = NOW()
    `, [user.id, leagueId]);

    res.json({ success: true });
  } catch (error) {
    console.error('Mark read error:', error);
    res.status(500).json({ error: 'Failed to mark as read' });
  }
});

// Report a message
router.post('/leagues/:leagueId/messages/:messageId/report', async (req, res) => {
  try {
    const user = await getUser(req);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const { leagueId, messageId } = req.params;

    // Verify membership
    const membership = await db.getOne(
      'SELECT id FROM league_members WHERE league_id = $1 AND user_id = $2',
      [leagueId, user.id]
    );

    if (!membership) {
      return res.status(403).json({ error: 'Not a member of this league' });
    }

    // Log the report (you can create a chat_reports table or just log for now)
    console.log(`Message reported: ${messageId} by user ${user.id} in league ${leagueId}`);
    
    // Optionally insert into a reports table:
    // await db.run(
    //   `INSERT INTO chat_reports (message_id, reported_by, league_id, created_at)
    //    VALUES ($1, $2, $3, NOW())`,
    //   [messageId, user.id, leagueId]
    // );

    res.json({ success: true });
  } catch (error) {
    console.error('Report message error:', error);
    res.status(500).json({ error: 'Failed to report message' });
  }
});

module.exports = router;