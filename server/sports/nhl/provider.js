const BaseSportProvider = require('../base-provider');
const nhlService = require('../../services/nhl');

class NHLProvider extends BaseSportProvider {
  constructor() {
    super('nhl', {
      apiBase: 'https://site.api.espn.com/apis/site/v2/sports/hockey/nhl',
    });
  }

  async getCurrentSeason() {
    return nhlService.getCurrentSeason();
  }

  async getScheduleByDate(dateStr) {
    return nhlService.getScheduleByDate(dateStr);
  }

  async getTeams() {
    return nhlService.getTeams();
  }

  getTeam(teamId) {
    return null;
  }

  async getGameDetails(gameId) {
    return nhlService.getGameDetails(gameId);
  }

  async getTeamInfo(teamId) {
    return nhlService.getTeamInfo(teamId);
  }

  async getLeagueStatRankings(statKey) {
    return nhlService.getLeagueStatRankings(statKey);
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

module.exports = NHLProvider;
