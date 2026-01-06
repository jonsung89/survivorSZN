import { useState, useEffect, useRef } from 'react';
import { MessageCircle, X, Send, Users, Crown, ChevronLeft, ChevronUp } from 'lucide-react';
import { useSocket } from '../context/SocketContext';
import { useAuth } from '../context/AuthContext';
import Avatar from './Avatar';

const API_URL = import.meta.env.VITE_API_URL || '/api';

// NFL team data for profile picks display
const NFL_TEAMS = {
  '1': { name: 'Falcons', abbreviation: 'ATL', logo: 'https://a.espncdn.com/i/teamlogos/nfl/500/atl.png' },
  '2': { name: 'Bills', abbreviation: 'BUF', logo: 'https://a.espncdn.com/i/teamlogos/nfl/500/buf.png' },
  '3': { name: 'Bears', abbreviation: 'CHI', logo: 'https://a.espncdn.com/i/teamlogos/nfl/500/chi.png' },
  '4': { name: 'Bengals', abbreviation: 'CIN', logo: 'https://a.espncdn.com/i/teamlogos/nfl/500/cin.png' },
  '5': { name: 'Browns', abbreviation: 'CLE', logo: 'https://a.espncdn.com/i/teamlogos/nfl/500/cle.png' },
  '6': { name: 'Cowboys', abbreviation: 'DAL', logo: 'https://a.espncdn.com/i/teamlogos/nfl/500/dal.png' },
  '7': { name: 'Broncos', abbreviation: 'DEN', logo: 'https://a.espncdn.com/i/teamlogos/nfl/500/den.png' },
  '8': { name: 'Lions', abbreviation: 'DET', logo: 'https://a.espncdn.com/i/teamlogos/nfl/500/det.png' },
  '9': { name: 'Packers', abbreviation: 'GB', logo: 'https://a.espncdn.com/i/teamlogos/nfl/500/gb.png' },
  '10': { name: 'Titans', abbreviation: 'TEN', logo: 'https://a.espncdn.com/i/teamlogos/nfl/500/ten.png' },
  '11': { name: 'Colts', abbreviation: 'IND', logo: 'https://a.espncdn.com/i/teamlogos/nfl/500/ind.png' },
  '12': { name: 'Chiefs', abbreviation: 'KC', logo: 'https://a.espncdn.com/i/teamlogos/nfl/500/kc.png' },
  '13': { name: 'Raiders', abbreviation: 'LV', logo: 'https://a.espncdn.com/i/teamlogos/nfl/500/lv.png' },
  '14': { name: 'Rams', abbreviation: 'LAR', logo: 'https://a.espncdn.com/i/teamlogos/nfl/500/lar.png' },
  '15': { name: 'Dolphins', abbreviation: 'MIA', logo: 'https://a.espncdn.com/i/teamlogos/nfl/500/mia.png' },
  '16': { name: 'Vikings', abbreviation: 'MIN', logo: 'https://a.espncdn.com/i/teamlogos/nfl/500/min.png' },
  '17': { name: 'Patriots', abbreviation: 'NE', logo: 'https://a.espncdn.com/i/teamlogos/nfl/500/ne.png' },
  '18': { name: 'Saints', abbreviation: 'NO', logo: 'https://a.espncdn.com/i/teamlogos/nfl/500/no.png' },
  '19': { name: 'Giants', abbreviation: 'NYG', logo: 'https://a.espncdn.com/i/teamlogos/nfl/500/nyg.png' },
  '20': { name: 'Jets', abbreviation: 'NYJ', logo: 'https://a.espncdn.com/i/teamlogos/nfl/500/nyj.png' },
  '21': { name: 'Eagles', abbreviation: 'PHI', logo: 'https://a.espncdn.com/i/teamlogos/nfl/500/phi.png' },
  '22': { name: 'Cardinals', abbreviation: 'ARI', logo: 'https://a.espncdn.com/i/teamlogos/nfl/500/ari.png' },
  '23': { name: 'Steelers', abbreviation: 'PIT', logo: 'https://a.espncdn.com/i/teamlogos/nfl/500/pit.png' },
  '24': { name: 'Chargers', abbreviation: 'LAC', logo: 'https://a.espncdn.com/i/teamlogos/nfl/500/lac.png' },
  '25': { name: '49ers', abbreviation: 'SF', logo: 'https://a.espncdn.com/i/teamlogos/nfl/500/sf.png' },
  '26': { name: 'Seahawks', abbreviation: 'SEA', logo: 'https://a.espncdn.com/i/teamlogos/nfl/500/sea.png' },
  '27': { name: 'Buccaneers', abbreviation: 'TB', logo: 'https://a.espncdn.com/i/teamlogos/nfl/500/tb.png' },
  '28': { name: 'Commanders', abbreviation: 'WAS', logo: 'https://a.espncdn.com/i/teamlogos/nfl/500/wsh.png' },
  '29': { name: 'Panthers', abbreviation: 'CAR', logo: 'https://a.espncdn.com/i/teamlogos/nfl/500/car.png' },
  '30': { name: 'Jaguars', abbreviation: 'JAX', logo: 'https://a.espncdn.com/i/teamlogos/nfl/500/jax.png' },
  '33': { name: 'Ravens', abbreviation: 'BAL', logo: 'https://a.espncdn.com/i/teamlogos/nfl/500/bal.png' },
  '34': { name: 'Texans', abbreviation: 'HOU', logo: 'https://a.espncdn.com/i/teamlogos/nfl/500/hou.png' },
};

export default function ChatWidget({ leagueId, leagueName, commissionerId, members = [], maxStrikes = 1 }) {
  const { user, getIdToken } = useAuth();
  const { connected, onlineUsers, typingUsers, sendMessage, startTyping, stopTyping, on, joinLeague, leaveLeague } = useSocket();
  
  const [isOpen, setIsOpen] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [isAnimatingIn, setIsAnimatingIn] = useState(false); // For open animation
  const [sheetSize, setSheetSize] = useState('full'); // 'full', 'half', 'closed'
  const [messages, setMessages] = useState([]);
  const [inputValue, setInputValue] = useState('');
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [selectedProfile, setSelectedProfile] = useState(null);
  const [hasNewMessage, setHasNewMessage] = useState(false); // For preview bar animation
  
  const messagesEndRef = useRef(null);
  const messagesContainerRef = useRef(null);
  const inputRef = useRef(null);
  const mobileInputRef = useRef(null);
  const typingTimeoutRef = useRef(null);
  
  // Drag gesture tracking
  const sheetRef = useRef(null);
  const dragStartY = useRef(0);
  const dragCurrentY = useRef(0);
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState(0);

  // Join league room when widget mounts
  useEffect(() => {
    if (leagueId && connected) {
      joinLeague(leagueId);
      return () => leaveLeague(leagueId);
    }
  }, [leagueId, connected, joinLeague, leaveLeague]);

  // Load initial messages when chat opens (mobile) or on mount (desktop)
  // Also load a few messages initially for the preview bar
  useEffect(() => {
    if (leagueId) {
      const isDesktop = window.innerWidth >= 1024;
      if (isDesktop) {
        loadMessages();
        markAsRead();
      } else {
        // On mobile, load just a few messages for the preview bar
        // Full load happens when sheet opens
        if (!isOpen && messages.length === 0) {
          loadMessages(); // Load initial messages for preview
        } else if (isOpen) {
          loadMessages();
          markAsRead();
        }
      }
    }
  }, [leagueId, isOpen]);

  // Listen for new messages
  useEffect(() => {
    const unsubscribe = on('new-message', (message) => {
      if (message.leagueId === leagueId) {
        setMessages(prev => [...prev, message]);
        
        const isDesktop = window.innerWidth >= 1024;
        if (isDesktop || isOpen) {
          markAsRead();
        } else {
          setUnreadCount(prev => prev + 1);
          // Trigger preview bar animation
          setHasNewMessage(true);
          setTimeout(() => setHasNewMessage(false), 3000);
        }
      }
    });

    return unsubscribe;
  }, [on, leagueId, isOpen]);

  // Fetch unread count on mount
  useEffect(() => {
    if (leagueId) {
      fetchUnreadCount();
    }
  }, [leagueId]);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  const fetchUnreadCount = async () => {
    try {
      const token = await getIdToken();
      const res = await fetch(`${API_URL}/chat/leagues/${leagueId}/unread`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      setUnreadCount(data.unreadCount || 0);
    } catch (error) {
      console.error('Failed to fetch unread count:', error);
    }
  };

  const loadMessages = async (before = null) => {
    if (loading) return;
    setLoading(true);
    
    try {
      const token = await getIdToken();
      let url = `${API_URL}/chat/leagues/${leagueId}/messages?limit=50`;
      if (before) url += `&before=${encodeURIComponent(before)}`;

      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      
      if (before) {
        setMessages(prev => [...data.messages, ...prev]);
      } else {
        setMessages(data.messages || []);
      }
      
      setHasMore(data.messages?.length === 50);
    } catch (error) {
      console.error('Failed to load messages:', error);
    } finally {
      setLoading(false);
    }
  };

  const markAsRead = async () => {
    try {
      const token = await getIdToken();
      await fetch(`${API_URL}/chat/leagues/${leagueId}/read`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      setUnreadCount(0);
    } catch (error) {
      console.error('Failed to mark as read:', error);
    }
  };

  const handleSend = (isMobile = false) => {
    if (!inputValue.trim()) return;
    
    sendMessage(leagueId, inputValue.trim());
    setInputValue('');
    stopTyping(leagueId);
    
    if (isMobile && mobileInputRef.current) {
      mobileInputRef.current.focus();
    } else if (!isMobile && inputRef.current) {
      inputRef.current.focus();
    }
  };

  const handleInputChange = (e) => {
    setInputValue(e.target.value);
    
    startTyping(leagueId);
    
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }
    
    typingTimeoutRef.current = setTimeout(() => {
      stopTyping(leagueId);
    }, 2000);
  };

  const handleKeyDown = (e, isMobile = false) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend(isMobile);
    }
  };

  const handleScroll = (e) => {
    const { scrollTop } = e.target;
    if (scrollTop === 0 && hasMore && !loading && messages.length > 0) {
      const oldestMessage = messages[0];
      loadMessages(oldestMessage.created_at || oldestMessage.createdAt);
    }
  };

  const handleAvatarClick = (userId, displayName) => {
    const member = members.find(m => m.userId === userId);
    
    // Transform picks from object to array format
    let picksArray = [];
    if (member?.picks) {
      Object.entries(member.picks).forEach(([week, weekData]) => {
        const weekPicks = weekData?.picks || [];
        if (weekPicks.length > 0) {
          weekPicks.forEach(pick => {
            picksArray.push({ week: parseInt(week), teamId: pick.teamId, result: pick.result });
          });
        } else if (weekData?.teamId) {
          picksArray.push({ week: parseInt(week), teamId: weekData.teamId, result: weekData.result });
        }
      });
    }
    
    setSelectedProfile({
      userId,
      displayName,
      strikes: member?.strikes || 0,
      status: member?.status || 'active',
      picks: picksArray
    });
  };

  // Touch handlers for drag-to-resize/close
  const handleTouchStart = (e) => {
    // Only handle touches on the header/handle area
    const touch = e.touches[0];
    dragStartY.current = touch.clientY;
    dragCurrentY.current = touch.clientY;
    setIsDragging(true);
    setDragOffset(0);
  };

  const handleTouchMove = (e) => {
    if (!isDragging) return;
    
    const touch = e.touches[0];
    dragCurrentY.current = touch.clientY;
    const delta = dragCurrentY.current - dragStartY.current;
    
    if (sheetSize === 'full') {
      // From full: only allow dragging down, with slight resistance
      if (delta > 0) {
        setDragOffset(delta);
      }
    } else if (sheetSize === 'half') {
      // From half: allow dragging up (to full) or down (to close)
      // Limit upward drag
      const clampedDelta = Math.max(delta, -150);
      setDragOffset(clampedDelta);
    }
  };

  const handleTouchEnd = () => {
    if (!isDragging) return;
    setIsDragging(false);
    
    const delta = dragCurrentY.current - dragStartY.current;
    
    // Determine snap point based on drag distance and current state
    if (sheetSize === 'full') {
      if (delta > 250) {
        // Dragged down a lot - close completely
        closeSheet();
      } else if (delta > 120) {
        // Dragged down moderately - go to half
        setSheetSize('half');
      }
      // Otherwise snap back to full
    } else if (sheetSize === 'half') {
      if (delta > 80) {
        // Dragged down from half - close
        closeSheet();
      } else if (delta < -60) {
        // Dragged up from half - go to full
        setSheetSize('full');
      }
      // Otherwise stay at half
    }
    
    setDragOffset(0);
  };

  const closeSheet = () => {
    setIsClosing(true);
    setIsAnimatingIn(false);
    setTimeout(() => {
      setIsOpen(false);
      setIsClosing(false);
      setSheetSize('full'); // Reset for next open
    }, 300);
  };

  const openSheet = () => {
    setIsOpen(true);
    setIsClosing(false);
    setSheetSize('full');
    // Trigger animation after a frame to ensure initial state is rendered
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setIsAnimatingIn(true);
      });
    });
    markAsRead();
  };

  // Get sheet height based on size
  const getSheetHeight = () => {
    if (sheetSize === 'full') return 'calc(100% - 40px)';
    if (sheetSize === 'half') return '50%';
    return '0';
  };

  const formatTime = (dateStr) => {
    const date = new Date(dateStr);
    return date.toLocaleTimeString('en-US', { 
      hour: 'numeric', 
      minute: '2-digit',
      hour12: true 
    });
  };

  const formatDate = (dateStr) => {
    const date = new Date(dateStr);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (date.toDateString() === today.toDateString()) {
      return 'Today';
    } else if (date.toDateString() === yesterday.toDateString()) {
      return 'Yesterday';
    } else {
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }
  };

  // Group messages by date
  const groupedMessages = messages.reduce((groups, message) => {
    const date = formatDate(message.created_at || message.createdAt);
    if (!groups[date]) {
      groups[date] = [];
    }
    groups[date].push(message);
    return groups;
  }, {});

  const currentTyping = typingUsers[leagueId] || [];
  const currentOnline = onlineUsers[leagueId] || [];

  // Profile Panel Component
  const ProfilePanel = ({ profile, onClose }) => {
    const isCommissioner = profile.userId === commissionerId;
    const isOnline = currentOnline.some(u => u.userId === profile.userId);
    const strikes = profile.strikes || 0;
    const status = profile.status || 'active';
    const picks = profile.picks || [];

    // Calculate stats
    const wins = picks.filter(p => p.result === 'win').length;
    const losses = picks.filter(p => p.result === 'loss').length;

    return (
      <div className="absolute inset-0 bg-slate-900 z-10 flex flex-col">
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3 bg-slate-800 border-b border-white/10">
          <button onClick={onClose} className="p-1 hover:bg-white/10 rounded-lg">
            <ChevronLeft className="w-5 h-5 text-white/60" />
          </button>
          <span className="font-semibold text-white">Profile</span>
        </div>

        {/* Profile Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {/* Avatar & Name */}
          <div className="flex flex-col items-center mb-6">
            <div className="mb-3">
              <Avatar 
                userId={profile.userId}
                name={profile.displayName}
                size="2xl"
                isOnline={isOnline}
                showOnlineRing={true}
              />
            </div>
            <h3 className="text-xl font-bold text-white flex items-center gap-2">
              {profile.displayName}
              {isCommissioner && (
                <Crown className="w-5 h-5 text-yellow-500" />
              )}
            </h3>
            <div className="flex items-center gap-2 mt-1">
              <span className={`w-2 h-2 rounded-full ${isOnline ? 'bg-emerald-500' : 'bg-white/30'}`} />
              <span className="text-sm text-white/50">{isOnline ? 'Online' : 'Offline'}</span>
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-3 mb-6">
            <div className="bg-white/5 rounded-xl p-3 text-center flex flex-col justify-center">
              <p className="text-2xl font-bold text-white h-8 flex items-center justify-center">{wins}</p>
              <p className="text-xs text-white/50">Wins</p>
            </div>
            <div className="bg-white/5 rounded-xl p-3 text-center flex flex-col justify-center">
              <p className="text-2xl font-bold text-white h-8 flex items-center justify-center">{losses}</p>
              <p className="text-xs text-white/50">Losses</p>
            </div>
            <div className="bg-white/5 rounded-xl p-3 text-center flex flex-col justify-center">
              <div className="flex items-center justify-center gap-1 h-8">
                {Array.from({ length: maxStrikes }).map((_, i) => (
                  <span
                    key={i}
                    className={`w-3 h-3 rounded-full ${i < strikes ? 'bg-red-500' : 'bg-white/20'}`}
                  />
                ))}
              </div>
              <p className="text-xs text-white/50 mt-1">Strikes</p>
            </div>
          </div>

          {/* Status */}
          <div className="bg-white/5 rounded-xl p-4 mb-6">
            <p className="text-sm text-white/50 mb-2">Status</p>
            <span className={`inline-block px-3 py-1 rounded-full text-sm font-medium ${
              status === 'active' ? 'bg-emerald-500/20 text-emerald-400' :
              status === 'eliminated' ? 'bg-red-500/20 text-red-400' :
              'bg-white/10 text-white/60'
            }`}>
              {status.charAt(0).toUpperCase() + status.slice(1)}
            </span>
          </div>

          {/* Recent Picks */}
          {picks.length > 0 && (
            <div>
              <p className="text-sm text-white/50 mb-3">Recent Picks</p>
              <div className="space-y-2">
                {picks.slice(-5).reverse().map((pick, idx) => {
                  const team = NFL_TEAMS[pick.teamId];
                  return (
                    <div key={idx} className="flex items-center gap-3 bg-white/5 rounded-lg p-2">
                      {team?.logo && (
                        <img src={team.logo} alt={team.name} className="w-8 h-8" />
                      )}
                      <div className="flex-1">
                        <p className="text-sm text-white">{team?.name || pick.teamId}</p>
                        <p className="text-xs text-white/50">Week {pick.week}</p>
                      </div>
                      {pick.result && (
                        <span className={`text-xs font-medium px-2 py-1 rounded ${
                          pick.result === 'win' ? 'bg-emerald-500/20 text-emerald-400' :
                          pick.result === 'loss' ? 'bg-red-500/20 text-red-400' :
                          'bg-white/10 text-white/50'
                        }`}>
                          {pick.result.toUpperCase()}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  // Render messages list (shared logic)
  const renderMessages = () => (
    <>
      {loading && messages.length === 0 && (
        <div className="text-center text-white/40 py-8">Loading...</div>
      )}

      {!loading && messages.length === 0 && (
        <div className="text-center text-white/40 py-8">
          <MessageCircle className="w-12 h-12 mx-auto mb-2 opacity-50" />
          <p>No messages yet</p>
          <p className="text-sm">Start the conversation!</p>
        </div>
      )}

      {Object.entries(groupedMessages).map(([date, dateMessages]) => (
        <div key={date}>
          {/* Date separator */}
          <div className="flex items-center justify-center my-4">
            <span className="px-3 py-1 bg-white/5 rounded-full text-xs text-white/40">
              {date}
            </span>
          </div>

          {/* Messages for this date */}
          {dateMessages.map((message, idx) => {
            const isOwn = message.user_id === user?.id || message.userId === user?.id;
            const messageUserId = message.user_id || message.userId;
            const isMessageFromCommissioner = messageUserId === commissionerId;
            const prevMessage = dateMessages[idx - 1];
            const prevUserId = prevMessage?.user_id || prevMessage?.userId;
            
            // Check if there's a significant time gap (5 minutes) between messages
            const messageTime = new Date(message.created_at || message.createdAt).getTime();
            const prevMessageTime = prevMessage ? new Date(prevMessage.created_at || prevMessage.createdAt).getTime() : 0;
            const timeGapMinutes = prevMessage ? (messageTime - prevMessageTime) / (1000 * 60) : 0;
            const hasSignificantTimeGap = timeGapMinutes > 5;
            
            // Show name/timestamp if: first message, different user, or significant time gap
            const showName = idx === 0 || prevUserId !== messageUserId || hasSignificantTimeGap;
            const displayName = message.display_name || message.displayName;

            return (
              <div key={message.id} className={`flex gap-2 ${showName ? 'mt-4' : 'mt-1'}`}>
                {/* Avatar */}
                <div className={`flex-shrink-0 ${showName ? '' : 'invisible'}`}>
                  <Avatar 
                    userId={messageUserId}
                    name={displayName}
                    size="sm"
                    onClick={() => handleAvatarClick(messageUserId, displayName)}
                  />
                </div>

                <div className="flex-1 min-w-0">
                  {showName && (
                    <p className="text-xs mb-1 ml-1 flex items-center gap-2">
                      <span className={`font-medium ${isOwn ? 'text-emerald-400' : 'text-white/70'}`}>
                        {displayName}
                        {isOwn && <span className="text-white/40 font-normal ml-1">(you)</span>}
                      </span>
                      {isMessageFromCommissioner && (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-yellow-500/20 rounded text-yellow-500 text-[10px] font-medium">
                          <Crown className="w-3 h-3" />
                          Commish
                        </span>
                      )}
                      <span className="text-white/30">{formatTime(message.created_at || message.createdAt)}</span>
                    </p>
                  )}
                  <div
                    className={`inline-block px-3 py-2 rounded-2xl rounded-tl-md ${
                      isOwn
                        ? 'bg-emerald-600/20 border border-emerald-500/30 text-white'
                        : 'bg-white/10 text-white'
                    }`}
                  >
                    <p className="text-sm whitespace-pre-wrap break-words">{message.message}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ))}

      {/* Typing indicator */}
      {currentTyping.length > 0 && (
        <div className="flex items-center gap-2 text-white/50 text-sm pl-10 mt-4">
          <div className="flex gap-1">
            <span className="w-2 h-2 bg-white/50 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
            <span className="w-2 h-2 bg-white/50 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
            <span className="w-2 h-2 bg-white/50 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
          </div>
          <span>{currentTyping.join(', ')} typing...</span>
        </div>
      )}

      <div ref={messagesEndRef} />
    </>
  );

  return (
    <>
      {/* Desktop: Fixed sidebar */}
      <div className="hidden lg:flex flex-col w-80 xl:w-96 bg-slate-900 border-l border-white/10 fixed top-16 right-0 bottom-0">
        {/* Profile Panel (overlay) */}
        {selectedProfile && (
          <ProfilePanel profile={selectedProfile} onClose={() => setSelectedProfile(null)} />
        )}

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 bg-slate-800 border-b border-white/10">
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-white">League Chat</h3>
            <p className="text-xs text-white/50 flex items-center gap-1">
              <Users className="w-3 h-3" />
              {currentOnline.length} online
              {connected ? '' : ' • Reconnecting...'}
            </p>
          </div>
        </div>

        {/* Messages */}
        <div 
          ref={messagesContainerRef}
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto p-4"
        >
          {renderMessages()}
        </div>

        {/* Input */}
        <div className="p-3 border-t border-white/10 bg-slate-800/50">
          <div className="flex gap-2">
            <input
              ref={inputRef}
              type="text"
              value={inputValue}
              onChange={handleInputChange}
              onKeyDown={(e) => handleKeyDown(e, false)}
              placeholder="Type a message..."
              className="flex-1 bg-white/10 border border-white/10 rounded-xl px-4 py-2 text-white placeholder-white/40 focus:outline-none focus:border-nfl-blue/50"
            />
            <button
              onClick={() => handleSend(false)}
              disabled={!inputValue.trim()}
              className="p-2 bg-nfl-blue rounded-xl text-white disabled:opacity-50 disabled:cursor-not-allowed hover:bg-nfl-blue/80 transition-colors"
            >
              <Send className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>

      {/* Mobile: Bottom Chat Bar + Sheet */}
      <div className="lg:hidden">
        {/* Bottom Chat Preview Bar */}
        <div 
          className={`fixed inset-x-0 bottom-0 z-40 transition-all duration-300 ${
            isOpen ? 'translate-y-full opacity-0' : 'translate-y-0 opacity-100'
          }`}
        >
          {/* New message highlight effect */}
          {hasNewMessage && (
            <div className="absolute inset-0 bg-nfl-blue/20 animate-pulse rounded-t-2xl pointer-events-none" />
          )}
          
          {/* Safe area background */}
          <div className={`bg-slate-900/95 backdrop-blur-xl border-t transition-colors duration-300 ${
            hasNewMessage ? 'border-nfl-blue/50' : 'border-white/10'
          }`}>
            <button
              onClick={openSheet}
              className="w-full px-4 py-3 flex items-center gap-3 active:bg-white/5 transition-colors"
            >
              {/* Left: Avatar or Icon */}
              <div className="relative flex-shrink-0">
                {messages.length > 0 && (messages[messages.length - 1]?.user_id || messages[messages.length - 1]?.userId) ? (
                  <Avatar 
                    userId={messages[messages.length - 1].user_id || messages[messages.length - 1].userId} 
                    name={messages[messages.length - 1].display_name || messages[messages.length - 1].displayName || 'User'} 
                    size="sm" 
                  />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-nfl-blue/20 flex items-center justify-center">
                    <MessageCircle className="w-5 h-5 text-nfl-blue" />
                  </div>
                )}
                {/* Unread badge */}
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </span>
                )}
              </div>

              {/* Middle: Message Preview */}
              <div className="flex-1 min-w-0 text-left">
                {currentTyping.length > 0 ? (
                  <>
                    <p className="text-white font-medium text-sm">League Chat</p>
                    <p className="text-nfl-blue text-sm flex items-center gap-1.5">
                      <span className="flex gap-0.5">
                        <span className="w-1.5 h-1.5 bg-nfl-blue rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                        <span className="w-1.5 h-1.5 bg-nfl-blue rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                        <span className="w-1.5 h-1.5 bg-nfl-blue rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                      </span>
                      <span className="truncate">
                        {currentTyping.length === 1 
                          ? `${currentTyping[0]} is typing` 
                          : `${currentTyping.length} people typing`
                        }
                      </span>
                    </p>
                  </>
                ) : messages.length > 0 ? (
                  <>
                    <p className="text-white font-medium text-sm truncate">
                      {messages[messages.length - 1]?.display_name || messages[messages.length - 1]?.displayName || 'User'}
                      {(messages[messages.length - 1]?.user_id || messages[messages.length - 1]?.userId) === commissionerId && (
                        <span className="ml-1.5 text-yellow-400 text-xs">👑</span>
                      )}
                    </p>
                    <p className="text-white/50 text-sm truncate">
                      {messages[messages.length - 1]?.message || 'No messages yet'}
                    </p>
                  </>
                ) : (
                  <>
                    <p className="text-white font-medium text-sm">League Chat</p>
                    <p className="text-white/40 text-sm">Tap to start chatting</p>
                  </>
                )}
              </div>

              {/* Right: Time + Arrow */}
              <div className="flex-shrink-0 flex items-center gap-2">
                {messages.length > 0 && (
                  <span className="text-white/30 text-xs">
                    {formatTime(messages[messages.length - 1]?.created_at || messages[messages.length - 1]?.createdAt)}
                  </span>
                )}
                <ChevronUp className="w-5 h-5 text-white/40" />
              </div>
            </button>
            
            {/* Online indicator bar */}
            {currentOnline.length > 0 && (
              <div className="px-4 pb-2 flex items-center gap-1.5">
                <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
                <span className="text-white/40 text-xs">
                  {currentOnline.length} online
                </span>
              </div>
            )}
            
            {/* iOS safe area spacer */}
            <div className="pb-safe" />
          </div>
        </div>

        {/* Bottom sheet overlay with animation */}
        {(isOpen || isClosing) && (
          <>
            {/* Backdrop */}
            <div 
              className={`fixed inset-0 z-50 bg-black/60 backdrop-blur-sm transition-opacity duration-300 ${
                isAnimatingIn && !isClosing ? 'opacity-100' : 'opacity-0'
              }`}
              onClick={closeSheet}
            />
            
            {/* Chat Panel - Bottom Sheet */}
            <div 
              ref={sheetRef}
              className={`fixed inset-x-0 bottom-0 z-50 bg-slate-900 flex flex-col rounded-t-3xl shadow-2xl ${
                isDragging ? '' : 'transition-all duration-300 ease-out'
              }`}
              style={{ 
                height: getSheetHeight(),
                maxHeight: 'calc(100dvh - 40px)',
                transform: isAnimatingIn && !isClosing 
                  ? `translateY(${dragOffset}px)` 
                  : 'translateY(100%)',
                opacity: isAnimatingIn && !isClosing ? 1 : 0
              }}
            >
              {/* Profile Panel (overlay) */}
              {selectedProfile && (
                <ProfilePanel profile={selectedProfile} onClose={() => setSelectedProfile(null)} />
              )}

              {/* Drag Handle Area */}
              <div 
                className="touch-none cursor-grab active:cursor-grabbing"
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
              >
                {/* Handle bar */}
                <div className="flex justify-center pt-3 pb-2">
                  <div className="w-12 h-1.5 bg-white/30 rounded-full" />
                </div>

                {/* Header */}
                <div className="flex items-center justify-between px-4 py-2 border-b border-white/10">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-white">League Chat</h3>
                    <p className="text-xs text-white/50 flex items-center gap-1">
                      <Users className="w-3 h-3" />
                      {currentOnline.length} online
                      {connected ? '' : ' • Reconnecting...'}
                      {sheetSize === 'half' && (
                        <span className="ml-2 text-white/30">• Swipe up to expand</span>
                      )}
                    </p>
                  </div>
                  <button
                    onClick={closeSheet}
                    className="p-2 hover:bg-white/10 rounded-full transition-colors"
                  >
                    <X className="w-5 h-5 text-white/60" />
                  </button>
                </div>
              </div>

              {/* Messages */}
              <div 
                onScroll={handleScroll}
                className="flex-1 overflow-y-auto p-4"
              >
                {renderMessages()}
              </div>

              {/* Input - only show in full mode */}
              {sheetSize === 'full' && (
                <div className="p-3 border-t border-white/10 bg-slate-800/50 pb-safe">
                  <div className="flex gap-2">
                    <input
                      ref={mobileInputRef}
                      type="text"
                      value={inputValue}
                      onChange={handleInputChange}
                      onKeyDown={(e) => handleKeyDown(e, true)}
                      placeholder="Type a message..."
                      className="flex-1 bg-white/10 border border-white/10 rounded-xl px-4 py-2.5 text-white placeholder-white/40 focus:outline-none focus:border-nfl-blue/50"
                    />
                    <button
                      onClick={() => handleSend(true)}
                      disabled={!inputValue.trim()}
                      className="p-2.5 bg-nfl-blue rounded-xl text-white disabled:opacity-50 disabled:cursor-not-allowed hover:bg-nfl-blue/80 transition-colors"
                    >
                      <Send className="w-5 h-5" />
                    </button>
                  </div>
                </div>
              )}
              
              {/* Half mode: tap to expand hint */}
              {sheetSize === 'half' && (
                <div 
                  className="p-4 border-t border-white/10 bg-slate-800/30 text-center"
                  onClick={() => setSheetSize('full')}
                >
                  <p className="text-white/40 text-sm">Tap to expand and type a message</p>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </>
  );
}