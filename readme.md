# 🏈 SurvivorSZN

A modern **survivor pool** and **bracket challenge** platform. Pick one team to win each week—survive or get a strike. Last one standing wins. Plus March Madness–style bracket challenges for NCAAB leagues.

**Live site:** [survivorszn.com](https://survivorszn.com)

---

## Table of contents

- [Features](#features)
- [Tech stack](#tech-stack)
- [Architecture](#architecture)
- [Quick start](#quick-start)
- [Project structure](#project-structure)
- [Environment variables](#environment-variables)
- [Local development](#local-development)
- [Database](#database)
- [API overview](#api-overview)
- [Cron jobs](#cron-jobs)
- [Deployment](#deployment)
- [Contributing](#contributing)
- [Support](#support)

---

## Features

### For players

- **Picks** — Make and update your picks; when and how depend on each league or challenge.
- **Standings** — See how you stack up; track picks and results.
- **Multiple leagues** — Join or create as many leagues as you want.
- **Bracket challenges** — Fill out brackets, tiebreakers, and leaderboards (e.g. NCAAB).

### For commissioners

- **League management** — Create leagues with password and invite codes.
- **Flexible rules** — Set max strikes, start period, double-pick periods, and more.
- **Entry fees & payments** — Track payments and prize pot.
- **Member management** — Add/remove strikes, set picks for members, action log.
- **Invite system** — Share invite links or codes.

### App features

- **Multi-sport** — NFL, NBA, NHL, MLB survivor pools; NCAAB bracket challenges.
- **Live data** — Schedules and scores via ESPN API.
- **Mobile-first** — Responsive UI, dark/light theme.
- **Auth** — Sign in with Google or phone (Firebase).
- **Real-time chat** — Per-league chat (Socket.io).
- **Notifications** — In-app notification panel.

---

## Tech stack

| Layer      | Tech |
|-----------|------|
| **Frontend** | React 18, Vite, Tailwind CSS, React Router, Lucide React, Firebase Auth |
| **Backend**  | Node.js, Express, PostgreSQL (Supabase), Firebase JWT verification, Socket.io |
| **Hosting**  | Vercel (frontend), Railway (backend), Supabase (DB), Porkbun (domain) |

---

## Architecture

High-level flow: the React app talks to the Express API (and Socket.io for chat); the API verifies Firebase JWTs and reads/writes PostgreSQL; sport data comes from ESPN.

```mermaid
flowchart TB
  subgraph Client["Client (Vercel)"]
    UI[React + Vite]
    Auth[Firebase Auth]
  end

  subgraph Backend["Backend (Railway)"]
    API[Express API]
    WS[Socket.io]
  end

  DB[(PostgreSQL\nSupabase)]
  ESPN[ESPN API]

  UI --> Auth
  UI -->|REST + JWT| API
  UI --> WS
  Auth -->|ID token| API
  API --> DB
  API --> ESPN
  WS --> API
```

- **Browser** loads the React SPA; user signs in with **Firebase Auth** (Google or phone).
- **React** sends `Authorization: Bearer <firebase_token>` to **Express**; middleware verifies the JWT and attaches the user to the request.
- **Express** serves REST routes under `/api/*`, uses **PostgreSQL** for leagues, picks, users, brackets, and calls **ESPN** for schedules and scores.
- **Socket.io** uses the same server and token for real-time league chat.

---

## Quick start

From the **repo root**:

```bash
git clone <your-repo-url>
cd survivorSZN

# Install root + client dependencies
npm run install-all

# Copy env files and add your keys (see Environment variables)
cp server/.env.example server/.env
# Create client/.env with VITE_* and Firebase config

# Run backend + frontend together
npm run dev
```

- **Backend:** http://localhost:3001  
- **Frontend:** http://localhost:5173 (Vite)  
- **Health check:** http://localhost:3001/health  

---

## Project structure

The repo uses **`client/`** and **`server/`** (not `frontend/` or `backend/`).

```
survivorSZN/
├── client/                    # Vite + React app
│   ├── public/
│   ├── src/
│   │   ├── api.js             # API client (authFetch, leagueAPI, picksAPI, etc.)
│   │   ├── firebase.js        # Firebase config
│   │   ├── App.jsx            # Routes, ProtectedRoute, AdminRoute
│   │   ├── main.jsx
│   │   ├── index.css          # Tailwind + theme (dark/light) CSS variables
│   │   ├── components/       # Navbar, Footer, Toast, Onboarding, ShareLeague, bracket/*, etc.
│   │   ├── context/           # AuthContext, ThemeContext, SocketContext
│   │   ├── hooks/             # useBracketKeyboard, useSwipe
│   │   ├── pages/             # Dashboard, Leagues, LeagueDetail, MakePick, Schedule, Bracket*, admin/*
│   │   ├── sports/           # Per-sport constants & helpers (nfl, nba, nhl, mlb, ncaab)
│   │   └── utils/            # bracketSlots, logo
│   ├── index.html
│   ├── vite.config.js
│   └── tailwind.config.js
│
├── server/                    # Express API + Socket.io
│   ├── index.js               # App entry, CORS, route mounting, Socket.io, initDb
│   ├── db/
│   │   ├── supabase.js        # PostgreSQL pool + initDb (creates tables/indexes)
│   │   └── migrations/
│   ├── middleware/
│   │   ├── auth.js            # Firebase JWT (authMiddleware, optionalAuth)
│   │   └── admin.js           # Admin-only routes (requires is_admin)
│   ├── routes/                # All under /api/*
│   │   ├── leagues-pg.js      # Leagues, invite, standings, commissioner actions
│   │   ├── picks-pg.js        # Picks, update-results (cron)
│   │   ├── users-pg.js        # User sync, display name, email, pending-picks
│   │   ├── nfl.js             # NFL season, teams, schedule, game details
│   │   ├── sports.js          # List sports
│   │   ├── schedule.js        # Multi-sport schedule/teams/games
│   │   ├── brackets.js        # Bracket challenges, brackets, tournament data, update-results (cron)
│   │   ├── chat.js            # League chat
│   │   ├── notifications-pg.js
│   │   └── admin.js           # Admin panel (users, leagues, reports, challenges)
│   ├── services/              # ESPN, NCAAB tournament, SMS (Twilio), etc.
│   ├── socket/
│   │   └── handlers.js        # Socket.io auth + chat
│   ├── sports/                # Per-sport providers (nfl, nba, nhl, mlb, ncaab)
│   └── utils/                 # bracket-slots, etc.
│
├── package.json               # Root scripts: dev, install-all, build, start
└── README.md
```

**Root scripts (from repo root):**

| Script         | Description |
|----------------|-------------|
| `npm run dev`  | Run server (nodemon) + client (Vite) together |
| `npm run server` | Run server only |
| `npm run client` | Run client only |
| `npm run install-all` | `npm install` in root and in `client/` |
| `npm run build` | Build client for production (`client/dist`) |
| `npm run start` | Run server only (production) |

---

## Environment variables

### Client (`client/.env`)

Used by Vite; prefix with `VITE_` so they're exposed to the app.

```bash
# API base URL (no trailing slash). Socket.io uses same host.
VITE_API_URL=http://localhost:3001/api

# Firebase (from Firebase Console → Project settings)
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your_project_id
VITE_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=
```

For production, set `VITE_API_URL` to your backend URL (e.g. `https://your-api.railway.app/api`).

### Server (`server/.env`)

The app reads these; the database connection in `server/db/supabase.js` currently uses **Supabase** and expects at least:

```bash
PORT=3001
# Supabase PostgreSQL (connection details may be partially in code; password required)
SUPABASE_DB_PASSWORD=your_database_password

# CORS (comma-separated for multiple origins)
CORS_ORIGIN=http://localhost:5173,https://survivorszn.com
```

Optional / feature-specific:

```bash
# Firebase Admin (if you add server-side Firebase Admin usage)
# FIREBASE_PROJECT_ID=your_project_id
# FIREBASE_CLIENT_EMAIL=...
# FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"

# Twilio (SMS verification; auth routes are not mounted by default—app uses Firebase)
# TWILIO_ACCOUNT_SID=...
# TWILIO_AUTH_TOKEN=...
# TWILIO_PHONE_NUMBER=...
# SMS_MODE=mock   # use 'mock' to skip real SMS and return code in response

# NCAAB bracket AI reports (Claude)
# ANTHROPIC_API_KEY=...
```

Copy from `server/.env.example` and fill in values.

---

## Local development

### Prerequisites

- **Node.js 18+**
- **PostgreSQL** (e.g. Supabase free tier)
- **Firebase project** with Authentication enabled (Google + Phone if needed)

### Steps

1. **Clone and install**
   ```bash
   npm run install-all
   ```

2. **Server env**
   ```bash
   cp server/.env.example server/.env
   # Edit server/.env: SUPABASE_DB_PASSWORD, CORS_ORIGIN
   ```

3. **Client env**
   ```bash
   # Create client/.env with VITE_API_URL and VITE_FIREBASE_*
   ```

4. **Run**
   ```bash
   npm run dev
   ```

5. Open **http://localhost:5173**. Use **Login** with Google or phone. The server will create/update your user on first sign-in via `/api/users/sync`.

### Running server or client only

- Backend only: `npm run server` (from root) or `node server/index.js` from `server/`.
- Frontend only: `npm run client` (from root) or `npm run dev` from `client/`. Point `VITE_API_URL` at your running API.

---

## Database

The app uses **PostgreSQL**. Tables are created and migrated in **`server/db/supabase.js`** (`initDb()`), which runs on server start.

Main tables:

- **users** — `id`, `firebase_uid`, `phone`, `email`, `display_name`, `is_admin`, …
- **leagues** — `id`, `name`, `commissioner_id`, `password_hash`, `invite_code`, `max_strikes`, `start_week`, `season`, `sport_id`, …
- **league_members** — `league_id`, `user_id`, `strikes`, `status`, `has_paid`, …
- **picks** — `league_id`, `user_id`, `week`, `team_id`, `game_id`, `result`, `pick_number`, …
- **bracket_challenges** — league NCAAB bracket config (scoring, deadline, etc.)
- **brackets** — user bracket picks and tiebreaker
- **bracket_results** — per-challenge game results for scoring
- **commissioner_actions** — audit log for commissioner actions
- **sports** — sport config (nfl, nba, nhl, mlb, ncaab)

The README doesn't repeat the full DDL; it lives in `initDb()` and migrations. Use your DB client or Supabase dashboard to inspect schema after first run.

---

## API overview

Base path: **`/api`**. Protected routes require:

```http
Authorization: Bearer <firebase_id_token>
```

| Prefix            | Purpose |
|-------------------|--------|
| `GET /api/sports` | List sports (public) |
| `POST/GET /api/leagues/*` | Create, join, standings, invite, settings, commissioner actions |
| `POST/GET /api/picks/*`   | Make pick, list picks, available teams |
| `POST/GET /api/users/*`   | Sync user, display name, email, pending-picks, history, stats |
| `GET /api/nfl/*`          | Season, teams, schedule, game details (public) |
| `GET /api/schedule/*`     | Multi-sport schedule, teams, games (public) |
| `POST/GET /api/brackets/*`| Bracket challenges, brackets, tournament data, leaderboard |
| `GET/POST /api/chat/*`    | League chat (authenticated) |
| `GET/PUT/DELETE /api/notifications/*` | Notifications (authenticated) |
| `GET/POST /api/admin/*`   | Admin panel (requires `is_admin`) |

**Cron-style endpoints** (no auth; should be secured with a secret in production):

- `POST /api/picks/update-results` — Resolve pending picks from finished games.
- `POST /api/brackets/update-results` — Update bracket challenge results from tournament data.

**Health:** `GET /health` returns `{ status: 'ok', timestamp }`.

---

## Cron jobs

For production, run these on a schedule (e.g. hourly during season). **Recommendation:** protect them with a shared secret (e.g. header or query param) so only your scheduler can call them.

**Pick results** (survivor pools):

```bash
# Example: every hour
0 * * * * curl -s -X POST "https://YOUR_API_URL/api/picks/update-results"
```

- Finds pending picks whose games are final.
- Sets `result` to `win` or `loss`, updates strikes, eliminates players who exceed max strikes.

**Bracket results** (NCAAB):

```bash
0 * * * * curl -s -X POST "https://YOUR_API_URL/api/brackets/update-results"
```

- Updates bracket challenge results from tournament data and recomputes scores.

---

## Deployment

### Frontend (Vercel)

1. Connect the repo to Vercel.
2. Set **Root Directory** to `client` (or set build command to `cd client && npm run build` and output to `client/dist`).
3. Framework preset: **Vite**.
4. Add env vars: all `VITE_*` from `client/.env`, with `VITE_API_URL` pointing to your production API.

### Backend (Railway)

1. Connect the repo; set **Root Directory** to project root (so `server/` and `package.json` are used).
2. Build: `npm run install-all` or `npm install && cd client && npm install` (if you need client for a monorepo build). Start: `npm run start` or `node server/index.js`.
3. Add env vars from `server/.env` (at least `PORT`, `SUPABASE_DB_PASSWORD`, `CORS_ORIGIN`). Use production CORS origins (e.g. `https://survivorszn.com`).
4. If you serve the built client from the same app in production, the server already serves `client/dist` when `NODE_ENV=production`.

### Domain (e.g. Porkbun → Vercel)

- **A** — `@` → Vercel's IP (e.g. `76.76.21.21`).
- **CNAME** — `www` → `cname.vercel-dns.com` (or your Vercel host).

---

## Contributing

1. Fork the repo.
2. Create a branch: `git checkout -b feature/your-feature`.
3. Commit: `git commit -m 'Add your feature'`.
4. Push: `git push origin feature/your-feature`.
5. Open a Pull Request.

---

## Support

- **Email:** jonsung89@gmail.com  
- **Issues:** [Open a GitHub issue](https://github.com/your-username/survivorSZN/issues)

---

**License:** MIT — use it for your own survivor pools and bracket leagues.

Made with ❤️ for football and sports fans.
