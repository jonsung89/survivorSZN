// NFL team data keyed by ESPN team ID (server-side version)
const NFL_TEAMS = {
  '1': { id: '1', name: 'Atlanta Falcons', abbreviation: 'ATL', color: '#A71930' },
  '2': { id: '2', name: 'Buffalo Bills', abbreviation: 'BUF', color: '#00338D' },
  '3': { id: '3', name: 'Chicago Bears', abbreviation: 'CHI', color: '#0B162A' },
  '4': { id: '4', name: 'Cincinnati Bengals', abbreviation: 'CIN', color: '#FB4F14' },
  '5': { id: '5', name: 'Cleveland Browns', abbreviation: 'CLE', color: '#311D00' },
  '6': { id: '6', name: 'Dallas Cowboys', abbreviation: 'DAL', color: '#003594' },
  '7': { id: '7', name: 'Denver Broncos', abbreviation: 'DEN', color: '#FB4F14' },
  '8': { id: '8', name: 'Detroit Lions', abbreviation: 'DET', color: '#0076B6' },
  '9': { id: '9', name: 'Green Bay Packers', abbreviation: 'GB', color: '#203731' },
  '10': { id: '10', name: 'Tennessee Titans', abbreviation: 'TEN', color: '#4B92DB' },
  '11': { id: '11', name: 'Indianapolis Colts', abbreviation: 'IND', color: '#002C5F' },
  '12': { id: '12', name: 'Kansas City Chiefs', abbreviation: 'KC', color: '#E31837' },
  '13': { id: '13', name: 'Las Vegas Raiders', abbreviation: 'LV', color: '#000000' },
  '14': { id: '14', name: 'Los Angeles Rams', abbreviation: 'LAR', color: '#003594' },
  '15': { id: '15', name: 'Miami Dolphins', abbreviation: 'MIA', color: '#008E97' },
  '16': { id: '16', name: 'Minnesota Vikings', abbreviation: 'MIN', color: '#4F2683' },
  '17': { id: '17', name: 'New England Patriots', abbreviation: 'NE', color: '#002244' },
  '18': { id: '18', name: 'New Orleans Saints', abbreviation: 'NO', color: '#D3BC8D' },
  '19': { id: '19', name: 'New York Giants', abbreviation: 'NYG', color: '#0B2265' },
  '20': { id: '20', name: 'New York Jets', abbreviation: 'NYJ', color: '#125740' },
  '21': { id: '21', name: 'Philadelphia Eagles', abbreviation: 'PHI', color: '#004C54' },
  '22': { id: '22', name: 'Arizona Cardinals', abbreviation: 'ARI', color: '#97233F' },
  '23': { id: '23', name: 'Pittsburgh Steelers', abbreviation: 'PIT', color: '#FFB612' },
  '24': { id: '24', name: 'Los Angeles Chargers', abbreviation: 'LAC', color: '#0080C6' },
  '25': { id: '25', name: 'San Francisco 49ers', abbreviation: 'SF', color: '#AA0000' },
  '26': { id: '26', name: 'Seattle Seahawks', abbreviation: 'SEA', color: '#002244' },
  '27': { id: '27', name: 'Tampa Bay Buccaneers', abbreviation: 'TB', color: '#D50A0A' },
  '28': { id: '28', name: 'Washington Commanders', abbreviation: 'WAS', color: '#5A1414' },
  '29': { id: '29', name: 'Carolina Panthers', abbreviation: 'CAR', color: '#0085CA' },
  '30': { id: '30', name: 'Jacksonville Jaguars', abbreviation: 'JAX', color: '#006778' },
  '33': { id: '33', name: 'Baltimore Ravens', abbreviation: 'BAL', color: '#241773' },
  '34': { id: '34', name: 'Houston Texans', abbreviation: 'HOU', color: '#03202F' }
};

const WEEK_LABELS = {
  19: 'Wild Card',
  20: 'Divisional',
  21: 'Conference',
  23: 'Super Bowl'
};

const MAX_WEEK = 23;
const REGULAR_SEASON_WEEKS = 18;
const SKIP_WEEKS = [22]; // Pro Bowl

module.exports = { NFL_TEAMS, WEEK_LABELS, MAX_WEEK, REGULAR_SEASON_WEEKS, SKIP_WEEKS };
