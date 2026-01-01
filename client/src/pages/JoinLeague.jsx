import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Trophy, Lock, Users, Loader2, Check } from 'lucide-react';
import { leagueAPI } from '../api';
import { useToast } from '../components/Toast';

export default function JoinLeague() {
  const navigate = useNavigate();
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
  }, []);

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
      const result = await leagueAPI.getAvailable();
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
    if (!password.trim()) {
      showToast('Please enter the league password', 'error');
      return;
    }

    setJoiningId(league.id);
    try {
      const result = await leagueAPI.join(league.id, password);
      if (result.success) {
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
        <h1 className="font-display text-2xl sm:text-3xl font-bold text-white">Join a League</h1>
        <p className="text-white/60 mt-1 text-sm sm:text-base">Find a league and join with the password from your commissioner</p>
      </div>

      {/* Search/Filter */}
      <div className="relative mb-4">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/40" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Filter leagues..."
          className="w-full pl-12 pr-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-white/40 focus:outline-none focus:border-nfl-blue"
        />
      </div>

      {/* Leagues List */}
      <div className="glass-card rounded-xl p-4 sm:p-6">
        {loading ? (
          <div className="text-center py-12">
            <Loader2 className="w-8 h-8 text-nfl-blue animate-spin mx-auto mb-3" />
            <p className="text-white/50">Loading leagues...</p>
          </div>
        ) : filteredLeagues.length === 0 ? (
          <div className="text-center py-8 sm:py-12">
            <Trophy className="w-12 h-12 text-white/20 mx-auto mb-3" />
            <h3 className="text-lg font-semibold text-white mb-2">
              {allLeagues.length === 0 ? 'No leagues available' : 'No leagues found'}
            </h3>
            <p className="text-white/50 text-sm">
              {allLeagues.length === 0 
                ? 'There are no leagues to join right now. Try creating one!'
                : 'Try a different search term.'
              }
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-white/50 text-sm mb-4">
              {filteredLeagues.length} league{filteredLeagues.length !== 1 ? 's' : ''} available
            </p>
            
            {filteredLeagues.map((league) => (
              <div
                key={league.id}
                className={`p-4 rounded-lg border transition-all ${
                  league.isJoined
                    ? 'bg-green-500/10 border-green-500/30'
                    : selectedLeague?.id === league.id
                    ? 'bg-nfl-blue/10 border-nfl-blue'
                    : 'bg-white/5 border-white/10 hover:border-white/20'
                }`}
              >
                <div 
                  className="flex items-center justify-between cursor-pointer"
                  onClick={() => handleSelectLeague(league)}
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
                      league.isJoined 
                        ? 'bg-gradient-to-br from-green-600 to-green-700'
                        : 'bg-gradient-to-br from-nfl-blue to-blue-700'
                    }`}>
                      {league.isJoined ? (
                        <Check className="w-5 h-5 text-white" />
                      ) : (
                        <Trophy className="w-5 h-5 text-white" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-white truncate">{league.name}</h3>
                        {league.isJoined && (
                          <span className="flex items-center gap-1 text-xs bg-green-500/20 text-green-400 px-1.5 py-0.5 rounded">
                            <Check className="w-3 h-3" />
                            Joined
                          </span>
                        )}
                        {!league.isJoined && league.hasPassword && (
                          <span className="flex items-center gap-1 text-xs bg-amber-500/20 text-amber-400 px-1.5 py-0.5 rounded">
                            <Lock className="w-3 h-3" />
                            Private
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 text-sm text-white/50">
                        <span className="flex items-center gap-1">
                          <Users className="w-3.5 h-3.5" />
                          {league.memberCount}
                        </span>
                        <span>{league.maxStrikes} strike{league.maxStrikes !== 1 ? 's' : ''}</span>
                        <span className="hidden sm:inline">by {league.commissionerName}</span>
                      </div>
                    </div>
                  </div>
                  
                  <button
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                      league.isJoined
                        ? 'bg-green-500/20 text-green-400 hover:bg-green-500/30'
                        : selectedLeague?.id === league.id
                        ? 'bg-white/10 text-white'
                        : 'bg-white/5 text-white/70 hover:bg-white/10'
                    }`}
                  >
                    {league.isJoined ? 'View' : selectedLeague?.id === league.id ? 'Cancel' : 'Join'}
                  </button>
                </div>

                {!league.isJoined && selectedLeague?.id === league.id && (
                  <div className="flex gap-3 mt-4 pt-4 border-t border-white/10">
                    <div className="relative flex-1">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
                      <input
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Enter league password"
                        className="w-full pl-10 pr-4 py-2.5 bg-white/5 border border-white/10 rounded-lg text-white placeholder-white/40 focus:outline-none focus:border-nfl-blue text-sm"
                        onKeyDown={(e) => e.key === 'Enter' && handleJoin(league)}
                        autoFocus
                      />
                    </div>
                    <button
                      onClick={() => handleJoin(league)}
                      disabled={joiningId === league.id || !password.trim()}
                      className="bg-green-600 hover:bg-green-500 disabled:bg-green-600/50 text-white px-5 py-2.5 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors"
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