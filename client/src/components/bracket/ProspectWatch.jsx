import { useState, useEffect, useMemo, useCallback } from 'react';
import { TrendingUp, TrendingDown, Minus, ChevronDown, ChevronUp, Activity, Trophy, Filter, ArrowUpDown } from 'lucide-react';
import { bracketAPI, trackingAPI } from '../../api';
import { useTheme } from '../../context/ThemeContext';

const NBA_LOGO = 'https://a.espncdn.com/combiner/i?img=/i/teamlogos/leagues/500/nba.png&w=48&h=48';

function StatCell({ label, season, tourney, isDark }) {
  const hasTourney = tourney !== null && tourney !== undefined && tourney !== 0;
  const isBetter = hasTourney && tourney > season;
  const isWorse = hasTourney && tourney < season;

  return (
    <div className="flex items-center justify-between py-1.5">
      <span className="text-sm text-fg/50 w-12">{label}</span>
      <span className="text-sm text-fg/70 w-16 text-center">{typeof season === 'number' ? season.toFixed(1) : season}</span>
      <span className={`text-sm font-semibold w-16 text-center ${
        !hasTourney ? 'text-fg/30' :
        isBetter ? 'text-emerald-500' :
        isWorse ? 'text-red-400' :
        'text-fg'
      }`}>
        {hasTourney ? (typeof tourney === 'number' ? tourney.toFixed(1) : tourney) : '—'}
      </span>
    </div>
  );
}

function ProspectCard({ prospect, expanded, onToggle, isDark }) {
  const {
    rank, name, position, school, schoolLogo, headshot, height, weight, year,
    teamSeed, teamColor, teamStatus, teamCurrentRound, isPlaying, currentGame,
    seasonStats, tournamentGames, tournamentAvgs, gamesPlayed, stockDirection,
  } = prospect;

  const statusBadge = () => {
    if (teamStatus === 'playing_now') {
      return (
        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-red-500/15 text-red-500 text-sm font-semibold">
          <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
          LIVE
        </span>
      );
    }
    if (teamStatus === 'eliminated') {
      return (
        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-fg/10 text-fg/40 text-sm font-medium">
          Eliminated
        </span>
      );
    }
    if (teamCurrentRound) {
      return (
        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-fg/10 text-fg/70 text-sm font-medium">
          {teamCurrentRound}
        </span>
      );
    }
    return null;
  };

  return (
    <div className="glass-card rounded-xl overflow-hidden transition-all">
      {/* Header */}
      <div className="p-4 pb-3">
        <div className="flex items-start gap-3">
          {/* Draft Rank */}
          <div
            className="flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm"
            style={{ backgroundColor: teamColor || '#1d428a' }}
          >
            #{rank}
          </div>

          {/* Headshot */}
          <div className="flex-shrink-0 w-12 h-12 rounded-full overflow-hidden bg-fg/5">
            <img
              src={headshot || schoolLogo || NBA_LOGO}
              alt={name}
              className="w-full h-full object-cover"
              onError={(e) => { e.target.src = NBA_LOGO; }}
            />
          </div>

          {/* Name & Info */}
          <div className="flex-1 min-w-0">
            <h3 className="text-base font-bold text-fg truncate">{name}</h3>
            <div className="flex items-center gap-2 mt-0.5">
              <span className={`px-1.5 py-0.5 rounded text-sm font-medium ${
                isDark ? 'bg-fg/10 text-fg/70' : 'bg-gray-100 text-gray-600'
              }`}>
                {position}
              </span>
              <div className="flex items-center gap-1">
                {schoolLogo && (
                  <img src={schoolLogo} alt={school} className="w-4 h-4" onError={(e) => { e.target.style.display = 'none'; }} />
                )}
                <span className="text-sm text-fg/60">{school}</span>
              </div>
            </div>
            <div className="flex items-center gap-2 mt-1">
              {teamSeed && (
                <span className="text-sm text-fg/50">#{teamSeed} seed</span>
              )}
              {statusBadge()}
            </div>
          </div>

          {/* Stock indicator */}
          <div className="flex-shrink-0">
            {stockDirection === 'up' && (
              <div className="flex items-center gap-1 text-emerald-500">
                <TrendingUp size={18} />
                <span className="text-sm font-semibold">Rising</span>
              </div>
            )}
            {stockDirection === 'down' && (
              <div className="flex items-center gap-1 text-red-400">
                <TrendingDown size={18} />
                <span className="text-sm font-semibold">Falling</span>
              </div>
            )}
            {stockDirection === 'neutral' && gamesPlayed > 0 && (
              <div className="flex items-center gap-1 text-fg/40">
                <Minus size={18} />
                <span className="text-sm font-medium">Steady</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Live Game Bar */}
      {currentGame && (
        <div className={`mx-4 mb-3 p-3 rounded-lg border ${
          isDark ? 'bg-red-500/10 border-red-500/20' : 'bg-red-50 border-red-200'
        }`}>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              {currentGame.opponentLogo && (
                <img src={currentGame.opponentLogo} alt="" className="w-5 h-5" />
              )}
              <span className="text-sm font-medium text-fg">
                vs {currentGame.opponentSeed ? `(${currentGame.opponentSeed}) ` : ''}{currentGame.opponent}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-fg">
                {currentGame.teamScore} - {currentGame.opponentScore}
              </span>
              <span className="text-sm text-red-500 font-medium">{currentGame.status}</span>
            </div>
          </div>
          {currentGame.prospectStats && (
            <div className="flex items-center gap-3 flex-wrap">
              <StatPill label="PTS" value={currentGame.prospectStats.pts} highlight />
              <StatPill label="REB" value={currentGame.prospectStats.reb} />
              <StatPill label="AST" value={currentGame.prospectStats.ast} />
              <StatPill label="STL" value={currentGame.prospectStats.stl} />
              <StatPill label="BLK" value={currentGame.prospectStats.blk} />
              <StatPill label="FG" value={currentGame.prospectStats.fg} />
              <StatPill label="3PT" value={currentGame.prospectStats.threePt} />
            </div>
          )}
        </div>
      )}

      {/* Physical & Season Info */}
      <div className="px-4 pb-2 flex items-center gap-3 text-sm text-fg/50">
        {height && <span>{height}</span>}
        {weight && <span>{weight} lbs</span>}
        {year && <span>{year}</span>}
        {seasonStats.gp && <span>{seasonStats.gp} GP</span>}
      </div>

      {/* Stats Comparison Table */}
      <div className="px-4 pb-3">
        <div className="flex items-center justify-between mb-1">
          <span className="text-sm text-fg/40 w-12"></span>
          <span className="text-sm font-medium text-fg/50 w-16 text-center">Season</span>
          <span className="text-sm font-medium text-fg/50 w-16 text-center">
            Tourney{gamesPlayed > 0 ? ` (${gamesPlayed})` : ''}
          </span>
        </div>
        <div className={`rounded-lg overflow-hidden ${isDark ? 'bg-fg/5' : 'bg-gray-50'} px-3`}>
          <StatCell label="PPG" season={seasonStats.ppg} tourney={tournamentAvgs.pts} isDark={isDark} />
          <StatCell label="RPG" season={seasonStats.rpg} tourney={tournamentAvgs.reb} isDark={isDark} />
          <StatCell label="APG" season={seasonStats.apg} tourney={tournamentAvgs.ast} isDark={isDark} />
          <StatCell label="STL" season={seasonStats.spg} tourney={tournamentAvgs.stl} isDark={isDark} />
          <StatCell label="BLK" season={seasonStats.bpg} tourney={tournamentAvgs.blk} isDark={isDark} />
          {seasonStats.fgPct > 0 && (
            <StatCell label="FG%" season={`${seasonStats.fgPct.toFixed(1)}%`} tourney={null} isDark={isDark} />
          )}
          {seasonStats.threePct > 0 && (
            <StatCell label="3P%" season={`${seasonStats.threePct.toFixed(1)}%`} tourney={null} isDark={isDark} />
          )}
          {seasonStats.mpg > 0 && (
            <StatCell label="MIN" season={seasonStats.mpg} tourney={tournamentAvgs.min} isDark={isDark} />
          )}
        </div>
      </div>

      {/* Game Log Toggle */}
      {tournamentGames.length > 0 && (
        <div>
          <button
            onClick={onToggle}
            className="w-full flex items-center justify-center gap-1.5 py-2.5 text-sm font-medium text-fg/60 hover:text-fg transition-colors border-t border-fg/10"
          >
            Game Log ({tournamentGames.length})
            {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>

          {expanded && (
            <div className={`px-4 pb-4 space-y-2 ${isDark ? 'bg-fg/3' : 'bg-gray-50/50'}`}>
              {tournamentGames.map((game, i) => (
                <div key={i} className={`rounded-lg p-3 ${isDark ? 'bg-fg/5' : 'bg-white'} border border-fg/5`}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-fg/50">{game.round}</span>
                    <div className="flex items-center gap-2">
                      {game.result === 'W' && (
                        <span className="text-sm font-bold text-emerald-500">W</span>
                      )}
                      {game.result === 'L' && (
                        <span className="text-sm font-bold text-red-400">L</span>
                      )}
                      {game.result === 'LIVE' && (
                        <span className="text-sm font-bold text-red-500">LIVE</span>
                      )}
                      <span className="text-sm font-semibold text-fg">
                        {game.teamScore}-{game.opponentScore}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 mb-2">
                    {game.opponentLogo && (
                      <img src={game.opponentLogo} alt="" className="w-4 h-4" />
                    )}
                    <span className="text-sm text-fg/70">
                      vs {game.opponentSeed ? `(${game.opponentSeed}) ` : ''}{game.opponent}
                    </span>
                  </div>
                  {game.stats && (
                    <div className="flex items-center gap-2 flex-wrap">
                      <StatPill label="PTS" value={game.stats.pts} highlight />
                      <StatPill label="REB" value={game.stats.reb} />
                      <StatPill label="AST" value={game.stats.ast} />
                      <StatPill label="STL" value={game.stats.stl} />
                      <StatPill label="BLK" value={game.stats.blk} />
                      <StatPill label="FG" value={game.stats.fg} />
                      <StatPill label="3PT" value={game.stats.threePt} />
                      <StatPill label="+/-" value={game.stats.plusMinus} />
                    </div>
                  )}
                  {!game.stats && (
                    <span className="text-sm text-fg/40">No stats available</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function StatPill({ label, value, highlight }) {
  if (value === 0 || value === '0' || value === '0-0') return null;
  return (
    <span className={`inline-flex items-center gap-1 text-sm ${
      highlight ? 'font-bold text-fg' : 'text-fg/70'
    }`}>
      <span className="text-fg/40">{label}</span>
      <span className={highlight ? 'font-bold' : 'font-medium'}>{value}</span>
    </span>
  );
}

export default function ProspectWatch({ season }) {
  const { isDark } = useTheme();
  const [prospects, setProspects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [sortBy, setSortBy] = useState('rank');
  const [filter, setFilter] = useState('all');
  const [expandedRank, setExpandedRank] = useState(null);

  // Fetch data
  useEffect(() => {
    if (!season) return;
    let cancelled = false;

    const fetchData = async () => {
      try {
        const data = await bracketAPI.getProspectWatch(season);
        if (!cancelled) {
          setProspects(data.prospects || []);
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          console.error('Prospect watch fetch error:', err);
          setError('Failed to load prospect data');
          setLoading(false);
        }
      }
    };

    fetchData();

    return () => { cancelled = true; };
  }, [season]);

  // Auto-refresh if any game is live
  useEffect(() => {
    if (!season || !prospects.length) return;
    const hasLive = prospects.some(p => p.isPlaying);
    if (!hasLive) return;

    const interval = setInterval(async () => {
      try {
        const data = await bracketAPI.getProspectWatch(season);
        setProspects(data.prospects || []);
      } catch (err) {
        // Silently fail on refresh
      }
    }, 60000);

    return () => clearInterval(interval);
  }, [season, prospects]);

  // Filter and sort
  const displayed = useMemo(() => {
    let filtered = [...prospects];

    if (filter === 'playing') {
      filtered = filtered.filter(p => p.isPlaying);
    } else if (filter === 'alive') {
      filtered = filtered.filter(p => p.teamStatus !== 'eliminated');
    }

    if (sortBy === 'rank') {
      filtered.sort((a, b) => a.rank - b.rank);
    } else if (sortBy === 'tourneyPpg') {
      filtered.sort((a, b) => {
        if (a.gamesPlayed === 0 && b.gamesPlayed === 0) return a.rank - b.rank;
        if (a.gamesPlayed === 0) return 1;
        if (b.gamesPlayed === 0) return -1;
        return b.tournamentAvgs.pts - a.tournamentAvgs.pts;
      });
    } else if (sortBy === 'stock') {
      const stockOrder = { up: 0, neutral: 1, down: 2 };
      filtered.sort((a, b) => {
        const oa = stockOrder[a.stockDirection] ?? 1;
        const ob = stockOrder[b.stockDirection] ?? 1;
        if (oa !== ob) return oa - ob;
        return a.rank - b.rank;
      });
    }

    return filtered;
  }, [prospects, filter, sortBy]);

  const handleToggle = useCallback((rank) => {
    setExpandedRank(prev => {
      if (prev !== rank) {
        const p = prospects.find(pr => pr.rank === rank);
        trackingAPI.event('prospect_game_log_expand', { rank, name: p?.name, school: p?.school });
      }
      return prev === rank ? null : rank;
    });
  }, [prospects]);

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <img src={NBA_LOGO} alt="NBA" className="w-7 h-7" />
          <h2 className="text-lg font-bold text-fg">Prospect Watch</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="glass-card rounded-xl h-64 animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (error || prospects.length === 0) {
    return null; // Don't render section if no data
  }

  const liveCount = prospects.filter(p => p.isPlaying).length;
  const aliveCount = prospects.filter(p => p.teamStatus !== 'eliminated').length;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <img src={NBA_LOGO} alt="NBA" className="w-7 h-7" />
          <h2 className="text-lg font-bold text-fg">Prospect Watch</h2>
          <span className={`px-2 py-0.5 rounded-full text-sm font-medium ${
            isDark ? 'bg-fg/10 text-fg/60' : 'bg-gray-100 text-gray-500'
          }`}>
            {prospects.length} prospects
          </span>
          {liveCount > 0 && (
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-red-500/15 text-red-500 text-sm font-semibold">
              <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
              {liveCount} live
            </span>
          )}
        </div>
      </div>

      {/* Sort & Filter */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-1 mr-2">
          <ArrowUpDown size={14} className="text-fg/40" />
          <span className="text-sm text-fg/40">Sort:</span>
        </div>
        {[
          { key: 'rank', label: 'Draft Rank' },
          { key: 'tourneyPpg', label: 'Tourney PPG' },
          { key: 'stock', label: 'Stock' },
        ].map(({ key, label }) => (
          <button
            key={key}
            onClick={() => { trackingAPI.event('prospect_sort', { sortBy: key }); setSortBy(key); }}
            className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
              sortBy === key
                ? 'bg-violet-500 text-white'
                : isDark ? 'bg-fg/10 text-fg/60 hover:bg-fg/15' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {label}
          </button>
        ))}

        <div className="w-px h-5 bg-fg/10 mx-1" />

        <div className="flex items-center gap-1 mr-2">
          <Filter size={14} className="text-fg/40" />
          <span className="text-sm text-fg/40">Filter:</span>
        </div>
        {[
          { key: 'all', label: 'All' },
          { key: 'alive', label: `Alive (${aliveCount})` },
          ...(liveCount > 0 ? [{ key: 'playing', label: `Live (${liveCount})` }] : []),
        ].map(({ key, label }) => (
          <button
            key={key}
            onClick={() => { trackingAPI.event('prospect_filter', { filter: key }); setFilter(key); }}
            className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
              filter === key
                ? 'bg-violet-500 text-white'
                : isDark ? 'bg-fg/10 text-fg/60 hover:bg-fg/15' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Grid */}
      {displayed.length === 0 ? (
        <div className={`glass-card rounded-xl p-8 text-center ${isDark ? 'text-fg/40' : 'text-gray-400'}`}>
          <Activity size={32} className="mx-auto mb-2 opacity-50" />
          <p className="text-sm">No prospects match this filter</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {displayed.map(prospect => (
            <ProspectCard
              key={prospect.rank}
              prospect={prospect}
              expanded={expandedRank === prospect.rank}
              onToggle={() => handleToggle(prospect.rank)}
              isDark={isDark}
            />
          ))}
        </div>
      )}
    </div>
  );
}
