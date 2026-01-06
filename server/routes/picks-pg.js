const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { db } = require('../db/supabase');
const { authMiddleware } = require('../middleware/auth');
const { getCurrentSeason, getWeekSchedule, hasGameStarted, getGameWinner, getTeam } = require('../services/nfl');

// Helper to convert our app week numbers to ESPN API format
// Our app: weeks 1-18 = regular season, weeks 19-22 = playoffs
// ESPN API: seasonType 2 + weeks 1-18 = regular season
//           seasonType 3 + weeks 1-4 = playoffs (Wild Card, Divisional, Conference, Super Bowl)
const getEspnWeekParams = (week) => {
  if (week <= 18) {
    return { espnWeek: week, seasonType: 2 };
  }
  // Playoff weeks: 19=Wild Card(1), 20=Divisional(2), 21=Conference(3), 22=Super Bowl(4)
  return { espnWeek: week - 18, seasonType: 3 };
};

// Helper to get user from Firebase UID
const getUser = async (req) => {
  return db.getOne('SELECT * FROM users WHERE firebase_uid = $1', [req.firebaseUser.uid]);
};

// Make a pick for a specific week
router.post('/', authMiddleware, async (req, res) => {
  try {
    const user = await getUser(req);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const { leagueId, week, teamId, pickNumber = 1 } = req.body;

    if (!leagueId || !week || !teamId) {
      return res.status(400).json({ error: 'League ID, week, and team ID are required' });
    }

    if (pickNumber !== 1 && pickNumber !== 2) {
      return res.status(400).json({ error: 'Pick number must be 1 or 2' });
    }

    // Validate team exists
    const team = getTeam(teamId);
    if (!team) {
      return res.status(400).json({ error: 'Invalid team' });
    }

    // Check league membership
    const membership = await db.getOne(`
      SELECT * FROM league_members WHERE league_id = $1 AND user_id = $2
    `, [leagueId, user.id]);

    if (!membership) {
      return res.status(403).json({ error: 'You are not a member of this league' });
    }

    if (membership.status === 'eliminated') {
      return res.status(403).json({ error: 'You have been eliminated from this league' });
    }

    // Get league settings
    const league = await db.getOne('SELECT * FROM leagues WHERE id = $1', [leagueId]);

    if (week < league.start_week) {
      return res.status(400).json({ error: `Picks start from week ${league.start_week}` });
    }

    // Check if this is a double pick week
    const doublePickWeeks = league.double_pick_weeks || [];
    const isDoublePick = doublePickWeeks.includes(week);

    // Validate pick number
    if (pickNumber === 2 && !isDoublePick) {
      return res.status(400).json({ error: 'This week only requires one pick' });
    }

    // Get week schedule (handle playoff weeks)
    const { espnWeek, seasonType } = getEspnWeekParams(week);
    const games = await getWeekSchedule(league.season, espnWeek, seasonType);

    // Check if team is playing this week
    const teamGame = games.find(g => 
      g.homeTeam?.id === teamId || g.awayTeam?.id === teamId
    );

    if (!teamGame) {
      return res.status(400).json({ error: 'This team is on bye this week' });
    }

    // Check if game has started - use status and date
    const gameStatus = teamGame.status || 'STATUS_SCHEDULED';
    const gameStarted = gameStatus !== 'STATUS_SCHEDULED' || hasGameStarted(teamGame.date);
    if (gameStarted) {
      return res.status(400).json({ error: 'Cannot pick a team whose game has already started' });
    }

    // Check if team was already used (in any week, any pick number)
    const previousPick = await db.getOne(`
      SELECT * FROM picks 
      WHERE league_id = $1 AND user_id = $2 AND team_id = $3 AND week != $4
    `, [leagueId, user.id, teamId, week]);

    if (previousPick) {
      return res.status(400).json({ 
        error: `You already used ${team.name} in Week ${previousPick.week}` 
      });
    }

    // Check if this team is already used as the OTHER pick this same week
    const otherPickNumber = pickNumber === 1 ? 2 : 1;
    const otherPick = await db.getOne(`
      SELECT * FROM picks 
      WHERE league_id = $1 AND user_id = $2 AND week = $3 AND pick_number = $4
    `, [leagueId, user.id, week, otherPickNumber]);

    if (otherPick && otherPick.team_id === teamId) {
      return res.status(400).json({ error: 'You cannot pick the same team twice in one week' });
    }

    // Check if already made this specific pick (update if so)
    const existingPick = await db.getOne(`
      SELECT * FROM picks WHERE league_id = $1 AND user_id = $2 AND week = $3 AND pick_number = $4
    `, [leagueId, user.id, week, pickNumber]);

    if (existingPick) {
      // Can only update if game hasn't started
      const existingGame = games.find(g => 
        g.homeTeam?.id === existingPick.team_id || g.awayTeam?.id === existingPick.team_id
      );

      if (existingGame && hasGameStarted(existingGame.date)) {
        return res.status(400).json({ error: 'Cannot change pick after game has started' });
      }

      // Update pick
      await db.run(`
        UPDATE picks SET team_id = $1, game_id = $2, updated_at = NOW()
        WHERE id = $3
      `, [teamId, teamGame.id, existingPick.id]);

      return res.json({
        success: true,
        message: 'Pick updated successfully',
        pick: {
          id: existingPick.id,
          week,
          teamId,
          teamName: team.name,
          pickNumber,
          game: {
            id: teamGame.id,
            date: teamGame.date,
            opponent: teamGame.homeTeam.id === teamId ? teamGame.awayTeam : teamGame.homeTeam
          }
        }
      });
    }

    // Create new pick
    const pickId = uuidv4();
    await db.run(`
      INSERT INTO picks (id, league_id, user_id, week, team_id, game_id, pick_number)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
    `, [pickId, leagueId, user.id, week, teamId, teamGame.id, pickNumber]);

    res.json({
      success: true,
      message: 'Pick submitted successfully',
      pick: {
        id: pickId,
        week,
        teamId,
        teamName: team.name,
        pickNumber,
        game: {
          id: teamGame.id,
          date: teamGame.date,
          opponent: teamGame.homeTeam.id === teamId ? teamGame.awayTeam : teamGame.homeTeam
        }
      }
    });
  } catch (error) {
    console.error('Make pick error:', error);
    res.status(500).json({ error: 'Failed to submit pick' });
  }
});

// Get user's picks for a league
router.get('/league/:leagueId', authMiddleware, async (req, res) => {
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

    const league = await db.getOne('SELECT * FROM leagues WHERE id = $1', [leagueId]);

    // Get all picks
    const picks = await db.getAll(`
      SELECT * FROM picks 
      WHERE league_id = $1 AND user_id = $2
      ORDER BY week ASC, pick_number ASC
    `, [leagueId, user.id]);

    // Get used teams
    const usedTeams = picks.map(p => p.team_id);

    // Get current week
    const { week: currentWeek } = await getCurrentSeason();

    res.json({
      success: true,
      leagueId,
      startWeek: league.start_week,
      currentWeek,
      doublePickWeeks: league.double_pick_weeks || [],
      usedTeams,
      picks: picks.map(p => ({
        id: p.id,
        week: p.week,
        teamId: p.team_id,
        team: getTeam(p.team_id),
        result: p.result,
        pickNumber: p.pick_number || 1,
        createdAt: p.created_at
      }))
    });
  } catch (error) {
    console.error('Get picks error:', error);
    res.status(500).json({ error: 'Failed to get picks' });
  }
});

// Get available teams for a specific week
router.get('/available/:leagueId/:week', authMiddleware, async (req, res) => {
  try {
    const user = await getUser(req);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const { leagueId, week } = req.params;
    const weekNum = parseInt(week);

    // Check membership
    const membership = await db.getOne(`
      SELECT * FROM league_members WHERE league_id = $1 AND user_id = $2
    `, [leagueId, user.id]);

    if (!membership) {
      return res.status(403).json({ error: 'You are not a member of this league' });
    }

    const league = await db.getOne('SELECT * FROM leagues WHERE id = $1', [leagueId]);

    // Check if this is a double pick week
    const doublePickWeeks = league.double_pick_weeks || [];
    const isDoublePick = doublePickWeeks.includes(weekNum);

    // Get teams already used (excluding this week)
    const usedPicks = await db.getAll(`
      SELECT team_id FROM picks 
      WHERE league_id = $1 AND user_id = $2 AND week != $3
    `, [leagueId, user.id, weekNum]);

    const usedTeams = new Set(usedPicks.map(p => p.team_id));

    // Get current picks for this week (could be 1 or 2)
    const currentPicks = await db.getAll(`
      SELECT * FROM picks WHERE league_id = $1 AND user_id = $2 AND week = $3
      ORDER BY pick_number ASC
    `, [leagueId, user.id, weekNum]);

    // Also track teams picked this week (for double pick - can't pick same team twice)
    const thisWeekTeams = new Set(currentPicks.map(p => p.team_id));

    // Get week schedule (handle playoff weeks)
    const { espnWeek, seasonType } = getEspnWeekParams(weekNum);
    const games = await getWeekSchedule(league.season, espnWeek, seasonType);
    const now = new Date();

    // Build available teams list
    const teamsPlaying = new Map();
    
    console.log('Building available teams for week', weekNum, '- found', games.length, 'games');
    console.log('Current time (now):', now.toISOString());
    
    for (const game of games) {
      // Skip TBD games (playoff matchups not yet determined)
      // TBD teams have negative IDs or abbreviation "TBD"
      // Super Bowl uses AFC/NFC placeholders with IDs 31/32
      const homeTeamId = game.homeTeam?.id;
      const awayTeamId = game.awayTeam?.id;
      const homeAbbr = game.homeTeam?.abbreviation;
      const awayAbbr = game.awayTeam?.abbreviation;
      
      const isTBDGame = 
        !homeTeamId || !awayTeamId ||
        parseInt(homeTeamId) < 0 || parseInt(awayTeamId) < 0 ||
        homeAbbr === 'TBD' || awayAbbr === 'TBD' ||
        homeAbbr === 'AFC' || homeAbbr === 'NFC' ||
        awayAbbr === 'AFC' || awayAbbr === 'NFC';
      
      if (isTBDGame) {
        console.log(`Skipping TBD game ${game.id}: ${homeAbbr || 'TBD'} vs ${awayAbbr || 'TBD'}`);
        continue;
      }
      
      // Parse game date - handle various formats
      let gameStart;
      if (game.date) {
        gameStart = new Date(game.date);
        // Check for invalid date
        if (isNaN(gameStart.getTime())) {
          console.warn(`Invalid game date: ${game.date}, defaulting to unlocked`);
          gameStart = new Date(Date.now() + 86400000); // Default to tomorrow (not locked)
        }
      } else {
        console.warn(`No game date for game ${game.id}, defaulting to unlocked`);
        gameStart = new Date(Date.now() + 86400000); // Default to tomorrow (not locked)
      }
      
      // Game is locked if it has started (not STATUS_SCHEDULED) OR if game time has passed
      // Use status as primary indicator, date as fallback
      const gameStatus = game.status || 'STATUS_SCHEDULED';
      const isGameStarted = gameStatus !== 'STATUS_SCHEDULED';
      const isTimePassed = gameStart <= now;
      const isLocked = isGameStarted || isTimePassed;
      
      console.log(`Game ${game.id}: ${game.homeTeam?.abbreviation} vs ${game.awayTeam?.abbreviation}, status=${gameStatus}, date=${game.date}, gameStart=${gameStart.toISOString()}, isLocked=${isLocked}`);

      if (game.homeTeam) {
        teamsPlaying.set(game.homeTeam.id, {
          team: game.homeTeam,
          game: {
            id: game.id,
            date: game.date,
            status: game.status,
            statusDetail: game.statusDetail,
            isHome: true,
            opponent: game.awayTeam,
            venue: game.venue,
            broadcast: game.broadcast,
            odds: game.odds
          },
          isLocked,
          isUsed: usedTeams.has(game.homeTeam.id),
          isPickedThisWeek: thisWeekTeams.has(game.homeTeam.id),
          currentPickNumber: currentPicks.find(p => p.team_id === game.homeTeam.id)?.pick_number || null
        });
      }

      if (game.awayTeam) {
        teamsPlaying.set(game.awayTeam.id, {
          team: game.awayTeam,
          game: {
            id: game.id,
            date: game.date,
            status: game.status,
            statusDetail: game.statusDetail,
            isHome: false,
            opponent: game.homeTeam,
            venue: game.venue,
            broadcast: game.broadcast,
            odds: game.odds
          },
          isLocked,
          isUsed: usedTeams.has(game.awayTeam.id),
          isPickedThisWeek: thisWeekTeams.has(game.awayTeam.id),
          currentPickNumber: currentPicks.find(p => p.team_id === game.awayTeam.id)?.pick_number || null
        });
      }
    }

    // Debug: Log sample of teams with their game data
    const teamsArray = Array.from(teamsPlaying.values());
    console.log(`Found ${teamsArray.length} valid teams (excludes TBD matchups)`);
    if (teamsArray.length > 0) {
      console.log('Sample team data being sent:', {
        team: teamsArray[0].team.name,
        gameOdds: teamsArray[0].game.odds,
        avgPointsFor: teamsArray[0].team.avgPointsFor,
        last5: teamsArray[0].team.last5?.length || 0
      });
    }

    res.json({
      success: true,
      week: weekNum,
      isDoublePick,
      doublePickWeeks,
      currentPicks: currentPicks.map(p => ({
        id: p.id,
        teamId: p.team_id,
        team: getTeam(p.team_id),
        pickNumber: p.pick_number || 1
      })),
      teams: teamsArray.sort((a, b) => 
        a.team.name.localeCompare(b.team.name)
      )
    });
  } catch (error) {
    console.error('Get available teams error:', error);
    res.status(500).json({ error: 'Failed to get available teams' });
  }
});

// Check and update pick results (can be called by a cron job or manually)
router.post('/update-results', async (req, res) => {
  try {
    const { season, week } = await getCurrentSeason();

    // Get all pending picks for completed games
    const pendingPicks = await db.getAll(`
      SELECT p.*, l.max_strikes, l.season
      FROM picks p
      JOIN leagues l ON p.league_id = l.id
      WHERE p.result = 'pending'
    `);

    let updated = 0;

    for (const pick of pendingPicks) {
      const { espnWeek, seasonType } = getEspnWeekParams(pick.week);
      const games = await getWeekSchedule(pick.season, espnWeek, seasonType);
      const game = games.find(g => g.id === pick.game_id);

      if (!game || game.status !== 'STATUS_FINAL') continue;

      const winner = getGameWinner(game);
      let result;

      if (winner === 'TIE') {
        // Ties typically count as losses in survivor pools
        result = 'loss';
      } else if (winner === pick.team_id) {
        result = 'win';
      } else {
        result = 'loss';
      }

      // Update pick result
      await db.run('UPDATE picks SET result = $1 WHERE id = $2', [result, pick.id]);

      // If loss, add strike to member
      if (result === 'loss') {
        const member = await db.getOne(`
          SELECT * FROM league_members WHERE league_id = $1 AND user_id = $2
        `, [pick.league_id, pick.user_id]);

        if (member) {
          const newStrikes = member.strikes + 1;
          const newStatus = newStrikes >= pick.max_strikes ? 'eliminated' : 'active';

          await db.run(`
            UPDATE league_members SET strikes = $1, status = $2 
            WHERE league_id = $3 AND user_id = $4
          `, [newStrikes, newStatus, pick.league_id, pick.user_id]);
        }
      }

      updated++;
    }

    res.json({ success: true, updated });
  } catch (error) {
    console.error('Update results error:', error);
    res.status(500).json({ error: 'Failed to update results' });
  }
});

// Get pending picks reminder (users who haven't picked)
router.get('/reminders/:leagueId/:week', authMiddleware, async (req, res) => {
  try {
    const user = await getUser(req);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const { leagueId, week } = req.params;
    const weekNum = parseInt(week);

    const league = await db.getOne('SELECT * FROM leagues WHERE id = $1', [leagueId]);

    if (!league || league.commissioner_id !== user.id) {
      return res.status(403).json({ error: 'Only commissioner can view reminders' });
    }

    // Get active members who haven't picked
    const membersWithoutPicks = await db.getAll(`
      SELECT 
        lm.user_id,
        u.display_name,
        u.phone
      FROM league_members lm
      LEFT JOIN users u ON lm.user_id = u.id
      LEFT JOIN picks p ON lm.league_id = p.league_id 
        AND lm.user_id = p.user_id 
        AND p.week = $1
      WHERE lm.league_id = $2 
        AND lm.status = 'active'
        AND p.id IS NULL
    `, [weekNum, leagueId]);

    res.json({
      success: true,
      week: weekNum,
      membersWithoutPicks: membersWithoutPicks.map(m => ({
        userId: m.user_id,
        displayName: m.display_name || `User-${m.user_id.slice(0, 6)}`,
        phone: m.phone
      }))
    });
  } catch (error) {
    console.error('Get reminders error:', error);
    res.status(500).json({ error: 'Failed to get reminders' });
  }
});

module.exports = router;