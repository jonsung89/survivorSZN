import { useState, useEffect, useRef, useCallback } from 'react';
import { MessageCircle, X, Send, Users, Crown, ChevronLeft, ChevronRight, ChevronUp, Smile, Image, Reply, CornerUpLeft, AlertCircle, Search, Maximize2, Minimize2, PanelRightClose, PanelRightOpen, Trash2, ShieldX } from 'lucide-react';
import { useSocket } from '../context/SocketContext';
import { useAuth } from '../context/AuthContext';
import Avatar from './Avatar';

const API_URL = import.meta.env.VITE_API_URL || '/api';
const TENOR_API_KEY = 'AIzaSyAyimkuYQYF_FXVALexPuGQctUWRURdCYQ'; // Free tier API key

// Popular emoji categories
const EMOJI_CATEGORIES = {
  recent: ['😂', '❤️', '🔥', '👍', '😭', '🙏', '😊', '🥺'],
  smileys: ['😀', '😃', '😄', '😁', '😅', '😂', '🤣', '😊', '😇', '🙂', '😉', '😌', '😍', '🥰', '😘', '😋', '😛', '😜', '🤪', '😝', '🤗', '🤭', '🤫', '🤔', '😐', '😑', '😶', '😏', '😒', '🙄', '😬', '😮', '🤐', '😯', '😲', '😳', '🥺', '😦', '😧', '😨', '😰', '😥', '😢', '😭', '😱', '😖', '😣', '😞', '😓', '😩', '😫', '🥱', '😤', '😡', '😠', '🤬', '😈', '👿', '💀', '☠️', '💩', '🤡', '👹', '👺', '👻', '👽', '👾', '🤖'],
  gestures: ['👋', '🤚', '🖐️', '✋', '🖖', '👌', '🤌', '🤏', '✌️', '🤞', '🤟', '🤘', '🤙', '👈', '👉', '👆', '🖕', '👇', '☝️', '👍', '👎', '✊', '👊', '🤛', '🤜', '👏', '🙌', '👐', '🤲', '🤝', '🙏', '✍️', '💪', '🦾', '🦿', '🦵', '🦶', '👂', '🦻', '👃', '🧠', '🫀', '🫁', '🦷', '🦴', '👀', '👁️', '👅', '👄'],
  animals: ['🐶', '🐱', '🐭', '🐹', '🐰', '🦊', '🐻', '🐼', '🐨', '🐯', '🦁', '🐮', '🐷', '🐸', '🐵', '🐔', '🐧', '🐦', '🐤', '🦆', '🦅', '🦉', '🦇', '🐺', '🐗', '🐴', '🦄', '🐝', '🐛', '🦋', '🐌', '🐞', '🐜', '🦟', '🦗', '🕷️', '🦂', '🐢', '🐍', '🦎', '🦖', '🦕', '🐙', '🦑', '🦐', '🦞', '🦀', '🐡', '🐠', '🐟', '🐬', '🐳', '🐋', '🦈', '🐊', '🐅', '🐆', '🦓', '🦍', '🦧', '🐘', '🦛', '🦏', '🐪', '🐫', '🦒', '🦘', '🐃', '🐂', '🐄', '🐎', '🐖', '🐏', '🐑', '🦙', '🐐', '🦌', '🐕', '🐩', '🦮', '🐕‍🦺', '🐈', '🐈‍⬛', '🐓', '🦃', '🦚', '🦜', '🦢', '🦩', '🕊️', '🐇', '🦝', '🦨', '🦡', '🦫', '🦦', '🦥', '🐁', '🐀', '🐿️', '🦔'],
  food: ['🍎', '🍐', '🍊', '🍋', '🍌', '🍉', '🍇', '🍓', '🫐', '🍈', '🍒', '🍑', '🥭', '🍍', '🥥', '🥝', '🍅', '🍆', '🥑', '🥦', '🥬', '🥒', '🌶️', '🫑', '🌽', '🥕', '🫒', '🧄', '🧅', '🥔', '🍠', '🥐', '🥯', '🍞', '🥖', '🥨', '🧀', '🥚', '🍳', '🧈', '🥞', '🧇', '🥓', '🥩', '🍗', '🍖', '🦴', '🌭', '🍔', '🍟', '🍕', '🫓', '🥪', '🥙', '🧆', '🌮', '🌯', '🫔', '🥗', '🥘', '🫕', '🥫', '🍝', '🍜', '🍲', '🍛', '🍣', '🍱', '🥟', '🦪', '🍤', '🍙', '🍚', '🍘', '🍥', '🥠', '🥮', '🍢', '🍡', '🍧', '🍨', '🍦', '🥧', '🧁', '🍰', '🎂', '🍮', '🍭', '🍬', '🍫', '🍿', '🍩', '🍪', '🌰', '🥜', '🍯', '🥛', '🍼', '🫖', '☕', '🍵', '🧃', '🥤', '🧋', '🍶', '🍺', '🍻', '🥂', '🍷', '🥃', '🍸', '🍹', '🧉', '🍾', '🧊'],
  sports: ['⚽', '🏀', '🏈', '⚾', '🥎', '🎾', '🏐', '🏉', '🥏', '🎱', '🪀', '🏓', '🏸', '🏒', '🏑', '🥍', '🏏', '🪃', '🥅', '⛳', '🪁', '🏹', '🎣', '🤿', '🥊', '🥋', '🎽', '🛹', '🛼', '🛷', '⛸️', '🥌', '🎿', '⛷️', '🏂', '🪂', '🏋️', '🤼', '🤸', '⛹️', '🤺', '🤾', '🏌️', '🏇', '⛸️', '🏊', '🤽', '🧗', '🚵', '🚴', '🏆', '🥇', '🥈', '🥉', '🏅', '🎖️', '🏵️', '🎗️', '🎫', '🎟️'],
  objects: ['⌚', '📱', '📲', '💻', '⌨️', '🖥️', '🖨️', '🖱️', '🖲️', '🕹️', '🗜️', '💽', '💾', '💿', '📀', '📼', '📷', '📸', '📹', '🎥', '📽️', '🎞️', '📞', '☎️', '📟', '📠', '📺', '📻', '🎙️', '🎚️', '🎛️', '🧭', '⏱️', '⏲️', '⏰', '🕰️', '⌛', '⏳', '📡', '🔋', '🔌', '💡', '🔦', '🕯️', '🧯', '🛢️', '💸', '💵', '💴', '💶', '💷', '🪙', '💰', '💳', '💎', '⚖️', '🪜', '🧰', '🪛', '🔧', '🔨', '⚒️', '🛠️', '⛏️', '🪚', '🔩', '⚙️', '🪤', '🧱', '⛓️', '🧲', '🔫', '💣', '🧨', '🪓', '🔪', '🗡️', '⚔️', '🛡️', '🚬', '⚰️', '🪦', '⚱️', '🏺', '🔮', '📿', '🧿', '💈', '⚗️', '🔭', '🔬', '🕳️', '🩹', '🩺', '💊', '💉', '🩸', '🧬', '🦠', '🧫', '🧪'],
  symbols: ['❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎', '💔', '❤️‍🔥', '❤️‍🩹', '❣️', '💕', '💞', '💓', '💗', '💖', '💘', '💝', '💟', '☮️', '✝️', '☪️', '🕉️', '☸️', '✡️', '🔯', '🕎', '☯️', '☦️', '🛐', '⛎', '♈', '♉', '♊', '♋', '♌', '♍', '♎', '♏', '♐', '♑', '♒', '♓', '🆔', '⚛️', '🉑', '☢️', '☣️', '📴', '📳', '🈶', '🈚', '🈸', '🈺', '🈷️', '✴️', '🆚', '💮', '🉐', '㊙️', '㊗️', '🈴', '🈵', '🈹', '🈲', '🅰️', '🅱️', '🆎', '🆑', '🅾️', '🆘', '❌', '⭕', '🛑', '⛔', '📛', '🚫', '💯', '💢', '♨️', '🚷', '🚯', '🚳', '🚱', '🔞', '📵', '🚭', '❗', '❕', '❓', '❔', '‼️', '⁉️', '🔅', '🔆', '〽️', '⚠️', '🚸', '🔱', '⚜️', '🔰', '♻️', '✅', '🈯', '💹', '❇️', '✳️', '❎', '🌐', '💠', 'Ⓜ️', '🌀', '💤', '🏧', '🚾', '♿', '🅿️', '🛗', '🈳', '🈂️', '🛂', '🛃', '🛄', '🛅', '🚹', '🚺', '🚼', '⚧️', '🚻', '🚮', '🎦', '📶', '🈁', '🔣', 'ℹ️', '🔤', '🔡', '🔠', '🆖', '🆗', '🆙', '🆒', '🆕', '🆓', '0️⃣', '1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟', '🔢', '#️⃣', '*️⃣', '⏏️', '▶️', '⏸️', '⏯️', '⏹️', '⏺️', '⏭️', '⏮️', '⏩', '⏪', '⏫', '⏬', '◀️', '🔼', '🔽', '➡️', '⬅️', '⬆️', '⬇️', '↗️', '↘️', '↙️', '↖️', '↕️', '↔️', '↪️', '↩️', '⤴️', '⤵️', '🔀', '🔁', '🔂', '🔄', '🔃', '🎵', '🎶', '➕', '➖', '➗', '✖️', '🟰', '♾️', '💲', '💱', '™️', '©️', '®️', '👁️‍🗨️', '🔚', '🔙', '🔛', '🔝', '🔜', '〰️', '➰', '➿', '✔️', '☑️', '🔘', '🔴', '🟠', '🟡', '🟢', '🔵', '🟣', '⚫', '⚪', '🟤', '🔺', '🔻', '🔸', '🔹', '🔶', '🔷', '🔳', '🔲', '▪️', '▫️', '◾', '◽', '◼️', '◻️', '🟥', '🟧', '🟨', '🟩', '🟦', '🟪', '⬛', '⬜', '🟫', '🔈', '🔇', '🔉', '🔊', '🔔', '🔕', '📣', '📢', '💬', '💭', '🗯️', '♠️', '♣️', '♥️', '♦️', '🃏', '🎴', '🀄', '🕐', '🕑', '🕒', '🕓', '🕔', '🕕', '🕖', '🕗', '🕘', '🕙', '🕚', '🕛', '🕜', '🕝', '🕞', '🕟', '🕠', '🕡', '🕢', '🕣', '🕤', '🕥', '🕦', '🕧'],
  flags: ['🏳️', '🏴', '🏴‍☠️', '🏁', '🚩', '🎌', '🏳️‍🌈', '🏳️‍⚧️', '🇺🇸', '🇬🇧', '🇨🇦', '🇦🇺', '🇩🇪', '🇫🇷', '🇮🇹', '🇪🇸', '🇯🇵', '🇰🇷', '🇨🇳', '🇮🇳', '🇧🇷', '🇲🇽', '🇷🇺']
};

// Quick reactions for messages
const QUICK_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🔥'];

// Helper function to parse mentions in message text
// Matches @mentions against actual member names for full name highlighting
const parseMentions = (text, members) => {
  if (!text || !members || members.length === 0) return [text];
  
  // Get all member display names, sorted by length (longest first to match longer names first)
  const memberNames = members
    .map(m => m.displayName || m.display_name || '')
    .filter(name => name.length > 0)
    .sort((a, b) => b.length - a.length);
  
  if (memberNames.length === 0) return [text];
  
  // Build regex pattern that matches @followed by any member name
  // Escape special regex characters in names
  const escapedNames = memberNames.map(name => 
    name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  );
  const pattern = new RegExp(`(@(?:${escapedNames.join('|')}))`, 'gi');
  
  // Split text by mentions
  const parts = text.split(pattern);
  
  return parts.map((part, i) => {
    // Check if this part is a mention (starts with @ and matches a member name)
    if (part.startsWith('@')) {
      const nameAfterAt = part.substring(1).toLowerCase();
      const isValidMention = memberNames.some(
        name => name.toLowerCase() === nameAfterAt
      );
      if (isValidMention) {
        return { type: 'mention', text: part, key: i };
      }
    }
    return part;
  });
};

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

export default function ChatWidget({ leagueId, leagueName, commissionerId, members = [], maxStrikes = 1, onCollapsedChange }) {
  const { user, getIdToken } = useAuth();
  const { socket, connected, onlineUsers, typingUsers, sendMessage, startTyping, stopTyping, on, joinLeague, leaveLeague } = useSocket();
  
  const [isOpen, setIsOpen] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [isAnimatingIn, setIsAnimatingIn] = useState(false);
  const [sheetSize, setSheetSize] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('chatSheetSize');
      return saved === 'half' ? 'half' : 'full';
    }
    return 'full';
  });
  const [isDesktopCollapsed, setIsDesktopCollapsed] = useState(true); // Start collapsed on smaller desktops
  const [messages, setMessages] = useState([]);
  const [inputValue, setInputValue] = useState('');
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [selectedProfile, setSelectedProfile] = useState(null);
  const [hasNewMessage, setHasNewMessage] = useState(false);
  
  // Desktop collapsed state (persisted in localStorage)
  const [isCollapsed, setIsCollapsed] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('chatCollapsed') === 'true';
    }
    return false;
  });
  
  // Enhanced chat features
  const [replyingTo, setReplyingTo] = useState(null);
  const [showMentions, setShowMentions] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const [mentionIndex, setMentionIndex] = useState(0);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showGifPicker, setShowGifPicker] = useState(false);
  const [gifSearchQuery, setGifSearchQuery] = useState('');
  const [gifs, setGifs] = useState([]);
  const [gifsLoading, setGifsLoading] = useState(false);
  const [selectedMessage, setSelectedMessage] = useState(null);
  const [showMessageMenu, setShowMessageMenu] = useState(false);
  const [menuPosition, setMenuPosition] = useState({ x: 0, y: 0 }); // For positioning menu near message
  const [emojiCategory, setEmojiCategory] = useState('recent');
  const [swipingMessageId, setSwipingMessageId] = useState(null);
  const [swipeOffset, setSwipeOffset] = useState(0);
  const [reactionDetail, setReactionDetail] = useState(null); // { messageId, emoji, users }
  const longPressTimer = useRef(null);
  
  const messagesEndRef = useRef(null);
  const messagesContainerRef = useRef(null);
  const mobileMessagesRef = useRef(null);
  const inputRef = useRef(null);
  const mobileInputRef = useRef(null);
  const typingTimeoutRef = useRef(null);
  const gifSearchTimeout = useRef(null);
  const swipeStartX = useRef(0);
  const isSwipeDragging = useRef(false); // Track if user is dragging to reply
  
  // Drag gesture tracking
  const sheetRef = useRef(null);
  const dragStartY = useRef(0);
  const dragCurrentY = useRef(0);
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState(0);

  // Toggle desktop chat collapsed state
  const toggleCollapsed = () => {
    setIsCollapsed(prev => {
      const newValue = !prev;
      localStorage.setItem('chatCollapsed', String(newValue));
      return newValue;
    });
  };

  // Join league room when widget mounts
  useEffect(() => {
    if (leagueId && connected) {
      joinLeague(leagueId);
      return () => leaveLeague(leagueId);
    }
  }, [leagueId, connected, joinLeague, leaveLeague]);

  // Auto-expand chat on xl screens, collapse on smaller
  useEffect(() => {
    const handleResize = () => {
      const isXL = window.innerWidth >= 1280;
      setIsDesktopCollapsed(!isXL);
    };
    
    // Set initial state
    handleResize();
    
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Notify parent when collapsed state changes
  useEffect(() => {
    if (onCollapsedChange) {
      onCollapsedChange(isDesktopCollapsed);
    }
  }, [isDesktopCollapsed, onCollapsedChange]);

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

  // Listen for reactions
  useEffect(() => {
    const unsubscribe = on('reaction-update', ({ messageId, reactions }) => {
      setMessages(prev => prev.map(m => 
        m.id === messageId ? { ...m, reactions } : m
      ));
    });

    return unsubscribe;
  }, [on]);

  // Listen for message updates (including soft deletes)
  useEffect(() => {
    const unsubscribe = on('message-updated', ({ messageId, message, gif, deletedAt, deletedBy }) => {
      setMessages(prev => prev.map(m => 
        m.id === messageId 
          ? { ...m, message, gif, deletedAt, deletedBy }
          : m
      ));
    });

    return unsubscribe;
  }, [on]);

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

  // Scroll to bottom when resizing sheet (especially full -> half)
  useEffect(() => {
    if (sheetSize && mobileMessagesRef.current) {
      // Delay to let the resize animation complete
      setTimeout(() => {
        if (mobileMessagesRef.current) {
          mobileMessagesRef.current.scrollTop = mobileMessagesRef.current.scrollHeight;
        }
      }, 350); // Match the transition duration
    }
  }, [sheetSize]);

  // Save sheet size preference to localStorage
  useEffect(() => {
    if (sheetSize) {
      localStorage.setItem('chatSheetSize', sheetSize);
    }
  }, [sheetSize]);

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
    if (!inputValue.trim() && !selectedMessage?.gif) return;
    
    // Build message with metadata
    const messageData = {
      content: inputValue.trim(),
      replyTo: replyingTo ? {
        id: replyingTo.id,
        userId: replyingTo.user_id || replyingTo.userId,
        displayName: replyingTo.display_name || replyingTo.displayName,
        preview: (replyingTo.message || '').substring(0, 50)
      } : null,
      gif: selectedMessage?.gif || null
    };
    
    sendMessage(leagueId, messageData.content, messageData.replyTo, messageData.gif);
    setInputValue('');
    setReplyingTo(null);
    setShowEmojiPicker(false);
    setShowGifPicker(false);
    stopTyping(leagueId);
    
    if (isMobile && mobileInputRef.current) {
      mobileInputRef.current.focus();
    } else if (!isMobile && inputRef.current) {
      inputRef.current.focus();
    }
  };

  const handleInputChange = (e) => {
    const value = e.target.value;
    setInputValue(value);
    
    // Check for @ mentions
    const cursorPos = e.target.selectionStart;
    const textBeforeCursor = value.substring(0, cursorPos);
    const mentionMatch = textBeforeCursor.match(/@(\w*)$/);
    
    if (mentionMatch) {
      setShowMentions(true);
      setMentionQuery(mentionMatch[1].toLowerCase());
      setMentionIndex(0);
    } else {
      setShowMentions(false);
      setMentionQuery('');
    }
    
    startTyping(leagueId);
    
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }
    
    typingTimeoutRef.current = setTimeout(() => {
      stopTyping(leagueId);
    }, 2000);
  };

  const handleKeyDown = (e, isMobile = false) => {
    // Handle mention selection with arrow keys and enter
    if (showMentions && filteredMembers.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setMentionIndex(prev => Math.min(prev + 1, filteredMembers.length - 1));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setMentionIndex(prev => Math.max(prev - 1, 0));
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        insertMention(filteredMembers[mentionIndex]);
        return;
      }
      if (e.key === 'Escape') {
        setShowMentions(false);
        return;
      }
    }
    
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend(isMobile);
    }
  };

  // Filter members for mentions
  const filteredMembers = members.filter(m => 
    (m.displayName || m.display_name || '').toLowerCase().includes(mentionQuery)
  ).slice(0, 5);

  // Insert mention into input
  const insertMention = (member) => {
    const name = member.displayName || member.display_name || 'User';
    const cursorPos = (mobileInputRef.current || inputRef.current)?.selectionStart || inputValue.length;
    const textBeforeCursor = inputValue.substring(0, cursorPos);
    const textAfterCursor = inputValue.substring(cursorPos);
    const mentionStart = textBeforeCursor.lastIndexOf('@');
    
    const newValue = textBeforeCursor.substring(0, mentionStart) + `@${name} ` + textAfterCursor;
    setInputValue(newValue);
    setShowMentions(false);
    setMentionQuery('');
  };

  // Emoji handling
  const insertEmoji = (emoji) => {
    setInputValue(prev => prev + emoji);
    // Keep emoji picker open for multiple selections
  };

  // GIF search with Tenor API
  const searchGifs = useCallback(async (query) => {
    if (!query.trim()) {
      // Load trending GIFs
      setGifsLoading(true);
      try {
        const res = await fetch(
          `https://tenor.googleapis.com/v2/featured?key=${TENOR_API_KEY}&limit=20&media_filter=gif,tinygif`
        );
        const data = await res.json();
        setGifs(data.results || []);
      } catch (error) {
        console.error('Failed to load trending GIFs:', error);
      }
      setGifsLoading(false);
      return;
    }
    
    setGifsLoading(true);
    try {
      const res = await fetch(
        `https://tenor.googleapis.com/v2/search?key=${TENOR_API_KEY}&q=${encodeURIComponent(query)}&limit=20&media_filter=gif,tinygif`
      );
      const data = await res.json();
      setGifs(data.results || []);
    } catch (error) {
      console.error('Failed to search GIFs:', error);
    }
    setGifsLoading(false);
  }, []);

  // Debounced GIF search
  const handleGifSearch = (query) => {
    setGifSearchQuery(query);
    if (gifSearchTimeout.current) {
      clearTimeout(gifSearchTimeout.current);
    }
    gifSearchTimeout.current = setTimeout(() => {
      searchGifs(query);
    }, 300);
  };

  // Send GIF
  const sendGif = (gif) => {
    console.log('Sending GIF:', gif);
    const gifUrl = gif.media_formats?.gif?.url || gif.media_formats?.tinygif?.url;
    console.log('GIF URL:', gifUrl);
    if (gifUrl) {
      const gifData = { 
        url: gifUrl, 
        width: gif.media_formats?.gif?.dims?.[0] || gif.media_formats?.tinygif?.dims?.[0], 
        height: gif.media_formats?.gif?.dims?.[1] || gif.media_formats?.tinygif?.dims?.[1]
      };
      console.log('Sending message with GIF data:', gifData);
      sendMessage(leagueId, '[GIF]', null, gifData);
      setShowGifPicker(false);
      setGifSearchQuery('');
    } else {
      console.error('No GIF URL found in:', gif.media_formats);
    }
  };

  // Message actions
  const handleMessageTap = (e, message) => {
    // Don't show menu if we were dragging
    if (isSwipeDragging.current) {
      isSwipeDragging.current = false;
      return;
    }
    
    // Don't show menu for deleted messages
    if (message.deletedAt) {
      return;
    }
    
    // Capture click position for desktop menu positioning
    const rect = e.currentTarget.getBoundingClientRect();
    setMenuPosition({
      x: rect.left,
      y: rect.bottom + 8 // 8px below the message
    });
    setSelectedMessage(message);
    setShowMessageMenu(true);
  };

  const handleReply = (message) => {
    setReplyingTo(message);
    setShowMessageMenu(false);
    setSelectedMessage(null);
    // Focus input
    setTimeout(() => {
      (mobileInputRef.current || inputRef.current)?.focus();
    }, 100);
  };

  const handleReact = (message, emoji) => {
    // Use socket to emit reaction
    if (socket && connected) {
      socket.emit('react', { leagueId, messageId: message.id, emoji });
    }
    
    // Update local state optimistically
    const userId = user?.id;
    setMessages(prev => prev.map(m => {
      if (m.id === message.id) {
        const reactions = { ...(m.reactions || {}) };
        const currentUsers = reactions[emoji] || [];
        
        if (currentUsers.includes(userId)) {
          // Remove reaction
          reactions[emoji] = currentUsers.filter(id => id !== userId);
          if (reactions[emoji].length === 0) delete reactions[emoji];
        } else {
          // Add reaction
          reactions[emoji] = [...currentUsers, userId];
        }
        return { ...m, reactions };
      }
      return m;
    }));
    
    setShowMessageMenu(false);
    setSelectedMessage(null);
  };

  // Long press handlers for showing who reacted
  const handleReactionLongPressStart = (message, emoji, users) => {
    longPressTimer.current = setTimeout(() => {
      // Get display names for users who reacted
      const userNames = users.map(userId => {
        if (userId === user?.id) return 'You';
        const member = members.find(m => (m.userId || m.user_id) === userId);
        return member?.displayName || member?.display_name || 'Unknown';
      });
      setReactionDetail({ messageId: message.id, emoji, users: userNames });
    }, 500);
  };

  const handleReactionLongPressEnd = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  const handleReport = async (message) => {
    if (window.confirm('Report this message as inappropriate?')) {
      try {
        const token = await getIdToken();
        await fetch(`${API_URL}/chat/${leagueId}/messages/${message.id}/report`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        });
        alert('Message reported. Thank you.');
      } catch (error) {
        console.error('Failed to report:', error);
      }
    }
    setShowMessageMenu(false);
    setSelectedMessage(null);
  };

  const handleDelete = (message) => {
    if (window.confirm('Delete this message?')) {
      if (socket) {
        socket.emit('delete-message', { leagueId, messageId: message.id });
      }
    }
    setShowMessageMenu(false);
    setSelectedMessage(null);
  };

  const handleModerate = (message) => {
    if (window.confirm('Remove this message as commissioner? It will show as removed.')) {
      if (socket) {
        socket.emit('moderate-message', { leagueId, messageId: message.id });
      }
    }
    setShowMessageMenu(false);
    setSelectedMessage(null);
  };

  // Swipe/drag to reply handlers (works with both touch and mouse)
  const handleSwipeStart = (e, messageId) => {
    // Get clientX from touch or mouse event
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    swipeStartX.current = clientX;
    setSwipingMessageId(messageId);
    isSwipeDragging.current = false; // Reset drag flag
  };

  const handleSwipeMove = (e) => {
    if (!swipingMessageId) return;
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const diff = clientX - swipeStartX.current;
    // Only allow right swipe (positive diff), with max of 80px
    if (diff > 5) { // 5px threshold before considering it a drag
      isSwipeDragging.current = true;
      setSwipeOffset(Math.min(diff, 80));
    }
  };

  const handleSwipeEnd = (message) => {
    if (swipeOffset > 50 && !message.deletedAt) {
      // Trigger reply (only if not deleted)
      handleReply(message);
    }
    setSwipeOffset(0);
    setSwipingMessageId(null);
    isSwipeDragging.current = false;
  };

  // Mouse-specific handlers for desktop drag-to-reply
  const handleMouseDown = (e, messageId) => {
    handleSwipeStart(e, messageId);
    // Add document-level listeners for mouse move/up
    const currentMessage = messages.find(m => m.id === messageId);
    
    const onMouseMove = (moveEvent) => {
      handleSwipeMove(moveEvent);
    };
    
    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      if (currentMessage) {
        handleSwipeEnd(currentMessage);
      } else {
        setSwipeOffset(0);
        setSwipingMessageId(null);
      }
    };
    
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  };

  // Load trending GIFs when picker opens
  useEffect(() => {
    if (showGifPicker && gifs.length === 0) {
      searchGifs('');
    }
  }, [showGifPicker, searchGifs]);

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
      // Don't reset sheetSize - preserve user's preference
    }, 300);
  };

  const openSheet = () => {
    setIsOpen(true);
    setIsClosing(false);
    // sheetSize is already set from localStorage or previous session
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
    if (sheetSize === 'half') return '35%';
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

  // Auto-scroll when someone starts typing
  useEffect(() => {
    if (currentTyping.length > 0 && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [currentTyping]);

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
            
            const messageTime = new Date(message.created_at || message.createdAt).getTime();
            const prevMessageTime = prevMessage ? new Date(prevMessage.created_at || prevMessage.createdAt).getTime() : 0;
            const timeGapMinutes = prevMessage ? (messageTime - prevMessageTime) / (1000 * 60) : 0;
            const hasSignificantTimeGap = timeGapMinutes > 5;
            
            const showName = idx === 0 || prevUserId !== messageUserId || hasSignificantTimeGap;
            const displayName = message.display_name || message.displayName;
            const isBeingSwiped = swipingMessageId === message.id;
            const messageSwipeOffset = isBeingSwiped ? swipeOffset : 0;

            return (
              <div 
                key={message.id} 
                className={`flex gap-2 ${showName ? 'mt-4' : 'mt-1'} relative select-none`}
                style={{ transform: `translateX(${messageSwipeOffset}px)`, transition: isBeingSwiped ? 'none' : 'transform 0.2s' }}
                onTouchStart={(e) => handleSwipeStart(e, message.id)}
                onTouchMove={handleSwipeMove}
                onTouchEnd={() => handleSwipeEnd(message)}
                onMouseDown={(e) => {
                  // Only handle left click and not on buttons/inputs
                  if (e.button === 0 && !e.target.closest('button')) {
                    handleMouseDown(e, message.id);
                  }
                }}
              >
                {/* Swipe reply indicator */}
                {messageSwipeOffset > 0 && (
                  <div 
                    className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-full pl-2 flex items-center"
                    style={{ opacity: messageSwipeOffset / 80 }}
                  >
                    <div className={`p-2 rounded-full ${messageSwipeOffset > 50 ? 'bg-nfl-blue' : 'bg-white/10'}`}>
                      <CornerUpLeft className="w-4 h-4 text-white" />
                    </div>
                  </div>
                )}

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
                  
                  {/* Reply context */}
                  {message.replyTo && (
                    <div className="ml-1 mb-1 pl-2 border-l-2 border-white/20 text-xs text-white/40">
                      <span className="font-medium text-white/50">{message.replyTo.displayName}</span>
                      <p className="truncate italic">
                        {/* Check if the original message was deleted by finding it in messages */}
                        {messages.find(m => m.id === message.replyTo.id)?.deletedAt
                          ? 'This message was deleted'
                          : message.replyTo.preview
                        }
                      </p>
                    </div>
                  )}

                  {/* Deleted message placeholder */}
                  {message.deletedAt ? (
                    <div className="inline-block px-3 py-2 rounded-2xl rounded-tl-md bg-white/5 border border-white/10">
                      <p className="text-sm text-white/40 italic">
                        {message.deletedBy === 'commissioner' 
                          ? '🛡️ Message removed by commissioner'
                          : 'This message was deleted'
                        }
                      </p>
                    </div>
                  ) : (
                    <>
                      {/* GIF content - displayed without bubble */}
                      {message.gif && (
                        <div 
                          className="cursor-pointer active:scale-[0.98] transition-all hover:brightness-110"
                          onClick={(e) => handleMessageTap(e, message)}
                        >
                          <img 
                            src={message.gif.url} 
                            alt="GIF" 
                            className="rounded-2xl max-w-[240px] max-h-[240px] object-cover"
                            loading="lazy"
                          />
                        </div>
                      )}

                      {/* Text content with bubble - only show if there's actual text (not just [GIF]) */}
                      {message.message && message.message !== '[GIF]' && (
                        <div
                          className={`inline-block px-3 py-2 rounded-2xl rounded-tl-md cursor-pointer active:scale-[0.98] transition-all hover:ring-1 hover:ring-white/20 ${
                            isOwn
                              ? 'bg-emerald-600/20 border border-emerald-500/30 text-white hover:bg-emerald-600/30'
                              : 'bg-white/10 text-white hover:bg-white/15'
                          }`}
                          onClick={(e) => handleMessageTap(e, message)}
                        >
                          <p className="text-sm whitespace-pre-wrap break-words">
                            {parseMentions(message.message, members).map((part, i) => 
                              typeof part === 'object' && part.type === 'mention' ? (
                                <span key={part.key} className="text-blue-400 font-medium">{part.text}</span>
                              ) : part
                            )}
                          </p>
                        </div>
                      )}
                    </>
                  )}
                  
                  {/* Reactions */}
                  {message.reactions && Object.keys(message.reactions).length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1 ml-1">
                      {Object.entries(message.reactions).map(([emoji, users]) => (
                        <button
                          key={emoji}
                          onClick={() => handleReact(message, emoji)}
                          onTouchStart={() => handleReactionLongPressStart(message, emoji, users)}
                          onTouchEnd={handleReactionLongPressEnd}
                          onTouchCancel={handleReactionLongPressEnd}
                          onMouseDown={() => handleReactionLongPressStart(message, emoji, users)}
                          onMouseUp={handleReactionLongPressEnd}
                          onMouseLeave={handleReactionLongPressEnd}
                          className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs transition-all active:scale-95 ${
                            users.includes(user?.id) 
                              ? 'bg-nfl-blue/30 border border-nfl-blue/50' 
                              : 'bg-white/10 hover:bg-white/20 border border-transparent'
                          }`}
                        >
                          <span>{emoji}</span>
                          <span className="text-white/60 min-w-[1ch]">{users.length}</span>
                        </button>
                      ))}
                      {/* Add reaction button */}
                      <button
                        onClick={(e) => handleMessageTap(e, message)}
                        className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-white/5 hover:bg-white/10 text-white/40 text-sm transition-colors"
                      >
                        +
                      </button>
                    </div>
                  )}
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
          <span>
            {currentTyping.length === 1 
              ? `${currentTyping[0]} is typing...` 
              : `${currentTyping.length} people are typing...`
            }
          </span>
        </div>
      )}

      <div ref={messagesEndRef} />
    </>
  );

  return (
    <>
      {/* Desktop: Collapsible sidebar */}
      <div className="hidden lg:block">
        {/* Collapsed state - slim bar */}
        <div 
          className={`fixed top-16 right-0 bottom-0 w-14 bg-slate-900 border-l border-white/10 flex flex-col items-center py-4 transition-all duration-300 z-40 ${
            isDesktopCollapsed ? 'translate-x-0' : 'translate-x-full'
          }`}
        >
          <button
            onClick={() => setIsDesktopCollapsed(false)}
            className="relative p-3 rounded-xl bg-slate-800 hover:bg-slate-700 transition-colors group"
            title="Open Chat"
          >
            <MessageCircle className="w-6 h-6 text-white/70 group-hover:text-white transition-colors" />
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </button>
          
          {/* Online indicator */}
          <div className="mt-3 flex flex-col items-center gap-1">
            <div className="w-2 h-2 bg-emerald-500 rounded-full" />
            <span className="text-[10px] text-white/40">{currentOnline.length}</span>
          </div>
          
          {/* Typing indicator */}
          {currentTyping.length > 0 && (
            <div className="mt-3 flex flex-col items-center gap-1" title={currentTyping.length === 1 ? `${currentTyping[0]} is typing...` : `${currentTyping.length} people typing...`}>
              <div className="flex gap-0.5">
                <span className="w-1.5 h-1.5 bg-nfl-blue rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-1.5 h-1.5 bg-nfl-blue rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-1.5 h-1.5 bg-nfl-blue rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          )}
        </div>

        {/* Expanded state - full chat */}
        <div 
          className={`fixed top-16 right-0 bottom-0 w-96 xl:w-[420px] bg-slate-900 border-l border-white/10 flex flex-col transition-all duration-300 z-40 ${
            isDesktopCollapsed ? 'translate-x-full' : 'translate-x-0'
          }`}
        >
          {/* Profile Panel (overlay) */}
          {selectedProfile && (
            <ProfilePanel profile={selectedProfile} onClose={() => setSelectedProfile(null)} />
          )}

          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 bg-slate-800 border-b border-white/10">
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-white">League Chat</h3>
              {currentTyping.length > 0 ? (
                <p className="text-xs text-nfl-blue flex items-center gap-1.5">
                  <span className="flex gap-0.5">
                    <span className="w-1.5 h-1.5 bg-nfl-blue rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-1.5 h-1.5 bg-nfl-blue rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-1.5 h-1.5 bg-nfl-blue rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                  </span>
                  <span className="truncate">
                    {currentTyping.length === 1 
                      ? `${currentTyping[0]} is typing...` 
                      : `${currentTyping.length} people typing...`
                    }
                  </span>
                </p>
              ) : (
                <p className="text-xs text-white/50 flex items-center gap-1">
                  <Users className="w-3 h-3" />
                  {currentOnline.length} online
                  {connected ? '' : ' • Reconnecting...'}
                </p>
              )}
            </div>
            <button
              onClick={() => setIsDesktopCollapsed(true)}
              className="p-2 hover:bg-white/10 rounded-lg transition-colors"
              title="Collapse Chat"
            >
              <PanelRightClose className="w-5 h-5 text-white/60" />
            </button>
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
          <div className="border-t border-white/10 bg-slate-800/50 relative">
            {/* Reply preview */}
            {replyingTo && (
              <div className="px-3 pt-2 flex items-center gap-2">
                <div className="flex-1 min-w-0 pl-2 border-l-2 border-emerald-500 bg-white/5 rounded-r py-1 pr-2">
                  <p className="text-xs text-emerald-400 font-medium truncate">
                    Replying to {replyingTo.display_name || replyingTo.displayName}
                  </p>
                  <p className="text-xs text-white/50 truncate">{replyingTo.message}</p>
                </div>
                <button onClick={() => setReplyingTo(null)} className="flex-shrink-0 p-1 hover:bg-white/10 rounded">
                  <X className="w-3 h-3 text-white/40" />
                </button>
              </div>
            )}
            
            {/* Mentions dropdown */}
            {showMentions && filteredMembers.length > 0 && (
              <div className="absolute bottom-full left-3 right-3 mb-2 bg-slate-800 border border-white/10 rounded-xl overflow-hidden shadow-xl z-10">
                {filteredMembers.map((member, idx) => (
                  <button
                    key={member.userId || member.user_id}
                    onClick={() => insertMention(member)}
                    className={`w-full px-3 py-2 flex items-center gap-2 text-left text-sm transition-colors ${
                      idx === mentionIndex ? 'bg-nfl-blue/20' : 'hover:bg-white/5'
                    }`}
                  >
                    <Avatar userId={member.userId || member.user_id} name={member.displayName || member.display_name} size="xs" />
                    <span className="text-white">{member.displayName || member.display_name}</span>
                  </button>
                ))}
              </div>
            )}
            
            {/* Emoji picker */}
            {showEmojiPicker && (
              <div className="absolute bottom-full left-3 mb-2 bg-slate-800 border border-white/10 rounded-xl overflow-hidden shadow-xl z-10 w-80">
                {/* Category tabs */}
                <div className="flex border-b border-white/10 overflow-x-auto hide-scrollbar">
                  {Object.keys(EMOJI_CATEGORIES).map(cat => (
                    <button
                      key={cat}
                      onClick={() => setEmojiCategory(cat)}
                      className={`px-3 py-2 text-xs capitalize whitespace-nowrap transition-colors ${
                        emojiCategory === cat ? 'text-nfl-blue border-b-2 border-nfl-blue' : 'text-white/50 hover:text-white/70'
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
                {/* Emoji grid */}
                <div className="p-2 h-48 overflow-y-auto">
                  <div className="grid grid-cols-8 gap-1">
                    {EMOJI_CATEGORIES[emojiCategory].map((emoji, idx) => (
                      <button
                        key={idx}
                        onClick={() => insertEmoji(emoji)}
                        className="p-1.5 text-xl hover:bg-white/10 rounded transition-colors"
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
            
            {/* GIF picker */}
            {showGifPicker && (
              <div className="absolute bottom-full left-3 mb-2 bg-slate-800 border border-white/10 rounded-xl overflow-hidden shadow-xl z-10 w-80">
                {/* Search */}
                <div className="p-2 border-b border-white/10">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
                    <input
                      type="text"
                      value={gifSearchQuery}
                      onChange={(e) => handleGifSearch(e.target.value)}
                      placeholder="Search GIFs..."
                      className="w-full pl-9 pr-3 py-2 bg-white/10 border border-white/10 rounded-lg text-sm text-white placeholder-white/40 focus:outline-none focus:border-nfl-blue/50"
                    />
                  </div>
                </div>
                {/* GIF grid */}
                <div className="p-2 h-56 overflow-y-auto">
                  {gifsLoading ? (
                    <div className="text-center text-white/40 py-8">Loading...</div>
                  ) : gifs.length === 0 ? (
                    <div className="text-center text-white/40 py-8">No GIFs found</div>
                  ) : (
                    <div className="grid grid-cols-2 gap-2">
                      {gifs.map((gif) => (
                        <button
                          key={gif.id}
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            sendGif(gif);
                          }}
                          className="aspect-video rounded-lg overflow-hidden hover:ring-2 ring-nfl-blue transition-all active:scale-95"
                        >
                          <img 
                            src={gif.media_formats?.tinygif?.url || gif.media_formats?.gif?.url} 
                            alt={gif.content_description || 'GIF'}
                            className="w-full h-full object-cover pointer-events-none"
                            loading="lazy"
                          />
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <div className="px-2 py-1 border-t border-white/10 text-center">
                  <span className="text-[10px] text-white/30">Powered by Tenor</span>
                </div>
              </div>
            )}
            
            {/* Input row */}
            <div className="p-3 flex gap-2">
              {/* Emoji button */}
              <button
                onClick={() => {
                  setShowEmojiPicker(!showEmojiPicker);
                  setShowGifPicker(false);
                }}
                className={`p-2 rounded-lg transition-colors ${showEmojiPicker ? 'bg-nfl-blue text-white' : 'text-white/50 hover:bg-white/10'}`}
              >
                <Smile className="w-5 h-5" />
              </button>
              {/* GIF button */}
              <button
                onClick={() => {
                  setShowGifPicker(!showGifPicker);
                  setShowEmojiPicker(false);
                }}
                className={`p-2 rounded-lg transition-colors ${showGifPicker ? 'bg-nfl-blue text-white' : 'text-white/50 hover:bg-white/10'}`}
              >
                <span className="text-xs font-bold">GIF</span>
              </button>
              <input
                ref={inputRef}
                type="text"
                value={inputValue}
                onChange={handleInputChange}
                onKeyDown={(e) => handleKeyDown(e, false)}
                onFocus={() => { setShowEmojiPicker(false); setShowGifPicker(false); }}
                placeholder={replyingTo ? "Type your reply..." : "Type a message... Use @ to mention"}
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
          
          {/* Desktop Reaction Detail popup - moved outside */}
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
          <div className={`bg-slate-900 border-t transition-colors duration-300 ${
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
                      {messages[messages.length - 1]?.gif 
                        ? 'Sent a GIF 🎞️' 
                        : messages[messages.length - 1]?.message === '[GIF]'
                          ? 'Sent a GIF 🎞️'
                          : messages[messages.length - 1]?.message || 'No messages yet'
                      }
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
            {/* Backdrop - pass-through in half mode so users can interact with league details */}
            <div 
              className={`fixed inset-0 z-50 transition-opacity duration-300 ${
                sheetSize === 'half' 
                  ? 'bg-black/20 pointer-events-none' 
                  : 'bg-black/60 backdrop-blur-sm'
              } ${
                isAnimatingIn && !isClosing ? 'opacity-100' : 'opacity-0'
              }`}
              onClick={sheetSize === 'half' ? undefined : closeSheet}
            />
            
            {/* Chat Panel - Bottom Sheet */}
            <div 
              ref={sheetRef}
              className={`fixed inset-x-0 bottom-0 z-50 bg-slate-900 flex flex-col rounded-t-3xl shadow-2xl overflow-hidden ${
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
                    {currentTyping.length > 0 ? (
                      <p className="text-xs text-nfl-blue flex items-center gap-1.5">
                        <span className="flex gap-0.5">
                          <span className="w-1.5 h-1.5 bg-nfl-blue rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                          <span className="w-1.5 h-1.5 bg-nfl-blue rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                          <span className="w-1.5 h-1.5 bg-nfl-blue rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                        </span>
                        <span className="truncate">
                          {currentTyping.length === 1 
                            ? `${currentTyping[0]} is typing...` 
                            : `${currentTyping.length} people typing...`
                          }
                        </span>
                      </p>
                    ) : (
                      <p className="text-xs text-white/50 flex items-center gap-1">
                        <Users className="w-3 h-3" />
                        {currentOnline.length} online
                        {connected ? '' : ' • Reconnecting...'}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    {/* Size toggle button */}
                    <button
                      onClick={() => setSheetSize(sheetSize === 'full' ? 'half' : 'full')}
                      className="p-2 hover:bg-white/10 rounded-full transition-colors"
                      title={sheetSize === 'full' ? 'Minimize' : 'Maximize'}
                    >
                      {sheetSize === 'full' ? (
                        <Minimize2 className="w-5 h-5 text-white/60" />
                      ) : (
                        <Maximize2 className="w-5 h-5 text-white/60" />
                      )}
                    </button>
                    {/* Close button */}
                    <button
                      onClick={closeSheet}
                      className="p-2 hover:bg-white/10 rounded-full transition-colors"
                    >
                      <X className="w-5 h-5 text-white/60" />
                    </button>
                  </div>
                </div>
              </div>

              {/* Messages */}
              <div 
                ref={mobileMessagesRef}
                onScroll={handleScroll}
                className="flex-1 overflow-y-auto overflow-x-hidden p-4"
                style={{ touchAction: 'pan-y' }}
              >
                {renderMessages()}
              </div>

              {/* Input area - always shown, simplified in half mode */}
              <div className="border-t border-white/10 bg-slate-800/50">
                {/* Reply preview - only in full mode */}
                {sheetSize === 'full' && replyingTo && (
                  <div className="px-3 pt-2 flex items-center gap-2">
                    <div className="flex-1 min-w-0 pl-3 border-l-2 border-emerald-500 bg-white/5 rounded-r py-1.5 pr-2">
                      <p className="text-xs text-emerald-400 font-medium truncate">
                        Replying to {replyingTo.display_name || replyingTo.displayName}
                      </p>
                      <p className="text-xs text-white/50 truncate">{replyingTo.message}</p>
                    </div>
                    <button onClick={() => setReplyingTo(null)} className="flex-shrink-0 p-1 hover:bg-white/10 rounded">
                      <X className="w-4 h-4 text-white/40" />
                    </button>
                  </div>
                )}
                
                {/* Mentions dropdown - only in full mode */}
                {sheetSize === 'full' && showMentions && filteredMembers.length > 0 && (
                  <div className="mx-3 mt-2 bg-slate-800 border border-white/10 rounded-xl overflow-hidden shadow-xl">
                    {filteredMembers.map((member, idx) => (
                      <button
                        key={member.userId || member.user_id}
                        onClick={() => insertMention(member)}
                        className={`w-full px-3 py-2 flex items-center gap-2 text-left transition-colors ${
                          idx === mentionIndex ? 'bg-nfl-blue/20' : 'hover:bg-white/5'
                        }`}
                      >
                        <Avatar userId={member.userId || member.user_id} name={member.displayName || member.display_name} size="xs" />
                        <span className="text-sm text-white">{member.displayName || member.display_name}</span>
                      </button>
                    ))}
                  </div>
                )}
                
                {/* Emoji picker - only in full mode */}
                {sheetSize === 'full' && showEmojiPicker && (
                  <div className="mx-3 mt-2 bg-slate-800 border border-white/10 rounded-xl overflow-hidden shadow-xl">
                    {/* Category tabs */}
                    <div className="flex border-b border-white/10 overflow-x-auto hide-scrollbar">
                      {Object.keys(EMOJI_CATEGORIES).map(cat => (
                        <button
                          key={cat}
                          onClick={() => setEmojiCategory(cat)}
                          className={`px-3 py-2 text-xs capitalize whitespace-nowrap transition-colors ${
                            emojiCategory === cat ? 'text-nfl-blue border-b-2 border-nfl-blue' : 'text-white/50'
                          }`}
                        >
                          {cat}
                        </button>
                      ))}
                    </div>
                    {/* Emoji grid */}
                    <div className="p-2 h-48 overflow-y-auto">
                      <div className="grid grid-cols-8 gap-1">
                        {EMOJI_CATEGORIES[emojiCategory].map((emoji, idx) => (
                          <button
                            key={idx}
                            onClick={() => insertEmoji(emoji)}
                            className="p-1.5 text-xl hover:bg-white/10 rounded transition-colors"
                          >
                            {emoji}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
                
                {/* GIF picker - only in full mode */}
                {sheetSize === 'full' && showGifPicker && (
                  <div className="mx-3 mt-2 bg-slate-800 border border-white/10 rounded-xl overflow-hidden shadow-xl">
                    {/* Search */}
                    <div className="p-2 border-b border-white/10">
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
                        <input
                          type="text"
                          value={gifSearchQuery}
                          onChange={(e) => handleGifSearch(e.target.value)}
                          placeholder="Search GIFs..."
                          className="w-full pl-9 pr-3 py-2 bg-white/10 border border-white/10 rounded-lg text-[16px] text-white placeholder-white/40 focus:outline-none focus:border-nfl-blue/50"
                          style={{ fontSize: '16px' }}
                        />
                      </div>
                    </div>
                    {/* GIF grid */}
                    <div className="p-2 h-56 overflow-y-auto">
                      {gifsLoading ? (
                        <div className="text-center text-white/40 py-8">Loading...</div>
                      ) : gifs.length === 0 ? (
                        <div className="text-center text-white/40 py-8">No GIFs found</div>
                      ) : (
                        <div className="grid grid-cols-2 gap-2">
                          {gifs.map((gif) => (
                            <button
                              key={gif.id}
                              type="button"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                sendGif(gif);
                              }}
                              className="aspect-video rounded-lg overflow-hidden hover:ring-2 ring-nfl-blue transition-all active:scale-95"
                            >
                              <img 
                                src={gif.media_formats?.tinygif?.url || gif.media_formats?.gif?.url} 
                                alt={gif.content_description || 'GIF'}
                                className="w-full h-full object-cover pointer-events-none"
                                loading="lazy"
                              />
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="px-2 py-1 border-t border-white/10 text-center">
                      <span className="text-[10px] text-white/30">Powered by Tenor</span>
                    </div>
                  </div>
                )}
                
                {/* Input row - always visible */}
                <div className="p-2 pb-safe flex items-center gap-2">
                  {/* Emoji button - in half mode, expands and opens picker */}
                  {sheetSize === 'half' && (
                    <button
                      onClick={() => {
                        setSheetSize('full');
                        setShowEmojiPicker(true);
                        setShowGifPicker(false);
                      }}
                      className="p-2 rounded-xl bg-white/10 text-white/60 hover:bg-white/20 transition-colors"
                    >
                      <Smile className="w-5 h-5" />
                    </button>
                  )}
                  
                  {/* GIF button - in half mode, expands and opens picker */}
                  {sheetSize === 'half' && (
                    <button
                      onClick={() => {
                        setSheetSize('full');
                        setShowGifPicker(true);
                        setShowEmojiPicker(false);
                      }}
                      className="p-2 rounded-xl bg-white/10 text-white/60 hover:bg-white/20 transition-colors"
                    >
                      <span className="text-xs font-bold">GIF</span>
                    </button>
                  )}
                  
                  {/* Emoji button - only in full mode */}
                  {sheetSize === 'full' && (
                    <button
                      onClick={() => {
                        setShowEmojiPicker(!showEmojiPicker);
                        setShowGifPicker(false);
                      }}
                      className={`p-2.5 rounded-xl transition-colors ${showEmojiPicker ? 'bg-nfl-blue text-white' : 'bg-white/10 text-white/60 hover:bg-white/20'}`}
                    >
                      <Smile className="w-5 h-5" />
                    </button>
                  )}
                  
                  {/* GIF button - only in full mode */}
                  {sheetSize === 'full' && (
                    <button
                      onClick={() => {
                        setShowGifPicker(!showGifPicker);
                        setShowEmojiPicker(false);
                      }}
                      className={`p-2.5 rounded-xl transition-colors ${showGifPicker ? 'bg-nfl-blue text-white' : 'bg-white/10 text-white/60 hover:bg-white/20'}`}
                    >
                      <span className="text-xs font-bold">GIF</span>
                    </button>
                  )}
                  
                  {/* Text input */}
                  <input
                    ref={mobileInputRef}
                    type="text"
                    value={inputValue}
                    onChange={handleInputChange}
                    onKeyDown={(e) => handleKeyDown(e, true)}
                    onFocus={() => { 
                      setShowEmojiPicker(false); 
                      setShowGifPicker(false);
                    }}
                    placeholder={sheetSize === 'half' ? "Type a message..." : (replyingTo ? "Type your reply..." : "Type a message... @ to mention")}
                    className="flex-1 bg-white/10 border border-white/10 rounded-xl px-3 py-2 text-white placeholder-white/40 focus:outline-none focus:border-nfl-blue/50 text-[16px]"
                    style={{ fontSize: '16px', touchAction: 'manipulation' }}
                  />
                  
                  {/* Send button */}
                  <button
                    onClick={() => handleSend(true)}
                    disabled={!inputValue.trim()}
                    className="p-2 bg-nfl-blue rounded-xl text-white disabled:opacity-50 disabled:cursor-not-allowed hover:bg-nfl-blue/80 transition-colors"
                  >
                    <Send className="w-5 h-5" />
                  </button>
                </div>
              </div>
              
              {/* Message action menu */}
              {showMessageMenu && selectedMessage && (
                <div 
                  className="absolute inset-0 z-50 flex items-end justify-center bg-black/50"
                  onClick={() => { setShowMessageMenu(false); setSelectedMessage(null); }}
                >
                  <div 
                    className="w-full max-w-sm bg-slate-800 rounded-t-2xl overflow-hidden animate-slide-up"
                    onClick={e => e.stopPropagation()}
                  >
                    {/* Quick reactions */}
                    <div className="flex justify-center gap-2 p-4 border-b border-white/10">
                      {QUICK_REACTIONS.map(emoji => (
                        <button
                          key={emoji}
                          onClick={() => handleReact(selectedMessage, emoji)}
                          className="p-2 text-2xl hover:bg-white/10 rounded-full transition-colors active:scale-90"
                        >
                          {emoji}
                        </button>
                      ))}
                    </div>
                    
                    {/* Actions */}
                    <div className="p-2">
                      {/* Reply - always available unless message is deleted */}
                      {!selectedMessage?.deletedAt && (
                        <button
                          onClick={() => handleReply(selectedMessage)}
                          className="w-full px-4 py-3 flex items-center gap-3 text-white hover:bg-white/5 rounded-xl transition-colors"
                        >
                          <Reply className="w-5 h-5 text-white/60" />
                          <span>Reply</span>
                        </button>
                      )}
                      
                      {/* Own message - Delete option */}
                      {!selectedMessage?.deletedAt && (selectedMessage?.user_id || selectedMessage?.userId) === user?.id && (
                        <button
                          onClick={() => handleDelete(selectedMessage)}
                          className="w-full px-4 py-3 flex items-center gap-3 text-red-400 hover:bg-white/5 rounded-xl transition-colors"
                        >
                          <Trash2 className="w-5 h-5" />
                          <span>Delete</span>
                        </button>
                      )}
                      
                      {/* Other's message - Commissioner can moderate */}
                      {!selectedMessage?.deletedAt && (selectedMessage?.user_id || selectedMessage?.userId) !== user?.id && (
                        <>
                          {user?.id === commissionerId && (
                            <button
                              onClick={() => handleModerate(selectedMessage)}
                              className="w-full px-4 py-3 flex items-center gap-3 text-yellow-400 hover:bg-white/5 rounded-xl transition-colors"
                            >
                              <ShieldX className="w-5 h-5" />
                              <span>Remove as Commish</span>
                            </button>
                          )}
                          <button
                            onClick={() => handleReport(selectedMessage)}
                            className="w-full px-4 py-3 flex items-center gap-3 text-red-400 hover:bg-white/5 rounded-xl transition-colors"
                          >
                            <AlertCircle className="w-5 h-5" />
                            <span>Report</span>
                          </button>
                        </>
                      )}
                    </div>
                    
                    {/* Cancel */}
                    <div className="p-2 border-t border-white/10">
                      <button
                        onClick={() => { setShowMessageMenu(false); setSelectedMessage(null); }}
                        className="w-full px-4 py-3 text-white/60 hover:bg-white/5 rounded-xl transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                </div>
              )}
              
              {/* Reaction detail popup (who reacted) */}
              {reactionDetail && (
                <div 
                  className="absolute inset-0 z-50 flex items-center justify-center bg-black/50"
                  onClick={() => setReactionDetail(null)}
                >
                  <div 
                    className="bg-slate-800 rounded-2xl overflow-hidden shadow-xl animate-slide-up mx-4 max-w-xs w-full"
                    onClick={e => e.stopPropagation()}
                  >
                    <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-2xl">{reactionDetail.emoji}</span>
                        <span className="text-white font-medium">{reactionDetail.users.length}</span>
                      </div>
                      <button 
                        onClick={() => setReactionDetail(null)}
                        className="p-1 hover:bg-white/10 rounded-full"
                      >
                        <X className="w-4 h-4 text-white/50" />
                      </button>
                    </div>
                    <div className="p-2 max-h-60 overflow-y-auto">
                      {reactionDetail.users.map((name, idx) => (
                        <div key={idx} className="px-3 py-2 text-white text-sm">
                          {name}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* Global Message Action Menu (popup) - desktop only, outside transformed containers */}
      {showMessageMenu && selectedMessage && (
        <div 
          className="hidden lg:block fixed inset-0 z-[100]"
          onClick={() => { setShowMessageMenu(false); setSelectedMessage(null); }}
        >
          <div 
            className="absolute bg-slate-800 rounded-xl shadow-2xl border border-white/10 overflow-hidden w-56 animate-scale-in"
            style={{ 
              top: Math.min(menuPosition.y, window.innerHeight - 200),
              left: Math.min(Math.max(menuPosition.x, 16), window.innerWidth - 240),
            }}
            onClick={e => e.stopPropagation()}
          >
            {/* Quick reactions */}
            <div className="flex justify-center gap-1 p-3 border-b border-white/10">
              {QUICK_REACTIONS.map(emoji => (
                <button
                  key={emoji}
                  onClick={() => handleReact(selectedMessage, emoji)}
                  className="p-1.5 text-lg hover:bg-white/10 rounded-full transition-colors active:scale-90"
                >
                  {emoji}
                </button>
              ))}
            </div>
            
            {/* Actions */}
            <div className="p-1">
              {/* Reply - always available unless message is deleted */}
              {!selectedMessage?.deletedAt && (
                <button
                  onClick={() => handleReply(selectedMessage)}
                  className="w-full px-3 py-2 flex items-center gap-3 text-white text-sm hover:bg-white/5 rounded-lg transition-colors"
                >
                  <Reply className="w-4 h-4 text-white/60" />
                  <span>Reply</span>
                </button>
              )}
              
              {/* Own message - Delete option */}
              {!selectedMessage?.deletedAt && (selectedMessage?.user_id || selectedMessage?.userId) === user?.id && (
                <button
                  onClick={() => handleDelete(selectedMessage)}
                  className="w-full px-3 py-2 flex items-center gap-3 text-red-400 text-sm hover:bg-white/5 rounded-lg transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>Delete</span>
                </button>
              )}
              
              {/* Other's message - Commissioner can moderate */}
              {!selectedMessage?.deletedAt && (selectedMessage?.user_id || selectedMessage?.userId) !== user?.id && (
                <>
                  {user?.id === commissionerId && (
                    <button
                      onClick={() => handleModerate(selectedMessage)}
                      className="w-full px-3 py-2 flex items-center gap-3 text-yellow-400 text-sm hover:bg-white/5 rounded-lg transition-colors"
                    >
                      <ShieldX className="w-4 h-4" />
                      <span>Remove as Commish</span>
                    </button>
                  )}
                  <button
                    onClick={() => handleReport(selectedMessage)}
                    className="w-full px-3 py-2 flex items-center gap-3 text-red-400 text-sm hover:bg-white/5 rounded-lg transition-colors"
                  >
                    <AlertCircle className="w-4 h-4" />
                    <span>Report</span>
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Global Reaction Detail popup - desktop only */}
      {reactionDetail && (
        <div 
          className="hidden lg:flex fixed inset-0 z-[100] items-center justify-center"
          onClick={() => setReactionDetail(null)}
        >
          <div 
            className="bg-slate-800 rounded-xl overflow-hidden shadow-xl border border-white/10 max-w-xs w-full mx-4"
            onClick={e => e.stopPropagation()}
          >
            <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-2xl">{reactionDetail.emoji}</span>
                <span className="text-white font-medium">{reactionDetail.users.length}</span>
              </div>
              <button 
                onClick={() => setReactionDetail(null)}
                className="p-1 hover:bg-white/10 rounded-full"
              >
                <X className="w-4 h-4 text-white/50" />
              </button>
            </div>
            <div className="p-2 max-h-60 overflow-y-auto">
              {reactionDetail.users.map((name, idx) => (
                <div key={idx} className="px-3 py-2 text-white text-sm">
                  {name}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}