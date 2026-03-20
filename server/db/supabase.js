const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.SUPABASE_DB_HOST,
  port: parseInt(process.env.SUPABASE_DB_PORT || '5432'),
  database: process.env.SUPABASE_DB_NAME || 'postgres',
  user: process.env.SUPABASE_DB_USER,
  password: process.env.SUPABASE_DB_PASSWORD,
  ssl: { rejectUnauthorized: false }
});

// Initialize tables
async function initDb() {
  const client = await pool.connect();
  
  try {
    // Create users table
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        firebase_uid TEXT UNIQUE NOT NULL,
        phone TEXT,
        email TEXT,
        display_name TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // Create leagues table
    await client.query(`
      CREATE TABLE IF NOT EXISTS leagues (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name TEXT NOT NULL,
        password_hash TEXT,
        commissioner_id UUID NOT NULL,
        max_strikes INTEGER DEFAULT 1,
        start_week INTEGER DEFAULT 1,
        season INTEGER NOT NULL,
        status TEXT DEFAULT 'active',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // Create league_members table
    await client.query(`
      CREATE TABLE IF NOT EXISTS league_members (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        league_id UUID NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        strikes INTEGER DEFAULT 0,
        status TEXT DEFAULT 'active',
        joined_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(league_id, user_id)
      )
    `);

    // Create picks table
    await client.query(`
      CREATE TABLE IF NOT EXISTS picks (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        league_id UUID NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        week INTEGER NOT NULL,
        team_id TEXT NOT NULL,
        result TEXT DEFAULT 'pending',
        game_id TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(league_id, user_id, week)
      )
    `);

    // Create sports reference table
    await client.query(`
      CREATE TABLE IF NOT EXISTS sports (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        display_name TEXT NOT NULL,
        icon TEXT,
        provider TEXT NOT NULL DEFAULT 'espn',
        provider_config JSONB DEFAULT '{}',
        game_type TEXT NOT NULL,
        status TEXT DEFAULT 'active',
        season_structure JSONB NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // Seed NFL sport
    await client.query(`
      INSERT INTO sports (id, name, display_name, icon, provider, provider_config, game_type, season_structure)
      VALUES (
        'nfl',
        'NFL',
        'NFL Survivor',
        'football',
        'espn',
        '{"api_base":"https://site.api.espn.com/apis/site/v2/sports/football/nfl","team_count":32}',
        'survivor',
        '{"type":"weekly","regular_weeks":18,"playoff_weeks":[19,20,21,23],"skip_weeks":[22],"max_week":23,"week_labels":{"19":"Wild Card","20":"Divisional","21":"Conference","23":"Super Bowl"},"start_week_range":[1,18]}'
      ) ON CONFLICT (id) DO NOTHING
    `);

    // Add sport_id and sport_config to leagues (safe for existing data via defaults)
    await client.query(`ALTER TABLE leagues ADD COLUMN IF NOT EXISTS sport_id TEXT NOT NULL DEFAULT 'nfl'`);
    await client.query(`ALTER TABLE leagues ADD COLUMN IF NOT EXISTS sport_config JSONB DEFAULT '{}'`);

    // Bracket challenge tables
    await client.query(`
      CREATE TABLE IF NOT EXISTS bracket_challenges (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        league_id UUID NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
        season INTEGER NOT NULL,
        max_brackets_per_user INTEGER NOT NULL DEFAULT 1,
        scoring_preset TEXT NOT NULL DEFAULT 'standard',
        scoring_system JSONB NOT NULL DEFAULT '[1, 2, 4, 8, 16, 32]',
        tiebreaker_type TEXT NOT NULL DEFAULT 'total_score',
        entry_deadline TIMESTAMPTZ,
        tournament_data JSONB,
        status TEXT NOT NULL DEFAULT 'open',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(league_id, season)
      )
    `);

    // Add entry_fee to bracket_challenges (safe for existing data via default)
    await client.query(`ALTER TABLE bracket_challenges ADD COLUMN IF NOT EXISTS entry_fee DECIMAL DEFAULT 0`);

    await client.query(`
      CREATE TABLE IF NOT EXISTS brackets (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        challenge_id UUID NOT NULL REFERENCES bracket_challenges(id) ON DELETE CASCADE,
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        bracket_number INTEGER NOT NULL DEFAULT 1,
        name TEXT,
        picks JSONB NOT NULL DEFAULT '{}',
        tiebreaker_value INTEGER,
        tiebreaker_scores JSONB,
        total_score INTEGER NOT NULL DEFAULT 0,
        is_submitted BOOLEAN NOT NULL DEFAULT false,
        submitted_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(challenge_id, user_id, bracket_number)
      )
    `);

    await client.query(`ALTER TABLE brackets ADD COLUMN IF NOT EXISTS tiebreaker_scores JSONB`);

    await client.query(`
      CREATE TABLE IF NOT EXISTS bracket_results (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        challenge_id UUID NOT NULL REFERENCES bracket_challenges(id) ON DELETE CASCADE,
        slot_number INTEGER NOT NULL,
        espn_event_id TEXT,
        winning_team_id TEXT,
        losing_team_id TEXT,
        winning_score INTEGER,
        losing_score INTEGER,
        round INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        completed_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(challenge_id, slot_number)
      )
    `);

    // Centralized tournament data — single source of truth per season
    await client.query(`
      CREATE TABLE IF NOT EXISTS tournaments (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        season INTEGER NOT NULL UNIQUE,
        name TEXT NOT NULL DEFAULT 'NCAA Tournament',
        status TEXT NOT NULL DEFAULT 'pending',
        regions JSONB NOT NULL DEFAULT '[]',
        first_game_time TIMESTAMPTZ,
        metadata JSONB DEFAULT '{}',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS tournament_teams (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tournament_id UUID NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
        espn_team_id TEXT NOT NULL,
        name TEXT NOT NULL,
        abbreviation TEXT,
        short_name TEXT,
        logo TEXT,
        color TEXT,
        seed INTEGER NOT NULL,
        region_index INTEGER NOT NULL,
        record TEXT,
        is_first_four BOOLEAN DEFAULT FALSE,
        eliminated BOOLEAN DEFAULT FALSE,
        metadata JSONB DEFAULT '{}',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(tournament_id, espn_team_id)
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS tournament_games (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tournament_id UUID NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
        slot_number INTEGER,
        first_four_index INTEGER,
        round INTEGER NOT NULL,
        region_index INTEGER,
        espn_event_id TEXT,
        team1_espn_id TEXT,
        team2_espn_id TEXT,
        status TEXT NOT NULL DEFAULT 'pending',
        winning_team_espn_id TEXT,
        losing_team_espn_id TEXT,
        team1_score INTEGER,
        team2_score INTEGER,
        start_time TIMESTAMPTZ,
        venue TEXT,
        broadcast TEXT,
        status_detail TEXT,
        completed_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    // Add unique constraints safely (may already exist)
    await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_tournament_games_slot ON tournament_games(tournament_id, slot_number) WHERE slot_number IS NOT NULL`);
    await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_tournament_games_ff ON tournament_games(tournament_id, first_four_index) WHERE first_four_index IS NOT NULL`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_tournament_games_tournament ON tournament_games(tournament_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_tournament_games_espn_event ON tournament_games(tournament_id, espn_event_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_tournament_teams_tournament ON tournament_teams(tournament_id)`);

    // Add tournament_id FK to bracket_challenges (nullable during migration)
    await client.query(`ALTER TABLE bracket_challenges ADD COLUMN IF NOT EXISTS tournament_id UUID REFERENCES tournaments(id)`);

    // Pre-generated AI scouting reports (persisted across restarts)
    await client.query(`
      CREATE TABLE IF NOT EXISTS scouting_reports (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        team_id TEXT NOT NULL,
        season INTEGER NOT NULL,
        report TEXT NOT NULL,
        concise_report TEXT,
        generated_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(team_id, season)
      )
    `);

    // Matchup reports table for AI-generated head-to-head analysis
    await client.query(`
      CREATE TABLE IF NOT EXISTS matchup_reports (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        team1_id TEXT NOT NULL,
        team2_id TEXT NOT NULL,
        season INTEGER NOT NULL,
        report TEXT NOT NULL,
        concise_report TEXT,
        round TEXT,
        generated_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(team1_id, team2_id, season)
      )
    `);
    // Add columns to matchup_reports if they don't exist (migration)
    await client.query(`ALTER TABLE matchup_reports ADD COLUMN IF NOT EXISTS concise_report TEXT`);
    await client.query(`ALTER TABLE matchup_reports ADD COLUMN IF NOT EXISTS round TEXT`);

    // Create indexes for better performance
    // Add is_admin flag and last_login_at to users table
    await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT FALSE`);
    await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ`);

    // Profile fields
    await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS first_name TEXT`);
    await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS last_name TEXT`);
    await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_image_url TEXT`);
    await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS onboarding_complete BOOLEAN DEFAULT FALSE`);
    await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS is_disabled BOOLEAN DEFAULT FALSE`);
    await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS is_bot BOOLEAN DEFAULT FALSE`);
    // Auto-mark existing users with display_name as onboarding complete
    await client.query(`UPDATE users SET onboarding_complete = TRUE WHERE display_name IS NOT NULL AND onboarding_complete = FALSE`);

    // Chat moderation tables
    await client.query(`
      CREATE TABLE IF NOT EXISTS chat_reports (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        message_id UUID NOT NULL,
        reported_by UUID NOT NULL REFERENCES users(id),
        league_id UUID NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
        reason TEXT,
        status TEXT DEFAULT 'pending',
        resolved_by UUID REFERENCES users(id),
        resolved_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS chat_bans (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id),
        league_id UUID REFERENCES leagues(id) ON DELETE CASCADE,
        banned_by UUID NOT NULL REFERENCES users(id),
        reason TEXT,
        expires_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // Gamecast analytics
    await client.query(`
      CREATE TABLE IF NOT EXISTS gamecast_sessions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES users(id),
        game_id TEXT NOT NULL,
        sport_id TEXT NOT NULL,
        duration_seconds INTEGER,
        expand_clicks INTEGER DEFAULT 0,
        started_at TIMESTAMPTZ DEFAULT NOW(),
        ended_at TIMESTAMPTZ
      )
    `);

    // Announcements
    await client.query(`
      CREATE TABLE IF NOT EXISTS announcements (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        title TEXT NOT NULL,
        message TEXT NOT NULL,
        target_type TEXT DEFAULT 'all',
        target_id TEXT,
        created_by UUID REFERENCES users(id),
        is_active BOOLEAN DEFAULT TRUE,
        expires_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // Add message_type to chat_messages for system messages (e.g., "X joined the league")
    await client.query(`ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS message_type TEXT DEFAULT 'user'`);
    await client.query(`ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS metadata JSONB`);

    // Daily AI-generated recaps
    await client.query(`
      CREATE TABLE IF NOT EXISTS daily_recaps (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        league_id UUID NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
        tournament_id UUID NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
        recap_date DATE NOT NULL,
        tldr TEXT NOT NULL,
        full_recap TEXT NOT NULL,
        metadata JSONB DEFAULT '{}',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(league_id, tournament_id, recap_date)
      )
    `);

    // Payment methods for commissioners (Venmo, PayPal, Zelle, Cash App)
    await client.query(`ALTER TABLE leagues ADD COLUMN IF NOT EXISTS payment_methods JSONB DEFAULT '[]'`);

    // Allow public leagues (no password)
    await client.query(`ALTER TABLE leagues ALTER COLUMN password_hash DROP NOT NULL`);

    await client.query(`CREATE INDEX IF NOT EXISTS idx_users_firebase_uid ON users(firebase_uid)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_league_members_user ON league_members(user_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_league_members_league ON league_members(league_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_picks_league_user ON picks(league_id, user_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_leagues_sport ON leagues(sport_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_bracket_challenges_league ON bracket_challenges(league_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_brackets_challenge ON brackets(challenge_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_brackets_user ON brackets(user_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_brackets_challenge_score ON brackets(challenge_id, total_score DESC)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_bracket_results_challenge ON bracket_results(challenge_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_scouting_reports_team_season ON scouting_reports(team_id, season)`);

    // Page views tracking
    await client.query(`
      CREATE TABLE IF NOT EXISTS page_views (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES users(id),
        page_path TEXT NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_page_views_created ON page_views(created_at)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_page_views_path_created ON page_views(page_path, created_at)`);
    // Add location columns to page_views (idempotent)
    await client.query(`ALTER TABLE page_views ADD COLUMN IF NOT EXISTS city TEXT`);
    await client.query(`ALTER TABLE page_views ADD COLUMN IF NOT EXISTS region TEXT`);
    await client.query(`ALTER TABLE page_views ADD COLUMN IF NOT EXISTS country TEXT`);

    // Feature events tracking (universal event table)
    await client.query(`
      CREATE TABLE IF NOT EXISTS feature_events (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES users(id),
        session_id TEXT,
        event_name TEXT NOT NULL,
        event_data JSONB DEFAULT '{}',
        duration_seconds INTEGER,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_feature_events_name_created ON feature_events(event_name, created_at)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_feature_events_created ON feature_events(created_at)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_feature_events_user ON feature_events(user_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_feature_events_session ON feature_events(session_id)`);

    // Add device_type column to tracking tables (safe to run repeatedly)
    await client.query(`ALTER TABLE page_views ADD COLUMN IF NOT EXISTS device_type TEXT`);
    await client.query(`ALTER TABLE feature_events ADD COLUMN IF NOT EXISTS device_type TEXT`);

    // Anonymous tracking: make user_id nullable and add anon_id for non-auth visitors
    await client.query(`ALTER TABLE page_views ALTER COLUMN user_id DROP NOT NULL`);
    await client.query(`ALTER TABLE page_views ADD COLUMN IF NOT EXISTS anon_id TEXT`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_page_views_anon ON page_views(anon_id) WHERE anon_id IS NOT NULL`);

    // Login events tracking (sign-in history with geolocation)
    await client.query(`
      CREATE TABLE IF NOT EXISTS login_events (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES users(id),
        ip_address TEXT,
        city TEXT,
        region TEXT,
        country TEXT,
        device_type TEXT,
        is_new_user BOOLEAN DEFAULT false,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_login_events_user ON login_events(user_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_login_events_created ON login_events(created_at)`);

    // Draft prospects table — sport-agnostic, year-separated
    await client.query(`
      CREATE TABLE IF NOT EXISTS draft_prospects (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        sport TEXT NOT NULL DEFAULT 'nba',
        draft_year INTEGER NOT NULL,
        rank INTEGER NOT NULL,
        name TEXT NOT NULL,
        normalized_name TEXT,
        position TEXT,
        school TEXT,
        height TEXT,
        weight TEXT,
        year TEXT,
        logo TEXT,
        stats JSONB DEFAULT '{}',
        espn_id TEXT,
        jersey TEXT,
        headshot_url TEXT,
        espn_stats JSONB,
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        created_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(sport, draft_year, rank)
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_draft_prospects_sport_year ON draft_prospects(sport, draft_year)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_draft_prospects_name ON draft_prospects(normalized_name)`);

    // Migrate existing bracket_challenges tournament_data into new normalized tables
    const unmigrated = await client.query(
      `SELECT bc.id, bc.season, bc.tournament_data, bc.tournament_id
       FROM bracket_challenges bc
       WHERE bc.tournament_data IS NOT NULL AND bc.tournament_id IS NULL`
    );
    if (unmigrated.rows.length > 0) {
      console.log(`[Migration] Migrating ${unmigrated.rows.length} bracket challenges to normalized tournament tables...`);
      // Group by season — all challenges in the same season share one tournament
      const bySeason = {};
      for (const row of unmigrated.rows) {
        if (!bySeason[row.season]) bySeason[row.season] = [];
        bySeason[row.season].push(row);
      }

      for (const [season, challenges] of Object.entries(bySeason)) {
        // Pick the challenge with the most complete tournament_data as source
        const source = challenges.reduce((best, c) => {
          const teams = Object.keys(c.tournament_data?.teams || {}).length;
          const bestTeams = Object.keys(best.tournament_data?.teams || {}).length;
          return teams > bestTeams ? c : best;
        }, challenges[0]);
        const td = source.tournament_data;
        if (!td?.regions || !td?.teams || !td?.slots) continue;

        // Upsert tournament row
        const tourney = await client.query(
          `INSERT INTO tournaments (season, regions, status, created_at)
           VALUES ($1, $2, 'in_progress', NOW())
           ON CONFLICT (season) DO UPDATE SET regions = EXCLUDED.regions
           RETURNING id`,
          [parseInt(season), JSON.stringify(td.regions)]
        );
        const tournamentId = tourney.rows[0].id;

        // Insert teams
        for (const [teamId, team] of Object.entries(td.teams)) {
          // Determine region_index from slot position
          let regionIdx = 0;
          for (const [slotKey, slot] of Object.entries(td.slots)) {
            const s = parseInt(slotKey);
            if (s >= 1 && s <= 32) {
              if (String(slot.team1?.id) === String(teamId) || String(slot.team2?.id) === String(teamId)) {
                regionIdx = Math.floor((s - 1) / 8);
                break;
              }
            }
          }
          await client.query(
            `INSERT INTO tournament_teams (tournament_id, espn_team_id, name, abbreviation, short_name, logo, color, seed, region_index, record, is_first_four)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
             ON CONFLICT (tournament_id, espn_team_id) DO NOTHING`,
            [tournamentId, String(teamId), team.name || '', team.abbreviation || '', team.shortName || '', team.logo || '', team.color || '', team.seed || 0, regionIdx, team.record || '', team.isFirstFour || false]
          );
        }

        // Insert games from slots
        for (const [slotKey, slot] of Object.entries(td.slots)) {
          const slotNum = parseInt(slotKey);
          if (isNaN(slotNum)) continue;
          const round = slotNum <= 32 ? 0 : slotNum <= 48 ? 1 : slotNum <= 56 ? 2 : slotNum <= 60 ? 3 : slotNum <= 62 ? 4 : 5;
          let regionIdx = null;
          if (round <= 3) {
            const rb = round === 0 ? { start: 1, gpr: 8 } : round === 1 ? { start: 33, gpr: 4 } : round === 2 ? { start: 49, gpr: 2 } : { start: 57, gpr: 1 };
            regionIdx = Math.floor((slotNum - rb.start) / rb.gpr);
          }

          // Check bracket_results for this challenge/slot to get winner data
          const result = await client.query(
            `SELECT winning_team_id, losing_team_id, winning_score, losing_score, status, completed_at
             FROM bracket_results WHERE challenge_id = $1 AND slot_number = $2`,
            [source.id, slotNum]
          );
          const br = result.rows[0];

          await client.query(
            `INSERT INTO tournament_games (tournament_id, slot_number, round, region_index, espn_event_id, team1_espn_id, team2_espn_id, status, winning_team_espn_id, losing_team_espn_id, team1_score, team2_score, start_time, venue, broadcast, completed_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
             ON CONFLICT (tournament_id, slot_number) WHERE slot_number IS NOT NULL DO UPDATE SET
               team1_espn_id = EXCLUDED.team1_espn_id, team2_espn_id = EXCLUDED.team2_espn_id,
               espn_event_id = EXCLUDED.espn_event_id, status = EXCLUDED.status,
               winning_team_espn_id = EXCLUDED.winning_team_espn_id, losing_team_espn_id = EXCLUDED.losing_team_espn_id,
               team1_score = EXCLUDED.team1_score, team2_score = EXCLUDED.team2_score`,
            [tournamentId, slotNum, round, regionIdx, slot.espnEventId || null,
             slot.team1?.id ? String(slot.team1.id) : null, slot.team2?.id ? String(slot.team2.id) : null,
             br?.status || (slot.status === 'STATUS_FINAL' ? 'final' : slot.status === 'STATUS_IN_PROGRESS' ? 'in_progress' : 'pending'),
             br?.winning_team_id || null, br?.losing_team_id || null,
             br ? br.winning_score : null, br ? br.losing_score : null,
             slot.startDate || null, slot.venue || null, slot.broadcast || null,
             br?.completed_at || null]
          );
        }

        // Insert First Four games from events
        let ffIndex = 0;
        for (const [eventId, event] of Object.entries(td.events || {})) {
          if (event.round === -1) {
            const regionIdx = td.regions.indexOf(event.region);
            await client.query(
              `INSERT INTO tournament_games (tournament_id, first_four_index, round, region_index, espn_event_id, team1_espn_id, team2_espn_id, status, start_time, venue, broadcast)
               VALUES ($1, $2, -1, $3, $4, $5, $6, $7, $8, $9, $10)
               ON CONFLICT (tournament_id, first_four_index) WHERE first_four_index IS NOT NULL DO NOTHING`,
              [tournamentId, ffIndex, regionIdx >= 0 ? regionIdx : null, eventId,
               event.team1?.id ? String(event.team1.id) : null, event.team2?.id ? String(event.team2.id) : null,
               event.status === 'STATUS_FINAL' ? 'final' : event.status === 'STATUS_IN_PROGRESS' ? 'in_progress' : 'pending',
               event.startDate || null, event.venue || null, event.broadcast || null]
            );
            ffIndex++;
          }
        }

        // Link all challenges for this season to the tournament
        for (const c of challenges) {
          await client.query(
            'UPDATE bracket_challenges SET tournament_id = $1 WHERE id = $2',
            [tournamentId, c.id]
          );
        }
        console.log(`[Migration] Season ${season}: created tournament ${tournamentId} with ${Object.keys(td.teams).length} teams, ${Object.keys(td.slots).length} games`);
      }
    }

    console.log('✅ Supabase database initialized successfully');
  } catch (error) {
    console.error('Database initialization error:', error);
    throw error;
  } finally {
    client.release();
  }
}

// Database wrapper with similar API to previous SQLite wrapper
const db = {
  query: async (text, params) => {
    const result = await pool.query(text, params);
    return result;
  },
  
  // Helper for single row queries
  async getOne(text, params) {
    const result = await pool.query(text, params);
    return result.rows[0];
  },
  
  // Helper for multiple rows
  async getAll(text, params) {
    const result = await pool.query(text, params);
    return result.rows;
  },
  
  // Helper for insert/update/delete
  async run(text, params) {
    const result = await pool.query(text, params);
    return { rowCount: result.rowCount };
  }
};

module.exports = { initDb, db, pool };