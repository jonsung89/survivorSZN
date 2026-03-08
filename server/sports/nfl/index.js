const NFLProvider = require('./provider');
const { NFL_TEAMS, WEEK_LABELS, MAX_WEEK, REGULAR_SEASON_WEEKS, SKIP_WEEKS } = require('./constants');

module.exports = {
  id: 'nfl',
  name: 'NFL',
  displayName: 'NFL Survivor',
  gameType: 'survivor',
  provider: new NFLProvider(),
  constants: { NFL_TEAMS, WEEK_LABELS, MAX_WEEK, REGULAR_SEASON_WEEKS, SKIP_WEEKS }
};
