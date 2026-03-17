import { useState, useEffect } from 'react';
import { Loader2, RefreshCw, Eye, Check, AlertCircle, ChevronDown } from 'lucide-react';
import { bracketAPI } from '../../api';
import ReactMarkdown from 'react-markdown';

export default function AdminMatchups() {
  const [season] = useState(new Date().getFullYear());
  const [matchups, setMatchups] = useState([]);
  const [rounds, setRounds] = useState([]);
  const [selectedRound, setSelectedRound] = useState(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [generatingId, setGeneratingId] = useState(null);
  const [progress, setProgress] = useState(null);
  const [viewReport, setViewReport] = useState(null);
  const [reportMode, setReportMode] = useState('concise');

  const fetchMatchups = async (round = null) => {
    setLoading(true);
    try {
      const data = await bracketAPI.getAdminMatchups(season, round);
      setMatchups(data.matchups || []);
      if (data.rounds?.length && !rounds.length) {
        setRounds(data.rounds);
        if (!selectedRound) setSelectedRound(data.rounds[0]);
      }
    } catch (err) {
      console.error('Failed to fetch matchups:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMatchups(selectedRound);
  }, [selectedRound, season]);

  const handleGenerateRound = async (force = false) => {
    if (generating || !selectedRound) return;
    setGenerating(true);
    setProgress({ generated: 0, total: filteredMatchups.length, status: 'generating' });

    try {
      const data = await bracketAPI.generateRoundMatchupReports(season, selectedRound, force);
      setProgress({
        generated: data.generated,
        failed: data.failed,
        total: data.total,
        status: 'done',
      });
      // Refresh list
      await fetchMatchups(selectedRound);
    } catch (err) {
      console.error('Failed to generate round reports:', err);
      setProgress({ status: 'error', error: err.message });
    } finally {
      setGenerating(false);
    }
  };

  const handleGenerateSingle = async (team1Id, team2Id, force = false) => {
    const key = `${team1Id}-${team2Id}`;
    setGeneratingId(key);
    try {
      await bracketAPI.generateMatchupReport(season, team1Id, team2Id, selectedRound, force);
      await fetchMatchups(selectedRound);
    } catch (err) {
      console.error('Failed to generate matchup report:', err);
    } finally {
      setGeneratingId(null);
    }
  };

  const handleViewReport = async (team1Id, team2Id, team1Name, team2Name) => {
    try {
      const data = await bracketAPI.getMatchupReport(season, team1Id, team2Id);
      setViewReport({
        team1Name,
        team2Name,
        report: data.matchupReport,
        conciseReport: data.conciseReport,
      });
    } catch (err) {
      console.error('Failed to fetch report:', err);
    }
  };

  const filteredMatchups = matchups.filter(m => !selectedRound || m.round === selectedRound);
  const generatedCount = filteredMatchups.filter(m => m.hasReport && m.hasConcise).length;
  const missingCount = filteredMatchups.length - generatedCount;

  return (
    <div>
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-display font-bold text-fg">Matchup Reports</h1>
          <p className="text-sm text-fg/50 mt-1">
            {generatedCount} / {filteredMatchups.length} reports generated
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Round selector */}
          <div className="relative">
            <select
              value={selectedRound || ''}
              onChange={(e) => setSelectedRound(e.target.value)}
              className="appearance-none bg-fg/5 text-fg text-sm px-3 py-2 pr-8 rounded-lg border border-fg/10 focus:outline-none focus:border-fg/30"
            >
              {rounds.map(r => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
            <ChevronDown className="w-4 h-4 text-fg/40 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>

          {missingCount > 0 && (
            <button
              onClick={() => handleGenerateRound(false)}
              disabled={generating}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 transition-colors"
            >
              {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              Generate Missing ({missingCount})
            </button>
          )}

          <button
            onClick={() => handleGenerateRound(true)}
            disabled={generating}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-fg/10 text-fg hover:bg-fg/15 disabled:opacity-50 transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${generating ? 'animate-spin' : ''}`} />
            Regenerate All
          </button>
        </div>
      </div>

      {/* Progress bar */}
      {progress && (
        <div className="mb-4">
          {progress.status === 'generating' && (
            <div className="w-full h-2 bg-fg/10 rounded-full overflow-hidden">
              <div className="h-full bg-amber-500 rounded-full animate-pulse" style={{ width: '100%' }} />
            </div>
          )}
          {progress.status === 'done' && (
            <div className="flex items-center gap-2 text-sm text-emerald-400">
              <Check className="w-4 h-4" />
              Generated {progress.generated} reports{progress.failed > 0 ? `, ${progress.failed} failed` : ''}
            </div>
          )}
          {progress.status === 'error' && (
            <div className="flex items-center gap-2 text-sm text-red-400">
              <AlertCircle className="w-4 h-4" />
              Error: {progress.error}
            </div>
          )}
        </div>
      )}

      {/* Matchup list */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-fg/30" />
        </div>
      ) : filteredMatchups.length === 0 ? (
        <div className="text-center py-16 text-fg/40">
          No matchups found for this round. Teams may be TBD.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {filteredMatchups.map((m) => {
            const key = `${m.team1Id}-${m.team2Id}`;
            const isGenerating = generatingId === key;
            const hasComplete = m.hasReport && m.hasConcise;

            return (
              <div
                key={key}
                className={`bg-surface border rounded-xl p-4 transition-colors ${
                  hasComplete ? 'border-fg/10' : 'border-amber-500/30'
                }`}
              >
                <div className="flex items-center justify-between">
                  {/* Teams */}
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      {m.team1Logo && <img src={m.team1Logo} alt="" className="w-6 h-6 object-contain flex-shrink-0" />}
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-fg truncate">
                          #{m.team1Seed} {m.team1Name}
                        </div>
                      </div>
                    </div>

                    <span className="text-sm text-fg/30 font-bold flex-shrink-0">vs</span>

                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      {m.team2Logo && <img src={m.team2Logo} alt="" className="w-6 h-6 object-contain flex-shrink-0" />}
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-fg truncate">
                          #{m.team2Seed} {m.team2Name}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1 flex-shrink-0 ml-2">
                    {hasComplete && (
                      <span className="text-emerald-400 mr-1">
                        <Check className="w-4 h-4" />
                      </span>
                    )}

                    {hasComplete && (
                      <button
                        onClick={() => handleViewReport(m.team1Id, m.team2Id, `#${m.team1Seed} ${m.team1Name}`, `#${m.team2Seed} ${m.team2Name}`)}
                        className="p-1.5 rounded-lg text-fg/40 hover:text-fg hover:bg-fg/10 transition-colors"
                        title="View report"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                    )}

                    <button
                      onClick={() => handleGenerateSingle(m.team1Id, m.team2Id, true)}
                      disabled={isGenerating}
                      className="p-1.5 rounded-lg text-fg/40 hover:text-fg hover:bg-fg/10 transition-colors disabled:opacity-50"
                      title={hasComplete ? 'Regenerate' : 'Generate'}
                    >
                      {isGenerating ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <RefreshCw className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>

                {/* Generated timestamp */}
                {m.generatedAt && (
                  <div className="text-sm text-fg/30 mt-1">
                    {hasComplete ? '✓' : '⚠'} {new Date(m.generatedAt).toLocaleDateString()}, {new Date(m.generatedAt).toLocaleTimeString()}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Report View Modal */}
      {viewReport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60" onClick={() => setViewReport(null)}>
          <div
            className="bg-surface rounded-2xl border border-fg/10 max-w-2xl w-full max-h-[80vh] overflow-y-auto p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-bold text-fg">{viewReport.team1Name} vs {viewReport.team2Name}</h2>
              </div>
              <button onClick={() => setViewReport(null)} className="text-fg/40 hover:text-fg text-xl">✕</button>
            </div>

            {/* Full / TL;DR toggle */}
            <div className="flex items-center bg-fg/5 rounded-lg p-0.5 w-fit mb-4">
              <button
                onClick={() => setReportMode('full')}
                className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${
                  reportMode === 'full' ? 'bg-fg/10 text-fg' : 'text-fg/40 hover:text-fg/60'
                }`}
              >
                Full Report
              </button>
              <button
                onClick={() => setReportMode('concise')}
                className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${
                  reportMode === 'concise' ? 'bg-fg/10 text-fg' : 'text-fg/40 hover:text-fg/60'
                }`}
              >
                TL;DR
              </button>
            </div>

            <div className="prose-scout text-sm text-fg/80 leading-relaxed">
              <ReactMarkdown>
                {reportMode === 'concise'
                  ? (viewReport.conciseReport || 'No concise report available')
                  : (viewReport.report || 'No report available')
                }
              </ReactMarkdown>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
