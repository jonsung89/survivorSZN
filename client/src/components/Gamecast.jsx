import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import BasketballCourt, { espnToSvg, espnToSvgFar, nudgeThreePointer } from './BasketballCourt';
import { usePlayerGameStats, getPlayLabel } from '../hooks/usePlayerGameStats';
import { useTheme } from '../context/ThemeContext';

/** ESPN dark logo: replace /500/ with /500-dark/ in the URL */
function getDarkLogo(logoUrl) {
  if (!logoUrl) return logoUrl;
  return logoUrl.replace('/500/', '/500-dark/');
}

/**
 * Gamecast — live play-by-play feed overlaid on a full basketball court.
 *
 * ESPN coordinates are half-court (x 0-50, y 0-25, 0=baseline).
 * We map each team's plays to opposite ends of the full court:
 *   homeTeam → near (right) half via espnToSvg
 *   awayTeam → far (left) half via espnToSvgFar
 */

// ESPN type IDs for play classification
const REBOUND_IDS = new Set(['155', '156']);
const FOUL_IDS = new Set(['42', '43', '44', '45']);
const TURNOVER_IDS = new Set(['62', '63', '84', '86', '90']);
const END_PERIOD_ID = '412';
const TIMEOUT_ID = '16';
const SUBSTITUTION_ID = '18';

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
    const isOff = playText.includes('offensive') || (!playText.includes('defensive') && tid === '155');
    let statLine = '';
    if (s) {
      const detail = isOff ? `${s.offRebounds} OREB` : `${s.defRebounds} DREB`;
      statLine = `${s.rebounds} REB · ${detail}`;
    }
    return { text: 'REBOUND', subtext: displayName, stat: statLine, color: '#fbbf24', persistent: false, logo: teamLogo };
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

/** Render a stat label below (or above) a court marker */
function StatLabel({ pt, play, playerStats, r, color: teamBg }) {
  const label = getPlayLabel(play, playerStats);
  if (!label) return null;

  const flipAbove = pt.y + r + 58 > 480;
  const labelY = flipAbove ? pt.y - r - 50 : pt.y + r + 8;
  // Clamp x so label stays within court (0-940)
  const labelX = Math.max(50, Math.min(890, pt.x));

  return (
    <g>
      <rect x={labelX - 50} y={labelY} width={100} height={48}
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

export default function Gamecast({ plays = [], game, courtType = 'nba', isPaused = false }) {
  const [selectedPlayIdx, setSelectedPlayIdx] = useState(null);
  const [periodFilter, setPeriodFilter] = useState('all');
  const [banner, setBanner] = useState(null);
  const feedRef = useRef(null);
  const prevPlaysLength = useRef(plays.length);
  const { isDark } = useTheme();

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

  /** Map a play's ESPN coords to the correct half of the full court */
  const mapPlay = useCallback(
    (play) => {
      if (!play.coordinate) return null;
      let { x, y } = play.coordinate;
      // ESPN uses (25,0) as a sentinel for free throws — place behind the FT line (15ft from baseline)
      if (x === 25 && y === 0) { x = 25; y = 20; }
      const isNear = play.team?.id === homeTeam?.id;
      let pt = isNear ? espnToSvg(x, y) : espnToSvgFar(x, y);
      if (pt && (play.text || '').toLowerCase().includes('three point')) {
        pt = nudgeThreePointer(pt, courtType, isNear);
      }
      return pt;
    },
    [homeTeam, courtType],
  );

  const reversedPlays = useMemo(() => [...plays].reverse(), [plays]);

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

  const filteredPlays = useMemo(
    () =>
      periodFilter === 'all'
        ? reversedPlays
        : reversedPlays.filter(
            (p) => String(p.period?.number) === String(periodFilter),
          ),
    [reversedPlays, periodFilter],
  );

  const mostRecentShot = useMemo(() => {
    const latest = reversedPlays[0];
    if (latest?.shootingPlay && mapPlay(latest)) return latest;
    return null;
  }, [reversedPlays, mapPlay]);



  const highlightedPlay = useMemo(() => {
    if (selectedPlayIdx == null) return null;
    const play = filteredPlays[selectedPlayIdx];
    if (play && mapPlay(play)) return play;
    return null;
  }, [selectedPlayIdx, filteredPlays, mapPlay]);

  // Auto-scroll feed on new plays
  useEffect(() => {
    if (plays.length > prevPlaysLength.current && feedRef.current) {
      feedRef.current.scrollTop = 0;
    }
    prevPlaysLength.current = plays.length;
  }, [plays.length]);

  // Banner system — persists until next play update
  useEffect(() => {
    // Determine banner from isPaused state or latest play
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
    } else if (reversedPlays.length > 0) {
      // Check for consecutive substitutions at the top of the feed
      const consecutiveSubs = [];
      for (const p of reversedPlays) {
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
        newBanner = classifyBanner(reversedPlays[0], homeTeam, awayTeam, playerStats);
      }
    }

    if (!newBanner) {
      setBanner(null);
      return;
    }

    setBanner({ ...newBanner, key: `${plays.length}-${isPaused}` });
  }, [plays.length, isPaused, game?.status]);

  return (
    <div className="relative">
      {/* Event banner — fixed height slot above court (hidden when game is final) */}
      <div className={`${isFinal ? '' : 'min-h-[52px]'} mb-1 flex items-center justify-center`}>
        {banner && (
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
      `}</style>

      {/* Full-width court */}
      <BasketballCourt courtType={courtType} homeLogo={homeTeam?.logo} homeColor={homeTeam?.color}>
        <style>{`
          @keyframes shotPulse {
            0%, 100% { r: 8; opacity: 1; }
            50% { r: 14; opacity: 0.55; }
          }
          @keyframes ringPulse {
            0% { r: 30; opacity: 0.7; stroke-width: 4; }
            100% { r: 46; opacity: 0; stroke-width: 1; }
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

        {/* Most recent shot — pulsing marker */}
        {mostRecentShot && !highlightedPlay && (() => {
          const pt = mapPlay(mostRecentShot);
          if (!pt) return null;
          const color = teamColor(mostRecentShot.team?.id);
          const headshot = mostRecentShot.participants?.[0]?.headshot;
          const r = 28;
          if (headshot) {
            return (
              <>
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
                <StatLabel pt={pt} play={mostRecentShot} playerStats={playerStats} r={r} color={color} />
              </>
            );
          }
          return (
            <>
              <circle cx={pt.x} cy={pt.y} r="8"
                fill={color} opacity={isPaused ? 0.5 : 0.9}
                stroke="white" strokeWidth="1.5"
                style={isPaused ? {} : { animation: 'shotPulse 2s ease-in-out infinite' }} />
              <StatLabel pt={pt} play={mostRecentShot} playerStats={playerStats} r={8} color={color} />
            </>
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
        </div>

        {/* Scrollable feed */}
        <div ref={feedRef}
          className="flex-1 overflow-y-auto max-h-[250px] space-y-0.5 rounded-lg"
          style={{ background: 'rgba(var(--color-surface, 255 255 255), 0.03)' }}
        >
          {filteredPlays.length === 0 && (
            <div className="text-center text-fg/30 text-xs py-6">No plays yet</div>
          )}
          {filteredPlays.map((play, i) => {
            const isSelected = selectedPlayIdx === i;
            const color = teamColor(play.team?.id);
            const hasCoords = !!mapPlay(play);

            return (
              <button key={`play-${i}`}
                onClick={() => { if (hasCoords) setSelectedPlayIdx(isSelected ? null : i); }}
                className={`w-full text-left flex items-start gap-2 px-3 py-2 rounded transition-colors ${
                  hasCoords ? 'cursor-pointer hover:bg-fg/5' : 'cursor-default'
                } ${isSelected ? 'bg-fg/8' : ''}`}
                style={play.scoringPlay
                  ? { borderLeft: '2px solid rgba(34,197,94,0.5)' }
                  : { borderLeft: '2px solid transparent' }}
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
