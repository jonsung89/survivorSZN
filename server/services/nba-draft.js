// NBA Draft Prospect Rankings Service
// Scrapes Tankathon big board and caches for 24 hours

const { fetchWithCache } = require('./espn');
const { uploadProspectHeadshot, getProspectHeadshotUrl, isConfigured: isR2Configured } = require('./r2');
const { db } = require('../db/supabase');

// School alias mapping (kept in sync with ncaab-tournament.js SCHOOL_ALIASES)
const SCHOOL_ALIASES = {
  'uconn': 'connecticut', 'smu': 'southern methodist', 'ucf': 'central florida',
  'unc': 'north carolina', 'lsu': 'louisiana state', 'vcu': 'virginia commonwealth',
  'unlv': 'nevada-las vegas', 'utep': 'texas-el paso', 'ole miss': 'mississippi',
  'pitt': 'pittsburgh', 'miami': 'miami', 'usc': 'southern california',
  'cal': 'california', 'byu': 'brigham young', 'nc state': 'nc state',
  'texas a&m': 'texas a&m', 'michigan st': 'michigan state', 'ohio st': 'ohio state',
  'iowa st': 'iowa state', 'penn st': 'penn state',
};

function matchSchoolToTeam(prospectSchool, teams) {
  if (!prospectSchool) return null;
  const schoolLower = prospectSchool.toLowerCase().trim();
  const aliased = SCHOOL_ALIASES[schoolLower] || schoolLower;
  const teamList = Object.values(teams);
  for (const team of teamList) {
    const shortName = (team.shortName || '').toLowerCase();
    if (shortName === schoolLower || shortName === aliased) return team;
  }
  for (const team of teamList) {
    const fullName = (team.name || '').toLowerCase();
    if (fullName === aliased || fullName === schoolLower) return team;
    if (fullName.startsWith(aliased + ' ') || fullName.startsWith(schoolLower + ' ')) return team;
  }
  return null;
}

const TANKATHON_URL = 'https://tankathon.com/big_board';
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours
const ESPN_API_BASE = 'https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball';
const ATHLETE_API_BASE = 'https://site.web.api.espn.com/apis/common/v3/sports/basketball/mens-college-basketball/athletes';
const ROSTER_CACHE_TTL = 6 * 60 * 60 * 1000;
const PLAYER_STATS_CACHE_TTL = 6 * 60 * 60 * 1000;
const TEAMS_CACHE_TTL = 24 * 60 * 60 * 1000;

let cachedProspects = null;
let cacheTimestamp = 0;
let enrichedProspectsCache = null;
let enrichedCacheTimestamp = 0;
const uploadedHeadshots = new Set(); // track ESPN IDs already uploaded to R2

/**
 * Normalize a player name for fuzzy matching.
 * Strips suffixes, accents, extra whitespace, lowercases.
 */
function normalizeName(name) {
  if (!name) return '';
  return name
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // strip accents
    .replace(/\b(Jr\.?|Sr\.?|II|III|IV)\b/gi, '')     // strip suffixes
    .replace(/[^a-zA-Z\s]/g, '')                       // strip non-alpha
    .replace(/\s+/g, ' ')                              // collapse whitespace
    .trim()
    .toLowerCase();
}

/**
 * Parse prospect rows from Tankathon HTML.
 * Extracts: rank, name, position, school, height, weight, year, age, stats, logo.
 *
 * HTML structure per prospect:
 *   <div class="mock-row" data-pos="PF" data-year="Freshman">
 *     <div class="mock-row-pick-number">1</div>
 *     <div class="mock-row-logo"><a href="..."><img class="nba-30" src="...logo..."></a></div>
 *     <div class="mock-row-player">
 *       <div class="mock-row-name">Cameron Boozer</div>
 *       <div class="mock-row-school-position">PF | Duke</div>
 *     </div>
 *     <div class="mock-row-measurements">
 *       <div class="section height-weight"><div>6'9"</div><div>250 lbs</div></div>
 *       <div class="section year-age"><div>Freshman</div><div>18.9 yrs</div></div>
 *     </div>
 *     <div class="mock-row-universal-data">
 *       <div class="universal-stat stats-per-game">
 *         <div class="stat"><div class="label">pts</div><div class="value">22.5</div></div>
 *         ...
 *       </div>
 *     </div>
 *   </div>
 */
function parseProspects(html) {
  const prospects = [];

  // Split HTML by mock-row boundaries
  // Each mock-row starts with <div class="mock-row" and contains nested divs
  const rowSplits = html.split(/<div\s+class="mock-row"/);

  for (let i = 1; i < rowSplits.length; i++) {
    const chunk = rowSplits[i];

    // Rank
    const rankMatch = chunk.match(/<div\s+class="mock-row-pick-number">\s*(\d+)\s*<\/div>/);
    if (!rankMatch) continue;
    const rank = parseInt(rankMatch[1]);

    // Name
    const nameMatch = chunk.match(/<div\s+class="mock-row-name">\s*([^<]+)\s*<\/div>/);
    if (!nameMatch) continue;
    const name = nameMatch[1].trim();

    // Position + School
    const posMatch = chunk.match(/<div\s+class="mock-row-school-position">\s*([^<]+)\s*<\/div>/);
    const posParts = (posMatch?.[1] || '').split('|').map(s => s.trim());
    const position = posParts[0] || '';
    const school = posParts[1] || '';

    // School logo
    const logoMatch = chunk.match(/<div\s+class="mock-row-logo">[\s\S]*?<img[^>]+src="([^"]+)"/);
    const logo = logoMatch?.[1] || null;

    // Height + Weight from height-weight section
    const hwMatch = chunk.match(/class="section height-weight">\s*<div>([^<]*)<\/div>\s*<div>([^<]*)/);
    const height = (hwMatch?.[1] || '').replace(/&#39;/g, "'").replace(/&quot;/g, '"').trim();
    const weight = (hwMatch?.[2] || '').replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/\s*lbs\s*/i, '').trim();

    // Year + Age from year-age section
    const yaMatch = chunk.match(/class="section year-age[^"]*">\s*<div>([^<]*)<\/div>\s*<div>([^<]*)/);
    const year = yaMatch?.[1]?.trim() || '';

    // Per-game stats from stats-per-game section
    const stats = {};
    const pgMatch = chunk.match(/class="universal-stat stats-per-game"[^>]*>([\s\S]*?)<\/div>\s*<div\s+class="universal-stat stats-per-36"/);
    if (pgMatch) {
      const statsBlock = pgMatch[1];
      const statRegex = /<div\s+class="label">([^<]+)<\/div>\s*<div\s+class="value[^"]*">([^<]+)<\/div>/g;
      let sm;
      while ((sm = statRegex.exec(statsBlock)) !== null) {
        stats[sm[1].trim().toLowerCase()] = parseFloat(sm[2].trim()) || 0;
      }
    }

    // Skip duplicates (Tankathon renders two sets of rows: per-game and per-36)
    if (prospects.some(p => p.rank === rank && p.normalizedName === normalizeName(name))) continue;

    prospects.push({
      rank,
      name,
      normalizedName: normalizeName(name),
      position,
      school,
      logo,
      height,
      weight,
      year,
      stats,
    });
  }

  // Sort by rank ascending
  prospects.sort((a, b) => a.rank - b.rank);

  return prospects;
}

/**
 * Fetch and cache draft prospects from Tankathon.
 */
async function getDraftProspects() {
  if (cachedProspects && Date.now() - cacheTimestamp < CACHE_TTL) {
    return cachedProspects;
  }

  try {
    const response = await fetch(TANKATHON_URL, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; SurvivorSZN/1.0)',
        'Accept': 'text/html',
      },
    });

    if (!response.ok) {
      throw new Error(`Tankathon fetch error: ${response.status}`);
    }

    const html = await response.text();
    const prospects = parseProspects(html);

    if (prospects.length > 0) {
      cachedProspects = prospects;
      cacheTimestamp = Date.now();
      console.log(`[NBA Draft] Cached ${prospects.length} prospects from Tankathon`);
    } else {
      console.warn('[NBA Draft] No prospects parsed from Tankathon HTML');
      if (cachedProspects) return cachedProspects;
    }

    return prospects;
  } catch (error) {
    console.error('[NBA Draft] Error fetching prospects:', error.message);
    if (cachedProspects) {
      console.warn('[NBA Draft] Using stale cache due to fetch error');
      return cachedProspects;
    }
    return [];
  }
}

/**
 * Find draft rank for a player by name.
 * Reads from DB first, falls back to Tankathon cache.
 */
async function findDraftRank(playerName) {
  const normalized = normalizeName(playerName);
  if (!normalized) return null;

  let prospects = await getProspectsFromDB('nba', getCurrentDraftYear());
  if (prospects.length === 0) {
    prospects = await getDraftProspects();
  }

  const exact = prospects.find(p => (p.normalizedName || normalizeName(p.name)) === normalized);
  return exact || null;
}

/**
 * Enrich an array of player objects with draftRank field.
 * Reads from DB first (source of truth), falls back to Tankathon cache.
 */
async function enrichPlayersWithDraftRank(players) {
  if (!players || players.length === 0) return players;

  // Prefer DB data
  let prospects = await getProspectsFromDB('nba', getCurrentDraftYear());
  if (prospects.length === 0) {
    prospects = await getDraftProspects();
  }
  if (prospects.length === 0) return players;

  for (const player of players) {
    const normalized = normalizeName(player.name || player.shortName);
    if (!normalized) continue;
    const match = prospects.find(p => (p.normalizedName || normalizeName(p.name)) === normalized);
    if (match) {
      player.draftRank = match.rank;
    }
  }

  return players;
}

/**
 * Enrich prospects with ESPN data: headshots (stored in R2), jersey numbers,
 * and accurate season stats (FG%, 3P%, FT%, MPG, GP).
 */
async function enrichProspectsWithESPN(prospects) {
  if (!prospects?.length) return [];

  // Return cached enriched data if still fresh
  if (enrichedProspectsCache && Date.now() - enrichedCacheTimestamp < CACHE_TTL) {
    return enrichedProspectsCache;
  }

  console.log(`[NBA Draft] Enriching ${prospects.length} prospects with ESPN data...`);

  // Deep clone so we don't mutate the base cache
  const enriched = prospects.map(p => ({ ...p, stats: { ...p.stats } }));

  // Step 1: Get all D1 teams from ESPN
  let allTeams = [];
  try {
    // ESPN paginates — page 1 + page 2 covers all D1 teams
    const [page1, page2] = await Promise.all([
      fetchWithCache(`${ESPN_API_BASE}/teams?limit=200&page=1`, TEAMS_CACHE_TTL),
      fetchWithCache(`${ESPN_API_BASE}/teams?limit=200&page=2`, TEAMS_CACHE_TTL),
    ]);
    const teams1 = page1?.sports?.[0]?.leagues?.[0]?.teams?.map(t => t.team) || [];
    const teams2 = page2?.sports?.[0]?.leagues?.[0]?.teams?.map(t => t.team) || [];
    allTeams = [...teams1, ...teams2];
  } catch (err) {
    console.error('[NBA Draft] Failed to fetch ESPN teams:', err.message);
    return enriched;
  }

  // Build team lookup by various name forms
  const teamMap = {};
  for (const team of allTeams) {
    if (!team?.id) continue;
    const t = {
      id: String(team.id),
      name: team.displayName || team.name || '',
      shortName: team.shortDisplayName || team.nickname || '',
      abbreviation: team.abbreviation || '',
      logo: team.logos?.[0]?.href || null,
    };
    teamMap[t.id] = t;
  }

  // Step 2: Match each prospect to an ESPN team
  const teamIdToProspectIndices = new Map(); // teamId → [indices]
  for (let i = 0; i < enriched.length; i++) {
    const team = matchSchoolToTeam(enriched[i].school, teamMap);
    if (team) {
      enriched[i]._teamId = team.id;
      if (!teamIdToProspectIndices.has(team.id)) teamIdToProspectIndices.set(team.id, []);
      teamIdToProspectIndices.get(team.id).push(i);
    }
  }

  // Step 3: Fetch rosters for matched teams
  const teamEntries = Array.from(teamIdToProspectIndices.entries());
  const rosterResults = await Promise.allSettled(
    teamEntries.map(([tid]) =>
      fetchWithCache(`${ESPN_API_BASE}/teams/${tid}/roster`, ROSTER_CACHE_TTL)
    )
  );

  const espnIdsToFetch = []; // { index, espnId }

  for (let i = 0; i < teamEntries.length; i++) {
    if (rosterResults[i].status !== 'fulfilled') continue;
    const athletes = rosterResults[i].value?.athletes || [];
    const indices = teamEntries[i][1];

    for (const idx of indices) {
      const prospectName = enriched[idx].name?.toLowerCase().trim();
      if (!prospectName) continue;

      const prospectParts = prospectName.split(/\s+/);
      const prospectLast = prospectParts[prospectParts.length - 1];
      const prospectFirst = prospectParts[0] || '';

      const match = athletes.find(a => {
        const dn = (a.displayName || '').toLowerCase().trim();
        const fn = (a.fullName || '').toLowerCase().trim();
        if (dn === prospectName || fn === prospectName) return true;
        // Fuzzy: same last name + first name starts with same letter
        const parts = dn.split(/\s+/);
        const last = parts.filter(p => !['jr.', 'jr', 'ii', 'iii', 'iv'].includes(p)).pop() || '';
        const first = parts[0] || '';
        if (last === prospectLast && first[0] === prospectFirst[0]) return true;
        // Also check suffix-stripped versions
        const prospectBase = prospectParts.filter(p => !['jr.', 'jr', 'ii', 'iii', 'iv'].includes(p));
        const rosterBase = parts.filter(p => !['jr.', 'jr', 'ii', 'iii', 'iv'].includes(p));
        return rosterBase.join(' ') === prospectBase.join(' ');
      });

      if (match?.id) {
        const eid = String(match.id);
        enriched[idx].espnId = eid;
        enriched[idx].jersey = match.jersey || null;
        enriched[idx].espnHeadshot = match.headshot?.href ||
          `https://a.espncdn.com/i/headshots/mens-college-basketball/players/full/${eid}.png`;
        espnIdsToFetch.push({ index: idx, espnId: eid });
      }
    }
  }

  // Step 4: Fetch ESPN season stats in parallel
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

      const statsObj = data?.statistics;
      if (!statsObj?.names || !statsObj?.splits?.[0]?.stats) continue;

      const names = statsObj.names;
      const values = statsObj.splits[0].stats;
      const espnStats = {};
      for (let j = 0; j < names.length; j++) {
        const name = names[j];
        const val = values[j];
        if (name === 'avgPoints') espnStats.ppg = parseFloat(val) || 0;
        else if (name === 'avgRebounds') espnStats.rpg = parseFloat(val) || 0;
        else if (name === 'avgAssists') espnStats.apg = parseFloat(val) || 0;
        else if (name === 'avgMinutes') espnStats.mpg = parseFloat(val) || 0;
        else if (name === 'fieldGoalPct') espnStats.fgPct = parseFloat(val) || 0;
        else if (name === 'threePointFieldGoalPct') espnStats.threePct = parseFloat(val) || 0;
        else if (name === 'freeThrowPct') espnStats.ftPct = parseFloat(val) || 0;
        else if (name === 'avgSteals') espnStats.spg = parseFloat(val) || 0;
        else if (name === 'avgBlocks') espnStats.bpg = parseFloat(val) || 0;
        else if (name === 'gamesPlayed') espnStats.gp = parseInt(val) || 0;
      }

      if (Object.keys(espnStats).length > 0) {
        enriched[idx].espnStats = espnStats;
      }
    }
  }

  // Step 5: Download and upload headshots to R2
  if (isR2Configured()) {
    const toUpload = espnIdsToFetch.filter(({ espnId }) => !uploadedHeadshots.has(espnId));

    if (toUpload.length > 0) {
      console.log(`[NBA Draft] Uploading ${toUpload.length} headshots to R2...`);
      const uploadResults = await Promise.allSettled(
        toUpload.map(async ({ index, espnId }) => {
          const headshotUrl = enriched[index].espnHeadshot;
          if (!headshotUrl) return null;
          try {
            const resp = await fetch(headshotUrl);
            if (!resp.ok) return null;
            const buffer = Buffer.from(await resp.arrayBuffer());
            const contentType = resp.headers.get('content-type') || 'image/png';
            await uploadProspectHeadshot(espnId, buffer, contentType);
            uploadedHeadshots.add(espnId);
            return espnId;
          } catch (err) {
            console.warn(`[NBA Draft] Failed to upload headshot for ${espnId}:`, err.message);
            return null;
          }
        })
      );
      const uploaded = uploadResults.filter(r => r.status === 'fulfilled' && r.value).length;
      console.log(`[NBA Draft] Uploaded ${uploaded}/${toUpload.length} headshots to R2`);
    }

    // Set R2 URLs for all prospects with ESPN IDs
    for (const { index, espnId } of espnIdsToFetch) {
      enriched[index].headshotUrl = getProspectHeadshotUrl(espnId);
    }
  } else {
    // R2 not configured — use ESPN URLs directly
    for (const { index } of espnIdsToFetch) {
      enriched[index].headshotUrl = enriched[index].espnHeadshot || null;
    }
  }

  // Clean up internal fields
  for (const p of enriched) {
    delete p._teamId;
    delete p.espnHeadshot;
  }

  enrichedProspectsCache = enriched;
  enrichedCacheTimestamp = Date.now();
  console.log(`[NBA Draft] Enrichment complete. ${espnIdsToFetch.length}/${enriched.length} matched to ESPN`);

  return enriched;
}

/**
 * Clear the in-memory prospect cache.
 */
function clearProspectCache() {
  cachedProspects = null;
  cacheTimestamp = 0;
  enrichedProspectsCache = null;
  enrichedCacheTimestamp = 0;
  uploadedHeadshots.clear();
}

/**
 * Get cache metadata.
 */
function getCacheInfo() {
  return {
    cachedAt: cacheTimestamp || null,
    count: cachedProspects?.length || 0,
    ttl: CACHE_TTL,
  };
}

// ─── Database Functions ──────────────────────────────────────────────────────

/**
 * Get the current draft year (NBA draft happens in June, so prospects
 * scraped Jan-June are for current year, July-Dec for next year).
 */
function getCurrentDraftYear() {
  const now = new Date();
  const month = now.getMonth(); // 0-indexed
  return month >= 6 ? now.getFullYear() + 1 : now.getFullYear();
}

/**
 * Save enriched prospects to the database, replacing existing data for that sport+year.
 */
async function saveProspectsToDB(prospects, sport = 'nba', draftYear = null) {
  const year = draftYear || getCurrentDraftYear();
  if (!prospects?.length) return;

  await db.run('DELETE FROM draft_prospects WHERE sport = $1 AND draft_year = $2', [sport, year]);

  for (const p of prospects) {
    await db.run(
      `INSERT INTO draft_prospects (sport, draft_year, rank, name, normalized_name, position, school, height, weight, year, logo, stats, espn_id, jersey, headshot_url, espn_stats)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`,
      [
        sport, year, p.rank, p.name, p.normalizedName || normalizeName(p.name),
        p.position || null, p.school || null, p.height || null, p.weight || null, p.year || null,
        p.logo || null, JSON.stringify(p.stats || {}),
        p.espnId || null, p.jersey || null, p.headshotUrl || null,
        p.espnStats ? JSON.stringify(p.espnStats) : null,
      ]
    );
  }

  console.log(`[NBA Draft] Saved ${prospects.length} prospects to DB (${sport} ${year})`);
}

/**
 * Read prospects from the database for a given sport+year.
 */
async function getProspectsFromDB(sport = 'nba', draftYear = null) {
  const year = draftYear || getCurrentDraftYear();
  const rows = await db.getAll(
    'SELECT * FROM draft_prospects WHERE sport = $1 AND draft_year = $2 ORDER BY rank ASC',
    [sport, year]
  );

  return rows.map(r => ({
    rank: r.rank,
    name: r.name,
    normalizedName: r.normalized_name,
    position: r.position,
    school: r.school,
    height: r.height,
    weight: r.weight,
    year: r.year,
    logo: r.logo,
    stats: r.stats || {},
    espnId: r.espn_id,
    jersey: r.jersey,
    headshotUrl: r.headshot_url,
    espnStats: r.espn_stats || null,
  }));
}

/**
 * Get available draft years for a sport.
 */
async function getDraftYears(sport = 'nba') {
  const rows = await db.getAll(
    'SELECT DISTINCT draft_year FROM draft_prospects WHERE sport = $1 ORDER BY draft_year DESC',
    [sport]
  );
  return rows.map(r => r.draft_year);
}

/**
 * Get the last time prospects were updated for a given sport+year.
 */
async function getProspectsLastUpdated(sport = 'nba', draftYear = null) {
  const year = draftYear || getCurrentDraftYear();
  const row = await db.getOne(
    'SELECT MAX(updated_at) as last_updated FROM draft_prospects WHERE sport = $1 AND draft_year = $2',
    [sport, year]
  );
  return row?.last_updated || null;
}

/**
 * Fetch fresh prospect data from Tankathon + ESPN without saving to DB.
 * Used for staging/preview before admin confirms.
 */
async function fetchStagedProspects() {
  clearProspectCache();
  const baseProspects = await getDraftProspects();
  const enriched = await enrichProspectsWithESPN(baseProspects);
  return enriched;
}

module.exports = {
  getDraftProspects,
  findDraftRank,
  enrichPlayersWithDraftRank,
  enrichProspectsWithESPN,
  normalizeName,
  clearProspectCache,
  getCacheInfo,
  getCurrentDraftYear,
  saveProspectsToDB,
  getProspectsFromDB,
  getProspectsLastUpdated,
  getDraftYears,
  fetchStagedProspects,
};
