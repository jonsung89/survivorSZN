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
const AVATAR_IMG = 'w-12 h-12 sm:w-16 sm:h-16';
const AVATAR_RING = `${AVATAR_IMG} rounded-full object-cover ring-2`;
const AVATAR_FALLBACK = `${AVATAR_IMG} rounded-full items-center justify-center text-white text-[11px] sm:text-sm font-bold hidden`;
const AVATAR_LOGO = `${AVATAR_IMG} object-contain`;
const AVATAR_COLOR = `${AVATAR_IMG} rounded-full flex items-center justify-center text-white text-[11px] sm:text-sm font-bold`;

// Dual overlapping avatar constants (for assists + neutral commentary)
const DUAL_CIRCLE = 'w-8 h-8 sm:w-10 sm:h-10';
const DUAL_CONTAINER = 'w-12 h-12 sm:w-16 sm:h-16';

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
        <span className={`text-sm sm:text-base font-semibold ${hasScore && homeLead ? 'font-bold text-fg' : 'text-fg/80'}`}>
          {homeTeam?.abbreviation}
        </span>
        {hasScore && (
          <span className={`text-sm sm:text-base font-semibold ${homeLead ? 'text-fg' : 'text-fg/70'}`}>
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
        <span className={`text-sm sm:text-base font-semibold ${hasScore && !homeLead ? 'font-bold text-fg' : 'text-fg/80'}`}>
          {awayTeam?.abbreviation}
        </span>
        {hasScore && (
          <span className={`text-sm sm:text-base font-semibold ${!homeLead ? 'text-fg' : 'text-fg/70'}`}>
            {awayScore}
          </span>
        )}
      </div>

      {/* Time remaining — red text with live dot */}
      {timeLabel && (
        <span className="mx-1 inline-flex items-center gap-1 text-sm sm:text-base font-semibold text-red-500 whitespace-nowrap">
          <span className="w-1.5 h-1.5 rounded-full bg-red-500 flex-shrink-0" />
          {timeLabel}
        </span>
      )}
    </div>
  );
}

// ── Play Item ────────────────────────────────────────────────────────────
function PlayItem({ item, isDark, tl, onGameClick }) {
  const { play, homeTeam, awayTeam, homeScore, awayScore, period, clock, playerStatLine, assisterAssists, gameId } = item;

  const playTeam = play.team?.id === homeTeam?.id ? homeTeam : play.team?.id === awayTeam?.id ? awayTeam : null;
  const teamColor = playTeam?.color || '#666';
  const participant = play.participants?.[0];
  const headshot = participant?.headshot;

  // Assist detection — second participant on scoring plays
  const assister = (play.scoringPlay && play.participants?.[1]) ? play.participants[1] : null;
  const hasAssist = !!assister;
  const isDualAvatar = hasAssist && headshot && assister.headshot;

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
      className={`flex items-center gap-4 px-4 sm:gap-5 sm:px-5 py-2.5 cursor-pointer transition-colors ${isDark ? 'hover:bg-white/[0.04]' : 'hover:bg-black/[0.03]'}`}
      style={{ borderLeft: `3px solid ${teamColor}` }}
      onClick={() => onGameClick?.(gameId)}
    >
      {/* Avatar area */}
      <div className={`flex-shrink-0 relative ${isDualAvatar ? DUAL_CONTAINER : ''}`}>
        {isDualAvatar ? (
          <>
            {/* Scorer - top left */}
            <div className={`absolute top-0 left-0 z-10 ${DUAL_CIRCLE} rounded-full ring-2 ${isDark ? 'ring-gray-800 bg-gray-800' : 'ring-white bg-white'}`}>
              <img
                src={headshot}
                alt=""
                className="w-full h-full rounded-full object-cover"
                onError={(e) => { e.target.style.display = 'none'; }}
              />
            </div>
            {/* Assister - bottom right */}
            <div className={`absolute bottom-0 right-0 z-[11] ${DUAL_CIRCLE} rounded-full`}>
              <img
                src={assister.headshot}
                alt=""
                className="w-full h-full rounded-full object-cover"
                onError={(e) => { e.target.style.display = 'none'; }}
              />
            </div>
            {/* Team logo badge on bottom-right of assister */}
            {playTeam?.logo && (
              <img src={tl(playTeam.logo)} alt="" className="absolute -bottom-1.5 -right-1.5 w-4 h-4 sm:w-5 sm:h-5 object-contain rounded-full bg-canvas z-20" />
            )}
          </>
        ) : headshot ? (
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
          <span className="text-base text-fg">
            {participant && (
              <span className="font-semibold">
                {participant.jersey ? `#${participant.jersey} ` : ''}
                {participant.shortName || participant.name || ''}
              </span>
            )}
            {participant && ' '}
            <span className={`${isScoring ? 'font-medium text-fg/80' : isMiss ? 'text-fg/60' : isBlock || isSteal ? 'text-fg font-medium' : isTurnover ? 'text-fg/70' : 'text-fg/80'}`}>
              {getPlayAction(play, { homeScore, awayScore, period, clock })}
            </span>
          </span>
        </div>

        {/* Assist line */}
        {hasAssist && (
          <div className="text-sm sm:text-base text-fg/70">
            Assist: <span className="font-medium text-fg/80">{assister.jersey ? `#${assister.jersey} ` : ''}{assister.shortName || assister.name}</span>
            {assisterAssists > 0 && <span className="text-fg/60"> ({assisterAssists} AST)</span>}
          </div>
        )}

        {/* Stat line */}
        {playerStatLine && (
          <div className="text-sm sm:text-base text-fg/90 mt-0.5">
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
      className={`flex items-center gap-4 px-4 sm:gap-5 sm:px-5 py-2.5 cursor-pointer transition-colors ${
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
          <div className={`${DUAL_CONTAINER} relative`}>
            {/* Home team — top-left */}
            <div
              className={`absolute top-0 left-0 ${DUAL_CIRCLE} rounded-full flex items-center justify-center z-[1] border-2 ${isDark ? 'bg-gray-900' : 'bg-white'}`}
              style={{ borderColor: homeTeam?.color || '#666' }}
            >
              {homeTeam?.logo && (
                <img src={tl(homeTeam.logo)} alt="" className="w-4 h-4 sm:w-6 sm:h-6 object-contain" />
              )}
            </div>
            {/* Away team — bottom-right, overlapping */}
            <div
              className={`absolute bottom-0 right-0 ${DUAL_CIRCLE} rounded-full flex items-center justify-center z-[2] border-2 ${isDark ? 'bg-gray-900' : 'bg-white'}`}
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
        <div className={`text-base ${isHighPriority ? 'font-semibold text-fg' : 'font-medium text-fg'}`}>
          {icon && <span className="mr-1.5">{icon}</span>}
          {text}
        </div>
        {subtext && (
          <div className="text-sm sm:text-base text-fg/70 mt-0.5">{subtext}</div>
        )}
        {/* Game score line — skip for halftime/final since score is already in the text */}
        {kind !== 'halftime' && kind !== 'game_final' ? (
          <GameScoreLine
            homeTeam={homeTeam}
            awayTeam={awayTeam}
            homeScore={homeScore}
            awayScore={awayScore}
            period={period}
            clock={clock}
            tl={tl}
          />
        ) : (
          <div className="flex items-center gap-1 mt-1">
            {homeTeam?.logo && <img src={tl(homeTeam.logo)} alt="" className="w-4 h-4 sm:w-5 sm:h-5 object-contain" />}
            <span className="text-sm font-semibold text-fg/80">{homeTeam?.abbreviation}</span>
            <span className="text-sm text-fg/50 mx-0.5">vs</span>
            {awayTeam?.logo && <img src={tl(awayTeam.logo)} alt="" className="w-4 h-4 sm:w-5 sm:h-5 object-contain" />}
            <span className="text-sm font-semibold text-fg/80">{awayTeam?.abbreviation}</span>
            <span className="inline-flex items-center gap-1 ml-1 text-sm font-semibold text-fg/60 whitespace-nowrap">
              {kind === 'halftime' ? 'Halftime' : 'Final'}
            </span>
          </div>
        )}
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

// ── Shot distance from ESPN coordinates ────────────────────────────────
function getShotDistance(coordinate) {
  if (!coordinate || coordinate.x == null || coordinate.y == null) return null;
  // ESPN: x=0-50 (width), y=0 at basket, y grows toward halfcourt
  // Basket center is at (25, 0). Distance = sqrt((x-25)^2 + y^2)
  const dx = coordinate.x - 25;
  const dy = coordinate.y;
  return Math.round(Math.sqrt(dx * dx + dy * dy));
}

function getShotZone(coordinate, distance) {
  if (!coordinate || distance == null) return null;
  const x = coordinate.x;
  const y = coordinate.y;

  // At the rim (layup/dunk range)
  if (distance <= 4) return 'at_rim';
  // In the paint
  if (distance <= 10) return 'paint';
  // Mid-range
  if (distance <= 22) {
    if (y <= 8 && (x < 10 || x > 40)) return 'baseline';
    if (x < 10 || x > 40) return 'wing_mid';
    if (y >= 15) return 'elbow';
    return 'mid_range';
  }
  // Three-point range
  if (x < 6 || x > 44) return 'corner_three'; // corners
  if (distance >= 30) return 'deep_three'; // way downtown
  if (x < 15 || x > 35) return 'wing_three';
  return 'top_three'; // top of the key
}

// Simple seeded pick to vary descriptions without being random per render
function pick(options, play) {
  const seed = (play?.id || '').split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
  return options[seed % options.length];
}

// ── Game context suffix ────────────────────────────────────────────────
function getGameContext(play, homeScore, awayScore, period, clock) {
  if (homeScore == null || awayScore == null) return '';
  const periodNum = period?.number || period || 1;
  const clockStr = clock?.displayValue || clock || '';
  const clockParts = clockStr.split(':').map(Number);
  const secondsLeft = clockParts.length === 2 ? clockParts[0] * 60 + clockParts[1] : null;

  // Calculate score after this play
  const diff = Math.abs(homeScore - awayScore);

  // Late-game / end-of-half context
  const isSecondHalf = periodNum >= 2;
  const isLateGame = isSecondHalf && secondsLeft != null && secondsLeft <= 120;
  const isVeryLate = isSecondHalf && secondsLeft != null && secondsLeft <= 30;
  const isEndOfHalf = periodNum === 1 && secondsLeft != null && secondsLeft <= 60;

  // Tied
  if (diff === 0) {
    if (isVeryLate) return ' to tie the game!';
    if (isLateGame) return ' — game tied!';
    return ' to tie it up';
  }

  // Close game context
  if (diff <= 5) {
    const trailingContext = diff === 1 ? 'by 1' : `to ${diff}`;
    if (isVeryLate) {
      return diff <= 2 ? ` — ${diff === 1 ? 'it\'s a 1-point game!' : `just a ${diff}-point game!`}` : '';
    }
    if (isLateGame) return ` — ${diff}-point game`;
    if (isEndOfHalf) return ` heading into the half`;
  }

  // Big lead
  if (diff >= 20 && play.scoringPlay) return ` — ${diff}-point lead`;

  return '';
}

// ── Creative play descriptions ─────────────────────────────────────────
function getPlayAction(play, { homeScore, awayScore, period, clock } = {}) {
  if (!play) return '';
  const text = (play.shortText || play.text || '').toLowerCase();
  const distance = getShotDistance(play.coordinate);
  const zone = getShotZone(play.coordinate, distance);
  const context = getGameContext(play, homeScore, awayScore, period, clock);
  const distTag = distance && distance > 5 ? ` (${distance}ft)` : '';

  // ── Three-pointers ──
  if (play.scoringPlay && play.scoreValue === 3) {
    let shot;
    if (zone === 'deep_three' || distance >= 30) {
      shot = pick(['drills it from WAY downtown', 'from deep — BANG', 'pulls up from the logo'], play) + `! ${distTag}`;
    } else if (zone === 'corner_three') {
      shot = pick(['knocks down the corner three', 'buries it from the corner', 'corner three — cash'], play) + distTag;
    } else if (text.includes('step back')) {
      shot = pick(['step-back three — SPLASH', 'hits the step-back three'], play) + distTag;
    } else if (text.includes('pullup') || text.includes('pull-up') || text.includes('pull up')) {
      shot = 'pull-up three' + distTag;
    } else if (text.includes('fadeaway') || text.includes('fade away')) {
      shot = 'fadeaway three' + distTag;
    } else if (text.includes('catch and shoot') || text.includes('catch-and-shoot')) {
      shot = 'catch-and-shoot three' + distTag;
    } else if (text.includes('transition') || text.includes('fast break')) {
      shot = pick(['transition three', 'three in transition'], play) + distTag;
    } else if (zone === 'wing_three') {
      shot = pick(['drills a three from the wing', 'knocks it down from the wing'], play) + distTag;
    } else {
      shot = pick(['drills a three', 'knocks down the three', 'splashes a three', 'buries the three'], play) + distTag;
    }
    return shot + context;
  }

  // ── Two-pointers ──
  if (play.scoringPlay && play.scoreValue === 2) {
    let shot;
    if (text.includes('dunk')) {
      shot = pick(['throws it down', 'with the slam', 'DUNK'], play);
    } else if (text.includes('alley')) {
      shot = pick(['alley-oop!', 'finishes the alley-oop'], play);
    } else if (text.includes('layup') || text.includes('lay up')) {
      shot = zone === 'paint' ? pick(['finishes at the rim', 'lays it in', 'with the layup'], play) : 'layup';
    } else if (text.includes('tip')) {
      shot = 'tip-in';
    } else if (text.includes('hook')) {
      shot = pick(['hook shot', 'with the hook'], play) + distTag;
    } else if (text.includes('floater') || text.includes('floating')) {
      shot = pick(['floater in the lane', 'with the floater'], play);
    } else if (text.includes('fadeaway') || text.includes('fade away')) {
      shot = 'fadeaway' + distTag;
    } else if (text.includes('step back')) {
      shot = 'step-back jumper' + distTag;
    } else if (text.includes('pullup') || text.includes('pull-up') || text.includes('pull up')) {
      shot = 'pull-up jumper' + distTag;
    } else if (text.includes('driving')) {
      shot = pick(['drives and scores', 'with the driving score'], play);
    } else if (text.includes('finger roll')) {
      shot = 'finger roll';
    } else if (text.includes('putback') || text.includes('put back') || text.includes('put-back')) {
      shot = pick(['putback', 'cleans up the glass'], play);
    } else if (text.includes('jumper') || text.includes('jump shot')) {
      if (zone === 'elbow') shot = 'hits from the elbow' + distTag;
      else if (zone === 'baseline') shot = 'baseline jumper' + distTag;
      else if (zone === 'wing_mid') shot = 'from the wing' + distTag;
      else shot = pick(['hits the jumper', 'mid-range jumper'], play) + distTag;
    } else if (zone === 'at_rim' || zone === 'paint') {
      shot = pick(['scores in the paint', 'finishes inside'], play);
    } else {
      shot = 'two-pointer' + distTag;
    }
    return shot + context;
  }

  // ── Free throws ──
  if (play.scoringPlay && play.scoreValue === 1) {
    // Detect "1 of 2", "2 of 2", "1 of 3", etc. from play text
    const ftMatch = text.match(/(\d)\s*of\s*(\d)/);
    if (ftMatch) {
      const ftNum = parseInt(ftMatch[1]);
      const ftTotal = parseInt(ftMatch[2]);
      if (ftNum === ftTotal) {
        return `hits ${ftTotal === 1 ? 'the free throw' : ftNum === 2 ? 'both free throws' : `all ${ftTotal} free throws`}` + context;
      }
      return `hits free throw ${ftNum} of ${ftTotal}` + context;
    }
    return 'hits the free throw' + context;
  }

  // ── Missed free throws ──
  if (play.shootingPlay && !play.scoringPlay && (text.includes('free throw') || play.pointsAttempted === 1)) {
    const ftMatch = text.match(/(\d)\s*of\s*(\d)/);
    if (ftMatch) {
      return `misses free throw ${ftMatch[1]} of ${ftMatch[2]}`;
    }
    return 'misses the free throw';
  }

  // ── Misses ──
  if (play.shootingPlay && !play.scoringPlay) {
    if (text.includes('three') || text.includes('3-point') || text.includes('3pt')) {
      if (zone === 'deep_three' || (distance && distance >= 30)) return `misses from deep ${distTag}`;
      if (zone === 'corner_three') return 'misses from the corner';
      return 'misses the three' + distTag;
    }
    if (text.includes('free throw')) return 'misses the free throw';
    if (text.includes('dunk')) return 'misses the dunk';
    if (text.includes('layup') || text.includes('lay up')) return 'can\'t finish the layup';
    return 'misses the shot' + distTag;
  }

  // ── Non-shooting plays ──
  if (text.includes('block')) return pick(['with the block!', 'gets the block!', 'swats it away!'], play);
  if (text.includes('steal')) return pick(['with the steal', 'picks it off', 'rips it away'], play);
  if (text.includes('turnover')) return pick(['turns it over', 'coughs it up', 'gives it away'], play);
  if (text.includes('rebound')) {
    if (text.includes('offensive')) return pick(['grabs the offensive board', 'with the offensive rebound'], play);
    if (text.includes('defensive')) return pick(['pulls down the rebound', 'grabs the defensive board'], play);
    return 'grabs the rebound';
  }
  if (text.includes('foul')) return 'commits a foul';

  return play.shortText || play.text || '';
}
