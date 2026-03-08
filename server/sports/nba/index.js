const NBAProvider = require('./provider');
const { SPORT_CONFIG } = require('./constants');

module.exports = {
  id: 'nba',
  name: 'NBA',
  displayName: 'NBA Schedule',
  gameType: 'schedule',
  scheduleType: 'daily',
  provider: new NBAProvider(),
  constants: { SPORT_CONFIG }
};
