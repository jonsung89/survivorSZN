// NCAA Tournament (March Madness) Data Service
// Fetches bracket structure, team breakdowns, and live results from ESPN API

const { fetchWithCache } = require('./espn');
const { SEED_MATCHUPS, REGIONS, getSlotRound, ROUND_BOUNDARIES } = require('../utils/bracket-slots');

const API_BASE = 'https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball';
const ATHLETE_API_BASE = 'https://site.web.api.espn.com/apis/common/v3/sports/basketball/mens-college-basketball/athletes';
const TOURNAMENT_CACHE_TTL = 10 * 60 * 1000; // 10 minutes
const TEAM_CACHE_TTL = 60 * 60 * 1000; // 1 hour
const ROSTER_CACHE_TTL = 6 * 60 * 60 * 1000; // 6 hours
const PLAYER_STATS_CACHE_TTL = 6 * 60 * 60 * 1000; // 6 hours

// Region name variants ESPN uses in notes
const REGION_ALIASES = {
  'east': 'East', 'west': 'West', 'south': 'South', 'midwest': 'Midwest',
  'east region': 'East', 'west region': 'West', 'south region': 'South', 'midwest region': 'Midwest',
};

const ROUND_MAP = {
  '1st round': 0, 'first round': 0, 'round of 64': 0,
  '2nd round': 1, 'second round': 1, 'round of 32': 1,
  'sweet 16': 2, 'sweet sixteen': 2,
  'elite 8': 3, 'elite eight': 3,
  'final four': 4, 'national semifinal': 4, 'national semifinals': 4,
  'championship': 5, 'national championship': 5,
};

/**
 * Fetch all NCAA tournament games from ESPN scoreboard
 */
async function fetchTournamentGames(season) {
  // Tournament spans mid-March to early April
  // Fetch with groups=100 (NCAA tournament) and seasontype=3 (postseason)
  const url = `${API_BASE}/scoreboard?groups=100&seasontype=3&dates=${season}0301-${season}0415&limit=500`;
  const data = await fetchWithCache(url, TOURNAMENT_CACHE_TTL);
  return data?.events || [];
}

/**
 * Parse region and round from ESPN event notes
 */
function parseRegionAndRound(event) {
  let region = null;
  let round = null;

  const notes = event.competitions?.[0]?.notes || [];
  for (const note of notes) {
    const headline = (note.headline || '').toLowerCase();

    // Parse region
    for (const [alias, regionName] of Object.entries(REGION_ALIASES)) {
      if (headline.includes(alias)) {
        region = regionName;
        break;
      }
    }

    // Parse round
    for (const [roundStr, roundNum] of Object.entries(ROUND_MAP)) {
      if (headline.includes(roundStr)) {
        round = roundNum;
        break;
      }
    }
  }

  return { region, round };
}

/**
 * Build the full 64-team tournament bracket from ESPN data
 */
async function getTournamentBracket(season) {
  const events = await fetchTournamentGames(season);

  if (!events.length) {
    return { teams: {}, slots: {}, regions: {}, events: {}, available: false };
  }

  const teams = {};
  const slots = {};
  const eventMap = {};
  const regionGames = { East: [], West: [], South: [], Midwest: [] };

  for (const event of events) {
    const { region, round } = parseRegionAndRound(event);
    const competition = event.competitions?.[0];
    if (!competition) continue;

    const competitors = competition.competitors || [];
    const teamData = competitors.map(c => {
      const team = c.team || {};
      const seed = c.curatedRank?.current;
      const record = c.records?.[0]?.summary || '';

      const teamObj = {
        id: String(team.id),
        name: team.displayName || team.name || '',
        abbreviation: team.abbreviation || '',
        shortName: team.shortDisplayName || team.abbreviation || '',
        logo: team.logo || '',
        color: team.color ? `#${team.color}` : '#666',
        seed: seed && seed < 99 ? seed : null,
        record,
        score: c.score ? parseInt(c.score) : null,
        winner: c.winner || false,
        homeAway: c.homeAway,
      };

      teams[teamObj.id] = teamObj;
      return teamObj;
    });

    const gameInfo = {
      espnEventId: event.id,
      region,
      round,
      team1: teamData[0] || null,
      team2: teamData[1] || null,
      status: competition.status?.type?.name || 'STATUS_SCHEDULED',
      statusDetail: competition.status?.type?.detail || '',
      startDate: event.date,
      venue: competition.venue?.fullName || '',
      broadcast: competition.broadcasts?.[0]?.names?.[0] || '',
    };

    eventMap[event.id] = gameInfo;

    // For R64 games, we can determine the slot from region + seeds
    if (round === 0 && region && regionGames[region]) {
      regionGames[region].push(gameInfo);
    }
  }

  // Map R64 games to slots using seed matchups
  for (const [regionIdx, regionName] of REGIONS.entries()) {
    const games = regionGames[regionName];
    const slotBase = regionIdx * 8 + 1; // East: 1-8, West: 9-16, South: 17-24, Midwest: 25-32

    for (const game of games) {
      const seeds = [game.team1?.seed, game.team2?.seed].sort((a, b) => (a || 99) - (b || 99));

      // Find which seed matchup this game is
      const matchupIdx = SEED_MATCHUPS.findIndex(([s1, s2]) =>
        (seeds[0] === s1 && seeds[1] === s2) || (seeds[0] === s2 && seeds[1] === s1)
      );

      if (matchupIdx >= 0) {
        const slotNum = slotBase + matchupIdx;
        // Ensure team1 is the higher seed (lower number)
        const [highSeed, lowSeed] = game.team1?.seed <= game.team2?.seed
          ? [game.team1, game.team2]
          : [game.team2, game.team1];

        slots[slotNum] = {
          team1: highSeed,
          team2: lowSeed,
          espnEventId: game.espnEventId,
          status: game.status,
          startDate: game.startDate,
          broadcast: game.broadcast,
          venue: game.venue,
        };
      }
    }
  }

  // Map later-round games using espn event data
  for (const [eventId, game] of Object.entries(eventMap)) {
    if (game.round === null || game.round === 0) continue;

    // For rounds > 0, find the correct slot by region and round
    const rb = ROUND_BOUNDARIES[game.round];
    if (!rb) continue;

    if (game.round <= 3 && game.region) {
      // Regional rounds (R32 through E8)
      const regionIdx = REGIONS.indexOf(game.region);
      if (regionIdx < 0) continue;
      const regionSlotBase = rb.start + regionIdx * rb.gamesPerRegion;

      // Try to find slot by matching seeds/teams against the bracket structure
      // For now, assign sequentially within the region for this round
      for (let i = 0; i < rb.gamesPerRegion; i++) {
        const slotNum = regionSlotBase + i;
        if (!slots[slotNum]) {
          slots[slotNum] = {
            team1: game.team1,
            team2: game.team2,
            espnEventId: game.espnEventId,
            status: game.status,
            startDate: game.startDate,
            broadcast: game.broadcast,
            venue: game.venue,
          };
          break;
        }
      }
    } else if (game.round === 4) {
      // Final Four
      for (let s = 61; s <= 62; s++) {
        if (!slots[s]) {
          slots[s] = {
            team1: game.team1,
            team2: game.team2,
            espnEventId: game.espnEventId,
            status: game.status,
            startDate: game.startDate,
            broadcast: game.broadcast,
          };
          break;
        }
      }
    } else if (game.round === 5) {
      // Championship
      slots[63] = {
        team1: game.team1,
        team2: game.team2,
        espnEventId: game.espnEventId,
        status: game.status,
        startDate: game.startDate,
        broadcast: game.broadcast,
      };
    }
  }

  return { teams, slots, regions: REGIONS, events: eventMap, available: true };
}

/**
 * Get comprehensive team breakdown for the matchup detail dialog
 */
async function getTeamBreakdown(teamId, season) {
  const [teamInfo, stats, schedule, roster, news] = await Promise.allSettled([
    fetchWithCache(`${API_BASE}/teams/${teamId}`, TEAM_CACHE_TTL),
    fetchWithCache(`${API_BASE}/teams/${teamId}/statistics?season=${season}`, TEAM_CACHE_TTL),
    fetchWithCache(`${API_BASE}/teams/${teamId}/schedule?season=${season}`, TEAM_CACHE_TTL),
    fetchWithCache(`${API_BASE}/teams/${teamId}/roster`, ROSTER_CACHE_TTL),
    fetchWithCache(`${API_BASE}/news?team=${teamId}`, TEAM_CACHE_TTL),
  ]);

  const team = teamInfo.status === 'fulfilled' ? teamInfo.value?.team : null;
  const statsData = stats.status === 'fulfilled' ? stats.value : null;
  const scheduleData = schedule.status === 'fulfilled' ? schedule.value : null;
  const rosterData = roster.status === 'fulfilled' ? roster.value : null;
  const newsData = news.status === 'fulfilled' ? news.value : null;

  // Parse basic team info
  const basic = {
    id: String(teamId),
    name: team?.displayName || '',
    abbreviation: team?.abbreviation || '',
    logo: team?.logos?.[0]?.href || '',
    color: team?.color ? `#${team.color}` : '#666',
    record: team?.record?.items?.[0]?.summary || '',
    conference: extractConference(team?.standingSummary) || '',
    coach: parseCoachName(rosterData),
    location: team?.location || '',
    rank: team?.rank || null,
  };

  // Parse season statistics with rankings
  const seasonStats = parseTeamStatistics(statsData);

  // Enrich stats from record data (has avgPointsAgainst, etc.)
  const recordStats = team?.record?.items?.[0]?.stats || [];
  for (const rs of recordStats) {
    if (rs.name && rs.value !== undefined && !seasonStats[rs.name]) {
      seasonStats[rs.name] = { value: String(Number(rs.value).toFixed(1)), rank: null };
    }
  }

  // Parse schedule for last 5 and vs Top 25
  const { last5, vsTop25, fullSchedule } = parseTeamSchedule(scheduleData, teamId);

  // Parse key players from roster, then enrich with per-player stats
  const rawPlayers = parseKeyPlayers(rosterData, statsData);
  const keyPlayers = await enrichPlayersWithStats(rawPlayers, 5);

  // Parse news headlines
  const headlines = parseNews(newsData);

  // Generate stats-based summary
  const summary = generateTeamSummary(basic, seasonStats);

  return {
    ...basic,
    seasonStats,
    last5,
    vsTop25,
    keyPlayers,
    headlines,
    summary,
    fullSchedule,
  };
}

function extractScore(score) {
  if (score == null) return 0;
  if (typeof score === 'object') return parseInt(score.displayValue || score.value) || 0;
  return parseInt(score) || 0;
}

function parseCoachName(rosterData) {
  const coaches = rosterData?.coach || [];
  if (coaches.length > 0) {
    const c = coaches[0];
    return `${c.firstName || ''} ${c.lastName || ''}`.trim();
  }
  return '';
}

function extractConference(standingSummary) {
  if (!standingSummary) return null;
  // Format: "1st in ACC" or "3rd in Big 12"
  const match = standingSummary.match(/in\s+(.+)$/);
  return match ? match[1] : null;
}

function parseTeamStatistics(statsData) {
  const result = {};
  const categories = statsData?.results?.stats?.categories || statsData?.statistics?.splits?.categories || [];

  // Try the direct statistics path first
  const directStats = statsData?.statistics || [];

  if (Array.isArray(directStats) && directStats.length > 0) {
    for (const stat of directStats) {
      if (stat.name && stat.displayValue !== undefined) {
        result[stat.name] = {
          value: stat.displayValue,
          rank: stat.rankDisplayValue || stat.rank || null,
        };
      }
    }
    return result;
  }

  // Fall back to categories structure
  for (const category of categories) {
    const stats = category.stats || [];
    for (const stat of stats) {
      if (stat.name && stat.displayValue !== undefined) {
        result[stat.name] = {
          value: stat.displayValue,
          rank: stat.rankDisplayValue || stat.rank || null,
        };
      }
    }
  }

  return result;
}

function parseTeamSchedule(scheduleData, teamId) {
  const events = scheduleData?.events || [];
  const last5 = [];
  const vsTop25 = [];
  const fullSchedule = [];

  // Sort by date descending to get most recent
  const sorted = [...events]
    .filter(e => {
      const status = e.competitions?.[0]?.status?.type?.name;
      return status === 'STATUS_FINAL';
    })
    .sort((a, b) => new Date(b.date) - new Date(a.date));

  for (const event of sorted) {
    const comp = event.competitions?.[0];
    if (!comp) continue;

    const competitors = comp.competitors || [];
    const us = competitors.find(c => String(c.id) === String(teamId) || String(c.team?.id) === String(teamId));
    const them = competitors.find(c => String(c.id) !== String(teamId) && String(c.team?.id) !== String(teamId));
    if (!us || !them) continue;

    const gameEntry = {
      date: event.date,
      opponent: {
        id: String(them.team?.id || them.id),
        name: them.team?.displayName || them.team?.name || '',
        abbreviation: them.team?.abbreviation || '',
        logo: them.team?.logo || them.team?.logos?.[0]?.href || '',
        record: them.records?.[0]?.summary || '',
        rank: them.curatedRank?.current < 99 ? them.curatedRank?.current : null,
      },
      atVs: us.homeAway === 'home' ? 'vs' : '@',
      result: us.winner ? 'W' : 'L',
      score: `${extractScore(us.score)}-${extractScore(them.score)}`,
      ourScore: extractScore(us.score),
      theirScore: extractScore(them.score),
    };

    fullSchedule.push(gameEntry);

    if (last5.length < 5) {
      last5.push(gameEntry);
    }

    if (gameEntry.opponent.rank && gameEntry.opponent.rank <= 25) {
      vsTop25.push(gameEntry);
    }
  }

  const vsTop25Record = {
    wins: vsTop25.filter(g => g.result === 'W').length,
    losses: vsTop25.filter(g => g.result === 'L').length,
    games: vsTop25,
  };

  return { last5, vsTop25: vsTop25Record, fullSchedule };
}

function parseKeyPlayers(rosterData, statsData) {
  const athletes = rosterData?.athletes || [];
  const players = [];

  for (const athlete of athletes) {
    if (!athlete) continue;
    players.push({
      id: String(athlete.id || ''),
      name: athlete.displayName || athlete.fullName || '',
      shortName: athlete.shortName || athlete.displayName || '',
      position: athlete.position?.abbreviation || '',
      jersey: athlete.jersey || '',
      headshot: athlete.headshot?.href || null,
      height: athlete.displayHeight || '',
      weight: athlete.displayWeight || '',
      year: athlete.experience?.displayValue || '',
      stats: athlete.statistics || null,
    });
  }

  return players.slice(0, 10);
}

/**
 * Fetch per-player season averages from ESPN athlete overview endpoint.
 * Fetches top N players in parallel, then sorts by PPG descending.
 */
async function enrichPlayersWithStats(players, maxPlayers = 5) {
  const toFetch = players.slice(0, maxPlayers).filter(p => p.id);

  const results = await Promise.allSettled(
    toFetch.map(p =>
      fetchWithCache(`${ATHLETE_API_BASE}/${p.id}/overview`, PLAYER_STATS_CACHE_TTL)
    )
  );

  for (let i = 0; i < toFetch.length; i++) {
    if (results[i].status !== 'fulfilled') continue;
    const data = results[i].value;
    const statsObj = data?.statistics;
    if (!statsObj?.names || !statsObj?.splits?.[0]?.stats) continue;

    const names = statsObj.names;
    const labels = statsObj.labels || [];
    const values = statsObj.splits[0].stats;

    // Build a clean stats map: { ppg: '22.7', rpg: '10.2', ... }
    const parsed = {};
    for (let j = 0; j < names.length; j++) {
      const name = names[j];
      const val = values[j];
      const label = labels[j] || '';
      if (name === 'avgPoints') parsed.ppg = val;
      else if (name === 'avgRebounds') parsed.rpg = val;
      else if (name === 'avgAssists') parsed.apg = val;
      else if (name === 'avgMinutes') parsed.mpg = val;
      else if (name === 'fieldGoalPct') parsed.fgPct = val;
      else if (name === 'threePointFieldGoalPct') parsed.threePct = val;
      else if (name === 'freeThrowPct') parsed.ftPct = val;
      else if (name === 'avgSteals') parsed.spg = val;
      else if (name === 'avgBlocks') parsed.bpg = val;
      else if (name === 'avgTurnovers') parsed.tpg = val;
      else if (name === 'gamesPlayed') parsed.gp = val;
      else if (name === 'avgFouls') parsed.fpg = val;
    }
    toFetch[i].stats = parsed;
  }

  // Sort by PPG descending (players with stats first, then those without)
  const enriched = players.map(p => {
    const match = toFetch.find(t => t.id === p.id);
    return match || p;
  });

  enriched.sort((a, b) => {
    const aPpg = parseFloat(a.stats?.ppg) || 0;
    const bPpg = parseFloat(b.stats?.ppg) || 0;
    return bPpg - aPpg;
  });

  return enriched;
}

function parseNews(newsData) {
  const articles = newsData?.articles || [];
  return articles.slice(0, 3).map(article => ({
    headline: article.headline || '',
    description: article.description || '',
    published: article.published || '',
    link: article.links?.web?.href || '',
    image: article.images?.[0]?.url || null,
  }));
}

function generateTeamSummary(basic, seasonStats) {
  const parts = [];

  const ppg = parseFloat(seasonStats?.avgPoints?.value || seasonStats?.points?.value);
  const oppPpg = parseFloat(seasonStats?.avgPointsAgainst?.value || seasonStats?.pointsAgainst?.value);
  const fgPct = parseFloat(seasonStats?.fieldGoalPct?.value);
  const threePct = parseFloat(seasonStats?.threePointFieldGoalPct?.value);
  const rpg = parseFloat(seasonStats?.avgRebounds?.value || seasonStats?.rebounds?.value);
  const apg = parseFloat(seasonStats?.avgAssists?.value || seasonStats?.assists?.value);
  const tpg = parseFloat(seasonStats?.avgTurnovers?.value || seasonStats?.turnovers?.value);

  // Offense description
  if (ppg) {
    const offenseLevel = ppg >= 80 ? 'high-scoring' : ppg >= 72 ? 'balanced' : 'defensive-minded';
    const ppgRank = seasonStats?.avgPoints?.rank || seasonStats?.points?.rank;
    parts.push(`${basic.name} is a ${offenseLevel} team averaging ${ppg.toFixed(1)} PPG${ppgRank ? ` (#${ppgRank} nationally)` : ''}.`);
  }

  // Shooting
  if (threePct && fgPct) {
    const shootingStyle = threePct >= 36 ? 'rely heavily on the three-ball' :
      threePct >= 33 ? 'shoot a respectable clip from deep' : 'prefer to work the ball inside';
    parts.push(`They ${shootingStyle} (${threePct.toFixed(1)}% 3PT, ${fgPct.toFixed(1)}% FG).`);
  }

  // Defense
  if (oppPpg) {
    const defLevel = oppPpg <= 62 ? 'elite defense' : oppPpg <= 68 ? 'strong defense' : oppPpg <= 73 ? 'average defense' : 'porous defense';
    const oppRank = seasonStats?.avgPointsAgainst?.rank || seasonStats?.pointsAgainst?.rank;
    parts.push(`On the other end, they feature ${defLevel}, allowing ${oppPpg.toFixed(1)} PPG${oppRank ? ` (#${oppRank})` : ''}.`);
  }

  // Ball movement & rebounding
  const extras = [];
  if (rpg) extras.push(`${rpg.toFixed(1)} RPG`);
  if (apg) extras.push(`${apg.toFixed(1)} APG`);
  if (tpg) extras.push(`${tpg.toFixed(1)} turnovers per game`);
  if (extras.length) {
    parts.push(`They average ${extras.join(', ')}.`);
  }

  return parts.join(' ');
}

/**
 * Get win probability for a matchup from ESPN predictor
 */
async function getMatchupPrediction(eventId) {
  if (!eventId) return null;
  try {
    const url = `https://site.web.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/summary?event=${eventId}`;
    const data = await fetchWithCache(url, TOURNAMENT_CACHE_TTL);
    if (data?.predictor) {
      return {
        homeWinPct: data.predictor.homeTeam?.gameProjection || 50,
        awayWinPct: data.predictor.awayTeam?.gameProjection || 50,
      };
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Get current results for all tournament games (for live scoring)
 */
async function getTournamentResults(season) {
  const events = await fetchTournamentGames(season);
  const results = {};

  for (const event of events) {
    const comp = event.competitions?.[0];
    if (!comp) continue;

    const status = comp.status?.type?.name;
    const competitors = comp.competitors || [];

    let winningTeamId = null;
    let losingTeamId = null;
    let winningScore = null;
    let losingScore = null;

    if (status === 'STATUS_FINAL') {
      const winner = competitors.find(c => c.winner);
      const loser = competitors.find(c => !c.winner);
      winningTeamId = winner ? String(winner.team?.id) : null;
      losingTeamId = loser ? String(loser.team?.id) : null;
      winningScore = winner ? parseInt(winner.score) : null;
      losingScore = loser ? parseInt(loser.score) : null;
    }

    results[event.id] = {
      espnEventId: event.id,
      status: status === 'STATUS_FINAL' ? 'final'
        : status === 'STATUS_IN_PROGRESS' ? 'in_progress'
        : 'pending',
      winningTeamId,
      losingTeamId,
      winningScore,
      losingScore,
      competitors: competitors.map(c => ({
        teamId: String(c.team?.id),
        score: parseInt(c.score) || 0,
        homeAway: c.homeAway,
      })),
    };
  }

  return results;
}

/**
 * Get Selection Sunday date from ESPN standings API.
 * The postseason type's startDate is always First Four Tuesday;
 * Selection Sunday is 2 days before that.
 * Show time is hardcoded to 6 PM ET (CBS tradition).
 */
async function getSelectionSundayDate(season) {
  const STANDINGS_CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours — date won't change mid-season
  const url = `https://site.web.api.espn.com/apis/v2/sports/basketball/mens-college-basketball/standings?season=${season}`;

  try {
    const data = await fetchWithCache(url, STANDINGS_CACHE_TTL);
    const currentSeason = (data.seasons || []).find(s => s.year === season);
    if (!currentSeason) return null;

    const postseason = (currentSeason.types || []).find(t => String(t.id) === '3');
    if (!postseason?.startDate) return null;

    // startDate is First Four Tuesday — Selection Sunday is 2 days before
    const firstFour = new Date(postseason.startDate);
    const selectionSunday = new Date(firstFour);
    selectionSunday.setDate(selectionSunday.getDate() - 2);

    // Set to 6 PM ET (Selection Show broadcast time on CBS)
    // We return an ISO string with the date + fixed 6 PM ET time
    const year = selectionSunday.getUTCFullYear();
    const month = String(selectionSunday.getUTCMonth() + 1).padStart(2, '0');
    const day = String(selectionSunday.getUTCDate()).padStart(2, '0');

    return {
      date: `${year}-${month}-${day}`,
      // 6 PM ET = 23:00 UTC (EST) or 22:00 UTC (EDT, which is March)
      // March is EDT so offset is -04:00
      dateTime: `${year}-${month}-${day}T18:00:00-04:00`,
      source: 'espn',
    };
  } catch (err) {
    console.error('Failed to fetch Selection Sunday date from ESPN:', err.message);
    return null;
  }
}

module.exports = {
  getTournamentBracket,
  getTeamBreakdown,
  getMatchupPrediction,
  getTournamentResults,
  fetchTournamentGames,
  getSelectionSundayDate,
};
