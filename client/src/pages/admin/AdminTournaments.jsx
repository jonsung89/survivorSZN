import { useState, useEffect, useMemo } from 'react';
import {
  Loader2, RefreshCw, ChevronDown, Users, Gamepad2, Trophy, Link2,
  Search, X, Check, AlertCircle, Clock, Calculator, MapPin, Tv, Calendar,
  Code, ChevronRight, Sparkles
} from 'lucide-react';
import { adminAPI, bracketAPI } from '../../api';
import { useToast } from '../../components/Toast';
import Loading from '../../components/Loading';

const ROUND_NAMES = {
  '-1': 'First Four',
  0: 'Round of 64',
  1: 'Round of 32',
  2: 'Sweet 16',
  3: 'Elite 8',
  4: 'Final Four',
  5: 'Championship',
};

const ROUND_SHORT = {
  '-1': 'FF',
  0: 'R64',
  1: 'R32',
  2: 'S16',
  3: 'E8',
  4: 'F4',
  5: 'CHAMP',
};

const STATUS_STYLES = {
  final: 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20',
  in_progress: 'bg-amber-500/10 text-amber-400 border border-amber-500/20',
  pending: 'bg-fg/5 text-fg/40 border border-fg/10',
  scheduled: 'bg-blue-500/10 text-blue-400 border border-blue-500/20',
  bracket_set: 'bg-violet-500/10 text-violet-400 border border-violet-500/20',
  completed: 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20',
};

function StatusBadge({ status }) {
  return (
    <span className={`px-2 py-0.5 rounded-full text-sm font-medium ${STATUS_STYLES[status] || STATUS_STYLES.pending}`}>
      {status?.replace('_', ' ') || 'unknown'}
    </span>
  );
}

export default function AdminTournaments() {
  const { showToast } = useToast();

  // Top-level state
  const [tournaments, setTournaments] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');

  // Tournament detail
  const [tournament, setTournament] = useState(null);
  const [teams, setTeams] = useState([]);
  const [games, setGames] = useState([]);
  const [challenges, setChallenges] = useState([]);
  const [detailLoading, setDetailLoading] = useState(false);

  // Action loading states
  const [syncing, setSyncing] = useState(false);
  const [recalculating, setRecalculating] = useState(false);

  // Team filters
  const [teamSearch, setTeamSearch] = useState('');
  const [teamRegionFilter, setTeamRegionFilter] = useState('all');

  // Game filters
  const [gameRoundFilter, setGameRoundFilter] = useState('all');
  const [gameStatusFilter, setGameStatusFilter] = useState('all');

  // Modals
  const [editingTeam, setEditingTeam] = useState(null);
  const [editingGame, setEditingGame] = useState(null);
  const [settingResult, setSettingResult] = useState(null);

  // Load tournament list
  useEffect(() => {
    loadTournaments();
  }, []);

  async function loadTournaments() {
    try {
      const data = await adminAPI.getTournaments();
      setTournaments(data.tournaments || []);
      if (data.tournaments?.length > 0 && !selectedId) {
        setSelectedId(data.tournaments[0].id);
      }
    } catch (err) {
      showToast('Failed to load tournaments', 'error');
    } finally {
      setLoading(false);
    }
  }

  // Load detail when selection changes
  useEffect(() => {
    if (selectedId) loadDetail(selectedId);
  }, [selectedId]);

  async function loadDetail(id) {
    setDetailLoading(true);
    try {
      const data = await adminAPI.getTournament(id);
      setTournament(data.tournament);
      setTeams(data.teams || []);
      setGames(data.games || []);
      setChallenges(data.challenges || []);
    } catch (err) {
      showToast('Failed to load tournament detail', 'error');
    } finally {
      setDetailLoading(false);
    }
  }

  // Sync from ESPN
  async function handleSync() {
    setSyncing(true);
    try {
      await adminAPI.syncTournament(selectedId);
      showToast('ESPN sync complete', 'success');
      await loadDetail(selectedId);
      await loadTournaments();
    } catch (err) {
      showToast('Sync failed', 'error');
    } finally {
      setSyncing(false);
    }
  }

  // Recalculate scores
  async function handleRecalculate() {
    setRecalculating(true);
    try {
      const data = await adminAPI.recalculateTournament(selectedId);
      showToast(`Recalculated ${data.recalculated} brackets across ${data.challenges} challenges`, 'success');
    } catch (err) {
      showToast('Recalculation failed', 'error');
    } finally {
      setRecalculating(false);
    }
  }

  // Generate daily recap
  const [generatingRecap, setGeneratingRecap] = useState(false);
  const [recapDateInput, setRecapDateInput] = useState('');
  const [showRecapPanel, setShowRecapPanel] = useState(false);
  const [selectedRecapLeagues, setSelectedRecapLeagues] = useState([]);
  const [recapLeaguePrompts, setRecapLeaguePrompts] = useState({});

  function handleGenerateRecapClick() {
    if (!selectedId || challenges.length === 0) {
      showToast('No challenges linked to this tournament', 'error');
      return;
    }
    const d = new Date();
    d.setDate(d.getDate() - 1);
    setRecapDateInput(d.toISOString().split('T')[0]);
    // Pre-select all leagues
    setSelectedRecapLeagues(challenges.map(c => c.league_id));
    setShowRecapPanel(true);
  }

  function toggleRecapLeague(leagueId) {
    setSelectedRecapLeagues(prev =>
      prev.includes(leagueId) ? prev.filter(id => id !== leagueId) : [...prev, leagueId]
    );
  }

  async function handleGenerateRecapConfirm() {
    if (!recapDateInput || selectedRecapLeagues.length === 0) return;
    setShowRecapPanel(false);
    setGeneratingRecap(true);
    let generated = 0;
    try {
      for (const c of challenges.filter(c => selectedRecapLeagues.includes(c.league_id))) {
        const prompt = recapLeaguePrompts[c.league_id]?.trim() || null;
        await bracketAPI.generateRecap(selectedId, c.league_id, recapDateInput, prompt);
        generated++;
      }
      showToast(`Generated recap for ${generated} league(s) on ${recapDateInput}`, 'success');
    } catch (err) {
      showToast(`Recap generation failed after ${generated}: ${err.message}`, 'error');
    } finally {
      setGeneratingRecap(false);
    }
  }

  // Filtered teams
  const filteredTeams = useMemo(() => {
    let result = teams;
    if (teamRegionFilter !== 'all') {
      result = result.filter(t => t.region_index === parseInt(teamRegionFilter));
    }
    if (teamSearch) {
      const q = teamSearch.toLowerCase();
      result = result.filter(t =>
        t.name.toLowerCase().includes(q) ||
        (t.abbreviation || '').toLowerCase().includes(q) ||
        (t.short_name || '').toLowerCase().includes(q)
      );
    }
    return result;
  }, [teams, teamRegionFilter, teamSearch]);

  // Filtered games
  const filteredGames = useMemo(() => {
    let result = games;
    if (gameRoundFilter !== 'all') {
      result = result.filter(g => g.round === parseInt(gameRoundFilter));
    }
    if (gameStatusFilter !== 'all') {
      result = result.filter(g => g.status === gameStatusFilter);
    }
    return result;
  }, [games, gameRoundFilter, gameStatusFilter]);

  // Helper: get team by ESPN id
  function getTeam(espnId) {
    return teams.find(t => t.espn_team_id === espnId);
  }

  // Helper: region name
  function regionName(idx) {
    if (idx == null || !tournament?.regions) return '—';
    return tournament.regions[idx] || `Region ${idx}`;
  }

  // Game round counts for filter badges
  const roundCounts = useMemo(() => {
    const counts = {};
    for (const g of games) {
      counts[g.round] = (counts[g.round] || 0) + 1;
    }
    return counts;
  }, [games]);

  const statusCounts = useMemo(() => {
    const counts = { pending: 0, in_progress: 0, final: 0, scheduled: 0 };
    for (const g of games) counts[g.status] = (counts[g.status] || 0) + 1;
    return counts;
  }, [games]);

  // Save team edit
  async function handleSaveTeam() {
    if (!editingTeam) return;
    try {
      await adminAPI.updateTournamentTeam(selectedId, editingTeam.id, editingTeam);
      showToast('Team updated', 'success');
      setEditingTeam(null);
      await loadDetail(selectedId);
    } catch (err) {
      showToast('Failed to update team', 'error');
    }
  }

  // Save game edit
  async function handleSaveGame() {
    if (!editingGame) return;
    try {
      await adminAPI.updateTournamentGame(selectedId, editingGame.id, editingGame);
      showToast('Game updated', 'success');
      setEditingGame(null);
      await loadDetail(selectedId);
    } catch (err) {
      showToast('Failed to update game', 'error');
    }
  }

  // Set game result
  async function handleSetResult() {
    if (!settingResult?.winningTeamId) return;
    try {
      await adminAPI.setTournamentGameResult(selectedId, settingResult.id, {
        winningTeamId: settingResult.winningTeamId,
        losingTeamId: settingResult.losingTeamId,
        winningScore: settingResult.winningScore ? parseInt(settingResult.winningScore) : null,
        losingScore: settingResult.losingScore ? parseInt(settingResult.losingScore) : null,
      });
      showToast('Result recorded', 'success');
      setSettingResult(null);
      await loadDetail(selectedId);
    } catch (err) {
      showToast('Failed to set result', 'error');
    }
  }

  if (loading) return <Loading />;

  const selected = tournaments.find(t => t.id === selectedId);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-fg">Tournament Data</h1>
          {/* Year dropdown */}
          <div className="relative">
            <select
              value={selectedId || ''}
              onChange={e => setSelectedId(e.target.value)}
              className="appearance-none bg-surface border border-fg/10 rounded-lg px-4 py-2 pr-8 text-fg text-sm font-medium cursor-pointer"
            >
              {tournaments.map(t => (
                <option key={t.id} value={t.id}>{t.season} Season</option>
              ))}
            </select>
            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-fg/40 pointer-events-none" />
          </div>
          {selected && <StatusBadge status={selected.status} />}
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleSync}
            disabled={syncing}
            className="flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white rounded-lg text-sm font-medium disabled:opacity-50 transition-colors"
          >
            {syncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            Sync ESPN
          </button>
          <button
            onClick={handleRecalculate}
            disabled={recalculating}
            className="flex items-center gap-2 px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-sm font-medium disabled:opacity-50 transition-colors"
          >
            {recalculating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Calculator className="w-4 h-4" />}
            Recalculate
          </button>
          <button
            onClick={handleGenerateRecapClick}
            disabled={generatingRecap}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-medium disabled:opacity-50 transition-colors"
          >
            {generatingRecap ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            Generate Recap
          </button>
        </div>
      </div>

      {/* Recap Generation Panel */}
      {showRecapPanel && (
        <div className="bg-fg/5 border border-fg/10 rounded-xl p-4 mb-4 animate-in">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-amber-500" />
              <span className="text-sm font-semibold text-fg">Generate Daily Recap</span>
            </div>
            <button onClick={() => setShowRecapPanel(false)} className="text-fg/40 hover:text-fg/60">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="flex items-center gap-3 mb-3">
            <label className="text-sm text-fg/60">Date:</label>
            <input
              type="date"
              value={recapDateInput}
              onChange={(e) => setRecapDateInput(e.target.value)}
              className="px-3 py-1.5 bg-fg/10 text-fg rounded-lg text-sm border border-fg/20"
            />
          </div>
          <div className="mb-3">
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm text-fg/60">Leagues to generate for:</label>
              <button
                onClick={() => setSelectedRecapLeagues(
                  selectedRecapLeagues.length === challenges.length ? [] : challenges.map(c => c.league_id)
                )}
                className="text-sm text-fg/40 hover:text-fg/60"
              >
                {selectedRecapLeagues.length === challenges.length ? 'Deselect all' : 'Select all'}
              </button>
            </div>
            <div className="space-y-1.5">
              {challenges.map(c => (
                <div key={c.league_id} className="rounded-lg hover:bg-fg/5">
                  <label className="flex items-center gap-2.5 px-3 py-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedRecapLeagues.includes(c.league_id)}
                      onChange={() => toggleRecapLeague(c.league_id)}
                      className="w-4 h-4 rounded accent-emerald-500"
                    />
                    <span className="text-sm text-fg">{c.league_name}</span>
                    <span className="text-sm text-fg/30 ml-auto">{c.bracket_count || 0} brackets</span>
                  </label>
                  {selectedRecapLeagues.includes(c.league_id) && (
                    <div className="px-3 pb-2 pl-9">
                      <textarea
                        value={recapLeaguePrompts[c.league_id] || ''}
                        onChange={(e) => setRecapLeaguePrompts(prev => ({ ...prev, [c.league_id]: e.target.value }))}
                        placeholder="Custom instructions for this league's recap (optional)&#10;e.g. &quot;Be more hopeful about Eunji Kim&quot; or &quot;Highlight the rivalry between David and Brian&quot;"
                        rows={2}
                        className="w-full px-3 py-2 bg-fg/10 text-fg rounded-lg text-sm border border-fg/20 placeholder:text-fg/30 resize-y"
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
          <button
            onClick={handleGenerateRecapConfirm}
            disabled={selectedRecapLeagues.length === 0}
            className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-medium disabled:opacity-50 transition-colors"
          >
            <Sparkles className="w-4 h-4" />
            Generate for {selectedRecapLeagues.length} league{selectedRecapLeagues.length !== 1 ? 's' : ''}
          </button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 bg-fg/5 rounded-lg p-1">
        {['overview', 'teams', 'games'].map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 px-4 py-2 rounded-md text-sm font-medium transition-colors capitalize ${
              activeTab === tab
                ? 'bg-surface text-fg shadow-sm'
                : 'text-fg/40 hover:text-fg/60'
            }`}
          >
            {tab}
            {tab === 'teams' && teams.length > 0 && <span className="ml-1.5 text-fg/30">{teams.length}</span>}
            {tab === 'games' && games.length > 0 && <span className="ml-1.5 text-fg/30">{games.length}</span>}
          </button>
        ))}
      </div>

      {detailLoading ? (
        <Loading />
      ) : (
        <>
          {activeTab === 'overview' && tournament && <OverviewTab tournament={tournament} teams={teams} games={games} challenges={challenges} regionName={regionName} />}
          {activeTab === 'teams' && (
            <TeamsTab
              teams={filteredTeams}
              allTeams={teams}
              regionName={regionName}
              regions={tournament?.regions || []}
              search={teamSearch}
              setSearch={setTeamSearch}
              regionFilter={teamRegionFilter}
              setRegionFilter={setTeamRegionFilter}
              onEdit={setEditingTeam}
            />
          )}
          {activeTab === 'games' && (
            <GamesTab
              games={filteredGames}
              getTeam={getTeam}
              regionName={regionName}
              roundFilter={gameRoundFilter}
              setRoundFilter={setGameRoundFilter}
              statusFilter={gameStatusFilter}
              setStatusFilter={setGameStatusFilter}
              roundCounts={roundCounts}
              statusCounts={statusCounts}
              onEdit={setEditingGame}
              onSetResult={(game) => setSettingResult({
                ...game,
                winningTeamId: game.winning_team_espn_id || '',
                losingTeamId: game.losing_team_espn_id || '',
                winningScore: game.team1_score || '',
                losingScore: game.team2_score || '',
              })}
              onRefresh={async (gameId) => {
                try {
                  await adminAPI.refreshGameFromESPN(selectedId, gameId);
                  showToast('Game refreshed from ESPN', 'success');
                  await loadDetail(selectedId);
                } catch (err) {
                  showToast(err.message || 'Failed to refresh from ESPN', 'error');
                }
              }}
            />
          )}
        </>
      )}

      {/* Edit Team Modal */}
      {editingTeam && (
        <Modal title="Edit Team" onClose={() => setEditingTeam(null)} onSave={handleSaveTeam}>
          <div className="space-y-3">
            <Field label="Name" value={editingTeam.name} onChange={v => setEditingTeam({ ...editingTeam, name: v })} />
            <Field label="Abbreviation" value={editingTeam.abbreviation || ''} onChange={v => setEditingTeam({ ...editingTeam, abbreviation: v })} />
            <div className="grid grid-cols-2 gap-3">
              <Field label="Seed" value={editingTeam.seed} type="number" onChange={v => setEditingTeam({ ...editingTeam, seed: parseInt(v) || 0 })} />
              <div>
                <label className="block text-sm text-fg/50 mb-1">Region</label>
                <select
                  value={editingTeam.region_index}
                  onChange={e => setEditingTeam({ ...editingTeam, region_index: parseInt(e.target.value) })}
                  className="w-full bg-fg/5 border border-fg/10 rounded-lg px-3 py-2 text-fg text-sm"
                >
                  {(tournament?.regions || []).map((r, i) => (
                    <option key={i} value={i}>{r}</option>
                  ))}
                </select>
              </div>
            </div>
            <Field label="Record" value={editingTeam.record || ''} onChange={v => setEditingTeam({ ...editingTeam, record: v })} />
            <label className="flex items-center gap-2 text-sm text-fg/70 cursor-pointer">
              <input
                type="checkbox"
                checked={editingTeam.eliminated || false}
                onChange={e => setEditingTeam({ ...editingTeam, eliminated: e.target.checked })}
                className="rounded"
              />
              Eliminated
            </label>
          </div>
        </Modal>
      )}

      {/* Edit Game Modal */}
      {editingGame && (
        <Modal title="Edit Game" onClose={() => setEditingGame(null)} onSave={handleSaveGame}>
          <div className="space-y-3">
            <div className="text-sm text-fg/50">
              {ROUND_NAMES[editingGame.round]} {editingGame.slot_number ? `· Slot ${editingGame.slot_number}` : ''} {editingGame.region_index != null ? `· ${regionName(editingGame.region_index)}` : ''}
            </div>
            <Field label="Venue" value={editingGame.venue || ''} onChange={v => setEditingGame({ ...editingGame, venue: v })} />
            <Field label="Broadcast" value={editingGame.broadcast || ''} onChange={v => setEditingGame({ ...editingGame, broadcast: v })} />
            <Field label="Start Time" value={editingGame.start_time ? new Date(editingGame.start_time).toISOString().slice(0, 16) : ''} type="datetime-local" onChange={v => setEditingGame({ ...editingGame, start_time: v })} />
            <div>
              <label className="block text-sm text-fg/50 mb-1">Status</label>
              <select
                value={editingGame.status}
                onChange={e => setEditingGame({ ...editingGame, status: e.target.value })}
                className="w-full bg-fg/5 border border-fg/10 rounded-lg px-3 py-2 text-fg text-sm"
              >
                <option value="pending">Pending</option>
                <option value="scheduled">Scheduled</option>
                <option value="in_progress">In Progress</option>
                <option value="final">Final</option>
              </select>
            </div>
          </div>
        </Modal>
      )}

      {/* Set Result Modal */}
      {settingResult && (
        <Modal title="Set Game Result" onClose={() => setSettingResult(null)} onSave={handleSetResult}>
          <div className="space-y-4">
            <div className="text-sm text-fg/50">
              {ROUND_NAMES[settingResult.round]} {settingResult.slot_number ? `· Slot ${settingResult.slot_number}` : ''}
            </div>
            {/* Team buttons */}
            <div className="space-y-2">
              <label className="block text-sm text-fg/50">Winner</label>
              {[settingResult.team1_espn_id, settingResult.team2_espn_id].filter(Boolean).map(tid => {
                const team = getTeam(tid);
                const isSelected = settingResult.winningTeamId === tid;
                return (
                  <button
                    key={tid}
                    onClick={() => {
                      const other = tid === settingResult.team1_espn_id ? settingResult.team2_espn_id : settingResult.team1_espn_id;
                      setSettingResult({ ...settingResult, winningTeamId: tid, losingTeamId: other });
                    }}
                    className={`w-full flex items-center gap-3 p-3 rounded-lg border text-left transition-colors ${
                      isSelected
                        ? 'bg-emerald-500/10 border-emerald-500/30 text-fg'
                        : 'bg-fg/5 border-fg/10 text-fg/60 hover:border-fg/20'
                    }`}
                  >
                    {team?.logo && <img src={team.logo} className="w-6 h-6" alt="" />}
                    <span className="text-sm font-medium">#{team?.seed} {team?.name || tid}</span>
                    {isSelected && <Check className="w-4 h-4 text-emerald-400 ml-auto" />}
                  </button>
                );
              })}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Winner Score" value={settingResult.winningScore} type="number" onChange={v => setSettingResult({ ...settingResult, winningScore: v })} />
              <Field label="Loser Score" value={settingResult.losingScore} type="number" onChange={v => setSettingResult({ ...settingResult, losingScore: v })} />
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ─── Overview Tab ─────────────────────────────────────────────
function OverviewTab({ tournament, teams, games, challenges, regionName }) {
  const completedGames = games.filter(g => g.status === 'final').length;
  const inProgressGames = games.filter(g => g.status === 'in_progress').length;
  const totalBrackets = challenges.reduce((sum, c) => sum + parseInt(c.bracket_count || 0), 0);

  return (
    <div className="space-y-6">
      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard icon={Users} label="Teams" value={teams.length} color="text-blue-400" />
        <StatCard icon={Gamepad2} label="Games" value={`${completedGames}/${games.length}`} sub={inProgressGames > 0 ? `${inProgressGames} live` : null} color="text-emerald-400" />
        <StatCard icon={Link2} label="Challenges" value={challenges.length} color="text-violet-400" />
        <StatCard icon={Trophy} label="Brackets" value={totalBrackets} color="text-amber-400" />
      </div>

      {/* Tournament info */}
      <div className="bg-surface rounded-xl border border-fg/10 p-5 space-y-4">
        <h3 className="font-semibold text-fg">Tournament Info</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
          <div>
            <span className="text-fg/40">Name</span>
            <p className="text-fg font-medium">{tournament.name}</p>
          </div>
          <div>
            <span className="text-fg/40">Season</span>
            <p className="text-fg font-medium">{tournament.season}</p>
          </div>
          <div>
            <span className="text-fg/40">Status</span>
            <p className="mt-0.5"><StatusBadge status={tournament.status} /></p>
          </div>
        </div>
        <div>
          <span className="text-sm text-fg/40">Regions</span>
          <div className="flex gap-2 mt-1">
            {(tournament.regions || []).map((r, i) => (
              <span key={i} className="px-3 py-1 bg-fg/5 rounded-lg text-sm text-fg/70 border border-fg/10">
                {i + 1}. {r}
              </span>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-fg/40">Created</span>
            <p className="text-fg/60">{new Date(tournament.created_at).toLocaleString()}</p>
          </div>
          <div>
            <span className="text-fg/40">Last Updated</span>
            <p className="text-fg/60">{new Date(tournament.updated_at).toLocaleString()}</p>
          </div>
        </div>
      </div>

      {/* Linked challenges */}
      {challenges.length > 0 && (
        <div className="bg-surface rounded-xl border border-fg/10 p-5 space-y-3">
          <h3 className="font-semibold text-fg">Linked Challenges</h3>
          <div className="space-y-2">
            {challenges.map(c => (
              <div key={c.id} className="flex items-center justify-between p-3 bg-fg/5 rounded-lg">
                <div>
                  <span className="text-sm font-medium text-fg">{c.league_name}</span>
                  <span className="text-sm text-fg/40 ml-2">{c.scoring_preset}</span>
                </div>
                <span className="text-sm text-fg/50">{c.bracket_count} brackets</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Teams Tab ────────────────────────────────────────────────
function TeamsTab({ teams, allTeams, regionName, regions, search, setSearch, regionFilter, setRegionFilter, onEdit }) {
  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-fg/30" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search teams..."
            className="w-full bg-surface border border-fg/10 rounded-lg pl-9 pr-8 py-2 text-sm text-fg placeholder:text-fg/30"
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-fg/30 hover:text-fg/60">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
        <div className="relative">
          <select
            value={regionFilter}
            onChange={e => setRegionFilter(e.target.value)}
            className="appearance-none bg-surface border border-fg/10 rounded-lg px-4 py-2 pr-8 text-sm text-fg cursor-pointer"
          >
            <option value="all">All Regions ({allTeams.length})</option>
            {regions.map((r, i) => (
              <option key={i} value={i}>{r} ({allTeams.filter(t => t.region_index === i).length})</option>
            ))}
          </select>
          <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-fg/40 pointer-events-none" />
        </div>
      </div>

      {/* Table */}
      <div className="bg-surface rounded-xl border border-fg/10 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-fg/10">
              <th className="text-left px-4 py-3 text-fg/40 font-medium">Seed</th>
              <th className="text-left px-4 py-3 text-fg/40 font-medium">Team</th>
              <th className="text-left px-4 py-3 text-fg/40 font-medium hidden md:table-cell">Abbr</th>
              <th className="text-left px-4 py-3 text-fg/40 font-medium">Region</th>
              <th className="text-left px-4 py-3 text-fg/40 font-medium hidden md:table-cell">Record</th>
              <th className="text-left px-4 py-3 text-fg/40 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {teams.map(team => (
              <tr
                key={team.id}
                onClick={() => onEdit({ ...team })}
                className="border-b border-fg/5 hover:bg-fg/5 cursor-pointer transition-colors"
              >
                <td className="px-4 py-2.5 text-fg/60 font-medium">#{team.seed}</td>
                <td className="px-4 py-2.5">
                  <div className="flex items-center gap-2">
                    {team.logo && <img src={team.logo} className="w-5 h-5" alt="" />}
                    {team.color && <span className="w-3 h-3 rounded-full border border-fg/10 shrink-0" style={{ backgroundColor: `#${team.color}` }} />}
                    <span className="text-fg font-medium">{team.name}</span>
                  </div>
                </td>
                <td className="px-4 py-2.5 text-fg/50 hidden md:table-cell">{team.abbreviation}</td>
                <td className="px-4 py-2.5 text-fg/60">{regionName(team.region_index)}</td>
                <td className="px-4 py-2.5 text-fg/50 hidden md:table-cell">{team.record || '—'}</td>
                <td className="px-4 py-2.5">
                  <div className="flex gap-1.5">
                    {team.eliminated && (
                      <span className="px-1.5 py-0.5 bg-red-500/10 text-red-400 border border-red-500/20 rounded text-sm">OUT</span>
                    )}
                    {team.is_first_four && (
                      <span className="px-1.5 py-0.5 bg-amber-500/10 text-amber-400 border border-amber-500/20 rounded text-sm">FF</span>
                    )}
                    {!team.eliminated && !team.is_first_four && <span className="text-fg/30">—</span>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {teams.length === 0 && (
          <div className="text-center py-8 text-fg/40 text-sm">No teams match filters</div>
        )}
      </div>
    </div>
  );
}

// ─── Games Tab ────────────────────────────────────────────────
function GamesTab({ games, getTeam, regionName, roundFilter, setRoundFilter, statusFilter, setStatusFilter, roundCounts, statusCounts, onEdit, onSetResult, onRefresh }) {
  const [expandedGame, setExpandedGame] = useState(null);
  const [refreshingId, setRefreshingId] = useState(null);

  async function handleRefresh(gameId) {
    setRefreshingId(gameId);
    try {
      await onRefresh(gameId);
    } finally {
      setRefreshingId(null);
    }
  }

  return (
    <div className="space-y-4">
      {/* Round filter tabs */}
      <div className="flex flex-wrap gap-1.5">
        <RoundBtn label="All" count={Object.values(roundCounts).reduce((a, b) => a + b, 0)} active={roundFilter === 'all'} onClick={() => setRoundFilter('all')} />
        {Object.entries(ROUND_SHORT).map(([round, label]) => (
          roundCounts[round] > 0 && (
            <RoundBtn key={round} label={label} count={roundCounts[round]} active={roundFilter === round} onClick={() => setRoundFilter(round)} />
          )
        ))}
      </div>

      {/* Status filter */}
      <div className="flex gap-2">
        {['all', 'final', 'in_progress', 'pending'].map(s => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              statusFilter === s
                ? 'bg-surface text-fg border border-fg/10 shadow-sm'
                : 'text-fg/40 hover:text-fg/60'
            }`}
          >
            {s === 'all' ? 'All' : s.replace('_', ' ')}
            {s !== 'all' && statusCounts[s] > 0 && <span className="ml-1 text-fg/30">{statusCounts[s]}</span>}
          </button>
        ))}
      </div>

      {/* Game cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {games.map(game => {
          const team1 = getTeam(game.team1_espn_id);
          const team2 = getTeam(game.team2_espn_id);
          const isExpanded = expandedGame === game.id;
          return (
            <div key={game.id} className="bg-surface rounded-xl border border-fg/10 p-4 space-y-3">
              {/* Header */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-fg/40 font-medium">{ROUND_SHORT[game.round]}</span>
                  {game.slot_number && <span className="text-fg/30">#{game.slot_number}</span>}
                  {game.region_index != null && <span className="text-fg/40">{regionName(game.region_index)}</span>}
                  {game.first_four_index != null && <span className="text-amber-400/60">FF</span>}
                </div>
                <StatusBadge status={game.status} />
              </div>

              {/* Key IDs */}
              <div className="flex flex-wrap gap-2 text-sm">
                {game.espn_event_id && (
                  <span className="px-2 py-0.5 bg-fg/5 rounded text-fg/40 font-mono">ESPN: {game.espn_event_id}</span>
                )}
                <span className="px-2 py-0.5 bg-fg/5 rounded text-fg/40 font-mono">ID: {game.id}</span>
              </div>

              {/* Matchup */}
              <div className="space-y-1.5">
                <TeamRow team={team1} score={game.team1_score} isWinner={game.winning_team_espn_id === game.team1_espn_id && game.status === 'final'} />
                <TeamRow team={team2} score={game.team2_score} isWinner={game.winning_team_espn_id === game.team2_espn_id && game.status === 'final'} />
              </div>

              {/* Info */}
              <div className="flex flex-wrap gap-3 text-sm text-fg/30">
                {game.start_time && (
                  <span className="flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5" />
                    {new Date(game.start_time).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    {' '}
                    {new Date(game.start_time).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                  </span>
                )}
                {game.venue && (
                  <span className="flex items-center gap-1"><MapPin className="w-3.5 h-3.5" />{game.venue}</span>
                )}
                {game.broadcast && (
                  <span className="flex items-center gap-1"><Tv className="w-3.5 h-3.5" />{game.broadcast}</span>
                )}
              </div>

              {/* Actions */}
              <div className="flex gap-2 pt-1 flex-wrap">
                <button
                  onClick={() => onSetResult(game)}
                  className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-medium transition-colors"
                >
                  Set Result
                </button>
                <button
                  onClick={() => handleRefresh(game.id)}
                  disabled={refreshingId === game.id || !game.espn_event_id}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-violet-600 hover:bg-violet-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                >
                  {refreshingId === game.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                  ESPN
                </button>
                <button
                  onClick={() => onEdit({ ...game })}
                  className="px-3 py-1.5 bg-fg/10 hover:bg-fg/15 text-fg/60 rounded-lg text-sm font-medium transition-colors"
                >
                  Edit
                </button>
                <button
                  onClick={() => setExpandedGame(isExpanded ? null : game.id)}
                  className="flex items-center gap-1 px-3 py-1.5 bg-fg/10 hover:bg-fg/15 text-fg/40 rounded-lg text-sm font-medium transition-colors ml-auto"
                >
                  <Code className="w-3.5 h-3.5" />
                  <ChevronRight className={`w-3.5 h-3.5 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                </button>
              </div>

              {/* Expandable JSON */}
              {isExpanded && (
                <pre className="mt-2 p-3 bg-fg/5 rounded-lg text-sm text-fg/60 font-mono overflow-x-auto max-h-64 overflow-y-auto border border-fg/10">
                  {JSON.stringify(game, null, 2)}
                </pre>
              )}
            </div>
          );
        })}
      </div>
      {games.length === 0 && (
        <div className="text-center py-12 text-fg/40 text-sm">No games match filters</div>
      )}
    </div>
  );
}

// ─── Helper Components ────────────────────────────────────────

function TeamRow({ team, score, isWinner }) {
  if (!team) return <div className="h-8 bg-fg/5 rounded-lg flex items-center px-3 text-sm text-fg/30">TBD</div>;
  return (
    <div className={`flex items-center justify-between px-3 py-1.5 rounded-lg ${isWinner ? 'bg-emerald-500/5' : 'bg-fg/5'}`}>
      <div className="flex items-center gap-2">
        {team.logo && <img src={team.logo} className="w-5 h-5" alt="" />}
        <span className="text-fg/40 text-sm">#{team.seed}</span>
        <span className={`text-sm font-medium ${isWinner ? 'text-fg' : 'text-fg/60'}`}>{team.abbreviation || team.short_name || team.name}</span>
      </div>
      {score != null && (
        <span className={`text-sm font-bold ${isWinner ? 'text-fg' : 'text-fg/40'}`}>{score}</span>
      )}
    </div>
  );
}

function StatCard({ icon: Icon, label, value, sub, color }) {
  return (
    <div className="bg-surface rounded-xl border border-fg/10 p-4">
      <div className={`w-8 h-8 rounded-lg bg-fg/5 flex items-center justify-center mb-2 ${color}`}>
        <Icon className="w-4 h-4" />
      </div>
      <div className="text-2xl font-bold text-fg">{value}</div>
      <div className="text-sm text-fg/40">{label}</div>
      {sub && <div className="text-sm text-amber-400 mt-0.5">{sub}</div>}
    </div>
  );
}

function RoundBtn({ label, count, active, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
        active
          ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
          : 'bg-fg/5 text-fg/40 border border-transparent hover:text-fg/60'
      }`}
    >
      {label} <span className="text-fg/30">{count}</span>
    </button>
  );
}

function Modal({ title, onClose, onSave, children }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60" onClick={onClose}>
      <div className="bg-surface rounded-2xl border border-fg/10 max-w-md w-full p-6 space-y-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-fg">{title}</h3>
          <button onClick={onClose} className="text-fg/40 hover:text-fg text-xl">✕</button>
        </div>
        {children}
        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className="px-4 py-2 text-sm text-fg/50 hover:text-fg/70">Cancel</button>
          <button onClick={onSave} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-medium transition-colors">Save</button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, type = 'text' }) {
  return (
    <div>
      <label className="block text-sm text-fg/50 mb-1">{label}</label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-full bg-fg/5 border border-fg/10 rounded-lg px-3 py-2 text-fg text-sm"
      />
    </div>
  );
}
