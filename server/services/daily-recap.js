// Daily AI Recap Service
// Gathers tournament data and generates fun daily recaps via Claude API

const Anthropic = require('@anthropic-ai/sdk');
const { db } = require('../db/supabase');
const { calculateBracketScore, getSlotRound, getRegionForSlot, ROUND_BOUNDARIES, SEED_MATCHUPS } = require('../utils/bracket-slots');
const ncaabProvider = require('./ncaab');

/**
 * Gather all data needed to generate a daily recap.
 */
async function gatherRecapData(tournamentId, leagueId, recapDate) {
  // 1. Yesterday's completed games — use start_time for date grouping since late games
  //    can finish after midnight PT but still belong to that day's slate
  const allGames = await db.getAll(
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

  // 4. Build results map for scoring — only include games that started on or before the recap date
  //    so standings reflect the state AT THE END of that day, not including later games
  const allTournamentGames = await db.getAll(
    `SELECT slot_number, winning_team_espn_id as winning_team_id, losing_team_espn_id as losing_team_id, status
     FROM tournament_games WHERE tournament_id = $1 AND slot_number IS NOT NULL AND status = 'final'
       AND DATE(start_time AT TIME ZONE 'America/Los_Angeles') <= $2`,
    [tournamentId, recapDate]
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
  const gamesWithSlots = allGames.filter(g => g.slot_number);
  const totalGamesForDay = gamesWithSlots.length;
  const memberPickAnalysis = memberScores.map(m => {
    let correct = 0;
    let incorrect = 0;
    const correctPicks = [];
    const incorrectPicks = [];
    for (const game of gamesWithSlots) {
      const pick = m.picks[game.slot_number] || m.picks[String(game.slot_number)];
      if (!pick) {
        // No pick = wrong — still counts against them
        incorrect++;
        incorrectPicks.push({ picked: '(no pick)', winner: game.winning_team_espn_id === game.team1_espn_id ? game.team1_name : game.team2_name });
        continue;
      }
      if (String(pick) === String(game.winning_team_espn_id)) {
        correct++;
        correctPicks.push({ team: game.winning_team_espn_id === game.team1_espn_id ? game.team1_name : game.team2_name, seed: game.winning_team_espn_id === game.team1_espn_id ? game.team1_seed : game.team2_seed });
      } else {
        incorrect++;
        // Check if the pick matches either team in this game — if not, their bracket was already busted
        // (they picked a team that was eliminated in an earlier round)
        let pickedTeam;
        if (String(pick) === String(game.team1_espn_id)) {
          pickedTeam = game.team1_name;
        } else if (String(pick) === String(game.team2_espn_id)) {
          pickedTeam = game.team2_name;
        } else {
          pickedTeam = '(bracket busted — picked a team eliminated earlier)';
        }
        incorrectPicks.push({ picked: pickedTeam, winner: game.winning_team_espn_id === game.team1_espn_id ? game.team1_name : game.team2_name });
      }
    }
    return { ...m, dailyCorrect: correct, dailyIncorrect: incorrect, totalGamesForDay, correctPicks, incorrectPicks };
  });

  // 7. NBA draft prospects on teams that played (with regular season stats)
  const teamIds = [...new Set(allGames.flatMap(g => [g.team1_espn_id, g.team2_espn_id].filter(Boolean)))];
  let prospects = [];
  if (teamIds.length > 0) {
    const teams = await db.getAll(
      `SELECT espn_team_id, name FROM tournament_teams WHERE tournament_id = $1 AND espn_team_id = ANY($2)`,
      [tournamentId, teamIds]
    );
    if (teams.length > 0) {
      prospects = await db.getAll(
        `SELECT dp.name, dp.school, dp.position, dp.rank, dp.headshot_url, dp.espn_id, dp.jersey,
                dp.espn_stats, dp.stats as tankathon_stats, tt.espn_team_id
         FROM draft_prospects dp
         JOIN tournament_teams tt ON tt.tournament_id = $2 AND tt.espn_team_id = ANY($3)
           AND tt.name ILIKE dp.school || '%'
         WHERE dp.sport = 'nba' AND dp.draft_year = $1
         ORDER BY dp.rank ASC`,
        [new Date().getFullYear(), tournamentId, teamIds]
      );
    }
  }

  // 7b. Fetch box scores for yesterday's games (key players + prospect game stats)
  const gameBoxScores = [];

  // Build a map of prospect ESPN IDs for quick lookup
  const prospectEspnIds = new Set(prospects.map(p => p.espn_id).filter(Boolean));

  for (const game of allGames) {
    if (!game.espn_event_id) continue;
    try {
      const details = await ncaabProvider.getGameDetails(game.espn_event_id, { cacheTtl: 300000 });
      if (!details?.playerStats?.teams) continue;

      const gameKeyPlayers = [];
      const prospectGameStats = [];

      for (const teamData of details.playerStats.teams) {
        const allPlayers = [...(teamData.starters || []), ...(teamData.bench || [])];
        for (const player of allPlayers) {
          if (!player.stats || !player.name) continue;
          // Parse stat columns (order matches ESPN: MIN, FG, 3PT, FT, OREB, DREB, REB, AST, STL, BLK, TO, PF, PTS)
          const cols = details.playerStats.columns || [];
          const statMap = {};
          cols.forEach((col, i) => { statMap[col] = player.stats[i]; });

          const pts = parseInt(statMap.PTS) || 0;
          const reb = parseInt(statMap.REB) || 0;
          const ast = parseInt(statMap.AST) || 0;
          const stl = parseInt(statMap.STL) || 0;
          const blk = parseInt(statMap.BLK) || 0;
          const to = parseInt(statMap.TO) || 0;
          const min = parseInt(statMap.MIN) || 0;

          const playerStat = {
            name: player.name,
            jersey: player.jersey,
            team: teamData.team?.abbreviation || teamData.team?.name || '',
            pts, reb, ast, stl, blk, to, min,
            fg: statMap.FG || '',
            threes: statMap['3PT'] || '',
            ft: statMap.FT || '',
            espnId: player.id,
          };

          // Check if this player is an NBA prospect
          if (player.id && prospectEspnIds.has(String(player.id))) {
            prospectGameStats.push(playerStat);
          }

          // Key player: 15+ pts, or 10+ reb, or 7+ ast, or double-double
          const categories = [pts >= 10 ? 1 : 0, reb >= 10 ? 1 : 0, ast >= 10 ? 1 : 0];
          const isDoubleDouble = categories.filter(c => c).length >= 2;
          if (pts >= 15 || reb >= 10 || ast >= 7 || isDoubleDouble || (stl + blk >= 5)) {
            gameKeyPlayers.push(playerStat);
          }
        }
      }

      // Sort key players by points descending
      gameKeyPlayers.sort((a, b) => b.pts - a.pts);

      gameBoxScores.push({
        espnGameId: game.espn_event_id,
        team1: game.team1_name,
        team2: game.team2_name,
        keyPlayers: gameKeyPlayers.slice(0, 6), // top 6 performers
        prospectStats: prospectGameStats,
      });
    } catch (err) {
      console.warn(`[Recap] Failed to fetch box score for game ${game.espn_event_id}:`, err.message);
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
    totalGames: totalGamesForDay,
    memberScores: memberPickAnalysis,
    prospects,
    gameBoxScores,
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
async function generateRecap(data, customPrompt) {
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
    return `${prefix}. ${m.displayName}${m.bracketName ? ` (${m.bracketName})` : ''} — ${m.totalScore} pts, ${m.correctPicks} correct | Yesterday: ${m.dailyCorrect}/${m.totalGamesForDay} correct`;
  }).join('\n');

  const memberHighlights = data.memberScores.map(m => {
    const boldPicks = m.correctPicks.filter(p => p.seed >= 8).map(p => `(${p.seed}) ${p.team}`);
    const wrongPicks = (m.incorrectPicks || []).map(p => `picked ${p.picked}, lost to ${p.winner}`);
    return `${m.displayName}: ${m.dailyCorrect}/${m.totalGamesForDay} correct${boldPicks.length > 0 ? ` | Bold correct: ${boldPicks.join(', ')}` : ''}${wrongPicks.length > 0 ? ` | Missed: ${wrongPicks.join('; ')}` : ''}`;
  }).join('\n');

  // Build per-game pick breakdown showing who picked which team
  const perGamePickBreakdown = data.games.map(g => {
    const winner = g.winning_team_espn_id === g.team1_espn_id;
    const winnerName = winner ? g.team1_name : g.team2_name;
    const winnerSeed = winner ? g.team1_seed : g.team2_seed;
    const loserName = winner ? g.team2_name : g.team1_name;
    const loserSeed = winner ? g.team2_seed : g.team1_seed;
    const winScore = winner ? g.team1_score : g.team2_score;
    const loseScore = winner ? g.team2_score : g.team1_score;
    const margin = winScore - loseScore;
    const isUpset = winnerSeed > loserSeed;
    const isClose = margin <= 5;

    const pickedWinner = [];
    const pickedLoser = [];
    const bracketBusted = [];
    const noPick = [];
    const losingTeamId = winner ? g.team2_espn_id : g.team1_espn_id;
    for (const m of data.memberScores) {
      const pick = m.picks[g.slot_number] || m.picks[String(g.slot_number)];
      if (!pick) { noPick.push(m.displayName); continue; }
      if (String(pick) === String(g.winning_team_espn_id)) {
        pickedWinner.push(m.displayName);
      } else if (String(pick) === String(losingTeamId)) {
        pickedLoser.push(m.displayName);
      } else {
        // Picked a team that was eliminated earlier — bracket was busted for this slot
        bracketBusted.push(m.displayName);
      }
    }
    const validPickers = pickedWinner.length + pickedLoser.length;
    const winnerPct = validPickers > 0 ? Math.round((pickedWinner.length / validPickers) * 100) : 0;

    let narrative = `(${winnerSeed}) ${winnerName} ${winScore} - (${loserSeed}) ${loserName} ${loseScore} [margin: ${margin}]`;
    if (isUpset) narrative += ' [UPSET]';
    if (isClose) narrative += ' [CLOSE GAME]';
    narrative += `\n  Picked ${winnerName} (${winnerPct}%): ${pickedWinner.length > 0 ? pickedWinner.join(', ') : 'nobody'}`;
    narrative += `\n  Picked ${loserName} (${100 - winnerPct}%): ${pickedLoser.length > 0 ? pickedLoser.join(', ') : 'nobody'}`;
    if (bracketBusted.length > 0) narrative += `\n  Bracket already busted (picked a team eliminated earlier): ${bracketBusted.join(', ')}`;
    if (noPick.length > 0) narrative += `\n  No pick (counts as wrong): ${noPick.join(', ')}`;
    if (pickedLoser.length > 0 && pickedLoser.length <= 3 && isUpset) {
      narrative += `\n  NOTE: ${pickedLoser.join(', ')} made a contrarian pick on the losing upset side`;
    }
    if (pickedWinner.length > 0 && pickedWinner.length <= 3 && isUpset) {
      narrative += `\n  NOTE: ${pickedWinner.join(', ')} correctly called this upset — only ${winnerPct}% of the group had it`;
    }
    if (isClose) {
      narrative += `\n  NOTE: This was a close game (${margin}-point margin). ${pickedLoser.length > 0 ? `If ${loserName} had won, it would have helped ${pickedLoser.join(', ')}.` : ''}`;
    }
    return narrative;
  }).join('\n\n');

  // Build prospect summary with regular season averages
  const prospectsSummary = data.prospects.map(p => {
    const avg = p.espn_stats || p.tankathon_stats || {};
    const seasonAvg = [
      avg.ppg && `${avg.ppg} ppg`,
      avg.rpg && `${avg.rpg} rpg`,
      avg.apg && `${avg.apg} apg`,
      avg.fgPct && `${avg.fgPct}% FG`,
    ].filter(Boolean).join(', ');

    // Find their game stats from box scores
    const gameStats = data.gameBoxScores?.flatMap(g => g.prospectStats)
      .find(s => s.espnId && String(s.espnId) === String(p.espn_id));

    let gameLine = '';
    if (gameStats) {
      gameLine = ` | GAME STATS: ${gameStats.pts} PTS, ${gameStats.reb} REB, ${gameStats.ast} AST, ${gameStats.fg} FG, ${gameStats.threes} 3PT${gameStats.stl ? `, ${gameStats.stl} STL` : ''}${gameStats.blk ? `, ${gameStats.blk} BLK` : ''}, ${gameStats.min} MIN`;
    }

    return `#${p.rank} ${p.name} (${p.school}, ${p.position})${seasonAvg ? ` [Season avg: ${seasonAvg}]` : ''}${gameLine}`;
  }).join('\n');

  // Build key players summary from box scores
  const keyPlayersSummary = (data.gameBoxScores || []).map(g => {
    if (!g.keyPlayers?.length) return null;
    const players = g.keyPlayers.map(p =>
      `  ${p.name} (${p.team}): ${p.pts} PTS, ${p.reb} REB, ${p.ast} AST, ${p.fg} FG, ${p.threes} 3PT${p.stl >= 2 ? `, ${p.stl} STL` : ''}${p.blk >= 2 ? `, ${p.blk} BLK` : ''}, ${p.min} MIN`
    ).join('\n');
    return `${g.team1} vs ${g.team2}:\n${players}`;
  }).filter(Boolean).join('\n\n');

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

PER-GAME PICK BREAKDOWN (who picked which team in each game):
${perGamePickBreakdown || 'No data'}
${data.prospects.length > 0 ? `\nNBA PROSPECTS WHO PLAYED (with actual game stats and season averages):\n${prospectsSummary}` : ''}
${keyPlayersSummary ? `\nKEY PLAYER PERFORMANCES (box scores):\n${keyPlayersSummary}` : ''}
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

Start with a ## header for the leaderboard standings. Show the current standings as a MARKDOWN NUMBERED LIST with ONE MEMBER PER LINE. Each member MUST be on its own separate line. Use SEQUENTIAL numbers (1. 2. 3. 4. 5. etc.) for every line — this is required for valid markdown. If members are tied, add "(T-N)" after their points to show the tie rank. Then use ### headers per member (or group of members) to break up the analysis.

CRITICAL — YOU MUST USE THE "PER-GAME PICK BREAKDOWN" DATA BELOW. This is the most important data for this section. DO NOT write generic summaries like "went 2-for-4" or "had a rough day." Instead, for EVERY member, reference their SPECIFIC picks by name:

For each member or group, you MUST mention:
1. Which specific teams they picked correctly and incorrectly (by name, with seed)
2. Whether their pick was contrarian (few others picked it) or consensus (everyone picked it)
3. For close games, mention that if the game went the other way it would've helped/hurt them
4. For members who were the ONLY person (or one of few) to pick a certain team, call that out specifically — that's a great story

Example of GOOD writing (specific, uses the data):
"**David Kim** was one of only 3 people in the group who picked #3 Illinois over #2 Houston — a bold call that paid off big. He also had #1 Arizona, which everyone got right. But he went with #11 Texas over #2 Purdue and got burned in a close 79-77 game."

Example of BAD writing (generic, ignores the data):
"David Kim went 2-for-4 and managed to hold onto first place despite a rough day."

The bad example is EXACTLY what you should NOT write. Every paragraph MUST reference specific team names and picks. If you find yourself writing "went X-for-Y" without naming teams, STOP and rewrite it with specifics.

Frame everything from the member's perspective — "PlayerA nailed the #12 upset pick" not "Team X pulled the upset."

Example structure (EACH MEMBER ON ITS OWN LINE, SEQUENTIAL NUMBERS):
## Current Standings
1. **PlayerA** — 10 pts (8/${data.totalGames} yesterday)
2. **PlayerB** — 8 pts (7/${data.totalGames} yesterday)
3. **PlayerC** — 7 pts (6/${data.totalGames} yesterday)
4. **PlayerD** — 5 pts (5/${data.totalGames} yesterday) (T-4)
5. **PlayerE** — 5 pts (4/${data.totalGames} yesterday) (T-4)

IMPORTANT: The denominator for "X/Y yesterday" must ALWAYS be ${data.totalGames} (total completed games), not the number of games a member happened to pick. If a member didn't pick a game, it still counts against them.

CRITICAL FORMATTING RULES:
- ALWAYS use sequential markdown numbers (1. 2. 3. 4. 5.) — NEVER use "T-4." as the line prefix because it breaks markdown list rendering.
- NEVER combine multiple members on the same line, paragraph, or sentence.
- Each member MUST be on its OWN separate numbered line — even when tied.
- Show tie rank as "(T-N)" AFTER the points, not as the line number prefix.

### PlayerA is Rolling
Paragraph about their picks and results...

### PlayerB Needs a Miracle
Paragraph about their struggles and busted picks...

Keep it fun, 4-6 sections with headers. EVERY section MUST reference specific team names and picks from the per-game breakdown data. NO generic summaries. NO game recap paragraphs, NO "Yesterday's Action" sections, NO NBA Prospect Watch sections. Save all of that for the Games tab.

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
Dedicate a full section to NBA prospects who played yesterday. You have their ACTUAL GAME STATS and SEASON AVERAGES above — use them accurately. Compare their game performance to their season averages. Call out prospects who showed out (exceeded their averages) AND ones who struggled (well below averages). For example, if a prospect averages 14 ppg but scored 0 points, that's a terrible game — say so. If someone averaging 8 ppg dropped 22, that's a breakout. Be honest and specific with the numbers. Do NOT fabricate any stats — only use the exact numbers provided.` : ''}

${keyPlayersSummary ? `### Key Performers
Highlight the standout players from yesterday's games using the actual box score stats provided. Focus on players who dominated (high scoring, double-doubles, efficient shooting), players who struggled despite expectations (low shooting %, high turnovers), and players who made clutch contributions in close games. Reference their actual stat lines — points, shooting splits, rebounds, assists. Do NOT make up stats.` : ''}

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
- SECTION 4 (TODAY) is the ONLY place for today's preview and prospect watch for upcoming games.${customPrompt ? `

ADDITIONAL INSTRUCTIONS FROM THE LEAGUE ADMIN (follow these carefully):
${customPrompt}` : ''}`;

  const message = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 4096,
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
async function generateAndStoreRecap(tournamentId, leagueId, recapDate, customPrompt) {
  const data = await gatherRecapData(tournamentId, leagueId, recapDate);

  if (data.games.length === 0) {
    throw new Error(`No completed games found for ${recapDate}`);
  }

  const { tldr, fullRecap, membersTab, gamesTab, todayTab } = await generateRecap(data, customPrompt);

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
