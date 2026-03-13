import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  Lock, Loader2,
  AlertCircle, Check, LogIn, UserPlus, DollarSign
} from 'lucide-react';
import { leagueAPI } from '../api';
import { useAuth } from '../context/AuthContext';
import { useToast } from './Toast';
import Loading from './Loading';
import AppIcon from './AppIcon';
import SportBadge from './SportBadge';

export default function JoinByInvite() {
  const { inviteCode } = useParams();
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const { showToast } = useToast();

  const [league, setLeague] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [password, setPassword] = useState('');
  const [joining, setJoining] = useState(false);

  useEffect(() => {
    loadLeague();
  }, [inviteCode]);

  const loadLeague = async () => {
    setLoading(true);
    setError(null);

    try {
      const result = await leagueAPI.getByInviteCode(inviteCode);
      if (result.success) {
        setLeague(result.league);
      } else {
        setError(result.error || 'League not found');
      }
    } catch (err) {
      setError('Failed to load league');
    }

    setLoading(false);
  };

  const handleJoin = async (e) => {
    e.preventDefault();

    if (!user) {
      sessionStorage.setItem('pendingInvite', inviteCode);
      navigate('/login');
      return;
    }

    if (!password.trim()) {
      showToast('Please enter the league password', 'error');
      return;
    }

    setJoining(true);

    try {
      const result = await leagueAPI.join(league.id, password);
      if (result.success) {
        showToast(`Welcome to ${league.name}!`, 'success');
        navigate(`/league/${league.id}`);
      } else {
        showToast(result.error || 'Failed to join league', 'error');
      }
    } catch (err) {
      showToast('Something went wrong', 'error');
    }

    setJoining(false);
  };

  if (loading || authLoading) {
    return <Loading fullScreen />;
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="text-center">
          <div className="w-20 h-20 bg-red-500/20 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <AlertCircle className="w-10 h-10 text-red-400" />
          </div>
          <h1 className="text-2xl font-display font-bold text-fg mb-2">
            Invalid Invite Link
          </h1>
          <p className="text-fg/60 mb-6">
            {error}
          </p>
          <Link to="/leagues/join" className="btn-primary">
            Browse Leagues
          </Link>
        </div>
      </div>
    );
  }

  const entryFee = league.entryFee || 0;
  const isNcaab = league.sportId === 'ncaab';

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* League Card */}
        <div className="glass-card rounded-2xl p-6 mb-6 animate-in">
          <div className="text-center mb-6">
            <div className="flex justify-center mb-2">
              <AppIcon className="w-16 h-16" color="rgb(139 92 246)" />
            </div>
            <h1 className="text-2xl font-display font-bold text-fg mb-1">
              {league.name}
            </h1>
            <p className="text-fg/60">
              You've been invited to join this league
            </p>
          </div>

          {/* League Info */}
          <div className="grid grid-cols-3 gap-3 mb-4">
            <div className="bg-fg/5 rounded-xl p-3 text-center flex flex-col items-center justify-center">
              <p className="text-fg font-bold">{league.memberCount}</p>
              <p className="text-fg/40 text-xs">Members</p>
            </div>
            {isNcaab ? (
              <div className="bg-fg/5 rounded-xl p-3 text-center flex flex-col items-center justify-center">
                <p className="text-fg font-bold text-sm">Bracket</p>
                <p className="text-fg/40 text-xs">Challenge</p>
              </div>
            ) : (
              <div className="bg-fg/5 rounded-xl p-3 text-center">
                <p className="text-fg/40 text-xs mb-1">Max Strikes</p>
                <p className="text-fg font-bold">{league.maxStrikes}</p>
              </div>
            )}
            <div className="bg-fg/5 rounded-xl p-3 flex flex-col items-center justify-center">
              <SportBadge sportId={league.sportId} />
              <p className="text-fg/40 text-xs mt-1">
                {isNcaab ? 'March Madness' : league.season}
              </p>
            </div>
          </div>

          {/* Entry Fee + Commissioner */}
          <div className="space-y-3 mb-6">
            {entryFee > 0 && (
              <div className="bg-fg/5 rounded-xl p-3 flex items-center gap-3">
                <div className="w-8 h-8 bg-emerald-500/20 rounded-lg flex items-center justify-center flex-shrink-0">
                  <DollarSign className="w-4 h-4 text-emerald-400" />
                </div>
                <div>
                  <p className="text-fg font-bold">${entryFee}{isNcaab ? '/bracket' : ''}</p>
                  <p className="text-fg/40 text-xs">Entry Fee</p>
                </div>
              </div>
            )}
            <div className="bg-fg/5 rounded-xl p-3">
              <p className="text-fg/50 text-xs mb-1">Commissioner</p>
              <p className="text-fg font-medium">{league.commissionerName}</p>
            </div>
          </div>

          {/* Join Form */}
          {user ? (
            <form onSubmit={handleJoin}>
              <div className="mb-4">
                <label className="block text-fg/80 text-sm font-medium mb-2">
                  <Lock className="w-4 h-4 inline mr-2" />
                  League Password
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter password to join"
                  className="w-full px-4 py-3 bg-fg/5 border border-fg/10 rounded-xl text-fg placeholder-fg/30 focus:outline-none focus:border-nfl-blue"
                  autoFocus
                />
                <p className="text-fg/40 text-xs mt-2">
                  Ask the commissioner for the password
                </p>
              </div>

              <button
                type="submit"
                disabled={joining}
                className="w-full btn-primary flex items-center justify-center gap-2 py-4"
              >
                {joining ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <>
                    <Check className="w-5 h-5" />
                    Join League
                  </>
                )}
              </button>
            </form>
          ) : (
            <div className="space-y-3">
              <p className="text-fg/60 text-center text-sm mb-4">
                Sign in or create an account to join this league
              </p>
              <Link
                to="/login"
                state={{ returnTo: `/join/${inviteCode}` }}
                onClick={() => sessionStorage.setItem('pendingInvite', inviteCode)}
                className="w-full btn-primary flex items-center justify-center gap-2 py-4"
              >
                <LogIn className="w-5 h-5" />
                Sign In to Join
              </Link>
              <Link
                to="/login"
                state={{ returnTo: `/join/${inviteCode}` }}
                onClick={() => sessionStorage.setItem('pendingInvite', inviteCode)}
                className="w-full btn-secondary flex items-center justify-center gap-2"
              >
                <UserPlus className="w-5 h-5" />
                Create Account
              </Link>
            </div>
          )}
        </div>

        {/* Back Link */}
        <div className="text-center">
          <Link to="/dashboard" className="text-fg/70 hover:text-fg text-base font-medium">
            &larr; Back to Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
