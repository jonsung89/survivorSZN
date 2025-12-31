// NFL Data Service - ESPN API Integration with Enhanced Stats
const API_BASE = 'https://site.api.espn.com/apis/site/v2/sports/football/nfl';

// Cache for API responses
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

// Get current NFL season info
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

module.exports = {
  getCurrentSeason,
  getWeekSchedule,
  getTeams,
  getTeam,
  getTeamSeasonResults,
  hasGameStarted,
  getGameWinner,
  getGameDetails
};