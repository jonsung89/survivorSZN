import { useState, useEffect, useCallback, useRef } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';

export default function BracketMiniMap({
  regions,
  regionCompletion,
  scrollContainerRef,
  onRegionClick,
  visible = true,
  onToggle,
}) {
  const [viewport, setViewport] = useState({ x: 0, y: 0, w: 0, h: 0 });
  const miniMapRef = useRef(null);

  // Track scroll position to update viewport indicator
  const updateViewport = useCallback(() => {
    const container = scrollContainerRef?.current;
    if (!container) return;

    const { scrollLeft, scrollTop, scrollWidth, scrollHeight, clientWidth, clientHeight } = container;
    setViewport({
      x: scrollWidth > 0 ? scrollLeft / scrollWidth : 0,
      y: scrollHeight > 0 ? scrollTop / scrollHeight : 0,
      w: scrollWidth > 0 ? clientWidth / scrollWidth : 1,
      h: scrollHeight > 0 ? clientHeight / scrollHeight : 1,
    });
  }, [scrollContainerRef]);

  useEffect(() => {
    const container = scrollContainerRef?.current;
    if (!container) return;

    container.addEventListener('scroll', updateViewport);
    // Also observe resize
    const ro = new ResizeObserver(updateViewport);
    ro.observe(container);
    updateViewport();

    return () => {
      container.removeEventListener('scroll', updateViewport);
      ro.disconnect();
    };
  }, [scrollContainerRef, updateViewport]);

  // Handle click on mini-map to navigate
  const handleClick = (e) => {
    const rect = miniMapRef.current?.getBoundingClientRect();
    if (!rect) return;

    const container = scrollContainerRef?.current;
    if (!container) return;

    const relX = (e.clientX - rect.left) / rect.width;
    const relY = (e.clientY - rect.top) / rect.height;

    container.scrollTo({
      left: relX * container.scrollWidth - container.clientWidth / 2,
      top: relY * container.scrollHeight - container.clientHeight / 2,
      behavior: 'smooth',
    });
  };

  // Region positions on the mini-map (approximate bracket layout)
  // Layout: [TL] [FF] [TR]
  //         [BL]      [BR]
  const regionPositions = [
    { label: regions[0]?.name?.[0] || '1', x: 2, y: 2, w: 35, h: 44, idx: 0 },   // top-left
    { label: regions[1]?.name?.[0] || '2', x: 2, y: 50, w: 35, h: 44, idx: 1 },   // bottom-left
    { label: regions[2]?.name?.[0] || '3', x: 63, y: 2, w: 35, h: 44, idx: 2 },   // top-right
    { label: regions[3]?.name?.[0] || '4', x: 63, y: 50, w: 35, h: 44, idx: 3 },  // bottom-right
    { label: 'F4', x: 39, y: 20, w: 22, h: 56, idx: 4 },                           // Final Four center
  ];

  return (
    <div className="hidden md:block fixed bottom-6 right-6 z-30">
      {/* Toggle button */}
      <button
        onClick={onToggle}
        className="absolute -top-8 right-0 text-xs text-fg/40 hover:text-fg/70 transition-colors flex items-center gap-1"
      >
        {visible ? <ChevronDown className="w-3 h-3" /> : <ChevronUp className="w-3 h-3" />}
        {visible ? 'Hide' : 'Map'}
      </button>

      {visible && (
        <div
          ref={miniMapRef}
          onClick={handleClick}
          className="relative w-[200px] h-[100px] bg-surface/90 backdrop-blur-sm border border-fg/15 rounded-lg shadow-lg cursor-crosshair overflow-hidden"
        >
          {/* Region blocks */}
          {regionPositions.map((pos) => (
            <button
              key={pos.idx}
              onClick={(e) => {
                e.stopPropagation();
                onRegionClick?.(pos.idx);
              }}
              className={`absolute flex items-center justify-center rounded text-[9px] font-bold transition-colors ${
                regionCompletion[pos.idx]
                  ? 'bg-emerald-500/30 text-emerald-400 border border-emerald-500/30'
                  : 'bg-fg/10 text-fg/40 border border-fg/10 hover:bg-fg/20'
              }`}
              style={{
                left: `${pos.x}%`,
                top: `${pos.y}%`,
                width: `${pos.w}%`,
                height: `${pos.h}%`,
              }}
            >
              {pos.label}
            </button>
          ))}

          {/* Viewport indicator */}
          <div
            className="absolute border-2 border-violet-500/60 rounded bg-violet-500/10 pointer-events-none"
            style={{
              left: `${viewport.x * 100}%`,
              top: `${viewport.y * 100}%`,
              width: `${viewport.w * 100}%`,
              height: `${viewport.h * 100}%`,
            }}
          />
        </div>
      )}
    </div>
  );
}
