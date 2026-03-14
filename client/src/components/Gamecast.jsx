import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import BasketballCourt, { espnToSvg, espnToSvgFar } from './BasketballCourt';

/**
 * Gamecast — live play-by-play feed overlaid on a full basketball court.
 *
 * ESPN coordinates are half-court (x 0-50, y 0-25, 0=baseline).
 * We map each team's plays to opposite ends of the full court:
 *   homeTeam → near (right) half via espnToSvg
 *   awayTeam → far (left) half via espnToSvgFar
 */

const RECENT_SHOT_COUNT = 10;

export default function Gamecast({ plays = [], game, courtType = 'nba', isPaused = false }) {
  const [selectedPlayIdx, setSelectedPlayIdx] = useState(null);
  const [periodFilter, setPeriodFilter] = useState('all');
  const feedRef = useRef(null);
  const prevPlaysLength = useRef(plays.length);

  const homeTeam = game?.homeTeam;
  const awayTeam = game?.awayTeam;

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
      const { x, y } = play.coordinate;
      if (x === 25 && y === 0) return null; // free throw sentinel
      if (play.team?.id === homeTeam?.id) return espnToSvg(x, y);
      return espnToSvgFar(x, y);
    },
    [homeTeam],
  );

  const reversedPlays = useMemo(() => [...plays].reverse(), [plays]);

  const periods = useMemo(() => {
    const set = new Set();
    for (const p of plays) {
      if (p.period?.number) set.add(p.period.number);
    }
    return Array.from(set).sort((a, b) => a - b);
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
    for (const p of reversedPlays) {
      if (p.shootingPlay && mapPlay(p)) return p;
    }
    return null;
  }, [reversedPlays, mapPlay]);

  const recentShots = useMemo(() => {
    const results = [];
    let skippedFirst = false;
    for (const p of reversedPlays) {
      if (p.shootingPlay && mapPlay(p)) {
        if (!skippedFirst) { skippedFirst = true; continue; }
        results.push(p);
        if (results.length >= RECENT_SHOT_COUNT) break;
      }
    }
    return results;
  }, [reversedPlays, mapPlay]);

  const highlightedPlay = useMemo(() => {
    if (selectedPlayIdx == null) return null;
    const play = filteredPlays[selectedPlayIdx];
    if (play && mapPlay(play)) return play;
    return null;
  }, [selectedPlayIdx, filteredPlays, mapPlay]);

  useEffect(() => {
    if (plays.length > prevPlaysLength.current && feedRef.current) {
      feedRef.current.scrollTop = 0;
    }
    prevPlaysLength.current = plays.length;
  }, [plays.length]);

  return (
    <div className="relative">
      {/* Full-width court */}
      <BasketballCourt courtType={courtType} homeLogo={homeTeam?.logo}>
        <style>{`
          @keyframes shotPulse {
            0%, 100% { r: 8; opacity: 1; }
            50% { r: 14; opacity: 0.55; }
          }
        `}</style>

        {/* Recent faded shots */}
        {recentShots.map((play, i) => {
          const pt = mapPlay(play);
          if (!pt) return null;
          const color = teamColor(play.team?.id);
          const opacity = 0.15 + (1 - i / RECENT_SHOT_COUNT) * 0.25;
          return (
            <circle key={`recent-${i}`}
              cx={pt.x} cy={pt.y} r="5"
              fill={color} opacity={opacity} />
          );
        })}

        {/* Highlighted play from feed click */}
        {highlightedPlay && (() => {
          const pt = mapPlay(highlightedPlay);
          if (!pt) return null;
          const color = teamColor(highlightedPlay.team?.id);
          return (
            <>
              <circle cx={pt.x} cy={pt.y} r="18"
                fill={color} opacity="0.15" />
              <circle cx={pt.x} cy={pt.y} r="7"
                fill={color} stroke="white" strokeWidth="1.5" />
            </>
          );
        })()}

        {/* Most recent shot — pulsing marker */}
        {mostRecentShot && !highlightedPlay && (() => {
          const pt = mapPlay(mostRecentShot);
          if (!pt) return null;
          const color = teamColor(mostRecentShot.team?.id);
          return (
            <circle cx={pt.x} cy={pt.y} r="8"
              fill={color} opacity={isPaused ? 0.5 : 0.9}
              stroke="white" strokeWidth="1.5"
              style={isPaused ? {} : { animation: 'shotPulse 2s ease-in-out infinite' }} />
          );
        })()}

        {/* Pause overlay */}
        {isPaused && (
          <text x="470" y="250"
            textAnchor="middle" dominantBaseline="middle"
            fill="rgba(255,255,255,0.2)"
            fontSize="24" fontWeight="600" letterSpacing="4"
          >
            {game?.status === 'STATUS_HALFTIME' ? 'HALFTIME'
              : game?.status === 'STATUS_END_PERIOD' ? 'END OF PERIOD'
              : 'TIMEOUT'}
          </text>
        )}
      </BasketballCourt>

      {/* Play-by-play feed — overlaid on the court */}
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
              label={num <= 4 ? `Q${num}` : `OT${num - 4}`}
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
                <span className="mt-1.5 flex-shrink-0 w-2 h-2 rounded-full"
                  style={{ backgroundColor: color }} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 text-[10px] text-fg/40">
                    <span>
                      {play.period?.number
                        ? play.period.number <= 4 ? `Q${play.period.number}` : `OT${play.period.number - 4}`
                        : ''}
                    </span>
                    <span>{play.clock?.displayValue || ''}</span>
                    <span className="ml-auto font-mono text-fg/50">
                      {play.awayScore != null && play.homeScore != null
                        ? `${play.awayScore} - ${play.homeScore}` : ''}
                    </span>
                  </div>
                  <p className="text-xs text-fg/70 leading-snug mt-0.5 line-clamp-2">
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
      className={`px-2.5 py-1 text-[11px] font-medium rounded transition-colors ${
        active
          ? 'bg-fg/15 text-fg/90'
          : 'bg-fg/5 text-fg/40 hover:bg-fg/10 hover:text-fg/60'
      }`}
    >{label}</button>
  );
}
