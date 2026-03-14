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

  // --- Player Stats (full box score) ---
  const playerStats = parsePlayerStats(boxscore);

  // --- Play-by-play data (for Gamecast / Shot Chart) ---
  const plays = parsePlays(data);

  return { leaders, scoringPlays, linescores, teamStats, winProbability, seasonAverages, playerStats, plays };
}

/**
 * Parse full player box score from boxscore data.
 * Basketball stat labels from ESPN (actual order):
 *   MIN, PTS, FG, 3PT, FT, REB, AST, TO, STL, BLK, OREB, DREB, PF, +/-
 * We select the most commonly displayed columns for a clean box score.
 */
function parsePlayerStats(boxscore) {
  if (!boxscore?.players || boxscore.players.length < 2) return null;

  const COLUMNS = [
    { label: 'MIN', idx: 0 },
    { label: 'PTS', idx: 1 },
    { label: 'REB', idx: 5 },
    { label: 'AST', idx: 6 },
    { label: 'FG',  idx: 2 },
    { label: '3PT', idx: 3 },
    { label: 'FT',  idx: 4 },
    { label: 'STL', idx: 8 },
    { label: 'BLK', idx: 9 },
    { label: 'TO',  idx: 7 },
    { label: '+/-', idx: 13 },
  ];

  const parseTeamPlayers = (teamPlayers) => {
    const team = {
      abbreviation: teamPlayers.team?.abbreviation || '',
      logo: teamPlayers.team?.logo || '',
    };
    const starters = [];
    const bench = [];

    teamPlayers.statistics?.forEach(statGroup => {
      statGroup.athletes?.forEach(athleteEntry => {
        const stats = athleteEntry.stats || [];
        // Skip players with no minutes (DNP)
        if (!stats[0] || stats[0] === '0' || stats[0] === '0:00') return;

        const player = {
          name: athleteEntry.athlete?.displayName || 'Unknown',
          shortName: athleteEntry.athlete?.shortName || athleteEntry.athlete?.displayName || 'Unknown',
          position: athleteEntry.athlete?.position?.abbreviation || '',
          headshot: athleteEntry.athlete?.headshot?.href || null,
          starter: athleteEntry.starter || false,
          stats: COLUMNS.map(col => stats[col.idx] || '-'),
        };

        if (player.starter) {
          starters.push(player);
        } else {
          bench.push(player);
        }
      });
    });

    return { team, starters, bench };
  };

  return {
    type: 'basketball',
    columns: COLUMNS.map(c => c.label),
    teams: boxscore.players.map(parseTeamPlayers),
  };
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
 * Find the top performer per team in a given stat from boxscore player data.
 * Returns an array with one leader per team (so both teams always have representation).
 */
function findTopPerformers(boxscore, statIndex, labels) {
  if (!boxscore?.players) return [];

  const results = [];

  boxscore.players.forEach(teamPlayers => {
    const teamAbbr = teamPlayers.team?.abbreviation;
    const teamLogo = teamPlayers.team?.logo;

    let best = null;
    let bestValue = -1;

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

    if (best) results.push(best);
  });

  return results;
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
    const tops = findTopPerformers(boxscore, statIndex, label);
    if (tops.length > 0) {
      leaders.push({
        category,
        leaders: tops
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

/**
 * Parse play-by-play data from ESPN summary response.
 * Used for Gamecast (live plays on court) and Shot Chart (all shots plotted).
 */
function parsePlays(data) {
  if (!data.plays || !Array.isArray(data.plays)) return [];

  // Build player lookup from boxscore (plays only have athlete IDs)
  const playerMap = {};
  const boxPlayers = data.boxscore?.players || [];
  for (const team of boxPlayers) {
    for (const statGroup of (team.statistics || [])) {
      for (const entry of (statGroup.athletes || [])) {
        const a = entry.athlete;
        if (a?.id) {
          playerMap[a.id] = {
            name: a.displayName || '',
            shortName: a.shortName || '',
            headshot: a.headshot?.href || null,
            jersey: a.jersey || null,
          };
        }
      }
    }
  }

  return data.plays.map(play => ({
    id: play.id,
    type: play.type?.text || '',
    typeId: play.type?.id || '',
    text: play.text || '',
    shortText: play.shortText || play.shortDescription || '',
    awayScore: play.awayScore,
    homeScore: play.homeScore,
    period: play.period ? {
      number: play.period.number || null,
      displayValue: play.period.displayValue || '',
    } : null,
    clock: play.clock ? {
      displayValue: play.clock.displayValue || '',
    } : null,
    scoringPlay: play.scoringPlay || false,
    scoreValue: play.scoreValue || 0,
    shootingPlay: play.shootingPlay || false,
    pointsAttempted: play.pointsAttempted || 0,
    team: play.team ? {
      id: play.team.id || null,
    } : null,
    coordinate: play.coordinate || null,
    wallclock: play.wallclock || null,
    participants: (play.participants || []).map(p => {
      const id = p.athlete?.id || null;
      const lookup = id ? playerMap[id] : null;
      return {
        name: lookup?.name || p.athlete?.displayName || '',
        shortName: lookup?.shortName || p.athlete?.shortName || '',
        headshot: lookup?.headshot || p.athlete?.headshot?.href || null,
        jersey: lookup?.jersey || p.athlete?.jersey || null,
        playerId: id,
      };
    }),
  }));
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
