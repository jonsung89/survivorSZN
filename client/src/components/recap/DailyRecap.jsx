import { useState, useEffect, useMemo } from 'react';
import { ChevronLeft, ChevronRight, Sparkles, Loader2, Clock } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { useTheme } from '../../context/ThemeContext';
import { bracketAPI, trackingAPI } from '../../api';

function getLocalDateStr(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function addDays(dateStr, days) {
  const d = new Date(dateStr + 'T12:00:00');
  d.setDate(d.getDate() + days);
  return getLocalDateStr(d);
}

function formatDateLabel(dateStr) {
  const today = getLocalDateStr();
  const yesterday = addDays(today, -1);
  const tomorrow = addDays(today, 1);
  if (dateStr === today) return 'Today';
  if (dateStr === yesterday) return 'Yesterday';
  if (dateStr === tomorrow) return 'Tomorrow';
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

const TABS = [
  { key: 'members', label: 'Members' },
  { key: 'games', label: 'Games' },
  { key: 'today', label: 'Today' },
];

function RecapMarkdown({ content, isDark }) {
  if (!content) return <p className="text-base text-fg/40">Nothing here yet.</p>;
  return (
    <ReactMarkdown
      components={{
        h2: ({ children }) => (
          <h2
            className="text-lg font-bold text-fg mt-5 mb-2.5 first:mt-0 pb-1.5"
            style={{ borderBottom: isDark ? '1px solid rgba(255,255,255,0.1)' : '1px solid rgba(0,0,0,0.08)' }}
          >
            {children}
          </h2>
        ),
        h3: ({ children }) => (
          <h3 className="text-base font-semibold text-fg mt-4 mb-1.5">{children}</h3>
        ),
        p: ({ children }) => (
          <p className="text-base text-fg/80 leading-relaxed mb-2.5">{children}</p>
        ),
        ul: ({ children }) => (
          <ul className="text-base text-fg/80 space-y-1 mb-3 ml-4 list-disc">{children}</ul>
        ),
        ol: ({ children }) => {
          const count = Array.isArray(children) ? children.filter(Boolean).length : 0;
          const useTwoCol = count > 6;
          return (
            <ol className={`text-base text-fg/80 mb-3 ml-4 list-decimal ${useTwoCol ? 'columns-2 gap-x-6' : 'space-y-1'}`}
              style={useTwoCol ? { columnGap: '2rem' } : undefined}
            >
              {children}
            </ol>
          );
        },
        li: ({ children }) => (
          <li className="leading-relaxed">{children}</li>
        ),
        strong: ({ children }) => (
          <strong className="font-semibold text-fg">{children}</strong>
        ),
        em: ({ children }) => (
          <em className="italic text-fg/60">{children}</em>
        ),
        blockquote: ({ children }) => (
          <blockquote
            className="my-2.5 pl-3 text-base italic"
            style={{
              borderLeft: isDark ? '3px solid rgba(234,179,8,0.4)' : '3px solid rgba(234,179,8,0.5)',
              color: isDark ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.6)',
            }}
          >
            {children}
          </blockquote>
        ),
        hr: () => (
          <hr className="my-4" style={{ borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)' }} />
        ),
      }}
    >
      {content}
    </ReactMarkdown>
  );
}

function formatGameTime(startTime) {
  if (!startTime) return '';
  const d = new Date(startTime);
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/Los_Angeles' }) + ' PT';
}

function TodayGameCards({ games, picks, isDark }) {
  // Group games by region
  const gamesByRegion = useMemo(() => {
    const groups = {};
    for (const game of games) {
      const region = game.region || 'Other';
      if (!groups[region]) groups[region] = [];
      groups[region].push(game);
    }
    return groups;
  }, [games]);

  // Build pick lookup: slot -> pickDistribution
  const picksBySlot = useMemo(() => {
    const map = {};
    if (picks) {
      for (const p of picks) {
        map[p.slot] = p.pickDistribution || [];
      }
    }
    return map;
  }, [picks]);

  if (!games || games.length === 0) return null;

  const regionOrder = Object.keys(gamesByRegion).sort();

  // Flatten all games for 2-column grid (no region grouping in cards — region shown as label)
  const allGames = regionOrder.flatMap(region => gamesByRegion[region].map(g => ({ ...g, regionName: region })));

  return (
    <div className="mt-4">
      <h3
        className="text-base font-semibold text-fg mb-3 pb-1.5"
        style={{ borderBottom: isDark ? '1px solid rgba(255,255,255,0.1)' : '1px solid rgba(0,0,0,0.08)' }}
      >
        Today's Games
      </h3>
      <div className="grid grid-cols-2 gap-2">
        {allGames.map((game, i) => {
          const slotPicks = picksBySlot[game.slot] || [];
          const team1Pick = slotPicks.find(p => String(p.teamId) === String(game.team1?.espnId));
          const team2Pick = slotPicks.find(p => String(p.teamId) === String(game.team2?.espnId));
          return (
            <div
              key={i}
              className="rounded-lg overflow-hidden"
              style={{
                background: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)',
                border: isDark ? '1px solid rgba(255,255,255,0.06)' : '1px solid rgba(0,0,0,0.05)',
              }}
            >
              {/* Team rows */}
              <div className="flex items-center gap-1.5 px-2.5 pt-2 pb-1">
                <span className="text-sm text-fg/60 w-4 text-right flex-shrink-0">{game.team1?.seed}</span>
                {game.team1?.logo && (
                  <img src={game.team1.logo} alt="" className="w-4 h-4 flex-shrink-0" />
                )}
                <span className="text-sm font-medium text-fg truncate">{game.team1?.name}</span>
                {team1Pick && (
                  <span className="text-sm text-fg/60 ml-auto flex-shrink-0">{team1Pick.pct}%</span>
                )}
              </div>
              <div className="flex items-center gap-1.5 px-2.5 pb-1.5">
                <span className="text-sm text-fg/60 w-4 text-right flex-shrink-0">{game.team2?.seed}</span>
                {game.team2?.logo && (
                  <img src={game.team2.logo} alt="" className="w-4 h-4 flex-shrink-0" />
                )}
                <span className="text-sm font-medium text-fg truncate">{game.team2?.name}</span>
                {team2Pick && (
                  <span className="text-sm text-fg/60 ml-auto flex-shrink-0">{team2Pick.pct}%</span>
                )}
              </div>
              {/* Footer: region + time */}
              <div
                className="flex items-center justify-between px-2.5 py-1"
                style={{ borderTop: isDark ? '1px solid rgba(255,255,255,0.06)' : '1px solid rgba(0,0,0,0.05)' }}
              >
                <span className="text-sm text-fg/50">{game.regionName}</span>
                {game.startTime && (
                  <div className="flex items-center gap-1">
                    <Clock className="w-3 h-3 text-fg/50" />
                    <span className="text-sm text-fg/60">{formatGameTime(game.startTime)}</span>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function DailyRecap({ tournamentId, leagueId }) {
  const { isDark } = useTheme();
  const [availableDates, setAvailableDates] = useState([]);
  const [selectedDate, setSelectedDate] = useState(null);
  const [recap, setRecap] = useState(null);
  const [loading, setLoading] = useState(false);
  const [datesLoading, setDatesLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('members');

  useEffect(() => {
    if (!tournamentId || !leagueId) return;
    setDatesLoading(true);
    bracketAPI.getRecapDates(tournamentId, leagueId)
      .then(dates => {
        if (Array.isArray(dates) && dates.length > 0) {
          const formatted = dates.map(d => String(d).split('T')[0]);
          setAvailableDates(formatted);
          setSelectedDate(formatted[0]);
        } else {
          setAvailableDates([]);
        }
      })
      .catch(() => setAvailableDates([]))
      .finally(() => setDatesLoading(false));
  }, [tournamentId, leagueId]);

  useEffect(() => {
    if (!tournamentId || !leagueId || !selectedDate) return;
    setLoading(true);
    bracketAPI.getRecap(tournamentId, leagueId, selectedDate)
      .then(data => {
        if (data.error) {
          setRecap(null);
        } else {
          setRecap(data);
          trackingAPI.event('recap_view', {
            date: selectedDate,
            leagueId,
            tournamentId,
            hasContent: !!(data.metadata?.membersTab || data.full_recap),
          });
        }
      })
      .catch(() => setRecap(null))
      .finally(() => setLoading(false));
  }, [tournamentId, leagueId, selectedDate]);

  const navigateDate = (dir) => {
    if (!availableDates.length) return;
    const idx = availableDates.indexOf(selectedDate);
    const newIdx = dir === -1 ? Math.min(idx + 1, availableDates.length - 1) : Math.max(idx - 1, 0);
    const newDate = availableDates[newIdx];
    setSelectedDate(newDate);
    trackingAPI.event('recap_date_navigate', {
      direction: dir === -1 ? 'older' : 'newer',
      fromDate: selectedDate,
      toDate: newDate,
      leagueId,
      tournamentId,
    });
  };

  const canGoLeft = availableDates.indexOf(selectedDate) < availableDates.length - 1;
  const canGoRight = availableDates.indexOf(selectedDate) > 0;

  if (datesLoading) return null;
  if (availableDates.length === 0) return null;

  // Get tab content from metadata (new format) or fall back to full_recap (old format)
  const getTabContent = () => {
    if (!recap) return '';
    const meta = recap.metadata || {};
    switch (activeTab) {
      case 'members': return meta.membersTab || meta.yesterdayRecap || recap.full_recap || '';
      case 'games': return meta.gamesTab || '';
      case 'today': return meta.todayTab || meta.todayPreview || '';
      default: return '';
    }
  };

  return (
    <div className="glass-card rounded-xl p-4 sm:p-5 mb-5 animate-in border border-fg/10" style={{ animationDelay: '50ms' }}>
      {/* Header with date navigation */}
      <div className="flex items-center justify-between mb-3">
        <button
          onClick={() => navigateDate(-1)}
          disabled={!canGoLeft}
          className={`p-1.5 rounded-lg transition-colors ${canGoLeft ? 'hover:bg-fg/10' : 'opacity-30 cursor-not-allowed'}`}
        >
          <ChevronLeft className="w-5 h-5 text-fg/60" />
        </button>
        <div className="flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-amber-500" />
          <span className="text-base font-bold text-fg">Daily Recap</span>
          {selectedDate && (
            <span className="text-sm text-fg/50">
              - {(() => {
                const d = new Date(selectedDate + 'T12:00:00');
                return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
              })()}
            </span>
          )}
        </div>
        <button
          onClick={() => navigateDate(1)}
          disabled={!canGoRight}
          className={`p-1.5 rounded-lg transition-colors ${canGoRight ? 'hover:bg-fg/10' : 'opacity-30 cursor-not-allowed'}`}
        >
          <ChevronRight className="w-5 h-5 text-fg/60" />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 rounded-lg p-1 mb-3" style={{
        background: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)',
      }}>
        {TABS.map(tab => (
          <button
            key={tab.key}
            onClick={() => {
              trackingAPI.event('recap_tab_switch', {
                tab: tab.key,
                fromTab: activeTab,
                date: selectedDate,
                leagueId,
                tournamentId,
              });
              setActiveTab(tab.key);
            }}
            className={`flex-1 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              activeTab === tab.key
                ? isDark ? 'bg-white/10 text-fg shadow-sm' : 'bg-white text-fg shadow-sm'
                : 'text-fg/40 hover:text-fg/60'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      {loading && (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-5 h-5 text-fg/40 animate-spin" />
        </div>
      )}

      {!loading && !recap && (
        <div className="text-center py-6">
          <p className="text-sm text-fg/40">No recap available for this date</p>
        </div>
      )}

      {!loading && recap && (
        <div
          className="rounded-lg p-4"
          style={{
            background: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)',
            border: isDark ? '1px solid rgba(255,255,255,0.06)' : '1px solid rgba(0,0,0,0.06)',
          }}
        >
          <RecapMarkdown content={getTabContent()} isDark={isDark} />
          {activeTab === 'today' && recap.metadata?.todayGames?.length > 0 && (
            <TodayGameCards
              games={recap.metadata.todayGames}
              picks={recap.metadata.todayPicks}
              isDark={isDark}
            />
          )}
        </div>
      )}
    </div>
  );
}
