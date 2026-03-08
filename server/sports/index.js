const nfl = require('./nfl');

// Registry of all sport modules
const sports = new Map();
sports.set(nfl.id, nfl);

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
    gameType: s.gameType
  }));
}

module.exports = { getSport, getProvider, getAllSports };
