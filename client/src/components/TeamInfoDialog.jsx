import { useState, useEffect } from 'react';
import { 
  X, ExternalLink, Newspaper, BarChart3, Calendar, Loader2 
} from 'lucide-react';
import { nflAPI } from '../api';

/**
 * TeamInfoDialog - A reusable dialog component that displays detailed NFL team information
 * 
 * Usage:
 * ```jsx
 * const [teamInfoDialog, setTeamInfoDialog] = useState({ open: false, team: null });
 * 
 * // To open the dialog:
 * const openTeamInfo = (team) => {
 *   setTeamInfoDialog({ open: true, team });
 * };
 * 
 * // In your JSX:
 * {teamInfoDialog.open && (
 *   <TeamInfoDialog 
 *     team={teamInfoDialog.team}
 *     onClose={() => setTeamInfoDialog({ open: false, team: null })}
 *   />
 * )}
 * ```
 * 
 * Props:
 * - team: Object with team data (id, name, abbreviation, logo, color, record)
 * - onClose: Function to call when dialog should close
 * - data: (optional) Pre-fetched team data - if not provided, will fetch automatically
 * - loading: (optional) If data is provided externally, indicate loading state
 */
export default function TeamInfoDialog({ team, onClose, data: externalData, loading: externalLoading }) {
  const [activeTab, setActiveTab] = useState('stats');
  const [data, setData] = useState(externalData || null);
  const [loading, setLoading] = useState(externalLoading ?? !externalData);
  
  // Reset to stats tab when team changes
  useEffect(() => {
    setActiveTab('stats');
  }, [team?.id]);

  // Fetch data if not provided externally
  useEffect(() => {
    if (!externalData && team?.id) {
      setLoading(true);
      nflAPI.getTeamInfo(team.id)
        .then(fetchedData => {
          setData(fetchedData);
          setLoading(false);
        })
        .catch(error => {
          console.error('Failed to load team info:', error);
          setLoading(false);
        });
    }
  }, [team?.id, externalData]);

  // Update data when external data changes
  useEffect(() => {
    if (externalData) {
      setData(externalData);
    }
  }, [externalData]);

  // Update loading when external loading changes
  useEffect(() => {
    if (externalLoading !== undefined) {
      setLoading(externalLoading);
    }
  }, [externalLoading]);
  
  // Helper to get color class based on ranking (1-32)
  const getRankColor = (rankStr) => {
    if (!rankStr) return 'text-white/50';
    // Extract number from strings like "1st", "17th", "32nd"
    const rank = parseInt(rankStr);
    if (isNaN(rank)) return 'text-white/50';
    
    if (rank <= 10) return 'text-emerald-400';      // Top third - green
    if (rank <= 22) return 'text-amber-400';        // Middle - yellow/amber
    return 'text-red-400';                          // Bottom third - red
  };

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

  // Helper to render injury status badge
  const InjuryBadge = ({ injury }) => {
    if (!injury) return null;
    
    const status = injury.status?.toLowerCase() || '';
    let colorClass = 'bg-gray-500/20 text-gray-400';
    
    if (['out', 'ir', 'injured reserve'].some(s => status.includes(s))) {
      colorClass = 'bg-red-500/20 text-red-400';
    } else if (status.includes('doubtful')) {
      colorClass = 'bg-orange-500/20 text-orange-400';
    } else if (status.includes('questionable')) {
      colorClass = 'bg-yellow-500/20 text-yellow-400';
    }
    
    return (
      <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${colorClass}`}>
        {injury.status}
      </span>
    );
  };

  // Player row component for Key Players section
  const PlayerRow = ({ player, showPosition = false }) => (
    <div className="flex items-start gap-2.5">
      {player.headshot && (
        <img src={player.headshot} alt="" className="w-10 h-10 rounded-full object-cover flex-shrink-0" />
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-sm font-medium text-white">{player.name}</span>
          {showPosition && (
            <span className="text-xs text-white/30">({player.position})</span>
          )}
          <InjuryBadge injury={player.injury} />
        </div>
        <div className="text-sm text-white/50 mt-0.5">
          {Object.entries(player.stats || {}).map(([k, v]) => `${v} ${k}`).join(', ')}
          {player.perGameStats && Object.keys(player.perGameStats).length > 0 && (
            <span className="text-white/30 ml-1">
              ({Object.entries(player.perGameStats).map(([k, v]) => `${v} ${k}`).join(', ')})
            </span>
          )}
        </div>
      </div>
    </div>
  );

  // Position group component
  const PositionGroup = ({ label, players, showPosition = false }) => {
    if (!players?.length) return null;
    
    return (
      <div className="flex gap-0 sm:gap-3">
        <span className="text-xs font-medium text-white/30 w-7 sm:w-8 pt-2 flex-shrink-0">{label}</span>
        <div className="flex-1 space-y-3">
          {players.map((p, i) => (
            <PlayerRow key={i} player={p} showPosition={showPosition} />
          ))}
        </div>
      </div>
    );
  };

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
              <span>{tab.label}</span>
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
                    data.news.map((article, i) => {
                      // Determine source info
                      const getSourceInfo = () => {
                        const link = article.link || '';
                        if (article.source === 'ESPN' || link.includes('espn.com')) {
                          return { name: 'ESPN', icon: 'https://a.espncdn.com/favicon.ico' };
                        }
                        if (article.source === 'NFL' || link.includes('nfl.com')) {
                          return { name: 'NFL', icon: 'https://static.www.nfl.com/league/apps/clubs/icons/NFL_favicon.ico' };
                        }
                        if (article.source) {
                          return { name: article.source, icon: null };
                        }
                        return null;
                      };
                      
                      const sourceInfo = getSourceInfo();
                      
                      return (
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
                              <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                                {sourceInfo && (
                                  <span className="flex items-center gap-1">
                                    {sourceInfo.icon && (
                                      <img 
                                        src={sourceInfo.icon} 
                                        alt={sourceInfo.name} 
                                        className="w-3.5 h-3.5 rounded-sm"
                                      />
                                    )}
                                    <span className="text-xs text-white/50">{sourceInfo.name}</span>
                                  </span>
                                )}
                                <span className="text-xs text-white/40">{formatDate(article.published)}</span>
                                {article.premium && (
                                  <span className="text-[10px] px-1.5 py-0.5 bg-yellow-500/20 text-yellow-400 rounded font-medium">ESPN+</span>
                                )}
                              </div>
                            </div>
                            <ExternalLink className="w-4 h-4 text-white/20 flex-shrink-0 group-hover:text-white/40 transition-colors" />
                          </div>
                        </a>
                      );
                    })
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
                          <span className={`text-xs ml-1 ${getRankColor(data.stats.rankings.pointsFor)}`}>({data.stats.rankings.pointsFor})</span>
                        )}
                      </div>
                    </div>
                    <div className="bg-white/5 rounded-lg p-3">
                      <div className="text-xs text-white/40 mb-1">Pts Allowed/Game</div>
                      <div className="text-lg font-semibold text-white">
                        {data?.stats?.defense?.pointsAllowedPerGame?.displayValue || '-'}
                        {data?.stats?.rankings?.pointsAgainst && (
                          <span className={`text-xs ml-1 ${getRankColor(data.stats.rankings.pointsAgainst)}`}>({data.stats.rankings.pointsAgainst})</span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Key Players - Categorized by Position */}
                  {data?.topPlayers && (
                    <div className="bg-white/5 rounded-lg p-3">
                      <h4 className="text-xs font-medium text-white/40 uppercase tracking-wide mb-3">Key Players</h4>
                      <div className="space-y-3">
                        <PositionGroup label="QB" players={data.topPlayers.qb} />
                        <PositionGroup label="RB" players={data.topPlayers.rb} />
                        <PositionGroup label="WR" players={data.topPlayers.wr} />
                        <PositionGroup label="TE" players={data.topPlayers.te} />
                        <PositionGroup label="DEF" players={data.topPlayers.def} showPosition />
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
                                <span className={`text-xs ml-1 ${getRankColor(data.stats.rankings.passingYPG)}`}>({data.stats.rankings.passingYPG})</span>
                              )}
                            </span>
                          </div>
                          <div className="flex justify-between text-sm">
                            <span className="text-white/50">TD/G</span>
                            <span className="text-white">
                              {data.stats.passing.touchdownsPerGame?.displayValue || '-'}
                              {data.stats.rankings?.passingTD && (
                                <span className={`text-xs ml-1 ${getRankColor(data.stats.rankings.passingTD)}`}>({data.stats.rankings.passingTD})</span>
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
                                <span className={`text-xs ml-1 ${getRankColor(data.stats.rankings.rushingYPG)}`}>({data.stats.rankings.rushingYPG})</span>
                              )}
                            </span>
                          </div>
                          <div className="flex justify-between text-sm">
                            <span className="text-white/50">TD/G</span>
                            <span className="text-white">
                              {data.stats.rushing.touchdownsPerGame?.displayValue || '-'}
                              {data.stats.rankings?.rushingTD && (
                                <span className={`text-xs ml-1 ${getRankColor(data.stats.rankings.rushingTD)}`}>({data.stats.rankings.rushingTD})</span>
                              )}
                            </span>
                          </div>
                          <div className="flex justify-between text-sm">
                            <span className="text-white/50">YPC</span>
                            <span className="text-white">
                              {data.stats.rushing.yardsPerCarry?.displayValue || '-'}
                              {data.stats.rankings?.rushingYPC && (
                                <span className={`text-xs ml-1 ${getRankColor(data.stats.rankings.rushingYPC)}`}>({data.stats.rankings.rushingYPC})</span>
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
                    data.schedule.map((game, i) => {
                      // Construct ESPN logo URL from abbreviation if no logo provided
                      const opponentAbbr = game.opponent?.abbreviation;
                      const opponentLogo = game.opponent?.logo 
                        || game.opponentLogo 
                        || (opponentAbbr ? `https://a.espncdn.com/i/teamlogos/nfl/500/${opponentAbbr.toLowerCase()}.png` : null);
                      
                      return (
                        <div 
                          key={i} 
                          className={`flex items-center gap-2 sm:gap-3 py-2.5 px-3 rounded-lg ${
                            game.isCompleted 
                              ? game.result === 'W' 
                                ? 'bg-green-500/5' 
                                : 'bg-red-500/5'
                              : 'bg-white/5'
                          }`}
                        >
                          {/* Week Number */}
                          <div className="w-8 flex-shrink-0 text-center">
                            <div className="text-base font-bold text-white">{game.week}</div>
                            <div className="text-xs text-white/40">Week</div>
                          </div>
                          
                          {/* vs/@ indicator - centered vertically */}
                          <div className="w-6 flex-shrink-0 flex items-center justify-center">
                            <span className="text-sm text-white/50">{game.isHome ? 'vs' : '@'}</span>
                          </div>
                          
                          {/* Opponent Logo */}
                          <div className="flex-shrink-0">
                            {opponentLogo ? (
                              <img 
                                src={opponentLogo} 
                                alt={opponentAbbr} 
                                className="w-8 h-8 object-contain" 
                              />
                            ) : (
                              <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-white/50 text-sm font-bold">
                                {opponentAbbr?.charAt(0) || '?'}
                              </div>
                            )}
                          </div>
                          
                          {/* Opponent Name - stacked on mobile, inline on desktop */}
                          <div className="flex-1 min-w-0">
                            {/* Mobile: City above team name */}
                            <div className="sm:hidden">
                              <div className="text-xs text-white/50 leading-tight">
                                {game.opponent?.name?.split(' ').slice(0, -1).join(' ') || ''}
                              </div>
                              <div className="text-base font-medium text-white leading-tight">
                                {game.opponent?.name?.split(' ').pop() || opponentAbbr}
                                {game.opponent?.record && (
                                  <span className="text-sm text-white/40 font-normal ml-1.5">
                                    ({game.opponent.record})
                                  </span>
                                )}
                              </div>
                            </div>
                            {/* Desktop: Full name inline */}
                            <span className="text-base font-medium text-white hidden sm:inline">
                              {game.opponent?.name || game.opponent?.displayName || opponentAbbr}
                            </span>
                            {game.opponent?.record && (
                              <span className="text-sm text-white/40 ml-1.5 hidden sm:inline">
                                ({game.opponent.record})
                              </span>
                            )}
                          </div>
                          
                          {/* Result/Date Column */}
                          <div className="text-right flex-shrink-0">
                            {game.isCompleted ? (
                              <>
                                {/* Mobile: stack vertically */}
                                <div className="sm:hidden">
                                  <div className="flex items-center justify-end gap-1.5">
                                    <span className={`text-base font-bold ${
                                      game.result === 'W' ? 'text-green-400' : 'text-red-400'
                                    }`}>
                                      {game.result}
                                    </span>
                                    <span className="text-base text-white font-semibold">
                                      {game.teamScore}-{game.oppScore}
                                    </span>
                                  </div>
                                  {game.teamRecord && (
                                    <div className="text-sm text-white/40 mt-0.5">
                                      {game.teamRecord}
                                    </div>
                                  )}
                                </div>
                                {/* Desktop: all inline */}
                                <div className="hidden sm:flex items-center justify-end gap-2">
                                  <span className={`text-base font-bold ${
                                    game.result === 'W' ? 'text-green-400' : 'text-red-400'
                                  }`}>
                                    {game.result}
                                  </span>
                                  <span className="text-base text-white font-semibold">
                                    {game.teamScore}-{game.oppScore}
                                  </span>
                                  {game.teamRecord && (
                                    <span className="text-sm text-white/40">
                                      ({game.teamRecord})
                                    </span>
                                  )}
                                </div>
                              </>
                            ) : (
                              <div className="text-sm text-white/60">
                                <span className="sm:hidden">
                                  {new Date(game.date).toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' })}
                                </span>
                                <span className="hidden sm:inline">
                                  {formatGameDate(game.date)}
                                </span>
                                {' '}
                                <span className="text-white/40">
                                  {new Date(game.date).toLocaleTimeString('en-US', { 
                                    hour: 'numeric', 
                                    minute: '2-digit',
                                    hour12: true 
                                  })}
                                </span>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div className="text-center py-12 text-white/40">
                      <Calendar className="w-12 h-12 mx-auto mb-3 opacity-50" />
                      <p className="text-base">No schedule available</p>
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