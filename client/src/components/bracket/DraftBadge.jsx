import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X, ChevronDown } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import { bracketAPI } from '../../api';

const NBA_LOGO = 'https://a.espncdn.com/combiner/i?img=/i/teamlogos/leagues/500/nba.png&w=40&h=40';

// Shared cache so all badges use the same fetched data
let prospectCache = null;
let fetchPromise = null;

async function fetchProspects() {
  if (prospectCache) return prospectCache;
  if (fetchPromise) return fetchPromise;
  fetchPromise = bracketAPI.getDraftProspects().then(data => {
    prospectCache = data.prospects || [];
    fetchPromise = null;
    return prospectCache;
  }).catch(() => {
    fetchPromise = null;
    return [];
  });
  return fetchPromise;
}

function ProspectRow({ prospect, isHighlighted, highlightRef, isDark, teamColor }) {
  const [expanded, setExpanded] = useState(false);
  const p = prospect;
  const hasStats = p.stats && Object.keys(p.stats).length > 0;

  // Build highlight styles using team color
  const highlightStyle = isHighlighted && teamColor ? {
    backgroundColor: isDark ? `${teamColor}20` : `${teamColor}12`,
    borderLeftColor: teamColor,
  } : {};

  return (
    <div
      ref={isHighlighted ? highlightRef : undefined}
      className={`transition-colors ${isHighlighted ? 'border-l-4' : 'border-l-4 border-transparent'}`}
      style={highlightStyle}
    >
      {/* Main row */}
      <button
        onClick={() => setExpanded(v => !v)}
        className="flex items-center gap-2 sm:gap-3 px-2.5 sm:px-4 py-2.5 sm:py-3 w-full text-left"
      >
        {/* Rank */}
        <span
          className={`text-sm sm:text-base font-bold w-6 sm:w-8 text-center flex-shrink-0 ${isHighlighted ? '' : 'text-fg/70'}`}
          style={isHighlighted && teamColor ? { color: teamColor } : undefined}
        >
          {p.rank}
        </span>

        {/* School logo */}
        {p.logo && (
          <img src={p.logo} alt="" className="w-6 h-6 sm:w-8 sm:h-8 flex-shrink-0 object-contain" />
        )}

        {/* Player info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-1.5">
            <span className="text-sm sm:text-base font-semibold truncate text-fg">
              {p.name}
            </span>
            <span className="text-xs sm:text-sm text-fg/60 flex-shrink-0">{p.position}</span>
          </div>
          <div className="text-xs sm:text-sm text-fg/60">
            <span>{p.school}</span>
          </div>
          {(p.height || p.weight) && (
            <div className="text-xs sm:text-sm text-fg/50">
              {p.height}{p.height && p.weight && ' · '}{p.weight && `${p.weight} lbs`}
            </div>
          )}
        </div>

        {/* Summary stats (PPG, RPG, APG) + chevron */}
        <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
          {hasStats && (
            <div className="flex gap-1.5 sm:gap-2">
              {p.stats.pts > 0 && (
                <div className="text-center">
                  <div className="text-xs sm:text-base font-bold text-fg">{p.stats.pts}</div>
                  <div className="text-[9px] sm:text-xs text-fg/50 uppercase">pts</div>
                </div>
              )}
              {p.stats.reb > 0 && (
                <div className="text-center">
                  <div className="text-xs sm:text-base font-bold text-fg">{p.stats.reb}</div>
                  <div className="text-[9px] sm:text-xs text-fg/50 uppercase">reb</div>
                </div>
              )}
              {p.stats.ast > 0 && (
                <div className="text-center">
                  <div className="text-xs sm:text-base font-bold text-fg">{p.stats.ast}</div>
                  <div className="text-[9px] sm:text-xs text-fg/50 uppercase">ast</div>
                </div>
              )}
            </div>
          )}
          <ChevronDown className={`w-4 h-4 sm:w-5 sm:h-5 text-fg/50 transition-transform ${expanded ? 'rotate-180' : ''}`} />
        </div>
      </button>

      {/* Expanded detail — full stats */}
      {expanded && hasStats && (
        <div className={`px-4 pb-3 ml-12`}>
          {p.year && (
            <div
              className="text-sm text-fg/60 pb-2 mb-1"
              style={{ borderBottom: isDark ? '1px solid rgba(255,255,255,0.06)' : '1px solid rgba(0,0,0,0.06)' }}
            >
              {p.year}
            </div>
          )}
          <div className="grid grid-cols-5 gap-3 pt-1">
            {p.stats.pts !== undefined && (
              <div className="text-center">
                <div className="text-lg font-bold text-fg">{p.stats.pts}</div>
                <div className="text-xs text-fg/60 uppercase">pts</div>
              </div>
            )}
            {p.stats.reb !== undefined && (
              <div className="text-center">
                <div className="text-lg font-bold text-fg">{p.stats.reb}</div>
                <div className="text-xs text-fg/60 uppercase">reb</div>
              </div>
            )}
            {p.stats.ast !== undefined && (
              <div className="text-center">
                <div className="text-lg font-bold text-fg">{p.stats.ast}</div>
                <div className="text-xs text-fg/60 uppercase">ast</div>
              </div>
            )}
            {p.stats.stl !== undefined && (
              <div className="text-center">
                <div className="text-lg font-bold text-fg">{p.stats.stl}</div>
                <div className="text-xs text-fg/60 uppercase">stl</div>
              </div>
            )}
            {p.stats.blk !== undefined && (
              <div className="text-center">
                <div className="text-lg font-bold text-fg">{p.stats.blk}</div>
                <div className="text-xs text-fg/60 uppercase">blk</div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function ProspectDialog({ rank, teamColor, onClose }) {
  const { isDark } = useTheme();
  const [prospects, setProspects] = useState([]);
  const [loading, setLoading] = useState(true);
  const highlightRef = useRef(null);

  useEffect(() => {
    fetchProspects().then(p => {
      setProspects(p);
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    if (!loading && highlightRef.current) {
      highlightRef.current.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
  }, [loading]);

  // Prevent body scroll while dialog is open
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 isolate" onClick={onClose}>
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 z-0" />

      {/* Dialog */}
      <div
        className={`relative z-10 w-full max-w-lg max-h-[85vh] rounded-2xl shadow-2xl overflow-hidden flex flex-col ${isDark ? 'bg-gray-900' : 'bg-white'}`}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className={`flex items-center justify-between px-5 py-3.5 border-b ${isDark ? 'border-white/10' : 'border-black/10'}`}>
          <div className="flex items-center gap-2.5">
            <img src={NBA_LOGO} alt="" className="w-7 h-7" />
            <h2 className="text-lg font-bold text-fg">2026 NBA Draft Board</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-fg/60 hover:text-fg hover:bg-fg/10 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Prospect list */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-12 text-fg/60 text-base">Loading prospects...</div>
          ) : (
            <div className="divide-y divide-fg/5">
              {prospects.map(p => (
                <ProspectRow
                  key={p.rank}
                  prospect={p}
                  isHighlighted={p.rank === rank}
                  highlightRef={highlightRef}
                  isDark={isDark}
                  teamColor={teamColor}
                />
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className={`px-5 py-2.5 text-center text-xs border-t ${isDark ? 'border-white/10 text-white/40' : 'border-black/10 text-black/40'}`}>
          Source: Tankathon Big Board
        </div>
      </div>
    </div>
  );
}

export default function DraftBadge({ rank, teamColor, className = '' }) {
  const { isDark } = useTheme();
  const [showDialog, setShowDialog] = useState(false);

  if (!rank) return null;

  return (
    <div className={`absolute -top-1.5 -right-1.5 z-10 ${className}`}>
      <button
        onClick={(e) => { e.stopPropagation(); setShowDialog(true); }}
        className={`flex items-center gap-0.5 rounded-full pl-0.5 pr-1.5 py-0.5 shadow-md cursor-pointer transition-transform hover:scale-110 active:scale-95 ${isDark ? 'bg-[#1d428a] ring-1 ring-white/20' : 'bg-[#1d428a] ring-1 ring-black/10'}`}
      >
        <img src={NBA_LOGO} alt="" className="w-5 h-5 rounded-full" />
        <span className="text-[11px] font-bold text-white leading-none">
          #{rank}
        </span>
      </button>

      {showDialog && createPortal(
        <ProspectDialog rank={rank} teamColor={teamColor} onClose={() => setShowDialog(false)} />,
        document.body
      )}
    </div>
  );
}
