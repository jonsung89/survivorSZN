const NCAABProvider = require('./provider');
const { SPORT_CONFIG } = require('./constants');

module.exports = {
  id: 'ncaab',
  name: 'NCAAB',
  displayName: 'NCAAB Schedule',
  gameType: 'schedule',
  scheduleType: 'daily',
  provider: new NCAABProvider(),
  constants: { SPORT_CONFIG }
};
