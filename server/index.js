require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

// Import routes (PostgreSQL versions)
const leagueRoutes = require('./routes/leagues-pg');
const pickRoutes = require('./routes/picks-pg');
const nflRoutes = require('./routes/nfl');
const userRoutes = require('./routes/users-pg');

// Initialize database
const { initDb } = require('./db/supabase');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true
}));
app.use(express.json());

// API Routes
app.use('/api/leagues', leagueRoutes);
app.use('/api/picks', pickRoutes);
app.use('/api/nfl', nflRoutes);
app.use('/api/users', userRoutes);

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

// Initialize database and start server
initDb().then(() => {
  app.listen(PORT, () => {
    console.log(`🏈 SurvivorSZN server running on port ${PORT}`);
  });
}).catch(err => {
  console.error('Failed to initialize database:', err);
  process.exit(1);
});
