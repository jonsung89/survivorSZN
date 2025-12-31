const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const db = require('../db/init');
const { generateToken, authMiddleware } = require('../middleware/auth');
const { generateCode, sendVerificationCode } = require('../services/sms');

// Request verification code
router.post('/request-code', async (req, res) => {
  try {
    const { phone } = req.body;
    
    if (!phone) {
      return res.status(400).json({ error: 'Phone number is required' });
    }

    // Normalize phone number (basic cleaning)
    const normalizedPhone = phone.replace(/\D/g, '');
    if (normalizedPhone.length < 10) {
      return res.status(400).json({ error: 'Invalid phone number' });
    }

    // Generate 6-digit code
    const code = generateCode();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    // Invalidate any existing codes for this phone
    db.prepare('UPDATE auth_codes SET used = 1 WHERE phone = ? AND used = 0')
      .run(normalizedPhone);

    // Store new code
    const id = uuidv4();
    db.prepare(`
      INSERT INTO auth_codes (id, phone, code, expires_at)
      VALUES (?, ?, ?, ?)
    `).run(id, normalizedPhone, code, expiresAt.toISOString());

    // Send SMS
    await sendVerificationCode(normalizedPhone, code);

    res.json({ 
      success: true, 
      message: 'Verification code sent',
      // Only include code in development for testing
      ...(process.env.SMS_MODE === 'mock' && { code })
    });
  } catch (error) {
    console.error('Request code error:', error);
    res.status(500).json({ error: 'Failed to send verification code' });
  }
});

// Verify code and login/register
router.post('/verify-code', async (req, res) => {
  try {
    const { phone, code } = req.body;
    
    if (!phone || !code) {
      return res.status(400).json({ error: 'Phone and code are required' });
    }

    const normalizedPhone = phone.replace(/\D/g, '');

    // Find valid code
    const authCode = db.prepare(`
      SELECT * FROM auth_codes 
      WHERE phone = ? AND code = ? AND used = 0 AND expires_at > datetime('now')
      ORDER BY created_at DESC
      LIMIT 1
    `).get(normalizedPhone, code);

    if (!authCode) {
      return res.status(400).json({ error: 'Invalid or expired code' });
    }

    // Mark code as used
    db.prepare('UPDATE auth_codes SET used = 1 WHERE id = ?').run(authCode.id);

    // Find or create user
    let user = db.prepare('SELECT * FROM users WHERE phone = ?').get(normalizedPhone);

    if (!user) {
      // Create new user
      const userId = uuidv4();
      db.prepare(`
        INSERT INTO users (id, phone, display_name)
        VALUES (?, ?, ?)
      `).run(userId, normalizedPhone, null);
      
      user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
    }

    // Generate JWT
    const token = generateToken(user.id, user.phone);

    res.json({
      success: true,
      token,
      user: {
        id: user.id,
        phone: user.phone,
        displayName: user.display_name,
        isNewUser: !user.display_name
      }
    });
  } catch (error) {
    console.error('Verify code error:', error);
    res.status(500).json({ error: 'Failed to verify code' });
  }
});

// Get current user
router.get('/me', authMiddleware, (req, res) => {
  try {
    const user = db.prepare('SELECT id, phone, display_name, created_at FROM users WHERE id = ?')
      .get(req.user.userId);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({
      id: user.id,
      phone: user.phone,
      displayName: user.display_name,
      createdAt: user.created_at
    });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ error: 'Failed to get user' });
  }
});

// Update display name
router.put('/display-name', authMiddleware, (req, res) => {
  try {
    const { displayName } = req.body;
    
    if (!displayName || displayName.trim().length < 2) {
      return res.status(400).json({ error: 'Display name must be at least 2 characters' });
    }

    if (displayName.length > 30) {
      return res.status(400).json({ error: 'Display name must be less than 30 characters' });
    }

    db.prepare(`
      UPDATE users SET display_name = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(displayName.trim(), req.user.userId);

    res.json({ success: true, displayName: displayName.trim() });
  } catch (error) {
    console.error('Update display name error:', error);
    res.status(500).json({ error: 'Failed to update display name' });
  }
});

module.exports = router;
