import { useState, useRef, useCallback, useEffect, useLayoutEffect } from 'react';
import useSwipe from '../../hooks/useSwipe';
import MobileBracketRoundPage from './MobileBracketRoundPage';

export default function MobileBracketNav({
  region,
  picks,
  results,
  tournamentData,
  liveSlotData = {},
  onPick,
  onMatchupClick,
  isReadOnly,
  champTeam,
  tiebreakerType,
  tiebreakerValue,
  onTiebreakerChange,
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
    if (targetIdx < 0 || targetIdx >= totalRounds || isAnimating || targetIdx === roundIdx) return;
    setPrevRoundIdx(roundIdx);
    setDirection(dir ?? (targetIdx > roundIdx ? 'left' : 'right'));
    setIsAnimating(true);
    setRoundIdx(targetIdx);
    // Scroll to top of the bracket content area
    const navbarH = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--navbar-height')) || 65;
    const regionH = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--region-tabs-height')) || 52;
    const targetScroll = (contentRef.current?.closest('.md\\:hidden')?.offsetTop || 0) - navbarH - regionH;
    window.scrollTo({ top: Math.max(0, targetScroll), behavior: 'smooth' });
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
      {/* Round selector tabs — sticky below region tabs */}
      <div className="sticky z-10 bg-surface -mx-3 px-3 pt-0 pb-2" style={{ top: 'calc(var(--navbar-height, 65px) + var(--region-tabs-height, 52px))' }}>
        <div className="flex gap-1 overflow-x-auto no-scrollbar">
          {rounds.map((r, i) => (
            <button
              key={i}
              onClick={() => navigateTo(i)}
              disabled={isAnimating}
              className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${
                i === roundIdx
                  ? 'bg-gradient-to-r from-violet-500 to-indigo-600 text-white shadow-sm'
                  : 'bg-fg/10 text-fg/60 border border-fg/10 active:scale-95'
              }`}
            >
              {i === roundIdx ? r.name : (r.shortName || r.name)}
            </button>
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
              liveSlotData={liveSlotData}
              onPick={onPick}
              onMatchupClick={onMatchupClick}
              isReadOnly={isReadOnly}
              champTeam={champTeam}
              tiebreakerType={tiebreakerType}
              tiebreakerValue={tiebreakerValue}
              onTiebreakerChange={onTiebreakerChange}
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
            liveSlotData={liveSlotData}
            onPick={onPick}
            onMatchupClick={onMatchupClick}
            isReadOnly={isReadOnly}
            champTeam={champTeam}
            tiebreakerType={tiebreakerType}
            tiebreakerValue={tiebreakerValue}
            onTiebreakerChange={onTiebreakerChange}
          />
        </div>
      </div>

    </div>
  );
}
