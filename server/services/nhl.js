// NHL Data Service - ESPN API Integration
const createDailySportService = require('./daily-sport');
const { parseBoxscoreSeasonStats } = require('./espn');

const API_BASE = 'https://site.api.espn.com/apis/site/v2/sports/hockey/nhl';

/**
 * Parse ESPN summary response for NHL game details
 * Extracts leaders, linescores, scoring plays, and team stats
 */
function parseNHLGameDetails(data) {
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

  // --- Scoring Plays (normalize for frontend with periodLabel, team as string) ---
  const rawScoringPlays = parseScoringPlays(data.plays);
  const scoringPlays = rawScoringPlays ? rawScoringPlays.map(play => ({
    periodLabel: play.period ? `P${play.period}` : '',
    time: play.clock || '',
    team: play.team?.abbreviation || '',
    teamLogo: '',
    description: play.text || '',
    awayScore: play.awayScore,
    homeScore: play.homeScore,
  })) : null;

  // --- Team Stats (convert to keyed object for frontend) ---
  const rawTeamStats = parseTeamStats(boxscore);
  const teamStats = rawTeamStats ? {
    home: normalizeStatsToObject(rawTeamStats.home, NHL_STAT_KEY_MAP),
    away: normalizeStatsToObject(rawTeamStats.away, NHL_STAT_KEY_MAP),
  } : null;

  // --- Win probability ---
  let winProbability = null;
  if (data.predictor) {
    winProbability = {
      homeWinPct: data.predictor.homeTeam?.gameProjection || 50,
      awayWinPct: data.predictor.awayTeam?.gameProjection || 50,
    };
  }

  // --- Season averages from boxscore (streak, opp stats for upcoming games) ---
  const seasonAverages = parseBoxscoreSeasonStats(boxscore);

  // --- Player Stats (full box score) ---
  const playerStats = parsePlayerStats(boxscore);

  return { leaders, scoringPlays, linescores, teamStats, winProbability, seasonAverages, playerStats };
}

/**
 * Parse full player box score from boxscore data.
 * NHL ESPN stat groups: forwards, defenses, skaters (empty), goalies
 *
 * Forward/Defense stat labels (actual order from ESPN):
 *   BS, HT, TK, +/-, TOI, PPTOI, SHTOI, ESTOI, SHFT, G, YTDG, A, S, SM, SOG, FW, FL, FO%, GV, PN, PIM
 *
 * Goalie stat labels (actual order from ESPN):
 *   GA, SA, SOS, SOSA, SV, SV%, ESSV, PPSV, SHSV, TOI, YTDG, PIM
 */
function parsePlayerStats(boxscore) {
  if (!boxscore?.players || boxscore.players.length < 2) return null;

  const SKATER_COLUMNS = [
    { label: 'G',    idx: 9 },
    { label: 'A',    idx: 11 },
    { label: '+/-',  idx: 3 },
    { label: 'SOG',  idx: 14 },
    { label: 'HIT',  idx: 1 },
    { label: 'BLK',  idx: 0 },
    { label: 'PIM',  idx: 20 },
    { label: 'TOI',  idx: 4 },
    { label: 'FO%',  idx: 17 },
  ];

  const GOALIE_COLUMNS = [
    { label: 'SA',   idx: 1 },
    { label: 'GA',   idx: 0 },
    { label: 'SV',   idx: 4 },
    { label: 'SV%',  idx: 5 },
    { label: 'TOI',  idx: 9 },
    { label: 'PIM',  idx: 11 },
  ];

  const parseTeamPlayers = (teamPlayers) => {
    const team = {
      abbreviation: teamPlayers.team?.abbreviation || '',
      logo: teamPlayers.team?.logo || '',
    };
    const skaters = [];
    const goalies = [];

    teamPlayers.statistics?.forEach(statGroup => {
      if (statGroup.name === 'forwards' || statGroup.name === 'defenses') {
        statGroup.athletes?.forEach(athleteEntry => {
          const stats = athleteEntry.stats || [];
          // Skip players with no TOI
          if (!stats[4] || stats[4] === '0:00') return;

          skaters.push({
            name: athleteEntry.athlete?.displayName || 'Unknown',
            shortName: athleteEntry.athlete?.shortName || athleteEntry.athlete?.displayName || 'Unknown',
            position: athleteEntry.athlete?.position?.abbreviation || '',
            headshot: athleteEntry.athlete?.headshot?.href || null,
            isForward: statGroup.name === 'forwards',
            stats: SKATER_COLUMNS.map(col => stats[col.idx] || '-'),
          });
        });
      } else if (statGroup.name === 'goalies') {
        statGroup.athletes?.forEach(athleteEntry => {
          const stats = athleteEntry.stats || [];
          goalies.push({
            name: athleteEntry.athlete?.displayName || 'Unknown',
            shortName: athleteEntry.athlete?.shortName || athleteEntry.athlete?.displayName || 'Unknown',
            position: 'G',
            headshot: athleteEntry.athlete?.headshot?.href || null,
            stats: GOALIE_COLUMNS.map(col => stats[col.idx] || '-'),
          });
        });
      }
    });

    return { team, skaters, goalies };
  };

  return {
    type: 'hockey',
    skaterColumns: SKATER_COLUMNS.map(c => c.label),
    goalieColumns: GOALIE_COLUMNS.map(c => c.label),
    teams: boxscore.players.map(parseTeamPlayers),
  };
}

// Map ESPN stat labels to frontend stat keys
const NHL_STAT_KEY_MAP = {
  'SOG': 'shotsOnGoal',
  'PP Goals': 'powerPlayGoals',
  'PP Opportunities': 'powerPlayOpportunities',
  'PP%': 'powerPlays',
  'PIM': 'penaltyMinutes',
  'Faceoff %': 'faceoffPct',
  'Hits': 'hits',
  'Blocked Shots': 'blockedShots',
  'Takeaways': 'takeaways',
  'Giveaways': 'giveaways',
  'Shooting %': 'shootingPct',
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
 * Parse leaders from boxscore player data.
 * NHL ESPN stat groups: forwards, defenses, skaters (empty), goalies
 *
 * Forward/Defense stat labels (actual order from ESPN):
 *   BS, HT, TK, +/-, TOI, PPTOI, SHTOI, ESTOI, SHFT, G, YTDG, A, S, SM, SOG, FW, FL, FO%, GV, PN, PIM
 *   G = index 9, A = index 11, SOG = index 14, +/- = index 3
 *
 * Goalie stat labels (actual order from ESPN):
 *   GA, SA, SOS, SOSA, SV, SV%, ESSV, PPSV, SHSV, TOI, YTDG, PIM
 *   GA = index 0, SA = index 1, SV = index 4, SV% = index 5
 */
function parseLeaders(boxscore) {
  if (!boxscore?.players) return [];

  const leaders = [];

  // Find goal leader from forwards + defenses
  const goalLeader = findTopSkater(boxscore, 9, 'goals');
  if (goalLeader) {
    leaders.push({
      category: 'Goals',
      leaders: [goalLeader]
    });
  }

  // Find assist leader from forwards + defenses
  const assistLeader = findTopSkater(boxscore, 11, 'assists');
  if (assistLeader) {
    leaders.push({
      category: 'Assists',
      leaders: [assistLeader]
    });
  }

  // Find best goalie by saves
  const saveLeader = findBestGoalie(boxscore);
  if (saveLeader) {
    leaders.push({
      category: 'Saves',
      leaders: [saveLeader]
    });
  }

  return leaders;
}

/**
 * Find the top skater (forward or defenseman) by a given stat index.
 * Searches through 'forwards' and 'defenses' stat groups.
 * Stat indices: G=9, A=11, SOG=14, +/-=3
 */
function findTopSkater(boxscore, statIndex, statType) {
  if (!boxscore?.players) return null;

  let best = null;
  let bestValue = -1;

  boxscore.players.forEach(teamPlayers => {
    const teamAbbr = teamPlayers.team?.abbreviation;
    const teamLogo = teamPlayers.team?.logo;

    teamPlayers.statistics?.forEach(statGroup => {
      // Only search forwards and defenses (skaters group is typically empty)
      if (statGroup.name !== 'forwards' && statGroup.name !== 'defenses') return;

      statGroup.athletes?.forEach(athleteEntry => {
        const stats = athleteEntry.stats || [];
        const val = parseInt(stats[statIndex]) || 0;
        if (val > bestValue) {
          bestValue = val;

          // Build summary with: G (idx 9), A (idx 11), +/- (idx 3), SOG (idx 14)
          const goals = stats[9] || '0';
          const assists = stats[11] || '0';
          const plusMinus = stats[3] || '0';
          const sog = stats[14] || '0';
          const formattedValue = `${goals} G, ${assists} A, ${plusMinus} +/-, ${sog} SOG`;

          best = {
            displayName: athleteEntry.athlete?.displayName || 'Unknown',
            value: formattedValue,
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
 * Find the best goalie by saves.
 * Goalie stat labels from ESPN: GA, SA, SOS, SOSA, SV, SV%, ESSV, PPSV, SHSV, TOI, YTDG, PIM
 * SV (saves) = index 4, GA = index 0, SA = index 1, SV% = index 5
 */
function findBestGoalie(boxscore) {
  if (!boxscore?.players) return null;

  let best = null;
  let bestSaves = -1;

  boxscore.players.forEach(teamPlayers => {
    const teamAbbr = teamPlayers.team?.abbreviation;
    const teamLogo = teamPlayers.team?.logo;

    teamPlayers.statistics?.forEach(statGroup => {
      if (statGroup.name !== 'goalies') return;

      statGroup.athletes?.forEach(athleteEntry => {
        const stats = athleteEntry.stats || [];
        const saves = parseInt(stats[4]) || 0;
        if (saves > bestSaves) {
          bestSaves = saves;

          const goalsAgainst = stats[0] || '0';
          const shotsAgainst = stats[1] || '0';
          const savePct = stats[5] || '.000';
          const formattedValue = `${saves} SV, ${goalsAgainst} GA, ${savePct} SV%`;

          best = {
            displayName: athleteEntry.athlete?.displayName || 'Unknown',
            value: formattedValue,
            player: {
              name: athleteEntry.athlete?.displayName || 'Unknown',
              position: athleteEntry.athlete?.position?.abbreviation || 'G',
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
 * Parse linescores from header data.
 * NHL uses 3 periods + OT (+ possibly SO).
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
 * Parse scoring plays from ESPN plays array.
 * NHL scoring plays are in data.plays filtered by scoringPlay === true.
 * Each play includes goal scorer, assists, period, and clock.
 */
function parseScoringPlays(plays) {
  if (!plays || !Array.isArray(plays)) return null;

  const goals = plays.filter(p => p.scoringPlay);
  if (goals.length === 0) return null;

  return goals.map(play => ({
    period: play.period?.number || null,
    clock: play.clock?.displayValue || '',
    team: {
      id: play.team?.id,
      displayName: play.team?.displayName || '',
      abbreviation: play.team?.abbreviation || ''
    },
    text: play.text || '',
    awayScore: play.awayScore,
    homeScore: play.homeScore
  }));
}

/**
 * Parse team stats from boxscore.
 * NHL key stats: shots on goal (SOG), power play (PP), penalty minutes (PIM),
 * faceoff %, hits, blocked shots, giveaways, takeaways
 */
function parseTeamStats(boxscore) {
  if (!boxscore?.teams || boxscore.teams.length < 2) return null;

  const STAT_NAMES = [
    'blockedShots', 'hits', 'takeaways', 'giveaways',
    'powerPlayGoals', 'powerPlayOpportunities', 'powerPlayPct',
    'penaltyMinutes', 'faceOffWinPercentage',
    'shotsTotal', 'shootingPctg'
  ];

  const STAT_LABELS = {
    'blockedShots': 'Blocked Shots',
    'hits': 'Hits',
    'takeaways': 'Takeaways',
    'giveaways': 'Giveaways',
    'powerPlayGoals': 'PP Goals',
    'powerPlayOpportunities': 'PP Opportunities',
    'powerPlayPct': 'PP%',
    'penaltyMinutes': 'PIM',
    'faceOffWinPercentage': 'Faceoff %',
    'shotsTotal': 'SOG',
    'shootingPctg': 'Shooting %'
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

  const homeTeam = boxscore.teams.find(t => t.homeAway === 'home') || boxscore.teams[0];
  const awayTeam = boxscore.teams.find(t => t.homeAway === 'away') || boxscore.teams[1];
  return {
    home: extractStats(homeTeam),
    away: extractStats(awayTeam)
  };
}

module.exports = createDailySportService({
  apiBase: API_BASE,
  sportName: 'NHL',
  parseGameDetails: parseNHLGameDetails,
  teamStatsConfig: [
    { key: 'goals', label: 'GF' },
    { key: 'goalsAgainst', label: 'GA' },
    { key: 'avgGoalsAgainst', label: 'GA/G' },
    { key: 'savePct', label: 'SV%' },
    { key: 'saves', label: 'Saves' },
    { key: 'powerPlayGoals', label: 'PPG' },
    { key: 'faceoffPercent', label: 'FO%' },
    { key: 'shotsTotal', label: 'Shots' },
    { key: 'shootingPct', label: 'SH%' },
    { key: 'penaltyMinutes', label: 'PIM' },
  ]
});
