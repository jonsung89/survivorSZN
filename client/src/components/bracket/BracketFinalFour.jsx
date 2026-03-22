import BracketMatchup from './BracketMatchup';
import { getMatchupTeams } from '../../utils/bracketSlots';
import { Trophy } from 'lucide-react';

export default function BracketFinalFour({
  picks,
  results,
  tournamentData,
  onPick,
  onMatchupClick,
  isReadOnly,
  finalFour, // { semifinals: [61, 62], championship: 63, semifinalRegions: [...] }
}) {
  const getTeamsForSlot = (slot) => getMatchupTeams(slot, picks, tournamentData, results);
  const getResultForSlot = (slot) => results?.[slot] || results?.[String(slot)] || null;
  const getPickedTeamForSlot = (slot) => picks?.[slot] || picks?.[String(slot)] || null;

  // Derive slots and labels from finalFour structure
  const leftSemi = finalFour.semifinalRegions[0];
  const rightSemi = finalFour.semifinalRegions[1];
  const champSlot = finalFour.championship;

  const leftLabel = leftSemi.regions.join(' vs ');
  const rightLabel = rightSemi.regions.join(' vs ');

  // Championship winner
  const champPick = getPickedTeamForSlot(champSlot);
  const champTeam = champPick ? (tournamentData?.teams?.[champPick] || { id: champPick }) : null;

  const renderSemifinal = (semi, label) => (
    <div>
      <div className="text-sm text-fg/40 text-center mb-1">{label}</div>
      <BracketMatchup
        slot={semi.slot}
        team1={getTeamsForSlot(semi.slot).team1}
        team2={getTeamsForSlot(semi.slot).team2}
        pickedTeamId={getPickedTeamForSlot(semi.slot)}
        result={getResultForSlot(semi.slot)}
        onPick={(teamId) => onPick?.(semi.slot, teamId)}
        onDetailClick={() => onMatchupClick?.(semi.slot)}
        isReadOnly={isReadOnly}
      />
    </div>
  );

  return (
    <div className="flex flex-col items-center gap-4 px-4">
      {/* Final Four Label */}
      <h3 className="text-base font-display font-bold text-fg/50 uppercase tracking-wider">
        Final Four
      </h3>

      {/* Horizontal on desktop, vertical on mobile */}
      <div className="flex flex-col md:flex-row items-center md:items-end gap-6">
        {/* Left semifinal */}
        {renderSemifinal(leftSemi, leftLabel)}

        {/* Center: Championship + Champion */}
        <div className="flex flex-col items-center gap-4">
          <div>
            <div className="text-sm text-amber-400 font-bold text-center mb-1 flex items-center justify-center gap-1 uppercase tracking-wider">
              <Trophy className="w-4 h-4 text-amber-400" />
              Championship
            </div>
            <BracketMatchup
              slot={champSlot}
              team1={getTeamsForSlot(champSlot).team1}
              team2={getTeamsForSlot(champSlot).team2}
              pickedTeamId={getPickedTeamForSlot(champSlot)}
              result={getResultForSlot(champSlot)}
              onPick={(teamId) => onPick?.(champSlot, teamId)}
              onDetailClick={() => onMatchupClick?.(champSlot)}
              isReadOnly={isReadOnly}
            />
          </div>

          {/* Champion Display */}
          {champTeam && (
            <div className="text-center animate-in">
              <div className="text-sm text-amber-400 font-bold uppercase tracking-wider mb-2">Champion</div>
              <div className="flex flex-col items-center gap-2 px-6 py-4 rounded-xl bg-amber-400/10 border border-amber-400/20 shadow-[0_0_20px_rgba(251,191,36,0.15)] animate-champion-glow">
                <Trophy className="w-6 h-6 text-amber-400" />
                {champTeam.logo && (
                  <img src={champTeam.logo} alt="" className="w-14 h-14 object-contain" />
                )}
                <span className="text-lg font-display font-bold text-fg">
                  {champTeam.name || champTeam.abbreviation || 'Champion'}
                </span>
                {champTeam.seed && (
                  <span className="text-sm text-fg/40">#{champTeam.seed} seed</span>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Right semifinal */}
        {renderSemifinal(rightSemi, rightLabel)}
      </div>
    </div>
  );
}
