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
  const [containerBounds, setContainerBounds] = useState(null);
  const [debouncedSide, setDebouncedSide] = useState(true); // true = right side
  const sideTimeoutRef = useRef(null);
  const miniMapRef = useRef(null);

  // Track scroll position to update viewport indicator + container bounds
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

    const rect = container.getBoundingClientRect();
    setContainerBounds({
      top: rect.top,
      bottom: rect.bottom,
      left: rect.left,
      visibleRight: rect.left + clientWidth,
    });
  }, [scrollContainerRef]);

  useEffect(() => {
    const container = scrollContainerRef?.current;
    if (!container) return;

    container.addEventListener('scroll', updateViewport);
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

  // Determine minimap side based on viewport scroll position (debounced)
  const viewportCenterX = viewport.x + viewport.w / 2;
  const targetSide = viewportCenterX < 0.5;
  useEffect(() => {
    if (targetSide === debouncedSide) return;
    clearTimeout(sideTimeoutRef.current);
    sideTimeoutRef.current = setTimeout(() => setDebouncedSide(targetSide), 500);
    return () => clearTimeout(sideTimeoutRef.current);
  }, [targetSide, debouncedSide]);
  const showOnRight = debouncedSide;

  // Region positions on the mini-map
  const regionPositions = [
    { label: regions[0]?.name?.[0] || '1', x: 2, y: 2, w: 35, h: 44, idx: 0 },
    { label: regions[1]?.name?.[0] || '2', x: 2, y: 50, w: 35, h: 44, idx: 1 },
    { label: regions[2]?.name?.[0] || '3', x: 63, y: 2, w: 35, h: 44, idx: 2 },
    { label: regions[3]?.name?.[0] || '4', x: 63, y: 50, w: 35, h: 44, idx: 3 },
    { label: 'F4', x: 39, y: 20, w: 22, h: 56, idx: 4 },
  ];

  const mapHeight = 100;
  const mapWidth = 200;
  const padding = 12;

  // Always use `left` for smooth transitions
  let leftPos = padding;
  let topPos = undefined;
  if (containerBounds) {
    if (visible) {
      topPos = containerBounds.bottom - mapHeight - padding;
    } else {
      // When hidden, position the button flush to the bottom corner
      topPos = containerBounds.bottom - padding - 32;
    }
    if (showOnRight) {
      leftPos = containerBounds.visibleRight - (visible ? mapWidth : 80) - padding;
    } else {
      leftPos = containerBounds.left + padding;
    }
  }

  return (
    <div
      className="hidden md:block fixed z-30"
      style={{
        left: leftPos,
        top: topPos,
        transition: 'left 0.4s ease',
      }}
    >
      {/* Toggle button */}
      <button
        onClick={onToggle}
        className={`text-sm font-medium text-fg/60 hover:text-fg/90 bg-surface/80 hover:bg-surface backdrop-blur-sm border border-fg/15 hover:border-fg/25 rounded-md px-2.5 py-1 transition-all flex items-center gap-1.5 shadow-sm ${
          visible ? `absolute -top-8 ${showOnRight ? 'right-0' : 'left-0'}` : ''
        }`}
      >
        {visible ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
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
