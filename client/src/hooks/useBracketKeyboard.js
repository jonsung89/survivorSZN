import { useEffect } from 'react';

export default function useBracketKeyboard({
  regionCount = 4,
  onRegionSelect,
  onFinalFour,
  onToggleFocusMode,
  onToggleMiniMap,
  onZoomIn,
  onZoomOut,
  onZoomReset,
  enabled = true,
}) {
  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (e) => {
      // Don't trigger when typing in inputs
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) return;

      // Region jump: 1-4
      if (e.key >= '1' && e.key <= String(regionCount) && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        onRegionSelect?.(parseInt(e.key) - 1);
        return;
      }

      // Final Four: 5 or F
      if ((e.key === '5' || e.key === 'f') && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        onFinalFour?.();
        return;
      }

      // Toggle focus mode: Escape
      if (e.key === 'Escape') {
        e.preventDefault();
        onToggleFocusMode?.();
        return;
      }

      // Toggle mini-map: M
      if (e.key === 'm' && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        onToggleMiniMap?.();
        return;
      }

      // Zoom: Ctrl/Cmd +/-/0
      if (e.metaKey || e.ctrlKey) {
        if (e.key === '=' || e.key === '+') {
          e.preventDefault();
          onZoomIn?.();
        } else if (e.key === '-') {
          e.preventDefault();
          onZoomOut?.();
        } else if (e.key === '0') {
          e.preventDefault();
          onZoomReset?.();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [enabled, regionCount, onRegionSelect, onFinalFour, onToggleFocusMode, onToggleMiniMap, onZoomIn, onZoomOut, onZoomReset]);
}
