import { useEffect } from "react";
import { useRouter } from "@tanstack/react-router";

function splitRouteTarget(to) {
  if (typeof to !== "string") {
    return { to: to?.pathname || "/", search: to?.search };
  }
  const [beforeHash] = to.split("#");
  const [path, qs] = beforeHash.split("?");
  const search = qs ? Object.fromEntries(new URLSearchParams(qs)) : undefined;
  return { to: path || "/", search };
}

/**
 * Warms split route chunks in the background once the browser is idle.
 * Safe when rendered outside <RouterProvider> (e.g. isolated unit tests).
 */
export function usePreloadRoutes(paths, enabled = true, delayMs = 250) {
  const router = useRouter({ warn: false });
  const key = Array.isArray(paths) ? paths.join("|") : "";

  useEffect(() => {
    if (
      !enabled ||
      typeof window === "undefined" ||
      !router ||
      typeof router.preloadRoute !== "function" ||
      !key
    ) {
      return;
    }

    const targets = key.split("|").filter(Boolean);
    let cancelled = false;
    let timerId = null;
    let idleId = null;

    const run = () => {
      if (cancelled) return;
      for (const rawPath of targets) {
        const t = splitRouteTarget(rawPath);
        Promise.resolve(
          router.preloadRoute({ to: t.to, search: t.search }),
        ).catch(() => {});
      }
    };

    if (typeof window.requestIdleCallback === "function") {
      idleId = window.requestIdleCallback(run, {
        timeout: Math.max(delayMs, 800),
      });
    } else {
      timerId = window.setTimeout(run, delayMs);
    }

    return () => {
      cancelled = true;
      if (idleId !== null && typeof window.cancelIdleCallback === "function") {
        window.cancelIdleCallback(idleId);
      }
      if (timerId !== null) {
        window.clearTimeout(timerId);
      }
    };
  }, [router, enabled, key, delayMs]);
}
