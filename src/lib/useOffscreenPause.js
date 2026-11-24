import { useEffect, useRef, useState } from "react";

/**
 * Tracks whether a marquee / animated container is currently off-screen so CSS
 * infinite animations can pause automatically when scrolled out of viewport.
 */
export function useOffscreenPause(
  rootMargin = "320px 0px",
  initiallyPaused = false,
  enabled = true,
) {
  const ref = useRef(null);
  const [paused, setPaused] = useState(initiallyPaused);

  useEffect(() => {
    const el = ref.current;
    if (!enabled || !el) return;
    if (typeof IntersectionObserver === "undefined") {
      if (initiallyPaused) setPaused(false);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          setPaused(!entry.isIntersecting);
        }
      },
      { rootMargin, threshold: 0 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [rootMargin, initiallyPaused, enabled]);

  return [ref, paused];
}
