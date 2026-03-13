/**
 * Middleware to protect cron/scheduled endpoints with a shared secret.
 * Checks for the secret in either:
 *   - Authorization: Bearer <CRON_SECRET>
 *   - x-cron-secret: <CRON_SECRET>
 *
 * In development, if CRON_SECRET is not set, requests are allowed through.
 */
const cronAuth = (req, res, next) => {
  const secret = process.env.CRON_SECRET;

  // In development without a secret configured, allow requests through
  if (!secret) {
    if (process.env.NODE_ENV === 'production') {
      console.error('CRON_SECRET is not set in production — rejecting cron request');
      return res.status(500).json({ error: 'Server misconfiguration' });
    }
    return next();
  }

  // Check Authorization: Bearer <secret>
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ') && authHeader.split(' ')[1] === secret) {
    return next();
  }

  // Check x-cron-secret header
  if (req.headers['x-cron-secret'] === secret) {
    return next();
  }

  return res.status(401).json({ error: 'Unauthorized' });
};

module.exports = { cronAuth };
