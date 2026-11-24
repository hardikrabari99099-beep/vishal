export function hasLimitedMotion() {
  return (
    typeof window !== "undefined" &&
    (window.innerWidth <= 900 ||
      window.matchMedia?.("(pointer: coarse), (prefers-reduced-motion: reduce)")
        ?.matches)
  );
}
