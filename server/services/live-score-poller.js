/**
 * LiveScorePoller — Server-side polling engine for real-time score updates.
 *
 * Manages independent polling loops per sport. Each loop fetches the ESPN
 * scoreboard via the existing provider pipeline, diffs against the previous
 * snapshot, and pushes only changed games to connected clients via Socket.io.
 *
 * Polling cadence adapts automatically:
 *   • 15 seconds when live games are in progress
 *   • 5 minutes when no games are live (idle monitoring)
 *
 * Error handling uses exponential backoff per sport so a single sport failure
 * doesn't affect others.
 */

const { getSport } = require('../sports');

// Polling intervals
const LIVE_POLL_INTERVAL = 15 * 1000;       // 15 seconds when games are live
const IDLE_POLL_INTERVAL = 5 * 60 * 1000;   // 5 minutes when no live games
const COORDINATION_INTERVAL = 30 * 1000;     // 30 seconds — checks if polling loops need starting
const MAX_BACKOFF = 5 * 60 * 1000;           // 5 minutes max backoff on errors

// ESPN game statuses that indicate a game is in progress
const LIVE_STATUSES = new Set([
  'STATUS_IN_PROGRESS',
  'STATUS_HALFTIME',
  'STATUS_END_PERIOD',
  'STATUS_FIRST_HALF',
  'STATUS_SECOND_HALF',
]);

// Fields to compare when diffing game state
const DIFF_FIELDS = ['status', 'statusDetail', 'period', 'clock', 'completed'];

class LiveScorePoller {
  /**
   * @param {import('socket.io').Server} io - Socket.io server instance
   * @param {string[]} sportIds - Sport IDs to poll (e.g. ['nba', 'ncaab'])
   */
  constructor(io, sportIds = ['nba', 'ncaab']) {
    this.io = io;
    this.sportIds = sportIds;

    // Per-sport state
    this.sportState = new Map();
    for (const sportId of sportIds) {
      this.sportState.set(sportId, {
        timer: null,         // setTimeout handle for next poll
        polling: false,      // whether a poll is currently in-flight
        failCount: 0,        // consecutive failures (for backoff)
        prevGames: null,     // previous snapshot for diffing
        hasLiveGames: false, // whether any game was in-progress last poll
        delayed: false,      // whether last result used stale cache
        lastPollDate: null,  // the date string we last polled
      });
    }

    this.coordinationTimer = null;
    this.running = false;
  }

  /**
   * Start the poller. Kicks off the coordination loop that manages per-sport
   * polling loops.
   */
  start() {
    if (this.running) return;
    this.running = true;
    console.log(`[LiveScorePoller] Starting for sports: ${this.sportIds.join(', ')}`);

    // Run immediately, then every COORDINATION_INTERVAL
    this._coordinationLoop();
    this.coordinationTimer = setInterval(() => this._coordinationLoop(), COORDINATION_INTERVAL);
  }

  /**
   * Stop all polling loops and the coordination timer.
   */
  stop() {
    this.running = false;
    if (this.coordinationTimer) {
      clearInterval(this.coordinationTimer);
      this.coordinationTimer = null;
    }
    for (const [sportId, state] of this.sportState) {
      if (state.timer) {
        clearTimeout(state.timer);
        state.timer = null;
      }
    }
    console.log('[LiveScorePoller] Stopped');
  }

  /**
   * Coordination loop — ensures each sport has an active polling loop.
   * Runs every 30s to catch date rollovers and restart stalled loops.
   */
  _coordinationLoop() {
    for (const sportId of this.sportIds) {
      const state = this.sportState.get(sportId);
      if (!state.timer && !state.polling) {
        this._schedulePoll(sportId, 0); // Start immediately
      }
    }
  }

  /**
   * Schedule the next poll for a sport.
   * @param {string} sportId
   * @param {number} delay - Milliseconds until next poll
   */
  _schedulePoll(sportId, delay) {
    const state = this.sportState.get(sportId);
    if (state.timer) clearTimeout(state.timer);

    state.timer = setTimeout(() => {
      state.timer = null;
      this._pollSport(sportId);
    }, delay);
  }

  /**
   * Get today's date string(s) to poll. Uses Eastern Time since ESPN's
   * scoreboards are organized by ET date. For late-night games, also checks
   * yesterday's scoreboard (games starting at 10-11pm might still be on
   * yesterday's ESPN scoreboard).
   * @returns {string[]} Array of date strings in YYYY-MM-DD format
   */
  _getPollingDates() {
    const now = new Date();

    // Use Eastern Time for date calculation since ESPN organizes by ET
    const etFormatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/New_York',
      year: 'numeric', month: '2-digit', day: '2-digit',
    });
    const today = etFormatter.format(now); // YYYY-MM-DD in ET

    const etHour = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' })).getHours();

    // Before 6am ET, also check yesterday's scoreboard for late games
    if (etHour < 6) {
      const yesterday = new Date(now);
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStr = etFormatter.format(yesterday);
      return [today, yesterdayStr];
    }

    return [today];
  }

  /**
   * Main polling function for a single sport. Fetches the scoreboard,
   * diffs against previous state, and emits changes.
   * @param {string} sportId
   */
  async _pollSport(sportId) {
    const state = this.sportState.get(sportId);
    if (!this.running) return;

    state.polling = true;

    try {
      const sport = getSport(sportId);
      const provider = sport.provider;
      const dates = this._getPollingDates();

      // Determine cache TTL — use short TTL if we know there are live games
      const cacheTtl = state.hasLiveGames ? LIVE_POLL_INTERVAL : undefined;

      // Fetch games for all relevant dates
      let allGames = [];
      for (const dateStr of dates) {
        try {
          const games = await provider.getScheduleByDate(dateStr, { cacheTtl });
          allGames = allGames.concat(games);
        } catch (err) {
          console.warn(`[LiveScorePoller] ${sportId} error for date ${dateStr}:`, err.message);
        }
      }

      // Deduplicate by game ID (in case a game appears on both dates)
      const gameMap = new Map();
      for (const game of allGames) {
        gameMap.set(game.id, game);
      }
      const games = Array.from(gameMap.values());

      // Reset fail count on successful fetch
      state.failCount = 0;
      state.delayed = false;

      // Diff against previous snapshot
      const changedGames = this._diffGames(state.prevGames, games);
      state.prevGames = games;

      // Check for live games
      const hasLiveGames = games.some(g => LIVE_STATUSES.has(g.status));
      state.hasLiveGames = hasLiveGames;
      state.lastPollDate = dates[0];

      // Emit updates if anything changed
      if (changedGames.length > 0) {
        this._emitUpdates(sportId, changedGames, {
          allGames: games,
          delayed: false,
          timestamp: Date.now(),
        });
      }

      // Schedule next poll
      const nextDelay = hasLiveGames ? LIVE_POLL_INTERVAL : IDLE_POLL_INTERVAL;
      if (hasLiveGames) {
        console.log(`[LiveScorePoller] ${sportId}: ${changedGames.length} changes, ${games.length} games, next poll in ${nextDelay / 1000}s (LIVE)`);
      }
      this._schedulePoll(sportId, nextDelay);

    } catch (error) {
      // Exponential backoff on failure
      state.failCount++;
      state.delayed = true;
      const backoff = Math.min(LIVE_POLL_INTERVAL * Math.pow(2, state.failCount), MAX_BACKOFF);
      console.error(`[LiveScorePoller] ${sportId} poll failed (attempt ${state.failCount}):`, error.message);
      console.log(`[LiveScorePoller] ${sportId}: backing off for ${backoff / 1000}s`);

      // Emit stale data flag to clients if we have previous data
      if (state.prevGames) {
        this._emitUpdates(sportId, [], {
          allGames: state.prevGames,
          delayed: true,
          timestamp: Date.now(),
        });
      }

      this._schedulePoll(sportId, backoff);
    } finally {
      state.polling = false;
    }
  }

  /**
   * Compare two game arrays and return games that have changed.
   * @param {Array|null} prevGames - Previous snapshot
   * @param {Array} nextGames - New snapshot
   * @returns {Array} Games that changed
   */
  _diffGames(prevGames, nextGames) {
    if (!prevGames) return nextGames; // First poll — everything is "new"

    const prevMap = new Map();
    for (const game of prevGames) {
      prevMap.set(game.id, game);
    }

    const changed = [];
    for (const game of nextGames) {
      const prev = prevMap.get(game.id);
      if (!prev) {
        changed.push(game); // New game appeared
        continue;
      }

      // Check if any tracked field changed
      let hasChanged = false;
      for (const field of DIFF_FIELDS) {
        if (game[field] !== prev[field]) {
          hasChanged = true;
          break;
        }
      }

      // Check scores
      if (!hasChanged) {
        const prevHomeScore = prev.homeTeam?.score;
        const prevAwayScore = prev.awayTeam?.score;
        const nextHomeScore = game.homeTeam?.score;
        const nextAwayScore = game.awayTeam?.score;
        if (prevHomeScore !== nextHomeScore || prevAwayScore !== nextAwayScore) {
          hasChanged = true;
        }
      }

      if (hasChanged) {
        changed.push(game);
      }
    }

    return changed;
  }

  /**
   * Emit score updates to all clients subscribed to a sport's room.
   * @param {string} sportId
   * @param {Array} changedGames - Games that changed
   * @param {Object} meta - Metadata (allGames, delayed, timestamp)
   */
  _emitUpdates(sportId, changedGames, meta) {
    const room = `scores:${sportId}`;
    this.io.to(room).emit('score-update', {
      sport: sportId,
      games: changedGames,
      allGames: meta.allGames,
      delayed: meta.delayed,
      timestamp: meta.timestamp,
    });
  }
}

module.exports = LiveScorePoller;
