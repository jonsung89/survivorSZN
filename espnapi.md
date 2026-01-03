# ESPN NFL API Documentation

This document describes all ESPN API endpoints used in the NFL Pick'em application, including request formats, response schemas, and usage notes.

---

## Table of Contents

1. [Base URLs](#base-urls)
2. [Site API v2 Endpoints](#site-api-v2-endpoints)
   - [Scoreboard](#1-scoreboard)
   - [Teams List](#2-teams-list)
   - [Team Details](#3-team-details)
   - [Team Schedule](#4-team-schedule)
   - [Team Statistics](#5-team-statistics)
   - [Team Roster](#6-team-roster)
   - [Game Summary](#7-game-summary)
   - [Team News](#8-team-news)
3. [Common API v3 Endpoints](#common-api-v3-endpoints)
   - [Athlete Overview](#9-athlete-overview)
4. [Core API v2 Endpoints](#core-api-v2-endpoints)
   - [Team Injuries](#10-team-injuries)
   - [Athlete Statistics](#11-athlete-statistics)
5. [Data Flow Summary](#data-flow-summary)
6. [Caching Strategy](#caching-strategy)

---

## Base URLs

| API | Base URL | Description |
|-----|----------|-------------|
| Site API v2 | `https://site.api.espn.com/apis/site/v2/sports/football/nfl` | Primary API for scores, teams, schedules |
| Common API v3 | `https://site.api.espn.com/apis/common/v3/sports/football/nfl` | Player overviews and detailed stats |
| Core API v2 | `https://sports.core.api.espn.com/v2/sports/football/leagues/nfl` | Detailed stats, injuries, advanced data |

---

## Site API v2 Endpoints

### 1. Scoreboard

**Purpose:** Get current/upcoming games, determine current season year and week.

**URL:** 
```
GET https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard
GET https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?seasontype={type}&week={week}&dates={year}
```

**Parameters:**
| Parameter | Type | Description | Example |
|-----------|------|-------------|---------|
| seasontype | int | 1=Preseason, 2=Regular, 3=Postseason | `2` |
| week | int | Week number (1-18 for regular season) | `15` |
| dates | int | Season year | `2025` |

**Response Schema:**
```typescript
{
  leagues: Array<{
    id: string,              // "28"
    name: string,            // "National Football League"
    abbreviation: string,    // "NFL"
    calendar: Array<{
      label: string,         // "Regular Season"
      value: string,         // "2"
      entries: Array<{
        label: string,       // "Week 1"
        value: string,       // "1"
        startDate: string,   // "2025-09-04T07:00Z"
        endDate: string      // "2025-09-10T06:59Z"
      }>
    }>
  }>,
  season: {
    type: number,            // 2 = Regular Season
    year: number             // 2025
  },
  week: {
    number: number           // 15
  },
  events: Array<GameEvent>   // See GameEvent schema below
}
```

**GameEvent Schema:**
```typescript
{
  id: string,                // "401772767"
  date: string,              // "2025-01-05T18:00Z"
  name: string,              // "San Francisco 49ers at Arizona Cardinals"
  shortName: string,         // "SF @ ARI"
  status: {
    type: {
      id: string,            // "1" pre, "2" in progress, "3" final
      name: string,          // "STATUS_SCHEDULED"
      state: string,         // "pre", "in", "post"
      completed: boolean,
      description: string    // "Scheduled", "Final", "In Progress"
    },
    period: number,          // Current quarter (0-4)
    displayClock: string     // "15:00" or "0:00"
  },
  competitions: Array<{
    id: string,
    date: string,
    venue: {
      fullName: string,      // "State Farm Stadium"
      city: string,          // "Glendale"
      state: string          // "AZ"
    },
    competitors: Array<{
      id: string,            // Team ID "22"
      homeAway: string,      // "home" or "away"
      winner: boolean,
      score: string,         // "24"
      team: {
        id: string,
        name: string,        // "Cardinals"
        abbreviation: string,// "ARI"
        displayName: string, // "Arizona Cardinals"
        logo: string,        // URL to team logo
        color: string,       // "A40227" (hex without #)
        alternateColor: string
      },
      records: Array<{
        type: string,        // "total", "home", "road"
        summary: string      // "4-12"
      }>
    }>,
    odds: Array<{
      provider: { name: string },
      details: string,       // "ARI -3.5"
      overUnder: number,     // 44.5
      spread: number,        // -3.5
      homeTeamOdds: { spreadOdds: number },
      awayTeamOdds: { spreadOdds: number }
    }>
  }>
}
```

**Used For:**
- Determining current NFL season year (`getCurrentSeasonYear()`)
- Getting current week number (`getCurrentWeek()`)
- Fetching games for a specific week (`getWeekGames()`)
- Live scores and game status

**Cache Duration:** 5 minutes (live), 1 hour (static)

---

### 2. Teams List

**Purpose:** Get all 32 NFL teams with basic info.

**URL:**
```
GET https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams
```

**Response Schema:**
```typescript
{
  sports: Array<{
    leagues: Array<{
      teams: Array<{
        team: {
          id: string,            // "1"
          uid: string,           // "s:20~l:28~t:1"
          slug: string,          // "atlanta-falcons"
          abbreviation: string,  // "ATL"
          displayName: string,   // "Atlanta Falcons"
          shortDisplayName: string, // "Falcons"
          name: string,          // "Falcons"
          nickname: string,      // "Falcons"
          location: string,      // "Atlanta"
          color: string,         // "A71930"
          alternateColor: string,// "000000"
          logos: Array<{
            href: string,        // URL to logo
            width: number,
            height: number
          }>,
          record: {
            items: Array<{
              type: string,      // "total", "home", "road"
              summary: string    // "8-8"
            }>
          },
          links: Array<{
            rel: string[],
            href: string
          }>
        }
      }>
    }>
  }>
}
```

**Used For:**
- Building team lookup maps
- League-wide rankings calculation
- Team selection dropdowns

**Cache Duration:** 1 hour

---

### 3. Team Details

**Purpose:** Get detailed info for a specific team.

**URL:**
```
GET https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams/{teamId}
```

**Parameters:**
| Parameter | Type | Description | Example |
|-----------|------|-------------|---------|
| teamId | string | ESPN team ID | `25` (49ers) |

**Response Schema:**
```typescript
{
  team: {
    id: string,
    uid: string,
    slug: string,
    location: string,          // "San Francisco"
    name: string,              // "49ers"
    abbreviation: string,      // "SF"
    displayName: string,       // "San Francisco 49ers"
    color: string,
    alternateColor: string,
    logos: Array<{ href: string }>,
    record: {
      items: Array<{
        type: string,          // "total", "home", "road"
        summary: string        // "12-4"
      }>
    },
    standingSummary: string,   // "2nd in NFC West"
    groups: {
      id: string,              // Conference ID
      parent: {
        id: string             // Division ID  
      }
    }
  }
}
```

**Used For:**
- Team info dialog header (name, logo, record)
- Division/conference standings info

**Cache Duration:** 30 minutes

---

### 4. Team Schedule

**Purpose:** Get full season schedule with results for a team.

**URL:**
```
GET https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams/{teamId}/schedule?season={year}
```

**Parameters:**
| Parameter | Type | Description | Example |
|-----------|------|-------------|---------|
| teamId | string | ESPN team ID | `25` |
| season | int | Season year | `2025` |

**Response Schema:**
```typescript
{
  requestedSeason: {
    year: number,
    type: number
  },
  team: {
    id: string,
    abbreviation: string,
    displayName: string
  },
  events: Array<{
    id: string,                // Game ID "401772767"
    date: string,              // "2025-09-07T20:25Z"
    name: string,              // "San Francisco 49ers at New York Jets"
    shortName: string,         // "SF @ NYJ"
    week: {
      number: number           // 1
    },
    seasonType: {
      id: string,              // "2" = regular season
      type: number
    },
    timeValid: boolean,
    competitions: Array<{
      id: string,
      date: string,
      competitors: Array<{
        id: string,            // Team ID
        homeAway: string,      // "home" or "away"
        winner: boolean | null,
        score: {
          value: number,       // 24
          displayValue: string // "24"
        },
        team: {
          id: string,
          abbreviation: string,
          displayName: string,
          logo: string
        },
        records: Array<{
          type: string,
          summary: string
        }>
      }>,
      status: {
        type: {
          id: string,
          name: string,        // "STATUS_FINAL"
          state: string,       // "post"
          completed: boolean
        }
      }
    }>
  }>
}
```

**Used For:**
- Team schedule tab in team info dialog
- Calculating PPG/Opp PPG from actual game scores
- Win/loss record calculation
- Win/loss streak calculation

**Cache Duration:** 15 minutes

---

### 5. Team Statistics

**Purpose:** Get team-level season statistics.

**URL:**
```
GET https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams/{teamId}/statistics?season={year}
```

**Response Schema:**
```typescript
{
  results: {
    stats: {
      categories: Array<{
        name: string,          // "passing", "rushing", "receiving", etc.
        displayName: string,
        stats: Array<{
          name: string,        // "netPassingYardsPerGame"
          displayName: string, // "Net Passing Yards Per Game"
          abbreviation: string,// "YDS/G"
          value: number,       // 252.3
          displayValue: string,// "252.3"
          rank: number,        // 4 (league rank)
          rankDisplayValue: string // "4th"
        }>
      }>
    },
    leaders: Array<{...}>      // Team statistical leaders (not currently used)
  }
}
```

**Key Stats Available:**
| Stat Name | Description |
|-----------|-------------|
| netPassingYardsPerGame | Team passing yards/game |
| passingTouchdowns | Total passing TDs |
| rushingYardsPerGame | Team rushing yards/game |
| rushingTouchdowns | Total rushing TDs |
| yardsPerRushAttempt | Yards per carry |
| totalPointsPerGame | Points scored per game |
| pointsAgainst | Total points allowed |

**Used For:**
- Team stats tab (passing/rushing yards, TDs)
- League rankings calculation (fetched for all 32 teams)

**Cache Duration:** 30 minutes

---

### 6. Team Roster

**Purpose:** Get all players on a team's roster.

**URL:**
```
GET https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams/{teamId}/roster
```

**Response Schema:**
```typescript
{
  team: {
    id: string,
    displayName: string
  },
  athletes: Array<{
    position: string,          // "offense", "defense", "specialTeam"
    items: Array<{
      id: string,              // Player ID "4361741"
      uid: string,
      guid: string,
      displayName: string,     // "Brock Purdy"
      fullName: string,        // "Brock Purdy"
      shortName: string,       // "B. Purdy"
      jersey: string,          // "13"
      position: {
        id: string,
        name: string,          // "Quarterback"
        displayName: string,   // "Quarterback"
        abbreviation: string   // "QB"
      },
      headshot: {
        href: string,          // URL to player headshot
        alt: string
      },
      status: {
        id: string,
        name: string,          // "Active"
        type: string,
        abbreviation: string
      },
      experience: {
        years: number
      },
      college: {
        name: string           // "Iowa State"
      }
    }>
  }>
}
```

**Used For:**
- Getting list of players by position for "Key Players" section
- Player headshots
- Jersey numbers

**Cache Duration:** 1 hour

---

### 7. Game Summary

**Purpose:** Get detailed game information including betting odds.

**URL:**
```
GET https://site.api.espn.com/apis/site/v2/sports/football/nfl/summary?event={gameId}
```

**Response Schema:**
```typescript
{
  boxscore: {...},
  format: {...},
  gameInfo: {
    venue: {
      fullName: string,
      address: { city: string, state: string }
    },
    attendance: number,
    weather: {
      displayValue: string,    // "Clear, 72°F"
      temperature: number,
      conditionId: string
    }
  },
  predictor: {
    homeTeam: { gameProjection: number },  // Win probability
    awayTeam: { gameProjection: number }
  },
  pickcenter: Array<{
    provider: { name: string },    // "consensus", "numberfire", etc.
    details: string,               // "SF -3.5"
    overUnder: number,             // 47.5
    spread: number,                // -3.5
    homeTeamOdds: {
      favorite: boolean,
      underdog: boolean,
      moneyLine: number,           // -180
      spreadOdds: number,          // -110
      team: { abbreviation: string }
    },
    awayTeamOdds: {
      favorite: boolean,
      underdog: boolean,
      moneyLine: number,           // +160
      spreadOdds: number           // -110
    }
  }>,
  against: {                       // Against the spread records
    teams: Array<{
      team: { abbreviation: string },
      atsOverall: { wins: number, losses: number }
    }>
  },
  news: Array<{...}>
}
```

**Used For:**
- Betting odds display (spread, over/under, moneyline)
- Weather information
- Win probability predictions

**Cache Duration:** 15 minutes

---

### 8. Team News

**Purpose:** Get recent news articles for a team.

**URL:**
```
GET https://site.api.espn.com/apis/site/v2/sports/football/nfl/news?limit={limit}&team={teamId}
```

**Response Schema:**
```typescript
{
  header: string,
  articles: Array<{
    headline: string,          // Article title
    description: string,       // Summary/preview text
    published: string,         // "2025-01-03T14:30:00Z"
    lastModified: string,
    premium: boolean,          // ESPN+ only
    type: string,              // "Story", "HeadlineNews"
    links: {
      web: {
        href: string           // Full article URL
      },
      mobile: {
        href: string
      }
    },
    images: Array<{
      url: string,
      height: number,
      width: number
    }>
  }>
}
```

**Used For:**
- News tab in team info dialog
- Recent headlines about the team

**Cache Duration:** 15 minutes

---

## Common API v3 Endpoints

### 9. Athlete Overview

**Purpose:** Get player statistics overview including season stats.

**URL:**
```
GET https://site.api.espn.com/apis/common/v3/sports/football/nfl/athletes/{playerId}/overview
```

**Response Schema:**
```typescript
{
  statistics: {
    displayName: string,       // "2025 Regular Season"
    names: string[],           // Stat names array
    labels: string[],          // Display labels
    displayNames: string[],    // Full display names
    splits: Array<{
      displayName: string,     // "Regular Season"
      stats: Array<string|number>  // Values matching names[] index
    }>
  },
  gameLog: {
    displayName: string,       // "Recent Games"
    events: {                  // Object keyed by game ID
      [gameId: string]: {
        id: string,
        links: Array<{href: string}>
      }
    },
    statistics: Array<{
      displayName: string,     // "Passing", "Rushing"
      labels: string[],
      names: string[],
      displayNames: string[],
      events: Array<{
        eventId: string,
        stats: string[]        // Per-game stats
      }>
    }>
  },
  news: Array<{...}>,
  nextGame: {...},
  rotowire: {...},
  fantasy: {...}
}
```

**Available Stat Names (by position):**

**QB:**
| Name | Description |
|------|-------------|
| completions | Pass completions |
| passingAttempts | Pass attempts |
| completionPct | Completion percentage |
| passingYards | Total passing yards |
| yardsPerPassAttempt | Yards per attempt |
| passingTouchdowns | Passing TDs |
| interceptions | INTs thrown |
| longPassing | Longest pass |
| QBRating | Passer rating |

**RB:**
| Name | Description |
|------|-------------|
| rushingAttempts | Carries |
| rushingYards | Total rushing yards |
| yardsPerRushAttempt | Yards per carry |
| rushingTouchdowns | Rushing TDs |
| longRushing | Longest run |
| fumbles | Total fumbles |
| fumblesLost | Fumbles lost |

**WR/TE:**
| Name | Description |
|------|-------------|
| receptions | Catches |
| receivingTargets | Targets |
| receivingYards | Total receiving yards |
| yardsPerReception | Yards per catch |
| receivingTouchdowns | Receiving TDs |
| longReception | Longest reception |

**⚠️ Important:** This endpoint does NOT include `gamesPlayed`. Use Core API for GP.

**Used For:**
- Player season stats (yards, TDs, etc.)
- Stats display in Key Players section

**Cache Duration:** 30 minutes

---

## Core API v2 Endpoints

### 10. Team Injuries

**Purpose:** Get injury report for a team.

**URL:**
```
GET https://sports.core.api.espn.com/v2/sports/football/leagues/nfl/teams/{teamId}/injuries
```

**Response Schema:**
```typescript
{
  count: number,
  pageIndex: number,
  pageSize: number,
  pageCount: number,
  items: Array<{
    $ref: string               // URL to individual injury detail
  }>
}
```

**Individual Injury Detail (from $ref):**
```typescript
{
  id: string,
  longComment: string,         // "Questionable for Week 15"
  shortComment: string,        // "Knee"
  status: {
    id: string,
    name: string,              // "Questionable"
    description: string,       // "Questionable"
    abbreviation: string,      // "Q"
    type: string               // "questionable", "out", "injured-reserve"
  },
  athlete: {
    $ref: string,              // URL to athlete details
    id: string,
    displayName: string,       // "Nick Bosa"
    fullName: string,
    position: {
      abbreviation: string     // "DE"
    }
  }
}
```

**Injury Status Types:**
| Status | Description |
|--------|-------------|
| Active | Playing, no injury |
| Questionable | Game-time decision |
| Doubtful | Unlikely to play |
| Out | Will not play this week |
| Injured Reserve | Out for extended period |
| PUP | Physically Unable to Perform |

**Used For:**
- Injury badges on Key Players
- Showing backup players when starter is injured

**Cache Duration:** 30 minutes

---

### 11. Athlete Statistics

**Purpose:** Get detailed player statistics INCLUDING games played.

**URL:**
```
GET https://sports.core.api.espn.com/v2/sports/football/leagues/nfl/seasons/{year}/types/2/athletes/{playerId}/statistics
```

**Parameters:**
| Parameter | Type | Description | Example |
|-----------|------|-------------|---------|
| year | int | Season year | `2025` |
| types | int | 2 = Regular season | `2` |
| playerId | string | ESPN player ID | `4361741` |

**Response Schema:**
```typescript
{
  $ref: string,
  season: {
    year: number,
    displayName: string
  },
  athlete: {
    $ref: string               // URL to athlete details
  },
  seasonType: {
    id: string,
    type: number,
    name: string,
    abbreviation: string
  },
  splits: {
    id: string,
    name: string,              // "Regular Season"
    abbreviation: string,
    type: number,
    categories: Array<{
      name: string,            // "general", "passing", "rushing", etc.
      displayName: string,
      stats: Array<{
        name: string,          // "gamesPlayed"
        displayName: string,   // "Games Played"
        abbreviation: string,  // "GP"
        value: number          // 11
      }>
    }>
  }
}
```

**Key Stats in "general" Category:**
| Name | Description |
|------|-------------|
| gamesPlayed | **Games played** (THE key stat we need!) |
| fumbles | Total fumbles |
| fumblesLost | Fumbles lost |

**Used For:**
- Getting actual games played (GP) for per-game calculations
- Accurate Yds/G, Rec/G calculations

**Cache Duration:** 30 minutes

---

## Data Flow Summary

```
┌─────────────────────────────────────────────────────────────────────┐
│                        getTeamInfo(teamId)                          │
└─────────────────────────────────────────────────────────────────────┘
                                   │
         ┌─────────────────────────┼─────────────────────────┐
         │                         │                         │
         ▼                         ▼                         ▼
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────────┐
│  Team Details   │    │  Team Schedule  │    │   Team Statistics   │
│  /teams/{id}    │    │ /teams/{id}/    │    │   /teams/{id}/      │
│                 │    │   schedule      │    │    statistics       │
├─────────────────┤    ├─────────────────┤    ├─────────────────────┤
│ • Name/Logo     │    │ • All games     │    │ • Passing stats     │
│ • Record        │    │ • Scores        │    │ • Rushing stats     │
│ • Division      │    │ • Opponents     │    │ • League ranks      │
└─────────────────┘    └─────────────────┘    └─────────────────────┘
         │                         │                         │
         │                         ▼                         │
         │              ┌─────────────────┐                  │
         │              │ Calculate PPG   │                  │
         │              │ from actual     │                  │
         │              │ game scores     │                  │
         │              └─────────────────┘                  │
         │                                                   │
         ▼                                                   ▼
┌─────────────────┐                              ┌─────────────────┐
│   Team Roster   │                              │ League Rankings │
│  /teams/{id}/   │                              │ (all 32 teams)  │
│     roster      │                              └─────────────────┘
├─────────────────┤
│ • Player list   │
│ • Positions     │
│ • Headshots     │
└─────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    For each Key Player:                             │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌───────────────────────┐      ┌───────────────────────────────┐  │
│  │   Athlete Overview    │      │    Athlete Statistics         │  │
│  │  (Common API v3)      │      │     (Core API v2)             │  │
│  │  /athletes/{id}/      │      │ /seasons/{yr}/types/2/        │  │
│  │     overview          │      │  athletes/{id}/statistics     │  │
│  ├───────────────────────┤      ├───────────────────────────────┤  │
│  │ • Passing yards       │      │ • gamesPlayed ← KEY!          │  │
│  │ • Rushing yards       │      │ • fumbles                     │  │
│  │ • Receiving yards     │      │                               │  │
│  │ • TDs, INTs           │      │                               │  │
│  └───────────────────────┘      └───────────────────────────────┘  │
│              │                              │                       │
│              └──────────────┬───────────────┘                       │
│                             ▼                                       │
│                  ┌─────────────────────┐                            │
│                  │ Calculate Per-Game  │                            │
│                  │ Stats (Yds/G, etc)  │                            │
│                  └─────────────────────┘                            │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                      Team Injuries                                  │
│           (Core API v2) /teams/{id}/injuries                        │
├─────────────────────────────────────────────────────────────────────┤
│ • Fetched once per team                                             │
│ • Matched to players by name                                        │
│ • Shows injury status badges (Out, IR, Q, D)                        │
│ • Triggers showing backup players                                   │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Caching Strategy

| Endpoint | Cache Duration | Reason |
|----------|----------------|--------|
| Scoreboard (live) | 5 minutes | Scores update frequently |
| Scoreboard (static) | 1 hour | Future games don't change |
| Teams List | 1 hour | Rarely changes |
| Team Details | 30 minutes | Record updates after games |
| Team Schedule | 15 minutes | Scores update after games |
| Team Statistics | 30 minutes | Updates after games |
| Team Roster | 1 hour | Rarely changes mid-week |
| Game Summary | 15 minutes | Odds can change |
| Athlete Overview | 30 minutes | Stats update after games |
| Athlete Statistics | 30 minutes | Stats update after games |
| Team Injuries | 30 minutes | Can change daily |
| Team News | 15 minutes | New articles frequently |
| League Rankings | 1 hour | Calculated from team stats |

---

## Error Handling

All endpoints can return:
- **404**: Resource not found (invalid ID, future season, etc.)
- **500**: Server error (retry with backoff)
- **Rate limited**: No specific code, just slow/failed responses

The app uses a `fetchWithCache` wrapper that:
1. Checks cache first
2. Returns cached data if valid
3. Fetches fresh data if cache miss/expired
4. Logs errors but doesn't crash

---

## Common Team IDs

| Team | ID | Team | ID |
|------|-----|------|-----|
| Cardinals | 22 | Dolphins | 15 |
| Falcons | 1 | Vikings | 16 |
| Ravens | 33 | Patriots | 17 |
| Bills | 2 | Saints | 18 |
| Panthers | 29 | Giants | 19 |
| Bears | 3 | Jets | 20 |
| Bengals | 4 | Raiders | 13 |
| Browns | 5 | Eagles | 21 |
| Cowboys | 6 | Steelers | 23 |
| Broncos | 7 | Chargers | 24 |
| Lions | 8 | 49ers | 25 |
| Packers | 9 | Seahawks | 26 |
| Texans | 34 | Rams | 14 |
| Colts | 11 | Buccaneers | 27 |
| Jaguars | 30 | Titans | 10 |
| Chiefs | 12 | Commanders | 28 |

---

## Notes & Gotchas

1. **Season Type IDs:**
   - 1 = Preseason
   - 2 = Regular Season
   - 3 = Postseason

2. **Game Status IDs:**
   - 1 = Scheduled (pre)
   - 2 = In Progress (in)
   - 3 = Final (post)

3. **gamesPlayed** is ONLY available in the Core API athlete statistics endpoint, not in the Common API overview.

4. **Team colors** are provided without the `#` prefix (e.g., "A71930" not "#A71930").

5. **Odds data** may be missing for future games until lines are set (usually Tuesday/Wednesday for Sunday games).

6. **Injury data** requires fetching individual `$ref` URLs for full details - the list endpoint only provides references.

7. **gameLog in athlete overview** only shows "Recent Games" (typically last 5), not the full season.