import { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import { getBracketStructure, getMatchupTeams, getRegionForSlot, DEFAULT_REGIONS } from '../../utils/bracketSlots';
import BracketRegion, { getRoundDateRange } from './BracketRegion';
import BracketMatchup from './BracketMatchup';
import BracketMiniMap from './BracketMiniMap';
import MobileBracketNav from './MobileBracketNav';
import TiebreakerInput from './TiebreakerInput';
import ChampionCard from './ChampionCard';
import useBracketKeyboard from '../../hooks/useBracketKeyboard';
import { Focus, ZoomIn, ZoomOut, RotateCcw, Keyboard } from 'lucide-react';

const ZOOM_LEVELS = [0.5, 0.75, 1.0, 1.25];

export default function BracketView({
  tournamentData,
  picks,
  results,
  onPick,
  onMatchupClick,
  isReadOnly,
  tiebreakerType,
  tiebreakerValue,
  onTiebreakerChange,
}) {
  const [mobileTab, setMobileTab] = useState(0);
  const [desktopTab, setDesktopTab] = useState(null); // null = show all (scroll mode)
  const [focusMode, setFocusMode] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(1.0);
  const [showMiniMap, setShowMiniMap] = useState(true);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const scrollContainerRef = useRef(null);
  const zoomWrapperRef = useRef(null);
  const bracketGridRef = useRef(null);
  // Use data-driven regions from tournament data, fall back to defaults
  const regions = tournamentData?.regions?.length ? tournamentData.regions : DEFAULT_REGIONS;
  const structure = getBracketStructure(regions);

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
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
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
    const { topLeft, bottomLeft, topRight, bottomRight } = desktopLayout;
    const { semifinalRegions, championship: champSlot } = structure.finalFour;
    const leftSemi = semifinalRegions[0];
    const rightSemi = semifinalRegions[1];

    const champPick = pickedFor(champSlot);
    const champTeam = champPick
      ? (tournamentData?.teams?.[champPick] || { id: champPick })
      : null;

    const colW = { width: '310px', minWidth: '310px' };

    const f4DateRange = getRoundDateRange(
      semifinalRegions.map(s => s.slot),
      tournamentData,
    );
    const champDateRange = getRoundDateRange([champSlot], tournamentData);

    const renderSemifinalCell = (semi, id) => (
      <div id={id} className="row-span-2 flex flex-col flex-shrink-0" style={colW}>
        <div className="text-center mb-4">
          <div className="text-base font-bold text-fg/80">Final Four</div>
          {f4DateRange && (
            <div className="text-sm text-fg/60 mt-0.5">{f4DateRange}</div>
          )}
        </div>
        <div className="flex-1 flex items-center justify-center px-3">
          <div style={{ width: '234px' }}>
            <BracketMatchup
              slot={semi.slot}
              team1={teamsFor(semi.slot).team1}
              team2={teamsFor(semi.slot).team2}
              pickedTeamId={pickedFor(semi.slot)}
              result={resultFor(semi.slot)}
              onPick={(teamId) => onPick?.(semi.slot, teamId)}
              onDetailClick={() => onMatchupClick?.(semi.slot)}
              isReadOnly={isReadOnly}
            />
          </div>
        </div>
      </div>
    );

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
      <div ref={scrollContainerRef} className="hidden md:block overflow-x-auto pb-4">
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
              onPick={onPick}
              onMatchupClick={onMatchupClick}
              isReadOnly={isReadOnly}
              side="left"
              showRoundHeaders
            />
          </div>

          {/* Left semifinal (row-span-2, vertically centered) */}
          {renderSemifinalCell(leftSemi, 'region-final-four')}

          {/* Championship (row-span-2, dead center of the bracket) */}
          <div className="row-span-2 flex flex-col flex-shrink-0" style={colW}>
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
          {renderSemifinalCell(rightSemi)}

          {/* Top-right region */}
          <div id={getRegionId(structure.regions.indexOf(topRight))}>
            <BracketRegion
              region={topRight}
              picks={picks}
              results={results}
              tournamentData={tournamentData}
              onPick={onPick}
              onMatchupClick={onMatchupClick}
              isReadOnly={isReadOnly}
              side="right"
              showRoundHeaders
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
    <div className="hidden md:flex items-center gap-2 sticky top-0 z-20 bg-surface/95 backdrop-blur-sm py-2 px-1 mb-4 rounded-lg border border-fg/5">
      {/* Region tabs with progress */}
      <div className="flex gap-1 flex-1">
        {regionTabs.map((tab, idx) => {
          const isActive = focusMode ? desktopTab === idx : false;
          const count = regionProgress.counts[idx];
          const total = regionProgress.totals[idx];
          const isComplete = regionCompletion[idx];

          return (
            <button
              key={tab}
              onClick={() => handleDesktopTabClick(idx)}
              className={`px-3 py-1.5 rounded-md text-sm font-medium whitespace-nowrap transition-all flex items-center gap-2 ${
                isActive
                  ? 'bg-gradient-to-r from-violet-500 to-indigo-600 text-white shadow-sm'
                  : 'text-fg/60 hover:text-fg hover:bg-fg/5'
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
                    : 'bg-fg/5 text-fg/40'
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
          className={`p-1.5 rounded-md transition-colors ${
            focusMode ? 'bg-violet-500/20 text-violet-400' : 'text-fg/40 hover:text-fg/70 hover:bg-fg/5'
          }`}
          title={focusMode ? 'Exit focus mode (Esc)' : 'Focus mode (Esc)'}
        >
          <Focus className="w-4 h-4" />
        </button>

        {/* Zoom controls */}
        {!focusMode && (
          <>
            <button
              onClick={zoomOut}
              className="p-1.5 rounded-md text-fg/40 hover:text-fg/70 hover:bg-fg/5 transition-colors"
              title="Zoom out (Cmd -)"
              disabled={zoomLevel <= ZOOM_LEVELS[0]}
            >
              <ZoomOut className="w-4 h-4" />
            </button>
            <button
              onClick={zoomReset}
              className="px-1.5 py-0.5 rounded-md text-xs font-mono text-fg/40 hover:text-fg/70 hover:bg-fg/5 transition-colors min-w-[36px] text-center"
              title="Reset zoom (Cmd 0)"
            >
              {Math.round(zoomLevel * 100)}%
            </button>
            <button
              onClick={zoomIn}
              className="p-1.5 rounded-md text-fg/40 hover:text-fg/70 hover:bg-fg/5 transition-colors"
              title="Zoom in (Cmd +)"
              disabled={zoomLevel >= ZOOM_LEVELS[ZOOM_LEVELS.length - 1]}
            >
              <ZoomIn className="w-4 h-4" />
            </button>
          </>
        )}

        {/* Keyboard shortcuts help */}
        <div className="relative">
          <button
            onClick={() => setShowShortcuts(prev => !prev)}
            className={`p-1.5 rounded-md transition-colors ${
              showShortcuts ? 'bg-fg/10 text-fg/70' : 'text-fg/30 hover:text-fg/50 hover:bg-fg/5'
            }`}
            title="Keyboard shortcuts"
          >
            <Keyboard className="w-4 h-4" />
          </button>
          {showShortcuts && (
            <div className="absolute top-full right-0 mt-2 w-56 bg-elevated border border-fg/10 rounded-lg shadow-xl p-3 text-xs z-50 animate-fade-in">
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
      <div className="sticky top-[66px] z-20 bg-surface/95 backdrop-blur-sm flex gap-1 mb-4 overflow-x-auto pb-2 pt-2 -mx-1 px-1">
        {regionTabs.map((tab, idx) => (
          <button
            key={tab}
            onClick={() => setMobileTab(idx)}
            className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors flex items-center gap-1.5 ${
              mobileTab === idx
                ? 'bg-gradient-to-r from-violet-500 to-indigo-600 text-white shadow-sm'
                : 'bg-fg/5 text-fg/50 border border-transparent hover:bg-fg/10'
            }`}
          >
            {tab}
            {regionCompletion[idx] && (
              <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full flex-shrink-0" />
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

      {renderMobile()}
    </div>
  );
}
