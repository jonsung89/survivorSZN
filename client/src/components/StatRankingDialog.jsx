import { useState, useEffect } from 'react';
import { X, Loader2, TrendingUp, AlertCircle } from 'lucide-react';
import { scheduleAPI, trackingAPI } from '../api';
import { useThemedLogo } from '../utils/logo';

// Sport display names for the dialog header
const SPORT_NAMES = {
  nfl: 'NFL',
  nba: 'NBA',
  mlb: 'MLB',
  nhl: 'NHL',
  ncaab: 'NCAAB',
};

// Color-code rankings: green (top tier), amber (mid), red (bottom)
const getRankColor = (rank, total) => {
  if (!rank) return 'text-fg/50';
  const n = typeof rank === 'string' ? parseInt(rank) : rank;
  if (isNaN(n)) return 'text-fg/50';
  if (n <= 10) return 'text-rank-good';
  if (n <= 22) return 'text-rank-mid';
  return 'text-red-500';
};

export default function StatRankingDialog({ sport, statKey, statLabel, currentTeamIds = [], onClose }) {
  const tl = useThemedLogo();
  const [rankings, setRankings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    trackingAPI.event('stat_ranking_dialog_open', { sport, statKey, statLabel });
    setLoading(true);
    setError(null);
    scheduleAPI.getStatRankings(sport, statKey)
      .then(data => {
        if (data.success && data.rankings) {
          setRankings(data.rankings);
        } else {
          setError(data.error || 'Rankings not available');
        }
        setLoading(false);
      })
      .catch(err => {
        console.error('Failed to fetch rankings:', err);
        setError('Failed to load rankings');
        setLoading(false);
      });
  }, [sport, statKey]);

  // Close on Escape key + lock body scroll while dialog is open
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  const currentTeamIdStrs = currentTeamIds.map(String);

  return (
    <div
      data-modal
      className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-canvas rounded-2xl max-w-md w-full max-h-[85vh] overflow-hidden flex flex-col shadow-2xl border border-fg/10"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-4 flex items-center gap-3 border-b border-fg/10 flex-shrink-0">
          <TrendingUp className="w-5 h-5 text-fg/60" />
          <div className="flex-1">
            <h2 className="text-lg font-bold text-fg">{statLabel} Rankings</h2>
            <p className="text-xs text-fg/40">{SPORT_NAMES[sport] || sport.toUpperCase()} · League-wide</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-fg/10 rounded-full transition-colors"
          >
            <X className="w-5 h-5 text-fg/60" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto overscroll-contain">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <Loader2 className="w-8 h-8 text-fg/30 animate-spin" />
              <span className="text-sm text-fg/40">Loading rankings...</span>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <AlertCircle className="w-8 h-8 text-fg/20" />
              <span className="text-sm text-fg/40">{error}</span>
            </div>
          ) : rankings && rankings.length > 0 ? (
            <div>
              {/* Column headers */}
              <div className="flex items-center gap-3 px-4 py-2 border-b border-fg/5 sticky top-0 bg-canvas">
                <span className="w-8 text-right text-xs font-medium text-fg/30">Rank</span>
                <span className="flex-1 text-xs font-medium text-fg/30">Team</span>
                <span className="text-xs font-medium text-fg/30">{statLabel}</span>
              </div>

              {/* Rankings list */}
              <div className="divide-y divide-fg/5">
                {rankings.map((item, i) => {
                  const rank = item.rank || (i + 1);
                  const isCurrentTeam = currentTeamIdStrs.includes(String(item.team.id));
                  return (
                    <div
                      key={item.team.id}
                      className={`flex items-center gap-3 px-4 py-2.5 transition-colors ${
                        isCurrentTeam ? 'bg-fg/10' : 'hover:bg-fg/5'
                      }`}
                    >
                      <span className={`w-8 text-right font-bold text-sm ${getRankColor(rank)}`}>
                        {rank}
                      </span>
                      <div className="flex items-center gap-2.5 flex-1 min-w-0">
                        {item.team.logo ? (
                          <img src={tl(item.team.logo)} alt="" className="w-6 h-6 object-contain flex-shrink-0" />
                        ) : (
                          <div
                            className="w-6 h-6 rounded-full flex-shrink-0"
                            style={{ backgroundColor: item.team.color || '#333' }}
                          />
                        )}
                        <span className={`text-sm truncate ${isCurrentTeam ? 'text-fg font-semibold' : 'text-fg/80'}`}>
                          {item.team.name}
                        </span>
                      </div>
                      <span className={`text-sm font-medium flex-shrink-0 ${isCurrentTeam ? 'text-fg' : 'text-fg/70'}`}>
                        {item.displayValue || '-'}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <AlertCircle className="w-8 h-8 text-fg/20" />
              <span className="text-sm text-fg/40">No ranking data available</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
