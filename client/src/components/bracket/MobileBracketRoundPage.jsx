import BracketMatchup from './BracketMatchup';
import TiebreakerInput from './TiebreakerInput';
import ChampionCard from './ChampionCard';
import { getMatchupTeams } from '../../utils/bracketSlots';

/**
 * Renders a single round's matchups stacked vertically for mobile.
 * Full-width cards — no horizontal scrolling.
 */
export default function MobileBracketRoundPage({
  slots,
  picks,
  results,
  tournamentData,
  onPick,
  onMatchupClick,
  isReadOnly,
  champTeam,
  tiebreakerType,
  tiebreakerValue,
  onTiebreakerChange,
}) {
  const getTeamsForSlot = (slot) => getMatchupTeams(slot, picks, tournamentData);

  const getResultForSlot = (slot) =>
    results?.[slot] || results?.[String(slot)] || null;

  const getPickedTeamForSlot = (slot) =>
    picks?.[slot] || picks?.[String(slot)] || null;

  // Enrich team with live score data from results
  const enrichTeam = (team, result) => {
    if (!team || !result) return team;
    const competitors = result.competitors || [];
    const comp = competitors.find((c) => String(c.teamId) === String(team.id));
    if (comp) return { ...team, score: comp.score };
    return team;
  };

  // Check if this is the Championship round (slot 63)
  const isChampionshipRound = slots.length === 1 && slots[0] === 63;

  return (
    <div className="flex flex-col gap-3 px-2">
      {/* Game count */}
      <div className="text-center pt-1 pb-1">
        <span className="text-sm font-medium text-fg/60">
          {slots.length} {slots.length === 1 ? 'game' : 'games'}
        </span>
      </div>

      {slots.map((slot) => {
        const { team1, team2 } = getTeamsForSlot(slot);
        const result = getResultForSlot(slot);
        const pickedTeam = getPickedTeamForSlot(slot);

        return (
          <BracketMatchup
            key={slot}
            slot={slot}
            team1={enrichTeam(team1, result)}
            team2={enrichTeam(team2, result)}
            pickedTeamId={pickedTeam}
            result={result}
            onPick={(teamId) => onPick?.(slot, teamId)}
            onDetailClick={() => onMatchupClick?.(slot)}
            isReadOnly={isReadOnly}
            compact={false}
          />
        );
      })}

      {/* Championship extras: Tiebreaker + Champion */}
      {isChampionshipRound && (
        <>
          {tiebreakerType === 'total_score' && (
            <div className="mt-2">
              <TiebreakerInput
                type={tiebreakerType}
                value={tiebreakerValue}
                onChange={onTiebreakerChange}
                disabled={isReadOnly}
                picks={picks}
                tournamentData={tournamentData}
              />
            </div>
          )}
          <div className="mt-2 mx-auto max-w-xs w-full">
            <ChampionCard team={champTeam} />
          </div>
        </>
      )}
    </div>
  );
}
