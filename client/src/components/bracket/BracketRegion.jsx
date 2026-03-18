import BracketMatchup from './BracketMatchup';
import { getNextSlot, getChildSlots, getMatchupTeams } from '../../utils/bracketSlots';

// Compute a formatted date range from slot start dates
export function getRoundDateRange(slots, tournamentData) {
  if (!tournamentData?.slots) return null;

  const dates = slots
    .map(s => tournamentData.slots?.[s]?.startDate || tournamentData.slots?.[String(s)]?.startDate)
    .filter(Boolean)
    .map(d => new Date(d))
    .filter(d => !isNaN(d.getTime()));

  if (dates.length === 0) return null;

  const min = new Date(Math.min(...dates));
  const max = new Date(Math.max(...dates));
  const fmt = (d) => `${d.getMonth() + 1}/${d.getDate()}`;

  if (min.getMonth() === max.getMonth() && min.getDate() === max.getDate()) {
    return fmt(min);
  }
  return `${fmt(min)} - ${fmt(max)}`;
}

export default function BracketRegion({
  region,
  picks,
  results,
  tournamentData,
  liveSlotData = {},
  onPick,
  onMatchupClick,
  isReadOnly,
  side = 'left', // 'left' or 'right' — controls bracket connector direction
  showRoundHeaders = false,
  cellWidth = 260, // px width of each match cell
  largeHeaders = false, // larger font sizes for scaled-down views
}) {
  // Rounds within a region: R64 (8 games), R32 (4), S16 (2), E8 (1)
  const rounds = region.rounds;

  const getTeamsForSlot = (slot) => {
    return getMatchupTeams(slot, picks, tournamentData);
  };

  const getResultForSlot = (slot) => {
    return results?.[slot] || results?.[String(slot)] || null;
  };

  const getPickedTeamForSlot = (slot) => {
    return picks?.[slot] || picks?.[String(slot)] || null;
  };

  // Build slotData for a given slot — combines tournament info with live overlay
  const slotDataFor = (slot) => {
    const base = tournamentData?.slots?.[slot] || tournamentData?.slots?.[String(slot)] || {};
    const live = liveSlotData?.[slot] || liveSlotData?.[String(slot)] || null;
    return {
      startDate: base.startDate,
      status: live?.status || base.status,
      statusDetail: live?.statusDetail || base.statusDetail,
      clock: live?.clock,
      period: live?.period,
      broadcast: live?.broadcast || base.broadcast,
    };
  };

  // Enhance team objects with live scores from results
  const enrichTeam = (team, slot, result) => {
    if (!team || !result) return team;
    const competitors = result.competitors || [];
    const comp = competitors.find(c => String(c.teamId) === String(team.id));
    if (comp) {
      return { ...team, score: comp.score };
    }
    return team;
  };

  const renderRound = (roundData, roundIdx) => {
    const { slots } = roundData;
    const gapClasses = [
      'gap-5',    // R64: slight spacing
      'gap-6',    // R32: moderate
      'gap-14',   // S16: wide
      'gap-28',   // E8: widest
    ][roundIdx] || 'gap-1';

    return (
      <div
        key={roundData.round}
        className={`flex flex-col justify-around ${gapClasses} flex-shrink-0`}
        style={{ width: `${cellWidth}px`, minWidth: `${cellWidth}px` }}
      >
        {slots.map((slot) => {
          const { team1, team2 } = getTeamsForSlot(slot);
          const result = getResultForSlot(slot);
          const pickedTeam = getPickedTeamForSlot(slot);

          return (
            <div key={slot} className="relative flex items-center px-3">
              {/* Connector lines */}
              {roundIdx > 0 && side === 'left' && (
                <div className="absolute -left-4 top-0 bottom-0 w-4 flex items-center">
                  <div className="w-full h-px bg-fg/20" />
                </div>
              )}
              {roundIdx > 0 && side === 'right' && (
                <div className="absolute -right-4 top-0 bottom-0 w-4 flex items-center">
                  <div className="w-full h-px bg-fg/20" />
                </div>
              )}

              <BracketMatchup
                slot={slot}
                team1={enrichTeam(team1, slot, result)}
                team2={enrichTeam(team2, slot, result)}
                pickedTeamId={pickedTeam}
                result={result}
                slotData={slotDataFor(slot)}
                onPick={(teamId) => onPick?.(slot, teamId)}
                onDetailClick={() => onMatchupClick?.(slot)}
                isReadOnly={isReadOnly}
                compact={false}
                side={side}
              />
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div>
      {/* Round column headers (shown on top regions only — above region name) */}
      {showRoundHeaders && (
        <div className={`flex ${side === 'right' ? 'flex-row-reverse' : 'flex-row'} gap-6 mb-4`}>
          {rounds.map((roundData, roundIdx) => {
            const dateRange = getRoundDateRange(roundData.slots, tournamentData);
            return (
              <div
                key={roundData.round}
                className="text-center flex-shrink-0"
                style={{ width: `${cellWidth}px`, minWidth: `${cellWidth}px` }}
              >
                <div className={`${largeHeaders ? 'text-2xl' : 'text-base'} font-bold text-fg/80`}>
                  {roundData.name}
                </div>
                {dateRange && (
                  <div className={`${largeHeaders ? 'text-lg' : 'text-sm'} text-fg/60 mt-0.5`}>{dateRange}</div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Region header */}
      <div className="text-center mt-3 mb-5">
        <h3 className={`${largeHeaders ? 'text-4xl' : 'text-2xl'} font-display font-bold text-fg/80 uppercase tracking-wider`}>
          {region.name}
        </h3>
      </div>

      {/* Bracket grid — flex-row-reverse flips right-side regions so R64 is on the far right */}
      <div className={`flex ${side === 'right' ? 'flex-row-reverse' : 'flex-row'} gap-6 items-stretch`}>
        {rounds.map((roundData, roundIdx) => renderRound(roundData, roundIdx))}
      </div>
    </div>
  );
}
