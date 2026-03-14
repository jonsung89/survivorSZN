const express = require('express');
const router = express.Router();
const { getSport, getProvider } = require('../sports');

// Middleware to validate sport param and attach provider
function resolveSport(req, res, next) {
  const { sport } = req.params;
  try {
    const sportModule = getSport(sport);
    // Only allow daily-schedule sports through this router
    if (sportModule.scheduleType !== 'daily') {
      return res.status(400).json({ error: `Sport '${sport}' does not use daily scheduling` });
    }
    req.sportModule = sportModule;
    req.provider = sportModule.provider;
    next();
  } catch (err) {
    return res.status(404).json({ error: `Unknown sport: ${sport}` });
  }
}

// GET /api/schedule/:sport/rankings/:statKey
// Returns league-wide rankings for a specific stat (all sports)
// Placed before resolveSport middleware so NFL requests aren't rejected
router.get('/:sport/rankings/:statKey', async (req, res) => {
  const { sport, statKey } = req.params;
  try {
    const sportModule = getSport(sport);
    const provider = sportModule.provider;
    if (!provider.getLeagueStatRankings) {
      return res.status(400).json({ error: 'Rankings not available for this sport' });
    }
    const rankings = await provider.getLeagueStatRankings(statKey);
    if (!rankings) {
      return res.status(400).json({ error: 'Rankings not available for this sport' });
    }
    res.json({ success: true, sport, statKey, rankings });
  } catch (error) {
    console.error(`Error getting ${sport} rankings for ${statKey}:`, error.message);
    res.status(500).json({ error: `Failed to get rankings for ${sport}` });
  }
});

router.use('/:sport', resolveSport);

// GET /api/schedule/:sport/season
// Returns current season info
router.get('/:sport/season', async (req, res) => {
  try {
    const season = await req.provider.getCurrentSeason();
    res.json({ success: true, sport: req.params.sport, ...season });
  } catch (error) {
    console.error(`Error getting ${req.params.sport} season:`, error.message);
    res.status(500).json({ error: `Failed to get current season for ${req.params.sport}` });
  }
});

// GET /api/schedule/:sport/date/:date
// Returns games for a specific date (YYYY-MM-DD)
router.get('/:sport/date/:date', async (req, res) => {
  try {
    const { date } = req.params;
    // Validate date format
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ error: 'Invalid date format. Use YYYY-MM-DD' });
    }

    const games = await req.provider.getScheduleByDate(date);
    res.json({ success: true, sport: req.params.sport, date, games });
  } catch (error) {
    console.error(`Error getting ${req.params.sport} schedule for ${req.params.date}:`, error.message);
    res.status(500).json({ error: `Failed to get schedule for ${req.params.sport}` });
  }
});

// GET /api/schedule/:sport/game/:gameId
// Returns detailed info for a specific game (flat, matching NFL API pattern)
router.get('/:sport/game/:gameId', async (req, res) => {
  try {
    const { gameId } = req.params;
    // ?live=1 shortens cache to 15s for live game polling (Gamecast, Shot Chart)
    const options = req.query.live === '1' ? { cacheTtl: 15000 } : {};
    const details = await req.provider.getGameDetails(gameId, options);
    if (!details) {
      return res.status(404).json({ error: 'Game not found' });
    }
    // Return details directly (not wrapped) to match NFL game details format
    res.json(details);
  } catch (error) {
    console.error(`Error getting ${req.params.sport} game ${req.params.gameId}:`, error.message);
    res.status(500).json({ error: `Failed to get game details for ${req.params.sport}` });
  }
});

// GET /api/schedule/:sport/team/:teamId/info
// Returns comprehensive team info (stats, news, schedule)
router.get('/:sport/team/:teamId/info', async (req, res) => {
  try {
    const { teamId } = req.params;
    const info = await req.provider.getTeamInfo(teamId);
    if (!info) {
      return res.status(404).json({ error: 'Team not found' });
    }
    res.json(info);
  } catch (error) {
    console.error(`Error getting ${req.params.sport} team ${req.params.teamId} info:`, error.message);
    res.status(500).json({ error: `Failed to get team info for ${req.params.sport}` });
  }
});

// GET /api/schedule/:sport/teams
// Returns all teams for the sport
router.get('/:sport/teams', async (req, res) => {
  try {
    const teams = await req.provider.getTeams();
    res.json({ success: true, sport: req.params.sport, teams });
  } catch (error) {
    console.error(`Error getting ${req.params.sport} teams:`, error.message);
    res.status(500).json({ error: `Failed to get teams for ${req.params.sport}` });
  }
});

module.exports = router;
