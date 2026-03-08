// Shared ESPN API Infrastructure
// Provides fetch+cache pattern used by all sport services

const cache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

const fetchWithCache = async (url, ttl = CACHE_TTL) => {
  const cached = cache.get(url);
  if (cached && Date.now() - cached.timestamp < ttl) {
    return cached.data;
  }

  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`ESPN API error: ${response.status}`);
    }

    const data = await response.json();
    cache.set(url, { data, timestamp: Date.now() });
    return data;
  } catch (error) {
    console.error(`Fetch error for ${url}:`, error.message);
    if (cached) {
      console.warn('Using stale cache due to fetch error');
      return cached.data;
    }
    throw error;
  }
};

const clearCache = () => {
  console.log(`[ESPN Cache] Clearing ${cache.size} cached entries`);
  cache.clear();
};

/**
 * Parse season averages from ESPN summary boxscore.teams statistics.
 * For upcoming games, boxscore.teams[n].statistics contains season-level stats
 * like streak, avgPointsAgainst, Last Ten Games.
 * Returns { home: { stats: {...}, streak, lastTen }, away: { ... } }
 */
const parseBoxscoreSeasonStats = (boxscore) => {
  if (!boxscore?.teams || boxscore.teams.length < 2) return null;

  const parseTeamStats = (teamData) => {
    const stats = {};
    let streak = null;
    let lastTen = null;

    (teamData?.statistics || []).forEach(s => {
      if (s.name === 'streak' && s.displayValue) {
        const match = s.displayValue.match(/^([WLT])(\d+)$/);
        if (match) streak = { type: match[1], count: parseInt(match[2]) };
      } else if (s.name === 'Last Ten Games') {
        lastTen = s.displayValue;
      } else {
        stats[s.name] = {
          displayValue: s.displayValue,
          label: s.label || s.name
        };
      }
    });

    return { stats, streak, lastTen };
  };

  return {
    home: parseTeamStats(boxscore.teams.find(t => t.homeAway === 'home') || boxscore.teams[0]),
    away: parseTeamStats(boxscore.teams.find(t => t.homeAway === 'away') || boxscore.teams[1])
  };
};

module.exports = { fetchWithCache, clearCache, parseBoxscoreSeasonStats };
