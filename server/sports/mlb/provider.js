const BaseSportProvider = require('../base-provider');
const mlbService = require('../../services/mlb');

class MLBProvider extends BaseSportProvider {
  constructor() {
    super('mlb', {
      apiBase: 'https://site.api.espn.com/apis/site/v2/sports/baseball/mlb',
    });
  }

  async getCurrentSeason() {
    return mlbService.getCurrentSeason();
  }

  async getScheduleByDate(dateStr) {
    return mlbService.getScheduleByDate(dateStr);
  }

  async getTeams() {
    return mlbService.getTeams();
  }

  getTeam(teamId) {
    return null;
  }

  async getGameDetails(gameId) {
    return mlbService.getGameDetails(gameId);
  }

  async getTeamInfo(teamId) {
    return mlbService.getTeamInfo(teamId);
  }

  async getLeagueStatRankings(statKey) {
    return mlbService.getLeagueStatRankings(statKey);
  }

  async isSeasonOver(season) {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    if (season < year) return true;
    if (season === year && month >= 10) return true; // November+
    return false;
  }

  clearCache() {}
}

module.exports = MLBProvider;
