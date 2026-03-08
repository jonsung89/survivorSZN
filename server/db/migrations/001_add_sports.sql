-- Migration 001: Add multi-sport support
-- Creates sports reference table and adds sport_id to leagues

-- Step 1: Create sports reference table
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
);

-- Step 2: Seed NFL sport
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
) ON CONFLICT (id) DO NOTHING;

-- Step 3: Add sport_id to leagues (safe — default covers existing data)
ALTER TABLE leagues ADD COLUMN IF NOT EXISTS sport_id TEXT NOT NULL DEFAULT 'nfl';
ALTER TABLE leagues ADD COLUMN IF NOT EXISTS sport_config JSONB DEFAULT '{}';
CREATE INDEX IF NOT EXISTS idx_leagues_sport ON leagues(sport_id);
