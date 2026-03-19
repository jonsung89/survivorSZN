import { Check, X, Info, Play, Circle } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';

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
  pickedTeamId,
  result,
  slotData,
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

  const renderTeamRow = (team, position) => {
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
      // Correct: keep team color, add green left border
      if (team.color) {
        rowStyle.backgroundColor = hexToRgba(team.color, trueAlpha);
      } else {
        rowStyle.backgroundColor = isDark ? 'rgba(16, 185, 129, 0.25)' : 'rgba(16, 185, 129, 0.15)';
      }
      rowStyle.borderLeft = '3.5px solid rgb(16, 185, 129)';
    } else if (isWrong) {
      // Wrong: muted/grayed bg, add red left border
      rowStyle.backgroundColor = isDark ? 'rgba(100, 100, 100, 0.35)' : 'rgba(140, 140, 140, 0.20)';
      rowStyle.borderLeft = '3.5px solid rgb(239, 68, 68)';
    } else if (isOtherPicked && !isDecided) {
      // Gray out the non-selected team
      rowStyle.backgroundColor = isLightMode ? 'rgba(150, 150, 150, 0.25)' : 'rgba(100, 100, 100, 0.30)';
    } else if (team.color) {
      // Show true team primary color (both default and selected states)
      rowStyle.backgroundColor = hexToRgba(team.color, trueAlpha);
    }

    // Use white/dark-bg logo when on team color bg; use normal logo when grayed out
    const isGrayedOut = (isOtherPicked && !isDecided) || isWrong;
    const teamLogo = isGrayedOut ? team.logo : getDarkBgLogo(team.logo);

    // Text color: white on team color, muted on gray
    // First Four placeholder teams have no real team color — use fg text in light mode
    const isFirstFourPlaceholder = team.isFirstFour;
    const textColorClass = isWrong
      ? (isDark ? 'text-white/50' : 'text-fg/50')
      : isGrayedOut ? 'text-fg/40' : (isFirstFourPlaceholder && isLightMode) ? 'text-fg' : 'text-white';

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
          <img src={teamLogo} alt="" className={`w-8 h-8 flex-shrink-0 object-contain relative z-[2] ${isGrayedOut ? 'opacity-40' : ''}`} />
        ) : (
          <div className="w-8 h-8 flex-shrink-0 rounded-full bg-fg/10 relative z-[2]" />
        )}

        {/* Team name + record */}
        <span className={`text-sm font-semibold flex-1 truncate relative z-[2] ${isWrong ? `line-through ${isDark ? 'text-white/40' : 'text-fg/40'}` : isEliminated ? 'line-through text-white/40' : textColorClass}`}>
          {compact
            ? (team.abbreviation || team.shortName || team.name)
            : (team.shortName || team.name || team.abbreviation)}
        </span>
        {team.record && !isLive && !isDecided && (
          <span className={`text-xs font-mono flex-shrink-0 relative z-[2] ${isWrong ? (isDark ? 'text-white/30' : 'text-fg/30') : isGrayedOut ? 'text-fg/40' : (isFirstFourPlaceholder && isLightMode) ? 'text-fg/60' : 'text-white/80'}`}>
            {team.record}
          </span>
        )}

        {/* Status icons — filled circle badges for correct/wrong, placed BEFORE score so scores align */}
        {isCorrect && (
          <span className="flex-shrink-0 relative z-[2] w-5 h-5 rounded-full bg-emerald-500 flex items-center justify-center shadow-sm">
            <Check className="w-3 h-3 text-white" strokeWidth={3} aria-hidden="true" />
          </span>
        )}
        {isWrong && (
          <span className="flex-shrink-0 relative z-[2] w-5 h-5 rounded-full bg-red-500 flex items-center justify-center shadow-sm">
            <X className="w-3 h-3 text-white" strokeWidth={3} aria-hidden="true" />
          </span>
        )}
        {isSelected && !isDecided && !isLive && <Check className="w-3.5 h-3.5 text-white/80 flex-shrink-0 relative z-[2]" aria-hidden="true" />}

        {/* Score (live/final) — same size for both teams so they align vertically */}
        {(isLive || isDecided) && team.score !== null && team.score !== undefined && (
          <span className={`text-sm font-mono flex-shrink-0 relative z-[2] min-w-[24px] text-right ${
            isActualWinner
              ? `font-bold ${isWrong ? (isDark ? 'text-white/70' : 'text-fg/70') : 'text-white'}`
              : `font-medium ${isWrong ? (isDark ? 'text-white/35' : 'text-fg/35') : (isCorrect ? 'text-white/50' : 'text-white/50')}`
          }`}>
            {team.score}
          </span>
        )}
      </div>
    );
  };

  // Show info button when at least one team is known (not both TBD)
  const showInfoButton = (team1 || team2) && onDetailClick;
  // Always reserve mobile spacer when onDetailClick exists (keeps cards aligned)
  const showMobileSpacer = !!onDetailClick;

  const matchupLabel = `Matchup: ${team1?.name || 'TBD'} vs ${team2?.name || 'TBD'}`;

  return (
    <div className="relative flex items-center gap-1.5 md:gap-0 group w-full" role="group" aria-label={matchupLabel}>
      {/* Card */}
      <div className={`relative flex-1 md:flex-none md:w-full rounded-lg transition-all duration-150 shadow-md overflow-hidden ${
        isLive ? 'border border-red-500/40 shadow-[0_0_8px_rgba(239,68,68,0.15)]' : ''
      } bg-surface`}>
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
                <span className="text-fg/80">{dateStr} · {timeStr}</span>
                {s.broadcast && <span className="text-fg/60 truncate ml-1">{s.broadcast}</span>}
              </div>
            );
          }

          if (isGameLive) {
            return (
              <div className={`flex items-center gap-2 px-2.5 py-1.5 text-sm ${isDark ? 'bg-red-500/15' : 'bg-red-50'}`} aria-live="polite" aria-label="Game in progress">
                <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-red-500 text-white text-xs font-bold tracking-wide">
                  <span className="w-1.5 h-1.5 bg-white rounded-full animate-pulse flex-shrink-0" aria-hidden="true" />
                  LIVE
                </span>
                {s.statusDetail && <span className={`font-medium ${isDark ? 'text-fg/70' : 'text-fg/60'}`}>{s.statusDetail}</span>}
                {s.clock && <span className={`font-mono font-semibold ${isDark ? 'text-fg/80' : 'text-fg/70'}`}>{s.clock}</span>}
              </div>
            );
          }

          if (isFinal) {
            return (
              <div className={`flex items-center px-2.5 py-1.5 text-sm ${isDark ? 'bg-fg/[0.08]' : 'bg-fg/[0.04]'}`}>
                <span className={`font-semibold tracking-wide uppercase text-xs ${isDark ? 'text-fg/50' : 'text-fg/45'}`}>Final</span>
              </div>
            );
          }

          return null;
        })()}

        {renderTeamRow(team1, 'top')}
        {renderTeamRow(team2, 'bottom')}
      </div>

      {/* Mobile: info button outside the card on the right (or invisible spacer to keep alignment) */}
      {showInfoButton ? (
        <button
          onClick={(e) => { e.stopPropagation(); onDetailClick(); }}
          className={`flex-shrink-0 p-1.5 rounded-full bg-fg/10 text-fg/40 active:bg-fg/20 md:hidden self-center ${slotData ? 'mt-7' : ''}`}
          aria-label={`View details: ${team1?.name || 'TBD'} vs ${team2?.name || 'TBD'}`}
        >
          <Info className="w-4 h-4" aria-hidden="true" />
        </button>
      ) : showMobileSpacer ? (
        <div className="flex-shrink-0 w-7 md:hidden" />
      ) : null}

      {/* Desktop: info button centered on team rows (offset down by header height when present) */}
      {showInfoButton && (
        <button
          onClick={(e) => { e.stopPropagation(); onDetailClick(); }}
          aria-label={`View details: ${team1?.name || 'TBD'} vs ${team2?.name || 'TBD'}`}
          className="absolute z-10 p-2.5 rounded-full text-fg/50 hover:text-fg/80 hover:bg-fg/15 transition-colors hidden md:flex items-center justify-center"
          style={{
            top: slotData ? 'calc(50% + 14px)' : '50%',
            transform: 'translateY(-50%)',
            ...(side === 'right' ? { left: '-36px' } : { right: '-36px' }),
          }}
        >
          <Info className="w-4 h-4" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
