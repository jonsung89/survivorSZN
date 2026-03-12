const { authMiddleware } = require('./auth');
const { db } = require('../db/supabase');

// Admin middleware — chains auth verification + admin role check
const adminMiddleware = async (req, res, next) => {
  // First run normal auth middleware
  authMiddleware(req, res, async (err) => {
    if (err) return; // authMiddleware already sent 401

    try {
      const user = await db.getOne(
        'SELECT id, is_admin FROM users WHERE firebase_uid = $1',
        [req.firebaseUser.uid]
      );

      if (!user || !user.is_admin) {
        return res.status(403).json({ error: 'Admin access required' });
      }

      req.adminUser = user;
      next();
    } catch (error) {
      console.error('Admin middleware error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });
};

module.exports = { adminMiddleware };
