import { useState, useEffect } from 'react';
import { Trophy, Pencil, Check } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import { getThemedLogo } from '../../utils/logo';
import { getChildSlots } from '../../utils/bracketSlots';

export default function TiebreakerInput({ type, value, scores, onChange, disabled, picks, tournamentData }) {
  if (type !== 'total_score') return null;

  const { isDark } = useTheme();

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
  const [initialized, setInitialized] = useState(false);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    if (initialized) return;
    if (scores?.score1 != null && scores?.score2 != null) {
      setScore1(String(scores.score1));
      setScore2(String(scores.score2));
      setInitialized(true);
    } else if (value && !score1 && !score2) {
      const half = Math.floor(value / 2);
      setScore1(String(half + (value % 2)));
      setScore2(String(half));
      setInitialized(true);
    }
  }, [value, scores]);

  const handleSave = () => {
    const n1 = parseInt(score1) || 0;
    const n2 = parseInt(score2) || 0;
    if (n1 > 0 && n2 > 0) {
      onChange(n1 + n2, { score1: n1, score2: n2 });
    }
    setEditing(false);
  };

  const handleScoreChange = (which, val) => {
    if (which === 1) setScore1(val);
    else setScore2(val);
  };

  const hasTeams = team1 && team2;
  const total = (parseInt(score1) || 0) + (parseInt(score2) || 0);
  const hasValidTotal = parseInt(score1) > 0 && parseInt(score2) > 0;

  return (
    <div className={`rounded-xl overflow-hidden border ${isDark ? 'border-fg/10 bg-fg/[0.04]' : 'border-gray-200 bg-gray-50'}`}>
      {/* Header */}
      <div className="px-4 pt-3.5 pb-2.5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Trophy className="w-4 h-4 text-amber-500" />
          <span className={`text-sm font-bold uppercase tracking-wider ${isDark ? 'text-fg/70' : 'text-gray-600'}`}>
            Championship Tiebreaker
          </span>
        </div>
        {hasValidTotal && !editing && (
          <span className={`text-base font-mono font-bold ${isDark ? 'text-fg/80' : 'text-gray-700'}`}>
            Total: {total}
          </span>
        )}
      </div>

      {/* Content */}
      <div className="px-4 pb-4">
        {hasTeams ? (
          <>
            {/* Teams display */}
            <div className="flex items-center justify-center gap-4 py-3">
              <TeamBadge team={team1} isWinner={String(winnerId) === String(team1Id)} isDark={isDark} />
              <span className={`text-base font-semibold ${isDark ? 'text-fg/30' : 'text-gray-400'}`}>vs</span>
              <TeamBadge team={team2} isWinner={String(winnerId) === String(team2Id)} isDark={isDark} />
            </div>

            {/* Score editing */}
            {editing ? (
              <div className="space-y-3">
                <div className="flex flex-col gap-2">
                  <ScoreRow team={team1} value={score1} onChange={val => handleScoreChange(1, val)} disabled={disabled} isDark={isDark} />
                  <ScoreRow team={team2} value={score2} onChange={val => handleScoreChange(2, val)} disabled={disabled} isDark={isDark} />
                </div>
                <button
                  onClick={handleSave}
                  disabled={!parseInt(score1) || !parseInt(score2)}
                  className={`w-full py-2.5 rounded-lg text-sm font-semibold flex items-center justify-center gap-2 transition-colors ${
                    parseInt(score1) && parseInt(score2)
                      ? isDark ? 'bg-violet-600 hover:bg-violet-500 text-white' : 'bg-violet-600 hover:bg-violet-500 text-white'
                      : 'bg-fg/10 text-fg/30 cursor-not-allowed'
                  }`}
                >
                  <Check className="w-4 h-4" />
                  Save Total Score
                </button>
              </div>
            ) : (
              <button
                onClick={() => !disabled && setEditing(true)}
                disabled={disabled}
                className={`w-full py-2.5 rounded-lg text-sm font-semibold flex items-center justify-center gap-2 transition-colors ${
                  disabled
                    ? 'opacity-40 cursor-not-allowed'
                    : hasValidTotal
                      ? isDark ? 'bg-fg/[0.06] hover:bg-fg/10 text-fg/60' : 'bg-white hover:bg-gray-100 text-gray-500 border border-gray-200'
                      : isDark ? 'bg-violet-600 hover:bg-violet-500 text-white' : 'bg-violet-600 hover:bg-violet-500 text-white'
                }`}
              >
                <Pencil className="w-4 h-4" />
                {hasValidTotal ? 'Edit Total Score' : 'Set Total Score Prediction'}
              </button>
            )}
          </>
        ) : (
          <p className={`text-sm text-center py-4 italic ${isDark ? 'text-fg/30' : 'text-gray-400'}`}>
            Complete your Final Four picks to predict the championship score
          </p>
        )}
      </div>
    </div>
  );
}

function TeamBadge({ team, isWinner, isDark }) {
  if (!team) return null;
  return (
    <div className="flex flex-col items-center gap-1.5">
      {team.logo ? (
        <img src={getThemedLogo(team.logo, isDark)} alt="" className="w-10 h-10 object-contain" />
      ) : (
        <div className="w-10 h-10 rounded-full bg-fg/10" />
      )}
      <span className={`text-sm font-semibold ${isDark ? 'text-fg' : 'text-gray-800'}`}>
        {team.shortName || team.abbreviation}
      </span>
      <span className={`text-sm font-bold ${isWinner ? (isDark ? 'text-amber-400' : 'text-amber-600') : 'invisible'}`}>WINNER</span>
    </div>
  );
}

function ScoreRow({ team, value, onChange, disabled, isDark }) {
  return (
    <div className={`flex items-center gap-3 rounded-lg px-3 py-2.5 ${isDark ? 'bg-fg/[0.06] border border-fg/10' : 'bg-white border border-gray-200'}`}>
      <div className="flex items-center gap-2 flex-1 min-w-0">
        {team.logo ? (
          <img src={getThemedLogo(team.logo, isDark)} alt="" className="w-7 h-7 object-contain flex-shrink-0" />
        ) : (
          <div className="w-7 h-7 rounded-full bg-fg/10 flex-shrink-0" />
        )}
        <span className="text-base font-semibold text-fg truncate">
          {team.shortName || team.abbreviation}
        </span>
      </div>
      <input
        type="number"
        min="0"
        max="200"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder="0"
        disabled={disabled}
        className={`w-16 bg-surface border rounded-md px-2 py-2 text-center text-xl font-mono font-bold text-fg placeholder:text-fg/15 focus:outline-none focus:ring-2 disabled:opacity-40 ${
          isDark ? 'border-fg/10 focus:ring-violet-500/30' : 'border-gray-200 focus:ring-violet-500/30'
        }`}
      />
    </div>
  );
}
