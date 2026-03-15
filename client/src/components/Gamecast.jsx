import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import BasketballCourt, { espnToSvg, espnToSvgFar } from './BasketballCourt';
import { usePlayerGameStats, getPlayLabel } from '../hooks/usePlayerGameStats';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';

/** ESPN dark logo: replace /500/ with /500-dark/ in the URL */
function getDarkLogo(logoUrl) {
  if (!logoUrl) return logoUrl;
  return logoUrl.replace('/500/', '/500-dark/');
}

/**
 * Gamecast — live play-by-play feed overlaid on a full basketball court.
 *
 * This component combines a real-time play-by-play feed with an interactive court
 * visualization. Shots and plays are plotted on the court as they happen during live games.
 *
 * ESPN COORDINATE HANDLING:
 * • ESPN provides half-court coords: x (0–50, court width), y (0–~47, depth from basket)
 * • Home team plays → near (right) half via espnToSvg()
 * • Away team plays → far (left) half via espnToSvgFar()
 * • Free throw sentinel: ESPN sends (25, 0) for FT plays — we override y to 14.5
 *   (FT line is 15ft from backboard, basket is ~1.25ft in front = ~13.75ft from rim,
 *    we use 14.5 so the marker appears slightly behind the line for a natural look)
 *
 * COURT MARKERS:
 * • Most recent shot: pulsing circle (or player headshot) with stat label
 * • Clicked play from feed: highlighted with larger ring + stat label
 * • Markers fade when game is paused (timeout, halftime, etc.)
 *
 * BANNER SYSTEM:
 * • Displays event context above the court (scoring plays, timeouts, fouls, etc.)
 * • Scoring banners use team color background with shimmer animation
 * • Substitution banners accumulate consecutive sub plays
 * • Persistent banners (timeouts, end of period) stay until next play
 *
 * DEBUG MODE (admin only):
 * • Toggle button in period filter row (visible only when user.isAdmin)
 * • When on: shows ESPN coordinates for each play in the feed
 * • Also passes showDebug to BasketballCourt to render reference dots
 */

/**
 * ESPN play type IDs (from play.type.id in ESPN API)
 *
 * Administrative:
 *   16  — timeout
 *   18  — substitution
 *   412 — end of period / half / game
 *
 * Shooting:
 *   ESPN doesn't use a single typeId for made/missed shots.
 *   Instead, use play.shootingPlay, play.scoringPlay, play.scoreValue, play.text.
 *
 * Rebounds:
 *   155 — defensive rebound
 *   156 — offensive rebound
 *
 * Fouls:
 *   42  — personal foul
 *   43  — shooting foul
 *   44  — offensive foul
 *   45  — technical foul
 *
 * Turnovers:
 *   62  — bad pass turnover
 *   63  — lost ball turnover
 *   84  — traveling
 *   86  — out of bounds
 *   90  — shot clock violation
 *
 * Other:
 *   520 — jumpball
 *   574 — violation
 *   598 — ejection
 */
const REBOUND_IDS = new Set(['155', '156']);
const FOUL_IDS = new Set(['42', '43', '44', '45']);
const TURNOVER_IDS = new Set(['62', '63', '84', '86', '90']);
const END_PERIOD_ID = '412';
const TIMEOUT_ID = '16';
const SUBSTITUTION_ID = '18';

// Plays that should NOT display on the court even if they have ESPN coordinates.
// These are administrative/non-action plays with no meaningful court position.
const COURT_EXCLUDE_IDS = new Set([
  TIMEOUT_ID,       // '16' — timeouts
  SUBSTITUTION_ID,  // '18' — substitutions
  END_PERIOD_ID,    // '412' — end of period/half/game
]);

/**
 * isSecondHalf — determines if a period number is in the second half for a given sport.
 * Used for court side switching: teams switch sides at halftime.
 *   NBA:   Q1-Q2 = first half, Q3+ (including OT) = second half
 *   NCAAB: period 1 = first half, period 2+ (including OT) = second half
 */
function isSecondHalf(periodNumber, courtType) {
  if (!periodNumber) return false;
  if (courtType === 'ncaab') return periodNumber >= 2;
  return periodNumber >= 3; // NBA: Q3+ is second half
}

/**
 * parseClockToSeconds — converts a game clock display string to total seconds remaining.
 * E.g. "10:34" → 634, "0:45" → 45, "5:00" → 300.
 * Returns null if the format is unrecognized.
 */
function parseClockToSeconds(displayValue) {
  if (!displayValue) return null;
  const parts = displayValue.split(':');
  if (parts.length === 2) {
    const mins = parseInt(parts[0], 10);
    const secs = parseInt(parts[1], 10);
    if (isNaN(mins) || isNaN(secs)) return null;
    return mins * 60 + secs;
  }
  if (parts.length === 1) {
    const val = parseFloat(parts[0]);
    return isNaN(val) ? null : val;
  }
  return null;
}

/**
 * getMinDisplayTime — returns the minimum time (ms) a play should stay on screen
 * before the next play is revealed. Based on real game flow:
 *
 *   Scoring play (made shot)  → 3.0s  (celebration, inbound, bring ball up court)
 *   Defensive rebound         → 2.5s  (full court transition to other end)
 *   Missed shot               → 2.0s  (rebound scramble follows)
 *   Block                     → 2.0s  (recovery/scramble after block)
 *   Turnover / steal          → 2.0s  (transition play to other end)
 *   Offensive rebound         → 1.5s  (action stays near the basket)
 *   Foul                      → 1.5s  (stoppage, but quick)
 *   Everything else           → 1.5s  (default)
 */
function getMinDisplayTime(play) {
  if (!play) return 1500;
  const tid = String(play.typeId || play.type?.id || '');
  const text = play.text?.toLowerCase() || '';

  // Scoring play — longest hold (inbound + bring ball up)
  if (play.scoringPlay) return 3000;

  // Defensive rebound — full court transition
  if (tid === '155' || (text.includes('defensive') && text.includes('rebound'))) return 2500;

  // Missed shot
  if (play.shootingPlay && !play.scoringPlay) return 2000;

  // Block
  if (text.includes('block')) return 2000;

  // Turnover / steal — transition play
  if (TURNOVER_IDS.has(tid) || text.includes('turnover') || text.includes('steal')) return 2000;

  // Offensive rebound — action stays near basket
  if (tid === '156' || (text.includes('offensive') && text.includes('rebound'))) return 1500;

  // Foul
  if (FOUL_IDS.has(tid) || text.includes('foul')) return 1500;

  return 1500;
}

/**
 * computeRevealTimings — calculates how long to display each new play before
 * revealing the next, based on real game-clock gaps between consecutive plays.
 *
 * Instead of cramming all plays into the time until the next fetch, we use the
 * actual game-clock gaps scaled to display time. This means:
 * - Plays that happened seconds apart (e.g. foul → free throw) are revealed quickly
 * - Plays with a long gap (e.g. 40s of gameplay between scores) get proportionally
 *   more screen time, even if that extends past the next fetch
 *
 * The SCALE_FACTOR converts game seconds → display milliseconds. E.g. 150 means
 * 10 game seconds = 1.5s display time. Combined with MIN/MAX clamping, this keeps
 * the pacing natural without being too fast or too slow.
 *
 * After computing the clock-based delay, we enforce a play-type-specific minimum
 * display time (via getMinDisplayTime) so important plays like scores, rebounds,
 * and blocks stay on screen long enough to match real game feel.
 *
 * @param {Array} newPlays - plays to reveal, in chronological order (oldest first)
 * @returns {Array<number>} - array of delays in ms, one per play
 */
function computeRevealTimings(newPlays) {
  const DEFAULT_GAP = 3.0;     // seconds, used for cross-period or missing clock data
  const MIN_DELAY = 1500;      // ms — fastest a play can be shown (must be readable)
  const MAX_DELAY = 6000;      // ms — longest a single play holds before the next
  const SCALE_FACTOR = 150;    // ms per game-second (e.g. 10 game-sec = 1.5s display)

  if (newPlays.length === 0) return [];
  if (newPlays.length === 1) return [MIN_DELAY];

  // Compute raw game-clock gaps between consecutive plays.
  // Clock counts DOWN in basketball, so gap = prevSeconds - currSeconds.
  // The delay at index i is how long play[i-1] stays on screen before play[i] appears.
  return newPlays.map((curr, i) => {
    if (i === 0) return MIN_DELAY; // first play in batch shows after base delay

    const prev = newPlays[i - 1];
    const minForPrev = getMinDisplayTime(prev);

    // Cross-period: clock resets, so we can't compute a meaningful gap
    if (prev.period?.number !== curr.period?.number) {
      return Math.max(minForPrev, DEFAULT_GAP * SCALE_FACTOR);
    }

    const prevSec = parseClockToSeconds(prev.clock?.displayValue);
    const currSec = parseClockToSeconds(curr.clock?.displayValue);

    if (prevSec == null || currSec == null) {
      return Math.max(minForPrev, DEFAULT_GAP * SCALE_FACTOR);
    }

    // Ensure minimum gap of 0.5s so plays at the exact same clock time
    // still get a brief pause between reveals
    const gapSec = Math.max(0.5, prevSec - currSec);
    const clockDelay = Math.max(MIN_DELAY, Math.min(MAX_DELAY, gapSec * SCALE_FACTOR));

    // Enforce play-type-specific minimum display time
    return Math.max(clockDelay, minForPrev);
  });
}

function isSubstitution(play) {
  const tid = String(play.typeId);
  if (tid === SUBSTITUTION_ID) return true;
  const text = (play.text || '').toLowerCase();
  return text.includes('enters the game') || text.includes('subbing in');
}

function classifyBanner(play, homeTeam, awayTeam, playerStats) {
  if (!play) return null;
  const tid = String(play.typeId);
  const pid = play.participants?.[0]?.playerId;
  const name = play.participants?.[0]?.shortName || '';
  const jersey = play.participants?.[0]?.jersey;
  let team = play.team?.id === homeTeam?.id ? homeTeam : play.team?.id === awayTeam?.id ? awayTeam : null;
  // Text-based team fallback when play.team is missing
  if (!team) {
    const t = (play.text || play.shortText || '').toLowerCase();
    if (homeTeam && (t.includes(homeTeam.name?.toLowerCase()) || t.includes(homeTeam.abbreviation?.toLowerCase()))) team = homeTeam;
    else if (awayTeam && (t.includes(awayTeam.name?.toLowerCase()) || t.includes(awayTeam.abbreviation?.toLowerCase()))) team = awayTeam;
  }
  const teamLogo = team?.logo || null;
  const teamColor = team?.color || null;
  const s = pid && playerStats ? playerStats.get(pid) : null;
  const displayName = jersey ? `#${jersey} ${name}` : name;

  if (tid === END_PERIOD_ID) {
    const text = (play.shortText || play.text || '').toUpperCase();
    if (text.includes('HALFTIME') || text.includes('HALF')) return { text: 'HALFTIME', subtext: '', color: '#ffffff', persistent: true };
    return { text: 'END OF PERIOD', subtext: '', color: '#ffffff', persistent: true };
  }
  const playText = (play.text || play.shortText || '').toLowerCase();
  if (tid === TIMEOUT_ID || playText.includes('timeout')) {
    return { text: 'TIMEOUT', subtext: '', color: '#ffffff', persistent: true, logo: teamLogo };
  }
  if (playText.includes('coach') && playText.includes('challenge')) {
    return { text: "COACH'S CHALLENGE", subtext: '', color: '#ffffff', persistent: true, logo: teamLogo };
  }
  if (play.scoringPlay && play.shootingPlay) {
    const sv = play.scoreValue;
    if (sv === 3) {
      const threeLine = s ? `${s.points} PTS · 3PT ${s.threeMade}/${s.threeAttempted}` : '';
      return { text: '+3 POINTS', subtext: displayName, stat: threeLine, scoring: true, teamColor, color: '#22c55e', persistent: false, logo: teamLogo };
    }
    if (sv === 2) {
      const statLine = s ? `${s.points} PTS · FG ${s.fgMade}/${s.fgAttempted}` : '';
      return { text: '+2 POINTS', subtext: displayName, stat: statLine, scoring: true, teamColor, color: '#22c55e', persistent: false, logo: teamLogo };
    }
    if (sv === 1) {
      const ftLine = s ? `FT ${s.ftMade}/${s.ftAttempted}` : '';
      const stat = s ? `${s.points} PTS · ${ftLine}` : '';
      return { text: 'FREE THROW', subtext: displayName, stat, scoring: true, teamColor, color: '#22c55e', persistent: false, logo: teamLogo };
    }
  }
  // Scoring play without shootingPlay flag (e.g. team scoring)
  if (play.scoringPlay && !play.shootingPlay) {
    const sv = play.scoreValue || 0;
    return { text: `+${sv} POINTS`, subtext: displayName, stat: '', scoring: true, teamColor, color: '#22c55e', persistent: false, logo: teamLogo };
  }
  if (play.shootingPlay && !play.scoringPlay) {
    const pts = play.pointsAttempted || play.scoreValue || 0;
    if (pts === 1) {
      // Missed free throw
      const ftLine = s ? `FT ${s.ftMade}/${s.ftAttempted}` : '';
      return { text: 'MISSED FREE THROW', subtext: displayName, stat: ftLine, color: '#ef4444', persistent: false, logo: teamLogo };
    }
    const statLine = s ? `${s.fgMade}/${s.fgAttempted} FG` : '';
    return { text: 'MISSED SHOT', subtext: displayName, stat: statLine, color: '#ef4444', persistent: false, logo: teamLogo };
  }
  if (REBOUND_IDS.has(tid) || playText.includes('rebound')) {
    const isOff = playText.includes('offensive') || (!playText.includes('defensive') && tid === '156');
    let statLine = '';
    if (s) {
      const detail = isOff ? `${s.offRebounds} OREB` : `${s.defRebounds} DREB`;
      statLine = `${s.rebounds} REB · ${detail}`;
    }
    const bannerText = isOff ? 'OFFENSIVE REBOUND' : 'DEFENSIVE REBOUND';
    return { text: bannerText, subtext: displayName, stat: statLine, color: '#fbbf24', persistent: false, logo: teamLogo };
  }
  if (FOUL_IDS.has(tid) || playText.includes('foul')) {
    const statLine = s ? `${s.fouls} PF` : '';
    return { text: 'FOUL', subtext: displayName, stat: statLine, color: '#f97316', persistent: false, logo: teamLogo };
  }
  if (TURNOVER_IDS.has(tid) || playText.includes('turnover')) {
    const statLine = s ? `${s.turnovers} TO` : '';
    return { text: 'TURNOVER', subtext: displayName, stat: statLine, color: '#ef4444', persistent: false, logo: teamLogo };
  }
  return null;
}

/** Render a player name + stat label below (or above) a court marker */
function StatLabel({ pt, play, playerStats, r, color: teamBg }) {
  const label = getPlayLabel(play, playerStats);
  if (!label) return null;

  const jersey = play.participants?.[0]?.jersey;
  const shortName = play.participants?.[0]?.shortName || '';
  // Extract last name from shortName (format: "F. LastName" or "LastName")
  const lastName = shortName.includes(' ') ? shortName.split(' ').slice(1).join(' ') : shortName;
  const nameText = jersey ? `#${jersey} ${lastName}` : lastName;

  // Wider container for longer labels (rebounds show "2 OREB · 5 REB")
  const wide = label.line2 && label.line2.length > 10;
  const halfW = wide ? 68 : 50;
  const w = halfW * 2;

  // Layout: headshot → 6px gap → name (20px tall) → 6px gap → stat box (48px)
  const nameGap = 6;
  const nameFontSize = 20;
  const statBoxH = 48;
  const totalH = nameText ? nameGap + nameFontSize + nameGap + statBoxH : nameGap + statBoxH;
  const flipAbove = pt.y + r + totalH + 4 > 480;

  let nameY, labelY;
  if (flipAbove) {
    // Stack above: stat box on top, then name, then headshot
    const aboveNameGap = 12; // extra breathing room above name when flipped
    labelY = pt.y - r - aboveNameGap - statBoxH - (nameText ? nameFontSize + nameGap : 0);
    nameY = pt.y - r - aboveNameGap - nameFontSize / 2;
  } else {
    // Stack below: headshot, then name, then stat box
    const belowNameGap = 12; // breathing room between headshot and name
    nameY = pt.y + r + belowNameGap + nameFontSize / 2;
    labelY = pt.y + r + belowNameGap + (nameText ? nameFontSize + nameGap : 0);
  }
  // Clamp x so label stays within court (0-940)
  const labelX = Math.max(halfW, Math.min(940 - halfW, pt.x));

  return (
    <g>
      {nameText && (
        <text x={labelX} y={nameY}
          textAnchor="middle" dominantBaseline="middle"
          fill="#ffffff" fontSize="20" fontWeight="800"
          stroke="rgba(0,0,0,0.7)" strokeWidth="4" paintOrder="stroke"
        >{nameText}</text>
      )}
      <rect x={labelX - halfW} y={labelY} width={w} height={48}
        rx={8} fill={teamBg || 'rgba(0,0,0,0.85)'} opacity="0.9" />
      <text x={labelX} y={labelY + 19}
        textAnchor="middle" dominantBaseline="middle"
        fill="#ffffff" fontSize="26" fontWeight="900"
        letterSpacing="1"
      >{label.line1}</text>
      <text x={labelX} y={labelY + 38}
        textAnchor="middle" dominantBaseline="middle"
        fill="rgba(255,255,255,0.85)" fontSize="16" fontWeight="600"
      >{label.line2}</text>
    </g>
  );
}

/**
 * @param {Array}  plays     — array of ESPN play-by-play objects (newest last)
 * @param {Object} game      — game object with homeTeam, awayTeam, status
 * @param {string} courtType — 'nba' or 'ncaab' (passed to BasketballCourt)
 * @param {boolean} isPaused — true during timeouts/halftime (fades court markers)
 * @param {Object} [gamecastDebug] — debug timing info from Schedule.jsx polling system
 * @param {number|null} gamecastDebug.lastFetchTime — ms timestamp of last gamecast fetch
 * @param {number|null} gamecastDebug.nextFetchTime — ms timestamp of next scheduled fetch
 * @param {string|null} gamecastDebug.fetchTrigger — 'timer' | 'score-update' (what triggered last fetch)
 */
export default function Gamecast({ plays = [], game, courtType = 'nba', isPaused = false, gamecastDebug }) {
  const [selectedPlayIdx, setSelectedPlayIdx] = useState(null);
  const [periodFilter, setPeriodFilter] = useState('all');
  const [banner, setBanner] = useState(null);
  const [showDebug, setShowDebug] = useState(false);
  const [showDebugDots, setShowDebugDots] = useState(true); // toggle for court reference dots (only visible when debug is on)
  const [prevMarker, setPrevMarker] = useState(null);       // fading-out ghost of previous court marker
  const prevMarkerTimerRef = useRef(null);
  const feedRef = useRef(null);
  const [hasNewPlays, setHasNewPlays] = useState(false);
  const isScrolledRef = useRef(false);
  const prevPlaysLength = useRef(plays.length);

  // ── Sequential Play Reveal Queue ──────────────────────────────────────
  // Instead of dumping all new plays at once, we reveal them one at a time
  // with timing proportional to game-clock gaps between plays.
  // visibleCount tracks how many plays from the `plays` array are currently
  // shown in the feed. On initial load it equals plays.length (show all).
  // On subsequent fetches, new plays are queued and revealed incrementally.
  const [visibleCount, setVisibleCount] = useState(plays.length);
  const visibleCountRef = useRef(plays.length);       // avoids stale closures in setTimeout chain
  const [revealingPlay, setRevealingPlay] = useState(null); // play currently animating on court
  const queueTimerRef = useRef(null);                 // setTimeout ID for next reveal
  const revealQueueRef = useRef([]);                  // pending plays+delays to reveal
  const isInitialLoadRef = useRef(true);              // skip queuing on first mount
  const { isDark } = useTheme();
  const { user } = useAuth();

  /*
   * ── Debug: Gamecast Fetch Countdown Timer ──────────────────────────────
   * When debug mode is on, displays a live countdown until the next gamecast
   * fetch and flashes the trigger type ('timer' or 'score-update') when a
   * fetch occurs. Updates every 100ms for a smooth countdown display.
   */
  const [debugCountdown, setDebugCountdown] = useState(null);
  const [debugFetchFlash, setDebugFetchFlash] = useState(null); // brief flash showing fetch trigger

  // Track previous lastFetchTime to detect new fetches
  const prevFetchTimeRef = useRef(null);

  // Flash "FETCHED" indicator when a new fetch completes
  useEffect(() => {
    if (!showDebug || !gamecastDebug?.lastFetchTime) return;
    if (prevFetchTimeRef.current === gamecastDebug.lastFetchTime) return;
    prevFetchTimeRef.current = gamecastDebug.lastFetchTime;

    // Show flash with the trigger type for 2 seconds
    setDebugFetchFlash(gamecastDebug.fetchTrigger || 'timer');
    const timeout = setTimeout(() => setDebugFetchFlash(null), 2000);
    return () => clearTimeout(timeout);
  }, [showDebug, gamecastDebug?.lastFetchTime, gamecastDebug?.fetchTrigger]);

  // Update countdown every 100ms when debug mode is on
  useEffect(() => {
    if (!showDebug || !gamecastDebug?.nextFetchTime) {
      setDebugCountdown(null);
      return;
    }

    const tick = () => {
      const remaining = Math.max(0, gamecastDebug.nextFetchTime - Date.now());
      setDebugCountdown(remaining);
    };

    tick(); // initial value
    const interval = setInterval(tick, 100);
    return () => clearInterval(interval);
  }, [showDebug, gamecastDebug?.nextFetchTime]);

  const homeTeam = game?.homeTeam;
  const awayTeam = game?.awayTeam;
  const isFinal = game?.status === 'STATUS_FINAL' || game?.status === 'final';

  /** Pick the right logo variant for the current theme */
  const themeLogo = useCallback((logoUrl) => isDark ? getDarkLogo(logoUrl) : logoUrl, [isDark]);

  const playerStats = usePlayerGameStats(plays);

  const teamColor = useCallback(
    (teamId) => {
      if (teamId === homeTeam?.id) return homeTeam?.color || '#3b82f6';
      if (teamId === awayTeam?.id) return awayTeam?.color || '#ef4444';
      return '#888';
    },
    [homeTeam, awayTeam],
  );

  /**
   * Map a play's ESPN coordinates to SVG position on the correct half of the court.
   *
   * Court side logic (matches real basketball):
   *   First half:  home team scores on right (near), away team scores on left (far)
   *   Second half: teams switch — away team scores on right, home on left
   *   Overtime:    stays on second-half sides (no additional switch)
   *
   * Defensive rebounds are flipped because they occur on the opponent's scoring side.
   *
   * Administrative plays (timeouts, substitutions, end of period) are excluded
   * via COURT_EXCLUDE_IDS — they have no meaningful court position.
   *
   * Free throw sentinel: ESPN sends (25, 0) for FT plays instead of actual
   * coordinates. We override to y=14.5 (just behind the FT line).
   *
   * Returns { x, y } in SVG coords, or null if play shouldn't show on court.
   */
  const mapPlay = useCallback(
    (play) => {
      if (!play.coordinate) return null;

      // Exclude administrative plays from court display
      const tid = String(play.typeId || play.type?.id || '');
      if (COURT_EXCLUDE_IDS.has(tid)) return null;

      let { x, y } = play.coordinate;

      // Free throw coordinate override:
      // ESPN doesn't send real court positions for FTs. NCAAB uses (25, 0) as a sentinel,
      // NBA sends broken values like (-214748340, -214748365) — likely integer overflow.
      // We detect FTs and override to x=25 (centered), y=14.5 (just behind FT line).
      const isFT = play.shootingPlay && (play.scoreValue === 1 || play.pointsAttempted === 1);
      if (isFT && (x < 0 || y < 0 || (x === 25 && y === 0))) {
        x = 25;
        y = 14.5;
      }

      // ── Court side logic ──
      const secondHalf = isSecondHalf(play.period?.number, courtType);
      const isHome = play.team?.id === homeTeam?.id;

      // First half: home=near(right), away=far(left)
      // Second half: flip — away=near(right), home=far(left)
      let useNear = isHome ? !secondHalf : secondHalf;

      // Defensive plays happen at the team's own basket (opponent's scoring side) → flip
      // - Defensive rebounds: team recovers at their own basket
      // - Blocks: team blocks a shot at their own basket
      // Offensive rebounds stay on the team's scoring side → no flip
      // ESPN typeIds: 155 = defensive rebound, 156 = offensive rebound
      const playText = play.text?.toLowerCase() || '';
      const isDefensivePlay = tid === '155' ||
        (!play.shootingPlay && playText.includes('defensive') && playText.includes('rebound')) ||
        (!play.shootingPlay && playText.includes('block'));
      if (isDefensivePlay) {
        useNear = !useNear;
      }

      return useNear ? espnToSvg(x, y) : espnToSvgFar(x, y);
    },
    [homeTeam, courtType],
  );

  const reversedPlays = useMemo(() => [...plays].reverse(), [plays]);

  // visibleReversedPlays — the subset of plays that have been "revealed" to the user,
  // in reverse order (newest first). During queuing, this grows one play at a time.
  // On initial load or when game is final, equals reversedPlays (all plays visible).
  const visibleReversedPlays = useMemo(
    () => [...plays.slice(0, visibleCount)].reverse(),
    [plays, visibleCount]
  );

  // Build period list with short labels from ESPN displayValue
  const { periods, periodLabels } = useMemo(() => {
    const map = new Map();
    for (const p of plays) {
      if (p.period?.number && !map.has(p.period.number)) {
        // Convert ESPN displayValue like "1st Quarter" → "Q1", "1st Half" → "1H", "1st Overtime" → "OT1"
        const dv = (p.period.displayValue || '').toLowerCase();
        let label;
        if (dv.includes('overtime') || dv.includes(' ot')) {
          const otNum = map.size > 0 ? p.period.number - Math.max(...map.keys()) : 1;
          label = otNum <= 1 ? 'OT' : `OT${otNum}`;
        } else if (dv.includes('half')) {
          label = `${p.period.number}H`;
        } else {
          label = `Q${p.period.number}`;
        }
        map.set(p.period.number, label);
      }
    }
    const sorted = Array.from(map.keys()).sort((a, b) => a - b);
    return { periods: sorted, periodLabels: map };
  }, [plays]);

  // filteredPlays uses visibleReversedPlays so only revealed plays show in the feed
  const filteredPlays = useMemo(
    () =>
      periodFilter === 'all'
        ? visibleReversedPlays
        : visibleReversedPlays.filter(
            (p) => String(p.period?.number) === String(periodFilter),
          ),
    [visibleReversedPlays, periodFilter],
  );

  // mostRecentPlay — the latest visible play that has valid court coordinates.
  // Any play with coordinates shows on court (not just shooting plays).
  // Uses visible plays so the court marker tracks the reveal queue.
  const mostRecentPlay = useMemo(() => {
    const latest = visibleReversedPlays[0];
    if (latest && mapPlay(latest)) return latest;
    return null;
  }, [visibleReversedPlays, mapPlay]);



  const highlightedPlay = useMemo(() => {
    if (selectedPlayIdx == null) return null;
    const play = filteredPlays[selectedPlayIdx];
    if (play && mapPlay(play)) return play;
    return null;
  }, [selectedPlayIdx, filteredPlays, mapPlay]);

  // activeRevealPlay — the play currently being revealed by the queue,
  // resolved to a play with valid court coordinates. Takes priority over
  // mostRecentPlay on the court during the reveal sequence.
  const activeRevealPlay = useMemo(() => {
    if (!revealingPlay) return null;
    if (mapPlay(revealingPlay)) return revealingPlay;
    return null;
  }, [revealingPlay, mapPlay]);

  // ── Court marker transition: capture outgoing marker for fade-out ghost ──
  const activeCourtPlay = activeRevealPlay || mostRecentPlay;
  const activeCourtPlayRef = useRef(null);
  useEffect(() => {
    const prev = activeCourtPlayRef.current;
    activeCourtPlayRef.current = activeCourtPlay;

    // If we had a previous play and it changed, create a fading ghost
    if (prev && prev !== activeCourtPlay) {
      const pt = mapPlay(prev);
      if (pt) {
        const color = teamColor(prev.team?.id);
        const headshot = prev.participants?.[0]?.headshot;
        setPrevMarker({ pt, color, headshot, key: prev.text + prev.clock?.displayValue });

        // Clear ghost after animation completes
        if (prevMarkerTimerRef.current) clearTimeout(prevMarkerTimerRef.current);
        prevMarkerTimerRef.current = setTimeout(() => {
          setPrevMarker(null);
          prevMarkerTimerRef.current = null;
        }, 350);
      }
    }
    return () => {
      if (prevMarkerTimerRef.current) clearTimeout(prevMarkerTimerRef.current);
    };
  }, [activeCourtPlay]);

  /**
   * ── Play Reveal Queue ─────────────────────────────────────────────────
   * When a gamecast fetch returns multiple new plays, instead of showing them
   * all at once (which makes it hard to follow), we reveal them one at a time
   * with pacing based on actual game-clock gaps between plays.
   *
   * - Initial load: all plays shown instantly (no queuing)
   * - Subsequent fetches: new plays queued, revealed one-by-one
   * - Each reveal: play appears in feed, court marker moves, banner updates
   * - If a new fetch arrives mid-queue: new plays are appended to the queue
   * - If game goes final: all plays shown instantly
   */
  useEffect(() => {
    // Initial load — show everything at once, no queuing
    if (isInitialLoadRef.current) {
      isInitialLoadRef.current = false;
      visibleCountRef.current = plays.length;
      setVisibleCount(plays.length);
      return;
    }

    // Game final — flush everything immediately
    if (isFinal) {
      if (queueTimerRef.current) {
        clearTimeout(queueTimerRef.current);
        queueTimerRef.current = null;
      }
      revealQueueRef.current = [];
      visibleCountRef.current = plays.length;
      setVisibleCount(plays.length);
      setRevealingPlay(null);
      return;
    }

    const prevCount = visibleCountRef.current;
    const newCount = plays.length;

    // Plays didn't grow (or decreased on sport/date switch) — sync immediately
    if (newCount <= prevCount) {
      visibleCountRef.current = newCount;
      setVisibleCount(newCount);
      return;
    }

    // ── New plays arrived — append to queue for sequential reveal ──

    const newPlays = plays.slice(prevCount); // chronological order (oldest first)
    const delays = computeRevealTimings(newPlays);

    // Build queue entries: each has the play, its delay, and its target visibleCount
    const queueEntries = newPlays.map((play, i) => ({
      play,
      delay: delays[i],
      visibleCount: prevCount + i + 1,
    }));

    // Append to existing queue (don't flush in-progress reveals)
    revealQueueRef.current = [...revealQueueRef.current, ...queueEntries];

    // If a reveal loop is already running, it will pick up the appended entries
    if (queueTimerRef.current) return;

    // Start reveal loop
    const revealNext = () => {
      const queue = revealQueueRef.current;
      if (queue.length === 0) {
        setRevealingPlay(null);
        queueTimerRef.current = null;
        return;
      }

      const entry = queue.shift();
      visibleCountRef.current = entry.visibleCount;
      setVisibleCount(entry.visibleCount);
      setRevealingPlay(entry.play);

      if (feedRef.current && selectedPlayIdx == null && !isScrolledRef.current) {
        feedRef.current.scrollTop = 0;
      } else if (selectedPlayIdx != null || isScrolledRef.current) {
        setHasNewPlays(true);
      }

      if (queue.length > 0) {
        queueTimerRef.current = setTimeout(revealNext, queue[0].delay);
      } else {
        // Last play — keep it on court briefly, then clear (or continue if new plays appended)
        queueTimerRef.current = setTimeout(() => {
          if (revealQueueRef.current.length > 0) {
            revealNext();
          } else {
            setRevealingPlay(null);
            queueTimerRef.current = null;
          }
        }, 500);
      }
    };

    // Start with the first entry's delay
    queueTimerRef.current = setTimeout(revealNext, queueEntries[0].delay);

    return () => {
      if (queueTimerRef.current) {
        clearTimeout(queueTimerRef.current);
        queueTimerRef.current = null;
      }
      revealQueueRef.current = [];
    };
  }, [plays, isFinal]);

  // Banner system — updates on each revealed play (not all plays at once).
  // Uses visibleReversedPlays so the banner changes as each queued play is revealed.
  useEffect(() => {
    // Determine banner from isPaused state or latest visible play
    let newBanner = null;
    if (isPaused) {
      const status = game?.status;
      if (status === 'STATUS_HALFTIME') {
        newBanner = { text: 'HALFTIME', subtext: '', color: '#ffffff', persistent: true };
      } else if (status === 'STATUS_END_PERIOD') {
        newBanner = { text: 'END OF PERIOD', subtext: '', color: '#ffffff', persistent: true };
      } else {
        newBanner = { text: 'TIMEOUT', subtext: '', color: '#ffffff', persistent: true };
      }
    } else if (visibleReversedPlays.length > 0) {
      // Check for consecutive substitutions at the top of the visible feed
      const consecutiveSubs = [];
      for (const p of visibleReversedPlays) {
        if (isSubstitution(p)) {
          consecutiveSubs.push(p);
        } else {
          break;
        }
      }

      if (consecutiveSubs.length > 0) {
        const firstSub = consecutiveSubs[0];
        const team = firstSub.team?.id === homeTeam?.id ? homeTeam : firstSub.team?.id === awayTeam?.id ? awayTeam : null;
        newBanner = {
          text: 'SUBSTITUTION',
          subs: consecutiveSubs.map(p => {
            const jersey = p.participants?.[0]?.jersey;
            const shortName = p.participants?.[0]?.shortName || '';
            return {
              name: jersey ? `#${jersey} ${shortName}` : shortName,
              headshot: p.participants?.[0]?.headshot || null,
            };
          }),
          color: '#ffffff',
          persistent: false,
          logo: team?.logo || null,
        };
      } else {
        newBanner = classifyBanner(visibleReversedPlays[0], homeTeam, awayTeam, playerStats);
      }
    }

    if (!newBanner) {
      setBanner(null);
      return;
    }

    setBanner({ ...newBanner, key: `${visibleCount}-${isPaused}` });
  }, [visibleCount, isPaused, game?.status]);

  return (
    <div className="relative">
      {/* Event banner — shows final scoreboard when game is over, otherwise event banners */}
      <div className="min-h-[52px] mb-1 flex items-center justify-center">
        {isFinal ? (
          <div className="flex items-center gap-4 py-2">
            <div className="flex items-center gap-2">
              {awayTeam?.logo && <img src={themeLogo(awayTeam.logo)} alt="" className="w-7 h-7 object-contain" />}
              <span className="text-lg font-bold text-fg">{awayTeam?.abbreviation}</span>
              <span className="text-2xl font-black text-fg tabular-nums">{awayTeam?.score ?? 0}</span>
            </div>
            <span className="text-sm font-black tracking-widest uppercase text-fg/50">FINAL</span>
            <div className="flex items-center gap-2">
              <span className="text-2xl font-black text-fg tabular-nums">{homeTeam?.score ?? 0}</span>
              <span className="text-lg font-bold text-fg">{homeTeam?.abbreviation}</span>
              {homeTeam?.logo && <img src={themeLogo(homeTeam.logo)} alt="" className="w-7 h-7 object-contain" />}
            </div>
          </div>
        ) : banner && (
          <div
            key={banner.key}
            className="text-center"
            style={{
              animation: 'bannerSlideIn 0.3s ease-out',
            }}
          >
            {banner.subs ? (
              /* Substitution banner with accumulated players */
              <>
                <div className="flex items-center justify-center gap-2 mb-1">
                  {banner.logo && (
                    <img src={themeLogo(banner.logo)} alt="" className="w-8 h-8 object-contain" />
                  )}
                  <span className="text-lg font-black tracking-widest uppercase text-fg/60">SUBSTITUTION</span>
                </div>
                <div className="flex items-center justify-center gap-4">
                  {banner.subs.map((sub, i) => (
                    <div key={i} className="flex items-center gap-1.5">
                      <span className="text-sm font-bold text-fg">{sub.name}</span>
                    </div>
                  ))}
                </div>
              </>
            ) : banner.scoring && banner.teamColor ? (
              /* Scoring banner — broadcast-style with team color bg + shimmer */
              <div
                className="scoring-banner relative w-full overflow-hidden rounded-lg"
                style={{
                  '--team-color': banner.teamColor,
                  backgroundColor: banner.teamColor,
                }}
              >
                {/* Shimmer sweep */}
                <div className="scoring-shimmer absolute inset-0 pointer-events-none" />
                <div className="relative flex items-center gap-3 px-4 py-2.5">
                  {banner.logo && (
                    <img src={getDarkLogo(banner.logo)} alt="" className="w-10 h-10 object-contain flex-shrink-0 drop-shadow-md" />
                  )}
                  <div className="flex flex-col min-w-0">
                    <span className="text-2xl font-black tracking-wider uppercase text-white leading-tight drop-shadow-sm">{banner.text}</span>
                    {(banner.subtext || banner.stat) && (
                      <div className="flex items-center gap-1.5 text-base leading-tight mt-0.5">
                        {banner.subtext && <span className="text-white/90 font-semibold drop-shadow-sm">{banner.subtext}</span>}
                        {banner.subtext && banner.stat && <span className="text-white/40">·</span>}
                        {banner.stat && <span className="text-white/75 font-medium">{banner.stat}</span>}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              /* Regular event banner */
              <>
                <div className="flex items-center justify-center gap-2 leading-tight">
                  {banner.logo && (
                    <img src={themeLogo(banner.logo)} alt="" className="w-7 h-7 object-contain" />
                  )}
                  <span className="text-2xl font-black tracking-widest uppercase"
                    style={{ color: banner.color === '#ffffff' ? 'var(--color-fg, #fff)' : banner.color }}
                  >{banner.text}</span>
                </div>
                {(banner.subtext || banner.stat) && (
                  <div className="text-base font-medium flex items-center justify-center gap-2 leading-tight">
                    {banner.subtext && <span className="text-fg font-bold">{banner.subtext}</span>}
                    {banner.subtext && banner.stat && <span className="text-fg/40">·</span>}
                    {banner.stat && <span className="font-bold" style={{ color: banner.color === '#ffffff' ? 'var(--color-fg, #fff)' : banner.color }}>{banner.stat}</span>}
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>

      <style>{`
        @keyframes bannerSlideIn {
          0% { opacity: 0; transform: translateY(-8px); }
          100% { opacity: 1; transform: translateY(0); }
        }
        .scoring-banner {
          animation: scoringSlideIn 0.4s cubic-bezier(0.16, 1, 0.3, 1);
          box-shadow: 0 4px 20px -4px var(--team-color);
        }
        @keyframes scoringSlideIn {
          0% { opacity: 0; transform: scale(0.92) translateY(-6px); }
          60% { transform: scale(1.02) translateY(0); }
          100% { opacity: 1; transform: scale(1) translateY(0); }
        }
        .scoring-shimmer {
          background: linear-gradient(
            105deg,
            transparent 0%,
            rgba(255,255,255,0.25) 45%,
            rgba(255,255,255,0.35) 50%,
            rgba(255,255,255,0.25) 55%,
            transparent 100%
          );
          animation: shimmerSweep 0.8s 0.15s ease-out forwards;
          opacity: 0;
        }
        @keyframes shimmerSweep {
          0% { transform: translateX(-100%); opacity: 1; }
          100% { transform: translateX(100%); opacity: 0; }
        }
        @keyframes playSlideIn {
          0% { opacity: 0; transform: translateY(-12px); }
          100% { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      {/* Full-width court */}
      <BasketballCourt courtType={courtType} homeLogo={homeTeam?.logo} homeColor={homeTeam?.color} showDebug={showDebug && showDebugDots}>
        <style>{`
          @keyframes shotPulse {
            0%, 100% { r: 8; opacity: 1; }
            50% { r: 14; opacity: 0.55; }
          }
          @keyframes ringPulse {
            0% { r: 30; opacity: 0.7; stroke-width: 4; }
            100% { r: 46; opacity: 0; stroke-width: 1; }
          }
          @keyframes markerFadeIn {
            0% { opacity: 0; transform: scale(0.5); }
            100% { opacity: 1; transform: scale(1); }
          }
          @keyframes markerFadeOut {
            0% { opacity: 1; transform: scale(1); }
            100% { opacity: 0; transform: scale(0.5); }
          }
        `}</style>

        {/* Highlighted play from feed click */}
        {highlightedPlay && (() => {
          const pt = mapPlay(highlightedPlay);
          if (!pt) return null;
          const color = teamColor(highlightedPlay.team?.id);
          const headshot = highlightedPlay.participants?.[0]?.headshot;
          const r = 28;
          return (
            <>
              <circle cx={pt.x} cy={pt.y} r={r + 12}
                fill={color} opacity="0.15" />
              {headshot ? (
                <>
                  <defs>
                    <clipPath id="highlight-clip">
                      <circle cx={pt.x} cy={pt.y} r={r} />
                    </clipPath>
                  </defs>
                  <circle cx={pt.x} cy={pt.y} r={r + 2} fill={color} />
                  <image href={headshot}
                    x={pt.x - r} y={pt.y - r} width={r * 2} height={r * 2}
                    clipPath="url(#highlight-clip)" preserveAspectRatio="xMidYMid slice" />
                  <circle cx={pt.x} cy={pt.y} r={r + 2}
                    fill="none" stroke="white" strokeWidth="3" />
                </>
              ) : (
                <circle cx={pt.x} cy={pt.y} r="7"
                  fill={color} stroke="white" strokeWidth="1.5" />
              )}
              <StatLabel pt={pt} play={highlightedPlay} playerStats={playerStats} r={r} color={color} />
            </>
          );
        })()}

        {/* Fading-out ghost of previous court marker */}
        {prevMarker && !highlightedPlay && !isFinal
          && !(isPaused && (game?.status === 'STATUS_END_PERIOD' || game?.status === 'STATUS_HALFTIME'))
          && (() => {
          const { pt, color, headshot, key } = prevMarker;
          const r = 28;
          return (
            <g key={`ghost-${key}`} style={{ animation: 'markerFadeOut 0.35s ease-out forwards', pointerEvents: 'none', transformOrigin: `${pt.x}px ${pt.y}px` }}>
              {headshot ? (
                <>
                  <defs>
                    <clipPath id="ghost-clip">
                      <circle cx={pt.x} cy={pt.y} r={r} />
                    </clipPath>
                  </defs>
                  <circle cx={pt.x} cy={pt.y} r={r + 2} fill={color} />
                  <image href={headshot}
                    x={pt.x - r} y={pt.y - r} width={r * 2} height={r * 2}
                    clipPath="url(#ghost-clip)" preserveAspectRatio="xMidYMid slice" />
                  <circle cx={pt.x} cy={pt.y} r={r + 2}
                    fill="none" stroke="white" strokeWidth="3" />
                </>
              ) : (
                <circle cx={pt.x} cy={pt.y} r="8"
                  fill={color} opacity={0.9}
                  stroke="white" strokeWidth="1.5" />
              )}
            </g>
          );
        })()}

        {/* Most recent play or actively revealing play — pulsing marker with fade-in.
            activeRevealPlay takes priority during the queue sequence so the court
            marker follows along as plays are revealed one by one.
            Hidden during end of period / halftime / final — court should be clean. */}
        {(activeRevealPlay || mostRecentPlay) && !highlightedPlay && !isFinal
          && !(isPaused && (game?.status === 'STATUS_END_PERIOD' || game?.status === 'STATUS_HALFTIME'))
          && (() => {
          const shot = activeRevealPlay || mostRecentPlay;
          const pt = mapPlay(shot);
          if (!pt) return null;
          const color = teamColor(shot.team?.id);
          const headshot = shot.participants?.[0]?.headshot;
          const r = 28;
          const markerKey = shot.text + shot.clock?.displayValue;
          if (headshot) {
            return (
              <g key={markerKey} style={{ animation: 'markerFadeIn 0.35s ease-out', transformOrigin: `${pt.x}px ${pt.y}px` }}>
                <defs>
                  <clipPath id="recent-clip">
                    <circle cx={pt.x} cy={pt.y} r={r} />
                  </clipPath>
                </defs>
                <circle cx={pt.x} cy={pt.y} r={r + 2} fill={color}
                  opacity={isPaused ? 0.5 : 1} />
                <image href={headshot}
                  x={pt.x - r} y={pt.y - r} width={r * 2} height={r * 2}
                  clipPath="url(#recent-clip)" preserveAspectRatio="xMidYMid slice"
                  opacity={isPaused ? 0.5 : 1} />
                <circle cx={pt.x} cy={pt.y} r={r + 2}
                  fill="none" stroke="white" strokeWidth="3"
                  opacity={isPaused ? 0.5 : 1} />
                {!isPaused && (
                  <circle cx={pt.x} cy={pt.y} r={r + 2}
                    fill="none" stroke={color}
                    style={{ animation: 'ringPulse 1.8s ease-out infinite' }} />
                )}
                <StatLabel pt={pt} play={shot} playerStats={playerStats} r={r} color={color} />
              </g>
            );
          }
          return (
            <g key={markerKey} style={{ animation: 'markerFadeIn 0.35s ease-out', transformOrigin: `${pt.x}px ${pt.y}px` }}>
              <circle cx={pt.x} cy={pt.y} r="8"
                fill={color} opacity={isPaused ? 0.5 : 0.9}
                stroke="white" strokeWidth="1.5"
                style={isPaused ? {} : { animation: 'shotPulse 2s ease-in-out infinite' }} />
              <StatLabel pt={pt} play={shot} playerStats={playerStats} r={8} color={color} />
            </g>
          );
        })()}

      </BasketballCourt>

      {/* Play-by-play feed */}
      <div className="mt-3 flex flex-col min-h-0">
        {/* Period filter tabs */}
        <div className="flex items-center gap-1.5 mb-2 flex-wrap">
          <PeriodTab
            active={periodFilter === 'all'}
            onClick={() => { setPeriodFilter('all'); setSelectedPlayIdx(null); }}
            label="All"
          />
          {periods.map((num) => (
            <PeriodTab
              key={num}
              active={String(periodFilter) === String(num)}
              onClick={() => { setPeriodFilter(num); setSelectedPlayIdx(null); }}
              label={periodLabels.get(num) || `Q${num}`}
            />
          ))}
          {/* Admin-only debug toggle — shows ESPN coordinates in feed + reference dots on court */}
          {user?.isAdmin && (
            <div className="ml-auto flex items-center gap-1.5">
              {/* Toggle court reference dots — only visible when debug mode is active */}
              {showDebug && (
                <button
                  onClick={() => setShowDebugDots(d => !d)}
                  className={`px-2 py-0.5 text-[10px] font-mono rounded transition-colors ${
                    showDebugDots ? 'bg-pink-500/20 text-pink-400 border border-pink-500/40' : 'bg-fg/5 text-fg/30 border border-fg/10'
                  }`}
                >
                  DOTS
                </button>
              )}
              <button
                onClick={() => setShowDebug(d => !d)}
                className={`px-2 py-0.5 text-[10px] font-mono rounded transition-colors ${
                  showDebug ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40' : 'bg-fg/5 text-fg/30 border border-fg/10'
                }`}
              >
                DEBUG
              </button>
            </div>
          )}
        </div>

        {/*
         * ── Debug: Live Polling Dashboard ──────────────────────────────────
         * Two-column layout on desktop (stacked on mobile):
         *   Left:  Socket.io score-update events with diffs
         *   Right: Gamecast fetch history with trigger type + countdown timer
         */}
        {showDebug && (gamecastDebug?.socketEvents?.length > 0 || gamecastDebug?.fetchEvents?.length > 0) && (
          <div className="grid grid-cols-1 min-[480px]:grid-cols-2 gap-2">
            {/* Left column: Socket events */}
            <div className="px-3 py-1.5 bg-purple-500/10 border border-purple-500/30 rounded text-[11px] font-mono space-y-1 max-h-[140px] overflow-y-auto">
              <div className="text-purple-400 font-bold text-[10px] uppercase tracking-wide mb-0.5">
                Socket Updates
              </div>
              {(gamecastDebug.socketEvents || []).length === 0 && (
                <div className="text-purple-300/30">Waiting for events...</div>
              )}
              {(gamecastDebug.socketEvents || []).map((evt, i) => (
                <div key={evt.time + '-' + i} className={`flex items-start gap-2 ${i === 0 ? 'text-purple-300' : 'text-purple-300/50'}`}>
                  <span className="flex-shrink-0 text-purple-400/60">
                    {new Date(evt.time).toLocaleTimeString()}
                  </span>
                  <span className="flex-1">
                    {evt.changes.length > 0
                      ? evt.changes.join(' · ')
                      : 'no changes detected'}
                  </span>
                </div>
              ))}
            </div>

            {/* Right column: Fetch history + countdown */}
            <div className="px-3 py-1.5 bg-amber-500/10 border border-amber-500/30 rounded text-[11px] font-mono space-y-1 max-h-[140px] overflow-y-auto">
              <div className="text-amber-400 font-bold text-[10px] uppercase tracking-wide mb-0.5">
                Gamecast Fetches
              </div>
              {/* Live countdown to next fetch */}
              {gamecastDebug?.nextFetchTime && (
                <div className="text-amber-400 mb-1">
                  Next fetch: <span className="text-amber-300 font-bold">
                    {debugCountdown != null ? `${(debugCountdown / 1000).toFixed(1)}s` : '—'}
                  </span>
                </div>
              )}
              {(gamecastDebug.fetchEvents || []).map((evt, i, arr) => {
                // Calculate seconds since previous fetch (next item in array = older event)
                const prevEvt = arr[i + 1];
                const gap = prevEvt ? ((evt.time - prevEvt.time) / 1000).toFixed(1) : null;

                return (
                  <div key={evt.time + '-' + i} className={`flex items-center gap-2 ${i === 0 ? 'font-bold' : ''}`}>
                    <span className="text-amber-400/60 flex-shrink-0">
                      {new Date(evt.time).toLocaleTimeString()}
                    </span>
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                      evt.trigger === 'score-update'
                        ? 'bg-green-500/20 text-green-400 border border-green-500/40'
                        : 'bg-blue-500/20 text-blue-400 border border-blue-500/40'
                    }`}>
                      {evt.trigger === 'score-update' ? 'socket' : 'timer'}
                    </span>
                    {/* Number of new plays received in this fetch */}
                    {evt.newPlays > 0 && (
                      <span className="text-emerald-400 text-[10px] font-bold">
                        +{evt.newPlays} play{evt.newPlays !== 1 ? 's' : ''}
                      </span>
                    )}
                    {/* How stale the first new play is (seconds between play wallclock and fetch time) */}
                    {evt.staleSec != null && (
                      <span className="text-orange-400/70 text-[10px]">
                        {evt.staleSec}s ago
                      </span>
                    )}
                    {/* Show delay duration when fetch was queued due to debounce */}
                    {evt.delayed && (
                      <span className="text-yellow-400/70 text-[10px]">
                        delayed {evt.delayed}s
                      </span>
                    )}
                    {/* Time since previous fetch */}
                    {gap && (
                      <span className="text-amber-400/50 text-xs">
                        +{gap}s
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Scrollable feed */}
        <div ref={feedRef}
          className="flex-1 overflow-y-auto max-h-[250px] space-y-0.5 rounded-lg relative"
          style={{ background: 'rgba(var(--color-surface, 255 255 255), 0.03)' }}
          onScroll={(e) => {
            const scrolled = e.target.scrollTop > 10;
            isScrolledRef.current = scrolled;
            if (!scrolled) setHasNewPlays(false);
          }}
        >
          {hasNewPlays && (
            <div className="sticky top-1 z-10 flex justify-center">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedPlayIdx(null);
                  setHasNewPlays(false);
                  isScrolledRef.current = false;
                  if (feedRef.current) feedRef.current.scrollTop = 0;
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-blue-600 text-white shadow-lg hover:bg-blue-500 transition-colors animate-in"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="18 15 12 9 6 15" /></svg>
                New plays
              </button>
            </div>
          )}
          {filteredPlays.length === 0 && (
            <div className="text-center text-fg/30 text-xs py-6">No plays yet</div>
          )}
          {filteredPlays.map((play, i) => {
            const isSelected = selectedPlayIdx === i;
            const color = teamColor(play.team?.id);
            const hasCoords = !!mapPlay(play);

            return (
              <button key={i === 0 ? `play-${play.text}-${play.clock?.displayValue}` : `play-${i}`}
                onClick={() => { if (hasCoords) setSelectedPlayIdx(isSelected ? null : i); }}
                className={`w-full text-left flex items-start gap-2 px-3 py-2 rounded transition-colors ${
                  hasCoords ? 'cursor-pointer hover:bg-fg/5' : 'cursor-default'
                } ${isSelected ? 'bg-fg/10 ring-1 ring-fg/20' : ''}`}
                style={{
                  borderLeft: isSelected ? `2px solid ${color}` : play.scoringPlay ? '2px solid rgba(34,197,94,0.5)' : '2px solid transparent',
                  ...(i === 0 ? { animation: 'playSlideIn 0.3s ease-out' } : {}),
                }}
              >
                {play.participants?.[0]?.headshot ? (
                  <img src={play.participants[0].headshot} alt=""
                    className="mt-0.5 flex-shrink-0 w-11 h-11 rounded-full object-cover"
                    style={{ border: `2px solid ${color}` }} />
                ) : play.team?.id && (play.team.id === homeTeam?.id || play.team.id === awayTeam?.id) ? (
                  <img src={themeLogo((play.team.id === homeTeam?.id ? homeTeam : awayTeam)?.logo)} alt=""
                    className="mt-0.5 flex-shrink-0 w-11 h-11 object-contain" />
                ) : (
                  <span className="flex-shrink-0 w-11" />
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 text-sm text-fg/40">
                    <span className="font-medium">
                      {play.period?.number
                        ? periodLabels.get(play.period.number) || `Q${play.period.number}`
                        : ''}
                    </span>
                    <span>{play.clock?.displayValue || ''}</span>
                    <span className="ml-auto font-mono text-fg/60 font-medium">
                      {play.awayScore != null && play.homeScore != null
                        ? `${play.awayScore}  –  ${play.homeScore}` : ''}
                    </span>
                  </div>
                  <p className="text-sm text-fg/70 leading-snug mt-0.5 line-clamp-2">
                    {play.text || play.description || ''}
                  </p>
                  {/* Debug: show raw ESPN coordinates for each play (green = has coords, red = none) */}
                  {showDebug && (
                    <p className="text-xs font-mono mt-0.5" style={{ color: play.coordinate ? '#00ff99' : '#ff6666' }}>
                      {play.coordinate
                        ? `ESPN (${play.coordinate.x}, ${play.coordinate.y})`
                        : 'no coords'}
                    </p>
                  )}
                </div>
              </button>
            );
          })}
          </div>
        </div>
    </div>
  );
}

function PeriodTab({ active, onClick, label }) {
  return (
    <button onClick={onClick}
      className={`px-3 py-1.5 text-sm font-medium rounded transition-colors ${
        active
          ? 'bg-fg/15 text-fg/90'
          : 'bg-fg/5 text-fg/40 hover:bg-fg/10 hover:text-fg/60'
      }`}
    >{label}</button>
  );
}
