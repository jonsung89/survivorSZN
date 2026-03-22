import { useState, useEffect, useRef } from 'react';
import { X, Loader2, Clock } from 'lucide-react';
import { bracketAPI, trackingAPI } from '../../api';
import { useTheme } from '../../context/ThemeContext';
import useFocusTrap from '../../hooks/useFocusTrap';
import TeamAnalysisCard from './TeamAnalysisCard';
import MatchupComparisonTab from './MatchupComparisonTab';

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

function getThemeLogo(logoUrl, isDark) {
  if (!logoUrl) return logoUrl;
  return isDark ? logoUrl.replace('/500/', '/500-dark/') : logoUrl;
}

export default function MatchupDetailDialog({
  slot,
  team1Info,
  team2Info,
  team1Possible,  // { team1, team2 } from child slot when team1 is TBD
  team2Possible,  // { team1, team2 } from child slot when team2 is TBD
  season,
  prediction,
  onPick,
  onClose,
  onTabSwitch,
  isReadOnly,
}) {
  const { isDark } = useTheme();
  const [team1Data, setTeam1Data] = useState(null);
  const [team2Data, setTeam2Data] = useState(null);
  const [loading, setLoading] = useState(true);
  // Tabs: 0 = team1, 1 = matchup (only when both teams known), 2 = team2
  const bothTeamsKnown = !!(team1Info && team2Info);
  // Default to matchup tab when both teams are known, otherwise show the known team
  const [activeTab, setActiveTab] = useState(bothTeamsKnown ? 1 : (!team1Info ? 2 : 0));
  const [scrolled, setScrolled] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const scrollRef = useRef(null);
  const dialogRef = useRef(null);
  useFocusTrap(dialogRef, true);

  useEffect(() => {
    trackingAPI.event('matchup_detail_dialog_open', { slot, matchup: `${team1Info?.name || 'TBD'} vs ${team2Info?.name || 'TBD'}` });
  }, []);

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
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, [team1Info?.id, team2Info?.id, season]);

  useEffect(() => {
    const handleKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  // Track mobile vs desktop for hero collapse behavior
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  // Scroll to top when switching tabs
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 0;
      setScrolled(false);
    }
  }, [activeTab]);

  const handleScroll = () => {
    if (scrollRef.current) {
      setScrolled(scrollRef.current.scrollTop > 100);
    }
  };

  const handlePick = (teamId) => {
    const pickedTeam = teamId === team1Info?.id ? team1Info : team2Info;
    trackingAPI.event('matchup_pick', { slot, team: pickedTeam?.name, seed: pickedTeam?.seed, matchup: `${team1Info?.name || 'TBD'} vs ${team2Info?.name || 'TBD'}` });
    onPick?.(teamId);
    onClose();
  };

  const isMatchupTab = activeTab === 1 && bothTeamsKnown;
  const activeTeamInfo = isMatchupTab ? null : (activeTab === 0 ? team1Info : team2Info);
  const activeTeamData = isMatchupTab ? null : (activeTab === 0 ? team1Data : team2Data);
  const activePossible = isMatchupTab ? null : (activeTab === 0 ? team1Possible : team2Possible);
  const isActiveTBD = !isMatchupTab && !activeTeamInfo;
  const teamColor = isMatchupTab ? '#333' : (activeTeamInfo?.color || '#6366f1');
  const whiteLogo = isMatchupTab ? null : getDarkBgLogo(activeTeamInfo?.logo);
  const allPlayers = activeTeamData?.keyPlayers || [];
  const starPlayer = allPlayers[0];
  // On desktop, show up to 2 extra players as headshots (limit to avoid overlapping team name)
  const otherPlayers = allPlayers.slice(1, 3);

  // Matchup hero data
  const t1Players = team1Data?.keyPlayers || [];
  const t2Players = team2Data?.keyPlayers || [];

  // On mobile: hero collapses to app bar on scroll. On desktop: always full.
  const mobileCollapsed = isMobile && scrolled;

  return (
    <div data-modal className="fixed inset-0 z-[60] flex items-center justify-center p-4 md:p-8" onClick={onClose}>
      <div className="fixed inset-0 bg-black/50" aria-hidden="true" />

      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={`Matchup details: ${team1Info?.name || 'TBD'} vs ${team2Info?.name || 'TBD'}`}
        className="relative w-full max-w-lg md:max-w-4xl max-h-[80%] md:max-h-[90%] flex flex-col rounded-2xl animate-in shadow-2xl overflow-hidden"
        style={{ background: 'rgb(var(--color-elevated))' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Hero Header — collapses into app bar on scroll (mobile only) */}
        <div
          className="relative flex-shrink-0 transition-all duration-300 overflow-hidden"
          style={{
            background: isMatchupTab
              ? `linear-gradient(to right, ${team1Info?.color || '#6366f1'} 35%, ${team2Info?.color || '#f59e0b'} 65%)`
              : isActiveTBD ? 'rgb(var(--color-fg), 0.15)' : teamColor,
          }}
        >
          {/* Dark gradient overlay — bottom to top across entire hero */}
          {!isActiveTBD && !isMatchupTab && (
            <div
              className="absolute inset-0 z-[1] pointer-events-none"
              style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.4) 0%, rgba(0,0,0,0) 60%)' }}
            />
          )}

          {/* Matchup hero — dark overlay + players from both teams */}
          {isMatchupTab && (
            <>
              {/* Bottom gradient */}
              <div
                className="absolute inset-0 z-[1] pointer-events-none"
                style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.3) 30%, rgba(0,0,0,0.1) 60%, transparent 100%)' }}
              />
              {/* Center gradient blend — disabled to test without overlay
              <div
                className="absolute inset-0 z-[1] pointer-events-none"
                style={{ background: 'linear-gradient(to right, transparent 20%, rgba(0,0,0,0.25) 38%, rgba(0,0,0,0.35) 50%, rgba(0,0,0,0.25) 62%, transparent 80%)' }}
              />
              */}
              {/* Team 1 star player — left side */}
              {t1Players[0]?.headshot && (
                <div
                  className="absolute top-0 bottom-0 left-0 w-[30%] md:w-[25%] pointer-events-none select-none z-[2]"
                >
                  <img
                    src={t1Players[0].headshot}
                    alt=""
                    className="absolute left-0 bottom-0 h-[85%] md:h-[95%] w-auto object-contain object-bottom transition-opacity duration-300"
                    style={{ opacity: mobileCollapsed ? 0 : 1 }}
                  />
                  <div
                    className="absolute bottom-2 left-2 flex items-end gap-1 transition-opacity duration-300 whitespace-nowrap"
                    style={{
                      opacity: mobileCollapsed ? 0 : 1,
                      textShadow: '0 1px 4px rgba(0,0,0,0.7), 0 0 12px rgba(0,0,0,0.5)',
                    }}
                  >
                    {t1Players[0].jersey && (
                      <span className="text-sm md:text-lg font-mono font-black leading-none text-white">
                        #{t1Players[0].jersey}
                      </span>
                    )}
                    <span className="text-[10px] md:text-xs font-semibold uppercase tracking-wide text-white leading-tight">
                      {t1Players[0].name}
                    </span>
                  </div>
                </div>
              )}
              {/* Team 2 star player — right side */}
              {t2Players[0]?.headshot && (
                <div
                  className="absolute top-0 bottom-0 right-0 w-[30%] md:w-[25%] pointer-events-none select-none z-[2]"
                >
                  <img
                    src={t2Players[0].headshot}
                    alt=""
                    className="absolute right-0 bottom-0 h-[85%] md:h-[95%] w-auto object-contain object-bottom transition-opacity duration-300"
                    style={{ opacity: mobileCollapsed ? 0 : 1 }}
                  />
                  <div
                    className="absolute bottom-2 right-2 flex items-end gap-1 transition-opacity duration-300 whitespace-nowrap"
                    style={{
                      opacity: mobileCollapsed ? 0 : 1,
                      textShadow: '0 1px 4px rgba(0,0,0,0.7), 0 0 12px rgba(0,0,0,0.5)',
                    }}
                  >
                    <span className="text-[10px] md:text-xs font-semibold uppercase tracking-wide text-white leading-tight">
                      {t2Players[0].name}
                    </span>
                    {t2Players[0].jersey && (
                      <span className="text-sm md:text-lg font-mono font-black leading-none text-white">
                        #{t2Players[0].jersey}
                      </span>
                    )}
                  </div>
                </div>
              )}
            </>
          )}

          {/* Player headshots on the right — star + key players side by side */}
          {!isMatchupTab && !isActiveTBD && starPlayer?.headshot ? (
            <>
              {/* Mobile: only star player */}
              <div
                className="absolute top-0 bottom-0 w-2/5 md:hidden overflow-hidden pointer-events-none select-none transition-all duration-300 z-[2]"
                style={{ right: mobileCollapsed ? '40px' : '12px' }}
              >
                <img
                  src={starPlayer.headshot}
                  alt=""
                  className="absolute right-0 bottom-0 h-full w-auto object-cover object-top"
                />
                <div
                  className="absolute bottom-2 right-2 flex items-center gap-1.5 transition-opacity duration-300"
                  style={{
                    opacity: mobileCollapsed ? 0 : 1,
                    textShadow: '0 1px 4px rgba(0,0,0,0.7), 0 0 12px rgba(0,0,0,0.5)',
                  }}
                >
                  {starPlayer.jersey && (
                    <span className="text-lg font-mono font-black leading-none text-white">
                      #{starPlayer.jersey}
                    </span>
                  )}
                  <span className="text-xs font-semibold uppercase tracking-wide text-white pr-1">
                    {starPlayer.name}
                  </span>
                </div>
              </div>

              {/* Desktop: all players in a single row, anchored to the right — all same size */}
              <div
                className="absolute top-0 bottom-0 right-3 hidden md:flex items-end gap-2 pointer-events-none select-none z-[2]"
              >
                {[...[...otherPlayers].reverse(), starPlayer].map((player, idx, arr) => (
                  player?.headshot ? (
                    <div key={player.id || idx} className="relative h-full flex-shrink-0" style={{ width: '120px' }}>
                      <img
                        src={player.headshot}
                        alt=""
                        className="absolute left-1/2 -translate-x-1/2 bottom-0 h-full w-auto object-cover object-top"
                      />
                      <div
                        className="absolute bottom-1 left-1/2 -translate-x-1/2 flex flex-col items-center whitespace-nowrap"
                        style={{ textShadow: '0 1px 4px rgba(0,0,0,0.7), 0 0 12px rgba(0,0,0,0.5)' }}
                      >
                        {player.jersey && (
                          <span className="self-start text-lg font-mono font-black leading-none text-white">
                            #{player.jersey}
                          </span>
                        )}
                        <span className="text-[10px] font-semibold uppercase tracking-wide text-white mt-0.5">
                          {player.name}
                        </span>
                      </div>
                    </div>
                  ) : null
                ))}
              </div>
            </>
          ) : !isMatchupTab && !isActiveTBD && whiteLogo ? (
            <img
              src={whiteLogo}
              alt=""
              className="absolute -right-6 top-1/2 -translate-y-1/2 w-36 h-36 md:w-40 md:h-40 object-contain opacity-15 blur-sm pointer-events-none select-none"
            />
          ) : null}

          {/* Close button */}
          <button
            onClick={onClose}
            aria-label="Close matchup details"
            className={`absolute top-3 right-3 z-20 p-1.5 rounded-full transition-colors ${
              isActiveTBD ? 'bg-fg/10 hover:bg-fg/20' : 'bg-black/20 hover:bg-black/40'
            }`}
          >
            <X className={`w-4 h-4 ${isActiveTBD ? 'text-fg/60' : 'text-white'}`} aria-hidden="true" />
          </button>

          {/* Full hero content — left-aligned, hidden on mobile when scrolled */}
          <div
            className="relative z-[2] flex items-center gap-4 transition-all duration-300 px-5 md:px-6"
            style={{
              opacity: mobileCollapsed ? 0 : 1,
              pointerEvents: mobileCollapsed ? 'none' : 'auto',
              height: mobileCollapsed ? '0px' : isMatchupTab ? '120px' : isActiveTBD ? '80px' : '120px',
              overflow: 'hidden',
            }}
          >
            {isMatchupTab ? (
              <div className="flex items-center justify-center gap-3 md:gap-5 w-full">
                <div className="flex items-center gap-2 md:gap-3">
                  {getDarkBgLogo(team1Info?.logo) && (
                    <img src={getDarkBgLogo(team1Info.logo)} alt="" className="w-12 h-12 md:w-16 md:h-16 object-contain drop-shadow-lg" />
                  )}
                  <div className="text-white text-right">
                    <span className="text-sm md:text-base font-mono font-bold bg-white/20 rounded px-1.5 py-0.5">#{team1Info?.seed}</span>
                    <div className="text-base md:text-xl font-display font-bold mt-0.5">{team1Info?.abbreviation || team1Info?.name}</div>
                  </div>
                </div>
                <div className="flex-shrink-0">
                  <span className="text-2xl md:text-3xl font-display font-black text-white bg-black/30 rounded-lg px-3 py-1.5">VS</span>
                </div>
                <div className="flex items-center gap-2 md:gap-3">
                  <div className="text-white">
                    <span className="text-sm md:text-base font-mono font-bold bg-white/20 rounded px-1.5 py-0.5">#{team2Info?.seed}</span>
                    <div className="text-base md:text-xl font-display font-bold mt-0.5">{team2Info?.abbreviation || team2Info?.name}</div>
                  </div>
                  {getDarkBgLogo(team2Info?.logo) && (
                    <img src={getDarkBgLogo(team2Info.logo)} alt="" className="w-12 h-12 md:w-16 md:h-16 object-contain drop-shadow-lg" />
                  )}
                </div>
              </div>
            ) : isActiveTBD ? (
              <div className="text-fg/60 min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <Clock className="w-5 h-5 text-fg/30" />
                  <h2 className="text-lg md:text-xl font-display font-bold">TBD</h2>
                </div>
                <p className="text-sm text-fg/40 mt-1">Waiting on previous round result</p>
              </div>
            ) : (
              <>
                {whiteLogo && (
                  <img src={whiteLogo} alt="" className="w-10 h-10 md:w-16 md:h-16 object-contain drop-shadow-lg flex-shrink-0" />
                )}
                <div className="text-white min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-0.5">
                    {activeTeamInfo?.seed && (
                      <span className="text-sm font-mono font-bold bg-white/20 rounded px-1.5 py-0.5">
                        #{activeTeamInfo.seed}
                      </span>
                    )}
                    <span className="text-xs uppercase tracking-wider text-white/70">
                      {activeTeamData?.conference || ''}
                    </span>
                  </div>
                  <h2 className="text-lg md:text-xl font-display font-bold truncate">
                    {activeTeamInfo?.name || 'TBD'}
                  </h2>
                  <div className="flex items-center gap-3 mt-0.5 text-sm text-white/80">
                    {activeTeamData?.record && <span className="font-mono font-medium">{activeTeamData.record}</span>}
                    {activeTeamData?.coach && <span>HC: {activeTeamData.coach}</span>}
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Collapsed app bar content — visible on mobile when scrolled, always hidden on desktop */}
          <div
            className="relative z-[2] flex items-center px-4 gap-3 transition-all duration-300 md:hidden"
            style={{
              opacity: mobileCollapsed ? 1 : 0,
              pointerEvents: mobileCollapsed ? 'auto' : 'none',
              height: mobileCollapsed ? '48px' : '0px',
              overflow: 'hidden',
            }}
          >
            {isMatchupTab ? (
              <div className="flex items-center gap-2 w-full justify-center">
                {team1Info?.logo && <img src={getDarkBgLogo(team1Info.logo)} alt="" className="w-5 h-5 object-contain" />}
                <span className="text-white font-bold text-sm">{team1Info?.abbreviation}</span>
                <span className="text-white/50 text-sm font-bold">vs</span>
                <span className="text-white font-bold text-sm">{team2Info?.abbreviation}</span>
                {team2Info?.logo && <img src={getDarkBgLogo(team2Info.logo)} alt="" className="w-5 h-5 object-contain" />}
              </div>
            ) : isActiveTBD ? (
              <span className="text-fg/60 font-bold text-sm">TBD</span>
            ) : (
              <>
                {whiteLogo && (
                  <img src={whiteLogo} alt="" className="w-6 h-6 object-contain" />
                )}
                <span className="text-white font-bold text-sm truncate">
                  {activeTeamInfo?.seed && `#${activeTeamInfo.seed} `}{activeTeamInfo?.name || 'TBD'}
                </span>
              </>
            )}
          </div>
        </div>

        {/* Tab bar — team switcher + matchup tab */}
        <div className="flex-shrink-0 flex border-b border-fg/10" role="tablist" aria-label="Team and matchup details">
          {/* Team 1 tab */}
          <button
            role="tab"
            aria-selected={activeTab === 0}
            aria-label={`${team1Info?.name || 'TBD'} details`}
            onClick={() => { trackingAPI.event('matchup_detail_tab_switch', { slot, tab: 'team1', team: team1Info?.name }); setActiveTab(0); onTabSwitch?.('team1'); }}
            className={`flex-1 flex items-center justify-center gap-2 py-3 text-sm font-medium transition-all relative ${
              activeTab === 0 ? 'text-fg' : 'text-fg/40 hover:text-fg/60'
            }`}
          >
            {team1Info?.logo && <img src={getThemeLogo(team1Info.logo, isDark)} alt="" className="w-5 h-5 md:w-6 md:h-6 object-contain" />}
            <span className="truncate md:text-base">
              {team1Info?.seed && `#${team1Info.seed} `}{team1Info?.abbreviation || team1Info?.name || 'TBD'}
            </span>
            {activeTab === 0 && (
              <div
                className="absolute bottom-0 left-4 right-4 h-0.5 rounded-full"
                style={{ backgroundColor: team1Info?.color || '#6366f1' }}
              />
            )}
          </button>

          {/* Matchup tab — only when both teams known */}
          {bothTeamsKnown && (
            <button
              role="tab"
              aria-selected={activeTab === 1}
              aria-label="Matchup comparison"
              onClick={() => { trackingAPI.event('matchup_detail_tab_switch', { slot, tab: 'matchup' }); setActiveTab(1); onTabSwitch?.('matchup'); }}
              className={`px-4 flex items-center justify-center gap-1.5 py-3 text-sm font-bold transition-all relative ${
                activeTab === 1 ? 'text-fg' : 'text-fg/40 hover:text-fg/60'
              }`}
            >
              <span className="md:text-base">Matchup</span>
              {activeTab === 1 && (
                <div
                  className="absolute bottom-0 left-4 right-4 h-0.5 rounded-full"
                  style={{ background: `linear-gradient(to right, ${team1Info?.color || '#6366f1'}, ${team2Info?.color || '#f59e0b'})` }}
                />
              )}
            </button>
          )}

          {/* Team 2 tab */}
          <button
            role="tab"
            aria-selected={activeTab === (bothTeamsKnown ? 2 : 1)}
            aria-label={`${team2Info?.name || 'TBD'} details`}
            onClick={() => { trackingAPI.event('matchup_detail_tab_switch', { slot, tab: 'team2', team: team2Info?.name }); setActiveTab(bothTeamsKnown ? 2 : 1); onTabSwitch?.('team2'); }}
            className={`flex-1 flex items-center justify-center gap-2 py-3 text-sm font-medium transition-all relative ${
              activeTab === (bothTeamsKnown ? 2 : 1) ? 'text-fg' : 'text-fg/40 hover:text-fg/60'
            }`}
          >
            {team2Info?.logo && <img src={getThemeLogo(team2Info.logo, isDark)} alt="" className="w-5 h-5 md:w-6 md:h-6 object-contain" />}
            <span className="truncate md:text-base">
              {team2Info?.seed && `#${team2Info.seed} `}{team2Info?.abbreviation || team2Info?.name || 'TBD'}
            </span>
            {activeTab === (bothTeamsKnown ? 2 : 1) && (
              <div
                className="absolute bottom-0 left-4 right-4 h-0.5 rounded-full"
                style={{ backgroundColor: team2Info?.color || '#f59e0b' }}
              />
            )}
          </button>
        </div>

        {/* Scrollable content */}
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto"
          style={{ overscrollBehavior: 'contain' }}
        >
          {isMatchupTab ? (
            loading ? (
              <div className="flex items-center justify-center py-20" role="status" aria-label="Loading matchup data">
                <Loader2 className="w-6 h-6 animate-spin text-fg/30" aria-hidden="true" />
              </div>
            ) : (
              <div className="p-4 md:p-6">
                <MatchupComparisonTab
                  team1Data={team1Data}
                  team2Data={team2Data}
                  team1Info={team1Info}
                  team2Info={team2Info}
                  prediction={prediction}
                  season={season}
                />
              </div>
            )
          ) : isActiveTBD ? (
            <div className="p-4 md:p-6">
              <div className="text-center py-8">
                <Clock className="w-10 h-10 text-fg/20 mx-auto mb-3" />
                <h3 className="text-base font-semibold text-fg/60 mb-2">Waiting on Result</h3>
                <p className="text-sm text-fg/40 mb-6">
                  This spot will be filled by the winner of:
                </p>
                {activePossible && (activePossible.team1 || activePossible.team2) ? (
                  <div className="flex items-center justify-center gap-3 max-w-sm mx-auto">
                    {/* Possible team 1 */}
                    <div className="flex-1 flex flex-col items-center gap-2 p-3 rounded-xl bg-fg/5 border border-fg/10">
                      {activePossible.team1?.logo ? (
                        <img src={activePossible.team1.logo} alt="" className="w-10 h-10 object-contain" />
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-fg/10" />
                      )}
                      <span className="text-sm font-semibold text-fg/70 text-center">
                        {activePossible.team1?.seed && `#${activePossible.team1.seed} `}
                        {activePossible.team1?.abbreviation || activePossible.team1?.name || 'TBD'}
                      </span>
                    </div>

                    <span className="text-sm font-bold text-fg/30">vs</span>

                    {/* Possible team 2 */}
                    <div className="flex-1 flex flex-col items-center gap-2 p-3 rounded-xl bg-fg/5 border border-fg/10">
                      {activePossible.team2?.logo ? (
                        <img src={activePossible.team2.logo} alt="" className="w-10 h-10 object-contain" />
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-fg/10" />
                      )}
                      <span className="text-sm font-semibold text-fg/70 text-center">
                        {activePossible.team2?.seed && `#${activePossible.team2.seed} `}
                        {activePossible.team2?.abbreviation || activePossible.team2?.name || 'TBD'}
                      </span>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-fg/30 italic">Previous round matchup not yet determined</p>
                )}
              </div>
            </div>
          ) : loading ? (
            <div className="flex items-center justify-center py-20" role="status" aria-label="Loading team data">
              <Loader2 className="w-6 h-6 animate-spin text-fg/30" aria-hidden="true" />
            </div>
          ) : (
            <div className="p-4 md:p-6">
              {/* Win Probability Bar */}
              {prediction && team1Info && team2Info && (
                <div className="mb-5">
                  <div className="text-xs md:text-sm text-fg/40 text-center mb-1.5 uppercase tracking-wider">Win Probability</div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm md:text-base font-mono font-bold text-fg/70 w-12 text-right">
                      {Math.round(activeTab === 0 ? (prediction.homeWinPct || 50) : (100 - (prediction.homeWinPct || 50)))}%
                    </span>

                    <div className="flex-1 h-3 rounded-full overflow-hidden bg-fg/10 flex">
                      <div
                        className="h-full rounded-l-full transition-all duration-500"
                        style={{
                          width: `${prediction.homeWinPct || 50}%`,
                          backgroundColor: team1Info.color || '#6366f1',
                        }}
                      />
                      <div
                        className="h-full rounded-r-full transition-all duration-500"
                        style={{
                          width: `${100 - (prediction.homeWinPct || 50)}%`,
                          backgroundColor: team2Info.color || '#f59e0b',
                        }}
                      />
                    </div>
                    <span className="text-sm md:text-base font-mono font-bold text-fg/70 w-12">
                      {Math.round(activeTab !== 0 ? (100 - (prediction.homeWinPct || 50)) : (prediction.homeWinPct || 50))}%
                    </span>
                  </div>
                </div>
              )}

              <TeamAnalysisCard team={activeTeamData} teamColor={teamColor} season={season} />
            </div>
          )}
        </div>

        {/* Sticky bottom — Pick buttons */}
        {!isReadOnly && team1Info && team2Info && (
          <div className="flex-shrink-0 p-3 border-t border-fg/10 flex gap-3" style={{ background: 'rgb(var(--color-elevated))' }}>
            <button
              onClick={() => handlePick(team1Info.id)}
              aria-label={`Pick #${team1Info.seed} ${team1Info.name} to advance`}
              className="flex-1 py-3 rounded-xl font-semibold text-sm transition-all hover:scale-[1.01] active:scale-[0.99] flex items-center justify-center gap-2 text-white"
              style={{ backgroundColor: team1Info.color || '#6366f1' }}
            >
              {team1Info.logo && <img src={getDarkBgLogo(team1Info.logo)} alt="" className="w-5 h-5 object-contain" />}
              Pick #{team1Info.seed} {team1Info.abbreviation || team1Info.name}
            </button>
            <button
              onClick={() => handlePick(team2Info.id)}
              aria-label={`Pick #${team2Info.seed} ${team2Info.name} to advance`}
              className="flex-1 py-3 rounded-xl font-semibold text-sm transition-all hover:scale-[1.01] active:scale-[0.99] flex items-center justify-center gap-2 text-white"
              style={{ backgroundColor: team2Info.color || '#f59e0b' }}
            >
              {team2Info.logo && <img src={getDarkBgLogo(team2Info.logo)} alt="" className="w-5 h-5 object-contain" />}
              Pick #{team2Info.seed} {team2Info.abbreviation || team2Info.name}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
