const express = require('express');
const router = express.Router();
const { 
  getCurrentSeason, 
  getWeekSchedule, 
  getAllTeams, 
  getTeam,
  getGameDetails
} = require('../services/nfl');

// Get current season info
router.get('/season', async (req, res) => {
  try {
    const seasonInfo = await getCurrentSeason();
    res.json(seasonInfo);
  } catch (error) {
    console.error('Get season error:', error);
    res.status(500).json({ error: 'Failed to get season info' });
  }
});

// Get all teams
router.get('/teams', (req, res) => {
  try {
    const teams = getAllTeams();
    res.json(teams);
  } catch (error) {
    console.error('Get teams error:', error);
    res.status(500).json({ error: 'Failed to get teams' });
  }
});

// Get single team
router.get('/teams/:teamId', (req, res) => {
  try {
    const team = getTeam(req.params.teamId);
    if (!team) {
      return res.status(404).json({ error: 'Team not found' });
    }
    res.json(team);
  } catch (error) {
    console.error('Get team error:', error);
    res.status(500).json({ error: 'Failed to get team' });
  }
});

// Get schedule for a specific week
// seasonType: 2 = regular season, 3 = playoffs
router.get('/schedule/:week', async (req, res) => {
  try {
    const { week } = req.params;
    const { season, seasonType } = req.query;
    
    console.log('=== Schedule Request ===');
    console.log('Week param:', week);
    console.log('Season query:', season);
    console.log('SeasonType query:', seasonType);
    
    const weekNum = parseInt(week);
    const seasonTypeNum = parseInt(seasonType) || 2;
    
    console.log('Parsed weekNum:', weekNum);
    console.log('Parsed seasonTypeNum:', seasonTypeNum);
    
    // Validate week number based on season type
    if (seasonTypeNum === 2) {
      // Regular season: weeks 1-18
      if (isNaN(weekNum) || weekNum < 1 || weekNum > 18) {
        return res.status(400).json({ error: 'Invalid week number for regular season (1-18)' });
      }
    } else if (seasonTypeNum === 3) {
      // Playoffs: weeks 1-5 (Wild Card, Divisional, Conference, Pro Bowl, Super Bowl)
      if (isNaN(weekNum) || weekNum < 1 || weekNum > 5) {
        return res.status(400).json({ error: 'Invalid week number for playoffs (1-5)' });
      }
    } else {
      return res.status(400).json({ error: 'Invalid season type' });
    }

    const seasonInfo = await getCurrentSeason();
    const targetSeason = season ? parseInt(season) : seasonInfo.season;
    
    console.log('Target season:', targetSeason);
    console.log('Calling getWeekSchedule with:', targetSeason, weekNum, seasonTypeNum);
    
    const games = await getWeekSchedule(targetSeason, weekNum, seasonTypeNum);
    
    console.log('Got', games.length, 'games');
    console.log('=== End Schedule Request ===');
    
    res.json({
      season: targetSeason,
      week: weekNum,
      seasonType: seasonTypeNum,
      games
    });
  } catch (error) {
    console.error('Get schedule error:', error);
    res.status(500).json({ error: 'Failed to get schedule' });
  }
});

// Get current week's games (shortcut)
router.get('/schedule', async (req, res) => {
  try {
    const { season, week, seasonType } = await getCurrentSeason();
    const games = await getWeekSchedule(season, week, seasonType || 2);
    
    res.json({
      season,
      week,
      seasonType: seasonType || 2,
      games
    });
  } catch (error) {
    console.error('Get current schedule error:', error);
    res.status(500).json({ error: 'Failed to get current schedule' });
  }
});

// Get detailed game info (box scores, player stats)
router.get('/game/:gameId', async (req, res) => {
  try {
    const { gameId } = req.params;
    console.log('Fetching game details for:', gameId);
    
    const details = await getGameDetails(gameId);
    
    if (!details) {
      return res.status(404).json({ error: 'Game not found' });
    }
    
    res.json(details);
  } catch (error) {
    console.error('Get game details error:', error);
    res.status(500).json({ error: 'Failed to get game details' });
  }
});

module.exports = router;