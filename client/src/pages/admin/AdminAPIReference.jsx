import { useState, useMemo, useCallback } from 'react';
import {
  Search, X, ChevronDown, ChevronRight, ExternalLink, Clock, Copy, Check,
  Globe, Database, Zap, FileText, Play, Loader2
} from 'lucide-react';
import { useToast } from '../../components/Toast';

// ─── ESPN Endpoint Registry ──────────────────────────────────
const ENDPOINTS = [
  // ── NCAAB Tournament ──
  {
    sport: 'NCAAB',
    category: 'Tournament',
    name: 'Tournament Scoreboard',
    url: 'https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/scoreboard?groups=100&seasontype=3&dates={season}0301-{season}0415&limit=500',
    method: 'GET',
    cacheTTL: '1 min',
    file: 'server/services/ncaab-tournament.js',
    function: 'fetchTournamentGames(season)',
    description: 'Fetches all NCAA tournament games (March Madness). groups=100 filters to tournament only, seasontype=3 = postseason. Returns all events from R64 through Championship + First Four.',
    params: [
      { name: 'season', type: 'number', example: '2026', description: 'The tournament year (e.g. 2026 for the 2025-26 season)' },
    ],
    returns: 'Array of event objects with competitions, teams, scores, status, notes (region/round), venue, broadcast',
    usedFor: 'Building the full bracket structure — teams, slots, regions, scores. Main data source for syncTournamentFromESPN().',
    responseProperties: [
      { path: 'events[]', type: 'array', description: 'List of tournament game events' },
      { path: 'events[].id', type: 'string', description: 'ESPN event ID (e.g. "401856435"). Used as espn_event_id in tournament_games table' },
      { path: 'events[].name', type: 'string', description: 'Game title (e.g. "Howard Bison vs UMBC Retrievers")' },
      { path: 'events[].shortName', type: 'string', description: 'Short game title (e.g. "HOW vs UMBC")' },
      { path: 'events[].date', type: 'ISO 8601', description: 'Game start time in UTC' },
      { path: 'events[].status.type.name', type: 'string', description: 'Game status: STATUS_SCHEDULED, STATUS_IN_PROGRESS, STATUS_FINAL' },
      { path: 'events[].status.type.detail', type: 'string', description: 'Status detail text (e.g. "Final", "Halftime", "2nd Half - 5:32")' },
      { path: 'events[].competitions[0].competitors[]', type: 'array', description: 'Two team objects for the matchup' },
      { path: 'events[].competitions[0].competitors[].id', type: 'string', description: 'ESPN team ID' },
      { path: 'events[].competitions[0].competitors[].team.displayName', type: 'string', description: 'Full team name (e.g. "Duke Blue Devils")' },
      { path: 'events[].competitions[0].competitors[].team.abbreviation', type: 'string', description: 'Team abbreviation (e.g. "DUKE")' },
      { path: 'events[].competitions[0].competitors[].team.logo', type: 'string (URL)', description: 'Team logo image URL' },
      { path: 'events[].competitions[0].competitors[].team.color', type: 'string (hex)', description: 'Team primary color without # (e.g. "003087")' },
      { path: 'events[].competitions[0].competitors[].score', type: 'string', description: 'Team score as string (e.g. "71"). Null if game not started' },
      { path: 'events[].competitions[0].competitors[].curatedRank.current', type: 'number', description: 'Tournament seed (1-16)' },
      { path: 'events[].competitions[0].competitors[].winner', type: 'boolean', description: 'True if this team won (only set when status is FINAL)' },
      { path: 'events[].competitions[0].competitors[].records[]', type: 'array', description: 'Season record entries' },
      { path: 'events[].competitions[0].notes[]', type: 'array', description: 'Round/region info parsed to determine bracket position' },
      { path: 'events[].competitions[0].notes[].headline', type: 'string', description: 'e.g. "East Region - First Round" — parsed for region and round names' },
      { path: 'events[].competitions[0].venue.fullName', type: 'string', description: 'Venue name (e.g. "UD Arena")' },
      { path: 'events[].competitions[0].broadcasts[]', type: 'array', description: 'Broadcast network info' },
      { path: 'events[].competitions[0].broadcasts[0].names[]', type: 'array<string>', description: 'Network names (e.g. ["truTV"])' },
    ],
  },
  {
    sport: 'NCAAB',
    category: 'Tournament',
    name: 'Game Summary',
    url: 'https://site.web.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/summary?event={eventId}',
    method: 'GET',
    cacheTTL: '1 min (live) / 24 hrs (final)',
    file: 'server/services/ncaab-tournament.js',
    function: 'getMatchupPrediction(), refreshGameFromESPN()',
    description: 'Detailed summary for a single game. Includes header (teams, scores, status), game info (venue, officials), boxscore, plays, win probability, predictor data.',
    params: [
      { name: 'eventId', type: 'string', example: '401856435', description: 'ESPN event ID for the game' },
    ],
    returns: 'Full game summary: header.competitions (scores, status, winner), gameInfo (venue), predictor (win probability), boxscore, plays',
    usedFor: 'Win probability for matchup predictions, single-game refresh from ESPN in admin, prospect boxscore stats.',
    responseProperties: [
      { path: 'header.competitions[0]', type: 'object', description: 'Primary competition data with teams and status' },
      { path: 'header.competitions[0].competitors[]', type: 'array', description: 'Two team objects' },
      { path: 'header.competitions[0].competitors[].id', type: 'string', description: 'ESPN team ID' },
      { path: 'header.competitions[0].competitors[].score', type: 'string', description: 'Team score' },
      { path: 'header.competitions[0].competitors[].winner', type: 'boolean', description: 'True if this team won' },
      { path: 'header.competitions[0].competitors[].linescores[]', type: 'array', description: 'Score by period (half)' },
      { path: 'header.competitions[0].status.type.name', type: 'string', description: 'STATUS_FINAL, STATUS_IN_PROGRESS, STATUS_SCHEDULED' },
      { path: 'header.competitions[0].status.type.detail', type: 'string', description: 'Human-readable status' },
      { path: 'header.competitions[0].date', type: 'ISO 8601', description: 'Game start time' },
      { path: 'header.competitions[0].broadcasts[]', type: 'array', description: 'Broadcast info' },
      { path: 'header.competitions[0].broadcasts[0].media.shortName', type: 'string', description: 'Network name (e.g. "truTV")' },
      { path: 'gameInfo.venue.fullName', type: 'string', description: 'Venue name' },
      { path: 'gameInfo.venue.address', type: 'object', description: 'Venue location (city, state)' },
      { path: 'predictor.homeTeam.gameProjection', type: 'number', description: 'Win probability for home team (0-100)' },
      { path: 'predictor.awayTeam.gameProjection', type: 'number', description: 'Win probability for away team (0-100)' },
      { path: 'boxscore.teams[]', type: 'array', description: 'Team boxscore with player statistics' },
      { path: 'boxscore.teams[].team.displayName', type: 'string', description: 'Team name' },
      { path: 'boxscore.teams[].statistics[]', type: 'array', description: 'Season averages when game is upcoming; game stats when final' },
      { path: 'boxscore.players[]', type: 'array', description: 'Individual player boxscores' },
    ],
  },
  {
    sport: 'NCAAB',
    category: 'Tournament',
    name: 'Standings (Selection Sunday)',
    url: 'https://site.web.api.espn.com/apis/v2/sports/basketball/mens-college-basketball/standings?season={season}',
    method: 'GET',
    cacheTTL: '24 hrs',
    file: 'server/services/ncaab-tournament.js',
    function: 'getSelectionSundayDate(season)',
    description: 'Conference standings with season metadata. Used to determine postseason start date and derive Selection Sunday date (postseason start - 2 days).',
    params: [
      { name: 'season', type: 'number', example: '2026', description: 'Season year' },
    ],
    returns: 'Standings with seasons[].types[] containing postseason start/end dates',
    usedFor: 'Calculating Selection Sunday date to determine when bracket picks should lock.',
    responseProperties: [
      { path: 'seasons[]', type: 'array', description: 'Season info objects' },
      { path: 'seasons[].types[]', type: 'array', description: 'Season type entries (regular, postseason)' },
      { path: 'seasons[].types[].name', type: 'string', description: '"Regular Season" or "Postseason"' },
      { path: 'seasons[].types[].startDate', type: 'ISO 8601', description: 'Start date of season type' },
      { path: 'seasons[].types[].endDate', type: 'ISO 8601', description: 'End date of season type' },
      { path: 'children[]', type: 'array', description: 'Conference standings groups' },
      { path: 'children[].standings.entries[]', type: 'array', description: 'Team entries with records' },
    ],
  },
  {
    sport: 'NCAAB',
    category: 'Teams',
    name: 'Team Schedule',
    url: 'https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/teams/{teamId}/schedule?season={season}&seasontype={type}',
    method: 'GET',
    cacheTTL: '1 hr',
    file: 'server/services/ncaab-tournament.js',
    function: 'fetchFullSchedule(teamId, season)',
    description: 'Full schedule for a team in a given season. Called twice — once for regular season (seasontype=2) and once for postseason (seasontype=3) — then merged.',
    params: [
      { name: 'teamId', type: 'string', example: '150', description: 'ESPN team ID' },
      { name: 'season', type: 'number', example: '2026', description: 'Season year' },
      { name: 'type', type: 'number', example: '2', description: '2 = regular season, 3 = postseason' },
    ],
    returns: 'Array of event objects with opponents, scores, dates, home/away designation',
    usedFor: 'Building "Last 10 Games" and full season record for scouting reports and team breakdowns.',
    responseProperties: [
      { path: 'events[]', type: 'array', description: 'Scheduled/completed game events' },
      { path: 'events[].id', type: 'string', description: 'ESPN event ID' },
      { path: 'events[].date', type: 'ISO 8601', description: 'Game date' },
      { path: 'events[].name', type: 'string', description: 'Game title' },
      { path: 'events[].competitions[0].competitors[]', type: 'array', description: 'Teams in game' },
      { path: 'events[].competitions[0].competitors[].homeAway', type: 'string', description: '"home" or "away"' },
      { path: 'events[].competitions[0].competitors[].score', type: 'string', description: 'Final score' },
      { path: 'events[].competitions[0].competitors[].winner', type: 'boolean', description: 'True if this team won' },
      { path: 'events[].competitions[0].competitors[].team.displayName', type: 'string', description: 'Opponent name' },
      { path: 'events[].competitions[0].status.type.completed', type: 'boolean', description: 'Whether game is complete' },
    ],
  },

  // ── NBA Draft ──
  {
    sport: 'NCAAB',
    category: 'Draft Prospects',
    name: 'Athlete Profile',
    url: 'https://site.web.api.espn.com/apis/common/v3/sports/basketball/mens-college-basketball/athletes/{athleteId}',
    method: 'GET',
    cacheTTL: '6 hrs',
    file: 'server/services/nba-draft.js',
    function: 'enrichProspectsWithESPN()',
    description: 'Detailed athlete profile with statistics, team, physical measurements, and season averages. Used to enrich draft prospect data with ESPN stats.',
    params: [
      { name: 'athleteId', type: 'string', example: '5105620', description: 'ESPN athlete ID' },
    ],
    returns: 'Athlete object with displayName, team, position, statistics (season averages)',
    usedFor: 'Enriching NBA draft prospect profiles with college stats, headshots, team info.',
    responseProperties: [
      { path: 'athlete.id', type: 'string', description: 'ESPN athlete ID' },
      { path: 'athlete.displayName', type: 'string', description: 'Full name (e.g. "Cooper Flagg")' },
      { path: 'athlete.headshot.href', type: 'string (URL)', description: 'Headshot image URL' },
      { path: 'athlete.position.abbreviation', type: 'string', description: 'Position (e.g. "PF", "SG")' },
      { path: 'athlete.displayHeight', type: 'string', description: 'Height (e.g. "6\'9")' },
      { path: 'athlete.displayWeight', type: 'string', description: 'Weight (e.g. "205 lbs")' },
      { path: 'athlete.team.displayName', type: 'string', description: 'College team name' },
      { path: 'athlete.team.logo', type: 'string (URL)', description: 'Team logo URL' },
      { path: 'statistics[].splits.categories[]', type: 'array', description: 'Stat categories (offensive, defensive)' },
      { path: 'statistics[].splits.categories[].stats[]', type: 'array', description: 'Individual stats with name, displayValue' },
      { path: 'statistics[].splits.categories[].stats[].name', type: 'string', description: 'Stat key (e.g. "avgPoints", "avgRebounds")' },
      { path: 'statistics[].splits.categories[].stats[].displayValue', type: 'string', description: 'Formatted value (e.g. "18.2")' },
    ],
  },

  // ── NFL ──
  {
    sport: 'NFL',
    category: 'Standings',
    name: 'Conference/Division Standings',
    url: 'https://sports.core.api.espn.com/v2/sports/football/leagues/nfl/seasons/{season}/types/2/groups/{groupId}/standings/0?lang=en&region=us',
    method: 'GET',
    cacheTTL: '6 hrs',
    file: 'server/services/nfl.js',
    function: 'getStandingsRanksMap(season)',
    description: 'Standings for a specific conference or division group. Groups: 7=NFC, 8=AFC. Divisions: 1,3,4,6,10,11,12,13. Includes playoff seeds and win/loss records.',
    params: [
      { name: 'season', type: 'number', example: '2025', description: 'NFL season year' },
      { name: 'groupId', type: 'number', example: '7', description: 'Conference or division group ID' },
    ],
    returns: 'standings[].entries[] with team refs, stats (wins, losses, playoffSeed, streak)',
    usedFor: 'Building ranked standings map for NFL Survivor pool — determines team strength and playoff positioning.',
    responseProperties: [
      { path: 'standings[0].entries[]', type: 'array', description: 'Teams in standing order' },
      { path: 'standings[0].entries[].team.$ref', type: 'string (URL)', description: 'Team resource URL — extract team ID from path' },
      { path: 'standings[0].entries[].stats[]', type: 'array', description: 'Stat entries' },
      { path: 'standings[0].entries[].stats[].name', type: 'string', description: 'Stat key: "wins", "losses", "playoffSeed", "streak", etc.' },
      { path: 'standings[0].entries[].stats[].value', type: 'number', description: 'Numeric stat value' },
      { path: 'standings[0].entries[].stats[].displayValue', type: 'string', description: 'Formatted value (e.g. "W4" for streak)' },
    ],
  },
  {
    sport: 'NFL',
    category: 'Teams',
    name: 'All Teams',
    url: 'https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams',
    method: 'GET',
    cacheTTL: '1 hr',
    file: 'server/services/nfl.js',
    function: 'getLeagueRankings()',
    description: 'List of all 32 NFL teams with IDs, abbreviations, logos, colors, and display names.',
    params: [],
    returns: 'sports[].leagues[].teams[] with team.id, abbreviation, displayName, logos, color',
    usedFor: 'Initial team list for league-wide rankings calculation.',
    responseProperties: [
      { path: 'sports[0].leagues[0].teams[]', type: 'array', description: 'All teams in the league' },
      { path: 'sports[0].leagues[0].teams[].team.id', type: 'string', description: 'ESPN team ID (e.g. "12")' },
      { path: 'sports[0].leagues[0].teams[].team.displayName', type: 'string', description: 'Full team name (e.g. "Kansas City Chiefs")' },
      { path: 'sports[0].leagues[0].teams[].team.abbreviation', type: 'string', description: 'Team abbreviation (e.g. "KC")' },
      { path: 'sports[0].leagues[0].teams[].team.logos[0].href', type: 'string (URL)', description: 'Team logo image URL' },
      { path: 'sports[0].leagues[0].teams[].team.color', type: 'string (hex)', description: 'Primary color without # (e.g. "e31837")' },
      { path: 'sports[0].leagues[0].teams[].team.alternateColor', type: 'string (hex)', description: 'Secondary color without #' },
    ],
  },
  {
    sport: 'NFL',
    category: 'Teams',
    name: 'Team Statistics',
    url: 'https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams/{teamId}/statistics?season={season}',
    method: 'GET',
    cacheTTL: '30 min',
    file: 'server/services/nfl.js',
    function: 'getLeagueRankings()',
    description: 'Comprehensive team statistics for a season including offensive and defensive splits.',
    params: [
      { name: 'teamId', type: 'string', example: '12', description: 'ESPN team ID' },
      { name: 'season', type: 'number', example: '2025', description: 'NFL season year' },
    ],
    returns: 'statistics splits with categories (passing, rushing, etc.) and per-game averages',
    usedFor: 'Calculating PPG, opponent PPG, and other metrics for team ranking algorithms.',
    responseProperties: [
      { path: 'results[0].stats.splits.categories[]', type: 'array', description: 'Stat categories' },
      { path: 'results[0].stats.splits.categories[].name', type: 'string', description: 'Category name: "general", "passing", "rushing", "receiving", "scoring"' },
      { path: 'results[0].stats.splits.categories[].stats[]', type: 'array', description: 'Individual stat entries' },
      { path: 'results[0].stats.splits.categories[].stats[].name', type: 'string', description: 'Stat key (e.g. "totalPointsPerGame", "passingYardsPerGame")' },
      { path: 'results[0].stats.splits.categories[].stats[].value', type: 'number', description: 'Numeric stat value' },
      { path: 'results[0].stats.splits.categories[].stats[].displayValue', type: 'string', description: 'Formatted value (e.g. "27.3")' },
    ],
  },
  {
    sport: 'NFL',
    category: 'Teams',
    name: 'Team Schedule',
    url: 'https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams/{teamId}/schedule?season={season}',
    method: 'GET',
    cacheTTL: '30 min',
    file: 'server/services/nfl.js',
    function: 'getLeagueRankings()',
    description: 'Full season schedule for a team including completed and upcoming games with scores.',
    params: [
      { name: 'teamId', type: 'string', example: '12', description: 'ESPN team ID' },
      { name: 'season', type: 'number', example: '2025', description: 'NFL season year' },
    ],
    returns: 'events[] with competitions, scores, date, opponents, home/away status',
    usedFor: 'Calculating completed games, points for/against, and strength of schedule.',
    responseProperties: [
      { path: 'events[]', type: 'array', description: 'All games in the season' },
      { path: 'events[].id', type: 'string', description: 'ESPN event ID' },
      { path: 'events[].week.number', type: 'number', description: 'NFL week number (1-18)' },
      { path: 'events[].competitions[0].competitors[]', type: 'array', description: 'Two teams' },
      { path: 'events[].competitions[0].competitors[].score', type: 'string', description: 'Team score' },
      { path: 'events[].competitions[0].competitors[].homeAway', type: 'string', description: '"home" or "away"' },
      { path: 'events[].competitions[0].status.type.completed', type: 'boolean', description: 'Whether game is complete' },
    ],
  },
  {
    sport: 'NFL',
    category: 'Teams',
    name: 'Team Injuries',
    url: 'https://sports.core.api.espn.com/v2/sports/football/leagues/nfl/teams/{teamId}/injuries',
    method: 'GET',
    cacheTTL: '30 min',
    file: 'server/services/nfl.js',
    function: 'getTeamInjuries(teamId)',
    description: 'Current injury report for a team. Returns athlete refs with injury status (Questionable, Doubtful, Out, IR).',
    params: [
      { name: 'teamId', type: 'string', example: '12', description: 'ESPN team ID' },
    ],
    returns: 'items[] with athlete.$ref, status, type, details, returnDate',
    usedFor: 'Displaying injury reports on team matchup pages for NFL Survivor picks.',
    responseProperties: [
      { path: 'items[]', type: 'array', description: 'Injury report entries' },
      { path: 'items[].athlete.$ref', type: 'string (URL)', description: 'Athlete resource URL — extract athlete ID from path' },
      { path: 'items[].status', type: 'string', description: 'Injury status: "Questionable", "Doubtful", "Out", "Injured Reserve"' },
      { path: 'items[].type.name', type: 'string', description: 'Injury type (e.g. "Knee", "Hamstring")' },
      { path: 'items[].details.detail', type: 'string', description: 'Injury description' },
      { path: 'items[].details.returnDate', type: 'ISO 8601', description: 'Expected return date (if available)' },
    ],
  },
  {
    sport: 'NFL',
    category: 'Players',
    name: 'Athlete Statistics',
    url: 'https://sports.core.api.espn.com/v2/sports/football/leagues/nfl/seasons/{season}/types/2/athletes/{playerId}/statistics',
    method: 'GET',
    cacheTTL: '30 min',
    file: 'server/services/nfl.js',
    function: 'fetchAthleteStats(playerId)',
    description: 'Individual player season statistics including games played, passing, rushing, receiving stats.',
    params: [
      { name: 'season', type: 'number', example: '2025', description: 'NFL season year' },
      { name: 'playerId', type: 'string', example: '3139477', description: 'ESPN athlete ID' },
    ],
    returns: 'splits.categories[] with stats (passingYards, touchdowns, interceptions, etc.)',
    usedFor: 'Top players analysis for team scouting and matchup reports.',
    responseProperties: [
      { path: 'splits.categories[]', type: 'array', description: 'Stat categories (passing, rushing, receiving, etc.)' },
      { path: 'splits.categories[].name', type: 'string', description: 'Category name' },
      { path: 'splits.categories[].stats[]', type: 'array', description: 'Individual stat entries' },
      { path: 'splits.categories[].stats[].name', type: 'string', description: 'Stat key (e.g. "passingYards", "passingTouchdowns")' },
      { path: 'splits.categories[].stats[].value', type: 'number', description: 'Numeric value' },
      { path: 'splits.categories[].stats[].displayValue', type: 'string', description: 'Formatted display value' },
    ],
  },
  {
    sport: 'NFL',
    category: 'Players',
    name: 'Athlete Overview',
    url: 'https://site.api.espn.com/apis/common/v3/sports/football/nfl/athletes/{playerId}/overview',
    method: 'GET',
    cacheTTL: '30 min',
    file: 'server/services/nfl.js',
    function: 'fetchAthleteStats(playerId)',
    description: 'Detailed athlete profile with career stats, bio, and headshot.',
    params: [
      { name: 'playerId', type: 'string', example: '3139477', description: 'ESPN athlete ID' },
    ],
    returns: 'athlete object with displayName, headshot, position, statistics overview',
    usedFor: 'Player profiles in team analysis and matchup reports.',
    responseProperties: [
      { path: 'athlete.displayName', type: 'string', description: 'Full player name' },
      { path: 'athlete.headshot.href', type: 'string (URL)', description: 'Headshot image URL' },
      { path: 'athlete.position.abbreviation', type: 'string', description: 'Position (e.g. "QB", "WR")' },
      { path: 'athlete.jersey', type: 'string', description: 'Jersey number' },
      { path: 'athlete.team.displayName', type: 'string', description: 'Team name' },
      { path: 'statistics[]', type: 'array', description: 'Career and season stat summaries' },
    ],
  },
  {
    sport: 'NFL',
    category: 'Teams',
    name: 'Team News',
    url: 'https://site.api.espn.com/apis/site/v2/sports/football/nfl/news?limit=10&team={teamId}',
    method: 'GET',
    cacheTTL: '10 min',
    file: 'server/services/nfl.js',
    function: 'getTeamInfo(teamId)',
    description: 'Recent news articles for a specific team. Limited to 10 articles per request, filtered to most recent 8.',
    params: [
      { name: 'teamId', type: 'string', example: '12', description: 'ESPN team ID' },
    ],
    returns: 'articles[] with headline, description, published date, images, links',
    usedFor: 'Team info pages showing recent news in NFL Survivor.',
    responseProperties: [
      { path: 'articles[]', type: 'array', description: 'News article entries' },
      { path: 'articles[].headline', type: 'string', description: 'Article headline' },
      { path: 'articles[].description', type: 'string', description: 'Short description or excerpt' },
      { path: 'articles[].published', type: 'ISO 8601', description: 'Publication timestamp' },
      { path: 'articles[].images[]', type: 'array', description: 'Article images' },
      { path: 'articles[].images[0].url', type: 'string (URL)', description: 'Image URL' },
      { path: 'articles[].links.web.href', type: 'string (URL)', description: 'Full article URL on ESPN' },
    ],
  },

  // ── Generic / Multi-sport ──
  {
    sport: 'Multi-Sport',
    category: 'Scoreboard',
    name: 'Daily Scoreboard',
    url: 'https://site.api.espn.com/apis/site/v2/sports/{sport}/{league}/scoreboard?dates={YYYYMMDD}',
    method: 'GET',
    cacheTTL: '5 min',
    file: 'server/services/live-score-poller.js',
    function: 'LiveScorePoller.pollSport()',
    description: 'Daily game schedule and live scores for any sport. Used by the live score poller to push real-time updates via WebSocket.',
    params: [
      { name: 'sport', type: 'string', example: 'basketball', description: 'Sport slug (basketball, football, hockey, baseball)' },
      { name: 'league', type: 'string', example: 'nba', description: 'League slug (nba, nfl, nhl, mlb, mens-college-basketball)' },
      { name: 'dates', type: 'string', example: '20260319', description: 'Date in YYYYMMDD format' },
    ],
    returns: 'events[] with competitions, scores, status, clock, period, odds, broadcasts',
    usedFor: 'Live score updates pushed to clients via Socket.io /scores namespace. Powers the live scoreboard widgets.',
    responseProperties: [
      { path: 'events[]', type: 'array', description: 'All games for the requested date' },
      { path: 'events[].id', type: 'string', description: 'ESPN event ID' },
      { path: 'events[].name', type: 'string', description: 'Game title' },
      { path: 'events[].status.type.state', type: 'string', description: '"pre", "in", "post" — game state' },
      { path: 'events[].status.displayClock', type: 'string', description: 'Game clock (e.g. "5:32")' },
      { path: 'events[].status.period', type: 'number', description: 'Current period/quarter/half' },
      { path: 'events[].competitions[0].competitors[]', type: 'array', description: 'Two teams with scores' },
      { path: 'events[].competitions[0].odds[]', type: 'array', description: 'Betting lines (spread, over/under)' },
      { path: 'events[].competitions[0].broadcasts[]', type: 'array', description: 'TV broadcast info' },
    ],
  },
  {
    sport: 'Multi-Sport',
    category: 'Scoreboard',
    name: 'Game Summary (Admin)',
    url: 'https://site.api.espn.com/apis/site/v2/sports/{sport}/{league}/summary?event={eventId}',
    method: 'GET',
    cacheTTL: 'None',
    file: 'server/routes/admin.js',
    function: 'resolveGameNames(games)',
    description: 'Resolves ESPN event IDs to team names for admin dashboard display. Dynamic sport slug based on SPORT_SLUGS map.',
    params: [
      { name: 'sport', type: 'string', example: 'basketball', description: 'Sport slug' },
      { name: 'league', type: 'string', example: 'nba', description: 'League slug' },
      { name: 'eventId', type: 'string', example: '401584901', description: 'ESPN event ID' },
    ],
    returns: 'boxscore.teams[] with team.displayName for name resolution',
    usedFor: 'Admin dashboard shows league game associations with readable team names instead of raw IDs.',
    responseProperties: [
      { path: 'boxscore.teams[]', type: 'array', description: 'Team boxscore entries' },
      { path: 'boxscore.teams[].team.displayName', type: 'string', description: 'Full team name' },
      { path: 'boxscore.teams[].team.abbreviation', type: 'string', description: 'Team abbreviation' },
    ],
  },
  {
    sport: 'Multi-Sport',
    category: 'Standings',
    name: 'Standings by Group',
    url: 'https://sports.core.api.espn.com/v2/sports/{sport}/leagues/{league}/seasons/{season}/types/2/groups/{groupId}/standings/0?lang=en&region=us',
    method: 'GET',
    cacheTTL: '6 hrs',
    file: 'server/services/daily-sport.js',
    function: 'fetchStandingsGroup(cfg, season, groupId)',
    description: 'Generic standings fetcher for any sport division/conference. Used by NBA, NHL, MLB daily sport services.',
    params: [
      { name: 'sport', type: 'string', example: 'basketball', description: 'Sport slug' },
      { name: 'league', type: 'string', example: 'nba', description: 'League slug' },
      { name: 'season', type: 'number', example: '2026', description: 'Season year' },
      { name: 'groupId', type: 'number', example: '5', description: 'Division or conference group ID' },
    ],
    returns: 'standings[].entries[] with team refs, wins, losses, percentage, streak, home/away records',
    usedFor: 'Division/conference standings for NBA, NHL, MLB displayed on live score pages.',
    responseProperties: [
      { path: 'standings[0].entries[]', type: 'array', description: 'Teams ranked in standing order' },
      { path: 'standings[0].entries[].team.$ref', type: 'string (URL)', description: 'Team resource URL' },
      { path: 'standings[0].entries[].stats[]', type: 'array', description: 'Stat entries for the team' },
      { path: 'standings[0].entries[].stats[].name', type: 'string', description: 'Stat key (wins, losses, winPercent, streak, etc.)' },
      { path: 'standings[0].entries[].stats[].value', type: 'number', description: 'Numeric value' },
    ],
  },
  {
    sport: 'Multi-Sport',
    category: 'Teams',
    name: 'All Teams (Generic)',
    url: 'https://site.api.espn.com/apis/site/v2/sports/{sport}/{league}/teams?limit=500',
    method: 'GET',
    cacheTTL: '24 hrs',
    file: 'server/services/daily-sport.js',
    function: 'getTeams()',
    description: 'Full team list for any sport league. Returns all teams with IDs, names, logos, colors, and abbreviations.',
    params: [
      { name: 'sport', type: 'string', example: 'basketball', description: 'Sport slug' },
      { name: 'league', type: 'string', example: 'nba', description: 'League slug' },
    ],
    returns: 'sports[].leagues[].teams[].team with id, displayName, abbreviation, logos[], color, alternateColor',
    usedFor: 'Team lookup for all sports. Cached for 24 hours since team rosters rarely change.',
    responseProperties: [
      { path: 'sports[0].leagues[0].teams[]', type: 'array', description: 'All teams' },
      { path: 'sports[0].leagues[0].teams[].team.id', type: 'string', description: 'ESPN team ID' },
      { path: 'sports[0].leagues[0].teams[].team.displayName', type: 'string', description: 'Full team name' },
      { path: 'sports[0].leagues[0].teams[].team.abbreviation', type: 'string', description: 'Short abbreviation' },
      { path: 'sports[0].leagues[0].teams[].team.logos[]', type: 'array', description: 'Logo image objects' },
      { path: 'sports[0].leagues[0].teams[].team.logos[0].href', type: 'string (URL)', description: 'Logo image URL' },
      { path: 'sports[0].leagues[0].teams[].team.color', type: 'string (hex)', description: 'Primary color without #' },
      { path: 'sports[0].leagues[0].teams[].team.alternateColor', type: 'string (hex)', description: 'Secondary color without #' },
    ],
  },
];

// ─── Unique sports and categories ──────────────────────────────
const SPORTS = [...new Set(ENDPOINTS.map(e => e.sport))];

const CACHE_COLORS = {
  '1 min': 'text-red-400',
  '5 min': 'text-orange-400',
  '10 min': 'text-amber-400',
  '30 min': 'text-yellow-400',
  '1 hr': 'text-lime-400',
  '6 hrs': 'text-green-400',
  '24 hrs': 'text-emerald-400',
  'None': 'text-fg/30',
};

function getCacheColor(ttl) {
  for (const [key, color] of Object.entries(CACHE_COLORS)) {
    if (ttl.startsWith(key)) return color;
  }
  return 'text-fg/40';
}

export default function AdminAPIReference() {
  const { showToast } = useToast();
  const [search, setSearch] = useState('');
  const [sportFilter, setSportFilter] = useState('all');
  const [expandedEndpoints, setExpandedEndpoints] = useState(new Set());
  const [copiedUrl, setCopiedUrl] = useState(null);

  const filtered = useMemo(() => {
    let result = ENDPOINTS;
    if (sportFilter !== 'all') {
      result = result.filter(e => e.sport === sportFilter);
    }
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(e =>
        e.name.toLowerCase().includes(q) ||
        e.url.toLowerCase().includes(q) ||
        e.description.toLowerCase().includes(q) ||
        e.function.toLowerCase().includes(q) ||
        e.file.toLowerCase().includes(q) ||
        e.category.toLowerCase().includes(q)
      );
    }
    return result;
  }, [search, sportFilter]);

  // Group by category within sport
  const grouped = useMemo(() => {
    const groups = {};
    for (const ep of filtered) {
      const key = `${ep.sport} — ${ep.category}`;
      if (!groups[key]) groups[key] = { sport: ep.sport, category: ep.category, endpoints: [] };
      groups[key].endpoints.push(ep);
    }
    return Object.values(groups);
  }, [filtered]);

  function toggleEndpoint(idx) {
    setExpandedEndpoints(prev => {
      const next = new Set(prev);
      next.has(idx) ? next.delete(idx) : next.add(idx);
      return next;
    });
  }

  function expandAll() {
    setExpandedEndpoints(new Set(filtered.map((_, i) => i)));
  }

  function collapseAll() {
    setExpandedEndpoints(new Set());
  }

  async function copyUrl(url) {
    try {
      await navigator.clipboard.writeText(url);
      setCopiedUrl(url);
      setTimeout(() => setCopiedUrl(null), 2000);
    } catch {
      showToast('Failed to copy', 'error');
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-fg">ESPN API Reference</h1>
        <p className="text-sm text-fg/40 mt-1">{ENDPOINTS.length} endpoints across {SPORTS.length} sport categories — all public, no API key required</p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-fg/30" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search endpoints, functions, files..."
            className="w-full bg-surface border border-fg/10 rounded-lg pl-9 pr-8 py-2 text-sm text-fg placeholder:text-fg/30"
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-fg/30 hover:text-fg/60">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
        <div className="flex gap-1.5">
          {['all', ...SPORTS].map(s => (
            <button
              key={s}
              onClick={() => setSportFilter(s)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                sportFilter === s
                  ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                  : 'bg-fg/5 text-fg/40 border border-transparent hover:text-fg/60'
              }`}
            >
              {s === 'all' ? 'All' : s}
            </button>
          ))}
        </div>
        <div className="flex gap-2 ml-auto">
          <button onClick={expandAll} className="px-3 py-1.5 bg-fg/10 hover:bg-fg/15 text-fg/50 rounded-lg text-sm transition-colors">
            Expand All
          </button>
          <button onClick={collapseAll} className="px-3 py-1.5 bg-fg/10 hover:bg-fg/15 text-fg/50 rounded-lg text-sm transition-colors">
            Collapse All
          </button>
        </div>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard icon={Globe} label="Total Endpoints" value={ENDPOINTS.length} color="text-blue-400" />
        <StatCard icon={Database} label="API Domains" value="3" sub="site, core, web" color="text-violet-400" />
        <StatCard icon={Clock} label="Cache Range" value="1m–24h" sub="in-memory TTL" color="text-amber-400" />
        <StatCard icon={Zap} label="Sports" value={SPORTS.filter(s => s !== 'Multi-Sport').length + ' + generic'} color="text-emerald-400" />
      </div>

      {/* Endpoint groups */}
      {grouped.map(group => {
        // Calculate the global indices for endpoints in this group
        const globalIndices = group.endpoints.map(ep => filtered.indexOf(ep));

        return (
          <div key={`${group.sport}-${group.category}`} className="space-y-2">
            <h3 className="text-sm font-semibold text-fg/50 uppercase tracking-wide flex items-center gap-2">
              <span className={`px-2 py-0.5 rounded text-sm font-medium ${
                group.sport === 'NFL' ? 'bg-green-500/10 text-green-400 border border-green-500/20' :
                group.sport === 'NCAAB' ? 'bg-orange-500/10 text-orange-400 border border-orange-500/20' :
                'bg-blue-500/10 text-blue-400 border border-blue-500/20'
              }`}>
                {group.sport}
              </span>
              {group.category}
            </h3>
            {group.endpoints.map((ep, epIdx) => {
              const globalIdx = globalIndices[epIdx];
              const isExpanded = expandedEndpoints.has(globalIdx);

              return (
                <div key={ep.url + ep.name} className="bg-surface rounded-xl border border-fg/10 overflow-hidden">
                  {/* Collapsed header */}
                  <button
                    onClick={() => toggleEndpoint(globalIdx)}
                    className="w-full flex items-center gap-3 p-4 text-left hover:bg-fg/5 transition-colors"
                  >
                    <ChevronRight className={`w-4 h-4 text-fg/30 shrink-0 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                    <span className="px-2 py-0.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded text-sm font-mono font-medium shrink-0">
                      {ep.method}
                    </span>
                    <span className="text-sm font-medium text-fg truncate">{ep.name}</span>
                    <span className="text-sm text-fg/30 truncate hidden lg:block flex-1 font-mono">{ep.url.replace('https://', '').split('?')[0]}</span>
                    <span className={`text-sm font-mono shrink-0 ${getCacheColor(ep.cacheTTL)}`}>
                      <Clock className="w-3 h-3 inline mr-1" />{ep.cacheTTL}
                    </span>
                  </button>

                  {/* Expanded details */}
                  {isExpanded && (
                    <div className="border-t border-fg/10 p-4 space-y-4">
                      {/* URL */}
                      <div>
                        <label className="block text-sm text-fg/40 mb-1">URL</label>
                        <div className="flex items-center gap-2">
                          <code className="flex-1 bg-fg/5 rounded-lg px-3 py-2 text-sm text-fg/70 font-mono break-all border border-fg/10">
                            {ep.url}
                          </code>
                          <button
                            onClick={() => copyUrl(ep.url)}
                            className="p-2 bg-fg/10 hover:bg-fg/15 rounded-lg text-fg/40 hover:text-fg/60 transition-colors shrink-0"
                          >
                            {copiedUrl === ep.url ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                          </button>
                        </div>
                      </div>

                      {/* Description */}
                      <div>
                        <label className="block text-sm text-fg/40 mb-1">Description</label>
                        <p className="text-sm text-fg/70">{ep.description}</p>
                      </div>

                      {/* Parameters */}
                      {ep.params.length > 0 && (
                        <div>
                          <label className="block text-sm text-fg/40 mb-1">Parameters</label>
                          <div className="bg-fg/5 rounded-lg border border-fg/10 overflow-hidden">
                            <table className="w-full text-sm">
                              <thead>
                                <tr className="border-b border-fg/10">
                                  <th className="text-left px-3 py-2 text-fg/40 font-medium">Name</th>
                                  <th className="text-left px-3 py-2 text-fg/40 font-medium">Type</th>
                                  <th className="text-left px-3 py-2 text-fg/40 font-medium">Example</th>
                                  <th className="text-left px-3 py-2 text-fg/40 font-medium">Description</th>
                                </tr>
                              </thead>
                              <tbody>
                                {ep.params.map(p => (
                                  <tr key={p.name} className="border-b border-fg/5">
                                    <td className="px-3 py-2 font-mono text-amber-400">{`{${p.name}}`}</td>
                                    <td className="px-3 py-2 text-fg/50">{p.type}</td>
                                    <td className="px-3 py-2 font-mono text-fg/60">{p.example}</td>
                                    <td className="px-3 py-2 text-fg/60">{p.description}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}

                      {/* Response */}
                      <div>
                        <label className="block text-sm text-fg/40 mb-1">Response Shape</label>
                        <p className="text-sm text-fg/60 font-mono bg-fg/5 rounded-lg px-3 py-2 border border-fg/10">{ep.returns}</p>
                      </div>

                      {/* Response Properties */}
                      {ep.responseProperties?.length > 0 && (
                        <div>
                          <label className="block text-sm text-fg/40 mb-1">Response Properties</label>
                          <div className="bg-fg/5 rounded-lg border border-fg/10 overflow-hidden">
                            <table className="w-full text-sm">
                              <thead>
                                <tr className="border-b border-fg/10">
                                  <th className="text-left px-3 py-2 text-fg/40 font-medium">Path</th>
                                  <th className="text-left px-3 py-2 text-fg/40 font-medium w-28">Type</th>
                                  <th className="text-left px-3 py-2 text-fg/40 font-medium">Description</th>
                                </tr>
                              </thead>
                              <tbody>
                                {ep.responseProperties.map((prop, pi) => (
                                  <tr key={pi} className="border-b border-fg/5">
                                    <td className="px-3 py-1.5 font-mono text-sm text-blue-400 whitespace-nowrap">{prop.path}</td>
                                    <td className="px-3 py-1.5">
                                      <span className="px-1.5 py-0.5 bg-fg/5 rounded text-sm font-mono text-violet-400 border border-fg/10">
                                        {prop.type}
                                      </span>
                                    </td>
                                    <td className="px-3 py-1.5 text-fg/60">{prop.description}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}

                      {/* Used for */}
                      <div>
                        <label className="block text-sm text-fg/40 mb-1">Used For</label>
                        <p className="text-sm text-fg/70">{ep.usedFor}</p>
                      </div>

                      {/* Source */}
                      <div className="flex flex-wrap gap-4 text-sm">
                        <div>
                          <span className="text-fg/40">File: </span>
                          <span className="font-mono text-fg/60">{ep.file}</span>
                        </div>
                        <div>
                          <span className="text-fg/40">Function: </span>
                          <span className="font-mono text-violet-400">{ep.function}</span>
                        </div>
                        <div>
                          <span className="text-fg/40">Cache: </span>
                          <span className={`font-mono ${getCacheColor(ep.cacheTTL)}`}>{ep.cacheTTL}</span>
                        </div>
                      </div>

                      {/* Try It */}
                      <TryIt ep={ep} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        );
      })}

      {filtered.length === 0 && (
        <div className="text-center py-12 text-fg/40 text-sm">No endpoints match your search</div>
      )}

      {/* Cache TTL Legend */}
      <div className="bg-surface rounded-xl border border-fg/10 p-5 space-y-3">
        <h3 className="font-semibold text-fg text-sm">Cache TTL Legend</h3>
        <p className="text-sm text-fg/40">All caching is in-memory via fetchWithCache() in server/services/espn.js. Stale cache is used as fallback when ESPN requests fail.</p>
        <div className="flex flex-wrap gap-3">
          {Object.entries(CACHE_COLORS).map(([ttl, color]) => (
            <span key={ttl} className={`px-2 py-1 bg-fg/5 rounded text-sm font-mono border border-fg/10 ${color}`}>
              {ttl}
            </span>
          ))}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm text-fg/50 mt-2">
          <div><span className="text-red-400 font-mono">1 min</span> — Live/tournament games (scores change constantly)</div>
          <div><span className="text-orange-400 font-mono">5 min</span> — Daily scoreboards (updated frequently)</div>
          <div><span className="text-amber-400 font-mono">10 min</span> — Team news (semi-frequent updates)</div>
          <div><span className="text-yellow-400 font-mono">30 min</span> — Team stats, injuries, player data</div>
          <div><span className="text-lime-400 font-mono">1 hr</span> — Team lists, rankings (rarely change)</div>
          <div><span className="text-green-400 font-mono">6 hrs</span> — Standings, rosters, player stats</div>
          <div><span className="text-emerald-400 font-mono">24 hrs</span> — Final box scores, standings dates (static)</div>
          <div><span className="text-fg/30 font-mono">None</span> — Uncached (admin one-off lookups)</div>
        </div>
      </div>

      {/* API Domain Reference */}
      <div className="bg-surface rounded-xl border border-fg/10 p-5 space-y-3">
        <h3 className="font-semibold text-fg text-sm">ESPN API Domains</h3>
        <div className="space-y-2 text-sm">
          <div className="flex gap-3 items-start">
            <code className="bg-fg/5 px-2 py-1 rounded font-mono text-blue-400 border border-fg/10 shrink-0">site.api.espn.com</code>
            <span className="text-fg/60">Primary API — scoreboards, teams, schedules, news, statistics. Most commonly used.</span>
          </div>
          <div className="flex gap-3 items-start">
            <code className="bg-fg/5 px-2 py-1 rounded font-mono text-violet-400 border border-fg/10 shrink-0">sports.core.api.espn.com</code>
            <span className="text-fg/60">Core API — detailed standings with full stat breakdowns, injuries, athlete statistics. More granular data.</span>
          </div>
          <div className="flex gap-3 items-start">
            <code className="bg-fg/5 px-2 py-1 rounded font-mono text-emerald-400 border border-fg/10 shrink-0">site.web.api.espn.com</code>
            <span className="text-fg/60">Web API — game summaries, athlete profiles, standings with metadata. Richer response format.</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Try It Component ─────────────────────────────────────────
function TryIt({ ep }) {
  const [paramValues, setParamValues] = useState(() => {
    const initial = {};
    for (const p of ep.params) {
      initial[p.name] = p.example || '';
    }
    return initial;
  });
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState(null);
  const [error, setError] = useState(null);
  const [responseTime, setResponseTime] = useState(null);

  function buildUrl() {
    let url = ep.url;
    for (const [key, val] of Object.entries(paramValues)) {
      url = url.replace(new RegExp(`\\{${key}\\}`, 'g'), val);
    }
    return url;
  }

  async function runRequest() {
    setLoading(true);
    setError(null);
    setResponse(null);
    const start = performance.now();
    try {
      const url = buildUrl();
      const res = await fetch(url);
      const elapsed = Math.round(performance.now() - start);
      setResponseTime(elapsed);
      if (!res.ok) {
        setError(`HTTP ${res.status}: ${res.statusText}`);
        return;
      }
      const data = await res.json();
      setResponse(data);
    } catch (err) {
      setResponseTime(Math.round(performance.now() - start));
      setError(err.message || 'Request failed');
    } finally {
      setLoading(false);
    }
  }

  const resolvedUrl = buildUrl();

  return (
    <div className="border-t border-fg/10 pt-4 space-y-3">
      <div className="flex items-center gap-2">
        <Play className="w-4 h-4 text-emerald-400" />
        <label className="text-sm font-semibold text-fg">Try It</label>
      </div>

      {/* Parameter inputs */}
      {ep.params.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
          {ep.params.map(p => (
            <div key={p.name}>
              <label className="block text-sm text-fg/40 mb-1 font-mono">{`{${p.name}}`}</label>
              <input
                type="text"
                value={paramValues[p.name] || ''}
                onChange={e => setParamValues(prev => ({ ...prev, [p.name]: e.target.value }))}
                placeholder={p.example}
                className="w-full bg-fg/5 border border-fg/10 rounded-lg px-3 py-1.5 text-sm text-fg font-mono placeholder:text-fg/20"
              />
            </div>
          ))}
        </div>
      )}

      {/* Resolved URL + Run button */}
      <div className="flex items-center gap-2">
        <code className="flex-1 bg-fg/5 rounded-lg px-3 py-2 text-sm text-fg/50 font-mono break-all border border-fg/10 truncate">
          {resolvedUrl}
        </code>
        <button
          onClick={runRequest}
          disabled={loading}
          className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50 shrink-0"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
          Run
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2 text-sm text-red-400">
          {error}
          {responseTime != null && <span className="text-fg/30 ml-2">({responseTime}ms)</span>}
        </div>
      )}

      {/* Response */}
      {response && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-sm text-fg/40">
              Response
              {responseTime != null && <span className="ml-2 text-emerald-400 font-mono">{responseTime}ms</span>}
            </label>
            <span className="text-sm text-fg/30 font-mono">
              {JSON.stringify(response).length.toLocaleString()} chars
            </span>
          </div>
          <pre className="bg-fg/5 rounded-lg p-3 text-sm text-fg/60 font-mono overflow-x-auto max-h-96 overflow-y-auto border border-fg/10">
            {JSON.stringify(response, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}

// ─── Helper Components ────────────────────────────────────────
function StatCard({ icon: Icon, label, value, sub, color }) {
  return (
    <div className="bg-surface rounded-xl border border-fg/10 p-4">
      <div className={`w-8 h-8 rounded-lg bg-fg/5 flex items-center justify-center mb-2 ${color}`}>
        <Icon className="w-4 h-4" />
      </div>
      <div className="text-2xl font-bold text-fg">{value}</div>
      <div className="text-sm text-fg/40">{label}</div>
      {sub && <div className="text-sm text-fg/50 mt-0.5">{sub}</div>}
    </div>
  );
}
