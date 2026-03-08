import { BROADCAST_NETWORKS, SPORT_CONFIG } from './constants';

export default {
  id: 'nba',
  name: 'NBA',
  displayName: 'NBA Schedule',
  gameType: 'schedule',
  scheduleType: 'daily',
  periodName: 'Date',

  // UI styling
  gradientClasses: 'from-blue-600 to-blue-800',
  secondaryGradient: 'from-blue-600/20 to-blue-800/20',
  borderColor: 'border-nba-blue/30',
  accentColor: '#1D428A',

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
