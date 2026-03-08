import { useState, useEffect } from 'react';
import { Trophy } from 'lucide-react';

export default function SplashScreen({ onComplete }) {
  const [phase, setPhase] = useState('animate'); // 'animate' | 'fadeout' | 'done'

  useEffect(() => {
    // "Win." finishes at ~2.0s (1.6s delay + 0.4s anim), hold 1s, then fade
    const fadeTimer = setTimeout(() => setPhase('fadeout'), 3000);
    // After fade-out transition completes (600ms)
    const doneTimer = setTimeout(() => {
      setPhase('done');
      onComplete();
    }, 3700);

    return () => {
      clearTimeout(fadeTimer);
      clearTimeout(doneTimer);
    };
  }, [onComplete]);

  if (phase === 'done') return null;

  return (
    <div
      className={`fixed inset-0 z-[100] flex items-center justify-center bg-[#0a0f1a] transition-opacity duration-[600ms] ${
        phase === 'fadeout' ? 'opacity-0' : 'opacity-100'
      }`}
    >
      <div className="flex flex-col items-center gap-5">
        {/* Trophy icon */}
        <div className="splash-icon w-20 h-20 rounded-2xl bg-gradient-to-br from-amber-500 to-yellow-600 flex items-center justify-center shadow-2xl">
          <Trophy className="w-10 h-10 text-white" />
        </div>

        {/* App name */}
        <h1 className="splash-title font-display font-black text-4xl sm:text-5xl text-white tracking-tight">
          SURVIVOR<span className="text-amber-500">SZN</span>
        </h1>

        {/* Tagline */}
        <p className="flex items-center gap-2 text-base sm:text-lg tracking-wide">
          <span className="splash-word text-white/50">Outlast.</span>
          <span className="splash-word text-white/50">Survive.</span>
          <span className="splash-word font-semibold text-white/80">Win.</span>
        </p>
      </div>
    </div>
  );
}
