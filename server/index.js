require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const http = require('http');
const { Server } = require('socket.io');

// Import routes (PostgreSQL versions)
const leagueRoutes = require('./routes/leagues-pg');
const pickRoutes = require('./routes/picks-pg');
const nflRoutes = require('./routes/nfl');
const sportsRoutes = require('./routes/sports');
const userRoutes = require('./routes/users-pg');
const chatRoutes = require('./routes/chat');
const notificationRoutes = require('./routes/notifications-pg');
const scheduleRoutes = require('./routes/schedule');
const bracketRoutes = require('./routes/brackets');
const adminRoutes = require('./routes/admin');

// Initialize database
const { initDb } = require('./db/supabase');

// Socket handlers
const { setupSocketHandlers } = require('./socket/handlers');

const app = express();
const server = http.createServer(app);

// CORS configuration
const corsOrigins = process.env.CORS_ORIGIN 
  ? process.env.CORS_ORIGIN.split(',').map(origin => origin.trim())
  : ['http://localhost:5173'];

// Socket.io setup
const io = new Server(server, {
  cors: {
    origin: corsOrigins,
    credentials: true
  }
});

const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors({
  origin: corsOrigins,
  credentials: true
}));
app.use(express.json());

// Make io accessible to routes
app.set('io', io);

// API Routes
app.use('/api/sports', sportsRoutes);
app.use('/api/leagues', leagueRoutes);
app.use('/api/picks', pickRoutes);
app.use('/api/nfl', nflRoutes);
app.use('/api/users', userRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/schedule', scheduleRoutes);
app.use('/api/brackets', bracketRoutes);
app.use('/api/admin', adminRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Serve static files in production
if (process.env.NODE_ENV === 'production') {
  const fs = require('fs');
  const { pool } = require('./db/supabase');
  const distPath = path.join(__dirname, '../client/dist');
  let indexHtml;
  try {
    indexHtml = fs.readFileSync(path.join(distPath, 'index.html'), 'utf-8');
  } catch (err) {
    console.error('Warning: client/dist/index.html not found. Run the client build first.');
  }

  app.use(express.static(distPath));

  if (indexHtml) {
    // Dynamic OG tags for invite links
    app.get('/join/:inviteCode', async (req, res) => {
      try {
        const { rows } = await pool.query(`
          SELECT l.name, l.sport_id,
                 COUNT(lm.id)::int as member_count,
                 u.display_name as commissioner_name
          FROM leagues l
          LEFT JOIN league_members lm ON lm.league_id = l.id
          LEFT JOIN users u ON u.id = l.commissioner_id
          WHERE UPPER(l.invite_code) = UPPER($1) AND l.status = 'active'
          GROUP BY l.id, u.display_name
        `, [req.params.inviteCode]);

        if (rows.length > 0) {
          const league = rows[0];
          const title = `Join ${league.name} on SurvivorSZN`;
          const description = `${league.commissioner_name} invited you to join ${league.name}. ${league.member_count} member${league.member_count !== 1 ? 's' : ''} and counting.`;
          const escHtml = (s) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

          const html = indexHtml
            .replace(/<meta property="og:title"[^>]*>/, `<meta property="og:title" content="${escHtml(title)}" />`)
            .replace(/<meta property="og:description"[^>]*>/, `<meta property="og:description" content="${escHtml(description)}" />`)
            .replace(/<meta name="twitter:title"[^>]*>/, `<meta name="twitter:title" content="${escHtml(title)}" />`)
            .replace(/<meta name="twitter:description"[^>]*>/, `<meta name="twitter:description" content="${escHtml(description)}" />`);

          return res.send(html);
        }
      } catch (err) {
        console.error('OG tag injection error:', err);
      }
      res.send(indexHtml);
    });

    app.get('*', (req, res) => {
      res.send(indexHtml);
    });
  } else {
    // Fallback: serve static files without OG injection
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }
}

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});

// Setup socket handlers
setupSocketHandlers(io);

// Initialize database and start server
initDb().then(() => {
  server.listen(PORT, () => {
    console.log(`🏈 SurvivorSZN server running on port ${PORT}`);
    console.log(`🔌 WebSocket server ready`);
  });
}).catch(err => {
  console.error('Failed to initialize database:', err);
  process.exit(1);
});