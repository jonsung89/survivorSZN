import { Trophy } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import { getThemedLogo } from '../../utils/logo';

function getDarkBgLogo(logoUrl) {
  if (!logoUrl) return logoUrl;
  return logoUrl.replace('/500/', '/500-dark/');
}

export default function BracketShareCard({ metadata, displayName }) {
  const { isDark } = useTheme();
  if (!metadata || metadata.type !== 'bracket_share') return null;

  const { champion, championship, semis, tiebreakerValue } = metadata;
  const championColor = champion?.color || '#6B7280';

  return (
    <div className="w-[300px] rounded-xl overflow-hidden" style={{ background: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)', border: isDark ? '1px solid rgba(255,255,255,0.08)' : '1px solid rgba(0,0,0,0.08)' }}>
      {/* Champion Banner */}
      {champion && (
        <div className="relative overflow-hidden py-3.5 px-3.5" style={{ background: championColor }}>
          <div className="absolute inset-0" style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.45) 0%, rgba(0,0,0,0.15) 50%, rgba(0,0,0,0.25) 100%)' }} />
          {champion.logo && (
            <img src={getDarkBgLogo(champion.logo)} alt="" className="absolute -right-2 top-1/2 -translate-y-1/2 w-24 h-24 object-contain opacity-[0.12] pointer-events-none" />
          )}
          <div className="relative z-10 flex items-center gap-3">
            {champion.logo && (
              <img src={getDarkBgLogo(champion.logo)} alt="" className="w-12 h-12 object-contain drop-shadow-md flex-shrink-0" />
            )}
            <div className="min-w-0">
              <div className="flex items-center gap-1">
                <Trophy className="w-3.5 h-3.5 text-amber-300" />
                <span className="text-xs font-bold uppercase tracking-wider text-amber-300/90">{displayName}'s Champion</span>
              </div>
              <div className="text-base font-display font-bold text-white drop-shadow-sm truncate">
                {champion.name || champion.abbreviation}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Championship + Final Four compact */}
      <div className="px-3 py-2.5 space-y-2">
        {/* Championship */}
        <div>
          <div className="text-xs font-semibold text-fg/55 uppercase tracking-wider mb-1">Championship</div>
          <div className="flex items-center justify-between gap-2">
            <MiniMatchup
              team1={championship?.team1}
              team2={championship?.team2}
              winnerId={champion?.id}
              isDark={isDark}
            />
            {tiebreakerValue != null && (
              <span className="text-sm font-mono font-semibold text-fg/70 flex-shrink-0">{tiebreakerValue} pts</span>
            )}
          </div>
        </div>

        {/* Final Four */}
        <div>
          <div className="text-xs font-semibold text-fg/55 uppercase tracking-wider mb-1">Final Four</div>
          <div className="flex gap-2">
            {semis?.map((semi, i) => (
              <div key={i} className={`flex-1 rounded-lg px-2 py-1.5 ${isDark ? 'bg-fg/[0.04]' : 'bg-gray-50'}`}>
                <MiniTeam team={semi.team1} isWinner={semi.team1 && String(semi.winnerId) === String(semi.team1.id)} isDark={isDark} />
                <MiniTeam team={semi.team2} isWinner={semi.team2 && String(semi.winnerId) === String(semi.team2.id)} isDark={isDark} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function MiniMatchup({ team1, team2, winnerId, isDark }) {
  const t1Winner = team1 && String(winnerId) === String(team1.id);
  const t2Winner = team2 && String(winnerId) === String(team2.id);

  return (
    <div className="flex items-center gap-2 flex-1 min-w-0">
      <TeamPill team={team1} isWinner={t1Winner} isDark={isDark} />
      <span className="text-sm text-fg/30">vs</span>
      <TeamPill team={team2} isWinner={t2Winner} isDark={isDark} />
    </div>
  );
}

function TeamPill({ team, isWinner, isDark }) {
  if (!team) return <span className="text-sm text-fg/30">TBD</span>;
  return (
    <div className={`flex items-center gap-1.5 ${isWinner ? '' : 'opacity-50'}`}>
      {team.logo && (
        <img src={getThemedLogo(team.logo, isDark)} alt="" className="w-6 h-6 object-contain" />
      )}
      <span className={`text-base font-medium truncate ${isWinner ? 'text-fg' : 'text-fg/50'}`}>
        {team.abbreviation || team.shortName}
      </span>
    </div>
  );
}

function MiniTeam({ team, isWinner, isDark }) {
  if (!team) return null;
  return (
    <div className={`flex items-center gap-1.5 py-0.5 ${isWinner ? '' : 'opacity-40'}`}>
      {team.logo && (
        <img src={getThemedLogo(team.logo, isDark)} alt="" className="w-6 h-6 object-contain" />
      )}
      <span className={`text-base truncate ${isWinner ? 'font-medium text-fg' : 'text-fg/60'}`}>
        {team.abbreviation || team.shortName}
      </span>
    </div>
  );
}
