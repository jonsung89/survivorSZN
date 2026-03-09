import { NFL_TEAMS, BROADCAST_NETWORKS, PLAYOFF_ROUNDS, WEEK_LABELS, SHORT_WEEK_LABELS } from './constants';
import { getWeekLabel, getShortWeekLabel, getWeekFullLabel, getEspnWeekParams, espnToAppWeek, SKIP_WEEKS, MAX_WEEK, REGULAR_SEASON_WEEKS } from './weekUtils';

export default {
  id: 'nfl',
  name: 'NFL',
  displayName: 'NFL Survivor',
  gameType: 'survivor',
  periodName: 'Week',

  // Data
  teams: NFL_TEAMS,
  broadcastNetworks: BROADCAST_NETWORKS,
  playoffRounds: PLAYOFF_ROUNDS,
  weekLabels: WEEK_LABELS,
  shortWeekLabels: SHORT_WEEK_LABELS,

  // Week utilities
  getWeekLabel,
  getShortWeekLabel,
  getWeekFullLabel,
  getEspnWeekParams,
  espnToAppWeek,

  // UI
  gradientClasses: 'from-nfl-blue to-blue-700',
  secondaryGradient: 'from-nfl-blue/20 to-purple-600/20',
  borderColor: 'border-nfl-blue/30',
  badgeClasses: 'bg-blue-400/15 text-blue-400',

  // Config
  maxPeriod: MAX_WEEK,
  skipPeriods: SKIP_WEEKS,
  regularSeasonWeeks: REGULAR_SEASON_WEEKS,
  startPeriodRange: [1, 18],

  // Team helpers
  getTeam: (teamId) => NFL_TEAMS[String(teamId)] || null,
  getTeamLogo: (teamId) => NFL_TEAMS[String(teamId)]?.logo || null,
  getTeamAbbreviation: (teamId) => NFL_TEAMS[String(teamId)]?.abbreviation || '??',
  getTeamName: (teamId) => NFL_TEAMS[String(teamId)]?.name || null,

  // Get valid start periods for league creation
  getCreationPeriods: (currentWeek) => {
    return Array.from({ length: MAX_WEEK }, (_, i) => i + 1)
      .filter(w => w >= currentWeek && !SKIP_WEEKS.includes(w))
      .map(w => ({ value: w, label: getWeekFullLabel(w) }));
  },
};

// Re-export individual items for direct import
export { NFL_TEAMS, BROADCAST_NETWORKS, PLAYOFF_ROUNDS, WEEK_LABELS, SHORT_WEEK_LABELS } from './constants';
export { getWeekLabel, getShortWeekLabel, getWeekFullLabel, getEspnWeekParams, espnToAppWeek, SKIP_WEEKS, MAX_WEEK, REGULAR_SEASON_WEEKS } from './weekUtils';
