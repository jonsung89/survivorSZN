import { useTheme } from '../../context/ThemeContext';

const ROUND_SHORT_NAMES = ['R64', 'R32', 'S16', 'E8', 'F4', 'CHAMP'];

export default function BracketScoreHeader({ roundScores, totalScore, potentialPoints, scoringSystem, correctPicks, totalDecided }) {
  const { isDark } = useTheme();

  return (
    <div className={`rounded-xl p-3.5 sm:p-4 ${isDark ? 'bg-fg/[0.06] border border-fg/10' : 'bg-white border border-gray-200 shadow-sm'}`}>
      <div className="flex items-center justify-between mb-3">
        <div>
          <span className="text-3xl font-display font-bold text-fg">{totalScore}</span>
          <span className={`text-base ml-2 ${isDark ? 'text-fg/50' : 'text-gray-500'}`}>pts</span>
        </div>
        <div className="text-right">
          <div className={`text-sm font-medium ${isDark ? 'text-fg/60' : 'text-gray-600'}`}>{correctPicks || 0}/{totalDecided || 0} correct</div>
          {potentialPoints !== undefined && (
            <div className={`text-sm ${isDark ? 'text-fg/45' : 'text-gray-500'}`}>{potentialPoints} pts possible</div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-6 gap-1.5">
        {ROUND_SHORT_NAMES.map((name, idx) => {
          const score = roundScores?.[idx] || 0;
          const maxForRound = scoringSystem?.[idx] || 0;
          const gamesInRound = [32, 16, 8, 4, 2, 1][idx];
          const maxPossible = maxForRound * gamesInRound;

          return (
            <div key={name} className="text-center">
              <div className={`text-sm font-medium mb-1 ${isDark ? 'text-fg/50' : 'text-gray-500'}`}>{name}</div>
              <div className={`text-base font-semibold py-0.5 rounded ${score > 0 ? 'text-rank-good' : (isDark ? 'text-fg/30' : 'text-gray-400')}`}>
                {score}
              </div>
              <div className={`text-sm mt-0.5 ${isDark ? 'text-fg/30' : 'text-gray-400'}`}>/{maxPossible}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
