import { useState, useRef, useCallback, useEffect, useLayoutEffect } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import useSwipe from '../../hooks/useSwipe';
import MobileBracketRoundPage from './MobileBracketRoundPage';

const ROUND_NAMES = ['First Round', 'Second Round', 'Sweet 16', 'Elite Eight'];

export default function MobileBracketNav({
  region,
  picks,
  results,
  tournamentData,
  onPick,
  onMatchupClick,
  isReadOnly,
}) {
  const [roundIdx, setRoundIdx] = useState(0);
  const [direction, setDirection] = useState(null); // 'left' | 'right'
  const [isAnimating, setIsAnimating] = useState(false);
  const [prevRoundIdx, setPrevRoundIdx] = useState(null);
  const prevRegionRef = useRef(region?.name);
  const contentRef = useRef(null);
  const [lockedHeight, setLockedHeight] = useState(null);

  const rounds = region?.rounds || [];
  const totalRounds = rounds.length;
  const currentRound = rounds[roundIdx];

  // Reset to first round when region changes (tab switch)
  useEffect(() => {
    if (region?.name !== prevRegionRef.current) {
      prevRegionRef.current = region?.name;
      setRoundIdx(0);
      setDirection(null);
      setIsAnimating(false);
      setPrevRoundIdx(null);
      setLockedHeight(null); // reset so First Round of new region gets measured
    }
  }, [region?.name]);

  // Capture First Round height to lock as minHeight (prevents layout shift)
  useLayoutEffect(() => {
    if (roundIdx === 0 && !isAnimating && contentRef.current) {
      const h = contentRef.current.scrollHeight;
      if (h > 0) setLockedHeight(h);
    }
  }, [roundIdx, isAnimating, region?.name]);

  const navigateTo = useCallback((targetIdx, dir) => {
    if (targetIdx < 0 || targetIdx >= totalRounds || isAnimating) return;
    setPrevRoundIdx(roundIdx);
    setDirection(dir);
    setIsAnimating(true);
    setRoundIdx(targetIdx);
  }, [totalRounds, isAnimating, roundIdx]);

  const goNext = useCallback(() => navigateTo(roundIdx + 1, 'left'), [navigateTo, roundIdx]);
  const goPrev = useCallback(() => navigateTo(roundIdx - 1, 'right'), [navigateTo, roundIdx]);

  const { handlers, dragOffsetX, isDragging } = useSwipe({
    onSwipeLeft: goNext,
    onSwipeRight: goPrev,
    threshold: 50,
    enabled: !isAnimating,
  });

  const handleAnimationEnd = useCallback(() => {
    setIsAnimating(false);
    setDirection(null);
    setPrevRoundIdx(null);
  }, []);

  // Compute animation classes based on direction
  const getEnterClass = () => {
    if (!direction) return '';
    return direction === 'left' ? 'bracket-slide-in-right' : 'bracket-slide-in-left';
  };

  const getExitClass = () => {
    if (!direction) return '';
    return direction === 'left' ? 'bracket-slide-out-left' : 'bracket-slide-out-right';
  };

  // Drag style for finger-follow (only when not animating)
  const dragStyle = !isAnimating && isDragging
    ? { transform: `translateX(${dragOffsetX}px)`, transition: 'none' }
    : !isAnimating
      ? { transform: 'translateX(0)', transition: 'transform 0.2s ease-out' }
      : {};

  if (!currentRound) return null;

  return (
    <div className="flex flex-col">
      {/* Round header with dots */}
      <div className="px-4 pt-2 pb-3 text-center">
        <p className="text-lg font-bold text-fg">
          {ROUND_NAMES[roundIdx] || currentRound.name}
        </p>
        {/* Round progress dots */}
        <div className="flex justify-center gap-2 mt-2">
          {rounds.map((_, i) => (
            <div
              key={i}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                i === roundIdx
                  ? 'w-6 bg-fg/80'
                  : i < roundIdx
                    ? 'w-1.5 bg-fg/40'
                    : 'w-1.5 bg-fg/15'
              }`}
            />
          ))}
        </div>
      </div>

      {/* Swipeable content area */}
      <div
        ref={contentRef}
        className={`relative ${isAnimating ? 'overflow-hidden' : ''}`}
        style={{ minHeight: lockedHeight ? `${lockedHeight}px` : '200px', touchAction: 'pan-y' }}
        {...handlers}
      >
        {/* Exiting page */}
        {isAnimating && prevRoundIdx !== null && rounds[prevRoundIdx] && (
          <div className={`absolute inset-0 ${getExitClass()}`}>
            <MobileBracketRoundPage
              slots={rounds[prevRoundIdx].slots}
              picks={picks}
              results={results}
              tournamentData={tournamentData}
              onPick={onPick}
              onMatchupClick={onMatchupClick}
              isReadOnly={isReadOnly}
            />
          </div>
        )}

        {/* Current page */}
        <div
          className={`${isAnimating ? 'absolute inset-0' : ''} ${isAnimating ? getEnterClass() : ''}`}
          style={isAnimating ? {} : dragStyle}
          onAnimationEnd={handleAnimationEnd}
        >
          <MobileBracketRoundPage
            slots={currentRound.slots}
            picks={picks}
            results={results}
            tournamentData={tournamentData}
            onPick={onPick}
            onMatchupClick={onMatchupClick}
            isReadOnly={isReadOnly}
          />
        </div>
      </div>

      {/* Bottom nav bar */}
      <div className="flex items-center justify-between px-4 py-3 mt-2">
        <button
          onClick={goPrev}
          disabled={roundIdx === 0 || isAnimating}
          className="p-2 rounded-xl bg-fg/5 text-fg/50 disabled:opacity-20 active:scale-95 transition-all"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>

        <span className="text-sm text-fg/40 font-medium">
          {roundIdx + 1} of {totalRounds}
        </span>

        <button
          onClick={goNext}
          disabled={roundIdx === totalRounds - 1 || isAnimating}
          className="p-2 rounded-xl bg-fg/5 text-fg/50 disabled:opacity-20 active:scale-95 transition-all"
        >
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
}
