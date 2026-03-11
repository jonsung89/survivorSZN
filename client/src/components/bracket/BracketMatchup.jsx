import { Check, X, Info, Play } from 'lucide-react';
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
  onPick,
  onDetailClick,
  isReadOnly,
  compact = false,
}) {
  const { isDark } = useTheme();
  const isDecided = result?.status === 'final';
  const isLive = result?.status === 'in_progress';
  const winningTeamId = result?.winning_team_id;

  const hasPick = !!pickedTeamId;

  const renderTeamRow = (team, position) => {
    if (!team) {
      let tbdClasses = `flex items-center gap-2 px-2.5 py-2 relative ${compact ? 'min-w-[160px]' : ''} text-white/50 bg-fg/[0.12]`;
      if (position === 'top') tbdClasses += ' rounded-t-lg';
      else tbdClasses += ' rounded-b-lg';
      return (
        <div className={tbdClasses}>
          {/* Seed placeholder — matches team row structure */}
          <span className="absolute left-0 top-0 bottom-0 w-10 md:w-8 flex items-center justify-center
            bg-white/90 text-black/30 text-base md:text-sm font-bold flex-shrink-0 rounded-none">
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

    if (position === 'top') {
      rowClasses += 'rounded-t-lg ';
    } else {
      rowClasses += 'rounded-b-lg ';
    }

    const handleClick = (e) => {
      if (isReadOnly) return;
      e.stopPropagation();
      onPick?.(team.id);
    };

    // Team color logic (mobile + desktop unified):
    // Always show true primary color. When a pick is made, gray out the non-selected team.
    const isLightMode = !isDark;
    const trueAlpha = isLightMode ? 0.85 : 0.70;

    const rowStyle = {};

    if (isCorrect) {
      rowStyle.backgroundColor = 'rgba(16, 185, 129, 0.2)';
    } else if (isWrong) {
      rowStyle.backgroundColor = 'rgba(239, 68, 68, 0.15)';
    } else if (isOtherPicked && !isDecided) {
      // Gray out the non-selected team
      rowStyle.backgroundColor = isLightMode ? 'rgba(150, 150, 150, 0.25)' : 'rgba(100, 100, 100, 0.30)';
    } else if (team.color) {
      // Show true team primary color (both default and selected states)
      rowStyle.backgroundColor = hexToRgba(team.color, trueAlpha);
    }

    // Use white/dark-bg logo when on team color bg; use normal logo when grayed out
    const isGrayedOut = isOtherPicked && !isDecided;
    const teamLogo = isGrayedOut ? team.logo : getDarkBgLogo(team.logo);

    // Text color: white on team color, muted on gray
    const textColorClass = isGrayedOut ? 'text-fg/40' : 'text-white';

    return (
      <div className={rowClasses} onClick={handleClick} style={rowStyle}>
        {/* Seed — solid white block flush to left edge, bigger + rounded on mobile */}
        <span className="absolute left-0 top-0 bottom-0 w-10 md:w-8 flex items-center justify-center
          bg-white/90 text-black/80 text-base md:text-sm font-bold flex-shrink-0 rounded-none">
          {team.seed || '—'}
        </span>
        {/* Spacer to account for absolute-positioned seed block */}
        <span className="block w-8 md:w-6 flex-shrink-0" />

        {/* Logo — white variant on team color bg, normal + faded on grayed out */}
        {team.logo ? (
          <img src={teamLogo} alt="" className={`w-8 h-8 flex-shrink-0 object-contain ${isGrayedOut ? 'opacity-40' : ''}`} />
        ) : (
          <div className="w-8 h-8 flex-shrink-0 rounded-full bg-fg/10" />
        )}

        {/* Team name + record */}
        <span className={`text-sm font-semibold flex-1 truncate ${isEliminated ? 'line-through text-white/40' : textColorClass}`}>
          {compact
            ? (team.abbreviation || team.shortName || team.name)
            : (team.shortName || team.name || team.abbreviation)}
        </span>
        {team.record && (
          <span className={`text-xs font-mono flex-shrink-0 ${isGrayedOut ? 'text-fg/40' : 'text-white/80'}`}>
            {team.record}
          </span>
        )}

        {/* Score (live/final) */}
        {(isLive || isDecided) && team.score !== null && team.score !== undefined && (
          <span className={`text-sm font-mono font-bold flex-shrink-0 ${isActualWinner ? 'text-white' : 'text-white/50'}`}>
            {team.score}
          </span>
        )}

        {/* Status icons */}
        {isCorrect && <Check className="w-4 h-4 text-emerald-400 flex-shrink-0" />}
        {isWrong && <X className="w-4 h-4 text-red-400 flex-shrink-0" />}
        {isSelected && !isDecided && !isLive && <Check className="w-3.5 h-3.5 text-white/80 flex-shrink-0" />}
      </div>
    );
  };

  const showInfoButton = team1 && team2 && onDetailClick;

  return (
    <div className="relative flex items-center gap-1.5 md:gap-0 group w-full">
      {/* Card */}
      <div className={`relative flex-1 md:flex-none md:w-full rounded-lg transition-all duration-150 shadow-md overflow-hidden ${
        isLive ? 'border border-red-500/40 shadow-[0_0_8px_rgba(239,68,68,0.15)]' : ''
      } bg-surface`}>
        {/* Live indicator */}
        {isLive && (
          <div className="absolute -top-2 left-2 px-2 py-0.5 bg-red-500 rounded text-[10px] font-bold text-white uppercase tracking-wider flex items-center gap-1 z-10">
            <span className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" />
            LIVE
          </div>
        )}

        {renderTeamRow(team1, 'top')}
        {renderTeamRow(team2, 'bottom')}
      </div>

      {/* Mobile: info button outside the card on the right */}
      {showInfoButton && (
        <button
          onClick={(e) => { e.stopPropagation(); onDetailClick(); }}
          className="flex-shrink-0 p-1.5 rounded-full bg-fg/10 text-fg/40 active:bg-fg/20 md:hidden"
        >
          <Info className="w-4 h-4" />
        </button>
      )}

      {/* Desktop: always-visible info button centered in the gap between columns */}
      {showInfoButton && (
        <button
          onClick={(e) => { e.stopPropagation(); onDetailClick(); }}
          className="absolute top-1/2 -translate-y-1/2 z-10 p-2.5 rounded-full text-fg/50 hover:text-fg/80 hover:bg-fg/15 transition-colors hidden md:flex items-center justify-center"
          style={{ right: '-36px' }}
        >
          <Info className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}
