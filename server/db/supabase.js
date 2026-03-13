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
        password_hash TEXT NOT NULL,
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
        total_score INTEGER NOT NULL DEFAULT 0,
        is_submitted BOOLEAN NOT NULL DEFAULT false,
        submitted_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(challenge_id, user_id, bracket_number)
      )
    `);

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

    // Create indexes for better performance
    // Add is_admin flag and last_login_at to users table
    await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT FALSE`);
    await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ`);

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