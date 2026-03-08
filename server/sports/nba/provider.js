const BaseSportProvider = require('../base-provider');
const nbaService = require('../../services/nba');

class NBAProvider extends BaseSportProvider {
  constructor() {
    super('nba', {
      apiBase: 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba',
    });
  }

  async getCurrentSeason() {
    return nbaService.getCurrentSeason();
  }

  async getScheduleByDate(dateStr) {
    return nbaService.getScheduleByDate(dateStr);
  }

  async getTeams() {
    return nbaService.getTeams();
  }

  getTeam(teamId) {
    return null;
  }

  async getGameDetails(gameId) {
    return nbaService.getGameDetails(gameId);
  }

  async getTeamInfo(teamId) {
    return nbaService.getTeamInfo(teamId);
  }

  async getLeagueStatRankings(statKey) {
    return nbaService.getLeagueStatRankings(statKey);
  }

  async isSeasonOver(season) {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    if (season < year) return true;
    if (season === year && month >= 6) return true; // July+
    return false;
  }

  clearCache() {}
}

module.exports = NBAProvider;
