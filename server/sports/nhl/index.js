const NHLProvider = require('./provider');
const { SPORT_CONFIG } = require('./constants');

module.exports = {
  id: 'nhl',
  name: 'NHL',
  displayName: 'NHL Schedule',
  gameType: 'schedule',
  scheduleType: 'daily',
  provider: new NHLProvider(),
  constants: { SPORT_CONFIG }
};
