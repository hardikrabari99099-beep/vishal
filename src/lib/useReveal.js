import { useEffect, useRef } from "react";
import { hasLimitedMotion } from "./limited-motion";

function isElementHydrated(el) {
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

/** Lightweight scroll reveal using IntersectionObserver — supports dynamic async content and all data-reveal variants. */
export function useReveal(deps = []) {
  const ref = useRef(null);
  useEffect(() => {
    if (typeof document === "undefined" || typeof window === "undefined")
      return;
    if (hasLimitedMotion()) return;
    document.documentElement.classList.add("reveal-ready");
    const reveal = (el) => {
      if (el && isElementHydrated(el)) {
        el.classList?.add("is-visible");
      }
    };

    const hasIO = typeof IntersectionObserver !== "undefined";
    const observed = new WeakSet();
    const io = hasIO
      ? new IntersectionObserver(
          (entries) => {
            if (typeof document === "undefined") return;
            entries.forEach((e) => {
              if (e.isIntersecting && isElementHydrated(e.target)) {
                reveal(e.target);
                io.unobserve(e.target);
              }
            });
          },
          { threshold: 0.01, rootMargin: "120px 0px 120px 0px" },
        )
      : null;

    const getTargets = () => {
      if (typeof document === "undefined") return [];
      return ref.current
        ? [ref.current]
        : Array.from(
            document.querySelectorAll("[data-reveal]:not(.is-visible)"),
          );
    };

    const scan = () => {
      if (typeof document === "undefined" || typeof window === "undefined")
        return;
      const els = getTargets().filter(isElementHydrated);
      if (!els.length) return;
      if (!io) {
        els.forEach(reveal);
        return;
      }
      const vh = window.innerHeight || 800;
      els.forEach((el) => {
        const r = el.getBoundingClientRect();
        if (r.top < vh + 180 && r.bottom > -40) {
          reveal(el);
        } else if (!observed.has(el)) {
          observed.add(el);
          io.observe(el);
        }
      });
    };

    scan();
    try {
      window.dispatchEvent(new CustomEvent("if:route-hydrated"));
    } catch {
      // ignore CustomEvent errors in older environments
    }

    let fallbackTimer = null;
    const scheduleFallback = () => {
      if (fallbackTimer) clearTimeout(fallbackTimer);
      fallbackTimer = setTimeout(() => {
        fallbackTimer = null;
        if (typeof document === "undefined") return;
        getTargets().forEach(reveal);
      }, 120);
    };
    scheduleFallback();

    const onRevealScan = () => {
      scan();
    };
    window.addEventListener("if:reveal-scan", onRevealScan);

    // Only observe an explicit local ref container (never document.body globally)
    let mo = null;
    if (typeof MutationObserver !== "undefined" && ref.current) {
      mo = new MutationObserver(() => {
        if (typeof document === "undefined") return;
        scan();
        scheduleFallback();
      });
      mo.observe(ref.current, { childList: true, subtree: true });
    }

    return () => {
      window.removeEventListener("if:reveal-scan", onRevealScan);
      if (io) io.disconnect();
      if (mo) mo.disconnect();
      if (fallbackTimer) clearTimeout(fallbackTimer);
    };
  }, deps);
  return ref;
}

/** Build a UPI deep-link. On mobile, window.location = link opens UPI apps. */
export function buildUpiLink({ pa, pn, am, tn, cu = "INR" }) {
  const params = new URLSearchParams();
  params.set("pa", pa);
  params.set("pn", pn);
  params.set("am", Number(am).toFixed(2));
  params.set("cu", cu);
  if (tn) params.set("tn", tn);
  return `upi://pay?${params.toString()}`;
}

/**
 * Builds direct deep-links for popular Indian UPI apps (GPay, PhonePe, Paytm, BHIM/Any UPI)
 * preserving all Razorpay/merchant UPI query parameters and guaranteeing the payable amount (`am`).
 */
export function buildUpiAppOptions({
  upiLink = "",
  upiId = "",
  brandName = "IndiFunded",
  amount = 0,
  note = "",
}) {
  let params = new URLSearchParams();
  const raw = String(upiLink || "").trim();
  if (raw.toLowerCase().startsWith("upi://")) {
    const qIdx = raw.indexOf("?");
    if (qIdx !== -1) {
      params = new URLSearchParams(raw.slice(qIdx + 1));
    }
  }
  if (!params.get("pa") && upiId) {
    params.set("pa", String(upiId).trim());
  }
  if (!params.get("pn") && brandName) {
    params.set("pn", String(brandName).trim());
  }
  const numericAmount = Number(amount);
  if (
    Number.isFinite(numericAmount) &&
    numericAmount > 0 &&
    (!params.get("am") || Number(params.get("am")) <= 0)
  ) {
    params.set("am", numericAmount.toFixed(2));
  }
  if (!params.get("cu")) {
    params.set("cu", "INR");
  }
  if (!params.get("tn") && note) {
    params.set("tn", String(note).trim());
  }

  const queryString = params.toString();
  const hasPayee = Boolean(params.get("pa"));
  const mk = (scheme) => (hasPayee ? `${scheme}?${queryString}` : "#");

  return {
    queryString,
    upiUrl: mk("upi://pay"),
    apps: [
      {
        id: "gpay",
        name: "Google Pay",
        badge: "GPay",
        color: "#4285F4",
        href: mk("tez://upi/pay"),
      },
      {
        id: "phonepe",
        name: "PhonePe",
        badge: "Pe",
        color: "#5f259f",
        href: mk("phonepe://pay"),
      },
      {
        id: "paytm",
        name: "Paytm",
        badge: "Paytm",
        color: "#00baf2",
        href: mk("paytmmp://pay"),
      },
      {
        id: "bhim",
        name: "BHIM / Any UPI",
        badge: "UPI",
        color: "#f59e0b",
        href: mk("upi://pay"),
      },
    ],
  };
}

export function isMobile() {
  if (typeof navigator === "undefined") return false;
  return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
}
