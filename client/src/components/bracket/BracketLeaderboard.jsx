import { useState, Fragment } from 'react';
import { Trophy, ChevronDown, Eye } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import { getThemedLogo } from '../../utils/logo';
import FinalFourPreviewDialog from './FinalFourPreviewDialog';

const ROUND_LABELS = ['R64', 'R32', 'S16', 'E8', 'F4', 'CHAMP'];

export default function BracketLeaderboard({ leaderboard, currentUserId, leagueId, scoringSystem, tournamentStarted, tournamentData, eliminatedTeamIds, onBracketClick }) {
  const [expandedRow, setExpandedRow] = useState(null);
  const [previewEntry, setPreviewEntry] = useState(null);
  const { isDark } = useTheme();

  if (!leaderboard || leaderboard.length === 0) {
    return (
      <div className="text-center py-12 text-fg/50">
        <p>No submitted brackets yet</p>
      </div>
    );
  }

  // Hide rankings if every entry has 0 total points
  const allZero = leaderboard.every(entry => entry.totalScore === 0);

  // Find the latest round with any points scored (for mobile display)
  const currentRoundIdx = (() => {
    for (let r = ROUND_LABELS.length - 1; r >= 0; r--) {
      if (leaderboard.some(e => (e.roundScores?.[r] || 0) > 0)) return r;
    }
    return 0;
  })();

  const handleRowClick = (entry) => {
    if (entry.userId === currentUserId || tournamentStarted) {
      onBracketClick?.(entry.bracketId);
    }
  };

  const toggleExpand = (e, bracketId) => {
    e.stopPropagation();
    setExpandedRow(prev => prev === bracketId ? null : bracketId);
  };

  const handleChampionClick = (e, entry) => {
    e.stopPropagation();
    if (tournamentStarted || entry.userId === currentUserId) {
      setPreviewEntry(entry);
    }
  };

  const getChampionTeam = (entry) => {
    if (!entry.championTeamId || !tournamentData?.teams) return null;
    return tournamentData.teams[entry.championTeamId] || null;
  };

  const colCount = 5; // #, Player, current round, Total, Poss.

  return (
    <div>
      <table className="w-full text-sm sm:text-base">
        <thead>
          <tr className="border-b border-fg/10">
            <th className="text-left py-3 px-2 text-fg/60 text-sm font-medium w-10">#</th>
            <th className="text-left py-3 px-2 text-fg/60 text-sm font-medium">Player</th>
            <th className="text-center py-3 px-1 text-fg/60 text-sm font-medium w-12">
              {ROUND_LABELS[currentRoundIdx]}
            </th>
            <th className="text-center py-3 px-2 text-fg/60 text-sm font-medium w-14">Total</th>
            <th className="text-center py-3 px-1 text-fg/60 text-sm font-medium w-14">Poss.</th>
          </tr>
        </thead>
        <tbody>
          {leaderboard.map((entry) => {
            const isMe = entry.userId === currentUserId;
            const clickable = isMe || tournamentStarted;
            const isExpanded = expandedRow === entry.bracketId;
            const champTeam = getChampionTeam(entry);

            return (
              <Fragment key={entry.bracketId}>
                <tr
                  className={`border-b border-fg/5 transition-colors ${clickable ? 'cursor-pointer hover:bg-fg/5' : ''} ${isMe ? 'bg-violet-500/8 border-l-2 border-l-violet-500' : ''} ${isExpanded ? '!border-b-0' : ''}`}
                >
                  {/* Rank */}
                  <td className="py-3 px-2" onClick={() => handleRowClick(entry)}>
                    {allZero ? (
                      <span className="font-mono text-fg/40">—</span>
                    ) : entry.rank === 1 ? (
                      <Trophy className="w-4 h-4 text-amber-400" />
                    ) : (
                      <span className={`font-mono font-bold ${
                        entry.rank === 2 ? 'text-fg/70' :
                        entry.rank === 3 ? 'text-orange-400' :
                        'text-fg/60'
                      }`}>
                        {entry.rank}
                      </span>
                    )}
                  </td>

                  {/* Player */}
                  <td className="py-3 px-2" onClick={() => handleRowClick(entry)}>
                    <div className="flex items-center gap-1.5 whitespace-nowrap">
                      <span className={`font-medium truncate ${isMe ? (isDark ? 'text-violet-400' : 'text-violet-600') : 'text-fg'}`}>
                        {entry.displayName || 'Anonymous'}
                      </span>
                      {isMe && <span className="text-sm flex-shrink-0" style={{ color: isDark ? 'rgba(167,139,250,0.6)' : 'rgba(109,40,217,0.5)' }}>(you)</span>}
                      {/* Champion logo or eye icon */}
                      {(tournamentStarted || isMe) && (
                        champTeam?.logo ? (
                          <button
                            onClick={(e) => handleChampionClick(e, entry)}
                            className="flex-shrink-0 hover:opacity-75 transition-opacity"
                            title={`${entry.displayName}'s champion: ${champTeam.name}`}
                          >
                            <img
                              src={getThemedLogo(champTeam.logo, isDark)}
                              alt={champTeam.name}
                              className="w-5 h-5 object-contain"
                            />
                          </button>
                        ) : (
                          <button
                            onClick={(e) => { e.stopPropagation(); onBracketClick?.(entry.bracketId); }}
                            className="p-0.5 rounded text-fg/30 hover:text-violet-400 transition-colors flex-shrink-0"
                            title={`View ${isMe ? 'your' : entry.displayName + "'s"} bracket`}
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                        )
                      )}
                    </div>
                  </td>

                  {/* Current round score */}
                  <td className="text-center py-3 px-1" onClick={() => handleRowClick(entry)}>
                    <span className={`font-mono ${
                      (entry.roundScores?.[currentRoundIdx] || 0) > 0 ? 'text-fg/80' : 'text-fg/40'
                    }`}>
                      {entry.roundScores?.[currentRoundIdx] || 0}
                    </span>
                  </td>

                  {/* Total with expand toggle */}
                  <td className="text-center py-3 px-2">
                    <button
                      onClick={(e) => toggleExpand(e, entry.bracketId)}
                      className="inline-flex items-center gap-0.5 font-mono font-bold text-fg"
                    >
                      {entry.totalScore}
                      <ChevronDown className={`w-3.5 h-3.5 text-fg/40 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                    </button>
                  </td>

                  {/* Possible points */}
                  <td className="text-center py-3 px-1" onClick={() => handleRowClick(entry)}>
                    <span className="font-mono text-fg/50">{entry.potentialPoints}</span>
                  </td>
                </tr>

                {/* Expanded breakdown row */}
                {isExpanded && (
                  <tr className="border-b border-fg/5">
                    <td colSpan={colCount} className="px-4 pb-3 pt-1">
                      <div className="bg-fg/[0.04] rounded-lg px-3.5 py-2.5 space-y-2">
                        {ROUND_LABELS.map((label, idx) => (
                          <div key={label} className="flex justify-between">
                            <span className="text-fg/60 text-base">{label}</span>
                            <span className={`font-mono text-base ${
                              (entry.roundScores?.[idx] || 0) > 0 ? 'text-fg/80 font-semibold' : 'text-fg/40'
                            }`}>
                              {entry.roundScores?.[idx] || 0}
                            </span>
                          </div>
                        ))}
                        <div className="flex justify-between border-t border-fg/10 pt-2 mt-2">
                          <span className="text-fg/60 text-base font-medium">Possible</span>
                          <span className="font-mono text-base font-medium text-fg/60">{entry.potentialPoints}</span>
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>

      {/* Final Four Preview Dialog */}
      {previewEntry && (
        <FinalFourPreviewDialog
          entry={previewEntry}
          tournamentData={tournamentData}
          eliminatedTeamIds={eliminatedTeamIds || []}
          currentUserId={currentUserId}
          leagueId={leagueId}
          onBracketClick={(bracketId) => {
            setPreviewEntry(null);
            onBracketClick?.(bracketId);
          }}
          onClose={() => setPreviewEntry(null)}
        />
      )}
    </div>
  );
}
