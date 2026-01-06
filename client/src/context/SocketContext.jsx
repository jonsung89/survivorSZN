import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { io } from 'socket.io-client';
import { useAuth } from './AuthContext';
import { auth } from '../firebase';

const SocketContext = createContext(null);

export function SocketProvider({ children }) {
  const { user } = useAuth();
  const [socket, setSocket] = useState(null);
  const [connected, setConnected] = useState(false);
  const [onlineUsers, setOnlineUsers] = useState({});
  const [typingUsers, setTypingUsers] = useState({});
  const currentLeagueRef = useRef(null);

  // Initialize socket connection when user is authenticated
  useEffect(() => {
    if (!user) {
      if (socket) {
        socket.disconnect();
        setSocket(null);
        setConnected(false);
      }
      return;
    }

    const initSocket = async () => {
      try {
        const token = await auth.currentUser?.getIdToken();
        if (!token) return;
        
        // Properly extract the socket URL from VITE_API_URL
        // VITE_API_URL might be like "https://api.example.com/api" - we need "https://api.example.com"
        let socketUrl = 'http://localhost:3001';
        const apiUrl = import.meta.env.VITE_API_URL;
        if (apiUrl) {
          try {
            // Handle both absolute URLs and relative paths
            if (apiUrl.startsWith('http')) {
              const url = new URL(apiUrl);
              socketUrl = url.origin; // Gets "https://api.example.com"
            }
            // If it's a relative URL like "/api", use the current origin
            else if (apiUrl.startsWith('/')) {
              socketUrl = window.location.origin;
            }
          } catch (e) {
            console.warn('Could not parse API URL for socket:', apiUrl);
          }
        }
        
        const newSocket = io(socketUrl, {
          auth: { token },
          transports: ['websocket', 'polling']
        });
        
        console.log('🔌 Connecting to socket at:', socketUrl);

        newSocket.on('connect', () => {
          console.log('🔌 Socket connected');
          setConnected(true);
        });

        newSocket.on('disconnect', () => {
          console.log('🔌 Socket disconnected');
          setConnected(false);
        });

        newSocket.on('connect_error', (error) => {
          console.error('Socket connection error:', error.message);
          setConnected(false);
        });

        newSocket.on('online-users', (users) => {
          if (currentLeagueRef.current) {
            setOnlineUsers(prev => ({
              ...prev,
              [currentLeagueRef.current]: users
            }));
          }
        });

        newSocket.on('typing-update', ({ users }) => {
          if (currentLeagueRef.current) {
            setTypingUsers(prev => ({
              ...prev,
              [currentLeagueRef.current]: users
            }));
          }
        });

        setSocket(newSocket);

        return () => {
          newSocket.disconnect();
        };
      } catch (error) {
        console.error('Failed to initialize socket:', error);
      }
    };

    initSocket();

    return () => {
      if (socket) {
        socket.disconnect();
      }
    };
  }, [user]);

  // Join a league room
  const joinLeague = useCallback((leagueId) => {
    if (socket && connected) {
      // Leave previous league if any
      if (currentLeagueRef.current && currentLeagueRef.current !== leagueId) {
        socket.emit('leave-league', currentLeagueRef.current);
      }
      
      socket.emit('join-league', leagueId);
      currentLeagueRef.current = leagueId;
    }
  }, [socket, connected]);

  // Leave a league room
  const leaveLeague = useCallback((leagueId) => {
    if (socket && connected) {
      socket.emit('leave-league', leagueId);
      if (currentLeagueRef.current === leagueId) {
        currentLeagueRef.current = null;
      }
    }
  }, [socket, connected]);

  // Send a chat message
  const sendMessage = useCallback((leagueId, message, replyTo = null, gif = null) => {
    if (socket && connected) {
      socket.emit('chat-message', { leagueId, message, replyTo, gif });
    }
  }, [socket, connected]);

  // Typing indicators
  const startTyping = useCallback((leagueId) => {
    if (socket && connected) {
      socket.emit('typing-start', leagueId);
    }
  }, [socket, connected]);

  const stopTyping = useCallback((leagueId) => {
    if (socket && connected) {
      socket.emit('typing-stop', leagueId);
    }
  }, [socket, connected]);

  // Subscribe to socket events
  const on = useCallback((event, handler) => {
    if (socket) {
      socket.on(event, handler);
      return () => socket.off(event, handler);
    }
    return () => {};
  }, [socket]);

  // Get online users for a league
  const getOnlineUsers = useCallback((leagueId) => {
    return onlineUsers[leagueId] || [];
  }, [onlineUsers]);

  // Check if a user is online in a league
  const isUserOnline = useCallback((leagueId, userId) => {
    const users = onlineUsers[leagueId] || [];
    return users.some(u => u.userId === userId);
  }, [onlineUsers]);

  const value = {
    socket,
    connected,
    joinLeague,
    leaveLeague,
    sendMessage,
    startTyping,
    stopTyping,
    on,
    onlineUsers,
    typingUsers,
    getOnlineUsers,
    isUserOnline,
    currentLeague: currentLeagueRef.current
  };

  return (
    <SocketContext.Provider value={value}>
      {children}
    </SocketContext.Provider>
  );
}

export function useSocket() {
  const context = useContext(SocketContext);
  if (!context) {
    throw new Error('useSocket must be used within a SocketProvider');
  }
  return context;
}