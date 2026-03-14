// Daily Sport Factory - Creates a service for any date-based ESPN sport
// All ESPN sports follow the same API patterns for scoreboard, teams, and summary endpoints

const { fetchWithCache } = require('./espn');

const TEAMS_CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours
const GAME_DETAILS_CACHE_TTL = 2 * 60 * 1000; // 2 minutes
const TEAM_CONTEXT_CACHE_TTL = 6 * 60 * 60 * 1000; // 6 hours

function createDailySportService({ apiBase, sportName, parseGameDetails, teamStatsConfig }) {
  // Track previous team ranks to compute movement between schedule refreshes.
  let teamRankSnapshotCache = new Map();
  let standingsRanksCache = null;
  let standingsRanksCacheTime = 0;

  const CORE_STANDINGS_CONFIG = {
    NBA: {
      sport: 'basketball',
      league: 'nba',
      conferenceGroups: [
        { id: 5, label: 'East' },
        { id: 6, label: 'West' },
      ],
      divisionGroups: [1, 2, 4, 9, 10, 11],
    },
    MLB: {
      sport: 'baseball',
      league: 'mlb',
      conferenceGroups: [
        { id: 7, label: 'AL' },
        { id: 8, label: 'NL' },
      ],
      divisionGroups: [1, 2, 3, 4, 5, 6],
    },
    NHL: {
      sport: 'hockey',
      league: 'nhl',
      conferenceGroups: [
        { id: 7, label: 'East' },
        { id: 8, label: 'West' },
      ],
      divisionGroups: [],
    },
  };

  const parseCoreTeamId = (teamRef) => {
    if (!teamRef) return null;
    const match = String(teamRef).match(/\/teams\/(\d+)/);
    return match?.[1] ? String(match[1]) : null;
  };

  const fetchStandingsGroup = async (cfg, season, groupId) => {
    const url = `https://sports.core.api.espn.com/v2/sports/${cfg.sport}/leagues/${cfg.league}/seasons/${season}/types/2/groups/${groupId}/standings/0?lang=en&region=us`;
    const data = await fetchWithCache(url, TEAM_CONTEXT_CACHE_TTL);
    return Array.isArray(data?.standings) ? data.standings : [];
  };

  const getStandingsRankMaps = async (season) => {
    const cfg = CORE_STANDINGS_CONFIG[sportName];
    if (!cfg) return new Map();

    if (standingsRanksCache && Date.now() - standingsRanksCacheTime < TEAM_CONTEXT_CACHE_TTL) {
      return standingsRanksCache;
    }

    const rankMap = new Map();

    try {
      for (const group of cfg.conferenceGroups || []) {
        const entries = await fetchStandingsGroup(cfg, season, group.id);
        entries.forEach((entry, idx) => {
          const teamId = parseCoreTeamId(entry?.team?.$ref);
          if (!teamId) return;
          const current = rankMap.get(teamId) || {};
          const rank = entries.length - idx; // ESPN core standings are typically listed worst -> best
          rankMap.set(teamId, {
            ...current,
            conference: { rank, label: group.label },
          });
        });
      }

      for (const groupId of cfg.divisionGroups || []) {
        const entries = await fetchStandingsGroup(cfg, season, groupId);
        entries.forEach((entry, idx) => {
          const teamId = parseCoreTeamId(entry?.team?.$ref);
          if (!teamId) return;
          const current = rankMap.get(teamId) || {};
          const rank = entries.length - idx; // ESPN core standings are typically listed worst -> best
          // Keep first hit for division rank; team should only appear in one division group.
          if (!current.division) {
            rankMap.set(teamId, {
              ...current,
              division: { rank },
            });
          }
        });
      }
    } catch (error) {
      console.warn(`[${sportName}] standings rank map unavailable:`, error.message);
    }

    standingsRanksCache = rankMap;
    standingsRanksCacheTime = Date.now();
    return rankMap;
  };

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
  const getScheduleByDate = async (dateStr, { cacheTtl } = {}) => {
    try {
      // Convert YYYY-MM-DD to YYYYMMDD for ESPN
      const espnDate = dateStr.replace(/-/g, '');
      const url = `${apiBase}/scoreboard?dates=${espnDate}`;
      console.log(`[${sportName}] Fetching schedule for ${dateStr}: ${url}`);
      const data = await fetchWithCache(url, cacheTtl);

      if (!data.events) {
        console.log(`[${sportName}] No events found for ${dateStr}`);
        return [];
      }

      console.log(`[${sportName}] Found ${data.events.length} games for ${dateStr}`);
      const currentSeason = await getCurrentSeason();
      const standingsRanksMap = await getStandingsRankMaps(currentSeason.season);

      // Fetch lightweight per-team context once (standing summary, etc.)
      const uniqueTeamIds = [
        ...new Set(
          data.events.flatMap((event) =>
            (event.competitions?.[0]?.competitors || [])
              .map((c) => c?.team?.id)
              .filter(Boolean)
          )
        ),
      ];
      const teamContextEntries = await Promise.all(
        uniqueTeamIds.map(async (teamId) => {
          try {
            const teamData = await fetchWithCache(
              `${apiBase}/teams/${teamId}`,
              TEAM_CONTEXT_CACHE_TTL
            );
            return [
              String(teamId),
              {
                standingSummary: teamData?.team?.standingSummary || null,
              },
            ];
          } catch {
            return [String(teamId), { standingSummary: null }];
          }
        })
      );
      const teamContextMap = new Map(teamContextEntries);

      const prevRankSnapshot = new Map(teamRankSnapshotCache);
      const nextRankSnapshot = new Map(teamRankSnapshotCache);
      const games = data.events.map(event => {
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
          const teamId = String(competitor.team.id);

          // Extract season statistics from scoreboard competitor data
          // For upcoming games, these are season averages; for in-progress, game stats
          const seasonStats = {};
          (competitor.statistics || []).forEach(s => {
            seasonStats[s.name] = {
              displayValue: s.displayValue,
              rank: s.rank ?? s.rankDisplayValue ?? null
            };
          });

          const currentRankRaw = competitor.curatedRank?.current;
          const parsedCurrentRank = parseInt(currentRankRaw, 10);
          const currentRank = Number.isNaN(parsedCurrentRank) ? null : parsedCurrentRank;
          const previousRank = currentRank !== null ? (prevRankSnapshot.get(teamId) ?? null) : null;
          const movement = (currentRank !== null && previousRank !== null)
            ? previousRank - currentRank
            : null;

          if (currentRank !== null) nextRankSnapshot.set(teamId, currentRank);
          const teamContext = teamContextMap.get(teamId) || {};
          const standingsRanks = standingsRanksMap.get(teamId) || null;

          return {
            id: teamId,
            name: competitor.team.displayName || competitor.team.name,
            abbreviation: competitor.team.abbreviation,
            logo: competitor.team.logo,
            color: competitor.team.color ? `#${competitor.team.color}` : '#333',
            alternateColor: competitor.team.alternateColor ? `#${competitor.team.alternateColor}` : null,
            score: parseScore(competitor),
            record: getRecord(competitor),
            standingSummary: teamContext.standingSummary || null,
            standingsRanks,
            ranking: {
              current: currentRank,
              previous: previousRank,
              movement
            },
            seasonStats
          };
        };

        const parseOdds = () => {
          const odds = competition?.odds?.[0];
          if (!odds) return null;
          const homeML = odds.moneyline?.home?.close?.odds;
          const awayML = odds.moneyline?.away?.close?.odds;
          // For NHL and MLB, ESPN's odds.details contains the moneyline (e.g. "BOS -155"),
          // not a point spread. The moneyline is already shown separately, so skip it.
          const hasPointSpread = sportName !== 'NHL' && sportName !== 'MLB';
          return {
            spread: hasPointSpread ? (odds.details || null) : null,
            overUnder: odds.overUnder || null,
            homeSpreadOdds: odds.pointSpread?.home?.close?.odds || null,
            awaySpreadOdds: odds.pointSpread?.away?.close?.odds || null,
            homeMoneyLine: homeML ? parseInt(homeML) : null,
            awayMoneyLine: awayML ? parseInt(awayML) : null,
            homeFavorite: odds.homeTeamOdds?.favorite || false,
            awayFavorite: odds.awayTeamOdds?.favorite || false,
            provider: odds.provider?.name || 'ESPN BET'
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
          odds: parseOdds(),
          notes: competition?.notes?.[0]?.headline || null,
          competitionType: competition?.type?.abbreviation || null
        };
      });
      teamRankSnapshotCache = nextRankSnapshot;
      return games;
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
      const data = await fetchWithCache(`${apiBase}/teams?limit=500`, TEAMS_CACHE_TTL);
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
  const getGameDetailsWrapped = async (gameId, options = {}) => {
    try {
      const url = `${apiBase}/summary?event=${gameId}`;
      const ttl = options.cacheTtl || GAME_DETAILS_CACHE_TTL;
      console.log(`[${sportName}] Fetching game details for ${gameId} (ttl=${ttl}ms)`);
      const data = await fetchWithCache(url, ttl);

      if (!data) {
        console.warn(`[${sportName}] No data returned for game ${gameId}`);
        return null;
      }

      const sportResult = parseGameDetails(data);

      // --- Parse common data from ESPN summary (shared across all daily sports) ---

      // Probable pitchers (MLB)
      let probablePitchers = null;
      try {
        const comps = data.header?.competitions?.[0]?.competitors || [];
        const pitchers = [];
        for (const comp of comps) {
          const team = comp.team || {};
          for (const p of (comp.probables || [])) {
            const ath = p.athlete || {};
            const stats = {};
            const splits = p.statistics?.splits?.categories || [];
            for (const cat of splits) {
              if (cat.abbreviation && cat.displayValue != null) {
                stats[cat.abbreviation] = cat.displayValue;
              }
            }
            pitchers.push({
              team: { id: team.id, abbreviation: team.abbreviation, logo: team.logo },
              name: ath.displayName || p.displayName,
              jersey: ath.jersey || null,
              headshot: ath.headshot?.href || ath.headshot || null,
              stats
            });
          }
        }
        if (pitchers.length > 0) probablePitchers = pitchers;
      } catch (e) { /* ignore */ }

      // Last 5 games
      let lastFiveGames = null;
      try {
        const l5 = data.lastFiveGames || [];
        if (l5.length > 0) {
          // Collect unique opponent IDs to fetch their records
          const opponentIds = new Set();
          for (const teamData of l5) {
            for (const e of (teamData.events || [])) {
              if (e.opponent?.id) opponentIds.add(String(e.opponent.id));
            }
          }

          // Fetch opponent records in parallel (cached for 6 hours)
          const opponentRecordEntries = await Promise.all(
            [...opponentIds].map(async (oppId) => {
              try {
                const oppData = await fetchWithCache(
                  `${apiBase}/teams/${oppId}`,
                  TEAM_CONTEXT_CACHE_TTL
                );
                const records = oppData?.team?.record?.items || [];
                const overall = records.find(r => {
                  const type = (r.type || r.name || '').toLowerCase();
                  return type.includes('total') || type.includes('overall') || type === '';
                });
                return [oppId, overall?.summary || records[0]?.summary || null];
              } catch {
                return [oppId, null];
              }
            })
          );
          const opponentRecordMap = new Map(opponentRecordEntries);

          lastFiveGames = {};
          for (const teamData of l5) {
            const teamAbbr = teamData.team?.abbreviation;
            if (!teamAbbr) continue;
            lastFiveGames[teamAbbr] = (teamData.events || []).map(e => ({
              date: e.gameDate,
              result: e.gameResult, // W, L, T
              opponent: e.opponent?.abbreviation || '?',
              opponentName: e.opponent?.displayName || e.opponent?.shortDisplayName || e.opponent?.abbreviation || '?',
              opponentLogo: e.opponent?.logo || null,
              opponentRecord: e.opponent?.id ? (opponentRecordMap.get(String(e.opponent.id)) || null) : null,
              score: e.score,
              atVs: e.atVs || (e.atHome === true ? 'vs' : e.atHome === false ? '@' : '@')
            }));
          }
        }
      } catch (e) { /* ignore */ }

      // Injuries
      let injuries = null;
      try {
        const injData = data.injuries || [];
        if (injData.length > 0) {
          injuries = {};
          for (const teamInj of injData) {
            const teamName = teamInj.team?.abbreviation || teamInj.team?.displayName;
            if (!teamName) continue;
            injuries[teamName] = (teamInj.injuries || []).map(p => ({
              name: p.athlete?.displayName || '?',
              position: p.athlete?.position?.abbreviation || '?',
              status: p.status || '?',
              type: p.type?.description || null
            }));
          }
        }
      } catch (e) { /* ignore */ }

      return {
        ...sportResult,
        ...(probablePitchers && { probablePitchers }),
        ...(lastFiveGames && { lastFiveGames }),
        ...(injuries && { injuries })
      };
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

      // Enrich schedule opponents with records & rankings from teams API
      const opponentIds = new Set();
      for (const game of schedule) {
        if (game.opponent?.id) opponentIds.add(String(game.opponent.id));
      }
      if (opponentIds.size > 0) {
        const oppEntries = await Promise.all(
          [...opponentIds].map(async (oppId) => {
            try {
              const oppData = await fetchWithCache(
                `${apiBase}/teams/${oppId}`,
                TEAM_CONTEXT_CACHE_TTL
              );
              const oppTeam = oppData?.team || {};
              const records = oppTeam.record?.items || [];
              const overall = records.find(r => {
                const type = (r.type || r.name || '').toLowerCase();
                return type.includes('total') || type.includes('overall') || type === '';
              });
              return [oppId, {
                record: overall?.summary || records[0]?.summary || null,
                rank: oppTeam.rank ? parseInt(oppTeam.rank) : null,
              }];
            } catch {
              return [oppId, { record: null, rank: null }];
            }
          })
        );
        const oppMap = new Map(oppEntries);
        for (const game of schedule) {
          if (game.opponent?.id) {
            const info = oppMap.get(String(game.opponent.id));
            if (info) {
              if (info.record) game.opponent.record = info.record;
              if (info.rank) game.opponent.rank = info.rank;
            }
          }
        }
      }

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

      // Stats where a lower value is better (defensive/error metrics)
      const lowerIsBetterStats = new Set([
        'avgPointsAgainst',
        'avgGoalsAgainst',
        'goalsAgainst',
        'turnovers',
        'avgTurnovers',
        'earnedRunAverage',
        'ERA',
        'errors',
      ]);
      const lowerIsBetter = lowerIsBetterStats.has(statKey);

      const STAT_KEY_ALIASES = {
        ytdGoals: ['goals'],
        threePointPct: ['threePointFieldGoalPct'],
        threePointFieldGoalPct: ['threePointPct'],
        errors: ['totalErrors', 'teamErrors'],
      };

      const getStatFromMap = (statsMap, key) => {
        const candidates = [key, ...(STAT_KEY_ALIASES[key] || [])];
        for (const candidate of candidates) {
          if (statsMap?.[candidate]) return statsMap[candidate];
        }
        return null;
      };

      // Parse rank values that may be numeric or ordinal strings (e.g. "3rd")
      const parseRank = (rank) => {
        if (rank === null || rank === undefined || rank === '') return null;
        if (typeof rank === 'number' && Number.isFinite(rank)) return rank;
        const parsed = parseInt(String(rank), 10);
        return Number.isFinite(parsed) ? parsed : null;
      };

      // Extract the requested stat from cached data
      if (statKey === 'avgPointsAgainst') {
        const missingComputedStat = leagueRankingsCache.some(({ statsMap }) => !getStatFromMap(statsMap, 'avgPointsAgainst'));
        if (missingComputedStat) {
          const season = await getCurrentSeason();
          const year = season.season;

          const parseScore = (competitor) => {
            if (!competitor?.score && competitor?.score !== 0) return null;
            if (typeof competitor.score === 'object') {
              const raw = competitor.score.displayValue ?? competitor.score.value;
              const n = parseInt(raw, 10);
              return Number.isNaN(n) ? null : n;
            }
            const n = parseInt(competitor.score, 10);
            return Number.isNaN(n) ? null : n;
          };

          const enriched = await Promise.all(
            leagueRankingsCache.map(async (entry) => {
              const teamId = String(entry.team?.id || '');
              if (!teamId) return entry;
              try {
                const scheduleData = await fetchWithCache(
                  `${apiBase}/teams/${teamId}/schedule?season=${year}`,
                  30 * 60 * 1000
                );
                const events = scheduleData?.events || [];
                let pointsAgainst = 0;
                let gamesPlayed = 0;

                events.forEach((event) => {
                  const comp = event?.competitions?.[0];
                  if (!comp?.status?.type?.completed) return;
                  const teamComp = comp.competitors?.find((c) => String(c.team?.id || c.id) === teamId);
                  const oppComp = comp.competitors?.find((c) => String(c.team?.id || c.id) !== teamId);
                  const oppScore = parseScore(oppComp);
                  const teamScore = parseScore(teamComp);
                  if (oppScore === null || teamScore === null) return;
                  pointsAgainst += oppScore;
                  gamesPlayed += 1;
                });

                if (gamesPlayed > 0) {
                  const avg = pointsAgainst / gamesPlayed;
                  entry.statsMap.avgPointsAgainst = {
                    value: avg,
                    displayValue: avg.toFixed(1),
                    rank: null,
                    rankDisplayValue: null
                  };
                }
              } catch {
                // Keep entry as-is if schedule fetch fails.
              }
              return entry;
            })
          );

          leagueRankingsCache = enriched;
          leagueRankingsCacheTime = Date.now();
        }
      }

      if (statKey === 'errors') {
        const missingComputedStat = leagueRankingsCache.some(({ statsMap }) => !getStatFromMap(statsMap, 'errors'));
        if (missingComputedStat) {
          const season = await getCurrentSeason();
          const year = season.season;

          const parseErrors = (competitor) => {
            const raw = competitor?.errors;
            const n = parseInt(raw, 10);
            return Number.isNaN(n) ? null : n;
          };

          const enriched = await Promise.all(
            leagueRankingsCache.map(async (entry) => {
              const teamId = String(entry.team?.id || '');
              if (!teamId) return entry;
              try {
                const scheduleData = await fetchWithCache(
                  `${apiBase}/teams/${teamId}/schedule?season=${year}`,
                  30 * 60 * 1000
                );
                const events = scheduleData?.events || [];
                let totalErrors = 0;
                let gamesPlayed = 0;

                events.forEach((event) => {
                  const comp = event?.competitions?.[0];
                  if (!comp?.status?.type?.completed) return;
                  const teamComp = comp.competitors?.find((c) => String(c.team?.id || c.id) === teamId);
                  const teamErrors = parseErrors(teamComp);
                  if (teamErrors === null) return;
                  totalErrors += teamErrors;
                  gamesPlayed += 1;
                });

                if (gamesPlayed > 0) {
                  const avg = totalErrors / gamesPlayed;
                  entry.statsMap.errors = {
                    value: avg,
                    displayValue: avg.toFixed(1),
                    rank: null,
                    rankDisplayValue: null
                  };
                }
              } catch {
                // Keep entry as-is if schedule fetch fails.
              }
              return entry;
            })
          );

          leagueRankingsCache = enriched;
          leagueRankingsCacheTime = Date.now();
        }
      }

      const rankings = leagueRankingsCache
        .map(({ team, statsMap }) => {
          const stat = getStatFromMap(statsMap, statKey);
          if (!stat) return null;
          const numericValue = Number.isFinite(stat.value) ? stat.value : parseFloat(stat.displayValue);
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
            rank: parseRank(stat.rank ?? stat.rankDisplayValue),
            rankDisplayValue: stat.rankDisplayValue,
            numericValue: Number.isFinite(numericValue) ? numericValue : null
          };
        })
        .filter(Boolean)
        .sort((a, b) => {
          const aRank = parseRank(a.rank);
          const bRank = parseRank(b.rank);

          // If both teams have ESPN-provided rank, trust it.
          if (aRank !== null && bRank !== null) return aRank - bRank;
          // Otherwise, sort by value.
          if (a.numericValue !== null && b.numericValue !== null) {
            return lowerIsBetter
              ? a.numericValue - b.numericValue
              : b.numericValue - a.numericValue;
          }
          if (a.numericValue !== null) return -1;
          if (b.numericValue !== null) return 1;
          return a.team.name.localeCompare(b.team.name);
        });

      // If ESPN rank is missing, compute rank from sorted values.
      let lastValue = null;
      let computedRank = 0;
      rankings.forEach((item, idx) => {
        if (item.rank === null || item.rank === undefined || item.rank === '') {
          if (item.numericValue !== null && lastValue !== null && item.numericValue === lastValue) {
            item.rank = computedRank;
          } else {
            computedRank = idx + 1;
            item.rank = computedRank;
          }
          lastValue = item.numericValue;
        } else {
          const normalized = parseRank(item.rank);
          item.rank = normalized !== null ? normalized : (idx + 1);
          lastValue = item.numericValue;
          computedRank = item.rank;
        }

        if (!item.rankDisplayValue && item.rank) {
          const n = item.rank;
          const suffix = n % 10 === 1 && n % 100 !== 11
            ? 'st'
            : n % 10 === 2 && n % 100 !== 12
              ? 'nd'
              : n % 10 === 3 && n % 100 !== 13
                ? 'rd'
                : 'th';
          item.rankDisplayValue = `${n}${suffix}`;
        }
        delete item.numericValue;
      });

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
