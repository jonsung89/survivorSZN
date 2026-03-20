const express = require('express');
const router = express.Router();
const { db } = require('../db/supabase');
const { adminMiddleware } = require('../middleware/admin');
const { generateAllReports, getStoredReport, getTournamentBracket } = require('../services/ncaab-tournament');
const { getDraftProspects, clearProspectCache, getCacheInfo, enrichProspectsWithESPN, getProspectsFromDB, getProspectsLastUpdated, saveProspectsToDB, getDraftYears, getCurrentDraftYear, fetchStagedProspects } = require('../services/nba-draft');
const { getSlotRound, calculateBracketScore, ROUND_BOUNDARIES } = require('../utils/bracket-slots');
const { getOnlineUserCount, getOnlineUserIds } = require('../socket/handlers');

// All routes require admin
router.use(adminMiddleware);

// ESPN sport slugs for API lookups
const SPORT_SLUGS = {
  nba: 'basketball/nba',
  ncaab: 'basketball/mens-college-basketball',
  nfl: 'football/nfl',
  nhl: 'hockey/nhl',
  mlb: 'baseball/mlb',
};

// Resolve ESPN game IDs to team names
async function resolveGameNames(games) {
  if (!games.length) return games;
  try {
    // Fetch summary for each unique game
    const resolved = await Promise.all(games.map(async (g) => {
      try {
        const slug = SPORT_SLUGS[g.sportId];
        if (!slug) return g;
        const resp = await fetch(`https://site.api.espn.com/apis/site/v2/sports/${slug}/summary?event=${g.gameId}`);
        if (!resp.ok) return g;
        const data = await resp.json();
        const competitors = data?.header?.competitions?.[0]?.competitors;
        if (competitors?.length === 2) {
          const away = competitors.find(c => c.homeAway === 'away') || competitors[0];
          const home = competitors.find(c => c.homeAway === 'home') || competitors[1];
          g.gameName = `${away.team?.abbreviation || away.team?.name} @ ${home.team?.abbreviation || home.team?.name}`;
        }
      } catch { /* ignore per-game errors */ }
      return g;
    }));
    return resolved;
  } catch {
    return games;
  }
}

// ─── Dashboard Stats ─────────────────────────────────────────────────────────

router.get('/stats', async (req, res) => {
  try {
    const now = new Date();
    const day1 = new Date(now - 24 * 3600000).toISOString();
    const day7 = new Date(now - 7 * 24 * 3600000).toISOString();
    const day30 = new Date(now - 30 * 24 * 3600000).toISOString();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();

    const [users, leagues, reports, brackets, active24h, active7d, active30d, chatToday, signupTrend, leagueTrend] = await Promise.all([
      db.getOne('SELECT COUNT(*) as count FROM users WHERE is_bot IS NOT TRUE'),
      db.getOne('SELECT COUNT(*) as count FROM leagues'),
      db.getOne('SELECT COUNT(*) as count FROM scouting_reports'),
      db.getOne('SELECT COUNT(*) as count FROM brackets WHERE user_id NOT IN (SELECT id FROM users WHERE is_bot = TRUE)'),
      db.getOne('SELECT COUNT(*) as count FROM users WHERE last_login_at >= $1 AND is_bot IS NOT TRUE', [day1]),
      db.getOne('SELECT COUNT(*) as count FROM users WHERE last_login_at >= $1 AND is_bot IS NOT TRUE', [day7]),
      db.getOne('SELECT COUNT(*) as count FROM users WHERE last_login_at >= $1 AND is_bot IS NOT TRUE', [day30]),
      db.getOne("SELECT COUNT(*) as count FROM chat_messages WHERE created_at >= $1 AND COALESCE(message_type, 'user') != 'system'", [todayStart]),
      db.getAll(
        `SELECT DATE(created_at) as date, COUNT(*) as count
         FROM users WHERE created_at >= $1 AND is_bot IS NOT TRUE
         GROUP BY DATE(created_at) ORDER BY date`,
        [day30]
      ),
      db.getAll(
        `SELECT DATE(created_at) as date, COUNT(*) as count
         FROM leagues WHERE created_at >= $1
         GROUP BY DATE(created_at) ORDER BY date`,
        [day30]
      ),
    ]);

    res.json({
      userCount: parseInt(users.count),
      leagueCount: parseInt(leagues.count),
      reportCount: parseInt(reports.count),
      bracketCount: parseInt(brackets.count),
      activeUsers: {
        day1: parseInt(active24h.count),
        day7: parseInt(active7d.count),
        day30: parseInt(active30d.count),
      },
      chatMessagesToday: parseInt(chatToday.count),
      signupTrend: signupTrend.map(r => ({ date: r.date, count: parseInt(r.count) })),
      leagueTrend: leagueTrend.map(r => ({ date: r.date, count: parseInt(r.count) })),
    });
  } catch (error) {
    console.error('Admin stats error:', error);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

// ─── Online Users (lightweight, for polling) ────────────────────────────────

router.get('/stats/online', (req, res) => {
  res.json({ onlineUsers: getOnlineUserCount() });
});

// ─── Online Users Detail (returns actual user info) ─────────────────────────

router.get('/stats/online/details', async (req, res) => {
  try {
    const userIds = getOnlineUserIds();
    if (userIds.length === 0) {
      return res.json({ users: [] });
    }
    const placeholders = userIds.map((_, i) => `$${i + 1}`).join(', ');
    const users = await db.getAll(
      `SELECT id, display_name, email, phone, profile_image_url, last_login_at
       FROM users WHERE id IN (${placeholders})
       ORDER BY display_name`,
      userIds
    );
    res.json({
      users: users.map(u => ({
        id: u.id,
        displayName: u.display_name,
        email: u.email,
        phone: u.phone,
        profileImageUrl: u.profile_image_url,
        lastLoginAt: u.last_login_at,
      })),
    });
  } catch (error) {
    console.error('Online users detail error:', error);
    res.status(500).json({ error: 'Failed to fetch online users' });
  }
});

// ─── Top Pages (flexible range) ──────────────────────────────────────────────

router.get('/stats/top-pages', async (req, res) => {
  try {
    const range = req.query.range || '30d';
    const now = new Date();
    let startDate;

    switch (range) {
      case 'today':
        startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        break;
      case '7d':
        startDate = new Date(now - 7 * 24 * 3600000);
        break;
      case '30d':
        startDate = new Date(now - 30 * 24 * 3600000);
        break;
      case 'month':
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        break;
      case 'year':
        startDate = new Date(now.getFullYear(), 0, 1);
        break;
      default:
        startDate = new Date(now - 30 * 24 * 3600000);
    }

    // Normalize paths: replace UUIDs and numeric IDs with :id so routes aggregate properly
    // e.g. /league/85d6b9c2-7d03-4d52-b1f7-33f117932610/bracket → /league/:id/bracket
    const topPages = await db.getAll(
      `SELECT normalized_path, SUM(views)::int as views, SUM(unique_visitors)::int as unique_visitors
       FROM (
         SELECT
           REGEXP_REPLACE(
             REGEXP_REPLACE(page_path, '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}', ':id', 'gi'),
             '\/[A-F0-9]{6,}(\/|$)', '/:id\\1', 'g'
           ) as normalized_path,
           COUNT(*) as views,
           COUNT(DISTINCT user_id) as unique_visitors
         FROM page_views WHERE created_at >= $1
         GROUP BY page_path
       ) sub
       GROUP BY normalized_path
       ORDER BY views DESC LIMIT 15`,
      [startDate.toISOString()]
    );

    res.json({
      topPages: topPages.map(r => ({
        path: r.normalized_path,
        views: parseInt(r.views),
        uniqueVisitors: parseInt(r.unique_visitors),
      })),
    });
  } catch (error) {
    console.error('Top pages error:', error);
    res.status(500).json({ error: 'Failed to fetch top pages' });
  }
});

// ─── Top Pages Detail (drill-down by entity) ─────────────────────────────────

router.get('/stats/top-pages/detail', async (req, res) => {
  try {
    const { pattern, range = '30d' } = req.query;
    if (!pattern) return res.status(400).json({ error: 'pattern is required' });

    const now = new Date();
    let startDate;
    switch (range) {
      case 'today':
        startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        break;
      case '7d':
        startDate = new Date(now - 7 * 24 * 3600000);
        break;
      case '30d':
        startDate = new Date(now - 30 * 24 * 3600000);
        break;
      case 'month':
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        break;
      case 'year':
        startDate = new Date(now.getFullYear(), 0, 1);
        break;
      default:
        startDate = new Date(now - 30 * 24 * 3600000);
    }

    // Convert normalized pattern like /league/:id/bracket to SQL LIKE: /league/%/bracket
    const likePattern = pattern.replace(/:id/g, '%');

    // Check if this is a league-related route (contains /league/:id)
    const isLeagueRoute = pattern.includes('/league/:id');

    if (isLeagueRoute) {
      // Extract league ID from paths using regex — UUID is between /league/ and the next /
      const rows = await db.getAll(
        `SELECT
           SUBSTRING(pv.page_path FROM '/league/([0-9a-f-]{36})') as entity_id,
           COUNT(*) as views,
           COUNT(DISTINCT pv.user_id) as unique_visitors
         FROM page_views pv
         WHERE pv.page_path LIKE $1 AND pv.created_at >= $2
         GROUP BY entity_id
         HAVING SUBSTRING(pv.page_path FROM '/league/([0-9a-f-]{36})') IS NOT NULL
         ORDER BY views DESC
         LIMIT 20`,
        [likePattern, startDate.toISOString()]
      );

      // Look up league names
      const leagueIds = rows.map(r => r.entity_id).filter(Boolean);
      let leagueLookup = {};
      if (leagueIds.length > 0) {
        const placeholders = leagueIds.map((_, i) => `$${i + 1}`).join(', ');
        const leagues = await db.getAll(
          `SELECT id, name FROM leagues WHERE id IN (${placeholders})`,
          leagueIds
        );
        for (const l of leagues) {
          leagueLookup[l.id] = l.name;
        }
      }

      const totalViews = rows.reduce((sum, r) => sum + parseInt(r.views), 0);

      res.json({
        pattern,
        totalViews,
        breakdown: rows.map(r => ({
          entityId: r.entity_id,
          entityName: leagueLookup[r.entity_id] || 'Unknown League',
          views: parseInt(r.views),
          uniqueVisitors: parseInt(r.unique_visitors),
        })),
      });
    } else {
      // Non-league route — just return the total views (no breakdown possible)
      const result = await db.getOne(
        `SELECT COUNT(*) as views, COUNT(DISTINCT user_id) as unique_visitors
         FROM page_views WHERE page_path LIKE $1 AND created_at >= $2`,
        [likePattern, startDate.toISOString()]
      );
      res.json({
        pattern,
        totalViews: parseInt(result?.views || 0),
        breakdown: [],
      });
    }
  } catch (error) {
    console.error('Top pages detail error:', error);
    res.status(500).json({ error: 'Failed to fetch page detail' });
  }
});

// ─── Schedule Engagement Detail (drill-down) ────────────────────────────────

router.get('/stats/schedule-engagement/detail', async (req, res) => {
  try {
    const { metric = 'gameCardExpands' } = req.query;
    const range = Math.min(parseInt(req.query.range) || 30, 90);
    const rangeStart = new Date(Date.now() - range * 24 * 3600000).toISOString();

    if (metric === 'gameCardExpands') {
      // Full list of games opened, grouped by sport + game
      const rows = await db.getAll(
        `SELECT event_data->>'gameId' as game_id, event_data->>'sportId' as sport_id,
                COUNT(*) as views,
                COUNT(DISTINCT COALESCE(user_id::text, session_id)) as unique_users,
                ROUND(AVG(CASE WHEN duration_seconds > 0 THEN duration_seconds END))::int as avg_duration
         FROM feature_events
         WHERE event_name IN ('game_card_expand', 'game_card_collapse') AND created_at >= $1
         GROUP BY event_data->>'gameId', event_data->>'sportId'
         ORDER BY views DESC
         LIMIT 30`,
        [rangeStart]
      );

      const SPORT_LABELS = { nba: 'NBA', ncaab: 'NCAAB', nfl: 'NFL', nhl: 'NHL', mlb: 'MLB' };

      const items = rows.map(r => ({
        gameId: r.game_id,
        sportId: r.sport_id,
        sportLabel: SPORT_LABELS[r.sport_id] || r.sport_id?.toUpperCase(),
        views: parseInt(r.views),
        uniqueUsers: parseInt(r.unique_users),
        avgDuration: parseInt(r.avg_duration) || 0,
      }));

      res.json({
        metric,
        items: await resolveGameNames(items),
      });
    } else if (metric === 'uniqueUsers') {
      const rows = await db.getAll(
        `SELECT u.id, u.display_name, u.email, u.profile_image_url, COUNT(*) as views
         FROM feature_events fe
         JOIN users u ON u.id = fe.user_id
         WHERE fe.event_name = 'game_card_expand' AND fe.created_at >= $1
         GROUP BY u.id, u.display_name, u.email, u.profile_image_url
         ORDER BY views DESC
         LIMIT 30`,
        [rangeStart]
      );

      res.json({
        metric,
        items: rows.map(r => ({
          userId: r.id,
          displayName: r.display_name,
          email: r.email,
          profileImageUrl: r.profile_image_url,
          views: parseInt(r.views),
        })),
      });
    } else {
      res.status(400).json({ error: 'Unknown metric' });
    }
  } catch (error) {
    console.error('Schedule engagement detail error:', error);
    res.status(500).json({ error: 'Failed to fetch schedule engagement detail' });
  }
});

// ─── Bracket Engagement Detail (drill-down) ─────────────────────────────────

router.get('/stats/bracket-engagement/detail', async (req, res) => {
  try {
    const { metric = 'matchupDetails' } = req.query;
    const range = Math.min(parseInt(req.query.range) || 30, 90);
    const rangeStart = new Date(Date.now() - range * 24 * 3600000).toISOString();

    // Resolve team names
    let teamLookup = {};
    try {
      const currentSeason = new Date().getFullYear();
      const bracket = await getTournamentBracket(currentSeason);
      teamLookup = bracket?.teams || {};
    } catch { /* ignore */ }

    const resolveTeamName = (id) => {
      if (!id) return null;
      if (id.startsWith('ff-')) return 'First Four';
      const t = teamLookup[id];
      return t ? (t.shortName || t.abbreviation || t.name) : null;
    };

    if (metric === 'matchupDetails') {
      // Full list of matchups with view counts
      const rows = await db.getAll(
        `SELECT event_data->>'team1Id' as team1_id, event_data->>'team2Id' as team2_id,
                (event_data->>'slot')::int as slot, COUNT(*) as views,
                COUNT(DISTINCT COALESCE(user_id::text, session_id)) as unique_users
         FROM feature_events
         WHERE event_name = 'matchup_detail_open' AND created_at >= $1
         GROUP BY event_data->>'team1Id', event_data->>'team2Id', event_data->>'slot'
         ORDER BY views DESC`,
        [rangeStart]
      );

      res.json({
        metric,
        items: rows.map(r => ({
          team1Id: r.team1_id,
          team2Id: r.team2_id,
          team1Name: resolveTeamName(r.team1_id),
          team2Name: resolveTeamName(r.team2_id),
          slot: r.slot,
          views: parseInt(r.views),
          uniqueUsers: parseInt(r.unique_users),
        })),
      });
    } else if (metric === 'uniqueUsers') {
      // List of users who viewed matchup details
      const rows = await db.getAll(
        `SELECT u.id, u.display_name, u.email, u.profile_image_url, COUNT(*) as views
         FROM feature_events fe
         JOIN users u ON u.id = fe.user_id
         WHERE fe.event_name = 'matchup_detail_open' AND fe.created_at >= $1
         GROUP BY u.id, u.display_name, u.email, u.profile_image_url
         ORDER BY views DESC
         LIMIT 30`,
        [rangeStart]
      );

      res.json({
        metric,
        items: rows.map(r => ({
          userId: r.id,
          displayName: r.display_name,
          email: r.email,
          profileImageUrl: r.profile_image_url,
          views: parseInt(r.views),
        })),
      });
    } else if (metric === 'tabBreakdown') {
      // Detailed tab breakdown with user counts
      const rows = await db.getAll(
        `SELECT event_data->>'tab' as tab, COUNT(*) as count,
                COUNT(DISTINCT COALESCE(user_id::text, session_id)) as unique_users
         FROM feature_events
         WHERE event_name = 'matchup_tab_switch' AND created_at >= $1
         GROUP BY event_data->>'tab' ORDER BY count DESC`,
        [rangeStart]
      );

      res.json({
        metric,
        items: rows.map(r => ({
          tab: r.tab,
          tabLabel: ({'summary':'Summary','boxscore':'Box Score','gamecast':'Gamecast','shotchart':'Shot Chart','team1':'Team Scouting','team2':'Team Scouting','matchup':'Head-to-Head'})[r.tab] || r.tab,
          count: parseInt(r.count),
          uniqueUsers: parseInt(r.unique_users),
        })),
      });
    } else {
      res.status(400).json({ error: 'Unknown metric' });
    }
  } catch (error) {
    console.error('Bracket engagement detail error:', error);
    res.status(500).json({ error: 'Failed to fetch bracket engagement detail' });
  }
});

// ─── Dashboard Stats (Enhanced) ──────────────────────────────────────────────

router.get('/stats/dashboard', async (req, res) => {
  try {
    const range = Math.min(parseInt(req.query.range) || 30, 90);
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    const yesterdayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1).toISOString();
    const day1Ago = new Date(now - 24 * 3600000).toISOString();
    const day2Ago = new Date(now - 2 * 24 * 3600000).toISOString();
    const day7Ago = new Date(now - 7 * 24 * 3600000).toISOString();
    const day30Ago = new Date(now - 30 * 24 * 3600000).toISOString();
    const rangeStart = new Date(now - range * 24 * 3600000).toISOString();
    const month12Ago = new Date(now.getFullYear() - 1, now.getMonth(), 1).toISOString();

    const [
      // Today's snapshot
      signupsToday, signupsYesterday,
      loginsToday, loginsYesterday,
      active24h, active24hPrior,
      totalUsers, totalUsers7dAgo,
      // Page views
      pageViewsToday, pageViewsYesterday,
      uniqueVisitorsToday, uniqueVisitorsYesterday,
      // Time-series
      dauTrend, signupTrend, chatTrend, leagueJoinTrend, newLeagueTrend, pageViewTrend,
      // Monthly
      mauMonthly, leaguesMonthly, pageViewsMonthly, gamecastMonthly,
      // Engagement
      bracketsSubmitted, gamecastSessions30d, picksMade30d, activeLeagues, totalLeagues,
      // Top pages
      topPages,
      // Recent signups
      recentSignups,
      // New vs returning
      newUsersToday, returningUsersToday,
    ] = await Promise.all([
      // Today vs yesterday
      db.getOne('SELECT COUNT(*) as count FROM users WHERE created_at >= $1 AND is_bot IS NOT TRUE', [todayStart]),
      db.getOne('SELECT COUNT(*) as count FROM users WHERE created_at >= $1 AND created_at < $2 AND is_bot IS NOT TRUE', [yesterdayStart, todayStart]),
      db.getOne('SELECT COUNT(*) as count FROM users WHERE last_login_at >= $1 AND is_bot IS NOT TRUE', [todayStart]),
      db.getOne('SELECT COUNT(*) as count FROM users WHERE last_login_at >= $1 AND last_login_at < $2 AND is_bot IS NOT TRUE', [yesterdayStart, todayStart]),
      db.getOne('SELECT COUNT(*) as count FROM users WHERE last_login_at >= $1 AND is_bot IS NOT TRUE', [day1Ago]),
      db.getOne('SELECT COUNT(*) as count FROM users WHERE last_login_at >= $1 AND last_login_at < $2 AND is_bot IS NOT TRUE', [day2Ago, day1Ago]),
      db.getOne('SELECT COUNT(*) as count FROM users WHERE is_bot IS NOT TRUE'),
      db.getOne('SELECT COUNT(*) as count FROM users WHERE created_at < $1 AND is_bot IS NOT TRUE', [day7Ago]),

      // Page views today vs yesterday
      db.getOne('SELECT COUNT(*) as count FROM page_views WHERE created_at >= $1', [todayStart]),
      db.getOne('SELECT COUNT(*) as count FROM page_views WHERE created_at >= $1 AND created_at < $2', [yesterdayStart, todayStart]),
      db.getOne('SELECT COUNT(DISTINCT user_id) as count FROM page_views WHERE created_at >= $1', [todayStart]),
      db.getOne('SELECT COUNT(DISTINCT user_id) as count FROM page_views WHERE created_at >= $1 AND created_at < $2', [yesterdayStart, todayStart]),

      // Time-series (range-based)
      db.getAll(
        `SELECT DATE(last_login_at) as date, COUNT(DISTINCT id) as count
         FROM users WHERE last_login_at >= $1 AND is_bot IS NOT TRUE
         GROUP BY DATE(last_login_at) ORDER BY date`, [rangeStart]
      ),
      db.getAll(
        `SELECT DATE(created_at) as date, COUNT(*) as count
         FROM users WHERE created_at >= $1 AND is_bot IS NOT TRUE
         GROUP BY DATE(created_at) ORDER BY date`, [rangeStart]
      ),
      db.getAll(
        `SELECT DATE(created_at) as date, COUNT(*) as count
         FROM chat_messages WHERE created_at >= $1 AND COALESCE(message_type, 'user') != 'system'
         GROUP BY DATE(created_at) ORDER BY date`, [rangeStart]
      ),
      db.getAll(
        `SELECT DATE(joined_at) as date, COUNT(*) as count
         FROM league_members lm WHERE lm.joined_at >= $1 AND NOT EXISTS (SELECT 1 FROM users u WHERE u.id = lm.user_id AND u.is_bot = TRUE)
         GROUP BY DATE(joined_at) ORDER BY date`, [rangeStart]
      ),
      db.getAll(
        `SELECT DATE(created_at) as date, COUNT(*) as count
         FROM leagues WHERE created_at >= $1
         GROUP BY DATE(created_at) ORDER BY date`, [rangeStart]
      ),
      db.getAll(
        `SELECT DATE(created_at) as date, COUNT(*) as count
         FROM page_views WHERE created_at >= $1
         GROUP BY DATE(created_at) ORDER BY date`, [rangeStart]
      ),

      // Monthly aggregates (12 months)
      db.getAll(
        `SELECT TO_CHAR(last_login_at, 'YYYY-MM') as month, COUNT(DISTINCT id) as count
         FROM users WHERE last_login_at >= $1 AND is_bot IS NOT TRUE
         GROUP BY TO_CHAR(last_login_at, 'YYYY-MM') ORDER BY month`, [month12Ago]
      ),
      db.getAll(
        `SELECT TO_CHAR(created_at, 'YYYY-MM') as month, COUNT(*) as count
         FROM leagues WHERE created_at >= $1
         GROUP BY TO_CHAR(created_at, 'YYYY-MM') ORDER BY month`, [month12Ago]
      ),
      db.getAll(
        `SELECT TO_CHAR(created_at, 'YYYY-MM') as month, COUNT(*) as count
         FROM page_views WHERE created_at >= $1
         GROUP BY TO_CHAR(created_at, 'YYYY-MM') ORDER BY month`, [month12Ago]
      ),
      db.getAll(
        `SELECT TO_CHAR(started_at, 'YYYY-MM') as month, COUNT(*) as count
         FROM gamecast_sessions WHERE started_at >= $1
         GROUP BY TO_CHAR(started_at, 'YYYY-MM') ORDER BY month`, [month12Ago]
      ),

      // Engagement
      db.getOne('SELECT COUNT(*) as count FROM brackets WHERE is_submitted = true AND user_id NOT IN (SELECT id FROM users WHERE is_bot = TRUE)'),
      db.getOne('SELECT COUNT(*) as count FROM gamecast_sessions WHERE started_at >= $1', [day30Ago]),
      db.getOne('SELECT COUNT(*) as count FROM picks WHERE created_at >= $1 AND user_id NOT IN (SELECT id FROM users WHERE is_bot = TRUE)', [day30Ago]),
      db.getOne("SELECT COUNT(*) as count FROM leagues WHERE status = 'active'"),
      db.getOne('SELECT COUNT(*) as count FROM leagues'),

      // Top pages (for the selected range) — normalize paths by stripping UUIDs/IDs
      db.getAll(
        `SELECT normalized_path, SUM(views)::int as views, SUM(unique_visitors)::int as unique_visitors
         FROM (
           SELECT
             REGEXP_REPLACE(
               REGEXP_REPLACE(page_path, '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}', ':id', 'gi'),
               '\/[A-Fa-f0-9]{6,}(\/|$)', '/:id\\1', 'g'
             ) as normalized_path,
             COUNT(*) as views,
             COUNT(DISTINCT user_id) as unique_visitors
           FROM page_views WHERE created_at >= $1
           GROUP BY page_path
         ) sub
         GROUP BY normalized_path
         ORDER BY views DESC LIMIT 10`, [rangeStart]
      ),

      // Recent signups (last 8)
      db.getAll(
        `SELECT id, display_name, email, profile_image_url, created_at
         FROM users WHERE is_bot IS NOT TRUE ORDER BY created_at DESC LIMIT 8`
      ),

      // New vs returning users today
      db.getOne('SELECT COUNT(*) as count FROM users WHERE created_at >= $1 AND last_login_at >= $1 AND is_bot IS NOT TRUE', [todayStart]),
      db.getOne('SELECT COUNT(*) as count FROM users WHERE created_at < $1 AND last_login_at >= $1 AND is_bot IS NOT TRUE', [todayStart]),
    ]);

    const p = v => parseInt(v?.count || 0);
    const trend = rows => rows.map(r => ({ date: r.date, count: parseInt(r.count) }));
    const monthly = rows => rows.map(r => ({ month: r.month, count: parseInt(r.count) }));

    res.json({
      today: {
        signups: p(signupsToday),
        signupsDelta: p(signupsToday) - p(signupsYesterday),
        logins: p(loginsToday),
        loginsDelta: p(loginsToday) - p(loginsYesterday),
        active24h: p(active24h),
        active24hDelta: p(active24h) - p(active24hPrior),
        totalUsers: p(totalUsers),
        totalUsersDelta: p(totalUsers) - p(totalUsers7dAgo),
        pageViews: p(pageViewsToday),
        pageViewsDelta: p(pageViewsToday) - p(pageViewsYesterday),
        uniqueVisitors: p(uniqueVisitorsToday),
        uniqueVisitorsDelta: p(uniqueVisitorsToday) - p(uniqueVisitorsYesterday),
        newUsers: p(newUsersToday),
        returningUsers: p(returningUsersToday),
      },
      trends: {
        dau: trend(dauTrend),
        signups: trend(signupTrend),
        chatMessages: trend(chatTrend),
        leagueJoins: trend(leagueJoinTrend),
        newLeagues: trend(newLeagueTrend),
        pageViews: trend(pageViewTrend),
      },
      monthly: {
        mau: monthly(mauMonthly),
        newLeagues: monthly(leaguesMonthly),
        pageViews: monthly(pageViewsMonthly),
        gamecastSessions: monthly(gamecastMonthly),
      },
      engagement: {
        bracketsSubmitted: p(bracketsSubmitted),
        gamecastSessions30d: p(gamecastSessions30d),
        picksMade30d: p(picksMade30d),
        activeLeagues: p(activeLeagues),
        totalLeagues: p(totalLeagues),
      },
      topPages: topPages.map(r => ({
        path: r.normalized_path,
        views: parseInt(r.views),
        uniqueVisitors: parseInt(r.unique_visitors),
      })),
      recentSignups: recentSignups.map(u => ({
        id: u.id,
        displayName: u.display_name,
        email: u.email,
        profileImageUrl: u.profile_image_url,
        createdAt: u.created_at,
      })),
      onlineUsers: getOnlineUserCount(),
    });
  } catch (error) {
    console.error('Admin dashboard stats error:', error);
    res.status(500).json({ error: 'Failed to fetch dashboard stats' });
  }
});

// ─── Feature Engagement Analytics ────────────────────────────────────────────

router.get('/stats/schedule-engagement', async (req, res) => {
  try {
    const range = Math.min(parseInt(req.query.range) || 30, 90);
    const rangeStart = new Date(Date.now() - range * 24 * 3600000).toISOString();
    const todayStart = new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate()).toISOString();

    const [
      totalExpands, uniqueExpandUsers,
      tabBreakdown, sportBreakdown,
      topGames, avgDuration, dailyTrend,
      todayExpands, todayUniqueUsers, todayAvgDuration,
    ] = await Promise.all([
      // Total game card expands
      db.getOne(
        `SELECT COUNT(*) as count FROM feature_events
         WHERE event_name = 'game_card_expand' AND created_at >= $1`, [rangeStart]
      ),
      // Unique users who expanded
      db.getOne(
        `SELECT COUNT(DISTINCT COALESCE(user_id::text, session_id)) as count FROM feature_events
         WHERE event_name = 'game_card_expand' AND created_at >= $1`, [rangeStart]
      ),
      // Tab breakdown
      db.getAll(
        `SELECT event_data->>'tab' as tab, COUNT(*) as count FROM feature_events
         WHERE event_name = 'game_tab_switch' AND created_at >= $1
         GROUP BY event_data->>'tab' ORDER BY count DESC`, [rangeStart]
      ),
      // Sport breakdown
      db.getAll(
        `SELECT event_data->>'sportId' as sport_id, COUNT(*) as expands FROM feature_events
         WHERE event_name = 'game_card_expand' AND created_at >= $1
         GROUP BY event_data->>'sportId' ORDER BY expands DESC`, [rangeStart]
      ),
      // Top games by views
      db.getAll(
        `SELECT event_data->>'gameId' as game_id, event_data->>'sportId' as sport_id,
                COUNT(*) as expands,
                ROUND(AVG(CASE WHEN duration_seconds > 0 THEN duration_seconds END))::int as avg_duration
         FROM feature_events
         WHERE event_name IN ('game_card_expand', 'game_card_collapse') AND created_at >= $1
         GROUP BY event_data->>'gameId', event_data->>'sportId'
         ORDER BY expands DESC LIMIT 10`, [rangeStart]
      ),
      // Average view duration (from collapse events which carry duration)
      db.getOne(
        `SELECT ROUND(AVG(duration_seconds))::int as avg
         FROM feature_events
         WHERE event_name = 'game_card_collapse' AND duration_seconds > 0 AND created_at >= $1`, [rangeStart]
      ),
      // Daily trend
      db.getAll(
        `SELECT DATE(created_at) as date, COUNT(*) as count FROM feature_events
         WHERE event_name = 'game_card_expand' AND created_at >= $1
         GROUP BY DATE(created_at) ORDER BY date`, [rangeStart]
      ),
      // Today stats
      db.getOne(
        `SELECT COUNT(*) as count FROM feature_events
         WHERE event_name = 'game_card_expand' AND created_at >= $1`, [todayStart]
      ),
      db.getOne(
        `SELECT COUNT(DISTINCT COALESCE(user_id::text, session_id)) as count FROM feature_events
         WHERE event_name = 'game_card_expand' AND created_at >= $1`, [todayStart]
      ),
      db.getOne(
        `SELECT ROUND(AVG(duration_seconds))::int as avg
         FROM feature_events
         WHERE event_name = 'game_card_collapse' AND duration_seconds > 0 AND created_at >= $1`, [todayStart]
      ),
    ]);

    res.json({
      gameCardExpands: {
        total: parseInt(totalExpands?.count || 0),
        uniqueUsers: parseInt(uniqueExpandUsers?.count || 0),
      },
      today: {
        gameCardExpands: parseInt(todayExpands?.count || 0),
        uniqueUsers: parseInt(todayUniqueUsers?.count || 0),
        avgViewDuration: parseInt(todayAvgDuration?.avg) || 0,
      },
      tabBreakdown: tabBreakdown.map(r => ({ tab: r.tab, count: parseInt(r.count) })),
      sportBreakdown: sportBreakdown.map(r => ({ sportId: r.sport_id, expands: parseInt(r.expands) })),
      topGames: await resolveGameNames(topGames.map(r => ({
        gameId: r.game_id,
        sportId: r.sport_id,
        expands: parseInt(r.expands),
        avgDuration: parseInt(r.avg_duration) || 0,
      }))),
      avgViewDuration: parseInt(avgDuration?.avg) || 0,
      dailyTrend: dailyTrend.map(r => ({ date: r.date, count: parseInt(r.count) })),
    });
  } catch (error) {
    console.error('Schedule engagement error:', error);
    res.status(500).json({ error: 'Failed to fetch schedule engagement' });
  }
});

router.get('/stats/bracket-engagement', async (req, res) => {
  try {
    const range = Math.min(parseInt(req.query.range) || 30, 90);
    const rangeStart = new Date(Date.now() - range * 24 * 3600000).toISOString();
    const todayStart = new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate()).toISOString();

    const [
      totalOpens, uniqueOpenUsers,
      tabBreakdown, topMatchups, avgDuration, dailyTrend,
      todayOpens, todayUniqueUsers, todayAvgDuration,
    ] = await Promise.all([
      db.getOne(
        `SELECT COUNT(*) as count FROM feature_events
         WHERE event_name = 'matchup_detail_open' AND created_at >= $1`, [rangeStart]
      ),
      db.getOne(
        `SELECT COUNT(DISTINCT COALESCE(user_id::text, session_id)) as count FROM feature_events
         WHERE event_name = 'matchup_detail_open' AND created_at >= $1`, [rangeStart]
      ),
      db.getAll(
        `SELECT event_data->>'tab' as tab, COUNT(*) as count FROM feature_events
         WHERE event_name = 'matchup_tab_switch' AND created_at >= $1
         GROUP BY event_data->>'tab' ORDER BY count DESC`, [rangeStart]
      ),
      db.getAll(
        `SELECT event_data->>'team1Id' as team1_id, event_data->>'team2Id' as team2_id,
                (event_data->>'slot')::int as slot, COUNT(*) as views
         FROM feature_events
         WHERE event_name = 'matchup_detail_open' AND created_at >= $1
         GROUP BY event_data->>'team1Id', event_data->>'team2Id', event_data->>'slot'
         ORDER BY views DESC LIMIT 10`, [rangeStart]
      ),
      db.getOne(
        `SELECT ROUND(AVG(duration_seconds))::int as avg
         FROM feature_events
         WHERE event_name = 'matchup_detail_close' AND duration_seconds > 0 AND created_at >= $1`, [rangeStart]
      ),
      db.getAll(
        `SELECT DATE(created_at) as date, COUNT(*) as count FROM feature_events
         WHERE event_name = 'matchup_detail_open' AND created_at >= $1
         GROUP BY DATE(created_at) ORDER BY date`, [rangeStart]
      ),
      // Today stats
      db.getOne(
        `SELECT COUNT(*) as count FROM feature_events
         WHERE event_name = 'matchup_detail_open' AND created_at >= $1`, [todayStart]
      ),
      db.getOne(
        `SELECT COUNT(DISTINCT COALESCE(user_id::text, session_id)) as count FROM feature_events
         WHERE event_name = 'matchup_detail_open' AND created_at >= $1`, [todayStart]
      ),
      db.getOne(
        `SELECT ROUND(AVG(duration_seconds))::int as avg
         FROM feature_events
         WHERE event_name = 'matchup_detail_close' AND duration_seconds > 0 AND created_at >= $1`, [todayStart]
      ),
    ]);

    // Resolve team IDs to names using tournament bracket data
    let teamLookup = {};
    try {
      const currentSeason = new Date().getFullYear();
      const bracket = await getTournamentBracket(currentSeason);
      teamLookup = bracket?.teams || {};
    } catch { /* ignore — team names will fall back to IDs */ }

    const resolveTeamName = (id) => {
      if (!id) return null;
      // Skip First Four placeholders (ff-XXXXX)
      if (id.startsWith('ff-')) return 'First Four';
      const t = teamLookup[id];
      return t ? (t.shortName || t.abbreviation || t.name) : null;
    };

    res.json({
      matchupDetailsOpened: {
        total: parseInt(totalOpens?.count || 0),
        uniqueUsers: parseInt(uniqueOpenUsers?.count || 0),
      },
      today: {
        matchupDetailsOpened: parseInt(todayOpens?.count || 0),
        uniqueUsers: parseInt(todayUniqueUsers?.count || 0),
        avgViewDuration: parseInt(todayAvgDuration?.avg) || 0,
      },
      tabBreakdown: tabBreakdown.map(r => ({ tab: r.tab, count: parseInt(r.count) })),
      topMatchups: topMatchups.map(r => ({
        team1Id: r.team1_id,
        team2Id: r.team2_id,
        team1Name: resolveTeamName(r.team1_id),
        team2Name: resolveTeamName(r.team2_id),
        slot: r.slot,
        views: parseInt(r.views),
      })),
      avgViewDuration: parseInt(avgDuration?.avg) || 0,
      dailyTrend: dailyTrend.map(r => ({ date: r.date, count: parseInt(r.count) })),
    });
  } catch (error) {
    console.error('Bracket engagement error:', error);
    res.status(500).json({ error: 'Failed to fetch bracket engagement' });
  }
});

router.get('/stats/anonymous-usage', async (req, res) => {
  try {
    const range = Math.min(parseInt(req.query.range) || 30, 90);
    const rangeStart = new Date(Date.now() - range * 24 * 3600000).toISOString();

    const [
      uniqueSessions, totalEvents, topEvents, sportBreakdown, dailyTrend,
    ] = await Promise.all([
      db.getOne(
        `SELECT COUNT(DISTINCT session_id) as count FROM feature_events
         WHERE user_id IS NULL AND session_id IS NOT NULL AND created_at >= $1`, [rangeStart]
      ),
      db.getOne(
        `SELECT COUNT(*) as count FROM feature_events
         WHERE user_id IS NULL AND session_id IS NOT NULL AND created_at >= $1`, [rangeStart]
      ),
      db.getAll(
        `SELECT event_name, COUNT(*) as count FROM feature_events
         WHERE user_id IS NULL AND session_id IS NOT NULL AND created_at >= $1
         GROUP BY event_name ORDER BY count DESC LIMIT 10`, [rangeStart]
      ),
      db.getAll(
        `SELECT event_data->>'sportId' as sport_id, COUNT(*) as count FROM feature_events
         WHERE user_id IS NULL AND session_id IS NOT NULL AND event_data->>'sportId' IS NOT NULL AND created_at >= $1
         GROUP BY event_data->>'sportId' ORDER BY count DESC`, [rangeStart]
      ),
      db.getAll(
        `SELECT DATE(created_at) as date,
                COUNT(DISTINCT session_id) as sessions,
                COUNT(*) as events
         FROM feature_events
         WHERE user_id IS NULL AND session_id IS NOT NULL AND created_at >= $1
         GROUP BY DATE(created_at) ORDER BY date`, [rangeStart]
      ),
    ]);

    res.json({
      uniqueSessions: parseInt(uniqueSessions?.count || 0),
      totalEvents: parseInt(totalEvents?.count || 0),
      topEvents: topEvents.map(r => ({ event: r.event_name, count: parseInt(r.count) })),
      sportBreakdown: sportBreakdown.map(r => ({ sportId: r.sport_id, count: parseInt(r.count) })),
      dailyTrend: dailyTrend.map(r => ({
        date: r.date,
        sessions: parseInt(r.sessions),
        events: parseInt(r.events),
      })),
    });
  } catch (error) {
    console.error('Anonymous usage error:', error);
    res.status(500).json({ error: 'Failed to fetch anonymous usage' });
  }
});

// ─── Device Breakdown ─────────────────────────────────────────────────────────

router.get('/stats/device-breakdown', async (req, res) => {
  try {
    const { range = 30 } = req.query;
    const days = parseInt(range);

    // Overall device split from page_views
    const pageViewDevices = await db.getAll(`
      SELECT COALESCE(device_type, 'unknown') as device_type, COUNT(*) as count
      FROM page_views
      WHERE created_at > NOW() - INTERVAL '${days} days'
      GROUP BY COALESCE(device_type, 'unknown')
      ORDER BY count DESC
    `);

    // Overall device split from feature_events
    const eventDevices = await db.getAll(`
      SELECT COALESCE(device_type, 'unknown') as device_type, COUNT(*) as count
      FROM feature_events
      WHERE created_at > NOW() - INTERVAL '${days} days'
      GROUP BY COALESCE(device_type, 'unknown')
      ORDER BY count DESC
    `);

    // Unique users by device from page_views
    const uniqueUserDevices = await db.getAll(`
      SELECT COALESCE(device_type, 'unknown') as device_type, COUNT(DISTINCT user_id) as unique_users
      FROM page_views
      WHERE created_at > NOW() - INTERVAL '${days} days' AND user_id IS NOT NULL
      GROUP BY COALESCE(device_type, 'unknown')
      ORDER BY unique_users DESC
    `);

    // Daily trend by device type (page views)
    const dailyTrend = await db.getAll(`
      SELECT created_at::date as date,
             COALESCE(device_type, 'unknown') as device_type,
             COUNT(*) as count
      FROM page_views
      WHERE created_at > NOW() - INTERVAL '${days} days'
      GROUP BY created_at::date, COALESCE(device_type, 'unknown')
      ORDER BY date
    `);

    // Transform daily trend into { date, desktop, mobile, tablet } format
    const trendMap = {};
    for (const row of dailyTrend) {
      const dateStr = row.date instanceof Date ? row.date.toISOString().split('T')[0] : row.date;
      if (!trendMap[dateStr]) trendMap[dateStr] = { date: dateStr, desktop: 0, mobile: 0, tablet: 0 };
      const dt = row.device_type;
      if (dt === 'desktop' || dt === 'mobile' || dt === 'tablet') {
        trendMap[dateStr][dt] = parseInt(row.count);
      }
    }

    // Top pages by device — normalize paths
    const topPagesByDevice = await db.getAll(`
      SELECT normalized_path, device_type, SUM(count)::int as count
      FROM (
        SELECT
          REGEXP_REPLACE(
            REGEXP_REPLACE(page_path, '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}', ':id', 'gi'),
            '\/[A-Fa-f0-9]{6,}(\/|$)', '/:id\\1', 'g'
          ) as normalized_path,
          COALESCE(device_type, 'unknown') as device_type,
          COUNT(*) as count
        FROM page_views
        WHERE created_at > NOW() - INTERVAL '${days} days'
        GROUP BY page_path, COALESCE(device_type, 'unknown')
      ) sub
      GROUP BY normalized_path, device_type
      ORDER BY count DESC
      LIMIT 20
    `);

    res.json({
      pageViewDevices: pageViewDevices.map(r => ({ deviceType: r.device_type, count: parseInt(r.count) })),
      eventDevices: eventDevices.map(r => ({ deviceType: r.device_type, count: parseInt(r.count) })),
      uniqueUserDevices: uniqueUserDevices.map(r => ({ deviceType: r.device_type, uniqueUsers: parseInt(r.unique_users) })),
      dailyTrend: Object.values(trendMap).sort((a, b) => a.date.localeCompare(b.date)),
      topPagesByDevice: topPagesByDevice.map(r => ({ pagePath: r.normalized_path, deviceType: r.device_type, count: parseInt(r.count) })),
    });
  } catch (error) {
    console.error('Device breakdown error:', error);
    res.status(500).json({ error: 'Failed to fetch device breakdown' });
  }
});

// ─── Users ───────────────────────────────────────────────────────────────────

router.get('/users', async (req, res) => {
  try {
    const { search = '', page = 1, limit = 25, sort = 'last_login_at', order = 'desc' } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    // Whitelist sortable columns to prevent SQL injection
    const SORTABLE_COLUMNS = {
      name: 'u.display_name',
      email: 'u.email',
      leagues: 'league_count',
      last_login_at: 'u.last_login_at',
      created_at: 'u.created_at',
    };
    const sortColumn = SORTABLE_COLUMNS[sort] || 'u.last_login_at';
    const sortOrder = order === 'asc' ? 'ASC' : 'DESC';
    const nullsClause = sortOrder === 'DESC' ? 'NULLS LAST' : 'NULLS FIRST';

    let whereClause = '';
    const params = [];

    if (search) {
      params.push(`%${search}%`);
      whereClause = `WHERE display_name ILIKE $1 OR email ILIKE $1 OR phone ILIKE $1 OR first_name ILIKE $1 OR last_name ILIKE $1`;
    }

    const countQuery = `SELECT COUNT(*) as count FROM users ${whereClause}`;
    const total = await db.getOne(countQuery, params);

    const dataParams = [...params, parseInt(limit), offset];
    const users = await db.getAll(
      `SELECT u.id, u.display_name, u.first_name, u.last_name, u.profile_image_url, u.email, u.phone, u.is_admin, u.is_bot, u.created_at, u.last_login_at,
              (SELECT COUNT(*) FROM league_members lm WHERE lm.user_id = u.id) as league_count
       FROM users u
       ${whereClause}
       ORDER BY ${sortColumn} ${sortOrder} ${nullsClause}
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      dataParams
    );

    res.json({
      users: users.map(u => ({
        id: u.id,
        displayName: u.display_name,
        firstName: u.first_name,
        lastName: u.last_name,
        profileImageUrl: u.profile_image_url,
        email: u.email,
        phone: u.phone,
        isAdmin: u.is_admin || false,
        isBot: u.is_bot || false,
        leagueCount: parseInt(u.league_count),
        createdAt: u.created_at,
        lastLoginAt: u.last_login_at,
      })),
      total: parseInt(total.count),
      page: parseInt(page),
      totalPages: Math.ceil(parseInt(total.count) / parseInt(limit)),
    });
  } catch (error) {
    console.error('Admin users error:', error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

router.get('/users/:id', async (req, res) => {
  try {
    const user = await db.getOne(
      `SELECT id, display_name, first_name, last_name, profile_image_url, email, phone, firebase_uid, is_admin, is_disabled, is_bot, created_at, updated_at, last_login_at
       FROM users WHERE id = $1`,
      [req.params.id]
    );

    if (!user) return res.status(404).json({ error: 'User not found' });

    const leagues = await db.getAll(
      `SELECT l.id, l.name, l.sport_id, l.status, lm.strikes, lm.status as member_status, lm.joined_at,
              CASE WHEN l.commissioner_id = $1 THEN true ELSE false END as is_commissioner
       FROM league_members lm
       JOIN leagues l ON l.id = lm.league_id
       WHERE lm.user_id = $1
       ORDER BY lm.joined_at DESC`,
      [req.params.id]
    );

    // Fetch recent activity (last 10 items)
    const recentActivity = await db.getAll(`
      (
        SELECT 'pageview' as type, page_path as description, NULL as extra, device_type, created_at
        FROM page_views WHERE user_id = $1
      )
      UNION ALL
      (
        SELECT 'event' as type, event_name as description, event_data::text as extra, device_type, created_at
        FROM feature_events WHERE user_id = $1
      )
      UNION ALL
      (
        SELECT 'chat' as type,
               CASE WHEN deleted_at IS NOT NULL THEN '[deleted]' ELSE LEFT(message, 80) END as description,
               json_build_object('leagueId', league_id)::text as extra,
               NULL as device_type,
               created_at
        FROM chat_messages WHERE user_id = $1
      )
      UNION ALL
      (
        SELECT 'login' as type,
               CASE
                 WHEN city IS NOT NULL AND region IS NOT NULL THEN 'Signed in from ' || city || ', ' || region
                 WHEN country IS NOT NULL THEN 'Signed in from ' || country
                 ELSE 'Signed in'
               END as description,
               json_build_object('ip', ip_address, 'city', city, 'region', region, 'country', country, 'isNewUser', is_new_user)::text as extra,
               device_type,
               created_at
        FROM login_events WHERE user_id = $1
      )
      ORDER BY created_at DESC
      LIMIT 10
    `, [req.params.id]);

    res.json({
      id: user.id,
      displayName: user.display_name,
      firstName: user.first_name,
      lastName: user.last_name,
      profileImageUrl: user.profile_image_url,
      email: user.email,
      phone: user.phone,
      firebaseUid: user.firebase_uid,
      isAdmin: user.is_admin || false,
      isDisabled: user.is_disabled || false,
      isBot: user.is_bot || false,
      createdAt: user.created_at,
      updatedAt: user.updated_at,
      lastLoginAt: user.last_login_at,
      leagues: leagues.map(l => ({
        id: l.id,
        name: l.name,
        sportId: l.sport_id,
        status: l.status,
        strikes: l.strikes,
        memberStatus: l.member_status,
        isCommissioner: l.is_commissioner,
        joinedAt: l.joined_at,
      })),
      recentActivity: recentActivity.map(a => ({
        type: a.type,
        description: a.description,
        extra: a.extra ? (() => { try { return JSON.parse(a.extra); } catch { return a.extra; } })() : null,
        deviceType: a.device_type,
        createdAt: a.created_at,
      })),
    });
  } catch (error) {
    console.error('Admin user detail error:', error);
    res.status(500).json({ error: 'Failed to fetch user' });
  }
});

// User activity log (paginated)
router.get('/users/:id/activity', async (req, res) => {
  try {
    const { page = 1, limit = 25, type = 'all' } = req.query;
    const userId = req.params.id;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    // Build UNION based on type filter
    const unions = [];
    const countUnions = [];

    if (type === 'all' || type === 'pageview') {
      unions.push(`SELECT 'pageview' as type, page_path as description, NULL as extra, device_type, created_at FROM page_views WHERE user_id = $1`);
      countUnions.push(`SELECT id FROM page_views WHERE user_id = $1`);
    }
    if (type === 'all' || type === 'event') {
      unions.push(`SELECT 'event' as type, event_name as description, event_data::text as extra, device_type, created_at FROM feature_events WHERE user_id = $1`);
      countUnions.push(`SELECT id FROM feature_events WHERE user_id = $1`);
    }
    if (type === 'all' || type === 'chat') {
      unions.push(`SELECT 'chat' as type, CASE WHEN deleted_at IS NOT NULL THEN '[deleted]' ELSE LEFT(message, 80) END as description, json_build_object('leagueId', league_id)::text as extra, NULL as device_type, created_at FROM chat_messages WHERE user_id = $1`);
      countUnions.push(`SELECT id FROM chat_messages WHERE user_id = $1`);
    }
    if (type === 'all' || type === 'login') {
      unions.push(`SELECT 'login' as type, CASE WHEN city IS NOT NULL AND region IS NOT NULL THEN 'Signed in from ' || city || ', ' || region WHEN country IS NOT NULL THEN 'Signed in from ' || country ELSE 'Signed in' END as description, json_build_object('ip', ip_address, 'city', city, 'region', region, 'country', country, 'isNewUser', is_new_user)::text as extra, device_type, created_at FROM login_events WHERE user_id = $1`);
      countUnions.push(`SELECT id FROM login_events WHERE user_id = $1`);
    }

    if (unions.length === 0) {
      return res.json({ activities: [], total: 0, page: 1, totalPages: 1 });
    }

    const unionQuery = unions.join(' UNION ALL ');
    const countQuery = countUnions.join(' UNION ALL ');

    const [activities, totalResult] = await Promise.all([
      db.getAll(
        `SELECT * FROM (${unionQuery}) combined ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
        [userId, parseInt(limit), offset]
      ),
      db.getOne(
        `SELECT COUNT(*) as count FROM (${countQuery}) combined`,
        [userId]
      ),
    ]);

    const total = parseInt(totalResult.count);

    res.json({
      activities: activities.map(a => ({
        type: a.type,
        description: a.description,
        extra: a.extra ? (() => { try { return JSON.parse(a.extra); } catch { return a.extra; } })() : null,
        deviceType: a.device_type,
        createdAt: a.created_at,
      })),
      total,
      page: parseInt(page),
      totalPages: Math.ceil(total / parseInt(limit)),
    });
  } catch (error) {
    console.error('Admin user activity error:', error);
    res.status(500).json({ error: 'Failed to fetch user activity' });
  }
});

// ─── Leagues ─────────────────────────────────────────────────────────────────

router.get('/leagues', async (req, res) => {
  try {
    const { search = '', page = 1, limit = 25, sportId, status } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    const conditions = [];
    const params = [];

    if (search) {
      params.push(`%${search}%`);
      conditions.push(`l.name ILIKE $${params.length}`);
    }

    if (sportId) {
      params.push(sportId);
      conditions.push(`l.sport_id = $${params.length}`);
    }

    if (status) {
      params.push(status);
      conditions.push(`l.status = $${params.length}`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countQuery = `SELECT COUNT(*) as count FROM leagues l ${whereClause}`;
    const total = await db.getOne(countQuery, params);

    const dataParams = [...params, parseInt(limit), offset];
    const leagues = await db.getAll(
      `SELECT l.id, l.name, l.sport_id, l.status, l.season, l.created_at,
              u.display_name as commissioner_name,
              (SELECT COUNT(*) FROM league_members lm WHERE lm.league_id = l.id AND NOT EXISTS (SELECT 1 FROM users u2 WHERE u2.id = lm.user_id AND u2.is_bot = TRUE)) as member_count
       FROM leagues l
       LEFT JOIN users u ON u.id = l.commissioner_id
       ${whereClause}
       ORDER BY l.created_at DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      dataParams
    );

    res.json({
      leagues: leagues.map(l => ({
        id: l.id,
        name: l.name,
        sportId: l.sport_id,
        status: l.status,
        season: l.season,
        commissionerName: l.commissioner_name,
        memberCount: parseInt(l.member_count),
        createdAt: l.created_at,
      })),
      total: parseInt(total.count),
      page: parseInt(page),
      totalPages: Math.ceil(parseInt(total.count) / parseInt(limit)),
    });
  } catch (error) {
    console.error('Admin leagues error:', error);
    res.status(500).json({ error: 'Failed to fetch leagues' });
  }
});

router.get('/leagues/:id', async (req, res) => {
  try {
    const league = await db.getOne(
      `SELECT l.*, u.display_name as commissioner_name
       FROM leagues l
       LEFT JOIN users u ON u.id = l.commissioner_id
       WHERE l.id = $1`,
      [req.params.id]
    );

    if (!league) return res.status(404).json({ error: 'League not found' });

    const members = await db.getAll(
      `SELECT lm.*, u.display_name, u.email, u.phone
       FROM league_members lm
       JOIN users u ON u.id = lm.user_id
       WHERE lm.league_id = $1
       ORDER BY lm.joined_at ASC`,
      [req.params.id]
    );

    res.json({
      id: league.id,
      name: league.name,
      sportId: league.sport_id,
      status: league.status,
      season: league.season,
      maxStrikes: league.max_strikes,
      startWeek: league.start_week,
      commissionerName: league.commissioner_name,
      createdAt: league.created_at,
      members: members.map(m => ({
        id: m.user_id,
        displayName: m.display_name,
        email: m.email,
        strikes: m.strikes,
        status: m.status,
        joinedAt: m.joined_at,
      })),
    });
  } catch (error) {
    console.error('Admin league detail error:', error);
    res.status(500).json({ error: 'Failed to fetch league' });
  }
});

// ─── Scouting Reports ───────────────────────────────────────────────────────

router.get('/reports', async (req, res) => {
  try {
    const { season = new Date().getFullYear() } = req.query;

    // Get tournament teams
    let teams = [];
    try {
      const bracket = await getTournamentBracket(parseInt(season));
      if (bracket?.teams) {
        teams = Object.entries(bracket.teams).map(([id, team]) => ({
          id,
          name: team.name || team.shortName,
          abbreviation: team.abbreviation,
          seed: team.seed,
          logo: team.logo,
        }));
      }
    } catch {
      // Tournament data may not be available
    }

    // Get existing reports with concise_report to detect incomplete ones
    const reports = await db.getAll(
      'SELECT team_id, generated_at, concise_report, report FROM scouting_reports WHERE season = $1',
      [parseInt(season)]
    );

    const reportMap = {};
    let incompleteCount = 0;
    for (const r of reports) {
      const isIncomplete = !r.report || !r.concise_report ||
        (r.concise_report && !/[.!?]$/.test(r.concise_report.trim()));
      reportMap[r.team_id] = { generatedAt: r.generated_at, isIncomplete };
      if (isIncomplete) incompleteCount++;
    }

    // Merge team info with report status
    const teamsWithStatus = teams.map(t => ({
      ...t,
      hasReport: !!reportMap[t.id],
      isIncomplete: reportMap[t.id]?.isIncomplete || false,
      generatedAt: reportMap[t.id]?.generatedAt || null,
    }));

    // Sort: missing reports first, then by seed
    teamsWithStatus.sort((a, b) => {
      if (a.hasReport !== b.hasReport) return a.hasReport ? 1 : -1;
      return (a.seed || 99) - (b.seed || 99);
    });

    res.json({
      season: parseInt(season),
      totalTeams: teams.length,
      reportsGenerated: reports.length,
      incompleteCount,
      teams: teamsWithStatus,
    });
  } catch (error) {
    console.error('Admin reports error:', error);
    res.status(500).json({ error: 'Failed to fetch reports' });
  }
});

router.get('/reports/:teamId', async (req, res) => {
  try {
    const { season = new Date().getFullYear() } = req.query;
    const report = await db.getOne(
      'SELECT team_id, season, report, concise_report, generated_at FROM scouting_reports WHERE team_id = $1 AND season = $2',
      [req.params.teamId, parseInt(season)]
    );

    if (!report) return res.status(404).json({ error: 'Report not found' });

    res.json({
      teamId: report.team_id,
      season: report.season,
      report: report.report,
      conciseReport: report.concise_report,
      generatedAt: report.generated_at,
    });
  } catch (error) {
    console.error('Admin report detail error:', error);
    res.status(500).json({ error: 'Failed to fetch report' });
  }
});

router.post('/reports/generate', async (req, res) => {
  try {
    const { season = new Date().getFullYear(), teamId, force = false, incompleteOnly = false } = req.body;
    console.log(`[Admin] Generating scouting reports for season ${season}${teamId ? ` (team ${teamId})` : ''}${force ? ' (force)' : ''}${incompleteOnly ? ' (incomplete only)' : ''}`);

    const result = await generateAllReports(parseInt(season), { teamId, force, incompleteOnly });
    res.json(result);
  } catch (error) {
    console.error('Admin report generation error:', error);
    res.status(500).json({ error: error.message || 'Failed to generate reports' });
  }
});

// ─── Bracket Challenges (Testing) ──────────────────────────────────────────

router.get('/challenges', async (req, res) => {
  try {
    const challenges = await db.getAll(`
      SELECT bc.id, bc.league_id, bc.season, bc.status, bc.scoring_system, bc.tournament_data,
             l.name as league_name,
             (SELECT COUNT(*) FROM brackets b WHERE b.challenge_id = bc.id AND b.user_id NOT IN (SELECT id FROM users WHERE is_bot = TRUE)) as bracket_count,
             (SELECT COUNT(*) FROM brackets b WHERE b.challenge_id = bc.id AND b.is_submitted = true AND b.user_id NOT IN (SELECT id FROM users WHERE is_bot = TRUE)) as submitted_count
      FROM bracket_challenges bc
      JOIN leagues l ON l.id = bc.league_id
      ORDER BY bc.created_at DESC
    `);

    res.json({
      challenges: challenges.map(c => ({
        id: c.id,
        leagueId: c.league_id,
        leagueName: c.league_name,
        season: c.season,
        status: c.status,
        scoringSystem: c.scoring_system,
        bracketCount: parseInt(c.bracket_count),
        submittedCount: parseInt(c.submitted_count),
        teamCount: Object.keys(c.tournament_data?.teams || {}).length,
      })),
    });
  } catch (error) {
    console.error('Admin challenges error:', error);
    res.status(500).json({ error: 'Failed to fetch challenges' });
  }
});

router.get('/challenges/:id', async (req, res) => {
  try {
    const challenge = await db.getOne(`
      SELECT bc.*, l.name as league_name
      FROM bracket_challenges bc
      JOIN leagues l ON l.id = bc.league_id
      WHERE bc.id = $1
    `, [req.params.id]);

    if (!challenge) return res.status(404).json({ error: 'Challenge not found' });

    const results = await db.getAll(
      'SELECT * FROM bracket_results WHERE challenge_id = $1 ORDER BY slot_number',
      [challenge.id]
    );

    const resultsMap = {};
    for (const r of results) {
      resultsMap[r.slot_number] = {
        slotNumber: r.slot_number,
        winningTeamId: r.winning_team_id,
        losingTeamId: r.losing_team_id,
        winningScore: r.winning_score,
        losingScore: r.losing_score,
        round: r.round,
        status: r.status,
      };
    }

    res.json({
      id: challenge.id,
      leagueName: challenge.league_name,
      season: challenge.season,
      status: challenge.status,
      scoringSystem: challenge.scoring_system,
      tournamentData: challenge.tournament_data,
      results: resultsMap,
    });
  } catch (error) {
    console.error('Admin challenge detail error:', error);
    res.status(500).json({ error: 'Failed to fetch challenge' });
  }
});

router.post('/challenges/:id/set-result', async (req, res) => {
  try {
    const { slotNumber, winningTeamId, losingTeamId, winningScore = 0, losingScore = 0 } = req.body;

    if (!slotNumber || !winningTeamId) {
      return res.status(400).json({ error: 'slotNumber and winningTeamId are required' });
    }

    const challenge = await db.getOne('SELECT * FROM bracket_challenges WHERE id = $1', [req.params.id]);
    if (!challenge) return res.status(404).json({ error: 'Challenge not found' });

    const round = getSlotRound(slotNumber);

    // Insert/update the result
    await db.run(`
      INSERT INTO bracket_results (challenge_id, slot_number, winning_team_id, losing_team_id, winning_score, losing_score, round, status, completed_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, 'final', NOW())
      ON CONFLICT (challenge_id, slot_number) DO UPDATE SET
        winning_team_id = EXCLUDED.winning_team_id,
        losing_team_id = EXCLUDED.losing_team_id,
        winning_score = EXCLUDED.winning_score,
        losing_score = EXCLUDED.losing_score,
        status = 'final',
        completed_at = COALESCE(bracket_results.completed_at, NOW())
    `, [challenge.id, slotNumber, winningTeamId, losingTeamId, winningScore, losingScore, round]);

    // Auto-lock if still open
    if (challenge.status === 'open') {
      await db.run("UPDATE bracket_challenges SET status = 'locked', updated_at = NOW() WHERE id = $1", [challenge.id]);
    }

    // Recalculate scores for all submitted brackets
    const allResults = await db.getAll('SELECT * FROM bracket_results WHERE challenge_id = $1', [challenge.id]);
    const resultsMap = {};
    for (const r of allResults) {
      resultsMap[r.slot_number] = r;
    }

    const scoringSystem = challenge.scoring_system || [1, 2, 4, 8, 16, 32];
    const brackets = await db.getAll('SELECT id, picks FROM brackets WHERE challenge_id = $1 AND is_submitted = true', [challenge.id]);

    for (const bracket of brackets) {
      const { totalScore } = calculateBracketScore(bracket.picks || {}, resultsMap, scoringSystem);
      await db.run('UPDATE brackets SET total_score = $1, updated_at = NOW() WHERE id = $2', [totalScore, bracket.id]);
    }

    res.json({ success: true, slotNumber, round });
  } catch (error) {
    console.error('Admin set result error:', error);
    res.status(500).json({ error: 'Failed to set result' });
  }
});

// ─── Delete League ──────────────────────────────────────────────────────────

router.delete('/leagues/:id', async (req, res) => {
  try {
    const deleted = await db.getOne(
      'DELETE FROM leagues WHERE id = $1 RETURNING id, name',
      [req.params.id]
    );
    if (!deleted) {
      return res.status(404).json({ error: 'League not found' });
    }
    res.json({ deleted: true, name: deleted.name });
  } catch (error) {
    console.error('Admin delete league error:', error);
    res.status(500).json({ error: 'Failed to delete league' });
  }
});

// ─── Delete Bracket Challenge ───────────────────────────────────────────────

router.delete('/challenges/:id', async (req, res) => {
  try {
    const deleted = await db.getOne(
      `DELETE FROM bracket_challenges WHERE id = $1
       RETURNING id, (SELECT name FROM leagues WHERE id = bracket_challenges.league_id) as league_name`,
      [req.params.id]
    );
    if (!deleted) {
      return res.status(404).json({ error: 'Challenge not found' });
    }
    res.json({ deleted: true, leagueName: deleted.league_name });
  } catch (error) {
    console.error('Admin delete challenge error:', error);
    res.status(500).json({ error: 'Failed to delete challenge' });
  }
});

// ─── User Management Actions ──────────────────────────────────────────────

router.put('/users/:id/toggle-admin', async (req, res) => {
  try {
    // Prevent self-demotion
    if (req.params.id === req.adminUser.id) {
      return res.status(400).json({ error: 'Cannot change your own admin status' });
    }
    const user = await db.getOne(
      'UPDATE users SET is_admin = NOT is_admin, updated_at = NOW() WHERE id = $1 RETURNING id, is_admin',
      [req.params.id]
    );
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ id: user.id, isAdmin: user.is_admin });
  } catch (error) {
    console.error('Toggle admin error:', error);
    res.status(500).json({ error: 'Failed to toggle admin status' });
  }
});

router.put('/users/:id/toggle-disabled', async (req, res) => {
  try {
    if (req.params.id === req.adminUser.id) {
      return res.status(400).json({ error: 'Cannot disable your own account' });
    }
    const user = await db.getOne(
      'UPDATE users SET is_disabled = NOT is_disabled, updated_at = NOW() WHERE id = $1 RETURNING id, is_disabled',
      [req.params.id]
    );
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ id: user.id, isDisabled: user.is_disabled });
  } catch (error) {
    console.error('Toggle disabled error:', error);
    res.status(500).json({ error: 'Failed to toggle disabled status' });
  }
});

// ─── Chat Moderation ──────────────────────────────────────────────────────

router.get('/chat/leagues', async (req, res) => {
  try {
    const leagues = await db.getAll(`
      SELECT l.id, l.name, l.sport_id,
             (SELECT COUNT(*) FROM chat_messages cm WHERE cm.league_id = l.id) as message_count,
             (SELECT MAX(cm.created_at) FROM chat_messages cm WHERE cm.league_id = l.id) as last_message_at
      FROM leagues l
      ORDER BY last_message_at DESC NULLS LAST
    `);
    res.json({
      leagues: leagues.map(l => ({
        id: l.id,
        name: l.name,
        sportId: l.sport_id,
        messageCount: parseInt(l.message_count),
      })),
    });
  } catch (error) {
    console.error('Chat leagues error:', error);
    res.status(500).json({ error: 'Failed to fetch chat leagues' });
  }
});

router.get('/chat/leagues/:id/messages', async (req, res) => {
  try {
    const { search = '', page = 1, limit = 50 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const conditions = ['cm.league_id = $1'];
    const params = [req.params.id];

    if (search) {
      params.push(`%${search}%`);
      conditions.push(`cm.message ILIKE $${params.length}`);
    }

    const whereClause = `WHERE ${conditions.join(' AND ')}`;

    const total = await db.getOne(
      `SELECT COUNT(*) as count FROM chat_messages cm ${whereClause}`,
      params
    );

    const dataParams = [...params, parseInt(limit), offset];
    const messages = await db.getAll(
      `SELECT cm.id, cm.user_id, cm.message, cm.gif, cm.deleted_at, cm.deleted_by, cm.created_at,
              u.display_name, u.profile_image_url
       FROM chat_messages cm
       JOIN users u ON cm.user_id = u.id
       ${whereClause}
       ORDER BY cm.created_at DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      dataParams
    );

    res.json({
      messages: messages.map(m => ({
        id: m.id,
        userId: m.user_id,
        message: m.message,
        gif: m.gif,
        displayName: m.display_name,
        profileImageUrl: m.profile_image_url,
        deletedAt: m.deleted_at,
        deletedBy: m.deleted_by,
        createdAt: m.created_at,
      })),
      total: parseInt(total.count),
      page: parseInt(page),
      totalPages: Math.ceil(parseInt(total.count) / parseInt(limit)),
    });
  } catch (error) {
    console.error('Chat messages error:', error);
    res.status(500).json({ error: 'Failed to fetch chat messages' });
  }
});

router.delete('/chat/messages/:id', async (req, res) => {
  try {
    await db.run(
      `UPDATE chat_messages SET message = NULL, gif = NULL, deleted_at = NOW(), deleted_by = 'admin' WHERE id = $1`,
      [req.params.id]
    );
    res.json({ success: true });
  } catch (error) {
    console.error('Delete chat message error:', error);
    res.status(500).json({ error: 'Failed to delete message' });
  }
});

router.get('/chat/reports', async (req, res) => {
  try {
    const reports = await db.getAll(`
      SELECT cr.id, cr.message_id, cr.reason, cr.status, cr.created_at,
             cm.message as message_content, cm.user_id as sender_id,
             u_sender.display_name as sender_name,
             u_reporter.display_name as reporter_name,
             l.name as league_name
      FROM chat_reports cr
      JOIN chat_messages cm ON cm.id = cr.message_id
      JOIN users u_sender ON u_sender.id = cm.user_id
      JOIN users u_reporter ON u_reporter.id = cr.reported_by
      JOIN leagues l ON l.id = cr.league_id
      WHERE cr.status = 'pending'
      ORDER BY cr.created_at DESC
    `);
    res.json({
      reports: reports.map(r => ({
        id: r.id,
        messageId: r.message_id,
        messageContent: r.message_content,
        senderName: r.sender_name,
        reporterName: r.reporter_name,
        leagueName: r.league_name,
        reason: r.reason,
        status: r.status,
        createdAt: r.created_at,
      })),
    });
  } catch (error) {
    console.error('Chat reports error:', error);
    res.status(500).json({ error: 'Failed to fetch reports' });
  }
});

router.put('/chat/reports/:id/resolve', async (req, res) => {
  try {
    const { action } = req.body; // 'resolved' or 'dismissed'
    await db.run(
      `UPDATE chat_reports SET status = $1, resolved_by = $2, resolved_at = NOW() WHERE id = $3`,
      [action, req.adminUser.id, req.params.id]
    );
    res.json({ success: true });
  } catch (error) {
    console.error('Resolve report error:', error);
    res.status(500).json({ error: 'Failed to resolve report' });
  }
});

router.post('/chat/bans', async (req, res) => {
  try {
    const { userId, leagueId, reason, expiresAt } = req.body;
    if (!userId) return res.status(400).json({ error: 'userId is required' });

    const ban = await db.getOne(
      `INSERT INTO chat_bans (user_id, league_id, banned_by, reason, expires_at)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [userId, leagueId || null, req.adminUser.id, reason || null, expiresAt || null]
    );
    res.json({ id: ban.id, success: true });
  } catch (error) {
    console.error('Create ban error:', error);
    res.status(500).json({ error: 'Failed to create ban' });
  }
});

router.get('/chat/bans', async (req, res) => {
  try {
    const bans = await db.getAll(`
      SELECT cb.id, cb.user_id, cb.league_id, cb.reason, cb.expires_at, cb.created_at,
             u.display_name, l.name as league_name
      FROM chat_bans cb
      JOIN users u ON u.id = cb.user_id
      LEFT JOIN leagues l ON l.id = cb.league_id
      WHERE cb.expires_at IS NULL OR cb.expires_at > NOW()
      ORDER BY cb.created_at DESC
    `);
    res.json({
      bans: bans.map(b => ({
        id: b.id,
        userId: b.user_id,
        leagueId: b.league_id,
        displayName: b.display_name,
        leagueName: b.league_name,
        reason: b.reason,
        expiresAt: b.expires_at,
        createdAt: b.created_at,
      })),
    });
  } catch (error) {
    console.error('Get bans error:', error);
    res.status(500).json({ error: 'Failed to fetch bans' });
  }
});

router.delete('/chat/bans/:id', async (req, res) => {
  try {
    await db.run('DELETE FROM chat_bans WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (error) {
    console.error('Remove ban error:', error);
    res.status(500).json({ error: 'Failed to remove ban' });
  }
});

// ─── Gamecast Analytics ───────────────────────────────────────────────────

router.get('/analytics/gamecast', async (req, res) => {
  try {
    const [summary, topGames] = await Promise.all([
      db.getOne(`
        SELECT COUNT(*) as total_sessions,
               AVG(duration_seconds) as avg_duration,
               AVG(expand_clicks) as avg_expand_clicks,
               COUNT(DISTINCT user_id) as unique_users
        FROM gamecast_sessions
      `),
      db.getAll(`
        SELECT game_id, sport_id,
               COUNT(*) as views,
               AVG(duration_seconds) as avg_duration,
               SUM(expand_clicks) as total_expand_clicks
        FROM gamecast_sessions
        GROUP BY game_id, sport_id
        ORDER BY views DESC
        LIMIT 20
      `),
    ]);

    res.json({
      totalSessions: parseInt(summary.total_sessions),
      avgDuration: parseFloat(summary.avg_duration) || 0,
      avgExpandClicks: parseFloat(summary.avg_expand_clicks) || 0,
      uniqueUsers: parseInt(summary.unique_users),
      topGames: topGames.map(g => ({
        gameId: g.game_id,
        sportId: g.sport_id,
        views: parseInt(g.views),
        avgDuration: parseFloat(g.avg_duration) || 0,
        totalExpandClicks: parseInt(g.total_expand_clicks),
      })),
    });
  } catch (error) {
    console.error('Gamecast analytics error:', error);
    res.status(500).json({ error: 'Failed to fetch gamecast analytics' });
  }
});

// ─── Announcements ────────────────────────────────────────────────────────

router.get('/announcements', async (req, res) => {
  try {
    const announcements = await db.getAll(`
      SELECT * FROM announcements ORDER BY created_at DESC
    `);
    res.json({
      announcements: announcements.map(a => ({
        id: a.id,
        title: a.title,
        message: a.message,
        targetType: a.target_type,
        targetId: a.target_id,
        isActive: a.is_active,
        expiresAt: a.expires_at,
        createdAt: a.created_at,
      })),
    });
  } catch (error) {
    console.error('Get announcements error:', error);
    res.status(500).json({ error: 'Failed to fetch announcements' });
  }
});

router.post('/announcements', async (req, res) => {
  try {
    const { title, message, targetType, targetId, expiresAt } = req.body;
    if (!title || !message) return res.status(400).json({ error: 'Title and message are required' });

    const announcement = await db.getOne(
      `INSERT INTO announcements (title, message, target_type, target_id, created_by, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [title, message, targetType || 'all', targetId || null, req.adminUser.id, expiresAt || null]
    );
    res.json({ id: announcement.id, success: true });
  } catch (error) {
    console.error('Create announcement error:', error);
    res.status(500).json({ error: 'Failed to create announcement' });
  }
});

router.put('/announcements/:id', async (req, res) => {
  try {
    const fields = [];
    const params = [];
    let paramIndex = 1;

    for (const [key, value] of Object.entries(req.body)) {
      const columnMap = {
        title: 'title', message: 'message', targetType: 'target_type',
        targetId: 'target_id', isActive: 'is_active', expiresAt: 'expires_at',
      };
      if (columnMap[key] !== undefined) {
        fields.push(`${columnMap[key]} = $${paramIndex}`);
        params.push(value);
        paramIndex++;
      }
    }

    if (fields.length === 0) return res.status(400).json({ error: 'No fields to update' });

    params.push(req.params.id);
    await db.run(
      `UPDATE announcements SET ${fields.join(', ')} WHERE id = $${paramIndex}`,
      params
    );
    res.json({ success: true });
  } catch (error) {
    console.error('Update announcement error:', error);
    res.status(500).json({ error: 'Failed to update announcement' });
  }
});

router.delete('/announcements/:id', async (req, res) => {
  try {
    await db.run('DELETE FROM announcements WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (error) {
    console.error('Delete announcement error:', error);
    res.status(500).json({ error: 'Failed to delete announcement' });
  }
});

// ─── User Visit Tracking ────────────────────────────────────────────────────

router.get('/stats/user-visits', async (req, res) => {
  try {
    const { period = 'daily', date } = req.query;
    // Default to today for daily, current month for monthly
    const now = new Date();
    const targetDate = date || now.toISOString().split('T')[0];

    let dateFilter, groupBy, dateLabel;
    if (period === 'monthly') {
      // Filter by month
      const [year, month] = targetDate.split('-');
      dateFilter = `DATE_TRUNC('month', pv.created_at) = DATE_TRUNC('month', $1::date)`;
      groupBy = `DATE_TRUNC('month', pv.created_at)`;
      dateLabel = `${year}-${month}`;
    } else {
      // Filter by day
      dateFilter = `DATE(pv.created_at) = $1::date`;
      groupBy = `DATE(pv.created_at)`;
      dateLabel = targetDate;
    }

    // Get per-user visit counts and session data
    // A "session" = group of page views from same user/anon with <30 min gaps
    // Uses COALESCE(user_id::text, 'anon:' || anon_id) as unified visitor key
    const query = `
      WITH session_boundaries AS (
        SELECT
          pv.user_id,
          pv.anon_id,
          COALESCE(pv.user_id::text, 'anon:' || pv.anon_id) AS visitor_key,
          pv.created_at,
          CASE
            WHEN pv.created_at - LAG(pv.created_at) OVER (PARTITION BY COALESCE(pv.user_id::text, 'anon:' || pv.anon_id) ORDER BY pv.created_at) > INTERVAL '30 minutes'
            OR LAG(pv.created_at) OVER (PARTITION BY COALESCE(pv.user_id::text, 'anon:' || pv.anon_id) ORDER BY pv.created_at) IS NULL
            THEN 1
            ELSE 0
          END AS new_session
        FROM page_views pv
        WHERE ${dateFilter}
          AND (pv.user_id IS NOT NULL OR pv.anon_id IS NOT NULL)
      ),
      sessions AS (
        SELECT
          user_id,
          anon_id,
          visitor_key,
          created_at,
          SUM(new_session) OVER (PARTITION BY visitor_key ORDER BY created_at) AS session_num
        FROM session_boundaries
      ),
      session_stats AS (
        SELECT
          visitor_key,
          MIN(user_id) AS user_id,
          MIN(anon_id) AS anon_id,
          session_num,
          MIN(created_at) AS session_start,
          MAX(created_at) AS session_end,
          EXTRACT(EPOCH FROM (MAX(created_at) - MIN(created_at))) AS duration_seconds,
          COUNT(*) AS page_views
        FROM sessions
        GROUP BY visitor_key, session_num
      ),
      visitor_summary AS (
        SELECT
          ss.visitor_key,
          MIN(ss.user_id) AS user_id,
          MIN(ss.anon_id) AS anon_id,
          COUNT(DISTINCT ss.session_num) AS visit_count,
          SUM(ss.page_views) AS total_page_views,
          AVG(ss.duration_seconds) AS avg_session_seconds,
          MAX(ss.session_end) AS last_visit_at,
          json_agg(
            json_build_object(
              'start', ss.session_start,
              'end', ss.session_end,
              'duration', ss.duration_seconds,
              'pages', ss.page_views
            ) ORDER BY ss.session_start DESC
          ) AS sessions
        FROM session_stats ss
        GROUP BY ss.visitor_key
      )
      SELECT
        vs.visitor_key,
        vs.user_id,
        vs.anon_id,
        u.display_name,
        u.first_name,
        u.last_name,
        u.email,
        vs.visit_count,
        vs.total_page_views,
        vs.avg_session_seconds,
        vs.last_visit_at,
        vs.sessions,
        le.city,
        le.region,
        le.country
      FROM visitor_summary vs
      LEFT JOIN users u ON u.id = vs.user_id
      LEFT JOIN LATERAL (
        SELECT city, region, country FROM login_events
        WHERE user_id = vs.user_id AND city IS NOT NULL
        ORDER BY created_at DESC LIMIT 1
      ) le ON vs.user_id IS NOT NULL
      ORDER BY vs.last_visit_at DESC
      LIMIT 200
    `;

    const rows = await db.getAll(query, [targetDate]);

    res.json({
      period,
      date: dateLabel,
      users: rows.map(r => {
        const isAnon = !r.user_id;
        const anonShort = r.anon_id ? r.anon_id.substring(0, 8) : 'unknown';
        return {
          userId: r.visitor_key,
          isAnonymous: isAnon,
          name: isAnon
            ? `Anonymous (${anonShort})`
            : (r.display_name || (r.first_name && r.last_name ? `${r.first_name} ${r.last_name}` : r.first_name || r.email || r.user_id)),
          visitCount: parseInt(r.visit_count),
          totalPageViews: parseInt(r.total_page_views),
          avgSessionSeconds: parseFloat(r.avg_session_seconds) || 0,
          lastVisitAt: r.last_visit_at,
          sessions: r.sessions || [],
          location: r.city ? `${r.city}${r.region ? `, ${r.region}` : ''}` : null,
        };
      }),
    });
  } catch (error) {
    console.error('User visits error:', error);
    res.status(500).json({ error: 'Failed to fetch user visits' });
  }
});

// Get page views for a specific user session (defined by user_id + time range)
router.get('/stats/session-pages', async (req, res) => {
  try {
    const { userId, start, end } = req.query;
    if (!userId || !start) {
      return res.status(400).json({ error: 'userId and start are required' });
    }

    // Session end: if provided use it + 1 second buffer, otherwise use start + 30 min
    const sessionEnd = end || new Date(new Date(start).getTime() + 30 * 60 * 1000).toISOString();

    // Handle anonymous visitors (visitor_key starts with "anon:")
    const isAnon = userId.startsWith('anon:');
    const whereClause = isAnon
      ? `anon_id = $1`
      : `user_id = $1`;
    const paramValue = isAnon ? userId.slice(5) : userId;

    const rows = await db.getAll(
      `SELECT page_path, created_at
       FROM page_views
       WHERE ${whereClause}
         AND created_at >= $2::timestamptz
         AND created_at <= ($3::timestamptz + INTERVAL '1 second')
       ORDER BY created_at ASC`,
      [paramValue, start, sessionEnd]
    );

    res.json({
      pages: rows.map(r => ({
        path: r.page_path,
        timestamp: r.created_at,
      })),
    });
  } catch (error) {
    console.error('Session pages error:', error);
    res.status(500).json({ error: 'Failed to fetch session pages' });
  }
});

// ─── NBA Prospects ──────────────────────────────────────────────────────────

// Get saved prospects from DB for a given year
router.get('/prospects', async (req, res) => {
  try {
    const sport = req.query.sport || 'nba';
    const draftYear = req.query.year ? parseInt(req.query.year) : getCurrentDraftYear();
    const prospects = await getProspectsFromDB(sport, draftYear);
    const years = await getDraftYears(sport);
    const lastUpdated = await getProspectsLastUpdated(sport, draftYear);
    res.json({ prospects, draftYear, years, lastUpdated });
  } catch (error) {
    console.error('Prospects fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch prospects' });
  }
});

// Get available draft years
router.get('/prospects/years', async (req, res) => {
  try {
    const sport = req.query.sport || 'nba';
    const years = await getDraftYears(sport);
    res.json({ years, currentYear: getCurrentDraftYear() });
  } catch (error) {
    console.error('Prospects years error:', error);
    res.status(500).json({ error: 'Failed to fetch draft years' });
  }
});

// Fetch fresh data from Tankathon + ESPN (staging — not saved to DB yet)
router.post('/prospects/fetch', async (req, res) => {
  try {
    const prospects = await fetchStagedProspects();
    const matchedCount = prospects.filter(p => p.espnId).length;
    res.json({
      prospects,
      matchedCount,
      totalCount: prospects.length,
      draftYear: getCurrentDraftYear(),
    });
  } catch (error) {
    console.error('Prospects fetch/stage error:', error);
    res.status(500).json({ error: 'Failed to fetch prospects from sources' });
  }
});

// Confirm and save staged prospects to DB
router.post('/prospects/confirm', async (req, res) => {
  try {
    const { prospects, draftYear } = req.body;
    if (!prospects?.length) {
      return res.status(400).json({ error: 'No prospects to save' });
    }
    const year = draftYear || getCurrentDraftYear();
    await saveProspectsToDB(prospects, 'nba', year);
    const saved = await getProspectsFromDB('nba', year);
    const years = await getDraftYears('nba');
    const lastUpdated = await getProspectsLastUpdated('nba', year);
    res.json({ prospects: saved, draftYear: year, years, lastUpdated });
  } catch (error) {
    console.error('Prospects confirm error:', error);
    res.status(500).json({ error: 'Failed to save prospects' });
  }
});

module.exports = router;
