import { useRef, useEffect, useState, useCallback } from 'react';
import { ChevronDown } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import { getThemedLogo } from '../../utils/logo';

/**
 * LiveGameFeed — Renders a unified, time-sorted feed of scoring plays
 * and system commentary from all live games.
 *
 * Modular: can be used for all-games feed or filtered to a single game.
 */
export default function LiveGameFeed({ feedItems = [], isPolling, maxHeight = '400px', onGameClick }) {
  const { isDark } = useTheme();
  const tl = useCallback((url) => getThemedLogo(url, isDark), [isDark]);
  const feedRef = useRef(null);
  const [isScrolledUp, setIsScrolledUp] = useState(false);
  const [hasNewItems, setHasNewItems] = useState(false);
  const prevLengthRef = useRef(feedItems.length);

  // Track scroll position
  const handleScroll = useCallback(() => {
    const el = feedRef.current;
    if (!el) return;
    const isAtTop = el.scrollTop <= 10;
    setIsScrolledUp(!isAtTop);
    if (isAtTop) setHasNewItems(false);
  }, []);

  // Auto-scroll to top when new items arrive (if user is at top)
  useEffect(() => {
    if (feedItems.length > prevLengthRef.current) {
      if (!isScrolledUp && feedRef.current) {
        feedRef.current.scrollTop = 0;
      } else {
        setHasNewItems(true);
      }
    }
    prevLengthRef.current = feedItems.length;
  }, [feedItems.length, isScrolledUp]);

  const scrollToTop = () => {
    feedRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
    setHasNewItems(false);
  };

  if (feedItems.length === 0 && !isPolling) return null;

  return (
    <div className={`mt-4 rounded-xl border relative ${isDark ? 'border-white/10 bg-white/[0.03]' : 'border-black/5 bg-black/[0.02]'}`}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-fg/10">
        <div className="flex items-center gap-2">
          {isPolling && (
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500" />
            </span>
          )}
          <span className="text-sm font-semibold text-fg tracking-wide uppercase">Live Feed</span>
          <span className="text-sm text-fg/60">{feedItems.length} plays</span>
        </div>
      </div>

      {/* Feed content */}
      <div
        ref={feedRef}
        className="overflow-y-auto overscroll-contain relative"
        style={{ maxHeight }}
        onScroll={handleScroll}
      >
        {feedItems.length === 0 ? (
          <div className="py-8 text-center text-fg/40 text-sm">
            Waiting for plays...
          </div>
        ) : (
          <div className="divide-y divide-fg/5">
            {feedItems.map(item => (
              item.type === 'commentary'
                ? <CommentaryItem key={item.id} item={item} isDark={isDark} tl={tl} onGameClick={onGameClick} />
                : <PlayItem key={item.id} item={item} isDark={isDark} tl={tl} onGameClick={onGameClick} />
            ))}
          </div>
        )}
      </div>

      {/* "New plays" floating button */}
      {hasNewItems && (
        <button
          onClick={scrollToTop}
          className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-red-500 text-white text-sm font-medium shadow-lg hover:bg-red-600 transition-colors"
        >
          <ChevronDown className="w-3.5 h-3.5 rotate-180" />
          New plays
        </button>
      )}
    </div>
  );
}

// Avatar size classes — responsive: 40px mobile, 64px desktop
const AVATAR_IMG = 'w-10 h-10 sm:w-16 sm:h-16';
const AVATAR_RING = `${AVATAR_IMG} rounded-full object-cover ring-2`;
const AVATAR_FALLBACK = `${AVATAR_IMG} rounded-full items-center justify-center text-white text-[11px] sm:text-sm font-bold hidden`;
const AVATAR_LOGO = `${AVATAR_IMG} object-contain`;
const AVATAR_COLOR = `${AVATAR_IMG} rounded-full flex items-center justify-center text-white text-[11px] sm:text-sm font-bold`;

// ── Game Score Line (shared by PlayItem & CommentaryItem) ────────────────
function GameScoreLine({ homeTeam, awayTeam, homeScore, awayScore, period, clock, tl }) {
  const periodDisplay = formatPeriod(period);
  const clockDisplay = clock?.displayValue || clock || '';
  const hasScore = homeScore != null && awayScore != null;
  const homeLead = (homeScore ?? 0) >= (awayScore ?? 0);
  const timeLabel = periodDisplay && clockDisplay
    ? `${clockDisplay} - ${periodDisplay === '1H' ? '1st' : periodDisplay === '2H' ? '2nd' : periodDisplay}`
    : periodDisplay || '';

  return (
    <div className="flex items-center flex-wrap gap-x-2 gap-y-0.5 mt-1">
      {/* Home team */}
      <div className="flex items-center gap-1">
        {homeTeam?.logo && (
          <img src={tl(homeTeam.logo)} alt="" className="w-4 h-4 sm:w-5 sm:h-5 object-contain" />
        )}
        <span className={`text-sm font-semibold ${hasScore && homeLead ? 'font-bold text-fg' : 'text-fg/80'}`}>
          {homeTeam?.abbreviation}
        </span>
        {hasScore && (
          <span className={`text-sm font-bold ${homeLead ? 'text-fg' : 'text-fg/70'}`}>
            {homeScore}
          </span>
        )}
      </div>

      <span className="text-sm text-fg/50">—</span>

      {/* Away team */}
      <div className="flex items-center gap-1">
        {awayTeam?.logo && (
          <img src={tl(awayTeam.logo)} alt="" className="w-4 h-4 sm:w-5 sm:h-5 object-contain" />
        )}
        <span className={`text-sm font-semibold ${hasScore && !homeLead ? 'font-bold text-fg' : 'text-fg/80'}`}>
          {awayTeam?.abbreviation}
        </span>
        {hasScore && (
          <span className={`text-sm font-bold ${!homeLead ? 'text-fg' : 'text-fg/70'}`}>
            {awayScore}
          </span>
        )}
      </div>

      {/* Time remaining — red text with live dot */}
      {timeLabel && (
        <span className="inline-flex items-center gap-1 text-[11px] sm:text-sm font-semibold text-red-500 whitespace-nowrap">
          <span className="w-1.5 h-1.5 rounded-full bg-red-500 flex-shrink-0" />
          {timeLabel}
        </span>
      )}
    </div>
  );
}

// ── Play Item ────────────────────────────────────────────────────────────
function PlayItem({ item, isDark, tl, onGameClick }) {
  const { play, homeTeam, awayTeam, homeScore, awayScore, period, clock, playerStatLine, gameId } = item;

  const playTeam = play.team?.id === homeTeam?.id ? homeTeam : play.team?.id === awayTeam?.id ? awayTeam : null;
  const teamColor = playTeam?.color || '#666';
  const participant = play.participants?.[0];
  const headshot = participant?.headshot;

  // Classify play
  const isScoring = play.scoringPlay;
  const isMiss = play.shootingPlay && !play.scoringPlay;
  const playText = (play.shortText || play.text || '').toLowerCase();
  const isBlock = playText.includes('block');
  const isSteal = playText.includes('steal');
  const isTurnover = playText.includes('turnover');

  // End-of-period detection — these are rendered as play items from typeId 412
  // but we skip them since the commentary engine already generates halftime/end-of-game items
  const isEndPeriod = String(play.typeId || '') === '412' || playText.includes('end of');
  if (isEndPeriod) return null; // Commentary engine handles these

  return (
    <div
      className={`flex items-center gap-3 px-3 py-2.5 cursor-pointer transition-colors ${isDark ? 'hover:bg-white/[0.04]' : 'hover:bg-black/[0.03]'}`}
      style={{ borderLeft: `3px solid ${teamColor}` }}
      onClick={() => onGameClick?.(gameId)}
    >
      {/* Avatar area */}
      <div className="flex-shrink-0 relative">
        {headshot ? (
          <>
            <img
              src={headshot}
              alt=""
              className={`${AVATAR_RING} ${isDark ? 'ring-white/20' : 'ring-black/10'}`}
              onError={(e) => {
                e.target.style.display = 'none';
                const fallback = e.target.nextElementSibling;
                if (fallback) fallback.style.display = 'flex';
              }}
            />
            <div className={AVATAR_FALLBACK} style={{ backgroundColor: teamColor }}>
              {(playTeam?.abbreviation || '?').slice(0, 3)}
            </div>
            {playTeam?.logo && (
              <img src={tl(playTeam.logo)} alt="" className="absolute -bottom-0.5 -right-0.5 w-4 h-4 sm:w-6 sm:h-6 object-contain rounded-full bg-canvas" />
            )}
          </>
        ) : playTeam?.logo ? (
          <div
            className={`${AVATAR_IMG} rounded-full flex items-center justify-center border-2 ${isDark ? 'bg-gray-900' : 'bg-white'}`}
            style={{ borderColor: teamColor || '#666' }}
          >
            <img src={tl(playTeam.logo)} alt="" className="w-6 h-6 sm:w-9 sm:h-9 object-contain" />
          </div>
        ) : (
          <div className={AVATAR_COLOR} style={{ backgroundColor: teamColor }}>
            {(playTeam?.abbreviation || '?').slice(0, 3)}
          </div>
        )}
      </div>

      {/* Play content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-1.5 flex-wrap">
          <span className="text-sm sm:text-base text-fg">
            {participant && (
              <span className="font-semibold">
                {participant.jersey ? `#${participant.jersey} ` : ''}
                {participant.shortName || participant.name || ''}
              </span>
            )}
            {participant && ' '}
            <span className={`${isScoring ? 'font-medium text-fg/80' : isMiss ? 'text-fg/60' : isBlock || isSteal ? 'text-fg font-medium' : isTurnover ? 'text-fg/70' : 'text-fg/80'}`}>
              {getPlayAction(play)}
            </span>
          </span>
        </div>

        {/* Stat line for scoring plays */}
        {isScoring && playerStatLine && (
          <div className="text-sm sm:text-base text-fg/70 mt-0.5">
            {playerStatLine}
          </div>
        )}

        {/* Game score line */}
        <GameScoreLine
          homeTeam={homeTeam}
          awayTeam={awayTeam}
          homeScore={homeScore}
          awayScore={awayScore}
          period={period}
          clock={clock}
          tl={tl}
        />
      </div>
    </div>
  );
}

// ── Commentary Item ──────────────────────────────────────────────────────
function CommentaryItem({ item, isDark, tl, onGameClick }) {
  const { commentary, gameId, homeTeam, awayTeam, homeScore, awayScore, period, clock } = item;
  const { kind, text, subtext, icon, teamColor, teamLogo, priority, playerHeadshot, playerTeamColor, playerTeamLogo } = commentary;

  const isHighPriority = priority >= 8;
  const borderColor = isHighPriority ? '#f59e0b' : (teamColor || '#6b7280');
  const hasPlayer = !!playerHeadshot;

  return (
    <div
      className={`flex items-center gap-3 px-3 py-2.5 cursor-pointer transition-colors ${
        isHighPriority
          ? (isDark ? 'bg-amber-500/[0.06]' : 'bg-amber-50/60')
          : (isDark ? 'bg-white/[0.02]' : 'bg-gray-50/50')
      }`}
      style={{ borderLeft: `3px solid ${borderColor}` }}
      onClick={() => onGameClick?.(gameId)}
    >
      {/* Avatar area */}
      <div className="flex-shrink-0 relative">
        {hasPlayer ? (
          <>
            <img
              src={playerHeadshot}
              alt=""
              className={`${AVATAR_RING} ${isDark ? 'ring-white/20' : 'ring-black/10'}`}
              onError={(e) => {
                e.target.style.display = 'none';
                const fallback = e.target.nextElementSibling;
                if (fallback) fallback.style.display = 'flex';
              }}
            />
            <div className={AVATAR_FALLBACK} style={{ backgroundColor: playerTeamColor || '#666' }}>
              {icon || '?'}
            </div>
            {playerTeamLogo && (
              <img src={tl(playerTeamLogo)} alt="" className="absolute -bottom-0.5 -right-0.5 w-4 h-4 sm:w-6 sm:h-6 object-contain rounded-full bg-canvas" />
            )}
          </>
        ) : teamLogo ? (
          /* Team-specific commentary — team logo in colored-border circle */
          <div
            className={`${AVATAR_IMG} rounded-full flex items-center justify-center border-2 ${isDark ? 'bg-gray-900' : 'bg-white'}`}
            style={{ borderColor: teamColor || '#666' }}
          >
            <img src={tl(teamLogo)} alt="" className="w-6 h-6 sm:w-9 sm:h-9 object-contain" />
          </div>
        ) : (
          /* Neutral/game-level commentary — overlapping team circles */
          <div className={`${AVATAR_IMG} relative`}>
            {/* Home team — top-left */}
            <div
              className={`absolute top-0 left-0 w-7 h-7 sm:w-10 sm:h-10 rounded-full flex items-center justify-center z-[1] border-2 ${isDark ? 'bg-gray-900' : 'bg-white'}`}
              style={{ borderColor: homeTeam?.color || '#666' }}
            >
              {homeTeam?.logo && (
                <img src={tl(homeTeam.logo)} alt="" className="w-4 h-4 sm:w-6 sm:h-6 object-contain" />
              )}
            </div>
            {/* Away team — bottom-right, overlapping */}
            <div
              className={`absolute bottom-0 right-0 w-7 h-7 sm:w-10 sm:h-10 rounded-full flex items-center justify-center z-[2] border-2 ${isDark ? 'bg-gray-900' : 'bg-white'}`}
              style={{ borderColor: awayTeam?.color || '#666' }}
            >
              {awayTeam?.logo && (
                <img src={tl(awayTeam.logo)} alt="" className="w-4 h-4 sm:w-6 sm:h-6 object-contain" />
              )}
            </div>
          </div>
        )}
      </div>

      {/* Commentary content */}
      <div className="flex-1 min-w-0">
        <div className={`text-sm sm:text-base ${isHighPriority ? 'font-semibold text-fg' : 'font-medium text-fg'}`}>
          {icon && <span className="mr-1.5">{icon}</span>}
          {text}
        </div>
        {subtext && (
          <div className="text-sm sm:text-base text-fg/70 mt-0.5">{subtext}</div>
        )}
        {/* Game score line */}
        <GameScoreLine
          homeTeam={homeTeam}
          awayTeam={awayTeam}
          homeScore={homeScore}
          awayScore={awayScore}
          period={period}
          clock={clock}
          tl={tl}
        />
      </div>
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────
function formatPeriod(period) {
  if (!period) return '';
  const num = period.number || period;
  if (num === 1) return '1H';
  if (num === 2) return '2H';
  if (num > 2) return `OT${num - 2}`;
  return '';
}

function getPlayAction(play) {
  if (!play) return '';
  const text = (play.shortText || play.text || '').toLowerCase();

  if (play.scoringPlay && play.scoreValue === 3) return 'three-pointer';
  if (play.scoringPlay && play.scoreValue === 2) {
    if (text.includes('dunk')) return 'dunk';
    if (text.includes('layup') || text.includes('lay up')) return 'layup';
    if (text.includes('alley')) return 'alley-oop';
    if (text.includes('tip')) return 'tip-in';
    if (text.includes('hook')) return 'hook shot';
    if (text.includes('floater') || text.includes('floating')) return 'floater';
    if (text.includes('pullup') || text.includes('pull-up') || text.includes('pull up')) return 'pull-up jumper';
    if (text.includes('fadeaway') || text.includes('fade away')) return 'fadeaway';
    if (text.includes('driving')) return 'driving score';
    if (text.includes('step back')) return 'step-back jumper';
    if (text.includes('finger roll')) return 'finger roll';
    if (text.includes('putback') || text.includes('put back') || text.includes('put-back')) return 'putback';
    if (text.includes('jumper') || text.includes('jump shot')) return 'jumper';
    return 'two-pointer';
  }
  if (play.scoringPlay && play.scoreValue === 1) return 'free throw';
  if (play.shootingPlay && !play.scoringPlay) return 'misses';
  if (text.includes('block')) return 'block';
  if (text.includes('steal')) return 'steal';
  if (text.includes('turnover')) return 'turnover';
  if (text.includes('rebound')) return 'rebound';

  return play.shortText || play.text || '';
}
