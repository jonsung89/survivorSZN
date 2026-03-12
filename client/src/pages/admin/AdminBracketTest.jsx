import { useState, useEffect } from 'react';
import { Brackets, Check, ChevronRight, Shuffle, Trash2, Trophy } from 'lucide-react';
import { ROUND_BOUNDARIES, getChildSlots } from '../../utils/bracketSlots';
import { adminAPI } from '../../api';
import { useToast } from '../../components/Toast';
import Loading from '../../components/Loading';

export default function AdminBracketTest() {
  const { showToast } = useToast();
  const [challenges, setChallenges] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState('');
  const [challenge, setChallenge] = useState(null);
  const [challengeLoading, setChallengeLoading] = useState(false);
  const [activeRound, setActiveRound] = useState(0);
  const [settingResult, setSettingResult] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    adminAPI.getChallenges().then(data => {
      setChallenges(data.challenges || []);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const loadChallenge = async (id) => {
    setSelectedId(id);
    setConfirmDelete(false);
    if (!id) { setChallenge(null); return; }
    setChallengeLoading(true);
    try {
      const data = await adminAPI.getChallenge(id);
      setChallenge(data);
      setActiveRound(0);
    } catch (err) {
      showToast('Failed to load challenge', 'error');
    } finally {
      setChallengeLoading(false);
    }
  };

  const handleDeleteChallenge = async () => {
    if (!selectedId) return;
    setDeleting(true);
    try {
      const result = await adminAPI.deleteChallenge(selectedId);
      showToast(`Deleted challenge${result.leagueName ? ` for "${result.leagueName}"` : ''}`, 'success');
      setChallenges(prev => prev.filter(c => c.id !== selectedId));
      setSelectedId('');
      setChallenge(null);
      setConfirmDelete(false);
    } catch (err) {
      console.error('Failed to delete challenge:', err);
      showToast('Failed to delete challenge', 'error');
    } finally {
      setDeleting(false);
    }
  };

  // Get the two teams for a given slot
  const getTeamsForSlot = (slot) => {
    if (!challenge) return [null, null];
    const { tournamentData, results } = challenge;
    const teams = tournamentData?.teams || {};
    const slots = tournamentData?.slots || {};

    if (slot <= ROUND_BOUNDARIES[0].end) {
      // R64: teams come from tournament_data slots
      const slotData = slots[slot] || slots[String(slot)];
      if (!slotData) return [null, null];
      const team1 = slotData.team1 ? teams[slotData.team1] : null;
      const team2 = slotData.team2 ? teams[slotData.team2] : null;
      return [team1, team2];
    }

    // Later rounds: teams come from child slot results
    const children = getChildSlots(slot);
    if (!children) return [null, null];

    const getWinner = (childSlot) => {
      const result = results[childSlot] || results[String(childSlot)];
      if (!result || result.status !== 'final') return null;
      return teams[result.winningTeamId] || null;
    };

    return [getWinner(children[0]), getWinner(children[1])];
  };

  const handleSetResult = async (slot, winningTeam, losingTeam) => {
    setSettingResult(slot);
    try {
      await adminAPI.setResult(selectedId, {
        slotNumber: slot,
        winningTeamId: winningTeam.id,
        losingTeamId: losingTeam?.id || null,
        winningScore: Math.floor(Math.random() * 30) + 55,
        losingScore: Math.floor(Math.random() * 30) + 45,
      });
      // Reload challenge to get updated results
      const data = await adminAPI.getChallenge(selectedId);
      setChallenge(data);
      showToast(`Set winner: ${winningTeam.name || winningTeam.shortName}`, 'success');
    } catch (err) {
      showToast('Failed to set result', 'error');
    } finally {
      setSettingResult(null);
    }
  };

  const handleSimulateRound = async () => {
    const rb = ROUND_BOUNDARIES[activeRound];
    let count = 0;

    for (let slot = rb.start; slot <= rb.end; slot++) {
      const result = challenge.results[slot] || challenge.results[String(slot)];
      if (result?.status === 'final') continue;

      const [team1, team2] = getTeamsForSlot(slot);
      if (!team1 || !team2) continue;

      const winner = Math.random() < 0.5 ? team1 : team2;
      const loser = winner === team1 ? team2 : team1;

      setSettingResult(slot);
      try {
        await adminAPI.setResult(selectedId, {
          slotNumber: slot,
          winningTeamId: winner.id,
          losingTeamId: loser.id,
          winningScore: Math.floor(Math.random() * 30) + 55,
          losingScore: Math.floor(Math.random() * 30) + 45,
        });
        count++;
      } catch {
        // continue with next
      }
    }

    const data = await adminAPI.getChallenge(selectedId);
    setChallenge(data);
    setSettingResult(null);
    showToast(`Simulated ${count} games in ${ROUND_BOUNDARIES[activeRound].name}`, 'success');
  };

  if (loading) return <Loading />;

  // Count decided games per round
  const getRoundStats = (roundIdx) => {
    if (!challenge) return { decided: 0, total: 0 };
    const rb = ROUND_BOUNDARIES[roundIdx];
    let decided = 0;
    const total = rb.end - rb.start + 1;
    for (let s = rb.start; s <= rb.end; s++) {
      const r = challenge.results[s] || challenge.results[String(s)];
      if (r?.status === 'final') decided++;
    }
    return { decided, total };
  };

  return (
    <div>
      <h1 className="text-2xl font-display font-bold text-fg mb-1">Bracket Testing</h1>
      <p className="text-sm text-fg/40 mb-6">Manually set results round by round to test scoring</p>

      {/* Challenge selector */}
      <div className="mb-6">
        <div className="flex items-center gap-2 max-w-md">
          <select
            value={selectedId}
            onChange={(e) => loadChallenge(e.target.value)}
            className="bg-surface border border-fg/10 rounded-lg px-4 py-2.5 text-sm text-fg focus:outline-none flex-1"
          >
            <option value="">Select a bracket challenge...</option>
            {challenges.map(c => (
              <option key={c.id} value={c.id}>
                {c.leagueName} — {c.season} ({c.submittedCount}/{c.bracketCount} brackets, {c.teamCount} teams)
              </option>
            ))}
          </select>
          {selectedId && !confirmDelete && (
            <button
              onClick={() => setConfirmDelete(true)}
              className="p-2.5 text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-lg transition-colors"
              title="Delete challenge"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
        {confirmDelete && (
          <div className="mt-2 flex items-center gap-2">
            <span className="text-sm text-red-400">Delete this challenge and all its brackets?</span>
            <button
              onClick={handleDeleteChallenge}
              disabled={deleting}
              className="px-3 py-1.5 text-sm font-medium bg-red-500 text-white rounded-lg hover:bg-red-600 disabled:opacity-50"
            >
              {deleting ? 'Deleting...' : 'Confirm'}
            </button>
            <button
              onClick={() => setConfirmDelete(false)}
              disabled={deleting}
              className="px-3 py-1.5 text-sm text-fg/50 hover:text-fg"
            >
              Cancel
            </button>
          </div>
        )}
      </div>

      {challengeLoading && <Loading />}

      {challenge && !challengeLoading && (
        <>
          {/* Round tabs */}
          <div className="flex gap-1 mb-6 overflow-x-auto pb-1">
            {ROUND_BOUNDARIES.map(({ name }, idx) => {
              const { decided, total } = getRoundStats(idx);
              const isComplete = decided === total;
              return (
                <button
                  key={idx}
                  onClick={() => setActiveRound(idx)}
                  className={`px-3 py-2 rounded-lg text-xs font-medium whitespace-nowrap transition-colors flex items-center gap-1.5 ${
                    activeRound === idx
                      ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                      : isComplete
                      ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                      : 'bg-fg/5 text-fg/50 border border-transparent hover:bg-fg/10'
                  }`}
                >
                  {isComplete && <Check className="w-3 h-3" />}
                  {name}
                  <span className="text-[10px] opacity-60">{decided}/{total}</span>
                </button>
              );
            })}
          </div>

          {/* Simulate button */}
          <div className="flex items-center gap-3 mb-4">
            <button
              onClick={handleSimulateRound}
              disabled={!!settingResult}
              className="flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors"
            >
              <Shuffle className="w-4 h-4" />
              Simulate {ROUND_BOUNDARIES[activeRound].name}
            </button>
            <span className="text-xs text-fg/30">Randomly picks winners for all undecided games</span>
          </div>

          {/* Games list */}
          <div className="space-y-3">
            {(() => {
              const rb = ROUND_BOUNDARIES[activeRound];
              const games = [];
              for (let slot = rb.start; slot <= rb.end; slot++) {
                const [team1, team2] = getTeamsForSlot(slot);
                const result = challenge.results[slot] || challenge.results[String(slot)];
                const isDecided = result?.status === 'final';

                games.push(
                  <div key={slot} className={`bg-surface rounded-xl border p-4 ${isDecided ? 'border-emerald-500/20' : 'border-fg/10'}`}>
                    <div className="flex items-center gap-2 mb-3">
                      <span className="text-[10px] font-mono text-fg/30">Slot {slot}</span>
                      {isDecided && <span className="text-[10px] text-emerald-400 font-medium">FINAL</span>}
                    </div>

                    {!team1 && !team2 ? (
                      <p className="text-sm text-fg/30 italic">Waiting for previous round results</p>
                    ) : (
                      <div className="flex flex-col sm:flex-row gap-2">
                        {[team1, team2].map((team, i) => {
                          if (!team) return (
                            <div key={i} className="flex-1 p-3 rounded-lg bg-fg/5 text-fg/30 text-sm text-center">TBD</div>
                          );

                          const isWinner = isDecided && String(result.winningTeamId) === String(team.id);
                          const isLoser = isDecided && !isWinner;
                          const otherTeam = i === 0 ? team2 : team1;

                          return (
                            <button
                              key={team.id}
                              onClick={() => !isDecided && team && otherTeam && handleSetResult(slot, team, otherTeam)}
                              disabled={isDecided || !otherTeam || !!settingResult}
                              className={`flex-1 flex items-center gap-3 p-3 rounded-lg text-left transition-all ${
                                isWinner
                                  ? 'bg-emerald-500/10 border-2 border-emerald-500/30 ring-1 ring-emerald-500/20'
                                  : isLoser
                                  ? 'bg-fg/5 opacity-40'
                                  : 'bg-fg/5 hover:bg-fg/10 border-2 border-transparent hover:border-amber-400/30 cursor-pointer'
                              } ${settingResult === slot ? 'animate-pulse' : ''} disabled:cursor-default`}
                            >
                              {team.logo ? (
                                <img src={team.logo} alt="" className="w-8 h-8 object-contain flex-shrink-0" />
                              ) : (
                                <div className="w-8 h-8 rounded-full bg-fg/10 flex-shrink-0" />
                              )}
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1.5">
                                  {team.seed && <span className="text-xs font-bold text-fg/40">#{team.seed}</span>}
                                  <span className="text-sm font-medium text-fg truncate">
                                    {team.name || team.shortName || team.abbreviation}
                                  </span>
                                </div>
                              </div>
                              {isWinner && <Trophy className="w-4 h-4 text-emerald-400 flex-shrink-0" />}
                              {!isDecided && !settingResult && otherTeam && (
                                <ChevronRight className="w-4 h-4 text-fg/20 flex-shrink-0" />
                              )}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              }
              return games;
            })()}
          </div>
        </>
      )}
    </div>
  );
}
