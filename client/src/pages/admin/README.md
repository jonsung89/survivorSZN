# Admin Portal

Internal admin dashboard for SurvivorSZN. Requires `is_admin = true` on the user's record in the `users` table.

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | React 18, Vite, Tailwind CSS |
| Charts | Recharts |
| Icons | Lucide React |
| Backend | Express.js (Node.js) |
| Database | PostgreSQL (Supabase) |
| Real-time | Socket.io |
| Auth | Firebase JWT verification (jose library) |
| Deployment | Railway (backend + static build) |

## Architecture

### Frontend

All admin pages live under `client/src/pages/admin/`. Routing is protected by `AdminRoute` in `App.jsx` — redirects non-admin users.

```
pages/admin/
├── AdminLayout.jsx              # Sidebar nav with sport sections + tools
├── AdminDashboard.jsx           # Main analytics hub
├── AdminUsers.jsx               # User management
├── AdminLeagues.jsx             # League management
├── AdminReports.jsx             # NCAAB scouting report generation
├── AdminMatchups.jsx            # NCAAB matchup report generation
├── AdminBracketTest.jsx         # Bracket challenge testing
├── AdminChatModeration.jsx      # Chat moderation tools
├── AdminAnalytics.jsx           # Gamecast analytics
├── AdminAnnouncements.jsx       # Announcement system
└── components/
    ├── StatCard.jsx              # Metric card with delta indicator + description tooltip
    ├── TimeRangeSelector.jsx     # 7D / 30D / 90D pill toggle
    ├── DashboardAreaChart.jsx    # Themed area chart (Recharts)
    ├── DashboardBarChart.jsx     # Themed bar chart (Recharts)
    ├── HorizontalBarChart.jsx    # Horizontal bar chart for top pages
    └── useChartTheme.js          # Hook for dark/light chart colors
```

### Theming

- Uses `isDark` from `useTheme()` — **not** Tailwind `dark:` variants
- CSS custom properties: `bg-canvas`, `bg-surface`, `text-fg`, `border-fg/N`
- Charts use `useChartTheme()` hook for coordinated dark/light colors

### Backend

All admin routes are in `server/routes/admin.js`, protected by `adminMiddleware` (Firebase JWT + `is_admin` check).

### API Client

All admin API calls are in `client/src/api.js` under the `adminAPI` object.

## Sidebar Navigation

- **Core:** Dashboard, Users, Leagues
- **March Madness:** Scouting Reports, Matchup Reports, Bracket Testing
- **NFL Survivor:** (extensible, coming soon)
- **Tools:** Chat Moderation, Analytics, Announcements

## Pages

### Dashboard (`/admin`)

Real-time analytics hub with:

- **Row 1 (4 cards):** Online Now (LIVE, polls every 30s), Page Views Today, Signups Today, Logins Today
- **Row 2 (3 cards):** Total Users, Active (24h), Active Leagues
- **Row 3:** User Activity area chart — toggleable series (Active Users, Signups, Chat Messages)
- **Row 4:** Top Pages (horizontal bar, own range selector) + Chat Activity area chart
- **Row 5:** Monthly Overview — side-by-side MAU + New Leagues bar charts
- **Row 6 (3 cards):** Brackets Submitted, Gamecast Sessions (30d), Picks Made (30d)
- **Row 7:** Recent Signups + Quick Actions

All stat cards have click-to-reveal descriptions explaining what the metric measures.

### Users (`/admin/users`)

- Search by name, email, or phone
- Paginated list (25 per page)
- Click into individual user profiles — see league memberships, status
- Toggle admin status, disable/enable accounts

### Leagues (`/admin/leagues`)

- Search + filter by sport and status
- View members, commissioner, strikes
- Delete leagues

### Scouting Reports (`/admin/march-madness/reports`)

- AI-generated scouting reports for NCAAB tournament teams
- Full and concise versions per team
- Track completion status, regenerate as needed

### Matchup Reports (`/admin/march-madness/matchups`)

- AI-generated matchup predictions grouped by tournament round
- View and regenerate reports

### Bracket Testing (`/admin/march-madness/bracket-test`)

- Manage bracket challenges
- Set individual game results
- Auto-recalculates all bracket scores on result entry

### Chat Moderation (`/admin/chat`)

- Browse messages per league with search
- Soft-delete messages (preserves record, nullifies content)
- Review and resolve user reports
- Create/remove bans (global or per-league, optional expiry)

### Analytics (`/admin/analytics`)

- Gamecast session metrics: total sessions, avg duration, expand clicks
- Top games by engagement

### Announcements (`/admin/announcements`)

- Create/edit/delete announcements
- Target: all users, specific leagues, admins only, by sport
- Optional expiration dates

## API Endpoints

All routes prefixed with `/api/admin`, require admin auth.

### Stats & Dashboard
| Method | Path | Description |
|--------|------|-------------|
| GET | `/stats` | Basic counts (users, leagues, reports, brackets) |
| GET | `/stats/online` | Live connected user count (lightweight, for polling) |
| GET | `/stats/top-pages?range=30d` | Top pages by views (today/7d/30d/month/year) |
| GET | `/stats/dashboard?range=30` | Full dashboard payload (time-series, monthly, engagement, recent signups) |

### Users
| Method | Path | Description |
|--------|------|-------------|
| GET | `/users?search=&page=1&limit=25` | Paginated user list |
| GET | `/users/:id` | User detail + league memberships |
| PUT | `/users/:id/toggle-admin` | Promote/demote admin |
| PUT | `/users/:id/toggle-disabled` | Enable/disable account |

### Leagues
| Method | Path | Description |
|--------|------|-------------|
| GET | `/leagues?search=&sportId=&status=&page=1&limit=25` | Filtered league list |
| GET | `/leagues/:id` | League detail + member list |
| DELETE | `/leagues/:id` | Delete league |

### Scouting Reports
| Method | Path | Description |
|--------|------|-------------|
| GET | `/reports?season=2025` | Teams with report status |
| GET | `/reports/:teamId?season=2025` | Full + concise report |
| POST | `/reports/generate` | Generate reports (optional: force, incomplete-only, specific team) |

### Bracket Challenges
| Method | Path | Description |
|--------|------|-------------|
| GET | `/challenges` | All challenges |
| GET | `/challenges/:id` | Challenge detail + results |
| POST | `/challenges/:id/set-result` | Set game result + recalculate scores |
| DELETE | `/challenges/:id` | Delete challenge |

### Chat Moderation
| Method | Path | Description |
|--------|------|-------------|
| GET | `/chat/leagues` | Leagues with message counts |
| GET | `/chat/leagues/:id/messages?search=&page=1&limit=50` | Messages with user info |
| DELETE | `/chat/messages/:id` | Soft delete message |
| GET | `/chat/reports` | Pending reports |
| PUT | `/chat/reports/:id/resolve` | Resolve report |
| POST | `/chat/bans` | Create ban |
| GET | `/chat/bans` | Active bans |
| DELETE | `/chat/bans/:id` | Remove ban |

### Analytics
| Method | Path | Description |
|--------|------|-------------|
| GET | `/analytics/gamecast` | Gamecast session summary |

### Announcements
| Method | Path | Description |
|--------|------|-------------|
| GET | `/announcements` | All announcements |
| POST | `/announcements` | Create announcement |
| PUT | `/announcements/:id` | Update announcement |
| DELETE | `/announcements/:id` | Delete announcement |

## Related Non-Admin Routes

| Method | Path | File | Description |
|--------|------|------|-------------|
| POST | `/api/track/pageview` | `server/routes/tracking.js` | Page view tracking (skips admins) |
| POST | `/api/analytics/gamecast-session` | `server/routes/analytics.js` | Gamecast session tracking (skips admins) |
| GET | `/api/analytics/announcements/active` | `server/routes/analytics.js` | Active announcements for users |

## Database Tables

Key tables used by the admin system:

| Table | Purpose |
|-------|---------|
| `users` | User accounts, admin flag, login tracking |
| `leagues` | League metadata |
| `league_members` | Membership, strikes, join dates |
| `brackets` | Bracket entries and scores |
| `bracket_results` | Game results for scoring |
| `scouting_reports` | AI-generated NCAAB team reports |
| `matchup_reports` | AI-generated matchup predictions |
| `chat_messages` | Chat history (soft delete support) |
| `chat_reports` | User-submitted chat reports |
| `chat_bans` | Global or per-league bans |
| `gamecast_sessions` | Gamecast viewing analytics |
| `announcements` | Admin announcements |
| `page_views` | Server-side page view tracking |

## Real-Time Features

- **Online user count:** Socket.io tracks `globalConnectedUsers` (Map of userId → Set of socketIds). Exported via `getOnlineUserCount()` for the `/stats/online` endpoint.
- **Chat:** Socket.io handles message sending, typing indicators, mention notifications, and online user lists per league.
- **Live scores:** Separate `/scores` namespace for unauthenticated live score updates.

## Middleware

| Middleware | File | Purpose |
|------------|------|---------|
| `authMiddleware` | `server/middleware/auth.js` | Firebase JWT verification via jose (remote JWKS) |
| `adminMiddleware` | `server/middleware/admin.js` | Chains auth + `is_admin` check, sets `req.adminUser` |
| `optionalAuth` | `server/middleware/auth.js` | Allows unauthenticated requests (used for announcements) |

## Analytics Strategy

- **Firebase Analytics** — client-side event tracking (page views, custom events). Admin users are excluded via `isExcluded` flag. Data viewable in Firebase Console.
- **Server-side tracking** — `page_views` table for queryable page view data within the admin dashboard. Admin users are excluded via `is_admin` check on insert.
- **Gamecast sessions** — tracked server-side with duration and engagement metrics. Admin users excluded.
