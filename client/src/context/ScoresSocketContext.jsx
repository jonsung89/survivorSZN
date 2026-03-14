import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { io as socketIO } from 'socket.io-client';

/**
 * ScoresSocketContext — Public (unauthenticated) socket connection for live score updates.
 *
 * Connects to the /scores namespace which requires no authentication.
 * This allows both logged-in and anonymous users to receive live score updates
 * on the Schedule page.
 */
const ScoresSocketContext = createContext(null);

export function ScoresSocketProvider({ children }) {
  const [socket, setSocket] = useState(null);
  const [connected, setConnected] = useState(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;

    // Determine socket URL
    let socketUrl = 'http://localhost:3001';
    const apiUrl = import.meta.env.VITE_API_URL;
    if (apiUrl) {
      try {
        if (apiUrl.startsWith('http')) {
          const url = new URL(apiUrl);
          socketUrl = url.origin;
        } else if (apiUrl.startsWith('/')) {
          socketUrl = window.location.origin;
        }
      } catch (e) {
        console.warn('Could not parse API URL for scores socket:', apiUrl);
      }
    }

    // Connect to the public /scores namespace (no auth needed)
    const newSocket = socketIO(`${socketUrl}/scores`, {
      transports: ['websocket', 'polling'],
    });

    newSocket.on('connect', () => {
      if (mountedRef.current) {
        console.log('📊 Scores socket connected');
        setConnected(true);
      }
    });

    newSocket.on('disconnect', () => {
      if (mountedRef.current) {
        setConnected(false);
      }
    });

    newSocket.on('connect_error', (error) => {
      console.warn('Scores socket error:', error.message);
      if (mountedRef.current) {
        setConnected(false);
      }
    });

    setSocket(newSocket);

    return () => {
      mountedRef.current = false;
      newSocket.disconnect();
    };
  }, []);

  const subscribeScores = useCallback((sportId) => {
    if (socket && connected) {
      socket.emit('subscribe-scores', sportId);
    }
  }, [socket, connected]);

  const unsubscribeScores = useCallback((sportId) => {
    if (socket && connected) {
      socket.emit('unsubscribe-scores', sportId);
    }
  }, [socket, connected]);

  const value = {
    socket,
    connected,
    subscribeScores,
    unsubscribeScores,
  };

  return (
    <ScoresSocketContext.Provider value={value}>
      {children}
    </ScoresSocketContext.Provider>
  );
}

export function useScoresSocket() {
  const context = useContext(ScoresSocketContext);
  if (!context) {
    throw new Error('useScoresSocket must be used within a ScoresSocketProvider');
  }
  return context;
}
