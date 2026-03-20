import { useState, useEffect, Fragment } from 'react';
import { Trophy, ChevronDown, Eye } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import { getThemedLogo } from '../../utils/logo';
import { trackingAPI } from '../../api';
import FinalFourPreviewDialog from './FinalFourPreviewDialog';

const ROUND_LABELS = ['R64', 'R32', 'S16', 'E8', 'F4', 'CHAMP'];
const TOOLTIP_KEY = 'survivorszn_champion_logo_tooltip_seen';

export default function BracketLeaderboard({ leaderboard, currentUserId, leagueId, leagueName, scoringSystem, tournamentStarted, tournamentData, eliminatedTeamIds, onBracketClick }) {
  const [expandedRow, setExpandedRow] = useState(null);
  const [previewEntry, setPreviewEntry] = useState(null);
  const [showLogoTooltip, setShowLogoTooltip] = useState(false);
  const { isDark } = useTheme();

  // Show tooltip on first visit if champion logos are visible
  useEffect(() => {
    if (!tournamentStarted) return;
    const seen = localStorage.getItem(TOOLTIP_KEY);
    if (!seen && leaderboard?.some(e => e.championTeamId)) {
      setShowLogoTooltip(true);
      const timer = setTimeout(() => {
        setShowLogoTooltip(false);
        localStorage.setItem(TOOLTIP_KEY, '1');
      }, 4000);
      return () => clearTimeout(timer);
    }
  }, [tournamentStarted, leaderboard]);

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
    const expanding = expandedRow !== entry.bracketId;
    if (expanding) {
      trackingAPI.event('leaderboard_member_expand', {
        leagueId,
        leagueName,
        memberName: entry.displayName,
        bracketId: entry.bracketId,
        score: entry.totalScore,
        rank: entry.rank,
      });
    }
    setExpandedRow(prev => prev === entry.bracketId ? null : entry.bracketId);
  };

  const toggleExpand = (e, bracketId) => {
    e.stopPropagation();
    const expanding = expandedRow !== bracketId;
    if (expanding) {
      const entry = leaderboard.find(e => e.bracketId === bracketId);
      trackingAPI.event('leaderboard_score_expand', {
        leagueId,
        leagueName,
        memberName: entry?.displayName,
        bracketId,
        score: entry?.totalScore,
      });
    }
    setExpandedRow(prev => prev === bracketId ? null : bracketId);
  };

  const handleChampionClick = (e, entry) => {
    e.stopPropagation();
    if (tournamentStarted || entry.userId === currentUserId) {
      trackingAPI.event('bracket_final_four_preview', {
        source: 'leaderboard',
        leagueId,
        leagueName,
        memberName: entry.displayName,
        bracketId: entry.bracketId,
        rank: entry.rank,
      });
      setPreviewEntry(entry);
    }
  };

  const getChampionTeam = (entry) => {
    if (!entry.championTeamId || !tournamentData?.teams) return null;
    return tournamentData.teams[entry.championTeamId] || null;
  };

  const colCount = 6; // #, Player, current round, Total, Poss., Correct

  return (
    <div>
      <table className="w-full text-sm sm:text-base">
        <thead>
          <tr className="border-b border-fg/10">
            <th className="text-left py-3 px-2 text-fg/60 text-sm md:text-base font-medium w-10">#</th>
            <th className="text-left py-3 px-2 text-fg/60 text-sm md:text-base font-medium">Player</th>
            <th className="text-center py-3 px-1 text-fg/60 text-sm md:text-base font-medium w-12">
              {ROUND_LABELS[currentRoundIdx]}
            </th>
            <th className="text-center py-3 px-2 text-fg/60 text-sm md:text-base font-medium w-14">Total</th>
            <th className="text-center py-3 px-1 text-fg/60 text-sm md:text-base font-medium w-14">Poss.</th>
            <th className="text-center py-3 px-1 text-fg/60 text-sm md:text-base font-medium w-16">Correct</th>
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
                      <span className="text-fg/40">—</span>
                    ) : entry.rank === 1 ? (
                      <Trophy className="w-4 h-4 text-amber-400" />
                    ) : (
                      <span className={`font-bold ${
                        entry.rank === 2 ? 'text-fg/70' :
                        entry.rank === 3 ? 'text-orange-400' :
                        'text-fg/60'
                      }`}>
                        {entry.rank}
                      </span>
                    )}
                  </td>

                  {/* Player — tapping name/logo opens Final Four preview */}
                  <td className="py-3 px-2">
                    <div
                      className="flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
                      onClick={(e) => {
                        e.stopPropagation();
                        if ((tournamentStarted || isMe) && champTeam?.logo) {
                          handleChampionClick(e, entry);
                          if (showLogoTooltip) {
                            setShowLogoTooltip(false);
                            localStorage.setItem(TOOLTIP_KEY, '1');
                          }
                        } else {
                          handleRowClick(entry);
                        }
                      }}
                    >
                      <span className={`font-medium truncate ${isMe ? (isDark ? 'text-violet-400' : 'text-violet-600') : 'text-fg'}`}>
                        {entry.displayName || 'Anonymous'}
                      </span>
                      {isMe && <span className="text-sm flex-shrink-0" style={{ color: isDark ? 'rgba(167,139,250,0.6)' : 'rgba(109,40,217,0.5)' }}>(you)</span>}
                      {/* Champion logo */}
                      {(tournamentStarted || isMe) && champTeam?.logo && (
                        <div className="relative flex-shrink-0">
                          <img
                            src={getThemedLogo(champTeam.logo, isDark)}
                            alt={champTeam.name}
                            className="w-5 h-5 object-contain"
                          />
                          {showLogoTooltip && entry.bracketId === leaderboard.find(e => e.championTeamId)?.bracketId && (
                            <div className={`absolute left-1/2 -translate-x-1/2 top-full mt-1.5 px-2.5 py-1 rounded-lg text-xs font-medium whitespace-nowrap z-10 animate-in fade-in shadow-lg ${
                              isDark ? 'bg-white text-gray-800' : 'bg-gray-800 text-white'
                            }`}>
                              Tap to preview picks
                              <div className={`absolute left-1/2 -translate-x-1/2 -top-1 w-2 h-2 rotate-45 ${isDark ? 'bg-white' : 'bg-gray-800'}`} />
                            </div>
                          )}
                        </div>
                      )}
                      {/* Eye icon fallback */}
                      {(tournamentStarted || isMe) && !champTeam?.logo && (
                        <Eye className="w-4 h-4 text-fg/30 flex-shrink-0" />
                      )}
                    </div>
                  </td>

                  {/* Current round score */}
                  <td className="text-center py-3 px-1" onClick={() => handleRowClick(entry)}>
                    <span className={`${
                      (entry.roundScores?.[currentRoundIdx] || 0) > 0 ? 'text-fg/80' : 'text-fg/40'
                    }`}>
                      {entry.roundScores?.[currentRoundIdx] || 0}
                    </span>
                  </td>

                  {/* Total with expand toggle */}
                  <td className="text-center py-3 px-2">
                    <button
                      onClick={(e) => toggleExpand(e, entry.bracketId)}
                      className="inline-flex items-center gap-0.5 font-bold text-fg"
                    >
                      {entry.totalScore}
                      <ChevronDown className={`w-3.5 h-3.5 text-fg/40 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                    </button>
                  </td>

                  {/* Possible points */}
                  <td className="text-center py-3 px-1" onClick={() => handleRowClick(entry)}>
                    <span className="text-fg/50">{entry.potentialPoints}</span>
                  </td>

                  {/* Correct picks */}
                  <td className="text-center py-3 px-1" onClick={() => handleRowClick(entry)}>
                    <span className="text-fg/50">{entry.correctPicks || 0}/{entry.totalDecided || 0}</span>
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
                            <span className={`text-base ${
                              (entry.roundScores?.[idx] || 0) > 0 ? 'text-fg/80 font-semibold' : 'text-fg/40'
                            }`}>
                              {entry.roundScores?.[idx] || 0}
                            </span>
                          </div>
                        ))}
                        <div className="flex justify-between border-t border-fg/10 pt-2 mt-2">
                          <span className="text-fg/60 text-base font-medium">Possible</span>
                          <span className="text-base font-medium text-fg/60">{entry.potentialPoints}</span>
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
