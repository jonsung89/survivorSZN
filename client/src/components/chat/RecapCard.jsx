import { Sparkles, ChevronRight } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { useTheme } from '../../context/ThemeContext';

export default function RecapCard({ message, onReadMore }) {
  const { isDark } = useTheme();
  const tldr = message.message || message.metadata?.tldr || '';
  const recapDate = message.metadata?.recapDate;

  const formatRecapDate = (dateStr) => {
    if (!dateStr) return '';
    const d = new Date(dateStr + 'T12:00:00');
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  };

  return (
    <div
      className="w-full max-w-[360px] rounded-xl overflow-hidden"
      style={{
        background: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)',
        border: isDark ? '1px solid rgba(255,255,255,0.1)' : '1px solid rgba(0,0,0,0.08)',
      }}
    >
      {/* Header */}
      <div
        className="px-3.5 py-2.5 flex items-center gap-2"
        style={{
          background: isDark
            ? 'linear-gradient(135deg, rgba(234,179,8,0.15), rgba(249,115,22,0.1))'
            : 'linear-gradient(135deg, rgba(234,179,8,0.1), rgba(249,115,22,0.08))',
        }}
      >
        <Sparkles className="w-4 h-4 text-amber-500 flex-shrink-0" />
        <span className="text-sm font-semibold text-fg">Daily Recap</span>
        {recapDate && (
          <span className="text-sm text-fg/50 ml-auto">{formatRecapDate(recapDate)}</span>
        )}
      </div>

      {/* TL;DR Content */}
      <div className="px-3.5 py-3">
        <div className="text-sm text-fg/80 leading-relaxed recap-tldr">
          <ReactMarkdown
            components={{
              p: ({ children }) => <p className="mb-1 last:mb-0">{children}</p>,
              strong: ({ children }) => <strong className="font-semibold text-fg">{children}</strong>,
            }}
          >
            {tldr}
          </ReactMarkdown>
        </div>
      </div>

      {/* Read More Button */}
      <div className="px-3.5 pb-3">
        <button
          onClick={() => onReadMore?.(recapDate)}
          className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors"
          style={{
            background: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)',
            color: isDark ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.6)',
          }}
        >
          Read Full Recap
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
