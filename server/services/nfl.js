// NFL Data Service - ESPN API Integration with Enhanced Stats
const API_BASE = 'https://site.api.espn.com/apis/site/v2/sports/football/nfl';

// Helper to convert our app week numbers to ESPN API format
// Our app: weeks 1-18 = regular season, weeks 19-22 = playoffs
// ESPN API: seasonType 2 + weeks 1-18 = regular season
//           seasonType 3 + weeks 1-4 = playoffs (Wild Card, Divisional, Conference, Super Bowl)
const getEspnWeekParams = (week) => {
  if (week <= 18) {
    return { espnWeek: week, seasonType: 2 };
  }
  // Playoff weeks: 19=Wild Card(1), 20=Divisional(2), 21=Conference(3), 22=Super Bowl(4)
  return { espnWeek: week - 18, seasonType: 3 };
};

// Cache for API responses
const cache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// League-wide rankings cache (longer TTL since rankings don't change often)
let leagueRankingsCache = null;
let leagueRankingsCacheTime = 0;
const RANKINGS_CACHE_TTL = 60 * 60 * 1000; // 1 hour

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

// Fetch and calculate league-wide rankings for all 32 teams
const getLeagueRankings = async () => {
  // Return cached rankings if still valid
  if (leagueRankingsCache && Date.now() - leagueRankingsCacheTime < RANKINGS_CACHE_TTL) {
    return leagueRankingsCache;
  }
  
  console.log('Calculating league-wide rankings...');
  
  try {
    // Get current season first
    const season = await getCurrentSeasonYear();
    
    // Fetch all teams
    const teamsData = await fetchWithCache(`${API_BASE}/teams`, 60 * 60 * 1000);
    const teams = teamsData?.sports?.[0]?.leagues?.[0]?.teams || [];
    
    // Fetch stats and schedule for each team in parallel
    const teamStats = await Promise.all(
      teams.map(async (t) => {
        const teamId = t.team?.id;
        if (!teamId) return null;
        
        try {
          const [statsData, scheduleData] = await Promise.all([
            fetchWithCache(`${API_BASE}/teams/${teamId}/statistics?season=${season}`, 30 * 60 * 1000).catch(() => null),
            fetchWithCache(`${API_BASE}/teams/${teamId}/schedule?season=${season}`, 30 * 60 * 1000).catch(() => null)
          ]);
          
          // Parse stats
          const categories = statsData?.results?.stats?.categories || [];
          const stats = {};
          categories.forEach(cat => {
            cat.stats?.forEach(stat => {
              stats[stat.name] = stat.value;
            });
          });
          
          // Calculate PPG and Opp PPG from schedule
          let totalPointsFor = 0;
          let totalPointsAgainst = 0;
          let completedGames = 0;
          const events = scheduleData?.events || [];
          const teamIdStr = String(teamId);
          
          events.forEach(event => {
            const comp = event.competitions?.[0];
            const isCompleted = comp?.status?.type?.completed;
            if (isCompleted) {
              const teamComp = comp?.competitors?.find(c => 
                String(c.team?.id) === teamIdStr || String(c.id) === teamIdStr
              );
              const opponent = comp?.competitors?.find(c => 
                String(c.team?.id) !== teamIdStr && String(c.id) !== teamIdStr
              );
              
              const teamScore = typeof teamComp?.score === 'object' 
                ? parseInt(teamComp.score.displayValue) 
                : parseInt(teamComp?.score);
              const oppScore = typeof opponent?.score === 'object' 
                ? parseInt(opponent.score.displayValue) 
                : parseInt(opponent?.score);
                
              if (!isNaN(teamScore) && !isNaN(oppScore)) {
                totalPointsFor += teamScore;
                totalPointsAgainst += oppScore;
                completedGames++;
              }
            }
          });
          
          const gamesPlayed = completedGames || 1;
          
          return {
            teamId,
            passingYPG: stats.netPassingYardsPerGame || (stats.netPassingYards / gamesPlayed) || 0,
            passingTD: stats.passingTouchdowns || 0,
            passingTDPG: (stats.passingTouchdowns || 0) / gamesPlayed,
            rushingYPG: (stats.rushingYards || 0) / gamesPlayed,
            rushingTD: stats.rushingTouchdowns || 0,
            rushingTDPG: (stats.rushingTouchdowns || 0) / gamesPlayed,
            rushingYPC: stats.yardsPerRushAttempt || 0,
            pointsFor: totalPointsFor / gamesPlayed,
            pointsAgainst: totalPointsAgainst / gamesPlayed
          };
        } catch (e) {
          return null;
        }
      })
    );
    
    // Filter out nulls
    const validStats = teamStats.filter(s => s !== null);
    
    // Calculate rankings for each stat (1 = best)
    const calculateRanks = (arr, key, higherIsBetter = true) => {
      const sorted = [...arr].sort((a, b) => higherIsBetter ? b[key] - a[key] : a[key] - b[key]);
      const ranks = {};
      sorted.forEach((item, idx) => {
        ranks[item.teamId] = idx + 1;
      });
      return ranks;
    };
    
    const rankings = {
      passingYPG: calculateRanks(validStats, 'passingYPG', true),
      passingTD: calculateRanks(validStats, 'passingTD', true),
      passingTDPG: calculateRanks(validStats, 'passingTDPG', true),
      rushingYPG: calculateRanks(validStats, 'rushingYPG', true),
      rushingTD: calculateRanks(validStats, 'rushingTD', true),
      rushingTDPG: calculateRanks(validStats, 'rushingTDPG', true),
      rushingYPC: calculateRanks(validStats, 'rushingYPC', true),
      pointsFor: calculateRanks(validStats, 'pointsFor', true),
      pointsAgainst: calculateRanks(validStats, 'pointsAgainst', false) // Lower is better
    };
    
    console.log('League rankings calculated for', validStats.length, 'teams');
    
    // Cache the results
    leagueRankingsCache = rankings;
    leagueRankingsCacheTime = Date.now();
    
    return rankings;
  } catch (error) {
    console.error('Error calculating league rankings:', error);
    return null;
  }
};

// Get current NFL season info
let cachedCurrentSeasonYear = null;

const getCurrentSeasonYear = async () => {
  if (cachedCurrentSeasonYear) return cachedCurrentSeasonYear;
  
  try {
    const data = await fetchWithCache(`${API_BASE}/scoreboard`, 60 * 60 * 1000);
    cachedCurrentSeasonYear = data.season?.year || new Date().getFullYear();
    console.log('Current NFL season:', cachedCurrentSeasonYear);
    return cachedCurrentSeasonYear;
  } catch (error) {
    const now = new Date();
    cachedCurrentSeasonYear = now.getMonth() >= 8 ? now.getFullYear() : now.getFullYear() - 1;
    return cachedCurrentSeasonYear;
  }
};

const getCurrentSeason = async () => {
  try {
    const data = await fetchWithCache(`${API_BASE}/scoreboard`);
    return {
      season: data.season?.year || new Date().getFullYear(),
      seasonType: data.season?.type || 2,
      week: data.week?.number || 1,
      displayName: data.week?.teamsOnBye ? `Week ${data.week.number}` : 'Offseason'
    };
  } catch (error) {
    console.error('Get current season error:', error);
    const now = new Date();
    const year = now.getMonth() >= 8 ? now.getFullYear() : now.getFullYear() - 1;
    return { season: year, seasonType: 2, week: 1 };
  }
};

// Get team's season results (all completed games)
const getTeamSeasonResults = async (teamId, season) => {
  try {
    const url = `${API_BASE}/teams/${teamId}/schedule?season=${season}`;
    console.log(`Fetching schedule for team ${teamId}...`);
    const data = await fetchWithCache(url, 15 * 60 * 1000);

    if (!data.events) {
      console.log(`No events found for team ${teamId}`);
      return [];
    }

    // Get ALL completed games for season stats
    const completedGames = data.events
      .filter(e => e.competitions?.[0]?.status?.type?.completed);

    console.log(`Found ${completedGames.length} completed games for team ${teamId}`);

    return completedGames.map(event => {
      const competition = event.competitions[0];
      const teamIdStr = String(teamId);
      
      const teamCompetitor = competition.competitors.find(c => 
        String(c.team?.id) === teamIdStr || String(c.id) === teamIdStr
      );
      const opponent = competition.competitors.find(c => 
        String(c.team?.id) !== teamIdStr && String(c.id) !== teamIdStr
      );
      
      // Handle different score formats from ESPN
      let teamScore = 0;
      let oppScore = 0;
      
      if (teamCompetitor?.score !== undefined) {
        if (typeof teamCompetitor.score === 'object') {
          teamScore = parseInt(teamCompetitor.score.displayValue || teamCompetitor.score.value || 0);
        } else {
          teamScore = parseInt(teamCompetitor.score) || 0;
        }
      }
      
      if (opponent?.score !== undefined) {
        if (typeof opponent.score === 'object') {
          oppScore = parseInt(opponent.score.displayValue || opponent.score.value || 0);
        } else {
          oppScore = parseInt(opponent.score) || 0;
        }
      }
      
      return {
        week: event.week?.number,
        opponent: opponent?.team?.abbreviation || '?',
        opponentLogo: opponent?.team?.logo,
        result: teamCompetitor?.winner ? 'W' : (opponent?.winner ? 'L' : 'T'),
        score: `${teamScore}-${oppScore}`,
        teamScore,
        oppScore,
        isHome: teamCompetitor?.homeAway === 'home'
      };
    });
  } catch (error) {
    console.error(`Get season results error for team ${teamId}:`, error.message);
    return [];
  }
};

// Get schedule for a specific week with enhanced team data
const getWeekSchedule = async (season, week, seasonType = 2) => {
  try {
    const url = `${API_BASE}/scoreboard?seasontype=${seasonType}&week=${week}&dates=${season}`;
    console.log(`=== ESPN API Call ===`);
    console.log(`URL: ${url}`);
    console.log(`Season: ${season}, Week: ${week}, SeasonType: ${seasonType}`);
    const data = await fetchWithCache(url);

    if (!data.events) {
      console.log('No events in scoreboard response');
      return [];
    }

    console.log(`Found ${data.events.length} games for ${seasonType === 3 ? 'playoff' : 'regular season'} week ${week}`);

    // Collect team IDs
    const teamIds = new Set();
    data.events.forEach(event => {
      event.competitions?.[0]?.competitors?.forEach(c => {
        if (c.team?.id) teamIds.add(String(c.team.id));
      });
    });

    // Fetch season results for all teams in parallel
    console.log(`Fetching season results for ${teamIds.size} teams...`);
    const seasonResultsPromises = Array.from(teamIds).map(async (id) => {
      try {
        const results = await getTeamSeasonResults(id, season);
        return [id, results];
      } catch (e) {
        console.error(`Failed to get results for team ${id}:`, e.message);
        return [id, []];
      }
    });
    
    const seasonResultsArray = await Promise.all(seasonResultsPromises);
    const seasonResultsMap = new Map(seasonResultsArray);

    return data.events.map(event => {
      const competition = event.competitions?.[0];
      const homeCompetitor = competition?.competitors?.find(c => c.homeAway === 'home');
      const awayCompetitor = competition?.competitors?.find(c => c.homeAway === 'away');

      // Extract records from competitor
      const getRecordData = (competitor) => {
        if (!competitor?.records) return {};
        const result = { overall: null, home: null, away: null };
        
        competitor.records.forEach(r => {
          const type = (r.type || r.name || '').toLowerCase();
          if (type.includes('total') || type.includes('overall') || type === '') {
            result.overall = r.summary;
          } else if (type.includes('home')) {
            result.home = r.summary;
          } else if (type.includes('road') || type.includes('away')) {
            result.away = r.summary;
          }
        });
        
        if (!result.overall && competitor.records[0]) {
          result.overall = competitor.records[0].summary;
        }
        return result;
      };

      // Calculate streak from recent results
      const getStreak = (teamId) => {
        const results = seasonResultsMap.get(String(teamId)) || [];
        if (results.length === 0) return null;
        
        let streakType = results[results.length - 1]?.result;
        if (!streakType) return null;
        
        let streakCount = 0;
        for (let i = results.length - 1; i >= 0; i--) {
          if (results[i].result === streakType) {
            streakCount++;
          } else break;
        }
        return { type: streakType, count: streakCount };
      };

      // Calculate season PPG from all completed games
      const getSeasonStats = (teamId) => {
        const results = seasonResultsMap.get(String(teamId)) || [];
        if (results.length === 0) {
          console.log(`No season results for team ${teamId}`);
          return null;
        }
        
        let pointsFor = 0;
        let pointsAgainst = 0;
        let validGames = 0;
        
        results.forEach(r => {
          const pf = Number(r.teamScore);
          const pa = Number(r.oppScore);
          if (!isNaN(pf) && pf >= 0) {
            pointsFor += pf;
            pointsAgainst += (!isNaN(pa) && pa >= 0) ? pa : 0;
            validGames++;
          }
        });
        
        if (validGames === 0) {
          console.log(`No valid games for team ${teamId}`);
          return null;
        }
        
        const stats = {
          avgPointsFor: (pointsFor / validGames).toFixed(1),
          avgPointsAgainst: (pointsAgainst / validGames).toFixed(1),
          totalPointsFor: pointsFor,
          totalPointsAgainst: pointsAgainst,
          gamesPlayed: validGames
        };
        
        console.log(`Team ${teamId} season stats (${validGames} games):`, stats);
        return stats;
      };

      // Parse score from competitor (can be string, number, or object)
      const parseScore = (competitor) => {
        if (!competitor?.score) return null;
        if (typeof competitor.score === 'object') {
          return parseInt(competitor.score.displayValue || competitor.score.value || 0);
        }
        return parseInt(competitor.score) || 0;
      };

      // Build team data object
      const buildTeamData = (competitor, isHome) => {
        if (!competitor?.team) return null;
        
        const teamId = String(competitor.team.id);
        const records = getRecordData(competitor);
        const streak = getStreak(teamId);
        const seasonStats = getSeasonStats(teamId);
        const allResults = seasonResultsMap.get(teamId) || [];
        
        return {
          id: teamId,
          name: competitor.team.displayName || competitor.team.name,
          abbreviation: competitor.team.abbreviation,
          logo: competitor.team.logo,
          color: competitor.team.color ? `#${competitor.team.color}` : '#333',
          record: records.overall,
          homeRecord: records.home,
          awayRecord: records.away,
          score: parseScore(competitor),
          streak,
          avgPointsFor: seasonStats?.avgPointsFor || null,
          avgPointsAgainst: seasonStats?.avgPointsAgainst || null,
          gamesPlayed: seasonStats?.gamesPlayed || null,
          last5: allResults.slice(-5)
        };
      };

      // Parse betting odds
      const parseOdds = () => {
        // Log raw odds data for debugging
        console.log(`Game ${event.id} odds data:`, JSON.stringify(competition?.odds, null, 2));
        
        const odds = competition?.odds?.[0];
        if (!odds) {
          console.log(`No odds found for game ${event.id}`);
          return null;
        }
        
        // Money line is nested: odds.moneyline.home.close.odds
        const homeML = odds.moneyline?.home?.close?.odds;
        const awayML = odds.moneyline?.away?.close?.odds;
        
        const parsed = {
          spread: odds.details || null,
          overUnder: odds.overUnder || null,
          homeSpreadOdds: odds.pointSpread?.home?.close?.odds || null,
          awaySpreadOdds: odds.pointSpread?.away?.close?.odds || null,
          homeMoneyLine: homeML ? parseInt(homeML) : null,
          awayMoneyLine: awayML ? parseInt(awayML) : null,
          homeFavorite: odds.homeTeamOdds?.favorite || false,
          awayFavorite: odds.awayTeamOdds?.favorite || false,
          provider: odds.provider?.name || 'ESPN BET'
        };
        
        console.log(`Parsed odds for game ${event.id}:`, parsed);
        return parsed;
      };

      return {
        id: event.id,
        date: event.date,
        name: event.name,
        shortName: event.shortName,
        status: competition?.status?.type?.name || 'STATUS_SCHEDULED',
        statusDetail: competition?.status?.type?.shortDetail || '',
        period: competition?.status?.period || null,
        clock: competition?.status?.displayClock || null,
        venue: competition?.venue?.fullName,
        broadcast: competition?.broadcasts?.[0]?.names?.[0] || '',
        homeTeam: buildTeamData(homeCompetitor, true),
        awayTeam: buildTeamData(awayCompetitor, false),
        odds: parseOdds()
      };
    });
  } catch (error) {
    console.error('Get week schedule error:', error);
    return [];
  }
};

// Static team data fallback
const NFL_TEAMS = {
  '1': { id: '1', name: 'Atlanta Falcons', abbreviation: 'ATL', color: '#A71930' },
  '2': { id: '2', name: 'Buffalo Bills', abbreviation: 'BUF', color: '#00338D' },
  '3': { id: '3', name: 'Chicago Bears', abbreviation: 'CHI', color: '#0B162A' },
  '4': { id: '4', name: 'Cincinnati Bengals', abbreviation: 'CIN', color: '#FB4F14' },
  '5': { id: '5', name: 'Cleveland Browns', abbreviation: 'CLE', color: '#311D00' },
  '6': { id: '6', name: 'Dallas Cowboys', abbreviation: 'DAL', color: '#003594' },
  '7': { id: '7', name: 'Denver Broncos', abbreviation: 'DEN', color: '#FB4F14' },
  '8': { id: '8', name: 'Detroit Lions', abbreviation: 'DET', color: '#0076B6' },
  '9': { id: '9', name: 'Green Bay Packers', abbreviation: 'GB', color: '#203731' },
  '10': { id: '10', name: 'Tennessee Titans', abbreviation: 'TEN', color: '#4B92DB' },
  '11': { id: '11', name: 'Indianapolis Colts', abbreviation: 'IND', color: '#002C5F' },
  '12': { id: '12', name: 'Kansas City Chiefs', abbreviation: 'KC', color: '#E31837' },
  '13': { id: '13', name: 'Las Vegas Raiders', abbreviation: 'LV', color: '#000000' },
  '14': { id: '14', name: 'Los Angeles Rams', abbreviation: 'LAR', color: '#003594' },
  '15': { id: '15', name: 'Miami Dolphins', abbreviation: 'MIA', color: '#008E97' },
  '16': { id: '16', name: 'Minnesota Vikings', abbreviation: 'MIN', color: '#4F2683' },
  '17': { id: '17', name: 'New England Patriots', abbreviation: 'NE', color: '#002244' },
  '18': { id: '18', name: 'New Orleans Saints', abbreviation: 'NO', color: '#D3BC8D' },
  '19': { id: '19', name: 'New York Giants', abbreviation: 'NYG', color: '#0B2265' },
  '20': { id: '20', name: 'New York Jets', abbreviation: 'NYJ', color: '#125740' },
  '21': { id: '21', name: 'Philadelphia Eagles', abbreviation: 'PHI', color: '#004C54' },
  '22': { id: '22', name: 'Arizona Cardinals', abbreviation: 'ARI', color: '#97233F' },
  '23': { id: '23', name: 'Pittsburgh Steelers', abbreviation: 'PIT', color: '#FFB612' },
  '24': { id: '24', name: 'Los Angeles Chargers', abbreviation: 'LAC', color: '#0080C6' },
  '25': { id: '25', name: 'San Francisco 49ers', abbreviation: 'SF', color: '#AA0000' },
  '26': { id: '26', name: 'Seattle Seahawks', abbreviation: 'SEA', color: '#002244' },
  '27': { id: '27', name: 'Tampa Bay Buccaneers', abbreviation: 'TB', color: '#D50A0A' },
  '28': { id: '28', name: 'Washington Commanders', abbreviation: 'WAS', color: '#5A1414' },
  '29': { id: '29', name: 'Carolina Panthers', abbreviation: 'CAR', color: '#0085CA' },
  '30': { id: '30', name: 'Jacksonville Jaguars', abbreviation: 'JAX', color: '#006778' },
  '33': { id: '33', name: 'Baltimore Ravens', abbreviation: 'BAL', color: '#241773' },
  '34': { id: '34', name: 'Houston Texans', abbreviation: 'HOU', color: '#03202F' }
};

const getTeam = (teamId) => {
  const id = String(teamId);
  return NFL_TEAMS[id] || { id, name: `Team ${id}`, abbreviation: id, color: '#333' };
};

const getTeams = async () => {
  try {
    const data = await fetchWithCache(`${API_BASE}/teams`, 60 * 60 * 1000);
    if (!data.sports?.[0]?.leagues?.[0]?.teams) return Object.values(NFL_TEAMS);
    return data.sports[0].leagues[0].teams.map(t => ({
      id: String(t.team.id),
      name: t.team.displayName || t.team.name,
      abbreviation: t.team.abbreviation,
      logo: t.team.logos?.[0]?.href,
      color: t.team.color ? `#${t.team.color}` : '#333'
    }));
  } catch (error) {
    console.error('Get teams error:', error);
    return Object.values(NFL_TEAMS);
  }
};

const hasGameStarted = (gameDate) => new Date(gameDate) <= new Date();

const getGameWinner = (game) => {
  if (game.status !== 'STATUS_FINAL') return null;
  const homeScore = parseInt(game.homeTeam?.score) || 0;
  const awayScore = parseInt(game.awayTeam?.score) || 0;
  if (homeScore === awayScore) return 'TIE';
  return homeScore > awayScore ? game.homeTeam.id : game.awayTeam.id;
};

// Get detailed game info including box scores and player stats
const getGameDetails = async (gameId) => {
  try {
    const url = `${API_BASE}/summary?event=${gameId}`;
    console.log(`Fetching game details for ${gameId}...`);
    const data = await fetchWithCache(url, 2 * 60 * 1000); // 2 min cache for game details

    if (!data) {
      console.log('No data returned for game details');
      return null;
    }

    console.log('API response keys:', Object.keys(data));
    
    const boxscore = data.boxscore;
    const predictor = data.predictor;
    const pickcenter = data.pickcenter;

    // Log available data
    if (boxscore) {
      console.log('Boxscore keys:', Object.keys(boxscore));
      if (boxscore.players) {
        console.log('Boxscore players count:', boxscore.players.length);
        if (boxscore.players[0]) {
          console.log('First player team keys:', Object.keys(boxscore.players[0]));
          if (boxscore.players[0].statistics) {
            console.log('First team statistics:', boxscore.players[0].statistics.map(s => s.name));
          }
        }
      }
    }

    // Parse team stats from boxscore
    const parseTeamStats = (teamStats) => {
      if (!teamStats) return null;
      const stats = {};
      teamStats.forEach(stat => {
        stats[stat.name] = stat.displayValue;
      });
      return stats;
    };

    // Parse scoring plays
    const parseScoringPlays = (drives) => {
      if (!drives) return [];
      
      const scoringPlays = [];
      drives.forEach(drive => {
        if (drive.plays) {
          drive.plays.forEach(play => {
            if (play.scoringPlay) {
              scoringPlays.push({
                quarter: play.period?.number,
                time: play.clock?.displayValue,
                team: play.team?.abbreviation,
                description: play.text,
                awayScore: play.awayScore,
                homeScore: play.homeScore
              });
            }
          });
        }
      });
      return scoringPlays;
    };

    // Get betting info from pickcenter
    const parseBettingInfo = () => {
      if (!pickcenter || pickcenter.length === 0) return null;
      
      const pick = pickcenter[0];
      return {
        spread: pick.details,
        overUnder: pick.overUnder,
        overOdds: pick.overOdds,
        underOdds: pick.underOdds,
        homeMoneyLine: pick.homeTeamOdds?.moneyLine,
        awayMoneyLine: pick.awayTeamOdds?.moneyLine,
        provider: pick.provider?.name
      };
    };

    // Get win probability if available
    const parseWinProbability = () => {
      if (!predictor) return null;
      return {
        homeWinPct: predictor.homeTeam?.gameProjection,
        awayWinPct: predictor.awayTeam?.gameProjection
      };
    };

    // Parse leaders from boxscore.players - get top performer per category PER TEAM
    const parseLeadersFromBoxscore = () => {
      if (!boxscore?.players) return [];
      
      const allLeaders = [];
      
      boxscore.players.forEach(teamPlayers => {
        const teamAbbr = teamPlayers.team?.abbreviation;
        const teamLogo = teamPlayers.team?.logo;
        console.log(`Processing team: ${teamAbbr}`);
        
        // Each team has statistics array with different stat groups
        teamPlayers.statistics?.forEach(statGroup => {
          const topAthlete = statGroup.athletes?.[0];
          if (!topAthlete) return;
          
          const stats = topAthlete.stats || [];
          let formattedValue = '';
          
          // Format stats based on category
          if (statGroup.name === 'passing') {
            // Stats order: C/ATT, YDS, AVG, TD, INT, SACKS, QBR, RTG
            formattedValue = `${stats[0] || '0/0'}, ${stats[1] || 0} YDS, ${stats[3] || 0} TD, ${stats[4] || 0} INT`;
          } else if (statGroup.name === 'rushing') {
            // Stats order: CAR, YDS, AVG, TD, LONG
            formattedValue = `${stats[0] || 0} CAR, ${stats[1] || 0} YDS, ${stats[3] || 0} TD`;
          } else if (statGroup.name === 'receiving') {
            // Stats order: REC, YDS, AVG, TD, LONG, TGTS
            formattedValue = `${stats[0] || 0} REC, ${stats[1] || 0} YDS, ${stats[3] || 0} TD`;
          } else if (statGroup.name === 'defensive') {
            // Stats order: TOT, SOLO, SACKS, TFL, PD, QB HTS, TD
            formattedValue = `${stats[0] || 0} TOT, ${stats[2] || 0} SACK, ${stats[4] || 0} PD`;
          } else if (statGroup.name === 'interceptions') {
            // Stats: INT, YDS, TD
            formattedValue = `${stats[0] || 0} INT, ${stats[1] || 0} YDS`;
          } else if (statGroup.name === 'fumbles') {
            // Stats: FUM, LOST, REC
            formattedValue = `${stats[0] || 0} FUM, ${stats[1] || 0} LOST`;
          } else {
            // Fallback - just show first few stats
            formattedValue = stats.slice(0, 3).join(', ');
          }
          
          // Only include main offensive categories and defense
          if (['passing', 'rushing', 'receiving', 'defensive'].includes(statGroup.name)) {
            allLeaders.push({
              category: statGroup.name,
              displayName: statGroup.name.charAt(0).toUpperCase() + statGroup.name.slice(1),
              player: {
                name: topAthlete.athlete?.displayName || topAthlete.athlete?.shortName,
                position: topAthlete.athlete?.position?.abbreviation,
                team: teamAbbr,
                teamLogo: teamLogo,
                headshot: topAthlete.athlete?.headshot?.href,
              },
              value: formattedValue,
              rawStats: stats
            });
          }
        });
      });
      
      console.log('All leaders:', allLeaders.length);
      return allLeaders;
    };

    const result = {
      gameId,
      teamStats: {
        home: parseTeamStats(boxscore?.teams?.[0]?.statistics),
        away: parseTeamStats(boxscore?.teams?.[1]?.statistics)
      },
      leaders: parseLeadersFromBoxscore(),
      betting: parseBettingInfo(),
      winProbability: parseWinProbability(),
      scoringPlays: parseScoringPlays(data.drives?.previous)
    };

    console.log(`Game ${gameId} details loaded, leaders count: ${result.leaders.length}`);
    return result;
  } catch (error) {
    console.error('Get game details error:', error);
    return null;
  }
};

// Get injuries for a specific team
const getTeamInjuries = async (teamId) => {
  try {
    // Use the core API for injuries - different from main API_BASE
    const url = `https://sports.core.api.espn.com/v2/sports/football/leagues/nfl/teams/${teamId}/injuries`;
    console.log(`Fetching injuries for team ${teamId}...`);
    const data = await fetchWithCache(url, 30 * 60 * 1000); // 30 min cache for injuries

    // The core API returns items array with $ref links
    let injuries = [];
    
    if (data.items && Array.isArray(data.items)) {
      // Fetch up to 30 injuries per team to get a good sample
      const injuryPromises = data.items.slice(0, 30).map(async (item) => {
        if (item.$ref) {
          try {
            // Convert http to https
            const refUrl = item.$ref.replace('http://', 'https://');
            const injuryData = await fetchWithCache(refUrl, 30 * 60 * 1000);
            
            // If athlete is also a $ref, fetch it
            if (injuryData.athlete?.$ref) {
              try {
                const athleteUrl = injuryData.athlete.$ref.replace('http://', 'https://');
                const athleteData = await fetchWithCache(athleteUrl, 60 * 60 * 1000);
                injuryData.athlete = athleteData;
              } catch (e) {
                console.log('Could not fetch athlete ref:', e.message);
              }
            }
            
            return injuryData;
          } catch (e) {
            console.log('Could not fetch injury ref:', e.message);
            return null;
          }
        }
        return item;
      });
      injuries = (await Promise.all(injuryPromises)).filter(Boolean);
    } else if (data.injuries) {
      injuries = data.injuries;
    }
    
    if (injuries.length === 0) {
      console.log(`No injury data for team ${teamId}`);
      return [];
    }

    console.log(`Found ${injuries.length} raw injuries for team ${teamId}`);
    
    // Log all unique statuses for debugging
    const uniqueStatuses = [...new Set(injuries.map(i => i.status?.type || i.status || 'unknown'))];
    console.log(`Unique statuses for team ${teamId}:`, uniqueStatuses);
    
    // Log first injury structure for debugging
    if (injuries[0]) {
      console.log(`Sample injury structure:`, JSON.stringify({
        status: injuries[0].status,
        athlete: injuries[0].athlete ? {
          displayName: injuries[0].athlete.displayName,
          fullName: injuries[0].athlete.fullName,
          position: injuries[0].athlete.position
        } : 'no athlete'
      }));
    }
    
    const mapped = injuries.map(injury => {
      // Handle both direct data and nested athlete refs
      const athlete = injury.athlete || {};
      const result = {
        player: {
          id: athlete.id,
          name: athlete.displayName || athlete.fullName,
          position: athlete.position?.abbreviation || athlete.position?.name,
          jersey: athlete.jersey,
          headshot: athlete.headshot?.href
        },
        status: injury.status?.type || injury.status, // status might be an object with type
        type: injury.type?.description || injury.description,
        details: injury.details?.detail || injury.longComment,
        date: injury.date
      };
      return result;
    }).filter(i => i.player.name && i.status);
    
    console.log(`Returning ${mapped.length} processed injuries for team ${teamId}`);
    if (mapped[0]) {
      console.log('Sample processed injury:', JSON.stringify(mapped[0]));
    }
    
    return mapped;
  } catch (error) {
    console.error(`Get injuries error for team ${teamId}:`, error.message);
    return [];
  }
};

// Get injuries for multiple teams (for a week's games)
const getInjuriesForTeams = async (teamIds) => {
  try {
    const injuriesPromises = teamIds.map(async (teamId) => {
      const injuries = await getTeamInjuries(teamId);
      return [String(teamId), injuries];
    });
    
    const results = await Promise.all(injuriesPromises);
    return Object.fromEntries(results);
  } catch (error) {
    console.error('Get injuries for teams error:', error);
    return {};
  }
};

// Get comprehensive team info (news, stats, roster, upcoming games)

const getTeamInfo = async (teamId) => {
  try {
    console.log('Fetching comprehensive team info for:', teamId);
    
    // Get current season first
    const season = await getCurrentSeasonYear();
    console.log('Using season:', season);
    
    // Fetch all data in parallel (including league rankings, season results, and injuries)
    const [teamData, scheduleData, statsData, rosterData, leagueRankings, seasonResults, injuriesData] = await Promise.all([
      fetchWithCache(`${API_BASE}/teams/${teamId}`, 30 * 60 * 1000).catch(e => { console.log('Team fetch error:', e.message); return null; }),
      fetchWithCache(`${API_BASE}/teams/${teamId}/schedule?season=${season}`, 15 * 60 * 1000).catch(e => { console.log('Schedule fetch error:', e.message); return null; }),
      fetchWithCache(`${API_BASE}/teams/${teamId}/statistics?season=${season}`, 30 * 60 * 1000).catch(e => { console.log('Stats fetch error:', e.message); return null; }),
      fetchWithCache(`${API_BASE}/teams/${teamId}/roster`, 60 * 60 * 1000).catch(e => { console.log('Roster fetch error:', e.message); return null; }),
      getLeagueRankings().catch(e => { console.log('League rankings error:', e.message); return null; }),
      getTeamSeasonResults(teamId, season).catch(e => { console.log('Season results error:', e.message); return []; }),
      getTeamInjuries(teamId).catch(e => { console.log('Injuries fetch error:', e.message); return []; })
    ]);
    
    // Build injury map by player name (lowercase for matching)
    const injuryMap = new Map();
    if (injuriesData && Array.isArray(injuriesData)) {
      injuriesData.forEach(injury => {
        const name = (injury.athlete?.displayName || injury.athlete?.fullName || '').toLowerCase();
        if (name) {
          injuryMap.set(name, {
            status: injury.status?.type || injury.status || 'Unknown',
            description: injury.status?.description || injury.description || ''
          });
        }
      });
      console.log('Injury map size:', injuryMap.size);
    }

    // Debug logging
    console.log('=== Team Info Debug ===');
    console.log('League rankings available:', !!leagueRankings);
    console.log('Season results count:', seasonResults?.length || 0);

    // Parse team details
    const team = teamData?.team || {};
    
    // Get records from team.record.items
    let overallRecord = null;
    let homeRecord = null;
    let awayRecord = null;
    
    if (team.record?.items) {
      team.record.items.forEach(item => {
        const type = (item.type || '').toLowerCase();
        if (type === 'total') overallRecord = item.summary;
        else if (type === 'home') homeRecord = item.summary;
        else if (type === 'road') awayRecord = item.summary;
      });
    }

    const teamInfo = {
      id: team.id,
      name: team.displayName || team.name,
      abbreviation: team.abbreviation,
      logo: team.logos?.[0]?.href,
      color: team.color ? `#${team.color}` : '#333',
      venue: team.franchise?.venue?.fullName,
      location: team.location,
      division: team.groups?.name,
      standing: team.standingSummary,
      record: overallRecord,
      homeRecord: homeRecord,
      awayRecord: awayRecord,
      streak: null
    };

    // Parse team statistics with league-wide rankings
    const parseTeamStats = () => {
      const categories = statsData?.results?.stats?.categories || [];
      const stats = {};
      
      categories.forEach(cat => {
        cat.stats?.forEach(stat => {
          stats[stat.name] = {
            value: stat.value,
            displayValue: stat.displayValue,
            rank: stat.rank,
            rankDisplayValue: stat.rankDisplayValue
          };
        });
      });
      
      // Helper to format rank display
      const formatRank = (rank) => {
        if (!rank) return null;
        const num = parseInt(rank);
        if (num === 1) return '1st';
        if (num === 2) return '2nd';
        if (num === 3) return '3rd';
        return `${num}th`;
      };
      
      // Calculate games played from record for per-game stats
      const gamesPlayed = overallRecord ? 
        overallRecord.split('-').reduce((sum, n) => sum + parseInt(n) || 0, 0) : 16;
      
      // Calculate PPG and Opp PPG using seasonResults (same source as Schedule page)
      let totalPointsFor = 0;
      let totalPointsAgainst = 0;
      let validGames = 0;
      
      if (seasonResults && seasonResults.length > 0) {
        seasonResults.forEach(r => {
          const pf = Number(r.teamScore);
          const pa = Number(r.oppScore);
          if (!isNaN(pf) && pf >= 0) {
            totalPointsFor += pf;
            totalPointsAgainst += (!isNaN(pa) && pa >= 0) ? pa : 0;
            validGames++;
          }
        });
      }
      
      const pointsPerGame = validGames > 0 ? (totalPointsFor / validGames).toFixed(1) : null;
      const pointsAllowedPerGame = validGames > 0 ? (totalPointsAgainst / validGames).toFixed(1) : null;
      
      return {
        passing: {
          yardsPerGame: stats.netPassingYardsPerGame || stats.passingYardsPerGame,
          touchdowns: stats.passingTouchdowns,
          touchdownsPerGame: stats.passingTouchdowns ? {
            displayValue: (stats.passingTouchdowns.value / gamesPlayed).toFixed(1),
            rank: stats.passingTouchdowns.rank
          } : null
        },
        rushing: {
          yardsPerGame: stats.rushingYards ? {
            displayValue: (stats.rushingYards.value / gamesPlayed).toFixed(1),
            rank: stats.rushingYards.rank
          } : null,
          touchdowns: stats.rushingTouchdowns,
          touchdownsPerGame: stats.rushingTouchdowns ? {
            displayValue: (stats.rushingTouchdowns.value / gamesPlayed).toFixed(1),
            rank: stats.rushingTouchdowns.rank
          } : null,
          yardsPerCarry: stats.yardsPerRushAttempt
        },
        offense: {
          pointsPerGame: pointsPerGame ? { displayValue: pointsPerGame } : null
        },
        defense: {
          pointsAllowedPerGame: pointsAllowedPerGame ? { displayValue: pointsAllowedPerGame } : null
        },
        // Use league-wide calculated rankings
        rankings: leagueRankings ? {
          passingYPG: formatRank(leagueRankings.passingYPG?.[teamId]),
          passingTD: formatRank(leagueRankings.passingTDPG?.[teamId]),
          rushingYPG: formatRank(leagueRankings.rushingYPG?.[teamId]),
          rushingTD: formatRank(leagueRankings.rushingTDPG?.[teamId]),
          rushingYPC: formatRank(leagueRankings.rushingYPC?.[teamId]),
          pointsFor: formatRank(leagueRankings.pointsFor?.[teamId]),
          pointsAgainst: formatRank(leagueRankings.pointsAgainst?.[teamId])
        } : {}
      };
    };

    // Helper to fetch athlete stats
    const fetchAthleteStats = async (playerId) => {
      try {
        // Get current season
        const season = await getCurrentSeasonYear();
        
        // First try the core API which has gamesPlayed
        const coreUrl = `https://sports.core.api.espn.com/v2/sports/football/leagues/nfl/seasons/${season}/types/2/athletes/${playerId}/statistics`;
        let gamesPlayed = null;
        try {
          const coreData = await fetchWithCache(coreUrl, 30 * 60 * 1000);
          // Extract gamesPlayed from the 'general' category
          if (coreData?.splits?.categories) {
            const generalCat = coreData.splits.categories.find(c => c.name === 'general');
            if (generalCat?.stats) {
              const gpStat = generalCat.stats.find(s => s.name === 'gamesPlayed');
              if (gpStat) {
                gamesPlayed = gpStat.value;
              }
            }
          }
        } catch (e) {
          // Core API failed, gamesPlayed will be null
        }
        
        // Also fetch overview for detailed stats
        const url = `https://site.api.espn.com/apis/common/v3/sports/football/nfl/athletes/${playerId}/overview`;
        const data = await fetchWithCache(url, 30 * 60 * 1000);
        
        // Attach gamesPlayed to data
        if (data) {
          data._gamesPlayed = gamesPlayed;
        }
        
        return data;
      } catch (e) {
        return null;
      }
    };

    // Parse stats from athlete data
    const parseAthleteStats = (data) => {
      const stats = {};
      
      try {
        if (data?.statistics) {
          const statObj = data.statistics;
          const names = statObj.names || [];
          
          if (statObj.splits && Array.isArray(statObj.splits) && names.length > 0) {
            const targetSplit = statObj.splits.find(s => s.displayName === 'Regular Season') || statObj.splits[0];
            
            if (targetSplit && targetSplit.stats && Array.isArray(targetSplit.stats)) {
              targetSplit.stats.forEach((value, idx) => {
                const name = names[idx];
                if (name && value !== undefined && value !== null && value !== '' && value !== '--' && value !== '-') {
                  stats[name] = String(value);
                }
              });
            }
          }
        }
        
        // Add gamesPlayed from core API if available
        if (data?._gamesPlayed) {
          stats.gamesPlayed = String(data._gamesPlayed);
        }
      } catch (e) {
        // Ignore parsing errors
      }
      
      return stats;
    };

    // Get display stats based on position (includes per-game stats for offense)
    const getDisplayStats = (stats, position) => {
      const displayStats = {};
      const perGameStats = {};
      
      // Get gamesPlayed from core API (now included in stats)
      const gamesPlayed = parseStatNumber(stats.gamesPlayed) || 0;
      
      if (position === 'QB') {
        if (stats.passingYards) {
          displayStats['Yds'] = stats.passingYards;
          if (gamesPlayed > 0) {
            perGameStats['Yds/G'] = (parseStatNumber(stats.passingYards) / gamesPlayed).toFixed(1);
          }
        }
        if (stats.passingTouchdowns) displayStats['TD'] = stats.passingTouchdowns;
        if (stats.interceptions) displayStats['INT'] = stats.interceptions;
        
      } else if (position === 'RB') {
        if (stats.rushingYards) {
          displayStats['Yds'] = stats.rushingYards;
          if (gamesPlayed > 0) {
            perGameStats['Yds/G'] = (parseStatNumber(stats.rushingYards) / gamesPlayed).toFixed(1);
          }
        }
        if (stats.rushingTouchdowns) displayStats['TD'] = stats.rushingTouchdowns;
        
      } else if (position === 'WR' || position === 'TE') {
        if (stats.receptions) {
          displayStats['Rec'] = stats.receptions;
          if (gamesPlayed > 0) {
            perGameStats['Rec/G'] = (parseStatNumber(stats.receptions) / gamesPlayed).toFixed(1);
          }
        }
        if (stats.receivingYards) {
          displayStats['Yds'] = stats.receivingYards;
          if (gamesPlayed > 0) {
            perGameStats['Yds/G'] = (parseStatNumber(stats.receivingYards) / gamesPlayed).toFixed(1);
          }
        }
        if (stats.receivingTouchdowns) displayStats['TD'] = stats.receivingTouchdowns;
        
      } else if (position === 'LB' || position === 'CB' || position === 'S' || position === 'DE' || position === 'DT') {
        if (stats.totalTackles) displayStats['Tkl'] = stats.totalTackles;
        if (stats.sacks) displayStats['Sacks'] = stats.sacks;
        if (stats.interceptions) displayStats['INT'] = stats.interceptions;
      }
      
      return { displayStats, perGameStats };
    };

    // Parse stat number handling commas
    const parseStatNumber = (val) => parseInt(String(val).replace(/,/g, '')) || 0;
    
    // Get primary stat value for comparison
    const getPrimaryStat = (stats, position) => {
      if (position === 'QB') return parseStatNumber(stats.passingYards);
      if (position === 'RB') return parseStatNumber(stats.rushingYards);
      if (position === 'WR' || position === 'TE') return parseStatNumber(stats.receivingYards);
      if (position === 'LB' || position === 'S') return parseStatNumber(stats.totalTackles);
      if (position === 'CB') return parseStatNumber(stats.interceptions) * 100 + parseStatNumber(stats.passesDefended);
      if (position === 'DE' || position === 'DT') return parseStatNumber(stats.sacks) * 10 + parseStatNumber(stats.totalTackles);
      return 0;
    };

    // Parse top players - fetch multiple per position, pick best
    const parseTopPlayers = async () => {
      if (!rosterData?.athletes) {
        console.log('No roster data available');
        return [];
      }
      
      // Collect players by position
      const candidatesByPosition = { 
        QB: [], RB: [], WR: [], TE: [],
        LB: [], CB: [], S: [], DE: [], DT: []
      };
      // Collect ALL players at each position - we'll filter by stats later
      const maxPerPosition = { 
        QB: 10, RB: 10, WR: 10, TE: 10,
        LB: 10, CB: 10, S: 10, DE: 10, DT: 10
      };
      
      rosterData.athletes.forEach(group => {
        group.items?.forEach(player => {
          const pos = player.position?.abbreviation;
          if (candidatesByPosition[pos] && candidatesByPosition[pos].length < maxPerPosition[pos]) {
            candidatesByPosition[pos].push({
              id: player.id,
              position: pos,
              name: player.displayName || player.fullName,
              headshot: player.headshot?.href,
              jersey: player.jersey
            });
          }
        });
      });
      
      // Flatten all candidates
      const allCandidates = Object.values(candidatesByPosition).flat();
      console.log('Fetching stats for', allCandidates.length, 'candidates');
      
      // Fetch stats for all candidates in parallel
      const candidatesWithStats = await Promise.all(
        allCandidates.map(async (player) => {
          const athleteData = await fetchAthleteStats(player.id);
          const rawStats = athleteData ? parseAthleteStats(athleteData) : {};
          const primaryStat = getPrimaryStat(rawStats, player.position);
          const { displayStats, perGameStats } = getDisplayStats(rawStats, player.position);
          
          // Check injury status
          const injury = injuryMap.get(player.name.toLowerCase());
          
          // For QBs, track games started using actual gamesPlayed from core API
          const gamesStarted = player.position === 'QB' 
            ? parseStatNumber(rawStats.gamesPlayed) || 0
            : 0;
          
          return {
            ...player,
            rawStats,
            primaryStat,
            stats: displayStats,
            perGameStats,
            gamesStarted,
            injury: injury || null
          };
        })
      );
      
      // Helper to check if player has significant injury (should show backup)
      const isSignificantlyInjured = (player) => {
        if (!player?.injury) return false;
        const status = (player.injury.status || '').toLowerCase();
        return ['out', 'ir', 'doubtful', 'injured reserve', 'pup'].some(s => status.includes(s));
      };
      
      // Helper to build player object for result
      const buildPlayer = (p, includePosition = false) => {
        const result = { 
          name: p.name, 
          headshot: p.headshot, 
          jersey: p.jersey, 
          stats: p.stats,
          perGameStats: p.perGameStats,
          injury: p.injury
        };
        if (includePosition) result.position = p.position;
        return result;
      };
      
      // Organize players by category
      const result = {
        qb: [],
        rb: [],
        wr: [],
        te: [],
        def: []
      };
      
      // Get best QBs - show top 2 only if both have played at least 1 game
      const qbCandidates = candidatesWithStats.filter(p => p.position === 'QB');
      qbCandidates.sort((a, b) => b.primaryStat - a.primaryStat);
      const qbsWhoStarted = qbCandidates.filter(p => p.gamesStarted >= 1);
      console.log('QBs with games played:', qbsWhoStarted.map(q => `${q.name} (${q.gamesStarted} GP)`));
      
      if (qbsWhoStarted.length >= 2) {
        // Multiple QBs started - show top 2
        qbsWhoStarted.slice(0, 2).forEach(p => result.qb.push(buildPlayer(p)));
        // If either is injured, show 3rd starter if available
        if (qbsWhoStarted.slice(0, 2).some(p => isSignificantlyInjured(p)) && qbsWhoStarted[2]) {
          result.qb.push(buildPlayer(qbsWhoStarted[2]));
        }
      } else if (qbsWhoStarted.length === 1) {
        // Only 1 QB started - show just them
        result.qb.push(buildPlayer(qbsWhoStarted[0]));
        // If starter is injured, show backup
        if (isSignificantlyInjured(qbsWhoStarted[0]) && qbCandidates[1]) {
          result.qb.push(buildPlayer(qbCandidates[1]));
        }
      } else {
        // No clear starter - show top QB by stats
        const topQB = qbCandidates.find(p => p.primaryStat > 0);
        if (topQB) result.qb.push(buildPlayer(topQB));
      }
      
      // Get best RBs (2)
      const rbCandidates = candidatesWithStats.filter(p => p.position === 'RB');
      rbCandidates.sort((a, b) => b.primaryStat - a.primaryStat);
      console.log('RB candidates by rushing yards:', rbCandidates.slice(0, 5).map(r => `${r.name}: ${r.primaryStat} yds`));
      rbCandidates.slice(0, 2).forEach(p => {
        if (p.primaryStat > 0) result.rb.push(buildPlayer(p));
      });
      
      // Get best WRs (3)
      const wrCandidates = candidatesWithStats.filter(p => p.position === 'WR');
      wrCandidates.sort((a, b) => b.primaryStat - a.primaryStat);
      wrCandidates.slice(0, 3).forEach(p => {
        if (p.primaryStat > 0) result.wr.push(buildPlayer(p));
      });
      
      // Get best TEs (top 2 if both have stats, or show backup if top is injured)
      const teCandidates = candidatesWithStats.filter(p => p.position === 'TE');
      teCandidates.sort((a, b) => b.primaryStat - a.primaryStat);
      const tesWithStats = teCandidates.filter(p => p.primaryStat > 0);
      // Show top TE
      if (tesWithStats[0]) {
        result.te.push(buildPlayer(tesWithStats[0]));
        // Show 2nd TE if top is injured OR if 2nd TE has significant stats (>200 yds)
        if (tesWithStats[1] && (isSignificantlyInjured(tesWithStats[0]) || tesWithStats[1].primaryStat > 200)) {
          result.te.push(buildPlayer(tesWithStats[1]));
        }
      }
      
      // Get best defensive players (2)
      const defPositions = ['LB', 'CB', 'S', 'DE', 'DT'];
      const defCandidates = candidatesWithStats.filter(p => defPositions.includes(p.position));
      defCandidates.sort((a, b) => b.primaryStat - a.primaryStat);
      defCandidates.slice(0, 2).forEach(p => {
        if (p.primaryStat > 0) result.def.push(buildPlayer(p, true));
      });
      
      console.log('Top players by position:', {
        qb: result.qb.map(p => `${p.name}${p.injury ? ` (${p.injury.status})` : ''}`),
        rb: result.rb.map(p => `${p.name}${p.injury ? ` (${p.injury.status})` : ''}`),
        wr: result.wr.map(p => `${p.name}${p.injury ? ` (${p.injury.status})` : ''}`),
        te: result.te.map(p => `${p.name}${p.injury ? ` (${p.injury.status})` : ''}`),
        def: result.def.map(p => `${p.name}${p.injury ? ` (${p.injury.status})` : ''}`)
      });
      
      return result;
    };

    // Parse full schedule and calculate streak
    const parseFullSchedule = () => {
      const events = scheduleData?.events || [];
      
      let wins = 0, losses = 0, ties = 0;
      const results = [];
      
      const schedule = events.map(event => {
        const comp = event.competitions?.[0];
        const teamIdStr = String(teamId);
        
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
          teamScore = typeof teamComp?.score === 'object' ? parseInt(teamComp.score.displayValue) : parseInt(teamComp?.score);
          oppScore = typeof opponent?.score === 'object' ? parseInt(opponent.score.displayValue) : parseInt(opponent?.score);
          
          if (teamComp?.winner) {
            result = 'W'; wins++; results.push('W');
          } else if (opponent?.winner) {
            result = 'L'; losses++; results.push('L');
          } else {
            result = 'T'; ties++; results.push('T');
          }
        }
        
        const recordAtTime = `${wins}-${losses}${ties > 0 ? `-${ties}` : ''}`;
        
        return {
          id: event.id,
          week: event.week?.number,
          date: event.date,
          isCompleted,
          isHome,
          result,
          teamScore,
          oppScore,
          teamRecord: recordAtTime,
          opponent: {
            id: opponent?.team?.id,
            name: opponent?.team?.displayName || opponent?.team?.name,
            abbreviation: opponent?.team?.abbreviation,
            logo: opponent?.team?.logo,
            record: opponent?.records?.[0]?.summary
          },
          broadcast: comp?.broadcasts?.[0]?.names?.[0],
          spread: comp?.odds?.[0]?.details
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

    const { schedule, streak } = parseFullSchedule();
    
    // Fetch news with team filter
    let news = [];
    try {
      const newsUrl = `https://site.api.espn.com/apis/site/v2/sports/football/nfl/news?limit=10&team=${teamId}`;
      const newsData = await fetchWithCache(newsUrl, 10 * 60 * 1000);
      
      const articles = newsData?.articles || [];
      
      news = articles.slice(0, 8).map(article => ({
        headline: article.headline,
        description: article.description,
        published: article.published,
        image: article.images?.[0]?.url,
        link: article.links?.web?.href || article.links?.mobile?.href,
        type: article.type,
        source: article.source || (article.links?.web?.href?.includes('espn.com') ? 'ESPN' : null),
        premium: article.premium || false
      })).filter(a => a.headline);
    } catch (e) {
      console.log('News fetch failed:', e.message);
    }

    // Get top players with their stats (async)
    const topPlayers = await parseTopPlayers();

    const result = {
      team: { ...teamInfo, streak },
      news,
      stats: parseTeamStats(),
      topPlayers,
      schedule
    };
    
    console.log('=== End Team Info Debug ===');
    return result;
  } catch (error) {
    console.error(`Get team info error for ${teamId}:`, error);
    return null;
  }
};

/**
 * Get current game status for a team in a specific week
 * Returns score, period, clock, situation, and recent plays
 */
const getTeamGameStatus = async (teamId, week, season = null) => {
  try {
    // Get current season if not provided
    if (!season) {
      const { season: currentSeason } = await getCurrentSeason();
      season = currentSeason;
    }
    
    // Get week schedule (handle playoff weeks)
    const { espnWeek, seasonType } = getEspnWeekParams(week);
    const games = await getWeekSchedule(season, espnWeek, seasonType);
    
    // Find the game for this team
    const game = games.find(g => 
      String(g.homeTeam?.id) === String(teamId) || 
      String(g.awayTeam?.id) === String(teamId)
    );
    
    if (!game) {
      return null; // Team not playing this week (bye)
    }
    
    const isHome = String(game.homeTeam?.id) === String(teamId);
    const team = isHome ? game.homeTeam : game.awayTeam;
    const opponent = isHome ? game.awayTeam : game.homeTeam;
    
    // Determine game state
    let state = 'pre';
    if (game.status === 'STATUS_FINAL') {
      state = 'post';
    } else if (game.status === 'STATUS_IN_PROGRESS') {
      state = 'in';
    }
    
    const result = {
      gameId: game.id,
      gameDate: game.date,
      state,
      status: game.status,
      statusDetail: game.statusDetail,
      period: game.period || null,
      clock: game.clock || null,
      venue: game.venue,
      broadcast: game.broadcast,
      team: {
        id: team.id,
        name: team.name,
        abbreviation: team.abbreviation,
        logo: team.logo,
        score: team.score ?? 0,
        isHome,
        record: team.record || null,
        streak: team.streak || null,
        avgPointsFor: team.avgPointsFor || null,
        avgPointsAgainst: team.avgPointsAgainst || null
      },
      opponent: {
        id: opponent.id,
        name: opponent.name,
        abbreviation: opponent.abbreviation,
        logo: opponent.logo,
        score: opponent.score ?? 0,
        record: opponent.record || null,
        streak: opponent.streak || null,
        avgPointsFor: opponent.avgPointsFor || null,
        avgPointsAgainst: opponent.avgPointsAgainst || null
      },
      odds: game.odds || null
    };
    
    // For live games, fetch additional details
    if (state === 'in') {
      try {
        const details = await getGameDetails(game.id);
        if (details) {
          // Add situation info
          if (details.situation) {
            result.situation = {
              possession: details.situation.possession,
              down: details.situation.down,
              distance: details.situation.distance,
              yardLine: details.situation.yardLine,
              isRedZone: details.situation.isRedZone
            };
          }
          
          // Add recent plays
          if (details.recentPlays) {
            result.recentPlays = details.recentPlays.slice(0, 5);
          }
        }
      } catch (e) {
        console.log('Failed to get live game details:', e.message);
      }
    }
    
    return result;
  } catch (error) {
    console.error(`Get team game status error for team ${teamId}:`, error);
    return null;
  }
};

module.exports = {
  getCurrentSeason,
  getWeekSchedule,
  getTeams,
  getTeam,
  getTeamSeasonResults,
  hasGameStarted,
  getGameWinner,
  getGameDetails,
  getTeamInjuries,
  getInjuriesForTeams,
  getTeamInfo,
  getTeamGameStatus
};