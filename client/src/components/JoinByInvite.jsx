import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { 
  Trophy, Users, Shield, Calendar, Lock, Loader2, 
  AlertCircle, Check, LogIn, UserPlus
} from 'lucide-react';
import { leagueAPI } from '../api';
import { useAuth } from '../context/AuthContext';
import { useToast } from './Toast';
import Loading from './Loading';

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
      // Save invite code and redirect to login
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
          <h1 className="text-2xl font-display font-bold text-white mb-2">
            Invalid Invite Link
          </h1>
          <p className="text-white/60 mb-6">
            {error}
          </p>
          <Link to="/leagues/join" className="btn-primary">
            Browse Leagues
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* League Card */}
        <div className="glass-card rounded-2xl p-6 mb-6 animate-in">
          <div className="text-center mb-6">
            <div className="w-20 h-20 bg-gradient-to-br from-nfl-blue to-nfl-purple rounded-2xl flex items-center justify-center mx-auto mb-4">
              <Trophy className="w-10 h-10 text-white" />
            </div>
            <h1 className="text-2xl font-display font-bold text-white mb-1">
              {league.name}
            </h1>
            <p className="text-white/60">
              You've been invited to join this league
            </p>
          </div>

          {/* League Stats */}
          <div className="grid grid-cols-3 gap-3 mb-6">
            <div className="bg-white/5 rounded-xl p-3 text-center">
              <Users className="w-5 h-5 text-white mx-auto mb-1" />
              <p className="text-white font-bold">{league.memberCount}</p>
              <p className="text-white/40 text-xs">Members</p>
            </div>
            <div className="bg-white/5 rounded-xl p-3 text-center">
              <Shield className="w-5 h-5 text-orange-400 mx-auto mb-1" />
              <p className="text-white font-bold">{league.maxStrikes}</p>
              <p className="text-white/40 text-xs">Max Strikes</p>
            </div>
            <div className="bg-white/5 rounded-xl p-3 text-center">
              <Calendar className="w-5 h-5 text-emerald-400 mx-auto mb-1" />
              <p className="text-white font-bold">Week {league.startWeek}</p>
              <p className="text-white/40 text-xs">Start</p>
            </div>
          </div>

          {/* Commissioner */}
          <div className="bg-white/5 rounded-xl p-3 mb-6">
            <p className="text-white/50 text-xs mb-1">Commissioner</p>
            <p className="text-white font-medium">{league.commissionerName}</p>
          </div>

          {/* Join Form */}
          {user ? (
            <form onSubmit={handleJoin}>
              <div className="mb-4">
                <label className="block text-white/80 text-sm font-medium mb-2">
                  <Lock className="w-4 h-4 inline mr-2" />
                  League Password
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter password to join"
                  className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-white/30 focus:outline-none focus:border-nfl-blue"
                  autoFocus
                />
                <p className="text-white/40 text-xs mt-2">
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
              <p className="text-white/60 text-center text-sm mb-4">
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
          <Link to="/dashboard" className="text-white/50 hover:text-white text-sm">
            ← Back to Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}