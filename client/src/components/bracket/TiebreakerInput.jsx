import { useState, useEffect } from 'react';
import { Trophy } from 'lucide-react';
import { getChildSlots } from '../../utils/bracketSlots';

export default function TiebreakerInput({ type, value, onChange, disabled, picks, tournamentData }) {
  if (type !== 'total_score') return null;

  // Get the two championship teams from picks (slot 63's children are slots 61, 62)
  const children = getChildSlots(63); // [61, 62]
  const team1Id = children ? (picks?.[children[0]] || picks?.[String(children[0])]) : null;
  const team2Id = children ? (picks?.[children[1]] || picks?.[String(children[1])]) : null;
  const team1 = team1Id ? tournamentData?.teams?.[team1Id] : null;
  const team2 = team2Id ? tournamentData?.teams?.[team2Id] : null;

  // The championship winner is picks[63]
  const winnerId = picks?.[63] || picks?.['63'];

  const [score1, setScore1] = useState('');
  const [score2, setScore2] = useState('');

  useEffect(() => {
    if (value && !score1 && !score2) {
      const half = Math.floor(value / 2);
      setScore1(String(half + (value % 2)));
      setScore2(String(half));
    }
  }, [value]);

  const handleScoreChange = (which, val) => {
    const numVal = val === '' ? '' : val;
    let s1 = which === 1 ? numVal : score1;
    let s2 = which === 2 ? numVal : score2;

    if (which === 1) setScore1(s1);
    else setScore2(s2);

    const n1 = parseInt(s1) || 0;
    const n2 = parseInt(s2) || 0;
    if (n1 > 0 && n2 > 0) {
      onChange(n1 + n2);
    } else {
      onChange(null);
    }
  };

  const hasTeams = team1 && team2;
  const total = (parseInt(score1) || 0) + (parseInt(score2) || 0);
  const showTotal = parseInt(score1) > 0 && parseInt(score2) > 0;

  return (
    <div className="bg-gradient-to-b from-amber-400/[0.08] to-amber-400/[0.03] border border-amber-400/20 rounded-xl overflow-hidden">
      {/* Header */}
      <div className="px-4 pt-3 pb-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Trophy className="w-3.5 h-3.5 text-amber-400" />
          <span className="text-xs font-semibold text-amber-400/80 uppercase tracking-wider">Championship Tiebreaker</span>
        </div>
        {showTotal && (
          <span className="text-xs text-fg/50">
            Total: <span className="font-mono font-semibold text-amber-400">{total}</span>
          </span>
        )}
      </div>

      {/* Scoreboard */}
      <div className="px-4 pb-4">
        {hasTeams ? (
          <div className="flex flex-col gap-2">
            {/* Team 1 */}
            <div className="flex-1 flex items-center gap-3 bg-fg/[0.06] rounded-lg px-3 py-2.5 border border-fg/10">
              <div className="flex items-center gap-2 flex-1 min-w-0">
                {team1.logo ? (
                  <img src={team1.logo} alt="" className="w-7 h-7 object-contain flex-shrink-0" />
                ) : (
                  <div className="w-7 h-7 rounded-full bg-fg/10 flex-shrink-0" />
                )}
                <div className="min-w-0">
                  <span className="text-sm font-semibold text-fg truncate block">
                    {team1.shortName || team1.abbreviation}
                  </span>
                  {String(winnerId) === String(team1Id) && (
                    <span className="text-[9px] font-bold text-amber-400">WINNER</span>
                  )}
                </div>
              </div>
              <input
                type="number"
                min="0"
                max="200"
                value={score1}
                onChange={e => handleScoreChange(1, e.target.value)}
                placeholder="0"
                disabled={disabled}
                className="w-14 bg-surface border border-fg/10 rounded-md px-1 py-2 text-center text-xl font-mono font-bold text-fg placeholder:text-fg/15 focus:outline-none focus:border-amber-400/40 focus:ring-1 focus:ring-amber-400/20 disabled:opacity-40"
              />
            </div>



            {/* Team 2 */}
            <div className="flex-1 flex items-center gap-3 bg-fg/[0.06] rounded-lg px-3 py-2.5 border border-fg/10">
              <div className="flex items-center gap-2 flex-1 min-w-0">
                {team2.logo ? (
                  <img src={team2.logo} alt="" className="w-7 h-7 object-contain flex-shrink-0" />
                ) : (
                  <div className="w-7 h-7 rounded-full bg-fg/10 flex-shrink-0" />
                )}
                <div className="min-w-0">
                  <span className="text-sm font-semibold text-fg truncate block">
                    {team2.shortName || team2.abbreviation}
                  </span>
                  {String(winnerId) === String(team2Id) && (
                    <span className="text-[9px] font-bold text-amber-400">WINNER</span>
                  )}
                </div>
              </div>
              <input
                type="number"
                min="0"
                max="200"
                value={score2}
                onChange={e => handleScoreChange(2, e.target.value)}
                placeholder="0"
                disabled={disabled}
                className="w-14 bg-surface border border-fg/10 rounded-md px-1 py-2 text-center text-xl font-mono font-bold text-fg placeholder:text-fg/15 focus:outline-none focus:border-amber-400/40 focus:ring-1 focus:ring-amber-400/20 disabled:opacity-40"
              />
            </div>
          </div>
        ) : (
          <p className="text-xs text-fg/30 text-center py-3 italic">
            Complete your Final Four picks to predict the championship score
          </p>
        )}
      </div>
    </div>
  );
}
