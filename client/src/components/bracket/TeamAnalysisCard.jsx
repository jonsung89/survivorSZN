import { useState, useEffect, useCallback } from 'react';
import { ChevronDown, ChevronUp, ExternalLink } from 'lucide-react';
import { bracketAPI } from '../../api';
import ReactMarkdown from 'react-markdown';

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

export default function TeamAnalysisCard({ team, teamColor, season }) {
  const [showAllGames, setShowAllGames] = useState(false);
  const [reportMode, setReportMode] = useState(() =>
    localStorage.getItem('scoutingReportMode') || 'detailed'
  );
  const [conciseReport, setConciseReport] = useState(null);
  const [loadingConcise, setLoadingConcise] = useState(false);

  // Fetch concise report on-demand when user toggles to concise
  useEffect(() => {
    if (reportMode !== 'concise' || !team?.id || !season) return;
    if (conciseReport?.teamId === team.id) return; // already loaded for this team

    let cancelled = false;
    setLoadingConcise(true);
    bracketAPI.getConciseReport(season, team.id)
      .then(data => {
        if (!cancelled && data?.conciseReport) {
          setConciseReport({ teamId: team.id, text: data.conciseReport });
        }
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoadingConcise(false); });

    return () => { cancelled = true; };
  }, [reportMode, team?.id, season]);

  const toggleReportMode = useCallback(() => {
    const next = reportMode === 'detailed' ? 'concise' : 'detailed';
    setReportMode(next);
    localStorage.setItem('scoutingReportMode', next);
  }, [reportMode]);

  if (!team) {
    return (
      <div className="flex-1 flex items-center justify-center py-12 text-fg/50">
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
      {/* Scouting Report */}
      {team.summary && (
        <div className="mb-5">
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-sm md:text-base font-bold text-fg/50 uppercase tracking-wider">Scouting Report</h4>
            <div className="flex rounded-full bg-fg/10 p-0.5 text-sm font-medium">
              <button
                onClick={() => reportMode !== 'detailed' && toggleReportMode()}
                className={`px-2.5 py-0.5 rounded-full transition-colors ${
                  reportMode === 'detailed' ? 'bg-fg/15 text-fg/80' : 'text-fg/40 hover:text-fg/60'
                }`}
              >
                Full
              </button>
              <button
                onClick={() => reportMode !== 'concise' && toggleReportMode()}
                className={`px-2.5 py-0.5 rounded-full transition-colors ${
                  reportMode === 'concise' ? 'bg-fg/15 text-fg/80' : 'text-fg/40 hover:text-fg/60'
                }`}
              >
                TL;DR
              </button>
            </div>
          </div>
          {reportMode === 'concise' ? (
            loadingConcise ? (
              <div className="flex items-center gap-2 text-sm text-fg/40 py-2">
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                Generating concise report...
              </div>
            ) : conciseReport?.teamId === team.id ? (
              <div className="text-base text-fg/60 leading-relaxed prose-scout">
                <ReactMarkdown>{conciseReport.text}</ReactMarkdown>
              </div>
            ) : (
              <div className="text-base text-fg/60 leading-relaxed prose-scout">
                <ReactMarkdown>{team.summary}</ReactMarkdown>
              </div>
            )
          ) : (
            <div className="text-base text-fg/60 leading-relaxed prose-scout">
              <ReactMarkdown>{team.summary}</ReactMarkdown>
            </div>
          )}
        </div>
      )}

      {/* Season Stats */}
      <div className="mb-5">
        <h4 className="text-sm md:text-base font-bold text-fg/50 uppercase tracking-wider mb-2">Season Averages</h4>
        <div className="grid grid-cols-5 gap-x-2 gap-y-1.5 md:gap-y-2">
          {STAT_DISPLAY.map(({ key, alt, label, invertRank }) => {
            const stat = getStat(key, alt);
            if (!stat) return null;
            return (
              <div key={key} className="text-center">
                <div className="text-sm text-fg/50">{label}</div>
                <div className="text-sm md:text-lg font-mono font-medium text-fg/80">{stat.value || '—'}</div>
                {stat.rank && (
                  <div className={`text-sm font-mono ${getRankColor(stat.rank, invertRank)}`}>
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
          <h4 className="text-sm md:text-base font-bold text-fg/50 uppercase tracking-wider mb-2">Key Players</h4>
          <div className="space-y-2.5 md:space-y-3">
            {team.keyPlayers.slice(0, 5).map((player, idx) => (
              <div key={player.id || idx} className="flex gap-2 md:gap-3">
                {/* Avatar — larger to span name + stats, vertically centered */}
                {player.headshot ? (
                  <img src={player.headshot} alt="" className="w-9 h-9 md:w-11 md:h-11 rounded-full object-cover flex-shrink-0 bg-fg/10 mt-0.5" />
                ) : (
                  <div className="w-9 h-9 md:w-11 md:h-11 rounded-full bg-fg/10 flex-shrink-0 flex items-center justify-center text-sm text-fg/50 mt-0.5">
                    {player.jersey || '?'}
                  </div>
                )}
                {/* Name + stats stacked */}
                <div className="flex-1 min-w-0">
                  {/* Name row */}
                  <div className="flex items-center text-sm md:text-base">
                    <span className="text-fg/80 font-medium truncate">{player.name}</span>
                    <span className="text-fg/50 ml-1 text-sm">{player.position}</span>
                    {player.year && (
                      <span className="text-sm text-fg/50 flex-shrink-0 ml-auto">{player.year}</span>
                    )}
                  </div>
                  {/* Stats line — directly under the name */}
                  {player.stats?.ppg && (
                    <>
                      {/* Mobile: compact stat line */}
                      <div className="flex items-center gap-3 mt-0.5 md:hidden flex-wrap">
                        {[
                          { val: player.stats.ppg, label: 'PTS' },
                          { val: player.stats.rpg, label: 'REB' },
                          { val: player.stats.apg, label: 'AST' },
                          { val: player.stats.spg, label: 'STL' },
                          { val: player.stats.bpg, label: 'BLK' },
                        ].filter(s => s.val && parseFloat(s.val) > 0).map(s => (
                          <span key={s.label} className="text-sm font-mono text-fg/60">
                            <span className="text-fg/80 font-semibold">{s.val}</span> <span className="text-fg/50">{s.label}</span>
                          </span>
                        ))}
                      </div>
                      {/* Desktop: fuller stat line */}
                      <div className="hidden md:flex items-center gap-4 mt-0.5">
                        {[
                          { val: player.stats.ppg, label: 'PTS' },
                          { val: player.stats.rpg, label: 'REB' },
                          { val: player.stats.apg, label: 'AST' },
                          { val: player.stats.spg, label: 'STL' },
                          { val: player.stats.bpg, label: 'BLK' },
                          { val: player.stats.fgPct, label: 'FG%', suffix: '%' },
                          { val: player.stats.mpg, label: 'MIN' },
                        ].filter(s => s.val && parseFloat(s.val) > 0).map(s => (
                          <span key={s.label} className="text-sm font-mono text-fg/60">
                            <span className="text-fg/80 font-semibold">{s.val}{s.suffix && !String(s.val).includes('%') ? s.suffix : ''}</span>{' '}
                            <span className="text-fg/50 text-sm">{s.label}</span>
                          </span>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Last 5 Games */}
      {team.last5 && team.last5.length > 0 && (
        <div className="mb-5">
          <h4 className="text-sm md:text-base font-bold text-fg/50 uppercase tracking-wider mb-2">Last 5 Games</h4>
          <div className="space-y-1">
            {team.last5.map((game, idx) => (
              <div key={idx} className="flex items-center gap-2 md:gap-3 text-sm md:text-base py-1 md:py-1.5 border-b border-fg/5 last:border-0">
                <span className={`font-bold w-4 md:w-5 text-center ${game.result === 'W' ? 'text-emerald-400' : 'text-red-400'}`}>
                  {game.result}
                </span>
                <span className="text-fg/50 w-4 md:w-5 text-center">{game.atVs}</span>
                {game.opponent?.logo && (
                  <img src={game.opponent.logo} alt="" className="w-4 h-4 md:w-5 md:h-5 object-contain" />
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
          <h4 className="text-sm md:text-base font-bold text-fg/50 uppercase tracking-wider mb-2">
            vs Ranked Teams
            <span className="ml-2 font-mono text-fg/40 normal-case">
              {team.vsTop25.wins}-{team.vsTop25.losses}
            </span>
          </h4>
          {team.vsTop25.games && team.vsTop25.games.length > 0 && (
            <div className="space-y-1">
              {(showAllGames ? team.vsTop25.games : team.vsTop25.games.slice(0, 3)).map((game, idx) => (
                <div key={idx} className="flex items-center gap-2 md:gap-3 text-sm md:text-base py-1 md:py-1.5 border-b border-fg/5 last:border-0">
                  <span className={`font-bold w-4 md:w-5 text-center ${game.result === 'W' ? 'text-emerald-400' : 'text-red-400'}`}>
                    {game.result}
                  </span>
                  <span className="text-fg/50 w-4 md:w-5">{game.atVs}</span>
                  {game.opponent?.logo && <img src={game.opponent.logo} alt="" className="w-4 h-4 md:w-5 md:h-5 object-contain" />}
                  <span className="flex-1 text-fg/60 truncate">
                    #{game.opponent?.rank} {game.opponent?.name}
                  </span>
                  <span className="font-mono text-fg/50">{game.score}</span>
                </div>
              ))}
              {team.vsTop25.games.length > 3 && (
                <button
                  onClick={() => setShowAllGames(!showAllGames)}
                  className="text-sm text-violet-400 hover:text-violet-300 flex items-center gap-1 mt-1"
                >
                  {showAllGames ? <><ChevronUp className="w-3 h-3 md:w-4 md:h-4" /> Show less</> : <><ChevronDown className="w-3 h-3 md:w-4 md:h-4" /> Show all {team.vsTop25.games.length} games</>}
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* BPI Power Rating */}
      {team.bpiData && (
        <div className="mb-5">
          <h4 className="text-sm md:text-base font-bold text-fg/50 uppercase tracking-wider mb-2">Power Rating</h4>
          {/* BPI scores */}
          <div className="grid grid-cols-3 gap-2 mb-3">
            {[
              { label: 'BPI', val: team.bpiData.bpi?.value, rank: team.bpiData.bpi?.rank },
              { label: 'Offense', val: team.bpiData.bpiOffense?.value, rank: team.bpiData.bpiOffense?.rank },
              { label: 'Defense', val: team.bpiData.bpiDefense?.value, rank: team.bpiData.bpiDefense?.rank },
            ].map(({ label, val, rank }) => (
              <div key={label} className="text-center py-2 rounded-lg bg-fg/5">
                <div className="text-sm text-fg/50">{label}</div>
                <div className="text-base md:text-xl font-mono font-bold text-fg/80">{val || '—'}</div>
                {rank && <div className={`text-sm font-mono ${getRankColor(rank.replace(/\D/g, ''))}`}>#{rank.replace(/\D/g, '')}</div>}
              </div>
            ))}
          </div>
          {/* SOS + Quality Wins */}
          <div className="flex items-center gap-4 text-sm mb-3">
            {team.bpiData.sos?.rank && (
              <span className="text-fg/50">
                SOS: <span className="font-mono font-semibold text-fg/70">{team.bpiData.sos.rank}</span>
              </span>
            )}
            {team.bpiData.qualityWins && (
              <span className="text-fg/50">
                vs Top 50 BPI: <span className="font-mono font-semibold text-fg/70">{team.bpiData.qualityWins.wins}-{team.bpiData.qualityWins.losses}</span>
              </span>
            )}
            {team.bpiData.sor?.rank && (
              <span className="text-fg/50">
                SOR: <span className="font-mono font-semibold text-fg/70">{team.bpiData.sor.rank}</span>
              </span>
            )}
          </div>
          {/* Tournament Projections */}
          {team.bpiData.projections && Object.values(team.bpiData.projections).some(v => v) && (
            <div>
              <div className="text-sm text-fg/50 mb-1.5">Tournament Projections</div>
              <div className="flex flex-wrap gap-2">
                {[
                  { label: 'Sweet 16', val: team.bpiData.projections.sweet16 },
                  { label: 'Elite 8', val: team.bpiData.projections.elite8 },
                  { label: 'Final Four', val: team.bpiData.projections.finalFour },
                  { label: 'Title Game', val: team.bpiData.projections.championship },
                  { label: 'Champion', val: team.bpiData.projections.titleWin },
                ].filter(p => p.val).map(({ label, val }) => (
                  <div key={label} className="px-2.5 py-1 rounded-full bg-fg/5 text-sm">
                    <span className="text-fg/40">{label}</span>{' '}
                    <span className="font-mono font-semibold text-fg/70">{val}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* News Headlines */}
      {team.headlines && team.headlines.length > 0 && (
        <div>
          <h4 className="text-sm md:text-base font-bold text-fg/50 uppercase tracking-wider mb-2">Latest News</h4>
          <div className="space-y-2 md:space-y-3">
            {team.headlines.map((article, idx) => (
              <div key={idx} className="group">
                <div className="text-sm md:text-base text-fg/70 group-hover:text-fg transition-colors">
                  {article.headline}
                </div>
                {article.description && (
                  <div className="text-sm md:text-base text-fg/40 mt-0.5 line-clamp-2">{article.description}</div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
