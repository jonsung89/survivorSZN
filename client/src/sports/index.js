import nfl from './nfl';

const sportModules = {
  nfl,
};

export function getSportModule(sportId) {
  return sportModules[sportId] || sportModules.nfl;
}

export function getAllSports() {
  return Object.values(sportModules).map(m => ({
    id: m.id,
    name: m.name,
    displayName: m.displayName,
    gameType: m.gameType,
  }));
}
