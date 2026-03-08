// Daily Sport Factory - Creates a service for any date-based ESPN sport
// All ESPN sports follow the same API patterns for scoreboard, teams, and summary endpoints

const { fetchWithCache } = require('./espn');

const TEAMS_CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours
const GAME_DETAILS_CACHE_TTL = 2 * 60 * 1000; // 2 minutes

function createDailySportService({ apiBase, sportName, parseGameDetails, teamStatsConfig }) {

  /**
   * Get current season info from ESPN scoreboard (no date param = today)
   */
  const getCurrentSeason = async () => {
    try {
      const data = await fetchWithCache(`${apiBase}/scoreboard`);
      const league = data.leagues?.[0];
      const today = new Date();
      const dateStr = today.toISOString().split('T')[0]; // YYYY-MM-DD

      return {
        season: league?.season?.year || today.getFullYear(),
        seasonType: league?.season?.type?.type || 1,
        date: dateStr
      };
    } catch (error) {
      console.error(`[${sportName}] getCurrentSeason error:`, error.message);
      const today = new Date();
      return {
        season: today.getFullYear(),
        seasonType: 1,
        date: today.toISOString().split('T')[0]
      };
    }
  };

  /**
   * Get schedule for a specific date
   * @param {string} dateStr - Date in YYYY-MM-DD format
   */
  const getScheduleByDate = async (dateStr) => {
    try {
      // Convert YYYY-MM-DD to YYYYMMDD for ESPN
      const espnDate = dateStr.replace(/-/g, '');
      const url = `${apiBase}/scoreboard?dates=${espnDate}`;
      console.log(`[${sportName}] Fetching schedule for ${dateStr}: ${url}`);
      const data = await fetchWithCache(url);

      if (!data.events) {
        console.log(`[${sportName}] No events found for ${dateStr}`);
        return [];
      }

      console.log(`[${sportName}] Found ${data.events.length} games for ${dateStr}`);

      return data.events.map(event => {
        const competition = event.competitions?.[0];
        const homeCompetitor = competition?.competitors?.find(c => c.homeAway === 'home');
        const awayCompetitor = competition?.competitors?.find(c => c.homeAway === 'away');

        const parseScore = (competitor) => {
          if (!competitor?.score) return null;
          if (typeof competitor.score === 'object') {
            return parseInt(competitor.score.displayValue || competitor.score.value || 0);
          }
          return parseInt(competitor.score) || 0;
        };

        const getRecord = (competitor) => {
          if (!competitor?.records) return null;
          // Try to find overall record first
          const overall = competitor.records.find(r => {
            const type = (r.type || r.name || '').toLowerCase();
            return type.includes('total') || type.includes('overall') || type === '';
          });
          if (overall) return overall.summary;
          // Fallback to first record
          return competitor.records[0]?.summary || null;
        };

        const buildTeamData = (competitor) => {
          if (!competitor?.team) return null;

          // Extract season statistics from scoreboard competitor data
          // For upcoming games, these are season averages; for in-progress, game stats
          const seasonStats = {};
          (competitor.statistics || []).forEach(s => {
            seasonStats[s.name] = {
              displayValue: s.displayValue,
              rank: s.rankDisplayValue || null
            };
          });

          return {
            id: String(competitor.team.id),
            name: competitor.team.displayName || competitor.team.name,
            abbreviation: competitor.team.abbreviation,
            logo: competitor.team.logo,
            color: competitor.team.color ? `#${competitor.team.color}` : '#333',
            alternateColor: competitor.team.alternateColor ? `#${competitor.team.alternateColor}` : null,
            score: parseScore(competitor),
            record: getRecord(competitor),
            seasonStats
          };
        };

        const parseOdds = () => {
          const odds = competition?.odds?.[0];
          if (!odds) return null;
          return {
            spread: odds.details || null,
            overUnder: odds.overUnder || null
          };
        };

        const statusType = competition?.status?.type;

        return {
          id: event.id,
          date: event.date,
          name: event.name,
          shortName: event.shortName,
          status: statusType?.name || 'STATUS_SCHEDULED',
          statusDetail: statusType?.shortDetail || '',
          period: competition?.status?.period || null,
          clock: competition?.status?.displayClock || null,
          completed: statusType?.completed || false,
          homeTeam: buildTeamData(homeCompetitor),
          awayTeam: buildTeamData(awayCompetitor),
          broadcast: competition?.broadcasts?.[0]?.names?.[0] || '',
          venue: competition?.venue?.fullName || null,
          odds: parseOdds()
        };
      });
    } catch (error) {
      console.error(`[${sportName}] getScheduleByDate error:`, error.message);
      return [];
    }
  };

  /**
   * Get all teams for this sport
   */
  const getTeams = async () => {
    try {
      const data = await fetchWithCache(`${apiBase}/teams`, TEAMS_CACHE_TTL);
      const teams = data.sports?.[0]?.leagues?.[0]?.teams;
      if (!teams) {
        console.warn(`[${sportName}] No teams found in API response`);
        return [];
      }

      return teams.map(t => ({
        id: String(t.team.id),
        name: t.team.displayName || t.team.name,
        shortName: t.team.shortDisplayName || t.team.name,
        abbreviation: t.team.abbreviation,
        logo: t.team.logos?.[0]?.href,
        color: t.team.color ? `#${t.team.color}` : '#333',
        alternateColor: t.team.alternateColor ? `#${t.team.alternateColor}` : null,
        location: t.team.location || ''
      }));
    } catch (error) {
      console.error(`[${sportName}] getTeams error:`, error.message);
      return [];
    }
  };

  /**
   * Get detailed game info (box score, leaders, scoring plays)
   */
  const getGameDetailsWrapped = async (gameId) => {
    try {
      const url = `${apiBase}/summary?event=${gameId}`;
      console.log(`[${sportName}] Fetching game details for ${gameId}`);
      const data = await fetchWithCache(url, GAME_DETAILS_CACHE_TTL);

      if (!data) {
        console.warn(`[${sportName}] No data returned for game ${gameId}`);
        return null;
      }

      return parseGameDetails(data);
    } catch (error) {
      console.error(`[${sportName}] getGameDetails error for ${gameId}:`, error.message);
      return null;
    }
  };

  /**
   * Flatten ESPN team statistics response into a key-value map
   */
  const flattenStats = (statsData) => {
    const statsMap = {};
    // Handle various ESPN response shapes
    const categories = statsData?.results?.stats?.categories
      || statsData?.statistics?.categories
      || statsData?.results?.statistics?.categories
      || [];

    categories.forEach(cat => {
      (cat.stats || []).forEach(stat => {
        statsMap[stat.name] = {
          value: stat.value,
          displayValue: stat.displayValue,
          rank: stat.rank,
          rankDisplayValue: stat.rankDisplayValue
        };
      });
    });
    return statsMap;
  };

  /**
   * Parse team schedule + calculate streak
   */
  const parseTeamSchedule = (scheduleData, teamId) => {
    const events = scheduleData?.events || [];
    const teamIdStr = String(teamId);
    let wins = 0, losses = 0, ties = 0;
    const results = [];

    const schedule = events.map(event => {
      const comp = event.competitions?.[0];
      const teamComp = comp?.competitors?.find(c =>
        String(c.team?.id) === teamIdStr || String(c.id) === teamIdStr
      );
      const opponent = comp?.competitors?.find(c =>
        String(c.team?.id) !== teamIdStr && String(c.id) !== teamIdStr
      );

      const isCompleted = comp?.status?.type?.completed;
      const isHome = teamComp?.homeAway === 'home';
      let teamScore = null, oppScore = null, result = null;

      if (isCompleted) {
        teamScore = typeof teamComp?.score === 'object'
          ? parseInt(teamComp.score.displayValue) : parseInt(teamComp?.score);
        oppScore = typeof opponent?.score === 'object'
          ? parseInt(opponent.score.displayValue) : parseInt(opponent?.score);

        if (teamComp?.winner) { result = 'W'; wins++; results.push('W'); }
        else if (opponent?.winner) { result = 'L'; losses++; results.push('L'); }
        else { result = 'T'; ties++; results.push('T'); }
      }

      return {
        id: event.id,
        date: event.date,
        isCompleted,
        isHome,
        result,
        teamScore,
        oppScore,
        teamRecord: `${wins}-${losses}${ties > 0 ? `-${ties}` : ''}`,
        opponent: {
          id: opponent?.team?.id,
          name: opponent?.team?.displayName || opponent?.team?.name,
          abbreviation: opponent?.team?.abbreviation,
          logo: opponent?.team?.logo || opponent?.team?.logos?.[0]?.href || null,
          record: opponent?.records?.[0]?.summary
        }
      };
    });

    // Calculate streak
    let streak = null;
    if (results.length > 0) {
      const last = results[results.length - 1];
      let count = 0;
      for (let i = results.length - 1; i >= 0 && results[i] === last; i--) count++;
      streak = `${last}${count}`;
    }

    return { schedule, streak };
  };

  /**
   * Parse news articles from ESPN
   */
  const parseNews = (newsData) => {
    const articles = newsData?.articles || [];
    return articles.slice(0, 8).map(article => ({
      headline: article.headline,
      description: article.description,
      published: article.published,
      image: article.images?.[0]?.url,
      link: article.links?.web?.href || article.links?.mobile?.href,
      type: article.type,
      source: article.source || (article.links?.web?.href?.includes('espn.com') ? 'ESPN' : null),
      premium: article.premium || false
    })).filter(a => a.headline);
  };

  /**
   * Get comprehensive team info (team data, news, stats, schedule)
   */
  const getTeamInfo = async (teamId) => {
    try {
      const season = await getCurrentSeason();
      const year = season.season;

      // Fetch all data in parallel
      const [teamData, scheduleData, statsData, newsData] = await Promise.all([
        fetchWithCache(`${apiBase}/teams/${teamId}`, 30 * 60 * 1000).catch(() => null),
        fetchWithCache(`${apiBase}/teams/${teamId}/schedule?season=${year}`, 15 * 60 * 1000).catch(() => null),
        fetchWithCache(`${apiBase}/teams/${teamId}/statistics?season=${year}`, 30 * 60 * 1000).catch(() => null),
        fetchWithCache(`${apiBase}/news?limit=10&team=${teamId}`, 10 * 60 * 1000).catch(() => null)
      ]);

      // Parse team details
      const team = teamData?.team || {};
      let overallRecord = null, homeRecord = null, awayRecord = null;
      if (team.record?.items) {
        team.record.items.forEach(item => {
          const type = (item.type || '').toLowerCase();
          if (type === 'total') overallRecord = item.summary;
          else if (type === 'home') homeRecord = item.summary;
          else if (type === 'road') awayRecord = item.summary;
        });
      }

      // Parse schedule + streak
      const { schedule, streak } = parseTeamSchedule(scheduleData, teamId);

      // Parse news
      const news = parseNews(newsData);

      // Parse stats using sport-specific config
      const statsMap = flattenStats(statsData);
      const stats = {};
      if (teamStatsConfig && teamStatsConfig.length > 0) {
        teamStatsConfig.forEach(({ key, label }) => {
          if (statsMap[key]) {
            stats[label] = {
              displayValue: statsMap[key].displayValue,
              rank: statsMap[key].rankDisplayValue || null
            };
          }
        });
      }

      return {
        team: {
          id: team.id,
          name: team.displayName || team.name,
          abbreviation: team.abbreviation,
          logo: team.logos?.[0]?.href,
          color: team.color ? `#${team.color}` : '#333',
          alternateColor: team.alternateColor ? `#${team.alternateColor}` : null,
          venue: team.franchise?.venue?.fullName,
          location: team.location,
          division: team.groups?.name || team.groups?.parent?.name,
          standing: team.standingSummary,
          record: overallRecord,
          homeRecord,
          awayRecord,
          streak
        },
        news,
        stats,
        topPlayers: null,
        schedule
      };
    } catch (error) {
      console.error(`[${sportName}] getTeamInfo error for ${teamId}:`, error);
      return null;
    }
  };

  /**
   * Get league-wide stat rankings for a given stat key.
   * Fetches all teams' statistics, caches the batch for 1 hour,
   * then returns the requested stat sorted by ESPN's rank.
   * Disabled for NCAAB (350+ teams = too many API calls).
   */
  const LEAGUE_RANKINGS_CACHE_TTL = 60 * 60 * 1000; // 1 hour
  let leagueRankingsCache = null;
  let leagueRankingsCacheTime = 0;

  const getLeagueStatRankings = async (statKey) => {
    // NCAAB has 350+ teams — not feasible to fetch all
    if (sportName === 'NCAAB') return null;

    try {
      // Fetch ALL teams' stats (cached as a batch for 1 hour)
      if (!leagueRankingsCache || Date.now() - leagueRankingsCacheTime > LEAGUE_RANKINGS_CACHE_TTL) {
        const season = await getCurrentSeason();
        const year = season.season;
        const teams = await getTeams();

        console.log(`[${sportName}] Fetching league rankings for ${teams.length} teams...`);

        const results = await Promise.all(
          teams.map(async (team) => {
            try {
              const statsData = await fetchWithCache(
                `${apiBase}/teams/${team.id}/statistics?season=${year}`,
                30 * 60 * 1000
              );
              return { team, statsMap: flattenStats(statsData) };
            } catch {
              return null;
            }
          })
        );

        leagueRankingsCache = results.filter(Boolean);
        leagueRankingsCacheTime = Date.now();
        console.log(`[${sportName}] League rankings cached for ${leagueRankingsCache.length} teams`);
      }

      // Extract the requested stat from cached data
      const rankings = leagueRankingsCache
        .map(({ team, statsMap }) => {
          const stat = statsMap[statKey];
          if (!stat) return null;
          return {
            team: {
              id: team.id,
              name: team.name,
              abbreviation: team.abbreviation,
              logo: team.logo,
              color: team.color
            },
            value: stat.value,
            displayValue: stat.displayValue,
            rank: stat.rank,
            rankDisplayValue: stat.rankDisplayValue
          };
        })
        .filter(Boolean)
        .sort((a, b) => (a.rank || 999) - (b.rank || 999));

      return rankings;
    } catch (error) {
      console.error(`[${sportName}] getLeagueStatRankings error:`, error.message);
      return null;
    }
  };

  return {
    getCurrentSeason,
    getScheduleByDate,
    getTeams,
    getGameDetails: getGameDetailsWrapped,
    getTeamInfo,
    getLeagueStatRankings
  };
}

module.exports = createDailySportService;
