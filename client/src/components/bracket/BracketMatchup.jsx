import { Check, X, Info, Play, Circle } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import { getSlotRound } from '../../utils/bracketSlots';
import { SCORING_PRESETS } from '../../utils/bracketSlots';

function hexToRgba(hex, alpha) {
  if (!hex) return undefined;
  const h = hex.replace('#', '');
  if (h.length < 6) return undefined;
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  if (isNaN(r) || isNaN(g) || isNaN(b)) return undefined;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// Get the white/light logo variant for use on colored backgrounds
function getDarkBgLogo(logoUrl) {
  if (!logoUrl) return logoUrl;
  return logoUrl.replace('/500/', '/500-dark/');
}

export default function BracketMatchup({
  slot,
  team1,
  team2,
  bustedPick1,
  bustedPick2,
  pickedTeamId,
  result,
  slotData,
  eliminatedTeamIds = [],
  onPick,
  onDetailClick,
  isReadOnly,
  compact = false,
  side = 'left',
}) {
  const { isDark } = useTheme();
  const isDecided = result?.status === 'final';
  const isLive = result?.status === 'in_progress';
  const winningTeamId = result?.winning_team_id;

  const hasPick = !!pickedTeamId;

  const renderTeamRow = (team, position, bustedPick = null) => {
    if (!team) {
      const hasHeader = !!slotData;
      let tbdClasses = `flex items-center gap-2 px-2.5 py-2 relative ${compact ? 'min-w-[160px]' : ''} ${isDark ? 'text-white/40' : 'text-black/30'} bg-fg/[0.12]`;
      if (position === 'top' && !hasHeader) tbdClasses += ' rounded-t-lg';
      else tbdClasses += ' rounded-b-lg';
      return (
        <div className={tbdClasses} aria-disabled="true" aria-label="Team to be determined">
          {/* Seed placeholder — matches team row structure */}
          <span className="absolute left-0 top-0 bottom-0 w-10 md:w-8 flex items-center justify-center
            bg-white/90 text-black/30 text-base md:text-sm font-bold flex-shrink-0 rounded-none" aria-hidden="true">
            —
          </span>
          {/* Spacer to account for absolute-positioned seed block */}
          <span className="block w-8 md:w-6 flex-shrink-0" />
          {/* Logo placeholder — same size as team logo */}
          <div className="w-8 h-8 flex-shrink-0" />
          <span className="text-sm italic font-medium flex-1">TBD</span>
        </div>
      );
    }

    const isSelected = String(pickedTeamId) === String(team.id);
    const isCorrect = isDecided && isSelected && String(winningTeamId) === String(team.id);
    const isWrong = isDecided && isSelected && String(winningTeamId) !== String(team.id);
    const isActualWinner = isDecided && String(winningTeamId) === String(team.id);
    const isEliminated = isDecided && !isActualWinner;
    // Team is globally eliminated from the tournament (lost in an earlier round)
    const isTeamGloballyEliminated = eliminatedTeamIds.includes(String(team.id));
    // Busted: user picked this team for this slot but the team has already been eliminated in an earlier round
    const isBusted = !isDecided && isSelected && isTeamGloballyEliminated;

    // On desktop: selected = strong team color, not selected (when other team is picked) = faded
    const isOtherPicked = hasPick && !isSelected;

    let rowClasses = 'flex items-center gap-2 px-2.5 py-2 transition-all duration-150 relative ';
    if (compact) rowClasses += 'min-w-[160px] ';

    if (!isReadOnly) rowClasses += 'cursor-pointer active:scale-[0.97] ';

    // Hover brightness for unpicked teams
    if (!isCorrect && !isWrong && !(isSelected && !isDecided)) {
      if (!isReadOnly) rowClasses += 'hover:brightness-125 ';
    }

    const hasHeader = !!slotData;
    if (position === 'top' && !hasHeader) {
      rowClasses += 'rounded-t-lg ';
    } else if (position === 'bottom') {
      rowClasses += 'rounded-b-lg ';
    }

    const handleClick = (e) => {
      if (isReadOnly) return;
      e.stopPropagation();
      onPick?.(team.id);
    };

    const handleKeyDown = (e) => {
      if (isReadOnly) return;
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        e.stopPropagation();
        onPick?.(team.id);
      }
    };

    const teamLabel = `${isSelected ? 'Selected: ' : 'Pick '}#${team.seed || '?'} ${team.name}${isCorrect ? ', correct pick' : ''}${isWrong ? ', incorrect pick' : ''}`;

    // Team color logic (mobile + desktop unified):
    // Always show true primary color. When a pick is made, gray out the non-selected team.
    const isLightMode = !isDark;
    const trueAlpha = isLightMode ? 0.85 : 0.70;

    const rowStyle = {};

    if (isCorrect) {
      // Correct: keep team color
      if (team.color) {
        rowStyle.backgroundColor = hexToRgba(team.color, trueAlpha);
      } else {
        rowStyle.backgroundColor = isDark ? 'rgba(16, 185, 129, 0.25)' : 'rgba(16, 185, 129, 0.15)';
      }
    } else if (isWrong) {
      // Wrong: muted/grayed bg
      rowStyle.backgroundColor = isDark ? 'rgba(100, 100, 100, 0.35)' : 'rgba(140, 140, 140, 0.20)';
    } else if (isBusted) {
      // Busted: team eliminated in earlier round — gray out like wrong pick
      rowStyle.backgroundColor = isDark ? 'rgba(100, 100, 100, 0.35)' : 'rgba(140, 140, 140, 0.20)';
    } else if (isOtherPicked && !isDecided) {
      // Gray background for non-selected team (keeps team distinguishable)
      rowStyle.backgroundColor = isLightMode ? 'rgba(150, 150, 150, 0.25)' : 'rgba(100, 100, 100, 0.30)';
    } else if (team.color) {
      // Show true team primary color (both default and selected states)
      rowStyle.backgroundColor = hexToRgba(team.color, trueAlpha);
    }

    // Use white/dark-bg logo when on team color bg; fade logo/text only for wrong/busted picks (not live/scheduled)
    const isGrayedOut = isWrong || isBusted;
    // Gray bg but full-opacity content for non-selected during scheduled/live
    const hasGrayBg = (isOtherPicked && !isDecided) || isGrayedOut;
    const teamLogo = hasGrayBg ? team.logo : getDarkBgLogo(team.logo);

    // Text color: white on team color, muted on gray
    // First Four placeholder teams have no real team color — use fg text in light mode
    const isFirstFourPlaceholder = team.isFirstFour;
    // Slight fade for unselected team during live/scheduled (but not full gray-out)
    const isSlightlyFaded = isOtherPicked && !isDecided && !isGrayedOut;
    const textColorClass = isWrong || isBusted
      ? (isDark ? 'text-white/50' : 'text-fg/50')
      : isSlightlyFaded ? 'text-fg/50'
      : isGrayedOut ? 'text-fg/40'
      : (isFirstFourPlaceholder && isLightMode) ? 'text-fg' : 'text-white';

    return (
      <div
        className={rowClasses}
        onClick={handleClick}
        onKeyDown={!isReadOnly ? handleKeyDown : undefined}
        role={!isReadOnly ? 'button' : undefined}
        tabIndex={!isReadOnly ? 0 : undefined}
        aria-label={teamLabel}
        aria-pressed={!isReadOnly ? isSelected : undefined}
        style={rowStyle}
      >
        {/* Dark gradient overlay — covers full colored background */}
        {team.color && !isGrayedOut && !isWrong && (
          <div
            className="pointer-events-none absolute inset-0 z-[1]"
            style={{
              background: 'linear-gradient(to right, rgba(0,0,0,0.15) 0%, transparent 100%)',
            }}
          />
        )}

        {/* Seed — solid white block flush to left edge, bigger + rounded on mobile */}
        <span className="absolute left-0 top-0 bottom-0 w-10 md:w-8 flex items-center justify-center
          bg-white/90 text-black/80 text-base md:text-sm font-bold flex-shrink-0 rounded-none z-[2]">
          {team.seed || '—'}
        </span>
        {/* Spacer to account for absolute-positioned seed block */}
        <span className="block w-8 md:w-6 flex-shrink-0" />

        {/* Logo — white variant on team color bg, normal + faded on grayed out */}
        {team.logo ? (
          <img src={teamLogo} alt="" className={`w-8 h-8 flex-shrink-0 object-contain relative z-[2] ${isGrayedOut ? 'opacity-40' : isSlightlyFaded ? 'opacity-50' : ''}`} />
        ) : (
          <div className="w-8 h-8 flex-shrink-0 rounded-full bg-fg/10 relative z-[2]" />
        )}

        {/* Team name + busted pick (CBS-style stacked) */}
        <div className="flex-1 min-w-0 relative z-[2]">
          {bustedPick && (
            <span className={`text-sm font-semibold line-through truncate block ${isDark ? 'text-white/40' : 'text-black/40'}`}>
              {compact
                ? (bustedPick.abbreviation || bustedPick.shortName || bustedPick.name)
                : (bustedPick.shortName || bustedPick.name || bustedPick.abbreviation)}
            </span>
          )}
          <span className={`text-sm font-semibold truncate block ${(isWrong || isBusted) ? `line-through ${isDark ? 'text-white/40' : 'text-fg/40'}` : isEliminated ? 'line-through text-white/40' : textColorClass}`}>
            {compact
              ? (team.abbreviation || team.shortName || team.name)
              : (team.shortName || team.name || team.abbreviation)}
          </span>
        </div>
        {team.record && !isLive && !isDecided && (
          <span className={`text-xs flex-shrink-0 relative z-[2] ${isWrong ? (isDark ? 'text-white/30' : 'text-fg/30') : isGrayedOut ? 'text-fg/40' : hasGrayBg ? 'text-fg/60' : (isFirstFourPlaceholder && isLightMode) ? 'text-fg/60' : 'text-white/80'}`}>
            {team.record}
          </span>
        )}

        {/* Pre-pick check (before game decided, not live) */}
        {isSelected && !isDecided && !isLive && !isBusted && <Check className="w-5 h-5 text-white flex-shrink-0 relative z-[2]" strokeWidth={3} aria-hidden="true" />}

        {/* Score (live/final) — white square container with bold score */}
        {(isLive || isDecided) && team.score !== null && team.score !== undefined && (
          <span className={`flex-shrink-0 relative z-[2] min-w-[28px] h-7 flex items-center justify-center rounded px-1 text-base font-bold ${
            isLive ? 'bg-white/90 text-black'
              : (isGrayedOut || isEliminated) ? 'bg-white/20 text-fg/40'
              : 'bg-white/90 text-black'
          }`}>
            {team.score}
          </span>
        )}

      </div>
    );
  };



  // Show info button when not read-only and at least one team is known
  const showInfoButton = !isReadOnly && (team1 || team2) && onDetailClick;
  // Always reserve mobile spacer when onDetailClick exists (keeps cards aligned)
  const showMobileSpacer = !!onDetailClick;

  const matchupLabel = `Matchup: ${team1?.name || 'TBD'} vs ${team2?.name || 'TBD'}`;

  // Compute pick status for external indicators
  const getPickStatus = (team) => {
    if (!team) return null;
    const isSelected = String(pickedTeamId) === String(team.id);
    const isTeamGloballyEliminated = eliminatedTeamIds.includes(String(team.id));
    const isBusted = !isDecided && isSelected && isTeamGloballyEliminated;
    if (isDecided) {
      if (isSelected && String(winningTeamId) === String(team.id)) return 'correct';
      if (isSelected && String(winningTeamId) !== String(team.id)) return 'wrong';
      if (isBusted) return 'wrong';
    }
    // Show pick indicator for live/scheduled games
    if (isLive && isSelected) return 'picked';
    return null;
  };
  const team1Status = getPickStatus(team1);
  const team2Status = getPickStatus(team2);

  return (
    <div className="relative flex items-center gap-1 md:gap-0 group w-full" role="group" aria-label={matchupLabel}>
      {/* Card */}
      <div
        className={`relative flex-1 md:flex-none md:w-full rounded-lg transition-all duration-150 shadow-md overflow-hidden bg-surface ${isReadOnly && onDetailClick ? 'cursor-pointer hover:brightness-105' : ''}`}
        onClick={isReadOnly && onDetailClick ? (e) => { e.stopPropagation(); onDetailClick(); } : undefined}
      >
        {/* Game status header */}
        {slotData && (() => {
          const s = slotData;
          const isScheduled = !s.status || s.status === 'STATUS_SCHEDULED' || s.status === 'scheduled';
          const isGameLive = s.status === 'STATUS_IN_PROGRESS' || s.status === 'STATUS_HALFTIME' ||
            s.status === 'STATUS_END_PERIOD' || s.status === 'STATUS_FIRST_HALF' || s.status === 'STATUS_SECOND_HALF' ||
            s.status === 'in_progress';
          const isFinal = s.status === 'STATUS_FINAL' || s.status === 'final';

          if (isScheduled && s.startDate) {
            const d = new Date(s.startDate);
            const dateStr = d.toLocaleDateString('en-US', { weekday: 'short', month: 'numeric', day: 'numeric' });
            const timeStr = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
            return (
              <div className={`flex items-center justify-between px-2.5 py-1.5 text-sm ${isDark ? 'bg-fg/[0.08]' : 'bg-fg/[0.04]'}`}>
                <span className="text-fg">{dateStr} · {timeStr}</span>
                {s.broadcast && <span className="text-fg/60 truncate ml-1">{s.broadcast}</span>}
              </div>
            );
          }

          if (isGameLive) {
            return (
              <div className={`flex items-center gap-2 px-2.5 py-1.5 text-sm ${isDark ? 'bg-fg/[0.08]' : 'bg-fg/[0.04]'}`} aria-live="polite" aria-label="Game in progress">
                <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-red-500 text-white text-xs font-bold tracking-wide">
                  <span className="w-1.5 h-1.5 bg-white rounded-full animate-pulse flex-shrink-0" aria-hidden="true" />
                  LIVE
                </span>
                {s.statusDetail && <span className="font-medium text-fg">{s.statusDetail}</span>}
              </div>
            );
          }

          if (isFinal) {
            const pickStatus = team1Status || team2Status;
            const round = getSlotRound(slot);
            const pts = pickStatus === 'correct' ? (SCORING_PRESETS?.standard?.points?.[round] || [1,2,4,8,16,32][round] || 0) : 0;
            return (
              <div className={`flex items-center justify-between px-2.5 py-1.5 text-sm ${isDark ? 'bg-fg/[0.08]' : 'bg-fg/[0.04]'}`}>
                <span className="font-semibold tracking-wide uppercase text-sm text-fg">Final</span>
                {pickStatus && (
                  <span className={`font-bold text-base ${pickStatus === 'correct' ? 'text-emerald-500' : 'text-red-500'}`}>
                    {pickStatus === 'correct' ? `+${pts} pt${pts !== 1 ? 's' : ''}` : 'Wrong'}
                  </span>
                )}
              </div>
            );
          }

          return null;
        })()}

        {renderTeamRow(team1, 'top', bustedPick1)}
        {renderTeamRow(team2, 'bottom', bustedPick2)}
      </div>

      {/* Mobile: indicators + info button outside card */}
      {(() => {
        const hasStatus = team1Status || team2Status;
        if (hasStatus) {
          // Show check/X aligned with the picked team's row, info button on the other row
          return (
            <div className={`flex-shrink-0 flex flex-col items-center md:hidden w-6`} style={slotData ? { marginTop: '30px' } : undefined}>
              <div className="flex items-center justify-center" style={{ height: '40px' }}>
                {team1Status === 'correct' ? (
                  <span className="w-5 h-5 rounded-full bg-emerald-500 flex items-center justify-center shadow-sm"><Check className="w-3 h-3 text-white" strokeWidth={3} /></span>
                ) : team1Status === 'wrong' ? (
                  <span className="w-5 h-5 rounded-full bg-red-500 flex items-center justify-center shadow-sm"><X className="w-3 h-3 text-white" strokeWidth={3} /></span>
                ) : team1Status === 'picked' ? (
                  <Check className="w-5 h-5 text-emerald-500" strokeWidth={3.5} />
                ) : null}
              </div>
              <div className="flex items-center justify-center" style={{ height: '40px' }}>
                {team2Status === 'correct' ? (
                  <span className="w-5 h-5 rounded-full bg-emerald-500 flex items-center justify-center shadow-sm"><Check className="w-3 h-3 text-white" strokeWidth={3} /></span>
                ) : team2Status === 'wrong' ? (
                  <span className="w-5 h-5 rounded-full bg-red-500 flex items-center justify-center shadow-sm"><X className="w-3 h-3 text-white" strokeWidth={3} /></span>
                ) : team2Status === 'picked' ? (
                  <Check className="w-5 h-5 text-emerald-500" strokeWidth={3.5} />
                ) : null}
              </div>
            </div>
          );
        }
        if (showInfoButton) {
          return (
            <button
              onClick={(e) => { e.stopPropagation(); onDetailClick(); }}
              className={`flex-shrink-0 p-1.5 rounded-full bg-fg/10 text-fg/40 active:bg-fg/20 md:hidden self-center ${slotData ? 'mt-7' : ''}`}
              aria-label={`View details`}
            >
              <Info className="w-4 h-4" />
            </button>
          );
        }
        if (onDetailClick) return <div className="flex-shrink-0 w-7 md:hidden" />;
        return null;
      })()}

      {/* Desktop: info button + status indicators outside the card */}
      {(showInfoButton || team1Status || team2Status) && (
        <div
          className="absolute z-10 hidden md:flex flex-col items-center gap-0"
          style={{
            top: slotData ? '30px' : '0',
            bottom: '0',
            ...(side === 'right' ? { left: '-30px' } : { right: '-30px' }),
          }}
        >
          {/* Indicator for team1 row */}
          <div className="flex-1 flex items-center justify-center">
            {team1Status === 'correct' ? (
              <span className="w-5 h-5 rounded-full bg-emerald-500 flex items-center justify-center shadow-sm"><Check className="w-3 h-3 text-white" strokeWidth={3} /></span>
            ) : team1Status === 'wrong' ? (
              <span className="w-5 h-5 rounded-full bg-red-500 flex items-center justify-center shadow-sm"><X className="w-3 h-3 text-white" strokeWidth={3} /></span>
            ) : team1Status === 'picked' ? (
              <Check className="w-5 h-5 text-emerald-500" strokeWidth={3.5} />
            ) : null}
          </div>
          {/* Info button centered */}
          {!(team1Status || team2Status) && (
            <button
              onClick={(e) => { e.stopPropagation(); onDetailClick(); }}
              aria-label={`View details`}
              className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 p-2.5 rounded-full text-fg/50 hover:text-fg/80 hover:bg-fg/15 transition-colors flex items-center justify-center"
            >
              <Info className="w-4 h-4" />
            </button>
          )}
          {/* Indicator for team2 row */}
          <div className="flex-1 flex items-center justify-center">
            {team2Status === 'correct' ? (
              <span className="w-5 h-5 rounded-full bg-emerald-500 flex items-center justify-center shadow-sm"><Check className="w-3 h-3 text-white" strokeWidth={3} /></span>
            ) : team2Status === 'wrong' ? (
              <span className="w-5 h-5 rounded-full bg-red-500 flex items-center justify-center shadow-sm"><X className="w-3 h-3 text-white" strokeWidth={3} /></span>
            ) : team2Status === 'picked' ? (
              <Check className="w-5 h-5 text-emerald-500" strokeWidth={3.5} />
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
