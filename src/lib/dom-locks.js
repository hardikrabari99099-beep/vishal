// Shared DOM overlay lock recovery + lightweight tick/scroll activity coordination

let lastTickActivityAt = 0;

/**
 * Records that a live market tick just fired so pointer/tilt FX can defer
 * expensive hit-testing (`elementFromPoint` / layout reads) until the frame settles.
 */
export function markLiveTickActivity() {
  lastTickActivityAt =
    typeof performance !== "undefined" ? performance.now() : Date.now();
}

export function isLiveTickBusy(windowMs = 260) {
  if (!lastTickActivityAt) return false;
  const now =
    typeof performance !== "undefined" ? performance.now() : Date.now();
  return now - lastTickActivityAt < windowMs;
}

/**
 * Unconditionally clears orphaned Radix Dialog / RemoveScroll body locks
 * (e.g., when navigating away from a route while a modal/drawer was open or on logout).
 */
export function forceReleaseDomOverlayLocks() {
  if (typeof document === "undefined") return;
  try {
    if (document.body) {
      document.body.style.pointerEvents = "";
      document.body.style.overflow = "";
      document.body.style.paddingRight = "";
      document.body.removeAttribute("data-scroll-locked");
      if (document.body.getAttribute("aria-hidden") === "true") {
        document.body.removeAttribute("aria-hidden");
      }
    }
    if (document.documentElement) {
      document.documentElement.style.pointerEvents = "";
      document.documentElement.style.overflow = "";
      document.documentElement.removeAttribute("data-scroll-locked");
    }
  } catch {
    // ignore DOM access restrictions
  }
}

/**
 * Releases orphaned locks only when no open Radix dialog/alertdialog remains mounted.
 */
export function releaseOrphanedOverlayLocks() {
  if (typeof document === "undefined") return;
  try {
    const hasOpenDialog = Boolean(
      document.querySelector(
        '[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"]',
      ),
    );
    if (!hasOpenDialog) {
      forceReleaseDomOverlayLocks();
    }
  } catch {
    // ignore selector errors
  }
}
