import { useState } from 'react';
import { ChevronDown, ChevronUp, ExternalLink } from 'lucide-react';

const STAT_DISPLAY = [
  { key: 'avgPoints', alt: 'points', label: 'PPG' },
  { key: 'avgPointsAgainst', alt: 'pointsAgainst', label: 'Opp PPG', invertRank: true },
  { key: 'avgRebounds', alt: 'rebounds', label: 'RPG' },
  { key: 'avgAssists', alt: 'assists', label: 'APG' },
  { key: 'fieldGoalPct', label: 'FG%' },
  { key: 'threePointFieldGoalPct', alt: 'threePointPct', label: '3PT%' },
  { key: 'freeThrowPct', label: 'FT%' },
  { key: 'avgSteals', alt: 'steals', label: 'SPG' },
  { key: 'avgBlocks', alt: 'blocks', label: 'BPG' },
  { key: 'avgTurnovers', alt: 'turnovers', label: 'TPG', invertRank: true },
];

const getRankColor = (rank, invert = false) => {
  if (!rank) return 'text-fg/40';
  const r = parseInt(rank);
  if (isNaN(r)) return 'text-fg/40';
  if (invert) {
    if (r <= 10) return 'text-red-400';
    if (r <= 22) return 'text-amber-400';
    return 'text-emerald-400';
  }
  if (r <= 10) return 'text-emerald-400';
  if (r <= 22) return 'text-amber-400';
  return 'text-red-400';
};

export default function TeamAnalysisCard({ team, teamColor }) {
  const [showAllGames, setShowAllGames] = useState(false);

  if (!team) {
    return (
      <div className="flex-1 flex items-center justify-center py-12 text-fg/30">
        Loading team data...
      </div>
    );
  }

  const stats = team.seasonStats || {};

  const getStat = (key, alt) => {
    return stats[key] || (alt && stats[alt]) || null;
  };

  return (
    <div className="flex-1 min-w-0">
      {/* Team Header */}
      <div className="flex items-center gap-3 mb-5">
        {team.logo && (
          <img src={team.logo} alt="" className="w-12 h-12 object-contain flex-shrink-0" />
        )}
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            {team.seed && (
              <span className="text-sm font-mono font-bold text-fg/50 bg-fg/10 rounded px-1.5 py-0.5">
                #{team.seed}
              </span>
            )}
            <h3 className="text-lg font-display font-bold text-fg truncate">{team.name}</h3>
          </div>
          <div className="flex items-center gap-2 text-sm text-fg/50 mt-0.5">
            <span>{team.record}</span>
            {team.conference && <><span className="text-fg/20">|</span><span>{team.conference}</span></>}
            {team.coach && <><span className="text-fg/20">|</span><span>HC: {team.coach}</span></>}
          </div>
        </div>
      </div>

      {/* Season Stats */}
      <div className="mb-5">
        <h4 className="text-sm font-bold text-fg/50 uppercase tracking-wider mb-2">Season Averages</h4>
        <div className="grid grid-cols-5 gap-x-2 gap-y-1.5">
          {STAT_DISPLAY.map(({ key, alt, label, invertRank }) => {
            const stat = getStat(key, alt);
            if (!stat) return null;
            return (
              <div key={key} className="text-center">
                <div className="text-xs text-fg/35">{label}</div>
                <div className="text-sm font-mono font-medium text-fg/80">{stat.value || '—'}</div>
                {stat.rank && (
                  <div className={`text-xs font-mono ${getRankColor(stat.rank, invertRank)}`}>
                    #{stat.rank}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Key Players */}
      {team.keyPlayers && team.keyPlayers.length > 0 && (
        <div className="mb-5">
          <h4 className="text-sm font-bold text-fg/50 uppercase tracking-wider mb-2">Key Players</h4>
          <div className="space-y-1.5">
            {team.keyPlayers.slice(0, 5).map((player, idx) => (
              <div key={player.id || idx} className="flex items-center gap-2 text-sm">
                {player.headshot ? (
                  <img src={player.headshot} alt="" className="w-7 h-7 rounded-full object-cover flex-shrink-0 bg-fg/10" />
                ) : (
                  <div className="w-7 h-7 rounded-full bg-fg/10 flex-shrink-0 flex items-center justify-center text-xs text-fg/30">
                    {player.jersey || '?'}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <span className="text-fg/80 font-medium truncate">{player.name}</span>
                  <span className="text-fg/30 ml-1 text-xs">{player.position}</span>
                </div>
                {player.year && (
                  <span className="text-xs text-fg/30 flex-shrink-0">{player.year}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Last 5 Games */}
      {team.last5 && team.last5.length > 0 && (
        <div className="mb-5">
          <h4 className="text-sm font-bold text-fg/50 uppercase tracking-wider mb-2">Last 5 Games</h4>
          <div className="space-y-1">
            {team.last5.map((game, idx) => (
              <div key={idx} className="flex items-center gap-2 text-sm py-1 border-b border-fg/5 last:border-0">
                <span className={`font-bold w-4 text-center ${game.result === 'W' ? 'text-emerald-400' : 'text-red-400'}`}>
                  {game.result}
                </span>
                <span className="text-fg/30 w-4 text-center">{game.atVs}</span>
                {game.opponent?.logo && (
                  <img src={game.opponent.logo} alt="" className="w-4 h-4 object-contain" />
                )}
                <span className="flex-1 text-fg/60 truncate">
                  {game.opponent?.rank && <span className="text-fg/40">#{game.opponent.rank} </span>}
                  {game.opponent?.name || game.opponent?.abbreviation}
                </span>
                <span className="font-mono text-fg/50">{game.score}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* vs Top 25 */}
      {team.vsTop25 && (team.vsTop25.wins > 0 || team.vsTop25.losses > 0) && (
        <div className="mb-5">
          <h4 className="text-sm font-bold text-fg/50 uppercase tracking-wider mb-2">
            vs Ranked Teams
            <span className="ml-2 font-mono text-fg/40 normal-case">
              {team.vsTop25.wins}-{team.vsTop25.losses}
            </span>
          </h4>
          {team.vsTop25.games && team.vsTop25.games.length > 0 && (
            <div className="space-y-1">
              {(showAllGames ? team.vsTop25.games : team.vsTop25.games.slice(0, 3)).map((game, idx) => (
                <div key={idx} className="flex items-center gap-2 text-sm py-1 border-b border-fg/5 last:border-0">
                  <span className={`font-bold w-4 text-center ${game.result === 'W' ? 'text-emerald-400' : 'text-red-400'}`}>
                    {game.result}
                  </span>
                  <span className="text-fg/30 w-4">{game.atVs}</span>
                  {game.opponent?.logo && <img src={game.opponent.logo} alt="" className="w-4 h-4 object-contain" />}
                  <span className="flex-1 text-fg/60 truncate">
                    #{game.opponent?.rank} {game.opponent?.name}
                  </span>
                  <span className="font-mono text-fg/50">{game.score}</span>
                </div>
              ))}
              {team.vsTop25.games.length > 3 && (
                <button
                  onClick={() => setShowAllGames(!showAllGames)}
                  className="text-xs text-violet-400 hover:text-violet-300 flex items-center gap-1 mt-1"
                >
                  {showAllGames ? <><ChevronUp className="w-3 h-3" /> Show less</> : <><ChevronDown className="w-3 h-3" /> Show all {team.vsTop25.games.length} games</>}
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Team Summary */}
      {team.summary && (
        <div className="mb-5">
          <h4 className="text-sm font-bold text-fg/50 uppercase tracking-wider mb-2">Scouting Report</h4>
          <p className="text-sm text-fg/60 leading-relaxed">{team.summary}</p>
        </div>
      )}

      {/* News Headlines */}
      {team.headlines && team.headlines.length > 0 && (
        <div>
          <h4 className="text-sm font-bold text-fg/50 uppercase tracking-wider mb-2">Latest News</h4>
          <div className="space-y-2">
            {team.headlines.map((article, idx) => (
              <div key={idx} className="group">
                <div className="text-sm text-fg/70 group-hover:text-fg transition-colors">
                  {article.headline}
                </div>
                {article.description && (
                  <div className="text-sm text-fg/40 mt-0.5 line-clamp-2">{article.description}</div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
