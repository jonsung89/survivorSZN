#!/usr/bin/env node

/**
 * Seed script: Create 46 bot users, join them to a league, and generate brackets.
 *
 * Usage: node server/scripts/seed-bot-users.js
 *
 * Requires .env in the project root with Supabase DB credentials.
 */

require('dotenv').config();
const { Pool } = require('pg');
const crypto = require('crypto');

const LEAGUE_ID = 'f60503a9-5636-40b7-a5df-6991d6c89df4';
const NUM_BOTS = 46;

const pool = new Pool({
  host: process.env.SUPABASE_DB_HOST,
  port: parseInt(process.env.SUPABASE_DB_PORT || '5432'),
  database: process.env.SUPABASE_DB_NAME || 'postgres',
  user: process.env.SUPABASE_DB_USER,
  password: process.env.SUPABASE_DB_PASSWORD,
  ssl: { rejectUnauthorized: false },
});

// ─── Bot User Definitions ────────────────────────────────────────────────────

const BOT_USERS = [
  // Normal first+last names
  { firstName: 'James', lastName: 'Miller', displayName: 'James Miller' },
  { firstName: 'Sarah', lastName: 'Johnson', displayName: 'Sarah Johnson' },
  { firstName: 'Michael', lastName: 'Williams', displayName: 'Michael Williams' },
  { firstName: 'Emily', lastName: 'Brown', displayName: 'Emily Brown' },
  { firstName: 'David', lastName: 'Garcia', displayName: 'David Garcia' },
  { firstName: 'Jessica', lastName: 'Martinez', displayName: 'Jessica Martinez' },
  { firstName: 'Chris', lastName: 'Anderson', displayName: 'Chris Anderson' },
  { firstName: 'Ashley', lastName: 'Thomas', displayName: 'Ashley Thomas' },
  { firstName: 'Ryan', lastName: 'Jackson', displayName: 'Ryan Jackson' },
  { firstName: 'Lauren', lastName: 'White', displayName: 'Lauren White' },
  { firstName: 'Brandon', lastName: 'Harris', displayName: 'Brandon Harris' },
  { firstName: 'Nicole', lastName: 'Clark', displayName: 'Nicole Clark' },

  // First name + last initial or abbreviated
  { firstName: 'Matt', lastName: 'Thompson', displayName: 'Matt T' },
  { firstName: 'Jen', lastName: 'Robinson', displayName: 'Jen R' },
  { firstName: 'Tyler', lastName: 'Lewis', displayName: 'Tyler L' },
  { firstName: 'Katie', lastName: 'Walker', displayName: 'Katie W' },
  { firstName: 'Alex', lastName: 'Young', displayName: 'Alex Y' },

  // First + last + number combos
  { firstName: 'Jake', lastName: 'Moore', displayName: 'JakeMoore23' },
  { firstName: 'Megan', lastName: 'Taylor', displayName: 'MeganT99' },
  { firstName: 'Kevin', lastName: 'Lee', displayName: 'KevinLee44' },
  { firstName: 'Amanda', lastName: 'Hall', displayName: 'AmandaH12' },
  { firstName: 'Brian', lastName: 'Allen', displayName: 'BrianAllen7' },
  { firstName: 'Rachel', lastName: 'King', displayName: 'RachelK88' },
  { firstName: 'Derek', lastName: 'Wright', displayName: 'DerekW2026' },
  { firstName: 'Tiffany', lastName: 'Scott', displayName: 'TiffanyS03' },

  // Random/fun display names
  { firstName: 'Marcus', lastName: 'Green', displayName: 'BracketBuster' },
  { firstName: 'Danielle', lastName: 'Adams', displayName: 'MadnessQueen' },
  { firstName: 'Trevor', lastName: 'Nelson', displayName: 'CinderellaFan' },
  { firstName: 'Samantha', lastName: 'Carter', displayName: 'UpsetCity' },
  { firstName: 'Patrick', lastName: 'Mitchell', displayName: 'ChalkWalk' },
  { firstName: 'Vanessa', lastName: 'Perez', displayName: 'DunkOnEm' },
  { firstName: 'Corey', lastName: 'Roberts', displayName: 'MarchMadLad' },
  { firstName: 'Heather', lastName: 'Turner', displayName: 'BuzzerBeater' },
  { firstName: 'Dustin', lastName: 'Phillips', displayName: 'SeedSlayer' },
  { firstName: 'Lindsey', lastName: 'Campbell', displayName: 'FinalFourOrBust' },
  { firstName: 'Jordan', lastName: 'Parker', displayName: 'HoopsGuru' },
  { firstName: 'Brittany', lastName: 'Evans', displayName: 'NetCutter' },
  { firstName: 'Shane', lastName: 'Edwards', displayName: 'FullCourtPress' },
  { firstName: 'Christina', lastName: 'Collins', displayName: 'BracketNerd42' },
  { firstName: 'Victor', lastName: 'Stewart', displayName: 'SwishKing' },
  { firstName: 'Natalie', lastName: 'Sanchez', displayName: 'MarchQueenN' },
  { firstName: 'Chad', lastName: 'Morris', displayName: 'ThreePtSniper' },

  // More random names
  { firstName: 'Tony', lastName: 'Rogers', displayName: 'tony_buckets' },
  { firstName: 'Melissa', lastName: 'Reed', displayName: 'mel_picks' },
  { firstName: 'Zach', lastName: 'Cook', displayName: 'ZachAttack' },
  { firstName: 'Diana', lastName: 'Morgan', displayName: 'DiMo_hoops' },
];

// ─── Bracket Generation Logic ────────────────────────────────────────────────

// Seed matchups for R64 (per region): 1v16, 8v9, 5v12, 4v13, 6v11, 3v14, 7v10, 2v15
const SEED_MATCHUPS = [
  [1, 16], [8, 9], [5, 12], [4, 13], [6, 11], [3, 14], [7, 10], [2, 15],
];

/**
 * Generate a bracket's picks based on tournament data.
 * upsetFactor: 0 = all chalk, 1 = lots of upsets
 */
function generateBracketPicks(tournamentData, upsetFactor = 0.15) {
  const { slots, teams } = tournamentData;
  const picks = {};

  // Helper: get team from a slot
  function getTeamFromSlot(slotNum) {
    const slot = slots[slotNum] || slots[String(slotNum)];
    if (!slot) return null;
    return { team1: slot.team1, team2: slot.team2 };
  }

  // Helper: decide winner based on seeds with upset probability
  function pickWinner(team1, team2, round) {
    if (!team1 || !team2) return team1 || team2;

    const seed1 = team1.seed || 8;
    const seed2 = team2.seed || 8;

    // Higher seed (lower number) is favored
    const favored = seed1 <= seed2 ? team1 : team2;
    const underdog = seed1 <= seed2 ? team2 : team1;
    const seedDiff = Math.abs(seed1 - seed2);

    // Upset probability increases with upsetFactor, decreases with seed difference
    // In later rounds, upsets are slightly less likely (better teams advanced)
    let upsetProb = upsetFactor;

    // Big seed gaps = less likely upset
    if (seedDiff >= 8) upsetProb *= 0.3;
    else if (seedDiff >= 5) upsetProb *= 0.5;
    else if (seedDiff >= 3) upsetProb *= 0.7;
    else if (seedDiff <= 1) upsetProb *= 1.3; // Close matchups more likely to go either way

    // Later rounds slightly more chalky
    upsetProb *= Math.max(0.5, 1 - round * 0.08);

    return Math.random() < upsetProb ? underdog : favored;
  }

  // Round 0: R64 (slots 1-32) — pick from tournament_data slots
  for (let slot = 1; slot <= 32; slot++) {
    const matchup = getTeamFromSlot(slot);
    if (!matchup || !matchup.team1 || !matchup.team2) continue;

    const winner = pickWinner(matchup.team1, matchup.team2, 0);
    picks[String(slot)] = winner.id;
  }

  // Subsequent rounds: derive from previous picks
  const roundRanges = [
    { start: 33, end: 48, prevStart: 1 },   // R32
    { start: 49, end: 56, prevStart: 33 },  // S16
    { start: 57, end: 60, prevStart: 49 },  // E8
    { start: 61, end: 62, prevStart: 57 },  // FF
    { start: 63, end: 63, prevStart: 61 },  // Championship
  ];

  for (let roundIdx = 0; roundIdx < roundRanges.length; roundIdx++) {
    const { start, end, prevStart } = roundRanges[roundIdx];
    const round = roundIdx + 1;

    for (let slot = start; slot <= end; slot++) {
      const offset = slot - start;
      const child1 = prevStart + offset * 2;
      const child2 = prevStart + offset * 2 + 1;

      const team1Id = picks[String(child1)];
      const team2Id = picks[String(child2)];

      if (!team1Id || !team2Id) continue;

      const team1 = teams[team1Id];
      const team2 = teams[team2Id];

      if (!team1 || !team2) continue;

      const winner = pickWinner(team1, team2, round);
      picks[String(slot)] = winner.id;
    }
  }

  return picks;
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const client = await pool.connect();

  try {
    console.log('Starting bot user seed...\n');

    // Ensure is_bot column exists
    await client.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS is_bot BOOLEAN DEFAULT FALSE');

    // Verify the league exists
    const league = await client.query('SELECT * FROM leagues WHERE id = $1', [LEAGUE_ID]);
    if (league.rows.length === 0) {
      throw new Error(`League ${LEAGUE_ID} not found`);
    }
    console.log(`Found league: ${league.rows[0].name}`);

    // Find the bracket challenge for this league
    const challengeResult = await client.query(
      'SELECT * FROM bracket_challenges WHERE league_id = $1 ORDER BY season DESC LIMIT 1',
      [LEAGUE_ID]
    );
    if (challengeResult.rows.length === 0) {
      throw new Error(`No bracket challenge found for league ${LEAGUE_ID}`);
    }
    const challenge = challengeResult.rows[0];
    console.log(`Found bracket challenge: ${challenge.id} (season ${challenge.season}, status: ${challenge.status})`);

    const tournamentData = challenge.tournament_data;
    const teamCount = Object.keys(tournamentData?.teams || {}).length;
    const slotCount = Object.keys(tournamentData?.slots || {}).length;
    console.log(`Tournament data: ${teamCount} teams, ${slotCount} R64 slots\n`);

    if (teamCount < 64 || slotCount < 32) {
      throw new Error('Tournament data incomplete — need 64 teams and 32 R64 slots');
    }

    // Create bot users and join them to the league
    let created = 0;
    let joined = 0;
    let bracketsCreated = 0;

    for (let i = 0; i < NUM_BOTS; i++) {
      const bot = BOT_USERS[i];
      const firebaseUid = `bot-${crypto.randomUUID()}`;

      // Insert user
      const userResult = await client.query(
        `INSERT INTO users (firebase_uid, display_name, first_name, last_name, is_bot, onboarding_complete, created_at, updated_at)
         VALUES ($1, $2, $3, $4, TRUE, TRUE, NOW(), NOW())
         RETURNING id`,
        [firebaseUid, bot.displayName, bot.firstName, bot.lastName]
      );
      const userId = userResult.rows[0].id;
      created++;

      // Join league
      await client.query(
        `INSERT INTO league_members (league_id, user_id, status, joined_at)
         VALUES ($1, $2, 'active', NOW())
         ON CONFLICT (league_id, user_id) DO NOTHING`,
        [LEAGUE_ID, userId]
      );
      joined++;

      // Generate bracket with varying upset factors
      // Most brackets: chalk-ish (0.08-0.20)
      // A few brackets: moderate upsets (0.25-0.35)
      // 2-3 brackets: upset-heavy (0.40-0.55)
      let upsetFactor;
      if (i < 20) {
        // Mostly chalk
        upsetFactor = 0.08 + Math.random() * 0.12; // 0.08-0.20
      } else if (i < 35) {
        // Slightly more upsets
        upsetFactor = 0.15 + Math.random() * 0.12; // 0.15-0.27
      } else if (i < 42) {
        // Moderate upsets
        upsetFactor = 0.25 + Math.random() * 0.10; // 0.25-0.35
      } else {
        // Upset-heavy brackets
        upsetFactor = 0.40 + Math.random() * 0.15; // 0.40-0.55
      }

      const picks = generateBracketPicks(tournamentData, upsetFactor);
      const pickCount = Object.keys(picks).length;

      // Generate a tiebreaker value (championship total score prediction: 120-170)
      const tiebreakerValue = 120 + Math.floor(Math.random() * 51);

      // Generate bracket name
      const bracketNames = [
        `${bot.firstName}'s Picks`, `${bot.displayName}`, `Bracket #1`,
        `${bot.firstName}'s Bracket`, `The ${bot.lastName} Special`,
        `${bot.displayName}'s Madness`, `March Picks`, null,
      ];
      const bracketName = bracketNames[Math.floor(Math.random() * bracketNames.length)];

      await client.query(
        `INSERT INTO brackets (challenge_id, user_id, bracket_number, name, picks, tiebreaker_value, is_submitted, submitted_at, created_at, updated_at)
         VALUES ($1, $2, 1, $3, $4, $5, TRUE, NOW(), NOW(), NOW())
         ON CONFLICT (challenge_id, user_id, bracket_number) DO NOTHING`,
        [challenge.id, userId, bracketName, JSON.stringify(picks), tiebreakerValue]
      );
      bracketsCreated++;

      const upsetLabel = upsetFactor < 0.15 ? 'chalk' : upsetFactor < 0.25 ? 'mild' : upsetFactor < 0.35 ? 'moderate' : 'upset-heavy';
      console.log(`  [${i + 1}/${NUM_BOTS}] ${bot.displayName.padEnd(20)} | ${pickCount} picks | upset: ${upsetLabel} (${upsetFactor.toFixed(2)}) | tb: ${tiebreakerValue}`);
    }

    console.log(`\nDone!`);
    console.log(`  Users created:   ${created}`);
    console.log(`  League joined:   ${joined}`);
    console.log(`  Brackets made:   ${bracketsCreated}`);

  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

main();
