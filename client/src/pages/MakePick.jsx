import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link, useSearchParams } from 'react-router-dom';
import { 
  ArrowLeft, Calendar, Check, Lock, ChevronLeft, ChevronRight, ChevronDown, ChevronUp,
  Loader2, TrendingUp, TrendingDown, AlertTriangle, X, ExternalLink, Newspaper,
  BarChart3, MapPin, Trophy
} from 'lucide-react';
import { leagueAPI, picksAPI, nflAPI } from '../api';
import { useToast } from '../components/Toast';
import Loading from '../components/Loading';

export default function MakePick() {
  const { leagueId } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { showToast } = useToast();
  
  const [loading, setLoading] = useState(true);
  const [loadingWeek, setLoadingWeek] = useState(null); // Track which week is loading
  const [submitting, setSubmitting] = useState(false);
  const [league, setLeague] = useState(null);
  const [currentWeek, setCurrentWeek] = useState(18);
  const [selectedWeek, setSelectedWeek] = useState(null); // Start as null until we know the week
  const [games, setGames] = useState([]);
  const [selectedTeam, setSelectedTeam] = useState(null);
  const [currentPick, setCurrentPick] = useState(null);
  const [currentPickLocked, setCurrentPickLocked] = useState(false);
  const [usedTeams, setUsedTeams] = useState([]);
  const [injuries, setInjuries] = useState({});
  const [teamInfoDialog, setTeamInfoDialog] = useState({ open: false, team: null, data: null, loading: false });

  const openTeamInfo = async (team) => {
    setTeamInfoDialog({ open: true, team, data: null, loading: true });
    try {
      const data = await nflAPI.getTeamInfo(team.id);
      setTeamInfoDialog(prev => ({ ...prev, data, loading: false }));
    } catch (error) {
      console.error('Failed to load team info:', error);
      setTeamInfoDialog(prev => ({ ...prev, loading: false }));
    }
  };

  // Helper to get week label (handles playoff weeks)
  const getWeekLabel = (week) => {
    if (week <= 18) return `Week ${week}`;
    if (week === 19) return 'Wild Card';
    if (week === 20) return 'Divisional';
    if (week === 21) return 'Conference';
    if (week === 22) return 'Super Bowl';
    return `Week ${week}`;
  };

  useEffect(() => {
    loadInitialData();
  }, [leagueId]);

  useEffect(() => {
    if (league && selectedWeek) {
      loadTeams(selectedWeek);
    }
  }, [selectedWeek, league]);

  const loadInitialData = async () => {
    setLoading(true);
    try {
      const leagueResult = await leagueAPI.getLeague(leagueId);
      const leagueData = leagueResult.success ? leagueResult.league : leagueResult;
      
      if (leagueData.error) {
        showToast(leagueData.error || 'Failed to load league', 'error');
        navigate('/leagues');
        return;
      }
      
      setLeague(leagueData);

      const seasonResult = await nflAPI.getSeason();
      const week = seasonResult.week || 18;
      setCurrentWeek(week);
      
      // Check for week parameter in URL, otherwise use current week
      const urlWeek = searchParams.get('week');
      const targetWeek = urlWeek ? parseInt(urlWeek) : week;
      setSelectedWeek(targetWeek);

      const picksResult = await picksAPI.getLeaguePicks(leagueId);
      if (picksResult.usedTeams) {
        setUsedTeams(picksResult.usedTeams);
      }
    } catch (error) {
      console.error('Load initial data error:', error);
      showToast('Failed to load data', 'error');
    }
    setLoading(false);
  };

  const loadTeams = async (week) => {
    // Clear state immediately to prevent showing stale data
    setLoadingWeek(week);
    setCurrentPick(null);
    setSelectedTeam(null);
    setCurrentPickLocked(false);
    
    try {
      const result = await picksAPI.getAvailableTeams(leagueId, week);
      const data = result.success ? result.data || result : result;
      
      if (data.teams && data.teams.length > 0) {
        const gameMap = new Map();
        
        for (const item of data.teams) {
          const gameId = item.game?.id;
          if (!gameId) continue;
          
          if (!gameMap.has(gameId)) {
            gameMap.set(gameId, {
              id: gameId,
              date: item.game.date,
              venue: item.game.venue,
              broadcast: item.game.broadcast,
              odds: item.game.odds,
              homeTeam: null,
              awayTeam: null
            });
          }
          
          const game = gameMap.get(gameId);
          const teamData = {
            ...item.team,
            isLocked: item.isLocked,
            isUsed: item.isUsed || usedTeams.includes(item.team?.id),
            isCurrentPick: item.isPickedThisWeek || false
          };
          
          if (item.game.isHome) {
            game.homeTeam = teamData;
          } else {
            game.awayTeam = teamData;
          }
        }
        
        const gamesArray = Array.from(gameMap.values())
          .filter(g => g.homeTeam && g.awayTeam)
          .sort((a, b) => new Date(a.date) - new Date(b.date));
        
        setGames(gamesArray);
        
        // Fetch injuries for all teams
        const teamIds = [];
        gamesArray.forEach(g => {
          if (g.homeTeam?.id) teamIds.push(g.homeTeam.id);
          if (g.awayTeam?.id) teamIds.push(g.awayTeam.id);
        });
        
        if (teamIds.length > 0) {
          try {
            const injuriesData = await nflAPI.getInjuriesForTeams(teamIds);
            setInjuries(injuriesData || {});
          } catch (e) {
            console.log('Could not fetch injuries:', e);
            setInjuries({});
          }
        }
        
        // Check if current pick's game is locked
        if (data.currentPicks && data.currentPicks.length > 0) {
          const pick = data.currentPicks[0];
          setCurrentPick(pick);
          setSelectedTeam(pick.teamId);
          
          // Find if the current pick's team game is locked
          const currentPickTeam = data.teams.find(t => t.team?.id === pick.teamId);
          if (currentPickTeam?.isLocked) {
            setCurrentPickLocked(true);
          } else {
            setCurrentPickLocked(false);
          }
        } else if (data.currentPick) {
          // Backward compatibility
          setCurrentPick(data.currentPick);
          setSelectedTeam(data.currentPick.teamId);
          const currentPickTeam = data.teams.find(t => t.team?.id === data.currentPick.teamId);
          setCurrentPickLocked(currentPickTeam?.isLocked || false);
        }
        // Note: if no pick, state is already cleared at the start
      } else {
        setGames([]);
        setSelectedTeam(null);
        setCurrentPickLocked(false);
      }
    } catch (error) {
      console.error('Load teams error:', error);
      setGames([]);
    } finally {
      setLoadingWeek(null);
    }
  };

  const handleSelectTeam = (team) => {
    if (!team || team.isLocked || (team.isUsed && !team.isCurrentPick)) return;
    setSelectedTeam(team.id === selectedTeam ? null : team.id);
  };

  const handleSubmit = async () => {
    if (!selectedTeam) {
      showToast('Please select a team', 'error');
      return;
    }

    setSubmitting(true);
    try {
      const result = await picksAPI.makePick({
        leagueId,
        week: selectedWeek,
        teamId: selectedTeam
      });

      if (result.success) {
        showToast(currentPick ? 'Pick updated!' : 'Pick submitted!', 'success');
        navigate(`/league/${leagueId}`);
      } else {
        showToast(result.error || 'Failed to submit pick', 'error');
      }
    } catch (error) {
      showToast('Something went wrong', 'error');
    }
    setSubmitting(false);
  };

  const getSelectedTeam = () => {
    for (const game of games) {
      if (game.homeTeam?.id === selectedTeam) return game.homeTeam;
      if (game.awayTeam?.id === selectedTeam) return game.awayTeam;
    }
    return null;
  };

  if (loading) return <Loading fullScreen />;
  if (!league || selectedWeek === null) return <Loading fullScreen />;

  const startWeek = league.startWeek || league.start_week || 1;

  return (
    <div className="max-w-2xl mx-auto px-2 sm:px-4 py-3 sm:py-6 pb-24">
      {/* Header */}
      <div className="flex items-center gap-3 mb-3 sm:mb-4">
        <Link to={`/league/${leagueId}`} className="p-2 -ml-2 hover:bg-white/10 rounded-lg">
          <ArrowLeft className="w-5 h-5 text-white" />
        </Link>
        <div className="min-w-0">
          <h1 className="font-display text-xl sm:text-2xl font-bold text-white">
            {loadingWeek ? 'Loading...' : currentPick ? 'Change Your Pick' : 'Make Your Pick'}
          </h1>
          <p className="text-white/50 text-sm truncate">{league.name}</p>
        </div>
      </div>

      {/* Week Selector */}
      <div className="flex items-center justify-between bg-white/5 rounded-lg p-1 mb-3 sm:mb-4">
        <button
          onClick={() => setSelectedWeek(Math.max(startWeek, selectedWeek - 1))}
          disabled={selectedWeek <= startWeek || loadingWeek}
          className="p-2 sm:p-3 hover:bg-white/10 rounded-lg disabled:opacity-30"
        >
          <ChevronLeft className="w-5 h-5 text-white" />
        </button>
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-white/50 hidden sm:block" />
          <span className="text-white font-semibold text-base sm:text-lg">
            {getWeekLabel(selectedWeek)}
          </span>
          {selectedWeek === currentWeek && (
            <span className="bg-green-500/20 text-green-400 text-xs px-2 py-0.5 rounded-full">Current</span>
          )}
          {loadingWeek && (
            <Loader2 className="w-4 h-4 text-white/50 animate-spin" />
          )}
        </div>
        <button
          onClick={() => setSelectedWeek(Math.min(22, selectedWeek + 1))}
          disabled={selectedWeek >= 22 || loadingWeek}
          className="p-2 sm:p-3 hover:bg-white/10 rounded-lg disabled:opacity-30"
        >
          <ChevronRight className="w-5 h-5 text-white" />
        </button>
      </div>

      {/* Current Pick Display */}
      {currentPick && !loadingWeek && (
        <div className={`rounded-xl p-3 sm:p-4 mb-3 sm:mb-4 border ${
          currentPickLocked 
            ? 'bg-red-500/10 border-red-500/20' 
            : 'bg-amber-500/10 border-amber-500/20'
        }`}>
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-3">
              <div className={`text-sm font-medium ${currentPickLocked ? 'text-red-400' : 'text-amber-400'}`}>
                {currentPickLocked ? 'Pick Locked:' : 'Current Pick:'}
              </div>
              {games.map(g => {
                const team = g.homeTeam?.id === currentPick.teamId ? g.homeTeam : 
                             g.awayTeam?.id === currentPick.teamId ? g.awayTeam : null;
                if (!team) return null;
                return (
                  <button 
                    key={team.id} 
                    onClick={() => openTeamInfo(team)}
                    className="flex items-center gap-2 hover:bg-white/10 rounded-lg px-2 py-1 -mx-2 -my-1 transition-colors"
                  >
                    {team.logo && <img src={team.logo} alt="" className="w-6 h-6 object-contain" />}
                    <span className="text-white font-medium hover:underline">{team.name || team.abbreviation}</span>
                    {currentPickLocked && <Lock className="w-4 h-4 text-red-400" />}
                  </button>
                );
              })}
            </div>
            <div className={`text-xs ${currentPickLocked ? 'text-red-400' : 'text-white/50'}`}>
              {currentPickLocked ? 'Game has started - cannot change' : 'Select a new team to change'}
            </div>
          </div>
        </div>
      )}

      {/* Games */}
      {games.length === 0 ? (
        <div className="text-center py-12">
          {selectedWeek > 18 ? (
            <>
              <Lock className="w-10 h-10 text-white/20 mx-auto mb-3" />
              <p className="text-white/50 font-medium">
                {selectedWeek === 19 && 'Wild Card'}
                {selectedWeek === 20 && 'Divisional Round'}
                {selectedWeek === 21 && 'Conference Championships'}
                {selectedWeek === 22 && 'Super Bowl'}
                {' '}matchups are TBD
              </p>
              <p className="text-white/40 text-sm mt-2">
                {selectedWeek === 19 && 'Matchups will be set after Week 18 concludes'}
                {selectedWeek === 20 && 'Matchups will be set after Wild Card games conclude'}
                {selectedWeek === 21 && 'Matchups will be set after Divisional Round concludes'}
                {selectedWeek === 22 && 'Matchups will be set after Conference Championships conclude'}
              </p>
            </>
          ) : (
            <>
              <Calendar className="w-10 h-10 text-white/20 mx-auto mb-3" />
              <p className="text-white/50">No games scheduled for {getWeekLabel(selectedWeek)}</p>
            </>
          )}
        </div>
      ) : (
        <div className="space-y-2 sm:space-y-3">
          {games.map((game) => (
            <GameCard 
              key={game.id}
              game={game}
              selectedTeam={selectedTeam}
              onSelectTeam={handleSelectTeam}
              injuries={injuries}
              onTeamInfo={openTeamInfo}
            />
          ))}
        </div>
      )}

      {/* Fixed Bottom Bar */}
      {selectedTeam && !(selectedTeam === currentPick?.teamId && currentPickLocked) && (
        <div className="fixed bottom-0 left-0 right-0 p-3 sm:p-4 bg-gray-900/95 border-t border-white/10">
          <div className="max-w-2xl mx-auto">
            <button
              onClick={handleSubmit}
              disabled={submitting || getSelectedTeam()?.isLocked}
              className="w-full bg-green-600 hover:bg-green-500 text-white py-3 sm:py-4 flex items-center justify-center gap-2 text-base font-semibold disabled:opacity-50 rounded-xl transition-colors"
            >
              {submitting ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : getSelectedTeam()?.isLocked ? (
                <>
                  <Lock className="w-5 h-5" />
                  <span>Game Started - Locked</span>
                </>
              ) : (
                <>
                  <Check className="w-5 h-5" />
                  <span>{currentPick ? 'Update Pick' : 'Confirm Pick'}</span>
                  {getSelectedTeam()?.logo ? (
                    <img src={getSelectedTeam().logo} alt="" className="w-6 h-6 object-contain" />
                  ) : (
                    <span>{getSelectedTeam()?.abbreviation}</span>
                  )}
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Team Info Dialog */}
      {teamInfoDialog.open && (
        <TeamInfoDialog 
          team={teamInfoDialog.team}
          data={teamInfoDialog.data}
          loading={teamInfoDialog.loading}
          onClose={() => setTeamInfoDialog({ open: false, team: null, data: null, loading: false })}
        />
      )}
    </div>
  );
}

// Team Info Dialog Component
function TeamInfoDialog({ team, data, loading, onClose }) {
  const [activeTab, setActiveTab] = useState('stats');
  
  // Reset to stats tab when team changes
  useEffect(() => {
    setActiveTab('stats');
  }, [team?.id]);
  
  if (!team) return null;

  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    const now = new Date();
    const diffHours = Math.floor((now - date) / (1000 * 60 * 60));
    if (diffHours < 1) return 'Just now';
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const formatGameDate = (dateStr) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  };

  const tabs = [
    { id: 'news', label: 'News', icon: Newspaper },
    { id: 'stats', label: 'Stats', icon: BarChart3 },
    { id: 'schedule', label: 'Schedule', icon: Calendar }
  ];

  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div 
        className="bg-gray-900 rounded-2xl max-w-lg w-full max-h-[85vh] overflow-hidden flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div 
          className="p-4 flex items-center gap-4 border-b border-white/10"
          style={{ background: `linear-gradient(135deg, ${team.color || '#374151'}22, transparent)` }}
        >
          {team.logo ? (
            <img src={team.logo} alt="" className="w-16 h-16 object-contain" />
          ) : (
            <div 
              className="w-16 h-16 rounded-xl flex items-center justify-center text-white font-bold text-xl"
              style={{ backgroundColor: team.color || '#374151' }}
            >
              {team.abbreviation}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <h2 className="text-xl font-bold text-white truncate">{team.name}</h2>
            <div className="flex items-center gap-2 text-sm text-white/60">
              <span>{team.record}</span>
              {data?.team?.standing && (
                <>
                  <span>•</span>
                  <span>{data.team.standing}</span>
                </>
              )}
            </div>
            {data?.team?.division && (
              <div className="text-xs text-white/40 mt-0.5">{data.team.division}</div>
            )}
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full transition-colors">
            <X className="w-5 h-5 text-white/60" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-white/10">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 py-3 text-sm font-medium flex items-center justify-center gap-1.5 transition-colors ${
                activeTab === tab.id 
                  ? 'text-white border-b-2 border-white' 
                  : 'text-white/50 hover:text-white/70'
              }`}
            >
              <tab.icon className="w-4 h-4" />
              <span className="hidden sm:inline">{tab.label}</span>
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 text-white/30 animate-spin" />
            </div>
          ) : (
            <>
              {/* News Tab */}
              {activeTab === 'news' && (
                <div className="space-y-3">
                  {data?.news?.length > 0 ? (
                    data.news.map((article, i) => (
                      <a
                        key={i}
                        href={article.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block p-3 bg-white/5 rounded-lg hover:bg-white/10 transition-colors group"
                      >
                        <div className="flex gap-3">
                          {article.image && (
                            <img src={article.image} alt="" className="w-20 h-14 object-cover rounded flex-shrink-0" />
                          )}
                          <div className="flex-1 min-w-0">
                            <h4 className="text-sm font-medium text-white line-clamp-2 group-hover:text-blue-400 transition-colors">
                              {article.headline}
                            </h4>
                            <div className="flex items-center gap-2 mt-1">
                              {/* Source with logo */}
                              {article.source && (
                                <span className="flex items-center gap-1">
                                  {article.source === 'ESPN' || article.link?.includes('espn.com') ? (
                                    <img 
                                      src="https://a.espncdn.com/combiner/i?img=/i/espn/misc_logos/500/espn_icon.png&h=40&w=40" 
                                      alt="ESPN" 
                                      className="w-3.5 h-3.5 rounded-sm"
                                    />
                                  ) : article.source === 'NFL' || article.link?.includes('nfl.com') ? (
                                    <img 
                                      src="https://static.www.nfl.com/image/upload/v1554321393/league/nvfr7ogywskqrfaiu38m.svg" 
                                      alt="NFL" 
                                      className="w-3.5 h-3.5"
                                    />
                                  ) : null}
                                  <span className="text-xs text-white/50">
                                    {article.source || (article.link?.includes('espn.com') ? 'ESPN' : article.link?.includes('nfl.com') ? 'NFL' : '')}
                                  </span>
                                </span>
                              )}
                              {!article.source && article.link?.includes('espn.com') && (
                                <span className="flex items-center gap-1">
                                  <img 
                                    src="https://a.espncdn.com/combiner/i?img=/i/espn/misc_logos/500/espn_icon.png&h=40&w=40" 
                                    alt="ESPN" 
                                    className="w-3.5 h-3.5 rounded-sm"
                                  />
                                  <span className="text-xs text-white/50">ESPN</span>
                                </span>
                              )}
                              <span className="text-xs text-white/40">{formatDate(article.published)}</span>
                              {article.premium && (
                                <span className="text-[10px] px-1.5 py-0.5 bg-yellow-500/20 text-yellow-400 rounded">ESPN+</span>
                              )}
                            </div>
                          </div>
                          <ExternalLink className="w-4 h-4 text-white/20 flex-shrink-0" />
                        </div>
                      </a>
                    ))
                  ) : (
                    <div className="text-center py-8 text-white/40">
                      <Newspaper className="w-10 h-10 mx-auto mb-2 opacity-50" />
                      <p>No recent news available</p>
                    </div>
                  )}
                </div>
              )}

              {/* Stats Tab */}
              {activeTab === 'stats' && (
                <div className="space-y-4">
                  {/* Team Record */}
                  {data?.team && (
                    <div className="grid grid-cols-4 gap-2">
                      <div className="bg-white/5 rounded-lg p-2.5 text-center">
                        <div className="text-lg font-bold text-white">{data.team.record || '-'}</div>
                        <div className="text-[10px] text-white/40">Record</div>
                      </div>
                      <div className="bg-white/5 rounded-lg p-2.5 text-center">
                        <div className="text-lg font-bold text-white">{data.team.streak || '-'}</div>
                        <div className="text-[10px] text-white/40">Streak</div>
                      </div>
                      <div className="bg-white/5 rounded-lg p-2.5 text-center">
                        <div className="text-lg font-bold text-white">{data.team.homeRecord || '-'}</div>
                        <div className="text-[10px] text-white/40">Home</div>
                      </div>
                      <div className="bg-white/5 rounded-lg p-2.5 text-center">
                        <div className="text-lg font-bold text-white">{data.team.awayRecord || '-'}</div>
                        <div className="text-[10px] text-white/40">Away</div>
                      </div>
                    </div>
                  )}

                  {/* Team Stats Summary */}
                  <div className="grid grid-cols-2 gap-2">
                    <div className="bg-white/5 rounded-lg p-3">
                      <div className="text-xs text-white/40 mb-1">Points/Game</div>
                      <div className="text-lg font-semibold text-white">
                        {data?.stats?.offense?.pointsPerGame?.displayValue || '-'}
                        {data?.stats?.rankings?.pointsFor && (
                          <span className="text-xs text-emerald-400 ml-1">({data.stats.rankings.pointsFor})</span>
                        )}
                      </div>
                    </div>
                    <div className="bg-white/5 rounded-lg p-3">
                      <div className="text-xs text-white/40 mb-1">Pts Allowed/Game</div>
                      <div className="text-lg font-semibold text-white">
                        {data?.stats?.defense?.pointsAllowedPerGame?.displayValue || '-'}
                        {data?.stats?.rankings?.pointsAgainst && (
                          <span className="text-xs text-emerald-400 ml-1">({data.stats.rankings.pointsAgainst})</span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Key Players - Categorized by Position */}
                  {data?.topPlayers && (
                    <div className="bg-white/5 rounded-lg p-3">
                      <h4 className="text-xs font-medium text-white/40 uppercase tracking-wide mb-3">Key Players</h4>
                      <div className="space-y-3">
                        {/* QB */}
                        {data.topPlayers.qb?.length > 0 && (
                          <div className="flex gap-3">
                            <span className="text-xs font-medium text-white/30 w-8 pt-1">QB</span>
                            <div className="flex-1 space-y-1.5">
                              {data.topPlayers.qb.map((p, i) => (
                                <div key={i} className="flex items-center gap-2 flex-wrap">
                                  {p.headshot && <img src={p.headshot} alt="" className="w-8 h-8 rounded-full object-cover" />}
                                  <span className="text-sm font-medium text-white">{p.name}</span>
                                  {p.injury && (
                                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                                      ['out', 'ir', 'injured reserve'].some(s => p.injury.status?.toLowerCase().includes(s))
                                        ? 'bg-red-500/20 text-red-400'
                                        : p.injury.status?.toLowerCase().includes('doubtful')
                                        ? 'bg-orange-500/20 text-orange-400'
                                        : p.injury.status?.toLowerCase().includes('questionable')
                                        ? 'bg-yellow-500/20 text-yellow-400'
                                        : 'bg-gray-500/20 text-gray-400'
                                    }`}>
                                      {p.injury.status}
                                    </span>
                                  )}
                                  <span className="text-sm text-white/50">
                                    {Object.entries(p.stats || {}).map(([k, v]) => `${v} ${k}`).join(', ')}
                                    {p.perGameStats && Object.keys(p.perGameStats).length > 0 && (
                                      <span className="text-white/30 ml-1">
                                        ({Object.entries(p.perGameStats).map(([k, v]) => `${v} ${k}`).join(', ')})
                                      </span>
                                    )}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                        {/* RB */}
                        {data.topPlayers.rb?.length > 0 && (
                          <div className="flex gap-3">
                            <span className="text-xs font-medium text-white/30 w-8 pt-1">RB</span>
                            <div className="flex-1 space-y-1.5">
                              {data.topPlayers.rb.map((p, i) => (
                                <div key={i} className="flex items-center gap-2 flex-wrap">
                                  {p.headshot && <img src={p.headshot} alt="" className="w-8 h-8 rounded-full object-cover" />}
                                  <span className="text-sm font-medium text-white">{p.name}</span>
                                  {p.injury && (
                                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                                      ['out', 'ir', 'injured reserve'].some(s => p.injury.status?.toLowerCase().includes(s))
                                        ? 'bg-red-500/20 text-red-400'
                                        : p.injury.status?.toLowerCase().includes('doubtful')
                                        ? 'bg-orange-500/20 text-orange-400'
                                        : p.injury.status?.toLowerCase().includes('questionable')
                                        ? 'bg-yellow-500/20 text-yellow-400'
                                        : 'bg-gray-500/20 text-gray-400'
                                    }`}>
                                      {p.injury.status}
                                    </span>
                                  )}
                                  <span className="text-sm text-white/50">
                                    {Object.entries(p.stats || {}).map(([k, v]) => `${v} ${k}`).join(', ')}
                                    {p.perGameStats && Object.keys(p.perGameStats).length > 0 && (
                                      <span className="text-white/30 ml-1">
                                        ({Object.entries(p.perGameStats).map(([k, v]) => `${v} ${k}`).join(', ')})
                                      </span>
                                    )}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                        {/* WR */}
                        {data.topPlayers.wr?.length > 0 && (
                          <div className="flex gap-3">
                            <span className="text-xs font-medium text-white/30 w-8 pt-1">WR</span>
                            <div className="flex-1 space-y-1.5">
                              {data.topPlayers.wr.map((p, i) => (
                                <div key={i} className="flex items-center gap-2 flex-wrap">
                                  {p.headshot && <img src={p.headshot} alt="" className="w-8 h-8 rounded-full object-cover" />}
                                  <span className="text-sm font-medium text-white">{p.name}</span>
                                  {p.injury && (
                                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                                      ['out', 'ir', 'injured reserve'].some(s => p.injury.status?.toLowerCase().includes(s))
                                        ? 'bg-red-500/20 text-red-400'
                                        : p.injury.status?.toLowerCase().includes('doubtful')
                                        ? 'bg-orange-500/20 text-orange-400'
                                        : p.injury.status?.toLowerCase().includes('questionable')
                                        ? 'bg-yellow-500/20 text-yellow-400'
                                        : 'bg-gray-500/20 text-gray-400'
                                    }`}>
                                      {p.injury.status}
                                    </span>
                                  )}
                                  <span className="text-sm text-white/50">
                                    {Object.entries(p.stats || {}).map(([k, v]) => `${v} ${k}`).join(', ')}
                                    {p.perGameStats && Object.keys(p.perGameStats).length > 0 && (
                                      <span className="text-white/30 ml-1">
                                        ({Object.entries(p.perGameStats).map(([k, v]) => `${v} ${k}`).join(', ')})
                                      </span>
                                    )}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                        {/* TE */}
                        {data.topPlayers.te?.length > 0 && (
                          <div className="flex gap-3">
                            <span className="text-xs font-medium text-white/30 w-8 pt-1">TE</span>
                            <div className="flex-1 space-y-1.5">
                              {data.topPlayers.te.map((p, i) => (
                                <div key={i} className="flex items-center gap-2 flex-wrap">
                                  {p.headshot && <img src={p.headshot} alt="" className="w-8 h-8 rounded-full object-cover" />}
                                  <span className="text-sm font-medium text-white">{p.name}</span>
                                  {p.injury && (
                                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                                      ['out', 'ir', 'injured reserve'].some(s => p.injury.status?.toLowerCase().includes(s))
                                        ? 'bg-red-500/20 text-red-400'
                                        : p.injury.status?.toLowerCase().includes('doubtful')
                                        ? 'bg-orange-500/20 text-orange-400'
                                        : p.injury.status?.toLowerCase().includes('questionable')
                                        ? 'bg-yellow-500/20 text-yellow-400'
                                        : 'bg-gray-500/20 text-gray-400'
                                    }`}>
                                      {p.injury.status}
                                    </span>
                                  )}
                                  <span className="text-sm text-white/50">
                                    {Object.entries(p.stats || {}).map(([k, v]) => `${v} ${k}`).join(', ')}
                                    {p.perGameStats && Object.keys(p.perGameStats).length > 0 && (
                                      <span className="text-white/30 ml-1">
                                        ({Object.entries(p.perGameStats).map(([k, v]) => `${v} ${k}`).join(', ')})
                                      </span>
                                    )}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                        {/* DEF */}
                        {data.topPlayers.def?.length > 0 && (
                          <div className="flex gap-3">
                            <span className="text-xs font-medium text-white/30 w-8 pt-1">DEF</span>
                            <div className="flex-1 space-y-1.5">
                              {data.topPlayers.def.map((p, i) => (
                                <div key={i} className="flex items-center gap-2 flex-wrap">
                                  {p.headshot && <img src={p.headshot} alt="" className="w-8 h-8 rounded-full object-cover" />}
                                  <span className="text-sm font-medium text-white">{p.name}</span>
                                  <span className="text-xs text-white/30">({p.position})</span>
                                  {p.injury && (
                                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                                      ['out', 'ir', 'injured reserve'].some(s => p.injury.status?.toLowerCase().includes(s))
                                        ? 'bg-red-500/20 text-red-400'
                                        : p.injury.status?.toLowerCase().includes('doubtful')
                                        ? 'bg-orange-500/20 text-orange-400'
                                        : p.injury.status?.toLowerCase().includes('questionable')
                                        ? 'bg-yellow-500/20 text-yellow-400'
                                        : 'bg-gray-500/20 text-gray-400'
                                    }`}>
                                      {p.injury.status}
                                    </span>
                                  )}
                                  <span className="text-sm text-white/50">
                                    {Object.entries(p.stats || {}).map(([k, v]) => `${v} ${k}`).join(', ')}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Passing & Rushing Stats */}
                  <div className="grid grid-cols-2 gap-3">
                    {data?.stats?.passing && (
                      <div className="bg-white/5 rounded-lg p-3">
                        <div className="text-xs text-white/40 uppercase tracking-wide mb-2">Passing</div>
                        <div className="space-y-1.5">
                          <div className="flex justify-between text-sm">
                            <span className="text-white/50">Yds/G</span>
                            <span className="text-white">
                              {data.stats.passing.yardsPerGame?.displayValue || '-'}
                              {data.stats.rankings?.passingYPG && (
                                <span className="text-emerald-400 text-xs ml-1">({data.stats.rankings.passingYPG})</span>
                              )}
                            </span>
                          </div>
                          <div className="flex justify-between text-sm">
                            <span className="text-white/50">TD/G</span>
                            <span className="text-white">
                              {data.stats.passing.touchdownsPerGame?.displayValue || '-'}
                              {data.stats.rankings?.passingTD && (
                                <span className="text-emerald-400 text-xs ml-1">({data.stats.rankings.passingTD})</span>
                              )}
                            </span>
                          </div>
                        </div>
                      </div>
                    )}
                    
                    {data?.stats?.rushing && (
                      <div className="bg-white/5 rounded-lg p-3">
                        <div className="text-xs text-white/40 uppercase tracking-wide mb-2">Rushing</div>
                        <div className="space-y-1.5">
                          <div className="flex justify-between text-sm">
                            <span className="text-white/50">Yds/G</span>
                            <span className="text-white">
                              {data.stats.rushing.yardsPerGame?.displayValue || '-'}
                              {data.stats.rankings?.rushingYPG && (
                                <span className="text-emerald-400 text-xs ml-1">({data.stats.rankings.rushingYPG})</span>
                              )}
                            </span>
                          </div>
                          <div className="flex justify-between text-sm">
                            <span className="text-white/50">TD/G</span>
                            <span className="text-white">
                              {data.stats.rushing.touchdownsPerGame?.displayValue || '-'}
                              {data.stats.rankings?.rushingTD && (
                                <span className="text-emerald-400 text-xs ml-1">({data.stats.rankings.rushingTD})</span>
                              )}
                            </span>
                          </div>
                          <div className="flex justify-between text-sm">
                            <span className="text-white/50">YPC</span>
                            <span className="text-white">
                              {data.stats.rushing.yardsPerCarry?.displayValue || '-'}
                              {data.stats.rankings?.rushingYPC && (
                                <span className="text-emerald-400 text-xs ml-1">({data.stats.rankings.rushingYPC})</span>
                              )}
                            </span>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Schedule Tab */}
              {activeTab === 'schedule' && (
                <div className="space-y-1">
                  {data?.schedule?.length > 0 ? (
                    data.schedule.map((game, i) => (
                      <div 
                        key={i} 
                        className={`flex items-center gap-2 p-2 rounded-lg ${
                          game.isCompleted 
                            ? game.result === 'W' ? 'bg-green-500/10' : 'bg-red-500/10'
                            : 'bg-white/5'
                        }`}
                      >
                        {/* Week */}
                        <div className="w-8 text-center">
                          <div className="text-xs text-white/40">Wk</div>
                          <div className="text-sm font-medium text-white">{game.week}</div>
                        </div>
                        
                        {/* Result or Status */}
                        <div className="w-8 text-center">
                          {game.isCompleted ? (
                            <div className={`text-sm font-bold ${game.result === 'W' ? 'text-green-400' : 'text-red-400'}`}>
                              {game.result}
                            </div>
                          ) : (
                            <div className="text-xs text-white/40">-</div>
                          )}
                        </div>
                        
                        {/* Home/Away indicator */}
                        <div className="w-6 text-center text-xs text-white/40">
                          {game.isHome ? 'vs' : '@'}
                        </div>
                        
                        {/* Opponent */}
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          {game.opponent?.logo && (
                            <img src={game.opponent.logo} alt="" className="w-6 h-6 object-contain flex-shrink-0" />
                          )}
                          <div className="min-w-0">
                            <div className="text-sm text-white truncate">{game.opponent?.abbreviation || game.opponent?.name}</div>
                            <div className="text-[10px] text-white/40">{game.opponent?.record}</div>
                          </div>
                        </div>
                        
                        {/* Score or Date */}
                        <div className="text-right">
                          {game.isCompleted ? (
                            <div className="text-sm font-medium text-white">
                              {game.teamScore}-{game.oppScore}
                            </div>
                          ) : (
                            <div className="text-xs text-white/50">
                              {formatGameDate(game.date)}
                            </div>
                          )}
                          <div className="text-[10px] text-white/30">{game.teamRecord}</div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="text-center py-8 text-white/40">
                      <Calendar className="w-10 h-10 mx-auto mb-2 opacity-50" />
                      <p>No schedule available</p>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function GameCard({ game, selectedTeam, onSelectTeam, injuries, onTeamInfo }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const gameDate = new Date(game.date);
  const away = game.awayTeam;
  const home = game.homeTeam;
  const odds = game.odds;

  const formatDate = () => {
    const day = gameDate.toLocaleDateString('en-US', { weekday: 'short' });
    const time = gameDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    return `${day} ${time}`;
  };
  
  // Position priority for sorting
  const positionPriority = ['QB', 'RB', 'WR', 'TE', 'LT', 'LG', 'C', 'RG', 'RT', 'OL', 'DE', 'DT', 'DL', 'LB', 'CB', 'S', 'DB', 'K', 'P'];
  
  const sortByPosition = (a, b) => {
    const aIdx = positionPriority.indexOf(a.player.position);
    const bIdx = positionPriority.indexOf(b.player.position);
    return (aIdx === -1 ? 99 : aIdx) - (bIdx === -1 ? 99 : bIdx);
  };
  
  // Get all relevant injuries for a team, sorted by position
  const getTeamInjuries = (teamId) => {
    const teamInjuries = injuries[String(teamId)] || [];
    return teamInjuries
      .filter(i => {
        const status = (i.status || '').toLowerCase();
        return status.includes('out') || status.includes('doubtful') || status.includes('ir') || status.includes('injured reserve');
      })
      .sort(sortByPosition)
      .map(i => {
        // Normalize status display
        let status = i.status || '';
        if (status.toLowerCase().includes('injured reserve')) status = 'IR';
        else if (status.toLowerCase() === 'out') status = 'Out';
        else if (status.toLowerCase() === 'doubtful') status = 'Doubtful';
        return { ...i, displayStatus: status };
      });
  };
  
  const awayInjuries = getTeamInjuries(away?.id);
  const homeInjuries = getTeamInjuries(home?.id);

  return (
    <div className="bg-white/5 rounded-xl overflow-hidden">
      {/* Game Header */}
      <div className="px-3 py-2 flex items-center justify-between text-sm border-b border-white/5">
        <span className="text-white/50">{formatDate()}</span>
        <div className="flex items-center gap-3 sm:gap-4 text-white/70">
          {odds?.spread && <span>{odds.spread}</span>}
          {odds?.overUnder && <span>O/U {odds.overUnder}</span>}
          {game.broadcast && <span className="text-white/40 hidden sm:inline">{game.broadcast}</span>}
        </div>
      </div>

      {/* Matchup - Stack on mobile, side-by-side on desktop */}
      <div className="flex flex-col sm:flex-row">
        <TeamCard 
          team={away} 
          isSelected={selectedTeam === away?.id}
          onSelect={() => onSelectTeam(away)}
          isHome={false}
          onTeamInfo={onTeamInfo}
        />
        <div className="h-px sm:h-auto sm:w-px bg-white/5" />
        <TeamCard 
          team={home} 
          isSelected={selectedTeam === home?.id}
          onSelect={() => onSelectTeam(home)}
          isHome={true}
          onTeamInfo={onTeamInfo}
        />
      </div>
      
      {/* Expand Button */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full py-2.5 flex items-center justify-center gap-1.5 text-sm text-white/40 hover:text-white/60 hover:bg-white/5 transition-colors border-t border-white/5"
      >
        {isExpanded ? (
          <>Less info <ChevronUp className="w-4 h-4" /></>
        ) : (
          <>More info <ChevronDown className="w-4 h-4" /></>
        )}
      </button>
      
      {/* Expanded Details */}
      {isExpanded && (
        <ExpandedGameDetails 
          away={away} 
          home={home} 
          odds={odds}
          awayInjuries={awayInjuries}
          homeInjuries={homeInjuries}
        />
      )}
    </div>
  );
}

// Expanded game details section
function ExpandedGameDetails({ away, home, odds, awayInjuries, homeInjuries }) {
  const [showAllAwayInjuries, setShowAllAwayInjuries] = useState(false);
  const [showAllHomeInjuries, setShowAllHomeInjuries] = useState(false);
  
  const hasValue = (val) => val !== null && val !== undefined && val !== '' && !isNaN(Number(val));
  
  // Calculate win probability based on point differential
  const getWinProbability = () => {
    const ppg1 = hasValue(away?.avgPointsFor) ? Number(away.avgPointsFor) : 21;
    const opp1 = hasValue(away?.avgPointsAgainst) ? Number(away.avgPointsAgainst) : 21;
    const ppg2 = hasValue(home?.avgPointsFor) ? Number(home.avgPointsFor) : 21;
    const opp2 = hasValue(home?.avgPointsAgainst) ? Number(home.avgPointsAgainst) : 21;
    
    const diff1 = ppg1 - opp1;
    const diff2 = ppg2 - opp2;
    const totalDiff = diff1 - diff2;
    
    const prob1 = Math.min(Math.max(50 + totalDiff * 2.5, 15), 85);
    return { away: Math.round(prob1), home: Math.round(100 - prob1) };
  };
  
  const winProb = getWinProbability();
  
  const InjuryList = ({ injuries }) => {
    const [showAll, setShowAll] = useState(false);
    const keyInjuries = injuries.slice(0, 3);
    const displayList = showAll ? injuries : keyInjuries;
    const hasMore = injuries.length > 3;
    
    if (injuries.length === 0) {
      return <span className="text-sm text-white/30">None reported</span>;
    }
    
    return (
      <div className="space-y-1">
        {displayList.map((inj, i) => (
          <div key={i} className="text-sm">
            <span className={inj.displayStatus === 'Doubtful' ? 'text-yellow-400' : 'text-red-400'}>
              {inj.displayStatus}
            </span>
            {' '}<span className="text-white/70">{inj.player.name}</span>
            {' '}<span className="text-white/40">({inj.player.position})</span>
          </div>
        ))}
        {hasMore && (
          <button
            onClick={() => setShowAll(!showAll)}
            className="text-sm text-white/40 hover:text-white/60 mt-1"
          >
            {showAll ? '← Show less' : `+${injuries.length - 3} more`}
          </button>
        )}
      </div>
    );
  };

  return (
    <div className="px-4 py-4 space-y-4 bg-white/[0.02] border-t border-white/5">
      {/* Betting Lines */}
      {odds && (
        <div>
          <h4 className="text-sm font-medium text-white/40 uppercase tracking-wide mb-2">Betting Lines</h4>
          <div className="grid grid-cols-3 gap-2">
            <div className="bg-white/5 rounded-lg p-2.5 flex flex-col items-center justify-center">
              <div className="text-xs text-white/40 uppercase">Spread</div>
              <div className="text-base font-medium text-white">{odds.spread || '-'}</div>
            </div>
            <div className="bg-white/5 rounded-lg p-2.5 flex flex-col items-center justify-center">
              <div className="text-xs text-white/40 uppercase">O/U</div>
              <div className="text-base font-medium text-white">{odds.overUnder || '-'}</div>
            </div>
            <div className="bg-white/5 rounded-lg p-2.5 flex flex-col items-center justify-center">
              <div className="text-xs text-white/40 uppercase">Moneyline</div>
              <div className="text-sm text-white/70">
                {away?.abbreviation} {odds.awayMoneyLine ? (odds.awayMoneyLine > 0 ? '+' + odds.awayMoneyLine : odds.awayMoneyLine) : '-'}
              </div>
              <div className="text-sm text-white/70">
                {home?.abbreviation} {odds.homeMoneyLine ? (odds.homeMoneyLine > 0 ? '+' + odds.homeMoneyLine : odds.homeMoneyLine) : '-'}
              </div>
            </div>
          </div>
        </div>
      )}
      
      {/* Win Probability */}
      <div>
        <h4 className="text-sm font-medium text-white/40 uppercase tracking-wide mb-2">Win Probability</h4>
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-sm text-white/60 w-10">{away?.abbreviation}</span>
            <div className="flex-1 h-2.5 bg-white/10 rounded-full overflow-hidden">
              <div className="h-full bg-blue-500 rounded-full" style={{ width: `${winProb.away}%` }} />
            </div>
            <span className="text-sm text-white/60 w-12 text-right">{winProb.away}%</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-white/60 w-10">{home?.abbreviation}</span>
            <div className="flex-1 h-2.5 bg-white/10 rounded-full overflow-hidden">
              <div className="h-full bg-green-500 rounded-full" style={{ width: `${winProb.home}%` }} />
            </div>
            <span className="text-sm text-white/60 w-12 text-right">{winProb.home}%</span>
          </div>
        </div>
      </div>
      
      {/* Season Averages */}
      <div>
        <h4 className="text-sm font-medium text-white/40 uppercase tracking-wide mb-2">Season Averages</h4>
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-white/5 rounded-lg p-3">
            <div className="flex items-center gap-2 mb-2">
              {away?.logo && <img src={away.logo} alt="" className="w-6 h-6" />}
              <span className="text-base font-medium text-white">{away?.abbreviation}</span>
            </div>
            <div className="space-y-1.5 text-sm">
              <div className="flex justify-between">
                <span className="text-white/50">PPG</span>
                <span className="text-white">{away?.avgPointsFor || '-'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-white/50">Opp PPG</span>
                <span className="text-white">{away?.avgPointsAgainst || '-'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-white/50">Streak</span>
                <span className={away?.streak?.type === 'W' ? 'text-green-400' : 'text-red-400'}>
                  {away?.streak ? `${away.streak.type}${away.streak.count}` : '-'}
                </span>
              </div>
            </div>
          </div>
          <div className="bg-white/5 rounded-lg p-3">
            <div className="flex items-center gap-2 mb-2">
              {home?.logo && <img src={home.logo} alt="" className="w-6 h-6" />}
              <span className="text-base font-medium text-white">{home?.abbreviation}</span>
            </div>
            <div className="space-y-1.5 text-sm">
              <div className="flex justify-between">
                <span className="text-white/50">PPG</span>
                <span className="text-white">{home?.avgPointsFor || '-'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-white/50">Opp PPG</span>
                <span className="text-white">{home?.avgPointsAgainst || '-'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-white/50">Streak</span>
                <span className={home?.streak?.type === 'W' ? 'text-green-400' : 'text-red-400'}>
                  {home?.streak ? `${home.streak.type}${home.streak.count}` : '-'}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
      
      {/* Injuries */}
      {(awayInjuries?.length > 0 || homeInjuries?.length > 0) && (
        <div>
          <h4 className="text-sm font-medium text-white/40 uppercase tracking-wide mb-2">Injuries</h4>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="flex items-center gap-2 mb-1.5">
                {away?.logo && <img src={away.logo} alt="" className="w-5 h-5" />}
                <span className="text-sm text-white/50">{away?.abbreviation}</span>
              </div>
              <InjuryList injuries={awayInjuries || []} />
            </div>
            <div>
              <div className="flex items-center gap-2 mb-1.5">
                {home?.logo && <img src={home.logo} alt="" className="w-5 h-5" />}
                <span className="text-sm text-white/50">{home?.abbreviation}</span>
              </div>
              <InjuryList injuries={homeInjuries || []} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function TeamCard({ team, isSelected, onSelect, isHome, onTeamInfo }) {
  if (!team) return <div className="flex-1" />;
  
  const isDisabled = team.isLocked || (team.isUsed && !team.isCurrentPick);

  const parseRecord = (record) => {
    if (!record) return null;
    const parts = record.split('-');
    if (parts.length >= 2) {
      return { wins: parseInt(parts[0]) || 0, losses: parseInt(parts[1]) || 0 };
    }
    return null;
  };

  const record = parseRecord(team.record);
  const winPct = record ? record.wins / (record.wins + record.losses || 1) : 0.5;
  
  const hasValue = (val) => val !== null && val !== undefined && val !== '' && !isNaN(Number(val));
  const ppg = hasValue(team.avgPointsFor) ? team.avgPointsFor : null;
  const oppPpg = hasValue(team.avgPointsAgainst) ? team.avgPointsAgainst : null;
  
  let diff = null;
  if (ppg && oppPpg) {
    const d = Number(ppg) - Number(oppPpg);
    diff = d > 0 ? `+${d.toFixed(1)}` : d.toFixed(1);
  }

  const handleTeamInfoClick = (e) => {
    e.stopPropagation();
    if (onTeamInfo) onTeamInfo(team);
  };

  return (
    <div
      onClick={() => !isDisabled && onSelect()}
      className={`flex-1 p-2.5 sm:p-4 text-left transition-all ${
        isSelected
          ? 'bg-green-500/15'
          : isDisabled
          ? 'opacity-50'
          : 'hover:bg-white/5 active:bg-white/10 cursor-pointer'
      }`}
    >
      {/* MOBILE LAYOUT - Single row */}
      <div className="sm:hidden">
        <div className="flex items-center gap-2">
          {/* Logo - Clickable for team info */}
          <button
            onClick={handleTeamInfoClick}
            className="flex-shrink-0 rounded-lg hover:ring-2 hover:ring-white/20 transition-all"
          >
            {team.logo ? (
              <img src={team.logo} alt="" className="w-9 h-9 object-contain" />
            ) : (
              <div 
                className="w-9 h-9 rounded flex items-center justify-center text-white font-bold text-xs"
                style={{ backgroundColor: team.color || '#374151' }}
              >
                {team.abbreviation}
              </div>
            )}
          </button>
          
          {/* Team info - don't let it shrink below content */}
          <div className="flex-1">
            <div className="flex items-center gap-1.5 flex-wrap">
              <button 
                onClick={handleTeamInfoClick}
                className="font-semibold text-white text-[15px] hover:text-white/80 hover:underline transition-colors"
              >
                {team.abbreviation}
              </button>
              <span className={`text-sm ${
                winPct >= 0.6 ? 'text-green-400' : winPct <= 0.4 ? 'text-red-400' : 'text-white/50'
              }`}>
                {team.record}
              </span>
              {team.streak?.count >= 2 && (
                <span className={`text-sm ${team.streak.type === 'W' ? 'text-green-400' : 'text-red-400'}`}>
                  {team.streak.type}{team.streak.count}
                </span>
              )}
              {isSelected && <Check className="w-4 h-4 text-green-500 flex-shrink-0" />}
              {team.isLocked && <Lock className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />}
              {team.isCurrentPick && !isSelected && <Check className="w-3.5 h-3.5 text-green-400 flex-shrink-0" />}
            </div>
            <div className="flex items-center gap-2 text-xs text-white/50">
              <span>{isHome ? 'H' : 'A'} {isHome ? team.homeRecord : team.awayRecord}</span>
              <span>PPG {ppg || '-'}</span>
              {diff && (
                <span className={Number(diff) > 0 ? 'text-green-400' : 'text-red-400'}>{diff}</span>
              )}
            </div>
          </div>

          {/* Last 5 - aligned right */}
          {team.last5 && team.last5.length > 0 && (
            <div className="flex gap-0.5 flex-shrink-0">
              {team.last5.map((g, i) => (
                <div 
                  key={i}
                  className={`w-5 h-5 rounded text-[10px] font-bold flex items-center justify-center ${
                    g.result === 'W' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
                  }`}
                >
                  {g.result}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* DESKTOP LAYOUT - Full details */}
      <div className="hidden sm:block">
        {/* Team Header */}
        <div className="flex items-center gap-3 mb-2">
          <button
            onClick={handleTeamInfoClick}
            className="flex-shrink-0 rounded-xl hover:ring-2 hover:ring-white/20 transition-all"
          >
            {team.logo ? (
              <img src={team.logo} alt="" className="w-12 h-12 object-contain" />
            ) : (
              <div 
                className="w-12 h-12 rounded flex items-center justify-center text-white font-bold text-sm"
                style={{ backgroundColor: team.color || '#374151' }}
              >
                {team.abbreviation}
              </div>
            )}
          </button>
          
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <button 
                onClick={handleTeamInfoClick}
                className="font-semibold text-white text-lg truncate hover:text-white/80 hover:underline transition-colors"
              >
                {team.name}
              </button>
              {isSelected && <Check className="w-5 h-5 text-green-500 flex-shrink-0" />}
            </div>
            <div className="flex items-center gap-2 text-base">
              <span className={`font-medium ${
                winPct >= 0.6 ? 'text-green-400' : winPct <= 0.4 ? 'text-red-400' : 'text-white/60'
              }`}>
                {team.record || '-'}
              </span>
              {winPct >= 0.6 && <TrendingUp className="w-4 h-4 text-green-400" />}
              {winPct <= 0.4 && <TrendingDown className="w-4 h-4 text-red-400" />}
              {team.streak?.count >= 2 && (
                <span className={`text-sm font-medium ${
                  team.streak.type === 'W' ? 'text-green-400' : 'text-red-400'
                }`}>
                  {team.streak.type}{team.streak.count}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Stats Row */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-base text-white/50 mb-3">
          <span>{isHome ? 'Home' : 'Away'} {isHome ? team.homeRecord || '-' : team.awayRecord || '-'}</span>
          <span>PPG: <span className="text-white/70">{ppg || '-'}</span></span>
          <span>Opp: <span className="text-white/70">{oppPpg || '-'}</span></span>
          {diff && (
            <span className={`font-medium ${Number(diff) > 0 ? 'text-green-400' : Number(diff) < 0 ? 'text-red-400' : ''}`}>
              {diff}
            </span>
          )}
        </div>

        {/* Last 5 - Full boxes with opponent logo and score */}
        {team.last5 && team.last5.length > 0 && (
          <div>
            <span className="text-sm text-white/30 block mb-1.5">Last {team.last5.length}:</span>
            <div className="flex gap-2">
              {team.last5.map((g, i) => (
                <div 
                  key={i}
                  className={`flex flex-col items-center px-2.5 py-2 rounded ${
                    g.result === 'W' ? 'bg-green-500/10' : 'bg-red-500/10'
                  }`}
                >
                  <span className={`text-sm font-bold ${
                    g.result === 'W' ? 'text-green-400' : 'text-red-400'
                  }`}>
                    {g.result}
                  </span>
                  {g.opponentLogo ? (
                    <img src={g.opponentLogo} alt={g.opponent} className="w-5 h-5 object-contain my-1" />
                  ) : (
                    <span className="text-xs text-white/50 my-1">{g.opponent}</span>
                  )}
                  <span className="text-xs text-white/40">{g.score}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Status */}
        {(team.isLocked || (team.isUsed && !team.isCurrentPick) || team.isCurrentPick) && (
          <div className="mt-3 pt-3 border-t border-white/5 text-base">
            {team.isLocked ? (
              <span className="text-red-400 flex items-center gap-1">
                <Lock className="w-4 h-4" /> Locked
              </span>
            ) : team.isUsed && !team.isCurrentPick ? (
              <span className="text-yellow-500">Already used</span>
            ) : team.isCurrentPick ? (
              <span className="text-green-400">✓ Current pick</span>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}