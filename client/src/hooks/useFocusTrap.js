import { useEffect, useRef } from 'react';

const FOCUSABLE = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

export default function useFocusTrap(containerRef, enabled = true) {
  const previousFocus = useRef(null);

  useEffect(() => {
    if (!enabled || !containerRef?.current) return;

    previousFocus.current = document.activeElement;
    const container = containerRef.current;

    // Focus first focusable element
    const focusable = container.querySelectorAll(FOCUSABLE);
    if (focusable.length) focusable[0].focus();

    function handleKeyDown(e) {
      if (e.key !== 'Tab') return;

      const nodes = container.querySelectorAll(FOCUSABLE);
      if (!nodes.length) return;

      const first = nodes[0];
      const last = nodes[nodes.length - 1];

      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      if (previousFocus.current && previousFocus.current.focus) {
        previousFocus.current.focus();
      }
    };
  }, [enabled, containerRef]);
}
