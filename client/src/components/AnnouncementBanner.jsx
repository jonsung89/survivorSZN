import { useState, useEffect } from 'react';
import { X, Megaphone } from 'lucide-react';
import { analyticsAPI } from '../api';
import { useTheme } from '../context/ThemeContext';

export default function AnnouncementBanner() {
  const { isDark } = useTheme();
  const [announcements, setAnnouncements] = useState([]);
  const [dismissed, setDismissed] = useState(() => {
    try {
      return JSON.parse(sessionStorage.getItem('dismissedAnnouncements') || '[]');
    } catch {
      return [];
    }
  });

  useEffect(() => {
    analyticsAPI.getActiveAnnouncements()
      .then(data => {
        if (data.announcements) {
          setAnnouncements(data.announcements);
        }
      })
      .catch(() => {});
  }, []);

  const dismiss = (id) => {
    const updated = [...dismissed, id];
    setDismissed(updated);
    sessionStorage.setItem('dismissedAnnouncements', JSON.stringify(updated));
  };

  const visible = announcements.filter(a => !dismissed.includes(a.id));
  if (visible.length === 0) return null;

  return (
    <div className="space-y-2 mb-4">
      {visible.map(a => (
        <div
          key={a.id}
          className={`flex items-start gap-3 px-4 py-3 rounded-lg border ${
            isDark
              ? 'bg-amber-500/10 border-amber-500/20 text-fg'
              : 'bg-amber-50 border-amber-200 text-gray-900'
          }`}
        >
          <Megaphone className={`w-5 h-5 mt-0.5 shrink-0 ${isDark ? 'text-amber-400' : 'text-amber-600'}`} />
          <div className="flex-1 min-w-0">
            {a.title && (
              <p className="font-semibold text-sm">{a.title}</p>
            )}
            <p className={`text-sm ${a.title ? 'mt-0.5' : ''} ${isDark ? 'text-fg/80' : 'text-gray-700'}`}>
              {a.message}
            </p>
          </div>
          <button
            onClick={() => dismiss(a.id)}
            className={`shrink-0 p-1 rounded-md transition-colors ${
              isDark ? 'hover:bg-white/10 text-fg/50' : 'hover:bg-gray-200 text-gray-400'
            }`}
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      ))}
    </div>
  );
}
