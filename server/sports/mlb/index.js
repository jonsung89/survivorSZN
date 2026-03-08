const MLBProvider = require('./provider');
const { SPORT_CONFIG } = require('./constants');

module.exports = {
  id: 'mlb',
  name: 'MLB',
  displayName: 'MLB Schedule',
  gameType: 'schedule',
  scheduleType: 'daily',
  provider: new MLBProvider(),
  constants: { SPORT_CONFIG }
};
