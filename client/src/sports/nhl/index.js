import { BROADCAST_NETWORKS, SPORT_CONFIG } from './constants';

export default {
  id: 'nhl',
  name: 'NHL',
  displayName: 'NHL Schedule',
  gameType: 'schedule',
  scheduleType: 'daily',
  periodName: 'Date',

  // UI styling
  gradientClasses: 'from-gray-800 to-gray-950',
  secondaryGradient: 'from-gray-800/20 to-gray-950/20',
  borderColor: 'border-gray-600/30',
  accentColor: '#000000',

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
