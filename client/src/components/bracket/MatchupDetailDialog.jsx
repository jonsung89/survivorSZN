import { useState, useEffect } from 'react';
import { X, Loader2 } from 'lucide-react';
import { bracketAPI } from '../../api';
import TeamAnalysisCard from './TeamAnalysisCard';

export default function MatchupDetailDialog({
  slot,
  team1Info, // { id, name, seed, logo, color } — basic info from bracket
  team2Info,
  season,
  prediction, // { homeWinPct, awayWinPct } or null
  onPick,
  onClose,
  isReadOnly,
}) {
  const [team1Data, setTeam1Data] = useState(null);
  const [team2Data, setTeam2Data] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      const promises = [];

      if (team1Info?.id) {
        promises.push(
          bracketAPI.getTeamBreakdown(season, team1Info.id)
            .then(data => setTeam1Data({ ...team1Info, ...data }))
            .catch(() => setTeam1Data(team1Info))
        );
      }
      if (team2Info?.id) {
        promises.push(
          bracketAPI.getTeamBreakdown(season, team2Info.id)
            .then(data => setTeam2Data({ ...team2Info, ...data }))
            .catch(() => setTeam2Data(team2Info))
        );
      }

      await Promise.allSettled(promises);
      setLoading(false);
    };

    fetchData();

    // Lock scroll
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, [team1Info?.id, team2Info?.id, season]);

  // Escape to close
  useEffect(() => {
    const handleKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  const handlePick = (teamId) => {
    onPick?.(teamId);
    onClose();
  };

  // Win probability
  const team1Pct = prediction?.homeWinPct || prediction?.awayWinPct || 50;
  const team2Pct = 100 - team1Pct;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto" onClick={onClose}>
      <div className="fixed inset-0 bg-black/80 backdrop-blur-sm" />

      <div
        className="relative w-full max-w-4xl mx-4 my-8 rounded-2xl animate-in"
        style={{ background: 'rgb(var(--color-elevated))' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Drag handle (mobile close affordance) */}
        <div className="flex justify-center pt-3 pb-1 md:hidden">
          <div className="w-10 h-1 rounded-full bg-fg/20" />
        </div>

        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between p-4 border-b border-fg/10 rounded-t-2xl" style={{ background: 'rgb(var(--color-elevated))' }}>
          <div className="flex items-center gap-3">
            {team1Info?.logo && <img src={team1Info.logo} alt="" className="w-7 h-7 object-contain" />}
            <span className="text-base font-bold text-fg/80">
              {team1Info?.seed && `#${team1Info.seed} `}{team1Info?.name || 'TBD'}
            </span>
            <span className="text-fg/30 text-sm">vs</span>
            <span className="text-base font-bold text-fg/80">
              {team2Info?.seed && `#${team2Info.seed} `}{team2Info?.name || 'TBD'}
            </span>
            {team2Info?.logo && <img src={team2Info.logo} alt="" className="w-7 h-7 object-contain" />}
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-fg/10 transition-colors text-fg/50 hover:text-fg">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Win Probability Bar */}
        {prediction && team1Info && team2Info && (
          <div className="px-4 pt-4">
            <div className="text-xs text-fg/40 text-center mb-1.5 uppercase tracking-wider">Win Probability</div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-mono font-bold text-fg/70 w-12 text-right">{Math.round(team1Pct)}%</span>
              <div className="flex-1 h-4 rounded-full overflow-hidden bg-fg/10 flex">
                <div
                  className="h-full rounded-l-full transition-all duration-500"
                  style={{
                    width: `${team1Pct}%`,
                    backgroundColor: team1Info.color || '#6366f1',
                  }}
                />
                <div
                  className="h-full rounded-r-full transition-all duration-500"
                  style={{
                    width: `${team2Pct}%`,
                    backgroundColor: team2Info.color || '#f59e0b',
                  }}
                />
              </div>
              <span className="text-sm font-mono font-bold text-fg/70 w-12">{Math.round(team2Pct)}%</span>
            </div>
          </div>
        )}

        {/* Content */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-6 h-6 animate-spin text-fg/30" />
          </div>
        ) : (
          <div className="p-4 flex flex-col md:flex-row gap-6">
            <TeamAnalysisCard team={team1Data} teamColor={team1Info?.color} />
            <div className="hidden md:block w-px bg-fg/10 flex-shrink-0" />
            <div className="md:hidden h-px bg-fg/10" />
            <TeamAnalysisCard team={team2Data} teamColor={team2Info?.color} />
          </div>
        )}

        {/* Pick Buttons */}
        {!isReadOnly && team1Info && team2Info && (
          <div className="sticky bottom-0 p-4 border-t border-fg/10 rounded-b-2xl flex gap-3" style={{ background: 'rgb(var(--color-elevated))' }}>
            <button
              onClick={() => handlePick(team1Info.id)}
              className="flex-1 py-4 rounded-xl font-medium text-sm transition-all hover:scale-[1.01] active:scale-[0.99] flex items-center justify-center gap-2"
              style={{
                backgroundColor: `${team1Info.color || '#6366f1'}20`,
                borderColor: `${team1Info.color || '#6366f1'}40`,
                border: '1px solid',
                color: team1Info.color || '#6366f1',
              }}
            >
              {team1Info.logo && <img src={team1Info.logo} alt="" className="w-4 h-4 object-contain" />}
              Pick {team1Info.seed && `#${team1Info.seed} `}{team1Info.abbreviation || team1Info.name}
            </button>
            <button
              onClick={() => handlePick(team2Info.id)}
              className="flex-1 py-4 rounded-xl font-medium text-sm transition-all hover:scale-[1.01] active:scale-[0.99] flex items-center justify-center gap-2"
              style={{
                backgroundColor: `${team2Info.color || '#f59e0b'}20`,
                borderColor: `${team2Info.color || '#f59e0b'}40`,
                border: '1px solid',
                color: team2Info.color || '#f59e0b',
              }}
            >
              {team2Info.logo && <img src={team2Info.logo} alt="" className="w-4 h-4 object-contain" />}
              Pick {team2Info.seed && `#${team2Info.seed} `}{team2Info.abbreviation || team2Info.name}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
