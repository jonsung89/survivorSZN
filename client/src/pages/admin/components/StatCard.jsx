import { useState } from 'react';
import { TrendingUp, TrendingDown, Minus, Info } from 'lucide-react';

export default function StatCard({ label, value, icon: Icon, iconColor, delta, deltaLabel, live, description, subtitle, onClick }) {
  const [showDesc, setShowDesc] = useState(false);
  const deltaNum = typeof delta === 'number' ? delta : null;
  const isPositive = deltaNum > 0;
  const isNegative = deltaNum < 0;

  return (
    <div
      className={`bg-surface rounded-xl p-5 border border-fg/5 relative ${onClick ? 'cursor-pointer hover:border-fg/15 transition-colors' : ''}`}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } } : undefined}
    >
      <div className="flex items-center justify-between mb-3">
        <div className={`p-2 rounded-lg bg-fg/5 ${iconColor}`}>
          <Icon className="w-5 h-5" />
        </div>
        <div className="flex items-center gap-2">
          {live && (
            <div className="flex items-center gap-1.5">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
              </span>
              <span className="text-sm text-emerald-400 font-medium">LIVE</span>
            </div>
          )}
          {deltaNum !== null && (
            <div className={`flex items-center gap-1 text-sm font-medium ${
              isPositive ? 'text-emerald-400' : isNegative ? 'text-red-400' : 'text-fg/30'
            }`}>
              {isPositive ? (
                <TrendingUp className="w-3.5 h-3.5" />
              ) : isNegative ? (
                <TrendingDown className="w-3.5 h-3.5" />
              ) : (
                <Minus className="w-3.5 h-3.5" />
              )}
              <span>{isPositive ? '+' : ''}{deltaNum}</span>
            </div>
          )}
        </div>
      </div>
      <p className="text-3xl font-display font-bold text-fg">
        {typeof value === 'number' ? value.toLocaleString() : '—'}
      </p>
      {subtitle && (
        <p className="text-sm text-fg/40 mt-0.5">{subtitle}</p>
      )}
      <div className="flex items-center gap-1.5 mt-1">
        {description ? (
          <button
            onClick={() => setShowDesc(prev => !prev)}
            className="flex items-center gap-1 text-sm text-fg/50 hover:text-fg/70 transition-colors cursor-pointer"
          >
            <span>{label}</span>
            <Info className="w-3 h-3 text-fg/30" />
          </button>
        ) : (
          <p className="text-sm text-fg/50">{label}</p>
        )}
        {deltaLabel && deltaNum !== null && (
          <p className="text-sm text-fg/30">{deltaLabel}</p>
        )}
      </div>
      {showDesc && description && (
        <div className="mt-2 p-2.5 rounded-lg bg-fg/5 text-sm text-fg/60 leading-relaxed">
          {description}
        </div>
      )}
    </div>
  );
}
