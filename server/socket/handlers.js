const { createRemoteJWKSet, jwtVerify } = require('jose');
const { db } = require('../db/supabase');

// Firebase project ID - same as in auth middleware
const FIREBASE_PROJECT_ID = 'survivorszn';

// Google's public keys for Firebase Auth
const JWKS = createRemoteJWKSet(
  new URL('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com')
);

// In-memory storage for online users
// Structure: { leagueId: Map<socketId, { userId, displayName }> }
const onlineUsers = new Map();

// Track which leagues each socket is in
const socketLeagues = new Map();

// Typing indicators: { leagueId: Map<userId, displayName> }
const typingUsers = new Map();

function setupSocketHandlers(io) {
  // Authentication middleware - uses same jose verification as REST API
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token;
      if (!token) {
        return next(new Error('Authentication required'));
      }

      // Verify token using jose (same as auth middleware)
      const { payload } = await jwtVerify(token, JWKS, {
        issuer: `https://securetoken.google.com/${FIREBASE_PROJECT_ID}`,
        audience: FIREBASE_PROJECT_ID
      });

      // Get user from database
      const user = await db.getOne(
        'SELECT id, display_name FROM users WHERE firebase_uid = $1',
        [payload.sub]
      );

      if (!user) {
        return next(new Error('User not found'));
      }

      socket.userId = user.id;
      socket.displayName = user.display_name || 'Anonymous';
      socket.firebaseUid = payload.sub;
      
      next();
    } catch (error) {
      console.error('Socket auth error:', error.message);
      next(new Error('Authentication failed'));
    }
  });

  io.on('connection', (socket) => {
    console.log(`User connected: ${socket.displayName} (${socket.userId})`);

    // Join a league room
    socket.on('join-league', async (leagueId) => {
      try {
        // Verify user is member of league
        const membership = await db.getOne(
          'SELECT id FROM league_members WHERE league_id = $1 AND user_id = $2',
          [leagueId, socket.userId]
        );

        if (!membership) {
          socket.emit('error', { message: 'Not a member of this league' });
          return;
        }

        // Join the room
        socket.join(`league:${leagueId}`);

        // Track this socket's leagues
        if (!socketLeagues.has(socket.id)) {
          socketLeagues.set(socket.id, new Set());
        }
        socketLeagues.get(socket.id).add(leagueId);

        // Add to online users for this league
        if (!onlineUsers.has(leagueId)) {
          onlineUsers.set(leagueId, new Map());
        }
        onlineUsers.get(leagueId).set(socket.id, {
          userId: socket.userId,
          displayName: socket.displayName
        });

        // Broadcast updated online users to league
        broadcastOnlineUsers(io, leagueId);

        console.log(`${socket.displayName} joined league ${leagueId}`);
      } catch (error) {
        console.error('Join league error:', error);
        socket.emit('error', { message: 'Failed to join league' });
      }
    });

    // Leave a league room
    socket.on('leave-league', (leagueId) => {
      leaveLeague(socket, io, leagueId);
    });

    // Send chat message (with GIF and reply support)
    socket.on('chat-message', async ({ leagueId, message, replyTo, gif }) => {
      try {
        // Allow empty message if there's a GIF
        if ((!message || message.trim().length === 0) && !gif) return;
        if (message && message.length > 1000) {
          socket.emit('error', { message: 'Message too long' });
          return;
        }

        // Verify membership
        const membership = await db.getOne(
          'SELECT id FROM league_members WHERE league_id = $1 AND user_id = $2',
          [leagueId, socket.userId]
        );

        if (!membership) {
          socket.emit('error', { message: 'Not a member of this league' });
          return;
        }

        // Save message to database (with gif and reply_to)
        const result = await db.getOne(
          `INSERT INTO chat_messages (league_id, user_id, message, gif, reply_to)
           VALUES ($1, $2, $3, $4, $5)
           RETURNING id, created_at, reactions`,
          [
            leagueId, 
            socket.userId, 
            message ? message.trim() : null,
            gif ? JSON.stringify(gif) : null,
            replyTo ? JSON.stringify(replyTo) : null
          ]
        );

        // Broadcast to league room
        io.to(`league:${leagueId}`).emit('new-message', {
          id: result.id,
          leagueId,
          userId: socket.userId,
          user_id: socket.userId, // Include both formats for compatibility
          displayName: socket.displayName,
          display_name: socket.displayName,
          message: message ? message.trim() : null,
          gif: gif || null,
          replyTo: replyTo || null,
          reactions: result.reactions || {},
          createdAt: result.created_at,
          created_at: result.created_at
        });

        // Clear typing indicator
        clearTyping(socket, io, leagueId);
      } catch (error) {
        console.error('Chat message error:', error);
        socket.emit('error', { message: 'Failed to send message' });
      }
    });

    // Handle reactions
    socket.on('react', async ({ leagueId, messageId, emoji }) => {
      try {
        // Get current reactions
        const message = await db.getOne(
          'SELECT reactions FROM chat_messages WHERE id = $1 AND league_id = $2',
          [messageId, leagueId]
        );

        if (!message) {
          socket.emit('error', { message: 'Message not found' });
          return;
        }

        let reactions = message.reactions || {};

        // Toggle user's reaction
        if (reactions[emoji]?.includes(socket.userId)) {
          // Remove reaction
          reactions[emoji] = reactions[emoji].filter(id => id !== socket.userId);
          if (reactions[emoji].length === 0) {
            delete reactions[emoji];
          }
        } else {
          // Add reaction
          reactions[emoji] = [...(reactions[emoji] || []), socket.userId];
        }

        // Update database
        await db.run(
          'UPDATE chat_messages SET reactions = $1 WHERE id = $2',
          [JSON.stringify(reactions), messageId]
        );

        // Broadcast to league
        io.to(`league:${leagueId}`).emit('reaction-update', { 
          messageId, 
          reactions 
        });
      } catch (error) {
        console.error('Reaction error:', error);
        socket.emit('error', { message: 'Failed to add reaction' });
      }
    });

    // Handle message deletion (soft delete - marks as deleted)
    socket.on('delete-message', async ({ leagueId, messageId }) => {
      try {
        // Verify ownership - user can only delete their own messages
        const message = await db.getOne(
          'SELECT id, user_id FROM chat_messages WHERE id = $1 AND league_id = $2',
          [messageId, leagueId]
        );

        if (!message) {
          socket.emit('error', { message: 'Message not found' });
          return;
        }

        if (message.user_id !== socket.userId) {
          socket.emit('error', { message: 'Can only delete your own messages' });
          return;
        }

        // Soft delete - update message to show it was deleted
        await db.run(
          `UPDATE chat_messages 
           SET message = NULL, gif = NULL, deleted_at = NOW(), deleted_by = 'user'
           WHERE id = $1`,
          [messageId]
        );

        // Broadcast update to league
        io.to(`league:${leagueId}`).emit('message-updated', { 
          messageId, 
          message: null,
          gif: null,
          deletedAt: new Date().toISOString(),
          deletedBy: 'user'
        });
      } catch (error) {
        console.error('Delete message error:', error);
        socket.emit('error', { message: 'Failed to delete message' });
      }
    });

    // Handle commissioner message removal
    socket.on('moderate-message', async ({ leagueId, messageId }) => {
      try {
        // Verify user is commissioner
        const league = await db.getOne(
          'SELECT commissioner_id FROM leagues WHERE id = $1',
          [leagueId]
        );

        if (!league || league.commissioner_id !== socket.userId) {
          socket.emit('error', { message: 'Only the commissioner can moderate messages' });
          return;
        }

        // Verify message exists
        const message = await db.getOne(
          'SELECT id FROM chat_messages WHERE id = $1 AND league_id = $2',
          [messageId, leagueId]
        );

        if (!message) {
          socket.emit('error', { message: 'Message not found' });
          return;
        }

        // Soft delete - mark as removed by commissioner
        await db.run(
          `UPDATE chat_messages 
           SET message = NULL, gif = NULL, deleted_at = NOW(), deleted_by = 'commissioner'
           WHERE id = $1`,
          [messageId]
        );

        // Broadcast update to league
        io.to(`league:${leagueId}`).emit('message-updated', { 
          messageId, 
          message: null,
          gif: null,
          deletedAt: new Date().toISOString(),
          deletedBy: 'commissioner'
        });
      } catch (error) {
        console.error('Moderate message error:', error);
        socket.emit('error', { message: 'Failed to remove message' });
      }
    });

    // Typing indicator
    socket.on('typing-start', (leagueId) => {
      if (!typingUsers.has(leagueId)) {
        typingUsers.set(leagueId, new Map());
      }
      typingUsers.get(leagueId).set(socket.userId, socket.displayName);
      
      socket.to(`league:${leagueId}`).emit('typing-update', {
        users: Array.from(typingUsers.get(leagueId).values())
      });
    });

    socket.on('typing-stop', (leagueId) => {
      clearTyping(socket, io, leagueId);
    });

    // Handle disconnect
    socket.on('disconnect', () => {
      console.log(`User disconnected: ${socket.displayName}`);
      
      // Remove from all leagues
      const leagues = socketLeagues.get(socket.id);
      if (leagues) {
        leagues.forEach(leagueId => {
          leaveLeague(socket, io, leagueId);
        });
        socketLeagues.delete(socket.id);
      }
    });
  });
}

function leaveLeague(socket, io, leagueId) {
  socket.leave(`league:${leagueId}`);
  
  // Remove from online users
  if (onlineUsers.has(leagueId)) {
    onlineUsers.get(leagueId).delete(socket.id);
    if (onlineUsers.get(leagueId).size === 0) {
      onlineUsers.delete(leagueId);
    }
  }

  // Remove from typing
  clearTyping(socket, io, leagueId);

  // Remove from socket leagues tracking
  if (socketLeagues.has(socket.id)) {
    socketLeagues.get(socket.id).delete(leagueId);
  }

  // Broadcast updated online users
  broadcastOnlineUsers(io, leagueId);
}

function clearTyping(socket, io, leagueId) {
  if (typingUsers.has(leagueId)) {
    typingUsers.get(leagueId).delete(socket.userId);
    io.to(`league:${leagueId}`).emit('typing-update', {
      users: Array.from(typingUsers.get(leagueId).values())
    });
  }
}

function broadcastOnlineUsers(io, leagueId) {
  const leagueUsers = onlineUsers.get(leagueId);
  
  // Get unique users (one user can have multiple tabs)
  const uniqueUsers = new Map();
  if (leagueUsers) {
    leagueUsers.forEach(user => {
      if (!uniqueUsers.has(user.userId)) {
        uniqueUsers.set(user.userId, user.displayName);
      }
    });
  }

  const onlineList = Array.from(uniqueUsers.entries()).map(([userId, displayName]) => ({
    userId,
    displayName
  }));

  io.to(`league:${leagueId}`).emit('online-users', onlineList);
}

// Export for use in game update service
function broadcastGameUpdate(io, leagueId, gameData) {
  io.to(`league:${leagueId}`).emit('game-update', gameData);
}

module.exports = { setupSocketHandlers, broadcastGameUpdate, onlineUsers };