// MLB Data Service - ESPN API Integration
const createDailySportService = require('./daily-sport');
const { parseBoxscoreSeasonStats } = require('./espn');

const API_BASE = 'https://site.api.espn.com/apis/site/v2/sports/baseball/mlb';

/**
 * Parse ESPN summary response for MLB game details
 * Extracts leaders, linescores, scoring plays, and team stats
 */
function parseMLBGameDetails(data) {
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

  // --- Scoring Plays (normalize for frontend) ---
  const rawScoringPlays = parseScoringPlays(data.plays);
  const scoringPlays = rawScoringPlays ? rawScoringPlays.map(play => ({
    periodLabel: play.period ? `Inn ${play.period}` : '',
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
    home: normalizeStatsToObject(rawTeamStats.home, MLB_STAT_KEY_MAP),
    away: normalizeStatsToObject(rawTeamStats.away, MLB_STAT_KEY_MAP),
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

  return { leaders, scoringPlays, linescores, teamStats, winProbability, seasonAverages };
}

// Map ESPN stat labels to frontend stat keys
const MLB_STAT_KEY_MAP = {
  'Hits': 'hits',
  'Runs': 'runs',
  'Errors': 'errors',
  'LOB': 'leftOnBase',
  'At Bats': 'atBats',
  'RBI': 'rbis',
  'HR': 'homeRuns',
  'SB': 'stolenBases',
  'K (Batting)': 'strikeouts',
  'AVG': 'battingAvg',
  'Earned Runs': 'earnedRuns',
  'K (Pitching)': 'pitchingStrikeouts',
  'ERA': 'era',
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
 * MLB has separate batting and pitching stat groups.
 * ESPN may not set statGroup.name, so we identify groups by their labels.
 *
 * Batting labels (actual order from ESPN):
 *   H-AB, AB, R, H, RBI, HR, BB, K, #P, AVG, OBP, SLG
 *   H = index 3, RBI = index 4, HR = index 5
 *
 * Pitching labels (actual order from ESPN):
 *   IP, H, R, ER, BB, K, HR, PC-ST, ERA, PC
 *   IP = index 0, ER = index 3, K = index 5
 */
function parseLeaders(boxscore) {
  if (!boxscore?.players) return [];

  const leaders = [];

  // Find best batter (most hits, then RBI as tiebreaker)
  const bestBatter = findBestMLBPlayer(boxscore, 'batting');
  if (bestBatter) {
    leaders.push({
      category: 'Batting',
      leaders: [bestBatter]
    });
  }

  // Find best pitcher (most strikeouts, pitching category)
  const bestPitcher = findBestMLBPlayer(boxscore, 'pitching');
  if (bestPitcher) {
    leaders.push({
      category: 'Pitching',
      leaders: [bestPitcher]
    });
  }

  return leaders;
}

/**
 * Identify whether a stat group is batting or pitching by checking its labels.
 * Batting groups contain 'AB' or 'RBI' labels.
 * Pitching groups contain 'IP' or 'ERA' labels.
 */
function identifyStatGroup(statGroup) {
  const labels = statGroup.labels || [];
  // Check the explicit name first
  if (statGroup.name === 'batting') return 'batting';
  if (statGroup.name === 'pitching') return 'pitching';
  // Fall back to label detection
  if (labels.includes('AB') || labels.includes('RBI') || labels.includes('H-AB')) return 'batting';
  if (labels.includes('IP') || labels.includes('ERA')) return 'pitching';
  // Last resort: if first stat group for a team, it's usually batting
  return null;
}

/**
 * Find the best MLB player in a given stat category.
 * Identifies stat groups by their labels since ESPN may not set statGroup.name.
 * For batting: looks for most hits (index 3), with RBI (index 4) as tiebreaker
 * For pitching: looks for most strikeouts (index 5), with fewest ER (index 3) as tiebreaker
 */
function findBestMLBPlayer(boxscore, categoryName) {
  if (!boxscore?.players) return null;

  let best = null;
  let bestPrimary = -1;
  let bestSecondary = -1;

  const isBatting = categoryName === 'batting';
  // Batting: H = index 3, RBI = index 4
  // Pitching: K = index 5, ER = index 3
  const primaryIdx = isBatting ? 3 : 5;
  const secondaryIdx = isBatting ? 4 : 3;

  boxscore.players.forEach(teamPlayers => {
    const teamAbbr = teamPlayers.team?.abbreviation;
    const teamLogo = teamPlayers.team?.logo;

    teamPlayers.statistics?.forEach(statGroup => {
      const groupType = identifyStatGroup(statGroup);
      if (groupType !== categoryName) return;

      statGroup.athletes?.forEach(athleteEntry => {
        const stats = athleteEntry.stats || [];
        const primary = parseInt(stats[primaryIdx]) || 0;
        // For pitching, lower ER is better, so negate for comparison
        const secondary = isBatting
          ? (parseInt(stats[secondaryIdx]) || 0)
          : -(parseInt(stats[secondaryIdx]) || 0);

        if (primary > bestPrimary || (primary === bestPrimary && secondary > bestSecondary)) {
          bestPrimary = primary;
          bestSecondary = secondary;

          let formattedValue;
          if (isBatting) {
            // H-AB (idx 0), AB (idx 1), R (idx 2), H (idx 3), RBI (idx 4), HR (idx 5)
            const hAb = stats[0] || '0-0';
            const rbi = stats[4] || '0';
            const hr = stats[5] || '0';
            formattedValue = `${hAb}, ${rbi} RBI, ${hr} HR`;
          } else {
            // IP (idx 0), ER (idx 3), K (idx 5)
            const ip = stats[0] || '0';
            const er = stats[3] || '0';
            const k = stats[5] || '0';
            formattedValue = `${ip} IP, ${k} K, ${er} ER`;
          }

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
 * Parse linescores from header data.
 * MLB uses inning-by-inning scoring.
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
 * MLB scoring plays are in data.plays filtered by scoringPlay === true.
 */
function parseScoringPlays(plays) {
  if (!plays || !Array.isArray(plays)) return null;

  const scoringPlays = plays.filter(p => p.scoringPlay);
  if (scoringPlays.length === 0) return null;

  return scoringPlays.map(play => ({
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
 * MLB key stats: hits, runs, errors, LOB (left on base)
 */
function parseTeamStats(boxscore) {
  if (!boxscore?.teams || boxscore.teams.length < 2) return null;

  const STAT_NAMES = [
    'hits', 'runs', 'errors', 'leftOnBase',
    'atBats', 'RBIs', 'homeRuns', 'stolenBases',
    'strikeouts', 'walks', 'avg',
    'earnedRuns', 'hitsAllowed', 'strikeoutsThrown',
    'walksAllowed', 'ERA'
  ];

  const STAT_LABELS = {
    'hits': 'Hits',
    'runs': 'Runs',
    'errors': 'Errors',
    'leftOnBase': 'LOB',
    'atBats': 'At Bats',
    'RBIs': 'RBI',
    'homeRuns': 'HR',
    'stolenBases': 'SB',
    'strikeouts': 'K (Batting)',
    'walks': 'BB (Batting)',
    'avg': 'AVG',
    'earnedRuns': 'Earned Runs',
    'hitsAllowed': 'Hits Allowed',
    'strikeoutsThrown': 'K (Pitching)',
    'walksAllowed': 'BB (Pitching)',
    'ERA': 'ERA'
  };

  const extractStats = (teamData) => {
    if (!Array.isArray(teamData?.statistics)) return [];

    const groupMap = {};
    teamData.statistics.forEach((group) => {
      if (!group?.name || !Array.isArray(group.stats)) return;
      const statMap = {};
      group.stats.forEach((s) => {
        if (!s?.name) return;
        statMap[s.name] = s.displayValue;
      });
      groupMap[group.name] = statMap;
    });

    const batting = groupMap.batting || {};
    const pitching = groupMap.pitching || {};
    const fielding = groupMap.fielding || {};

    // ESPN MLB team stats are grouped; build the flattened keys expected by frontend.
    const flattenedStats = {
      hits: batting.hits,
      runs: batting.runs,
      errors: fielding.errors,
      leftOnBase: batting.runnersLeftOnBase,
      atBats: batting.atBats,
      RBIs: batting.RBIs,
      homeRuns: batting.homeRuns,
      stolenBases: batting.stolenBases,
      strikeouts: batting.strikeouts,
      walks: batting.walks,
      avg: batting.avg,
      earnedRuns: pitching.earnedRuns,
      hitsAllowed: pitching.hits,
      strikeoutsThrown: pitching.strikeouts,
      walksAllowed: pitching.walks,
      ERA: pitching.ERA,
    };

    return STAT_NAMES
      .filter((name) => flattenedStats[name] !== undefined && flattenedStats[name] !== null)
      .map((name) => ({
        label: STAT_LABELS[name] || name,
        value: flattenedStats[name]
      }));
  };

  return {
    home: extractStats(boxscore.teams[0]),
    away: extractStats(boxscore.teams[1])
  };
}

module.exports = createDailySportService({
  apiBase: API_BASE,
  sportName: 'MLB',
  parseGameDetails: parseMLBGameDetails,
  teamStatsConfig: [
    { key: 'avg', label: 'AVG' },
    { key: 'homeRuns', label: 'HR' },
    { key: 'runs', label: 'Runs' },
    { key: 'RBIs', label: 'RBI' },
    { key: 'stolenBases', label: 'SB' },
    { key: 'onBasePct', label: 'OBP' },
    { key: 'slugAvg', label: 'SLG' },
    { key: 'ERA', label: 'ERA' },
    { key: 'WHIP', label: 'WHIP' },
    { key: 'saves', label: 'SV' },
    { key: 'strikeoutsPerNineInnings', label: 'K/9' },
    { key: 'fieldingPct', label: 'FPCT' },
  ]
});
