import { ROUND_BOUNDARIES } from '../../utils/bracketSlots';

const ROUND_SHORT_NAMES = ['R64', 'R32', 'S16', 'E8', 'F4', 'CHAMP'];

export default function BracketScoreHeader({ roundScores, totalScore, potentialPoints, scoringSystem, correctPicks, totalDecided }) {
  return (
    <div className="bg-fg/5 border border-fg/10 rounded-xl p-3 sm:p-4">
      <div className="flex items-center justify-between mb-3">
        <div>
          <span className="text-2xl font-display font-bold text-fg">{totalScore}</span>
          <span className="text-fg/40 text-sm ml-2">pts</span>
        </div>
        <div className="text-right text-sm">
          <div className="text-fg/50">{correctPicks || 0}/{totalDecided || 0} correct</div>
          {potentialPoints !== undefined && (
            <div className="text-fg/40 text-sm">{potentialPoints} pts possible</div>
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
              <div className="text-xs text-fg/40 mb-1">{name}</div>
              <div className={`text-sm font-mono font-medium py-0.5 rounded ${score > 0 ? 'text-rank-good' : 'text-fg/30'}`}>
                {score}
              </div>
              <div className="text-[11px] text-fg/25 mt-0.5">/{maxPossible}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
