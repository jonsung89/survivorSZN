import { Trophy } from 'lucide-react';

const ROUND_LABELS = ['R64', 'R32', 'S16', 'E8', 'F4', 'CHAMP'];

export default function BracketLeaderboard({ leaderboard, currentUserId, scoringSystem, onBracketClick }) {
  if (!leaderboard || leaderboard.length === 0) {
    return (
      <div className="text-center py-12 text-fg/40">
        <p>No submitted brackets yet</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-fg/10">
            <th className="text-left py-2 px-2 text-fg/40 text-xs font-medium w-10">#</th>
            <th className="text-left py-2 px-2 text-fg/40 text-xs font-medium">Player</th>
            <th className="text-left py-2 px-2 text-fg/40 text-xs font-medium hidden sm:table-cell">Bracket</th>
            {ROUND_LABELS.map(label => (
              <th key={label} className="text-center py-2 px-1 text-fg/40 text-xs font-medium hidden md:table-cell w-12">
                {label}
              </th>
            ))}
            <th className="text-center py-2 px-2 text-fg/40 text-xs font-medium w-16">Total</th>
            <th className="text-center py-2 px-2 text-fg/40 text-xs font-medium w-16 hidden sm:table-cell">Poss.</th>
          </tr>
        </thead>
        <tbody>
          {leaderboard.map((entry) => {
            const isMe = entry.userId === currentUserId;
            return (
              <tr
                key={entry.bracketId}
                className={`border-b border-fg/5 transition-colors cursor-pointer hover:bg-fg/5 ${isMe ? 'bg-violet-500/8 border-l-2 border-l-violet-500' : ''}`}
                onClick={() => onBracketClick?.(entry.bracketId)}
              >
                {/* Rank */}
                <td className="py-2.5 px-2">
                  {entry.rank === 1 ? (
                    <Trophy className="w-4 h-4 text-amber-400" />
                  ) : (
                    <span className={`text-sm font-mono font-bold ${
                      entry.rank === 2 ? 'text-fg/50' :
                      entry.rank === 3 ? 'text-orange-400/70' :
                      'text-fg/30'
                    }`}>
                      {entry.rank}
                    </span>
                  )}
                </td>

                {/* Player */}
                <td className="py-2.5 px-2">
                  <span className={`font-medium ${isMe ? 'text-violet-400' : 'text-fg/80'}`}>
                    {entry.displayName || 'Anonymous'}
                  </span>
                  {isMe && <span className="text-xs text-violet-400/60 ml-1">(you)</span>}
                </td>

                {/* Bracket name */}
                <td className="py-2.5 px-2 text-fg/40 hidden sm:table-cell">
                  {entry.bracketName}
                </td>

                {/* Round scores */}
                {ROUND_LABELS.map((label, idx) => (
                  <td key={label} className="text-center py-2.5 px-1 hidden md:table-cell">
                    <span className={`text-sm font-mono ${
                      (entry.roundScores?.[idx] || 0) > 0 ? 'text-fg/60' : 'text-fg/20'
                    }`}>
                      {entry.roundScores?.[idx] || 0}
                    </span>
                  </td>
                ))}

                {/* Total */}
                <td className="text-center py-2.5 px-2">
                  <span className="text-sm font-mono font-bold text-fg">{entry.totalScore}</span>
                </td>

                {/* Possible */}
                <td className="text-center py-2.5 px-2 hidden sm:table-cell">
                  <span className="text-xs font-mono text-fg/40">{entry.potentialPoints}</span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
