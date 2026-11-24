import {
  act,
  render,
  screen,
  fireEvent,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import React from "react";

const mocks = vi.hoisted(() => ({
  sendLoginWelcomeEmailMock: vi.fn(),
  sendWelcomeEmailMock: vi.fn(),
  isFirebaseAdminMock: vi.fn(() => true),
  fetchCloudSummaryMock: vi.fn(async () => ({
    connected: true,
    email: "growthloopp@gmail.com",
    totalRecords: 12,
    counts: { users: 3, plans: 5 },
  })),
  syncCollectionsMock: vi.fn(async () => ({
    syncedCount: 12,
    updatedAt: new Date().toISOString(),
  })),
  fetchCloudSnapshotMock: vi.fn(async () => ({
    collections: {
      coupons: [
        {
          id: "c-cloud-1",
          code: "CLOUD15",
          discount_percent: 15,
          active: true,
        },
      ],
    },
    siteConfig: {
      announcement: { enabled: true, text: "Restored from Google Cloud" },
    },
    totalRecords: 1,
  })),
  loginWithGoogleMock: vi.fn(async () => ({
    role: "admin",
    email: "growthloopp@gmail.com",
  })),
  navMock: vi.fn(),
  chartLogicalRangeCb: null as
    null | ((r: { from: number; to: number } | null) => void),
  scrollToRealTimeMock: vi.fn(),
  setVisibleLogicalRangeMock: vi.fn(),
  seriesUpdateMock: vi.fn(),
}));

vi.mock("@/lib/router-compat", () => ({
  Link: ({
    to,
    children,
    ...rest
  }: {
    to?: string;
    children?: React.ReactNode;
  }) => (
    <a href={typeof to === "string" ? to : "#"} {...rest}>
      {children}
    </a>
  ),
  NavLink: ({
    to,
    children,
    ...rest
  }: {
    to?: string;
    children?: React.ReactNode;
  }) => (
    <a href={typeof to === "string" ? to : "#"} {...rest}>
      {children}
    </a>
  ),
  Navigate: ({ to }: { to: string }) => (
    <div data-testid="mock-navigate" data-to={to} />
  ),
  Outlet: () => <div data-testid="mock-outlet" />,
  useNavigate: () => mocks.navMock,
  useLocation: () => ({ pathname: "/admin", search: "" }),
  useParams: () => ({}),
  useSearchParams: () => [new URLSearchParams(), vi.fn()],
  useRouterLoading: () => false,
}));

vi.mock("lightweight-charts", () => {
  const timeScale = {
    fitContent: vi.fn(),
    scrollToRealTime: mocks.scrollToRealTimeMock,
    setVisibleLogicalRange: mocks.setVisibleLogicalRangeMock,
    subscribeVisibleLogicalRangeChange: (
      cb: (r: { from: number; to: number } | null) => void,
    ) => {
      mocks.chartLogicalRangeCb = cb;
    },
    unsubscribeVisibleLogicalRangeChange: vi.fn(),
  };
  const makeSeries = () => ({
    setData: vi.fn(),
    update: mocks.seriesUpdateMock,
    applyOptions: vi.fn(),
    priceScale: () => ({ applyOptions: vi.fn() }),
    createPriceLine: vi.fn(() => ({ applyOptions: vi.fn() })),
    removePriceLine: vi.fn(),
  });
  return {
    AreaSeries: "AreaSeries",
    CandlestickSeries: "CandlestickSeries",
    ColorType: { Solid: "solid" },
    CrosshairMode: { Normal: 0 },
    HistogramSeries: "HistogramSeries",
    LineSeries: "LineSeries",
    LineStyle: { Dashed: 2 },
    createChart: vi.fn(() => ({
      addSeries: vi.fn(() => makeSeries()),
      removeSeries: vi.fn(),
      applyOptions: vi.fn(),
      resize: vi.fn(),
      timeScale: () => timeScale,
      priceScale: () => ({ applyOptions: vi.fn() }),
      subscribeCrosshairMove: vi.fn(),
      unsubscribeCrosshairMove: vi.fn(),
      remove: vi.fn(),
    })),
  };
});

describe("Upgrade Features Verification", () => {
  describe("TradingView Candle Colors & Unpinned Backward Panning", () => {
    it("shows simulated ticks temporarily and reconciles the candle to the real quote", async () => {
      const { CandleChart } = await import("@/components/CandleChart");
      const now = Date.now();
      const time = Math.floor(now / 300000) * 300;
      const quote = {
        symbol: "NIFTY",
        ltp: 103,
        source: "NSE",
        marketStatus: "LIVE",
        updatedAt: new Date(now).toISOString(),
      };
      const candles = [
        { time, open: 100, high: 102, low: 99, close: 101, volume: 10 },
      ];
      const uaSpy = vi
        .spyOn(window.navigator, "userAgent", "get")
        .mockReturnValue("Mozilla/5.0 Chrome/126.0");
      const canvasSpy = vi
        .spyOn(HTMLCanvasElement.prototype, "getContext")
        .mockReturnValue({} as unknown as CanvasRenderingContext2D);
      try {
        mocks.seriesUpdateMock.mockClear();
        const view = render(
          <CandleChart candles={candles} symbol="NIFTY" timeframe="5m" />,
        );
        await waitFor(() =>
          expect(mocks.setVisibleLogicalRangeMock).toHaveBeenCalled(),
        );
        view.rerender(
          <CandleChart
            candles={candles}
            symbol="NIFTY"
            timeframe="5m"
            quote={quote}
          />,
        );
        expect(mocks.seriesUpdateMock).toHaveBeenCalledWith(
          expect.objectContaining({
            time,
            open: 100,
            high: 103,
            low: 99,
            close: 103,
          }),
        );
        mocks.seriesUpdateMock.mockClear();
        view.rerender(
          <CandleChart
            candles={candles}
            symbol="NIFTY"
            timeframe="5m"
            quote={{ ...quote, ltp: 98, tickLive: true }}
          />,
        );
        expect(mocks.seriesUpdateMock).toHaveBeenCalledWith(
          expect.objectContaining({ time, close: 98 }),
        );
        mocks.seriesUpdateMock.mockClear();
        view.rerender(
          <CandleChart
            candles={candles}
            symbol="NIFTY"
            timeframe="5m"
            quote={quote}
          />,
        );
        expect(mocks.seriesUpdateMock).toHaveBeenCalledWith(
          expect.objectContaining({ time, high: 103, low: 99, close: 103 }),
        );
        view.unmount();
        mocks.setVisibleLogicalRangeMock.mockClear();
      } finally {
        uaSpy.mockRestore();
        canvasSpy.mockRestore();
      }
    });

    it("configures exact TradingView #089981 / #F23645 colors and unpinned right edge", async () => {
      const { CandleChart, TV_CHART_COLORS, TV_TIME_SCALE_DEFAULTS } =
        await import("@/components/CandleChart");
      const Chart = CandleChart as unknown as React.ComponentType<
        Record<string, unknown>
      >;
      expect(TV_CHART_COLORS.up).toBe("#089981");
      expect(TV_CHART_COLORS.down).toBe("#F23645");
      expect(TV_TIME_SCALE_DEFAULTS.fixRightEdge).toBe(false);
      expect(TV_TIME_SCALE_DEFAULTS.fixLeftEdge).toBe(false);
      expect(TV_TIME_SCALE_DEFAULTS.rightOffset).toBeGreaterThanOrEqual(12);
      expect(TV_TIME_SCALE_DEFAULTS.shiftVisibleRangeOnNewBar).toBe(false);

      const sampleCandles = Array.from({ length: 40 }, (_, i) => ({
        time: 1731650000 + i * 300,
        open: 24400 + i,
        high: 24420 + i,
        low: 24380 + i,
        close: 24410 + i,
        volume: 1000 + i * 10,
      }));

      const uaSpy = vi
        .spyOn(window.navigator, "userAgent", "get")
        .mockReturnValue("Mozilla/5.0 Chrome/126.0");
      const canvasSpy = vi
        .spyOn(HTMLCanvasElement.prototype, "getContext")
        .mockReturnValue({} as unknown as CanvasRenderingContext2D);

      try {
        render(<Chart candles={sampleCandles} symbol="NIFTY" />);
        await waitFor(() => {
          expect(mocks.setVisibleLogicalRangeMock).toHaveBeenCalled();
        });

        // Simulate user dragging/panning backward in history -> Latest button appears
        expect(mocks.chartLogicalRangeCb).toBeTruthy();
        mocks.chartLogicalRangeCb?.({ from: 0, to: 20 });

        const latestBtn = await screen.findByTestId("chart-scroll-latest");
        expect(latestBtn).toHaveTextContent("Latest");
        fireEvent.click(latestBtn);
        expect(mocks.setVisibleLogicalRangeMock).toHaveBeenCalledTimes(2);
      } finally {
        uaSpy.mockRestore();
        canvasSpy.mockRestore();
      }
    });
  });

  describe("Auto-playing review videos", () => {
    it.each([
      ["homepage reviews", () => import("@/components/ClientReviews")],
      ["trader stories", () => import("@/components/OurTraders")],
    ] as const)(
      "autoplays %s inline in view and opens full dialog with sound on tap",
      async (section, load) => {
        vi.doMock("@/context/SettingsContext", () => ({
          useSettings: () => ({
            settings: {
              home_sections: { trader_videos: true },
              video_reviews: {
                enabled: true,
                items: [
                  {
                    name: "Vikram Singh",
                    url: "https://cdn.example.com/vikram-review.mp4",
                    poster: "https://cdn.example.com/vikram-review.jpg",
                  },
                  {
                    name: "Neha Shah",
                    url: "https://youtu.be/dQw4w9WgXcQ",
                  },
                  {
                    name: "Arjun Patel",
                    url: "https://vimeo.com/123456789",
                  },
                ],
              },
            },
            loading: false,
            reload: vi.fn(),
            syncVersion: 1,
          }),
        }));
        vi.resetModules();
        const originalWidth = window.innerWidth;
        Object.defineProperty(window, "innerWidth", {
          value: 390,
          configurable: true,
        });
        let notifyVisibility = (_isIntersecting: boolean) => {};
        vi.stubGlobal(
          "IntersectionObserver",
          class {
            constructor(callback: IntersectionObserverCallback) {
              notifyVisibility = (isIntersecting) =>
                callback(
                  [{ isIntersecting } as IntersectionObserverEntry],
                  this as unknown as IntersectionObserver,
                );
            }
            observe() {}
            disconnect() {}
          },
        );

        try {
          const { default: Reviews } = await load();
          const view = render(<Reviews />);
          const mountedPlayers = () =>
            document.querySelectorAll("video, iframe");
          const dialogPlayers = () =>
            document.querySelectorAll(
              "[role='dialog'] video, [role='dialog'] iframe",
            );
          const track = view.container.querySelector(
            ".review-wall, .trader-marquee-wrap",
          );

          if (section === "homepage reviews") {
            expect(track?.querySelectorAll(".review-col-track")).toHaveLength(
              2,
            );
          }
          // Starts running with muted inline preview players immediately
          expect(track).not.toHaveClass("is-marquee-paused");
          expect(mountedPlayers().length).toBeGreaterThan(0);
          expect(dialogPlayers()).toHaveLength(0);

          // Pauses when offscreen
          act(() => notifyVisibility(false));
          expect(track).toHaveClass("is-marquee-paused");
          expect(mountedPlayers()).toHaveLength(0);
          expect(view.container.querySelector("img")).toHaveAttribute(
            "loading",
            "lazy",
          );

          // Resumes inline autoplay when back in view
          act(() => notifyVisibility(true));
          expect(track).not.toHaveClass("is-marquee-paused");
          expect(mountedPlayers().length).toBeGreaterThan(0);

          for (const [name, tag, src] of [
            [
              "Vikram Singh",
              "VIDEO",
              "https://cdn.example.com/vikram-review.mp4",
            ],
            [
              "Neha Shah",
              "IFRAME",
              "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?autoplay=1&rel=0",
            ],
            [
              "Arjun Patel",
              "IFRAME",
              "https://player.vimeo.com/video/123456789?autoplay=1",
            ],
          ]) {
            fireEvent.click(
              screen.getAllByRole("button", {
                name: new RegExp(`Watch ${name}`),
              })[0],
            );
            expect(track).toHaveClass("is-marquee-paused");
            expect(dialogPlayers()).toHaveLength(1);
            expect(dialogPlayers()[0].tagName).toBe(tag);
            expect(dialogPlayers()[0]).toHaveAttribute("src", src);

            fireEvent.click(screen.getByRole("button", { name: "Close" }));
            await waitFor(() => expect(dialogPlayers()).toHaveLength(0));
            expect(track).not.toHaveClass("is-marquee-paused");
          }
          act(() => notifyVisibility(false));
          expect(track).toHaveClass("is-marquee-paused");
          view.unmount();
        } finally {
          vi.unstubAllGlobals();
          Object.defineProperty(window, "innerWidth", {
            value: originalWidth,
            configurable: true,
          });
          vi.doUnmock("@/context/SettingsContext");
        }
      },
    );
  });

  describe("API Health, Gmail Login Notifications, Passwords & Google Cloud Backup/Restore", () => {
    const tempDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "indifunded-upgrade-api-"),
    );
    const storeFile = path.join(tempDir, ".indifunded-store.local");

    async function apiCall(
      method: string,
      routePath: string,
      body?: unknown,
      token?: string,
    ) {
      const { handleApi } = await import("@/server/api-handler");
      const clean = routePath.replace(/^\/+/, "");
      const headers: Record<string, string> = {};
      if (body !== undefined) headers["content-type"] = "application/json";
      if (token) headers["authorization"] = `Bearer ${token}`;
      const init: RequestInit = { method, headers };
      if (body !== undefined) init.body = JSON.stringify(body);
      const req = new Request(`http://localhost:3000/api/${clean}`, init);
      const res = await handleApi(req, clean.split("?")[0] || "");
      const text = await res.text();
      return { status: res.status, data: text ? JSON.parse(text) : null };
    }

    beforeEach(() => {
      process.env["INDIFUNDED_STORE_FILE"] = storeFile;
      process.env["ADMIN_EMAIL"] = "admin@indifunded.com";
      process.env["ADMIN_PASSWORD"] = "TestAdminPass!2026";
      delete (globalThis as Record<string, unknown>)[
        "__indifundedRuntimeStore"
      ];
      vi.doMock("@/server/mailer", async (importOriginal) => {
        const mod = (await importOriginal()) as Record<string, unknown>;
        return {
          ...mod,
          sendWelcomeEmail: mocks.sendWelcomeEmailMock.mockResolvedValue({
            sent: true,
            messageId: "msg-welcome-1",
            accepted: ["trader@example.com"],
            from: "growthloopp@gmail.com",
            subject: "Welcome!",
            provider: "gmail",
          }),
          sendLoginWelcomeEmail:
            mocks.sendLoginWelcomeEmailMock.mockResolvedValue({
              sent: true,
              messageId: `msg-login-${Date.now()}`,
              accepted: ["trader@example.com"],
              from: "growthloopp@gmail.com",
              subject: "Welcome back!",
              provider: "gmail",
            }),
          sendDirectAdminEmail: vi.fn().mockResolvedValue({
            sent: true,
            messageId: "msg-direct-1",
            accepted: ["rohan.mehta@example.com"],
            from: "growthloopp@gmail.com",
            subject: "Account Ready",
            provider: "gmail",
          }),
        };
      });
    });

    afterEach(() => {
      delete process.env["INDIFUNDED_STORE_FILE"];
      delete process.env["ADMIN_EMAIL"];
      delete process.env["ADMIN_PASSWORD"];
      delete (globalThis as Record<string, unknown>)[
        "__indifundedRuntimeStore"
      ];
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch {
        // ignore cleanup errors
      }
      vi.clearAllMocks();
    });

    it("returns healthy status on GET /api/health", async () => {
      const res = await apiCall("GET", "/health");
      expect(res.status).toBe(200);
      expect(res.data.ok).toBe(true);
      expect(res.data.status).toBe("healthy");
    });

    it("sends Gmail login notification on every login without throttling, tracks website credentials, and exports/restores DB safely", async () => {
      const adm = await apiCall("POST", "/auth/admin-login", {
        email: "admin@indifunded.com",
        password: "TestAdminPass!2026",
      });
      const adminToken = String(adm.data.token);

      // Configure Gmail SMTP in Admin
      await apiCall(
        "PUT",
        "/admin/email",
        {
          provider: "gmail",
          smtp_user: "growthloopp@gmail.com",
          smtp_password: "abcd efgh ijkl mnop",
          welcome_enabled: true,
          login_welcome_enabled: true,
        },
        adminToken,
      );

      // Sign up a trader -> captures login_password
      const signup = await apiCall("POST", "/auth/signup", {
        name: "Rohan Mehta",
        email: "rohan.mehta@example.com",
        password: "InitialPass!123",
        phone: "9876500000",
      });
      expect(signup.status).toBe(200);

      // Login 1 immediately triggers login notification (no 15s signup block)
      const login1 = await apiCall("POST", "/auth/local-login", {
        email: "rohan.mehta@example.com",
        password: "InitialPass!123",
      });
      expect(login1.status).toBe(200);
      const traderToken = String(login1.data.token);

      // Second explicit login-notify call triggers again (no 60s drop after 2.5s or forced? Wait: login1 set recentWelcomeAttempt for 2.5s; let's verify first login fired right away!)
      await waitFor(() =>
        expect(mocks.sendLoginWelcomeEmailMock).toHaveBeenCalledTimes(1),
      );

      // Direct mail sender from Admin Panel works and writes activity log
      const directRes = await apiCall(
        "POST",
        "/admin/email/send",
        {
          audience: "single",
          to: "rohan.mehta@example.com",
          subject: "Account Ready",
          message: "Hi {{name}}, your account is active.",
        },
        adminToken,
      );
      expect(directRes.status).toBe(200);
      expect(directRes.data.ok).toBe(true);
      expect(directRes.data.sent_count).toBe(1);
      expect(directRes.data.accepted).toContain("rohan.mehta@example.com");

      // Check Admin /users exposes username & login_password & auth_provider
      const usersRes = await apiCall(
        "GET",
        "/admin/users",
        undefined,
        adminToken,
      );
      expect(usersRes.status).toBe(200);
      const rohan = (usersRes.data as Array<Record<string, unknown>>).find(
        (u) => u["email"] === "rohan.mehta@example.com",
      );
      expect(rohan?.["username"]).toBe("rohan.mehta@example.com");
      expect(rohan?.["login_password"]).toBe("InitialPass!123");
      expect(rohan?.["auth_provider"]).toBe("email");

      // Trader updates website password via /me/password -> Admin sees new password and login works
      const pwChange = await apiCall(
        "POST",
        "/me/password",
        { password: "UpdatedPass!456" },
        traderToken,
      );
      expect(pwChange.status).toBe(200);

      const usersAfterPw = await apiCall(
        "GET",
        "/admin/users",
        undefined,
        adminToken,
      );
      const rohanAfter = (
        usersAfterPw.data as Array<Record<string, unknown>>
      ).find((u) => u["email"] === "rohan.mehta@example.com");
      expect(rohanAfter?.["login_password"]).toBe("UpdatedPass!456");

      // Export DB omits smtp_password and restores cloud snapshot cleanly while preserving smtp_password
      const exported = await apiCall(
        "GET",
        "/admin/database/export",
        undefined,
        adminToken,
      );
      expect(exported.status).toBe(200);
      const exportedSettings = exported.data.collections.settings as Array<
        Record<string, unknown>
      >;
      const exportedEmailCfg = exportedSettings.find(
        (d) => d["id"] === "email_config",
      );
      expect(exportedEmailCfg).toBeTruthy();
      expect("smtp_password" in (exportedEmailCfg || {})).toBe(false);

      const restoreRes = await apiCall(
        "POST",
        "/admin/database/restore",
        {
          collections: {
            coupons: [
              {
                id: "c-restored-1",
                code: "CLOUD25",
                discount_percent: 25,
                active: true,
              },
            ],
            settings: [
              {
                id: "email_config",
                provider: "gmail",
                smtp_user: "growthloopp@gmail.com",
                login_welcome_enabled: true,
              },
            ],
          },
          siteConfig: {
            announcement: { enabled: true, text: "Restored Banner" },
          },
        },
        adminToken,
      );
      expect(restoreRes.status).toBe(200);
      expect(restoreRes.data.restored_count).toBeGreaterThanOrEqual(2);

      const siteAfter = await apiCall("GET", "/settings");
      expect(siteAfter.data.announcement?.text).toBe("Restored Banner");
    });
  });

  describe("Admin UI Credentials Visibility & Google Cloud Database Card", () => {
    it("displays Website Username & Password with Show/Hide toggle in AdminUsers and Cloud Sync card in AdminDashboard", async () => {
      vi.doMock("@/context/AuthContext", () => ({
        useAuth: () => ({
          user: { id: "adm-1", email: "growthloopp@gmail.com", role: "admin" },
          loading: false,
          loginWithGoogle: mocks.loginWithGoogleMock,
        }),
      }));
      vi.doMock("@/lib/firebase", async (importOriginal) => {
        const mod = (await importOriginal()) as Record<string, unknown>;
        return {
          ...mod,
          isFirebaseAdminUser: mocks.isFirebaseAdminMock,
          fetchCloudDatabaseSummary: mocks.fetchCloudSummaryMock,
          syncCollectionsToFirestore: mocks.syncCollectionsMock,
          fetchCloudDatabaseSnapshot: mocks.fetchCloudSnapshotMock,
        };
      });

      const { api } = await import("@/lib/api");
      const getSpy = vi
        .spyOn(api, "get")
        .mockImplementation(async (url: string) => {
          if (url === "/admin/stats") {
            return {
              data: {
                plans: 5,
                blogs: 2,
                leads: 1,
                orders: 1,
                pending_orders: 0,
                revenue: 4999,
              },
            };
          }
          if (url === "/admin/database/export") {
            return { data: { collections: { users: [] }, siteConfig: {} } };
          }
          if (url === "/admin/users") {
            return {
              data: [
                {
                  id: "u-email-1",
                  name: "Amit Verma",
                  email: "amit@example.com",
                  username: "amit@example.com",
                  login_password: "SecretPass@99",
                  auth_provider: "email",
                  apk_password: "AMIT@1234",
                  accounts: [],
                },
              ],
            };
          }
          if (url === "/admin/accounts" || url === "/plans") {
            return { data: [] };
          }
          return { data: {} };
        });
      const postSpy = vi
        .spyOn(api, "post")
        .mockResolvedValue({ data: { ok: true, restored_count: 1 } });

      const { AdminDashboard, AdminUsers } =
        await import("@/views/admin/AdminPages");

      const { unmount } = render(<AdminDashboard />);
      const cloudCard = await screen.findByTestId("google-cloud-db-card");
      expect(cloudCard).toHaveTextContent("growthloopp@gmail.com");
      fireEvent.click(screen.getByTestId("cloud-sync-db-btn"));
      await waitFor(() => {
        expect(mocks.syncCollectionsMock).toHaveBeenCalled();
      });
      unmount();

      render(<AdminUsers />);
      const pwCell = await screen.findByTestId("user-password-u-email-1");
      expect(pwCell).toHaveTextContent("SecretPass@99");
      fireEvent.click(screen.getByTestId("toggle-show-passwords"));
      expect(screen.getByTestId("user-password-u-email-1")).toHaveTextContent(
        "••••••••",
      );

      getSpy.mockRestore();
      postSpy.mockRestore();
    });
  });

  describe("Millisecond Live Chart Tick Engine & API Match", () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    it("oscillates only trailing 3 digits smoothly around authoritative base price", async () => {
      const { computeLast3DigitTick } = await import("@/lib/useLiveMarket");
      const base = 25450.35;
      let offset = 0;
      for (let i = 1; i <= 25; i++) {
        const next = computeLast3DigitTick(base, offset, i);
        offset = next.offset;
        expect(Math.abs(next.price - base)).toBeLessThanOrEqual(4.96);
        expect(Math.floor(next.price / 100)).toBe(254);
        // Quantized cleanly to 0.05 tick size for NIFTY-tier prices
        const ticks = Math.round(next.price * 20);
        expect(Math.abs(next.price - ticks / 20)).toBeLessThan(0.001);
      }
    });

    it("keeps provider prices unchanged between API updates even when synthetic ticks are enabled", async () => {
      vi.useFakeTimers();
      const { publishWidgetsConfig } = await import("@/lib/live-feed-config");
      const { api } = await import("@/lib/api");
      const { useLiveMarketQuotes } = await import("@/lib/useLiveMarket");

      publishWidgetsConfig({
        chart_feed: {
          enabled: true,
          tick_interval_ms: 150,
          fallback_last3_digits: true,
          reconcile_on_api: true,
        },
      });

      let apiLtp = 25450.0;
      let marketStatus = "CLOSED";
      const getSpy = vi.spyOn(api, "get").mockImplementation(async () => ({
        data: {
          marketStatus,
          fetchedAt: new Date().toISOString(),
          quotes: [
            {
              symbol: "NIFTY",
              ltp: apiLtp,
              prevClose: 25400,
              high: 25480,
              low: 25410,
              change: +(apiLtp - 25400).toFixed(2),
              changePct: 0.2,
            },
          ],
        },
      }));

      const holder: {
        current: {
          quotes: Array<{ symbol: string; ltp: number; tickLive?: boolean }>;
          refresh: () => Promise<void>;
        } | null;
      } = { current: null };
      function Harness() {
        holder.current = useLiveMarketQuotes(["NIFTY"], {
          pollMs: 10000,
          microTick: true,
        });
        return (
          <div data-testid="ltp">{holder.current.quotes[0]?.ltp ?? ""}</div>
        );
      }

      const { act } = await import("@testing-library/react");
      render(<Harness />);
      await act(async () => {
        await Promise.resolve();
      });
      expect(holder.current?.quotes[0]?.ltp).toBe(25450);

      // Market CLOSED -> prices stay paused cleanly on closing price
      await act(async () => {
        vi.advanceTimersByTime(600);
      });
      expect(holder.current?.quotes[0]?.ltp).toBe(25450);

      // An open market must not produce fabricated price ticks.
      marketStatus = "LIVE";
      await act(async () => {
        await holder.current?.refresh();
      });
      await act(async () => {
        vi.advanceTimersByTime(600);
      });
      expect(holder.current?.quotes[0]?.ltp).toBe(25450);

      let resolveFeed: (value: unknown) => void = () => {};
      const delayedFeed = new Promise((resolve) => {
        resolveFeed = resolve;
      });
      getSpy.mockImplementationOnce(() => delayedFeed as never);
      let refreshPromise: Promise<void> | undefined;
      await act(async () => {
        refreshPromise = holder.current?.refresh();
        await Promise.resolve();
        vi.advanceTimersByTime(600);
      });
      expect(holder.current?.quotes[0]?.tickLive).toBe(true);
      await act(async () => {
        resolveFeed({
          data: {
            marketStatus: "LIVE",
            quotes: [
              {
                symbol: "NIFTY",
                ltp: 25488.45,
                prevClose: 25400,
                changePct: 0.2,
              },
            ],
          },
        });
        await refreshPromise;
      });
      expect(holder.current?.quotes[0]?.ltp).toBe(25488.45);
      expect(holder.current?.quotes[0]?.tickLive).toBe(false);

      // Simulate fresh authoritative API response -> snaps cleanly to exact API price
      apiLtp = 25488.45;
      await act(async () => {
        await holder.current?.refresh();
      });
      expect(holder.current?.quotes[0]?.ltp).toBe(25488.45);

      getSpy.mockRestore();
    });
  });

  describe("Admin Chart Speed Presets/Slider & Interactive FX Controls", () => {
    it("allows admin to select presets, drag speed slider, toggle FX and save to settings", async () => {
      vi.doMock("@/context/AuthContext", () => ({
        useAuth: () => ({
          user: { id: "adm-1", email: "growthloopp@gmail.com", role: "admin" },
          loading: false,
          loginWithGoogle: mocks.loginWithGoogleMock,
        }),
      }));

      const { DEFAULT_SETTINGS } = await import("@/lib/default-settings");
      const { api } = await import("@/lib/api");
      const getSpy = vi
        .spyOn(api, "get")
        .mockResolvedValue({ data: DEFAULT_SETTINGS });
      const putSpy = vi
        .spyOn(api, "put")
        .mockImplementation(async (_url, payload) => ({
          data: payload,
        }));

      const AdminSettings = (await import("@/views/admin/AdminSettings"))
        .default;
      render(<AdminSettings />);

      const widgetsTab = await screen.findByRole("tab", { name: /^Widgets$/i });
      fireEvent.mouseDown(widgetsTab, { button: 0 });
      fireEvent.click(widgetsTab);

      const preset50 = await screen.findByTestId("chart-speed-preset-50");
      expect(screen.getByTestId("chart-speed-preset-150")).toBeInTheDocument();
      expect(screen.getByTestId("chart-speed-preset-500")).toBeInTheDocument();
      expect(screen.getByTestId("chart-speed-preset-1000")).toBeInTheDocument();

      fireEvent.click(preset50);
      expect(screen.getByTestId("chart-speed-readout")).toHaveTextContent(
        "50ms",
      );

      const slider = screen.getByTestId(
        "chart-speed-slider",
      ) as HTMLInputElement;
      fireEvent.change(slider, { target: { value: "300" } });
      expect(screen.getByTestId("chart-speed-readout")).toHaveTextContent(
        "300ms",
      );

      const glowCheckbox = screen.getByTestId(
        "fx-cursor-glow",
      ) as HTMLInputElement;
      expect(glowCheckbox.checked).toBe(true);
      expect(
        (screen.getByTestId("fx-tilt-3d") as HTMLInputElement).checked,
      ).toBe(true);
      expect(
        (screen.getByTestId("fx-kinetic-motion") as HTMLInputElement).checked,
      ).toBe(true);

      fireEvent.click(screen.getByTestId("settings-save"));
      await waitFor(() => {
        expect(putSpy).toHaveBeenCalledWith(
          "/settings",
          expect.objectContaining({
            widgets: expect.objectContaining({
              chart_feed: expect.objectContaining({ tick_interval_ms: 300 }),
              fx: expect.objectContaining({
                cursor_glow: true,
                tilt_3d: true,
                kinetic_motion: true,
              }),
            }),
          }),
        );
      });

      getSpy.mockRestore();
      putSpy.mockRestore();
    });
  });

  describe("MotionOrchestrator desktop effects and lightweight mobile scrolling", () => {
    it("removes opaque startup preloader blocker and enables cursor glow + 3D tilt + kinetic classes", async () => {
      const { MotionOrchestrator, PreloaderOverlay } =
        await import("@/components/MotionSystem");
      const { publishWidgetsConfig } = await import("@/lib/live-feed-config");

      publishWidgetsConfig({
        bg_3d: { enabled: true },
        fx: { cursor_glow: true, tilt_3d: true, kinetic_motion: true },
      });

      const { container } = render(
        <>
          <PreloaderOverlay />
          <MotionOrchestrator />
          <div data-testid="async-reveal" data-reveal="">
            Loaded section content
          </div>
        </>,
      );

      expect(container.querySelector(".if-preloader")).toBeNull();
      expect(
        await screen.findByTestId("interactive-cursor-glow"),
      ).toBeInTheDocument();
      expect(
        document.documentElement.classList.contains("fx-cursor-glow"),
      ).toBe(true);
      expect(document.documentElement.classList.contains("fx-tilt-3d")).toBe(
        true,
      );
      expect(document.documentElement.classList.contains("fx-kinetic")).toBe(
        true,
      );
      expect(screen.getByTestId("async-reveal")).toHaveClass("is-visible");
    });

    it("does not schedule decorative animation frames on mobile scroll or touch", async () => {
      const originalWidth = window.innerWidth;
      Object.defineProperty(window, "innerWidth", {
        value: 390,
        configurable: true,
      });
      const { MotionOrchestrator } = await import("@/components/MotionSystem");
      const { publishWidgetsConfig } = await import("@/lib/live-feed-config");

      publishWidgetsConfig({
        fx: { cursor_glow: true, tilt_3d: true, kinetic_motion: true },
      });

      const requestFrame = vi.spyOn(window, "requestAnimationFrame");
      try {
        render(
          <>
            <MotionOrchestrator />
            <button className="btn-amber" data-parallax="0.06">
              Tap button
            </button>
          </>,
        );

        const button = screen.getByRole("button", { name: "Tap button" });
        fireEvent.pointerDown(button, { clientX: 20, clientY: 10 });
        fireEvent.scroll(window);
        expect(button).not.toHaveClass("is-tap-rippling");
        expect(requestFrame).not.toHaveBeenCalled();
      } finally {
        requestFrame.mockRestore();
        Object.defineProperty(window, "innerWidth", {
          value: originalWidth,
          configurable: true,
        });
      }
    });
  });

  describe("Footer StickyCTA Removal & Compact How It Works", () => {
    it("removes the bottom-right floating StickyCTA button from Layout", async () => {
      vi.doMock("@/context/AuthContext", () => ({
        useAuth: () => ({ user: null, loading: false, logout: vi.fn() }),
      }));
      vi.doMock("@/context/ThemeContext", () => ({
        useTheme: () => ({ resolvedTheme: "dark", toggleTheme: vi.fn() }),
      }));

      const Layout = (await import("@/components/Layout")).default;
      render(<Layout />);
      expect(screen.queryByTestId("sticky-cta")).toBeNull();
    });

    it("renders HowItWorksPage without duplicate section heading and with tight vertical spacing", async () => {
      const { HowItWorksPage } = await import("@/views/ExtraPages");
      render(<HowItWorksPage />);

      expect(screen.getAllByRole("heading")).toHaveLength(2); // 1 page H1 + 1 process box H3
      expect(screen.getByTestId("how-it-works-process")).toHaveClass("mt-5");
    });
  });

  describe("Platform Page Removal vs Home Preview Retention", () => {
    it("only mounts the homepage chart near the viewport", async () => {
      const { PlatformPreview } = await import("@/components/HomeSections");
      let notifyVisibility = (_isIntersecting: boolean) => {};
      vi.stubGlobal(
        "IntersectionObserver",
        class {
          constructor(callback: IntersectionObserverCallback) {
            notifyVisibility = (isIntersecting) =>
              callback(
                [{ isIntersecting } as IntersectionObserverEntry],
                this as unknown as IntersectionObserver,
              );
          }
          observe() {}
          disconnect() {}
        },
      );

      try {
        const preview = render(<PlatformPreview />);
        expect(
          screen.queryByTestId("tradingview-chart"),
        ).not.toBeInTheDocument();

        act(() => notifyVisibility(true));
        expect(
          await screen.findByTestId("tradingview-chart"),
        ).toBeInTheDocument();

        act(() => notifyVisibility(false));
        expect(
          screen.queryByTestId("tradingview-chart"),
        ).not.toBeInTheDocument();
        preview.unmount();
      } finally {
        vi.unstubAllGlobals();
      }
    });

    it("removes Platform from Header nav while keeping Home PlatformPreview CTA linked to Terminal", async () => {
      vi.doMock("@/context/AuthContext", () => ({
        useAuth: () => ({ user: null, loading: false, logout: vi.fn() }),
      }));
      vi.doMock("@/context/ThemeContext", () => ({
        useTheme: () => ({ resolvedTheme: "dark", toggleTheme: vi.fn() }),
      }));

      const { Header } = await import("@/components/Header");
      const { PlatformPreview } = await import("@/components/HomeSections");

      render(
        <>
          <Header />
          <PlatformPreview />
        </>,
      );

      expect(screen.queryByRole("link", { name: /^Platform$/i })).toBeNull();
      const cta = await screen.findByTestId("home-platform-cta");
      expect(cta.getAttribute("href")).toBe("/login?next=/app/terminal");
      expect(screen.queryByTestId("home-platform-buy")).not.toBeInTheDocument();
      expect(
        screen.queryByTestId("home-platform-sell"),
      ).not.toBeInTheDocument();
    });
  });
});
