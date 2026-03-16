// NCAA Tournament (March Madness) Data Service
// Fetches bracket structure, team breakdowns, and live results from ESPN API

const { fetchWithCache } = require('./espn');
const { SEED_MATCHUPS, getSlotRound, ROUND_BOUNDARIES } = require('../utils/bracket-slots');
const Anthropic = require('@anthropic-ai/sdk');
const { db } = require('../db/supabase');

const API_BASE = 'https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball';
const BPI_API_BASE = 'https://sports.core.api.espn.com/v2/sports/basketball/leagues/mens-college-basketball';
const ATHLETE_API_BASE = 'https://site.web.api.espn.com/apis/common/v3/sports/basketball/mens-college-basketball/athletes';
const TOURNAMENT_CACHE_TTL = 10 * 60 * 1000; // 10 minutes
const TEAM_CACHE_TTL = 60 * 60 * 1000; // 1 hour
const ROSTER_CACHE_TTL = 6 * 60 * 60 * 1000; // 6 hours
const PLAYER_STATS_CACHE_TTL = 6 * 60 * 60 * 1000; // 6 hours
const BPI_CACHE_TTL = 6 * 60 * 60 * 1000; // 6 hours
const AI_REPORT_CACHE_TTL = 12 * 60 * 60 * 1000; // 12 hours

// In-memory cache for AI reports (separate from ESPN fetch cache)
const aiReportCache = new Map();

// Top-level cache for full team breakdowns (serves all users from single fetch+AI call)
const BREAKDOWN_CACHE_TTL = 2 * 60 * 60 * 1000; // 2 hours
const breakdownCache = new Map();

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

// Sorted by key length descending so "midwest" matches before "west", etc.
const SORTED_REGION_ALIASES = Object.entries(REGION_ALIASES)
  .sort((a, b) => b[0].length - a[0].length);

/**
 * Parse region and round from ESPN event notes
 */
function parseRegionAndRound(event) {
  let region = null;
  let round = null;

  const notes = event.competitions?.[0]?.notes || [];
  for (const note of notes) {
    const headline = (note.headline || '').toLowerCase();

    // Parse region (check longer aliases first to avoid "west" matching "midwest")
    for (const [alias, regionName] of SORTED_REGION_ALIASES) {
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
 * Determine correct region order based on Final Four pairings.
 * The bracket structure requires: regions[0] vs regions[1] in FF slot 61,
 * regions[2] vs regions[3] in FF slot 62. We infer pairings from ESPN
 * FF game data by mapping teams back to their region.
 */
function orderRegionsByFFPairings(regionOrder, eventMap) {
  if (regionOrder.length !== 4) return regionOrder;

  // Build team → region map from all regional games (rounds 0-3)
  const teamRegion = {};
  for (const game of Object.values(eventMap)) {
    if (game.region && game.round !== null && game.round <= 3) {
      if (game.team1?.id) teamRegion[game.team1.id] = game.region;
      if (game.team2?.id) teamRegion[game.team2.id] = game.region;
    }
  }

  // Find FF games (round 4) and determine which regions are paired
  const ffGames = Object.values(eventMap).filter(g => g.round === 4);
  if (ffGames.length < 2) return regionOrder; // No FF data yet — keep discovery order

  const pairs = [];
  for (const game of ffGames) {
    const r1 = teamRegion[game.team1?.id];
    const r2 = teamRegion[game.team2?.id];
    if (r1 && r2 && r1 !== r2) {
      pairs.push([r1, r2]);
    }
  }

  if (pairs.length !== 2) return regionOrder; // Can't determine pairings

  // Reorder: pair 1 → indices 0,1 and pair 2 → indices 2,3
  return [...pairs[0], ...pairs[1]];
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
  // Discover regions dynamically from ESPN data (data-driven, not hardcoded)
  const regionGames = {}; // { regionName: [gameInfo, ...] }
  const regionOrder = []; // preserve discovery order

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

    // Track region for R64 games and discover region names
    if (round === 0 && region) {
      if (!regionGames[region]) {
        regionGames[region] = [];
        regionOrder.push(region);
      }
      regionGames[region].push(gameInfo);
    }
  }

  // Determine correct region ordering from FF pairings
  // The bracket requires: regions[0] vs regions[1] in FF slot 61, regions[2] vs regions[3] in FF slot 62
  // We infer the pairings from ESPN's Final Four game data
  const discoveredRegions = orderRegionsByFFPairings(regionOrder, eventMap);

  // Map R64 games to slots using seed matchups
  for (let regionIdx = 0; regionIdx < discoveredRegions.length; regionIdx++) {
    const regionName = discoveredRegions[regionIdx];
    const games = regionGames[regionName] || [];
    const slotBase = regionIdx * 8 + 1; // Region 0: 1-8, Region 1: 9-16, etc.

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
      const regionIdx = discoveredRegions.indexOf(game.region);
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

  return { teams, slots, regions: discoveredRegions, events: eventMap, available: true };
}

/**
 * Fetch ESPN BPI (Basketball Power Index) data for a team.
 * Fetches the full power index list (cached 6h) and finds the team entry.
 */
async function fetchBpiData(teamId, season) {
  try {
    const data = await fetchWithCache(
      `${BPI_API_BASE}/seasons/${season}/powerindex?limit=400`,
      BPI_CACHE_TTL
    );
    const items = data?.items || [];
    const teamEntry = items.find(item => {
      const ref = item?.team?.$ref || '';
      return ref.includes(`/teams/${teamId}?`) || ref.endsWith(`/teams/${teamId}`);
    });
    if (!teamEntry?.stats) return null;

    const statsMap = {};
    for (const s of teamEntry.stats) {
      statsMap[s.name] = { value: s.displayValue || String(s.value || ''), raw: s.value };
    }

    return {
      bpi: { value: statsMap.bpi?.value, rank: statsMap.bpirank?.value },
      bpiOffense: { value: statsMap.bpioffense?.value, rank: statsMap.bpioffenserank?.value },
      bpiDefense: { value: statsMap.bpidefense?.value, rank: statsMap.bpidefenserank?.value },
      sos: { value: statsMap.sospast?.value, rank: statsMap.sospastrank?.value },
      sor: { value: statsMap.sor?.value, rank: statsMap.sorrank?.value },
      qualityWins: { wins: statsMap.top50bpiwins?.value || '0', losses: statsMap.top50bpilosses?.value || '0' },
      projections: {
        sweet16: statsMap.chancesweet16?.value || null,
        elite8: statsMap.chanceelite8?.value || null,
        finalFour: statsMap.chancefinal4?.value || null,
        championship: statsMap.chancechampgame?.value || null,
        titleWin: statsMap.chancencaachampion?.value || null,
      },
    };
  } catch (err) {
    console.warn(`[BPI] Failed to fetch for team ${teamId}:`, err.message);
    return null;
  }
}

/**
 * Generate an AI-powered scouting report using Claude API.
 * Caches results for 12 hours. Falls back to template summary on failure.
 */
async function generateAiScoutingReport(teamData, fallbackSummary) {
  // Read API key from dotenv parsed result (dotenv may not override existing empty env vars)
  const dotenvResult = require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
  const apiKey = dotenvResult.parsed?.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return fallbackSummary;

  const teamCacheKey = `ai-report-${teamData.id}`;
  const cached = aiReportCache.get(teamCacheKey);
  if (cached && Date.now() - cached.timestamp < AI_REPORT_CACHE_TTL) {
    return cached.data;
  }

  try {
    const client = new Anthropic({ apiKey });

    // Build data context for Claude
    const bpi = teamData.bpiData;
    const players = (teamData.keyPlayers || []).slice(0, 5);
    const playerLines = players.map(p => {
      const s = p.stats || {};
      return `  ${p.name} (${p.position}, ${p.year}): ${s.ppg || '?'} PPG, ${s.rpg || '?'} RPG, ${s.apg || '?'} APG, ${s.fgPct || '?'}% FG`;
    }).join('\n');

    const last5Lines = (teamData.last5 || []).map(g =>
      `  ${g.result} ${g.atVs} ${g.opponent?.name || '?'} ${g.score}`
    ).join('\n');

    const vs25 = teamData.vsTop25 || {};
    const stats = teamData.seasonStats || {};
    const getStat = (key, alt) => stats[key]?.value || (alt && stats[alt]?.value) || '?';

    const prompt = `You are an expert college basketball analyst. Write a concise but insightful scouting report for the following NCAA tournament team. Focus on playing style, key strengths, notable weaknesses, and tournament outlook. Be specific and analytical — avoid generic filler. Write 3-4 short paragraphs.

TEAM: ${teamData.name} (${teamData.conference})
Record: ${teamData.record} | Seed: #${teamData.seed || '?'} | Coach: ${teamData.coach || 'Unknown'}
${bpi ? `BPI: ${bpi.bpi?.value} (${bpi.bpi?.rank}) | Offense: ${bpi.bpiOffense?.value} (${bpi.bpiOffense?.rank}) | Defense: ${bpi.bpiDefense?.value} (${bpi.bpiDefense?.rank})
SOS: ${bpi.sos?.rank} | Quality Wins: ${bpi.qualityWins?.wins}-${bpi.qualityWins?.losses} vs Top 50 BPI` : ''}

SEASON AVERAGES:
  PPG: ${getStat('avgPoints', 'points')} | Opp PPG: ${getStat('avgPointsAgainst', 'pointsAgainst')} | RPG: ${getStat('avgRebounds', 'rebounds')}
  APG: ${getStat('avgAssists', 'assists')} | FG%: ${getStat('fieldGoalPct')} | 3PT%: ${getStat('threePointFieldGoalPct', 'threePointPct')}
  FT%: ${getStat('freeThrowPct')} | SPG: ${getStat('avgSteals', 'steals')} | BPG: ${getStat('avgBlocks', 'blocks')} | TPG: ${getStat('avgTurnovers', 'turnovers')}

KEY PLAYERS:
${playerLines || '  (No player data)'}

LAST 5 GAMES:
${last5Lines || '  (No recent games)'}

VS RANKED: ${vs25.wins || 0}-${vs25.losses || 0}

Write the scouting report now using markdown formatting. Use **bold** for key stats and player names. Separate paragraphs with blank lines. No headers — just flowing paragraphs with bold emphasis on important details.`;

    const message = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 500,
      messages: [{ role: 'user', content: prompt }],
    });

    const report = message.content?.[0]?.text || fallbackSummary;
    aiReportCache.set(teamCacheKey, { data: report, timestamp: Date.now() });
    return report;
  } catch (err) {
    console.warn(`[AI Scouting] Failed for ${teamData.name}:`, err.message);
    return fallbackSummary;
  }
}

/**
 * Generate a concise (TL;DR) version of a scouting report.
 * Uses the detailed report as context so we don't re-fetch team data.
 * Cached separately for 12 hours.
 */
async function generateConciseReport(teamId, teamName, detailedReport) {
  const dotenvResult = require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
  const apiKey = dotenvResult.parsed?.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY;
  if (!apiKey || !detailedReport) return null;

  const cacheKey = `ai-concise-${teamId}`;
  const cached = aiReportCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < AI_REPORT_CACHE_TTL) {
    return cached.data;
  }

  try {
    const client = new Anthropic({ apiKey });

    const message = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 150,
      messages: [{
        role: 'user',
        content: `Condense this scouting report into a punchy 2-3 sentence TL;DR. Keep the most important insights — playing style, biggest strength, biggest concern, and tournament outlook. Be direct and specific. Use **bold** for key stats. Do NOT prefix with "TL;DR:" or any label — just write the sentences directly.\n\nTEAM: ${teamName}\n\nDETAILED REPORT:\n${detailedReport}`,
      }],
    });

    const concise = message.content?.[0]?.text || null;
    if (concise) {
      aiReportCache.set(cacheKey, { data: concise, timestamp: Date.now() });
    }
    return concise;
  } catch (err) {
    console.warn(`[AI Concise] Failed for ${teamName}:`, err.message);
    return null;
  }
}

/**
 * Get a pre-generated scouting report from the database.
 */
async function getStoredReport(teamId, season) {
  try {
    const row = await db.getOne(
      'SELECT report, concise_report, generated_at FROM scouting_reports WHERE team_id = $1 AND season = $2',
      [String(teamId), season]
    );
    if (!row) return null;
    return { report: row.report, conciseReport: row.concise_report, generatedAt: row.generated_at };
  } catch (err) {
    console.warn(`[Scouting] DB lookup failed for team ${teamId}:`, err.message);
    return null;
  }
}

/**
 * Pre-generate AI scouting reports for all tournament teams and persist to DB.
 * Processes teams sequentially to avoid API rate limits.
 * Options:
 *   teamId — generate for a single team only
 *   force  — regenerate even if a report already exists
 */
async function generateAllReports(season, { teamId: singleTeamId, force = false } = {}) {
  const bracket = await getTournamentBracket(season);
  if (!bracket?.teams || Object.keys(bracket.teams).length === 0) {
    throw new Error(`No tournament data available for season ${season}`);
  }

  const teamIds = singleTeamId ? [String(singleTeamId)] : Object.keys(bracket.teams);
  const total = teamIds.length;
  let generated = 0;
  let skipped = 0;
  const errors = [];

  for (let i = 0; i < teamIds.length; i++) {
    const tid = teamIds[i];
    const teamMeta = bracket.teams[tid];
    const label = `${teamMeta?.name || tid} (${i + 1}/${total})`;

    try {
      // Skip if report already exists (unless force)
      if (!force) {
        const existing = await getStoredReport(tid, season);
        if (existing) {
          console.log(`[Scouting] Skipping ${label} — report exists`);
          skipped++;
          continue;
        }
      }

      console.log(`[Scouting] Generating report for ${label}...`);

      // Fetch ESPN data (same as getTeamBreakdown)
      const [teamInfo, stats, schedule, roster, news, bpiResult] = await Promise.allSettled([
        fetchWithCache(`${API_BASE}/teams/${tid}`, TEAM_CACHE_TTL),
        fetchWithCache(`${API_BASE}/teams/${tid}/statistics?season=${season}`, TEAM_CACHE_TTL),
        fetchWithCache(`${API_BASE}/teams/${tid}/schedule?season=${season}`, TEAM_CACHE_TTL),
        fetchWithCache(`${API_BASE}/teams/${tid}/roster`, ROSTER_CACHE_TTL),
        fetchWithCache(`${API_BASE}/news?team=${tid}`, TEAM_CACHE_TTL),
        fetchBpiData(tid, season),
      ]);

      const team = teamInfo.status === 'fulfilled' ? teamInfo.value?.team : null;
      const statsData = stats.status === 'fulfilled' ? stats.value : null;
      const scheduleData = schedule.status === 'fulfilled' ? schedule.value : null;
      const rosterData = roster.status === 'fulfilled' ? roster.value : null;
      const bpiData = bpiResult.status === 'fulfilled' ? bpiResult.value : null;

      const basic = {
        id: String(tid),
        name: team?.displayName || teamMeta?.name || '',
        abbreviation: team?.abbreviation || '',
        logo: team?.logos?.[0]?.href || '',
        color: team?.color ? `#${team.color}` : '#666',
        record: team?.record?.items?.[0]?.summary || '',
        conference: extractConference(team?.standingSummary) || '',
        coach: parseCoachName(rosterData),
        seed: teamMeta?.seed || null,
      };

      const seasonStats = parseTeamStatistics(statsData);
      const recordStats = team?.record?.items?.[0]?.stats || [];
      for (const rs of recordStats) {
        if (rs.name && rs.value !== undefined && !seasonStats[rs.name]) {
          seasonStats[rs.name] = { value: String(Number(rs.value).toFixed(1)), rank: null };
        }
      }

      const { last5, vsTop25 } = parseTeamSchedule(scheduleData, tid);
      const rawPlayers = parseKeyPlayers(rosterData, statsData);
      const keyPlayers = await enrichPlayersWithStats(rawPlayers, 5);

      const templateSummary = generateTeamSummary(basic, seasonStats);
      const fullTeamData = { ...basic, seasonStats, last5, vsTop25, keyPlayers, bpiData };

      // Generate AI reports
      const report = await generateAiScoutingReport(fullTeamData, templateSummary);
      const conciseReport = await generateConciseReport(tid, basic.name, report);

      // Upsert to DB
      await db.query(
        `INSERT INTO scouting_reports (team_id, season, report, concise_report, generated_at)
         VALUES ($1, $2, $3, $4, NOW())
         ON CONFLICT (team_id, season) DO UPDATE SET
           report = EXCLUDED.report,
           concise_report = EXCLUDED.concise_report,
           generated_at = NOW()`,
        [String(tid), season, report, conciseReport]
      );

      // Also populate the in-memory cache so immediate requests are fast
      aiReportCache.set(`ai-report-${tid}`, { data: report, timestamp: Date.now() });
      if (conciseReport) {
        aiReportCache.set(`ai-concise-${tid}`, { data: conciseReport, timestamp: Date.now() });
      }

      generated++;
      console.log(`[Scouting] ✅ ${label} done`);
    } catch (err) {
      console.error(`[Scouting] ❌ Failed ${label}:`, err.message);
      errors.push({ teamId: tid, name: teamMeta?.name, error: err.message });
    }
  }

  const summary = { total, generated, skipped, failed: errors.length, errors };
  console.log(`[Scouting] Complete: ${generated} generated, ${skipped} skipped, ${errors.length} failed out of ${total}`);
  return summary;
}

/**
 * Get comprehensive team breakdown for the matchup detail dialog
 */
async function getTeamBreakdown(teamId, season) {
  // Check top-level breakdown cache first (shared across all users)
  const breakdownKey = `${teamId}-${season}`;
  const cachedBreakdown = breakdownCache.get(breakdownKey);
  if (cachedBreakdown && Date.now() - cachedBreakdown.timestamp < BREAKDOWN_CACHE_TTL) {
    // Re-check DB for fresh AI report (admin may have regenerated it)
    const stored = await getStoredReport(teamId, season);
    if (stored?.report) {
      cachedBreakdown.data.summary = stored.report;
    }
    return cachedBreakdown.data;
  }

  const [teamInfo, stats, schedule, roster, news, bpiResult] = await Promise.allSettled([
    fetchWithCache(`${API_BASE}/teams/${teamId}`, TEAM_CACHE_TTL),
    fetchWithCache(`${API_BASE}/teams/${teamId}/statistics?season=${season}`, TEAM_CACHE_TTL),
    fetchWithCache(`${API_BASE}/teams/${teamId}/schedule?season=${season}`, TEAM_CACHE_TTL),
    fetchWithCache(`${API_BASE}/teams/${teamId}/roster`, ROSTER_CACHE_TTL),
    fetchWithCache(`${API_BASE}/news?team=${teamId}`, TEAM_CACHE_TTL),
    fetchBpiData(teamId, season),
  ]);

  const team = teamInfo.status === 'fulfilled' ? teamInfo.value?.team : null;
  const statsData = stats.status === 'fulfilled' ? stats.value : null;
  const scheduleData = schedule.status === 'fulfilled' ? schedule.value : null;
  const rosterData = roster.status === 'fulfilled' ? roster.value : null;
  const newsData = news.status === 'fulfilled' ? news.value : null;
  const bpiData = bpiResult.status === 'fulfilled' ? bpiResult.value : null;

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

  // Generate template-based summary as fallback
  const templateSummary = generateTeamSummary(basic, seasonStats);

  // Check for pre-generated AI report in DB first (instant), fall back to template
  const stored = await getStoredReport(teamId, season);
  const summary = stored?.report || templateSummary;

  const result = {
    ...basic,
    seasonStats,
    bpiData,
    last5,
    vsTop25,
    keyPlayers,
    headlines,
    summary,
    fullSchedule,
  };

  // Cache the full breakdown so subsequent users get instant results
  breakdownCache.set(breakdownKey, { data: result, timestamp: Date.now() });

  return result;
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

/**
 * Get the start time of the first Round of 64 game.
 * Used to determine when brackets should lock.
 */
async function getFirstGameTime(season) {
  const events = await fetchTournamentGames(season);
  if (!events.length) return null;

  let earliest = null;

  for (const event of events) {
    const { round } = parseRegionAndRound(event);
    // Only consider Round of 64 games (round 0)
    if (round !== 0) continue;

    const startDate = event.date;
    if (!startDate) continue;

    const dt = new Date(startDate);
    if (isNaN(dt.getTime())) continue;

    if (!earliest || dt < earliest) {
      earliest = dt;
    }
  }

  return earliest ? earliest.toISOString() : null;
}

module.exports = {
  getTournamentBracket,
  getTeamBreakdown,
  getMatchupPrediction,
  getTournamentResults,
  fetchTournamentGames,
  getSelectionSundayDate,
  getFirstGameTime,
  generateConciseReport,
  generateAllReports,
  getStoredReport,
};
