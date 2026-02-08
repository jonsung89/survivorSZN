const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { db } = require('../db/supabase');
const { authMiddleware } = require('../middleware/auth');
const { getCurrentSeason, getWeekSchedule, getEspnWeekParams } = require('../services/nfl');

// Helper to get user from Firebase UID
const getUser = async (req) => {
  return db.getOne('SELECT * FROM users WHERE firebase_uid = $1', [req.firebaseUser.uid]);
};

// Generate a unique 6-character invite code
const generateInviteCode = () => {
  return crypto.randomBytes(3).toString('hex').toUpperCase();
};

// Create a new league
router.post('/', authMiddleware, async (req, res) => {
  try {
    const user = await getUser(req);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const { name, password, maxStrikes = 1, startWeek = 1 } = req.body;
    
    if (!name || name.trim().length < 3) {
      return res.status(400).json({ error: 'League name must be at least 3 characters' });
    }

    if (!password || password.length < 4) {
      return res.status(400).json({ error: 'Password must be at least 4 characters' });
    }

    if (maxStrikes < 1 || maxStrikes > 5) {
      return res.status(400).json({ error: 'Max strikes must be between 1 and 5' });
    }

    if (startWeek < 1 || startWeek > 18) {
      return res.status(400).json({ error: 'Start week must be between 1 and 18' });
    }

    const { season } = await getCurrentSeason();
    const passwordHash = await bcrypt.hash(password, 10);
    const leagueId = uuidv4();
    const memberId = uuidv4();
    const inviteCode = generateInviteCode();

    // Create league with invite code
    await db.run(`
      INSERT INTO leagues (id, name, password_hash, commissioner_id, max_strikes, start_week, season, invite_code)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `, [leagueId, name.trim(), passwordHash, user.id, maxStrikes, startWeek, season, inviteCode]);

    // Add commissioner as first member
    await db.run(`
      INSERT INTO league_members (id, league_id, user_id, status)
      VALUES ($1, $2, $3, 'active')
    `, [memberId, leagueId, user.id]);

    res.json({
      success: true,
      league: {
        id: leagueId,
        name: name.trim(),
        maxStrikes,
        startWeek,
        season,
        inviteCode,
        isCommissioner: true
      }
    });
  } catch (error) {
    console.error('Create league error:', error);
    res.status(500).json({ error: 'Failed to create league' });
  }
});

// PUBLIC: Get league info by invite code (no auth required)
// This allows people to see league details before signing up
router.get('/invite/:inviteCode', async (req, res) => {
  try {
    const { inviteCode } = req.params;
    
    const league = await db.getOne(`
      SELECT 
        l.id, 
        l.name, 
        l.max_strikes,
        l.start_week,
        l.season,
        l.status,
        l.password_hash IS NOT NULL as has_password,
        u.display_name as commissioner_name,
        COUNT(lm.id) as member_count
      FROM leagues l
      LEFT JOIN users u ON l.commissioner_id = u.id
      LEFT JOIN league_members lm ON l.id = lm.league_id
      WHERE UPPER(l.invite_code) = UPPER($1) AND l.status = 'active'
      GROUP BY l.id, u.display_name
    `, [inviteCode]);

    if (!league) {
      return res.status(404).json({ error: 'League not found or invite code is invalid' });
    }

    res.json({
      success: true,
      league: {
        id: league.id,
        name: league.name,
        maxStrikes: league.max_strikes,
        startWeek: league.start_week,
        season: league.season,
        memberCount: parseInt(league.member_count),
        commissionerName: league.commissioner_name || 'Unknown',
        hasPassword: league.has_password
      }
    });
  } catch (error) {
    console.error('Get league by invite code error:', error);
    res.status(500).json({ error: 'Failed to get league' });
  }
});

// Search for leagues by name
// List all available leagues (ones user hasn't joined)
router.get('/available', authMiddleware, async (req, res) => {
  try {
    const user = await getUser(req);
    
    const leagues = await db.getAll(`
      SELECT 
        l.id, 
        l.name, 
        l.max_strikes,
        l.start_week,
        l.season,
        l.status,
        l.password_hash IS NOT NULL as has_password,
        COUNT(lm.id) as member_count,
        u.display_name as commissioner_name,
        CASE WHEN my_membership.user_id IS NOT NULL THEN true ELSE false END as is_joined
      FROM leagues l
      LEFT JOIN league_members lm ON l.id = lm.league_id
      LEFT JOIN users u ON l.commissioner_id = u.id
      LEFT JOIN league_members my_membership ON l.id = my_membership.league_id AND my_membership.user_id = $1
      WHERE l.status = 'active'
      GROUP BY l.id, u.display_name, my_membership.user_id
      ORDER BY 
        CASE WHEN my_membership.user_id IS NOT NULL THEN 0 ELSE 1 END,
        COUNT(lm.id) DESC
      LIMIT 50
    `, [user.id]);

    res.json({
      success: true,
      leagues: leagues.map(l => ({
        id: l.id,
        name: l.name,
        maxStrikes: l.max_strikes,
        startWeek: l.start_week,
        season: l.season,
        memberCount: parseInt(l.member_count),
        commissionerName: l.commissioner_name || 'Unknown',
        hasPassword: l.has_password,
        isJoined: l.is_joined
      }))
    });
  } catch (error) {
    console.error('List available leagues error:', error);
    res.status(500).json({ error: 'Failed to list leagues' });
  }
});

router.get('/search', authMiddleware, async (req, res) => {
  try {
    const { query } = req.query;
    
    if (!query || query.trim().length < 2) {
      return res.status(400).json({ error: 'Search query must be at least 2 characters' });
    }

    const leagues = await db.getAll(`
      SELECT 
        l.id, 
        l.name, 
        l.max_strikes,
        l.start_week,
        l.season,
        l.status,
        l.password_hash IS NOT NULL as has_password,
        COUNT(lm.id) as member_count,
        u.display_name as commissioner_name
      FROM leagues l
      LEFT JOIN league_members lm ON l.id = lm.league_id
      LEFT JOIN users u ON l.commissioner_id = u.id
      WHERE l.name ILIKE $1 AND l.status = 'active'
      GROUP BY l.id, u.display_name
      LIMIT 20
    `, [`%${query.trim()}%`]);

    res.json({
      success: true,
      leagues: leagues.map(l => ({
        id: l.id,
        name: l.name,
        maxStrikes: l.max_strikes,
        startWeek: l.start_week,
        season: l.season,
        memberCount: parseInt(l.member_count),
        commissionerName: l.commissioner_name || 'Unknown',
        hasPassword: l.has_password
      }))
    });
  } catch (error) {
    console.error('Search leagues error:', error);
    res.status(500).json({ error: 'Failed to search leagues' });
  }
});

// Join a league
router.post('/:leagueId/join', authMiddleware, async (req, res) => {
  try {
    const user = await getUser(req);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const { leagueId } = req.params;
    const { password } = req.body;

    const league = await db.getOne('SELECT * FROM leagues WHERE id = $1', [leagueId]);
    
    if (!league) {
      return res.status(404).json({ error: 'League not found' });
    }

    if (league.status !== 'active') {
      return res.status(400).json({ error: 'This league is no longer active' });
    }

    // Check password
    const validPassword = await bcrypt.compare(password, league.password_hash);
    if (!validPassword) {
      return res.status(400).json({ error: 'Incorrect password' });
    }

    // Check if already a member
    const existingMember = await db.getOne(`
      SELECT * FROM league_members WHERE league_id = $1 AND user_id = $2
    `, [leagueId, user.id]);

    if (existingMember) {
      return res.status(400).json({ error: 'You are already a member of this league' });
    }

    // Join league
    const memberId = uuidv4();
    await db.run(`
      INSERT INTO league_members (id, league_id, user_id, status)
      VALUES ($1, $2, $3, 'active')
    `, [memberId, leagueId, user.id]);

    res.json({
      success: true,
      message: 'Successfully joined league'
    });
  } catch (error) {
    console.error('Join league error:', error);
    res.status(500).json({ error: 'Failed to join league' });
  }
});

// Get user's leagues
router.get('/my-leagues', authMiddleware, async (req, res) => {
  try {
    const user = await getUser(req);
    if (!user) return res.status(404).json({ error: 'User not found' });

    // Get current NFL week using helper that handles playoffs
    let currentWeek = 1;
    try {
      const { week, seasonType } = await getCurrentSeason();
      // Convert ESPN week to internal week
      // ESPN playoffs: 1=Wild Card, 2=Divisional, 3=Conference, 4=Pro Bowl, 5=Super Bowl
      // Internal: 19=Wild Card, 20=Divisional, 21=Conference, 23=Super Bowl (skip 22 Pro Bowl)
      if (seasonType === 3) {
        if (week === 5) {
          currentWeek = 23; // Super Bowl
        } else if (week === 4) {
          currentWeek = 23; // Pro Bowl week - treat as Super Bowl
        } else {
          currentWeek = week + 18;
        }
      } else {
        currentWeek = week;
      }
    } catch (e) {
      console.error('Failed to get current week:', e);
    }

    const leagues = await db.getAll(`
      SELECT 
        l.id, 
        l.name, 
        l.max_strikes,
        l.start_week,
        l.season,
        l.status,
        l.commissioner_id,
        lm.strikes,
        lm.status as member_status,
        COUNT(DISTINCT lm2.id) as member_count,
        COUNT(DISTINCT CASE WHEN lm2.status = 'active' THEN lm2.id END) as active_count
      FROM leagues l
      INNER JOIN league_members lm ON l.id = lm.league_id AND lm.user_id = $1
      LEFT JOIN league_members lm2 ON l.id = lm2.league_id
      GROUP BY l.id, lm.strikes, lm.status
      ORDER BY l.created_at DESC
    `, [user.id]);

    // Get current week picks
    let pickMap = {};
    try {
      const picks = await db.getAll(`
        SELECT league_id, team_id
        FROM picks
        WHERE user_id = $1 AND week = $2
      `, [user.id, currentWeek]);
      
      picks.forEach(p => {
        pickMap[p.league_id] = p.team_id;
      });
    } catch (pickError) {
      console.error('Failed to get picks:', pickError);
    }

    res.json({
      success: true,
      leagues: leagues.map(l => ({
        id: l.id,
        name: l.name,
        maxStrikes: l.max_strikes,
        startWeek: l.start_week,
        season: l.season,
        status: l.status,
        strikes: l.strikes,
        memberStatus: l.member_status,
        memberCount: parseInt(l.member_count),
        activeCount: parseInt(l.active_count),
        isCommissioner: l.commissioner_id === user.id,
        currentPickTeamId: pickMap[l.id] || null
      }))
    });
  } catch (error) {
    console.error('Get my leagues error:', error);
    res.status(500).json({ error: 'Failed to get leagues' });
  }
});

// Get league details
router.get('/:leagueId', authMiddleware, async (req, res) => {
  try {
    const user = await getUser(req);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const { leagueId } = req.params;

    // Check membership
    const membership = await db.getOne(`
      SELECT * FROM league_members WHERE league_id = $1 AND user_id = $2
    `, [leagueId, user.id]);

    if (!membership) {
      return res.status(403).json({ error: 'You are not a member of this league' });
    }

    const league = await db.getOne(`
      SELECT l.*, u.display_name as commissioner_name
      FROM leagues l
      LEFT JOIN users u ON l.commissioner_id = u.id
      WHERE l.id = $1
    `, [leagueId]);

    if (!league) {
      return res.status(404).json({ error: 'League not found' });
    }

    // Get members with their status
    const members = await db.getAll(`
      SELECT 
        lm.id as member_id,
        lm.user_id,
        lm.strikes,
        lm.status,
        lm.joined_at,
        lm.has_paid,
        u.display_name,
        u.email,
        u.phone
      FROM league_members lm
      LEFT JOIN users u ON lm.user_id = u.id
      WHERE lm.league_id = $1
      ORDER BY lm.strikes ASC, lm.joined_at ASC
    `, [leagueId]);

    res.json({
      success: true,
      league: {
        id: league.id,
        name: league.name,
        maxStrikes: league.max_strikes,
        startWeek: league.start_week,
        season: league.season,
        status: league.status,
        commissionerId: league.commissioner_id,
        commissionerName: league.commissioner_name || 'Unknown',
        isCommissioner: league.commissioner_id === user.id,
        inviteCode: league.invite_code,
        doublePickWeeks: league.double_pick_weeks || [],
        entryFee: parseFloat(league.entry_fee) || 0,
        prizePotOverride: league.prize_pot_override ? parseFloat(league.prize_pot_override) : null,
        myStrikes: membership.strikes,
        myStatus: membership.status,
        members: members.map(m => ({
          id: m.member_id,
          userId: m.user_id,
          displayName: m.display_name || `User-${m.user_id.slice(0, 6)}`,
          email: m.email || null,
          strikes: m.strikes,
          status: m.status,
          joinedAt: m.joined_at,
          hasPaid: m.has_paid || false,
          isMe: m.user_id === user.id
        }))
      }
    });
  } catch (error) {
    console.error('Get league error:', error);
    res.status(500).json({ error: 'Failed to get league details' });
  }
});

// Commissioner: Update league settings
router.put('/:leagueId/settings', authMiddleware, async (req, res) => {
  try {
    const user = await getUser(req);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const { leagueId } = req.params;
    const { maxStrikes, startWeek, doublePickWeeks, entryFee, prizePotOverride } = req.body;

    const league = await db.getOne('SELECT * FROM leagues WHERE id = $1', [leagueId]);
    
    if (!league) {
      return res.status(404).json({ error: 'League not found' });
    }

    if (league.commissioner_id !== user.id) {
      return res.status(403).json({ error: 'Only the commissioner can update settings' });
    }

    const updates = [];
    const params = [];
    let paramIndex = 1;
    const changes = [];

    if (maxStrikes !== undefined && maxStrikes !== league.max_strikes) {
      if (maxStrikes < 1 || maxStrikes > 5) {
        return res.status(400).json({ error: 'Max strikes must be between 1 and 5' });
      }
      updates.push(`max_strikes = $${paramIndex++}`);
      params.push(maxStrikes);
      changes.push(`Max strikes: ${league.max_strikes} → ${maxStrikes}`);
    }

    if (startWeek !== undefined && startWeek !== league.start_week) {
      if (startWeek < 1 || startWeek > 18) {
        return res.status(400).json({ error: 'Start week must be between 1 and 18' });
      }
      updates.push(`start_week = $${paramIndex++}`);
      params.push(startWeek);
      changes.push(`Start week: ${league.start_week} → ${startWeek}`);
    }

    if (doublePickWeeks !== undefined) {
      // Validate weeks array (1-21, 23 - skip 22 Pro Bowl)
      const validWeeks = Array.isArray(doublePickWeeks) 
        ? doublePickWeeks.filter(w => w >= 1 && w <= 23 && w !== 22)
        : [];
      const currentWeeks = league.double_pick_weeks || [];
      
      // Check if actually changed
      const changed = JSON.stringify(validWeeks.sort()) !== JSON.stringify(currentWeeks.sort());
      if (changed) {
        updates.push(`double_pick_weeks = $${paramIndex++}`);
        params.push(validWeeks);
        
        if (validWeeks.length === 0) {
          changes.push('Double pick weeks: disabled');
        } else if (validWeeks.length === 22) {
          changes.push('Double pick weeks: all weeks');
        } else {
          changes.push(`Double pick weeks: ${validWeeks.sort((a,b) => a-b).join(', ')}`);
        }
      }
    }

    // Handle entry fee
    if (entryFee !== undefined) {
      const newFee = parseFloat(entryFee) || 0;
      const oldFee = parseFloat(league.entry_fee) || 0;
      if (newFee !== oldFee) {
        updates.push(`entry_fee = $${paramIndex++}`);
        params.push(newFee);
        changes.push(`Entry fee: $${oldFee} → $${newFee}`);
      }
    }

    // Handle prize pot override (null to use calculated, number to override)
    if (prizePotOverride !== undefined) {
      const newOverride = prizePotOverride === null || prizePotOverride === '' ? null : parseFloat(prizePotOverride);
      const oldOverride = league.prize_pot_override ? parseFloat(league.prize_pot_override) : null;
      if (newOverride !== oldOverride) {
        updates.push(`prize_pot_override = $${paramIndex++}`);
        params.push(newOverride);
        if (newOverride === null) {
          changes.push(`Prize pot: manual override removed (using calculated)`);
        } else {
          changes.push(`Prize pot: manually set to $${newOverride}`);
        }
      }
    }

    if (updates.length === 0) {
      return res.json({ success: true, message: 'No changes made' });
    }

    updates.push(`updated_at = NOW()`);
    params.push(leagueId);

    await db.run(`UPDATE leagues SET ${updates.join(', ')} WHERE id = $${paramIndex}`, params);

    // Log the action
    try {
      await db.run(`
        INSERT INTO commissioner_actions (id, league_id, performed_by, action, reason, created_at)
        VALUES ($1, $2, $3, $4, $5, NOW())
      `, [
        require('uuid').v4(),
        leagueId,
        user.id,
        'settings_changed',
        changes.join(', ')
      ]);
    } catch (logError) {
      console.log('Could not log action:', logError.message);
    }

    res.json({ success: true, message: 'Settings updated' });
  } catch (error) {
    console.error('Update settings error:', error);
    res.status(500).json({ error: 'Failed to update settings' });
  }
});

// Toggle member payment status (commissioner only)
router.post('/:leagueId/members/:memberId/payment', authMiddleware, async (req, res) => {
  try {
    const user = await getUser(req);
    const { leagueId, memberId } = req.params;
    const { hasPaid } = req.body;

    const league = await db.getOne('SELECT * FROM leagues WHERE id = $1', [leagueId]);
    if (!league) {
      return res.status(404).json({ error: 'League not found' });
    }
    if (league.commissioner_id !== user.id) {
      return res.status(403).json({ error: 'Only the commissioner can update payment status' });
    }

    const member = await db.getOne(`
      SELECT lm.*, u.display_name 
      FROM league_members lm 
      LEFT JOIN users u ON lm.user_id = u.id 
      WHERE lm.id = $1 AND lm.league_id = $2
    `, [memberId, leagueId]);
    
    if (!member) {
      return res.status(404).json({ error: 'Member not found' });
    }

    await db.run(`
      UPDATE league_members 
      SET has_paid = $1, paid_at = $2
      WHERE id = $3 AND league_id = $4
    `, [hasPaid, hasPaid ? new Date().toISOString() : null, memberId, leagueId]);

    try {
      await db.run(`
        INSERT INTO commissioner_actions (id, league_id, performed_by, action, reason, created_at)
        VALUES ($1, $2, $3, $4, $5, NOW())
      `, [
        require('uuid').v4(),
        leagueId,
        user.id,
        hasPaid ? 'payment_received' : 'payment_removed',
        `${member.display_name || 'Member'}: marked as ${hasPaid ? 'paid' : 'unpaid'}`
      ]);
    } catch (logError) {
      console.log('Could not log action:', logError.message);
    }

    res.json({ success: true, hasPaid });
  } catch (error) {
    console.error('Update payment error:', error);
    res.status(500).json({ error: 'Failed to update payment status' });
  }
});

// Commissioner: Regenerate invite code
router.post('/:leagueId/regenerate-invite', authMiddleware, async (req, res) => {
  try {
    const user = await getUser(req);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const { leagueId } = req.params;

    const league = await db.getOne('SELECT * FROM leagues WHERE id = $1', [leagueId]);
    
    if (!league) {
      return res.status(404).json({ error: 'League not found' });
    }

    if (league.commissioner_id !== user.id) {
      return res.status(403).json({ error: 'Only the commissioner can regenerate the invite code' });
    }

    const newInviteCode = generateInviteCode();

    await db.run(`
      UPDATE leagues SET invite_code = $1, updated_at = NOW()
      WHERE id = $2
    `, [newInviteCode, leagueId]);

    res.json({ 
      success: true, 
      inviteCode: newInviteCode,
      message: 'Invite code regenerated successfully'
    });
  } catch (error) {
    console.error('Regenerate invite code error:', error);
    res.status(500).json({ error: 'Failed to regenerate invite code' });
  }
});

// Commissioner: Modify member strikes
router.post('/:leagueId/members/:memberId/strikes', authMiddleware, async (req, res) => {
  try {
    const user = await getUser(req);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const { leagueId, memberId } = req.params;
    const { action, reason, week } = req.body; // 'add' or 'remove', optional reason and week

    const league = await db.getOne('SELECT * FROM leagues WHERE id = $1', [leagueId]);
    
    if (!league) {
      return res.status(404).json({ error: 'League not found' });
    }

    if (league.commissioner_id !== user.id) {
      return res.status(403).json({ error: 'Only the commissioner can modify strikes' });
    }

    const member = await db.getOne(`
      SELECT lm.*, u.display_name FROM league_members lm
      JOIN users u ON u.id = lm.user_id
      WHERE lm.id = $1 AND lm.league_id = $2
    `, [memberId, leagueId]);

    if (!member) {
      return res.status(404).json({ error: 'Member not found' });
    }

    let newStrikes = member.strikes;
    let newStatus = member.status;

    if (action === 'add') {
      newStrikes = Math.min(member.strikes + 1, league.max_strikes);
      if (newStrikes >= league.max_strikes) {
        newStatus = 'eliminated';
      }
    } else if (action === 'remove') {
      newStrikes = Math.max(member.strikes - 1, 0);
      if (newStrikes < league.max_strikes && member.status === 'eliminated') {
        newStatus = 'active';
      }
    } else {
      return res.status(400).json({ error: 'Invalid action. Use "add" or "remove"' });
    }

    await db.run(`
      UPDATE league_members SET strikes = $1, status = $2 WHERE id = $3
    `, [newStrikes, newStatus, memberId]);

    // Log the action
    try {
      await db.run(`
        INSERT INTO commissioner_actions (id, league_id, performed_by, action, target_user_id, target_user_name, week, reason, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
      `, [
        require('uuid').v4(),
        leagueId,
        user.id,
        action === 'add' ? 'strike_added' : 'strike_removed',
        member.user_id,
        member.display_name,
        week || null,
        reason || null
      ]);
    } catch (logError) {
      // Log error but don't fail the request - table might not exist yet
      console.log('Could not log action (table may not exist):', logError.message);
    }

    res.json({ 
      success: true, 
      newStrikes, 
      newStatus,
      week,
      message: `${action === 'add' ? 'Added' : 'Removed'} strike for Week ${week}`
    });
  } catch (error) {
    console.error('Modify strikes error:', error);
    res.status(500).json({ error: 'Failed to modify strikes' });
  }
});

// Get commissioner action log
router.get('/:leagueId/action-log', authMiddleware, async (req, res) => {
  try {
    const user = await getUser(req);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const { leagueId } = req.params;

    // Check membership
    const membership = await db.getOne(`
      SELECT * FROM league_members WHERE league_id = $1 AND user_id = $2
    `, [leagueId, user.id]);

    if (!membership) {
      return res.status(403).json({ error: 'You are not a member of this league' });
    }

    try {
      const actions = await db.getAll(`
        SELECT 
          ca.id,
          ca.action,
          ca.target_user_name as "targetUser",
          ca.week,
          ca.team_id as "teamId",
          ca.reason,
          ca.created_at as timestamp,
          u.display_name as "performedBy"
        FROM commissioner_actions ca
        LEFT JOIN users u ON u.id = ca.performed_by
        WHERE ca.league_id = $1
        ORDER BY ca.created_at DESC
        LIMIT 50
      `, [leagueId]);

      res.json({ success: true, log: actions || [] });
    } catch (error) {
      // Table might not exist yet
      console.log('Action log table may not exist:', error.message);
      res.json({ success: true, log: [] });
    }
  } catch (error) {
    console.error('Get action log error:', error);
    res.status(500).json({ error: 'Failed to get action log' });
  }
});

// Commissioner: Set pick for a member
router.post('/:leagueId/members/:memberId/pick', authMiddleware, async (req, res) => {
  try {
    const user = await getUser(req);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const { leagueId, memberId } = req.params;
    const { week, teamId, reason, pickNumber = 1 } = req.body;

    if (!week || !teamId) {
      return res.status(400).json({ error: 'Week and teamId are required' });
    }

    // Validate week is within valid range (max 23 = Super Bowl)
    const weekNum = parseInt(week);
    if (weekNum > 23) {
      return res.status(400).json({ error: 'Invalid week. Season ends at Super Bowl (week 23)' });
    }

    if (pickNumber !== 1 && pickNumber !== 2) {
      return res.status(400).json({ error: 'Pick number must be 1 or 2' });
    }

    const league = await db.getOne('SELECT * FROM leagues WHERE id = $1', [leagueId]);
    
    if (!league) {
      return res.status(404).json({ error: 'League not found' });
    }

    if (league.commissioner_id !== user.id) {
      return res.status(403).json({ error: 'Only the commissioner can set picks for members' });
    }

    // Validate week is within league range
    if (weekNum < league.start_week) {
      return res.status(400).json({ error: `Picks start from week ${league.start_week}` });
    }

    // Check if this is a double pick week
    const doublePickWeeks = league.double_pick_weeks || [];
    const isDoublePick = doublePickWeeks.includes(parseInt(week));
    
    // Validate pickNumber for non-double weeks
    if (pickNumber === 2 && !isDoublePick) {
      return res.status(400).json({ error: 'This week only requires one pick' });
    }

    const member = await db.getOne(`
      SELECT lm.*, u.display_name FROM league_members lm
      JOIN users u ON u.id = lm.user_id
      WHERE lm.id = $1 AND lm.league_id = $2
    `, [memberId, leagueId]);

    if (!member) {
      return res.status(404).json({ error: 'Member not found' });
    }

    // Check if team was already used by this player in a different week
    const existingUse = await db.getOne(`
      SELECT * FROM picks 
      WHERE league_id = $1 AND user_id = $2 AND team_id = $3 AND week != $4
    `, [leagueId, member.user_id, teamId, week]);

    if (existingUse) {
      return res.status(400).json({ error: `This player already used this team in Week ${existingUse.week}` });
    }

    // Check if this team is already used as the OTHER pick this same week
    const otherPickNumber = pickNumber === 1 ? 2 : 1;
    const otherPick = await db.getOne(`
      SELECT * FROM picks 
      WHERE league_id = $1 AND user_id = $2 AND week = $3 AND pick_number = $4
    `, [leagueId, member.user_id, week, otherPickNumber]);

    if (otherPick && otherPick.team_id === teamId) {
      return res.status(400).json({ error: 'Cannot pick the same team twice in one week' });
    }

    // Get the game for this team and week
    const { season, week: currentWeek } = await getCurrentSeason();
    let gameId = null;
    let teamGame = null;
    
    // Convert frontend weeks (19-22 for playoffs) to ESPN format
    const { espnWeek, seasonType } = getEspnWeekParams(parseInt(week));
    
    try {
      const games = await getWeekSchedule(season, espnWeek, seasonType);
      teamGame = games.find(g => 
        String(g.homeTeam?.id) === String(teamId) || String(g.awayTeam?.id) === String(teamId)
      );
      if (teamGame) {
        gameId = teamGame.id;
      }
    } catch (e) {
      console.log('Could not find game for team/week:', e.message);
    }

    // Determine result if game is completed
    let result = 'pending';
    if (teamGame && teamGame.status === 'STATUS_FINAL') {
      // Game is completed - determine if the picked team won
      const isHome = String(teamGame.homeTeam?.id) === String(teamId);
      const homeScore = parseInt(teamGame.homeTeam?.score) || 0;
      const awayScore = parseInt(teamGame.awayTeam?.score) || 0;
      
      if (isHome) {
        result = homeScore > awayScore ? 'win' : 'loss';
      } else {
        result = awayScore > homeScore ? 'win' : 'loss';
      }
      // Handle ties as loss in survivor (rare but possible)
      if (homeScore === awayScore) {
        result = 'loss';
      }
    }

    // Check if pick exists for this week AND pick_number
    const existingPick = await db.getOne(`
      SELECT * FROM picks WHERE league_id = $1 AND user_id = $2 AND week = $3 AND pick_number = $4
    `, [leagueId, member.user_id, week, pickNumber]);

    if (existingPick) {
      // Update existing pick
      await db.run(`
        UPDATE picks SET team_id = $1, game_id = $2, result = $3, updated_at = NOW()
        WHERE id = $4
      `, [teamId, gameId, result, existingPick.id]);
    } else {
      // Create new pick
      const pickId = require('uuid').v4();
      await db.run(`
        INSERT INTO picks (id, league_id, user_id, week, team_id, game_id, result, pick_number)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `, [pickId, leagueId, member.user_id, week, teamId, gameId, result, pickNumber]);
    }

    // If the pick resulted in a loss, add a strike
    if (result === 'loss') {
      const memberData = await db.getOne('SELECT strikes, status FROM league_members WHERE id = $1', [memberId]);
      const newStrikes = Math.min((memberData.strikes || 0) + 1, league.max_strikes);
      const newStatus = newStrikes >= league.max_strikes ? 'eliminated' : memberData.status;
      
      await db.run(`
        UPDATE league_members SET strikes = $1, status = $2 WHERE id = $3
      `, [newStrikes, newStatus, memberId]);
    }

    // Log the action
    try {
      await db.run(`
        INSERT INTO commissioner_actions (id, league_id, performed_by, action, target_user_id, target_user_name, week, team_id, reason, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
      `, [
        require('uuid').v4(),
        leagueId,
        user.id,
        'pick_set',
        member.user_id,
        member.display_name,
        week,
        teamId,
        reason || null
      ]);
    } catch (logError) {
      console.log('Could not log action:', logError.message);
    }

    res.json({ 
      success: true, 
      message: `Pick set for ${member.display_name} - Week ${week}`
    });
  } catch (error) {
    console.error('Set member pick error:', error);
    res.status(500).json({ error: 'Failed to set pick' });
  }
});

// Get league standings/leaderboard
router.get('/:leagueId/standings', authMiddleware, async (req, res) => {
  try {
    const user = await getUser(req);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const { leagueId } = req.params;
    const { week } = req.query;

    // Check membership
    const membership = await db.getOne(`
      SELECT * FROM league_members WHERE league_id = $1 AND user_id = $2
    `, [leagueId, user.id]);

    if (!membership) {
      return res.status(403).json({ error: 'You are not a member of this league' });
    }

    const league = await db.getOne('SELECT * FROM leagues WHERE id = $1', [leagueId]);
    const doublePickWeeks = league.double_pick_weeks || [];

    // Get current week from NFL API
    const { season, week: currentWeek } = await getCurrentSeason();
    const targetWeek = week ? parseInt(week) : currentWeek;

    // Get schedule for the target week to determine game status
    // Convert frontend weeks (19-22 for playoffs) to ESPN format
    const { espnWeek, seasonType } = getEspnWeekParams(targetWeek);
    let weekGames = [];
    try {
      weekGames = await getWeekSchedule(season, espnWeek, seasonType);
      console.log(`Fetched ${weekGames.length} games for week ${targetWeek} (ESPN: week ${espnWeek}, seasonType ${seasonType})`);
    } catch (e) {
      console.error('Failed to get week schedule:', e);
      // Continue with empty games array
    }
    const now = new Date();

    // Get all members with their picks
    const standings = await db.getAll(`
      SELECT 
        lm.id as member_id,
        lm.user_id,
        lm.strikes,
        lm.status,
        lm.has_paid,
        u.display_name,
        u.email
      FROM league_members lm
      LEFT JOIN users u ON lm.user_id = u.id
      WHERE lm.league_id = $1
      ORDER BY lm.strikes ASC, u.display_name ASC
    `, [leagueId]);

    // Get picks for each week from start_week to target_week
    // Structure: memberPicks[userId][week] = array of picks
    const memberPicks = {};
    for (const member of standings) {
      memberPicks[member.user_id] = {};
    }

    const allPicks = await db.getAll(`
      SELECT p.*, u.display_name
      FROM picks p
      LEFT JOIN users u ON p.user_id = u.id
      WHERE p.league_id = $1 AND p.week <= $2
      ORDER BY p.week ASC, p.pick_number ASC
    `, [leagueId, targetWeek]);

    for (const pick of allPicks) {
      if (!memberPicks[pick.user_id]) continue;
      if (!memberPicks[pick.user_id][pick.week]) {
        memberPicks[pick.user_id][pick.week] = [];
      }
      memberPicks[pick.user_id][pick.week].push({
        teamId: pick.team_id,
        result: pick.result,
        gameId: pick.game_id,
        pickNumber: pick.pick_number || 1
      });
    }

    // Determine which picks to show based on game status
    const result = standings.map(member => {
      const picks = {};
      
      for (let w = league.start_week; w <= targetWeek; w++) {
        const weekPicks = memberPicks[member.user_id]?.[w] || [];
        const isDoublePick = doublePickWeeks.includes(w);
        
        if (weekPicks.length === 0) {
          picks[w] = { status: 'no_pick', visible: true, picks: [] };
          continue;
        }

        // Process each pick for this week
        const isCurrentWeek = w === targetWeek;
        const processedPicks = weekPicks.map(pick => {
          const game = weekGames.find(g => 
            String(g.homeTeam?.id) === String(pick.teamId) || String(g.awayTeam?.id) === String(pick.teamId)
          );

          // Determine visibility
          let visible = true;
          if (isCurrentWeek && game) {
            const gameStart = new Date(game.date);
            visible = gameStart <= now;
          }

          // For other users, hide future picks
          if (!visible && member.user_id !== user.id) {
            return { status: 'hidden', visible: false, pickNumber: pick.pickNumber };
          }
          
          return {
            teamId: pick.teamId,
            result: pick.result,
            visible,
            pickNumber: pick.pickNumber,
            gameStatus: game?.status
          };
        });

        // For backward compatibility, also include top-level fields from first pick
        const firstPick = processedPicks[0];
        picks[w] = {
          teamId: firstPick?.teamId,
          result: firstPick?.result,
          visible: firstPick?.visible ?? true,
          gameStatus: firstPick?.gameStatus,
          isDoublePick,
          picks: processedPicks
        };
      }

      return {
        memberId: member.member_id,
        userId: member.user_id,
        displayName: member.display_name || `User-${member.user_id.slice(0, 6)}`,
        email: member.email || null,
        strikes: member.strikes,
        status: member.status,
        hasPaid: member.has_paid || false,
        isMe: member.user_id === user.id,
        picks
      };
    });

    res.json({
      success: true,
      leagueId,
      season: league.season,
      startWeek: league.start_week,
      currentWeek,
      targetWeek,
      maxStrikes: league.max_strikes,
      doublePickWeeks,
      standings: result
    });
  } catch (error) {
    console.error('Get standings error:', error);
    res.status(500).json({ error: 'Failed to get standings' });
  }
});

module.exports = router;