import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, Loader2, Check, Lock, Send, AlertCircle, Pencil, Save, RotateCcw, Trophy, X } from 'lucide-react';
import { createPortal } from 'react-dom';
import { bracketAPI, trackingAPI } from '../api';
import { trackEvent } from '../utils/analytics';
import { ROUND_BOUNDARIES } from '../utils/bracketSlots';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';

const TOTAL_GAMES = ROUND_BOUNDARIES[ROUND_BOUNDARIES.length - 1].end;
import { useToast } from '../components/Toast';
import Loading from '../components/Loading';
import BracketView from '../components/bracket/BracketView';
import BracketScoreHeader from '../components/bracket/BracketScoreHeader';
import MatchupDetailDialog from '../components/bracket/MatchupDetailDialog';
import ChatWidget from '../components/ChatWidget';
import useBracketLiveScores from '../hooks/useBracketLiveScores';
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
  const { isDark } = useTheme();
  const { showToast } = useToast();

  const [bracket, setBracket] = useState(null);
  const [challenge, setChallenge] = useState(null);
  const [tournamentData, setTournamentData] = useState(null);
  const [picks, setPicks] = useState({});
  const [results, setResults] = useState({});
  const [tiebreakerValue, setTiebreakerValue] = useState(null);
  const [tiebreakerScores, setTiebreakerScores] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState(null); // 'saving' | 'saved' | 'error'
  const saveStatusTimeoutRef = useRef(null);
  const [submitting, setSubmitting] = useState(false);
  const [matchupDialog, setMatchupDialog] = useState(null);
  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false);
  const [isEditingName, setIsEditingName] = useState(false);
  const [editName, setEditName] = useState('');
  const [chatCollapsed, setChatCollapsed] = useState(true);
  const [showScoreDialog, setShowScoreDialog] = useState(false);
  const [tournamentStarted, setTournamentStarted] = useState(false);
  const matchupOpenedAtRef = useRef(null);

  const saveTimeoutRef = useRef(null);
  const lastSavedPicksRef = useRef('{}');

  // Live score updates via websocket
  const { liveSlotData } = useBracketLiveScores(tournamentData);

  // Merge live data into results for score display
  const mergedResults = useMemo(() => {
    // First, build competitors from DB results (winning_score/losing_score) for final games
    const merged = {};
    for (const [slot, r] of Object.entries(results)) {
      const entry = { ...r };
      if (!entry.competitors && entry.status === 'final' && entry.winning_team_id) {
        entry.competitors = [
          { teamId: String(entry.winning_team_id), score: entry.winning_score ?? 0 },
          ...(entry.losing_team_id ? [{ teamId: String(entry.losing_team_id), score: entry.losing_score ?? 0 }] : []),
        ];
      }
      merged[slot] = entry;
    }

    // Then overlay live data from websocket
    for (const [slot, live] of Object.entries(liveSlotData)) {
      const existing = merged[slot] || {};
      let status = existing.status;
      if (live.status === 'STATUS_FINAL' || live.status === 'final') {
        status = 'final';
      } else if (
        live.status === 'STATUS_IN_PROGRESS' ||
        live.status === 'STATUS_HALFTIME' ||
        live.status === 'STATUS_END_PERIOD' ||
        live.status === 'STATUS_FIRST_HALF' ||
        live.status === 'STATUS_SECOND_HALF'
      ) {
        status = 'in_progress';
      }
      merged[slot] = {
        ...existing,
        status,
        competitors: live.competitors?.length ? live.competitors : existing.competitors,
      };
    }
    return merged;
  }, [results, liveSlotData]);

  // Collect eliminated team IDs from decided results
  const eliminatedTeamIds = useMemo(() => {
    const ids = [];
    for (const r of Object.values(mergedResults)) {
      if (r.status === 'final' && (r.losing_team_id || r.losingTeamId)) {
        ids.push(String(r.losing_team_id || r.losingTeamId));
      }
    }
    return ids;
  }, [mergedResults]);

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
      setTiebreakerScores(b.tiebreaker_scores || null);
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
  const debouncedSave = useCallback((newPicks, newTiebreaker, newTiebreakerScores) => {
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(async () => {
      const picksStr = JSON.stringify(newPicks);
      if (picksStr === lastSavedPicksRef.current && newTiebreaker === undefined) return;

      setSaving(true);
      setSaveStatus('saving');
      if (saveStatusTimeoutRef.current) clearTimeout(saveStatusTimeoutRef.current);
      try {
        const body = { picks: newPicks };
        if (newTiebreaker !== undefined) body.tiebreakerValue = newTiebreaker;
        if (newTiebreakerScores) body.tiebreakerScores = newTiebreakerScores;
        await bracketAPI.updateBracket(bracketId, body);
        lastSavedPicksRef.current = picksStr;
        setSaveStatus('saved');
        saveStatusTimeoutRef.current = setTimeout(() => setSaveStatus(null), 2500);
      } catch (err) {
        setSaveStatus('error');
        showToast('Failed to save changes', 'error');
        saveStatusTimeoutRef.current = setTimeout(() => setSaveStatus(null), 4000);
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
    matchupOpenedAtRef.current = Date.now();
    trackingAPI.event('matchup_detail_open', {
      slot,
      team1Id: team1?.id || null,
      team2Id: team2?.id || null,
      round: getSlotRound(slot),
    });
    trackEvent('matchup_detail_open', { slot, round: getSlotRound(slot) });
  }, [picks, tournamentData, getPossibleTeams]);

  const handleDialogPick = useCallback((teamId) => {
    if (matchupDialog) {
      handlePick(matchupDialog.slot, teamId);
    }
  }, [matchupDialog, handlePick]);

  const handleTiebreakerChange = (value, scores) => {
    setTiebreakerValue(value);
    if (scores) setTiebreakerScores(scores);
    debouncedSave(picks, value, scores);
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
      const submitBody = { picks, tiebreakerValue };
      if (tiebreakerScores) submitBody.tiebreakerScores = tiebreakerScores;
      await bracketAPI.updateBracket(bracketId, submitBody);
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
        setTiebreakerScores(null);
        setBracket(prev => ({ ...prev, picks: {}, tiebreaker_value: null, tiebreaker_scores: null, is_submitted: false, submitted_at: null }));
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
    ? calculateBracketScore(picks, mergedResults, scoringSystem)
    : null;
  const potential = bracket.is_submitted
    ? calculatePotentialPoints(picks, results, scoringSystem)
    : null;

  const progressPct = Math.round((pickCount / TOTAL_GAMES) * 100);
  const isComplete = pickCount >= TOTAL_GAMES;

  return (
    <div
      className={`max-w-[1400px] mx-auto px-3 sm:px-4 -mt-4 md:mt-0 pb-4 md:pt-1 md:pb-4 sm:py-6 transition-[padding] duration-300 lg:mx-0 lg:max-w-none lg:pl-6 ${
        chatCollapsed ? 'lg:pr-20' : 'lg:pr-[26rem] xl:pr-[28rem]'
      }`}
      style={{ paddingBottom: 'calc(var(--chat-bar-height, 0px) + 24px)' }}
    >
      {/* Header */}
      <div className="flex items-center justify-between -mx-3 px-3 sm:-mx-4 sm:px-4 pt-4 pb-3 md:pt-1 md:pb-2.5 bg-surface md:bg-transparent">
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
                  className="text-fg/50 hover:text-fg/80 transition-colors"
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
          {bracket.is_submitted && scoreData && (
            <button
              onClick={() => setShowScoreDialog(true)}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-sm font-semibold transition-colors ${
                isDark ? 'bg-fg/10 text-fg/60 hover:bg-fg/15' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              <Trophy className="w-3.5 h-3.5" />
              {scoreData.totalScore} pts
              <span className="text-fg/40">·</span>
              {scoreData.correctPicks}/{scoreData.totalDecided}
            </button>
          )}
          {bracket.is_submitted && !scoreData && (
            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-sm font-semibold ${
              isDark ? 'bg-fg/10 text-fg/60' : 'bg-gray-100 text-gray-600'
            }`}>
              <Lock className="w-3.5 h-3.5" /> Submitted
            </span>
          )}
        </div>
      </div>

      {/* Score Dialog (portaled, for submitted brackets) */}
      {showScoreDialog && scoreData && createPortal(
        <div
          className="fixed inset-0 bg-black/50 z-[70] flex items-center justify-center p-4"
          onClick={() => setShowScoreDialog(false)}
          style={{ touchAction: 'none' }}
        >
          <div
            className={`${isDark ? 'bg-gray-900' : 'bg-white'} rounded-2xl w-full max-w-lg shadow-2xl border border-fg/10 overflow-hidden`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-fg/10">
              <span className="text-base font-semibold text-fg">Bracket Score</span>
              <button onClick={() => setShowScoreDialog(false)} className="p-1.5 rounded-lg hover:bg-fg/10 transition-colors">
                <X className="w-5 h-5 text-fg/60" />
              </button>
            </div>
            <div className="p-4 overscroll-contain" style={{ touchAction: 'pan-y' }}>
              <BracketScoreHeader
                roundScores={scoreData.roundScores}
                totalScore={scoreData.totalScore}
                potentialPoints={potential}
                scoringSystem={scoringSystem}
                correctPicks={scoreData.correctPicks}
                totalDecided={scoreData.totalDecided}
              />
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Bracket */}
      <div className="-mx-3 sm:-mx-4 px-3 sm:px-4 pt-0 pb-40 md:pt-1 md:pb-0 bg-surface md:bg-fg/[0.03] md:rounded-xl">
        <BracketView
          tournamentData={tournamentData}
          picks={picks}
          results={mergedResults}
          liveSlotData={liveSlotData}
          eliminatedTeamIds={eliminatedTeamIds}
          onPick={handlePick}
          onMatchupClick={handleMatchupClick}
          isReadOnly={isReadOnly}
          tiebreakerType={challenge?.tiebreaker_type}
          tiebreakerValue={tiebreakerValue}
          tiebreakerScores={tiebreakerScores}
          onTiebreakerChange={handleTiebreakerChange}
          hasScoreHeader={false}
        />
      </div>

      {/* Bottom bar (for filling) */}
      {!isReadOnly && isOwner && (
        <div className="bracket-submit-bar fixed left-0 right-0 z-50 py-2 px-4 bg-canvas/95 backdrop-blur border-t border-fg/10 md:relative md:z-30 md:left-auto md:right-auto md:mt-0 md:-mx-4 md:py-3 md:pb-safe md:border-t-0">
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
              <div className="flex items-center gap-2 text-sm">
                {saveStatus === 'saving' && (
                  <span className="flex items-center gap-1 text-fg/40 animate-pulse">
                    <Loader2 className="w-3 h-3 animate-spin" />
                  </span>
                )}
                {saveStatus === 'saved' && (
                  <span className="flex items-center gap-1 text-emerald-500 animate-in fade-in">
                    <Check className="w-3 h-3" />
                  </span>
                )}
                {saveStatus === 'error' && (
                  <span className="flex items-center gap-1 text-red-400 text-xs">
                    <AlertCircle className="w-3 h-3" /> Save failed
                  </span>
                )}
                <span className="text-fg/40">{progressPct}%</span>
              </div>
            </div>

            {bracket?.is_submitted ? (
              /* Already submitted — show status + reset option */
              <div className="flex items-center gap-2">
                <div className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium ${
                  isDark ? 'bg-fg/10 text-fg/60' : 'bg-gray-100 text-gray-600'
                }`}>
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
                    {saveStatus === 'error' ? 'Failed to save — check your connection' : 'Picks are saved automatically — come back anytime to finish'}
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
          onTabSwitch={(tab) => {
            trackingAPI.event('matchup_tab_switch', {
              slot: matchupDialog.slot,
              tab,
              team1Id: matchupDialog.team1?.id || null,
              team2Id: matchupDialog.team2?.id || null,
            });
            trackEvent('matchup_tab_switch', { slot: matchupDialog.slot, tab });
          }}
          onClose={() => {
            const duration = matchupOpenedAtRef.current ? Math.round((Date.now() - matchupOpenedAtRef.current) / 1000) : 0;
            trackingAPI.event('matchup_detail_close', { slot: matchupDialog.slot }, duration);
            trackEvent('matchup_detail_close', { slot: matchupDialog.slot, duration_seconds: duration });
            matchupOpenedAtRef.current = null;
            setMatchupDialog(null);
          }}
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
