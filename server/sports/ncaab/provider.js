const BaseSportProvider = require('../base-provider');
const ncaabService = require('../../services/ncaab');

class NCAABProvider extends BaseSportProvider {
  constructor() {
    super('ncaab', {
      apiBase: 'https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball',
    });
  }

  async getCurrentSeason() {
    return ncaabService.getCurrentSeason();
  }

  async getScheduleByDate(dateStr) {
    return ncaabService.getScheduleByDate(dateStr);
  }

  async getTeams() {
    return ncaabService.getTeams();
  }

  getTeam(teamId) {
    return null;
  }

  async getGameDetails(gameId) {
    return ncaabService.getGameDetails(gameId);
  }

  async getTeamInfo(teamId) {
    return ncaabService.getTeamInfo(teamId);
  }

  async getLeagueStatRankings(statKey) {
    return ncaabService.getLeagueStatRankings(statKey);
  }

  validatePeriod(period, league) {
    return { valid: true };
  }

  getPeriodLabel(period) {
    return `Day ${period}`;
  }

  getMaxPeriod() {
    return 365;
  }

  getValidStartPeriods() {
    return [{ value: 1, label: 'Tournament Start' }];
  }

  async isSeasonOver(season) {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    // NCAAB season: Nov-April
    if (season < year) return true;
    if (season === year && month >= 4) return true; // May+
    return false;
  }

  clearCache() {}
}

module.exports = NCAABProvider;
