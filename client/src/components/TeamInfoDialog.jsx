import { useState, useEffect, useRef, useCallback } from 'react';
import {
  X, ExternalLink, Newspaper, BarChart3, Calendar, Loader2
} from 'lucide-react';
import { nflAPI, scheduleAPI, trackingAPI } from '../api';
import { useThemedLogo } from '../utils/logo';

/**
 * TeamInfoDialog - A reusable dialog component that displays team information
 * Supports NFL (detailed stats, key players) and daily sports (generic stats grid)
 *
 * Props:
 * - team: Object with team data (id, name, abbreviation, logo, color, record)
 * - sport: Sport identifier ('nfl', 'nba', 'mlb', 'nhl', 'ncaab')
 * - onClose: Function to call when dialog should close
 * - data: (optional) Pre-fetched team data
 * - loading: (optional) External loading state
 */
export default function TeamInfoDialog({ team, sport = 'nfl', onClose, data: externalData, loading: externalLoading }) {
  const tl = useThemedLogo();
  const [activeTab, setActiveTab] = useState('stats');
  const [data, setData] = useState(externalData || null);
  const [loading, setLoading] = useState(externalLoading ?? !externalData);
  const contentRef = useRef(null);

  const isNFL = sport === 'nfl';

  // Reset to stats tab when team changes + track
  useEffect(() => {
    setActiveTab('stats');
    if (team?.id) {
      trackingAPI.event('team_info_dialog_open', {
        teamId: team.id,
        teamName: team.name || team.abbreviation,
        sport,
      });
    }
  }, [team?.id]);

  // Auto-scroll to latest game when schedule tab is opened
  useEffect(() => {
    if (activeTab !== 'schedule' || !data?.schedule?.length) return;
    // Find the last completed game index
    const lastCompletedIdx = data.schedule.reduce((acc, game, i) => game.isCompleted ? i : acc, -1);
    if (lastCompletedIdx < 0) return;
    // Wait for render, then scroll to that element
    requestAnimationFrame(() => {
      const container = contentRef.current;
      if (!container) return;
      const items = container.querySelectorAll('[data-schedule-item]');
      const target = items[lastCompletedIdx];
      if (target) {
        target.scrollIntoView({ block: 'center', behavior: 'instant' });
      }
    });
  }, [activeTab, data?.schedule]);

  // Fetch data if not provided externally
  useEffect(() => {
    if (!externalData && team?.id) {
      setLoading(true);
      const fetchPromise = isNFL
        ? nflAPI.getTeamInfo(team.id)
        : scheduleAPI.getTeamInfo(sport, team.id);

      fetchPromise
        .then(fetchedData => {
          setData(fetchedData);
          setLoading(false);
        })
        .catch(error => {
          console.error('Failed to load team info:', error);
          setLoading(false);
        });
    }
  }, [team?.id, sport, externalData]);

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
    if (!rankStr) return 'text-fg/50';
    const rank = parseInt(rankStr);
    if (isNaN(rank)) return 'text-fg/50';

    if (rank <= 10) return 'text-rank-good';
    if (rank <= 22) return 'text-rank-mid';
    return 'text-red-500';
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

  const formatShortDate = (dateStr) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' });
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
      colorClass = 'bg-red-500/20 text-red-500';
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

  // Player row component for Key Players section (NFL only)
  const PlayerRow = ({ player, showPosition = false }) => (
    <div className="flex items-start gap-2.5">
      {player.headshot && (
        <img src={player.headshot} alt="" className="w-10 h-10 rounded-full object-cover flex-shrink-0" />
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-sm font-medium text-fg">{player.name}</span>
          {showPosition && (
            <span className="text-sm text-fg/50">({player.position})</span>
          )}
          <InjuryBadge injury={player.injury} />
        </div>
        <div className="text-sm text-fg/70 mt-0.5">
          {Object.entries(player.stats || {}).map(([k, v]) => `${v} ${k}`).join(', ')}
          {player.perGameStats && Object.keys(player.perGameStats).length > 0 && (
            <span className="text-fg/60 ml-1">
              ({Object.entries(player.perGameStats).map(([k, v]) => `${v} ${k}`).join(', ')})
            </span>
          )}
        </div>
      </div>
    </div>
  );

  // Position group component (NFL only)
  const PositionGroup = ({ label, players, showPosition = false }) => {
    if (!players?.length) return null;

    return (
      <div className="flex gap-0 sm:gap-3">
        <span className="text-sm font-medium text-fg/50 w-7 sm:w-8 pt-2 flex-shrink-0">{label}</span>
        <div className="flex-1 space-y-3">
          {players.map((p, i) => (
            <PlayerRow key={i} player={p} showPosition={showPosition} />
          ))}
        </div>
      </div>
    );
  };

  // --- Stats Tab Rendering ---
  const renderNFLStats = () => (
    <div className="space-y-4">
      {/* Team Record */}
      {data?.team && (
        <div className="grid grid-cols-4 gap-2">
          <div className="bg-fg/5 rounded-lg p-2.5 text-center">
            <div className="text-lg font-bold text-fg">{data.team.record || '-'}</div>
            <div className="text-sm text-fg/50">Record</div>
          </div>
          <div className="bg-fg/5 rounded-lg p-2.5 text-center">
            <div className="text-lg font-bold text-fg">{data.team.streak || '-'}</div>
            <div className="text-sm text-fg/50">Streak</div>
          </div>
          <div className="bg-fg/5 rounded-lg p-2.5 text-center">
            <div className="text-lg font-bold text-fg">{data.team.homeRecord || '-'}</div>
            <div className="text-sm text-fg/50">Home</div>
          </div>
          <div className="bg-fg/5 rounded-lg p-2.5 text-center">
            <div className="text-lg font-bold text-fg">{data.team.awayRecord || '-'}</div>
            <div className="text-sm text-fg/50">Away</div>
          </div>
        </div>
      )}

      {/* Team Stats Summary */}
      <div className="grid grid-cols-2 gap-2">
        <div className="bg-fg/5 rounded-lg p-3">
          <div className="text-sm text-fg/50 mb-1">Points/Game</div>
          <div className="text-lg font-semibold text-fg">
            {data?.stats?.offense?.pointsPerGame?.displayValue || '-'}
            {data?.stats?.rankings?.pointsFor && (
              <span className={`text-sm ml-1 ${getRankColor(data.stats.rankings.pointsFor)}`}>({data.stats.rankings.pointsFor})</span>
            )}
          </div>
        </div>
        <div className="bg-fg/5 rounded-lg p-3">
          <div className="text-sm text-fg/50 mb-1">Pts Allowed/Game</div>
          <div className="text-lg font-semibold text-fg">
            {data?.stats?.defense?.pointsAllowedPerGame?.displayValue || '-'}
            {data?.stats?.rankings?.pointsAgainst && (
              <span className={`text-sm ml-1 ${getRankColor(data.stats.rankings.pointsAgainst)}`}>({data.stats.rankings.pointsAgainst})</span>
            )}
          </div>
        </div>
      </div>

      {/* Key Players - Categorized by Position */}
      {data?.topPlayers && (
        <div className="bg-fg/5 rounded-lg p-3">
          <h4 className="text-sm font-medium text-fg/50 uppercase tracking-wide mb-3">Key Players</h4>
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
          <div className="bg-fg/5 rounded-lg p-3">
            <div className="text-sm text-fg/50 uppercase tracking-wide mb-2">Passing</div>
            <div className="space-y-1.5">
              <div className="flex justify-between text-sm">
                <span className="text-fg/50">Yds/G</span>
                <span className="text-fg">
                  {data.stats.passing.yardsPerGame?.displayValue || '-'}
                  {data.stats.rankings?.passingYPG && (
                    <span className={`text-sm ml-1 ${getRankColor(data.stats.rankings.passingYPG)}`}>({data.stats.rankings.passingYPG})</span>
                  )}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-fg/50">TD/G</span>
                <span className="text-fg">
                  {data.stats.passing.touchdownsPerGame?.displayValue || '-'}
                  {data.stats.rankings?.passingTD && (
                    <span className={`text-sm ml-1 ${getRankColor(data.stats.rankings.passingTD)}`}>({data.stats.rankings.passingTD})</span>
                  )}
                </span>
              </div>
            </div>
          </div>
        )}

        {data?.stats?.rushing && (
          <div className="bg-fg/5 rounded-lg p-3">
            <div className="text-sm text-fg/50 uppercase tracking-wide mb-2">Rushing</div>
            <div className="space-y-1.5">
              <div className="flex justify-between text-sm">
                <span className="text-fg/50">Yds/G</span>
                <span className="text-fg">
                  {data.stats.rushing.yardsPerGame?.displayValue || '-'}
                  {data.stats.rankings?.rushingYPG && (
                    <span className={`text-sm ml-1 ${getRankColor(data.stats.rankings.rushingYPG)}`}>({data.stats.rankings.rushingYPG})</span>
                  )}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-fg/50">TD/G</span>
                <span className="text-fg">
                  {data.stats.rushing.touchdownsPerGame?.displayValue || '-'}
                  {data.stats.rankings?.rushingTD && (
                    <span className={`text-sm ml-1 ${getRankColor(data.stats.rankings.rushingTD)}`}>({data.stats.rankings.rushingTD})</span>
                  )}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-fg/50">YPC</span>
                <span className="text-fg">
                  {data.stats.rushing.yardsPerCarry?.displayValue || '-'}
                  {data.stats.rankings?.rushingYPC && (
                    <span className={`text-sm ml-1 ${getRankColor(data.stats.rankings.rushingYPC)}`}>({data.stats.rankings.rushingYPC})</span>
                  )}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );

  const renderGenericStats = () => {
    const statsEntries = data?.stats ? Object.entries(data.stats) : [];

    return (
      <div className="space-y-4">
        {/* Team Record */}
        {data?.team && (
          <div className="grid grid-cols-4 gap-2">
            <div className="bg-fg/5 rounded-lg p-2.5 text-center">
              <div className="text-lg font-bold text-fg">{data.team.record || '-'}</div>
              <div className="text-sm text-fg/50">Record</div>
            </div>
            <div className="bg-fg/5 rounded-lg p-2.5 text-center">
              <div className="text-lg font-bold text-fg">{data.team.streak || '-'}</div>
              <div className="text-sm text-fg/50">Streak</div>
            </div>
            <div className="bg-fg/5 rounded-lg p-2.5 text-center">
              <div className="text-lg font-bold text-fg">{data.team.homeRecord || '-'}</div>
              <div className="text-sm text-fg/50">Home</div>
            </div>
            <div className="bg-fg/5 rounded-lg p-2.5 text-center">
              <div className="text-lg font-bold text-fg">{data.team.awayRecord || '-'}</div>
              <div className="text-sm text-fg/50">Away</div>
            </div>
          </div>
        )}

        {/* Generic Stats Grid */}
        {statsEntries.length > 0 ? (
          <div className="grid grid-cols-2 gap-2">
            {statsEntries.map(([label, stat]) => (
              <div key={label} className="bg-fg/5 rounded-lg p-3">
                <div className="text-sm text-fg/50 mb-1">{label}</div>
                <div className="text-lg font-semibold text-fg">
                  {stat.displayValue || '-'}
                  {stat.rank && (
                    <span className={`text-sm ml-1 ${getRankColor(stat.rank)}`}>({stat.rank})</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-6 text-fg/50">
            <BarChart3 className="w-10 h-10 mx-auto mb-2 opacity-50" />
            <p>No stats available</p>
          </div>
        )}
      </div>
    );
  };

  // --- Schedule Tab Rendering ---
  const renderNFLSchedule = () => (
    <div className="space-y-1">
      {data?.schedule?.length > 0 ? (
        data.schedule.map((game, i) => {
          const opponentAbbr = game.opponent?.abbreviation;
          const opponentLogo = game.opponent?.logo
            || game.opponentLogo
            || (opponentAbbr ? `https://a.espncdn.com/i/teamlogos/nfl/500/${opponentAbbr.toLowerCase()}.png` : null);

          return (
            <div
              key={i}
              data-schedule-item
              className={`flex items-center gap-2 sm:gap-3 py-2.5 px-3 rounded-lg ${
                game.isCompleted
                  ? game.result === 'W'
                    ? 'bg-green-500/5'
                    : 'bg-red-500/5'
                  : 'bg-fg/5'
              }`}
            >
              {/* Week Number */}
              <div className="w-8 flex-shrink-0 text-center">
                <div className="text-base font-bold text-fg">{game.week}</div>
                <div className="text-sm text-fg/50">Week</div>
              </div>

              {/* vs/@ indicator */}
              <div className="w-6 flex-shrink-0 flex items-center justify-center">
                <span className="text-sm text-fg/50">{game.isHome ? 'vs' : '@'}</span>
              </div>

              {/* Opponent Logo */}
              <div className="flex-shrink-0">
                {opponentLogo ? (
                  <img src={tl(opponentLogo)} alt={opponentAbbr} className="w-8 h-8 object-contain" />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-fg/10 flex items-center justify-center text-fg/50 text-sm font-bold">
                    {opponentAbbr?.charAt(0) || '?'}
                  </div>
                )}
              </div>

              {/* Opponent Name */}
              <div className="flex-1 min-w-0">
                <div className="sm:hidden">
                  <div className="text-sm text-fg/50 leading-tight">
                    {game.opponent?.name?.split(' ').slice(0, -1).join(' ') || ''}
                  </div>
                  <div className="text-base font-medium text-fg leading-tight">
                    {game.opponent?.name?.split(' ').pop() || opponentAbbr}
                    {game.opponent?.record && (
                      <span className="text-sm text-fg/50 font-normal ml-1.5">({game.opponent.record})</span>
                    )}
                  </div>
                </div>
                <span className="text-base font-medium text-fg hidden sm:inline">
                  {game.opponent?.name || game.opponent?.displayName || opponentAbbr}
                </span>
                {game.opponent?.record && (
                  <span className="text-sm text-fg/50 ml-1.5 hidden sm:inline">({game.opponent.record})</span>
                )}
              </div>

              {/* Result/Date */}
              <div className="text-right flex-shrink-0">
                {game.isCompleted ? (
                  <>
                    <div className="sm:hidden">
                      <div className="flex items-center justify-end gap-1.5">
                        <span className={`text-base font-bold ${game.result === 'W' ? 'text-green-500' : 'text-red-500'}`}>
                          {game.result}
                        </span>
                        <span className="text-base text-fg font-semibold">{game.teamScore}-{game.oppScore}</span>
                      </div>
                      {game.teamRecord && <div className="text-sm text-fg/50 mt-0.5">{game.teamRecord}</div>}
                    </div>
                    <div className="hidden sm:flex items-center justify-end gap-2">
                      <span className={`text-base font-bold ${game.result === 'W' ? 'text-green-500' : 'text-red-500'}`}>
                        {game.result}
                      </span>
                      <span className="text-base text-fg font-semibold">{game.teamScore}-{game.oppScore}</span>
                      {game.teamRecord && <span className="text-sm text-fg/50">({game.teamRecord})</span>}
                    </div>
                  </>
                ) : (
                  <div className="text-sm text-fg/60">
                    <span className="sm:hidden">{formatShortDate(game.date)}</span>
                    <span className="hidden sm:inline">{formatGameDate(game.date)}</span>
                    {' '}
                    <span className="text-fg/50">
                      {new Date(game.date).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}
                    </span>
                  </div>
                )}
              </div>
            </div>
          );
        })
      ) : (
        <div className="text-center py-12 text-fg/50">
          <Calendar className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p className="text-base">No schedule available</p>
        </div>
      )}
    </div>
  );

  // Map sport id to ESPN CDN league slug for logo fallback
  const espnLeagueSlug = { nba: 'nba', mlb: 'mlb', nhl: 'nhl' };

  const renderGenericSchedule = () => (
    <div className="space-y-1">
      {data?.schedule?.length > 0 ? (
        data.schedule.map((game, i) => {
          const opponentAbbr = game.opponent?.abbreviation;
          const isTBD = !opponentAbbr || opponentAbbr === 'TBD' || game.opponent?.name === 'TBD';
          const leagueSlug = espnLeagueSlug[sport];
          const opponentLogo = isTBD ? null : (game.opponent?.logo
            || (opponentAbbr && leagueSlug
              ? `https://a.espncdn.com/i/teamlogos/${leagueSlug}/500/${opponentAbbr.toLowerCase()}.png`
              : null)
            || (game.opponent?.id
              ? `https://a.espncdn.com/i/teamlogos/${sport}/500/scoreboard/${game.opponent.id}.png`
              : null));

          return (
            <div
              key={i}
              data-schedule-item
              className={`flex items-center gap-1 sm:gap-3 py-2.5 px-2 sm:px-3 rounded-lg ${
                game.isCompleted
                  ? game.result === 'W'
                    ? 'bg-green-500/5'
                    : game.result === 'L' ? 'bg-red-500/5' : 'bg-fg/5'
                  : 'bg-fg/5'
              }`}
            >
              {/* Date */}
              <div className="w-9 sm:w-12 flex-shrink-0 text-center">
                <div className="text-sm font-bold text-fg">
                  {new Date(game.date).toLocaleDateString('en-US', { month: 'short' })}
                </div>
                <div className="text-base sm:text-lg font-bold text-fg leading-tight">
                  {new Date(game.date).getDate()}
                </div>
              </div>

              {/* vs/@ indicator */}
              <div className="w-5 sm:w-6 flex-shrink-0 flex items-center justify-center">
                <span className="text-sm text-fg/50">{game.isHome ? 'vs' : '@'}</span>
              </div>

              {/* Opponent Logo */}
              <div className="flex-shrink-0 mr-0.5">
                {opponentLogo ? (
                  <img
                    src={tl(opponentLogo)}
                    alt={opponentAbbr}
                    className="w-6 h-6 sm:w-8 sm:h-8 object-contain"
                    onError={e => { e.target.style.display = 'none'; e.target.nextSibling && (e.target.nextSibling.style.display = 'flex'); }}
                  />
                ) : null}
                <div
                  className="w-6 h-6 sm:w-8 sm:h-8 rounded-full bg-fg/10 flex items-center justify-center text-fg/50 text-sm font-bold overflow-hidden"
                  style={opponentLogo ? { display: 'none' } : {}}
                >
                  {(opponentAbbr || '?').slice(0, 3)}
                </div>
              </div>

              {/* Opponent Name */}
              <div className="flex-1 min-w-0">
                <div className="sm:hidden">
                  <div className="text-sm text-fg/50 leading-tight">
                    {game.opponent?.name?.split(' ').slice(0, -1).join(' ') || ''}
                  </div>
                  <div className="text-sm font-medium text-fg leading-tight">
                    {sport === 'ncaab' && game.opponent?.rank && (
                      <span className="text-sm text-fg/60 font-semibold mr-1">#{game.opponent.rank}</span>
                    )}
                    {game.opponent?.name?.split(' ').pop() || game.opponent?.abbreviation || '?'}
                    {game.opponent?.record && (
                      <span className="text-sm text-fg/50 font-normal ml-1 whitespace-nowrap">({game.opponent.record})</span>
                    )}
                  </div>
                </div>
                <span className="text-base font-medium text-fg hidden sm:inline">
                  {sport === 'ncaab' && game.opponent?.rank && (
                    <span className="text-sm text-fg/60 font-semibold mr-1">#{game.opponent.rank}</span>
                  )}
                  {game.opponent?.name || game.opponent?.abbreviation || '?'}
                </span>
                {game.opponent?.record && (
                  <span className="text-sm text-fg/50 ml-1.5 hidden sm:inline">({game.opponent.record})</span>
                )}
              </div>

              {/* Result/Time */}
              <div className="text-right flex-shrink-0">
                {game.isCompleted ? (
                  <div className="flex items-center gap-1.5">
                    <span className={`text-base font-bold ${
                      game.result === 'W' ? 'text-green-500' : game.result === 'L' ? 'text-red-500' : 'text-fg/60'
                    }`}>
                      {game.result}
                    </span>
                    <span className="text-base text-fg font-semibold">{game.teamScore}-{game.oppScore}</span>
                  </div>
                ) : (
                  <div className="text-sm text-fg/60">
                    <span className="sm:hidden">
                      {new Date(game.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </span>
                    <span className="hidden sm:inline">
                      {new Date(game.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                    </span>
                    {' '}
                    <span className="text-fg/50">
                      {new Date(game.date).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}
                    </span>
                  </div>
                )}
              </div>
            </div>
          );
        })
      ) : (
        <div className="text-center py-12 text-fg/50">
          <Calendar className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p className="text-base">No schedule available</p>
        </div>
      )}
    </div>
  );

  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-canvas rounded-2xl max-w-lg w-full max-h-[85vh] overflow-hidden flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="p-4 flex items-center gap-4 border-b border-fg/10"
          style={{ background: `linear-gradient(135deg, ${team.color || '#374151'}22, transparent)` }}
        >
          {team.logo ? (
            <img src={tl(team.logo)} alt="" className="w-16 h-16 object-contain" />
          ) : (
            <div
              className="w-16 h-16 rounded-xl flex items-center justify-center text-white font-bold text-xl"
              style={{ backgroundColor: team.color || '#374151' }}
            >
              {team.abbreviation}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <h2 className="text-xl font-bold text-fg truncate">{team.name}</h2>
            <div className="flex items-center gap-2 text-sm text-fg/60">
              <span>{team.record}</span>
              {data?.team?.standing && (
                <>
                  <span>•</span>
                  <span>{data.team.standing}</span>
                </>
              )}
            </div>
            {data?.team?.division && (
              <div className="text-sm text-fg/50 mt-0.5">{data.team.division}</div>
            )}
          </div>
          <button onClick={onClose} className="p-2 hover:bg-fg/10 rounded-full transition-colors">
            <X className="w-5 h-5 text-fg/60" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-fg/10">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => {
                trackingAPI.event('team_info_tab_switch', { teamName: team?.name || team?.abbreviation, tab: tab.id, fromTab: activeTab });
                setActiveTab(tab.id);
              }}
              className={`flex-1 py-3 text-sm font-medium flex items-center justify-center gap-1.5 transition-colors ${
                activeTab === tab.id
                  ? 'text-fg border-b-2 border-white'
                  : 'text-fg/50 hover:text-fg/70'
              }`}
            >
              <tab.icon className="w-4 h-4" />
              <span>{tab.label}</span>
            </button>
          ))}
        </div>

        {/* Content */}
        <div ref={contentRef} className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 text-fg/50 animate-spin" />
            </div>
          ) : (
            <>
              {/* News Tab — same for all sports */}
              {activeTab === 'news' && (
                <div className="space-y-3">
                  {data?.news?.length > 0 ? (
                    data.news.map((article, i) => {
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
                          className="block p-3 bg-fg/5 rounded-lg hover:bg-fg/10 transition-colors group"
                        >
                          <div className="flex gap-3">
                            {article.image && (
                              <img src={article.image} alt="" className="w-20 h-14 object-cover rounded flex-shrink-0" />
                            )}
                            <div className="flex-1 min-w-0">
                              <h4 className="text-sm font-medium text-fg line-clamp-2 group-hover:text-blue-400 transition-colors">
                                {article.headline}
                              </h4>
                              <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                                {sourceInfo && (
                                  <span className="flex items-center gap-1">
                                    {sourceInfo.icon && (
                                      <img src={sourceInfo.icon} alt={sourceInfo.name} className="w-3.5 h-3.5 rounded-sm" />
                                    )}
                                    <span className="text-sm text-fg/50">{sourceInfo.name}</span>
                                  </span>
                                )}
                                <span className="text-sm text-fg/50">{formatDate(article.published)}</span>
                                {article.premium && (
                                  <span className="text-[10px] px-1.5 py-0.5 bg-yellow-500/20 text-yellow-400 rounded font-medium">ESPN+</span>
                                )}
                              </div>
                            </div>
                            <ExternalLink className="w-4 h-4 text-fg/40 flex-shrink-0 group-hover:text-fg/50 transition-colors" />
                          </div>
                        </a>
                      );
                    })
                  ) : (
                    <div className="text-center py-8 text-fg/50">
                      <Newspaper className="w-10 h-10 mx-auto mb-2 opacity-50" />
                      <p>No recent news available</p>
                    </div>
                  )}
                </div>
              )}

              {/* Stats Tab — sport-specific */}
              {activeTab === 'stats' && (isNFL ? renderNFLStats() : renderGenericStats())}

              {/* Schedule Tab — sport-specific */}
              {activeTab === 'schedule' && (isNFL ? renderNFLSchedule() : renderGenericSchedule())}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
