import { useState, useEffect } from 'react';
import BrandLogo from './BrandLogo';

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
      className={`fixed inset-0 z-[100] flex items-center justify-center bg-canvas transition-opacity duration-[600ms] ${
        phase === 'fadeout' ? 'opacity-0' : 'opacity-100'
      }`}
    >
      <div className="flex flex-col items-center gap-5">
        {/* Trophy icon */}
        <BrandLogo size="xl" className="splash-icon shadow-2xl" />

        {/* App name */}
        <h1 className="splash-title font-display font-black text-4xl sm:text-5xl text-fg tracking-tight">
          SURVIVOR<span className="text-violet-400">SZN</span>
        </h1>

        {/* Tagline */}
        <p className="flex items-center gap-2 text-base sm:text-lg tracking-wide">
          <span className="splash-word text-fg/50">Outlast.</span>
          <span className="splash-word text-fg/50">Survive.</span>
          <span className="splash-word font-semibold text-fg/80">Win.</span>
        </p>
      </div>
    </div>
  );
}
