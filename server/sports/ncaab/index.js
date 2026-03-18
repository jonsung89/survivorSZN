const NCAABProvider = require('./provider');
const { SPORT_CONFIG } = require('./constants');

module.exports = {
  id: 'ncaab',
  name: 'NCAAM',
  displayName: 'NCAAM Schedule',
  gameType: 'bracket',
  scheduleType: 'daily',
  provider: new NCAABProvider(),
  constants: { SPORT_CONFIG }
};
