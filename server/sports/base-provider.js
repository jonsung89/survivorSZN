/**
 * Base class for sport data providers.
 * Each sport module must export a provider extending this class.
 */
class BaseSportProvider {
  constructor(sportId, config = {}) {
    this.sportId = sportId;
    this.config = config;
  }

  /** Get current season info: { season, week, seasonType } */
  async getCurrentSeason() {
    throw new Error('Not implemented: getCurrentSeason');
  }

  /** Get schedule/games for a specific period */
  async getSchedule(season, period, periodType) {
    throw new Error('Not implemented: getSchedule');
  }

  /** Get all teams/entities for this sport */
  async getTeams() {
    throw new Error('Not implemented: getTeams');
  }

  /** Get a single team/entity by ID */
  getTeam(teamId) {
    throw new Error('Not implemented: getTeam');
  }

  /** Check if a game/match has started */
  hasGameStarted(gameDate) {
    throw new Error('Not implemented: hasGameStarted');
  }

  /** Determine the winner of a completed game */
  getGameWinner(game) {
    throw new Error('Not implemented: getGameWinner');
  }

  /** Validate a period number (week/round) for this sport */
  validatePeriod(period, league) {
    throw new Error('Not implemented: validatePeriod');
  }

  /** Get the display label for a period */
  getPeriodLabel(period) {
    throw new Error('Not implemented: getPeriodLabel');
  }

  /** Convert app period to provider-specific params */
  getProviderPeriodParams(period) {
    throw new Error('Not implemented: getProviderPeriodParams');
  }

  /** Get valid start periods for league creation */
  getValidStartPeriods() {
    throw new Error('Not implemented: getValidStartPeriods');
  }

  /** Get max period for validation */
  getMaxPeriod() {
    throw new Error('Not implemented: getMaxPeriod');
  }

  /** Get periods to skip (e.g., Pro Bowl) */
  getSkipPeriods() {
    return [];
  }

  // Optional methods — not all sports need these

  /** Get detailed game info */
  async getGameDetails(gameId) { return null; }

  /** Get team injuries */
  async getTeamInjuries(teamId) { return []; }

  /** Get injuries for multiple teams */
  async getInjuriesForTeams(teamIds) { return {}; }

  /** Get comprehensive team info */
  async getTeamInfo(teamId) { return null; }

  /** Get team game status for a specific period */
  async getTeamGameStatus(teamId, period, season) { return null; }

  /** Get team season results */
  async getTeamSeasonResults(teamId, season) { return null; }

  /** Get league-wide rankings */
  async getLeagueRankings() { return null; }

  /** Get league-wide stat rankings for a specific stat */
  async getLeagueStatRankings(statKey) { return null; }

  /** Check if a season has concluded */
  async isSeasonOver(season) {
    return false;
  }

  /** Clear cached data */
  clearCache() {}
}

module.exports = BaseSportProvider;
