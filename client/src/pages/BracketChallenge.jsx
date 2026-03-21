import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Trophy, Plus, ArrowLeft, Loader2, Users, Settings, Check, Clock, Calendar, DollarSign, X, Crown, Pencil, Lock, RotateCcw, History, Copy, ExternalLink, ChevronDown } from 'lucide-react';
import { bracketAPI, leagueAPI, trackingAPI } from '../api';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { useSocket } from '../context/SocketContext';
import { useToast } from '../components/Toast';
import Loading from '../components/Loading';
import BracketLeaderboard from '../components/bracket/BracketLeaderboard';
import FinalFourPreviewDialog from '../components/bracket/FinalFourPreviewDialog';
import BracketSetup from '../components/bracket/BracketSetup';
import { ShareLeagueButton, ShareLeagueModal } from '../components/ShareLeague';
import TournamentGames from '../components/bracket/TournamentGames';
import ProspectWatch from '../components/bracket/ProspectWatch';
import DailyRecap from '../components/recap/DailyRecap';
import ChatWidget from '../components/ChatWidget';
import { getSportBadgeClasses } from '../sports';
import SportBadge from '../components/SportBadge';
import CommishBadge from '../components/CommishBadge';
import Avatar from '../components/Avatar';
import { SCORING_PRESETS, ROUND_BOUNDARIES, countPicks, calculateBracketScore, calculatePotentialPoints } from '../utils/bracketSlots';
import { getThemedLogo } from '../utils/logo';

const TOTAL_GAMES = ROUND_BOUNDARIES[ROUND_BOUNDARIES.length - 1].end;

export default function BracketChallenge() {
  const { leagueId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { isDark } = useTheme();
  const { showToast } = useToast();
  const { onlineUsers } = useSocket();

  const [league, setLeague] = useState(null);
  const [challenge, setChallenge] = useState(null);
  const [myBrackets, setMyBrackets] = useState([]);
  const [leaderboard, setLeaderboard] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [activeTab, setActiveTab] = useState('brackets');
  const [showSettings, setShowSettings] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [fieldAnnounced, setFieldAnnounced] = useState(null); // null = loading, true/false
  const [selectionDate, setSelectionDate] = useState(null); // fetched from ESPN
  const [selectionCountdown, setSelectionCountdown] = useState(null);
  const [isEditingName, setIsEditingName] = useState(false);
  const [editName, setEditName] = useState('');
  const [togglingPayment, setTogglingPayment] = useState(null);
  const [chatCollapsed, setChatCollapsed] = useState(true);
  const [tournamentStartTime, setTournamentStartTime] = useState(null);
  const [tournamentStarted, setTournamentStarted] = useState(false);
  const [tournamentData, setTournamentData] = useState(null);
  const [eliminatedTeamIds, setEliminatedTeamIds] = useState([]);
  const [bracketResults, setBracketResults] = useState({});
  const [myBracketPreview, setMyBracketPreview] = useState(null);
  const [expandedBracketId, setExpandedBracketId] = useState(null);
  const [lockCountdown, setLockCountdown] = useState(null);
  const [editingPayment, setEditingPayment] = useState(false);
  const [showPaymentStatus, setShowPaymentStatus] = useState(false);
  const [paymentDraft, setPaymentDraft] = useState([]);
  const [savingPayment, setSavingPayment] = useState(false);
  const [actionLog, setActionLog] = useState([]);
  const [showActionLog, setShowActionLog] = useState(false);
  const [prospects, setProspects] = useState([]);

  const isCommissioner = league?.commissionerId === user?.id || league?.commissioner_id === user?.id;
  const isTournamentLocked = tournamentStartTime && new Date() >= new Date(tournamentStartTime);
  const entryFee = parseFloat(challenge?.entry_fee) || 0;
  const members = league?.members || [];
  const paymentMethods = league?.paymentMethods || [];

  // Build userId -> champion team info map from leaderboard data
  const buildChampionsMap = () => {
    if (!leaderboard?.length || !tournamentData?.teams) return null;
    const map = {};
    for (const entry of leaderboard) {
      if (entry.championTeamId) {
        const team = tournamentData.teams[entry.championTeamId];
        if (team) map[entry.userId] = { logo: team.logo, name: team.abbreviation || team.shortName, color: team.color };
      }
    }
    return Object.keys(map).length > 0 ? map : null;
  };

  const PAYMENT_PLATFORMS = {
    venmo: { name: 'Venmo', placeholder: '@username', color: '#3D95CE' },
    paypal: { name: 'PayPal', placeholder: 'email@example.com', color: '#003087' },
    zelle: { name: 'Zelle', placeholder: 'email or phone', color: '#6C1CD3' },
    cashapp: { name: 'Cash App', placeholder: '$cashtag', color: '#00D632' },
  };

  // Payment links — universal links let the OS open the app automatically on mobile
  const getPaymentLink = (platform, handle) => {
    const clean = handle.replace(/^[@$]/, '').trim();
    if (!clean) return null;
    switch (platform) {
      case 'venmo': return `https://venmo.com/u/${clean}`;
      case 'paypal': return `https://paypal.me/${clean}`;
      case 'cashapp': return `https://cash.app/$${clean}`;
      default: return null;
    }
  };

  const handleEditPayment = () => {
    setPaymentDraft(paymentMethods.length > 0 ? [...paymentMethods] : [{ platform: 'venmo', handle: '' }]);
    setEditingPayment(true);
  };

  const handleSavePayment = async () => {
    setSavingPayment(true);
    try {
      const cleaned = paymentDraft.filter(pm => pm.handle.trim());
      await leagueAPI.updateSettings(leagueId, { paymentMethods: cleaned });
      setLeague(prev => ({ ...prev, paymentMethods: cleaned }));
      setEditingPayment(false);
      showToast('Payment info saved', 'success');
    } catch (err) {
      showToast('Failed to save payment info', 'error');
    } finally {
      setSavingPayment(false);
    }
  };

  const addPaymentMethod = () => {
    const used = paymentDraft.map(p => p.platform);
    const next = Object.keys(PAYMENT_PLATFORMS).find(k => !used.includes(k));
    if (next) setPaymentDraft([...paymentDraft, { platform: next, handle: '' }]);
  };

  const removePaymentMethod = (idx) => {
    setPaymentDraft(paymentDraft.filter((_, i) => i !== idx));
  };

  const updatePaymentMethod = (idx, field, value) => {
    const updated = [...paymentDraft];
    updated[idx] = { ...updated[idx], [field]: value };
    setPaymentDraft(updated);
  };

  useEffect(() => {
    loadData();
  }, [leagueId]);

  // Auto-refresh bracket results + leaderboard during tournament (every 30s)
  useEffect(() => {
    if (!isTournamentLocked || !challenge?.id) return;
    const refreshResults = async () => {
      try {
        // First update results from ESPN (processes completed games)
        await bracketAPI.updateResults();
        // Then fetch fresh leaderboard with updated scores
        const [lb, tData] = await Promise.all([
          bracketAPI.getLeaderboard(challenge.id),
          bracketAPI.getTournamentData(challenge.season || new Date().getFullYear()),
        ]);
        setLeaderboard(lb.leaderboard || []);
        setTournamentStarted(lb.tournamentStarted || false);
        setEliminatedTeamIds(lb.eliminatedTeamIds || []);
        setBracketResults(lb.results || {});
        if (tData) setTournamentData(tData);
      } catch { /* ignore */ }
    };
    // Run immediately on mount, then every 30s
    refreshResults();
    const interval = setInterval(refreshResults, 30000);
    return () => clearInterval(interval);
  }, [isTournamentLocked, challenge?.id]);

  // Fetch NBA prospect tournament data (auto-refresh every 60s when games are live)
  const prospectTimerRef = useRef(null);
  useEffect(() => {
    if (!isTournamentLocked || !challenge?.season) return;
    const fetchProspects = async () => {
      try {
        const data = await bracketAPI.getProspectWatch(challenge.season);
        setProspects(data?.prospects || []);
        // Auto-refresh if any prospect is currently playing
        const hasLive = (data?.prospects || []).some(p => p.isPlaying);
        if (hasLive) {
          prospectTimerRef.current = setTimeout(fetchProspects, 60000);
        }
      } catch { /* ignore */ }
    };
    fetchProspects();
    // Also refresh every 5 minutes even without live games
    const interval = setInterval(fetchProspects, 300000);
    return () => {
      clearInterval(interval);
      if (prospectTimerRef.current) clearTimeout(prospectTimerRef.current);
    };
  }, [isTournamentLocked, challenge?.season]);

  // Selection Show countdown (date fetched from ESPN standings API)
  useEffect(() => {
    if (fieldAnnounced !== false || !selectionDate) return;

    const target = new Date(selectionDate);
    if (isNaN(target.getTime())) return;

    const update = () => {
      const diff = target - new Date();
      if (diff <= 0) { setSelectionCountdown(null); return; }
      setSelectionCountdown({
        days: Math.floor(diff / 86400000),
        hours: Math.floor((diff % 86400000) / 3600000),
        minutes: Math.floor((diff % 3600000) / 60000),
        seconds: Math.floor((diff % 60000) / 1000),
      });
    };

    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [fieldAnnounced, selectionDate]);

  // Lock countdown — use entry_deadline if set, otherwise tournament start time
  const lockTarget = challenge?.entry_deadline || tournamentStartTime;

  useEffect(() => {
    if (!lockTarget || isTournamentLocked) return;

    const target = new Date(lockTarget);
    if (isNaN(target.getTime())) return;

    const update = () => {
      const diff = target - new Date();
      if (diff <= 0) { setLockCountdown(null); return; }
      setLockCountdown({
        days: Math.floor(diff / 86400000),
        hours: Math.floor((diff % 86400000) / 3600000),
        minutes: Math.floor((diff % 3600000) / 60000),
        seconds: Math.floor((diff % 60000) / 1000),
      });
    };

    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [lockTarget, isTournamentLocked]);

  const loadData = async () => {
    try {
      const [leagueData, challengeData] = await Promise.all([
        leagueAPI.getLeague(leagueId),
        bracketAPI.getChallengeByLeague(leagueId),
      ]);

      const leagueObj = leagueData.league || leagueData;
      setLeague(leagueObj);
      setChallenge(challengeData.challenge);
      setMyBrackets(challengeData.myBrackets || []);

      // Check if tournament field has been announced + fetch selection date
      try {
        const season = leagueObj.season || new Date().getFullYear();
        const [tData, selectionData, firstGameData] = await Promise.all([
          bracketAPI.getTournamentData(season),
          bracketAPI.getSelectionDate(season).catch(() => null),
          bracketAPI.getFirstGameTime(season).catch(() => null),
        ]);
        setTournamentData(tData);
        const realTeams = Object.values(tData.teams || {}).filter(t => t.name !== 'TBD');
        setFieldAnnounced(realTeams.length >= 64);

        // Use ESPN-derived date, or null if not available
        if (selectionData?.dateTime) {
          setSelectionDate(selectionData.dateTime);
        }

        // Set tournament start time for countdown/lock
        if (firstGameData?.firstGameTime) {
          setTournamentStartTime(firstGameData.firstGameTime);
        }
      } catch {
        setFieldAnnounced(false);
      }

      if (challengeData.challenge) {
        try {
          const lb = await bracketAPI.getLeaderboard(challengeData.challenge.id);
          setLeaderboard(lb.leaderboard || []);
          setTournamentStarted(lb.tournamentStarted || false);
          setEliminatedTeamIds(lb.eliminatedTeamIds || []);
          setBracketResults(lb.results || {});
        } catch { /* leaderboard is optional */ }
      }

      // Fetch activity log
      try {
        const logResult = await leagueAPI.getActionLog(leagueId);
        if (logResult.success && logResult.log) {
          setActionLog(logResult.log);
        }
      } catch (e) {
        // Action log might not exist yet
      }
    } catch (err) {
      showToast('Failed to load bracket challenge', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateBracket = async () => {
    if (!challenge) return;
    setCreating(true);
    try {
      const result = await bracketAPI.createBracket(challenge.id);
      if (result.success) {
        navigate(`/league/${leagueId}/bracket/${result.bracket.id}`);
      } else {
        showToast(result.error || 'Failed to create bracket', 'error');
      }
    } catch (err) {
      showToast('Failed to create bracket', 'error');
    }
    setCreating(false);
  };

  const handleResetBracket = async (bracketId, e) => {
    e.stopPropagation();
    if (!confirm('Reset this bracket? All picks will be cleared.')) return;
    try {
      const result = await bracketAPI.resetBracket(bracketId);
      if (result.success) {
        setMyBrackets(prev => prev.map(b =>
          b.id === bracketId ? { ...b, picks: {}, tiebreaker_value: null, is_submitted: false, submitted_at: null } : b
        ));
        trackingAPI.event('bracket_reset', { leagueId, bracketId });
        showToast('Bracket reset', 'success');
      } else {
        showToast(result.error || 'Failed to reset bracket', 'error');
      }
    } catch {
      showToast('Failed to reset bracket', 'error');
    }
  };

  const handleLeagueNameSave = async () => {
    setIsEditingName(false);
    const trimmed = editName.trim();
    if (!trimmed || trimmed === league?.name) return;
    const oldName = league?.name;
    setLeague(prev => ({ ...prev, name: trimmed }));
    try {
      await leagueAPI.updateSettings(leagueId, { name: trimmed });
      trackingAPI.event('league_name_edit', { leagueId, oldName, newName: trimmed });
      showToast('League name updated', 'success');
    } catch {
      setLeague(prev => ({ ...prev, name: oldName }));
      showToast('Failed to rename league', 'error');
    }
  };

  const handleTogglePayment = async (member) => {
    setTogglingPayment(member.id);
    try {
      const newPaidStatus = !member.hasPaid;
      await leagueAPI.togglePayment(leagueId, member.id, newPaidStatus);
      trackingAPI.event('payment_status_toggle', {
        leagueId,
        memberId: member.id,
        memberName: member.displayName || member.username,
        newStatus: newPaidStatus ? 'paid' : 'unpaid',
      });
      setLeague(prev => ({
        ...prev,
        members: prev.members.map(m =>
          m.id === member.id ? { ...m, hasPaid: newPaidStatus } : m
        ),
      }));
    } catch {
      showToast('Failed to update payment status', 'error');
    }
    setTogglingPayment(null);
  };

  if (loading) return <Loading fullScreen />;

  if (!challenge) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-8 text-center">
        <Trophy className="w-12 h-12 text-fg/20 mx-auto mb-4" />
        <h2 className="text-xl font-display font-bold text-fg mb-2">No Bracket Challenge</h2>
        <p className="text-fg/50 mb-6">This league doesn't have a bracket challenge set up yet.</p>
        <Link to="/dashboard" className="btn-primary inline-flex items-center gap-2">
          <ArrowLeft className="w-4 h-4" /> Back to My Leagues
        </Link>
      </div>
    );
  }

  const canCreateMore = myBrackets.length < (challenge.max_brackets_per_user || 1);
  const isOpen = challenge.status === 'open';
  const scoringSystem = challenge.scoring_system || SCORING_PRESETS.standard.points;
  const paidCount = members.filter(m => m.hasPaid).length;
  const currentUserPaid = members.find(m => m.userId === user?.id || m.id === user?.id)?.hasPaid;

  // Count brackets submitted per user from leaderboard
  const submittedByUser = {};
  leaderboard.forEach(entry => {
    submittedByUser[entry.userId] = (submittedByUser[entry.userId] || 0) + 1;
  });

  return (
    <div className={`transition-[padding] duration-300 ${chatCollapsed ? 'lg:pr-20' : 'lg:pr-[26rem] xl:pr-[28rem]'}`}>
    <div
      className="max-w-6xl mx-auto px-3 sm:px-4 py-6 lg:px-6"
      style={{ paddingBottom: 'calc(var(--chat-bar-height, 0px) + 64px)' }}
    >
      {/* Header */}
      <div className="flex flex-col gap-4 mb-6">
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <Link to="/dashboard" className="inline-flex items-center gap-1.5 text-fg/70 hover:text-fg text-base font-medium mb-2 transition-colors">
              <ArrowLeft className="w-4 h-4" />
              My Leagues
            </Link>
            <div className="flex items-center gap-2 flex-wrap">
              {isEditingName ? (
                <input
                  autoFocus
                  value={editName}
                  onChange={e => setEditName(e.target.value)}
                  onBlur={handleLeagueNameSave}
                  onKeyDown={e => {
                    if (e.key === 'Enter') handleLeagueNameSave();
                    if (e.key === 'Escape') setIsEditingName(false);
                  }}
                  maxLength={50}
                  className="text-2xl font-display font-bold text-fg bg-transparent border-b-2 border-violet-500 outline-none flex-1 min-w-0"
                />
              ) : (
                <h1 className="text-2xl font-display font-bold text-fg truncate">
                  {league?.name || 'Bracket Challenge'}
                </h1>
              )}
              {isCommissioner && !isEditingName && (
                <button
                  onClick={() => { setEditName(league?.name || ''); setIsEditingName(true); }}
                  className="text-fg/30 hover:text-fg/60 transition-colors flex-shrink-0"
                >
                  <Pencil className="w-4 h-4" />
                </button>
              )}
              {isCommissioner && <CommishBadge />}
            </div>
            <p className="text-fg/50 text-sm mt-1">
              {members.length} member{members.length !== 1 ? 's' : ''}
              {entryFee > 0 && <> &middot; ${entryFee}/bracket</>}
            </p>
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              <SportBadge sportId="ncaab" label="March Madness" />
              <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-xs font-bold uppercase ${
                isOpen ? (isDark ? 'bg-emerald-500/15 text-emerald-400' : 'bg-gray-100 text-gray-700') :
                challenge.status === 'locked' ? (isDark ? 'bg-amber-500/15 text-amber-400' : 'bg-gray-100 text-gray-700') :
                'bg-fg/10 text-fg/50'
              }`}>
                {isOpen ? 'Open' : challenge.status === 'locked' ? 'Locked' : 'Completed'}
              </span>
              <span className="text-sm text-fg/40">{challenge.scoring_preset} scoring</span>
            </div>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2 flex-wrap">
          <ShareLeagueButton onClick={() => setShowShareModal(true)} />
          {isCommissioner ? (
            <>
              <button
                onClick={() => {
                  trackingAPI.event('action_log_open', { leagueId, leagueName: league?.name });
                  setShowActionLog(true);
                }}
                className="btn-secondary flex items-center gap-2 text-sm py-2.5"
              >
                <History className="w-4 h-4" />
                <span className="hidden sm:inline">History</span>
              </button>
              <button
                onClick={() => {
                  trackingAPI.event('settings_open', { leagueId, leagueName: league?.name });
                  setShowSettings(true);
                }}
                className="btn-secondary flex items-center gap-2 text-sm py-2.5"
              >
                <Settings className="w-4 h-4" />
                <span className="hidden sm:inline">Settings</span>
              </button>
            </>
          ) : actionLog.length > 0 && (
            <button
              onClick={() => {
                trackingAPI.event('action_log_open', { leagueId, leagueName: league?.name });
                setShowActionLog(true);
              }}
              className="btn-secondary flex items-center gap-2 text-sm py-2.5"
            >
              <History className="w-4 h-4" />
              <span className="hidden sm:inline">History</span>
            </button>
          )}
          {/* Prize Pot badge */}
          {entryFee > 0 && (
            <button
              onClick={() => {
                trackingAPI.event('prize_pot_click', {
                  leagueId,
                  pot: entryFee * paidCount,
                  paidCount,
                  totalMembers: members.length,
                });
                setShowPaymentStatus(true);
              }}
              className="btn-secondary flex items-center gap-1.5 text-sm py-2.5"
            >
              <DollarSign className="w-4 h-4 text-green-500" />
              <span className="font-semibold text-fg">${(entryFee * paidCount).toLocaleString()}</span>
              <span className="text-fg/40">·</span>
              <span className={paidCount === members.length ? 'text-green-500 font-medium' : 'text-fg/60'}>
                {paidCount}/{members.length} Paid
              </span>
            </button>
          )}
        </div>

        {/* Unpaid reminder */}
        {!isCommissioner && !currentUserPaid && entryFee > 0 && (
          <div className="flex items-center gap-2 py-2 px-3 rounded-lg bg-fg/[0.06] border border-amber-500/30">
            <DollarSign className="w-4 h-4 text-amber-500 flex-shrink-0" />
            <span className="text-sm font-medium text-fg/80">You haven't been marked as paid yet</span>
          </div>
        )}
      </div>

      {/* Tournament Games — show when tournament has started (regardless of challenge status) */}
      {isTournamentLocked && (
        <TournamentGames tournamentData={tournamentData} season={challenge?.season} leaderboard={leaderboard} prospects={prospects} />
      )}

      {/* Daily Recap */}
      {isTournamentLocked && challenge?.tournament_id && league?.id && (
        <DailyRecap tournamentId={challenge.tournament_id} leagueId={league.id} />
      )}

      {/* Prospect Watch — NBA draft prospects in the tournament (hidden for now)
      {isTournamentLocked && challenge?.season && (
        <ProspectWatch season={challenge.season} />
      )}
      */}

      {/* Countdown */}
      {(() => {
        const showCountdown = isOpen && !isTournamentLocked && lockCountdown && fieldAnnounced;
        if (!showCountdown) return null;

        return (
          <div className="grid gap-4 mb-5 grid-cols-1">
            {showCountdown && (
              <div className="glass-card rounded-xl p-4 sm:p-5 animate-in" style={{ animationDelay: '25ms' }}>
                <div className="flex flex-col items-center gap-3">
                  <div className="flex items-center gap-2">
                    <Lock className="w-4 h-4 text-fg/60" />
                    <p className="text-fg/70 text-sm font-medium">
                      {challenge?.entry_deadline ? 'Brackets lock at the entry deadline' : 'Brackets lock when the tournament starts'}
                    </p>
                  </div>
                  <div className="flex justify-center gap-2">
                    {lockCountdown.days > 0 && (
                      <div className={`text-center px-3 py-2 rounded-lg min-w-[3.5rem] ${isDark ? 'bg-fg/10' : 'bg-gray-100'}`}>
                        <p className="text-lg font-bold text-fg tabular-nums">{lockCountdown.days}</p>
                        <p className="text-fg/60 text-sm">day{lockCountdown.days !== 1 ? 's' : ''}</p>
                      </div>
                    )}
                    <div className={`text-center px-3 py-2 rounded-lg min-w-[3.5rem] ${isDark ? 'bg-fg/10' : 'bg-gray-100'}`}>
                      <p className="text-lg font-bold text-fg tabular-nums">{String(lockCountdown.hours).padStart(2, '0')}</p>
                      <p className="text-fg/60 text-sm">hrs</p>
                    </div>
                    <div className={`text-center px-3 py-2 rounded-lg min-w-[3.5rem] ${isDark ? 'bg-fg/10' : 'bg-gray-100'}`}>
                      <p className="text-lg font-bold text-fg tabular-nums">{String(lockCountdown.minutes).padStart(2, '0')}</p>
                      <p className="text-fg/60 text-sm">min</p>
                    </div>
                    <div className={`text-center px-3 py-2 rounded-lg min-w-[3.5rem] ${isDark ? 'bg-fg/10' : 'bg-gray-100'}`}>
                      <p className="text-lg font-bold text-fg tabular-nums">{String(lockCountdown.seconds).padStart(2, '0')}</p>
                      <p className="text-fg/60 text-sm">sec</p>
                    </div>
                  </div>
                  {lockTarget && (
                    <p className="text-fg/60 text-sm">
                      {new Date(lockTarget).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                      {' at '}
                      {new Date(lockTarget).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Prize pot moved to header badge */}
          </div>
        );
      })()}

      {/* Tabs */}
      <div className="flex gap-1 mb-5 border-b border-fg/10 pb-px">
        {['brackets', 'leaderboard', 'members'].map(tab => (
          <button
            key={tab}
            onClick={() => {
              trackingAPI.event('bracket_tab_switch', {
                tab,
                fromTab: activeTab,
                leagueId,
                leagueName: league?.name,
              });
              setActiveTab(tab);
            }}
            className={`px-4 py-2 text-sm md:text-base font-medium transition-colors border-b-2 -mb-px ${
              activeTab === tab
                ? 'border-violet-500 text-fg'
                : 'border-transparent text-fg/50 hover:text-fg/70'
            }`}
          >
            {tab === 'brackets' ? 'My Brackets' :
             tab === 'leaderboard' ? 'Leaderboard' :
             `Members (${members.length})`}
          </button>
        ))}
      </div>

      {/* My Brackets Tab */}
      {activeTab === 'brackets' && (
        <div className="space-y-4">
          {/* Bracket Cards */}
          {myBrackets.map(bracket => {
            const pickCount = countPicks(bracket.picks || {});
            const progress = Math.round((pickCount / TOTAL_GAMES) * 100);
            const picks = bracket.picks || {};
            const championTeamId = picks[63] || picks['63'];
            const champTeam = championTeamId && tournamentData?.teams ? tournamentData.teams[championTeamId] : null;
            const scoringSystem = challenge?.scoring_system || SCORING_PRESETS.standard.points;
            const showScores = bracket.is_submitted && tournamentStarted;
            const scoreData = showScores
              ? calculateBracketScore(picks, bracketResults, scoringSystem)
              : null;
            const potential = showScores
              ? calculatePotentialPoints(picks, bracketResults, scoringSystem)
              : null;

            // Build leaderboard-style entry for Final Four preview
            const previewEntry = {
              bracketId: bracket.id,
              userId: user?.id,
              displayName: user?.displayName || 'You',
              championTeamId,
              finalFourPicks: (() => {
                const fp = {};
                for (let s = 57; s <= 63; s++) { if (picks[s] || picks[String(s)]) fp[s] = picks[s] || picks[String(s)]; }
                return fp;
              })(),
              tiebreakerValue: bracket.tiebreaker_value,
              tiebreakerScores: bracket.tiebreaker_scores,
            };

            return (
              <div
                key={bracket.id}
                className={`glass-card rounded-xl p-4 transition-all duration-200 border-l-[3px] ${
                  bracket.is_submitted ? 'border-l-emerald-500/60' : 'border-l-violet-500/60'
                }`}
              >
                {/* Row 1: Name + logo + status + actions */}
                <div className="flex items-center justify-between">
                  <div
                    className="flex items-center gap-2 min-w-0 flex-1 cursor-pointer"
                    onClick={() => {
                      if (champTeam && (tournamentStarted || bracket.is_submitted)) {
                        trackingAPI.event('bracket_final_four_preview', {
                          source: 'my_brackets',
                          leagueId,
                          leagueName: league?.name,
                          bracketId: bracket.id,
                          bracketName: bracket.name || `Bracket ${bracket.bracket_number}`,
                        });
                        setMyBracketPreview(previewEntry);
                      } else {
                        trackingAPI.event('bracket_fill_navigate', {
                          leagueId,
                          leagueName: league?.name,
                          bracketId: bracket.id,
                        });
                        navigate(`/league/${leagueId}/bracket/${bracket.id}`);
                      }
                    }}
                  >
                    <h3 className="font-medium text-fg truncate text-base md:text-lg">{bracket.name || `Bracket ${bracket.bracket_number}`}</h3>
                    {champTeam?.logo && (tournamentStarted || bracket.is_submitted) && (
                      <img src={getThemedLogo(champTeam.logo, isDark)} alt="" className="w-5 h-5 md:w-6 md:h-6 object-contain flex-shrink-0" />
                    )}
                    {bracket.is_submitted ? (
                      <span className={`inline-flex items-center gap-1 text-sm md:text-base font-medium flex-shrink-0 ${isDark ? 'text-fg/40' : 'text-gray-400'}`}>
                        <Lock className="w-3 h-3 md:w-3.5 md:h-3.5" /> Submitted
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-sm md:text-base text-orange-500 font-medium flex-shrink-0">
                        <Clock className="w-3.5 h-3.5 md:w-4 md:h-4" /> {pickCount}/{TOTAL_GAMES}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2 flex-shrink-0">
                    {!isTournamentLocked && isOpen && pickCount > 0 && (
                      <button
                        onClick={(e) => handleResetBracket(bracket.id, e)}
                        className="p-2 rounded-lg text-fg/30 hover:text-fg/60 hover:bg-fg/5 transition-colors"
                        title="Reset bracket"
                      >
                        <RotateCcw className="w-4 h-4" />
                      </button>
                    )}
                    {!bracket.is_submitted ? (
                      <div
                        className="w-12 h-12 relative cursor-pointer"
                        onClick={() => {
                          trackingAPI.event('bracket_fill_navigate', {
                            source: 'progress_ring',
                            leagueId,
                            leagueName: league?.name,
                            bracketId: bracket.id,
                            progress,
                          });
                          navigate(`/league/${leagueId}/bracket/${bracket.id}`);
                        }}
                      >
                        <svg className="w-12 h-12 -rotate-90" viewBox="0 0 36 36">
                          <circle cx="18" cy="18" r="15" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="3" />
                          <circle
                            cx="18" cy="18" r="15" fill="none"
                            stroke="rgb(139, 92, 246)"
                            strokeWidth="3"
                            strokeDasharray={`${progress * 0.94} 100`}
                            strokeLinecap="round"
                          />
                        </svg>
                        <span className="absolute inset-0 flex items-center justify-center text-xs font-mono font-bold text-fg/50">
                          {progress}%
                        </span>
                      </div>
                    ) : (
                      <button
                        onClick={() => {
                          trackingAPI.event('bracket_view_click', {
                            leagueId,
                            leagueName: league?.name,
                            bracketId: bracket.id,
                            bracketName: bracket.name || `Bracket ${bracket.bracket_number}`,
                          });
                          navigate(`/league/${leagueId}/bracket/${bracket.id}`);
                        }}
                        className={`px-3 py-1.5 md:px-4 md:py-2 rounded-lg text-sm md:text-base font-medium transition-colors ${isDark ? 'bg-fg/10 text-fg/60 hover:bg-fg/15' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                      >
                        View
                      </button>
                    )}
                  </div>
                </div>

                {/* Row 2: Score display (submitted brackets only) */}
                {scoreData && (
                  <div className="mt-2.5">
                    <button
                      onClick={() => {
                        const expanding = expandedBracketId !== bracket.id;
                        if (expanding) {
                          trackingAPI.event('bracket_score_expand', {
                            leagueId,
                            leagueName: league?.name,
                            bracketId: bracket.id,
                            bracketName: bracket.name || `Bracket ${bracket.bracket_number}`,
                            score: scoreData?.totalScore,
                          });
                        }
                        setExpandedBracketId(prev => prev === bracket.id ? null : bracket.id);
                      }}
                      className="flex items-center gap-3 w-full text-left text-sm md:text-base"
                    >
                      <span className="font-semibold text-fg">{scoreData.totalScore} pts</span>
                      <span className={`${isDark ? 'text-fg/60' : 'text-gray-500'}`}>{potential} poss.</span>
                      <span className={`${isDark ? 'text-fg/60' : 'text-gray-500'}`}>{scoreData.correctPicks}/{scoreData.totalDecided} correct</span>
                      <ChevronDown className={`w-3.5 h-3.5 text-fg/40 ml-auto transition-transform ${expandedBracketId === bracket.id ? 'rotate-180' : ''}`} />
                    </button>
                    {expandedBracketId === bracket.id && (
                      <div className="bg-fg/[0.04] rounded-lg px-3.5 py-2.5 mt-2 space-y-2">
                        {['R64', 'R32', 'S16', 'E8', 'F4', 'CHAMP'].map((label, idx) => (
                          <div key={label} className="flex justify-between">
                            <span className="text-fg/60 text-base">{label}</span>
                            <span className={`font-mono text-base ${(scoreData.roundScores?.[idx] || 0) > 0 ? 'text-fg/80 font-semibold' : 'text-fg/40'}`}>
                              {scoreData.roundScores?.[idx] || 0}
                            </span>
                          </div>
                        ))}
                        <div className="flex justify-between border-t border-fg/10 pt-2 mt-2">
                          <span className="text-fg/60 text-base font-medium">Possible</span>
                          <span className="font-mono text-base font-medium text-fg/60">{potential}</span>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {/* Final Four Preview for My Brackets */}
          {myBracketPreview && (
            <FinalFourPreviewDialog
              entry={myBracketPreview}
              tournamentData={tournamentData}
              eliminatedTeamIds={eliminatedTeamIds}
              currentUserId={user?.id}
              leagueId={leagueId}
              onBracketClick={(bracketId) => {
                setMyBracketPreview(null);
                navigate(`/league/${leagueId}/bracket/${bracketId}`);
              }}
              onClose={() => setMyBracketPreview(null)}
            />
          )}

          {/* Pre-Selection Show Banner */}
          {fieldAnnounced === false && (
            <div className="glass-card rounded-xl p-6 text-center border border-amber-500/20 bg-gradient-to-b from-amber-500/5 to-transparent">
              <div className="w-14 h-14 rounded-full bg-amber-500/10 flex items-center justify-center mx-auto mb-4">
                <Calendar className="w-7 h-7 text-amber-400" />
              </div>
              <h3 className="text-lg font-display font-bold text-fg mb-2">Selection Show Countdown</h3>
              <p className="text-fg/50 text-sm max-w-md mx-auto mb-4">
                The tournament field will be announced on <span className="text-fg/70 font-medium">March 15th at 6:00pm ET</span>. Brackets open after the selection.
              </p>

              {selectionCountdown && (
                <div className="flex justify-center gap-2 mb-4">
                  {selectionCountdown.days > 0 && (
                    <div className="text-center px-3 py-2 rounded-lg bg-fg/5 min-w-[52px]">
                      <p className="text-2xl font-bold text-fg">{selectionCountdown.days}</p>
                      <p className="text-fg/50 text-[10px] uppercase">Days</p>
                    </div>
                  )}
                  <div className="text-center px-3 py-2 rounded-lg bg-fg/5 min-w-[52px]">
                    <p className="text-2xl font-bold text-fg">{String(selectionCountdown.hours).padStart(2, '0')}</p>
                    <p className="text-fg/50 text-[10px] uppercase">Hrs</p>
                  </div>
                  <div className="text-center px-3 py-2 rounded-lg bg-fg/5 min-w-[52px]">
                    <p className="text-2xl font-bold text-fg">{String(selectionCountdown.minutes).padStart(2, '0')}</p>
                    <p className="text-fg/50 text-[10px] uppercase">Min</p>
                  </div>
                  <div className="text-center px-3 py-2 rounded-lg bg-fg/5 min-w-[52px]">
                    <p className="text-2xl font-bold text-amber-400">{String(selectionCountdown.seconds).padStart(2, '0')}</p>
                    <p className="text-fg/50 text-[10px] uppercase">Sec</p>
                  </div>
                </div>
              )}

              <p className="text-fg/30 text-xs">
                Teams will be seeded and placed into regions after the selection committee's announcement.
              </p>
            </div>
          )}

          {/* Create New Bracket */}
          {isOpen && canCreateMore && fieldAnnounced !== false && !isTournamentLocked && (
            <button
              onClick={handleCreateBracket}
              disabled={creating}
              className="w-full py-4 rounded-xl border border-violet-500/20 bg-violet-500/5 hover:bg-violet-500/10 text-fg/50 hover:text-fg/70 transition-all flex items-center justify-center gap-2"
            >
              {creating ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  <Plus className="w-5 h-5" />
                  Create {myBrackets.length > 0 ? 'Another ' : ''}Bracket
                </>
              )}
            </button>
          )}

          {!isOpen && myBrackets.length === 0 && (
            <div className="text-center py-8 text-fg/40">
              <p>This bracket challenge is no longer accepting entries.</p>
            </div>
          )}
        </div>
      )}

      {/* Leaderboard Tab */}
      {activeTab === 'leaderboard' && (
        <BracketLeaderboard
          leaderboard={leaderboard}
          currentUserId={user?.id}
          leagueId={leagueId}
          leagueName={league?.name}
          scoringSystem={scoringSystem}
          tournamentStarted={tournamentStarted}
          tournamentData={tournamentData}
          eliminatedTeamIds={eliminatedTeamIds}
          onBracketClick={(bracketId) => {
            trackingAPI.event('leaderboard_bracket_navigate', {
              leagueId,
              leagueName: league?.name,
              bracketId,
            });
            navigate(`/league/${leagueId}/bracket/${bracketId}`);
          }}
        />
      )}

      {/* Members Tab */}
      {activeTab === 'members' && (
        <div className="space-y-2">
          {members.map(member => {
            const memberCommissioner = member.userId === (league?.commissionerId || league?.commissioner_id);
            const bracketCount = submittedByUser[member.userId] || 0;
            const isMe = member.userId === user?.id || member.isMe;

            return (
              <div
                key={member.id}
                className={`glass-card rounded-xl p-3 sm:p-4 ${isMe ? 'border border-violet-500/20' : ''}`}
              >
                <div className="flex items-center gap-3">
                  <Avatar
                    userId={member.userId}
                    name={member.displayName || '?'}
                    imageUrl={member.profileImageUrl}
                    size="md"
                    isOnline={(onlineUsers[leagueId] || []).some(u => u.userId === member.userId)}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className={`text-base font-semibold truncate ${isMe ? (isDark ? 'text-violet-400' : 'text-violet-600') : 'text-fg'}`}>
                        {member.displayName || 'Anonymous'}
                      </span>
                      {isMe && <span className="text-sm font-medium flex-shrink-0" style={{ color: isDark ? 'rgba(167,139,250,0.6)' : 'rgba(109,40,217,0.5)' }}>(you)</span>}
                      {memberCommissioner && (
                        <span className="inline-flex items-center text-amber-400 flex-shrink-0">
                          <Crown className="w-3.5 h-3.5" />
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-fg/50 truncate">
                      {member.firstName && member.lastName
                        ? `${member.firstName} ${member.lastName}`
                        : member.email}
                    </p>
                    <p className={`text-sm mt-0.5 ${bracketCount > 0 ? (isDark ? 'text-emerald-400' : 'text-emerald-600') : 'text-fg/30'}`}>
                      {bracketCount > 0
                        ? `${bracketCount} bracket${bracketCount !== 1 ? 's' : ''} submitted`
                        : 'No brackets submitted'}
                    </p>
                  </div>
                  {/* Payment toggle (commissioner only, when entry fee > 0) */}
                  {isCommissioner && entryFee > 0 && (
                    <button
                      onClick={() => handleTogglePayment(member)}
                      disabled={togglingPayment === member.id}
                      className={`px-2.5 py-1.5 rounded-lg text-sm font-medium transition-all flex items-center gap-1.5 flex-shrink-0 ${
                        member.hasPaid
                          ? isDark ? 'bg-emerald-500/15 text-emerald-400' : 'bg-emerald-50 text-emerald-700'
                          : isDark ? 'bg-fg/10 text-fg/60 hover:bg-fg/15' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                      }`}
                    >
                      {togglingPayment === member.id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : member.hasPaid ? (
                        <>
                          <Check className="w-4 h-4" />
                          Paid
                        </>
                      ) : (
                        <>
                          <DollarSign className="w-4 h-4" />
                          Mark Paid
                        </>
                      )}
                    </button>
                  )}
                </div>
              </div>
            );
          })}

          {members.length === 0 && (
            <div className="text-center py-12 text-fg/40">
              <Users className="w-8 h-8 mx-auto mb-2 opacity-40" />
              <p>No members yet. Share your invite link to get started!</p>
            </div>
          )}
        </div>
      )}

      {/* Settings Modal */}
      {showSettings && isCommissioner && (
        <SettingsModal
          challenge={challenge}
          league={league}
          onClose={() => setShowSettings(false)}
          onUpdate={loadData}
        />
      )}

      {/* Activity Log Modal */}
      {showActionLog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setShowActionLog(false)}>
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm" />
          <div
            className="relative w-full max-w-lg rounded-2xl p-6 animate-in max-h-[85vh] overflow-y-auto"
            style={{ background: 'rgb(var(--color-elevated))', border: '1px solid rgba(255,255,255,0.1)' }}
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-display font-bold text-fg flex items-center gap-2">
                <History className="w-5 h-5" />
                Activity Log
              </h2>
              <button
                onClick={() => setShowActionLog(false)}
                className="p-1 rounded hover:bg-fg/10 text-fg/50"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 max-h-[400px] overflow-y-auto">
              {actionLog.length === 0 ? (
                <div className="text-center py-8">
                  <History className="w-10 h-10 text-fg/30 mx-auto mb-3" />
                  <p className="text-fg/50">No activity yet</p>
                </div>
              ) : (
                actionLog.map((log, idx) => {
                  const actionLabel =
                    log.action === 'challenge_settings_changed' || log.action === 'settings_changed'
                      ? 'Settings Changed'
                      : log.action === 'payment_received'
                      ? 'Payment Received'
                      : log.action === 'payment_removed'
                      ? 'Payment Removed'
                      : log.action;

                  const icon =
                    log.action === 'challenge_settings_changed' || log.action === 'settings_changed'
                      ? <Settings className="w-4 h-4 text-fg/70" />
                      : log.action === 'payment_received' || log.action === 'payment_removed'
                      ? <DollarSign className="w-4 h-4 text-fg/70" />
                      : <Clock className="w-4 h-4 text-fg/70" />;

                  return (
                    <div key={log.id || idx} className="bg-fg/5 rounded-xl p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-lg flex items-center justify-center bg-fg/10 flex-shrink-0">
                            {icon}
                          </div>
                          <div>
                            <p className="text-fg text-base font-medium">{actionLabel}</p>
                            <p className="text-fg/70 text-sm">{log.reason}</p>
                            {log.performedBy && (
                              <p className="text-fg/50 text-sm mt-0.5">by {log.performedBy}</p>
                            )}
                          </div>
                        </div>
                        <span className="text-fg/60 text-sm whitespace-nowrap text-right">
                          {new Date(log.timestamp).toLocaleDateString()}
                          <br />
                          <span className="text-fg/45">{new Date(log.timestamp).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span>
                        </span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      {/* Share Modal */}
      {/* Payment Status Dialog */}
      {showPaymentStatus && entryFee > 0 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pb-20" onClick={() => setShowPaymentStatus(false)}>
          <div className="absolute inset-0 bg-black/50" />
          <div className="relative bg-surface rounded-2xl shadow-2xl w-full max-w-sm max-h-[60vh] overflow-hidden animate-in" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-fg/10">
              <div>
                <h3 className="text-lg font-bold text-fg">Payment Status</h3>
                <p className="text-sm text-fg/50">{paidCount} of {members.length} paid</p>
              </div>
              <button onClick={() => setShowPaymentStatus(false)} className="p-1.5 rounded-lg hover:bg-fg/10 text-fg/50 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="overflow-y-auto max-h-[calc(60vh-64px)] p-2 pb-6">
              {/* Paid members first, then unpaid */}
              {[...members].sort((a, b) => (b.hasPaid ? 1 : 0) - (a.hasPaid ? 1 : 0)).map(member => (
                <div key={member.id} className="flex items-center justify-between px-3 py-2.5 rounded-lg">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className={`w-2 h-2 rounded-full flex-shrink-0 ${member.hasPaid ? 'bg-green-500' : 'bg-fg/20'}`} />
                    <span className={`text-base truncate ${(member.userId === user?.id || member.id === user?.id) ? 'font-semibold text-violet-400' : 'text-fg'}`}>
                      {member.displayName || member.display_name}
                      {(member.userId === user?.id || member.id === user?.id) && <span className="text-sm text-violet-400/60 ml-1">(you)</span>}
                    </span>
                  </div>
                  {isCommissioner ? (
                    <button
                      onClick={() => handleTogglePayment(member)}
                      disabled={togglingPayment === member.id}
                      className={`px-2.5 py-1 rounded-lg text-sm font-medium transition-all flex-shrink-0 ${
                        member.hasPaid
                          ? 'bg-fg/10 text-green-500'
                          : 'bg-fg/5 text-fg/40 hover:bg-fg/10'
                      }`}
                    >
                      {togglingPayment === member.id ? '...' : member.hasPaid ? 'Paid' : 'Unpaid'}
                    </button>
                  ) : (
                    <span className={`text-sm font-medium flex-shrink-0 ${member.hasPaid ? 'text-green-500' : 'text-fg/30'}`}>
                      {member.hasPaid ? 'Paid' : 'Unpaid'}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {showShareModal && (
        <ShareLeagueModal
          league={{ ...league, entryFee: entryFee || league.entryFee }}
          isCommissioner={isCommissioner}
          onClose={() => setShowShareModal(false)}
          onInviteCodeUpdate={(newCode) => setLeague(prev => ({ ...prev, inviteCode: newCode }))}
        />
      )}

      {/* Chat */}
      {league && (
        <ChatWidget
          leagueId={league.id}
          leagueName={league.name}
          commissionerId={league.commissionerId || league.commissioner_id}
          members={members}
          tournamentId={challenge?.tournament_id}
          championsByUserId={tournamentStarted && (challenge?.max_brackets_per_user || 1) === 1 && tournamentData ? buildChampionsMap() : null}
          onCollapsedChange={setChatCollapsed}
        />
      )}
    </div>
    </div>
  );
}

function SettingsModal({ challenge, league, onClose, onUpdate }) {
  const { showToast } = useToast();
  const entryFee = parseFloat(challenge.entry_fee) || 0;
  const [config, setConfig] = useState({
    maxBracketsPerUser: challenge.max_brackets_per_user,
    scoringPreset: challenge.scoring_preset,
    customScoring: challenge.scoring_preset === 'custom' ? challenge.scoring_system : null,
    tiebreakerType: challenge.tiebreaker_type,
    entryDeadline: challenge.entry_deadline ? new Date(challenge.entry_deadline).toISOString().slice(0, 16) : '',
    entryFee: parseFloat(challenge.entry_fee) || 0,
  });
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await bracketAPI.updateChallenge(challenge.id, {
        maxBracketsPerUser: config.maxBracketsPerUser,
        scoringPreset: config.scoringPreset,
        customScoring: config.customScoring,
        tiebreakerType: config.tiebreakerType,
        entryDeadline: config.entryDeadline || null,
        entryFee: parseFloat(config.entryFee) || 0,
      });
      showToast('Settings updated', 'success');
      onUpdate();
      onClose();
    } catch (err) {
      showToast('Failed to update settings', 'error');
    }
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="fixed inset-0 bg-black/70 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-lg rounded-2xl p-6 animate-in max-h-[85vh] overflow-y-auto"
        style={{ background: 'rgb(var(--color-elevated))', border: '1px solid rgba(255,255,255,0.1)' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-display font-bold text-fg">Challenge Settings</h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-fg/10 text-fg/50"><X className="w-5 h-5" /></button>
        </div>

        {challenge.status !== 'open' ? (
          <p className="text-fg/50 text-sm">Settings cannot be changed after the challenge is locked.</p>
        ) : (
          <>
            <BracketSetup config={config} onChange={setConfig} />

            <button
              onClick={handleSave}
              disabled={saving}
              className="btn-primary w-full mt-6 flex items-center justify-center gap-2"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save Settings'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
