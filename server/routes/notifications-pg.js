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

// Cleanup old read notifications (older than 7 days)
const cleanupOldNotifications = async (userId) => {
  try {
    await db.run(
      `DELETE FROM notifications 
       WHERE user_id = $1 
       AND "read" = true 
       AND created_at < NOW() - INTERVAL '7 days'`,
      [userId]
    );
  } catch (error) {
    console.error('Notification cleanup error:', error.message);
    // Don't throw - cleanup failing shouldn't break the main request
  }
};

// Get user's notifications (paginated)
router.get('/', async (req, res) => {
  try {
    const user = await getUser(req);
    if (!user) return res.status(404).json({ error: 'User not found' });

    // Run cleanup in background (don't await)
    cleanupOldNotifications(user.id);

    const { limit = 20, offset = 0, unreadOnly = false } = req.query;

    let query = `
      SELECT 
        n.*,
        l.name as league_name
      FROM notifications n
      LEFT JOIN leagues l ON n.league_id = l.id
      WHERE n.user_id = $1
    `;
    
    const params = [user.id];
    
    if (unreadOnly === 'true') {
      query += ` AND n."read" = false`;
    }
    
    query += ` ORDER BY n.created_at DESC LIMIT $2 OFFSET $3`;
    params.push(parseInt(limit), parseInt(offset));

    const notifications = await db.getAll(query, params);

    // Get unread count
    const unreadResult = await db.getOne(
      'SELECT COUNT(*) as count FROM notifications WHERE user_id = $1 AND "read" = false',
      [user.id]
    );

    res.json({
      notifications,
      unreadCount: parseInt(unreadResult?.count || 0),
      hasMore: notifications.length === parseInt(limit)
    });
  } catch (error) {
    console.error('Get notifications error:', error.message, error.stack);
    res.status(500).json({ error: 'Failed to fetch notifications', details: error.message });
  }
});

// Get unread count only
router.get('/unread-count', async (req, res) => {
  try {
    const user = await getUser(req);
    if (!user) return res.status(404).json({ error: 'User not found' });
    
    const result = await db.getOne(
      'SELECT COUNT(*) as count FROM notifications WHERE user_id = $1 AND "read" = false',
      [user.id]
    );

    res.json({ count: parseInt(result?.count || 0) });
  } catch (error) {
    console.error('Get unread count error:', error);
    res.status(500).json({ error: 'Failed to fetch unread count' });
  }
});

// Mark notification as read
router.put('/:notificationId/read', async (req, res) => {
  try {
    const user = await getUser(req);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const { notificationId } = req.params;

    await db.run(
      'UPDATE notifications SET "read" = true WHERE id = $1 AND user_id = $2',
      [notificationId, user.id]
    );

    res.json({ success: true });
  } catch (error) {
    console.error('Mark read error:', error);
    res.status(500).json({ error: 'Failed to mark notification as read' });
  }
});

// Mark all notifications as read
router.put('/read-all', async (req, res) => {
  try {
    const user = await getUser(req);
    if (!user) return res.status(404).json({ error: 'User not found' });

    await db.run(
      'UPDATE notifications SET "read" = true WHERE user_id = $1 AND "read" = false',
      [user.id]
    );

    res.json({ success: true });
  } catch (error) {
    console.error('Mark all read error:', error);
    res.status(500).json({ error: 'Failed to mark notifications as read' });
  }
});

// Delete a notification
router.delete('/:notificationId', async (req, res) => {
  try {
    const user = await getUser(req);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const { notificationId } = req.params;

    await db.run(
      'DELETE FROM notifications WHERE id = $1 AND user_id = $2',
      [notificationId, user.id]
    );

    res.json({ success: true });
  } catch (error) {
    console.error('Delete notification error:', error);
    res.status(500).json({ error: 'Failed to delete notification' });
  }
});

// Clear all notifications
router.delete('/', async (req, res) => {
  try {
    const user = await getUser(req);
    if (!user) return res.status(404).json({ error: 'User not found' });

    await db.run(
      'DELETE FROM notifications WHERE user_id = $1',
      [user.id]
    );

    res.json({ success: true });
  } catch (error) {
    console.error('Clear notifications error:', error);
    res.status(500).json({ error: 'Failed to clear notifications' });
  }
});

module.exports = router;