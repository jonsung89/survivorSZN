import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Trophy, Plus, ArrowLeft, Loader2, Users, Settings, Check, Clock, Calendar, DollarSign } from 'lucide-react';
import { bracketAPI, leagueAPI } from '../api';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/Toast';
import Loading from '../components/Loading';
import BracketLeaderboard from '../components/bracket/BracketLeaderboard';
import BracketSetup from '../components/bracket/BracketSetup';
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
  const [fieldAnnounced, setFieldAnnounced] = useState(null); // null = loading, true/false

  const isCommissioner = league?.commissioner_id === user?.id;

  useEffect(() => {
    loadData();
  }, [leagueId]);

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

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <Link to="/dashboard" className="inline-flex items-center gap-1 text-fg/50 hover:text-fg text-sm mb-2 transition-colors">
            <ArrowLeft className="w-3.5 h-3.5" />
            My Leagues
          </Link>
          <h1 className="text-2xl font-display font-bold text-fg flex items-center gap-2">
            <Trophy className="w-6 h-6 text-amber-400" />
            {league?.name || 'Bracket Challenge'}
          </h1>
          <div className="flex items-center gap-3 mt-1 text-sm text-fg/50">
            <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-xs font-bold uppercase ${
              isOpen ? 'bg-emerald-500/15 text-emerald-400' :
              challenge.status === 'locked' ? 'bg-amber-500/15 text-amber-400' :
              'bg-fg/10 text-fg/50'
            }`}>
              {isOpen ? 'Open' : challenge.status === 'locked' ? 'Locked' : 'Completed'}
            </span>
            <span>{challenge.scoring_preset} scoring</span>
            {parseFloat(challenge.entry_fee) > 0 && (
              <>
                <span className="text-fg/30">•</span>
                <span>${parseFloat(challenge.entry_fee)} entry</span>
                <span className="text-fg/30">•</span>
                <span className="text-emerald-400 font-medium">
                  ${parseFloat(challenge.entry_fee) * leaderboard.length} pot
                </span>
              </>
            )}
          </div>
        </div>

        {isCommissioner && (
          <button
            onClick={() => setShowSettings(!showSettings)}
            className="p-2 rounded-lg hover:bg-fg/10 transition-colors text-fg/50 hover:text-fg"
          >
            <Settings className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-5 border-b border-fg/10 pb-px">
        {['brackets', 'leaderboard'].map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
              activeTab === tab
                ? 'border-violet-500 text-fg'
                : 'border-transparent text-fg/50 hover:text-fg/70'
            }`}
          >
            {tab === 'brackets' ? 'My Brackets' : 'Leaderboard'}
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
              <h3 className="text-lg font-display font-bold text-fg mb-2">You're Early!</h3>
              <p className="text-fg/50 text-sm max-w-md mx-auto mb-3">
                The tournament field of 68 has not been announced yet. Come back after the Selection Show on <span className="text-fg/70 font-medium">March 15th at 6:00pm ET</span> to fill out your bracket.
              </p>
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

      {/* Settings Modal */}
      {showSettings && isCommissioner && (
        <SettingsModal
          challenge={challenge}
          onClose={() => setShowSettings(false)}
          onUpdate={loadData}
        />
      )}
    </div>
  );
}

function SettingsModal({ challenge, onClose, onUpdate }) {
  const { showToast } = useToast();
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
