import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import React, { act } from "react";
import { renderToString } from "react-dom/server";
import { hydrateRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRouteWithContext,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { Toaster } from "sonner";

import { SettingsProvider, useSettings } from "@/context/SettingsContext";
import { ThemeProvider } from "@/context/ThemeContext";
import { AuthProvider } from "@/context/AuthContext";
import { useLiveCandles, useLiveMarketQuotes } from "@/lib/useLiveMarket";
import { api } from "@/lib/api";
import Layout from "@/components/Layout";
import Home from "@/views/Home";
import {
  MotionOrchestrator,
  PreloaderOverlay,
} from "@/components/MotionSystem";
import { FirestoreErrorBoundary } from "@/components/FirestoreErrorBoundary";

function HydrationProbe() {
  const { settings } = useSettings();
  const { quotes, marketStatus } = useLiveMarketQuotes(["NIFTY", "BANKNIFTY"], {
    pollMs: 0,
    enabled: false,
  });
  const { candles, loading } = useLiveCandles("NIFTY", "5m", {
    pollMs: 0,
    enabled: false,
  });
  return (
    <div data-testid="hydration-probe">
      <span>{settings.hero?.brand_name || "IndiFunded"}</span>
      <span>{quotes.length}</span>
      <span>{marketStatus}</span>
      <span>{candles.length}</span>
      <span>{loading ? "loading" : "ready"}</span>
    </div>
  );
}

function buildTestRouteTree() {
  const rootRoute = createRootRouteWithContext<{ queryClient: QueryClient }>()({
    component: () => {
      const { queryClient } = rootRoute.useRouteContext();
      return (
        <FirestoreErrorBoundary>
          <QueryClientProvider client={queryClient}>
            <ThemeProvider>
              <SettingsProvider>
                <AuthProvider>
                  <PreloaderOverlay />
                  <MotionOrchestrator />
                  <Toaster richColors theme="dark" position="top-right" />
                  <Outlet />
                </AuthProvider>
              </SettingsProvider>
            </ThemeProvider>
          </QueryClientProvider>
        </FirestoreErrorBoundary>
      );
    },
  });
  const siteRoute = createRoute({
    getParentRoute: () => rootRoute,
    id: "/_site",
    component: Layout,
  });
  const homeRoute = createRoute({
    getParentRoute: () => siteRoute,
    path: "/",
    component: Home,
  });
  const loginRoute = createRoute({
    getParentRoute: () => siteRoute,
    path: "/login",
    component: () => null,
  });
  const challengesRoute = createRoute({
    getParentRoute: () => siteRoute,
    path: "/challenges",
    component: () => null,
  });
  const catchRoute = createRoute({
    getParentRoute: () => siteRoute,
    path: "$",
    component: () => null,
  });
  return rootRoute.addChildren([
    siteRoute.addChildren([homeRoute, loginRoute, challengesRoute, catchRoute]),
  ]);
}

async function runRealRouterHydration(
  testTree: ReturnType<typeof buildTestRouteTree>,
) {
  const ssrRouter = createRouter({
    routeTree: testTree,
    context: { queryClient: new QueryClient() },
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  await ssrRouter.load();

  const origWindow = globalThis.window;
  // @ts-expect-error simulating server environment without window for renderToString
  delete globalThis.window;
  let ssrHtml = "";
  try {
    ssrHtml = renderToString(<RouterProvider router={ssrRouter} />);
  } finally {
    globalThis.window = origWindow;
  }

  return ssrHtml;
}

describe("SSR hydration safety", () => {
  beforeEach(() => {
    vi.spyOn(api, "get").mockResolvedValue({ data: {} } as never);
    window.sessionStorage.setItem(
      "if_site_settings_v1",
      JSON.stringify({ hero: { brand_name: "CustomCachedBrand" } }),
    );
    window.sessionStorage.setItem(
      "if_mkt_cache_v2",
      JSON.stringify({
        marketStatus: "LIVE",
        quotes: {
          NIFTY: {
            quote: {
              symbol: "NIFTY",
              ltp: 25600,
              changePct: 1.2,
              exchange: "NSE",
            },
            ts: Date.now(),
          },
        },
        candles: {
          "NIFTY:5m": {
            candles: [
              {
                time: 1731650000,
                open: 25500,
                high: 25620,
                low: 25490,
                close: 25600,
              },
            ],
            quote: { symbol: "NIFTY", ltp: 25600, changePct: 1.2 },
            marketStatus: "LIVE",
            ts: Date.now(),
          },
        },
      }),
    );
  });

  afterEach(() => {
    window.sessionStorage.clear();
    window.localStorage.clear();
    document.documentElement.className = "";
    vi.restoreAllMocks();
  });

  it("hydrates without mismatch even when sessionStorage contains cached settings and market data", async () => {
    const origWindow = globalThis.window;
    // @ts-expect-error simulating server environment without window for renderToString
    delete globalThis.window;
    let ssrHtml = "";
    try {
      ssrHtml = renderToString(
        <SettingsProvider>
          <HydrationProbe />
        </SettingsProvider>,
      );
    } finally {
      globalThis.window = origWindow;
    }

    const container = document.createElement("div");
    container.innerHTML = ssrHtml;
    document.body.appendChild(container);

    const recoverableErrors: unknown[] = [];
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    let root: ReturnType<typeof hydrateRoot> | null = null;
    await act(async () => {
      root = hydrateRoot(
        container,
        <SettingsProvider>
          <HydrationProbe />
        </SettingsProvider>,
        {
          onRecoverableError: (err) => {
            recoverableErrors.push(err);
          },
        },
      );
    });

    expect(recoverableErrors).toEqual([]);
    const hydrationErrors = errorSpy.mock.calls.filter((args) =>
      args.some((a) => /hydrat|didn't match/i.test(String(a))),
    );
    expect(hydrationErrors).toEqual([]);
    expect(container.textContent).toContain("CustomCachedBrand");

    await act(async () => {
      root?.unmount();
    });
    container.remove();
  });

  it("hydrates Home page (/ _site/) through real RouterProvider with zero mismatch under shifted clock and light theme", async () => {
    const serverTime = new Date("2026-11-20T09:15:00.000Z").getTime();
    const nowSpy = vi.spyOn(Date, "now").mockReturnValue(serverTime);

    const testTree = buildTestRouteTree();
    const ssrHtml = await runRealRouterHydration(testTree);

    nowSpy.mockReturnValue(serverTime + 12 * 60 * 1000);
    window.localStorage.setItem("if_dash_theme", "light");

    const clientRouter = createRouter({
      routeTree: testTree,
      context: { queryClient: new QueryClient() },
      history: createMemoryHistory({ initialEntries: ["/"] }),
    });
    await clientRouter.load();

    const container = document.createElement("div");
    container.innerHTML = ssrHtml;
    document.body.appendChild(container);

    const recoverableErrors: unknown[] = [];
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    let root: ReturnType<typeof hydrateRoot> | null = null;
    await act(async () => {
      root = hydrateRoot(container, <RouterProvider router={clientRouter} />, {
        onRecoverableError: (err) => {
          recoverableErrors.push(err);
        },
      });
    });

    const hydrationErrors = errorSpy.mock.calls.filter((args) =>
      args.some((a) => /hydrat|didn't match/i.test(String(a))),
    );
    expect(recoverableErrors).toEqual([]);
    expect(hydrationErrors).toEqual([]);

    // Post-hydration reveal sweep marks sections visible after hydration settles
    await act(async () => {
      await new Promise((r) => setTimeout(r, 80));
    });
    const revealNodes = container.querySelectorAll("[data-reveal]");
    expect(revealNodes.length).toBeGreaterThan(0);
    revealNodes.forEach((node) => {
      expect(node.classList.contains("is-visible")).toBe(true);
    });

    await act(async () => {
      root?.unmount();
    });
    container.remove();
  });

  it("hydrates Home page cleanly on mobile viewports with immediate IntersectionObserver callbacks", async () => {
    const origWidth = window.innerWidth;
    const origIO = globalThis.IntersectionObserver;
    Object.defineProperty(window, "innerWidth", {
      value: 390,
      configurable: true,
    });
    vi.spyOn(window, "matchMedia").mockImplementation((query: string) => ({
      matches: /max-width:\s*900px|pointer:\s*coarse/i.test(query),
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }));

    globalThis.IntersectionObserver = class ImmediateIO {
      cb: IntersectionObserverCallback;
      constructor(cb: IntersectionObserverCallback) {
        this.cb = cb;
      }
      observe(target: Element) {
        this.cb(
          [{ isIntersecting: true, target } as IntersectionObserverEntry],
          this as unknown as IntersectionObserver,
        );
      }
      unobserve() {}
      disconnect() {}
      takeRecords() {
        return [];
      }
      root = null;
      rootMargin = "";
      thresholds = [0];
    } as unknown as typeof IntersectionObserver;

    try {
      const testTree = buildTestRouteTree();
      const ssrHtml = await runRealRouterHydration(testTree);

      const clientRouter = createRouter({
        routeTree: testTree,
        context: { queryClient: new QueryClient() },
        history: createMemoryHistory({ initialEntries: ["/"] }),
      });
      await clientRouter.load();

      const container = document.createElement("div");
      container.innerHTML = ssrHtml;
      document.body.appendChild(container);

      const recoverableErrors: unknown[] = [];
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      let root: ReturnType<typeof hydrateRoot> | null = null;
      await act(async () => {
        root = hydrateRoot(
          container,
          <RouterProvider router={clientRouter} />,
          {
            onRecoverableError: (err) => recoverableErrors.push(err),
          },
        );
      });

      const hydrationErrors = errorSpy.mock.calls.filter((args) =>
        args.some((a) => /hydrat|didn't match/i.test(String(a))),
      );
      expect(recoverableErrors).toEqual([]);
      expect(hydrationErrors).toEqual([]);

      await act(async () => {
        root?.unmount();
      });
      container.remove();
    } finally {
      Object.defineProperty(window, "innerWidth", {
        value: origWidth,
        configurable: true,
      });
      globalThis.IntersectionObserver = origIO;
    }
  });

  it("does not force window.scrollTo(0, 0) during initial Home hydration when the user has already scrolled down", async () => {
    const { getRouter } = await import("@/router");
    const appRouter = getRouter();
    expect(typeof appRouter.options.scrollRestoration).toBe("function");

    const scrollSpy = vi.spyOn(window, "scrollTo").mockImplementation(() => {});
    Object.defineProperty(window, "scrollY", {
      value: 900,
      configurable: true,
    });

    try {
      const testTree = buildTestRouteTree();
      const ssrHtml = await runRealRouterHydration(testTree);

      const clientRouter = createRouter({
        routeTree: testTree,
        context: { queryClient: new QueryClient() },
        history: createMemoryHistory({ initialEntries: ["/"] }),
        scrollRestoration: appRouter.options.scrollRestoration,
      });
      await clientRouter.load();

      const container = document.createElement("div");
      container.innerHTML = ssrHtml;
      document.body.appendChild(container);

      let root: ReturnType<typeof hydrateRoot> | null = null;
      await act(async () => {
        root = hydrateRoot(container, <RouterProvider router={clientRouter} />);
      });

      await act(async () => {
        await new Promise((r) => setTimeout(r, 250));
      });

      expect(scrollSpy).not.toHaveBeenCalled();

      await act(async () => {
        root?.unmount();
      });
      container.remove();
    } finally {
      Object.defineProperty(window, "scrollY", {
        value: 0,
        configurable: true,
      });
      scrollSpy.mockRestore();
    }
  }, 15000);
});
