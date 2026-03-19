import { useEffect } from 'react';
import { Trophy, ExternalLink, X } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import { getThemedLogo, getThemedColor } from '../../utils/logo';

function getDarkBgLogo(logoUrl) {
  if (!logoUrl) return logoUrl;
  return logoUrl.replace('/500/', '/500-dark/');
}

function getTeam(teamId, tournamentData) {
  if (!teamId || !tournamentData?.teams) return null;
  return tournamentData.teams[teamId] || tournamentData.teams[String(teamId)] || null;
}

export default function FinalFourPreviewDialog({ entry, tournamentData, eliminatedTeamIds = [], onBracketClick, onClose }) {
  const { isDark } = useTheme();

  useEffect(() => {
    const handleKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  const picks = entry.finalFourPicks || {};

  // Championship: slot 63 winner, teams are picks from slots 61 & 62
  const championId = picks[63] || picks['63'];
  const champTeam1Id = picks[61] || picks['61'];
  const champTeam2Id = picks[62] || picks['62'];
  const champTeam1 = getTeam(champTeam1Id, tournamentData);
  const champTeam2 = getTeam(champTeam2Id, tournamentData);
  const champion = getTeam(championId, tournamentData);

  // Final Four semis: slot 61 teams come from slots 57 & 58, slot 62 from 59 & 60
  const semi1Team1 = getTeam(picks[57] || picks['57'], tournamentData);
  const semi1Team2 = getTeam(picks[58] || picks['58'], tournamentData);
  const semi2Team1 = getTeam(picks[59] || picks['59'], tournamentData);
  const semi2Team2 = getTeam(picks[60] || picks['60'], tournamentData);

  // Tiebreaker scores
  const scores = entry.tiebreakerScores;
  const totalScore = entry.tiebreakerValue;

  const championColor = champion?.color || '#6B7280';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-sm rounded-2xl overflow-hidden animate-in"
        style={{ background: isDark ? 'rgb(var(--color-elevated))' : '#fff' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Close button — outside overflow-hidden areas */}
        <button
          onClick={onClose}
          className="absolute top-3 right-3 z-20 p-1.5 rounded-full bg-black/30 text-white/80 hover:text-white hover:bg-black/50 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Champion Header */}
        {champion && (
          <div className="relative overflow-hidden" style={{ background: championColor }}>
            <div
              className="absolute inset-0"
              style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.5) 0%, rgba(0,0,0,0.15) 50%, rgba(0,0,0,0.3) 100%)' }}
            />
            {champion.logo && (
              <img
                src={getDarkBgLogo(champion.logo)}
                alt=""
                className="absolute -right-3 top-1/2 -translate-y-1/2 w-28 h-28 object-contain opacity-[0.12] blur-[1px] pointer-events-none"
              />
            )}
            <div className="relative z-10 flex flex-col items-center gap-1.5 px-6 py-4">
              <div className="flex items-center gap-1.5">
                <Trophy className="w-4 h-4 text-amber-300" />
                <span className="text-xs font-bold uppercase tracking-[0.15em] text-amber-300/90">
                  {entry.displayName}'s Champion
                </span>
                <Trophy className="w-4 h-4 text-amber-300" />
              </div>
              {champion.logo && (
                <img
                  src={getDarkBgLogo(champion.logo)}
                  alt={champion.name}
                  className="w-14 h-14 object-contain drop-shadow-lg"
                />
              )}
              <span className="text-lg font-display font-bold text-white drop-shadow-md">
                {champion.name || champion.abbreviation}
              </span>
              {champion.seed && (
                <span className="text-xs font-mono font-semibold bg-white/15 text-white/80 rounded px-1.5 py-0.5">
                  #{champion.seed} seed
                </span>
              )}
            </div>
          </div>
        )}

        {/* Championship Game */}
        <div className="px-4 pt-4 pb-3">
          <div className="text-xs font-semibold text-fg/40 uppercase tracking-wider mb-2">Championship Game</div>
          <div className={`rounded-xl overflow-hidden border ${isDark ? 'border-fg/10' : 'border-gray-200'}`}>
            <ChampionshipMatchup
              team1={champTeam1}
              team2={champTeam2}
              winnerId={championId}
              scores={scores}
              totalScore={totalScore}
              eliminatedTeamIds={eliminatedTeamIds}
              isDark={isDark}
            />
          </div>
        </div>

        {/* Final Four Semis */}
        <div className="px-4 pb-4">
          <div className="text-xs font-semibold text-fg/40 uppercase tracking-wider mb-2">Final Four</div>
          <div className="grid grid-cols-2 gap-2">
            <SemiMatchup
              team1={semi1Team1}
              team2={semi1Team2}
              winnerId={champTeam1Id}
              eliminatedTeamIds={eliminatedTeamIds}
              isDark={isDark}
            />
            <SemiMatchup
              team1={semi2Team1}
              team2={semi2Team2}
              winnerId={champTeam2Id}
              eliminatedTeamIds={eliminatedTeamIds}
              isDark={isDark}
            />
          </div>
        </div>

        {/* View Full Bracket Button */}
        <div className="px-4 pb-4">
          <button
            onClick={() => onBracketClick(entry.bracketId)}
            className="w-full py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 transition-opacity hover:opacity-85 text-white"
            style={{ background: getThemedColor(champion, isDark) }}
          >
            <ExternalLink className="w-4 h-4" />
            View Full Bracket
          </button>
        </div>
      </div>
    </div>
  );
}

function ChampionshipMatchup({ team1, team2, winnerId, scores, totalScore, eliminatedTeamIds, isDark }) {
  const team1IsWinner = team1 && String(winnerId) === String(team1.id);
  const team2IsWinner = team2 && String(winnerId) === String(team2.id);
  const team1Eliminated = team1 && eliminatedTeamIds.includes(String(team1.id));
  const team2Eliminated = team2 && eliminatedTeamIds.includes(String(team2.id));

  return (
    <div>
      <TeamRow team={team1} isWinner={team1IsWinner} isEliminated={team1Eliminated} score={scores?.score1} isDark={isDark} />
      <div className={`border-t ${isDark ? 'border-fg/10' : 'border-gray-200'}`} />
      <TeamRow team={team2} isWinner={team2IsWinner} isEliminated={team2Eliminated} score={scores?.score2} isDark={isDark} />
      {totalScore != null && (
        <div className={`text-center py-1.5 text-xs font-mono text-fg/40 border-t ${isDark ? 'border-fg/10 bg-fg/[0.03]' : 'border-gray-200 bg-gray-50'}`}>
          Total: <span className="font-semibold text-fg/60">{totalScore}</span>
        </div>
      )}
    </div>
  );
}

function TeamRow({ team, isWinner, isEliminated, score, isDark }) {
  if (!team) {
    return (
      <div className={`flex items-center gap-2 px-3 py-2.5 ${isDark ? 'bg-fg/[0.03]' : 'bg-gray-50'}`}>
        <div className="w-6 h-6 rounded-full bg-fg/10" />
        <span className="text-sm text-fg/30">TBD</span>
      </div>
    );
  }

  return (
    <div className={`flex items-center gap-2 px-3 py-2.5 ${isWinner ? (isDark ? 'bg-emerald-500/8' : 'bg-emerald-50/60') : ''}`}>
      {team.logo ? (
        <img src={getThemedLogo(team.logo, isDark)} alt="" className={`w-6 h-6 object-contain flex-shrink-0 ${isEliminated ? 'opacity-40 grayscale' : ''}`} />
      ) : (
        <div className="w-6 h-6 rounded-full bg-fg/10 flex-shrink-0" />
      )}
      <div className="flex items-center gap-1.5 flex-1 min-w-0">
        {team.seed && (
          <span className={`text-xs font-mono ${isEliminated ? 'text-fg/20' : 'text-fg/40'}`}>{team.seed}</span>
        )}
        <span className={`text-sm font-medium truncate ${
          isEliminated ? 'text-fg/30 line-through' :
          isWinner ? (isDark ? 'text-emerald-400' : 'text-emerald-700') : 'text-fg'
        }`}>
          {team.shortName || team.abbreviation || team.name}
        </span>
        {isWinner && !isEliminated && (
          <span className={`text-xs font-bold flex-shrink-0 ${isDark ? 'text-emerald-400' : 'text-emerald-600'}`}>WIN</span>
        )}
        {isEliminated && (
          <span className="text-xs font-bold text-red-500 flex-shrink-0">✗</span>
        )}
      </div>
      {score != null && (
        <span className={`font-mono font-bold text-sm flex-shrink-0 ${isEliminated ? 'text-fg/30' : 'text-fg/70'}`}>{score}</span>
      )}
    </div>
  );
}

function SemiMatchup({ team1, team2, winnerId, eliminatedTeamIds, isDark }) {
  const t1Winner = team1 && String(winnerId) === String(team1.id);
  const t2Winner = team2 && String(winnerId) === String(team2.id);
  const t1Eliminated = team1 && eliminatedTeamIds.includes(String(team1.id));
  const t2Eliminated = team2 && eliminatedTeamIds.includes(String(team2.id));

  return (
    <div className={`rounded-lg overflow-hidden border ${isDark ? 'border-fg/10' : 'border-gray-200'}`}>
      <SemiTeamRow team={team1} isWinner={t1Winner} isEliminated={t1Eliminated} isDark={isDark} />
      <div className={`border-t ${isDark ? 'border-fg/10' : 'border-gray-200'}`} />
      <SemiTeamRow team={team2} isWinner={t2Winner} isEliminated={t2Eliminated} isDark={isDark} />
    </div>
  );
}

function SemiTeamRow({ team, isWinner, isEliminated, isDark }) {
  if (!team) {
    return (
      <div className="flex items-center gap-1.5 px-2 py-2">
        <div className="w-5 h-5 rounded-full bg-fg/10" />
        <span className="text-sm text-fg/30">TBD</span>
      </div>
    );
  }

  return (
    <div className={`flex items-center gap-1.5 px-2 py-2 ${isWinner ? (isDark ? 'bg-emerald-500/8' : 'bg-emerald-50/60') : ''}`}>
      {team.logo ? (
        <img src={getThemedLogo(team.logo, isDark)} alt="" className={`w-5 h-5 object-contain flex-shrink-0 ${isEliminated ? 'opacity-40 grayscale' : ''}`} />
      ) : (
        <div className="w-5 h-5 rounded-full bg-fg/10 flex-shrink-0" />
      )}
      <div className="flex items-center gap-1 flex-1 min-w-0">
        {team.seed && (
          <span className={`text-xs font-mono ${isEliminated ? 'text-fg/20' : 'text-fg/40'}`}>{team.seed}</span>
        )}
        <span className={`text-sm truncate ${
          isEliminated ? 'text-fg/30 line-through' :
          isWinner ? (isDark ? 'text-emerald-400 font-medium' : 'text-emerald-700 font-medium') : 'text-fg/80'
        }`}>
          {team.abbreviation || team.shortName || team.name}
        </span>
        {isEliminated && (
          <span className="text-xs font-bold text-red-500 flex-shrink-0">✗</span>
        )}
      </div>
    </div>
  );
}
