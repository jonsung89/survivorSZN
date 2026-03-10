import { BROADCAST_NETWORKS, SPORT_CONFIG } from './constants';

export default {
  id: 'ncaab',
  name: 'NCAAB',
  displayName: 'NCAAB Schedule',
  gameType: 'bracket',
  scheduleType: 'daily',
  periodName: 'Date',

  // UI styling
  gradientClasses: 'from-orange-600 to-orange-800',
  secondaryGradient: 'from-orange-600/20 to-orange-800/20',
  borderColor: 'border-ncaab-orange/30',
  badgeClasses: 'bg-amber-400/15 text-amber-400',
  accentColor: '#FF6600',

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
