import { useState, useEffect, useRef } from 'react';

/**
 * useAnimatedScore — Detects when a score value changes and triggers a brief animation.
 *
 * Returns `true` for 600ms after the score changes, then resets to `false`.
 * Used to apply a CSS pop/flash animation to score displays.
 *
 * @param {number|null} score - The current score value
 * @returns {boolean} Whether the animation is currently active
 */
export default function useAnimatedScore(score) {
  const [animating, setAnimating] = useState(false);
  const prevRef = useRef(score);

  useEffect(() => {
    if (
      score !== prevRef.current &&
      prevRef.current !== null &&
      prevRef.current !== undefined &&
      score !== null &&
      score !== undefined
    ) {
      setAnimating(true);
      const timer = setTimeout(() => setAnimating(false), 600);
      prevRef.current = score;
      return () => clearTimeout(timer);
    }
    prevRef.current = score;
  }, [score]);

  return animating;
}
