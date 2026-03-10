import { useRef, useCallback, useState } from 'react';

/**
 * Horizontal swipe detection hook with finger-follow offset.
 *
 * Returns touch handlers to spread on a container, plus live drag state
 * so the consumer can translate content to follow the finger.
 */
export default function useSwipe({
  onSwipeLeft,
  onSwipeRight,
  threshold = 50,
  enabled = true,
}) {
  const [dragOffsetX, setDragOffsetX] = useState(0);
  const [isDragging, setIsDragging] = useState(false);

  const startX = useRef(0);
  const startY = useRef(0);
  const startTime = useRef(0);
  const locked = useRef(null); // 'horizontal' | 'vertical' | null

  const onTouchStart = useCallback((e) => {
    if (!enabled) return;
    const touch = e.touches[0];
    startX.current = touch.clientX;
    startY.current = touch.clientY;
    startTime.current = Date.now();
    locked.current = null;
    setIsDragging(true);
    setDragOffsetX(0);
  }, [enabled]);

  const onTouchMove = useCallback((e) => {
    if (!enabled || !isDragging) return;

    const touch = e.touches[0];
    const deltaX = touch.clientX - startX.current;
    const deltaY = touch.clientY - startY.current;

    // Determine axis lock on first significant movement
    if (!locked.current) {
      const absDx = Math.abs(deltaX);
      const absDy = Math.abs(deltaY);
      if (absDx < 10 && absDy < 10) return; // wait for sufficient movement
      locked.current = absDx > absDy ? 'horizontal' : 'vertical';
    }

    if (locked.current === 'vertical') {
      // Allow normal page scroll — don't interfere
      return;
    }

    // Horizontal lock — prevent browser back-gesture / scroll
    e.preventDefault();
    setDragOffsetX(deltaX);
  }, [enabled, isDragging]);

  const onTouchEnd = useCallback(() => {
    if (!enabled || !isDragging) return;
    setIsDragging(false);

    const deltaX = dragOffsetX;
    const elapsed = Date.now() - startTime.current;
    const absDelta = Math.abs(deltaX);

    // Check swipe: exceed threshold, or fast flick (>30px in <300ms)
    const triggered = absDelta > threshold || (absDelta > 30 && elapsed < 300);

    if (triggered) {
      if (deltaX < 0) {
        onSwipeLeft?.();
      } else {
        onSwipeRight?.();
      }
    }

    // Reset drag offset (consumer uses this to snap back)
    setDragOffsetX(0);
    locked.current = null;
  }, [enabled, isDragging, dragOffsetX, threshold, onSwipeLeft, onSwipeRight]);

  const handlers = {
    onTouchStart,
    onTouchMove,
    onTouchEnd,
  };

  return { handlers, dragOffsetX, isDragging };
}
