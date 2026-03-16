import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, Loader2, Check, Lock, Send, AlertCircle, Pencil, Save, RotateCcw } from 'lucide-react';
import { bracketAPI } from '../api';
import { ROUND_BOUNDARIES } from '../utils/bracketSlots';
import { useAuth } from '../context/AuthContext';

const TOTAL_GAMES = ROUND_BOUNDARIES[ROUND_BOUNDARIES.length - 1].end;
import { useToast } from '../components/Toast';
import Loading from '../components/Loading';
import BracketView from '../components/bracket/BracketView';
import BracketScoreHeader from '../components/bracket/BracketScoreHeader';
import MatchupDetailDialog from '../components/bracket/MatchupDetailDialog';
import ChatWidget from '../components/ChatWidget';
import {
  countPicks,
  getNextSlot,
  getSiblingSlot,
  getMatchupTeams,
  getChildSlots,
  getSlotRound,
  cascadeRemovePicks,
  calculateBracketScore,
  calculatePotentialPoints,
  SCORING_PRESETS,
} from '../utils/bracketSlots';

export default function BracketFill() {
  const { leagueId, bracketId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { showToast } = useToast();

  const [bracket, setBracket] = useState(null);
  const [challenge, setChallenge] = useState(null);
  const [tournamentData, setTournamentData] = useState(null);
  const [picks, setPicks] = useState({});
  const [results, setResults] = useState({});
  const [tiebreakerValue, setTiebreakerValue] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [matchupDialog, setMatchupDialog] = useState(null);
  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false);
  const [isEditingName, setIsEditingName] = useState(false);
  const [editName, setEditName] = useState('');
  const [chatCollapsed, setChatCollapsed] = useState(true);
  const [tournamentStarted, setTournamentStarted] = useState(false);

  const saveTimeoutRef = useRef(null);
  const lastSavedPicksRef = useRef('{}');

  const isOwner = bracket?.user_id === user?.id;
  const isReadOnly = (tournamentStarted || challenge?.status !== 'open') || !isOwner;
  const pickCount = countPicks(picks);
  const scoringSystem = challenge?.scoring_system || SCORING_PRESETS.standard.points;

  useEffect(() => {
    loadBracket();
    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
  }, [bracketId]);

  // Auto-refresh results every 60s during tournament
  useEffect(() => {
    if (!isReadOnly || !challenge) return;
    const interval = setInterval(async () => {
      try {
        const data = await bracketAPI.getBracket(bracketId);
        setResults(data.results || {});
      } catch { /* ignore */ }
    }, 60000);
    return () => clearInterval(interval);
  }, [bracketId, isReadOnly, challenge]);

  const loadBracket = async () => {
    try {
      const data = await bracketAPI.getBracket(bracketId);
      const b = data.bracket;
      setBracket(b);
      setPicks(b.picks || {});
      setTiebreakerValue(b.tiebreaker_value);
      setResults(data.results || {});
      lastSavedPicksRef.current = JSON.stringify(b.picks || {});

      // Get challenge data (includes tournament_data)
      if (b.challenge_id) {
        const challengeData = await bracketAPI.getChallenge(b.challenge_id);
        const ch = challengeData.challenge;
        setChallenge(ch);
        setTournamentData(ch?.tournament_data || null);

        // Check if tournament has started
        if (ch?.season) {
          try {
            const { firstGameTime } = await bracketAPI.getFirstGameTime(ch.season);
            if (firstGameTime && new Date() >= new Date(firstGameTime)) {
              setTournamentStarted(true);
            }
          } catch { /* ignore */ }
        }
      }
    } catch (err) {
      showToast('Failed to load bracket', 'error');
    } finally {
      setLoading(false);
    }
  };

  // Debounced auto-save
  const debouncedSave = useCallback((newPicks, newTiebreaker) => {
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(async () => {
      const picksStr = JSON.stringify(newPicks);
      if (picksStr === lastSavedPicksRef.current && newTiebreaker === undefined) return;

      setSaving(true);
      try {
        const body = { picks: newPicks };
        if (newTiebreaker !== undefined) body.tiebreakerValue = newTiebreaker;
        await bracketAPI.updateBracket(bracketId, body);
        lastSavedPicksRef.current = picksStr;
      } catch (err) {
        showToast('Failed to save changes', 'error');
      }
      setSaving(false);
    }, 800);
  }, [bracketId]);

  const handlePick = useCallback((slot, teamId) => {
    if (isReadOnly) return;

    setPicks(prev => {
      const currentPick = prev[slot] || prev[String(slot)];
      let newPicks = { ...prev };

      // Toggle off: clicking the already-selected team deselects it
      if (currentPick && String(currentPick) === String(teamId)) {
        newPicks = cascadeRemovePicks(newPicks, slot, String(teamId));
        delete newPicks[slot];
        delete newPicks[String(slot)];
        debouncedSave(newPicks);
        return newPicks;
      }

      // If changing an existing pick, cascade-remove the old team from downstream
      if (currentPick && String(currentPick) !== String(teamId)) {
        newPicks = cascadeRemovePicks(newPicks, slot, String(currentPick));
      }

      // Set the new pick
      newPicks[slot] = String(teamId);

      debouncedSave(newPicks);
      return newPicks;
    });
  }, [isReadOnly, debouncedSave]);

  // Resolve the two possible teams that could emerge from a child slot
  const getPossibleTeams = useCallback((childSlot) => {
    const { team1, team2 } = getMatchupTeams(childSlot, picks, tournamentData);
    return { team1, team2 };
  }, [picks, tournamentData]);

  const handleMatchupClick = useCallback((slot) => {
    const { team1, team2 } = getMatchupTeams(slot, picks, tournamentData);
    if (!team1 && !team2) return;

    // For TBD teams in later rounds, resolve which two teams could fill that spot
    let team1Possible = null;
    let team2Possible = null;
    const round = getSlotRound(slot);
    if (round > 0) {
      const children = getChildSlots(slot);
      if (children) {
        if (!team1) {
          team1Possible = getPossibleTeams(children[0]);
        }
        if (!team2) {
          team2Possible = getPossibleTeams(children[1]);
        }
      }
    }

    setMatchupDialog({ slot, team1, team2, team1Possible, team2Possible });
  }, [picks, tournamentData, getPossibleTeams]);

  const handleDialogPick = useCallback((teamId) => {
    if (matchupDialog) {
      handlePick(matchupDialog.slot, teamId);
    }
  }, [matchupDialog, handlePick]);

  const handleTiebreakerChange = (value) => {
    setTiebreakerValue(value);
    debouncedSave(picks, value);
  };

  const handleNameSave = async () => {
    setIsEditingName(false);
    const trimmed = editName.trim();
    const newName = trimmed || `Bracket ${bracket.bracket_number}`;
    if (newName === (bracket.name || `Bracket ${bracket.bracket_number}`)) return;
    setBracket(prev => ({ ...prev, name: newName }));
    try {
      await bracketAPI.updateBracket(bracketId, { name: newName });
    } catch {
      showToast('Failed to rename bracket', 'error');
    }
  };

  const handleSubmit = async () => {
    if (pickCount < TOTAL_GAMES) {
      showToast(`Complete all picks first (${pickCount}/${TOTAL_GAMES})`, 'error');
      return;
    }
    if (challenge?.tiebreaker_type === 'total_score' && !tiebreakerValue) {
      showToast('Enter your tiebreaker prediction', 'error');
      return;
    }

    setSubmitting(true);
    try {
      // Save final state first
      await bracketAPI.updateBracket(bracketId, { picks, tiebreakerValue });
      const result = await bracketAPI.submitBracket(bracketId);
      if (result.success) {
        showToast('Bracket submitted! Good luck!', 'success');
        setBracket(prev => ({ ...prev, is_submitted: true, submitted_at: new Date().toISOString() }));
        setShowSubmitConfirm(false);
      } else {
        showToast(result.error || 'Failed to submit', 'error');
      }
    } catch (err) {
      showToast('Failed to submit bracket', 'error');
    }
    setSubmitting(false);
  };

  const handleReset = async () => {
    if (!confirm('Reset this bracket? All picks will be cleared.')) return;
    try {
      const result = await bracketAPI.resetBracket(bracketId);
      if (result.success) {
        setPicks({});
        setTiebreakerValue(null);
        setBracket(prev => ({ ...prev, picks: {}, tiebreaker_value: null, is_submitted: false, submitted_at: null }));
        lastSavedPicksRef.current = '{}';
        showToast('Bracket reset', 'success');
      } else {
        showToast(result.error || 'Failed to reset bracket', 'error');
      }
    } catch {
      showToast('Failed to reset bracket', 'error');
    }
  };

  if (loading) return <Loading fullScreen />;

  if (!bracket) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-8 text-center">
        <h2 className="text-xl font-display font-bold text-fg mb-2">Bracket Not Found</h2>
        <Link to={`/league/${leagueId}/bracket`} className="btn-primary inline-flex items-center gap-2">
          <ArrowLeft className="w-4 h-4" /> Back
        </Link>
      </div>
    );
  }

  // Score calculations for submitted brackets
  const scoreData = bracket.is_submitted
    ? calculateBracketScore(picks, results, scoringSystem)
    : null;
  const potential = bracket.is_submitted
    ? calculatePotentialPoints(picks, results, scoringSystem)
    : null;

  const progressPct = Math.round((pickCount / TOTAL_GAMES) * 100);
  const isComplete = pickCount >= TOTAL_GAMES;

  return (
    <div
      className={`max-w-[1400px] mx-auto px-3 sm:px-4 -mt-4 md:mt-0 pb-4 md:py-4 sm:py-6 transition-[padding] duration-300 lg:mx-0 lg:max-w-none lg:pl-6 ${
        chatCollapsed ? 'lg:pr-20' : 'lg:pr-[26rem] xl:pr-[28rem]'
      }`}
      style={{ paddingBottom: 'calc(var(--chat-bar-height, 0px) + 24px)' }}
    >
      {/* Header */}
      <div className="flex items-center justify-between -mx-3 px-3 sm:-mx-4 sm:px-4 pt-4 pb-3 md:py-3 bg-surface md:rounded-xl md:border md:border-fg/10">
        <div>
          <Link
            to={`/league/${leagueId}/bracket`}
            className="inline-flex items-center gap-1.5 text-fg/70 hover:text-fg text-base font-medium mb-1 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </Link>
          {isEditingName ? (
            <input
              autoFocus
              value={editName}
              onChange={e => setEditName(e.target.value)}
              onBlur={handleNameSave}
              onKeyDown={e => {
                if (e.key === 'Enter') handleNameSave();
                if (e.key === 'Escape') setIsEditingName(false);
              }}
              maxLength={40}
              className="text-3xl font-display font-bold text-fg bg-transparent border-b-2 border-violet-500 outline-none w-full"
            />
          ) : (
            <h1 className="text-3xl font-display font-bold text-fg flex items-center gap-2">
              {bracket.name || `Bracket ${bracket.bracket_number}`}
              {isOwner && !isReadOnly && (
                <button
                  onClick={() => { setEditName(bracket.name || `Bracket ${bracket.bracket_number}`); setIsEditingName(true); }}
                  className="text-fg/30 hover:text-fg/60 transition-colors"
                >
                  <Pencil className="w-4 h-4" />
                </button>
              )}
            </h1>
          )}
          {bracket.user_display_name && !isOwner && (
            <p className="text-sm text-fg/40 mt-0.5">by {bracket.user_display_name}</p>
          )}
        </div>

        <div className="flex items-center gap-2">
          {saving && (
            <span className="text-sm text-fg/30 flex items-center gap-1">
              <Loader2 className="w-3 h-3 animate-spin" /> Saving...
            </span>
          )}
          {bracket.is_submitted && (
            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-emerald-500/15 text-emerald-400 text-sm font-medium">
              <Lock className="w-3 h-3" /> Submitted
            </span>
          )}
        </div>
      </div>

      {/* Score Header (for submitted brackets) */}
      {bracket.is_submitted && scoreData && (
        <div className="mb-4">
          <BracketScoreHeader
            roundScores={scoreData.roundScores}
            totalScore={scoreData.totalScore}
            potentialPoints={potential}
            scoringSystem={scoringSystem}
            correctPicks={scoreData.correctPicks}
            totalDecided={scoreData.totalDecided}
          />
        </div>
      )}

      {/* Bracket */}
      <div className="-mx-3 sm:-mx-4 px-3 sm:px-4 pt-0 pb-40 md:py-4 md:pb-4 bg-surface md:bg-fg/[0.03] md:rounded-xl">
        <BracketView
          tournamentData={tournamentData}
          picks={picks}
          results={results}
          onPick={handlePick}
          onMatchupClick={handleMatchupClick}
          isReadOnly={isReadOnly}
          tiebreakerType={challenge?.tiebreaker_type}
          tiebreakerValue={tiebreakerValue}
          onTiebreakerChange={handleTiebreakerChange}
        />
      </div>

      {/* Bottom bar (for filling) */}
      {!isReadOnly && isOwner && (
        <div className="bracket-submit-bar fixed left-0 right-0 z-50 py-2 px-4 bg-canvas/95 backdrop-blur border-t border-fg/10 md:sticky md:!bottom-0 md:z-30 md:left-auto md:right-auto md:mt-4 md:-mx-4 md:py-3 md:pb-safe">
          <div className="max-w-[1400px] mx-auto">
            {/* Progress */}
            <div className="flex items-center justify-between mb-3">
              <div className="text-sm text-fg/60">
                <span className="font-mono font-bold text-fg">{pickCount}</span>
                <span>/{TOTAL_GAMES} picks</span>
              </div>
              <div className="flex-1 mx-4 h-2 rounded-full bg-fg/10 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-300 ${
                    progressPct > 80
                      ? 'bg-gradient-to-r from-violet-500 to-emerald-500'
                      : 'bg-violet-500'
                  }`}
                  style={{ width: `${progressPct}%` }}
                />
              </div>
              <div className="text-sm text-fg/40">
                {progressPct}%
              </div>
            </div>

            {bracket?.is_submitted ? (
              /* Already submitted — show status + reset option */
              <div className="flex items-center gap-2">
                <div className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-emerald-500/10 text-emerald-500 text-sm font-medium">
                  <Check className="w-4 h-4" />
                  Submitted — edits save automatically
                </div>
                <button
                  onClick={handleReset}
                  className="px-4 py-2.5 rounded-xl bg-fg/5 text-fg/50 hover:text-fg/70 hover:bg-fg/10 transition-colors text-sm font-medium flex items-center gap-1.5"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  Reset
                </button>
              </div>
            ) : (
              <>
                {/* Submit — hidden on mobile when not ready */}
                {isComplete ? (
                  <button
                    onClick={() => setShowSubmitConfirm(true)}
                    disabled={challenge?.tiebreaker_type === 'total_score' && !tiebreakerValue}
                    className="btn-primary w-full flex items-center justify-center gap-2 shadow-[0_0_16px_rgba(139,92,246,0.3)] disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    <Send className="w-4 h-4" />
                    Submit Bracket
                  </button>
                ) : (
                  <button
                    disabled
                    className="btn-primary w-full hidden md:flex items-center justify-center gap-2 opacity-30 cursor-not-allowed"
                  >
                    <Send className="w-4 h-4" />
                    Submit Bracket
                  </button>
                )}

                {/* Auto-save hint — mobile only, when not complete */}
                {!isComplete && (
                  <p className="md:hidden text-center text-xs text-fg/40 mt-1 flex items-center justify-center gap-1">
                    <Save className="w-3 h-3" />
                    Picks are saved automatically — come back anytime to finish
                  </p>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* Matchup Detail Dialog */}
      {matchupDialog && (
        <MatchupDetailDialog
          slot={matchupDialog.slot}
          team1Info={matchupDialog.team1}
          team2Info={matchupDialog.team2}
          team1Possible={matchupDialog.team1Possible}
          team2Possible={matchupDialog.team2Possible}
          season={challenge?.season}
          onPick={isReadOnly ? null : handleDialogPick}
          onClose={() => setMatchupDialog(null)}
          isReadOnly={isReadOnly}
        />
      )}

      {/* Submit Confirmation */}
      {/* Chat */}
      {leagueId && (
        <ChatWidget
          leagueId={leagueId}
          onCollapsedChange={setChatCollapsed}
        />
      )}

      {showSubmitConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setShowSubmitConfirm(false)}>
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm" />
          <div
            className="relative w-full max-w-sm rounded-2xl p-6 animate-in text-center"
            style={{ background: 'rgb(var(--color-elevated))', border: '1px solid rgba(255,255,255,0.1)' }}
            onClick={e => e.stopPropagation()}
          >
            <AlertCircle className="w-10 h-10 text-amber-400 mx-auto mb-3" />
            <h3 className="text-lg font-display font-bold text-fg mb-2">Submit Bracket?</h3>
            <p className="text-sm text-fg/50 mb-5">
              You can still edit your picks until the tournament starts. All brackets lock at tipoff.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowSubmitConfirm(false)}
                className="flex-1 py-2.5 rounded-xl bg-fg/5 text-fg/60 hover:bg-fg/10 transition-colors text-sm font-medium"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                disabled={submitting}
                className="flex-1 py-2.5 rounded-xl bg-violet-600 text-white hover:bg-violet-500 transition-colors text-sm font-medium flex items-center justify-center gap-2"
              >
                {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Lock className="w-3.5 h-3.5" /> Submit</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
