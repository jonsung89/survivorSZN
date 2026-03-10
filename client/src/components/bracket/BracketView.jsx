import { useState, useMemo } from 'react';
import { getBracketStructure, getMatchupTeams } from '../../utils/bracketSlots';
import BracketRegion from './BracketRegion';
import BracketFinalFour from './BracketFinalFour';
import BracketMatchup from './BracketMatchup';
import MobileBracketNav from './MobileBracketNav';
import { Trophy } from 'lucide-react';

export default function BracketView({
  tournamentData,
  picks,
  results,
  onPick,
  onMatchupClick,
  isReadOnly,
}) {
  const [mobileTab, setMobileTab] = useState(0);
  const structure = getBracketStructure();

  // Derive region tabs from structure (data-driven)
  const regionTabs = useMemo(
    () => [...structure.regions.map(r => r.name), 'Final Four'],
    [structure]
  );

  // Desktop layout positions derived from Final Four semifinal pairings.
  // Paired regions share the same side so the visual flow is correct:
  //   Left semifinal's regions → left column (top + bottom)
  //   Right semifinal's regions → right column (top + bottom)
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

  // Compute per-region completion for tab dots
  const regionCompletion = useMemo(() => {
    if (!picks) return Array(structure.regions.length + 1).fill(false);

    const regionCount = structure.regions.length;
    const counts = new Array(regionCount + 1).fill(0);
    const totals = [...structure.regions.map(() => 15), 3]; // 15 per region, 3 for F4

    // Count picks per region (slots 1–60)
    for (let slot = 1; slot <= 60; slot++) {
      if (picks[slot] || picks[String(slot)]) {
        const regionIdx = Math.floor((slot - 1) / 15);
        if (regionIdx >= 0 && regionIdx < regionCount) counts[regionIdx]++;
      }
    }
    // Final Four + Championship
    for (const slot of [...structure.finalFour.semifinals, structure.finalFour.championship]) {
      if (picks[slot] || picks[String(slot)]) counts[regionCount]++;
    }

    return counts.map((c, i) => c >= totals[i]);
  }, [picks, structure]);

  // Slot helpers for desktop Final Four rendering
  const teamsFor = (slot) => getMatchupTeams(slot, picks, tournamentData);
  const resultFor = (slot) => results?.[slot] || results?.[String(slot)] || null;
  const pickedFor = (slot) => picks?.[slot] || picks?.[String(slot)] || null;

  // Desktop layout: 5-column grid — regions on the outside, Final Four cells in the center
  // The semifinal cells align directly with the E8 (final round) of their feeder regions.
  //
  // Grid columns: [Left Region] [Left Semi] [Championship] [Right Semi] [Right Region]
  // Row 1:         top-left       ↕ row-span   ↕ row-span    ↕ row-span   top-right
  // Row 2:         bottom-left                                             bottom-right
  const renderDesktop = () => {
    const { topLeft, bottomLeft, topRight, bottomRight } = desktopLayout;
    const { semifinalRegions, championship: champSlot } = structure.finalFour;
    const leftSemi = semifinalRegions[0];
    const rightSemi = semifinalRegions[1];

    const champPick = pickedFor(champSlot);
    const champTeam = champPick
      ? (tournamentData?.teams?.[champPick] || { id: champPick })
      : null;

    const renderSemifinalCell = (semi) => (
      <div className="row-span-2 flex items-center justify-center px-3">
        <div>
          <div className="text-sm text-fg/40 text-center mb-1">
            {semi.regions.join(' vs ')}
          </div>
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
    );

    return (
      <div className="hidden lg:block overflow-x-auto pb-4">
        <div style={{ minWidth: '2100px' }} className="grid grid-cols-[1fr_auto_auto_auto_1fr] gap-y-6">
          {/* === Row 1 === */}

          {/* Top-left region */}
          <div>
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

          {/* Left semifinal (row-span-2, vertically centered with both feeder regions) */}
          {renderSemifinalCell(leftSemi)}

          {/* Championship + Champion (row-span-2, dead center of the bracket) */}
          <div className="row-span-2 flex items-center justify-center px-3">
            <div className="flex flex-col items-center gap-4">
              <h3 className="text-base font-display font-bold text-fg/50 uppercase tracking-wider">
                Final Four
              </h3>
              <div>
                <div className="text-sm text-amber-400 font-bold text-center mb-1 flex items-center justify-center gap-1 uppercase tracking-wider">
                  <Trophy className="w-4 h-4 text-amber-400" />
                  Championship
                </div>
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

              {/* Champion Display */}
              {champTeam && (
                <div className="text-center animate-in">
                  <div className="text-sm text-amber-400 font-bold uppercase tracking-wider mb-2">Champion</div>
                  <div className="flex flex-col items-center gap-2 px-6 py-4 rounded-xl bg-amber-400/10 border border-amber-400/20 shadow-[0_0_20px_rgba(251,191,36,0.15)] animate-champion-glow">
                    <Trophy className="w-6 h-6 text-amber-400" />
                    {champTeam.logo && (
                      <img src={champTeam.logo} alt="" className="w-14 h-14 object-contain" />
                    )}
                    <span className="text-lg font-display font-bold text-fg">
                      {champTeam.name || champTeam.abbreviation || 'Champion'}
                    </span>
                    {champTeam.seed && (
                      <span className="text-sm text-fg/40">#{champTeam.seed} seed</span>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Right semifinal (row-span-2, vertically centered with both feeder regions) */}
          {renderSemifinalCell(rightSemi)}

          {/* Top-right region */}
          <div>
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
          <div>
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
          <div>
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
    );
  };

  // Mobile layout: tabbed region view (uses BracketFinalFour for stacked vertical display)
  const renderMobile = () => (
    <div className="lg:hidden">
      {/* Region tabs */}
      <div className="sticky top-[66px] z-20 bg-surface/95 backdrop-blur-sm flex gap-1 mb-4 overflow-x-auto pb-2 pt-2 -mx-1 px-1">
        {regionTabs.map((tab, idx) => (
          <button
            key={tab}
            onClick={() => setMobileTab(idx)}
            className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors flex items-center gap-1.5 ${
              mobileTab === idx
                ? 'bg-violet-600/20 text-violet-400 border border-violet-500/30'
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
        {mobileTab < structure.regions.length ? (
          <MobileBracketNav
            region={structure.regions[mobileTab]}
            picks={picks}
            results={results}
            tournamentData={tournamentData}
            onPick={onPick}
            onMatchupClick={onMatchupClick}
            isReadOnly={isReadOnly}
          />
        ) : (
          <BracketFinalFour
            picks={picks}
            results={results}
            tournamentData={tournamentData}
            onPick={onPick}
            onMatchupClick={onMatchupClick}
            isReadOnly={isReadOnly}
            finalFour={structure.finalFour}
          />
        )}
      </div>
    </div>
  );

  return (
    <div>
      {renderDesktop()}
      {renderMobile()}
    </div>
  );
}
