# 🏈 SurvivorSZN

A modern NFL Survivor Pool web application where players pick one NFL team to win each week. Pick correctly and survive. Pick wrong and get a strike. Last one standing wins!

**Live Site:** [survivorszn.com](https://survivorszn.com)

---

## Features

### For Players
- **Weekly Picks** - Select one NFL team to win each week
- **Edit Picks** - Change your pick anytime before the game starts
- **Team Restrictions** - Can only use each team once per season
- **Live Standings** - See how you stack up against other players
- **Pick History** - Track your picks and results across the season
- **Multiple Leagues** - Join or create multiple survivor pools

### For Commissioners
- **League Management** - Create and customize leagues
- **Flexible Rules** - Set max strikes (1-3), start week, double-pick weeks
- **Entry Fees** - Track payments with prize pot display
- **Member Management** - Add/remove strikes, set picks for members
- **Action Log** - Full history of commissioner actions
- **Invite System** - Share invite links or codes to grow your league

### App Features
- **Real-time NFL Data** - Live scores, schedules, and team stats from ESPN API
- **Mobile-First Design** - Responsive UI that works great on any device
- **Google & Phone Auth** - Sign in with Google or phone number via Firebase
- **Countdown Timer** - Dashboard shows time until next kickoff

---

## Tech Stack

### Frontend
- **React 18** - UI framework
- **Vite** - Build tool
- **Tailwind CSS** - Styling
- **React Router** - Navigation
- **Lucide React** - Icons ([lucide.dev](https://lucide.dev))
- **Firebase Auth** - Authentication

### Backend
- **Node.js + Express** - API server
- **PostgreSQL** - Database (hosted on Supabase)
- **Firebase Admin SDK** - Auth verification

### Hosting
- **Vercel** - Frontend hosting
- **Railway** - Backend hosting
- **Supabase** - PostgreSQL database
- **Porkbun** - Domain registrar

---

## Project Structure

```
├── frontend/
│   ├── src/
│   │   ├── api.js              # API client functions
│   │   ├── firebase.js         # Firebase configuration
│   │   ├── App.jsx             # Main app with routing
│   │   ├── components/
│   │   │   ├── Navbar.jsx
│   │   │   ├── Footer.jsx
│   │   │   ├── Loading.jsx
│   │   │   ├── Toast.jsx
│   │   │   ├── Onboarding.jsx
│   │   │   ├── EmailPrompt.jsx
│   │   │   └── ShareLeague.jsx
│   │   ├── context/
│   │   │   └── AuthContext.jsx # Auth state management
│   │   └── pages/
│   │       ├── Login.jsx
│   │       ├── Dashboard.jsx
│   │       ├── Leagues.jsx
│   │       ├── CreateLeague.jsx
│   │       ├── JoinLeague.jsx
│   │       ├── JoinByInvite.jsx
│   │       ├── LeagueDetail.jsx
│   │       ├── MakePick.jsx
│   │       └── Schedule.jsx
│   └── index.html
│
├── backend/
│   ├── index.js                # Express server entry
│   ├── db/
│   │   └── supabase.js         # Database connection
│   ├── middleware/
│   │   └── auth.js             # Firebase auth middleware
│   ├── routes/
│   │   ├── users-pg.js         # User endpoints
│   │   ├── leagues-pg.js       # League endpoints
│   │   ├── picks-pg.js         # Pick endpoints
│   │   └── nfl.js              # NFL data endpoints
│   └── services/
│       └── nfl.js              # ESPN API integration
│
└── README.md
```

---

## Environment Variables

### Frontend (.env)
```bash
VITE_API_URL=https://your-api.railway.app/api
VITE_FIREBASE_API_KEY=your_firebase_api_key
VITE_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your_project_id
VITE_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
VITE_FIREBASE_APP_ID=your_app_id
```

### Backend (.env)
```bash
PORT=3001
DATABASE_URL=postgresql://user:pass@host:5432/dbname
FIREBASE_PROJECT_ID=your_project_id
FIREBASE_CLIENT_EMAIL=firebase-adminsdk@your_project.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
CORS_ORIGIN=https://survivorszn.com
```

---

## Local Development

### Prerequisites
- Node.js 18+
- PostgreSQL database
- Firebase project with Authentication enabled

### Backend Setup
```bash
cd backend
npm install
cp .env.example .env  # Configure your environment variables
npm run dev           # Starts on http://localhost:3001
```

### Frontend Setup
```bash
cd frontend
npm install
cp .env.example .env  # Configure your environment variables
npm run dev           # Starts on http://localhost:5173
```

---

## Database Schema

### Users
```sql
CREATE TABLE users (
  id UUID PRIMARY KEY,
  firebase_uid VARCHAR UNIQUE NOT NULL,
  phone VARCHAR,
  email VARCHAR,
  display_name VARCHAR,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

### Leagues
```sql
CREATE TABLE leagues (
  id UUID PRIMARY KEY,
  name VARCHAR NOT NULL,
  commissioner_id UUID REFERENCES users(id),
  invite_code VARCHAR UNIQUE,
  max_strikes INTEGER DEFAULT 1,
  start_week INTEGER DEFAULT 1,
  season INTEGER,
  status VARCHAR DEFAULT 'active',
  double_pick_weeks INTEGER[],
  entry_fee DECIMAL DEFAULT 0,
  prize_pot_override DECIMAL,
  created_at TIMESTAMP DEFAULT NOW()
);
```

### League Members
```sql
CREATE TABLE league_members (
  id UUID PRIMARY KEY,
  league_id UUID REFERENCES leagues(id),
  user_id UUID REFERENCES users(id),
  strikes INTEGER DEFAULT 0,
  status VARCHAR DEFAULT 'active',
  has_paid BOOLEAN DEFAULT false,
  joined_at TIMESTAMP DEFAULT NOW()
);
```

### Picks
```sql
CREATE TABLE picks (
  id UUID PRIMARY KEY,
  league_id UUID REFERENCES leagues(id),
  user_id UUID REFERENCES users(id),
  week INTEGER NOT NULL,
  team_id VARCHAR NOT NULL,
  game_id VARCHAR,
  result VARCHAR DEFAULT 'pending',
  pick_number INTEGER DEFAULT 1,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

### Commissioner Actions
```sql
CREATE TABLE commissioner_actions (
  id UUID PRIMARY KEY,
  league_id UUID REFERENCES leagues(id),
  performed_by UUID REFERENCES users(id),
  action VARCHAR NOT NULL,
  target_user_id UUID,
  target_user_name VARCHAR,
  week INTEGER,
  team_id VARCHAR,
  reason TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);
```

---

## API Endpoints

### Authentication
All protected endpoints require `Authorization: Bearer <firebase_token>` header.

### Users
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/users/sync` | Sync user from Firebase auth |
| PUT | `/api/users/display-name` | Update display name |
| PUT | `/api/users/email` | Update email |
| GET | `/api/users/pending-picks` | Get leagues needing picks |

### Leagues
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/leagues` | Create a league |
| GET | `/api/leagues/my-leagues` | Get user's leagues |
| GET | `/api/leagues/available` | Browse public leagues |
| GET | `/api/leagues/:id` | Get league details |
| POST | `/api/leagues/:id/join` | Join a league |
| PUT | `/api/leagues/:id/settings` | Update league settings |
| GET | `/api/leagues/:id/standings` | Get standings with picks |
| GET | `/api/leagues/invite/:code` | Get league by invite code |

### Picks
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/picks` | Make or update a pick |
| GET | `/api/picks/league/:id` | Get user's picks for league |
| GET | `/api/picks/available/:id/:week` | Get available teams |
| POST | `/api/picks/update-results` | Process game results |

### NFL Data
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/nfl/season` | Get current season/week |
| GET | `/api/nfl/teams` | Get all NFL teams |
| GET | `/api/nfl/schedule/:week` | Get week schedule |

---

## Deployment

### Frontend (Vercel)
1. Connect GitHub repo to Vercel
2. Set framework preset to "Vite"
3. Add environment variables
4. Deploy

### Backend (Railway)
1. Connect GitHub repo to Railway
2. Add PostgreSQL plugin or connect to Supabase
3. Add environment variables
4. Deploy

### Domain Setup (Porkbun → Vercel)
```
Type: A     Name: @    Value: 76.76.21.21
Type: CNAME Name: www  Value: cname.vercel-dns.com
```

---

## Cron Jobs

The app uses a cron job to automatically update pick results after games complete:

```bash
# Run every hour during NFL season
0 * * * * curl -X POST https://your-api.railway.app/api/picks/update-results
```

This checks completed games and:
- Marks picks as `win` or `loss`
- Adds strikes for losses
- Eliminates players who exceed max strikes

---

## Contributing

1. Fork the repo
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## License

MIT License - feel free to use this for your own survivor pools!

---

## Support

- **Email:** jonsung89@gmail.com
- **Issues:** Open a GitHub issue

---

Made with ❤️ for NFL fans