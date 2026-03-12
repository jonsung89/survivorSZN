import { useState, useEffect, useRef } from 'react';
import { FileText, RefreshCw, Check, Clock, AlertCircle, X, Eye } from 'lucide-react';
import { adminAPI } from '../../api';
import { useToast } from '../../components/Toast';
import Loading from '../../components/Loading';

export default function AdminReports() {
  const { showToast } = useToast();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [generatingTeamId, setGeneratingTeamId] = useState(null);
  const [season, setSeason] = useState(new Date().getFullYear());
  const abortRef = useRef(false);
  const [selectedTeam, setSelectedTeam] = useState(null);
  const [report, setReport] = useState(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [reportTab, setReportTab] = useState('full');

  const viewReport = async (team) => {
    if (!team.hasReport) return;
    setSelectedTeam(team);
    setReportLoading(true);
    setReportTab('full');
    try {
      const result = await adminAPI.getReport(team.id, season);
      setReport(result);
    } catch (err) {
      showToast('Failed to load report', 'error');
      setSelectedTeam(null);
    } finally {
      setReportLoading(false);
    }
  };

  const closeReport = () => {
    setSelectedTeam(null);
    setReport(null);
  };

  const fetchReports = async () => {
    setLoading(true);
    try {
      const result = await adminAPI.getReports(season);
      setData(result);
    } catch (err) {
      console.error('Failed to fetch reports:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchReports(); }, [season]);

  const handleGenerateAll = async () => {
    if (generating) return;
    setGenerating(true);
    abortRef.current = false;
    showToast('Starting report generation for all teams...', 'info');

    try {
      const result = await adminAPI.generateReports({ season, force: false });
      showToast(`Generated ${result.generated || 0} reports. ${result.failed || 0} failed.`, result.failed ? 'error' : 'success');
      fetchReports();
    } catch (err) {
      showToast('Failed to generate reports: ' + err.message, 'error');
    } finally {
      setGenerating(false);
    }
  };

  const handleGenerateOne = async (teamId) => {
    if (generatingTeamId) return;
    setGeneratingTeamId(teamId);

    try {
      await adminAPI.generateReports({ season, teamId, force: true });
      showToast('Report regenerated successfully', 'success');
      fetchReports();
    } catch (err) {
      showToast('Failed to generate report: ' + err.message, 'error');
    } finally {
      setGeneratingTeamId(null);
    }
  };

  if (loading) return <Loading />;

  const generated = data?.reportsGenerated || 0;
  const total = data?.totalTeams || 0;
  const pct = total > 0 ? Math.round((generated / total) * 100) : 0;

  // Find the most recent report generation time
  const lastGenerated = data?.teams
    ?.filter(t => t.generatedAt)
    ?.map(t => new Date(t.generatedAt))
    ?.sort((a, b) => b - a)[0] || null;

  return (
    <div>
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-display font-bold text-fg">Scouting Reports</h1>
          <p className="text-sm text-fg/40 mt-1">
            {generated} / {total} reports generated ({pct}%)
          </p>
          {lastGenerated && (
            <p className="text-xs text-fg/30 mt-0.5">
              Last ran: {lastGenerated.toLocaleString()}
            </p>
          )}
        </div>

        <div className="flex items-center gap-3">
          <select
            value={season}
            onChange={(e) => setSeason(parseInt(e.target.value))}
            className="bg-surface border border-fg/10 rounded-lg px-3 py-2 text-sm text-fg focus:outline-none"
          >
            {[2026, 2025, 2024].map(y => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>

          <button
            onClick={handleGenerateAll}
            disabled={generating}
            className="flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${generating ? 'animate-spin' : ''}`} />
            {generating ? 'Generating...' : 'Generate All'}
          </button>
        </div>
      </div>

      {/* Progress bar */}
      {total > 0 && (
        <div className="bg-fg/5 rounded-full h-2 mb-6 overflow-hidden">
          <div
            className="bg-amber-400 h-full rounded-full transition-all duration-500"
            style={{ width: `${pct}%` }}
          />
        </div>
      )}

      {/* Teams grid */}
      {total === 0 ? (
        <div className="text-center py-12 text-fg/40">
          <FileText className="w-8 h-8 mx-auto mb-3 opacity-40" />
          <p>No tournament data available for {season}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {data.teams.map((team) => (
            <div
              key={team.id}
              onClick={() => viewReport(team)}
              className={`bg-surface rounded-xl border p-4 flex items-center gap-3 transition-colors ${
                team.hasReport
                  ? 'border-fg/5 cursor-pointer hover:border-fg/20 hover:bg-fg/[0.02]'
                  : 'border-amber-400/20'
              }`}
            >
              {/* Team logo */}
              {team.logo ? (
                <img src={team.logo} alt="" className="w-10 h-10 object-contain flex-shrink-0" />
              ) : (
                <div className="w-10 h-10 rounded-full bg-fg/10 flex-shrink-0" />
              )}

              {/* Team info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  {team.seed && (
                    <span className="text-xs font-bold text-fg/40">#{team.seed}</span>
                  )}
                  <span className="text-sm font-medium text-fg truncate">
                    {team.name || team.abbreviation}
                  </span>
                </div>
                {team.hasReport ? (
                  <div className="flex items-center gap-1 mt-0.5">
                    <Check className="w-3 h-3 text-emerald-400" />
                    <span className="text-xs text-fg/40">
                      {new Date(team.generatedAt).toLocaleDateString()}
                    </span>
                  </div>
                ) : (
                  <div className="flex items-center gap-1 mt-0.5">
                    <Clock className="w-3 h-3 text-amber-400" />
                    <span className="text-xs text-amber-400">Not generated</span>
                  </div>
                )}
              </div>

              {/* View button (for generated) */}
              {team.hasReport && (
                <button
                  onClick={(e) => { e.stopPropagation(); viewReport(team); }}
                  className="p-2 rounded-lg text-fg/30 hover:text-fg hover:bg-fg/10 transition-colors flex-shrink-0"
                  title="View report"
                >
                  <Eye className="w-4 h-4" />
                </button>
              )}

              {/* Regenerate button */}
              <button
                onClick={(e) => { e.stopPropagation(); handleGenerateOne(team.id); }}
                disabled={generatingTeamId === team.id || generating}
                className="p-2 rounded-lg text-fg/30 hover:text-fg hover:bg-fg/10 disabled:opacity-30 transition-colors flex-shrink-0"
                title="Regenerate report"
              >
                <RefreshCw className={`w-4 h-4 ${generatingTeamId === team.id ? 'animate-spin' : ''}`} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Report slide-over */}
      {selectedTeam && (
        <>
          <div className="fixed inset-0 bg-black/50 z-40" onClick={closeReport} />
          <div className="fixed inset-y-0 right-0 w-full max-w-2xl bg-surface border-l border-fg/10 z-50 flex flex-col shadow-2xl">
            {/* Header */}
            <div className="flex items-center gap-3 p-4 border-b border-fg/10">
              {selectedTeam.logo && (
                <img src={selectedTeam.logo} alt="" className="w-8 h-8 object-contain" />
              )}
              <div className="flex-1 min-w-0">
                <h2 className="text-lg font-display font-bold text-fg truncate">
                  {selectedTeam.seed && `#${selectedTeam.seed} `}
                  {selectedTeam.name || selectedTeam.abbreviation}
                </h2>
                {report?.generatedAt && (
                  <p className="text-xs text-fg/40">
                    Generated {new Date(report.generatedAt).toLocaleString()}
                  </p>
                )}
              </div>
              <button
                onClick={closeReport}
                className="p-2 rounded-lg text-fg/40 hover:text-fg hover:bg-fg/10 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Tabs */}
            {!reportLoading && report && (
              <div className="flex border-b border-fg/10">
                <button
                  onClick={() => setReportTab('full')}
                  className={`flex-1 px-4 py-2.5 text-sm font-medium transition-colors ${
                    reportTab === 'full'
                      ? 'text-amber-400 border-b-2 border-amber-400'
                      : 'text-fg/40 hover:text-fg'
                  }`}
                >
                  Full Report
                </button>
                {report.conciseReport && (
                  <button
                    onClick={() => setReportTab('concise')}
                    className={`flex-1 px-4 py-2.5 text-sm font-medium transition-colors ${
                      reportTab === 'concise'
                        ? 'text-amber-400 border-b-2 border-amber-400'
                        : 'text-fg/40 hover:text-fg'
                    }`}
                  >
                    Concise Report
                  </button>
                )}
              </div>
            )}

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-4">
              {reportLoading ? (
                <Loading />
              ) : report ? (
                <div className="prose prose-sm max-w-none text-fg/80 whitespace-pre-wrap text-sm leading-relaxed">
                  {reportTab === 'full' ? report.report : report.conciseReport}
                </div>
              ) : (
                <p className="text-fg/40 text-center py-8">No report data</p>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
