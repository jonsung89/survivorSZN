import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { io } from 'socket.io-client';
import { useAuth } from './AuthContext';

const SocketContext = createContext(null);

export function useSocket() {
  return useContext(SocketContext);
}

export function SocketProvider({ children }) {
  const { user, getIdToken } = useAuth();
  const [socket, setSocket] = useState(null);
  const [connected, setConnected] = useState(false);
  const [onlineUsers, setOnlineUsers] = useState({});
  const [typingUsers, setTypingUsers] = useState({});
  const currentLeagueRef = useRef(null);

  // Initialize socket connection
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
        const token = await getIdToken();
        
        const newSocket = io(import.meta.env.VITE_API_URL?.replace('/api', '') || 'http://localhost:3001', {
          auth: { token },
          transports: ['websocket', 'polling']
        });

        newSocket.on('connect', () => {
          console.log('Socket connected');
          setConnected(true);
        });

        newSocket.on('disconnect', () => {
          console.log('Socket disconnected');
          setConnected(false);
        });

        newSocket.on('error', (error) => {
          console.error('Socket error:', error);
        });

        // Online users update
        newSocket.on('online-users', (users) => {
          if (currentLeagueRef.current) {
            setOnlineUsers(prev => ({
              ...prev,
              [currentLeagueRef.current]: users
            }));
          }
        });

        // Typing update
        newSocket.on('typing-update', ({ users }) => {
          if (currentLeagueRef.current) {
            setTypingUsers(prev => ({
              ...prev,
              [currentLeagueRef.current]: users
            }));
          }
        });

        setSocket(newSocket);
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
      currentLeagueRef.current = leagueId;
      socket.emit('join-league', leagueId);
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

  // Send chat message
  const sendMessage = useCallback((leagueId, message) => {
    if (socket && connected) {
      socket.emit('chat-message', { leagueId, message });
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

  // Subscribe to events
  const on = useCallback((event, handler) => {
    if (socket) {
      socket.on(event, handler);
      return () => socket.off(event, handler);
    }
    return () => {};
  }, [socket]);

  const value = {
    socket,
    connected,
    onlineUsers,
    typingUsers,
    joinLeague,
    leaveLeague,
    sendMessage,
    startTyping,
    stopTyping,
    on
  };

  return (
    <SocketContext.Provider value={value}>
      {children}
    </SocketContext.Provider>
  );
}
