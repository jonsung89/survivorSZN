import nfl from './nfl';
import nba from './nba';
import mlb from './mlb';
import nhl from './nhl';
import ncaab from './ncaab';

const sportModules = {
  nfl,
  nba,
  mlb,
  nhl,
  ncaab,
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

export function getSportGradient(sportId) {
  const module = getSportModule(sportId);
  return module.gradientClasses || 'from-blue-500 to-blue-700';
}
