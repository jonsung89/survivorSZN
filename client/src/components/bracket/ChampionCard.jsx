import { Trophy } from 'lucide-react';

function hexToRgba(hex, alpha) {
  if (!hex) return undefined;
  const h = hex.replace('#', '');
  if (h.length < 6) return undefined;
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  if (isNaN(r) || isNaN(g) || isNaN(b)) return undefined;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function getDarkBgLogo(logoUrl) {
  if (!logoUrl) return logoUrl;
  return logoUrl.replace('/500/', '/500-dark/');
}

export default function ChampionCard({ team }) {
  if (!team) return null;

  const teamColor = team.color || '#f59e0b';
  const whiteLogo = getDarkBgLogo(team.logo);

  return (
    <div className="relative overflow-hidden rounded-xl animate-in" style={{ animationDuration: '0.4s' }}>
      {/* Team-colored background with gradient overlay */}
      <div
        className="absolute inset-0"
        style={{ background: teamColor }}
      />
      <div
        className="absolute inset-0"
        style={{
          background: 'linear-gradient(to top, rgba(0,0,0,0.5) 0%, rgba(0,0,0,0.2) 50%, rgba(0,0,0,0.35) 100%)',
        }}
      />

      {/* Watermark logo — large, faded, in background */}
      {whiteLogo && (
        <img
          src={whiteLogo}
          alt=""
          className="absolute -right-4 top-1/2 -translate-y-1/2 w-32 h-32 object-contain opacity-[0.12] blur-[2px] pointer-events-none select-none"
        />
      )}

      {/* Pulsing glow border */}
      <div
        className="absolute inset-0 rounded-xl pointer-events-none"
        style={{
          boxShadow: `0 0 20px ${hexToRgba(teamColor, 0.3)}, inset 0 0 20px ${hexToRgba(teamColor, 0.05)}`,
          animation: 'championGlow 3s ease-in-out infinite',
          '--glow-color': teamColor,
        }}
      />

      {/* Content */}
      <div className="relative z-10 flex flex-col items-center gap-2.5 px-6 py-5">
        <div className="flex items-center gap-2">
          <Trophy className="w-5 h-5 text-amber-300 drop-shadow-[0_0_6px_rgba(251,191,36,0.5)]" />
          <span className="text-xs font-bold uppercase tracking-[0.2em] text-amber-300/90">
            Champion
          </span>
          <Trophy className="w-5 h-5 text-amber-300 drop-shadow-[0_0_6px_rgba(251,191,36,0.5)]" />
        </div>

        {team.logo && (
          <img
            src={getDarkBgLogo(team.logo)}
            alt=""
            className="w-16 h-16 object-contain drop-shadow-lg"
          />
        )}

        <span
          className="text-xl font-display font-bold text-white drop-shadow-md"
          style={{ textShadow: '0 1px 4px rgba(0,0,0,0.5)' }}
        >
          {team.name || team.abbreviation || 'Champion'}
        </span>

        {team.seed && (
          <span className="text-xs font-mono font-semibold bg-white/15 text-white/80 rounded px-2 py-0.5 backdrop-blur-sm">
            #{team.seed} seed
          </span>
        )}
      </div>
    </div>
  );
}
