// Daily AI Recap Service
// Gathers tournament data and generates fun daily recaps via Claude API

const Anthropic = require('@anthropic-ai/sdk');
const { db } = require('../db/supabase');
const { calculateBracketScore, getSlotRound, getRegionForSlot, ROUND_BOUNDARIES, SEED_MATCHUPS } = require('../utils/bracket-slots');

/**
 * Gather all data needed to generate a daily recap.
 */
async function gatherRecapData(tournamentId, leagueId, recapDate) {
  // 1. Yesterday's completed games
  const games = await db.getAll(
    `SELECT tg.*,
            t1.name as team1_name, t1.seed as team1_seed, t1.logo as team1_logo, t1.color as team1_color, t1.abbreviation as team1_abbr,
            t2.name as team2_name, t2.seed as team2_seed, t2.logo as team2_logo, t2.color as team2_color, t2.abbreviation as team2_abbr
     FROM tournament_games tg
     LEFT JOIN tournament_teams t1 ON t1.tournament_id = tg.tournament_id AND t1.espn_team_id = tg.team1_espn_id
     LEFT JOIN tournament_teams t2 ON t2.tournament_id = tg.tournament_id AND t2.espn_team_id = tg.team2_espn_id
     WHERE tg.tournament_id = $1 AND tg.status = 'final'
       AND DATE(tg.completed_at AT TIME ZONE 'America/Los_Angeles') = $2
     ORDER BY tg.completed_at ASC`,
    [tournamentId, recapDate]
  );

  // Also try start_time if completed_at doesn't have results
  let allGames = games;
  if (games.length === 0) {
    allGames = await db.getAll(
      `SELECT tg.*,
              t1.name as team1_name, t1.seed as team1_seed, t1.logo as team1_logo, t1.color as team1_color, t1.abbreviation as team1_abbr,
              t2.name as team2_name, t2.seed as team2_seed, t2.logo as team2_logo, t2.color as team2_color, t2.abbreviation as team2_abbr
       FROM tournament_games tg
       LEFT JOIN tournament_teams t1 ON t1.tournament_id = tg.tournament_id AND t1.espn_team_id = tg.team1_espn_id
       LEFT JOIN tournament_teams t2 ON t2.tournament_id = tg.tournament_id AND t2.espn_team_id = tg.team2_espn_id
       WHERE tg.tournament_id = $1 AND tg.status = 'final'
         AND DATE(tg.start_time AT TIME ZONE 'America/Los_Angeles') = $2
       ORDER BY tg.start_time ASC`,
      [tournamentId, recapDate]
    );
  }

  // 2. Get the bracket challenge for this league/tournament
  const challenge = await db.getOne(
    `SELECT * FROM bracket_challenges WHERE league_id = $1 AND tournament_id = $2`,
    [leagueId, tournamentId]
  );

  // 3. All league brackets with picks + user info
  const brackets = challenge ? await db.getAll(
    `SELECT b.id, b.user_id, b.name, b.picks, b.total_score, b.is_submitted,
            u.display_name
     FROM brackets b
     JOIN users u ON b.user_id = u.id
     WHERE b.challenge_id = $1 AND b.is_submitted = true
     ORDER BY b.total_score DESC`,
    [challenge.id]
  ) : [];

  // 4. Build results map for scoring
  const allTournamentGames = await db.getAll(
    `SELECT slot_number, winning_team_espn_id as winning_team_id, losing_team_espn_id as losing_team_id, status
     FROM tournament_games WHERE tournament_id = $1 AND slot_number IS NOT NULL`,
    [tournamentId]
  );
  const resultsMap = {};
  for (const g of allTournamentGames) {
    resultsMap[g.slot_number] = g;
  }

  // 5. Calculate scores for each bracket
  const scoringSystem = challenge?.scoring_system || [1, 2, 4, 8, 16, 32];
  const memberScores = brackets.map(b => {
    const { totalScore, correctPicks, roundScores } = calculateBracketScore(b.picks || {}, resultsMap, scoringSystem);
    return {
      displayName: b.display_name,
      bracketName: b.name,
      totalScore,
      correctPicks,
      roundScores,
      picks: b.picks || {},
    };
  }).sort((a, b) => b.totalScore - a.totalScore);

  // 6. Analyze picks for yesterday's games
  const gameSlots = allGames.filter(g => g.slot_number).map(g => g.slot_number);
  const memberPickAnalysis = memberScores.map(m => {
    let correct = 0;
    let incorrect = 0;
    const correctPicks = [];
    const incorrectPicks = [];
    for (const game of allGames) {
      if (!game.slot_number) continue;
      const pick = m.picks[game.slot_number] || m.picks[String(game.slot_number)];
      if (!pick) continue;
      if (String(pick) === String(game.winning_team_espn_id)) {
        correct++;
        correctPicks.push({ team: game.winning_team_espn_id === game.team1_espn_id ? game.team1_name : game.team2_name, seed: game.winning_team_espn_id === game.team1_espn_id ? game.team1_seed : game.team2_seed });
      } else {
        incorrect++;
        const pickedTeam = String(pick) === String(game.team1_espn_id) ? game.team1_name : game.team2_name;
        incorrectPicks.push({ picked: pickedTeam, winner: game.winning_team_espn_id === game.team1_espn_id ? game.team1_name : game.team2_name });
      }
    }
    return { ...m, dailyCorrect: correct, dailyIncorrect: incorrect, correctPicks, incorrectPicks };
  });

  // 7. NBA draft prospects on teams that played
  const teamIds = [...new Set(allGames.flatMap(g => [g.team1_espn_id, g.team2_espn_id].filter(Boolean)))];
  let prospects = [];
  if (teamIds.length > 0) {
    // Get tournament teams for matching (team names are like "Duke Blue Devils", prospect schools are like "Duke")
    const teams = await db.getAll(
      `SELECT espn_team_id, name FROM tournament_teams WHERE tournament_id = $1 AND espn_team_id = ANY($2)`,
      [tournamentId, teamIds]
    );
    if (teams.length > 0) {
      // Match prospects by checking if team name starts with prospect school name
      prospects = await db.getAll(
        `SELECT dp.name, dp.school, dp.position, dp.rank, dp.headshot_url, tt.espn_team_id
         FROM draft_prospects dp
         JOIN tournament_teams tt ON tt.tournament_id = $2 AND tt.espn_team_id = ANY($3)
           AND tt.name ILIKE dp.school || '%'
         WHERE dp.sport = 'nba' AND dp.draft_year = $1
         ORDER BY dp.rank ASC`,
        [new Date().getFullYear(), tournamentId, teamIds]
      );
    }
  }

  // 8. Today's scheduled games (next day after recap)
  const nextDate = new Date(recapDate + 'T12:00:00');
  nextDate.setDate(nextDate.getDate() + 1);
  const nextDateStr = nextDate.toISOString().split('T')[0];

  const todaysGames = await db.getAll(
    `SELECT tg.*,
            t1.name as team1_name, t1.seed as team1_seed, t1.logo as team1_logo,
            t2.name as team2_name, t2.seed as team2_seed, t2.logo as team2_logo
     FROM tournament_games tg
     LEFT JOIN tournament_teams t1 ON t1.tournament_id = tg.tournament_id AND t1.espn_team_id = tg.team1_espn_id
     LEFT JOIN tournament_teams t2 ON t2.tournament_id = tg.tournament_id AND t2.espn_team_id = tg.team2_espn_id
     WHERE tg.tournament_id = $1 AND tg.status != 'final'
       AND DATE(tg.start_time AT TIME ZONE 'America/Los_Angeles') = $2
     ORDER BY tg.start_time ASC`,
    [tournamentId, nextDateStr]
  );

  // 9. Member picks for today's upcoming games (contrarian/surprising picks)
  const todaySlots = todaysGames.filter(g => g.slot_number).map(g => g.slot_number);
  const todayPickAnalysis = [];
  if (todaySlots.length > 0 && memberScores.length > 0) {
    for (const game of todaysGames) {
      if (!game.slot_number) continue;
      const pickCounts = {};
      for (const m of memberScores) {
        const pick = m.picks[game.slot_number] || m.picks[String(game.slot_number)];
        if (pick) {
          pickCounts[String(pick)] = (pickCounts[String(pick)] || 0) + 1;
        }
      }
      const total = Object.values(pickCounts).reduce((a, b) => a + b, 0);
      todayPickAnalysis.push({
        game: `(${game.team1_seed}) ${game.team1_name} vs (${game.team2_seed}) ${game.team2_name}`,
        slot: game.slot_number,
        pickDistribution: Object.entries(pickCounts).map(([teamId, count]) => {
          const name = String(teamId) === String(game.team1_espn_id) ? game.team1_name : game.team2_name;
          const seed = String(teamId) === String(game.team1_espn_id) ? game.team1_seed : game.team2_seed;
          return { teamId, name, seed, count, pct: total > 0 ? Math.round(count / total * 100) : 0 };
        }),
      });
    }
  }

  // 10. Prospects for today's games
  const todayTeamIds = [...new Set(todaysGames.flatMap(g => [g.team1_espn_id, g.team2_espn_id].filter(Boolean)))];
  let todayProspects = [];
  if (todayTeamIds.length > 0) {
    todayProspects = await db.getAll(
      `SELECT dp.name, dp.school, dp.position, dp.rank, dp.headshot_url, tt.espn_team_id
       FROM draft_prospects dp
       JOIN tournament_teams tt ON tt.tournament_id = $2 AND tt.espn_team_id = ANY($3)
         AND tt.name ILIKE dp.school || '%'
       WHERE dp.sport = 'nba' AND dp.draft_year = $1
       ORDER BY dp.rank ASC`,
      [new Date().getFullYear(), tournamentId, todayTeamIds]
    );
  }

  // 11. Get tournament regions for round context
  const tournament = await db.getOne('SELECT regions FROM tournaments WHERE id = $1', [tournamentId]);

  return {
    recapDate,
    games: allGames,
    memberScores: memberPickAnalysis,
    prospects,
    todaysGames,
    todayPickAnalysis,
    todayProspects,
    regions: tournament?.regions || [],
    scoringSystem,
  };
}

/**
 * Generate a recap using Claude API.
 */
async function generateRecap(data) {
  const dotenvResult = require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
  const apiKey = dotenvResult.parsed?.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not configured');

  const client = new Anthropic({ apiKey });

  // Build the data summary for the prompt
  const gamesSummary = data.games.map(g => {
    const winner = g.winning_team_espn_id === g.team1_espn_id;
    const winnerName = winner ? g.team1_name : g.team2_name;
    const winnerSeed = winner ? g.team1_seed : g.team2_seed;
    const loserName = winner ? g.team2_name : g.team1_name;
    const loserSeed = winner ? g.team2_seed : g.team1_seed;
    const winScore = winner ? g.team1_score : g.team2_score;
    const loseScore = winner ? g.team2_score : g.team1_score;
    const margin = winScore - loseScore;
    const isUpset = winnerSeed > loserSeed;
    const isBlowout = margin >= 15;
    const round = g.slot_number ? getSlotRound(g.slot_number) : g.round;
    const roundName = ROUND_BOUNDARIES[round]?.name || `Round ${round}`;
    return `${roundName}: (${winnerSeed}) ${winnerName} ${winScore} - (${loserSeed}) ${loserName} ${loseScore} [margin: ${margin}${isUpset ? ', UPSET' : ''}${isBlowout ? ', BLOWOUT' : ''}]`;
  }).join('\n');

  // Build leaderboard with proper tie handling
  const top10 = data.memberScores.slice(0, 10);
  const leaderboardSummary = top10.map((m, i) => {
    // Calculate rank with ties (same score = same rank)
    let rank = 1;
    for (let j = 0; j < i; j++) {
      if (top10[j].totalScore > m.totalScore) rank = j + 1;
    }
    if (i > 0 && top10[i - 1].totalScore === m.totalScore) {
      // Find the rank of the first person with this score
      rank = top10.findIndex(x => x.totalScore === m.totalScore) + 1;
    }
    // Check if this rank is a tie
    const countAtScore = top10.filter(x => x.totalScore === m.totalScore).length;
    const prefix = countAtScore > 1 ? `T-${rank}` : `${rank}`;
    return `${prefix}. ${m.displayName}${m.bracketName ? ` (${m.bracketName})` : ''} — ${m.totalScore} pts, ${m.correctPicks} correct | Today: ${m.dailyCorrect}/${m.dailyCorrect + m.dailyIncorrect} correct`;
  }).join('\n');

  const memberHighlights = data.memberScores.map(m => {
    const boldPicks = m.correctPicks.filter(p => p.seed >= 8).map(p => `(${p.seed}) ${p.team}`);
    return `${m.displayName}: ${m.dailyCorrect}/${m.dailyCorrect + m.dailyIncorrect} correct${boldPicks.length > 0 ? ` | Bold correct: ${boldPicks.join(', ')}` : ''}`;
  }).join('\n');

  const prospectsSummary = data.prospects.map(p =>
    `#${p.rank} ${p.name} (${p.school}, ${p.position})`
  ).join('\n');

  const todayGamesSummary = data.todaysGames.map(g =>
    `(${g.team1_seed}) ${g.team1_name} vs (${g.team2_seed}) ${g.team2_name}${g.start_time ? ` @ ${new Date(g.start_time).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/Los_Angeles' })} PT` : ''}`
  ).join('\n');

  const todayPicksSummary = data.todayPickAnalysis.map(g =>
    `${g.game}: ${g.pickDistribution.map(d => `${d.name} (${d.seed} seed) — ${d.pct}%`).join(' vs ')}`
  ).join('\n');

  const todayProspectsSummary = data.todayProspects.map(p =>
    `#${p.rank} ${p.name} (${p.school}, ${p.position})`
  ).join('\n');

  const prompt = `You're writing a daily recap for a March Madness bracket challenge group chat. Write like a normal person — straightforward, casual, informative. NO emojis anywhere. Do NOT use hype language like "went nuclear", "absolutely crushed it", "rest of you scrubs", "let's gooo", etc. Just state what happened plainly with a little personality.

DATA FOR ${data.recapDate}:

YESTERDAY'S RESULTS:
${gamesSummary || 'No games completed'}

LEADERBOARD (top 10):
${leaderboardSummary || 'No brackets submitted yet'}

MEMBER PERFORMANCE:
${memberHighlights || 'No member data'}
${data.prospects.length > 0 ? `\nNBA PROSPECTS WHO PLAYED:\n${prospectsSummary}` : ''}
${data.todaysGames.length > 0 ? `\nTODAY'S GAMES:\n${todayGamesSummary}\n\nMEMBER PICKS FOR TODAY:\n${todayPicksSummary || 'No data'}${data.todayProspects.length > 0 ? `\n\nPROSPECTS PLAYING TODAY:\n${todayProspectsSummary}` : ''}` : ''}

Generate FOUR sections separated by ===SEPARATOR===

FORMATTING RULES (apply to all sections):
- Use markdown headers (## and ###) to organize content into readable sections
- Use **bold** for member names, team names, and key stats
- Use horizontal rules (---) to separate distinct topics
- Use > blockquotes for standout stats or notable callouts
- Use bullet lists when listing multiple items (game results, picks, etc.)
- NO emojis anywhere
- Write casually like a friend, not a sports bot

SECTION 1 (TLDR for chat): 2-3 casual, SHORT sentences for the group chat. Lead with who's winning/losing, mention big upsets, tease today. Write it like a normal text message — no hype words, no trying to sound cool, no "scrubs", no "nuclear", no "let's go". Just say what happened. No headers needed here.

SECTION 2 (MEMBERS TAB): This tab is ONLY about the members — their picks, their standings, their wins and losses. Do NOT include game recaps, game summaries, or NBA prospect watch sections here. Those belong in the Games tab.

Start with a ## header for the leaderboard standings. Show the current standings as a numbered list with ONE MEMBER PER LINE. Each member MUST be on its own separate line. IMPORTANT: If multiple members have the same score, they are TIED — show them with the same rank number (e.g. "T-1." for a tie at #1). Do NOT give different rank numbers to members with the same score. Then use ### headers per member (or group of members) to break up the analysis. For each member, talk about their record, which picks hit, bold calls, painful misses. Frame everything from the member's perspective — "PlayerA nailed the #12 upset pick" not "Team X pulled the upset."

Example structure (EACH MEMBER ON ITS OWN LINE):
## Current Standings
1. **PlayerA** — 10 pts (8/13 yesterday)
2. **PlayerB** — 8 pts (7/13 yesterday)
3. **PlayerC** — 7 pts (6/13 yesterday)
T-4. **PlayerD** — 5 pts (5/13 yesterday)
T-4. **PlayerE** — 5 pts (4/13 yesterday)

NEVER put multiple members on the same line. Each member gets its own numbered line.

### PlayerA is Rolling
Paragraph about their picks and results...

### PlayerB Needs a Miracle
Paragraph about their struggles and busted picks...

Keep it fun, 4-6 sections with headers. NO game recap paragraphs, NO "Yesterday's Action" sections, NO NBA Prospect Watch sections. Save all of that for the Games tab.

SECTION 3 (GAMES TAB): This is the tab for recapping yesterday's actual games. All game results, highlights, upsets, blowouts, and NBA prospect performances go HERE (not in the Members tab).

Use ### headers for categories like upsets, close games, blowouts, prospect watch. Don't recap every game — focus on the interesting ones. Use bullet points for quick game results. For the notable games, write a short paragraph.

Example structure:
### The Upsets
Paragraph about the big upsets...

### Games Worth Talking About
- **(12) Team A 83, (5) Team B 82** — what happened
- **(11) Team C 66, (6) Team D 64** — context

### Chalk City
Quick summary of expected results.

${data.prospects.length > 0 ? `### NBA Prospect Watch
Dedicate a full section to NBA prospects who played yesterday. For each notable prospect, mention their projected draft position (e.g. "projected #1 pick"), their school, position, and how they performed. Call out prospects who showed out AND ones who disappeared. This section is important — fans care about future NBA talent.` : ''}

SECTION 4 (TODAY TAB):${data.todaysGames.length > 0 ? ` Preview of today's slate.

Use ### headers to break it up. Write 3-5 paragraphs of analysis/preview.

CRITICAL: Do NOT include a game schedule, game list, or full schedule section. The app renders game cards automatically. Only write the conversational preview/analysis paragraphs — no bullet-point game lists.

Required ### sections (use these headers):
- ### Games to Watch — talk about the most interesting matchups and why they matter
- ### Where the Group is Split — highlight games where members have contrarian or split picks
${data.todayProspects.length > 0 ? `- ### NBA Prospect Watch — REQUIRED section. List every notable NBA prospect playing today with their projected draft position, school, and position. Use a bullet list. This is a key section fans care about.
  Prospects playing today: ${data.todayProspects.map(p => `#${p.rank} ${p.name} (${p.school}, ${p.position})`).join(', ')}` : ''}` : ' Write "No games on the schedule today." and nothing else.'}

IMPORTANT:
- Use markdown formatting generously — headers, bold, bullet lists, blockquotes, horizontal rules. The content will be rendered with styled markdown so take advantage of it.
- ALWAYS include the seed number with every team mention, like "#1 Duke", "#12 High Point", "#5 Wisconsin". Never just say "Duke" — always "#1 Duke". This applies everywhere in all sections.
- When mentioning NBA prospects, ALWAYS include their projected draft rank like "projected #3 pick **AJ Dybantsa**" or "#1 overall prospect **Cameron Boozer**". Weave prospect mentions naturally into game recaps, not just in a separate section.
- Keep the TONE casual and fun.

CRITICAL SECTION BOUNDARIES — READ THIS CAREFULLY:
- SECTION 2 (MEMBERS) must NEVER contain headers like "Yesterday's Action", "Yesterday's Chaos", "NBA Prospect Watch", "Key Players", game score recaps, or any content that belongs in the Games tab. If you catch yourself writing about game results as standalone sections in Section 2, STOP and move that content to Section 3 instead. Section 2 is ONLY about member picks and standings.
- SECTION 3 (GAMES) is the ONLY place for game recaps, scores, and prospect performance reviews.
- SECTION 4 (TODAY) is the ONLY place for today's preview and prospect watch for upcoming games.`;

  const message = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 3072,
    messages: [{ role: 'user', content: prompt }],
  });

  const fullResponse = message.content?.[0]?.text || '';
  const parts = fullResponse.split('===SEPARATOR===');
  const tldr = (parts[0] || '').trim().replace(/^#+\s*(TL;?DR:?\s*)/i, '');
  const membersTab = (parts[1] || '').trim();
  const gamesTab = (parts[2] || '').trim();
  const todayTab = (parts[3] || '').trim();
  // Combine for full_recap (backwards compat)
  const fullRecap = [membersTab, gamesTab, todayTab].filter(Boolean).join('\n\n---\n\n');

  return { tldr, fullRecap, membersTab, gamesTab, todayTab };
}

/**
 * Generate and store a daily recap.
 */
async function generateAndStoreRecap(tournamentId, leagueId, recapDate) {
  const data = await gatherRecapData(tournamentId, leagueId, recapDate);

  if (data.games.length === 0) {
    throw new Error(`No completed games found for ${recapDate}`);
  }

  const { tldr, fullRecap, membersTab, gamesTab, todayTab } = await generateRecap(data);

  // Upsert into daily_recaps
  const result = await db.getOne(
    `INSERT INTO daily_recaps (league_id, tournament_id, recap_date, tldr, full_recap, metadata)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (league_id, tournament_id, recap_date) DO UPDATE SET
       tldr = EXCLUDED.tldr, full_recap = EXCLUDED.full_recap,
       metadata = EXCLUDED.metadata, updated_at = NOW()
     RETURNING *`,
    [leagueId, tournamentId, recapDate, tldr, fullRecap, JSON.stringify({
      gamesCount: data.games.length,
      membersCount: data.memberScores.length,
      prospectsCount: data.prospects.length,
      membersTab,
      gamesTab,
      todayTab,
      // Raw data for frontend game cards
      todayGames: data.todaysGames.map(g => ({
        slot: g.slot_number,
        team1: { name: g.team1_name, seed: g.team1_seed, logo: g.team1_logo, espnId: g.team1_espn_id },
        team2: { name: g.team2_name, seed: g.team2_seed, logo: g.team2_logo, espnId: g.team2_espn_id },
        startTime: g.start_time,
        region: g.slot_number ? getRegionForSlot(g.slot_number, data.regions) : null,
      })),
      todayPicks: data.todayPickAnalysis,
      // Prospect data for frontend badges
      prospects: data.prospects.map(p => ({
        name: p.name, school: p.school, position: p.position,
        rank: p.rank, headshot: p.headshot_url, teamEspnId: p.espn_team_id,
      })),
      todayProspects: data.todayProspects.map(p => ({
        name: p.name, school: p.school, position: p.position,
        rank: p.rank, headshot: p.headshot_url, teamEspnId: p.espn_team_id,
      })),
    })]
  );

  return result;
}

module.exports = {
  gatherRecapData,
  generateRecap,
  generateAndStoreRecap,
};
