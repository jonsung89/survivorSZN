import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Search, Trophy, Lock, Users, Loader2, Check, ArrowRight } from 'lucide-react';
import { leagueAPI, trackingAPI } from '../api';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/Toast';
import { getSportBadgeClasses } from '../sports';
import SportBadge from '../components/SportBadge';
import AppIcon from '../components/AppIcon';
import BrandLogo from '../components/BrandLogo';

export default function JoinLeague() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { showToast } = useToast();

  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [allLeagues, setAllLeagues] = useState([]);
  const [filteredLeagues, setFilteredLeagues] = useState([]);
  const [joiningId, setJoiningId] = useState(null);
  const [password, setPassword] = useState('');
  const [selectedLeague, setSelectedLeague] = useState(null);

  useEffect(() => {
    loadLeagues();
  }, [user]);

  useEffect(() => {
    // Filter leagues based on search query
    if (!searchQuery.trim()) {
      setFilteredLeagues(allLeagues);
    } else {
      const query = searchQuery.toLowerCase();
      setFilteredLeagues(
        allLeagues.filter(l =>
          l.name.toLowerCase().includes(query) ||
          l.commissionerName?.toLowerCase().includes(query)
        )
      );
    }
  }, [searchQuery, allLeagues]);

  const loadLeagues = async () => {
    try {
      // Use browse endpoint (works with or without auth)
      const result = await leagueAPI.browse();
      if (result.success) {
        setAllLeagues(result.leagues || []);
        setFilteredLeagues(result.leagues || []);
      }
    } catch (error) {
      console.error('Failed to load leagues:', error);
    }
    setLoading(false);
  };

  const handleJoin = async (league) => {
    if (!user) {
      // Redirect to login, then back here
      navigate('/login');
      return;
    }

    if (league.hasPassword && !password.trim()) {
      showToast('Please enter the league password', 'error');
      return;
    }

    setJoiningId(league.id);
    try {
      const result = await leagueAPI.join(league.id, league.hasPassword ? password : '');
      if (result.success) {
        trackingAPI.event('league_join', { leagueId: league.id, leagueName: league.name });
        showToast(`Joined ${league.name}!`, 'success');
        navigate(`/league/${league.id}`);
      } else {
        showToast(result.error || 'Failed to join league', 'error');
      }
    } catch (error) {
      showToast('Failed to join league', 'error');
    }
    setJoiningId(null);
  };

  const handleSelectLeague = (league) => {
    // If already joined, navigate to the league
    if (league.isJoined) {
      navigate(`/league/${league.id}`);
      return;
    }

    // If not logged in, redirect to login
    if (!user) {
      navigate('/login');
      return;
    }

    // Public league — join directly
    if (!league.hasPassword) {
      handleJoin(league);
      return;
    }

    if (selectedLeague?.id === league.id) {
      setSelectedLeague(null);
      setPassword('');
    } else {
      setSelectedLeague(league);
      setPassword('');
    }
  };

  return (
    <div className="max-w-2xl mx-auto px-3 sm:px-4 py-4 sm:py-8">
      {/* Header */}
      <div className="mb-6">
        <h1 className="font-display text-2xl sm:text-3xl font-bold text-fg">
          {user ? 'Join a League' : 'Browse Leagues'}
        </h1>
        <p className="text-fg/60 mt-1 text-sm sm:text-base">
          {user
            ? 'Find a league to join — public leagues are open to everyone'
            : 'See active survivor pool leagues — sign in to join one'
          }
        </p>
      </div>

      {/* Sign in CTA for unauthenticated users */}
      {!user && (
        <Link
          to="/login"
          className="block glass-card rounded-xl p-3 sm:p-4 hover:bg-fg/[0.06] transition-all group mb-4"
        >
          <div className="flex items-center gap-3">
            <BrandLogo size="md" className="flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-fg font-semibold text-sm sm:text-base">Sign in to join a league</p>
              <p className="text-fg/50 text-xs sm:text-sm">Create an account or sign in to start making picks</p>
            </div>
            <ArrowRight className="w-5 h-5 text-fg/30 group-hover:text-fg/60 group-hover:translate-x-0.5 transition-all flex-shrink-0" />
          </div>
        </Link>
      )}

      {/* Search/Filter */}
      <div className="relative mb-4">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-fg/40" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Filter leagues..."
          className="w-full pl-12 pr-4 py-3 bg-fg/5 border border-fg/10 rounded-xl text-fg placeholder-fg/40 focus:outline-none focus:border-nfl-blue"
        />
      </div>

      {/* Leagues List */}
      <div className="glass-card rounded-xl p-4 sm:p-6">
        {loading ? (
          <div className="text-center py-12">
            <Loader2 className="w-8 h-8 text-nfl-blue animate-spin mx-auto mb-3" />
            <p className="text-fg/50">Loading leagues...</p>
          </div>
        ) : filteredLeagues.length === 0 ? (
          <div className="text-center py-8 sm:py-12">
            <Trophy className="w-12 h-12 text-fg/20 mx-auto mb-3" />
            <h3 className="text-lg font-semibold text-fg mb-2">
              {allLeagues.length === 0 ? 'No leagues available' : 'No leagues found'}
            </h3>
            <p className="text-fg/50 text-sm">
              {allLeagues.length === 0
                ? user ? 'There are no leagues to join right now. Try creating one!' : 'There are no leagues right now. Sign in to create one!'
                : 'Try a different search term.'
              }
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-fg/50 text-sm mb-4">
              {filteredLeagues.length} league{filteredLeagues.length !== 1 ? 's' : ''} available
            </p>

            {filteredLeagues.map((league) => (
              <div
                key={league.id}
                className={`p-4 rounded-lg border transition-all ${
                  league.isJoined
                    ? 'bg-green-500/10 border-green-500/30'
                    : selectedLeague?.id === league.id
                    ? 'bg-violet-500/10 border-violet-500/40'
                    : 'bg-fg/5 border-fg/10 hover:border-fg/20'
                }`}
              >
                <div
                  className="flex items-center justify-between cursor-pointer"
                  onClick={() => handleSelectLeague(league)}
                >
                  <div className="flex items-center gap-3">
                    <div className="relative flex-shrink-0">
                      <AppIcon className="w-10 h-10" color={league.isJoined ? 'rgb(139 92 246)' : 'rgb(139 92 246 / 0.35)'} />
                      {league.isJoined && (
                        <div className="absolute -bottom-1 -right-1 w-4.5 h-4.5 rounded-full bg-violet-500 flex items-center justify-center ring-1 ring-white">
                          <Check className="w-3 h-3 text-white" strokeWidth={3} />
                        </div>
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-x-2 gap-y-0.5 flex-wrap">
                        <h3 className="font-semibold text-fg">{league.name}</h3>
                        <SportBadge sportId={league.sport || league.sportId} />
                        {league.isJoined && (
                          <span className="hidden sm:flex items-center gap-1 text-xs bg-green-500/20 text-green-500 px-1.5 py-0.5 rounded font-medium">
                            <Check className="w-3 h-3" />
                            Joined
                          </span>
                        )}
                        {!league.isJoined && league.hasPassword && (
                          <Lock className="w-3.5 h-3.5 text-fg/30" />
                        )}
                      </div>
                      <div className="flex items-center gap-3 text-sm text-fg/50 mt-0.5">
                        <span className="flex items-center gap-1">
                          <Users className="w-3.5 h-3.5" />
                          {league.memberCount}
                        </span>
                        <span>{league.maxStrikes} strike{league.maxStrikes !== 1 ? 's' : ''}</span>
                        <span className="hidden sm:inline">by {league.commissionerName}</span>
                      </div>
                    </div>
                  </div>

                  {/* Only show action button for authenticated users or joined leagues */}
                  {(user || league.isJoined) && (
                    <button
                      className={`ml-3 flex-shrink-0 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                        league.isJoined
                          ? 'bg-green-500/15 text-green-500 hover:bg-green-500/25'
                          : selectedLeague?.id === league.id
                          ? 'bg-fg/10 text-fg'
                          : 'bg-fg/5 text-fg/70 hover:bg-fg/10'
                      }`}
                    >
                      {league.isJoined ? 'View' : selectedLeague?.id === league.id ? 'Cancel' : 'Join'}
                    </button>
                  )}
                </div>

                {user && !league.isJoined && league.hasPassword && selectedLeague?.id === league.id && (
                  <div className="flex gap-3 mt-4 pt-4 border-t border-fg/10">
                    <div className="relative flex-1">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-fg/40" />
                      <input
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Enter league password"
                        className="w-full pl-10 pr-4 py-2.5 bg-fg/5 border border-fg/10 rounded-lg text-fg placeholder-fg/40 focus:outline-none focus:border-violet-500 text-sm"
                        onKeyDown={(e) => e.key === 'Enter' && handleJoin(league)}
                        autoFocus
                      />
                    </div>
                    <button
                      onClick={() => handleJoin(league)}
                      disabled={joiningId === league.id || !password.trim()}
                      className="bg-violet-600 hover:bg-violet-500 disabled:bg-violet-600/50 text-white px-5 py-2.5 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors"
                    >
                      {joiningId === league.id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        'Join'
                      )}
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
