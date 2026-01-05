const API_URL = import.meta.env.VITE_API_URL || '/api';

// Get token from localStorage
const getToken = () => localStorage.getItem('token');

// Make authenticated request
const authFetch = async (url, options = {}) => {
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

  if (response.status === 401) {
    localStorage.removeItem('token');
    window.location.href = '/login';
    throw new Error('Session expired');
  }

  return response;
};

// Auth API
export const authAPI = {
  requestCode: async (phone) => {
    const res = await fetch(`${API_URL}/auth/request-code`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone })
    });
    return res.json();
  },

  verifyCode: async (phone, code) => {
    const res = await fetch(`${API_URL}/auth/verify-code`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone, code })
    });
    return res.json();
  },

  getMe: async () => {
    const res = await authFetch('/auth/me');
    return res.json();
  },

  updateDisplayName: async (displayName) => {
    const res = await authFetch('/auth/display-name', {
      method: 'PUT',
      body: JSON.stringify({ displayName })
    });
    return res.json();
  }
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
  }
};

export default {
  auth: authAPI,
  league: leagueAPI,
  picks: picksAPI,
  nfl: nflAPI,
  user: userAPI
};