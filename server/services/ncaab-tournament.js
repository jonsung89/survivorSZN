// NCAA Tournament (March Madness) Data Service
// Fetches bracket structure, team breakdowns, and live results from ESPN API

const { fetchWithCache } = require('./espn');
const { SEED_MATCHUPS, getSlotRound, ROUND_BOUNDARIES } = require('../utils/bracket-slots');
const { getDraftProspects, normalizeName } = require('./nba-draft');
const Anthropic = require('@anthropic-ai/sdk');
const { db } = require('../db/supabase');

const API_BASE = 'https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball';
const BPI_API_BASE = 'https://sports.core.api.espn.com/v2/sports/basketball/leagues/mens-college-basketball';
const ATHLETE_API_BASE = 'https://site.web.api.espn.com/apis/common/v3/sports/basketball/mens-college-basketball/athletes';
const TOURNAMENT_CACHE_TTL = 60 * 1000; // 1 minute — short TTL during active tournament for timely score updates
const TEAM_CACHE_TTL = 60 * 60 * 1000; // 1 hour
const ROSTER_CACHE_TTL = 6 * 60 * 60 * 1000; // 6 hours
const PLAYER_STATS_CACHE_TTL = 6 * 60 * 60 * 1000; // 6 hours
const BPI_CACHE_TTL = 6 * 60 * 60 * 1000; // 6 hours
const AI_REPORT_CACHE_TTL = 12 * 60 * 60 * 1000; // 12 hours
const BOXSCORE_FINAL_CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours — completed game box scores don't change
const BOXSCORE_LIVE_CACHE_TTL = 60 * 1000; // 60 seconds for live games

// In-memory cache for AI reports (separate from ESPN fetch cache)
const aiReportCache = new Map();

// Top-level cache for full team breakdowns (serves all users from single fetch+AI call)
const BREAKDOWN_CACHE_TTL = 2 * 60 * 60 * 1000; // 2 hours
const breakdownCache = new Map();

/**
 * Fetch full schedule for a team — merges regular season (seasontype=2) and postseason (seasontype=3).
 * ESPN's default schedule endpoint only returns the current season type, which during
 * March Madness means only tournament games. We need both to show "Last 10 Games" etc.
 */
async function fetchFullSchedule(teamId, season) {
  const [regular, post] = await Promise.allSettled([
    fetchWithCache(`${API_BASE}/teams/${teamId}/schedule?season=${season}&seasontype=2`, TEAM_CACHE_TTL),
    fetchWithCache(`${API_BASE}/teams/${teamId}/schedule?season=${season}&seasontype=3`, TEAM_CACHE_TTL),
  ]);
  const regularEvents = regular.status === 'fulfilled' ? (regular.value?.events || []) : [];
  const postEvents = post.status === 'fulfilled' ? (post.value?.events || []) : [];
  // Deduplicate by event id
  const seen = new Set();
  const events = [];
  for (const e of [...regularEvents, ...postEvents]) {
    const id = e.id || e.uid;
    if (!seen.has(id)) {
      seen.add(id);
      events.push(e);
    }
  }
  return { events };
}

// Region name variants ESPN uses in notes
const REGION_ALIASES = {
  'east': 'East', 'west': 'West', 'south': 'South', 'midwest': 'Midwest',
  'east region': 'East', 'west region': 'West', 'south region': 'South', 'midwest region': 'Midwest',
};

const ROUND_MAP = {
  'first four': -1,
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
  const firstFourGames = {}; // { regionName: [gameInfo, ...] } — First Four play-in games

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

    // Track First Four games by region
    if (round === -1 && region) {
      if (!firstFourGames[region]) firstFourGames[region] = [];
      firstFourGames[region].push(gameInfo);
    }

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
    const ffGames = firstFourGames[regionName] || [];
    const slotBase = regionIdx * 8 + 1; // Region 0: 1-8, Region 1: 9-16, etc.

    for (const game of games) {
      const seed1 = game.team1?.seed;
      const seed2 = game.team2?.seed;

      // Handle R64 games where one team is TBD (First Four dependent)
      if ((seed1 && !seed2) || (!seed1 && seed2)) {
        const knownSeed = seed1 || seed2;
        const knownTeam = seed1 ? game.team1 : game.team2;

        // Determine which SEED_MATCHUPS slot this belongs to by the known seed
        // e.g., if knownSeed is 1, the matchup is 1v16, so the TBD opponent is seed 16
        const matchupIdx = SEED_MATCHUPS.findIndex(([s1, s2]) =>
          s1 === knownSeed || s2 === knownSeed
        );

        // Find the expected opponent seed from the matchup
        const expectedOpponentSeed = matchupIdx >= 0
          ? (SEED_MATCHUPS[matchupIdx][0] === knownSeed ? SEED_MATCHUPS[matchupIdx][1] : SEED_MATCHUPS[matchupIdx][0])
          : null;

        // Find matching First Four game — same region, both teams have the expected opponent seed
        const ffGame = expectedOpponentSeed
          ? ffGames.find(ff => ff.team1?.seed === expectedOpponentSeed && ff.team2?.seed === expectedOpponentSeed)
          : null;

        if (matchupIdx >= 0) {
          const slotNum = slotBase + matchupIdx;
          const [expectedHighSeed, expectedLowSeed] = SEED_MATCHUPS[matchupIdx];
          const isKnownHighSeed = knownSeed === expectedHighSeed;

          // Build the TBD team from the First Four game
          let tbdTeam = null;
          if (ffGame) {
            // If First Four game is finished, use the winner
            if (ffGame.status === 'STATUS_FINAL') {
              tbdTeam = ffGame.team1?.winner ? ffGame.team1 : ffGame.team2;
            } else {
              // Show placeholder with both First Four team names
              const ffSeed = ffGame.team1?.seed || ffGame.team2?.seed;
              tbdTeam = {
                id: `ff-${ffGame.espnEventId}`,
                name: `${ffGame.team1?.shortName || ffGame.team1?.abbreviation}/${ffGame.team2?.shortName || ffGame.team2?.abbreviation}`,
                abbreviation: `${ffGame.team1?.abbreviation}/${ffGame.team2?.abbreviation}`,
                shortName: `${ffGame.team1?.abbreviation}/${ffGame.team2?.abbreviation}`,
                logo: '',
                color: '#666',
                seed: ffSeed,
                record: '',
                score: null,
                winner: false,
                isFirstFour: true,
                firstFourTeams: [ffGame.team1, ffGame.team2],
                firstFourEventId: ffGame.espnEventId,
                firstFourStatus: ffGame.status,
              };
            }
          }

          slots[slotNum] = {
            team1: isKnownHighSeed ? knownTeam : tbdTeam,
            team2: isKnownHighSeed ? tbdTeam : knownTeam,
            espnEventId: game.espnEventId,
            status: game.status,
            startDate: game.startDate,
            broadcast: game.broadcast,
            venue: game.venue,
          };
        }
        continue;
      }

      const seeds = [seed1, seed2].sort((a, b) => (a || 99) - (b || 99));

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
      max_tokens: 1024,
      messages: [{
        role: 'user',
        content: `Condense this scouting report into a punchy 2-3 sentence TL;DR. Keep the most important insights — playing style, biggest strength, biggest concern, and tournament outlook. Be direct and specific. Use **bold** for key stats. Do NOT prefix with "TL;DR:" or any label — just write the sentences directly.\n\nTEAM: ${teamName}\n\nDETAILED REPORT:\n${detailedReport}`,
      }],
    });

    // If truncated, the response is incomplete — don't use it
    if (message.stop_reason === 'max_tokens') {
      console.warn(`[AI Concise] Response truncated for ${teamName}, skipping`);
      return null;
    }

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
 * Sort two team IDs alphabetically for consistent cache/DB keys.
 */
function sortTeamIds(id1, id2) {
  return String(id1) < String(id2) ? [String(id1), String(id2)] : [String(id2), String(id1)];
}

/**
 * Get a stored matchup report from the database.
 */
async function getStoredMatchupReport(team1Id, team2Id, season) {
  const [sortedId1, sortedId2] = sortTeamIds(team1Id, team2Id);
  try {
    const row = await db.getOne(
      'SELECT report, concise_report, round, generated_at FROM matchup_reports WHERE team1_id = $1 AND team2_id = $2 AND season = $3',
      [sortedId1, sortedId2, season]
    );
    if (!row) return null;
    return { report: row.report, conciseReport: row.concise_report, round: row.round, generatedAt: row.generated_at };
  } catch (err) {
    console.warn(`[Matchup] DB lookup failed for ${sortedId1} vs ${sortedId2}:`, err.message);
    return null;
  }
}

/**
 * Generate an AI matchup analysis report for two teams.
 * Neutral analysis covering style clash, key advantages, X-factor, prediction.
 */
/**
 * Build team context string for AI prompts (shared between matchup and scouting).
 */
function buildMatchupTeamContext(td) {
  const stats = td.seasonStats || {};
  const getStat = (key, alt) => stats[key]?.value || (alt && stats[alt]?.value) || '?';
  const getRank = (key, alt) => stats[key]?.rank || (alt && stats[alt]?.rank) || '';
  const players = (td.keyPlayers || []).slice(0, 5);
  const playerLines = players.map(p => {
    const s = p.stats || {};
    return `  ${p.name} (${p.position}, ${p.year}): ${s.ppg || '?'} PPG, ${s.rpg || '?'} RPG, ${s.apg || '?'} APG, ${s.spg || '?'} SPG, ${s.bpg || '?'} BPG, ${s.fgPct || '?'}% FG`;
  }).join('\n');
  const bpi = td.bpiData;
  const vs25 = td.vsTop25 || {};
  const last5 = (td.last5 || []).map(g => `${g.result}`).join(', ');

  return `${td.name} (${td.conference}) — #${td.seed || '?'} seed, ${td.record}
  Coach: ${td.coach || 'Unknown'}
  PPG: ${getStat('avgPoints', 'points')}${getRank('avgPoints', 'points') ? ` (#${getRank('avgPoints', 'points')})` : ''} | Opp PPG: ${getStat('avgPointsAgainst', 'pointsAgainst')} | RPG: ${getStat('avgRebounds', 'rebounds')} | APG: ${getStat('avgAssists', 'assists')}
  FG%: ${getStat('fieldGoalPct')} | 3PT%: ${getStat('threePointFieldGoalPct', 'threePointPct')} | FT%: ${getStat('freeThrowPct')}
  SPG: ${getStat('avgSteals', 'steals')} | BPG: ${getStat('avgBlocks', 'blocks')} | TPG: ${getStat('avgTurnovers', 'turnovers')}
  ${bpi ? `BPI: ${bpi.bpi?.value} (${bpi.bpi?.rank}) | Off: ${bpi.bpiOffense?.value} | Def: ${bpi.bpiDefense?.value} | SOS: ${bpi.sos?.rank}` : ''}
  vs Ranked: ${vs25.wins || 0}-${vs25.losses || 0} | Last 5: ${last5 || 'N/A'}
  Key Players:
${playerLines || '  (No data)'}`;
}

async function generateMatchupReport(team1Data, team2Data, season, { force = false, round = null } = {}) {
  const dotenvResult = require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
  const apiKey = dotenvResult.parsed?.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  const [sortedId1, sortedId2] = sortTeamIds(team1Data.id, team2Data.id);
  const cacheKey = `ai-matchup-${sortedId1}-${sortedId2}`;

  if (!force) {
    const cached = aiReportCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < AI_REPORT_CACHE_TTL) {
      return cached.data;
    }

    // Check DB
    const stored = await getStoredMatchupReport(team1Data.id, team2Data.id, season);
    if (stored?.report && stored?.conciseReport) {
      const result = { report: stored.report, conciseReport: stored.conciseReport };
      aiReportCache.set(cacheKey, { data: result, timestamp: Date.now() });
      return result;
    }
  }

  try {
    const client = new Anthropic({ apiKey });

    const prompt = `You are an expert college basketball analyst providing a neutral, balanced matchup analysis for an NCAA tournament game. Analyze how these two teams match up against each other.

You must respond in EXACTLY this format with both sections:

===FULL REPORT===
Write 2-3 short paragraphs covering:
1. How their playing styles clash (tempo, offensive approach, defensive identity)
2. Key advantages for each team
3. The X-factor player or stat that could decide the game
4. Your lean on who has the edge and why

Be specific, analytical, and balanced — do NOT be overly biased toward either team. Use **bold** for key stats, player names, and important insights. No headers — just flowing paragraphs.

===CONCISE REPORT===
Write a 2-3 sentence TL;DR of the matchup. Mention the key matchup dynamic, who has the edge, and the biggest factor. Use **bold** for the most important insight. Must be a COMPLETE thought — never end mid-sentence.

TEAM 1:
${buildMatchupTeamContext(team1Data)}

TEAM 2:
${buildMatchupTeamContext(team2Data)}

Write the analysis now.`;

    const message = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1500,
      messages: [{ role: 'user', content: prompt }],
    });

    if (message.stop_reason === 'max_tokens') {
      console.warn(`[AI Matchup] Response truncated for ${team1Data.name} vs ${team2Data.name}, skipping`);
      return null;
    }

    const text = message.content?.[0]?.text || '';
    const fullMatch = text.match(/===FULL REPORT===\s*([\s\S]*?)(?=\s*===CONCISE REPORT===)/);
    const conciseMatch = text.match(/===CONCISE REPORT===\s*([\s\S]*)/);

    const report = fullMatch ? fullMatch[1].trim() : text.trim();
    const conciseReport = conciseMatch ? conciseMatch[1].trim() : null;

    if (report) {
      const result = { report, conciseReport };
      aiReportCache.set(cacheKey, { data: result, timestamp: Date.now() });
      // Store in DB
      try {
        await db.query(
          `INSERT INTO matchup_reports (team1_id, team2_id, season, report, concise_report, round, generated_at)
           VALUES ($1, $2, $3, $4, $5, $6, NOW())
           ON CONFLICT (team1_id, team2_id, season) DO UPDATE SET
             report = EXCLUDED.report,
             concise_report = EXCLUDED.concise_report,
             round = COALESCE(EXCLUDED.round, matchup_reports.round),
             generated_at = NOW()`,
          [sortedId1, sortedId2, season, report, conciseReport, round]
        );
      } catch (dbErr) {
        console.warn(`[AI Matchup] DB store failed:`, dbErr.message);
      }
      return result;
    }
    return null;
  } catch (err) {
    console.warn(`[AI Matchup] Failed for ${team1Data.name} vs ${team2Data.name}:`, err.status, err.message, err.error || '');
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
async function generateAllReports(season, { teamId: singleTeamId, force = false, incompleteOnly = false } = {}) {
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
      // Skip logic based on mode
      const existing = await getStoredReport(tid, season);
      if (!force) {
        if (incompleteOnly) {
          // Only regenerate if report/concise is missing or concise looks truncated
          const isIncomplete = !existing?.report || !existing?.conciseReport ||
            (existing.conciseReport && !/[.!?]$/.test(existing.conciseReport.trim()));
          if (!isIncomplete) {
            skipped++;
            continue;
          }
          console.log(`[Scouting] Regenerating incomplete report for ${label}`);
        } else if (existing) {
          console.log(`[Scouting] Skipping ${label} — report exists`);
          skipped++;
          continue;
        }
      }

      // Clear in-memory cache so we don't return stale/truncated data
      aiReportCache.delete(`ai-report-${tid}`);
      aiReportCache.delete(`ai-concise-${tid}`);

      console.log(`[Scouting] Generating report for ${label}...`);

      // Fetch ESPN data (same as getTeamBreakdown)
      const [teamInfo, stats, schedule, roster, news, bpiResult] = await Promise.allSettled([
        fetchWithCache(`${API_BASE}/teams/${tid}`, TEAM_CACHE_TTL),
        fetchWithCache(`${API_BASE}/teams/${tid}/statistics?season=${season}`, TEAM_CACHE_TTL),
        fetchFullSchedule(tid, season),
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

      const { last5, last10, vsTop25 } = parseTeamSchedule(scheduleData, tid);
      const rawPlayers = parseKeyPlayers(rosterData, statsData);
      // Fetch stats for all roster players, then composite score picks the best 5
      const keyPlayers = await enrichPlayersWithStats(rawPlayers, rawPlayers.length);

      const templateSummary = generateTeamSummary(basic, seasonStats);
      const fullTeamData = { ...basic, seasonStats, last5, last10, vsTop25, keyPlayers, bpiData };

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
    fetchFullSchedule(teamId, season),
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
  const { last5, last10, vsTop25, fullSchedule } = parseTeamSchedule(scheduleData, teamId);

  // Parse key players from roster, then enrich with per-player stats
  const rawPlayers = parseKeyPlayers(rosterData, statsData);
  // Fetch stats for top 15 roster players, then composite score picks the best 5
  const keyPlayers = await enrichPlayersWithStats(rawPlayers, 15);

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
    last10,
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
  const last10 = [];
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
    if (last10.length < 10) {
      last10.push(gameEntry);
    }

    if (gameEntry.opponent.rank && gameEntry.opponent.rank <= 25) {
      vsTop25.push(gameEntry);
    }
  }

  // Compute last10 record summary
  const last10Wins = last10.filter(g => g.result === 'W').length;
  const last10Losses = last10.filter(g => g.result === 'L').length;
  const last10Home = last10.filter(g => g.atVs === 'vs');
  const last10Away = last10.filter(g => g.atVs === '@');
  const last10Neutral = last10.filter(g => g.atVs !== 'vs' && g.atVs !== '@');
  const last10Summary = {
    record: `${last10Wins}-${last10Losses}`,
    home: `${last10Home.filter(g => g.result === 'W').length}-${last10Home.filter(g => g.result === 'L').length}`,
    away: `${last10Away.filter(g => g.result === 'W').length}-${last10Away.filter(g => g.result === 'L').length}`,
    neutral: `${last10Neutral.filter(g => g.result === 'W').length}-${last10Neutral.filter(g => g.result === 'L').length}`,
    games: last10,
  };

  const vsTop25Record = {
    wins: vsTop25.filter(g => g.result === 'W').length,
    losses: vsTop25.filter(g => g.result === 'L').length,
    games: vsTop25,
  };

  return { last5, last10: last10Summary, vsTop25: vsTop25Record, fullSchedule };
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

  return players;
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

  // Sort by composite impact score (not just PPG)
  // Weights reflect relative value of each stat in college basketball
  const computeImpactScore = (s) => {
    if (!s) return 0;
    const ppg = parseFloat(s.ppg) || 0;
    const rpg = parseFloat(s.rpg) || 0;
    const apg = parseFloat(s.apg) || 0;
    const spg = parseFloat(s.spg) || 0;
    const bpg = parseFloat(s.bpg) || 0;
    const mpg = parseFloat(s.mpg) || 0;
    // Composite: points + weighted rebounds/assists/stocks + minutes bonus
    return ppg + (rpg * 1.2) + (apg * 1.5) + (spg * 2.0) + (bpg * 2.0) + (mpg * 0.3);
  };

  const enriched = players.map(p => {
    const match = toFetch.find(t => t.id === p.id);
    return match || p;
  });

  enriched.sort((a, b) => {
    return computeImpactScore(b.stats) - computeImpactScore(a.stats);
  });

  // Return top 5 most impactful players
  return enriched.slice(0, 5);
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

// ── Prospect Watch ──────────────────────────────────────────────────────────

const SUMMARY_API_BASE = 'https://site.web.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/summary';

const ROUND_NAMES = {
  '-1': 'First Four', 0: 'Round of 64', 1: 'Round of 32', 2: 'Sweet 16',
  3: 'Elite 8', 4: 'Final Four', 5: 'Championship',
};

// School name aliases for matching Tankathon → ESPN
const SCHOOL_ALIASES = {
  'uconn': 'connecticut',
  'smu': 'southern methodist',
  'ucf': 'central florida',
  'unc': 'north carolina',
  'lsu': 'louisiana state',
  'vcu': 'virginia commonwealth',
  'unlv': 'nevada-las vegas',
  'utep': 'texas-el paso',
  'ole miss': 'mississippi',
  'pitt': 'pittsburgh',
  'miami': 'miami',
  'usc': 'southern california',
  'cal': 'california',
  'byu': 'brigham young',
  'nc state': 'nc state',
  'texas a&m': 'texas a&m',
  'michigan st': 'michigan state',
  'ohio st': 'ohio state',
  'iowa st': 'iowa state',
  'penn st': 'penn state',
};

// Route-level cache for assembled prospect watch data
let prospectWatchCache = null;
let prospectWatchCacheTime = 0;
const PROSPECT_WATCH_CACHE_TTL = 2 * 60 * 1000; // 2 minutes

/**
 * Match a Tankathon prospect school name to an ESPN tournament team.
 * Uses multi-pass matching: exact first, then startsWith on location, then fuzzy.
 * Returns the matched team object or null.
 */
function matchSchoolToTeam(prospectSchool, teams) {
  if (!prospectSchool) return null;
  const schoolLower = prospectSchool.toLowerCase().trim();
  const aliased = SCHOOL_ALIASES[schoolLower] || schoolLower;

  const teamList = Object.values(teams);

  // Pass 1: Exact match on shortName or location
  for (const team of teamList) {
    const shortName = (team.shortName || '').toLowerCase();
    if (shortName === schoolLower || shortName === aliased) return team;
  }

  // Pass 2: Full name starts with school + space (e.g., "Duke" → "Duke Blue Devils")
  // Must be followed by a space to prevent "Iowa" matching "Iowa State"
  for (const team of teamList) {
    const fullName = (team.name || '').toLowerCase();
    if (fullName === aliased || fullName === schoolLower) return team;
    if (fullName.startsWith(aliased + ' ') || fullName.startsWith(schoolLower + ' ')) return team;
  }

  return null;
}

/**
 * Parse player stats from ESPN summary box score.
 * Returns { stats, headshot, espnId } or null if player not found.
 */
function parsePlayerFromBoxscore(boxscore, teamId, prospectNormalizedName) {
  if (!boxscore?.players) return null;

  // Find the team entry
  const teamEntry = boxscore.players.find(p => String(p.team?.id) === String(teamId));
  if (!teamEntry?.statistics?.[0]) return null;

  const statGroup = teamEntry.statistics[0];
  const labels = (statGroup.labels || []).map(l => l.toUpperCase());
  const athletes = statGroup.athletes || [];

  for (const entry of athletes) {
    const athleteName = entry.athlete?.displayName || '';
    if (normalizeName(athleteName) !== prospectNormalizedName) continue;

    const rawStats = entry.stats || [];
    const statMap = {};
    for (let i = 0; i < labels.length; i++) {
      statMap[labels[i]] = rawStats[i] || '0';
    }

    return {
      espnId: String(entry.athlete?.id || ''),
      headshot: entry.athlete?.headshot?.href || null,
      starter: entry.starter || false,
      stats: {
        min: statMap['MIN'] || '0',
        pts: parseInt(statMap['PTS']) || 0,
        reb: parseInt(statMap['REB']) || 0,
        ast: parseInt(statMap['AST']) || 0,
        stl: parseInt(statMap['STL']) || 0,
        blk: parseInt(statMap['BLK']) || 0,
        to: parseInt(statMap['TO']) || 0,
        pf: parseInt(statMap['PF']) || 0,
        fg: statMap['FG'] || '0-0',
        threePt: statMap['3PT'] || '0-0',
        ft: statMap['FT'] || '0-0',
        plusMinus: statMap['+/-'] || '0',
        oreb: parseInt(statMap['OREB']) || 0,
        dreb: parseInt(statMap['DREB']) || 0,
      },
    };
  }
  return null;
}

/**
 * Get NBA prospect tournament stats — assembles prospect data with
 * tournament box scores, season stats, and team status.
 */
async function getProspectTournamentStats(season) {
  // Check route-level cache
  if (prospectWatchCache && Date.now() - prospectWatchCacheTime < PROSPECT_WATCH_CACHE_TTL) {
    return prospectWatchCache;
  }

  const [prospects, bracket] = await Promise.all([
    getDraftProspects(),
    getTournamentBracket(season),
  ]);

  if (!prospects?.length || !bracket?.teams) {
    return { prospects: [] };
  }

  const { teams, events: eventMap } = bracket;

  // Step 1: Match prospects to tournament teams
  const prospectTeamMap = []; // { prospect, team }
  for (const prospect of prospects.slice(0, 60)) {
    const team = matchSchoolToTeam(prospect.school, teams);
    if (team) {
      prospectTeamMap.push({ prospect, team });
    }
  }

  if (!prospectTeamMap.length) {
    return { prospects: [] };
  }

  // Step 2: Find tournament games for each team (deduplicate by game ID)
  const teamGames = {}; // teamId → [gameInfo]
  for (const game of Object.values(eventMap || {})) {
    if (!game.espnEventId) continue;
    const t1 = game.team1?.id;
    const t2 = game.team2?.id;
    if (t1) {
      if (!teamGames[t1]) teamGames[t1] = [];
      teamGames[t1].push(game);
    }
    if (t2) {
      if (!teamGames[t2]) teamGames[t2] = [];
      teamGames[t2].push(game);
    }
  }

  // Step 3: Collect unique game IDs that need box scores (completed or live)
  const gamesToFetch = new Map(); // espnEventId → { game, cacheTTL }
  for (const { team } of prospectTeamMap) {
    const games = teamGames[team.id] || [];
    for (const game of games) {
      if (game.status === 'STATUS_FINAL' || game.status === 'STATUS_IN_PROGRESS') {
        if (!gamesToFetch.has(game.espnEventId)) {
          const ttl = game.status === 'STATUS_FINAL' ? BOXSCORE_FINAL_CACHE_TTL : BOXSCORE_LIVE_CACHE_TTL;
          gamesToFetch.set(game.espnEventId, { game, ttl });
        }
      }
    }
  }

  // Step 4: Fetch all box scores in parallel
  const boxscoreEntries = Array.from(gamesToFetch.entries());
  const boxscoreResults = await Promise.allSettled(
    boxscoreEntries.map(([eventId, { ttl }]) =>
      fetchWithCache(`${SUMMARY_API_BASE}?event=${eventId}`, ttl)
    )
  );

  const boxscores = {}; // espnEventId → boxscore data
  for (let i = 0; i < boxscoreEntries.length; i++) {
    if (boxscoreResults[i].status === 'fulfilled') {
      boxscores[boxscoreEntries[i][0]] = boxscoreResults[i].value?.boxscore || null;
    }
  }

  // Step 5: Extract prospect stats from box scores and collect ESPN IDs
  const prospectData = [];
  const espnIdsToFetch = []; // { index, espnId }

  for (const { prospect, team } of prospectTeamMap) {
    const games = teamGames[team.id] || [];
    const tournamentGames = [];
    let espnId = null;
    let headshot = null;
    let isPlaying = false;
    let currentGame = null;

    // Sort games by round
    const sortedGames = [...games].sort((a, b) => (a.round ?? -1) - (b.round ?? -1));

    for (const game of sortedGames) {
      const isTeam1 = String(game.team1?.id) === String(team.id);
      const opponent = isTeam1 ? game.team2 : game.team1;
      const teamScore = isTeam1 ? game.team1?.score : game.team2?.score;
      const opponentScore = isTeam1 ? game.team2?.score : game.team1?.score;
      const isWinner = isTeam1 ? game.team1?.winner : game.team2?.winner;

      if (game.status === 'STATUS_FINAL' || game.status === 'STATUS_IN_PROGRESS') {
        const boxscore = boxscores[game.espnEventId];
        let playerStats = null;

        if (boxscore) {
          const parsed = parsePlayerFromBoxscore(boxscore, team.id, prospect.normalizedName);
          if (parsed) {
            playerStats = parsed.stats;
            if (!espnId && parsed.espnId) espnId = parsed.espnId;
            if (!headshot && parsed.headshot) headshot = parsed.headshot;
          }
        }

        const gameEntry = {
          gameId: game.espnEventId,
          round: ROUND_NAMES[game.round] || `Round ${game.round}`,
          opponent: opponent?.shortName || opponent?.name || 'TBD',
          opponentSeed: opponent?.seed || null,
          opponentLogo: opponent?.logo || null,
          result: game.status === 'STATUS_FINAL' ? (isWinner ? 'W' : 'L') : 'LIVE',
          teamScore: teamScore ?? null,
          opponentScore: opponentScore ?? null,
          stats: playerStats,
          isLive: game.status === 'STATUS_IN_PROGRESS',
        };

        tournamentGames.push(gameEntry);

        if (game.status === 'STATUS_IN_PROGRESS') {
          isPlaying = true;
          currentGame = {
            gameId: game.espnEventId,
            opponent: opponent?.shortName || opponent?.name || 'TBD',
            opponentSeed: opponent?.seed || null,
            opponentLogo: opponent?.logo || null,
            teamScore: teamScore ?? null,
            opponentScore: opponentScore ?? null,
            status: game.statusDetail || 'In Progress',
            prospectStats: playerStats,
          };
        }
      }
    }

    // Determine team status
    const hasLoss = sortedGames.some(g => {
      if (g.status !== 'STATUS_FINAL') return false;
      const isT1 = String(g.team1?.id) === String(team.id);
      return isT1 ? !g.team1?.winner : !g.team2?.winner;
    });
    const teamStatus = isPlaying ? 'playing_now' : hasLoss ? 'eliminated' : 'alive';

    // Current round = highest round game the team has been in
    const maxRound = sortedGames.reduce((max, g) => Math.max(max, g.round ?? -1), -1);
    const teamCurrentRound = maxRound >= 0 ? ROUND_NAMES[maxRound] || null : null;

    // Compute tournament averages (completed games only)
    const completedGamesWithStats = tournamentGames.filter(g => g.result !== 'LIVE' && g.stats);
    const tournamentAvgs = { pts: 0, reb: 0, ast: 0, stl: 0, blk: 0, min: 0 };
    if (completedGamesWithStats.length > 0) {
      for (const g of completedGamesWithStats) {
        tournamentAvgs.pts += g.stats.pts;
        tournamentAvgs.reb += g.stats.reb;
        tournamentAvgs.ast += g.stats.ast;
        tournamentAvgs.stl += g.stats.stl;
        tournamentAvgs.blk += g.stats.blk;
        const mins = parseFloat(g.stats.min) || 0;
        tournamentAvgs.min += mins;
      }
      const n = completedGamesWithStats.length;
      tournamentAvgs.pts = Math.round((tournamentAvgs.pts / n) * 10) / 10;
      tournamentAvgs.reb = Math.round((tournamentAvgs.reb / n) * 10) / 10;
      tournamentAvgs.ast = Math.round((tournamentAvgs.ast / n) * 10) / 10;
      tournamentAvgs.stl = Math.round((tournamentAvgs.stl / n) * 10) / 10;
      tournamentAvgs.blk = Math.round((tournamentAvgs.blk / n) * 10) / 10;
      tournamentAvgs.min = Math.round((tournamentAvgs.min / n) * 10) / 10;
    }

    const idx = prospectData.length;
    prospectData.push({
      rank: prospect.rank,
      name: prospect.name,
      position: prospect.position,
      school: prospect.school,
      schoolLogo: prospect.logo,
      headshot,
      height: prospect.height,
      weight: prospect.weight,
      year: prospect.year,
      espnId,
      teamId: team.id,
      teamSeed: team.seed,
      teamRecord: team.record,
      teamAbbreviation: team.abbreviation,
      teamColor: team.color,
      teamStatus,
      teamCurrentRound,
      isPlaying,
      currentGame,
      seasonStats: {
        ppg: prospect.stats?.pts || 0,
        rpg: prospect.stats?.reb || 0,
        apg: prospect.stats?.ast || 0,
        spg: prospect.stats?.stl || 0,
        bpg: prospect.stats?.blk || 0,
      },
      tournamentGames,
      tournamentAvgs,
      gamesPlayed: completedGamesWithStats.length,
      stockDirection: 'neutral',
    });

    if (espnId) {
      espnIdsToFetch.push({ index: idx, espnId });
    }
  }

  // Step 5b: For prospects without espnId, fetch team rosters to find ESPN athlete IDs
  const missingEspnIdIndices = prospectData
    .map((p, i) => (!p.espnId ? i : null))
    .filter(i => i !== null);

  if (missingEspnIdIndices.length > 0) {
    // Collect unique teamIds that need roster lookups
    const teamsToFetch = new Map(); // teamId → [indices]
    for (const idx of missingEspnIdIndices) {
      const tid = String(prospectData[idx].teamId);
      if (!teamsToFetch.has(tid)) teamsToFetch.set(tid, []);
      teamsToFetch.get(tid).push(idx);
    }

    const teamEntries = Array.from(teamsToFetch.entries());
    const rosterResults = await Promise.allSettled(
      teamEntries.map(([tid]) =>
        fetchWithCache(`${API_BASE}/teams/${tid}/roster`, ROSTER_CACHE_TTL)
      )
    );

    for (let i = 0; i < teamEntries.length; i++) {
      if (rosterResults[i].status !== 'fulfilled') continue;
      const rosterData = rosterResults[i].value;
      const athletes = rosterData?.athletes || [];
      const indices = teamEntries[i][1];

      for (const idx of indices) {
        const prospectName = prospectData[idx].name?.toLowerCase().trim();
        if (!prospectName) continue;

        // Match by name (exact, then fuzzy by last name + first initial)
        const prospectParts = prospectName.split(/\s+/);
        const prospectLast = prospectParts[prospectParts.length - 1];
        const prospectFirst = prospectParts[0] || '';
        const match = athletes.find(a => {
          const dn = (a.displayName || '').toLowerCase().trim();
          const fn = (a.fullName || '').toLowerCase().trim();
          if (dn === prospectName || fn === prospectName) return true;
          // Fuzzy: same last name + first name starts with same letter (handles Jr./III/nicknames)
          const parts = dn.split(/\s+/);
          const last = parts.filter(p => !['jr.', 'jr', 'ii', 'iii', 'iv'].includes(p)).pop() || '';
          const first = parts[0] || '';
          if (last === prospectLast && first[0] === prospectFirst[0]) return true;
          // Also check if prospect last name matches and roster has suffix stripped
          const prospectBase = prospectParts.filter(p => !['jr.', 'jr', 'ii', 'iii', 'iv'].includes(p));
          const rosterBase = parts.filter(p => !['jr.', 'jr', 'ii', 'iii', 'iv'].includes(p));
          return rosterBase.join(' ') === prospectBase.join(' ');
        });

        if (match?.id) {
          const eid = String(match.id);
          prospectData[idx].espnId = eid;
          prospectData[idx].headshot = match.headshot?.href ||
            `https://a.espncdn.com/i/headshots/mens-college-basketball/players/full/${eid}.png`;
          espnIdsToFetch.push({ index: idx, espnId: eid });
        }
      }
    }
  }

  // Step 6: Fetch ESPN season stats for matched prospects (parallel, 6hr cache)
  if (espnIdsToFetch.length > 0) {
    const seasonResults = await Promise.allSettled(
      espnIdsToFetch.map(({ espnId }) =>
        fetchWithCache(`${ATHLETE_API_BASE}/${espnId}/overview`, PLAYER_STATS_CACHE_TTL)
      )
    );

    for (let i = 0; i < espnIdsToFetch.length; i++) {
      if (seasonResults[i].status !== 'fulfilled') continue;
      const data = seasonResults[i].value;
      const idx = espnIdsToFetch[i].index;

      // Fill in missing headshot using ESPN's predictable headshot URL pattern
      if (!prospectData[idx].headshot) {
        const eid = espnIdsToFetch[i].espnId;
        prospectData[idx].headshot = `https://a.espncdn.com/i/headshots/mens-college-basketball/players/full/${eid}.png`;
      }

      const statsObj = data?.statistics;
      if (!statsObj?.names || !statsObj?.splits?.[0]?.stats) continue;

      const names = statsObj.names;
      const values = statsObj.splits[0].stats;
      const parsed = {};
      for (let j = 0; j < names.length; j++) {
        const name = names[j];
        const val = values[j];
        if (name === 'avgPoints') parsed.ppg = parseFloat(val) || 0;
        else if (name === 'avgRebounds') parsed.rpg = parseFloat(val) || 0;
        else if (name === 'avgAssists') parsed.apg = parseFloat(val) || 0;
        else if (name === 'avgMinutes') parsed.mpg = parseFloat(val) || 0;
        else if (name === 'fieldGoalPct') parsed.fgPct = parseFloat(val) || 0;
        else if (name === 'threePointFieldGoalPct') parsed.threePct = parseFloat(val) || 0;
        else if (name === 'freeThrowPct') parsed.ftPct = parseFloat(val) || 0;
        else if (name === 'avgSteals') parsed.spg = parseFloat(val) || 0;
        else if (name === 'avgBlocks') parsed.bpg = parseFloat(val) || 0;
        else if (name === 'gamesPlayed') parsed.gp = parseInt(val) || 0;
      }

      // Merge ESPN season stats (more accurate than Tankathon)
      if (Object.keys(parsed).length > 0) {
        prospectData[idx].seasonStats = { ...prospectData[idx].seasonStats, ...parsed };
      }
    }
  }

  // Step 7: Compute stock direction
  for (const p of prospectData) {
    if (p.gamesPlayed > 0) {
      const seasonPpg = p.seasonStats.ppg || 0;
      const tourneyPpg = p.tournamentAvgs.pts || 0;
      const diff = tourneyPpg - seasonPpg;
      if (diff >= 2) p.stockDirection = 'up';
      else if (diff <= -2) p.stockDirection = 'down';
      else p.stockDirection = 'neutral';
    }
  }

  const result = { prospects: prospectData };
  prospectWatchCache = result;
  prospectWatchCacheTime = Date.now();

  console.log(`[Prospect Watch] Assembled data for ${prospectData.length} prospects in tournament`);
  return result;
}

/**
 * Sync tournament data from ESPN into normalized database tables.
 * Creates/updates tournaments, tournament_teams, and tournament_games rows.
 * Region ordering is frozen on first successful sync — subsequent syncs preserve it.
 */
async function syncTournamentFromESPN(season) {
  const bracketData = await getTournamentBracket(season);
  if (!bracketData.available || !bracketData.regions?.length) {
    console.log(`[TournamentSync] No ESPN data available for season ${season}`);
    return null;
  }

  // Upsert tournament row — freeze regions on first insert, preserve existing on conflict
  const tourney = await db.getOne(
    `INSERT INTO tournaments (season, regions, status, first_game_time, created_at)
     VALUES ($1, $2, 'bracket_set', $3, NOW())
     ON CONFLICT (season) DO UPDATE SET updated_at = NOW()
     RETURNING *`,
    [season, JSON.stringify(bracketData.regions), null]
  );
  const tournamentId = tourney.id;
  // Use the DB-stored regions (frozen from first insert), not the fresh ESPN order
  const canonicalRegions = tourney.regions;

  // If ESPN returned different region ordering than what's stored, remap slots
  const freshRegions = bracketData.regions;
  const needsRemap = JSON.stringify(freshRegions) !== JSON.stringify(canonicalRegions);
  let slotRemap = null;
  if (needsRemap) {
    slotRemap = {};
    for (let round = 0; round <= 3; round++) {
      const rb = ROUND_BOUNDARIES[round];
      for (let i = 0; i < 4; i++) {
        const freshIdx = freshRegions.indexOf(canonicalRegions[i]);
        if (freshIdx < 0) continue;
        for (let j = 0; j < rb.gamesPerRegion; j++) {
          slotRemap[rb.start + freshIdx * rb.gamesPerRegion + j] = rb.start + i * rb.gamesPerRegion + j;
        }
      }
    }
  }

  // Upsert teams
  for (const [teamId, team] of Object.entries(bracketData.teams)) {
    // Determine region_index from slot position
    let regionIdx = 0;
    for (const [slotKey, slot] of Object.entries(bracketData.slots)) {
      const s = parseInt(slotKey);
      if (s >= 1 && s <= 32) {
        if (String(slot.team1?.id) === String(teamId) || String(slot.team2?.id) === String(teamId)) {
          const rawIdx = Math.floor((s - 1) / 8);
          // If remapping, convert from fresh region index to canonical
          if (needsRemap) {
            const freshRegionName = freshRegions[rawIdx];
            regionIdx = canonicalRegions.indexOf(freshRegionName);
            if (regionIdx < 0) regionIdx = rawIdx;
          } else {
            regionIdx = rawIdx;
          }
          break;
        }
      }
    }
    await db.query(
      `INSERT INTO tournament_teams (tournament_id, espn_team_id, name, abbreviation, short_name, logo, color, seed, region_index, record, is_first_four)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       ON CONFLICT (tournament_id, espn_team_id) DO UPDATE SET
         name = EXCLUDED.name, abbreviation = EXCLUDED.abbreviation, short_name = EXCLUDED.short_name,
         logo = EXCLUDED.logo, color = EXCLUDED.color, record = EXCLUDED.record, updated_at = NOW()`,
      [tournamentId, String(teamId), team.name || '', team.abbreviation || '', team.shortName || '', team.logo || '', team.color || '', team.seed || 0, regionIdx, team.record || '', team.isFirstFour || false]
    );
  }

  // Upsert games from slots
  for (const [slotKey, slot] of Object.entries(bracketData.slots)) {
    let slotNum = parseInt(slotKey);
    if (isNaN(slotNum)) continue;

    // Remap slot number if region ordering differs
    if (slotRemap && slotNum >= 1 && slotNum <= 60 && slotRemap[slotNum] !== undefined) {
      slotNum = slotRemap[slotNum];
    }

    const round = slotNum <= 32 ? 0 : slotNum <= 48 ? 1 : slotNum <= 56 ? 2 : slotNum <= 60 ? 3 : slotNum <= 62 ? 4 : 5;
    let regionIdx = null;
    if (round <= 3) {
      const rb = ROUND_BOUNDARIES[round];
      regionIdx = Math.floor((slotNum - rb.start) / rb.gamesPerRegion);
    }

    const gameStatus = slot.status === 'STATUS_FINAL' ? 'final' : slot.status === 'STATUS_IN_PROGRESS' ? 'in_progress' : slot.status === 'STATUS_SCHEDULED' ? 'scheduled' : 'pending';
    const team1Id = slot.team1?.id && !slot.team1?.isFirstFour ? String(slot.team1.id) : null;
    const team2Id = slot.team2?.id && !slot.team2?.isFirstFour ? String(slot.team2.id) : null;
    const winnerId = gameStatus === 'final' ? (slot.team1?.winner ? team1Id : team2Id) : null;
    const loserId = gameStatus === 'final' ? (slot.team1?.winner ? team2Id : team1Id) : null;
    const t1Score = slot.team1?.score != null ? slot.team1.score : null;
    const t2Score = slot.team2?.score != null ? slot.team2.score : null;

    await db.query(
      `INSERT INTO tournament_games (tournament_id, slot_number, round, region_index, espn_event_id, team1_espn_id, team2_espn_id, status, winning_team_espn_id, losing_team_espn_id, team1_score, team2_score, start_time, venue, broadcast, status_detail)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
       ON CONFLICT (tournament_id, slot_number) WHERE slot_number IS NOT NULL DO UPDATE SET
         team1_espn_id = COALESCE(EXCLUDED.team1_espn_id, tournament_games.team1_espn_id),
         team2_espn_id = COALESCE(EXCLUDED.team2_espn_id, tournament_games.team2_espn_id),
         espn_event_id = COALESCE(EXCLUDED.espn_event_id, tournament_games.espn_event_id),
         status = EXCLUDED.status, status_detail = EXCLUDED.status_detail,
         winning_team_espn_id = COALESCE(EXCLUDED.winning_team_espn_id, tournament_games.winning_team_espn_id),
         losing_team_espn_id = COALESCE(EXCLUDED.losing_team_espn_id, tournament_games.losing_team_espn_id),
         team1_score = COALESCE(EXCLUDED.team1_score, tournament_games.team1_score),
         team2_score = COALESCE(EXCLUDED.team2_score, tournament_games.team2_score),
         start_time = COALESCE(EXCLUDED.start_time, tournament_games.start_time),
         venue = COALESCE(EXCLUDED.venue, tournament_games.venue),
         broadcast = COALESCE(EXCLUDED.broadcast, tournament_games.broadcast),
         completed_at = CASE WHEN EXCLUDED.status = 'final' AND tournament_games.completed_at IS NULL THEN NOW() ELSE tournament_games.completed_at END,
         updated_at = NOW()`,
      [tournamentId, slotNum, round, regionIdx, slot.espnEventId || null, team1Id, team2Id, gameStatus, winnerId, loserId, t1Score, t2Score, slot.startDate || null, slot.venue || null, slot.broadcast || null, slot.statusDetail || null]
    );
  }

  // Upsert First Four games
  let ffIndex = 0;
  for (const [eventId, event] of Object.entries(bracketData.events || {})) {
    if (event.round !== -1) continue;
    const regionIdx = canonicalRegions.indexOf(event.region);
    const gameStatus = event.status === 'STATUS_FINAL' ? 'final' : event.status === 'STATUS_IN_PROGRESS' ? 'in_progress' : 'pending';
    const winnerId = gameStatus === 'final' ? (event.team1?.winner ? String(event.team1.id) : String(event.team2.id)) : null;
    const loserId = gameStatus === 'final' ? (event.team1?.winner ? String(event.team2.id) : String(event.team1.id)) : null;

    await db.query(
      `INSERT INTO tournament_games (tournament_id, first_four_index, round, region_index, espn_event_id, team1_espn_id, team2_espn_id, status, winning_team_espn_id, losing_team_espn_id, team1_score, team2_score, start_time, venue, broadcast)
       VALUES ($1, $2, -1, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
       ON CONFLICT (tournament_id, first_four_index) WHERE first_four_index IS NOT NULL DO UPDATE SET
         status = EXCLUDED.status,
         winning_team_espn_id = COALESCE(EXCLUDED.winning_team_espn_id, tournament_games.winning_team_espn_id),
         losing_team_espn_id = COALESCE(EXCLUDED.losing_team_espn_id, tournament_games.losing_team_espn_id),
         team1_score = COALESCE(EXCLUDED.team1_score, tournament_games.team1_score),
         team2_score = COALESCE(EXCLUDED.team2_score, tournament_games.team2_score),
         updated_at = NOW()`,
      [tournamentId, ffIndex, regionIdx >= 0 ? regionIdx : null, eventId,
       event.team1?.id ? String(event.team1.id) : null, event.team2?.id ? String(event.team2.id) : null,
       gameStatus, winnerId, loserId,
       event.team1?.score, event.team2?.score,
       event.startDate || null, event.venue || null, event.broadcast || null]
    );
    ffIndex++;
  }

  // Propagate First Four winners into R64 slots
  await propagateFirstFourWinners(tournamentId);

  // Update tournament status based on game states
  const gameStats = await db.getOne(
    `SELECT
       COUNT(*) FILTER (WHERE status = 'final') as completed,
       COUNT(*) FILTER (WHERE status = 'in_progress') as live,
       COUNT(*) as total
     FROM tournament_games WHERE tournament_id = $1`,
    [tournamentId]
  );
  let status = 'bracket_set';
  if (parseInt(gameStats.completed) >= 67) status = 'completed';
  else if (parseInt(gameStats.completed) > 0 || parseInt(gameStats.live) > 0) status = 'in_progress';
  await db.query('UPDATE tournaments SET status = $1, updated_at = NOW() WHERE id = $2', [status, tournamentId]);

  console.log(`[TournamentSync] Season ${season}: ${gameStats.completed}/${gameStats.total} games complete, status=${status}`);
  return { ...tourney, status };
}

/**
 * Propagate First Four winners into their corresponding R64 slots.
 * When a First Four game finishes, the winning team needs to be placed
 * into the R64 slot that had a NULL team_espn_id for that position.
 * Uses seed + region matching to find the correct R64 slot.
 */
async function propagateFirstFourWinners(tournamentId) {
  // Get all completed First Four games with winner info
  const ffGames = await db.getAll(
    `SELECT tg.*, tt1.seed as team1_seed, tt1.region_index as team1_region,
            tt2.seed as team2_seed, tt2.region_index as team2_region
     FROM tournament_games tg
     LEFT JOIN tournament_teams tt1 ON tt1.tournament_id = tg.tournament_id AND tt1.espn_team_id = tg.team1_espn_id
     LEFT JOIN tournament_teams tt2 ON tt2.tournament_id = tg.tournament_id AND tt2.espn_team_id = tg.team2_espn_id
     WHERE tg.tournament_id = $1 AND tg.round = -1 AND tg.status = 'final' AND tg.winning_team_espn_id IS NOT NULL`,
    [tournamentId]
  );

  if (ffGames.length === 0) return 0;

  let propagated = 0;
  for (const ff of ffGames) {
    const winnerId = ff.winning_team_espn_id;
    const winnerSeed = winnerId === ff.team1_espn_id ? ff.team1_seed : ff.team2_seed;
    const regionIdx = ff.region_index;

    if (winnerSeed == null || regionIdx == null) continue;

    // Find which R64 slot this First Four winner belongs in
    // SEED_MATCHUPS maps matchup index to seed pairs: [[1,16],[8,9],[5,12],[4,13],[6,11],[3,14],[7,10],[2,15]]
    const matchupIdx = SEED_MATCHUPS.findIndex(([s1, s2]) => s1 === winnerSeed || s2 === winnerSeed);
    if (matchupIdx < 0) continue;

    const slotNum = regionIdx * 8 + 1 + matchupIdx;
    const [highSeed] = SEED_MATCHUPS[matchupIdx];
    // First Four teams are always the lower seed (e.g., 11 or 16)
    const isTeam2 = winnerSeed !== highSeed;

    const teamCol = isTeam2 ? 'team2_espn_id' : 'team1_espn_id';
    const result = await db.run(
      `UPDATE tournament_games SET ${teamCol} = $1, updated_at = NOW()
       WHERE tournament_id = $2 AND slot_number = $3 AND (${teamCol} IS NULL OR ${teamCol} LIKE 'ff-%')`,
      [winnerId, tournamentId, slotNum]
    );

    if (result?.rowCount > 0) {
      propagated++;
      console.log(`[FirstFour] Propagated winner ${winnerId} (seed ${winnerSeed}) → slot ${slotNum} (${teamCol})`);
    }
  }

  if (propagated > 0) {
    console.log(`[FirstFour] Propagated ${propagated} First Four winners into R64 slots`);
  }
  return propagated;
}

/**
 * Refresh a single game from ESPN using its espn_event_id.
 * Fetches the ESPN scoreboard event and overwrites the game's scores/status/winner.
 * Also dual-writes to bracket_results if the game has a slot_number.
 */
async function refreshGameFromESPN(tournamentId, gameId) {
  const game = await db.getOne(
    'SELECT * FROM tournament_games WHERE tournament_id = $1 AND id = $2',
    [tournamentId, gameId]
  );
  if (!game) throw new Error('Game not found');
  if (!game.espn_event_id) throw new Error('Game has no ESPN event ID — cannot refresh');

  // Fetch the event summary from ESPN
  const url = `${API_BASE}/summary?event=${game.espn_event_id}`;
  const data = await fetchWithCache(url, TOURNAMENT_CACHE_TTL);

  const competition = data?.header?.competitions?.[0];
  if (!competition) throw new Error('No competition data returned from ESPN');

  const competitors = competition.competitors || [];
  if (competitors.length < 2) throw new Error('ESPN returned fewer than 2 competitors');

  const comp1 = competitors[0];
  const comp2 = competitors[1];
  const statusType = competition.status?.type?.name || data?.header?.season?.type?.name;
  const gameStatus = statusType === 'STATUS_FINAL' ? 'final'
    : statusType === 'STATUS_IN_PROGRESS' ? 'in_progress'
    : 'pending';

  const team1EspnId = String(comp1.id);
  const team2EspnId = String(comp2.id);
  const team1Score = comp1.score != null ? parseInt(comp1.score) : null;
  const team2Score = comp2.score != null ? parseInt(comp2.score) : null;
  const winnerId = gameStatus === 'final' ? (comp1.winner ? team1EspnId : team2EspnId) : null;
  const loserId = gameStatus === 'final' ? (comp1.winner ? team2EspnId : team1EspnId) : null;

  // Extract venue and broadcast from gameInfo if available
  const gameInfo = data?.gameInfo;
  const venue = gameInfo?.venue?.fullName || game.venue;
  const broadcast = competition.broadcasts?.[0]?.media?.shortName || game.broadcast;
  const startTime = competition.date || game.start_time;
  const statusDetail = competition.status?.type?.detail || null;

  const updated = await db.getOne(
    `UPDATE tournament_games SET
      team1_espn_id = $1, team2_espn_id = $2,
      team1_score = $3, team2_score = $4,
      winning_team_espn_id = $5, losing_team_espn_id = $6,
      status = $7, status_detail = $8,
      venue = $9, broadcast = $10, start_time = $11,
      completed_at = CASE WHEN $7 = 'final' AND completed_at IS NULL THEN NOW() ELSE completed_at END,
      updated_at = NOW()
     WHERE tournament_id = $12 AND id = $13 RETURNING *`,
    [team1EspnId, team2EspnId, team1Score, team2Score, winnerId, loserId,
     gameStatus, statusDetail, venue, broadcast, startTime, tournamentId, gameId]
  );

  // Dual-write to bracket_results if this is a bracket game (has slot_number)
  if (updated.slot_number && gameStatus === 'final' && winnerId) {
    const challenges = await db.getAll('SELECT id FROM bracket_challenges WHERE tournament_id = $1', [tournamentId]);
    for (const c of challenges) {
      const wScore = comp1.winner ? team1Score : team2Score;
      const lScore = comp1.winner ? team2Score : team1Score;
      await db.run(`
        INSERT INTO bracket_results (challenge_id, slot_number, espn_event_id, winning_team_id, losing_team_id, winning_score, losing_score, round, status, completed_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'final', NOW())
        ON CONFLICT (challenge_id, slot_number) DO UPDATE SET
          winning_team_id = EXCLUDED.winning_team_id, losing_team_id = EXCLUDED.losing_team_id,
          winning_score = EXCLUDED.winning_score, losing_score = EXCLUDED.losing_score,
          status = 'final', completed_at = COALESCE(bracket_results.completed_at, NOW())
      `, [c.id, updated.slot_number, updated.espn_event_id, winnerId, loserId, wScore, lScore, updated.round]);
    }
  }

  // If game went final, mark the losing team as eliminated
  if (gameStatus === 'final' && loserId) {
    await db.run(
      'UPDATE tournament_teams SET eliminated = true, updated_at = NOW() WHERE tournament_id = $1 AND espn_team_id = $2',
      [tournamentId, loserId]
    );
    // Ensure winner is NOT eliminated (in case a previous bad result marked them)
    await db.run(
      'UPDATE tournament_teams SET eliminated = false, updated_at = NOW() WHERE tournament_id = $1 AND espn_team_id = $2',
      [tournamentId, winnerId]
    );
  }

  console.log(`[TournamentSync] Refreshed game ${gameId} (ESPN ${game.espn_event_id}): ${gameStatus} ${team1Score}-${team2Score}`);
  return updated;
}

/**
 * Build the tournament_data JSON shape from normalized tables.
 * Returns the same format that the client expects, so no client changes needed.
 */
async function buildTournamentDataFromDB(tournamentId) {
  const tournament = await db.getOne('SELECT * FROM tournaments WHERE id = $1', [tournamentId]);
  if (!tournament) return null;

  const teams = await db.getAll('SELECT * FROM tournament_teams WHERE tournament_id = $1', [tournamentId]);
  const games = await db.getAll('SELECT * FROM tournament_games WHERE tournament_id = $1', [tournamentId]);

  const teamsMap = {};
  for (const t of teams) {
    teamsMap[t.espn_team_id] = {
      id: t.espn_team_id,
      name: t.name,
      abbreviation: t.abbreviation || '',
      shortName: t.short_name || '',
      logo: t.logo || '',
      color: t.color || '',
      seed: t.seed,
      record: t.record || '',
      isFirstFour: t.is_first_four || false,
    };
  }

  const slots = {};
  const events = {};
  for (const g of games) {
    const team1 = g.team1_espn_id ? teamsMap[g.team1_espn_id] : null;
    const team2 = g.team2_espn_id ? teamsMap[g.team2_espn_id] : null;

    // Add scores and winner flags from game data
    const team1WithScore = team1 ? { ...team1, score: g.team1_score, winner: g.winning_team_espn_id === g.team1_espn_id } : null;
    const team2WithScore = team2 ? { ...team2, score: g.team2_score, winner: g.winning_team_espn_id === g.team2_espn_id } : null;

    const espnStatus = g.status === 'final' ? 'STATUS_FINAL' : g.status === 'in_progress' ? 'STATUS_IN_PROGRESS' : 'STATUS_SCHEDULED';

    if (g.slot_number) {
      slots[g.slot_number] = {
        team1: team1WithScore,
        team2: team2WithScore,
        espnEventId: g.espn_event_id,
        status: espnStatus,
        statusDetail: g.status_detail || '',
        startDate: g.start_time,
        venue: g.venue || '',
        broadcast: g.broadcast || '',
      };
    }

    if (g.espn_event_id) {
      const regionName = g.region_index != null && tournament.regions[g.region_index] ? tournament.regions[g.region_index] : null;
      events[g.espn_event_id] = {
        espnEventId: g.espn_event_id,
        region: regionName,
        round: g.round,
        team1: team1WithScore,
        team2: team2WithScore,
        status: espnStatus,
        statusDetail: g.status_detail || '',
        startDate: g.start_time,
        venue: g.venue || '',
        broadcast: g.broadcast || '',
      };
    }
  }

  return {
    teams: teamsMap,
    slots,
    regions: tournament.regions,
    events,
    available: true,
  };
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
  generateMatchupReport,
  generateAllReports,
  getStoredReport,
  getStoredMatchupReport,
  getProspectTournamentStats,
  syncTournamentFromESPN,
  buildTournamentDataFromDB,
  refreshGameFromESPN,
  propagateFirstFourWinners,
};
