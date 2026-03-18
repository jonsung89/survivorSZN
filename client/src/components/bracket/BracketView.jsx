import { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import { getBracketStructure, getMatchupTeams, getRegionForSlot, DEFAULT_REGIONS } from '../../utils/bracketSlots';
import BracketRegion, { getRoundDateRange } from './BracketRegion';
import BracketMatchup from './BracketMatchup';
import BracketMiniMap from './BracketMiniMap';
import MobileBracketNav from './MobileBracketNav';
import TiebreakerInput from './TiebreakerInput';
import ChampionCard from './ChampionCard';
import useBracketKeyboard from '../../hooks/useBracketKeyboard';
import { Focus, ZoomIn, ZoomOut, Keyboard, Maximize2, Smartphone } from 'lucide-react';

const ZOOM_LEVELS = [0.5, 0.75, 1.0, 1.25];

export default function BracketView({
  tournamentData,
  picks,
  results,
  liveSlotData = {},
  onPick,
  onMatchupClick,
  isReadOnly,
  tiebreakerType,
  tiebreakerValue,
  onTiebreakerChange,
}) {
  const [mobileTab, setMobileTab] = useState(0);
  const [mobileFullView, setMobileFullView] = useState(false);
  const [desktopTab, setDesktopTab] = useState(null); // null = show all (scroll mode)
  const [focusMode, setFocusMode] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(1.0);
  const [showMiniMap, setShowMiniMap] = useState(true);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [mobileScale, setMobileScale] = useState(0.55);
  const [isScrolling, setIsScrolling] = useState(false);
  const scrollTimeoutRef = useRef(null);
  const scrollContainerRef = useRef(null);
  const zoomWrapperRef = useRef(null);
  const bracketGridRef = useRef(null);
  const regionTabsRef = useRef(null);
  const roundHeadersRef = useRef(null);
  const mobileGridRef = useRef(null);
  const mobileWrapperRef = useRef(null);
  const pinchRef = useRef({ startDist: 0, startScale: 0.55 });
  // Use data-driven regions from tournament data, fall back to defaults
  const regions = tournamentData?.regions?.length ? tournamentData.regions : DEFAULT_REGIONS;
  const structure = getBracketStructure(regions);

  // Expose region tabs height as CSS variable for round tabs positioning
  useEffect(() => {
    const el = regionTabsRef.current;
    if (!el) return;
    const update = () => {
      document.documentElement.style.setProperty('--region-tabs-height', `${el.offsetHeight}px`);
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Sync round headers horizontal scroll with bracket container
  useEffect(() => {
    const container = scrollContainerRef.current;
    const headers = roundHeadersRef.current;
    if (!container || !headers) return;
    const onScroll = () => {
      headers.scrollLeft = container.scrollLeft;
    };
    container.addEventListener('scroll', onScroll, { passive: true });
    return () => container.removeEventListener('scroll', onScroll);
  }, [focusMode]);

  // Sync round headers wrapper height to match scaled content
  const roundHeadersWrapperRef = useRef(null);
  useEffect(() => {
    const wrapper = roundHeadersWrapperRef.current;
    if (!wrapper) return;
    const grid = wrapper.firstElementChild;
    if (!grid) return;
    const syncHeight = () => {
      wrapper.style.height = `${grid.scrollHeight * zoomLevel}px`;
    };
    syncHeight();
    const ro = new ResizeObserver(syncHeight);
    ro.observe(grid);
    return () => ro.disconnect();
  }, [zoomLevel, focusMode]);

  // Sync zoom wrapper height to match the scaled grid height
  useEffect(() => {
    const grid = bracketGridRef.current;
    const wrapper = zoomWrapperRef.current;
    if (!grid || !wrapper) return;

    const syncHeight = () => {
      wrapper.style.height = `${grid.scrollHeight * zoomLevel}px`;
    };
    syncHeight();

    const ro = new ResizeObserver(syncHeight);
    ro.observe(grid);
    return () => ro.disconnect();
  }, [zoomLevel]);

  // Hide zoom controls while scrolling (vertical page scroll + horizontal bracket scroll)
  useEffect(() => {
    if (!mobileFullView) return;
    const onScroll = () => {
      setIsScrolling(true);
      clearTimeout(scrollTimeoutRef.current);
      scrollTimeoutRef.current = setTimeout(() => setIsScrolling(false), 300);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    // Also listen for horizontal scroll on the bracket container
    const container = mobileWrapperRef.current?.parentElement;
    if (container) container.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      if (container) container.removeEventListener('scroll', onScroll);
      clearTimeout(scrollTimeoutRef.current);
    };
  }, [mobileFullView]);

  // Pinch-to-zoom for mobile full bracket view
  const mobileScaleRef = useRef(mobileScale);
  mobileScaleRef.current = mobileScale;

  useEffect(() => {
    const container = mobileWrapperRef.current;
    if (!container || !mobileFullView) return;

    const getDistance = (t1, t2) =>
      Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);

    let isPinching = false;

    const onTouchStart = (e) => {
      if (e.touches.length === 2) {
        isPinching = true;
        pinchRef.current.startDist = getDistance(e.touches[0], e.touches[1]);
        pinchRef.current.startScale = mobileScaleRef.current;
      }
    };

    const onTouchMove = (e) => {
      if (e.touches.length === 2 && isPinching) {
        e.preventDefault();
        const dist = getDistance(e.touches[0], e.touches[1]);
        const ratio = dist / pinchRef.current.startDist;
        const newScale = Math.min(1.0, Math.max(0.3, pinchRef.current.startScale * ratio));
        setMobileScale(newScale);
      }
    };

    const onTouchEnd = () => {
      isPinching = false;
    };

    // Only preventDefault on touchmove (not touchstart) so single-finger scrolling works
    container.addEventListener('touchstart', onTouchStart, { passive: true });
    container.addEventListener('touchmove', onTouchMove, { passive: false });
    container.addEventListener('touchend', onTouchEnd, { passive: true });

    return () => {
      container.removeEventListener('touchstart', onTouchStart);
      container.removeEventListener('touchmove', onTouchMove);
      container.removeEventListener('touchend', onTouchEnd);
    };
  }, [mobileFullView]);

  // Update mobile wrapper height when scale changes
  useEffect(() => {
    const grid = mobileGridRef.current;
    const wrapper = mobileWrapperRef.current;
    if (!grid || !wrapper) return;
    wrapper.style.height = `${grid.offsetHeight * mobileScale}px`;
    wrapper.style.width = `${grid.scrollWidth * mobileScale}px`;
  }, [mobileScale]);

  // Derive region tabs from structure (data-driven) — no separate Final Four tab
  const regionTabs = useMemo(
    () => structure.regions.map(r => r.name),
    [structure]
  );

  // Build enhanced regions with Final Four + Championship appended as swipeable rounds
  const enhancedRegions = useMemo(
    () => structure.regions.map(r => ({
      ...r,
      rounds: [
        ...r.rounds,
        { round: 4, name: 'Final Four', shortName: 'F4', slots: [...structure.finalFour.semifinals] },
        { round: 5, name: 'Championship', shortName: 'CHAMP', slots: [structure.finalFour.championship] },
      ],
    })),
    [structure]
  );

  // Desktop layout positions derived from Final Four semifinal pairings.
  const desktopLayout = useMemo(() => {
    const { semifinalRegions } = structure.finalFour;
    const findRegion = (name) => structure.regions.find(r => r.name === name);

    const leftSemi = semifinalRegions[0];
    const rightSemi = semifinalRegions[1];

    return {
      topLeft: findRegion(leftSemi.regions[0]),
      bottomLeft: findRegion(leftSemi.regions[1]),
      topRight: findRegion(rightSemi.regions[0]),
      bottomRight: findRegion(rightSemi.regions[1]),
    };
  }, [structure]);

  // Compute per-region pick counts and totals for progress tracker
  // Each region has 15 regional picks + 3 FF/Championship picks = 18 total
  const regionProgress = useMemo(() => {
    const regionCount = structure.regions.length;
    const ffSlots = [...structure.finalFour.semifinals, structure.finalFour.championship];
    const counts = new Array(regionCount).fill(0);
    const totals = structure.regions.map(() => 15 + ffSlots.length); // 15 + 3 = 18

    if (picks) {
      for (let slot = 1; slot <= 60; slot++) {
        if (picks[slot] || picks[String(slot)]) {
          const regionName = getRegionForSlot(slot);
          const regionIdx = regions.indexOf(regionName);
          if (regionIdx >= 0 && regionIdx < regionCount) counts[regionIdx]++;
        }
      }
      // Count FF/Championship picks in every region (they're shared)
      let ffCount = 0;
      for (const slot of ffSlots) {
        if (picks[slot] || picks[String(slot)]) ffCount++;
      }
      for (let i = 0; i < regionCount; i++) counts[i] += ffCount;
    }

    return { counts, totals };
  }, [picks, structure]);

  const regionCompletion = useMemo(
    () => regionProgress.counts.map((c, i) => c >= regionProgress.totals[i]),
    [regionProgress]
  );

  // Slot helpers for desktop Final Four rendering
  const teamsFor = (slot) => getMatchupTeams(slot, picks, tournamentData);
  const resultFor = (slot) => results?.[slot] || results?.[String(slot)] || null;
  const pickedFor = (slot) => picks?.[slot] || picks?.[String(slot)] || null;

  // Build slotData for a given slot — combines tournament info with live overlay
  const slotDataFor = (slot) => {
    const base = tournamentData?.slots?.[slot] || tournamentData?.slots?.[String(slot)] || {};
    const live = liveSlotData?.[slot] || liveSlotData?.[String(slot)] || null;
    return {
      startDate: base.startDate,
      status: live?.status || base.status,
      statusDetail: live?.statusDetail || base.statusDetail,
      clock: live?.clock,
      period: live?.period,
      broadcast: live?.broadcast || base.broadcast,
    };
  };

  // Shared layout data (used by desktop render + mobile full bracket view)
  const { topLeft, bottomLeft, topRight, bottomRight } = desktopLayout;
  const { semifinalRegions, championship: champSlot } = structure.finalFour;
  const leftSemi = semifinalRegions[0];
  const rightSemi = semifinalRegions[1];
  const colW = { width: '310px', minWidth: '310px' };

  const f4DateRange = getRoundDateRange(
    semifinalRegions.map(s => s.slot),
    tournamentData,
  );
  const champDateRange = getRoundDateRange([champSlot], tournamentData);

  // Render sticky round headers bar for full bracket view (outside overflow container)
  const renderStickyRoundHeaders = () => {
    if (focusMode) return null;
    const leftRounds = topLeft.rounds;
    const rightRounds = [...topRight.rounds].reverse();
    return (
      <div
        ref={roundHeadersRef}
        className="hidden md:block sticky top-[112px] z-10 bg-surface/95 backdrop-blur-sm overflow-hidden rounded-lg border border-fg/5"
      >
        <div ref={roundHeadersWrapperRef} style={{ width: `${2950 * zoomLevel}px` }}>
          <div
            style={{
              width: '2950px',
              transform: zoomLevel !== 1 ? `scale(${zoomLevel})` : undefined,
              transformOrigin: 'top left',
            }}
            className="grid grid-cols-[1fr_310px_310px_310px_1fr] py-1"
          >
            {/* Left region round headers */}
            <div className="flex flex-row gap-6">
              {leftRounds.map((roundData) => {
                const dateRange = getRoundDateRange(roundData.slots, tournamentData);
                return (
                  <div key={roundData.round} className="text-center flex-shrink-0" style={{ width: '260px', minWidth: '260px' }}>
                    <div className="text-base font-bold text-fg/80">{roundData.name}</div>
                    {dateRange && <div className="text-sm text-fg/60 mt-0.5">{dateRange}</div>}
                  </div>
                );
              })}
            </div>
            {/* Final Four left */}
            <div className="text-center flex-shrink-0">
              <div className="text-base font-bold text-fg/80">Final Four</div>
              {f4DateRange && <div className="text-sm text-fg/60 mt-0.5">{f4DateRange}</div>}
            </div>
            {/* Championship */}
            <div className="text-center flex-shrink-0">
              <div className="text-base font-bold text-fg/80">Championship</div>
              {champDateRange && <div className="text-sm text-fg/60 mt-0.5">{champDateRange}</div>}
            </div>
            {/* Final Four right */}
            <div className="text-center flex-shrink-0">
              <div className="text-base font-bold text-fg/80">Final Four</div>
              {f4DateRange && <div className="text-sm text-fg/60 mt-0.5">{f4DateRange}</div>}
            </div>
            {/* Right region round headers (reversed) */}
            <div className="flex flex-row-reverse gap-6">
              {rightRounds.map((roundData) => {
                const dateRange = getRoundDateRange(roundData.slots, tournamentData);
                return (
                  <div key={roundData.round} className="text-center flex-shrink-0" style={{ width: '260px', minWidth: '260px' }}>
                    <div className="text-base font-bold text-fg/80">{roundData.name}</div>
                    {dateRange && <div className="text-sm text-fg/60 mt-0.5">{dateRange}</div>}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderSemifinalCell = (semi, id, large = false, hideHeader = false) => {
    const cellStyle = large ? { width: '380px', minWidth: '380px' } : colW;
    const matchWidth = large ? '340px' : '234px';
    return (
    <div id={id} className="row-span-2 flex flex-col flex-shrink-0" style={cellStyle}>
      {!hideHeader && (
      <div className="text-center mb-4">
        <div className={`${large ? 'text-2xl' : 'text-base'} font-bold text-fg/80`}>Final Four</div>
        {f4DateRange && (
          <div className={`${large ? 'text-lg' : 'text-sm'} text-fg/60 mt-0.5`}>{f4DateRange}</div>
        )}
      </div>
      )}
      <div className="flex-1 flex items-center justify-center px-3">
        <div style={{ width: matchWidth }}>
          <BracketMatchup
            slot={semi.slot}
            team1={teamsFor(semi.slot).team1}
            team2={teamsFor(semi.slot).team2}
            pickedTeamId={pickedFor(semi.slot)}
            result={resultFor(semi.slot)}
            onPick={(teamId) => onPick?.(semi.slot, teamId)}
            onDetailClick={() => onMatchupClick?.(semi.slot)}
            isReadOnly={isReadOnly}
            slotData={slotDataFor(semi.slot)}
          />
        </div>
      </div>
    </div>
  );};

  // Map region names to their DOM id for scrolling
  const getRegionId = (idx) => {
    if (idx < structure.regions.length) {
      return `region-${structure.regions[idx].name.toLowerCase().replace(/\s+/g, '-')}`;
    }
    return 'region-final-four';
  };

  // Scroll to a region in the bracket
  const scrollToRegion = useCallback((idx) => {
    const id = getRegionId(idx);
    const el = document.getElementById(id);
    const container = scrollContainerRef.current;
    if (el && container) {
      const containerRect = container.getBoundingClientRect();
      const rect = el.getBoundingClientRect();
      const elTop = rect.top - containerRect.top + container.scrollTop;
      const elLeft = rect.left - containerRect.left + container.scrollLeft;
      const isFinalFour = idx >= structure.regions.length;
      if (isFinalFour) {
        // Center the bracket both horizontally and vertically
        const centerX = container.scrollWidth / 2 - containerRect.width / 2;
        const centerY = container.scrollHeight / 2 - containerRect.height / 2;
        container.scrollTo({ top: Math.max(0, centerY), left: Math.max(0, centerX), behavior: 'smooth' });
      } else {
        const targetLeft = elLeft - (containerRect.width - rect.width) / 2;
        container.scrollTo({ top: Math.max(0, elTop - 12), left: Math.max(0, targetLeft), behavior: 'smooth' });
      }
    }
  }, [structure]);

  // Handle region tab click
  const handleDesktopTabClick = useCallback((idx) => {
    if (focusMode) {
      setDesktopTab(idx);
    } else {
      scrollToRegion(idx);
    }
  }, [focusMode, scrollToRegion]);

  // Toggle focus mode
  const toggleFocusMode = useCallback(() => {
    setFocusMode(prev => {
      if (!prev) {
        // Entering focus mode — default to first region
        setDesktopTab(0);
      } else {
        setDesktopTab(null);
      }
      return !prev;
    });
  }, []);

  // Zoom helpers
  const zoomIn = useCallback(() => {
    setZoomLevel(prev => {
      const idx = ZOOM_LEVELS.indexOf(prev);
      return idx < ZOOM_LEVELS.length - 1 ? ZOOM_LEVELS[idx + 1] : prev;
    });
  }, []);

  const zoomOut = useCallback(() => {
    setZoomLevel(prev => {
      const idx = ZOOM_LEVELS.indexOf(prev);
      return idx > 0 ? ZOOM_LEVELS[idx - 1] : prev;
    });
  }, []);

  const zoomReset = useCallback(() => setZoomLevel(1.0), []);

  // Keyboard shortcuts
  useBracketKeyboard({
    regionCount: structure.regions.length,
    onRegionSelect: handleDesktopTabClick,
    onFinalFour: () => handleDesktopTabClick(structure.regions.length),
    onToggleFocusMode: toggleFocusMode,
    onToggleMiniMap: () => setShowMiniMap(prev => !prev),
    onZoomIn: zoomIn,
    onZoomOut: zoomOut,
    onZoomReset: zoomReset,
  });

  // Desktop layout: 5-column grid
  const renderDesktop = () => {
    const champPick = pickedFor(champSlot);
    const champTeam = champPick
      ? (tournamentData?.teams?.[champPick] || { id: champPick })
      : null;

    // In focus mode, render only the selected region + FF + Championship
    if (focusMode && desktopTab !== null && desktopTab < structure.regions.length) {
      const regionData = structure.regions[desktopTab];
      // Determine side from layout
      const isRightSide = regionData === topRight || regionData === bottomRight;

      return (
        <div className="hidden md:block overflow-x-auto pb-4 animate-fade-in">
          <BracketRegion
            region={regionData}
            picks={picks}
            results={results}
            tournamentData={tournamentData}
            liveSlotData={liveSlotData}
            onPick={onPick}
            onMatchupClick={onMatchupClick}
            isReadOnly={isReadOnly}
            side={isRightSide ? 'right' : 'left'}
            showRoundHeaders
          />

          {/* Final Four + Championship after region in focus mode */}
          <div className="flex justify-center gap-6 mt-8">
            {renderSemifinalCell(leftSemi)}

            <div className="flex flex-col flex-shrink-0" style={colW}>
              <div className="text-center mb-4">
                <div className="text-base font-bold text-fg/80">Championship</div>
                {champDateRange && (
                  <div className="text-sm text-fg/60 mt-0.5">{champDateRange}</div>
                )}
              </div>
              <div className="flex-1 flex items-center justify-center px-3">
                <div className="flex flex-col items-center gap-4" style={{ width: '234px' }}>
                  <div className="w-full">
                    <BracketMatchup
                      slot={champSlot}
                      team1={teamsFor(champSlot).team1}
                      team2={teamsFor(champSlot).team2}
                      pickedTeamId={pickedFor(champSlot)}
                      result={resultFor(champSlot)}
                      onPick={(teamId) => onPick?.(champSlot, teamId)}
                      onDetailClick={() => onMatchupClick?.(champSlot)}
                      isReadOnly={isReadOnly}
                      slotData={slotDataFor(champSlot)}
                    />
                  </div>
                  {tiebreakerType === 'total_score' && (
                    <div className="w-full">
                      <TiebreakerInput
                        type={tiebreakerType}
                        value={tiebreakerValue}
                        onChange={onTiebreakerChange}
                        disabled={isReadOnly}
                        picks={picks}
                        tournamentData={tournamentData}
                      />
                    </div>
                  )}
                  <ChampionCard team={champTeam} />
                </div>
              </div>
            </div>

            {renderSemifinalCell(rightSemi)}
          </div>
        </div>
      );
    }

    // Full bracket view (scroll mode)
    return (
      <div ref={scrollContainerRef} className="hidden md:block overflow-x-auto overflow-y-auto pb-4" style={{ height: 'calc(100vh - 390px)' }}>
        {/* Zoom wrapper — scales the grid visually while adjusting scrollable area */}
        <div ref={zoomWrapperRef} style={{ width: `${2950 * zoomLevel}px` }}>
          <div
            ref={bracketGridRef}
            style={{
              width: '2950px',
              transform: zoomLevel !== 1 ? `scale(${zoomLevel})` : undefined,
              transformOrigin: 'top left',
            }}
            className="grid grid-cols-[1fr_310px_310px_310px_1fr] gap-y-6"
          >
          {/* === Row 1 === */}

          {/* Top-left region */}
          <div id={getRegionId(structure.regions.indexOf(topLeft))}>
            <BracketRegion
              region={topLeft}
              picks={picks}
              results={results}
              tournamentData={tournamentData}
              liveSlotData={liveSlotData}
              onPick={onPick}
              onMatchupClick={onMatchupClick}
              isReadOnly={isReadOnly}
              side="left"
            />
          </div>

          {/* Left semifinal (row-span-2, vertically centered) */}
          {renderSemifinalCell(leftSemi, 'region-final-four', false, true)}

          {/* Championship (row-span-2, dead center of the bracket) */}
          <div className="row-span-2 flex flex-col flex-shrink-0" style={colW}>
            <div className="flex-1 flex items-center justify-center px-3">
              <div className="flex flex-col items-center gap-4" style={{ width: '234px' }}>
                <div className="w-full">
                  <BracketMatchup
                    slot={champSlot}
                    team1={teamsFor(champSlot).team1}
                    team2={teamsFor(champSlot).team2}
                    pickedTeamId={pickedFor(champSlot)}
                    result={resultFor(champSlot)}
                    onPick={(teamId) => onPick?.(champSlot, teamId)}
                    onDetailClick={() => onMatchupClick?.(champSlot)}
                    isReadOnly={isReadOnly}
                  />
                </div>

                {/* Tiebreaker + Champion */}
                {tiebreakerType === 'total_score' && (
                  <div className="w-full">
                    <TiebreakerInput
                      type={tiebreakerType}
                      value={tiebreakerValue}
                      onChange={onTiebreakerChange}
                      disabled={isReadOnly}
                      picks={picks}
                      tournamentData={tournamentData}
                    />
                  </div>
                )}
                <ChampionCard team={champTeam} />
              </div>
            </div>
          </div>

          {/* Right semifinal (row-span-2, vertically centered) */}
          {renderSemifinalCell(rightSemi, undefined, false, true)}

          {/* Top-right region */}
          <div id={getRegionId(structure.regions.indexOf(topRight))}>
            <BracketRegion
              region={topRight}
              picks={picks}
              results={results}
              tournamentData={tournamentData}
              liveSlotData={liveSlotData}
              onPick={onPick}
              onMatchupClick={onMatchupClick}
              isReadOnly={isReadOnly}
              side="right"
            />
          </div>

          {/* === Row 2 === */}

          {/* Bottom-left region */}
          <div id={getRegionId(structure.regions.indexOf(bottomLeft))}>
            <BracketRegion
              region={bottomLeft}
              picks={picks}
              results={results}
              tournamentData={tournamentData}
              liveSlotData={liveSlotData}
              onPick={onPick}
              onMatchupClick={onMatchupClick}
              isReadOnly={isReadOnly}
              side="left"
            />
          </div>

          {/* Center 3 cells are row-span-2 from Row 1, so they auto-span here */}

          {/* Bottom-right region */}
          <div id={getRegionId(structure.regions.indexOf(bottomRight))}>
            <BracketRegion
              region={bottomRight}
              picks={picks}
              results={results}
              tournamentData={tournamentData}
              liveSlotData={liveSlotData}
              onPick={onPick}
              onMatchupClick={onMatchupClick}
              isReadOnly={isReadOnly}
              side="right"
            />
          </div>
        </div>
        </div>
      </div>
    );
  };

  // Desktop nav bar with region tabs, progress, focus mode, zoom
  const renderDesktopNav = () => (
    <div className="hidden md:flex items-center gap-2 sticky top-[64px] z-20 bg-surface/95 backdrop-blur-sm py-1.5 px-1 mb-0 rounded-lg border border-fg/5" role="toolbar" aria-label="Bracket navigation">
      {/* Region tabs with progress */}
      <div className="flex gap-1 flex-1" role="tablist" aria-label="Bracket regions">
        {regionTabs.map((tab, idx) => {
          const isActive = focusMode ? desktopTab === idx : false;
          const count = regionProgress.counts[idx];
          const total = regionProgress.totals[idx];
          const isComplete = regionCompletion[idx];

          return (
            <button
              key={tab}
              role="tab"
              aria-selected={isActive}
              aria-label={`${tab} region, ${count} of ${total} picks${isComplete ? ', complete' : ''}`}
              onClick={() => handleDesktopTabClick(idx)}
              className={`px-3 py-1.5 rounded-md text-sm font-medium whitespace-nowrap transition-all flex items-center gap-2 border ${
                isActive
                  ? 'bg-gradient-to-r from-violet-500 to-indigo-600 text-white shadow-sm border-transparent'
                  : 'text-fg/90 hover:text-fg hover:bg-fg/10 hover:border-fg/25 hover:shadow-sm active:scale-[0.97] border-fg/15 bg-fg/[0.05]'
              }`}
            >
              <span className="text-xs text-fg/30 font-mono w-3">{idx + 1}</span>
              {tab}
              {/* Progress indicator */}
              <span className={`text-xs font-mono px-1.5 py-0.5 rounded ${
                isComplete
                  ? 'bg-emerald-500/20 text-emerald-400'
                  : isActive
                    ? 'bg-white/20 text-white/80'
                    : 'bg-fg/8 text-fg/60'
              }`}>
                {count}/{total}
              </span>
            </button>
          );
        })}
      </div>

      {/* Controls */}
      <div className="flex items-center gap-1 border-l border-fg/10 pl-2">
        {/* Focus mode toggle */}
        <button
          onClick={toggleFocusMode}
          className={`p-2 rounded-md transition-colors ${
            focusMode ? 'bg-violet-500/20 text-violet-400' : 'text-fg/60 hover:text-fg/90 hover:bg-fg/10 bg-fg/[0.04]'
          }`}
          title={focusMode ? 'Exit focus mode (Esc)' : 'Focus mode (Esc)'}
          aria-label={focusMode ? 'Exit focus mode' : 'Enter focus mode'}
          aria-pressed={focusMode}
        >
          <Focus className="w-[18px] h-[18px]" aria-hidden="true" />
        </button>

        {/* Zoom controls */}
        {!focusMode && (
          <>
            <button
              onClick={zoomOut}
              className="p-2 rounded-md text-fg/60 hover:text-fg/90 hover:bg-fg/10 bg-fg/[0.04] transition-colors disabled:opacity-30"
              title="Zoom out (Cmd -)"
              aria-label="Zoom out"
              disabled={zoomLevel <= ZOOM_LEVELS[0]}
            >
              <ZoomOut className="w-[18px] h-[18px]" aria-hidden="true" />
            </button>
            <button
              onClick={zoomReset}
              className="px-2 py-1 rounded-md text-sm font-mono text-fg/60 hover:text-fg/90 hover:bg-fg/10 bg-fg/[0.04] transition-colors min-w-[42px] text-center"
              title="Reset zoom (Cmd 0)"
              aria-label={`Zoom level ${Math.round(zoomLevel * 100)}%, click to reset`}
            >
              {Math.round(zoomLevel * 100)}%
            </button>
            <button
              onClick={zoomIn}
              className="p-2 rounded-md text-fg/60 hover:text-fg/90 hover:bg-fg/10 bg-fg/[0.04] transition-colors disabled:opacity-30"
              title="Zoom in (Cmd +)"
              aria-label="Zoom in"
              disabled={zoomLevel >= ZOOM_LEVELS[ZOOM_LEVELS.length - 1]}
            >
              <ZoomIn className="w-[18px] h-[18px]" aria-hidden="true" />
            </button>
          </>
        )}

        {/* Keyboard shortcuts help */}
        <div className="relative">
          <button
            onClick={() => setShowShortcuts(prev => !prev)}
            className={`p-2 rounded-md transition-colors ${
              showShortcuts ? 'bg-fg/10 text-fg/70' : 'text-fg/50 hover:text-fg/80 hover:bg-fg/10 bg-fg/[0.04]'
            }`}
            title="Keyboard shortcuts"
            aria-label="Keyboard shortcuts"
            aria-expanded={showShortcuts}
          >
            <Keyboard className="w-[18px] h-[18px]" aria-hidden="true" />
          </button>
          {showShortcuts && (
            <div className="absolute top-full right-0 mt-2 w-56 bg-elevated border border-fg/10 rounded-lg shadow-xl p-3 text-xs z-50 animate-fade-in" role="tooltip" aria-label="Keyboard shortcuts">
              <div className="font-bold text-fg/70 mb-2">Keyboard Shortcuts</div>
              <div className="space-y-1 text-fg/50">
                <div className="flex justify-between"><span>Jump to region</span><kbd className="bg-fg/10 px-1.5 py-0.5 rounded text-fg/60">1-4</kbd></div>
                <div className="flex justify-between"><span>Final Four</span><kbd className="bg-fg/10 px-1.5 py-0.5 rounded text-fg/60">5 / F</kbd></div>
                <div className="flex justify-between"><span>Focus mode</span><kbd className="bg-fg/10 px-1.5 py-0.5 rounded text-fg/60">Esc</kbd></div>
                <div className="flex justify-between"><span>Mini-map</span><kbd className="bg-fg/10 px-1.5 py-0.5 rounded text-fg/60">M</kbd></div>
                <div className="flex justify-between"><span>Zoom in/out</span><kbd className="bg-fg/10 px-1.5 py-0.5 rounded text-fg/60">Cmd +/-</kbd></div>
                <div className="flex justify-between"><span>Reset zoom</span><kbd className="bg-fg/10 px-1.5 py-0.5 rounded text-fg/60">Cmd 0</kbd></div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  // Mobile layout: tabbed region view
  const renderMobile = () => (
    <div className="md:hidden">
      {/* Region tabs */}
      <div ref={regionTabsRef} className="sticky z-20 bg-surface flex gap-1 overflow-x-auto pb-2 pt-2 -mx-3 px-3" style={{ top: 'var(--navbar-height, 65px)' }} role="tablist" aria-label="Bracket regions">
        {regionTabs.map((tab, idx) => (
          <button
            key={tab}
            role="tab"
            aria-selected={mobileTab === idx}
            aria-label={`${tab} region${regionCompletion[idx] ? ', complete' : ''}`}
            onClick={() => setMobileTab(idx)}
            className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors flex items-center gap-1.5 ${
              mobileTab === idx
                ? 'bg-gradient-to-r from-violet-500 to-indigo-600 text-white shadow-sm'
                : 'bg-fg/10 text-fg/70 border border-fg/10 hover:bg-fg/15'
            }`}
          >
            {tab}
            {regionCompletion[idx] && (
              <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full flex-shrink-0" aria-hidden="true" />
            )}
          </button>
        ))}
      </div>

      {/* Active region content */}
      <div key={mobileTab} className="pb-4 animate-fade-in">
        <MobileBracketNav
          region={enhancedRegions[mobileTab]}
          picks={picks}
          results={results}
          tournamentData={tournamentData}
          liveSlotData={liveSlotData}
          onPick={onPick}
          onMatchupClick={onMatchupClick}
          isReadOnly={isReadOnly}
          champTeam={(() => {
            const champPick = pickedFor(structure.finalFour.championship);
            return champPick ? (tournamentData?.teams?.[champPick] || { id: champPick }) : null;
          })()}
          tiebreakerType={tiebreakerType}
          tiebreakerValue={tiebreakerValue}
          onTiebreakerChange={onTiebreakerChange}
        />
      </div>
    </div>
  );

  return (
    <div>
      {renderDesktopNav()}
      {renderStickyRoundHeaders()}
      {renderDesktop()}

      {/* Mini-map (desktop only, scroll mode only) */}
      {!focusMode && (
        <BracketMiniMap
          regions={structure.regions}
          regionCompletion={regionCompletion}
          scrollContainerRef={scrollContainerRef}
          onRegionClick={handleDesktopTabClick}
          visible={showMiniMap}
          onToggle={() => setShowMiniMap(prev => !prev)}
        />
      )}

      {/* Mobile: full bracket view toggle */}
      {mobileFullView ? (
        <div className="md:hidden">
          {/* Sticky region tabs for full bracket view */}
          <div className="sticky z-20 bg-surface -mx-3 px-3 pt-2 pb-2" style={{ top: 'var(--navbar-height, 65px)' }}>
            <div className="flex items-center gap-1">
              {regionTabs.map((tab, idx) => (
                <button
                  key={tab}
                  onClick={() => {
                    const regionEl = document.getElementById(`mobile-full-region-${idx}`);
                    const scrollContainer = regionEl?.closest('.overflow-x-auto');
                    if (regionEl && scrollContainer) {
                      const navbarH = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--navbar-height')) || 65;
                      const tabBarH = 80;
                      const rect = regionEl.getBoundingClientRect();
                      const scrollY = rect.top + window.scrollY - navbarH - tabBarH;
                      window.scrollTo({ top: Math.max(0, scrollY), behavior: 'smooth' });
                      const isRightSide = regionEl === document.getElementById(`mobile-full-region-${structure.regions.indexOf(topRight)}`) ||
                                          regionEl === document.getElementById(`mobile-full-region-${structure.regions.indexOf(bottomRight)}`);
                      if (isRightSide) {
                        scrollContainer.scrollTo({ left: scrollContainer.scrollWidth, behavior: 'smooth' });
                      } else {
                        scrollContainer.scrollTo({ left: 0, behavior: 'smooth' });
                      }
                    }
                  }}
                  className="px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors flex items-center gap-1.5 bg-fg/10 text-fg/70 border border-fg/10 hover:bg-fg/15 active:scale-95"
                >
                  {tab}
                </button>
              ))}
              <button
                onClick={() => setMobileFullView(false)}
                className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-fg/10 text-fg/70 text-xs font-semibold border border-fg/10 active:scale-95 transition-transform whitespace-nowrap"
                aria-label="Switch to mobile view"
              >
                <Smartphone className="w-3.5 h-3.5" aria-hidden="true" />
                Mobile View
              </button>
            </div>
            {/* Inline zoom controls */}
            <div className="flex items-center gap-1.5 mt-1.5">
              <button
                onClick={() => setMobileScale(s => Math.max(0.3, +(s - 0.1).toFixed(2)))}
                className="flex items-center justify-center w-8 h-8 rounded-md bg-fg/10 border border-fg/10 text-fg/60 active:scale-90 transition-transform disabled:opacity-30"
                disabled={mobileScale <= 0.3}
                aria-label="Zoom out"
              >
                <ZoomOut className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
              <div className="flex-1 relative h-1.5 bg-fg/10 rounded-full overflow-hidden">
                <div
                  className="absolute inset-y-0 left-0 bg-violet-500/60 rounded-full transition-all"
                  style={{ width: `${((mobileScale - 0.3) / 0.7) * 100}%` }}
                />
              </div>
              <button
                onClick={() => setMobileScale(s => Math.min(1.0, +(s + 0.1).toFixed(2)))}
                className="flex items-center justify-center w-8 h-8 rounded-md bg-fg/10 border border-fg/10 text-fg/60 active:scale-90 transition-transform disabled:opacity-30"
                disabled={mobileScale >= 1.0}
                aria-label="Zoom in"
              >
                <ZoomIn className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
              <button
                onClick={() => setMobileScale(0.55)}
                className="flex items-center justify-center h-8 px-2 rounded-md bg-fg/10 border border-fg/10 text-fg/50 text-xs font-mono active:scale-90 transition-transform"
                aria-label={`Zoom level ${Math.round(mobileScale * 100)}%, click to reset`}
              >
                {Math.round(mobileScale * 100)}%
              </button>
            </div>
          </div>
          {(() => {
            // Shared sizing for mobile full bracket — single source of truth
            const mCellW = 380;
            const mGridW = 4800;
            const mCenterCol = `${mCellW}px`;
            const mMatchW = `${mCellW - 40}px`;
            const mCenterStyle = { width: mCenterCol, minWidth: mCenterCol };
            return (
          <div className="overflow-x-auto overflow-y-hidden -mx-3 pb-40" style={{ WebkitOverflowScrolling: 'touch' }}>
            <div ref={(el) => {
              mobileWrapperRef.current = el;
              if (el) {
                const grid = el.firstElementChild;
                if (grid) {
                  requestAnimationFrame(() => {
                    el.style.height = `${grid.offsetHeight * mobileScale}px`;
                    el.style.width = `${mGridW * mobileScale}px`;
                  });
                }
              }
            }}>
              <div
                ref={mobileGridRef}
                className={`grid gap-y-6 pt-4`}
                style={{ width: `${mGridW}px`, gridTemplateColumns: `1fr ${mCenterCol} ${mCenterCol} ${mCenterCol} 1fr`, transform: `scale(${mobileScale})`, transformOrigin: 'top left' }}
              >
                {/* Row 1 */}
                <div id={`mobile-full-region-${structure.regions.indexOf(topLeft)}`}>
                  <BracketRegion region={topLeft} picks={picks} results={results} tournamentData={tournamentData} liveSlotData={liveSlotData} onPick={onPick} onMatchupClick={onMatchupClick} isReadOnly={isReadOnly} side="left" showRoundHeaders cellWidth={mCellW} largeHeaders />
                </div>
                {renderSemifinalCell(leftSemi, undefined, true)}
                <div className="row-span-2 flex flex-col flex-shrink-0" style={mCenterStyle}>
                  <div className="text-center mb-4">
                    <div className="text-2xl font-bold text-fg/80">Championship</div>
                    {champDateRange && (
                      <div className="text-lg text-fg/60 mt-0.5">{champDateRange}</div>
                    )}
                  </div>
                  <div className="flex-1 flex items-center justify-center px-3">
                    <div className="flex flex-col items-center gap-4" style={{ width: mMatchW }}>
                      <div className="w-full">
                        <BracketMatchup
                          slot={champSlot}
                          team1={teamsFor(champSlot).team1}
                          team2={teamsFor(champSlot).team2}
                          pickedTeamId={pickedFor(champSlot)}
                          result={resultFor(champSlot)}
                          onPick={(teamId) => onPick?.(champSlot, teamId)}
                          onDetailClick={() => onMatchupClick?.(champSlot)}
                          isReadOnly={isReadOnly}
                        />
                      </div>
                      {pickedFor(champSlot) && (
                        <ChampionCard team={tournamentData?.teams?.[pickedFor(champSlot)]} />
                      )}
                    </div>
                  </div>
                </div>
                {renderSemifinalCell(rightSemi, undefined, true)}
                <div id={`mobile-full-region-${structure.regions.indexOf(topRight)}`}>
                  <BracketRegion region={topRight} picks={picks} results={results} tournamentData={tournamentData} liveSlotData={liveSlotData} onPick={onPick} onMatchupClick={onMatchupClick} isReadOnly={isReadOnly} side="right" showRoundHeaders cellWidth={mCellW} largeHeaders />
                </div>
                {/* Row 2 — cols 2-4 already occupied by row-span-2 items above */}
                <div id={`mobile-full-region-${structure.regions.indexOf(bottomLeft)}`}>
                  <BracketRegion region={bottomLeft} picks={picks} results={results} tournamentData={tournamentData} liveSlotData={liveSlotData} onPick={onPick} onMatchupClick={onMatchupClick} isReadOnly={isReadOnly} side="left" cellWidth={mCellW} />
                </div>
                <div id={`mobile-full-region-${structure.regions.indexOf(bottomRight)}`}>
                  <BracketRegion region={bottomRight} picks={picks} results={results} tournamentData={tournamentData} liveSlotData={liveSlotData} onPick={onPick} onMatchupClick={onMatchupClick} isReadOnly={isReadOnly} side="right" cellWidth={mCellW} />
                </div>
              </div>
            </div>
          </div>
            );
          })()}
        </div>
      ) : (
        <>
          {/* View full bracket button — mobile only, above region tabs */}
          <div className="md:hidden flex justify-end -mx-3 px-3 pb-1 bg-surface">
            <button
              onClick={() => setMobileFullView(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-fg/10 text-fg/70 text-xs font-semibold border border-fg/10 active:scale-95 transition-transform"
            >
              <Maximize2 className="w-3.5 h-3.5" />
              View Full Bracket
            </button>
          </div>
          {renderMobile()}
        </>
      )}
    </div>
  );
}
