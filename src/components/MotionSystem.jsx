import { useEffect, useRef, useState } from "react";
import { useLocation, useRouterLoading } from "@/lib/router-compat";
import { DEFAULT_FX_CONFIG, getFxConfig, subscribeWidgetsConfig } from "@/lib/live-feed-config";
import { hasLimitedMotion } from "@/lib/limited-motion";
import {
  forceReleaseDomOverlayLocks,
  isLiveTickBusy,
  releaseOrphanedOverlayLocks,
} from "@/lib/dom-locks";

const TILT_CARD_SELECTOR = [
  "[data-tilt]",
  ".product-card",
  ".home-step",
  ".why-item",
  ".glass-card",
  ".card-panel",
  ".trust-card",
  ".review-card",
  ".trader-card",
  ".home-hero-stats > div",
].join(",");

/**
 * Determines the route transition choreography class for a given pathname,
 * cycling through fast GPU-composited transitions tailored to each view.
 */
export function getRouteTransitionClass(pathname = "/") {
  const p = String(pathname || "/").toLowerCase();
  if (p === "/") return "page-transition tx-page-load";
  if (p.startsWith("/challenges")) {
    return "page-transition tx-3d-page";
  }
  if (
    p.startsWith("/how-it-works") ||
    p.startsWith("/rules") ||
    p.startsWith("/about") ||
    p.startsWith("/faq")
  ) {
    return "page-transition tx-slide-x";
  }
  if (
    p.startsWith("/payouts") ||
    p.startsWith("/leaderboard") ||
    p.startsWith("/league") ||
    p.startsWith("/stories") ||
    p.startsWith("/our-traders")
  ) {
    return "page-transition tx-slide-y";
  }
  if (p.startsWith("/verify") || p.startsWith("/trust")) {
    return "page-transition tx-zoom";
  }
  if (
    p.startsWith("/login") ||
    p.startsWith("/forgot-password") ||
    p.startsWith("/reset-password")
  ) {
    return "page-transition tx-scale";
  }
  if (p.startsWith("/app") || p.startsWith("/admin")) {
    return "page-transition tx-crossfade";
  }
  return "page-transition tx-fade";
}

/**
 * Zero-block preloader placeholder so initial paint opens immediately at frame zero.
 */
export function PreloaderOverlay() {
  return null;
}

/**
 * Coordinates crisp route transitions, guaranteed content reveal sweeps,
 * and desktop parallax scrolling, cursor glow, and 3D tilt.
 */
function isElementHydratedForMutation(el) {
  if (!el || typeof el !== "object") return false;
  try {
    const keys = Object.keys(el);
    for (let i = 0; i < keys.length; i++) {
      const k = keys[i];
      if (k.startsWith("__reactFiber$") || k.startsWith("__reactProps$")) {
        return true;
      }
    }
    return false;
  } catch {
    return true;
  }
}

export function MotionOrchestrator() {
  const loc = useLocation();
  const isRoutePending = typeof useRouterLoading === "function" ? useRouterLoading() : false;
  const prevPathRef = useRef(loc.pathname);
  const [navState, setNavState] = useState("idle"); // idle | active
  const [fxCfg, setFxCfg] = useState(() => ({ ...DEFAULT_FX_CONFIG }));

  useEffect(() => {
    setFxCfg(getFxConfig());
    return subscribeWidgetsConfig(({ fx }) => {
      if (fx) setFxCfg(fx);
    });
  }, []);

  // Sync FX flags to root element for CSS kinetic motion layers
  useEffect(() => {
    if (typeof document === "undefined") return;
    const root = document.documentElement;
    root.classList.toggle("fx-cursor-glow", Boolean(fxCfg.cursor_glow));
    root.classList.toggle("fx-tilt-3d", Boolean(fxCfg.tilt_3d));
    root.classList.toggle("fx-kinetic", Boolean(fxCfg.kinetic_motion));
  }, [fxCfg.cursor_glow, fxCfg.tilt_3d, fxCfg.kinetic_motion]);

  // Global [data-reveal] IntersectionObserver + bounded sweeps (zero document.body MutationObserver)
  useEffect(() => {
    if (typeof window === "undefined" || typeof document === "undefined") return;

    if (hasLimitedMotion()) return;
    const revealEl = (el) => {
      if (el && isElementHydratedForMutation(el) && !el.classList.contains("is-visible")) {
        el.classList.add("is-visible");
      }
    };

    const hasIO = typeof IntersectionObserver !== "undefined";
    const observed = new WeakSet();
    let retryTimer = null;
    let fallbackTimer = null;
    let retryCount = 0;

    const io = hasIO
      ? new IntersectionObserver(
          (entries) => {
            if (typeof document === "undefined") return;
            for (const entry of entries) {
              if (entry.isIntersecting && isElementHydratedForMutation(entry.target)) {
                revealEl(entry.target);
                io.unobserve(entry.target);
              }
            }
          },
          { threshold: 0.01, rootMargin: "120px 0px 120px 0px" },
        )
      : null;

    const sweepReveals = () => {
      if (typeof document === "undefined" || typeof window === "undefined") return;
      const nodes = document.querySelectorAll("[data-reveal]:not(.is-visible)");
      if (!nodes.length) return;
      const hydratedNodes = [];
      let hasUnhydrated = false;
      nodes.forEach((el) => {
        if (isElementHydratedForMutation(el)) hydratedNodes.push(el);
        else hasUnhydrated = true;
      });
      if (hydratedNodes.length) {
        if (!io) {
          hydratedNodes.forEach(revealEl);
        } else {
          const vh = window.innerHeight || 800;
          hydratedNodes.forEach((el) => {
            const rect = el.getBoundingClientRect();
            if (rect.top < vh + 180 && rect.bottom > -60) {
              revealEl(el);
            } else if (!observed.has(el)) {
              observed.add(el);
              io.observe(el);
            }
          });
        }
      }
      if (hasUnhydrated && retryCount < 4) {
        retryCount += 1;
        if (retryTimer) clearTimeout(retryTimer);
        retryTimer = setTimeout(() => {
          retryTimer = null;
          sweepReveals();
        }, 45);
      }
    };

    sweepReveals();

    // Single bounded fallback guarantee per route so above/below-the-fold sections never stay hidden
    fallbackTimer = setTimeout(() => {
      fallbackTimer = null;
      if (typeof document === "undefined") return;
      document.querySelectorAll("[data-reveal]:not(.is-visible)").forEach(revealEl);
    }, 160);

    const onHydrated = () => {
      sweepReveals();
    };
    window.addEventListener("if:route-hydrated", onHydrated);
    window.addEventListener("if:reveal-scan", onHydrated);

    return () => {
      window.removeEventListener("if:route-hydrated", onHydrated);
      window.removeEventListener("if:reveal-scan", onHydrated);
      if (io) io.disconnect();
      if (retryTimer) clearTimeout(retryTimer);
      if (fallbackTimer) clearTimeout(fallbackTimer);
    };
  }, [loc.pathname]);

  // Recover any orphaned Radix/drawer scroll or pointer locks on browser back/forward
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onPopState = () => {
      forceReleaseDomOverlayLocks();
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  // Fast route transition bar, instant scroll reset, and deterministic lock cleanup
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (prevPathRef.current === loc.pathname) return;
    prevPathRef.current = loc.pathname;

    // Immediately clear any lingering body pointer-events / scroll lock from the departing route
    forceReleaseDomOverlayLocks();
    const lockSweepTimer = setTimeout(() => {
      releaseOrphanedOverlayLocks();
    }, 60);

    setNavState("active");
    if (!loc.hash) {
      try {
        window.scrollTo(0, 0);
      } catch {
        // ignore in non-browser tests
      }
    }
    const timer = setTimeout(() => setNavState("idle"), 160);
    return () => {
      clearTimeout(timer);
      clearTimeout(lockSweepTimer);
    };
  }, [loc.pathname, loc.hash]);

  // Lightweight rAF Parallax Scrolling driver for [data-parallax] elements
  useEffect(() => {
    if (typeof window === "undefined" || typeof document === "undefined") return;
    if (!fxCfg.kinetic_motion) return;
    if (hasLimitedMotion()) return;

    let raf = 0;
    const updateParallax = () => {
      raf = 0;
      if (typeof document === "undefined" || typeof window === "undefined") return;
      const nodes = document.querySelectorAll("[data-parallax]");
      if (!nodes.length) return;
      const vh = window.innerHeight || 800;
      for (const el of nodes) {
        if (!isElementHydratedForMutation(el)) continue;
        const speed = Number(el.getAttribute("data-parallax")) || 0.12;
        const rect = el.getBoundingClientRect();
        const centerOffset = rect.top + rect.height * 0.5 - vh * 0.5;
        const shift = Math.max(-56, Math.min(56, -centerOffset * speed));
        el.style.setProperty("--parallax-y", `${shift.toFixed(2)}px`);
      }
    };

    const schedule = () => {
      if (!raf) raf = window.requestAnimationFrame(updateParallax);
    };

    schedule();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule, { passive: true });
    window.addEventListener("if:route-hydrated", schedule);
    return () => {
      if (raf) window.cancelAnimationFrame(raf);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      window.removeEventListener("if:route-hydrated", schedule);
    };
  }, [loc.pathname, fxCfg.kinetic_motion]);

  // Desktop delegated rAF cursor glow + 3D tilt controller (skips during live ticks, active scroll, charts & terminal)
  useEffect(() => {
    if (typeof window === "undefined" || typeof document === "undefined") return;
    if (!fxCfg.cursor_glow && !fxCfg.tilt_3d) return;
    if (hasLimitedMotion()) return;

    let raf = 0;
    let activeCard = null;
    let lastClientX = -9999;
    let lastClientY = -9999;
    let lastEventTarget = null;
    let isScrolling = false;
    let scrollCooldown = null;

    const clearCardTilt = (card) => {
      if (!card) return;
      card.classList.remove("is-tilting");
      card.style.removeProperty("--rx");
      card.style.removeProperty("--ry");
    };

    const onScroll = () => {
      isScrolling = true;
      if (activeCard) {
        clearCardTilt(activeCard);
        activeCard = null;
      }
      if (scrollCooldown) clearTimeout(scrollCooldown);
      scrollCooldown = setTimeout(() => {
        isScrolling = false;
        scrollCooldown = null;
      }, 120);
    };

    const applyPointerFrame = () => {
      raf = 0;
      if (fxCfg.cursor_glow) {
        document.documentElement.style.setProperty("--cursor-x", `${lastClientX}px`);
        document.documentElement.style.setProperty("--cursor-y", `${lastClientY}px`);
      }

      if (!fxCfg.tilt_3d || isScrolling || isLiveTickBusy(240)) {
        if (activeCard) {
          clearCardTilt(activeCard);
          activeCard = null;
        }
        return;
      }

      const target =
        lastEventTarget && typeof lastEventTarget.closest === "function"
          ? lastEventTarget
          : document.elementFromPoint(lastClientX, lastClientY);
      if (
        !target ||
        target.closest(
          "input, textarea, select, [data-testid='tradingview-chart'], .trading-terminal-root, .term-shell",
        )
      ) {
        clearCardTilt(activeCard);
        activeCard = null;
        return;
      }

      const card = target.closest(TILT_CARD_SELECTOR);
      if (activeCard && activeCard !== card) {
        clearCardTilt(activeCard);
      }
      activeCard = card;
      if (!card) return;

      const rect = card.getBoundingClientRect();
      if (rect.width < 24 || rect.height < 24) return;
      const px = Math.max(0, Math.min(1, (lastClientX - rect.left) / rect.width));
      const py = Math.max(0, Math.min(1, (lastClientY - rect.top) / rect.height));
      const rx = (0.5 - py) * 6.5;
      const ry = (px - 0.5) * 7.5;
      card.classList.add("is-tilting");
      card.style.setProperty("--mx", `${(px * 100).toFixed(1)}%`);
      card.style.setProperty("--my", `${(py * 100).toFixed(1)}%`);
      card.style.setProperty("--rx", `${rx.toFixed(2)}deg`);
      card.style.setProperty("--ry", `${ry.toFixed(2)}deg`);
    };

    const onPointerMove = (e) => {
      lastClientX = e.clientX;
      lastClientY = e.clientY;
      lastEventTarget = e.target || null;
      if (!raf) raf = window.requestAnimationFrame(applyPointerFrame);
    };

    const onPointerLeaveWindow = () => {
      lastEventTarget = null;
      clearCardTilt(activeCard);
      activeCard = null;
    };

    window.addEventListener("pointermove", onPointerMove, { passive: true });
    window.addEventListener("scroll", onScroll, { passive: true });
    document.addEventListener("pointerleave", onPointerLeaveWindow, { passive: true });
    return () => {
      if (raf) window.cancelAnimationFrame(raf);
      if (scrollCooldown) clearTimeout(scrollCooldown);
      clearCardTilt(activeCard);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("scroll", onScroll);
      document.removeEventListener("pointerleave", onPointerLeaveWindow);
    };
  }, [fxCfg.cursor_glow, fxCfg.tilt_3d, loc.pathname]);

  const isBarActive = navState === "active" || isRoutePending;

  return (
    <>
      <div className={`route-loading-bar ${isBarActive ? "is-loading" : ""}`} aria-hidden="true" />
      <div
        className={`route-wipe-veil ${navState === "active" ? "is-wiping" : ""}`}
        aria-hidden="true"
      />
      {fxCfg.cursor_glow && (
        <div className="if-cursor-halo" data-testid="interactive-cursor-glow" aria-hidden="true" />
      )}
    </>
  );
}

/**
 * Wraps route view content with an appropriate Page / Route / View / 3D transition.
 */
export function PageTransitionShell({ children, className = "" }) {
  const loc = useLocation();
  const txClass = getRouteTransitionClass(loc.pathname);
  return (
    <div key={loc.pathname} className={`${txClass} ${className}`.trim()}>
      {children}
    </div>
  );
}
