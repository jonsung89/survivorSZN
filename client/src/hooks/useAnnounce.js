import { useCallback, useEffect, useRef } from 'react';

let liveRegion = null;

function getOrCreateLiveRegion() {
  if (liveRegion && document.body.contains(liveRegion)) return liveRegion;

  liveRegion = document.createElement('div');
  liveRegion.setAttribute('aria-live', 'polite');
  liveRegion.setAttribute('aria-atomic', 'true');
  liveRegion.setAttribute('role', 'status');
  liveRegion.className = 'sr-only';
  document.body.appendChild(liveRegion);
  return liveRegion;
}

export default function useAnnounce() {
  const timer = useRef(null);

  useEffect(() => {
    getOrCreateLiveRegion();
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  const announce = useCallback((message) => {
    const region = getOrCreateLiveRegion();
    // Clear first to allow repeated identical announcements
    region.textContent = '';
    if (timer.current) clearTimeout(timer.current);

    requestAnimationFrame(() => {
      region.textContent = message;
      timer.current = setTimeout(() => {
        region.textContent = '';
      }, 3000);
    });
  }, []);

  return announce;
}
