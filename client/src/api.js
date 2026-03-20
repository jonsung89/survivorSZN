import { auth } from './firebase';
import { signOut as firebaseSignOut } from 'firebase/auth';

const API_URL = import.meta.env.VITE_API_URL || '/api';

// Get token from localStorage
const getToken = () => localStorage.getItem('token');

// Track if we're already handling a 401 to prevent redirect loops
let _handlingExpiry = false;

// Make authenticated request with automatic token refresh on 401
const authFetch = async (url, options = {}, _retried = false) => {
  const token = getToken();
  const headers = {
    'Content-Type': 'application/json',
    ...(token && { Authorization: `Bearer ${token}` }),
    ...options.headers
  };

  const response = await fetch(`${API_URL}${url}`, {
    ...options,
    headers
  });

  if (response.status === 401 && !_retried) {
    // Try refreshing the token before giving up
    if (auth.currentUser) {
      try {
        const newToken = await auth.currentUser.getIdToken(true);
        localStorage.setItem('token', newToken);
        return authFetch(url, options, true);
      } catch (err) {
        // Token refresh failed — session is truly expired
      }
    }
    localStorage.removeItem('token');
    // Sign out of Firebase to clear cached session and prevent redirect loops
    if (!_handlingExpiry) {
      _handlingExpiry = true;
      firebaseSignOut(auth).catch(() => {}).finally(() => { _handlingExpiry = false; });
    }
    throw new Error('Session expired');
  }

  return response;
};

// League API
export const leagueAPI = {
  create: async (data) => {
    const res = await authFetch('/leagues', {
      method: 'POST',
      body: JSON.stringify(data)
    });
    return res.json();
  },

  getAvailable: async () => {
    const res = await authFetch('/leagues/available');
    return res.json();
  },

  browse: async () => {
    const token = getToken();
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(`${API_URL}/leagues/browse`, { headers });
    return res.json();
  },

  search: async (query) => {
    const res = await authFetch(`/leagues/search?query=${encodeURIComponent(query)}`);
    return res.json();
  },

  join: async (leagueId, password) => {
    const res = await authFetch(`/leagues/${leagueId}/join`, {
      method: 'POST',
      body: JSON.stringify({ password })
    });
    return res.json();
  },

  getMyLeagues: async () => {
    const res = await authFetch('/leagues/my-leagues');
    return res.json();
  },

  getLeague: async (leagueId) => {
    const res = await authFetch(`/leagues/${leagueId}`);
    return res.json();
  },

  getMembersSummary: async (leagueId) => {
    const res = await authFetch(`/leagues/${leagueId}/members-summary`);
    return res.json();
  },

  updateSettings: async (leagueId, settings) => {
    const res = await authFetch(`/leagues/${leagueId}/settings`, {
      method: 'PUT',
      body: JSON.stringify(settings)
    });
    return res.json();
  },

  modifyStrikes: async (leagueId, memberId, action, reason = '', week = null) => {
    const res = await authFetch(`/leagues/${leagueId}/members/${memberId}/strikes`, {
      method: 'POST',
      body: JSON.stringify({ action, reason, week })
    });
    return res.json();
  },

  getStandings: async (leagueId, week) => {
    const url = week 
      ? `/leagues/${leagueId}/standings?week=${week}`
      : `/leagues/${leagueId}/standings`;
    const res = await authFetch(url);
    return res.json();
  },

  getActionLog: async (leagueId) => {
    const res = await authFetch(`/leagues/${leagueId}/action-log`);
    return res.json();
  },

  setMemberPick: async (leagueId, memberId, week, teamId, reason = '', pickNumber = 1) => {
    const res = await authFetch(`/leagues/${leagueId}/members/${memberId}/pick`, {
      method: 'POST',
      body: JSON.stringify({ week, teamId, reason, pickNumber })
    });
    return res.json();
  },

  // Get league info by invite code (public - no auth required)
  getByInviteCode: async (inviteCode) => {
    const res = await fetch(`${API_URL}/leagues/invite/${inviteCode}`, {
      headers: { 'Content-Type': 'application/json' }
    });
    return res.json();
  },

  // Regenerate invite code (commissioner only)
  regenerateInviteCode: async (leagueId) => {
    const res = await authFetch(`/leagues/${leagueId}/regenerate-invite`, {
      method: 'POST'
    });
    return res.json();
  },

  // Toggle member payment status (commissioner only)
  togglePayment: async (leagueId, memberId, hasPaid) => {
    const res = await authFetch(`/leagues/${leagueId}/members/${memberId}/payment`, {
      method: 'POST',
      body: JSON.stringify({ hasPaid })
    });
    return res.json();
  }
};

// Picks API
export const picksAPI = {
  makePick: async (data) => {
    const res = await authFetch('/picks', {
      method: 'POST',
      body: JSON.stringify(data)
    });
    return res.json();
  },

  getLeaguePicks: async (leagueId) => {
    const res = await authFetch(`/picks/league/${leagueId}`);
    return res.json();
  },

  getAvailableTeams: async (leagueId, week) => {
    const res = await authFetch(`/picks/available/${leagueId}/${week}`);
    return res.json();
  },

  // Trigger update of pick results for completed games
  updateResults: async () => {
    const res = await fetch(`${API_URL}/picks/update-results`, {
      method: 'POST'
    });
    return res.json();
  }
};

// NFL API
export const nflAPI = {
  getSeason: async () => {
    const res = await fetch(`${API_URL}/nfl/season`);
    return res.json();
  },

  getTeams: async () => {
    const res = await fetch(`${API_URL}/nfl/teams`);
    return res.json();
  },

  getSchedule: async (week, season, seasonType = 2) => {
    const params = new URLSearchParams();
    if (season) params.append('season', season);
    if (seasonType) params.append('seasonType', seasonType);
    const queryString = params.toString();
    const res = await fetch(`${API_URL}/nfl/schedule${week ? `/${week}` : ''}${queryString ? `?${queryString}` : ''}`);
    return res.json();
  },

  getGameDetails: async (gameId) => {
    const res = await fetch(`${API_URL}/nfl/game/${gameId}`);
    return res.json();
  },

  getTeamInjuries: async (teamId) => {
    const res = await fetch(`${API_URL}/nfl/injuries/${teamId}`);
    return res.json();
  },

  getInjuriesForTeams: async (teamIds) => {
    const res = await fetch(`${API_URL}/nfl/injuries?teams=${teamIds.join(',')}`);
    return res.json();
  },

  // Get comprehensive team info (news, stats, roster, schedule)
  getTeamInfo: async (teamId) => {
    const res = await fetch(`${API_URL}/nfl/teams/${teamId}/info`);
    return res.json();
  },

  // Get team's game status for a specific week (scores, live info, recent plays)
  getTeamGameStatus: async (teamId, week, season = null) => {
    const params = new URLSearchParams();
    if (week) params.append('week', week);
    if (season) params.append('season', season);
    const queryString = params.toString();
    const res = await fetch(`${API_URL}/nfl/teams/${teamId}/game${queryString ? `?${queryString}` : ''}`);
    return res.json();
  }
};

// Schedule API (multi-sport)
export const scheduleAPI = {
  getSeason: async (sport) => {
    const res = await fetch(`${API_URL}/schedule/${sport}/season`);
    return res.json();
  },

  getScheduleByDate: async (sport, date) => {
    const res = await fetch(`${API_URL}/schedule/${sport}/date/${date}`);
    return res.json();
  },

  getGameDetails: async (sport, gameId, options = {}) => {
    const params = options.live ? '?live=1' : '';
    const res = await fetch(`${API_URL}/schedule/${sport}/game/${gameId}${params}`);
    return res.json();
  },

  getTeams: async (sport) => {
    const res = await fetch(`${API_URL}/schedule/${sport}/teams`);
    return res.json();
  },

  getTeamInfo: async (sport, teamId) => {
    const res = await fetch(`${API_URL}/schedule/${sport}/team/${teamId}/info`);
    return res.json();
  },

  getStatRankings: async (sport, statKey) => {
    const res = await fetch(`${API_URL}/schedule/${sport}/rankings/${statKey}`);
    return res.json();
  },
};

// User API
export const userAPI = {
  getOrCreateUser: async (userData) => {
    const res = await authFetch('/users/sync', {
      method: 'POST',
      body: JSON.stringify(userData)
    });
    return res.json();
  },

  updateDisplayName: async (displayName) => {
    const res = await authFetch('/users/display-name', {
      method: 'PUT',
      body: JSON.stringify({ displayName })
    });
    return res.json();
  },

  updateEmail: async (email) => {
    const res = await authFetch('/users/email', {
      method: 'PUT',
      body: JSON.stringify({ email })
    });
    return res.json();
  },

  getPendingPicks: async () => {
    const res = await authFetch('/users/pending-picks');
    return res.json();
  },

  getHistory: async () => {
    const res = await authFetch('/users/history');
    return res.json();
  },

  getStats: async () => {
    const res = await authFetch('/users/stats');
    return res.json();
  },

  updateProfile: async (data) => {
    const res = await authFetch('/users/profile', {
      method: 'PUT',
      body: JSON.stringify(data)
    });
    return res.json();
  },

  uploadProfileImage: async (imageData) => {
    const res = await authFetch('/users/profile-image', {
      method: 'POST',
      body: JSON.stringify({ imageData })
    });
    return res.json();
  },

  removeProfileImage: async () => {
    const res = await authFetch('/users/profile-image', {
      method: 'DELETE'
    });
    return res.json();
  },

  completeOnboarding: async () => {
    const res = await authFetch('/users/onboarding-complete', {
      method: 'PUT'
    });
    return res.json();
  }
};

// Notification API
export const notificationAPI = {
  // Get notifications with pagination
  getNotifications: async (limit = 20, offset = 0, unreadOnly = false) => {
    const params = new URLSearchParams({ limit, offset, unreadOnly });
    const res = await authFetch(`/notifications?${params}`);
    return res.json();
  },

  // Get unread count only
  getUnreadCount: async () => {
    const res = await authFetch('/notifications/unread-count');
    return res.json();
  },

  // Mark single notification as read
  markAsRead: async (notificationId) => {
    const res = await authFetch(`/notifications/${notificationId}/read`, {
      method: 'PUT'
    });
    return res.json();
  },

  // Mark all notifications as read
  markAllAsRead: async () => {
    const res = await authFetch('/notifications/read-all', {
      method: 'PUT'
    });
    return res.json();
  },

  // Delete a notification
  delete: async (notificationId) => {
    const res = await authFetch(`/notifications/${notificationId}`, {
      method: 'DELETE'
    });
    return res.json();
  },

  // Clear all notifications
  clearAll: async () => {
    const res = await authFetch('/notifications', {
      method: 'DELETE'
    });
    return res.json();
  }
};

// Sports API
export const sportsAPI = {
  list: async () => {
    const res = await fetch(`${API_URL}/sports`);
    return res.json();
  }
};

// Bracket API
export const bracketAPI = {
  createChallenge: async (data) => {
    const res = await authFetch('/brackets/challenges', { method: 'POST', body: JSON.stringify(data) });
    return res.json();
  },
  getChallenge: async (challengeId) => {
    const res = await authFetch(`/brackets/challenges/${challengeId}`);
    return res.json();
  },
  getChallengeByLeague: async (leagueId) => {
    const res = await authFetch(`/brackets/challenges/league/${leagueId}`);
    return res.json();
  },
  updateChallenge: async (challengeId, data) => {
    const res = await authFetch(`/brackets/challenges/${challengeId}`, { method: 'PUT', body: JSON.stringify(data) });
    return res.json();
  },
  createBracket: async (challengeId, data = {}) => {
    const res = await authFetch(`/brackets/challenges/${challengeId}/brackets`, { method: 'POST', body: JSON.stringify(data) });
    return res.json();
  },
  updateBracket: async (bracketId, data) => {
    const res = await authFetch(`/brackets/${bracketId}`, { method: 'PUT', body: JSON.stringify(data) });
    return res.json();
  },
  submitBracket: async (bracketId) => {
    const res = await authFetch(`/brackets/${bracketId}/submit`, { method: 'POST' });
    return res.json();
  },
  getBracket: async (bracketId) => {
    const res = await authFetch(`/brackets/${bracketId}`);
    return res.json();
  },
  getTournamentData: async (season) => {
    const res = await fetch(`${API_URL}/brackets/tournament/${season}`);
    return res.json();
  },
  getTeamBreakdown: async (season, teamId) => {
    const res = await fetch(`${API_URL}/brackets/tournament/${season}/team/${teamId}`);
    return res.json();
  },
  getDraftProspects: async () => {
    const res = await fetch(`${API_URL}/brackets/draft-prospects`);
    return res.json();
  },
  getProspectWatch: async (season) => {
    const res = await fetch(`${API_URL}/brackets/prospect-watch?season=${season}`);
    return res.json();
  },
  getConciseReport: async (season, teamId) => {
    const res = await fetch(`${API_URL}/brackets/tournament/${season}/team/${teamId}/concise-report`);
    return res.json();
  },
  getMatchupReport: async (season, team1Id, team2Id) => {
    const res = await fetch(`${API_URL}/brackets/tournament/${season}/matchup-report/${team1Id}/${team2Id}`);
    return res.json();
  },
  // Admin matchup report management
  getAdminMatchups: async (season, round) => {
    const params = round ? `?round=${encodeURIComponent(round)}` : '';
    const res = await authFetch(`/brackets/admin/matchups/${season}${params}`);
    return res.json();
  },
  generateMatchupReport: async (season, team1Id, team2Id, round, force = false) => {
    const res = await authFetch('/brackets/admin/matchup-reports/generate', {
      method: 'POST',
      body: JSON.stringify({ season, team1Id, team2Id, round, force }),
    });
    return res.json();
  },
  generateRoundMatchupReports: async (season, round, force = false) => {
    const res = await authFetch('/brackets/admin/matchup-reports/generate-round', {
      method: 'POST',
      body: JSON.stringify({ season, round, force }),
    });
    return res.json();
  },
  getMatchupPrediction: async (season, eventId) => {
    const res = await fetch(`${API_URL}/brackets/tournament/${season}/matchup/${eventId}`);
    return res.json();
  },
  getSelectionDate: async (season) => {
    const res = await fetch(`${API_URL}/brackets/tournament/${season}/selection-date`);
    return res.json();
  },
  getFirstGameTime: async (season) => {
    const res = await fetch(`${API_URL}/brackets/tournament/${season}/first-game-time`);
    return res.json();
  },
  resetBracket: async (bracketId) => {
    const res = await authFetch(`/brackets/${bracketId}/reset`, { method: 'POST' });
    return res.json();
  },
  getLeaderboard: async (challengeId) => {
    const res = await authFetch(`/brackets/challenges/${challengeId}/leaderboard`);
    return res.json();
  },
  updateResults: async () => {
    const res = await fetch(`${API_URL}/brackets/update-results`, { method: 'POST' });
    return res.json();
  },
  getRecap: async (tournamentId, leagueId, date) => {
    const res = await authFetch(`/brackets/tournaments/${tournamentId}/recap?leagueId=${leagueId}&date=${date}`);
    return res.json();
  },
  getRecapDates: async (tournamentId, leagueId) => {
    const res = await authFetch(`/brackets/tournaments/${tournamentId}/recap-dates?leagueId=${leagueId}`);
    return res.json();
  },
  generateRecap: async (tournamentId, leagueId, date) => {
    const res = await authFetch(`/brackets/tournaments/${tournamentId}/generate-recap`, {
      method: 'POST',
      body: JSON.stringify({ leagueId, date }),
    });
    return res.json();
  },
};

// Admin API
export const adminAPI = {
  getStats: async () => {
    const res = await authFetch('/admin/stats');
    return res.json();
  },
  getDashboardStats: async (range = 30) => {
    const res = await authFetch(`/admin/stats/dashboard?range=${range}`);
    return res.json();
  },
  getOnlineUsers: async () => {
    const res = await authFetch('/admin/stats/online');
    return res.json();
  },
  getOnlineUsersDetail: async () => {
    const res = await authFetch('/admin/stats/online/details');
    return res.json();
  },
  getTopPages: async (range = '30d') => {
    const res = await authFetch(`/admin/stats/top-pages?range=${range}`);
    return res.json();
  },
  getUsers: async (params = {}) => {
    const res = await authFetch(`/admin/users?${new URLSearchParams(params)}`);
    return res.json();
  },
  getUser: async (id) => {
    const res = await authFetch(`/admin/users/${id}`);
    return res.json();
  },
  getLeagues: async (params = {}) => {
    const res = await authFetch(`/admin/leagues?${new URLSearchParams(params)}`);
    return res.json();
  },
  getLeague: async (id) => {
    const res = await authFetch(`/admin/leagues/${id}`);
    return res.json();
  },
  getReports: async (season) => {
    const res = await authFetch(`/admin/reports?season=${season}`);
    return res.json();
  },
  getReport: async (teamId, season) => {
    const res = await authFetch(`/admin/reports/${teamId}?season=${season}`);
    return res.json();
  },
  generateReports: async (body = {}) => {
    const res = await authFetch('/admin/reports/generate', {
      method: 'POST',
      body: JSON.stringify(body),
    });
    return res.json();
  },
  getChallenges: async () => {
    const res = await authFetch('/admin/challenges');
    return res.json();
  },
  getChallenge: async (id) => {
    const res = await authFetch(`/admin/challenges/${id}`);
    return res.json();
  },
  setResult: async (challengeId, body) => {
    const res = await authFetch(`/admin/challenges/${challengeId}/set-result`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
    return res.json();
  },
  deleteLeague: async (id) => {
    const res = await authFetch(`/admin/leagues/${id}`, { method: 'DELETE' });
    return res.json();
  },
  deleteChallenge: async (id) => {
    const res = await authFetch(`/admin/challenges/${id}`, { method: 'DELETE' });
    return res.json();
  },
  // User management actions
  toggleUserAdmin: async (id) => {
    const res = await authFetch(`/admin/users/${id}/toggle-admin`, { method: 'PUT' });
    if (!res.ok) { const err = await res.json(); throw new Error(err.error); }
    return res.json();
  },
  toggleUserDisabled: async (id) => {
    const res = await authFetch(`/admin/users/${id}/toggle-disabled`, { method: 'PUT' });
    if (!res.ok) { const err = await res.json(); throw new Error(err.error); }
    return res.json();
  },
  // Chat moderation
  getChatLeagues: async () => {
    const res = await authFetch('/admin/chat/leagues');
    return res.json();
  },
  getChatMessages: async (leagueId, params = {}) => {
    const res = await authFetch(`/admin/chat/leagues/${leagueId}/messages?${new URLSearchParams(params)}`);
    return res.json();
  },
  deleteChatMessage: async (messageId) => {
    const res = await authFetch(`/admin/chat/messages/${messageId}`, { method: 'DELETE' });
    return res.json();
  },
  getChatReports: async () => {
    const res = await authFetch('/admin/chat/reports');
    return res.json();
  },
  resolveChatReport: async (reportId, action) => {
    const res = await authFetch(`/admin/chat/reports/${reportId}/resolve`, {
      method: 'PUT',
      body: JSON.stringify({ action }),
    });
    return res.json();
  },
  createChatBan: async (data) => {
    const res = await authFetch('/admin/chat/bans', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return res.json();
  },
  getChatBans: async () => {
    const res = await authFetch('/admin/chat/bans');
    return res.json();
  },
  removeChatBan: async (banId) => {
    const res = await authFetch(`/admin/chat/bans/${banId}`, { method: 'DELETE' });
    return res.json();
  },
  // Analytics
  getAnalytics: async () => {
    const res = await authFetch('/admin/analytics');
    return res.json();
  },
  getGamecastAnalytics: async () => {
    const res = await authFetch('/admin/analytics/gamecast');
    return res.json();
  },
  getUserVisits: async (period = 'daily', date) => {
    const params = new URLSearchParams({ period });
    if (date) params.set('date', date);
    params.set('tz', Intl.DateTimeFormat().resolvedOptions().timeZone);
    const res = await authFetch(`/admin/stats/user-visits?${params}`);
    return res.json();
  },
  getSessionPages: async (userId, start, end) => {
    const params = new URLSearchParams({ userId, start });
    if (end) params.set('end', end);
    const res = await authFetch(`/admin/stats/session-pages?${params}`);
    return res.json();
  },
  // Announcements
  getAnnouncements: async () => {
    const res = await authFetch('/admin/announcements');
    return res.json();
  },
  createAnnouncement: async (data) => {
    const res = await authFetch('/admin/announcements', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return res.json();
  },
  updateAnnouncement: async (id, data) => {
    const res = await authFetch(`/admin/announcements/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
    return res.json();
  },
  deleteAnnouncement: async (id) => {
    const res = await authFetch(`/admin/announcements/${id}`, { method: 'DELETE' });
    return res.json();
  },
  // Feature engagement analytics
  getScheduleEngagement: async (range = 30) => {
    const res = await authFetch(`/admin/stats/schedule-engagement?range=${range}`);
    return res.json();
  },
  getBracketEngagement: async (range = 30) => {
    const res = await authFetch(`/admin/stats/bracket-engagement?range=${range}`);
    return res.json();
  },
  getAnonymousUsage: async (range = 30) => {
    const res = await authFetch(`/admin/stats/anonymous-usage?range=${range}`);
    return res.json();
  },
  getDeviceBreakdown: async (range = 30) => {
    const res = await authFetch(`/admin/stats/device-breakdown?range=${range}`);
    return res.json();
  },
  getTopPagesDetail: async (pattern, range = '30d') => {
    const res = await authFetch(`/admin/stats/top-pages/detail?pattern=${encodeURIComponent(pattern)}&range=${encodeURIComponent(range)}`);
    return res.json();
  },
  getScheduleEngagementDetail: async (metric, range = 30) => {
    const res = await authFetch(`/admin/stats/schedule-engagement/detail?metric=${encodeURIComponent(metric)}&range=${range}`);
    return res.json();
  },
  getBracketEngagementDetail: async (metric, range = 30) => {
    const res = await authFetch(`/admin/stats/bracket-engagement/detail?metric=${encodeURIComponent(metric)}&range=${range}`);
    return res.json();
  },
  getUserActivity: async (userId, params = {}) => {
    const res = await authFetch(`/admin/users/${userId}/activity?${new URLSearchParams(params)}`);
    return res.json();
  },
  // NBA Prospects
  getProspects: async (year) => {
    const params = year ? `?year=${year}` : '';
    const res = await authFetch(`/admin/prospects${params}`);
    return res.json();
  },
  fetchProspects: async () => {
    const res = await authFetch('/admin/prospects/fetch', { method: 'POST' });
    return res.json();
  },
  confirmProspects: async (prospects, draftYear) => {
    const res = await authFetch('/admin/prospects/confirm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prospects, draftYear }),
    });
    return res.json();
  },
  // Tournament data management
  getTournaments: async () => {
    const res = await authFetch('/admin/tournaments');
    return res.json();
  },
  getTournament: async (id) => {
    const res = await authFetch(`/admin/tournaments/${id}`);
    return res.json();
  },
  updateTournament: async (id, body) => {
    const res = await authFetch(`/admin/tournaments/${id}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    });
    return res.json();
  },
  syncTournament: async (id) => {
    const res = await authFetch(`/admin/tournaments/${id}/sync`, { method: 'POST' });
    return res.json();
  },
  getTournamentTeams: async (id, params = {}) => {
    const res = await authFetch(`/admin/tournaments/${id}/teams?${new URLSearchParams(params)}`);
    return res.json();
  },
  updateTournamentTeam: async (id, teamId, body) => {
    const res = await authFetch(`/admin/tournaments/${id}/teams/${teamId}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    });
    return res.json();
  },
  getTournamentGames: async (id, params = {}) => {
    const res = await authFetch(`/admin/tournaments/${id}/games?${new URLSearchParams(params)}`);
    return res.json();
  },
  updateTournamentGame: async (id, gameId, body) => {
    const res = await authFetch(`/admin/tournaments/${id}/games/${gameId}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    });
    return res.json();
  },
  setTournamentGameResult: async (id, gameId, body) => {
    const res = await authFetch(`/admin/tournaments/${id}/games/${gameId}/result`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
    return res.json();
  },
  recalculateTournament: async (id) => {
    const res = await authFetch(`/admin/tournaments/${id}/recalculate`, { method: 'POST' });
    return res.json();
  },
  refreshGameFromESPN: async (id, gameId) => {
    const res = await authFetch(`/admin/tournaments/${id}/games/${gameId}/refresh`, { method: 'POST' });
    return res.json();
  },
  getRecaps: async (tournamentId) => {
    const res = await authFetch(`/admin/recaps?tournamentId=${tournamentId}`);
    return res.json();
  },
  updateRecap: async (id, body) => {
    const res = await authFetch(`/admin/recaps/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return res.json();
  },
};

// Analytics API (public-facing)
export const analyticsAPI = {
  trackGamecastSession: async (data) => {
    try {
      const res = await authFetch('/analytics/gamecast-session', {
        method: 'POST',
        body: JSON.stringify(data),
      });
      return res.json();
    } catch {
      // Silently fail - analytics should not break the app
      return { success: false };
    }
  },
  getActiveAnnouncements: async () => {
    const token = getToken();
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(`${API_URL}/analytics/announcements/active`, { headers });
    return res.json();
  },
};

// Tracking API (lightweight, fire-and-forget — uses plain fetch to avoid 401 redirect loops)
export const trackingAPI = {
  pageView: (path) => {
    import('./utils/consent.js').then(({ shouldTrack }) => {
      if (!shouldTrack()) return;
      const token = getToken();
      const headers = { 'Content-Type': 'application/json' };
      if (token) headers.Authorization = `Bearer ${token}`;

      const body = { path };
      if (!token) {
        // Non-auth: include anonymous device ID
        import('./utils/sessionId.js').then(({ getOrCreateSessionId }) => {
          body.anonId = getOrCreateSessionId();
          fetch(`${API_URL}/track/pageview`, {
            method: 'POST',
            headers,
            body: JSON.stringify(body),
          }).catch(() => {});
        }).catch(() => {});
        return;
      }

      fetch(`${API_URL}/track/pageview`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      }).catch(() => {});
    }).catch(() => {});
  },
  event: (eventName, data = {}, duration = null) => {
    import('./utils/consent.js').then(({ shouldTrack }) => {
      if (!shouldTrack()) return;

      const body = { event: eventName, data };
      if (typeof duration === 'number') body.duration = duration;

      const token = getToken();
      if (!token) {
        // Non-auth user — use session ID and plain fetch
        import('./utils/sessionId.js').then(({ getOrCreateSessionId }) => {
          body.sessionId = getOrCreateSessionId();
          fetch(`${API_URL}/track/event`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          }).catch(() => {});
        }).catch(() => {});
        return;
      }

      authFetch('/track/event', {
        method: 'POST',
        body: JSON.stringify(body),
      }).catch(() => {});
    }).catch(() => {});
  },
};

export default {
  league: leagueAPI,
  picks: picksAPI,
  nfl: nflAPI,
  schedule: scheduleAPI,
  user: userAPI,
  notification: notificationAPI,
  sports: sportsAPI,
  bracket: bracketAPI,
  admin: adminAPI,
  analytics: analyticsAPI,
};