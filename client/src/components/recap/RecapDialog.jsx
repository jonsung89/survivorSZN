import { useState, useEffect, useCallback } from 'react';
import { X, Sparkles, Loader2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { useTheme } from '../../context/ThemeContext';
import { bracketAPI } from '../../api';

export default function RecapDialog({ open, onClose, tournamentId, leagueId, recapDate }) {
  const { isDark } = useTheme();
  const [recap, setRecap] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!open || !tournamentId || !leagueId || !recapDate) return;
    setLoading(true);
    setError(null);
    bracketAPI.getRecap(tournamentId, leagueId, recapDate)
      .then(data => {
        if (data.error) throw new Error(data.error);
        setRecap(data);
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, [open, tournamentId, leagueId, recapDate]);

  // Scroll lock
  useEffect(() => {
    if (open) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => { document.body.style.overflow = prev; };
    }
  }, [open]);

  // Escape key
  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  const handleBackdropClick = useCallback((e) => {
    if (e.target === e.currentTarget) onClose();
  }, [onClose]);

  if (!open) return null;

  const formatRecapDate = (dateStr) => {
    if (!dateStr) return '';
    const d = new Date(dateStr + 'T12:00:00');
    return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  };

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
      onClick={handleBackdropClick}
    >
      <div
        className="relative w-full max-w-2xl max-h-[85vh] rounded-2xl overflow-hidden flex flex-col"
        style={{
          background: isDark ? '#1a1a2e' : '#ffffff',
          border: isDark ? '1px solid rgba(255,255,255,0.1)' : '1px solid rgba(0,0,0,0.1)',
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-4 border-b flex-shrink-0"
          style={{ borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)' }}
        >
          <div className="flex items-center gap-2.5">
            <Sparkles className="w-5 h-5 text-amber-500" />
            <div>
              <h2 className="text-base font-semibold text-fg">Daily Recap</h2>
              {recapDate && (
                <p className="text-sm text-fg/50">{formatRecapDate(recapDate)}</p>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg transition-colors"
            style={{ background: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)' }}
          >
            <X className="w-5 h-5 text-fg/60" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {loading && (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 text-fg/40 animate-spin" />
            </div>
          )}

          {error && (
            <div className="text-center py-12">
              <p className="text-sm text-fg/50">{error}</p>
            </div>
          )}

          {recap && !loading && (
            <div className="recap-markdown">
              <ReactMarkdown
                components={{
                  h2: ({ children }) => (
                    <h2 className="text-lg font-bold text-fg mt-6 mb-3 first:mt-0">{children}</h2>
                  ),
                  h3: ({ children }) => (
                    <h3 className="text-base font-semibold text-fg mt-4 mb-2">{children}</h3>
                  ),
                  p: ({ children }) => (
                    <p className="text-sm text-fg/80 leading-relaxed mb-3">{children}</p>
                  ),
                  ul: ({ children }) => (
                    <ul className="text-sm text-fg/80 space-y-1.5 mb-3 ml-4 list-disc">{children}</ul>
                  ),
                  ol: ({ children }) => (
                    <ol className="text-sm text-fg/80 space-y-1.5 mb-3 ml-4 list-decimal">{children}</ol>
                  ),
                  li: ({ children }) => (
                    <li className="leading-relaxed">{children}</li>
                  ),
                  strong: ({ children }) => (
                    <strong className="font-semibold text-fg">{children}</strong>
                  ),
                  hr: () => (
                    <hr className="my-4" style={{ borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)' }} />
                  ),
                }}
              >
                {recap.full_recap}
              </ReactMarkdown>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
