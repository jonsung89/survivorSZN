const nfl = require('./nfl');
const nba = require('./nba');
const mlb = require('./mlb');
const nhl = require('./nhl');
const ncaab = require('./ncaab');

// Registry of all sport modules
const sports = new Map();
sports.set(nfl.id, nfl);
sports.set(nba.id, nba);
sports.set(mlb.id, mlb);
sports.set(nhl.id, nhl);
sports.set(ncaab.id, ncaab);

function getSport(sportId) {
  const sport = sports.get(sportId);
  if (!sport) throw new Error(`Unknown sport: ${sportId}`);
  return sport;
}

function getProvider(sportId) {
  return getSport(sportId).provider;
}

function getAllSports() {
  return Array.from(sports.values()).map(s => ({
    id: s.id,
    name: s.name,
    displayName: s.displayName,
    gameType: s.gameType,
    scheduleType: s.scheduleType || null
  }));
}

module.exports = { getSport, getProvider, getAllSports };
