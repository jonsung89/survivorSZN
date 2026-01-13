import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Bell, 
  X, 
  Check, 
  CheckCheck, 
  Trash2, 
  AtSign, 
  MessageCircle,
  Trophy,
  Loader2
} from 'lucide-react';
import { notificationAPI } from '../api';
import { useSocket } from '../context/SocketContext';
import Avatar from './Avatar';

export default function NotificationPanel() {
  const navigate = useNavigate();
  const { socket } = useSocket();
  
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  
  const panelRef = useRef(null);

  // Close panel when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (panelRef.current && !panelRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Fetch unread count on mount
  useEffect(() => {
    fetchUnreadCount();
  }, []);

  // Listen for real-time notifications
  useEffect(() => {
    if (!socket) return;

    const handleNewNotification = (notification) => {
      setNotifications(prev => [notification, ...prev]);
      setUnreadCount(prev => prev + 1);
    };

    socket.on('notification', handleNewNotification);

    return () => {
      socket.off('notification', handleNewNotification);
    };
  }, [socket]);

  const fetchUnreadCount = async () => {
    try {
      const data = await notificationAPI.getUnreadCount();
      setUnreadCount(data.count || 0);
    } catch (error) {
      console.error('Failed to fetch unread count:', error);
    }
  };

  const fetchNotifications = async (loadMore = false) => {
    setLoading(true);
    try {
      const offset = loadMore ? notifications.length : 0;
      const data = await notificationAPI.getNotifications(20, offset);
      
      if (loadMore) {
        setNotifications(prev => [...prev, ...data.notifications]);
      } else {
        setNotifications(data.notifications || []);
      }
      setUnreadCount(data.unreadCount || 0);
      setHasMore(data.hasMore);
    } catch (error) {
      console.error('Failed to fetch notifications:', error);
    }
    setLoading(false);
  };

  const handleOpen = () => {
    setIsOpen(!isOpen);
    if (!isOpen) {
      fetchNotifications();
    }
  };

  const handleNotificationClick = async (notification) => {
    // Mark as read
    if (!notification.read) {
      try {
        await notificationAPI.markAsRead(notification.id);
        setNotifications(prev => 
          prev.map(n => n.id === notification.id ? { ...n, read: true } : n)
        );
        setUnreadCount(prev => Math.max(0, prev - 1));
      } catch (error) {
        console.error('Failed to mark as read:', error);
      }
    }

    // Navigate to the league
    if (notification.league_id || notification.leagueId) {
      setIsOpen(false);
      navigate(`/league/${notification.league_id || notification.leagueId}`);
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await notificationAPI.markAllAsRead();
      setNotifications(prev => prev.map(n => ({ ...n, read: true })));
      setUnreadCount(0);
    } catch (error) {
      console.error('Failed to mark all as read:', error);
    }
  };

  const handleDelete = async (e, notificationId) => {
    e.stopPropagation();
    try {
      await notificationAPI.delete(notificationId);
      setNotifications(prev => prev.filter(n => n.id !== notificationId));
      // Update unread count if deleted notification was unread
      const deleted = notifications.find(n => n.id === notificationId);
      if (deleted && !deleted.read) {
        setUnreadCount(prev => Math.max(0, prev - 1));
      }
    } catch (error) {
      console.error('Failed to delete notification:', error);
    }
  };

  const formatTime = (dateStr) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const getIcon = (type) => {
    switch (type) {
      case 'mention':
        return <AtSign className="w-4 h-4 text-blue-400" />;
      case 'reply':
        return <MessageCircle className="w-4 h-4 text-emerald-400" />;
      case 'league_invite':
        return <Trophy className="w-4 h-4 text-amber-400" />;
      default:
        return <Bell className="w-4 h-4 text-white/50" />;
    }
  };

  return (
    <div className="relative" ref={panelRef}>
      {/* Bell Button */}
      <button
        onClick={handleOpen}
        className="relative p-2 rounded-lg hover:bg-white/10 transition-colors"
      >
        <Bell className="w-5 h-5 text-white/70" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] bg-red-500 text-white text-xs font-bold rounded-full flex items-center justify-center px-1">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown Panel */}
      {isOpen && (
        <div className="absolute top-12 right-0 w-80 sm:w-96 max-h-[70vh] bg-gray-800 border border-white/10 rounded-xl shadow-2xl overflow-hidden animate-in z-50">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
            <h3 className="font-semibold text-white">Notifications</h3>
            <div className="flex items-center gap-2">
              {unreadCount > 0 && (
                <button
                  onClick={handleMarkAllRead}
                  className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1"
                >
                  <CheckCheck className="w-3.5 h-3.5" />
                  Mark all read
                </button>
              )}
              <button
                onClick={() => setIsOpen(false)}
                className="p-1 hover:bg-white/10 rounded-lg"
              >
                <X className="w-4 h-4 text-white/50" />
              </button>
            </div>
          </div>

          {/* Notifications List */}
          <div className="overflow-y-auto max-h-[calc(70vh-60px)]">
            {loading && notifications.length === 0 ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 text-white/50 animate-spin" />
              </div>
            ) : notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-white/40">
                <Bell className="w-10 h-10 mb-3 opacity-50" />
                <p className="text-sm">No notifications yet</p>
                <p className="text-xs mt-1">You'll see mentions here</p>
              </div>
            ) : (
              <>
                {notifications.map((notification) => (
                  <div
                    key={notification.id}
                    onClick={() => handleNotificationClick(notification)}
                    className={`flex items-start gap-3 px-4 py-3 cursor-pointer transition-colors border-b border-white/5 last:border-b-0 ${
                      notification.read 
                        ? 'bg-transparent hover:bg-white/5' 
                        : 'bg-blue-500/10 hover:bg-blue-500/15'
                    }`}
                  >
                    {/* Icon */}
                    <div className="mt-0.5">
                      {getIcon(notification.type)}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="font-medium text-sm text-white truncate">
                          {notification.from_user_name || notification.fromUserName || 'Someone'}
                        </span>
                        <span className="text-xs text-white/40">
                          {formatTime(notification.created_at || notification.createdAt)}
                        </span>
                      </div>
                      <p className="text-xs text-white/60 mb-1">
                        mentioned you in{' '}
                        <span className="text-white/80">
                          {notification.league_name || notification.leagueName || 'a league'}
                        </span>
                      </p>
                      <p className="text-sm text-white/70 truncate">
                        "{notification.preview}"
                      </p>
                    </div>

                    {/* Actions */}
                    <button
                      onClick={(e) => handleDelete(e, notification.id)}
                      className="p-1.5 hover:bg-white/10 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <Trash2 className="w-3.5 h-3.5 text-white/40 hover:text-red-400" />
                    </button>
                  </div>
                ))}

                {/* Load More */}
                {hasMore && (
                  <button
                    onClick={() => fetchNotifications(true)}
                    disabled={loading}
                    className="w-full py-3 text-sm text-blue-400 hover:bg-white/5 transition-colors flex items-center justify-center gap-2"
                  >
                    {loading ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      'Load more'
                    )}
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}