import { useState, useEffect } from 'react';
import { Loader2, ChevronDown, ChevronUp } from 'lucide-react';
import { bracketAPI } from '../../api';
import { useTheme } from '../../context/ThemeContext';
import ReactMarkdown from 'react-markdown';
import DraftBadge from './DraftBadge';

function getThemeLogo(logoUrl, isDark) {
  if (!logoUrl) return logoUrl;
  return isDark ? logoUrl.replace('/500/', '/500-dark/') : logoUrl;
}

function shortDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function ordinal(n) {
  const num = parseInt(n);
  if (isNaN(num)) return n;
  const s = ['th', 'st', 'nd', 'rd'];
  const v = num % 100;
  return num + (s[(v - 20) % 10] || s[v] || s[0]);
}

const COMPARE_STATS = [
  { key: 'avgPoints', alt: 'points', label: 'PPG', fullLabel: 'Points Per Game', lowerBetter: false },
  { key: 'avgPointsAgainst', alt: 'pointsAgainst', label: 'Opp PPG', fullLabel: 'Opp Points Per Game', lowerBetter: true },
  { key: 'avgRebounds', alt: 'rebounds', label: 'RPG', fullLabel: 'Rebounds Per Game', lowerBetter: false },
  { key: 'avgAssists', alt: 'assists', label: 'APG', fullLabel: 'Assists Per Game', lowerBetter: false },
  { key: 'fieldGoalPct', label: 'FG%', fullLabel: 'Field Goal %', lowerBetter: false },
  { key: 'threePointFieldGoalPct', alt: 'threePointPct', label: '3PT%', fullLabel: '3-Point %', lowerBetter: false },
  { key: 'freeThrowPct', label: 'FT%', fullLabel: 'Free Throw %', lowerBetter: false },
  { key: 'avgSteals', alt: 'steals', label: 'SPG', fullLabel: 'Steals Per Game', lowerBetter: false },
  { key: 'avgBlocks', alt: 'blocks', label: 'BPG', fullLabel: 'Blocks Per Game', lowerBetter: false },
  { key: 'avgTurnovers', alt: 'turnovers', label: 'TPG', fullLabel: 'Turnovers Per Game', lowerBetter: true },
];

function getStat(stats, key, alt) {
  return stats?.[key]?.value || (alt && stats?.[alt]?.value) || null;
}

export default function MatchupComparisonTab({ team1Data, team2Data, team1Info, team2Info, prediction, season }) {
  const { isDark } = useTheme();
  const [matchupReport, setMatchupReport] = useState(null);
  const [conciseReport, setConciseReport] = useState(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [reportError, setReportError] = useState(false);
  const [reportMode, setReportMode] = useState(() => localStorage.getItem('matchupReportMode') || 'concise');
  const [expandedT1, setExpandedT1] = useState(false);
  const [expandedT2, setExpandedT2] = useState(false);
  const [tappedLabel, setTappedLabel] = useState(null);

  useEffect(() => {
    if (!team1Info?.id || !team2Info?.id) return;
    setReportLoading(true);
    setReportError(false);
    bracketAPI.getMatchupReport(season, team1Info.id, team2Info.id)
      .then(data => {
        setMatchupReport(data.matchupReport || null);
        setConciseReport(data.conciseReport || null);
        if (!data.matchupReport) setReportError(true);
      })
      .catch(() => setReportError(true))
      .finally(() => setReportLoading(false));
  }, [team1Info?.id, team2Info?.id, season]);

  const handleModeChange = (mode) => {
    setReportMode(mode);
    localStorage.setItem('matchupReportMode', mode);
  };

  const t1Stats = team1Data?.seasonStats || {};
  const t2Stats = team2Data?.seasonStats || {};
  const t1Color = team1Info?.color || '#6366f1';
  const t2Color = team2Info?.color || '#f59e0b';

  const t1Players = team1Data?.keyPlayers || [];
  const t2Players = team2Data?.keyPlayers || [];

  return (
    <div className="space-y-6">
      {/* Matchup Analysis — at the top */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold text-fg/60 uppercase tracking-wider">Matchup Analysis</h3>
          {matchupReport && !reportLoading && (
            <div className="flex items-center bg-fg/5 rounded-lg p-0.5">
              <button
                onClick={() => handleModeChange('full')}
                className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${
                  reportMode === 'full' ? 'bg-fg/10 text-fg' : 'text-fg/60 hover:text-fg/60'
                }`}
              >
                Full
              </button>
              <button
                onClick={() => handleModeChange('concise')}
                className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${
                  reportMode === 'concise' ? 'bg-fg/10 text-fg' : 'text-fg/60 hover:text-fg/60'
                }`}
              >
                TL;DR
              </button>
            </div>
          )}
        </div>
        {reportLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-5 h-5 animate-spin text-fg/30 mr-2" />
            <span className="text-sm text-fg/60">Generating matchup analysis...</span>
          </div>
        ) : reportError || !matchupReport ? (
          <div className="text-sm text-fg/60 text-center py-6">
            Matchup analysis unavailable
          </div>
        ) : (
          <div className="prose-scout text-sm text-fg/80 leading-relaxed">
            <ReactMarkdown>
              {reportMode === 'concise' ? (conciseReport || matchupReport) : matchupReport}
            </ReactMarkdown>
          </div>
        )}
      </div>

      {/* Win Probability */}
      {prediction && (
        <div>
          <div className="text-sm text-fg/60 text-center mb-2 uppercase tracking-wider font-medium">Win Probability</div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 w-20 justify-end">
              {team1Info?.logo && <img src={getThemeLogo(team1Info.logo, isDark)} alt="" className="w-5 h-5 object-contain" />}
              <span className="text-sm font-mono font-bold text-fg/70">
                {Math.round(prediction.homeWinPct || 50)}%
              </span>
            </div>
            <div className="flex-1 h-3 rounded-full overflow-hidden bg-fg/10 flex">
              <div
                className="h-full rounded-l-full transition-all duration-500"
                style={{ width: `${prediction.homeWinPct || 50}%`, backgroundColor: t1Color }}
              />
              <div
                className="h-full rounded-r-full transition-all duration-500"
                style={{ width: `${100 - (prediction.homeWinPct || 50)}%`, backgroundColor: t2Color }}
              />
            </div>
            <div className="flex items-center gap-1.5 w-20">
              <span className="text-sm font-mono font-bold text-fg/70">
                {Math.round(100 - (prediction.homeWinPct || 50))}%
              </span>
              {team2Info?.logo && <img src={getThemeLogo(team2Info.logo, isDark)} alt="" className="w-5 h-5 object-contain" />}
            </div>
          </div>
        </div>
      )}

      {/* Stat Comparison — values centered under each team */}
      <div>
        <h3 className="text-sm font-bold text-fg/60 uppercase tracking-wider mb-3">Stat Comparison</h3>
        {/* Team header row */}
        <div className="flex items-center mb-2">
          <div className="flex-1 flex items-center justify-center gap-1.5">
            {team1Info?.logo && <img src={getThemeLogo(team1Info.logo, isDark)} alt="" className="w-5 h-5 object-contain" />}
            <span className="text-sm font-semibold text-fg">{team1Info?.abbreviation || team1Info?.name}</span>
          </div>
          <div className="w-16 md:w-40" />
          <div className="flex-1 flex items-center justify-center gap-1.5">
            {team2Info?.logo && <img src={getThemeLogo(team2Info.logo, isDark)} alt="" className="w-5 h-5 object-contain" />}
            <span className="text-sm font-semibold text-fg">{team2Info?.abbreviation || team2Info?.name}</span>
          </div>
        </div>
        <div className="space-y-0.5">
          {COMPARE_STATS.map(stat => {
            const v1 = parseFloat(getStat(t1Stats, stat.key, stat.alt)) || 0;
            const v2 = parseFloat(getStat(t2Stats, stat.key, stat.alt)) || 0;

            let t1Advantage = false;
            let t2Advantage = false;
            if (v1 !== v2) {
              if (stat.lowerBetter) {
                t1Advantage = v1 < v2;
                t2Advantage = v2 < v1;
              } else {
                t1Advantage = v1 > v2;
                t2Advantage = v2 > v1;
              }
            }

            return (
              <div key={stat.key} className="flex items-center py-1 border-b border-fg/5 last:border-0">
                <span className={`flex-1 text-center text-sm font-mono ${t1Advantage ? 'font-bold text-fg' : 'text-fg/60'}`}>
                  {v1 ? v1.toFixed(1) : '—'}
                </span>
                <button
                  className="text-sm font-semibold text-fg/60 w-16 md:w-auto md:px-2 text-center md:hidden"
                  onClick={() => setTappedLabel(tappedLabel === stat.key ? null : stat.key)}
                >
                  {tappedLabel === stat.key ? stat.fullLabel : stat.label}
                </button>
                <span className="text-sm font-semibold text-fg/60 hidden md:block md:w-40 text-center">
                  {stat.fullLabel}
                </span>
                <span className={`flex-1 text-center text-sm font-mono ${t2Advantage ? 'font-bold text-fg' : 'text-fg/60'}`}>
                  {v2 ? v2.toFixed(1) : '—'}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Key Player Matchup */}
      {(t1Players.length > 0 || t2Players.length > 0) && (
        <div>
          <h3 className="text-sm font-bold text-fg/60 uppercase tracking-wider mb-3">Key Player Matchup</h3>
          <div className="space-y-3">
            {Array.from({ length: Math.min(3, Math.max(t1Players.length, t2Players.length)) }).map((_, i) => {
              const p1 = t1Players[i];
              const p2 = t2Players[i];

              const statRows = [
                { label: 'PTS', v1: p1?.stats?.ppg, v2: p2?.stats?.ppg },
                { label: 'REB', v1: p1?.stats?.rpg, v2: p2?.stats?.rpg },
                { label: 'AST', v1: p1?.stats?.apg, v2: p2?.stats?.apg },
                { label: 'STL', v1: p1?.stats?.spg, v2: p2?.stats?.spg },
                { label: 'BLK', v1: p1?.stats?.bpg, v2: p2?.stats?.bpg },
              ].filter(s => (parseFloat(s.v1) || 0) > 0 || (parseFloat(s.v2) || 0) > 0);

              return (
                <div key={i} className="py-4 border-b border-fg/5 last:border-0">
                  {/* Player names + headshots — stacked on mobile, inline on desktop */}
                  <div className="flex items-center justify-center gap-4 md:gap-6 mb-3">
                    {/* Player 1 */}
                    <div className="flex flex-col items-center gap-1 flex-1">
                      <div className="relative">
                        {p1?.headshot ? (
                          <img src={p1.headshot} alt="" className="w-20 h-20 md:w-24 md:h-24 rounded-full object-cover border-2" style={{ borderColor: t1Color }} />
                        ) : (
                          <div className="w-20 h-20 md:w-24 md:h-24 rounded-full bg-fg/10 flex items-center justify-center text-xl font-bold text-fg/30">
                            {p1?.name?.[0] || '?'}
                          </div>
                        )}
                        <DraftBadge rank={p1?.draftRank} teamColor={t1Color} />
                      </div>
                      <span className="text-sm font-semibold text-fg text-center truncate max-w-full">
                        {p1?.jersey && <span className="text-fg/60 mr-1">#{p1.jersey}</span>}{p1?.name || '—'}{p1?.position && <span className="text-fg/60 ml-1">· {p1.position}</span>}
                      </span>
                    </div>

                    <span className="text-base font-extrabold text-fg/60 flex-shrink-0">VS</span>

                    {/* Player 2 */}
                    <div className="flex flex-col items-center gap-1 flex-1">
                      <div className="relative">
                        {p2?.headshot ? (
                          <img src={p2.headshot} alt="" className="w-20 h-20 md:w-24 md:h-24 rounded-full object-cover border-2" style={{ borderColor: t2Color }} />
                        ) : (
                          <div className="w-20 h-20 md:w-24 md:h-24 rounded-full bg-fg/10 flex items-center justify-center text-xl font-bold text-fg/30">
                            {p2?.name?.[0] || '?'}
                          </div>
                        )}
                        <DraftBadge rank={p2?.draftRank} teamColor={t2Color} />
                      </div>
                      <span className="text-sm font-semibold text-fg text-center truncate max-w-full">
                        {p2?.jersey && <span className="text-fg/60 mr-1">#{p2.jersey}</span>}{p2?.name || '—'}{p2?.position && <span className="text-fg/60 ml-1">· {p2.position}</span>}
                      </span>
                    </div>
                  </div>
                  {/* Stat comparison rows — centered under each player */}
                  <div className="space-y-0.5">
                    {statRows.map(s => {
                      const n1 = parseFloat(s.v1) || 0;
                      const n2 = parseFloat(s.v2) || 0;
                      return (
                        <div key={s.label} className="flex items-center py-0.5">
                          <span className={`flex-1 text-center text-sm font-mono ${n1 > n2 ? 'font-bold text-fg' : 'text-fg/60'}`}>
                            {n1 > 0 ? n1.toFixed(1) : '—'}
                          </span>
                          <span className="text-sm font-semibold text-fg/60 w-16 text-center">{s.label}</span>
                          <span className={`flex-1 text-center text-sm font-mono ${n2 > n1 ? 'font-bold text-fg' : 'text-fg/60'}`}>
                            {n2 > 0 ? n2.toFixed(1) : '—'}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* BPI / Projections Comparison */}
      {team1Data?.bpiData && team2Data?.bpiData && (
        <div>
          <h3 className="text-sm font-bold text-fg/60 uppercase tracking-wider mb-3">Power Ratings</h3>
          <div className="grid grid-cols-3 gap-2 text-center">
            {[
              { label: 'BPI', get: (d) => d.bpiData?.bpi },
              { label: 'Offense', get: (d) => d.bpiData?.bpiOffense },
              { label: 'Defense', get: (d) => d.bpiData?.bpiDefense },
            ].map(({ label, get }) => {
              const d1 = get(team1Data);
              const d2 = get(team2Data);
              return (
                <div key={label} className="bg-fg/5 rounded-lg p-3">
                  <div className="text-sm text-fg/60 mb-1">{label}</div>
                  <div className="flex items-center justify-center gap-3">
                    <div className="text-right">
                      <div className="text-sm font-mono font-bold text-fg">{d1?.value || '—'}</div>
                      {d1?.rank && <div className="text-sm text-fg/60">#{d1.rank}</div>}
                    </div>
                    <div className="w-px h-8 bg-fg/10" />
                    <div className="text-left">
                      <div className="text-sm font-mono font-bold text-fg">{d2?.value || '—'}</div>
                      {d2?.rank && <div className="text-sm text-fg/60">#{d2.rank}</div>}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Tournament Projections side-by-side */}
          {(team1Data?.bpiData?.projections || team2Data?.bpiData?.projections) && (
            <div className="mt-3">
              <div className="text-sm text-fg/60 mb-2">Tournament Projections</div>
              <div className="space-y-1.5">
                {['sweet16', 'elite8', 'final4', 'championship', 'winner'].map(key => {
                  const labels = { sweet16: 'Sweet 16', elite8: 'Elite 8', final4: 'Final Four', championship: 'Championship', winner: 'Win Title' };
                  const v1 = team1Data?.bpiData?.projections?.[key];
                  const v2 = team2Data?.bpiData?.projections?.[key];
                  if (!v1 && !v2) return null;
                  const n1 = parseFloat(v1) || 0;
                  const n2 = parseFloat(v2) || 0;
                  return (
                    <div key={key} className="flex items-center gap-2">
                      <span className={`text-sm font-mono w-12 text-right ${n1 > n2 ? 'font-bold text-fg' : 'text-fg/60'}`}>
                        {v1 ? `${v1}%` : '—'}
                      </span>
                      <span className="text-sm text-fg/60 flex-1 text-center">{labels[key]}</span>
                      <span className={`text-sm font-mono w-12 ${n2 > n1 ? 'font-bold text-fg' : 'text-fg/60'}`}>
                        {v2 ? `${v2}%` : '—'}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Team Comparison */}
      <div>
        <h3 className="text-sm font-bold text-fg/60 uppercase tracking-wider mb-3">Team Comparison</h3>
        <div className="space-y-1">
          {[
            { label: 'Overall', fullLabel: 'Overall Record', v1: team1Data?.record, v2: team2Data?.record },
            { label: 'Conference', fullLabel: 'Conference', v1: team1Data?.conference, v2: team2Data?.conference },
            {
              label: 'vs Ranked', fullLabel: 'vs Ranked',
              v1: team1Data?.vsTop25 ? `${team1Data.vsTop25.wins}-${team1Data.vsTop25.losses}` : null,
              v2: team2Data?.vsTop25 ? `${team2Data.vsTop25.wins}-${team2Data.vsTop25.losses}` : null,
            },
            {
              label: 'SOS', fullLabel: 'Strength of Schedule',
              v1: team1Data?.bpiData?.sos?.rank ? `${ordinal(team1Data.bpiData.sos.rank)}` : null,
              v2: team2Data?.bpiData?.sos?.rank ? `${ordinal(team2Data.bpiData.sos.rank)}` : null,
              dot: true,
            },
            {
              label: 'SOR', fullLabel: 'Strength of Record',
              v1: team1Data?.bpiData?.sor?.rank ? `${ordinal(team1Data.bpiData.sor.rank)}` : null,
              v2: team2Data?.bpiData?.sor?.rank ? `${ordinal(team2Data.bpiData.sor.rank)}` : null,
              dot: true,
            },
          ].filter(({ v1, v2 }) => v1 || v2).map(({ label, fullLabel, v1, v2, dot }) => {
            // For ranked stats (SOS, SOR), lower rank is better — highlight the advantage
            const n1 = dot ? parseInt(v1) || 999 : 0;
            const n2 = dot ? parseInt(v2) || 999 : 0;
            return (
              <div key={label} className="flex items-center py-0.5">
                <span className={`flex-1 text-center text-sm font-medium ${dot && n1 < n2 ? 'font-bold text-fg' : dot && n2 < n1 ? 'text-fg/60' : 'text-fg'}`}>
                  {v1 || '—'}
                </span>
                <button
                  className="text-sm font-semibold text-fg/60 w-20 text-center md:hidden"
                  onClick={() => setTappedLabel(tappedLabel === label ? null : label)}
                >
                  {tappedLabel === label ? fullLabel : label}
                </button>
                <span className="text-sm font-semibold text-fg/60 hidden md:block md:w-44 text-center">
                  {fullLabel}
                </span>
                <span className={`flex-1 text-center text-sm font-medium ${dot && n2 < n1 ? 'font-bold text-fg' : dot && n1 < n2 ? 'text-fg/60' : 'text-fg'}`}>
                  {v2 || '—'}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Last 10 Games */}
      {(team1Data?.last10?.games?.length > 0 || team2Data?.last10?.games?.length > 0) && (
        <div>
          <h3 className="text-sm font-bold text-fg/60 uppercase tracking-wider mb-3">Last 10 Games</h3>

          {/* Desktop: side-by-side columns, always expanded */}
          <div className="hidden md:grid md:grid-cols-2 md:gap-3">
            {[
              { teamInfo: team1Info, last10: team1Data?.last10 },
              { teamInfo: team2Info, last10: team2Data?.last10 },
            ].map(({ teamInfo, last10 }, col) => last10?.games?.length > 0 && (
              <div key={col} className="bg-fg/5 rounded-lg overflow-hidden">
                <div className="px-3 py-2.5 border-b border-fg/10">
                  <div className="flex items-center gap-2">
                    {teamInfo?.logo && <img src={getThemeLogo(teamInfo.logo, isDark)} alt="" className="w-5 h-5 object-contain" />}
                    <span className="text-sm font-semibold text-fg">{teamInfo?.name || teamInfo?.abbreviation}</span>
                    <span className="text-sm font-bold text-fg ml-auto">{last10.record}</span>
                  </div>
                  <div className="text-sm text-fg/60 mt-0.5">
                    Home {last10.home}, Away {last10.away}
                    {last10.neutral !== '0-0' ? `, Neutral ${last10.neutral}` : ''}
                  </div>
                </div>
                <div className="px-3 py-1 space-y-0.5">
                  {last10.games.map((game, idx) => (
                    <div key={idx} className="flex items-center gap-1.5 text-sm py-1 border-b border-fg/5 last:border-0">
                      <span className="text-fg/40 font-mono w-10 flex-shrink-0">{shortDate(game.date)}</span>
                      <span className="text-fg/70 w-5 text-center flex-shrink-0">{game.atVs === 'vs' ? 'vs' : '@'}</span>
                      {game.opponent?.logo && <img src={getThemeLogo(game.opponent.logo, isDark)} alt="" className="w-4 h-4 object-contain flex-shrink-0" />}
                      <span className="text-fg/80 truncate flex-1">
                        {game.opponent?.rank && <span className="text-fg/60">#{game.opponent.rank} </span>}
                        {game.opponent?.name || game.opponent?.abbreviation}
                      </span>
                      <span className={`font-bold flex-shrink-0 ${game.result === 'W' ? 'text-emerald-500' : 'text-red-500'}`}>
                        {game.result}
                      </span>
                      <span className="font-mono text-fg/70 flex-shrink-0 w-14 text-right">{game.score}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* Mobile: stacked accordion */}
          <div className="md:hidden space-y-2">
            {[
              { teamInfo: team1Info, last10: team1Data?.last10, expanded: expandedT1, setExpanded: setExpandedT1 },
              { teamInfo: team2Info, last10: team2Data?.last10, expanded: expandedT2, setExpanded: setExpandedT2 },
            ].map(({ teamInfo, last10, expanded, setExpanded }, col) => last10?.games?.length > 0 && (
              <div key={col} className="bg-fg/5 rounded-lg overflow-hidden">
                <button
                  onClick={() => setExpanded(!expanded)}
                  className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-fg/5 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    {teamInfo?.logo && <img src={getThemeLogo(teamInfo.logo, isDark)} alt="" className="w-5 h-5 object-contain" />}
                    <span className="text-sm font-semibold text-fg">{teamInfo?.name || teamInfo?.abbreviation}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-fg/60">
                      Home {last10.home}, Away {last10.away}
                      {last10.neutral !== '0-0' ? `, Neutral ${last10.neutral}` : ''}
                    </span>
                    <span className="text-sm font-bold text-fg">{last10.record}</span>
                    {expanded ? <ChevronUp className="w-4 h-4 text-fg/60" /> : <ChevronDown className="w-4 h-4 text-fg/60" />}
                  </div>
                </button>
                {expanded && (
                  <div className="px-3 pb-2 space-y-0.5">
                    {last10.games.map((game, idx) => (
                      <div key={idx} className="flex items-center gap-1 text-sm py-1 border-t border-fg/5">
                        <span className="text-fg/40 font-mono w-10 flex-shrink-0">{shortDate(game.date)}</span>
                        <span className="text-fg/70 w-5 text-center flex-shrink-0">{game.atVs === 'vs' ? 'vs' : '@'}</span>
                        {game.opponent?.logo && <img src={getThemeLogo(game.opponent.logo, isDark)} alt="" className="w-4 h-4 object-contain flex-shrink-0" />}
                        <span className="text-fg/80 truncate flex-1">
                          {game.opponent?.rank && <span className="text-fg/60">#{game.opponent.rank} </span>}
                          {game.opponent?.name || game.opponent?.abbreviation}
                        </span>
                        <span className={`font-bold flex-shrink-0 ${game.result === 'W' ? 'text-emerald-500' : 'text-red-500'}`}>
                          {game.result}
                        </span>
                        <span className="font-mono text-fg/70 flex-shrink-0 w-12 text-right">{game.score}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
