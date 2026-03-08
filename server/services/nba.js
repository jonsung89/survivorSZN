// NBA Data Service - ESPN API Integration
const createDailySportService = require('./daily-sport');
const { parseBoxscoreSeasonStats } = require('./espn');

const API_BASE = 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba';

/**
 * Parse ESPN summary response for NBA game details
 * Extracts leaders, linescores, scoring plays, and team stats
 */
function parseNBAGameDetails(data) {
  const boxscore = data.boxscore;
  const header = data.header;

  // --- Leaders (flatten nested structure for frontend) ---
  const rawLeaders = parseLeaders(boxscore);
  const leaders = [];
  rawLeaders.forEach(cat => {
    (cat.leaders || []).forEach(l => {
      leaders.push({ ...l, displayName: cat.category });
    });
  });

  // --- Linescores ---
  const linescores = parseLinescores(header);

  // --- Scoring Plays ---
  const scoringPlays = data.scoringPlays || null;

  // --- Team Stats (convert to keyed object for frontend) ---
  const rawTeamStats = parseTeamStats(boxscore);
  const teamStats = rawTeamStats ? {
    home: normalizeStatsToObject(rawTeamStats.home, NBA_STAT_KEY_MAP),
    away: normalizeStatsToObject(rawTeamStats.away, NBA_STAT_KEY_MAP),
  } : null;

  // --- Win probability ---
  let winProbability = null;
  if (data.predictor) {
    winProbability = {
      homeWinPct: data.predictor.homeTeam?.gameProjection || 50,
      awayWinPct: data.predictor.awayTeam?.gameProjection || 50,
    };
  }

  // --- Season averages from boxscore (streak, opp PPG, L10 for upcoming games) ---
  const seasonAverages = parseBoxscoreSeasonStats(boxscore);

  return { leaders, scoringPlays, linescores, teamStats, winProbability, seasonAverages };
}

// Map ESPN stat labels to frontend stat keys
const NBA_STAT_KEY_MAP = {
  'FG%': 'fieldGoalPct',
  'FG': 'fieldGoalPct',
  '3PT%': 'threePointPct',
  '3PT': 'threePointPct',
  'FT%': 'freeThrowPct',
  'FT': 'freeThrowPct',
  'Rebounds': 'rebounds',
  'Assists': 'assists',
  'Turnovers': 'turnovers',
  'Steals': 'steals',
  'Blocks': 'blocks',
  'Fast Break Pts': 'fastBreakPoints',
  'Points in Paint': 'pointsInPaint',
  'Pts off Turnovers': 'pointsOffTurnovers',
  'Largest Lead': 'largestLead',
};

function normalizeStatsToObject(statsArray, keyMap) {
  if (!Array.isArray(statsArray)) return statsArray || {};
  const obj = {};
  statsArray.forEach(s => {
    const key = keyMap[s.label] || s.label;
    obj[key] = s.value;
  });
  return obj;
}

/**
 * Find the top performer in a given stat from boxscore player data.
 * Searches through all athletes across both teams, returns the one with the highest value
 * at the specified stat index.
 */
function findTopPerformer(boxscore, statIndex, labels) {
  if (!boxscore?.players) return null;

  let best = null;
  let bestValue = -1;

  boxscore.players.forEach(teamPlayers => {
    const teamAbbr = teamPlayers.team?.abbreviation;
    const teamLogo = teamPlayers.team?.logo;

    teamPlayers.statistics?.forEach(statGroup => {
      statGroup.athletes?.forEach(athleteEntry => {
        const stats = athleteEntry.stats || [];
        const val = parseInt(stats[statIndex]) || 0;
        if (val > bestValue) {
          bestValue = val;
          best = {
            displayName: athleteEntry.athlete?.displayName || 'Unknown',
            value: `${val} ${labels}`,
            player: {
              name: athleteEntry.athlete?.displayName || 'Unknown',
              position: athleteEntry.athlete?.position?.abbreviation || '',
              headshot: athleteEntry.athlete?.headshot?.href || null,
              team: teamAbbr,
              teamLogo: teamLogo
            }
          };
        }
      });
    });
  });

  return best;
}

/**
 * Parse leaders from boxscore data.
 * NBA stat labels from ESPN (actual order):
 *   MIN, PTS, FG, 3PT, FT, REB, AST, TO, STL, BLK, OREB, DREB, PF, +/-
 *   PTS = index 1, REB = index 5, AST = index 6
 */
function parseLeaders(boxscore) {
  if (!boxscore?.players) return [];

  const categories = [
    { category: 'Points', statIndex: 1, label: 'PTS' },
    { category: 'Rebounds', statIndex: 5, label: 'REB' },
    { category: 'Assists', statIndex: 6, label: 'AST' }
  ];

  const leaders = [];

  categories.forEach(({ category, statIndex, label }) => {
    const top = findTopPerformer(boxscore, statIndex, label);
    if (top) {
      leaders.push({
        category,
        leaders: [top]
      });
    }
  });

  return leaders;
}

/**
 * Parse linescores from header data.
 * Extracts quarter-by-quarter (or half + OT) scores for home and away teams.
 */
function parseLinescores(header) {
  if (!header?.competitions?.[0]?.competitors) return null;

  const competitors = header.competitions[0].competitors;
  const home = competitors.find(c => c.homeAway === 'home');
  const away = competitors.find(c => c.homeAway === 'away');

  if (!home || !away) return null;

  const extractScores = (competitor) => {
    const scores = (competitor.linescores || []).map(ls => parseInt(ls.displayValue) || 0);
    const total = parseInt(competitor.score) || scores.reduce((a, b) => a + b, 0);
    return {
      team: {
        abbreviation: competitor.team?.abbreviation || '',
        logo: competitor.team?.logo || ''
      },
      scores,
      total
    };
  };

  return {
    home: extractScores(home),
    away: extractScores(away)
  };
}

/**
 * Parse team stats from boxscore.
 * ESPN returns stats as an array of { name, displayValue, label } objects per team.
 * NBA key stats: FG%, 3PT%, FT%, rebounds, assists, turnovers, steals, blocks
 */
function parseTeamStats(boxscore) {
  if (!boxscore?.teams || boxscore.teams.length < 2) return null;

  const STAT_NAMES = [
    'fieldGoalPct', 'threePointFieldGoalPct', 'freeThrowPct',
    'totalRebounds', 'assists', 'turnovers', 'steals', 'blocks',
    'fieldGoalsMade-fieldGoalsAttempted',
    'threePointFieldGoalsMade-threePointFieldGoalsAttempted',
    'freeThrowsMade-freeThrowsAttempted',
    'fastBreakPoints', 'pointsInPaint', 'pointsOffTurnovers',
    'largestLead', 'totalTechnicalFouls'
  ];

  const STAT_LABELS = {
    'fieldGoalPct': 'FG%',
    'threePointFieldGoalPct': '3PT%',
    'freeThrowPct': 'FT%',
    'totalRebounds': 'Rebounds',
    'assists': 'Assists',
    'turnovers': 'Turnovers',
    'steals': 'Steals',
    'blocks': 'Blocks',
    'fieldGoalsMade-fieldGoalsAttempted': 'FG',
    'threePointFieldGoalsMade-threePointFieldGoalsAttempted': '3PT',
    'freeThrowsMade-freeThrowsAttempted': 'FT',
    'fastBreakPoints': 'Fast Break Pts',
    'pointsInPaint': 'Points in Paint',
    'pointsOffTurnovers': 'Pts off Turnovers',
    'largestLead': 'Largest Lead',
    'totalTechnicalFouls': 'Technical Fouls'
  };

  const extractStats = (teamData) => {
    if (!teamData?.statistics) return [];
    const statsMap = {};
    teamData.statistics.forEach(stat => {
      statsMap[stat.name] = stat.displayValue;
    });

    return STAT_NAMES
      .filter(name => statsMap[name] !== undefined)
      .map(name => ({
        label: STAT_LABELS[name] || name,
        value: statsMap[name]
      }));
  };

  return {
    home: extractStats(boxscore.teams[0]),
    away: extractStats(boxscore.teams[1])
  };
}

module.exports = createDailySportService({
  apiBase: API_BASE,
  sportName: 'NBA',
  parseGameDetails: parseNBAGameDetails,
  teamStatsConfig: [
    { key: 'avgPoints', label: 'PPG' },
    { key: 'avgRebounds', label: 'RPG' },
    { key: 'avgAssists', label: 'APG' },
    { key: 'fieldGoalPct', label: 'FG%' },
    { key: 'threePointPct', label: '3PT%' },
    { key: 'freeThrowPct', label: 'FT%' },
    { key: 'avgSteals', label: 'SPG' },
    { key: 'avgBlocks', label: 'BPG' },
    { key: 'avgTurnovers', label: 'TPG' },
    { key: 'avgOffensiveRebounds', label: 'ORPG' },
  ]
});
