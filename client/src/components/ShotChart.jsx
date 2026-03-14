import { useState, useMemo, useCallback } from 'react';
import BasketballCourt, { espnToSvg, espnToSvgFar, nudgeThreePointer } from './BasketballCourt';

/**
 * ShotChart — plots shooting plays on a full basketball court.
 * Home team shots → near (bottom) half, away team shots → far (top) half.
 */
export default function ShotChart({ plays = [], game, courtType = 'nba' }) {
  const [teamFilter, setTeamFilter] = useState('all');

  const homeTeam = game?.homeTeam;
  const awayTeam = game?.awayTeam;

  const teamColor = (teamId) => {
    if (teamId === homeTeam?.id) return homeTeam?.color || '#3b82f6';
    if (teamId === awayTeam?.id) return awayTeam?.color || '#ef4444';
    return '#888';
  };

  /** Map a play to the correct half of the full court */
  const mapPlay = useCallback(
    (play) => {
      if (!play.coordinate) return null;
      const { x, y } = play.coordinate;
      if (x === 25 && y === 0) return null; // FT sentinel
      const isNear = play.team?.id === homeTeam?.id;
      let pt = isNear ? espnToSvg(x, y) : espnToSvgFar(x, y);
      if (pt && (play.text || '').toLowerCase().includes('three point')) {
        pt = nudgeThreePointer(pt, courtType, isNear);
      }
      return pt;
    },
    [homeTeam, courtType],
  );

  // Separate field goals from free throws + compute stats by FG/3PT
  const { shots, freeThrows, stats } = useMemo(() => {
    const shots = [];
    const freeThrows = [];
    const emptyStats = () => ({ fgMade: 0, fgAtt: 0, threeMade: 0, threeAtt: 0 });
    const stats = {
      [homeTeam?.id]: emptyStats(),
      [awayTeam?.id]: emptyStats(),
    };

    for (const play of plays) {
      if (!play.shootingPlay) continue;
      const teamId = play.team?.id;
      if (!teamId) continue;

      const isFreeThrow = play.coordinate?.x === 25 && play.coordinate?.y === 0;
      if (isFreeThrow) {
        freeThrows.push(play);
        continue;
      }
      if (!play.coordinate) continue;
      shots.push(play);

      if (stats[teamId]) {
        const isThree = (play.text || '').toLowerCase().includes('three point');
        if (isThree) {
          stats[teamId].threeAtt++;
          if (play.scoringPlay) stats[teamId].threeMade++;
        }
        stats[teamId].fgAtt++;
        if (play.scoringPlay) stats[teamId].fgMade++;
      }
    }
    return { shots, freeThrows, stats };
  }, [plays, homeTeam?.id, awayTeam?.id]);

  const filteredShots = useMemo(
    () => teamFilter === 'all'
      ? shots
      : shots.filter((p) => String(p.team?.id) === String(teamFilter)),
    [shots, teamFilter],
  );

  const filteredFTs = useMemo(
    () => teamFilter === 'all'
      ? freeThrows
      : freeThrows.filter((p) => String(p.team?.id) === String(teamFilter)),
    [freeThrows, teamFilter],
  );

  return (
    <div className="space-y-6">
      {/* Filter buttons */}
      <div className="flex items-center gap-2 flex-wrap mb-4">
        <FilterBtn active={teamFilter === 'all'} onClick={() => setTeamFilter('all')} label="All" />
        {homeTeam && (
          <FilterBtn
            active={String(teamFilter) === String(homeTeam.id)}
            onClick={() => setTeamFilter(homeTeam.id)}
            label={homeTeam.abbreviation || 'Home'}
            color={homeTeam.color}
          />
        )}
        {awayTeam && (
          <FilterBtn
            active={String(teamFilter) === String(awayTeam.id)}
            onClick={() => setTeamFilter(awayTeam.id)}
            label={awayTeam.abbreviation || 'Away'}
            color={awayTeam.color}
          />
        )}
      </div>

      {/* Court with shot markers */}
      <BasketballCourt courtType={courtType} homeLogo={homeTeam?.logo} homeColor={homeTeam?.color}>
        {/* Field goal attempts */}
        {filteredShots.map((play, i) => {
          const pt = mapPlay(play);
          if (!pt) return null;
          const color = teamColor(play.team?.id);

          if (play.scoringPlay) {
            return (
              <circle key={`shot-${i}`}
                cx={pt.x} cy={pt.y} r="8"
                fill={color} fillOpacity="0.9"
                stroke="rgba(255,255,255,0.5)" strokeWidth="1.5" />
            );
          }
          return (
            <g key={`shot-${i}`} opacity="0.55">
              <line x1={pt.x - 6} y1={pt.y - 6} x2={pt.x + 6} y2={pt.y + 6}
                stroke={color} strokeWidth="2.5" strokeLinecap="round" />
              <line x1={pt.x + 6} y1={pt.y - 6} x2={pt.x - 6} y2={pt.y + 6}
                stroke={color} strokeWidth="2.5" strokeLinecap="round" />
            </g>
          );
        })}

        {/* Free throws — spread along each team's FT line */}
        {filteredFTs.map((play, i) => {
          const isHome = play.team?.id === homeTeam?.id;
          // Horizontal layout: near FT at x=750, far FT at x=190, centered on y=250
          const ftX = isHome ? 750 : 190;
          const spread = 50;
          const total = filteredFTs.filter(p => (p.team?.id === homeTeam?.id) === isHome).length;
          const idx = filteredFTs.filter((p, j) => j < i && (p.team?.id === homeTeam?.id) === isHome).length;
          const offset = total <= 1 ? 0 : ((idx / (total - 1)) - 0.5) * spread * 2;
          const y = 250 + offset;
          const color = teamColor(play.team?.id);

          return (
            <circle key={`ft-${i}`}
              cx={ftX} cy={y} r="3"
              fill={play.scoringPlay ? color : 'transparent'}
              stroke={color} strokeWidth="1"
              opacity={play.scoringPlay ? 0.7 : 0.3} />
          );
        })}
      </BasketballCourt>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs text-fg/60 px-1">
        {[homeTeam, awayTeam].filter(Boolean).map((team) => {
          const s = stats[team.id] || { fgMade: 0, fgAtt: 0, threeMade: 0, threeAtt: 0 };
          const fgPct = s.fgAtt > 0 ? Math.round((s.fgMade / s.fgAtt) * 100) : 0;
          const threePct = s.threeAtt > 0 ? Math.round((s.threeMade / s.threeAtt) * 100) : 0;
          const color = teamColor(team.id);
          return (
            <div key={team.id} className="flex items-center gap-1.5">
              <span className="inline-block w-2.5 h-2.5 rounded-full"
                style={{ backgroundColor: color }} />
              <span className="font-medium text-fg/80">{team.abbreviation}</span>
              <span>FG: {s.fgMade}/{s.fgAtt} ({fgPct}%)</span>
              <span className="text-fg/40">|</span>
              <span>3PT: {s.threeMade}/{s.threeAtt} ({threePct}%)</span>
            </div>
          );
        })}
        <div className="flex items-center gap-1.5 ml-auto">
          <svg width="10" height="10" viewBox="0 0 10 10" className="inline">
            <circle cx="5" cy="5" r="4" fill="rgba(255,255,255,0.5)" />
          </svg>
          <span>Make</span>
          <svg width="10" height="10" viewBox="0 0 10 10" className="inline ml-2">
            <line x1="1" y1="1" x2="9" y2="9" stroke="rgba(255,255,255,0.5)" strokeWidth="1.5" />
            <line x1="9" y1="1" x2="1" y2="9" stroke="rgba(255,255,255,0.5)" strokeWidth="1.5" />
          </svg>
          <span>Miss</span>
        </div>
      </div>
    </div>
  );
}

function FilterBtn({ active, onClick, label, color }) {
  return (
    <button onClick={onClick}
      className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
        active
          ? 'bg-fg/15 text-fg/90'
          : 'bg-fg/5 text-fg/50 hover:bg-fg/10 hover:text-fg/70'
      }`}
      style={active && color ? { borderBottom: `2px solid ${color}` } : undefined}
    >{label}</button>
  );
}
