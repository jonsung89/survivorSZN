import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Trophy, Plus, ArrowLeft, Loader2, Users, Settings, Check, Clock, Calendar, DollarSign, X, Crown, Pencil } from 'lucide-react';
import { bracketAPI, leagueAPI } from '../api';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/Toast';
import Loading from '../components/Loading';
import BracketLeaderboard from '../components/bracket/BracketLeaderboard';
import BracketSetup from '../components/bracket/BracketSetup';
import { ShareLeagueButton, ShareLeagueModal } from '../components/ShareLeague';
import { getSportBadgeClasses } from '../sports';
import { SCORING_PRESETS, countPicks } from '../utils/bracketSlots';

export default function BracketChallenge() {
  const { leagueId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { showToast } = useToast();

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
  const [selectionCountdown, setSelectionCountdown] = useState(null);
  const [isEditingName, setIsEditingName] = useState(false);
  const [editName, setEditName] = useState('');
  const [togglingPayment, setTogglingPayment] = useState(null);

  const isCommissioner = league?.commissionerId === user?.id || league?.commissioner_id === user?.id;
  const entryFee = parseFloat(challenge?.entry_fee) || 0;
  const members = league?.members || [];

  useEffect(() => {
    loadData();
  }, [leagueId]);

  // Selection Show countdown (March 15, 2026 at 6pm ET)
  useEffect(() => {
    if (fieldAnnounced !== false) return;

    const selectionDate = new Date('2026-03-15T18:00:00-05:00');

    const update = () => {
      const diff = selectionDate - new Date();
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
  }, [fieldAnnounced]);

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

      // Check if tournament field has been announced
      try {
        const season = leagueObj.season || new Date().getFullYear();
        const tournamentData = await bracketAPI.getTournamentData(season);
        const realTeams = Object.values(tournamentData.teams || {}).filter(t => t.name !== 'TBD');
        setFieldAnnounced(realTeams.length >= 64);
      } catch {
        setFieldAnnounced(false);
      }

      if (challengeData.challenge) {
        try {
          const lb = await bracketAPI.getLeaderboard(challengeData.challenge.id);
          setLeaderboard(lb.leaderboard || []);
        } catch { /* leaderboard is optional */ }
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

  const handleLeagueNameSave = async () => {
    setIsEditingName(false);
    const trimmed = editName.trim();
    if (!trimmed || trimmed === league?.name) return;
    const oldName = league?.name;
    setLeague(prev => ({ ...prev, name: trimmed }));
    try {
      await leagueAPI.updateSettings(leagueId, { name: trimmed });
      showToast('League name updated', 'success');
    } catch {
      setLeague(prev => ({ ...prev, name: oldName }));
      showToast('Failed to rename league', 'error');
    }
  };

  const handleTogglePayment = async (member) => {
    setTogglingPayment(member.id);
    try {
      await leagueAPI.togglePayment(leagueId, member.id, !member.hasPaid);
      setLeague(prev => ({
        ...prev,
        members: prev.members.map(m =>
          m.id === member.id ? { ...m, hasPaid: !m.hasPaid } : m
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

  // Count brackets submitted per user from leaderboard
  const submittedByUser = {};
  leaderboard.forEach(entry => {
    submittedByUser[entry.userId] = (submittedByUser[entry.userId] || 0) + 1;
  });

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      {/* Header */}
      <div className="flex flex-col gap-4 mb-6">
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <Link to="/dashboard" className="inline-flex items-center gap-1 text-fg/50 hover:text-fg text-sm mb-2 transition-colors">
              <ArrowLeft className="w-3.5 h-3.5" />
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
              {isCommissioner && (
                <span className="badge badge-active text-xs flex items-center gap-1 flex-shrink-0">
                  <Crown className="w-3 h-3" />
                  Commish
                </span>
              )}
            </div>
            <p className="text-fg/50 text-sm mt-1">
              {members.length} member{members.length !== 1 ? 's' : ''}
              {entryFee > 0 && <> &middot; ${entryFee}/bracket</>}
            </p>
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              <span className={`text-[10px] font-bold tracking-wide uppercase px-1.5 py-0.5 rounded ${getSportBadgeClasses('ncaab')}`}>
                March Madness
              </span>
              <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-xs font-bold uppercase ${
                isOpen ? 'bg-emerald-500/15 text-emerald-400' :
                challenge.status === 'locked' ? 'bg-amber-500/15 text-amber-400' :
                'bg-fg/10 text-fg/50'
              }`}>
                {isOpen ? 'Open' : challenge.status === 'locked' ? 'Locked' : 'Completed'}
              </span>
              <span className="text-xs text-fg/40">{challenge.scoring_preset} scoring</span>
            </div>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2">
          <ShareLeagueButton onClick={() => setShowShareModal(true)} />
          {isCommissioner && (
            <button
              onClick={() => setShowSettings(true)}
              className="btn-secondary flex items-center gap-2 text-sm py-2.5"
            >
              <Settings className="w-4 h-4" />
              <span className="hidden sm:inline">Settings</span>
            </button>
          )}
        </div>
      </div>

      {/* Prize Pot Card */}
      {entryFee > 0 && (
        <div className="glass-card rounded-xl p-4 sm:p-5 mb-5 animate-in">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center flex-shrink-0">
                <DollarSign className="w-6 h-6 text-white" />
              </div>
              <div>
                <p className="text-fg/60 text-sm">Prize Pot</p>
                <p className="text-2xl font-bold text-fg">
                  ${(entryFee * leaderboard.length).toLocaleString()}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-4 sm:gap-6">
              <div className="text-center">
                <p className="text-fg/60 text-xs">Per Bracket</p>
                <p className="text-lg font-semibold text-fg">${entryFee}</p>
              </div>
              {isCommissioner && (
                <div className="text-center">
                  <p className="text-fg/60 text-xs">Paid</p>
                  <p className="text-lg font-semibold text-green-500">
                    {paidCount}/{members.length}
                  </p>
                </div>
              )}
              <div className="text-center">
                <p className="text-fg/60 text-xs">Entries</p>
                <p className="text-lg font-semibold text-fg">{leaderboard.length}</p>
              </div>
            </div>
          </div>
          <p className="text-fg/40 text-xs mt-3 pt-3 border-t border-fg/10">
            💰 Pot splits evenly among winners. Each submitted bracket = one ${entryFee} entry.
          </p>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 mb-5 border-b border-fg/10 pb-px">
        {['brackets', 'leaderboard', 'members'].map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
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
            const progress = Math.round((pickCount / 63) * 100);

            return (
              <div
                key={bracket.id}
                onClick={() => navigate(`/league/${leagueId}/bracket/${bracket.id}`)}
                className={`glass-card rounded-xl p-4 cursor-pointer hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200 border-l-[3px] ${
                  bracket.is_submitted ? 'border-l-emerald-500/60' : 'border-l-violet-500/60'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-medium text-fg">{bracket.name || `Bracket ${bracket.bracket_number}`}</h3>
                    <div className="flex items-center gap-3 mt-1 text-sm text-fg/50">
                      {bracket.is_submitted ? (
                        <span className="inline-flex items-center gap-1 text-emerald-400">
                          <Check className="w-3 h-3" /> Submitted
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-amber-400">
                          <Clock className="w-3 h-3" /> {pickCount}/63 picks
                        </span>
                      )}
                      {bracket.is_submitted && (
                        <span className="font-mono">{bracket.total_score} pts</span>
                      )}
                    </div>
                  </div>

                  {!bracket.is_submitted && (
                    <div className="w-12 h-12 relative">
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
                  )}
                </div>
              </div>
            );
          })}

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
          {isOpen && canCreateMore && fieldAnnounced !== false && (
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
          scoringSystem={scoringSystem}
          onBracketClick={(bracketId) => navigate(`/league/${leagueId}/bracket/${bracketId}`)}
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
                className={`glass-card rounded-xl p-4 flex items-center justify-between ${isMe ? 'border border-violet-500/20' : ''}`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-full bg-fg/10 flex items-center justify-center flex-shrink-0 text-fg/40 font-bold text-sm">
                    {(member.displayName || '?')[0].toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={`font-medium truncate ${isMe ? 'text-violet-400' : 'text-fg'}`}>
                        {member.displayName || 'Anonymous'}
                      </span>
                      {isMe && <span className="text-xs text-violet-400/60">(you)</span>}
                      {memberCommissioner && (
                        <span className="inline-flex items-center gap-0.5 text-xs text-amber-400">
                          <Crown className="w-3 h-3" />
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-fg/40 mt-0.5">
                      {bracketCount > 0 ? (
                        <span className="text-emerald-400">{bracketCount} bracket{bracketCount !== 1 ? 's' : ''} submitted</span>
                      ) : (
                        <span>No brackets submitted</span>
                      )}
                      {isCommissioner && member.email && (
                        <>
                          <span className="text-fg/20">•</span>
                          <span>{member.email}</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                {/* Payment toggle (commissioner only, when entry fee > 0) */}
                {isCommissioner && entryFee > 0 && (
                  <button
                    onClick={() => handleTogglePayment(member)}
                    disabled={togglingPayment === member.id}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all flex items-center gap-1.5 flex-shrink-0 ${
                      member.hasPaid
                        ? 'bg-green-500/20 text-green-500 hover:bg-green-500/30'
                        : 'bg-fg/10 text-fg/60 hover:bg-fg/15'
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
          members={members}
          onClose={() => setShowSettings(false)}
          onUpdate={loadData}
          onTogglePayment={handleTogglePayment}
          togglingPayment={togglingPayment}
        />
      )}

      {/* Share Modal */}
      {showShareModal && (
        <ShareLeagueModal
          league={league}
          isCommissioner={isCommissioner}
          onClose={() => setShowShareModal(false)}
          onInviteCodeUpdate={(newCode) => setLeague(prev => ({ ...prev, inviteCode: newCode }))}
        />
      )}
    </div>
  );
}

function SettingsModal({ challenge, league, members, onClose, onUpdate, onTogglePayment, togglingPayment }) {
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

            {/* Payment Status in Settings */}
            {(entryFee > 0 || parseFloat(config.entryFee) > 0) && members?.length > 0 && (
              <div className="mt-5">
                <label className="block text-fg/80 text-sm font-medium mb-2">
                  Payment Status
                </label>
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {members.map(member => (
                    <div
                      key={member.id}
                      className="flex items-center justify-between p-3 bg-fg/5 rounded-lg"
                    >
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-fg/10 flex items-center justify-center text-fg/40 font-bold text-xs">
                          {(member.displayName || '?')[0].toUpperCase()}
                        </div>
                        <div>
                          <span className="text-fg text-sm">{member.displayName}</span>
                          {member.email && (
                            <p className="text-fg/40 text-xs">{member.email}</p>
                          )}
                        </div>
                      </div>
                      <button
                        onClick={() => onTogglePayment(member)}
                        disabled={togglingPayment === member.id}
                        className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all flex items-center gap-1.5 ${
                          member.hasPaid
                            ? 'bg-green-500/20 text-green-500 hover:bg-green-500/30'
                            : 'bg-fg/10 text-fg/60 hover:bg-fg/15'
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
                    </div>
                  ))}
                </div>
              </div>
            )}

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
