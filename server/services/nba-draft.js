// NBA Draft Prospect Rankings Service
// Scrapes Tankathon big board and caches for 24 hours

const TANKATHON_URL = 'https://tankathon.com/big_board';
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

let cachedProspects = null;
let cacheTimestamp = 0;

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
 */
async function findDraftRank(playerName) {
  const prospects = await getDraftProspects();
  const normalized = normalizeName(playerName);
  if (!normalized) return null;
  const exact = prospects.find(p => p.normalizedName === normalized);
  return exact || null;
}

/**
 * Enrich an array of player objects with draftRank field.
 */
async function enrichPlayersWithDraftRank(players) {
  if (!players || players.length === 0) return players;

  const prospects = await getDraftProspects();
  if (prospects.length === 0) return players;

  for (const player of players) {
    const normalized = normalizeName(player.name || player.shortName);
    if (!normalized) continue;
    const match = prospects.find(p => p.normalizedName === normalized);
    if (match) {
      player.draftRank = match.rank;
    }
  }

  return players;
}

module.exports = {
  getDraftProspects,
  findDraftRank,
  enrichPlayersWithDraftRank,
  normalizeName,
};
