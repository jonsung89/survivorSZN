const BaseSportProvider = require('../base-provider');
const { MAX_WEEK, SKIP_WEEKS, REGULAR_SEASON_WEEKS } = require('./constants');
const { getEspnWeekParams, getWeekLabel, validateWeek, getValidStartPeriods, espnToAppWeek } = require('./week-utils');

// Import existing NFL service functions (thin wrapper — avoids rewriting 1700+ lines)
const nflService = require('../../services/nfl');

class NFLProvider extends BaseSportProvider {
  constructor() {
    super('nfl', {
      apiBase: 'https://site.api.espn.com/apis/site/v2/sports/football/nfl',
      teamCount: 32
    });
  }

  async getCurrentSeason() {
    return nflService.getCurrentSeason();
  }

  async getSchedule(season, period, periodType) {
    return nflService.getWeekSchedule(season, period, periodType);
  }

  async getTeams() {
    return nflService.getTeams();
  }

  getTeam(teamId) {
    return nflService.getTeam(teamId);
  }

  hasGameStarted(gameDate) {
    return nflService.hasGameStarted(gameDate);
  }

  getGameWinner(game) {
    return nflService.getGameWinner(game);
  }

  validatePeriod(period, league) {
    return validateWeek(period, league);
  }

  getPeriodLabel(period) {
    return getWeekLabel(period);
  }

  getProviderPeriodParams(period) {
    return getEspnWeekParams(period);
  }

  getValidStartPeriods() {
    return getValidStartPeriods();
  }

  getMaxPeriod() {
    return MAX_WEEK;
  }

  getSkipPeriods() {
    return SKIP_WEEKS;
  }

  espnToAppWeek(espnWeek, seasonType) {
    return espnToAppWeek(espnWeek, seasonType);
  }

  getRegularSeasonPeriods() {
    return REGULAR_SEASON_WEEKS;
  }

  async getGameDetails(gameId) {
    return nflService.getGameDetails(gameId);
  }

  async getTeamInjuries(teamId) {
    return nflService.getTeamInjuries(teamId);
  }

  async getInjuriesForTeams(teamIds) {
    return nflService.getInjuriesForTeams(teamIds);
  }

  async getTeamInfo(teamId) {
    return nflService.getTeamInfo(teamId);
  }

  async getTeamGameStatus(teamId, period, season) {
    return nflService.getTeamGameStatus(teamId, period, season);
  }

  async getTeamSeasonResults(teamId, season) {
    return nflService.getTeamSeasonResults(teamId, season);
  }

  async isSeasonOver(season) {
    try {
      // Check if Super Bowl game (ESPN seasonType 3, week 5) is final
      const games = await nflService.getWeekSchedule(season, 5, 3);
      if (Array.isArray(games) && games.length > 0) {
        return games.every(g => g.status === 'STATUS_FINAL');
      }
      // Fallback: date-based check — NFL season for year X ends by March of X+1
      const now = new Date();
      const currentNFLSeason = now.getMonth() >= 8 ? now.getFullYear() : now.getFullYear() - 1;
      return season < currentNFLSeason || (season === currentNFLSeason && now.getMonth() >= 2);
    } catch (e) {
      // Fallback: date-based check
      const now = new Date();
      const currentNFLSeason = now.getMonth() >= 8 ? now.getFullYear() : now.getFullYear() - 1;
      return season < currentNFLSeason || (season === currentNFLSeason && now.getMonth() >= 2);
    }
  }

  clearCache() {
    nflService.clearCache();
  }
}

module.exports = NFLProvider;
