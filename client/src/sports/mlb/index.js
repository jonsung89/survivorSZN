import { BROADCAST_NETWORKS, SPORT_CONFIG } from './constants';

export default {
  id: 'mlb',
  name: 'MLB',
  displayName: 'MLB Schedule',
  gameType: 'schedule',
  scheduleType: 'daily',
  periodName: 'Date',

  // UI styling
  gradientClasses: 'from-blue-800 to-blue-950',
  secondaryGradient: 'from-blue-800/20 to-blue-950/20',
  borderColor: 'border-mlb-blue/30',
  badgeClasses: 'bg-red-400/15 text-red-400',
  accentColor: '#002D72',

  // Sport-specific config
  scoringPeriodLabel: SPORT_CONFIG.scoringPeriodLabel,
  periods: SPORT_CONFIG.periods,
  overtimeLabel: SPORT_CONFIG.overtimeLabel,

  // Broadcast networks
  broadcastNetworks: BROADCAST_NETWORKS,

  // No hardcoded teams (fetched from API)
  teams: null,
  getTeam: () => null,
};
