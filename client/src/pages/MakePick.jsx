import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { 
  ArrowLeft, Calendar, Check, Lock, ChevronLeft, ChevronRight,
  Loader2, TrendingUp, TrendingDown
} from 'lucide-react';
import { leagueAPI, picksAPI, nflAPI } from '../api';
import { useToast } from '../components/Toast';
import Loading from '../components/Loading';

export default function MakePick() {
  const { leagueId } = useParams();
  const navigate = useNavigate();
  const { showToast } = useToast();
  
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [league, setLeague] = useState(null);
  const [currentWeek, setCurrentWeek] = useState(18);
  const [selectedWeek, setSelectedWeek] = useState(18);
  const [games, setGames] = useState([]);
  const [selectedTeam, setSelectedTeam] = useState(null);
  const [currentPick, setCurrentPick] = useState(null);
  const [currentPickLocked, setCurrentPickLocked] = useState(false);
  const [usedTeams, setUsedTeams] = useState([]);

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
      setSelectedWeek(week);

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
        } else {
          setCurrentPick(null);
          setSelectedTeam(null);
          setCurrentPickLocked(false);
        }
      } else {
        setGames([]);
        setCurrentPick(null);
        setSelectedTeam(null);
        setCurrentPickLocked(false);
      }
    } catch (error) {
      console.error('Load teams error:', error);
      setGames([]);
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
  if (!league) return null;

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
            {currentPick ? 'Change Your Pick' : 'Make Your Pick'}
          </h1>
          <p className="text-white/50 text-sm truncate">{league.name}</p>
        </div>
      </div>

      {/* Week Selector */}
      <div className="flex items-center justify-between bg-white/5 rounded-lg p-1 mb-3 sm:mb-4">
        <button
          onClick={() => setSelectedWeek(Math.max(startWeek, selectedWeek - 1))}
          disabled={selectedWeek <= startWeek}
          className="p-2 sm:p-3 hover:bg-white/10 rounded-lg disabled:opacity-30"
        >
          <ChevronLeft className="w-5 h-5 text-white" />
        </button>
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-white/50 hidden sm:block" />
          <span className="text-white font-semibold text-base sm:text-lg">Week {selectedWeek}</span>
          {selectedWeek === currentWeek && (
            <span className="bg-green-500/20 text-green-400 text-xs px-2 py-0.5 rounded-full">Current</span>
          )}
        </div>
        <button
          onClick={() => setSelectedWeek(Math.min(18, selectedWeek + 1))}
          disabled={selectedWeek >= 18}
          className="p-2 sm:p-3 hover:bg-white/10 rounded-lg disabled:opacity-30"
        >
          <ChevronRight className="w-5 h-5 text-white" />
        </button>
      </div>

      {/* Current Pick Display */}
      {currentPick && (
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
                  <div key={team.id} className="flex items-center gap-2">
                    {team.logo && <img src={team.logo} alt="" className="w-6 h-6 object-contain" />}
                    <span className="text-white font-medium">{team.name || team.abbreviation}</span>
                    {currentPickLocked && <Lock className="w-4 h-4 text-red-400" />}
                  </div>
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
          <Calendar className="w-10 h-10 text-white/20 mx-auto mb-3" />
          <p className="text-white/50">No games scheduled for Week {selectedWeek}</p>
        </div>
      ) : (
        <div className="space-y-2 sm:space-y-3">
          {games.map((game) => (
            <GameCard 
              key={game.id}
              game={game}
              selectedTeam={selectedTeam}
              onSelectTeam={handleSelectTeam}
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
    </div>
  );
}

function GameCard({ game, selectedTeam, onSelectTeam }) {
  const gameDate = new Date(game.date);
  const away = game.awayTeam;
  const home = game.homeTeam;
  const odds = game.odds;

  const formatDate = () => {
    const day = gameDate.toLocaleDateString('en-US', { weekday: 'short' });
    const time = gameDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    return `${day} ${time}`;
  };

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
        />
        <div className="h-px sm:h-auto sm:w-px bg-white/5" />
        <TeamCard 
          team={home} 
          isSelected={selectedTeam === home?.id}
          onSelect={() => onSelectTeam(home)}
          isHome={true}
        />
      </div>
    </div>
  );
}

function TeamCard({ team, isSelected, onSelect, isHome }) {
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

  return (
    <button
      onClick={onSelect}
      disabled={isDisabled}
      className={`flex-1 p-2.5 sm:p-4 text-left transition-all border-l-4 ${
        isSelected
          ? 'bg-green-500/15 border-l-green-500'
          : isDisabled
          ? 'opacity-40 cursor-not-allowed border-l-transparent'
          : 'hover:bg-white/5 active:bg-white/10 border-l-transparent'
      }`}
    >
      {/* MOBILE LAYOUT - Single row */}
      <div className="sm:hidden">
        <div className="flex items-center gap-2">
          {/* Logo */}
          {team.logo ? (
            <img src={team.logo} alt="" className="w-9 h-9 object-contain flex-shrink-0" />
          ) : (
            <div 
              className="w-9 h-9 rounded flex items-center justify-center text-white font-bold text-xs flex-shrink-0"
              style={{ backgroundColor: team.color || '#374151' }}
            >
              {team.abbreviation}
            </div>
          )}
          
          {/* Team info - don't let it shrink below content */}
          <div className="flex-1">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="font-semibold text-white text-[15px]">{team.abbreviation}</span>
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
          {team.logo ? (
            <img src={team.logo} alt="" className="w-12 h-12 object-contain flex-shrink-0" />
          ) : (
            <div 
              className="w-12 h-12 rounded flex items-center justify-center text-white font-bold text-sm flex-shrink-0"
              style={{ backgroundColor: team.color || '#374151' }}
            >
              {team.abbreviation}
            </div>
          )}
          
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-white text-lg truncate">{team.name}</span>
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
    </button>
  );
}