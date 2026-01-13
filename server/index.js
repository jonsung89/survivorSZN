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
const userRoutes = require('./routes/users-pg');
const chatRoutes = require('./routes/chat');
const notificationRoutes = require('./routes/notifications-pg');

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
app.use('/api/leagues', leagueRoutes);
app.use('/api/picks', pickRoutes);
app.use('/api/nfl', nflRoutes);
app.use('/api/users', userRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/notifications', notificationRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Serve static files in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../client/dist')));
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../client/dist/index.html'));
  });
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