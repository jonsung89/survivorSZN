import { Check, X, Info, Play } from 'lucide-react';

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
  const isDecided = result?.status === 'final';
  const isLive = result?.status === 'in_progress';
  const winningTeamId = result?.winning_team_id;

  const renderTeamRow = (team, position) => {
    if (!team) {
      return (
        <div className={`flex items-center gap-3 lg:gap-2 px-4 lg:px-3 py-3.5 lg:py-2.5 ${compact ? 'min-w-[160px]' : 'lg:min-w-[180px]'} text-fg/35`}>
          <span className="w-7 lg:w-6 text-center text-sm lg:text-xs font-mono">—</span>
          <span className="text-base lg:text-sm italic">TBD</span>
        </div>
      );
    }

    const isSelected = String(pickedTeamId) === String(team.id);
    const isCorrect = isDecided && isSelected && String(winningTeamId) === String(team.id);
    const isWrong = isDecided && isSelected && String(winningTeamId) !== String(team.id);
    const isActualWinner = isDecided && String(winningTeamId) === String(team.id);
    const isEliminated = isDecided && !isActualWinner;

    let rowClasses = 'flex items-center gap-3 lg:gap-2 px-4 lg:px-3 py-3.5 lg:py-2.5 transition-all duration-150 ';
    if (compact) rowClasses += 'min-w-[160px] ';
    else rowClasses += 'lg:min-w-[180px] ';

    if (!isReadOnly) rowClasses += 'cursor-pointer active:scale-[0.97] ';

    if (isCorrect) {
      rowClasses += 'bg-emerald-500/15 ';
    } else if (isWrong) {
      rowClasses += 'bg-red-500/10 ';
    } else if (isSelected && !isDecided) {
      rowClasses += 'bg-violet-500/15 ';
    } else {
      if (!isReadOnly) rowClasses += 'hover:bg-fg/5 ';
    }

    if (position === 'top') {
      rowClasses += 'rounded-t-xl lg:rounded-t-lg border-b border-fg/15 ';
    } else {
      rowClasses += 'rounded-b-xl lg:rounded-b-lg ';
    }

    const handleClick = (e) => {
      if (isReadOnly) return;
      e.stopPropagation();
      onPick?.(team.id);
    };

    return (
      <div className={rowClasses} onClick={handleClick}>
        {/* Seed */}
        <span className="w-7 lg:w-6 text-center text-sm lg:text-xs font-mono font-bold text-fg/50 flex-shrink-0">
          {team.seed || '—'}
        </span>

        {/* Logo */}
        {team.logo ? (
          <img src={team.logo} alt="" className="w-8 h-8 lg:w-6 lg:h-6 flex-shrink-0 object-contain" />
        ) : (
          <div className="w-8 h-8 lg:w-6 lg:h-6 flex-shrink-0 rounded-full bg-fg/10" />
        )}

        {/* Name */}
        <span className={`text-base lg:text-sm font-medium flex-1 truncate ${isEliminated ? 'line-through text-fg/30' : 'text-fg/80'}`}>
          {compact ? (team.abbreviation || team.shortName || team.name) : (team.name || team.shortName || team.abbreviation)}
        </span>

        {/* Score (live/final) */}
        {(isLive || isDecided) && team.score !== null && team.score !== undefined && (
          <span className={`text-base lg:text-sm font-mono font-bold flex-shrink-0 ${isActualWinner ? 'text-fg' : 'text-fg/40'}`}>
            {team.score}
          </span>
        )}

        {/* Status icons */}
        {isCorrect && <Check className="w-5 h-5 lg:w-4 lg:h-4 text-emerald-400 flex-shrink-0" />}
        {isWrong && <X className="w-5 h-5 lg:w-4 lg:h-4 text-red-400 flex-shrink-0" />}
        {isSelected && !isDecided && !isLive && <Check className="w-4 h-4 lg:w-3.5 lg:h-3.5 text-violet-400 flex-shrink-0" />}
      </div>
    );
  };

  return (
    <div className="relative group">
      <div className={`border rounded-xl lg:rounded-lg transition-all duration-150 shadow-md ${
        isLive ? 'border-red-500/40 shadow-[0_0_8px_rgba(239,68,68,0.15)]' :
        isDecided ? 'border-fg/20' :
        pickedTeamId ? 'border-violet-500/30 shadow-[0_0_10px_rgba(139,92,246,0.12)]' :
        'border-fg/20 hover:border-fg/30'
      } bg-surface`}>
        {/* Live indicator */}
        {isLive && (
          <div className="absolute -top-2 left-2 px-2 py-0.5 bg-red-500 rounded text-[10px] font-bold text-white uppercase tracking-wider flex items-center gap-1">
            <span className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" />
            LIVE
          </div>
        )}

        {renderTeamRow(team1, 'top')}
        {renderTeamRow(team2, 'bottom')}
      </div>

      {/* Info button */}
      {team1 && team2 && onDetailClick && (
        <button
          onClick={(e) => { e.stopPropagation(); onDetailClick(); }}
          className="absolute -right-1 top-1/2 -translate-y-1/2 translate-x-full opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded-full bg-fg/10 hover:bg-fg/20 text-fg/50 hover:text-fg/80 hidden sm:block"
        >
          <Info className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}
